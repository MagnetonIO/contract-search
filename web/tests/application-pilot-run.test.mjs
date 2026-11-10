import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {readJson,writeJson} from '../lib/store.ts';
test('targeted pilot leaves scheduling paused, respects the Dice cap and rejects an unsupported destination',async()=>{
 const {prepareTargetedPilot}=await import('../lib/application-pilot-run.mjs');const dir=await mkdtemp(path.join(os.tmpdir(),'contract-targeted-pilot-')),prior=process.env.DASHBOARD_LOCAL_DIR,keys={BROWSERBASE_API_KEY:process.env.BROWSERBASE_API_KEY,BROWSERBASE_PROJECT_ID:process.env.BROWSERBASE_PROJECT_ID,AI_GATEWAY_API_KEY:process.env.AI_GATEWAY_API_KEY};
 process.env.DASHBOARD_LOCAL_DIR=dir;process.env.BROWSERBASE_API_KEY='fixture';process.env.BROWSERBASE_PROJECT_ID='fixture';process.env.AI_GATEWAY_API_KEY='fixture';
 try{
  const now=new Date().toISOString();await writeJson('automation-settings.json',{enabled:false,daily_limit:100,dice_daily_limit:1,monthly_limit_usd:50});await writeJson('applicant-facts.json',{confirmed:true,version:'v1'});await writeJson('profile.json',{resume_hash:'approved'});
  const lead=(id,source,url)=>({id,title:'Engineer',source,application_url:url,source_url:url,pipeline:'contract'});
  await writeJson('leads.json',{leads:[lead('dice','Dice','https://www.dice.com/job-detail/test'),lead('li','LinkedIn','https://www.linkedin.com/jobs/view/123'),lead('other','Other','https://jobs.ashbyhq.com/example/test')]});await writeJson('screenings.json',{dice:{status:'eligible',score:90},li:{status:'eligible',score:90},other:{status:'eligible',score:90}});
  await writeJson('application-attempts.json',{prior:{id:'prior',source:'Dice',status:'submitted',receipt:'Application received',confirmed_at:now}});
  assert.equal((await prepareTargetedPilot(['dice'])).deferred.length,1);assert.equal(Object.keys((await readJson('application-attempts.json',{})).value).length,1);
  await assert.rejects(prepareTargetedPilot(['other']),/four supported/);
  const result=await prepareTargetedPilot(['li']);assert.equal(result.attempt_ids.length,1);const a=(await readJson('application-attempts.json',{})).value[result.attempt_ids[0]];assert.equal(a.repair_pilot,true);assert.equal(a.status,'queued');assert.equal((await readJson('automation-settings.json',{})).value.enabled,false);
 }finally{if(prior===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=prior;for(const [key,value] of Object.entries(keys)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(dir,{recursive:true,force:true});}
});
