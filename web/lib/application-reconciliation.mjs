import {readJson} from './store.ts';
import {readSnapshot} from './snapshot.mjs';
import {mutate,activity} from './automation-state.mjs';
import {diceApplicationReceipt} from './application-controls.mjs';
import {outcomeRecord,attemptOutcomes} from './outcome-evidence.mjs';

// No browser navigation or submission. Reconcile only a stored, immutable
// post-click success page whose Dice job ID matches the intended opening.
export async function reconcileSavedReceipts(){
 const {value:attempts}=await readJson('application-attempts.json',{});
 const candidates=Object.values(attempts).filter(a=>a.status==='submission_unknown'||a.reconciled_from_saved_receipt&&!a.reconciliation_synced_at);
 if(!candidates.length)return [];
 const {value:snapshot}=await readSnapshot(),results=[];
 for(const candidate of candidates){
  const lead=snapshot?.leads.find(l=>l.id===candidate.lead_id);if(!lead)continue;
  const target=lead.application_url||lead.source_url;let accepted=null,newlyConfirmed=false;
  if(candidate.status==='submission_unknown'&&!(candidate.outcome_history||[]).some(e=>e.screenshot_key&&e.page_excerpt&&Date.parse(e.observed_at)>=Date.parse(candidate.submission_intent_at)&&diceApplicationReceipt(e.page_excerpt,{url:e.observed_url,target})))continue;
  await mutate('application-attempts.json',old=>{
   accepted=null;newlyConfirmed=false;const a=old[candidate.id];
   if(a?.status==='submitted'&&a.reconciled_from_saved_receipt&&!a.reconciliation_synced_at){accepted=a;return old;}
   if(a?.status!=='submission_unknown'||!a.submission_intent_at)return old;
   const proof=[...(a.outcome_history||[])].reverse().find(e=>e.screenshot_key&&e.page_excerpt&&Date.parse(e.observed_at)>=Date.parse(a.submission_intent_at)&&diceApplicationReceipt(e.page_excerpt,{url:e.observed_url,target}));
   if(!proof)return old;
   const receipt=diceApplicationReceipt(proof.page_excerpt,{url:proof.observed_url,target}),now=new Date().toISOString();
   const next={...a,status:'submitted',reason:null,required_action:null,receipt,confirmed_at:proof.observed_at,confirmation_url:proof.observed_url,reconciled_from_saved_receipt:proof.id,updated_at:now};
   const record=outcomeRecord(next,{evidence:{...proof,id:undefined,site_notice:receipt}},now);
   next.outcome_history=[...attemptOutcomes(a).map(e=>e.id===proof.id?{...e,resolved_at:now,resolution:'Confirmed from the recorded Dice success page.',resolved_by:record.id}:e),record];
   accepted=next;newlyConfirmed=true;return {...old,[a.id]:next};
  });
  if(!accepted)continue;
  const a=accepted;
  await mutate('workflow.json',old=>{const p=old[a.lead_id]||{stage:'new',notes:'',events:[]};if(p.events?.some(e=>e.id===a.id&&e.kind==='submitted'))return old;return {...old,[a.lead_id]:{...p,stage:'applied',updated_at:new Date().toISOString(),application:{...p.application,submission_recorded_at:a.confirmed_at},events:[...(p.events||[]),{id:a.id,kind:'submitted',recorded_at:a.confirmed_at,url:a.confirmation_url,evidence:'browser_confirmed'}]}};});
  await mutate('application-attempts.json',old=>old[a.id]?.status==='submitted'?{...old,[a.id]:{...old[a.id],reconciliation_synced_at:new Date().toISOString()}}:old);
  if(newlyConfirmed)await activity('receipt_reconciled',{attempt_id:a.id,lead_id:a.lead_id,title:a.title,status:'submitted',message:'Dice confirmation verified from the recorded job-specific success page. No application was resubmitted.'});
  results.push({id:a.id,title:a.title,receipt:a.receipt,confirmed_at:a.confirmed_at});
 }
 return results;
}
