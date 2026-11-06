import {chromium} from 'playwright-core';
import {randomUUID,createHash} from 'node:crypto';
import {bb,browserSession} from './browser-session.mjs';
import {readJson,readBytes} from './store.ts';
import {mutate,patchAttempt,reserve,settle,activity,AutomationInputError} from './automation-state.mjs';
import {applicationReceipt,applicationFields,selectComboboxOption} from './application-controls.mjs';
import {choiceMatches} from './visual-policy.mjs';
import {uploadApprovedResume} from './resume-upload.mjs';
import {captureOutcome} from './capture-outcome.mjs';
import {loginTabs} from './login-tabs.mjs';

import {VERIFICATION_SECONDS,greenhouseUrl,verificationTarget,emailVerification,verificationEvidence,verificationAction} from './application-verification-policy.mjs';
export {VERIFICATION_SECONDS,greenhouseUrl,verificationTarget,emailVerification,verificationEvidence} from './application-verification-policy.mjs';
export async function holdVerification(id,session,{target,startedAt,usage,costId,notice,updateRun=true}={}){
 await patchAttempt(id,{status:'needs_input',reason:'Greenhouse requires the security code sent to your email. Complete it in the private verification browser.',required_action:verificationAction(),verification:{state:'active',session_id:session.id,target,expires_at:session.expiresAt||new Date(Date.now()+VERIFICATION_SECONDS*1000).toISOString(),started_at:startedAt||new Date().toISOString(),usage:usage||{input:0,output:0},cost_id:costId},evidence:{basis:'application_browser',observed_url:target,site_notice:notice||'Employer requested an email verification code; application remains unconfirmed.',evidence_gap:'Verification input and code are not recorded.'}},{updateRun});
}
async function attempt(id){const a=(await readJson('application-attempts.json',{})).value[id];if(!a)throw new AutomationInputError('Application attempt not found.');return a;}
async function release(a,state,deps={}){
 const v=a.verification;if(!v)return;
 await (deps.client||bb()).sessions.update(v.session_id,{status:'REQUEST_RELEASE'}).catch(()=>{});
 if(v.cost_id){const end=Math.min(Date.now(),Date.parse(v.expires_at));const usd=(v.usage?.input||0)*.75/1e6+(v.usage?.output||0)*4.5/1e6+.01+Math.max(0,end-Date.parse(v.started_at))/3600000*.12;await settle(v.cost_id,usd);}
 await mutate('application-attempts.json',old=>old[a.id]?.verification?.session_id===v.session_id?{...old,[a.id]:{...old[a.id],verification:{...old[a.id].verification,state,closed_at:new Date().toISOString()}}}:old);
}
export async function getVerificationView(id,deps={}){
 const a=await attempt(id);if(a.status==='submitted')return {state:'submitted',title:a.title,receipt:a.receipt};
 const v=a.verification;if(!v||v.state!=='active')return {state:v?.state||'closed',title:a.title,can_reopen:Boolean(a.submission_intent_at&&verificationEvidence(a))};
 const client=deps.client||bb();const session=await client.sessions.retrieve(v.session_id);
 if(Date.parse(v.expires_at)<=Date.now()||session.status!=='RUNNING'){await release(a,'expired',deps);return {state:'expired',title:a.title,can_reopen:true};}
 const tabs=loginTabs(await client.sessions.debug(v.session_id)).filter(t=>{try{return new URL(t.origin).origin===new URL(v.target).origin;}catch{return false;}});
 return {state:'active',session_id:v.session_id,title:a.title,tabs,expires_at:v.expires_at,prepared:Boolean(v.prepared),message:v.prepared?'The earlier browser closed. Your saved contact details and résumé are prepared. Review the form, request a fresh code using the employer’s Submit button, then enter that code and resubmit.':null};
}
export async function checkVerification(id,deps={}){
 let a=await attempt(id);if(a.status==='submitted')return {state:'submitted',title:a.title,receipt:a.receipt};
 const view=await getVerificationView(id,deps);if(view.state!=='active')return view;
 const client=deps.client||bb(),session=await client.sessions.retrieve(a.verification.session_id);
 const browser=await(deps.connect||((url)=>chromium.connectOverCDP(url)))(session.connectUrl);
 try{
  const pages=browser.contexts()[0].pages(),page=pages.find(p=>verificationTarget(p.url(),a.verification.target));
  if(!page)return {...view,message:'The browser is not on this application’s page. No submission has been confirmed.'};
  const text=await page.locator('body').innerText();const receipt=applicationReceipt(text,{url:page.url(),target:a.verification.target});
  if(!receipt)return {...view,message:emailVerification(text,page.url())?'The employer is still waiting for its email code. Enter it and resubmit in the private browser.':'No employer confirmation is visible yet. Complete the form in the private browser, then check again.'};
  const proof=await captureOutcome(page,id,{allowed:url=>verificationTarget(url,a.verification.target),site_notice:receipt});
  await patchAttempt(id,{status:'submitted',reason:null,required_action:null,receipt,confirmed_at:new Date().toISOString(),confirmation_url:page.url(),evidence:proof},{updateRun:false});
  await mutate('workflow.json',old=>{const prior=old[a.lead_id]||{stage:'new',notes:'',events:[]};if(prior.events?.some(e=>e.id===id&&e.kind==='submitted'))return old;return {...old,[a.lead_id]:{...prior,stage:'applied',updated_at:new Date().toISOString(),application:{...prior.application,submission_recorded_at:new Date().toISOString()},events:[...(prior.events||[]),{id,kind:'submitted',recorded_at:new Date().toISOString(),url:page.url(),evidence:'browser_confirmed'}]}};});
  await release(a,'completed',deps);await activity('verification_completed',{attempt_id:id,lead_id:a.lead_id,title:a.title,status:'submitted',message:'Employer confirmation verified after user completed email verification.'});
  return {state:'submitted',title:a.title,receipt};
 }finally{await browser.close().catch(()=>{});}
}
export async function closeVerification(id,deps={}){const a=await attempt(id);if(a.verification?.state==='active'){const checked=await checkVerification(id,deps);if(checked.state==='submitted')return checked;await release(a,'closed',deps);}return {state:'closed',title:a.title,can_reopen:Boolean(verificationEvidence(a))};}

export async function reopenVerification(id,deps={}){
 const a=await attempt(id);if(a.status==='submitted')return {viewer_url:'/application-verification?id='+id};
 if(!a.submission_intent_at||!verificationEvidence(a))throw new AutomationInputError('This application has no verified email-code request. An uncertain submission must be reconciled first.');
 if(a.verification?.state==='active'&&(await getVerificationView(id,deps)).state==='active')return {viewer_url:'/application-verification?id='+id};
 const costId='verification-'+randomUUID();await reserve(costId,.1);
 const create=deps.createSession||browserSession;const started=Date.now();let session,browser;
 try{
  session=await create(VERIFICATION_SECONDS,{isolated:true});browser=await(deps.connect||((url)=>chromium.connectOverCDP(url)))(session.connectUrl);
  const page=browser.contexts()[0].pages()[0]||await browser.contexts()[0].newPage();
  await page.goto(a.application_url,{waitUntil:'domcontentloaded',timeout:30000});
  if(!verificationTarget(page.url(),a.application_url))throw Error('Employer redirected away from the recorded application.');
  await page.getByRole('textbox',{name:/first name/i}).first().waitFor({timeout:15000});
  const facts=(await readJson('applicant-facts.json',{})).value;
  const candidates=[[/^first name\b/i,'first_name'],[/^last name\b/i,'last_name'],[/^email\b/i,'email'],[/^phone\b/i,'phone'],[/^country\b/i,'country'],[/^location.*city|^city\b/i,'city'],[/^linkedin/i,'linkedin'],[/^website/i,'website']];
  const fields=()=>page.locator('input:not([type=hidden]):not([type=password]),textarea,select');
  for(const [pattern,key] of candidates){
   const all=await fields().evaluateAll(applicationFields);const matches=all.filter(f=>f.visible&&pattern.test(f.label)&&f.type!=='file');if(matches.length!==1||!facts[key])continue;
   const field=matches[0],item=fields().nth(field.index);if(key==='country'){if(field.role==='combobox')await selectComboboxOption(page,item,facts.country,o=>choiceMatches({fact:'country',value:o.value,label:o.label,question:field.question,facts}));else if(field.type==='select-one')continue;else await item.fill(facts[key]);}else await item.fill(facts[key]);
  }
  const document=(await readBytes(a.resume_key))?.value;
  const hash=a.resume_document_hash||a.resume_variant?.hash||a.resume_hash;
  if(!document||createHash('sha256').update(document).digest('hex')!==hash)throw Error('The recorded résumé is missing or changed.');
  const uploaded=await uploadApprovedResume({page,scope:page.locator('body'),file:{name:a.selected_resume_filename||a.uploaded_resume_filename||'Resume_Matthew_Long.pdf',mimeType:'application/pdf',buffer:document}});
  if(!uploaded.attached)throw Error('The prepared form could not attach its recorded résumé.');
  await holdVerification(id,session,{target:page.url(),costId,startedAt:new Date(started).toISOString(),updateRun:false});
  await mutate('application-attempts.json',old=>({...old,[id]:{...old[id],verification:{...old[id].verification,prepared:true}}}));
  return {viewer_url:'/application-verification?id='+id};
 }catch(error){if(session)await(deps.client||bb()).sessions.update(session.id,{status:'REQUEST_RELEASE'}).catch(()=>{});await settle(costId,session ? .01+Math.max(0,Date.now()-started)/3600000*.12 : 0);throw error;}
 finally{if(browser)await browser.close().catch(()=>{});}
}

export async function expireVerifications(deps={}){
 const all=(await readJson('application-attempts.json',{})).value;let expired=0;
 for(const a of Object.values(all))if(a.verification?.state==='active'&&Date.parse(a.verification.expires_at)<=Date.now()){await release(a,'expired',deps);expired++;}
 return expired;
}
