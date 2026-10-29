import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {writeJson,readJson} from '../lib/store.ts';
import {claimAttempt,submissionIntent,reviseAttempt,resumeAfterSiteLogin,acquireCycle} from '../lib/automation-state.mjs';
test('manual start acquires a bounded cycle after hours while scheduled start stays idle',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'contract-manual-start-'));const previous=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
  await writeJson('automation-settings.json',{enabled:true});await writeJson('applicant-facts.json',{confirmed:true});
  const now=new Date('2026-10-31T02:00:00Z');
  assert.equal(await acquireCycle(false,{now}),null);
  const claims=await Promise.all([acquireCycle(true,{now}),acquireCycle(true,{now})]);assert.equal(claims.filter(Boolean).length,1);
  const run=(await readJson('automation-run.json',null)).value;assert.equal(run.mode,'manual');assert.equal(run.started_at,now.toISOString());assert.equal(run.manual_expires_at,'2026-10-31T04:00:00.000Z');
  await writeJson('automation-settings.json',{enabled:false});assert.equal(await acquireCycle(true,{now}),null,'manual cannot override paused automation');
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});
test('concurrent workers cannot claim or submit the same attempt twice',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'contract-automation-'));const previous=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
 await writeJson('application-attempts.json',{a:{id:'a',status:'queued'}},null);
 const claimed=await Promise.all([claimAttempt('a'),claimAttempt('a')]);assert.equal(claimed.filter(Boolean).length,1);
 const submissions=await Promise.allSettled([submissionIntent('a','https://example.com/job'),submissionIntent('a','https://example.com/job')]);assert.equal(submissions.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(reviseAttempt('a','cancel'),/reconciliation/);
 assert.equal((await readJson('application-attempts.json',{})).value.a.status,'submitting');
 await writeJson('application-attempts.json',{a:{id:'a',status:'running'},b:{id:'b',status:'running'}});
 const duplicate=await Promise.allSettled([submissionIntent('a','https://example.com/job?utm_source=one'),submissionIntent('b','https://example.com/job?utm_source=two')]);
 assert.equal(duplicate.filter(r=>r.status==='fulfilled').length,1,'distinct board records cannot submit the same resolved application twice');
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});
test('saving a site login resumes authentication-only pauses once, never uncertain submissions',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'contract-login-retry-'));const previous=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
  const before=new Date(Date.now()-10000).toISOString();
  await writeJson('leads.json',{leads:[{id:'a',application_url:'https://www.linkedin.com/jobs/view/123'},{id:'b',application_url:'https://www.linkedin.com/jobs/view/456'},{id:'c',application_url:'https://www.linkedin.com/jobs/view/789'}]});
  await writeJson('application-attempts.json',Object.fromEntries(['a','b','c'].map(id=>[id,{id,lead_id:id,status:'needs_input',reason:id==='c'?'Missing required experience answer':'LinkedIn sign-in required',updated_at:before,...(id==='a'?{visual_step_count:2,visual_steps:[{step:2,action:'pause'}],visual_screenshot_key:'previous.jpg'}:{}),...(id==='b'?{submission_intent_at:before}:{})}])));
  await writeJson('browser-sites.json',{linkedin:{status:'signed_in',checked_at:new Date().toISOString()}});
  assert.equal(await resumeAfterSiteLogin(),1);assert.equal(await resumeAfterSiteLogin(),0);
  const {value}=await readJson('application-attempts.json',{});assert.equal(value.a.status,'queued');assert.equal(value.a.reason,null,'resumed work does not display a stale exception');assert.equal(value.a.visual_step_count,0);assert.deepEqual(value.a.visual_steps,[]);assert.equal(value.a.visual_screenshot_key,null);assert.equal(value.a.prior_visual_runs[0].steps.length,1,'prior visual history remains archived without mixing step numbers');assert.equal(value.b.status,'needs_input');assert.equal(value.c.status,'needs_input');
  assert.equal((await readJson('automation-budget.json',{})).value.charges.length,1);
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});
