import test from 'node:test';import assert from 'node:assert/strict';
import {observedLogin} from '../lib/browser-accounts.mjs';
test('a connected browser or public job page does not establish site sign-in',()=>{
 assert.equal(observedLogin('linkedin',{url:'https://www.linkedin.com/jobs/view/123'}),'unverified');
 assert.equal(observedLogin('linkedin',{url:'https://www.linkedin.com/feed/'}),'signed_in');
 assert.equal(observedLogin('dice',{url:'https://www.dice.com/dashboard/login',passwordVisible:true}),'needs_login');
 assert.equal(observedLogin('dice',{url:'https://www.dice.com/dashboard',signOutVisible:true}),'signed_in');
 assert.equal(observedLogin('dice',{url:'https://unrelated.example/dashboard',signOutVisible:true}),'unverified');
});
