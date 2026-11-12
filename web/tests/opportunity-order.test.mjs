import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../lib/shared.mjs';
const leads=[
 {id:'older-post',first_seen:'2026-11-12T14:00:00Z',source_posted_at:'2026-11-11T14:00:00Z'},
 {id:'newer-post',first_seen:'2026-11-12T14:00:00Z',source_posted_at:'2026-11-12T13:00:00Z'},
 {id:'unknown-post',first_seen:'2026-11-12T15:00:00Z',source_posted_at:''},
];
test('newest seen breaks batch ties by posting time; newest posted puts unknown dates last',()=>{
 assert.deepEqual(shared.sortOpportunities?.(leads,'newest').map(l=>l.id),['unknown-post','newer-post','older-post']);
 assert.deepEqual(shared.sortOpportunities?.(leads,'posted').map(l=>l.id),['newer-post','older-post','unknown-post']);
 assert.equal(leads[0].id,'older-post','sorting does not mutate stored results');
});
test('timestamp ordering compares instants across offsets and keeps fit and rate sorts',()=>{
 const rows=[{id:'a',first_seen:'2026-11-12T08:30:00-06:00',source_posted_at:'invalid',review_score:10,hourly_min_usd:132},{id:'b',first_seen:'2026-11-12T14:00:00Z',source_posted_at:'',review_score:20,hourly_min_usd:97}];
 assert.deepEqual(shared.sortOpportunities?.(rows,'newest').map(l=>l.id),['a','b']);
 assert.deepEqual(shared.sortOpportunities?.(rows,'fit').map(l=>l.id),['b','a']);
 assert.deepEqual(shared.sortOpportunities?.(rows,'pay').map(l=>l.id),['a','b']);
});
