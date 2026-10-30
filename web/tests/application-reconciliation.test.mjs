import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {applicationReceipt,diceApplicationReceipt} from '../lib/application-controls.mjs';
import {reconcileSavedReceipts} from '../lib/application-reconciliation.mjs';
import {readJson,writeJson} from '../lib/store.ts';
const notice='Hooray! Your application is on its way! You can find the job listing for this role in your Applied Jobs.';
const target='https://www.dice.com/job-detail/job-123',url='https://www.dice.com/job-applications/job-123/wizard/success';
test('Dice confirmation requires its success URL, matching target job and both success statements',()=>{
 assert.equal(applicationReceipt(notice),null,'generic job text is not a receipt');assert.equal(applicationReceipt(notice,{url,target}),'Your application is on its way');
 for(const context of [{url:url.replace('job-123','different-job'),target},{url:url.replace('/success',''),target},{url:url.replace('www.dice.com','dice.com.evil.example'),target}])assert.equal(diceApplicationReceipt(notice,context),null);
 assert.equal(diceApplicationReceipt('Your application is on its way',{url,target}),null);
});
test('concurrent reconciliation records one confirmed application from existing immutable evidence without opening a browser',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'contract-receipt-')),previous=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
  await writeJson('leads.json',{leads:[{id:'lead',source_url:target,title:'Fixture job'}]});await writeJson('application-attempts.json',{a:{id:'a',lead_id:'lead',title:'Fixture job',status:'submission_unknown',reason:'Unrecognized confirmation',submission_intent_at:'2026-10-30T16:27:11Z',outcome_history:[{id:'proof',status:'submission_unknown',reason:'Unrecognized confirmation',recorded_at:'2026-10-30T16:27:27Z',observed_at:'2026-10-30T16:27:27Z',observed_url:url,source_url:target,page_excerpt:notice,screenshot_key:'applications/a/evidence/proof.jpg'}]},bad:{id:'bad',lead_id:'lead',status:'submission_unknown',submission_intent_at:'2026-10-30T16:27:11Z',outcome_history:[{id:'bad-proof',observed_at:'2026-10-30T16:27:27Z',observed_url:url.replace('job-123','wrong'),page_excerpt:notice,screenshot_key:'other.jpg'}]}});
  await Promise.all([reconcileSavedReceipts(),reconcileSavedReceipts()]);const attempts=(await readJson('application-attempts.json',{})).value,workflow=(await readJson('workflow.json',{})).value;
  assert.equal(attempts.a.status,'submitted');assert.equal(attempts.a.confirmed_at,'2026-10-30T16:27:27Z');assert.equal(attempts.a.outcome_history.filter(e=>e.status==='submitted').length,1);assert.ok(attempts.a.outcome_history.find(e=>e.id==='proof').resolution);assert.equal(workflow.lead.stage,'applied');assert.equal(workflow.lead.events.length,1);assert.equal(workflow.lead.events[0].evidence,'browser_confirmed');assert.equal(attempts.bad.status,'submission_unknown');assert.equal((await reconcileSavedReceipts()).length,0);assert.equal((await readJson('automation-activity.json',[])).value.length,1);
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});
