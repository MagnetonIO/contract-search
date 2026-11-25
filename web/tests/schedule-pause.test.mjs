import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulePause} from '../lib/schedule-pause.mjs';
import {applicationWindow,applicationRunAllowed} from '../lib/automation-policy.mjs';
import {collectorWindow,ensureCollection} from '../lib/collector-scheduler.mjs';
import {digestWindow} from '../lib/digest-schedule.mjs';
import {sendDailyDigest} from '../lib/digest.mjs';
import {applicationReportWindow,sendDailyApplicationReport} from '../lib/application-report.mjs';
import {collectionHealth} from '../lib/collection-status.mjs';
import {acquireCycle,submissionIntent} from '../lib/automation-state.mjs';
const holiday=new Date('2026-11-26T15:30:00Z');
const forbidden=()=>{throw Error('Paused day must not access state, providers or email');};
test('Thanksgiving pause spans exactly the Chicago local day and expires automatically',()=>{
 assert.equal(schedulePause(new Date('2026-11-26T05:59:59Z')),null);
 assert.deepEqual(schedulePause(new Date('2026-11-26T06:00:00Z')),{status:'scheduled_pause',day:'2026-11-26',reason:'Thanksgiving'});
 assert.equal(schedulePause(new Date('2026-11-27T05:59:59Z')).reason,'Thanksgiving');
 assert.equal(schedulePause(new Date('2026-11-27T06:00:00Z')),null);
});
test('paused collection and emails return before any data reads, dispatches or sends',async()=>{
 const options={now:holiday,store:{read:forbidden,write:forbidden},fetchImpl:forbidden,snapshotReader:forbidden,load:forbidden,send:forbidden};
 for(const manual of [false,true])assert.equal((await ensureCollection({...options,manual})).status,'scheduled_pause');
 assert.equal((await sendDailyDigest(options)).status,'scheduled_pause');
 for(const mode of ['daily','so-far'])assert.equal((await sendDailyApplicationReport({...options,mode})).status,'scheduled_pause');
});
test('scheduled/manual application work and final submission intents cannot bypass the pause',async()=>{
 assert.equal(applicationWindow(holiday),false);
 const run={active:true,mode:'manual',started_at:'2026-11-26T15:00:00Z',manual_expires_at:'2026-11-26T17:00:00Z'};
 assert.equal(applicationRunAllowed({run},holiday),false);
 for(const manual of [false,true])assert.equal(await acquireCycle(manual,{now:holiday}),null);
 await assert.rejects(submissionIntent('not-read','https://example.com/apply',{now:holiday}),/Thanksgiving/);
});
test('Friday resumes ordinary windows and collection health skips the holiday slot',()=>{
 const friday=new Date('2026-11-27T15:30:00Z');
 assert.equal(applicationWindow(friday),true);assert.equal(collectorWindow(friday),true);assert.equal(digestWindow(friday).allowed,true);
 assert.equal(applicationReportWindow(new Date('2026-11-27T21:10:00Z')).allowed,true);
 const health=collectionHealth({collected_at:'2026-11-25T14:15:00Z'},null,holiday);
 assert.equal(health.status,'paused');assert.equal(health.expected_at,'2026-11-25T14:07:00.000Z');assert.equal(health.next_at,'2026-11-27T14:07:00.000Z');
 assert.match(health.title,/Thanksgiving/);
});
