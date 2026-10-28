import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDigest,mergeEmailLeads,mergeSnapshot,validImportToken} from '../lib/email-import.mjs';
import {digestPayload} from '../lib/mail.mjs';
import {leadInView} from '../lib/shared.mjs';
const now=new Date('2026-10-28T00:00:00Z');
const card=(title,url='http://links.gocatalant.com/ls/click?upn=opaque',extra='')=>`<table><tr><td><a href="${url}" style="font-weight:600">${title}</a>${extra}</td></tr></table>`;
const email={id:'1234567890ab',thread_id:'abcdef123456',received_at:'2026-10-27T18:00:00Z',sender:'"Catalant Technologies" <donotreply@gocatalant.com>',subject:'Catalant Opportunity Digest',html:card('Data &amp; AI Product Lead')+card('Senior Cloud Architect')+card('Market Pricing Strategy')};
test('real digest structure produces separate relevant cards and upgrades known tracking URLs',()=>{
 const leads=parseDigest(email,now);assert.equal(leads.length,2);assert.equal(leads[0].title,'Data & AI Product Lead');assert.match(leads[0].source_url,/^https:/);assert.equal(leads[0].source_posted_at,'');assert.equal(leads[0].geography,'unknown');assert.equal(leads[0].contacts.length,0);assert.match(leads[0].email_origin.gmail_url,/#all\/abcdef/);
});
test('sender, subject, recency, unsafe links, explicit travel and old publication dates are filtered',()=>{
 for(const patch of [{sender:'attacker@example.com'},{subject:'Marketing'},{received_at:'2026-09-01T00:00:00Z'},{html:card('Senior Cloud Architect','https://evil.example/a')},{html:card('Senior Cloud Architect',undefined,'Travel required')},{html:card('Senior Cloud Architect',undefined,'Published 09/01/26')}])assert.equal(parseDigest({...email,...patch},now).length,0);
 assert.equal(parseDigest({...email,html:card('Senior Cloud Architect',undefined,'Published 10/26/26')},now)[0].source_posted_at,'2026-10-26T00:00:00.000Z');
});
test('repeat digests preserve identity and first seen despite changed tracking links',()=>{
 const first=mergeEmailLeads(null,[email],now);const repeated=mergeEmailLeads(first,[{...email,html:email.html.replaceAll('opaque','different')}],new Date('2026-10-28T01:00:00Z'));assert.equal(repeated.leads.length,2);assert.equal(repeated.leads[0].first_seen,now.toISOString());assert.equal(repeated.leads[0].id,first.leads[0].id);
});
test('merged snapshot preserves collector coverage and email leads through later collections and digests',()=>{
 const imported=mergeEmailLeads(null,[email],now);const base={collected_at:'2026-10-27T13:00:00Z',leads:[],summary:{target:100,source_coverage:[]}};
 const merged=mergeSnapshot(base,imported,now);assert.equal(merged.leads.length,2);assert.equal(base.leads.length,0);assert(leadInView(merged.leads[0],{},'email_review'));assert(!leadInView(merged.leads[0],{},'opportunities'));assert(!leadInView(merged.leads[0],{stage:'applied'},'email_review'));const digest=digestPayload(merged,'2026-10-27T00:00:00Z','2026-10-28',now);assert.match(digest.payload.text,/Catalant projects to review: 2/);assert.equal(digest.meta.count,0);
});
test('ingest token cannot authenticate without the configured secret',()=>{const token='a'.repeat(64);assert(validImportToken(token,token));assert(!validImportToken('bad',token));assert(!validImportToken('',undefined));});
