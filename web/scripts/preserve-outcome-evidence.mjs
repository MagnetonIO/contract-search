// Preserve existing evidence honestly; never reconstruct an unobserved outcome.
// Set the existing private store credentials in the environment. No keys printed.
import {readJson,readBytes,writeBytes} from '../lib/store.ts';
import {mutate} from '../lib/automation-state.mjs';
import {OUTCOME_STATUSES,outcomeRecord} from '../lib/outcome-evidence.mjs';
const {value:attempts}=await readJson('application-attempts.json',{});
const candidates=Object.values(attempts).filter(a=>OUTCOME_STATUSES.includes(a.status)&&!a.outcome_history?.length);
if(!process.argv.includes('--apply'))console.log(JSON.stringify({eligible_records:candidates.length,mode:'preview'}));
else{
 let saved=0,images=0;
 for(const a of candidates){
  const evidence={basis:'legacy_worker_record',preserved_at:new Date().toISOString(),evidence_gap:'Historical outcome: only the saved worker record and actions are available; no final page evidence was retained.'};
  const record=outcomeRecord(a,{evidence},a.updated_at||a.created_at||null);
  if(a.visual_screenshot_key&&a.visual_screenshot_at){
   const original=await readBytes(a.visual_screenshot_key);
   if(original){const key='applications/'+a.id+'/evidence/'+record.id+'.jpg';await writeBytes(key,original.value,'image/jpeg',null);Object.assign(record,{screenshot_key:key,screenshot_at:a.visual_screenshot_at,screenshot_kind:'last_observation',observed_at:a.visual_screenshot_at,evidence_gap:'This is the last recorded page before the outcome, preserved from existing evidence. It is not a final employer confirmation.'});}
  }
  let applied=false;
  await mutate('application-attempts.json',old=>{applied=false;const current=old[a.id];if(current?.status!==a.status||current.updated_at!==a.updated_at||current.outcome_history?.length)return old;applied=true;return {...old,[a.id]:{...current,outcome_history:[record]}};});
  if(applied){saved++;if(record.screenshot_key)images++;}
 }
 console.log(JSON.stringify({preserved_records:saved,preserved_prior_observations:images}));
}
