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
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});
