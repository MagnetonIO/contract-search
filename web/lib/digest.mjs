import { readJson, writeJson, ConflictError } from './store.ts';
import { readSnapshot } from './snapshot.mjs';
import { deliverStored, sendMail, digestPayload } from './mail.mjs';
import { collectionHealth } from './collection-status.mjs';
import { digestWindow } from './digest-schedule.mjs';

const defaultStore = { read: key => readJson(key, null), write: writeJson, conflict: error => error instanceof ConflictError };

export async function sendDailyDigest({ now = new Date(), apiKey = process.env.RESEND_API_KEY,
  store = defaultStore, snapshotReader = readSnapshot, send = sendMail } = {}) {
  const window = digestWindow(now);
  if (!window.allowed) return { status: 'outside_morning_window', day: window.day };
  if (!apiKey) throw new Error('Daily email sending is not configured.');
  const snapshot = (await snapshotReader()).value;
  if (!snapshot) throw new Error('No collected leads are available.');
  const expected = collectionHealth(snapshot, null, now).expected_at;
  const collectionPending = Date.parse(snapshot.collected_at) < Date.parse(expected);
  const previous = (await store.read('digest-state.json')).value;
  const localHour = Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',hourCycle:'h23'}).format(now));
  if (collectionPending && localHour < 10) return {status:'awaiting_collection',day:window.day,last_collected_at:snapshot.collected_at};
  const recovery = !collectionPending && previous?.meta?.day === window.day && (previous.meta.collection_pending || Date.parse(previous.meta.cutoff) < Date.parse(expected));
  const identity = recovery || previous?.identity === 'digest/'+window.day+'/recovery' ? 'digest/'+window.day+'/recovery' : 'digest/'+window.day;
  const workflow = (await store.read('workflow.json')).value || {};
  const attempts=(await store.read('application-attempts.json')).value||{};
  const screens=(await store.read('screenings.json')).value||{};
  const since=Date.parse(previous?.meta?.automation_cutoff)||now.getTime()-86400000;
  const outcomes=Object.values(attempts).filter(item=>Date.parse(item.updated_at)>since&&['submitted','needs_input','submission_unknown','failed','skipped'].includes(item.status));
  const counts={submitted:0,skipped:0,failed:0,needs_input:0};
  for(const item of outcomes)counts[item.status==='submission_unknown'?'needs_input':item.status]++;
  counts.skipped+=Object.values(screens).filter(item=>item.status==='skipped'&&Date.parse(item.screened_at)>since).length;
  const activeSnapshot = { ...snapshot, automation_results:{counts,outcomes:outcomes.slice(-10)}, leads: snapshot.leads.filter(lead => !workflow[lead.id]?.disposition && workflow[lead.id]?.stage !== 'not_a_fit') };
  const record = await deliverStored(store, 'digest-state.json', identity,
    async previous => {
      const draft = digestPayload(activeSnapshot, previous?.meta?.cutoff, window.day, now);
      draft.meta.collection_pending = collectionPending;
      draft.meta.collection_at = snapshot.collected_at;
      draft.meta.automation_cutoff = now.toISOString();
      return draft;
    },
    (payload, identity) => send(payload, identity, { apiKey }));
  return { status: 'accepted', day: record.meta.day, count: record.meta.count, accepted_at: record.accepted_at };
}
