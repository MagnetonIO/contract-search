import test from 'node:test';import assert from 'node:assert/strict';
import {applicationRunAllowed} from '../lib/automation-policy.mjs';
test('a bounded active manual cycle can run outside scheduled hours without enabling scheduled runs',()=>{
 const now=new Date('2026-10-29T23:30:00Z');
 assert.equal(applicationRunAllowed({run:null},now),false);
 const run={active:true,mode:'manual',started_at:'2026-10-29T23:10:00Z',manual_expires_at:'2026-10-30T01:10:00Z'};
 assert.equal(applicationRunAllowed({run},now),true);
 assert.equal(applicationRunAllowed({run:{...run,active:false}},now),false);
 assert.equal(applicationRunAllowed({run:{...run,mode:'scheduled'}},now),false);
 assert.equal(applicationRunAllowed({run:{...run,manual_expires_at:'2026-10-30T05:10:00Z'}},now),false);
 assert.equal(applicationRunAllowed({run},new Date('2026-10-30T01:11:00Z')),false);
});
import {applicationWindow,applicationIdentity,screenGate,reserveBudget} from '../lib/automation-policy.mjs';
const lead={id:'a',pipeline:'contract',source:'board',source_url:'https://example.com/jobs/1?utm_source=x',pay:'Unknown',work_arrangement:'remote',c2c_status:'unknown'};
test('application windows respect Chicago weekdays and DST',()=>{assert.ok(applicationWindow(new Date('2026-10-29T13:00:00Z')));assert.ok(!applicationWindow(new Date('2026-11-02T13:00:00Z')));assert.ok(!applicationWindow(new Date('2026-10-31T15:00:00Z')));});
test('unknown terms remain eligible but explicit W2-only and low rates fail',()=>{
 assert.equal(screenGate(lead,'Python contract'),null);assert.match(screenGate(lead,'W2 CANDIDATES ONLY'),/W2/);assert.equal(screenGate({...lead,pay:'$200 - $300 an hour'},'AI video interview required.'),null);assert.match(screenGate(lead,'W2 only'),/W2/);
 assert.match(screenGate({...lead,pay:'$70 - $99 an hour'},'Python'),/below/);
 assert.equal(screenGate({...lead,pay:'$90 - $120 an hour'},'Python'),null);
 assert.equal(screenGate({...lead,pay:'$100 - $120 an hour'},'Python'),null);
 assert.match(screenGate({...lead,pay:'$99/hr'},'Python'),/below/);
 assert.equal(screenGate({...lead,pay:'$120,000 per year'},'Python'),null);
 assert.match(screenGate(lead,'Type: Full-time. Infrastructure engineer.'),/permanent/);
 assert.equal(screenGate(lead,'Type: Full-time contract. Python engineer.'),null);
});
test('manual exclusions and submitted state survive snapshots with new content',()=>{
 for(const progress of [{disposition:{status:'purged'}},{stage:'not_a_fit'},{stage:'applied'}])assert.ok(screenGate({...lead,title:'Changed title'},'New description',progress));
 assert.ok(screenGate(lead,''));
});
test('tracking parameters are not new applications; distinct requisitions remain distinct',()=>{
 assert.equal(applicationIdentity(lead),applicationIdentity({...lead,source_url:'https://example.com/jobs/1?utm_source=y'}));
 assert.equal(applicationIdentity({...lead,source_url:'https://www.linkedin.com/jobs/view/engineer-at-example-123?trackingId=a'}),applicationIdentity({...lead,source_url:'https://linkedin.com/jobs/view/123'}));
 assert.notEqual(applicationIdentity(lead),applicationIdentity({...lead,source_url:'https://example.com/jobs/2'}));
});
test('budget holds uncertain charges and counts submission intents, including across midnight',()=>{
 let state=null;const now=new Date('2026-10-29T15:00:00Z');
 for(let i=0;i<20;i++)state=reserveBudget(state,{id:String(i),usd:0.5,submit:true},now);
 assert.throws(()=>reserveBudget(state,{id:'21',usd:0.5,submit:true},now),/Daily/);
 assert.throws(()=>reserveBudget(state,{id:'expensive',usd:25},now),/Monthly/);
 assert.deepEqual(reserveBudget(state,{id:'1',usd:0.5,submit:true},now),state);
 assert.equal(reserveBudget(state,{id:'tomorrow',usd:0.5,submit:true},new Date('2026-10-30T15:00:00Z')).submissions.length,21);
});
