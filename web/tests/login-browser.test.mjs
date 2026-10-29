import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {readJson,writeJson} from '../lib/store.ts';
import {finishLogin,getLoginView,closeLogin} from '../lib/login-browser.mjs';
test('inconclusive verification keeps the login browser alive; saved sessions show a friendly completion',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'contract-login-life-'));const previous=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 let released=0;const client={sessions:{retrieve:async()=>({status:released?'COMPLETED':'RUNNING',connectUrl:'wss://fixture.invalid'}),update:async()=>{released++;}}};
 const connect=async()=>({close:async()=>{}});const deps={client,connect,inspect:async()=> 'unverified',pause:async()=>{}};
 try{
  await writeJson('browser-login.json',{id:'fixture',site:'dice',opened_at:new Date().toISOString(),expires_at:new Date(Date.now()+900000).toISOString(),live_url:'https://www.browserbase.com/fixture'});
  const held=await finishLogin(deps);assert.equal(held.finished,false);assert.equal(released,0);assert.equal((await readJson('browser-login.json',null)).value.id,'fixture');
  const saved=await finishLogin({...deps,inspect:async()=> 'signed_in'});assert.equal(saved.finished,true);assert.equal(released,1);assert.equal((await readJson('browser-login.json',null)).value,null);
  const view=await getLoginView(deps);assert.equal(view.state,'saved');assert.equal(view.site,'dice');assert.equal(view.live_url,undefined);
  await finishLogin(deps);assert.equal(released,1,'a repeat save never releases another session');
  await writeJson('browser-login.json',{id:'different-session',site:'indeed',expires_at:new Date(Date.now()+900000).toISOString(),live_url:'https://www.browserbase.com/different-fixture'});
  const stale=await getLoginView({...deps,expectedId:'fixture'});assert.equal(stale.state,'saved');assert.equal(stale.live_url,undefined,'an old viewer cannot attach to a new login session');
  await finishLogin({...deps,expectedId:'fixture',inspect:async()=> 'signed_in'});await closeLogin({...deps,expectedId:'fixture'});assert.equal(released,1,'old viewer controls cannot close a newer login');assert.equal((await readJson('browser-login.json',null)).value.id,'different-session');
 }finally{if(previous===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=previous;await rm(folder,{recursive:true,force:true});}
});
