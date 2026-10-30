import {leadInView} from './shared.mjs';

export function nextApplicationCheck(now=new Date()) {
 const candidate=new Date(now);candidate.setUTCSeconds(0,0);candidate.setUTCMinutes(30);
 if(candidate<=now)candidate.setUTCHours(candidate.getUTCHours()+1);
 for(let i=0;i<168;i++){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(candidate).map(x=>[x.type,x.value]));
  if(!['Sat','Sun'].includes(p.weekday)&&Number(p.hour)>=8&&Number(p.hour)<18)return candidate.toISOString();
  candidate.setUTCHours(candidate.getUTCHours()+1);
 }
 return null;
}

export function automationLocation(lead, facts, description='') {
 const assessment=lead.location_assessment||{};
 const restrictions=(assessment.restrictions||[]).join('\n');
 const clauses=(restrictions+'\n'+description).split(/(?<=[.!?;])\s+|\n|•/);
 const onsite=clauses.find(s=>/first (?:week|day).{0,40}on.?site|(?:required|must).{0,30}on.?site|must (?:be (?:able|willing) to )?travel\b|travel (?:is )?required|remote with travel|travel.{0,25}required|\bhybrid (?:work|schedule|role|position)\b|location\s*:\s*hybrid/i.test(s)&&! /no (?:travel|on.?site)|not required/i.test(s));
 if(onsite||assessment.status==='not_remote'||['onsite','hybrid'].includes(lead.work_arrangement))return {status:'blocked',reason:'Posting requires onsite work or travel.'};
 if(assessment.status==='us_excluded')return {status:'blocked',reason:'Posting excludes US applicants.'};
 // An office address is not a residency restriction. Require restrictive wording.
 const regional=clauses.find(s=>/must (?:reside|live|be based|be located)|(?:candidates|applicants|residents) (?:from|in) .{0,35}\bonly\b|only.{0,15}(?:candidates|applicants) (?:from|in|based in)|eligible states|excluding.{0,35}(?:states|Illinois|IL)\b/i.test(s)&&! /(?:based|located|reside|live) in (?:the )?(?:United States|U\.?S\.?A?\b)|authorized to work|visa|sponsor/i.test(s));
 const national=regional&&/\b(?:reside|live|based|located)\s+(?:out of|in|within)\s+(?:the\s+)?(?:(?:continental|contiguous)\s+)?(?:united states|u\.?s\.?a?\b)/i.test(regional);
 if(regional&&!national&&!(/\bIllinois\b|\bChicago\b|\bIL\b/.test(regional)&&! /exclud|except|not eligible/i.test(regional)))return {status:'blocked',reason:'Explicit residency restriction conflicts with the Chicago applicant profile: '+regional.trim().slice(0,240)};
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
