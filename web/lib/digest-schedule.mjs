import { createHash, timingSafeEqual } from 'node:crypto';

// UTC cron slots cover both Chicago offsets. Never turn a delayed trigger into
// an afternoon email; the next morning retains the last accepted cutoff.
export function digestWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, allowed: minute >= 9 * 60 + 17 && minute < 11 * 60 };
}

export function cronAuthorized(header, secret) {
  if (!secret || secret.length < 32 || !header) return false;
  const hash = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(header), hash('Bearer ' + secret));
}
