'use client';
import {useState} from 'react';
const when=(value?:string)=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/Chicago'}):'Timestamp not retained';
const basis:Record<string,string>={application_browser:'Observed application page',application_policy:'Application policy check',worker_record:'Worker record',worker_liveness:'Worker interruption',legacy_worker_record:'Historical worker record',public_posting_check:'Public posting check',user_record:'User decision',qualification_review:'Qualification review',model_evaluation:'AI fit evaluation',screening_rule:'Screening rule'};
export function EvidenceDetails({record:e}:{record:any}){
 return <details className="outcome-evidence"><summary>Evidence · {basis[e.basis]||e.basis}</summary>
  <p>Recorded {when(e.recorded_at)} Chicago{e.observed_at?` · Page checked ${when(e.observed_at)} Chicago`:''}</p>
  <p>{e.reason}</p>{e.resolution&&<p><strong>{e.resolution}</strong></p>}
  {e.source_url&&<p><a href={e.source_url} target="_blank" rel="noreferrer">Original posting</a></p>}
  {e.observed_url&&e.observed_url!==e.source_url&&<p><a href={e.observed_url} target="_blank" rel="noreferrer">Observed application page</a></p>}
  {e.http_status!==undefined&&e.http_status!==null&&<p>Recorded HTTP response: {e.http_status}. {e.http_status===403||e.http_status===429?'Access restriction; this does not establish that the job is closed.':''}</p>}
  {e.site_notice&&<><strong>Site notice</strong><blockquote>{e.site_notice}</blockquote></>}
  {e.error_type&&<p>Error type: {e.error_type}</p>}{e.error_message&&<blockquote>{e.error_message}</blockquote>}
  {e.submission_intent_at&&<p>Submission action reserved {when(e.submission_intent_at)} Chicago. {e.confirmed_at?`Confirmed ${when(e.confirmed_at)} Chicago.`:'No employer confirmation recorded; reconcile before retrying.'}</p>}
  {e.screenshot_key&&e.attempt_id&&e.outcome_id&&<p><a href={'/api/automation-screenshot?id='+e.attempt_id+'&outcome='+e.outcome_id} target="_blank" rel="noreferrer">{e.screenshot_kind==='last_observation'?'View last recorded page before outcome':'View private outcome screenshot'}</a>{e.screenshot_at?` · ${when(e.screenshot_at)} Chicago`:''}</p>}
  {e.actions?.length>0&&<details><summary>Recorded actions before outcome ({e.actions.length})</summary><ol>{e.actions.map((s:any,i:number)=><li key={i}>{when(s.at)} · {s.action} · {s.status||'requested'} · {s.summary}</li>)}</ol></details>}
  {e.page_excerpt&&<details><summary>Recorded page excerpt</summary><blockquote>{e.page_excerpt}</blockquote></details>}
  {e.score!==undefined&&<p>Saved fit score: {e.score}/100{e.minimum_score!==undefined?` · Minimum: ${e.minimum_score}/100`:''}. This is a screening decision, not an employer response.</p>}
  {e.rule_inputs&&<details><summary>Recorded screening inputs</summary><pre>{JSON.stringify(e.rule_inputs,null,2)}</pre></details>}
  {e.fit_evidence?.length>0&&<details><summary>Supporting fit evaluation ({e.fit_evidence.length})</summary><p>AI evaluation against the saved résumé and applicant facts; these are model explanations.</p><ul>{e.fit_evidence.map((item:any,i:number)=><li key={i}><strong>{item.requirement}</strong><p>{item.resume_fact}</p></li>)}</ul></details>}
  {e.profile_version&&<small>Applicant facts version: {e.profile_version}</small>}
  {e.resume_hash&&<small>Résumé version: {e.resume_hash}</small>}
  {e.evidence_gap&&<p className="muted">Evidence limitation: {e.evidence_gap}</p>}
 </details>;
}
export default function OutcomeEvidence({records}:{records:any[]}){
 const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[page,setPage]=useState(0);
 const rows=records.filter(e=>(filter==='all'||e.category===filter)&&[e.title,e.company,e.reason].join(' ').toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(rows.length/15)),current=Math.min(page,pages-1);
 return <section id="outcome-evidence" className="settings-panel"><h2>Outcome evidence</h2><p>Failed, closed, skipped and unconfirmed outcomes remain documented here, including earlier outcomes for retried applications. Only confirmed submissions count toward the daily quota.</p>
  <p><a className="button secondary" href="/api/automation-evidence">Download evidence log (JSON)</a></p>
  <div className="automation-filters"><input aria-label="Search outcome evidence" placeholder="Search job, company or reason" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><select aria-label="Filter outcome evidence" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}>{['all','failed','closed','skipped','unconfirmed','needs_input','submitted','cancelled'].map(s=><option key={s} value={s}>{s==='all'?'All outcomes':s==='needs_input'?'Needs input':s.replaceAll('_',' ')}</option>)}</select></div>
  {rows.slice(current*15,current*15+15).map(e=><article className="automation-decision" key={e.id}><a href={'/?lead='+e.lead_id}><strong>{e.title}</strong></a><span className={'badge '+(e.category==='submitted'?'green':'amber')}>{e.category.replaceAll('_',' ')}</span><small>{e.company} · {when(e.recorded_at)} Chicago</small><p>{e.reason}</p>{e.resolution&&<p><strong>{e.resolution}</strong></p>}<EvidenceDetails record={e}/></article>)}
  {!rows.length&&<p>No outcomes match this filter.</p>}
  <div className="automation-actions"><button className="button secondary" disabled={!current} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current+1} of {pages} · {rows.length} records</span><button className="button secondary" disabled={current>=pages-1} onClick={()=>setPage(current+1)}>Next</button></div>
 </section>;
}
