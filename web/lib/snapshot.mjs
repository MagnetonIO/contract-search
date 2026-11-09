import {sourceExpired} from './shared.mjs';
import {archiveSourceExpirations} from './disposition.mjs';
import { readJson,writeJson,ConflictError } from './store.ts';
import { mergeSnapshot } from './email-import.mjs';
import {overlayPostingEvidence} from './posting-status.mjs';
/** @returns {Promise<{value: import('./types').Snapshot|null}>} */
export async function readSnapshot() {
  const [base,email,validation] = await Promise.all([readJson('leads.json',null),readJson('email-leads.json',null),readJson('posting-status.json',{postings:{}})]);
  const value=overlayPostingEvidence(mergeSnapshot(base.value,email.value),validation.value);
  if(value?.leads.some(lead=>sourceExpired(lead)))for(let i=0;i<12;i++){
    const old=await readJson('workflow.json',{}),next=archiveSourceExpirations(old.value,value.leads);
    if(next===old.value)break;
    try{await writeJson('workflow.json',next,old.version);break;}catch(error){if(!(error instanceof ConflictError))throw error;}
  }
  return {value};
}
