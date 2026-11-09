import test from 'node:test';
import assert from 'node:assert/strict';
import * as report from '../lib/application-report.mjs';

const now=new Date('2026-11-10T00:10:00Z'); // Monday 6:10pm CST
const lead={id:'job',title:'Platform <Engineer>',company_agency:'Example & Co',source:'LinkedIn',source_url:'https://linkedin.com/jobs/view/123'};
const confirmed={id:'a',lead_id:'job',title:lead.title,source:'LinkedIn',target_identity:'same-job',status:'submitted',confirmed_at:'2026-11-09T21:00:00Z',receipt:'Application submitted',updated_at:'2026-11-09T21:00:00Z'};

test('daily application report lists every receipt-backed job once and excludes stale or unconfirmed successes',()=>{
 const attempts={a:confirmed,duplicate:{...confirmed,id:'duplicate'},unknown:{...confirmed,id:'unknown',target_identity:'unknown',receipt:null},old:{...confirmed,id:'old',target_identity:'old',confirmed_at:'2026-11-08T21:00:00Z'},failed:{id:'failed',lead_id:'job',source:'Indeed',status:'failed',reason:'Cannot locate resume control',visual_screenshot_key:'applications/failed/latest.jpg',updated_at:'2026-11-09T22:00:00Z'}};
 const draft=report.applicationReportPayload({leads:[lead],attempts,now});
 assert.equal(draft.meta.confirmed,1);
 assert.match(draft.payload.text,/Platform <Engineer>/);
 assert.match(draft.payload.text,/Example & Co/);
 assert.match(draft.payload.text,/LinkedIn: 1 confirmed/);
 assert.match(draft.payload.text,/Indeed: 0 confirmed/);
 assert.match(draft.payload.text,/Cannot locate resume control/);
 assert.match(draft.payload.html,/Platform &lt;Engineer&gt;/);
 assert.equal(draft.payload.html.includes('<Engineer>'),false);
 const csv=Buffer.from(draft.payload.attachments[0].content,'base64').toString();
 assert.match(csv,/Application submitted/);
 assert.match(csv,/automation-screenshot\?id=failed/);
 assert.equal(draft.meta.counts.unconfirmed,1);
});

test('report uses Chicago confirmation day across midnight UTC and includes all jobs beyond the old ten-row limit',()=>{
 const attempts=Object.fromEntries(Array.from({length:25},(_,i)=>[i,{...confirmed,id:String(i),target_identity:String(i),title:'Role '+i,confirmed_at:'2026-11-10T00:05:00Z'}]));
 const draft=report.applicationReportPayload({leads:[lead],attempts,now});
 assert.equal(draft.meta.day,'2026-11-09');assert.equal(draft.meta.confirmed,25);
 assert.match(draft.payload.text,/Role 24/);assert.match(draft.payload.html,/Role 24/);
});

test('report schedule follows Chicago DST, Friday early stop and never sends on weekends or morning triggers',()=>{
 for(const [date,want] of [
 ['2026-11-10T00:10:00Z',true],['2026-07-06T23:10:00Z',true],
 ['2026-11-13T21:10:00Z',true],['2026-07-10T20:10:00Z',true],
 ['2026-11-13T23:10:00Z',false],['2026-11-09T15:17:00Z',false],
 ['2026-11-14T21:10:00Z',false],['2026-11-10T00:09:00Z',false]])
 assert.equal(report.applicationReportWindow(new Date(date)).allowed,want,date);
});

test('daily delivery freezes one report per Chicago day and backup never sends it twice',async()=>{
 let value=null,version=null,sends=0;
 const store={read:async()=>({value,version}),write:async(_key,next,expected)=>{assert.equal(expected,version);value=next;version=String(Number(version||0)+1);},conflict:()=>false};
 const options={now,apiKey:'fixture',store,load:async()=>({leads:[lead],attempts:{a:confirmed}}),send:async()=>{sends++;return 'provider-receipt';}};
 const first=await report.sendDailyApplicationReport(options);
 const second=await report.sendDailyApplicationReport({...options,now:new Date('2026-11-10T00:40:00Z')});
 assert.equal(first.status,'accepted');assert.equal(second.provider_id,'provider-receipt');assert.equal(sends,1);
 const weekend=await report.sendDailyApplicationReport({...options,now:new Date('2026-11-14T21:10:00Z')});
 assert.equal(weekend.status,'weekend');assert.equal(sends,1);
});
