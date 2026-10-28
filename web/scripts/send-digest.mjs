import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { localDir } from '../lib/store.ts';
import { sendDailyDigest } from '../lib/digest.mjs';

// Production runs use the private Blob store; local runs use the same local
// workspace as the dashboard. No login cookie is needed by the scheduled worker.
const now = new Date();
let apiKey = process.env.RESEND_API_KEY;
if (!apiKey && !process.env.VERCEL) {
  try { apiKey = JSON.parse(await readFile(path.join(localDir(),'mail.json'),'utf8')).apiKey; } catch {}
}
const result = await sendDailyDigest({ now, apiKey });
console.log(JSON.stringify(result));
