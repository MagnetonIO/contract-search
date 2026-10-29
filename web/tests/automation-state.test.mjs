import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {writeJson,readJson} from '../lib/store.ts';
import {claimAttempt,submissionIntent,reviseAttempt} from '../lib/automation-state.mjs';
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
