import test from 'node:test';import assert from 'node:assert/strict';
import {startRequestState} from '../lib/automation-start.mjs';
const request={requested_at:'2026-10-29T23:04:28.149Z'};
const run={active:false,started_at:'2026-10-29T22:56:41.534Z',finished_at:'2026-10-29T22:57:46.698Z'};
test('an after-hours request is deferred instead of falsely starting',()=>{
 assert.equal(startRequestState(request,run,{now:new Date('2026-10-29T23:04:29Z'),windowOpen:false}).status,'deferred');
});
test('pending dispatches expire and never supersede an actual running or completed cycle',()=>{
 const now=new Date('2026-10-29T23:04:29Z');
 assert.equal(startRequestState(request,run,{now,windowOpen:true}).status,'pending');
 assert.equal(startRequestState(request,run,{now:new Date('2026-10-29T23:07:29Z'),windowOpen:true}).status,'not_started');
 assert.equal(startRequestState(request,{active:true,started_at:'2026-10-29T23:04:30Z'},{now,windowOpen:true}).status,'running');
 assert.equal(startRequestState(request,{active:false,started_at:'2026-10-29T23:04:30Z'},{now,windowOpen:true}).status,'idle');
 assert.equal(startRequestState({...request,status:'deferred'},run,{now,windowOpen:true}).status,'deferred');
 assert.equal(startRequestState({...request,manual:true},run,{now,windowOpen:false}).status,'pending','manual starts may run immediately outside scheduled hours');
});
