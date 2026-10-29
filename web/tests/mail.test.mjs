import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { sendMail, deliverStored, digestPayload, MailError, MAIL_FROM } from '../lib/mail.mjs';

function memoryStore(){let value=null,version=0;return {read:async()=>({value:structuredClone(value),version:version||null}),write:async(key,next,expected)=>{if(expected!==(version||null))throw new Error('conflict');value=structuredClone(next);version++;return version;},conflict:error=>error.message==='conflict'};}
const payload={from:MAIL_FROM,to:['test@example.com'],subject:'Synthetic test',text:'Fixture'};
test('Resend receives a frozen payload and idempotency key; secrets stay out of failures',async()=>{
  let calls=0;
  const id=await sendMail(payload,'fixture/1',{apiKey:'synthetic-test-key',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options.redirect,'error');assert.equal(options.headers['Idempotency-Key'],'fixture/1');assert.equal(options.headers['User-Agent'],'ContractDesk/1.0');assert.deepEqual(JSON.parse(options.body),payload);return new Response(JSON.stringify({id:'fixture-receipt'}));}});
  assert.equal(id,'fixture-receipt');assert.equal(calls,1);
  await assert.rejects(sendMail(payload,'fixture/2',{apiKey:'synthetic-test-key',fetchImpl:async()=>new Response('synthetic-test-key should not leak',{status:403})}),error=>error instanceof MailError&&!error.message.includes('synthetic-test-key'));
});
test('accepted delivery persists and repeated requests never call the provider again',async()=>{
  const store=memoryStore();let sends=0;
  const create=async()=>({payload,meta:{day:'2026-10-27'}});
  const send=async()=>{sends++;return 'receipt1';};
  const first=await deliverStored(store,'fixture.json','fixture1',create,send);
  const second=await deliverStored(store,'fixture.json','fixture1',()=>{throw new Error('must not rebuild payload');},send);
  assert.equal(first.provider_id,'receipt1');assert.equal(second.status,'accepted');assert.equal(sends,1);
});
test('an uncertain send retries the same body and key, then stops before provider dedup expires',async()=>{
  const store=memoryStore();let time=new Date('2026-10-27T12:00:00Z');const attempts=[];
  const send=async(body,key)=>{attempts.push({body:structuredClone(body),key});throw new MailError('uncertain');};
  const run=()=>deliverStored(store,'fixture.json','fixture1',async()=>({payload}),send,()=>time);
  await assert.rejects(run(),/uncertain/);time=new Date('2026-10-27T13:00:00Z');await assert.rejects(run(),/uncertain/);
  assert.deepEqual(attempts[0],attempts[1]);
  await assert.rejects(deliverStored(store,'fixture.json','next',async()=>({payload}),send,()=>time),/earlier delivery is unresolved/);
  time=new Date('2026-10-28T12:00:00Z');await assert.rejects(run(),/safe retry window expired/);assert.equal(attempts.length,2);
});
test('daily digest advances from the last accepted cutoff and excludes old/secondary/project leads',()=>{
  const lead={id:'a'.repeat(20),title:'Python <Engineer>',company_agency:'Example',first_seen:'2026-10-27T11:00:00Z',pay:'$110/hr',remote_location:'US',c2c_status:'unknown',source_url:'https://example.com/job',review_score:100,pipeline:'contract'};
  const snapshot={collected_at:'2026-10-27T12:00:00Z',leads:[lead,{...lead,id:'old',first_seen:'2026-10-26T12:00:00Z'},{...lead,id:'secondary',pipeline:'secondary'},{...lead,id:'project',pipeline:'published_project_need'}],summary:{target:50,source_coverage:[{source:'Failed board',status:'failed'},{source:'SAM',status:'not configured'}]}};
  const draft=digestPayload(snapshot,'2026-10-27T10:00:00Z','2026-10-27',new Date('2026-10-27T13:00:00Z'));
  assert.equal(draft.meta.count,1);assert.equal(draft.meta.cutoff,snapshot.collected_at);assert.deepEqual(draft.payload.to,['mlong@magneton.io']);assert.equal(draft.payload.from,MAIL_FROM);
  assert.ok(draft.payload.text.includes('?lead='+lead.id));assert.ok(draft.payload.text.includes('Failed board'));assert.ok(draft.payload.html.includes('&lt;Engineer&gt;'));assert.equal(draft.payload.html.includes('<Engineer>'),false);
  assert.equal(digestPayload(snapshot,snapshot.collected_at,'2026-10-28',new Date('2026-10-28T15:00:00Z')).meta.count,0);
});

test('large digests have separate readable job sections, safe labeled links and an honest preview count',()=>{
  const leads=Array.from({length:122},(_,i)=>({id:'job-'+i,title:`Engineer <${i}>`,company_agency:'Example & Co',first_seen:'2026-10-28T11:00:00Z',pay:'$110/hr',remote_location:'["California, United States"]',c2c_status:'unknown',source_url:i===121?'javascript:alert(1)':'https://example.com/job?x=1&y=2',review_score:i,pipeline:'contract'}));
  const snapshot={collected_at:'2026-10-28T12:00:00Z',leads,summary:{target:50,source_coverage:[]}};
  const {payload,meta}=digestPayload(snapshot,'2026-10-27T12:00:00Z','2026-10-28',new Date('2026-10-28T13:00:00Z'));
  const $=load(payload.html);
  const links=$('a').filter((_,a)=>$(a).text()==='Review opportunity');
  assert.equal(meta.count,122);assert.equal(links.length,20);
  assert.match($('h1').text(),/122 new contract candidates/);
  assert.ok($.text().includes('102 more candidates'));
  assert.ok($.text().includes('Showing 20 candidates, highest review score first.'));
  assert.equal(links.first().attr('href'),'https://contract-search-alpha.vercel.app/?lead=job-121');
  const first=links.first().closest('td');
  assert.equal(first.find('h2').text(),'1. Engineer <121>');
  assert.ok(first.text().includes('Example & Co'));
  assert.ok(first.text().includes('California, United States'));
  assert.equal(first.text().includes('["California'),false);
  assert.equal(first.find('br').length,2);
  assert.equal(first.find('a').length,1); // Unsafe source URL is omitted.
  assert.equal($('a[href^="javascript:"]').length,0);
  assert.equal($('script').length,0);
  assert.equal($('a').filter((_,a)=>/^https?:/.test($(a).text())).length,0);
  assert.equal(payload.html.includes('white-space'),false); // Layout survives clients dropping this CSS.
  assert.match(payload.text,/1\. Engineer <121>\nExample & Co\nRate: \$110\/hr\nLocation: California, United States\nC2C: unknown/);
  assert.ok(payload.text.includes('102 more candidates'));
  assert.ok(Buffer.byteLength(payload.html)<100000,'fixture stays below common email clipping size');
});

test('empty digest retains collection warnings and separates Catalant review links',()=>{
  const snapshot={collected_at:'2026-10-27T12:00:00Z',leads:[{id:'project',title:'Project <review>',first_seen:'2026-10-27T11:00:00Z',pipeline:'email_review'}],summary:{target:50,source_coverage:[{source:'Board <offline>',status:'failed'},{source:'SAM',status:'not configured'}]}};
  const {payload}=digestPayload(snapshot,'2026-10-26T12:00:00Z','2026-10-28',new Date('2026-10-28T15:00:00Z'));
  const $=load(payload.html);
  assert.ok($.text().includes('New job counts are unavailable'));
  assert.match(payload.subject,/Collection delayed/);
  assert.ok($.text().includes('Collection is over 26 hours old'));
  assert.ok($.text().includes('Below the target of 50'));
  assert.ok($.text().includes('Source failures: Board <offline>'));
  assert.ok($.text().includes('Sources awaiting setup: SAM'));
  assert.equal($('li a').text(),'Project <review>');
  assert.ok($.text().includes('CDT'));
});
