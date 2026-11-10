import {setTimeout as delay} from 'node:timers/promises';

export const SESSION_SECONDS=1800;
export const AUTOMATIC_MS=600000;
export const SEGMENT_MS=150000;
export const HANDOFF_MS=900000;
export function unresolvedAction(policy,action){return policy?.human_handoff===false&&action?.owner==='user'?{owner:'automation',kind:action.kind==='answer'?'answer_unresolved':'automatic_verification_failed',title:'Application could not be completed automatically',instruction:'No applicant action is requested. Continue with other eligible jobs and retain this outcome in the report.',detail:action.detail}:action;}
export function supportedApplication(raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&['linkedin.com','dice.com','indeed.com','greenhouse.io'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}
}
export function watchChallenges(page,{now=Date.now}={}){
 let active=false,seen=false,event=null;
 const listener=msg=>{const text=msg.text();if(!/^browserbase-solving-(started|finished|errored)$/.test(text))return;seen=true;active=text.endsWith('-started');event=text.slice('browserbase-solving-'.length);};
 page.on('console',listener);
 return {get active(){return active;},get event(){return event;},get seen(){return seen;},dispose:()=>page.off('console',listener),async wait({ready,timeout=90000,pause=()=>delay(500)}){
  const until=now()+timeout;
  while(now()<until){if(!active&&await ready())return {state:'ready',event};await pause();}
  return {state:active?'solving':'blocked',event};
 }};
}
export async function securityBlocked(page){
 const text=await page.locator('body').innerText({timeout:5000}).catch(()=>'');
 if(/verify (?:that )?you are human|checking your browser|just a moment|complete (?:the )?(?:captcha|security check)|security verification|access denied|attention required.*cloudflare/i.test(text))return true;
 if(/additional verification required/i.test(text)&&/cloudflare|your ray id/i.test(text))return true;
 if(await page.locator('iframe[src*="hcaptcha.com"][title*="challenge"],iframe[src*="challenges.cloudflare.com"]').filter({visible:true}).count()>0)return true;
 const challenges=page.locator('iframe[src*="recaptcha"][src*="bframe"]').filter({visible:true});
 if(await challenges.count())return true;
 const anchors=page.locator('iframe[src*="recaptcha"][src*="anchor"]').filter({visible:true});
 for(const anchor of await anchors.all()){
  const passive=await anchor.evaluate(e=>{try{return new URL(e.src).searchParams.get('size')==='invisible'||Boolean(e.closest('.grecaptcha-badge'));}catch{return false;}});
  if(passive)continue;
  const frame=await anchor.contentFrame();
  if(!frame||await frame.locator('#recaptcha-anchor').getAttribute('aria-checked',{timeout:1000}).catch(()=>null)!=='true')return true;
 }
 return false;
}
