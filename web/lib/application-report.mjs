import {readJson,writeJson,ConflictError} from './store.ts';
import {readSnapshot} from './snapshot.mjs';
import {chicagoDay} from './automation-policy.mjs';
import {attemptBlocker} from './application-blockers.mjs';
import {outcomeCategory,evidenceText,evidenceUrl} from './outcome-evidence.mjs';
import {deliverStored,sendMail,escapeHtml,MAIL_FROM,MAIL_REPLY_TO,DIGEST_TO,DASHBOARD_URL} from './mail.mjs';

const defaultStore={read:key=>readJson(key,null),write:writeJson,conflict:e=>e instanceof ConflictError};
const localTime=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
const valid=value=>Number.isFinite(Date.parse(value||''));
export function applicationReportWindow(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const weekday=!['Sat','Sun'].includes(p.weekday),end=(p.weekday==='Fri'?15:18)*60,minute=Number(p.hour)*60+Number(p.minute);
 return {day:chicagoDay(now),weekday,allowed:weekday&&minute>=end+10&&minute<end+60};
}
function category(a){
 if(a.status==='submitted')return valid(a.confirmed_at)&&a.receipt?'confirmed':'unconfirmed';
 if(a.status==='submission_unknown')return 'unconfirmed';
 if(['queued','running','submitting'].includes(a.status))return 'in_progress';
 const c=outcomeCategory(a.status,a.reason,a.outcome_history?.at(-1)?.category);
 if(c==='closed')return c;
 const blocker=attemptBlocker(a);
 if(blocker?.kind==='technical')return 'technical_failure';
 if(['sign_in','email_verification'].includes(blocker?.kind))return 'security_or_sign_in';
 if(blocker?.kind==='answer')return 'needs_answer';
 if(blocker?.kind==='review')return 'needs_review';
 return c;
}
const labels={confirmed:'Confirmed',technical_failure:'Technical failure',security_or_sign_in:'Security or sign-in',needs_answer:'Needs answer',needs_review:'Needs review',unconfirmed:'Unconfirmed',closed:'Closed',skipped:'Skipped',cancelled:'Cancelled',in_progress:'In progress',failed:'Failed',needs_input:'Needs input'};
const csvCell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
export function applicationReportPayload({leads=[],attempts={},now=new Date(),mode='daily'}){
 const day=chicagoDay(now),byId=new Map(leads.map(l=>[l.id,l])),seen=new Set(),rows=[];
 for(const a of Object.values(attempts)){
  const status=category(a),at=status==='confirmed'?a.confirmed_at:a.updated_at||a.last_started_at||a.created_at;
  if(!valid(at)||chicagoDay(new Date(at))!==day)continue;
  if(status==='confirmed'){const id=a.target_identity||a.id;if(seen.has(id))continue;seen.add(id);}
  const lead=byId.get(a.lead_id),blocker=attemptBlocker(a);
  const url=evidenceUrl(a.application_url||lead?.application_url||lead?.source_url);
  const proof=a.outcome_history?.findLast(e=>e.status===a.status&&e.screenshot_key);
  const evidence=proof?.screenshot_key?DASHBOARD_URL+'/api/automation-screenshot?id='+encodeURIComponent(a.id)+'&outcome='+encodeURIComponent(proof.id):a.visual_screenshot_key?DASHBOARD_URL+'/api/automation-screenshot?id='+encodeURIComponent(a.id):'';
  rows.push({id:a.id,title:a.title||lead?.title||a.lead_id,company:lead?.company_agency||a.company||'Company not saved',source:a.source||lead?.source||'Other',destination:url?new URL(url).hostname:'Unknown',status,at,receipt:evidenceText(a.receipt),reason:evidenceText(a.reason||blocker?.detail||''),action:evidenceText(blocker?.instruction||''),url,evidence,details:DASHBOARD_URL+'/?view=automation&lead='+encodeURIComponent(a.lead_id)});
 }
 rows.sort((a,b)=>a.at.localeCompare(b.at));
 const counts={},sources={};
 for(const r of rows){counts[r.status]=(counts[r.status]||0)+1;const s=sources[r.source]??={confirmed:0,other:0};s[r.status==='confirmed'?'confirmed':'other']++;}
 const confirmed=rows.filter(r=>r.status==='confirmed'),other=rows.filter(r=>r.status!=='confirmed');
 const heading=`${confirmed.length} confirmed applications${mode==='so-far'?' so far':''} — ${day}`;
 const sourceLines=Object.entries(sources).sort(([a],[b])=>a.localeCompare(b)).map(([source,s])=>`${source}: ${s.confirmed} confirmed; ${s.other} other outcomes`);
 const intro=`Chicago day ${day}; recorded through ${localTime(now)}. Only target-site receipts count as confirmed. Other outcomes do not use the daily submission quota. Source is where the job was found; destination is where the application was completed. Later manual runs may finish after this report.`;
 const text=[heading,intro,'','By source',...(sourceLines.length?sourceLines:['No application activity recorded today.']),'','Confirmed applications',...confirmed.flatMap((r,i)=>[`${i+1}. ${r.title} — ${r.company}`,`${r.source} → ${r.destination} · ${localTime(r.at)}`,`Receipt: ${r.receipt}`,r.url||r.details,r.evidence?`Private evidence: ${r.evidence}`:'No screenshot retained; saved target-site receipt shown above.']),'','Other outcomes',...other.flatMap(r=>[`${r.title} — ${r.company} · ${r.source} · ${labels[r.status]||r.status}`,r.reason,r.action,r.details]),'','Full outcome register is attached as CSV. Evidence links require your Contract Desk sign-in.'].join('\n');
 const link=(url,label)=>`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
 const jobs=confirmed.map(r=>`<tr><td><strong>${escapeHtml(r.title)}</strong><br>${escapeHtml(r.company)}<br>${escapeHtml(r.source)} → ${escapeHtml(r.destination)} · ${escapeHtml(localTime(r.at))}<br>Receipt: ${escapeHtml(r.receipt)}<br>${link(r.url||r.details,'Job posting')} · ${link(r.details,'Application details')}${r.evidence?' · '+link(r.evidence,'Private evidence'):'<br>No screenshot retained; saved target-site receipt shown above.'}</td></tr>`).join('');
 // Keep the email readable; the attachment preserves every non-success outcome.
 const blockers=other.slice(-12).map(r=>`<li><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.source)} · ${escapeHtml(labels[r.status]||r.status)}<br>${escapeHtml(r.reason.slice(0,600))}<br>${link(r.details,'Details and required action')}</li>`).join('');
 const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;line-height:1.5;color:#172b40"><main style="max-width:700px;margin:auto;padding:16px"><p>CONTRACT DESK</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(intro)}</p><h2>By source</h2><ul>${sourceLines.map(line=>`<li>${escapeHtml(line)}</li>`).join('')||'<li>No application activity recorded today.</li>'}</ul><h2>Confirmed applications (${confirmed.length})</h2><table cellpadding="10" width="100%">${jobs||'<tr><td>No confirmed submissions recorded today.</td></tr>'}</table><h2>Other outcomes (${other.length})</h2><p>${Object.entries(counts).filter(([key])=>key!=='confirmed').map(([key,n])=>escapeHtml(`${labels[key]||key}: ${n}`)).join(' · ')}</p><ul>${blockers}</ul>${other.length>12?'<p>Showing the latest 12 here; every outcome and reason is included in the attached CSV.</p>':''}<p>The full outcome register is attached as CSV. Evidence links require your Contract Desk sign-in.</p><p>${link(DASHBOARD_URL+'/?view=automation','Open application results')}</p></main></body></html>`;
 const csv=[['Job','Company','Source','Application destination','Outcome','Recorded at UTC','Chicago time','Target receipt','Reason','Required action','Job URL','Application details','Private evidence'],...rows.map(r=>[r.title,r.company,r.source,r.destination,labels[r.status]||r.status,r.at,localTime(r.at),r.receipt,r.reason,r.action,r.url,r.details,r.evidence])].map(row=>row.map(csvCell).join(',')).join('\r\n');
 return {payload:{from:MAIL_FROM,to:[DIGEST_TO],reply_to:MAIL_REPLY_TO,subject:'[Contract Desk] '+heading,text,html,attachments:[{filename:`contract-desk-applications-${day}${mode==='so-far'?'-so-far':''}.csv`,content:Buffer.from(csv).toString('base64')}]},meta:{day,confirmed:confirmed.length,counts,sources,cutoff:now.toISOString(),mode}};
}
async function loadReportData(){const [snapshot,attempts]=await Promise.all([readSnapshot(),readJson('application-attempts.json',{})]);return {leads:snapshot.value?.leads||[],attempts:attempts.value};}
export async function sendDailyApplicationReport({now=new Date(),apiKey=process.env.RESEND_API_KEY,store=defaultStore,load=loadReportData,send=sendMail,mode='daily'}={}){
 const window=applicationReportWindow(now);
 if(!window.weekday)return {status:'weekend',day:window.day};
 if(mode!=='so-far'&&!window.allowed)return {status:'outside_report_window',day:window.day};
 if(!apiKey)throw Error('Application report email is not configured.');
 const identity=`application-report/${window.day}/${mode}`;
 const record=await deliverStored(store,`application-reports/${window.day}-${mode}.json`,identity,async()=>applicationReportPayload({...await load(),now,mode}),(payload,id)=>send(payload,id,{apiKey}),()=>now);
 return {status:'accepted',provider_id:record.provider_id,accepted_at:record.accepted_at,...record.meta};
}
