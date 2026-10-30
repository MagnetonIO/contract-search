export const OPTIONAL_COVER_LETTER_POLICY='Skip optional cover letters. Do not create or upload a cover letter. If the employer requires one, skip this application and record that requirement.';
export function coverLetterField(field){return /cover[\s_-]*letter/i.test([field.label,field.question,field.name].filter(Boolean).join(' '));}
export function blockerFor(reason,{technical=false,site=null}={}){
 const text=String(reason||'');
 if(technical||/visual control remained|unrecognized final|cannot (?:locate|find)|control.{0,35}(?:unavailable|unsupported|ambiguous|missing)|bounded time\/step limit|approved PDF|approved resum[eé]|resume[_-][^\s]*\.(?:pdf|docx?)\b|attach.{0,25}resum[eé]|worker could not finish|worker interrupted|form changed|application did not reach/i.test(text))return {owner:'automation',kind:'technical',title:'Automation needs repair',instruction:'No new applicant answer is needed. The worker must resolve this form or résumé control before retrying.',detail:text,site};
 if(/sign.?in|log.?in|authentication|MFA|human verification|CAPTCHA/i.test(text))return {owner:'user',kind:'sign_in',title:'Sign-in or verification needed',instruction:'Open Website sign-ins for this site, complete sign-in or verification, then save the session and resume this application.',detail:text,site};
 if(/submission.{0,30}(?:uncertain|unknown)|reconcile/i.test(text))return {owner:'user',kind:'reconcile',title:'Check whether the employer received it',instruction:'Check the employer’s application history or confirmation email before retrying. The worker will not submit this application again automatically.',detail:text,site};
 if(/cover[\s_-]*letter/i.test(text))return {owner:'automation',kind:'cover_letter',title:'Cover letter policy',instruction:OPTIONAL_COVER_LETTER_POLICY,detail:text,site};
 if(/assessment|agreement|background check|terms|signature|destination.*verification/i.test(text))return {owner:'user',kind:'review',title:'Employer step needs your review',instruction:'Open the application page and review the specific employer step below. Then resume this application if you choose to continue.',detail:text,site};
 return {owner:'user',kind:'answer',title:'Required answer needs confirmation',instruction:'Save the answer to the specific question below in Reusable applicant answers, then resume this application. Other jobs can continue.',detail:text,site};
}
export function attemptBlocker(attempt){
 if(!['needs_input','failed','submission_unknown'].includes(attempt.status))return null;
 if(attempt.status==='submission_unknown')return blockerFor('Submission result uncertain. '+(attempt.reason||''));
 if(attempt.required_action)return attempt.required_action;
 if(['needs_input','failed','submission_unknown'].includes(attempt.status)){
  if(attempt.status==='needs_input'&&!attempt.uploaded_resume_filename&&attempt.visual_steps?.filter(s=>s.action==='submit'&&s.status==='blocked').length>=2)return {...blockerFor('The worker reached Submit without recording selection or upload of the approved résumé.',{technical:true}),instruction:'No action is needed from you. The worker must select your approved existing résumé, then return to Submit. The previous worker did not retain the exact blocked-tool error.'};
  return blockerFor(attempt.reason,{technical:attempt.status==='failed'});
 }
 return null;
}
export function toolOutcomeDetail(outcome){
 const message=outcome?.reason||outcome?.retry||outcome?.action||outcome?.action_hint||outcome?.receipt||outcome?.error_message||null;
 return {message,action:outcome?.action||null,error_type:outcome?.error_type||null,requires_upload_resume:Boolean(outcome?.requires_upload_resume),not_submitted:Boolean(outcome?.not_submitted),incomplete_fields:outcome?.incomplete_fields||[]};
}
export function queuedAttemptId(state){
 if(!state.policy?.enabled||!state.facts?.confirmed||state.quota?.remaining===0)return null;
 return Object.values(state.attempts||{}).find(a=>a.status==='queued'&&!a.submission_intent_at)?.id||null;
}
