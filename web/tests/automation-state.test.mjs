import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {writeJson,readJson} from '../lib/store.ts';
import {claimAttempt,submissionIntent,reviseAttempt,resumeAfterSiteLogin} from '../lib/automation-state.mjs';
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
  await writeJson('application-attempts.json',Object.fromEntries(['a','b','c'].map(id=>[id,{id,lead_id:id,status:'needs_input',reason:id==='c'?'Missing required experience answer':'LinkedIn sign-in required',updated_at:before,...(id==='b'?{submission_intent_at:before}:{})}])));
  await writeJson('browser-sites.json',{linkedin:{status:'signed_in',checked_at:new Date().toISOString()}});
  assert.equal(await resumeAfterSiteLogin(),1);assert.equal(await resumeAfterSiteLogin(),0);
  const {value}=await readJson('application-attempts.json',{});assert.equal(value.a.status,'queued');assert.equal(value.a.reason,null,'resumed work does not display a stale exception');assert.equal(value.b.status,'needs_input');assert.equal(value.c.status,'needs_input');
  assert.equal((await readJson('automation-budget.json',{})).value.charges.length,1);
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});
