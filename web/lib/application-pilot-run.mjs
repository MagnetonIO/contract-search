import {randomUUID} from 'node:crypto';
import {readSnapshot} from './snapshot.mjs';
import {readJson} from './store.ts';
import {automationSettings,reserve,mutate,AutomationInputError} from './automation-state.mjs';
import {applicationIdentity,screenGate} from './automation-policy.mjs';
import {sourceLimitReached} from './application-pilot.mjs';
import {supportedApplication} from './application-recovery.mjs';
export async function prepareTargetedPilot(leadIds){
 if(!Array.isArray(leadIds)||!leadIds.length||leadIds.length>12||new Set(leadIds).size!==leadIds.length)throw new AutomationInputError('Select one to twelve distinct existing opportunities.');
 const state=await automationSettings();if(!state.facts?.confirmed||!state.resume_hash||!state.connections.browser||!state.connections.ai)throw new AutomationInputError('Applicant facts, résumé, browser and AI must be connected.');
 const snapshot=(await readSnapshot()).value,workflow=(await readJson('workflow.json',{})).value,byId=new Map(snapshot.leads.map(l=>[l.id,l])),counts={},selected=[],deferred=[];
 for(const id of leadIds){
  const lead=byId.get(id),target=lead?.application_url||lead?.source_url;
  if(!lead||!supportedApplication(target)||state.screens[id]?.status!=='eligible'||screenGate(lead,lead.description||'Previously screened opportunity; the browser will recheck the live posting.',workflow[id],state.policy))throw new AutomationInputError('Pilot selection must contain eligible opportunities on the four supported application flows.');
  const identity=applicationIdentity(lead),host=new URL(target).hostname,site=['linkedin.com','indeed.com','greenhouse.io','dice.com'].find(h=>host===h||host.endsWith('.'+h));
  counts[site]=(counts[site]||0)+1;if(counts[site]>3)throw new AutomationInputError('Select at most three jobs per application platform for this pilot.');
  if(Object.values(state.attempts).some(a=>(a.target_identity===identity||a.lead_id===id)&&(a.submission_intent_at||['queued','running','submitting'].includes(a.status)||a.verification?.state==='active')))throw new AutomationInputError('A selected job already has a submission or active attempt; reconcile it first.');
  if(sourceLimitReached(lead.source,state.attempts,state.policy)){deferred.push({lead_id:id,reason:'Daily source submission limit reached.'});continue;}
  selected.push({lead,identity});
 }
 const authorized=new Date().toISOString(),expires=new Date(Date.now()+2*3600000).toISOString(),ids=[];
 for(const {lead,identity} of selected){
  const id=randomUUID();await reserve(id,2.5,true);
  await mutate('application-attempts.json',old=>({...old,[id]:{id,lead_id:lead.id,title:lead.title,source:lead.source,application_url:lead.application_url||lead.source_url,target_identity:identity,status:'queued',profile_version:state.facts.version,resume_hash:state.resume_hash,cost_reservation_id:id,created_at:authorized,updated_at:authorized,manual_authorized_at:authorized,manual_expires_at:expires,repair_pilot:true,...(/(^|\.)indeed\.com$/.test(new URL(lead.application_url||lead.source_url).hostname)?{browser_proxy_country:'US'}:{})}}));ids.push(id);
 }
 return {attempt_ids:ids,deferred};
}
