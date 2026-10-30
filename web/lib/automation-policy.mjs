import {createHash} from 'node:crypto';

export const DEFAULT_AUTOMATION_POLICY = Object.freeze({enabled:false,daily_limit:20,monthly_limit_usd:50,browser_subscription_usd:20,minimum_hourly_usd:100,minimum_score:80,allow_unknown_terms:true});
export function chicagoDay(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function applicationWindow(now=new Date()) {
 const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return !['Sat','Sun'].includes(p.weekday)&&Number(p.hour)*60+Number(p.minute)>=510&&Number(p.hour)<18;
}
export function applicationRunAllowed(state,now=new Date()) {
 if(applicationWindow(now))return true;
 const run=state?.run,start=Date.parse(run?.started_at||''),end=Date.parse(run?.manual_expires_at||'');
 return run?.active===true&&run.mode==='manual'&&Number.isFinite(start)&&Number.isFinite(end)&&start<=now.getTime()&&end>now.getTime()&&end<=start+2*3600000;
}
export function fingerprint(value) {return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function applicationIdentity(lead) {
 const target=lead.application_url||lead.source_url;
 try {const u=new URL(target);const linkedin=u.hostname.endsWith('linkedin.com')&&u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/);if(linkedin)return fingerprint({source:'linkedin',job_id:linkedin[1]});const id=['gh_jid','jobId','jobid','job_id','jk','reqid','jl'].flatMap(k=>u.searchParams.has(k)?[[k,u.searchParams.get(k)]]:[]);return fingerprint({host:u.hostname.toLowerCase().replace(/^www\./,''),path:u.pathname.replace(/\/$/,''),ids:id.sort()});}catch{return fingerprint({source:lead.source,source_job_id:lead.source_job_id||lead.id});}
}
export function excluded(lead,progress) {
 if(progress?.disposition||progress?.stage==='not_a_fit')return 'Previously dismissed';
 if(progress?.stage==='applied'||progress?.application?.submission_recorded_at)return 'Already submitted';
 if(lead.pipeline!=='contract')return 'Not an individual contract opening';
 return null;
}
export function screenGate(lead,description='',progress,policy=DEFAULT_AUTOMATION_POLICY) {
 const reason=excluded(lead,progress);if(reason)return reason;
 // Use normalized posting evidence for location; never derive it from office addresses in prose.
 const location=lead.location_assessment;
 if(location?.status==='not_remote'||['onsite','hybrid'].includes(String(lead.work_arrangement).toLowerCase()))return 'Requires onsite or hybrid work';
 if(lead.c2c_status==='not accepted')return 'Explicit C2C exclusion';
 const text=(description+' '+lead.c2c_status).toLowerCase();
 if(/\b(?:type|employment(?: type)?|job type)\s*:\s*full[ -]?time\b/i.test(description)&&! /\bcontract(?:or|ing)?\b|\bfreelance\b|\btemporary\b/i.test(description))return 'Posting explicitly describes permanent full-time employment';
 if(/\bw[ -]?2(?:\s+candidates)?\s*(?:only|required)\b|\bno\s+(?:c2c|corp.to.corp)\b/.test(text))return 'Explicit W2-only / no C2C requirement';
 const ranges=[...String(lead.pay||'').matchAll(/\$([\d,]+(?:\.\d+)?)\s*(?:-|–|to)\s*\$?([\d,]+(?:\.\d+)?)/g)];
 const hourly = /(?:hour|\/hr|hourly)/i.test(lead.pay||'')&&!/CAD|AUD|EUR|GBP|£|€/i.test(lead.pay||'');
 const upper = ranges.length?Math.max(...ranges.map(m=>Number(m[2].replaceAll(',','')))):Number(String(lead.pay||'').match(/\$([\d,]+(?:\.\d+)?)/)?.[1]?.replaceAll(',',''));
 if(hourly&&Number.isFinite(upper)&&upper<policy.minimum_hourly_usd)return 'Published hourly rate is below minimum';
 if(!String(description).trim())return 'Full posting description unavailable';
 return null;
}
export function reserveBudget(ledger,reservation,now=new Date(),policy=DEFAULT_AUTOMATION_POLICY) {
 if(!Number.isFinite(reservation.usd)||reservation.usd<=0)throw Error('Invalid spending reservation');
 const day=chicagoDay(now);const month=day.slice(0,7);
 const state=structuredClone(ledger||{month,charges:[],submissions:[]});
 if(state.month!==month){state.month=month;state.charges=[];}
 if(state.charges.some(c=>c.id===reservation.id))return state;
 const spent=state.charges.reduce((sum,c)=>sum+c.usd,policy.browser_subscription_usd);
 if(spent+reservation.usd>policy.monthly_limit_usd+1e-9)throw Error('Monthly automation allowance exhausted');
 if(reservation.submit&&state.submissions.filter(s=>s.day===day).length>=policy.daily_limit)throw Error('Daily submission limit reached');
 state.charges.push({...reservation,reserved_at:now.toISOString(),status:'reserved'});
 if(reservation.submit)state.submissions.push({id:reservation.id,day});
 return state;
}
