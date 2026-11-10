import {visualTextFactAllowed,knownChoiceAnswer} from './visual-policy.mjs';
import {supportedApplication} from './application-recovery.mjs';
import {applicationControlKind} from './application-controls.mjs';
export function routineAction(form,facts){
 if(!supportedApplication(form.url))return null;
 const contact=[];
 for(const field of form.fields||[]){
  if(!field.visible||field.role==='combobox'||!['text','email','tel','url','textarea'].includes(field.type))continue;
  const fact=['first_name','last_name','email','phone','linkedin','github','website','city','state','zip','country','street','name'].find(key=>visualTextFactAllowed(field.label,key,facts));
  if(fact&&String(field.current_value||'').trim()!==String(facts[fact]).trim())contact.push({index:field.index,label:field.label,fact});
 }
 if(contact.length)return {type:'fill_known_fields',fields:contact.slice(0,8)};
 for(const field of form.fields||[]){
  if(!field.visible)continue;
  if(field.role==='combobox'&&/^country(?:\s*[:*]|$)/i.test(field.label)&&!field.filled&&facts.country)return {type:'choose',index:field.index,label:field.label,value:facts.country,fact:'country'};
  if(['text','textarea'].includes(field.type)&&field.role!=='combobox'){const known=knownChoiceAnswer(field.question||field.label,facts);if(known&&String(field.current_value||'').trim().toLowerCase()!==known.answer)return {type:'fill_answer',index:field.index,label:field.label,answer:known.answer,evidence:[JSON.stringify({[known.fact]:facts[known.fact],sponsorship:facts.sponsorship})]};}
 }
 const duration=(form.fields||[]).find(field=>field.visible&&!field.filled&&['text','number','textarea'].includes(field.type)&&/^(?:how many|number of|total)\s+years\b/i.test(field.label)&&/experience|worked|working/i.test(field.label));
 if(duration&&facts.verified_experience)return {type:'fill_answer',index:duration.index,label:duration.label,answer:'',evidence:[facts.verified_experience]};
 const entry=(form.controls||[]).filter(control=>!control.disabled&&applicationControlKind(control)==='entry');
 const formOpen=(form.fields||[]).some(field=>field.required||field.type==='file'&&(field.document_kind==='resume'||/resume|résumé|\bcv\b/i.test(field.label)));
 if(!formOpen&&entry.length===1)return {type:'next',label:entry[0].label||entry[0].text};
 for(const f of form.fields||[]){
  if(!f.visible)continue;const known=knownChoiceAnswer(f.question||f.label,facts);if(!known)continue;
  if(f.type==='select-one'){const option=f.options?.find(o=>o.label.trim().toLowerCase()===known.answer);if(option&&f.current_value!==option.value)return {type:'choose',index:f.index,label:f.label,value:option.value,fact:known.fact};}
  if(f.type==='radio'&&String(f.option_label||f.current_value).toLowerCase()===known.answer&&!f.filled)return {type:'choose',index:f.index,label:f.label,value:f.current_value,fact:known.fact};
 }
 const documentMenu=(form.controls||[]).some(c=>!c.disabled&&/^Resume options$/i.test(String(c.label||c.text||'').trim()));
 if(!form.approved_resume_attached&&form.resume_upload_allowed&&(documentMenu||(form.fields||[]).some(f=>f.type==='file'&&(f.document_kind==='resume'||/resum[eé]|cv/i.test(f.label)))))return {type:'upload_resume',x:0,y:0};
 if((form.fields||[]).some(f=>f.visible&&f.required&&!f.filled&&!/cover\s*letter/i.test(f.label)))return null;
 if(!form.approved_resume_attached){const resumeStep=(form.buttons||[]).filter(label=>/^continue to (?:resume|résumé)$/i.test(label.trim()));return resumeStep.length===1?{type:'next',label:resumeStep[0]}:null;}
 const next=(form.buttons||[]).filter(label=>/^(next|continue|review(?: application)?)$/i.test(label.trim()));
 return next.length===1?{type:'next',label:next[0]}:null;
}
