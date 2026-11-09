import {applicationControlKind,applicationAuxiliaryUrl} from './application-controls.mjs';
const stateNames=Object.fromEntries('AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|PR:Puerto Rico|GU:Guam|VI:U.S. Virgin Islands|AS:American Samoa|MP:Northern Mariana Islands'.split('|').map(pair=>pair.split(':')));
export const normalizedLabel=value=>String(value||'').replace(/\s+/g,' ').trim();
export function visualTextFactAllowed(question,fact,facts){
 if(!facts?.[fact]||/password|sponsor|authoriz|citizen|clearance|years?|experience|certif|signature|agree|birth|social.security/i.test(question))return false;
 const labels={name:/^(?:full |your )?name\b/i,first_name:/first name/i,last_name:/last name|surname/i,email:/email/i,phone:/phone|mobile/i,city:/city|location/i,state:/state|province/i,country:/country/i,zip:/zip|postal/i,street:/street|address/i,linkedin:/linkedin/i,website:/website|portfolio/i};
 return Boolean(labels[fact]?.test(question));
}
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
// Only direct technical-experience questions can use documented resume skills.
// Credentials, legal declarations and numeric durations have separate checks.
export function technicalExperienceAnswer(question,facts){
 if(/years?|certif|licen[cs]e|clearance|citizen|sponsor|authoriz|degree|willing|agree|criminal|veteran|gender|disabil|medical/i.test(question))return null;
 const match=String(question).match(/^(?:do you have|have you had)\s+(?:(?:hands[- ]on|professional|work|working|practical|production)\s+)*experience(?:\s+(?:developing|building|deploying|implementing|maintaining|designing|testing|supporting|programming|coding)(?:\s+(?:applications?|software|systems?|services?|solutions?|code))?)?\s+(?:with|in|using)\s+(.+?)[?*.\s]*$/i);
 if(!match)return null;
 const normalize=value=>String(value||'').toLowerCase().replace(/microsoft azure/g,'azure').replace(/amazon web services/g,'aws').replace(/google cloud(?: platform)?/g,'gcp').replace(/[^a-z0-9+#]+/g,' ').replace(/\s+/g,' ').trim();
 const topic=normalize(match[1]);if(topic.length<3||topic.length>100||/\b(?:and|or)\b/.test(topic))return null;
 const duration=experienceAnswer('How many years of experience with '+topic+'?',facts);
 if(duration)return {answer:Number(duration.answer)>0?'yes':'no',evidence:duration.evidence};
 const escaped=topic.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),source=normalize(facts?.verified_experience);
 if(new RegExp('\\b0 years of hands on work experience with '+escaped+'(?=$|[^a-z0-9+#])').test(source))return {answer:'no',evidence:'Explicit zero experience in saved facts'};
 if(new RegExp('\\b(?:no|without) (?:hands on )?experience (?:with|in|using) '+escaped+'\\b').test(source))return {answer:'no',evidence:'Explicit experience denial in saved facts'};
 return new RegExp('(^|[^a-z0-9+#])'+escaped+'(?=$|[^a-z0-9+#])').test(source)?{answer:'yes',evidence:'Documented skill: '+topic}:null;
}
export function visualClickKind(control){
 if(!control||control.disabled)return 'blocked';
 const text=normalizedLabel(control.text||control.label);
 if(control.cookieConsent)return /^(?:decline|reject)(?: all| optional cookies)?$|^(?:use|allow|accept) (?:only )?(?:necessary|essential) cookies$|^cookies? settings$/i.test(text)?'click':'blocked';
 if(applicationAuxiliaryUrl(control.href)||/tailor (?:my |your )?resum[eé]|create (?:a )?cover letter|help me stand out|upgrade|\bpremium\b/i.test(text))return 'blocked';
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
 if(fact==='verified_experience'){
  const technical=technicalExperienceAnswer(question,facts);if(technical)return answer===technical.answer;
  const confirmed=experienceAnswer(question,facts),option=answer.match(/^(\d+(?:\.\d+)?)\s*(\+)?\s*(?:years?)?$/),range=answer.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:years?)?$/);
  if(!confirmed)return false;
  const years=Number(confirmed.answer);
  if(range)return Number(range[1])<=years&&years<=Number(range[2]);
  return Boolean(option&&(option[2]?years>=Number(option[1]):years===Number(option[1])));
 }
 if(['work_authorization','sponsorship','us_citizen'].includes(fact)){
  // Some employer forms ask authorization through visa-category options.
  // Only an explicitly saved citizenship fact can select that exact category.
  if(fact==='us_citizen'&&expected==='yes'&&/authoriz|eligible.*work|legal.*work/i.test(question)&&! /clearance|criminal|signature|penalty|background|sponsor/i.test(question)&&/^(?:u\.?s\.?|united states)\s+citizen$/.test(answer))return true;
  const known=knownChoiceAnswer(question,facts);return known?.fact===fact&&answer===known.answer;
 }
 if(fact==='routine_privacy_consent')return expected==='yes'&&/privacy|personal data|accurac|accurate/i.test(question)&&! /terms|conditions|arbitration|background|signature/i.test(question);
 if(fact==='country'){
  if(!/country/i.test(question))return false;
  if(/^(us|usa|united states)$/.test(expected))return /^(us|usa|united states)(?:\s*(?:\(\+?1\)|\+1))?$/.test(answer)||/^(us|usa|united states)$/.test(raw);
 }
 if(fact==='state'){const state=value=>(stateNames[normalizedLabel(value).toUpperCase()]||normalizedLabel(value)).toLowerCase();return /state|province/i.test(question)&&(state(answer)===state(expected)||state(raw)===state(expected));}
 if(fact==='city'){
  if(!/city|location/i.test(question))return false;
  const escaped=expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!new RegExp('(^|[^a-z])'+escaped+'(?=$|[^a-z])').test(answer))return false;
  if(/canada|united kingdom|australia|india/i.test(answer)&&/united states|^us$/i.test(facts.country))return false;
  const namedState=Object.values(stateNames).find(s=>new RegExp('\\b'+s+'\\b','i').test(answer));
  const abbreviation=answer.match(/,\s*([a-z]{2})(?:,|$)/i)?.[1]?.toUpperCase();
  if(abbreviation&&stateNames[abbreviation]&&abbreviation!==String(facts.state).toUpperCase()&&stateNames[abbreviation].toLowerCase()!==String(facts.state).toLowerCase())return false;
  return !namedState||namedState.toLowerCase()===(stateNames[String(facts.state).toUpperCase()]||facts.state||'').toLowerCase();
 }
 return ['email','state','availability'].includes(fact)&&new RegExp(fact==='availability'?'availab|start':fact,'i').test(question)&&(answer===expected||raw===expected);
}
