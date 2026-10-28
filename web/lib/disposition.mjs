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
