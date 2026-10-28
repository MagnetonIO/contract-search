import { readJson } from './store.ts';
import { mergeSnapshot } from './email-import.mjs';
/** @returns {Promise<{value: import('./types').Snapshot|null}>} */
export async function readSnapshot() {
  const [base,email] = await Promise.all([readJson('leads.json',null),readJson('email-leads.json',null)]);
  return {value:mergeSnapshot(base.value,email.value)};
}
