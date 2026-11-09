import {sourceExpired} from './shared.mjs';
export function recordDisposition(current, action, now = new Date().toISOString()) {
  const old = current || { stage: 'new', notes: '', updated_at: now };
  if (action === 'restore') {
    const { disposition, ...rest } = old;
    return disposition || old.stage === 'not_a_fit' ? { ...rest, stage: old.stage === 'not_a_fit' ? 'new' : old.stage, updated_at: now } : old;
  }
  if (old.disposition?.status === action) return old;
  return { ...old, disposition: { status: action, recorded_at: now }, updated_at: now };
}

export function purgeRemoved(workflow, ids, now = new Date().toISOString(), section = 'removed') {
  const next = { ...workflow };
  let count = 0;
  for (const id of new Set(ids)) {
    const progress = workflow[id];
    const eligible = section === 'not_a_fit'
      ? progress?.disposition?.status === 'not_a_fit' || (!progress?.disposition && progress?.stage === 'not_a_fit')
      : ['closed', 'deleted'].includes(progress?.disposition?.status);
    if (!eligible) continue;
    next[id] = recordDisposition(workflow[id], 'purged', now);
    count++;
  }
  return { workflow: next, count };
}

export function archiveSourceExpirations(workflow,leads,now=new Date()){
 let next=workflow;
 for(const lead of leads||[]){const old=next[lead.id];if(!sourceExpired(lead,now.getTime())||old?.disposition||old?.stage==='applied')continue;
  if(next===workflow)next={...workflow};next[lead.id]={...recordDisposition(old,'closed',now.toISOString()),availability_reason:'Source-declared application deadline has passed.',availability_evidence:{status:'closed',checked_at:now.toISOString(),source_url:lead.source_url,site_notice:'Source expiry: '+lead.source_expires_at}};
 }
 return next;
}
