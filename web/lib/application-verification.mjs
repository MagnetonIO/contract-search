import {chromium} from 'playwright-core';
import {randomUUID,createHash} from 'node:crypto';
import {bb,browserSession} from './browser-session.mjs';
import {readJson,readBytes} from './store.ts';
import {mutate,patchAttempt,reserve,settle,activity,automationSettings,AutomationInputError} from './automation-state.mjs';
import {applicationReceipt,applicationFields,selectComboboxOption,CONFIRMATION_PATTERN} from './application-controls.mjs';
import {choiceMatches} from './visual-policy.mjs';
import {uploadApprovedResume} from './resume-upload.mjs';
import {captureOutcome} from './capture-outcome.mjs';
import {loginTabs} from './login-tabs.mjs';
import {HANDOFF_MS,supportedApplication,watchChallenges,securityBlocked,unresolvedAction} from './application-recovery.mjs';
import {fetchApplicationCode} from './gmail-verification.mjs';
import {notifyApplicationException} from './application-alerts.mjs';
import {reservationCost} from './gateway-usage.mjs';

import {VERIFICATION_SECONDS,greenhouseUrl,verificationTarget,emailVerification,verificationEvidence,verificationAction} from './application-verification-policy.mjs';
export {VERIFICATION_SECONDS,greenhouseUrl,verificationTarget,emailVerification,verificationEvidence} from './application-verification-policy.mjs';
export async function holdVerification(id,session,{target,startedAt,usage,costId,notice,updateRun=true,kind='email_verification',checkpoint=null,company='',recipient='',length=null}={}){
 const prior=await attempt(id);const now=Date.now(),expiry=Math.min(Date.parse(session.expiresAt||'')||now+HANDOFF_MS,now+HANDOFF_MS);
 const reason=kind==='email_verification'?'Employer requested an email verification code. Automatic retrieval will be attempted before notifying you.':notice||'Automatic recovery could not complete verification. Open the private browser to continue.';
 await patchAttempt(id,{status:kind==='submission_pending'?'submitting':'needs_input',reason,required_action:kind==='submission_pending'?{owner:'automation',kind:'submission_pending',title:'Waiting for employer confirmation',instruction:'Automatically checking the same submitted form. No new submission or applicant action is needed.'}:kind==='email_verification'?verificationAction():{owner:'user',kind:'security_verification',title:'Verification needs attention',instruction:'Open the private application browser, complete the indicated step, then select Resume after verification.',detail:reason},...(checkpoint?{checkpoint}:{}),verification:{state:'active',kind,session_id:session.id,context_id:session.context_id||checkpoint?.context_id||null,target,expires_at:new Date(expiry).toISOString(),started_at:new Date(now).toISOString(),requested_at:prior.submission_intent_at||new Date(now).toISOString(),session_started_at:startedAt||new Date(now).toISOString(),usage:usage||{input:0,output:0},cost_id:costId,company,recipient,length,automatic_until:new Date(now+120000).toISOString()},evidence:{basis:'application_browser',observed_url:target,site_notice:kind==='email_verification'?notice||'Employer requested email verification; application remains unconfirmed.':notice,evidence_gap:'Verification input and code are not recorded.'}},{updateRun});
}
export function verificationPage(raw,target){if(verificationTarget(raw,target))return true;try{const a=new URL(raw),b=new URL(target),path=b.pathname.replace(/\/$/,'');return supportedApplication(raw)&&a.origin===b.origin&&(a.pathname.replace(/\/$/,'')===path||greenhouseUrl(target)&&/\/jobs\/\d+$/.test(path)&&a.pathname.replace(/\/$/,'')===path+'/confirmation');}catch{return false;}}
async function attempt(id){const a=(await readJson('application-attempts.json',{})).value[id];if(!a)throw new AutomationInputError('Application attempt not found.');return a;}
async function release(a,state,deps={}){
 const v=a.verification;if(!v)return;
 await (deps.client||bb()).sessions.update(v.session_id,{status:'REQUEST_RELEASE'}).catch(()=>{});
 if(v.cost_id){const end=Math.min(Date.now(),Date.parse(v.expires_at));const cost=await reservationCost(v.cost_id,v.usage?.estimated_usd||0,.01+Math.max(0,end-Date.parse(v.session_started_at||v.started_at))/3600000*.12);await settle(v.cost_id,cost.usd,cost.details);}
 await mutate('application-attempts.json',old=>old[a.id]?.verification?.session_id===v.session_id?{...old,[a.id]:{...old[a.id],...(state!=='completed'&&old[a.id].status==='submitting'&&old[a.id].submission_intent_at?{status:'submission_unknown',reason:'The browser closed before a target-site receipt was recorded. Submission protection is preserved.',required_action:{owner:'automation',kind:'automatic_verification_failed',title:'Confirmation remains unverified',instruction:'Preserve this submission and continue with other jobs. No applicant action is requested.'}}:{}),verification:{...old[a.id].verification,state,closed_at:new Date().toISOString()}}}:old);
}
export async function getVerificationView(id,deps={}){
 const a=await attempt(id);if(a.status==='submitted')return {state:'submitted',title:a.title,receipt:a.receipt};
 const v=a.verification;if(!v||v.state!=='active')return {state:v?.state||'closed',title:a.title,can_reopen:Boolean(a.submission_intent_at&&verificationEvidence(a))};
 const client=deps.client||bb();const session=await client.sessions.retrieve(v.session_id);
 if(Date.parse(v.expires_at)<=Date.now()||session.status!=='RUNNING'){await release(a,'expired',deps);return {state:'expired',title:a.title,can_reopen:Boolean(a.submission_intent_at&&verificationEvidence(a))};}
 const tabs=loginTabs(await client.sessions.debug(v.session_id)).filter(t=>{try{return new URL(t.origin).origin===new URL(v.target).origin;}catch{return false;}});
 return {state:'active',session_id:v.session_id,title:a.title,tabs:v.kind==='provider_solving'?[]:tabs,expires_at:v.expires_at,kind:v.kind||'email_verification',can_resume:Boolean(a.checkpoint&&!a.submission_intent_at&&v.kind!=='provider_solving'),automatic_pending:v.kind==='provider_solving'||['submission_pending','email_verification'].includes(v.kind)&&Date.parse(v.automatic_until)>Date.now(),prepared:Boolean(v.prepared),message:v.prepared?'The earlier browser closed. Your saved contact details and résumé are prepared. Review the form, request a fresh code using the employer’s Submit button, then enter that code and resubmit.':a.reason};
}
export async function checkVerification(id,deps={}){
 let a=await attempt(id);if(a.status==='submitted')return {state:'submitted',title:a.title,receipt:a.receipt};
 const view=await getVerificationView(id,deps);if(view.state!=='active')return view;
 const client=deps.client||bb(),session=await client.sessions.retrieve(a.verification.session_id);
 const browser=await(deps.connect||((url)=>chromium.connectOverCDP(url)))(session.connectUrl);
 try{
  const pages=browser.contexts()[0].pages(),page=pages.find(p=>verificationPage(p.url(),a.verification.target));
  if(!page)return {...view,message:'The browser is not on this application’s page. No submission has been confirmed.'};
  const text=await page.locator('body').innerText();const receipt=applicationReceipt(text,{url:page.url(),target:a.verification.target});
  if(!receipt)return {...view,email_challenge:emailVerification(text,page.url()),message:emailVerification(text,page.url())?'The employer is still waiting for its email code. Enter it and resubmit in the private browser.':'No employer confirmation is visible yet. Complete the form in the private browser, then check again.'};
  const proof=await captureOutcome(page,id,{allowed:url=>verificationPage(url,a.verification.target),site_notice:receipt});
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
  const candidates=[[/^first name\b/i,'first_name'],[/^last name\b/i,'last_name'],[/^email\b/i,'email'],[/^phone\b/i,'phone'],[/^country\b/i,'country'],[/^location.*city|^city\b/i,'city'],[/^linkedin/i,'linkedin'],[/github/i,'github'],[/^website/i,'website']];
  const fields=()=>page.locator('input:not([type=hidden]):not([type=password]),textarea,select');
  for(const [pattern,key] of candidates){
   const all=await fields().evaluateAll(applicationFields);const matches=all.filter(f=>f.visible&&pattern.test(f.label)&&f.type!=='file');if(matches.length!==1||!facts[key])continue;
   const field=matches[0],item=fields().nth(field.index);if(key==='country'){if(field.role==='combobox')await selectComboboxOption(page,item,facts.country,o=>choiceMatches({fact:'country',value:o.value,label:o.label,question:field.question,facts}));else if(field.type==='select-one')continue;else await item.fill(facts[key]);}else await item.fill(facts[key]);
  }
  // Replay only answers already grounded by the current approved profile.
  // A reopened verification form is the same job, not a new application.
  if(facts.confirmed&&facts.version===a.profile_version){
   for(const answer of a.checkpoint?.answered||[]){
    const all=await fields().evaluateAll(applicationFields),matches=all.filter(f=>f.visible&&['text','email','tel','url','textarea','number'].includes(f.type)&&f.role!=='combobox'&&f.label.replace(/[*\s]+$/,'').toLowerCase()===String(answer.label).replace(/[*\s]+$/,'').toLowerCase());
    if(matches.length===1&&!/security code|password/i.test(answer.label))await fields().nth(matches[0].index).fill(String(answer.answer));
   }
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

export async function verificationCodeFields(page,length){
 const first=page.getByLabel(/^Security code$/i);if(await first.count()!==1)return null;
 const limit=Number(await first.getAttribute('maxlength')||0);
 if(limit!==1)return limit>0&&limit<length?null:[first];
 let group=first;
 for(let depth=0;depth<5;depth++){
  const slots=group.locator('input[maxlength="1"]').filter({visible:true});
  if(await slots.count()===length)return Array.from({length},(_,i)=>slots.nth(i));
  group=group.locator('..');
 }
 return null;
}

// Runs in a short workflow step. Codes never cross the step boundary.
export async function recoverVerification(id,{client=bb(),connect=url=>chromium.connectOverCDP(url),fetchCode=fetchApplicationCode,notify=notifyApplicationException}={}){
 let a=await attempt(id);if(a.verification?.state!=='active')return {waiting:false};
 const view=await getVerificationView(id,{client});if(view.state!=='active'){if(view.state==='expired'&&a.verification.kind==='provider_solving'&&(await automationSettings()).policy.human_handoff!==false)await notify({...a,reason:'The site security check did not complete before the browser expired.'}).catch(()=>{});return {waiting:false};}
 const existing=await checkVerification(id,{client,connect});if(existing.state==='submitted')return {waiting:false};
 const v=a.verification;
 const current=await automationSettings(),manualAuthorized=Date.parse(a.manual_expires_at)>Date.now()&&Date.parse(a.manual_authorized_at)>Date.parse(current.policy.paused_at||'1970-01-01');
 const canAutomaticallyContinue=(current.policy.enabled||manualAuthorized)&&current.facts?.confirmed&&current.facts.version===a.profile_version&&current.resume_hash===a.resume_hash&&current.quota.remaining>0;
 if(v.kind==='submission_pending'||v.kind==='provider_solving'&&a.submission_intent_at){
  if(existing.email_challenge){const challenge=existing.email_challenge;await patchAttempt(id,{status:'needs_input',reason:'Employer requested email verification; automatic Gmail retrieval is in progress.',verification:{...v,kind:'email_verification',recipient:challenge.email,length:challenge.length,automatic_until:new Date(Date.now()+120000).toISOString()}},{updateRun:false});return {waiting:true};}
  if(Date.parse(v.automatic_until)>Date.now())return {waiting:true};
  await patchAttempt(id,{status:'submission_unknown',reason:'No employer receipt was observed within the automatic confirmation window. No duplicate submission was made.',required_action:{owner:'automation',kind:'automatic_verification_failed',title:'Confirmation remains unverified',instruction:'Preserve this submission and continue with other jobs. No applicant action is requested.'}},{updateRun:false});await release(a,'closed',{client});return {waiting:false};
 }
 if(v.kind==='provider_solving'){
  const session=await client.sessions.retrieve(v.session_id),browser=await connect(session.connectUrl);let ready=false;
  try{const page=browser.contexts()[0].pages().find(p=>verificationPage(p.url(),v.target));if(page){const tracker=watchChallenges(page);try{ready=(await tracker.wait({ready:async()=>!await securityBlocked(page),timeout:8000})).state==='ready';}finally{tracker.dispose();}}}finally{await browser.close().catch(()=>{});}
  if(ready){
   const state=await automationSettings(),manual=Date.parse(a.manual_expires_at)>Date.now()&&Date.parse(a.manual_authorized_at)>Date.parse(state.policy.paused_at||'1970-01-01');
   if(state.policy.enabled||manual){await patchAttempt(id,{status:'queued',resume_session:true,reason:null,required_action:null,verification:{...v,state:'resuming',resumed_at:new Date().toISOString()}},{updateRun:false});return {waiting:false,resume:true};}
   await patchAttempt(id,{reason:'The security check finished. Scheduled automation is paused; resume this application explicitly to continue.',verification:{...v,kind:'security_verification'}},{updateRun:false});
  }else return {waiting:true};
 }
 if(canAutomaticallyContinue&&v.kind==='email_verification'&&Date.parse(v.automatic_until)>Date.now()&&v.company&&v.length&&!v.code_attempted_at){
  let code;try{code=await fetchCode({company:v.company,recipient:v.recipient,requested_at:v.requested_at||v.started_at,length:v.length,senders:['no-reply@us.greenhouse-mail.io'],consumed:v.consumed_message_ids||[]});}catch{await patchAttempt(id,{reason:'Automatic Gmail verification is unavailable. Complete the employer verification in the private browser.',verification:{...v,automatic_until:new Date().toISOString()}},{updateRun:false});}
  if(code){
   const session=await client.sessions.retrieve(v.session_id),browser=await connect(session.connectUrl);
   try{
    const page=browser.contexts()[0].pages().find(p=>verificationTarget(p.url(),v.target));
    if(page){const notice=emailVerification(await page.locator('body').innerText(),page.url());
     const inputs=await verificationCodeFields(page,v.length),button=page.getByRole('button',{name:/^submit(?: application)?$/i}).filter({visible:true});
     if(notice&&notice.email.toLowerCase()===v.recipient.toLowerCase()&&notice.length===v.length&&inputs&&await button.count()===1){
      // Greenhouse can disable Submit until the code has been entered.
      // Filling is reversible; reserve the one post only after validation.
      for(let i=0;i<inputs.length;i++)await inputs[i].fill(inputs.length===1?code.code:code.code[i]);
      for(let tick=0;tick<10&&!await button.isEnabled();tick++)await new Promise(resolve=>setTimeout(resolve,100));
      if(!await button.isEnabled()){for(const input of inputs)await input.fill('',{timeout:1000}).catch(()=>{});return {waiting:true};}
      // Reserve this one continuation BEFORE posting; a crash cannot replay it.
      let reserved=false;await mutate('application-attempts.json',old=>{reserved=false;const prior=old[id];if(prior.verification?.code_attempted_at)return old;reserved=true;return {...old,[id]:{...prior,verification:{...prior.verification,code_attempted_at:new Date().toISOString(),consumed_message_ids:[...(prior.verification.consumed_message_ids||[]),code.message_id]}}};});
      if(reserved){await button.click({timeout:10000});await page.getByText(CONFIRMATION_PATTERN).first().waitFor({timeout:10000}).catch(()=>{});}for(const input of inputs)if(await input.isVisible().catch(()=>false))await input.fill('',{timeout:1000}).catch(()=>{});
     }
    }
   }finally{code=null;await browser.close().catch(()=>{});}
   const checked=await checkVerification(id,{client,connect});if(checked.state==='submitted')return {waiting:false};
  }
 }
 a=await attempt(id);
 if(a.verification?.state!=='active')return {waiting:false};
 if(a.verification.kind!=='email_verification'||Date.parse(a.verification.automatic_until)<=Date.now()||a.verification.code_attempted_at){
  if(current.policy.human_handoff===false){const action=unresolvedAction(current.policy,{owner:'user',kind:a.verification.kind,detail:a.reason});await patchAttempt(id,{status:a.submission_intent_at?'submission_unknown':'failed',required_action:action,reason:a.submission_intent_at?'Automatic employer verification did not produce a receipt. Submission remains unconfirmed.':'Automatic verification could not complete this application. No applicant action is requested.'},{updateRun:false});await release(a,'closed',{client});return {waiting:false};}
  try{await notify(a);await patchAttempt(id,{notification_error:null},{updateRun:false});}catch{await patchAttempt(id,{notification_error:'Exception email could not be confirmed; retrying while the browser remains available.'},{updateRun:false});}
 }
 return {waiting:true};
}

export async function resumeVerification(id){
 const checked=await checkVerification(id);if(checked.state==='submitted')return {resume:false,state:'submitted'};
 const a=await attempt(id);const view=await getVerificationView(id);if(view.state!=='active'||!a.checkpoint||a.submission_intent_at)throw new AutomationInputError('Check confirmation instead; this application cannot safely resume automatically.');
 const now=new Date().toISOString();await patchAttempt(id,{status:'queued',reason:null,required_action:null,resume_session:true,manual_authorized_at:now,manual_expires_at:new Date(Date.now()+1800000).toISOString(),verification:{...a.verification,state:'resuming',resumed_at:now}} ,{updateRun:false});
 return {resume:true};
}
