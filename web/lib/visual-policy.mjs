import {applicationControlKind} from './application-controls.mjs';
export const normalizedLabel=value=>String(value||'').replace(/\s+/g,' ').trim();
export const humanCheckText=text=>/\b(?:verify (?:that )?you are human|humans only|please complete (?:the )?captcha|complete (?:the )?security check|security verification required)\b/i.test(String(text));
export function visualClickKind(control){
 if(!control||control.disabled)return 'blocked';
 const text=normalizedLabel(control.text||control.label);
 if(control.applicationDialog&&/^(?:close|dismiss|cancel)$/i.test(text))return 'blocked';
 if(control.type==='password'||/sign.?in|log.?in|captcha|verify.*human|security check|agree|accept.*terms|purchase|pay|delete|withdraw|unsubscribe/i.test(text))return 'blocked';
 if(['checkbox','radio'].includes(control.type)||['checkbox','radio','option'].includes(control.role))return 'answer';
 if(control.tag==='SELECT'||control.role==='combobox')return 'focus';
 if(['INPUT','TEXTAREA'].includes(control.tag)||control.editable)return 'focus';
 const kind=applicationControlKind(control);
 if(kind==='submission'||control.type==='submit'&&control.inForm&&kind!=='step')return 'submission';
 if(kind==='entry'||kind==='step'||/^(back|previous|edit|change|add|remove|upload|attach|choose|select|show|close|dismiss)\b/i.test(text))return 'click';
 if(control.tag==='A')return /apply|application|career|resume/i.test(text)?'link':'blocked';
 // An unlabelled entry button can be understood visually, but it must not
 // be inside an application form, dialog or final submit control.
 if(control.tag==='BUTTON'&&!text&&!control.inForm&&control.type!=='submit')return 'click';
 return 'blocked';
}
export function needsResumeUpload({attached,control,uploadAvailable}){
 return !attached&&uploadAvailable&&/^(?:next|continue|review)(?:\b|$)/i.test(normalizedLabel(control.text||control.label));
}
export function choiceMatches({fact,value,label,question,facts}){
 const expected=normalizedLabel(facts?.[fact]).toLowerCase(),answer=normalizedLabel(label||value).toLowerCase(),raw=normalizedLabel(value).toLowerCase();
 if(!expected)return false;
 if(fact==='work_authorization')return /authoriz|eligible.*work|legal.*work/i.test(question)&&answer===expected;
 if(fact==='sponsorship')return /sponsor/i.test(question)&&answer===expected;
 if(fact==='routine_privacy_consent')return expected==='yes'&&/privacy|personal data|accurac|accurate/i.test(question)&&! /terms|conditions|arbitration|background|signature/i.test(question);
 if(fact==='country'){
  if(!/country/i.test(question))return false;
  if(/^(us|usa|united states)$/.test(expected))return /^(us|usa|united states)(?:\s*\(\+?1\))?$/.test(answer)||/^(us|usa|united states)$/.test(raw);
 }
 return ['email','state','availability'].includes(fact)&&new RegExp(fact==='availability'?'availab|start':fact,'i').test(question)&&(answer===expected||raw===expected);
}
