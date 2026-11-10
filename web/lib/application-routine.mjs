import {visualTextFactAllowed,knownChoiceAnswer} from './visual-policy.mjs';
import {supportedApplication} from './application-recovery.mjs';
import {applicationControlKind} from './application-controls.mjs';
export function routineAction(form,facts){
 if(!supportedApplication(form.url))return null;
 const contact=[];
 for(const field of form.fields||[]){
  if(!field.visible||field.role==='combobox'||!['text','email','tel','url','textarea'].includes(field.type))continue;
  const fact=['first_name','last_name','email','phone','linkedin','website','city','state','zip','country','street','name'].find(key=>visualTextFactAllowed(field.label,key,facts));
  if(fact&&String(field.current_value||'').trim()!==String(facts[fact]).trim())contact.push({index:field.index,label:field.label,fact});
 }
 if(contact.length)return {type:'fill_known_fields',fields:contact.slice(0,8)};
 const entry=(form.controls||[]).filter(control=>!control.disabled&&applicationControlKind(control)==='entry');
 const formOpen=(form.fields||[]).some(field=>field.required||field.type==='file'&&/resume|résumé|\bcv\b/i.test(field.label));
 if(!formOpen&&entry.length===1)return {type:'next',label:entry[0].label||entry[0].text};
 for(const f of form.fields||[]){
  if(!f.visible)continue;const known=knownChoiceAnswer(f.question||f.label,facts);if(!known)continue;
  if(f.type==='select-one'){const option=f.options?.find(o=>o.label.trim().toLowerCase()===known.answer);if(option&&f.current_value!==option.value)return {type:'choose',index:f.index,label:f.label,value:option.value,fact:known.fact};}
  if(f.type==='radio'&&String(f.option_label||f.current_value).toLowerCase()===known.answer&&!f.filled)return {type:'choose',index:f.index,label:f.label,value:f.current_value,fact:known.fact};
 }
 if(!form.approved_resume_attached&&form.resume_upload_allowed&&(form.fields||[]).some(f=>f.type==='file'&&/resum[eé]|cv/i.test(f.label)))return {type:'upload_resume',x:0,y:0};
 if((form.fields||[]).some(f=>f.visible&&f.required&&!f.filled&&!/cover\s*letter/i.test(f.label)))return null;
 if(!form.approved_resume_attached){const resumeStep=(form.buttons||[]).filter(label=>/^continue to (?:resume|résumé)$/i.test(label.trim()));return resumeStep.length===1?{type:'next',label:resumeStep[0]}:null;}
 const next=(form.buttons||[]).filter(label=>/^(next|continue|review(?: application)?)$/i.test(label.trim()));
 return next.length===1?{type:'next',label:next[0]}:null;
}
