import { readJson } from './store.ts';
import { mergeSnapshot } from './email-import.mjs';
import {overlayPostingEvidence} from './posting-status.mjs';
/** @returns {Promise<{value: import('./types').Snapshot|null}>} */
export async function readSnapshot() {
  const [base,email,validation] = await Promise.all([readJson('leads.json',null),readJson('email-leads.json',null),readJson('posting-status.json',{postings:{}})]);
  return {value:overlayPostingEvidence(mergeSnapshot(base.value,email.value),validation.value)};
}
