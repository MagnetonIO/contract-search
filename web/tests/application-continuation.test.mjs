import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {chromium} from 'playwright-core';
import {writeJson,readJson,writeBytes} from '../lib/store.ts';
test('checkpoint reconnect keeps field values and selected resume without navigating or submitting twice',async()=>{
 const {applyAttempt}=await import('../lib/application-browser.mjs');
 const dir=await mkdtemp(path.join(os.tmpdir(),'contract-continuation-')),prior=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=dir;
 const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});let navigations=0,uploads=0,submits=0,released=0;
 try{
  const context=await browser.newContext(),page=await context.newPage(),target='https://www.dice.com/job-detail/fixture-recovery';
  await context.route(target,r=>{navigations++;return r.fulfill({contentType:'text/html',body:'<h1>Engineer</h1><p>Remote United States contract.</p><form><label>Full name<input name="name" required></label><label>Resume<input type="file" name="resume" required></label><span id="file"></span><button type="submit">Submit application</button></form><script>document.querySelector("input[type=file]").onchange=e=>{document.querySelector("#file").textContent=e.target.files[0].name;console.log("uploaded")};document.querySelector("form").onsubmit=e=>{e.preventDefault();console.log("submitted");document.body.innerHTML="<h1>Your application has been received</h1>"}</script>'});});
  page.on('console',m=>{if(m.text()==='uploaded')uploads++;if(m.text()==='submitted')submits++;});
  const pdf=Buffer.from('%PDF-1.4 approved fixture'),hash=createHash('sha256').update(pdf).digest('hex'),now=new Date().toISOString();
  await writeJson('automation-settings.json',{enabled:false});await writeJson('profile.json',{resume_hash:hash});await writeJson('applicant-facts.json',{version:'v1',confirmed:true,name:'Test Applicant',country:'United States',state:'IL'});await writeBytes('resume.bin',pdf,'application/pdf');
  await writeJson('leads.json',{leads:[{id:'lead',title:'Engineer',company_agency:'Fixture',application_url:target,source_url:target,pipeline:'contract',source:'Dice',work_arrangement:'remote',remote_location:'Remote United States'}]});
  await writeJson('application-attempts.json',{a:{id:'a',lead_id:'lead',title:'Engineer',source:'Dice',status:'queued',resume_hash:hash,profile_version:'v1',manual_authorized_at:now,manual_expires_at:new Date(Date.now()+600000).toISOString()}});
  const remote={contexts:()=>[context],close:async()=>{}},session={id:'session',status:'RUNNING',connectUrl:'fixture',expiresAt:new Date(Date.now()+1800000).toISOString()},client={sessions:{retrieve:async()=>session,debug:async()=>null,update:async()=>{released++;}}};
  let segments=0;
  const runner=async args=>{segments++;if(segments===1){await args.invoke('fillKnown',{index:0,label:'Full name',fact:'name'});await args.invoke('attachResume',{});await args.onSegment();}else{assert.equal(await page.getByLabel('Full name').inputValue(),'Test Applicant');assert.equal(await page.getByLabel('Resume',{exact:true}).evaluate(e=>e.files.length),1);await args.invoke('submit',{label:'Submit application'});}};
  const deps={client,connect:async()=>remote,sessionFactory:async()=>session,runner,review:async()=>({output:{approved:true},usage:{}})};
  assert.deepEqual(await applyAttempt('a',deps),{continue:true});assert.equal(released,0);assert.equal(submits,0);
  await applyAttempt('a',deps);const saved=(await readJson('application-attempts.json',{})).value.a;assert.equal(saved.status,'submitted');assert.ok(saved.receipt);assert.equal(navigations,1);assert.equal(uploads,1);assert.equal(submits,1);assert.equal(released,1);
  await applyAttempt('a',deps);assert.equal(submits,1);assert.equal((await readJson('automation-settings.json',{})).value.enabled,false);
 }finally{await browser.close();if(prior===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=prior;await rm(dir,{recursive:true,force:true});}
});
