import test from 'node:test';
import assert from 'node:assert/strict';
import { collectorWindow, ensureCollection } from '../lib/collector-scheduler.mjs';
function store(snapshot=null){const values={'leads.json':snapshot};let version=0;return {read:async key=>({value:values[key],version}),write:async(key,value,expected)=>{if(expected!==version)throw Error('conflict');values[key]=value;return ++version;},conflict:e=>e.message==='conflict'};}
const now=new Date('2026-10-29T13:07:00Z');
test('weekday dispatch follows Chicago DST and rejects weekends and early slots',()=>{
 assert.equal(collectorWindow(now),true);assert.equal(collectorWindow(new Date('2026-10-29T13:06:00Z')),false);
 assert.equal(collectorWindow(new Date('2026-11-02T14:07:00Z')),true);assert.equal(collectorWindow(new Date('2026-11-02T13:07:00Z')),false);
 assert.equal(collectorWindow(new Date('2026-10-31T14:00:00Z')),false);
});
test('fresh scan prevents API calls; a Gmail timestamp cannot substitute for base collection',async()=>{
 const fresh=await ensureCollection({now,store:store({collected_at:'2026-10-29T13:08:00Z'}),fetchImpl:()=>{throw Error('must not call')}});assert.equal(fresh.status,'already_collected');
 assert.equal((await ensureCollection({now,store:store({collected_at:'2026-10-28T15:21:00Z',digest_cutoff:'2026-10-29T13:08:00Z'}),token:''})).status,'configuration_required');
});
test('active runner suppresses dispatch; dispatch lease suppresses duplicates',async()=>{
 let dispatches=0;const state=store();const fetchImpl=async(url,options)=>{if(options.method==='POST'){dispatches++;assert.deepEqual(JSON.parse(options.body),{ref:'main',inputs:{mode:'daily'}});return new Response(null,{status:204});}return Response.json({workflow_runs:[]});};
 const options={now,store:state,fetchImpl,token:'synthetic'};
 assert.equal((await ensureCollection(options)).status,'dispatched');assert.equal((await ensureCollection(options)).status,'dispatch_pending');assert.equal(dispatches,1);
 assert.equal((await ensureCollection({...options,store:store(),fetchImpl:async()=>Response.json({workflow_runs:[{status:'queued',created_at:now.toISOString(),html_url:'https://github.com/example/run'}]})})).status,'runner_active');
});
test('API failure is retryable without leaking token or falsely recording success',async()=>{
 await assert.rejects(ensureCollection({now,store:store(),token:'synthetic-private',fetchImpl:async()=>new Response('',{status:403})}),e=>e.message==='Collector dispatch API returned HTTP 403');
});
test('manual pull dispatches a fresh daily collection after the morning scan outside the scheduled window',async()=>{
 const calls=[];const state=store({collected_at:'2026-11-12T14:10:00Z'});
 const options={now:new Date('2026-11-12T17:54:00Z'),manual:true,store:state,token:'synthetic',fetchImpl:async(url,options)=>{calls.push({url,...options});return options.method==='POST'?new Response(null,{status:204}):Response.json({workflow_runs:[]});}};
 assert.equal((await ensureCollection(options)).status,'dispatched');
 assert.deepEqual(JSON.parse(calls.find(c=>c.method==='POST').body),{ref:'main',inputs:{mode:'daily',force:'true'}});
 assert.equal((await ensureCollection(options)).status,'dispatch_pending');
 assert.equal(calls.filter(c=>c.method==='POST').length,1);
});
test('manual pull still reuses an active runner and requires the existing dispatcher credentials',async()=>{
 const now=new Date('2026-11-12T17:54:00Z');
 assert.equal((await ensureCollection({now,manual:true,store:store(),token:''})).status,'configuration_required');
 const result=await ensureCollection({now,manual:true,store:store(),token:'synthetic',fetchImpl:async()=>Response.json({workflow_runs:[{status:'in_progress',created_at:now.toISOString(),html_url:'https://github.com/example/run'}]})});
 assert.equal(result.status,'runner_active');assert.equal(result.run_url,'https://github.com/example/run');
});
test('a rejected dispatch is not left looking queued and can be retried immediately',async()=>{
 const state=store();const options={now:new Date('2026-11-12T17:54:00Z'),manual:true,store:state,token:'synthetic'};
 await assert.rejects(ensureCollection({...options,fetchImpl:async(url,options)=>options.method==='POST'?new Response(null,{status:422}):Response.json({workflow_runs:[]})}),/HTTP 422/);
 assert.equal((await state.read('collection-dispatch.json')).value.status,'failed');
 assert.equal((await ensureCollection({...options,fetchImpl:async(url,options)=>options.method==='POST'?new Response(null,{status:204}):Response.json({workflow_runs:[]})})).status,'dispatched');
});
