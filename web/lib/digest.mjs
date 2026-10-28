import { readJson, writeJson, ConflictError } from './store.ts';
import { readSnapshot } from './snapshot.mjs';
import { deliverStored, sendMail, digestPayload } from './mail.mjs';
import { digestWindow } from './digest-schedule.mjs';

const defaultStore = { read: key => readJson(key, null), write: writeJson, conflict: error => error instanceof ConflictError };

export async function sendDailyDigest({ now = new Date(), apiKey = process.env.RESEND_API_KEY,
  store = defaultStore, snapshotReader = readSnapshot, send = sendMail } = {}) {
  const window = digestWindow(now);
  if (!window.allowed) return { status: 'outside_morning_window', day: window.day };
  if (!apiKey) throw new Error('Daily email sending is not configured.');
  const snapshot = (await snapshotReader()).value;
  if (!snapshot) throw new Error('No collected leads are available.');
  const workflow = (await store.read('workflow.json')).value || {};
  const activeSnapshot = { ...snapshot, leads: snapshot.leads.filter(lead => !workflow[lead.id]?.disposition && workflow[lead.id]?.stage !== 'not_a_fit') };
  const record = await deliverStored(store, 'digest-state.json', 'digest/' + window.day,
    async previous => digestPayload(activeSnapshot, previous?.meta?.cutoff, window.day, now),
    (payload, identity) => send(payload, identity, { apiKey }));
  return { status: 'accepted', day: record.meta.day, count: record.meta.count, accepted_at: record.accepted_at };
}
