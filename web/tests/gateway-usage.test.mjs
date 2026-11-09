import test from 'node:test';import assert from 'node:assert/strict';
import {gatewayCostSummary} from '../lib/gateway-usage.mjs';
import {recordGatewayUsage,reservationCost} from '../lib/gateway-usage.mjs';
import {readJson} from '../lib/store.ts';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
test('reported spend excludes pending, historical months and estimates without treating them as billed zero',()=>{
 const data={tracking_started_at:'2026-11-09T20:00:00Z',generations:{a:{created_at:'2026-11-09T20:01:00Z',status:'reported',cost_usd:.125},b:{created_at:'2026-11-09T20:02:00Z',status:'pending',estimate_usd:2},c:{created_at:'2026-10-31T20:00:00Z',status:'reported',cost_usd:99}}};
 const s=gatewayCostSummary(data,new Date('2026-11-09T21:00:00Z'));
 assert.equal(s.reported_usd,.125);assert.equal(s.reported_generations,1);assert.equal(s.pending_generations,1);assert.equal(s.balance,null);
});
test('a delayed provider lookup remains unknown, then reconciles once without double-counting or changing the generation identity',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'contract-gateway-cost-')),prior=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
  const result={providerMetadata:{gateway:{generationId:'gen_receipt'}}},meta={cost_id:'attempt-cost',phase:'visual_action',attempt_id:'attempt'};
  const pending=await recordGatewayUsage(result,meta,{client:{getGenerationInfo:async()=>{throw Error('Not ingested yet');}}});assert.equal(pending.reported,false);
  let data=(await readJson('ai-gateway-usage.json',{})).value;assert.equal(gatewayCostSummary(data).pending_generations,1);
  assert.equal((await reservationCost('attempt-cost',.7,.01)).usd,.71);
  const client={getGenerationInfo:async()=>({totalCost:.02,model:'model',providerName:'provider'})};
  await recordGatewayUsage(result,meta,{client});await recordGatewayUsage(result,meta,{client});
  data=(await readJson('ai-gateway-usage.json',{})).value;assert.equal(Object.keys(data.generations).length,1);assert.equal(gatewayCostSummary(data).reported_usd,.02);
  const cost=await reservationCost('attempt-cost',.7,.01);assert.equal(cost.usd,.03);assert.equal(cost.details.gateway_cost_complete,true);assert.equal(cost.details.browser_estimate_usd,.01);
 }finally{if(prior===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=prior;await rm(folder,{recursive:true,force:true});}
});
