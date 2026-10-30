import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {outcomeRecord,attemptOutcomes,outcomeLog,evidenceUrl,evidenceText,screenshotKey,preserveScreeningHistory} from '../lib/outcome-evidence.mjs';
import {captureOutcome} from '../lib/capture-outcome.mjs';
import {patchAttempt,reviseAttempt} from '../lib/automation-state.mjs';
import {readJson,readBytes,writeBytes,writeJson} from '../lib/store.ts';

test('legacy outcomes report missing evidence and do not reuse a mutable screenshot as proof',()=>{
 const a={status:'submission_unknown',reason:'Result uncertain',updated_at:'2026-10-30T15:00:00Z',visual_screenshot_key:'latest.jpg',submission_intent_at:'2026-10-30T14:59:00Z'};
 const [e]=attemptOutcomes(a);assert.equal(e.category,'unconfirmed');assert.equal(e.recorded_at,a.updated_at);assert.equal(e.screenshot_key,null);assert.match(e.evidence_gap,/not retained/);assert.equal(e.confirmed_at,null);
 assert.equal(outcomeRecord({status:'failed',reason:'Page check timed out'}).category,'failed');
 assert.equal(outcomeRecord({status:'skipped',reason:'Posting explicitly reports applications are closed.'}).category,'closed');
});
test('audit separates observed closure, user decision and model screening evidence',()=>{
 const log=outcomeLog([{id:'a',title:'Engineer',source_url:'https://www.dice.com/job-detail/a?token=secret'}],{a:{disposition:{status:'closed',recorded_at:'2026-10-30T15:00:00Z'}}},{a:{status:'skipped',score:25,reason:'Low fit',screened_at:'2026-10-30T14:00:00Z',evidence:[{requirement:'Python',resume_fact:'Python systems'}]}},{},{a:{status:'unknown',http_status:403}});
 const closure=log.find(e=>e.category==='closed'),skip=log.find(e=>e.category==='skipped');assert.equal(closure.basis,'user_record');assert.equal(closure.http_status,undefined,'403 cannot prove closure');assert.equal(skip.basis,'model_evaluation');assert.equal(skip.fit_evidence.length,1);assert.ok(!closure.source_url.includes('token'));
 const observed=outcomeLog([],{a:{disposition:{status:'closed',recorded_at:'now'}}},{},{},{a:{status:'closed',http_status:410,checked_at:'then'}})[0];assert.equal(observed.basis,'public_posting_check');assert.equal(observed.http_status,410);assert.equal(observed.observed_at,'then');
});
test('evidence strips credentials and OAuth query data but retains public job identifiers',()=>{
 assert.equal(evidenceUrl('https://www.indeed.com/viewjob?jk=abc&token=secret#fragment'),'https://www.indeed.com/viewjob?jk=abc');assert.equal(evidenceUrl('https://user:secret@example.com'),null);
 const safe=evidenceText('Error https://example.com/callback?code=secret&state=private token=secret password=private Bearer key.secret');assert.ok(!safe.includes('secret'));assert.ok(!safe.includes('private'));
});
test('outcome capture omits authentication pages and preserves immutable screenshots through resume',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'contract-evidence-')),previous=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
  let shots=0;const page={url:()=> 'https://www.linkedin.com/jobs/view/123',locator:selector=>selector==='body'?{innerText:async()=> 'Required question: Dialogflow experience in years'}:{filter:()=>({count:async()=>0})},screenshot:async()=>{shots++;return Buffer.from('original');}};
  const auth=await captureOutcome({...page,url:()=> 'https://www.linkedin.com/authwall'},'a',{allowed:()=>true});assert.match(auth.evidence_gap,/Login/);assert.equal(shots,0);assert.equal(auth.page_excerpt,undefined);
  const first=await captureOutcome(page,'a',{allowed:()=>true,reason:'Missing required answer'});assert.equal(shots,1);assert.match(first.page_excerpt,/Dialogflow/);
  await writeJson('application-attempts.json',{a:{id:'a',status:'running',profile_version:'facts1',resume_hash:'pdf1'}});
  await patchAttempt('a',{status:'needs_input',reason:'Missing Dialogflow years',evidence:first});
  let a=(await readJson('application-attempts.json',{})).value.a;assert.equal(a.outcome_history.length,1);assert.equal(screenshotKey(a,first.id),first.screenshot_key);assert.equal(screenshotKey(a,'../arbitrary'),null);
  await reviseAttempt('a','resume');await writeBytes('applications/a/visual-latest.jpg',Buffer.from('different'),'image/jpeg');await patchAttempt('a',{status:'failed',reason:'Browser disconnected',failure_type:'TimeoutError'});
  a=(await readJson('application-attempts.json',{})).value.a;assert.equal(a.outcome_history.length,2);assert.equal((await readBytes(first.screenshot_key)).value.toString(),'original');assert.equal(a.outcome_history[0].profile_version,'facts1');assert.equal(a.outcome_history[1].error_type,'TimeoutError');
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});

test('rescreening retains prior skipped evidence without duplicating unchanged decisions',()=>{
 const prior={a:{status:'skipped',reason:'Rate below minimum',version:'v1',score:0,rule_inputs:{pay:'$70/hr'},screened_at:'2026-10-29T15:00:00Z'}};
 const changed=preserveScreeningHistory(prior,{a:{status:'eligible',reason:'Updated posting',version:'v2',score:95}},'2026-10-30T15:00:00Z');
 assert.equal(changed.a.prior_skips.length,1);assert.equal(changed.a.prior_skips[0].rule_inputs.pay,'$70/hr');
 const repeat=preserveScreeningHistory(changed,structuredClone(changed));assert.equal(repeat.a.prior_skips.length,1);
 const log=outcomeLog([],{},repeat,{});assert.equal(log.length,1);assert.equal(log[0].reason,'Rate below minimum');assert.equal(log[0].recorded_at,'2026-10-29T15:00:00Z');
});

test('a worker from an earlier deployment cannot hide a newer terminal outcome behind old history',()=>{
 const old=outcomeRecord({status:'failed',reason:'Old error'}, {}, '2026-10-29T15:00:00Z');
 const records=attemptOutcomes({status:'needs_input',reason:'New required question',updated_at:'2026-10-30T15:00:00Z',outcome_history:[old]});assert.equal(records.length,2);assert.equal(records[0].reason,'Old error');assert.equal(records[1].reason,'New required question');assert.match(records[1].evidence_gap,/not retained/);
});
