import {dailySubmissionQuota} from './automation-policy.mjs';
import {attemptBlocker} from './application-blockers.mjs';
export function sourceLimitReached(source,attempts,policy,now=new Date()){
 if(source!=='Dice'||!Number.isFinite(policy.dice_daily_limit))return false;
 const quota=dailySubmissionQuota(Object.fromEntries(Object.entries(attempts).filter(([,a])=>a.source==='Dice')),{...policy,daily_limit:policy.dice_daily_limit},now);
 return quota.remaining===0||quota.confirmed+quota.in_flight>=quota.limit;
}
export function pilotReport(policy,attempts,usage={generations:{}}){
 const pilot=policy.visual_pilot;if(!pilot?.id)return null;
 const rows=Object.values(attempts).filter(a=>a.pilot_id===pilot.id);
 const started=rows.filter(a=>a.last_started_at),ids=new Set(rows.map(a=>a.id));
 const generations=Object.values(usage.generations||{}).filter(g=>ids.has(g.attempt_id));
 return {...pilot,attempted:started.length,queued:rows.filter(a=>a.status==='queued').length,confirmed:rows.filter(a=>a.status==='submitted'&&a.receipt&&a.confirmed_at).length,technical:rows.filter(a=>attemptBlocker(a)?.owner==='automation').length,human_checks:rows.filter(a=>['sign_in','email_verification'].includes(attemptBlocker(a)?.kind)).length,needs_answer:rows.filter(a=>attemptBlocker(a)?.kind==='answer').length,needs_review:rows.filter(a=>attemptBlocker(a)?.kind==='review').length,unconfirmed:rows.filter(a=>a.status==='submission_unknown').length,reported_usd:generations.filter(g=>g.status==='reported').reduce((s,g)=>s+g.cost_usd,0),pending_costs:generations.filter(g=>g.status!=='reported').length,complete:started.length>=pilot.limit&&!rows.some(a=>['queued','running','submitting'].includes(a.status))};
}
export function pilotAllows(source,policy,attempts){
 const pilot=policy.visual_pilot;if(!pilot?.enabled)return true;
 const full=Object.values(attempts).filter(a=>a.pilot_id===pilot.id&&(a.last_started_at||a.status==='queued')).length>=pilot.limit;
 return full?source==='Dice':source!=='Dice';
}
export function pilotFields(policy,source){
 return policy.visual_pilot?.enabled&&source!=='Dice'?{pilot_id:policy.visual_pilot.id,visual_fallback_model:policy.visual_pilot.model}:{};
}
