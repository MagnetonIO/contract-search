import {chromium} from 'playwright-core';
import {setTimeout as delay} from 'node:timers/promises';
import {readJson} from './store.ts';
import {automationSettings,mutate,setEnabled,AutomationInputError} from './automation-state.mjs';
import {bb,browserSession} from './browser-session.mjs';
import {ACCOUNT_SITES,LOGIN_TIMEOUT_SECONDS,observedLogin,siteForUrl,loginExpiresAt,loginIsActive} from './browser-accounts.mjs';
import {loginTabs} from './login-tabs.mjs';
const terminal=status=>['COMPLETED','TIMED_OUT','ERROR'].includes(status);
const options=deps=>({client:deps?.client||bb(),connect:deps?.connect||(url=>chromium.connectOverCDP(url)),inspect:deps?.inspect||inspectLogin,pause:deps?.pause||delay});

export async function inspectLogin(browser,site){
 let status='unverified';
 for(const page of browser.contexts()[0].pages()){
  if(siteForUrl(page.url())!==site)continue;
  const target=ACCOUNT_SITES[site]?.verifyUrl;
  if(target&&!/\/(login|checkpoint|authwall)(\/|$)/i.test(new URL(page.url()).pathname))await page.goto(target,{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{});
  const nav=site==='linkedin'?page.locator('a[href*="/messaging/"]'):site==='dice'?page.getByRole('link',{name:/^Messages$/i}):null;
  if(nav&&!/\/(login|auth|checkpoint)(\/|$)/i.test(new URL(page.url()).pathname))await nav.first().waitFor({state:'visible',timeout:3000}).catch(()=>{});
  const current=observedLogin(site,{url:page.url(),accountNavVisible:nav?await nav.first().isVisible().catch(()=>false):false,passwordVisible:await page.locator('input[type=password]').first().isVisible().catch(()=>false),signOutVisible:await page.getByRole('link',{name:/^(sign out|log out|logout)$/i}).first().isVisible().catch(()=>false)||await page.getByRole('button',{name:/^(sign out|log out|logout)$/i}).first().isVisible().catch(()=>false)});
  if(current==='signed_in')return current;if(current==='needs_login')status=current;
 }
 return status;
}

export async function openLogin(site='linkedin'){
 if(!ACCOUNT_SITES[site])throw new AutomationInputError('Choose LinkedIn, Dice, Indeed or Glassdoor.');
 const state=await automationSettings();if(state.run?.active)throw new AutomationInputError('Pause automation and wait for the current run to finish before signing in.');
 const prior=(await readJson('browser-login.json',null)).value;
 if(prior?.id){const view=await getLoginView();if(['active','closing','unavailable'].includes(view.state))throw new AutomationInputError('Finish or close the open login browser first.');}
 if(state.policy.enabled)await setEnabled(false);
 const client=bb(),session=await browserSession(LOGIN_TIMEOUT_SECONDS);
 try{
  const browser=await chromium.connectOverCDP(session.connectUrl);
  try{const context=browser.contexts()[0];const page=context.pages()[0]||await context.newPage();await page.goto(ACCOUNT_SITES[site].url,{waitUntil:'domcontentloaded',timeout:30000});}finally{await browser.close();}
  const live=await client.sessions.debug(session.id);
  await mutate('browser-login.json',()=>({id:session.id,site,opened_at:new Date().toISOString(),expires_at:session.expiresAt||new Date(Date.now()+LOGIN_TIMEOUT_SECONDS*1000).toISOString(),timeout_seconds:LOGIN_TIMEOUT_SECONDS,live_url:live.debuggerFullscreenUrl,embed_url:live.debuggerUrl||live.debuggerFullscreenUrl}),null);
  return {viewer_url:'/browser-login?id='+session.id,site,expires_in:LOGIN_TIMEOUT_SECONDS};
 }catch(error){await client.sessions.update(session.id,{status:'REQUEST_RELEASE'}).catch(()=>{});throw error;}
}

async function finalized(login,reason,status){
 const result={session_id:login.id,state:reason==='saved'?'saved':reason==='expired'?'expired':'closed',site:login.site,status:status||'unverified',closed_at:new Date().toISOString()};
 await mutate('browser-login-last.json',()=>result,null);
 await mutate('browser-login.json',old=>old?.id===login.id?null:old,null);
 return result;
}

/** @param {{reason?:string,status?:string,expectedId?:string,client?:any,connect?:any,inspect?:any,pause?:any}} [config] */
export async function closeLogin(config={}){
 const {reason='closed',status='unverified',...deps}=config;
 const {client,pause}=options(deps);const {value:login}=await readJson('browser-login.json',null);
 if(deps.expectedId&&login?.id!==deps.expectedId)return {finished:true,state:'closed',status:'unverified'};
 if(!login?.id)return {finished:true,...(await readJson('browser-login-last.json',{state:'closed',status:'unverified'})).value};
 await mutate('browser-sites.json',old=>({...old,[login.site]:{status,checked_at:new Date().toISOString()}}));
 await mutate('browser-login.json',old=>old?.id===login.id?{...old,close_reason:reason,verified_status:status}:old,null);
 await client.sessions.update(login.id,{status:'REQUEST_RELEASE'});
 const deadline=Date.now()+10000;
 do{
  const session=await client.sessions.retrieve(login.id);
  if(terminal(session.status))return {finished:true,...await finalized(login,reason,status)};
  await pause(500);
 }while(Date.now()<deadline);
 return {finished:false,closing:true,status,message:'Saving the browser session. Wait for completion before opening another site.'};
}

export async function finishLogin(deps={}){
 const {client,connect,inspect}=options(deps);const {value:login}=await readJson('browser-login.json',null);
 if(deps.expectedId&&login?.id!==deps.expectedId)return {finished:true,state:'closed',status:'unverified'};
 if(!login?.id)return {finished:true,...(await readJson('browser-login-last.json',{state:'closed',status:'unverified'})).value};
 if(login.close_reason)return closeLogin({...deps,reason:login.close_reason,status:login.verified_status});
 let status='unverified';
 try{
  const session=await client.sessions.retrieve(login.id);
  if(session.status==='RUNNING'&&session.connectUrl){const browser=await connect(session.connectUrl);try{status=await inspect(browser,login.site);}finally{await browser.close();}}
  else if(terminal(session.status))return {finished:true,...await finalized(login,'expired','unverified')};
 }catch{status='unverified';}
 await mutate('browser-sites.json',old=>({...old,[login.site]:{status,checked_at:new Date().toISOString()}}));
 if(status!=='signed_in')return {finished:false,status,message:'Sign-in is not verified yet. The browser is still open; complete login and verify again, or close it while keeping the saved session.'};
 return closeLogin({...deps,reason:'saved',status});
}

export async function getLoginView(deps={}){
 const {value:login}=await readJson('browser-login.json',null);
 if(deps.expectedId&&login?.id!==deps.expectedId){const previous=(await readJson('browser-login-last.json',null)).value;return previous?.session_id===deps.expectedId?previous:{state:'closed'};}
 if(!login?.id)return (await readJson('browser-login-last.json',{state:'closed'})).value;
 try{
  const client=options(deps).client;const session=await client.sessions.retrieve(login.id);
  if(terminal(session.status))return finalized(login,login.close_reason||'expired',login.verified_status);
  if(!loginIsActive(login)){const result=await closeLogin({...deps,reason:'expired',status:login.verified_status});return result.finished?result:{state:'closing',site:login.site};}
  const tabs=login.close_reason?[]:loginTabs(await client.sessions.debug(login.id));
  return {state:login.close_reason?'closing':'active',site:login.site,name:ACCOUNT_SITES[login.site]?.name,tabs,expires_at:loginExpiresAt(login)};
 }catch{return {state:'unavailable',site:login.site,message:'The browser connection could not be checked. Try again shortly.'};}
}
