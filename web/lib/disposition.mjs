export function recordDisposition(current, action, now = new Date().toISOString()) {
  const old = current || { stage: 'new', notes: '', updated_at: now };
  if (action === 'restore') {
    const { disposition, ...rest } = old;
    return disposition ? { ...rest, updated_at: now } : old;
  }
  if (old.disposition?.status === action) return old;
  return { ...old, disposition: { status: action, recorded_at: now }, updated_at: now };
}

export function purgeRemoved(workflow, ids, now = new Date().toISOString()) {
  const next = { ...workflow };
  let count = 0;
  for (const id of new Set(ids)) {
    if (!['closed', 'deleted'].includes(workflow[id]?.disposition?.status)) continue;
    next[id] = recordDisposition(workflow[id], 'purged', now);
    count++;
  }
  return { workflow: next, count };
}
