import {applicationButtons} from './application-controls.mjs';
import {knownChoiceAnswer,normalizedLabel,needsResumeUpload} from './visual-policy.mjs';
export const NAVIGATION_REPAIR_VERSION=3;
export function resumeUploadClickOutcome(attached){
 return attached?{blocked:true,reason:'The approved résumé is already selected. This is Upload resume, not the Next button.',action:'Use the native next action with the observed Next, Continue or Review label. It will scroll the navigation button into view. Do not upload again.'}:{requires_upload_resume:true,action:'Use upload_resume for the approved PDF, or select the approved saved résumé.'};
}
export function recoverableNavigationBlock(attempt){
 if(attempt.submission_intent_at||attempt.navigation_recovery_version>=NAVIGATION_REPAIR_VERSION||!['failed','needs_input'].includes(attempt.status))return false;
 const reason=attempt.reason||'';
 if(/Use submit for this final action/.test(reason)&&(attempt.visual_steps||[]).some(s=>s.action==='click'&&/cookie/i.test(s.summary||'')))return true;
 if(/control.{0,70}unsupported/i.test(reason)&&/Target: (?:Apply for This Job|I'm interested)(?:$| Next step)/i.test(reason))return true;
 if(/saved answer for question: Phone\. Option: United States\./.test(reason))return true;
 if(!attempt.selected_resume_filename)return false;
 if(/Application navigation control is missing, disabled or ambiguous/i.test(attempt.reason||'')&&(attempt.visual_steps||[]).some(s=>s.action==='next'&&['blocked','needs_input'].includes(s.status)))return true;
 return /control.{0,70}(?:unsupported|unavailable)|Use upload_resume/i.test(attempt.reason||'')&&(attempt.visual_steps||[]).filter(s=>s.action==='click'&&s.status==='blocked').length>=2;
}

export async function navigationPreflight({scope,facts,attached,pending,label,inspect}){
 if(!/^(?:next|continue|review)(?:\b|$)/i.test(label))return null;
 const form=await inspect();
 for(const field of form.fields||[]){
  if(!field.visible||!(field.type==='select-one'||field.type==='radio'&&field.filled))continue;
  const known=knownChoiceAnswer(field.question,facts),selected=normalizedLabel(field.selected_label||field.label).toLowerCase();
  if(known&&['yes','no'].includes(selected)&&selected!==known.answer)return {blocked:true,action:'Correct the prefilled answer before advancing.',field:{index:field.index,label:field.label,question:field.question,selected,required_answer:known.answer,fact:known.fact},form};
 }
 const resumeFields=(form.fields||[]).some(f=>! /cover[\s_-]*letter|photo|avatar/i.test(f.label+' '+f.question)&&(f.type==='file'||f.type==='radio'&&/resume|résumé|\.pdf\b/i.test(f.label+' '+f.question)));
 const uploadAvailable=resumeFields||(await applicationButtons(scope)).some(b=>/upload|replace|choose|select/i.test(b.label+' '+b.text)&&/resume|résumé|\bcv\b/i.test(b.label+' '+b.text))||await scope.locator('input[type=file]').evaluateAll(items=>items.some(e=>/resume|résumé|\bcv\b/i.test([e.name,e.id,e.getAttribute('aria-label'),e.labels?.[0]?.innerText].join(' '))));
 if(!(form.approved_resume_selection_pending??pending)&&needsResumeUpload({attached:form.approved_resume_attached??attached,control:{label},uploadAvailable}))return {requires_upload_resume:true,action:'Select or upload the approved file '+(form.approved_resume_filename||'for this application')+' before continuing. A different preselected résumé is not approved; use upload_resume if the approved file is not saved on this site.'};
 return null;
}
