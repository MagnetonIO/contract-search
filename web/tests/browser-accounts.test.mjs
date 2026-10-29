import test from 'node:test';import assert from 'node:assert/strict';
import {observedLogin,siteForUrl,ACCOUNT_SITES,loginIsActive} from '../lib/browser-accounts.mjs';
test('a connected browser or public job page does not establish site sign-in',()=>{
 assert.equal(observedLogin('linkedin',{url:'https://www.linkedin.com/jobs/view/123'}),'unverified');
 assert.equal(observedLogin('linkedin',{url:'https://www.linkedin.com/feed/'}),'unverified');
 assert.equal(observedLogin('linkedin',{url:'https://www.linkedin.com/feed/',accountNavVisible:true}),'signed_in');
 assert.equal(observedLogin('dice',{url:'https://www.dice.com/dashboard/login',passwordVisible:true}),'needs_login');
 assert.equal(observedLogin('dice',{url:'https://www.dice.com/dashboard',signOutVisible:true}),'signed_in');
 assert.equal(observedLogin('dice',{url:'https://unrelated.example/dashboard',signOutVisible:true}),'unverified');
 assert.equal(observedLogin('dice',{url:'https://www.dice.com/profile',accountNavVisible:true}),'signed_in');
 assert.equal(observedLogin('dice',{url:'https://www.dice.com/profile'}),'unverified');
 assert.equal(observedLogin('indeed',{url:'https://secure.indeed.com/auth'}),'needs_login');
 assert.equal(observedLogin('glassdoor',{url:'https://www.glassdoor.com/member/profile/login'}),'needs_login');
 assert.equal(observedLogin('glassdoor',{url:'https://www.glassdoor.com/member/home',signOutVisible:true}),'signed_in');
 assert.deepEqual(Object.keys(ACCOUNT_SITES),['linkedin','dice','indeed','glassdoor']);
 assert.equal(siteForUrl('https://secure.indeed.com/auth'),'indeed');assert.equal(siteForUrl('https://indeed.com.evil.example/auth'),null);
 assert.equal(loginIsActive({opened_at:'2026-10-29T18:00:00Z',expires_at:'2026-10-29T18:15:00Z'},Date.parse('2026-10-29T18:10:00Z')),true);
});
test('Glassdoor personalized job-seeker home verifies without a visible sign-out menu',()=>{
 const home={url:'https://www.glassdoor.com/recruiter',accountHomeVisible:true,accountNavVisible:true};
 assert.equal(observedLogin('glassdoor',home),'signed_in');
 assert.equal(observedLogin('glassdoor',{...home,accountHomeVisible:false}),'unverified');
 assert.equal(observedLogin('glassdoor',{...home,accountNavVisible:false}),'unverified');
 assert.equal(observedLogin('glassdoor',{...home,url:'https://www.glassdoor.com/member/profile/login'}),'needs_login');
 assert.equal(observedLogin('glassdoor',{...home,passwordVisible:true}),'needs_login');
 assert.equal(observedLogin('glassdoor',{...home,url:'https://www.glassdoor.com/Job/jobs.htm'}),'unverified');
 assert.equal(observedLogin('glassdoor',{...home,url:'https://glassdoor.com.evil.example/recruiter'}),'unverified');
});
