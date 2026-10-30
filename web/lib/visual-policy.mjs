import {applicationControlKind} from './application-controls.mjs';
export const normalizedLabel=value=>String(value||'').replace(/\s+/g,' ').trim();
export const humanCheckText=text=>/\b(?:verify (?:that )?you are human|humans only|please complete (?:the )?captcha|complete (?:the )?security check|security verification required)\b/i.test(String(text));
export const optionalTopChoice=control=>['checkbox','radio'].includes(control?.type)&&/\b(?:mark (?:this )?job as a )?top choice\b/i.test(normalizedLabel(control?.question||control?.label));
export function knownChoiceAnswer(question,facts){
 if(/(?:u\.?s\.?|united states)\s+(?:citizen|citizenship)|citizen(?:ship)?\s+(?:of\s+)?(?:the\s+)?(?:u\.?s\.?|united states)\b/i.test(question)&&! /clearance|criminal|signature|penalty|background/i.test(question))return ['yes','no'].includes(facts?.us_citizen)?{fact:'us_citizen',answer:facts.us_citizen}:null;
 const authorization=/authoriz|eligible.*work|legal.*work/i.test(question);
 if(authorization&&/without.*sponsor/i.test(question)){
  if(!['yes','no'].includes(facts?.work_authorization)||!['yes','no'].includes(facts?.sponsorship))return null;
  return {fact:'work_authorization',answer:facts.work_authorization==='yes'&&facts.sponsorship==='no'?'yes':'no'};
 }
 const fact=authorization?'work_authorization':/sponsor/i.test(question)?'sponsorship':null;
 return fact&&['yes','no'].includes(facts?.[fact])?{fact,answer:facts[fact]}:null;
}
export function experienceAnswer(question,facts){
 if(!/\byears?\b/i.test(question)||! /experience|worked|working/i.test(question))return null;
 const answers=[...String(facts?.verified_experience||'').matchAll(/User-confirmed application answer:\s*(\d+(?:\.\d+)?) years of hands-on work experience with ([^.\n]+)\./g)].filter(match=>match[2].split('/').some(skill=>{const escaped=skill.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('\\b'+escaped+'\\b','i').test(question);}));
 if(!answers.length||new Set(answers.map(a=>Number(a[1]))).size!==1)return null;
 const years=Number(answers[0][1]);return years>=0&&years<=60?{answer:String(years),evidence:answers[0][0]}:null;
}
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
 if(['work_authorization','sponsorship','us_citizen'].includes(fact)){const known=knownChoiceAnswer(question,facts);return known?.fact===fact&&answer===known.answer;}
 if(fact==='routine_privacy_consent')return expected==='yes'&&/privacy|personal data|accurac|accurate/i.test(question)&&! /terms|conditions|arbitration|background|signature/i.test(question);
 if(fact==='country'){
  if(!/country/i.test(question))return false;
  if(/^(us|usa|united states)$/.test(expected))return /^(us|usa|united states)(?:\s*\(\+?1\))?$/.test(answer)||/^(us|usa|united states)$/.test(raw);
 }
 return ['email','state','availability'].includes(fact)&&new RegExp(fact==='availability'?'availab|start':fact,'i').test(question)&&(answer===expected||raw===expected);
}
