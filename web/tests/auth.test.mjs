import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAuthConfig, makePasswordHash, verifyPassword, safeWebUrl } from '../lib/auth-core.mjs';
import { sealData, unsealData } from 'iron-session';
import { contactEmails, draftEmail, emailHref, formatPay } from '../lib/shared.mjs';

test('passwords are salted, verified, and never stored as plaintext', () => {
  const password = 'disposable-test-password-only';
  const first = makePasswordHash(password);const second = makePasswordHash(password);
  assert.notEqual(first, second);assert.equal(first.includes(password), false);
  assert.equal(verifyPassword(password, first), true);assert.equal(verifyPassword('wrong', first), false);
  assert.equal(verifyPassword('wrong', 'scrypt1:invalid:invalid'), false);
  assert.throws(()=>makeAuthConfig('owner', 'short'));
  assert.throws(()=>makeAuthConfig('../not-a-username', password));
});
test('rotating the session secret invalidates existing authenticated cookies', async () => {
  const first = makeAuthConfig('owner', 'disposable-test-password-only');
  const second = makeAuthConfig('owner', 'replacement-test-password-only');
  const cookie = await sealData({username:'owner'}, {password:first.sessionSecret});
  assert.equal((await unsealData(cookie,{password:first.sessionSecret})).username,'owner');
  assert.equal((await unsealData(cookie,{password:second.sessionSecret})).username,undefined);
});
test('posting links reject script URLs and embedded credentials',()=>{
  assert.equal(safeWebUrl('javascript:alert(1)'), '');
  assert.equal(safeWebUrl('https://user:secret@example.com'), '');
  assert.equal(safeWebUrl('https://example.com/jobs/1'), 'https://example.com/jobs/1');
});
test('outreach links exclude accommodation contacts and do not claim attachments',()=>{
  const lead={title:'Python Engineer',company_agency:'Example',contacts:[
    {email:'accommodation@example.com',kind:'accessibility_only',detail:'Accommodation only'},
    {email:'recruiting@example.com',kind:'hiring',detail:'Public recruiter'}]};
  const profile={name:'Example Candidate',pitch:'Experienced software engineer.',portfolio:'https://example.com/portfolio'};
  const emails=contactEmails(lead);assert.equal(emails.length,1);
  assert.equal(emails[0].email,'recruiting@example.com');
  const href=emailHref(emails[0].email,lead,profile);
  assert.ok(href.startsWith('mailto:recruiting@example.com?subject='));
  assert.ok(draftEmail(lead,profile).includes('C2C eligibility'));
  assert.equal(draftEmail(lead,profile).toLowerCase().includes('attached'),false);
  assert.equal(emailHref('injected@example.com\r\nBcc:other@example.com',lead,profile),'');
});
test('source annual pay remains annual rather than becoming an invented hourly rate',()=>{
  assert.equal(formatPay('{"currency":"USD","value":{"minValue":120000,"maxValue":140000,"unitText":"YEAR"}}'),'USD 120,000–140,000 / year');
  assert.equal(formatPay('unknown'),'Rate not published');
});
