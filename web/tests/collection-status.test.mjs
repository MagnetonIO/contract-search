import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionHealth} from '../lib/collection-status.mjs';
const old={collected_at:'2026-10-27T23:17:35Z'};
test('missed schedule is overdue, not a claimed successful scan',()=>{const r=collectionHealth(old,null,new Date('2026-10-28T15:20:00Z'));assert.equal(r.status,'overdue');assert.equal(r.expected_at,'2026-10-28T13:07:00.000Z');assert.equal(r.next_at,'2026-10-29T13:07:00.000Z');});
test('running, stalled, failed and updated scan states remain distinct',()=>{const now=new Date('2026-10-28T15:20:00Z');assert.equal(collectionHealth(old,{status:'running',started_at:'2026-10-28T15:15:00Z'},now).status,'running');assert.equal(collectionHealth(old,{status:'running',started_at:'2026-10-28T13:00:00Z'},now).status,'stalled');assert.equal(collectionHealth({collected_at:'2026-10-28T13:20:00Z'},null,now).status,'idle');});
test('winter schedule uses Chicago standard time',()=>{assert.equal(collectionHealth({collected_at:'2026-11-09T15:00:00Z'},null,new Date('2026-11-09T16:00:00Z')).next_at,'2026-11-10T14:07:00.000Z');});
