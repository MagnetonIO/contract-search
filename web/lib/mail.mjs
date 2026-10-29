import { collectionHealth } from './collection-status.mjs';
import { safeWebUrl, formatPay } from './shared.mjs';

export const MAIL_FROM = 'Matthew Long <mlong@magneton.io>';
export const MAIL_REPLY_TO = 'mlong@magneton.io';
export const DIGEST_TO = 'mlong@magneton.io';
export const DASHBOARD_URL = 'https://contract-search-alpha.vercel.app';
export class MailError extends Error {}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const textHtml = text => '<div style="font:15px/1.6 system-ui;white-space:pre-wrap">'+escapeHtml(text)+'</div>';

const DIGEST_PREVIEW_LIMIT = 20;
const digestLink = lead => DASHBOARD_URL+'/?lead='+encodeURIComponent(lead.id);
const digestDate = value => new Intl.DateTimeFormat('en-US', {
  timeZone:'America/Chicago', month:'short', day:'numeric', year:'numeric',
  hour:'numeric', minute:'2-digit', timeZoneName:'short',
}).format(new Date(value));
function digestLocation(value) {
  try {
    const locations = JSON.parse(value);
    if (Array.isArray(locations) && locations.every(location => typeof location === 'string')) return locations.join('; ');
  } catch { /* Most sources already provide readable text. */ }
  return value || 'Location not published';
}
function digestHtml(heading, rows, emails, notices, cutoff, since, collectionPending, collectedAt) {
  const link = (url, label) => `<a href="${escapeHtml(url)}" style="color:#175cd3;text-decoration:underline;">${escapeHtml(label)}</a>`;
  const paragraph = text => `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
  const job = (lead, index) => {
    const posting = safeWebUrl(lead.source_url);
    return `<tr><td style="padding:20px 0;border-top:1px solid #d0d5dd;word-break:break-word;">
      <h2 style="font-size:18px;line-height:1.4;margin:0 0 6px;">${index+1}. ${escapeHtml(lead.title)}</h2>
      ${paragraph(lead.company_agency || 'Company not published')}
      <p style="margin:0 0 12px;"><strong>Rate:</strong> ${escapeHtml(formatPay(lead.pay))}<br>
      <strong>Location:</strong> ${escapeHtml(digestLocation(lead.remote_location))}<br>
      <strong>C2C:</strong> ${escapeHtml(lead.c2c_status || 'unknown')}</p>
      <p style="margin:0;">${link(digestLink(lead),'Review opportunity')}${posting?' &nbsp; · &nbsp; '+link(posting,'Original posting'):''}</p>
    </td></tr>`;
  };
  const remaining = rows.length-DIGEST_PREVIEW_LIMIT;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background-color:#f2f4f7;color:#101828;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f7;"><tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#101828;"><tr><td style="padding:24px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:bold;">CONTRACT DESK</p>
        <h1 style="font-size:24px;line-height:1.3;margin:0 0 16px;">${escapeHtml(heading)}</h1>
        ${paragraph(rows.length?`Showing ${Math.min(rows.length,DIGEST_PREVIEW_LIMIT)} candidates, highest review score first.`:(collectionPending?'New job counts are unavailable until the scheduled scan publishes.':'No new contract candidates in this digest window.'))}
        <p style="margin:0 0 20px;">${link(DASHBOARD_URL,`Open Contract Desk${rows.length?' — all '+rows.length+' new candidates':''}`)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.slice(0,DIGEST_PREVIEW_LIMIT).map(job).join('')}</table>
        ${remaining>0?paragraph(`${remaining} more candidates are available in your dashboard.`):''}
        ${emails.length?`<h2 style="font-size:18px;margin:24px 0 12px;">Catalant projects to review: ${emails.length}</h2><ul>${emails.slice(0,25).map(lead=>`<li style="margin-bottom:12px;">${link(digestLink(lead),lead.title)}</li>`).join('')}</ul>${emails.length>25?paragraph(`${emails.length-25} more Catalant projects are available in your dashboard.`):''}`:''}
        <hr style="border:0;border-top:1px solid #d0d5dd;margin:24px 0;">
        <h2 style="font-size:16px;margin:0 0 12px;">Collection notes</h2>
        ${paragraph('Last job scan: '+digestDate(collectedAt))}${paragraph('New since: '+digestDate(since))}
        ${notices.map(paragraph).join('')}
        ${paragraph('Rates, C2C eligibility, location restrictions, and client identity still require confirmation.')}
        <p style="margin:0;">${link(DASHBOARD_URL,'Open Contract Desk')}</p>
      </td></tr></table>
    </td></tr></table>
  </body></html>`;
}

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
  const cutoff = snapshot.digest_cutoff || snapshot.collected_at;
  const collectionPending = Date.parse(snapshot.collected_at) < Date.parse(collectionHealth(snapshot,null,now).expected_at);
  if (!Number.isFinite(Date.parse(cutoff))) throw new MailError('The collection timestamp is invalid.');
  const since = previousCutoff || new Date(now.getTime()-86400000).toISOString();
  const rows = snapshot.leads.filter(lead => lead.pipeline === 'contract' && Date.parse(lead.first_seen) > Date.parse(since) && Date.parse(lead.first_seen) <= Date.parse(cutoff));
  rows.sort((a,b) => b.review_score-a.review_score);
  const failures = snapshot.summary.source_coverage.filter(source => source.status === 'failed');
  const pending = snapshot.summary.source_coverage.filter(source => source.status === 'not configured');
  const stale = now.getTime()-Date.parse(snapshot.collected_at) > 26*3600000;
  const heading = collectionPending ? `Collection delayed — ${day}` : `${rows.length} new contract candidate${rows.length===1?'':'s'} — ${day}`;
  const notices = [];
  if (collectionPending) notices.push('Today’s scheduled job scan has not published. These are saved results, not a completed scan with zero matches. Last job scan: '+digestDate(snapshot.collected_at)+'. Email-import updates do not refresh job-board results.');
  if (stale) notices.push('Collection is over 26 hours old. The daily collector may need attention.');
  if (rows.length < snapshot.summary.target) notices.push(`Below the target of ${snapshot.summary.target}; no older leads added to fill the count.`);
  const lines = [heading, '', `Last job scan: ${digestDate(snapshot.collected_at)}`, `Latest data/import: ${digestDate(cutoff)}`, `New since: ${digestDate(since)}`, 'Rates, C2C eligibility, location restrictions, and client identity still require confirmation.', ...notices];
  if (!rows.length) lines.push((collectionPending?'New job counts are unavailable until the scheduled scan publishes.':'No new contract candidates in this digest window.'));
  if (rows.length) lines.push(`Showing ${Math.min(rows.length,DIGEST_PREVIEW_LIMIT)} candidates, highest review score first.`);
  for (const [index, lead] of rows.slice(0,DIGEST_PREVIEW_LIMIT).entries()) {
    lines.push('', `${index+1}. ${lead.title}`, lead.company_agency || 'Company not published', `Rate: ${formatPay(lead.pay)}`, `Location: ${digestLocation(lead.remote_location)}`, `C2C: ${lead.c2c_status || 'unknown'}`, 'Review: '+digestLink(lead));
    if (safeWebUrl(lead.source_url)) lines.push('Posting: '+safeWebUrl(lead.source_url));
  }
  if (rows.length > DIGEST_PREVIEW_LIMIT) lines.push('', `${rows.length-DIGEST_PREVIEW_LIMIT} more candidates are available in your dashboard.`);
  const emails = snapshot.leads.filter(lead=>lead.pipeline==='email_review' && Date.parse(lead.first_seen)>Date.parse(since) && Date.parse(lead.first_seen)<=Date.parse(cutoff));
  if (emails.length) { lines.push('', `Catalant projects to review: ${emails.length}`); for(const lead of emails.slice(0,25)) lines.push(lead.title, DASHBOARD_URL+'/?lead='+encodeURIComponent(lead.id)); }
  if (failures.length) lines.push('', 'Source failures: '+failures.map(source=>source.source).join(', '));
  if (pending.length) lines.push('Sources awaiting setup: '+pending.map(source=>source.source).join(', '));
  if (failures.length) notices.push('Source failures: '+failures.map(source=>source.source).join(', '));
  if (pending.length) notices.push('Sources awaiting setup: '+pending.map(source=>source.source).join(', '));
  lines.push('', 'Open Contract Desk: '+DASHBOARD_URL, 'This digest contains individual contract candidates. Procurement notices and secondary roles are separate dashboard views.');
  const text = lines.join('\n');
  return { payload: { from: MAIL_FROM, to: [DIGEST_TO], reply_to: MAIL_REPLY_TO, subject: '[Contract Desk] '+heading, text, html: digestHtml(heading, rows, emails, notices, cutoff, since, collectionPending, snapshot.collected_at) },
    meta: { day, count: rows.length, cutoff: Date.parse(cutoff)>Date.parse(since)?cutoff:since } };
}
