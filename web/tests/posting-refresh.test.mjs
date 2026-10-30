import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {readJson,writeJson} from '../lib/store.ts';import {refreshPostingBatch} from '../lib/posting-refresh.mjs';import {readSnapshot} from '../lib/snapshot.mjs';
test('a bounded public sweep removes confirmed closed jobs, overlays pay, caches checks, and preserves submitted history',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'contract-posting-check-')),prior=process.env.DASHBOARD_LOCAL_DIR;process.env.DASHBOARD_LOCAL_DIR=folder;
 try{
  const now=new Date('2026-10-30T14:30:00Z');const lead=id=>({id,title:'Engineer',pipeline:'contract',source_url:'https://www.dice.com/job-detail/'+id,pay:'unknown'});
  await writeJson('leads.json',{leads:[lead('closed'),lead('paid'),lead('applied')]});await writeJson('automation-settings.json',{enabled:true});await writeJson('workflow.json',{closed:{stage:'new',notes:'Keep my note'},applied:{stage:'applied',events:[{kind:'submitted'}]}});
  const checked=[];const check=async l=>{checked.push(l.id);return {status:l.id==='closed'?'closed':'open',pay:'$70 - $73/hr',checked_at:now.toISOString(),source_url:l.source_url};};
  assert.equal(await refreshPostingBatch({check,now}),true);assert.deepEqual(checked.sort(),['closed','paid']);
  assert.equal(await refreshPostingBatch({check,now}),false);assert.equal(checked.length,2);
  const w=(await readJson('workflow.json',{})).value;assert.equal(w.closed.disposition.status,'closed');assert.equal(w.closed.notes,'Keep my note');assert.equal(w.applied.stage,'applied');
  assert.equal((await readSnapshot()).value.leads.find(x=>x.id==='paid').pay,'$70 - $73/hr');
 }finally{if(prior===undefined)delete process.env.DASHBOARD_LOCAL_DIR;else process.env.DASHBOARD_LOCAL_DIR=prior;await rm(folder,{recursive:true,force:true});}
});
