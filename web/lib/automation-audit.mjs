import {leadInView} from './shared.mjs';
import {chicagoDay,applicationWindow} from './automation-policy.mjs';

export function nextApplicationCheck(now=new Date()) {
 const candidate=new Date(now);candidate.setUTCSeconds(0,0);candidate.setUTCMinutes(30);
 if(candidate<=now)candidate.setUTCHours(candidate.getUTCHours()+1);
 for(let i=0;i<168;i++){
  if(applicationWindow(candidate))return candidate.toISOString();
  candidate.setUTCHours(candidate.getUTCHours()+1);
 }
 return null;
}

const regionNames=new Intl.DisplayNames(['en'],{type:'region'});
const countries=Array.from({length:26*26},(_,n)=>String.fromCharCode(65+Math.floor(n/26),65+n%26)).map(code=>({code,name:regionNames.of(code)})).filter(r=>r.name!==r.code&&r.code!=='US');

export function automationLocation(lead, facts, description='') {
 const assessment=lead.location_assessment||{};
 // A country-specific requisition's title and advertised location outrank
 // generic worldwide boilerplate reused across the employer's postings.
 const advertised=String(lead.remote_location||'');
 if(!/United States|\bU\.?S\.?A?\b|worldwide|anywhere/i.test(advertised)){
  const country=countries.find(({code,name})=>{
   const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   return new RegExp('\\b'+escaped+'\\b','i').test(advertised)&&new RegExp('(?:[-–]|\\()\\s*(?:'+escaped+'|'+code+')\\)?$','i').test(lead.title||'');
  });
  if(country)return {status:'blocked',reason:'Country-specific requisition advertises '+country.name+' in both its title and location; this does not establish US eligibility.'};
 }

 const restrictions=(assessment.restrictions||[]).join('\n');
 const clauses=(restrictions+'\n'+(lead.title||'')+'\n'+description).split(/(?<=[.!?;])\s+|\n|•/);
 const onsite=clauses.find(s=>/first (?:week|day).{0,40}on.?site|(?:required|must).{0,30}on.?site|must (?:be (?:able|willing) to )?travel\b|travel (?:is )?required|remote with travel|travel.{0,25}required|\bhybrid (?:work|schedule|role|position)\b|location\s*:\s*hybrid/i.test(s)&&! /no (?:travel|on.?site)|not required/i.test(s));
 if(onsite||assessment.status==='not_remote'||['onsite','hybrid'].includes(lead.work_arrangement))return {status:'blocked',reason:'Posting requires onsite work or travel.'};
 if(assessment.status==='us_excluded')return {status:'blocked',reason:'Posting excludes US applicants.'};
 // An office address is not a residency restriction. Require restrictive wording.
 const residentState=clauses.find(s=>[...s.matchAll(/\b([A-Z]{2})\s+[Rr]esidents?\b/g)].some(m=>'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ').includes(m[1])));
 const regional=residentState||clauses.find(s=>/must (?:reside|live|be based|be located)\s+(?:in|within|out of)\b|(?:candidates|applicants|residents) (?:from|in) .{0,35}\bonly\b|only.{0,15}(?:candidates|applicants) (?:from|in|based in)|eligible states|excluding.{0,35}(?:states|Illinois|IL)\b/i.test(s)&&! /(?:based|located|reside|live) in (?:the )?(?:United States|U\.?S\.?A?\b)|authorized to work|visa|sponsor/i.test(s));
 const national=regional&&/\b(?:reside|live|based|located)\s+(?:out of|in|within)\s+(?:the\s+)?(?:(?:continental|contiguous)\s+)?(?:united states|u\.?s\.?a?\b)/i.test(regional);
 const central=regional&&facts?.state==='IL'&&/\bCentral\s+(?:time(?:\s+zone)?|timezone)\b|\b(?:CST|CDT)\b/i.test(regional)&&! /exclud|except|not eligible/i.test(regional);
 if(regional&&!national&&!central&&!(/\bIllinois\b|\bChicago\b|\bIL\b/.test(regional)&&! /exclud|except|not eligible/i.test(regional)))return {status:'blocked',reason:'Explicit residency restriction conflicts with the Chicago applicant profile: '+regional.trim().slice(0,240)};
 const timezone=clauses.find(s=>/\bonly\s+(?:PST|PDT|EST|EDT|Pacific|Eastern)(?:\s+time)?\s+(?:candidates|applicants|residents)\b|(?:candidates|applicants|residents)\s+(?:in|from)\s+(?:PST|PDT|EST|EDT|Pacific|Eastern)(?:\s+time)?\s+only\b/i.test(s));
 if(timezone)return {status:'blocked',reason:'Explicit time-zone restriction conflicts with the Chicago applicant profile: '+timezone.trim().slice(0,200)};
 const remote=lead.work_arrangement==='remote'||/\bremote\b/i.test(lead.remote_location||'');
 const usState=/(?:,|\bRemote\s+[-–]?)\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/.test(lead.remote_location||'');
 const usScope=usState||/United States|\bU\.?S\.?A?\b|\bworldwide\b|\banywhere\b/i.test(lead.remote_location||'')||/remote\s*[-–(,:]*\s*(?:US\b|U\.S\.|United States)|(?:candidates|applicants).{0,40}(?:based|located|reside).{0,20}(?:United States|U\.S\.)/i.test(description);
 const known=['us_remote_advertised','us_remote_restricted','worldwide_remote_advertised'].includes(assessment.status);
 if(remote&&(known||usScope))return {status:'allowed',reason:/\bCST\b|\bCDT\b|Central (?:time|timezone)/i.test(restrictions)&&facts?.state==='IL'?'US remote; Chicago is in the required Central time zone.':'US/worldwide remote includes the applicant’s US location; no conflicting restriction found.'};
 if(remote&&!/\b(?:United Kingdom|UK|India|Canada|Europe|Australia|EMEA|APAC)\b/i.test(lead.remote_location||''))return {status:'allowed',reason:'Remote is advertised with no conflicting country restriction. Apply using the confirmed US profile; country scope remains unspecified.'};
 return {status:remote?'blocked':'held',reason:remote?'The advertised country restriction conflicts with the US applicant profile.':'The posting does not establish a compatible remote arrangement.'};
}

export function automationAudit(leads, workflow, screens) {
 const open=leads.filter(lead=>leadInView(lead,workflow[lead.id],'opportunities'));
 const rows=open.map(lead=>{const s=screens[lead.id];return {id:lead.id,title:lead.title,company:lead.company_agency,source:lead.source,status:s?.status||'pending',score:s?.score??null,reason:s?.reason||'Waiting for evaluation.',evaluated_at:s?.screened_at||null,requirements:s?.eligibility_questions||[],match_notes:s?.match_notes||[]};});
 const count=status=>rows.filter(r=>r.status===status).length;
 const groups={};for(const row of rows){const key=row.status==='held'?(row.reason.startsWith('Location')||/location|region|time.zone/i.test(row.reason)?'Location needs confirmation':'Qualifications / facts need confirmation'):row.status==='skipped'?(row.score===0?row.reason:'Below fit threshold or unmet requirements'):row.status==='eligible'?'Ready to apply':'Waiting for evaluation';groups[key]=(groups[key]||0)+1;}
 return {total:open.length,evaluated:rows.filter(r=>r.status!=='pending').length,ready:count('eligible'),held:count('held'),skipped:count('skipped'),pending:count('pending'),outside_opportunities:leads.length-open.length,groups,rows};
}

export function applicationSourceHealth(leads,workflow,screens,attempts,now=new Date()){
 const rows=new Map(),byId=new Map(leads.map(l=>[l.id,l])),day=chicagoDay(now);
 const row=source=>{source=source||'Other';if(!rows.has(source))rows.set(source,{source,open:0,strong_matches:0,confirmed_today:0,confirmed_total:0,needs_attention:0});return rows.get(source);};
 for(const lead of leads){const r=row(lead.source);if(leadInView(lead,workflow[lead.id],'opportunities')){r.open++;if(screens[lead.id]?.status==='eligible')r.strong_matches++;}}
 const receipts=new Set();
 for(const a of Object.values(attempts||{})){
  const r=row(byId.get(a.lead_id)?.source||a.source),identity=a.target_identity||a.id;
  if(a.status==='submitted'&&a.receipt&&Number.isFinite(Date.parse(a.confirmed_at||''))&&!receipts.has(identity)){receipts.add(identity);r.confirmed_total++;if(chicagoDay(new Date(a.confirmed_at))===day)r.confirmed_today++;}
  else if(['failed','needs_input','submission_unknown'].includes(a.status))r.needs_attention++;
 }
 return [...rows.values()].filter(r=>r.open||r.confirmed_total||r.needs_attention).sort((a,b)=>a.source.localeCompare(b.source));
}
