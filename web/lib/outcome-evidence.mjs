import {randomUUID} from 'node:crypto';
// Evidence is a record of what was observed, not a claim that every attempt failed
// or succeeded at the employer. Never turn an interrupted check into a closure.
export const OUTCOME_STATUSES=['failed','skipped','submission_unknown','needs_input','submitted','cancelled'];
export function evidenceUrl(raw){
 try{const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;
  const params=new URLSearchParams();for(const key of ['jk','jobId','jobid','currentJobId'])if(u.searchParams.has(key))params.set(key,u.searchParams.get(key));
  u.search=params.toString();u.hash='';return u.href;
 }catch{return null;}
}
export function evidenceText(value){return String(value||'').replace(/(?:https?|wss?):\/\/[^\s<>"']+/gi,url=>evidenceUrl(url)||'[private URL omitted]').replace(/(?:Bearer\s+)[\w.\-]+/gi,'Bearer [redacted]').replace(/\b(token|password|secret|api[_-]?key|authorization)["']?\s*[:=]\s*["']?[^\s,;"']+/gi,'$1=[redacted]').replace(/\b(?:sk-|bb_live_|bb_test_|ghp_|github_pat_)[A-Za-z0-9_-]+/g,'[redacted]').slice(0,4000);}
export function outcomeCategory(status,reason='',explicit){
 if(explicit==='closed')return 'closed';
 if(status==='submission_unknown')return 'unconfirmed';
 if(status==='skipped'&&/explicitly reports.*closed|no longer (?:accepting|available)|posting.*(?:expired|closed)/i.test(reason))return 'closed';
 return status;
}
export function outcomeRecord(attempt,patch={},at=new Date().toISOString()){
 const a={...attempt,...patch},e=patch.evidence||{};
 return {id:e.id||randomUUID(),status:a.status,category:outcomeCategory(a.status,a.reason,e.category),recorded_at:at,
  required_action:a.required_action||null,reason:evidenceText(a.reason||a.receipt||a.status),source_url:evidenceUrl(e.source_url||a.application_url),observed_url:evidenceUrl(e.observed_url),
  basis:e.basis||'worker_record',observed_at:e.observed_at||null,http_status:Number.isInteger(e.http_status)?e.http_status:null,
  site_notice:evidenceText(e.site_notice),page_excerpt:evidenceText(e.page_excerpt),error_type:evidenceText(a.failure_type||e.error_type),error_message:evidenceText(e.error_message),
  screenshot_key:e.screenshot_key||null,screenshot_at:e.screenshot_at||null,screenshot_kind:e.screenshot_kind||'outcome',preserved_at:e.preserved_at||null,
  actions:(a.visual_steps||[]).slice(-10).map(s=>({at:s.at,step:s.step,action:s.action,status:s.status,summary:evidenceText(s.summary),result_detail:s.result_detail||null})),
  evidence_gap:e.evidence_gap||(!e.screenshot_key&&!e.site_notice&&!e.page_excerpt?'No page snapshot was retained for this outcome. The reason is a worker record.':null),
  submission_intent_at:a.submission_intent_at||null,confirmed_at:a.confirmed_at||null,receipt:evidenceText(a.receipt),profile_version:a.profile_version||null,resume_hash:a.resume_hash||null};
}
export function attemptOutcomes(attempt){
 const history=attempt.outcome_history||[];
 if(!OUTCOME_STATUSES.includes(attempt.status))return history;
 const last=history.at(-1);
 if(last?.status===attempt.status&&last.reason===evidenceText(attempt.reason||attempt.receipt||attempt.status))return history;
 return [...history,{...outcomeRecord(attempt,{},attempt.updated_at||attempt.created_at||null),id:'legacy',basis:'legacy_worker_record',evidence_gap:'Historical page evidence was not retained. This documents the saved reason and timestamp; it does not independently verify the employer outcome.'}];
}
export function screenshotKey(attempt,outcomeId){
 if(!outcomeId)return attempt?.visual_screenshot_key||null;
 return attempt?.outcome_history?.find(e=>e.id===outcomeId)?.screenshot_key||null;
}
export function preserveScreeningHistory(old,next,at=new Date().toISOString()){
 for(const [id,s] of Object.entries(next)){
  const prior=old[id];if(!prior||['status','reason','score','version'].every(key=>prior[key]===s[key]))continue;
  const {prior_skips,...snapshot}=prior;
  next[id]={...s,decision_at:at,prior_skips:[...(prior_skips||[]),...(prior.status==='skipped'?[snapshot]:[])]};
 }
 return next;
}
export function outcomeLog(leads,workflow,screens,attempts,postings={}){
 const byId=new Map(leads.map(l=>[l.id,l])),rows=[];
 const base=id=>{const l=byId.get(id);return {lead_id:id,title:l?.title||id,company:l?.company_agency||'',source_url:evidenceUrl(l?.application_url||l?.source_url)};};
 for(const a of Object.values(attempts))for(const e of attemptOutcomes(a))rows.push({...base(a.lead_id),...e,title:a.title||byId.get(a.lead_id)?.title||a.lead_id,source_url:e.source_url||base(a.lead_id).source_url,id:a.id+'-'+e.id,attempt_id:a.id,outcome_id:e.id});
 for(const [id,p] of Object.entries(workflow))if(p.disposition?.status==='closed'){
  const e=p.availability_evidence||postings[id],proof=e?.status==='closed'?e:null;
  rows.push({...base(id),id:'closed-'+id,category:'closed',status:'closed',recorded_at:p.disposition.recorded_at,reason:p.availability_reason||proof?.reason||'Marked no longer accepting applications.',basis:proof?'public_posting_check':'user_record',observed_at:proof?.checked_at||null,source_url:evidenceUrl(proof?.source_url)||base(id).source_url,http_status:proof?.http_status,site_notice:proof?.site_notice||'',evidence_gap:proof?.site_notice||proof?.http_status?null:'No independent page evidence retained; this is the saved closure decision.'});
 }
 for(const [id,current] of Object.entries(screens))for(const [index,s] of [...(current.prior_skips||[]),...(current.status==='skipped'?[current]:[])].entries())rows.push({...base(id),source_url:evidenceUrl(s.source_url)||base(id).source_url,id:'screen-'+id+'-'+index,category:'skipped',status:'skipped',recorded_at:s.decision_at||s.screened_at||null,reason:s.reason,basis:s.decision_basis||(s.evidence?.length?'model_evaluation':'screening_rule'),score:s.score,minimum_score:s.minimum_score,rule_inputs:s.rule_inputs,profile_version:s.profile_version,resume_hash:s.resume_hash,fit_evidence:s.evidence||[],match_notes:s.match_notes||[],evidence_gap:s.evidence?.length||s.rule_inputs?null:'Only the saved screening reason is available; no supporting excerpts were retained.'});
 return rows.sort((a,b)=>String(b.recorded_at||'').localeCompare(String(a.recorded_at||'')));
}
