import test from 'node:test';import assert from 'node:assert/strict';
import {sourceLimitReached,pilotAllows,pilotReport} from '../lib/application-pilot.mjs';
test('Dice capacity counts receipts, holds an in-flight final slot, and ignores failed jobs',()=>{
 const now=new Date('2026-11-09T20:00:00Z'),policy={dice_daily_limit:2};
 const attempts={a:{source:'Dice',status:'submitted',receipt:'Received',confirmed_at:now.toISOString(),id:'a'},b:{source:'Dice',status:'failed'},c:{source:'LinkedIn',status:'submitted',receipt:'Received',confirmed_at:now.toISOString(),id:'c'}};
 assert.equal(sourceLimitReached('Dice',attempts,policy,now),false);
 attempts.d={source:'Dice',status:'submitting',submission_intent_at:now.toISOString()};assert.equal(sourceLimitReached('Dice',attempts,policy,now),true);
 assert.equal(sourceLimitReached('LinkedIn',attempts,policy,now),false);
});
test('the non-Dice pilot has ten browser slots and separately reports technical failures, verification and receipts',()=>{
 const policy={visual_pilot:{id:'pilot',enabled:true,limit:10}},attempts={};
 assert.equal(pilotAllows('Dice',policy,attempts),false);
 for(let i=0;i<9;i++)attempts[i]={id:String(i),pilot_id:'pilot',last_started_at:'2026-11-09',status:'failed',reason:'Worker interrupted'};
 assert.equal(pilotAllows('LinkedIn',policy,attempts),true);
 attempts.tenth={id:'tenth',pilot_id:'pilot',last_started_at:'2026-11-09',status:'needs_input',reason:'CAPTCHA'};
 assert.equal(pilotAllows('LinkedIn',policy,attempts),false);
 const report=pilotReport(policy,attempts);assert.equal(report.attempted,10);assert.equal(report.technical,9);assert.equal(report.human_checks,1);assert.equal(report.confirmed,0);assert.equal(report.complete,true);
});
