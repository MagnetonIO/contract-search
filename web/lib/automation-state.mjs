import {randomUUID} from 'node:crypto';
import {readJson,writeJson,ConflictError} from './store.ts';
import {DEFAULT_AUTOMATION_POLICY,applicationWindow,fingerprint,reserveBudget,applicationIdentity} from './automation-policy.mjs';
import {readSnapshot} from './snapshot.mjs';
import {automationAudit,nextApplicationCheck} from './automation-audit.mjs';

export class AutomationInputError extends Error {constructor(message){super(message);this.name='AutomationInputError';}}
export async function mutate(key,change,fallback={}) {
 for(let i=0;i<12;i++){const old=await readJson(key,fallback);const value=await change(structuredClone(old.value));try{await writeJson(key,value,old.version);return value;}catch(e){if(!(e instanceof ConflictError))throw e;}}
 throw Error('Automation state is busy. Try again.');
}
export async function activity(kind,detail={}) {
 const event={id:randomUUID(),at:new Date().toISOString(),kind,...detail};
 await mutate('automation-activity.json',old=>[...old,event].slice(-200),[]);
 if(detail.phase)await mutate('automation-run.json',old=>old?.active?{...old,phase:detail.phase,current_job:detail.title||null,last_activity_at:event.at}:old,null);
 return event;
}
export async function automationDashboard(){
 const state=await automationSettings();
 const [{value:snapshot},{value:workflow},{value:events},{value:live},{value:sites},{value:request},{value:login}]=await Promise.all([readSnapshot(),readJson('workflow.json',{}),readJson('automation-activity.json',[]),readJson('automation-browser.json',null),readJson('browser-sites.json',{}),readJson('automation-request.json',null),readJson('browser-login.json',null)]);
 const activeLive=live&&Date.parse(live.expires_at)>Date.now()&&['running','submitting'].includes(state.attempts[live.attempt_id]?.status)?live:null;
 const {screens,...visible}=state;
 return {...visible,next_check_at:state.policy.enabled?nextApplicationCheck():null,audit:automationAudit(snapshot?.leads||[],workflow,screens),activity:events,live_browser:activeLive,site_accounts:sites,last_request:request,login:login&&Date.now()-Date.parse(login.opened_at)<300000?{site:login.site,live_url:login.live_url}:null};
}
export async function automationSettings(){
 const [settings,facts,budget,screens,attempts,profile,run]=await Promise.all([
 readJson('automation-settings.json',DEFAULT_AUTOMATION_POLICY),readJson('applicant-facts.json',null),readJson('automation-budget.json',null),readJson('screenings.json',{}),readJson('application-attempts.json',{}),readJson('profile.json',{}),readJson('automation-run.json',null)]);
 const stale=Object.values(attempts.value).some(a=>['running','submitting'].includes(a.status)&&Date.now()-Date.parse(a.updated_at)>6*60000);
 if(stale)attempts.value=await mutate('application-attempts.json',old=>Object.fromEntries(Object.entries(old).map(([id,a])=>[id,['running','submitting'].includes(a.status)&&Date.now()-Date.parse(a.updated_at)>6*60000?{...a,status:a.submission_intent_at?'submission_unknown':'failed',reason:'Worker interrupted. Reconcile any submission before retrying.',updated_at:new Date().toISOString()}:a])));
 const ready=(await readJson('automation-readiness.json',null)).value;
 const source=(await readJson('resume-source.json',null)).value;
 return {integration_verified:Boolean(ready?.provider_integration_verified),resume_source_text:source?.text&&source.hash===profile.value.resume_hash?source.text:'',run:run.value,policy:settings.value,facts:facts.value,budget:budget.value,screens:screens.value,attempts:attempts.value,resume_hash:profile.value.resume_hash,connections:{browser:Boolean(process.env.BROWSERBASE_API_KEY&&process.env.BROWSERBASE_PROJECT_ID),ai:Boolean(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.VERCEL)}};
}
export async function saveFacts(input){
 const allowed=['name','email','phone','street','city','state','zip','country','work_authorization','sponsorship','availability','desired_hourly_rate','verified_experience','routine_privacy_consent','linkedin','website'];
 const facts={};for(const key of allowed)facts[key]=String(input[key]??'').trim().slice(0,key==='verified_experience'?24000:300);
 if(!facts.name||!/^\S+@\S+\.\S+$/.test(facts.email)||!facts.phone||!facts.zip)throw new AutomationInputError('Name, email, phone and ZIP are required.');
 if(!['yes','no'].includes(facts.work_authorization)||!['yes','no'].includes(facts.sponsorship))throw new AutomationInputError('Answer work authorization and sponsorship once.');
 if(input.confirmed!==true||!facts.verified_experience)throw new AutomationInputError('Confirm your verified experience and reusable answers.');
 if(!Number.isFinite(Number(facts.desired_hourly_rate))||Number(facts.desired_hourly_rate)<100)throw new AutomationInputError('Desired hourly rate must be at least $100.');
 facts.first_name=facts.name.split(/\s+/)[0];facts.last_name=facts.name.split(/\s+/).slice(1).join(' ');
 facts.confirmed=true;facts.version=fingerprint(facts);facts.updated_at=new Date().toISOString();
 await mutate('applicant-facts.json',()=>facts,null);return facts;
}
export async function setEnabled(enabled){
 if(enabled){const ready=(await readJson('automation-readiness.json',null)).value;if(!ready?.provider_integration_verified)throw new AutomationInputError('The initial browser integration check is still in progress.');const login=(await readJson('browser-login.json',null)).value;if(login&&Date.now()-Date.parse(login.opened_at)<300000)throw new AutomationInputError('Finish the login browser before enabling automation.');const state=await automationSettings();if(!state.facts?.confirmed||!state.resume_hash||!state.connections.browser)throw new AutomationInputError('Complete applicant facts, upload a PDF résumé and connect the browser first.');}
 return mutate('automation-settings.json',old=>({...DEFAULT_AUTOMATION_POLICY,...old,enabled:Boolean(enabled)}),DEFAULT_AUTOMATION_POLICY);
}
export async function reserve(id,usd,submit=false){return mutate('automation-budget.json',old=>reserveBudget(old,{id,usd,submit}),null);}
export async function settle(id,usd){
 await mutate('automation-budget.json',old=>{const item=old?.charges?.find(c=>c.id===id);if(item){item.usd=Math.max(0,usd);item.status='settled';}return old;},null);
}
export async function patchAttempt(id,patch){const result=await mutate('application-attempts.json',old=>({...old,[id]:{...old[id],...patch,updated_at:new Date().toISOString()}}));if(patch.status)await activity('application_status',{phase:'applying',attempt_id:id,lead_id:result[id].lead_id,title:result[id].title,status:patch.status,message:patch.reason||patch.receipt||patch.status.replaceAll('_',' ')});return result;}
export async function acquireCycle(){
 const state=await automationSettings();if(!state.policy.enabled||!state.facts?.confirmed||!applicationWindow())return null;
 const id=randomUUID();let acquired=false;
 await mutate('automation-run.json',old=>{acquired=false;if(old?.active&&Date.now()-Date.parse(old.started_at)<2*3600000)return old;acquired=true;return {id,active:true,started_at:new Date().toISOString()};},null);
 if(acquired)await activity('run_started',{phase:'screening',message:'Evaluating open opportunities.'});return acquired?id:null;
}
export async function failCycle(id){await mutate('automation-run.json',old=>old?.id===id?{...old,outcome:'failed'}:old,null);await activity('run_failed',{message:'Run interrupted by an error. Saved decisions and submission safeguards are preserved.'});}
export async function releaseCycle(id){const result=await mutate('automation-run.json',old=>old?.id===id?{...old,active:false,phase:old.outcome==='failed'?'failed':'finished',current_job:null,finished_at:new Date().toISOString()}:old,null);await activity('run_finished',{message:result?.outcome==='failed'?'Run ended after an error. Check the last activity before starting another run.':'Run finished. See job decisions and application results below.'});}
export async function claimAttempt(id){let claimed=false;await mutate('application-attempts.json',old=>{claimed=false;if(old[id]?.status!=='queued')return old;claimed=true;return {...old,[id]:{...old[id],status:'running',updated_at:new Date().toISOString()}};});return claimed;}
export async function submissionIntent(id,url){await mutate('application-attempts.json',old=>{const attempt=old[id];if(attempt?.status!=='running'||attempt.submission_intent_at)throw Error('Submission already reserved or application stopped');const resolved=applicationIdentity({application_url:url});if(Object.values(old).some(other=>other.id!==id&&other.submission_intent_at&&other.application_url&&applicationIdentity({application_url:other.application_url})===resolved))throw Error('Another record already attempted this resolved application; reconcile before retrying');return {...old,[id]:{...attempt,status:'submitting',submission_intent_at:new Date().toISOString(),application_url:url}};});}
export async function reviseAttempt(id,action){
 const state=await automationSettings();
 const costId=id+'-resume-'+randomUUID();if(action==='resume')await reserve(costId,2.5,true);
 await mutate('application-attempts.json',old=>{const prior=old[id];if(!prior||prior.submission_intent_at||!['needs_input','failed','queued','running'].includes(prior.status))throw Error('Application cannot be changed without reconciliation');if(action==='resume'&&!['needs_input','failed'].includes(prior.status))throw Error('Only paused applications can resume');return {...old,[id]:{...prior,status:action==='resume'?'queued':'cancelled',profile_version:state.facts?.version,resume_hash:state.resume_hash,cost_reservation_id:action==='resume'?costId:prior.cost_reservation_id,updated_at:new Date().toISOString()}};});
}
export async function resumeAfterSiteLogin(){
 const state=await automationSettings();const {value:sites}=await readJson('browser-sites.json',{});const {value:snapshot}=await readSnapshot();let count=0;
 for(const attempt of Object.values(state.attempts)){
  if(attempt.status!=='needs_input'||attempt.submission_intent_at||!/sign.?in|log.?in|authentication|MFA/i.test(attempt.reason||''))continue;
  const lead=snapshot?.leads.find(l=>l.id===attempt.lead_id);let host='';try{host=new URL(lead?.application_url||lead?.source_url).hostname;}catch{continue;}
  const site=host==='linkedin.com'||host.endsWith('.linkedin.com')?'linkedin':host==='dice.com'||host.endsWith('.dice.com')?'dice':null;
  const account=site&&sites[site];
  // A fresh save can safely retry an authentication-only pause once. It does
  // not establish verified sign-in and never retries a submission intent.
  if(!account||!(Date.parse(account.checked_at)>Date.parse(attempt.updated_at))||!['signed_in','unverified'].includes(account.status))continue;
  try{await reviseAttempt(attempt.id,'resume');count++;}catch(error){if(/allowance exhausted|Daily submission limit/.test(error.message))break;throw error;}
 }
 return count;
}
