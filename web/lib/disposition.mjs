export function recordDisposition(current, action, now = new Date().toISOString()) {
  const old = current || { stage: 'new', notes: '', updated_at: now };
  if (action === 'restore') {
    const { disposition, ...rest } = old;
    return disposition ? { ...rest, updated_at: now } : old;
  }
  if (old.disposition?.status === action) return old;
  return { ...old, disposition: { status: action, recorded_at: now }, updated_at: now };
}
