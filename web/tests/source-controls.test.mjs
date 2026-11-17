import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readJson,writeJson} from '../lib/store.ts';
import * as state from '../lib/automation-state.mjs';
import {screenGate} from '../lib/automation-policy.mjs';
import {readSnapshot} from '../lib/snapshot.mjs';

test('disabled automation blocks both its discovery source and its application destination',()=>{
 const policy={disabled_sources:['Dice','Greenhouse'],minimum_hourly_usd:97};
 assert.match(screenGate({source:'Dice',pipeline:'contract',source_url:'https://example.com/job'},'contract',{},policy)||'',/disabled/i);
 assert.match(screenGate({source:'LinkedIn',application_url:'https://www.dice.com/job-detail/123',pipeline:'contract',source_url:'https://example.com/job'},'contract',{},policy)||'',/disabled/i);
 assert.match(screenGate({source:'Employer ATS discovery',application_url:'https://job-boards.greenhouse.io/example/jobs/123',pipeline:'contract',source_url:'https://example.com/job'},'contract',{},policy)||'',/disabled/i);
 assert.equal(screenGate({source:'Indeed',application_url:'https://indeed.com/viewjob?jk=123',pipeline:'contract',source_url:'https://example.com/job',pay:'$112/hr'},'Remote software contract',{},policy),null);
});

test('source controls persist, stop queued work, reject retries before reserving money, and preserve receipts',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'contract-sources-')),previous=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
  await writeJson('automation-settings.json',{enabled:true,daily_limit:100,dice_daily_limit:20,disabled_sources:[]});
  await writeJson('leads.json',{leads:[{id:'open',source:'Dice',pipeline:'contract',source_url:'https://example.com/job'},{id:'applied',source:'Dice',pipeline:'contract',source_url:'https://example.com/job'},{id:'other',source:'LinkedIn',pipeline:'contract',source_url:'https://example.com/job'}]});
  await writeJson('workflow.json',{applied:{stage:'applied',notes:'retain me'}});
  await writeJson('application-attempts.json',{queued:{id:'queued',source:'Dice',status:'queued'},retry:{id:'retry',source:'Dice',status:'failed'},receipt:{id:'receipt',source:'Dice',status:'submitted',receipt:'Your application is on its way'},uncertain:{id:'uncertain',source:'Dice',status:'submission_unknown',submission_intent_at:'2026-11-17T14:00:00Z'},other:{id:'other',source:'LinkedIn',status:'queued'}});
  assert.equal(typeof state.setSourceEnabled,'function','source controls are available');
  await state.setSourceEnabled('Dice',false,{removeOpen:true});
  const policy=(await readJson('automation-settings.json',{})).value;
  assert.equal(policy.enabled,true);assert.deepEqual(policy.disabled_sources,['Dice']);
  assert.equal(policy.dice_daily_limit,0,'already deployed workers also obey the existing Dice capacity gate');
  assert.equal((await readJson('workflow.json',{})).value.open?.disposition?.status,'purged','existing workers also see the removal through the opportunity guard');
  const attempts=(await readJson('application-attempts.json',{})).value;
  assert.equal(attempts.queued.status,'cancelled');assert.equal(attempts.other.status,'queued');assert.equal(attempts.receipt.receipt,'Your application is on its way');assert.equal(attempts.uncertain.submission_intent_at,'2026-11-17T14:00:00Z');
  await assert.rejects(state.reviseAttempt('retry','resume'),/disabled/i);
  assert.equal((await readJson('automation-budget.json',null)).value,null,'blocked retries reserve no allowance');
  assert.deepEqual((await readSnapshot()).value.leads.map(l=>l.id),['applied','other'],'removed source stays hidden while submitted history survives');
  await writeJson('leads.json',{leads:[{id:'new',source:'Dice',pipeline:'contract',source_url:'https://example.com/job'},{id:'applied',source:'Dice',pipeline:'contract',source_url:'https://example.com/job'},{id:'other',source:'LinkedIn',pipeline:'contract',source_url:'https://example.com/job'}]});
  assert.deepEqual((await readSnapshot()).value.leads.map(l=>l.id),['applied','other'],'a later scan cannot restore removed source jobs');
  await state.setSourceEnabled('Dice',true);const restored=(await readJson('automation-settings.json',{})).value;assert.deepEqual(restored.disabled_sources,[]);assert.equal(restored.dice_daily_limit,20,'enabling restores the previous daily cap');
  await assert.rejects(state.setSourceEnabled('Dice','false'),/valid|boolean/i);
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});

test('disabled destination cannot claim a final submission intent',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'contract-source-submit-')),previous=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
  await writeJson('automation-settings.json',{daily_limit:100,disabled_sources:['Dice']});
  await writeJson('application-attempts.json',{one:{id:'one',source:'LinkedIn',status:'running'}});
  await assert.rejects(state.submissionIntent('one','https://www.dice.com/job-applications/123'),/disabled/i);
  assert.equal((await readJson('application-attempts.json',{})).value.one.submission_intent_at,undefined);
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});
