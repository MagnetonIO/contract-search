import {applicationControlKind,applicationAuxiliaryUrl} from './application-controls.mjs';
const stateNames=Object.fromEntries('AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|PR:Puerto Rico|GU:Guam|VI:U.S. Virgin Islands|AS:American Samoa|MP:Northern Mariana Islands'.split('|').map(pair=>pair.split(':')));
export const normalizedLabel=value=>String(value||'').replace(/\s+/g,' ').trim();
export function visualTextFactAllowed(question,fact,facts){
 if(!facts?.[fact]||/^(?:are|do|does|have|has|will|would|can|could|did|is|what|when|how)\b/i.test(question.trim())||/password|sponsor|authoriz|citizen|clearance|years?|experience|certif|signature|agree|birth|social.security/i.test(question))return false;
 if(fact==='city'&&/country|state|province|postal|zip|street|address/i.test(question)||fact==='state'&&/country|\bcity\b/i.test(question)||fact==='street'&&/email|website|linkedin|url/i.test(question))return false;
 if(fact==='website'&&/github|linkedin/i.test(question))return false;
 const labels={name:/^(?:full |your )?name\b/i,first_name:/first name/i,last_name:/last name|surname/i,email:/email/i,phone:/phone|mobile/i,city:/\bcity\b|\blocation\b/i,state:/\b(?:state|province)\b/i,country:/country/i,zip:/zip|postal/i,street:/street|address/i,linkedin:/linkedin/i,github:/github/i,website:/website|portfolio/i};
 return Boolean(labels[fact]?.test(question));
}
export const humanCheckText=text=>/\b(?:verify (?:that )?you are human|humans only|please complete (?:the )?captcha|complete (?:the )?security check|security verification required)\b/i.test(String(text));
export const optionalTopChoice=control=>['checkbox','radio'].includes(control?.type)&&/\b(?:mark (?:this )?job as a )?top choice\b/i.test(normalizedLabel(control?.question||control?.label));
export function knownChoiceAnswer(question,facts){
 if(/^(?:asap|immediate(?:ly)?|available (?:now|immediately))\.?$/i.test(String(facts?.availability||'').trim())&&/\b(?:begin|start)\b.{0,35}\b(?:immediate(?:ly)?|asap|this week|next week)\b/i.test(question)&&!/\bnot\b|cannot|unable|can't|certif|clearance|sponsor|authoriz|citizen|visa|relocat|travel|on.?site|hybrid|weekend|hours|time.?zone|\byears?\b/i.test(question))return {fact:'availability',answer:'yes'};
 if(/^(?:are you (?:currently )?(?:located|based|living)|do you (?:currently )?(?:live|reside)) in (?:the )?(?:united states|u\.?s\.?(?:a\.?)?)[?*\s]*$/i.test(String(question).trim())&&facts?.country)return {fact:'country',answer:/^(?:united states|us|usa)$/i.test(facts.country.trim())?'yes':'no'};
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
 const answers=[...String(facts?.verified_experience||'').matchAll(/User-confirmed application answer:\s*(\d+(?:\.\d+)?) years of hands-on work experience with ([^.\n]+)\./g)].filter(match=>match[2].split('/').some(skill=>{const escaped=skill.trim().replace(/[-–]/g,' ').replace(/\s+/g,' ').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('\\b'+escaped+'\\b','i').test(String(question).replace(/\bfullstack\b/gi,'full stack').replace(/[-–]/g,' ').replace(/\s+/g,' '));}));
 if(!answers.length){const words='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');const career=String(question).toLowerCase().replace(/[-–]/g,' ').replace(new RegExp('\\b('+words.join('|')+')\\b','g'),word=>String(words.indexOf(word))).replace(/\b\d+(?:\.\d+)?\s*(?:\+|or more)?\s*years?\b/g,'years').replace(/\b(?:how many|number of|do you have|have you had|have you|at least|no more than|more than|up to)\b/g,' ').replace(/\b(?:years?|of|work|worked|working|professional|commercial|total|overall|hands on|relevant|experience|in|with|as|a|an|exactly|over)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();const years=Number(facts?.overall_experience_years);if(['','software','software engineering','software development','software engineer','programming','engineering'].includes(career)&&Number.isFinite(years)&&years>0&&years<=60)return {answer:String(years),evidence:'User-confirmed overall software engineering experience: '+years+' years.'};}
 if(!answers.length&&facts?.general_experience_years&&facts?.general_experience_skills){const normalize=value=>String(value||'').replace(/[-–]/g,' ').replace(/\s+/g,' ').trim();const q=normalize(question),source=normalize(facts.verified_experience),withoutDuration=q.replace(/\b\d+(?:\.\d+)?\s*(?:\+|or more)?\s*years?\b/gi,'years');if(!/\d/.test(withoutDuration)){const skills=String(facts.general_experience_skills).split(/[;,\n]/).map(value=>value.split('/').map(normalize).filter(Boolean));for(const aliases of skills){const patterns=aliases.map(skill=>new RegExp('(^|[^a-z0-9])'+skill.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z0-9])','i'));if(patterns.some(pattern=>pattern.test(q))&&patterns.some(pattern=>pattern.test(source))){const years=Number(facts.general_experience_years);if(years>=0&&years<=60)return {answer:String(years),source:'User-provided general baseline for listed documented core skills',evidence:'Saved core experience baseline for '+aliases.join('/')+': '+years+' years.'};}}}}

 if(!answers.length)return null;
 if(new Set(answers.map(a=>Number(a[1]))).size!==1)return null;
 const years=Number(answers[0][1]);return years>=0&&years<=60?{answer:String(years),evidence:answers[0][0]}:null;
}
export function experienceRequirementAnswer(question,years){
 if(!/^(?:do|have|did|are|can)\s+you\b/i.test(question)||!/\byears?\b/i.test(question))return null;
 const words='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
 const text=String(question).toLowerCase().replace(new RegExp('\\b('+words.join('|')+')\\b','g'),word=>String(words.indexOf(word)));
 const match=text.match(/\b(\d+(?:\.\d+)?)\s*(?:\+|or more)?\s*years?\b/);if(!match)return {answer:null};
 const prefix=text.slice(0,match.index).trim(),required=Number(match[1]);let yes;
 if(/(?:at most|no more than|up to)$/.test(prefix))yes=years<=required;
 else if(/(?:more than|over)$/.test(prefix))yes=years>required;
 else if(/(?:less than|fewer than|under)$/.test(prefix))yes=years<required;
 else if(/exactly$/.test(prefix))yes=years===required;
 else if(/\bnot\b|\black\b/.test(prefix))return {answer:null};
 else yes=years>=required;
 return {answer:yes?'yes':'no'};
}
export function experienceChoiceMatches(question,answer,years){
 const required=experienceRequirementAnswer(question,years);if(required)return required.answer!==null&&String(answer).trim().toLowerCase()===required.answer;
 const label=String(answer).trim();const less=label.match(/^(?:less than|under|<)\s*(\d+(?:\.\d+)?)\s*(?:years?)?$/i);if(less)return years<Number(less[1]);const more=label.match(/^(?:more than|over|>)\s*(\d+(?:\.\d+)?)\s*(?:years?)?$/i);if(more)return years>Number(more[1]);const option=label.match(/^(\d+(?:\.\d+)?)\s*(\+|or more)?\s*(?:years?)?(?:\s*(or more))?$/i),range=label.match(/^(\d+(?:\.\d+)?)\s*(?:[-–]|to)\s*(\d+(?:\.\d+)?)\s*(?:years?)?$/i);
 if(range)return Number(range[1])<=years&&years<=Number(range[2]);
 return Boolean(option&&(option[2]||option[3]?years>=Number(option[1]):years===Number(option[1])));
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
 if(applicationAuxiliaryUrl(control.href)||/tailor (?:my |your )?resum[eé]|create (?:a )?cover letter|help me stand out|upgrade|\bpremium\b|resum[eé].{0,20}template/i.test(text))return 'blocked';
 if(control.applicationDialog&&/^(?:close|dismiss|cancel)$/i.test(text))return 'blocked';
 if(control.type==='password'||/sign.?in|log.?in|captcha|verify.*human|security check|agree|accept.*terms|purchase|pay|delete|withdraw|unsubscribe/i.test(text))return 'blocked';
 if(['checkbox','radio'].includes(control.type)||['checkbox','radio','option'].includes(control.role))return 'answer';
 if(control.tag==='SELECT'||control.role==='combobox')return 'focus';
 if(['INPUT','TEXTAREA'].includes(control.tag)||control.editable)return 'focus';
 if(control.tag==='BUTTON'&&/^Resume options$/i.test(text))return 'click';
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
  const confirmed=experienceAnswer(question,facts);return confirmed?experienceChoiceMatches(question,answer,Number(confirmed.answer)):false;
 }
 if(['work_authorization','sponsorship','us_citizen'].includes(fact)){
  // Some employer forms ask authorization through visa-category options.
  // Only an explicitly saved citizenship fact can select that exact category.
  if(fact==='us_citizen'&&expected==='yes'&&/authoriz|eligible.*work|legal.*work/i.test(question)&&! /clearance|criminal|signature|penalty|background|sponsor/i.test(question)&&/^(?:u\.?s\.?|united states)\s+citizen$/.test(answer))return true;
  const known=knownChoiceAnswer(question,facts);return known?.fact===fact&&answer===known.answer;
 }
 if(fact==='routine_privacy_consent')return expected==='yes'&&/privacy|personal data|accurac|accurate/i.test(question)&&! /terms|conditions|arbitration|background|signature/i.test(question);
 if(fact==='country'){
  const known=knownChoiceAnswer(question,facts);if(known?.fact==='country')return answer===known.answer;
  if(!/country/i.test(question))return false;
  if(/^(us|usa|united states)$/.test(expected))return /^(us|usa|united states)(?:\s*(?:\(\+?1\)|\+1))?$/.test(answer)||/^(us|usa|united states)$/.test(raw);
 }
 if(fact==='availability'){const known=knownChoiceAnswer(question,facts);if(known?.fact==='availability')return answer===known.answer;}
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
