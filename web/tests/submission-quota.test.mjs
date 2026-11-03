import test from 'node:test';import assert from 'node:assert/strict';
import {dailySubmissionQuota,reserveBudget} from '../lib/automation-policy.mjs';
const now=new Date('2026-10-30T15:00:00Z'),success=(id,at='2026-10-30T14:00:00Z')=>({id,status:'submitted',receipt:'Application submitted',confirmed_at:at});
test('the default daily quota allows 100 confirmed submissions and stops at the boundary',()=>{
 const attempts=Object.fromEntries(Array.from({length:99},(_,i)=>['success'+i,success('success'+i)]));
 for(let i=0;i<150;i++)attempts['failed'+i]={id:'failed'+i,status:'failed'};
 assert.deepEqual(dailySubmissionQuota(attempts,{},now),{day:'2026-10-30',limit:100,confirmed:99,remaining:1,in_flight:0});
 attempts.last=success('last');assert.equal(dailySubmissionQuota(attempts,undefined,now).remaining,0);
});
test('only confirmed successful applications use the daily quota; failed, closed, skipped and unconfirmed work do not',()=>{
 const attempts={one:success('one'),yesterday:success('yesterday','2026-10-30T04:59:59Z')};
 for(const status of ['failed','skipped','needs_input','queued','running','submitting','submission_unknown'])attempts[status]={id:status,status,created_at:now.toISOString(),submission_intent_at:now.toISOString()};
 const q=dailySubmissionQuota(attempts,{daily_limit:50},now);assert.equal(q.confirmed,1);assert.equal(q.remaining,49);assert.equal(q.limit,50);
 assert.equal(dailySubmissionQuota({...attempts,noReceipt:{id:'noReceipt',status:'submitted',confirmed_at:now.toISOString()}},{daily_limit:50},now).confirmed,1);
});
test('Chicago days and duplicate receipt identities produce one accurate count',()=>{
 const attempts={a:{...success('a'),target_identity:'same'},b:{...success('b'),target_identity:'same'},midnight:success('midnight','2026-10-30T05:00:00Z')};
 assert.equal(dailySubmissionQuota(attempts,{daily_limit:50},now).confirmed,2);
});
test('money reservations and legacy failed-attempt counters cannot consume successful-submission quota',()=>{
 let ledger={month:'2026-10',charges:[],submissions:Array.from({length:50},(_,i)=>({id:'old'+i,day:'2026-10-30'}))};
 ledger=reserveBudget(ledger,{id:'new',usd:0.1,submit:true},now);
 assert.equal(ledger.charges.length,1);assert.equal(ledger.submissions,undefined);assert.equal(ledger.legacy_attempt_reservations.length,50);
 assert.throws(()=>reserveBudget(ledger,{id:'over-budget',usd:50},now),/Monthly/);
});
