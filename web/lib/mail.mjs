import { safeWebUrl, formatPay } from './shared.mjs';

export const MAIL_FROM = 'Matthew Long <mlong@magneton.io>';
export const MAIL_REPLY_TO = 'mlong@magneton.io';
export const DIGEST_TO = 'mlong@magneton.io';
export const DASHBOARD_URL = 'https://contract-search-alpha.vercel.app';
export class MailError extends Error {}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const textHtml = text => '<div style="font:15px/1.6 system-ui;white-space:pre-wrap">'+escapeHtml(text)+'</div>';

export async function sendMail(payload, idempotencyKey, { apiKey = process.env.RESEND_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new MailError('Connect Resend before sending email.');
  let response;
  try {
    response = await fetchImpl('https://api.resend.com/emails', { method: 'POST', redirect: 'error',
      headers: { Authorization: 'Bearer '+apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, 'User-Agent':'ContractDesk/1.0' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) });
  } catch { throw new MailError('Delivery could not be confirmed. Retry this same message; check Resend before creating a replacement.'); }
  if (!response.ok) throw new MailError('Resend did not confirm this send (HTTP '+response.status+'). Retry the same message after checking your key, domain, or sending limit.');
  let receipt;
  try { receipt = await response.json(); } catch { /* Treat missing receipt as uncertain. */ }
  if (typeof receipt?.id !== 'string' || !receipt.id) throw new MailError('Resend returned no receipt. Check Resend before creating a replacement.');
  return receipt.id;
}

// Persist the exact payload before sending. Provider deduplication protects concurrent
// requests and lost responses for 24 hours; stop retries before that window expires.
export async function deliverStored(store, key, identity, create, send, now = () => new Date()) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await store.read(key);
    let record = current.value;
    if (!record || record.identity !== identity) {
      if (record && record.status !== 'accepted') throw new MailError('An earlier delivery is unresolved. Reconcile its Resend receipt before starting the next email.');
      const fresh = await create(record);
      record = { ...fresh, identity, status: 'prepared', prepared_at: now().toISOString() };
      try { await store.write(key, record, current.version); } catch (error) { if (store.conflict(error)) continue; throw error; }
      continue;
    }
    if (record.status === 'accepted') return record;
    if (record.first_attempt_at && now().getTime()-Date.parse(record.first_attempt_at) >= 23*3600000) throw new MailError('The safe retry window expired. Check Resend for a receipt before retrying; automatic resend is paused.');
    if (!record.first_attempt_at) {
      record = { ...record, first_attempt_at: now().toISOString() };
      try { await store.write(key, record, current.version); } catch (error) { if (store.conflict(error)) continue; throw error; }
      continue;
    }
    const providerId = await send(record.payload, 'contract-desk/'+identity);
    const accepted = { ...record, status: 'accepted', provider_id: providerId, accepted_at: now().toISOString() };
    try { await store.write(key, accepted, current.version); return accepted; }
    catch (error) { if (!store.conflict(error)) throw error; }
  }
  throw new MailError('Email state changed in another session. Retry the same message.');
}

export function digestPayload(snapshot, previousCutoff, day, now = new Date()) {
  const cutoff = snapshot.collected_at;
  if (!Number.isFinite(Date.parse(cutoff))) throw new MailError('The collection timestamp is invalid.');
  const since = previousCutoff || new Date(now.getTime()-86400000).toISOString();
  const rows = snapshot.leads.filter(lead => lead.pipeline === 'contract' && Date.parse(lead.first_seen) > Date.parse(since) && Date.parse(lead.first_seen) <= Date.parse(cutoff));
  rows.sort((a,b) => b.review_score-a.review_score);
  const failures = snapshot.summary.source_coverage.filter(source => source.status === 'failed');
  const pending = snapshot.summary.source_coverage.filter(source => source.status === 'not configured');
  const stale = now.getTime()-Date.parse(cutoff) > 26*3600000;
  const heading = `${rows.length} new contract candidate${rows.length===1?'':'s'} — ${day}`;
  const lines = [heading, '', `Collected: ${cutoff}`, `New since: ${since}`, 'Rates, C2C eligibility, location restrictions, and client identity still require confirmation.'];
  if (stale) lines.push('Collection is over 26 hours old. The daily collector may need attention.');
  if (!rows.length) lines.push('No new contract candidates in this digest window.');
  if (rows.length < snapshot.summary.target) lines.push(`Below the target of ${snapshot.summary.target}; no older leads added to fill the count.`);
  for (const lead of rows.slice(0,50)) {
    const link = DASHBOARD_URL+'/?lead='+encodeURIComponent(lead.id);
    lines.push('', `${lead.title} — ${lead.company_agency}`, `${formatPay(lead.pay)} | ${lead.remote_location} | C2C: ${lead.c2c_status}`, link);
    if (safeWebUrl(lead.source_url)) lines.push('Posting: '+safeWebUrl(lead.source_url));
  }
  if (rows.length > 50) lines.push('', `${rows.length-50} more candidates are available in your dashboard.`);
  if (failures.length) lines.push('', 'Source failures: '+failures.map(source=>source.source).join(', '));
  if (pending.length) lines.push('Sources awaiting setup: '+pending.map(source=>source.source).join(', '));
  lines.push('', 'Open Contract Desk: '+DASHBOARD_URL, 'This digest contains individual contract candidates. Procurement notices and secondary roles are separate dashboard views.');
  const text = lines.join('\n');
  return { payload: { from: MAIL_FROM, to: [DIGEST_TO], reply_to: MAIL_REPLY_TO, subject: '[Contract Desk] '+heading, text, html: textHtml(text) },
    meta: { day, count: rows.length, cutoff: Date.parse(cutoff)>Date.parse(since)?cutoff:since } };
}
