import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJson, ConflictError, localDir } from '../lib/store.ts';
import { readSnapshot } from '../lib/snapshot.mjs';
import { deliverStored, sendMail, digestPayload } from '../lib/mail.mjs';

// Production runs use the private Blob store; local runs use the same local
// workspace as the dashboard. No login cookie is needed by the scheduled worker.
const now = new Date();
const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
let apiKey = process.env.RESEND_API_KEY;
if (!apiKey && !process.env.VERCEL) {
  try { apiKey = JSON.parse(await readFile(path.join(localDir(),'mail.json'),'utf8')).apiKey; } catch {}
}
if (!apiKey) throw new Error('RESEND_API_KEY is missing. Run scripts/configure_email.py locally to connect sending.');
const snapshot = (await readSnapshot()).value;
if (!snapshot) throw new Error('No collected leads are available.');
const store = {read:key=>readJson(key,null),write:writeJson,conflict:error=>error instanceof ConflictError};
const record = await deliverStored(store,'digest-state.json','digest/'+day,async previous=>digestPayload(snapshot,previous?.meta?.cutoff,day,now),(payload,identity)=>sendMail(payload,identity,{apiKey}));
console.log(`Digest accepted by Resend: ${record.meta.count} new candidates; ${record.meta.day}; receipt ${record.provider_id}.`);
