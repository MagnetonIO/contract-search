import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { makeAuthConfig } from '../lib/auth-core.mjs';

const directory = await mkdtemp(path.join(tmpdir(),'contract-dashboard-test-'));
const port = await new Promise(resolve=>{const socket=createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const base=`http://127.0.0.1:${port}`;
let logs='';let child;
const fixture={id:'a'.repeat(20),title:'Synthetic Python Engineer',company_agency:'Example Test Company',source:'Fixture',source_job_id:'test1',source_posted_at:'',source_date_text:'',first_seen:new Date().toISOString(),pay:'$110/hr',hourly_min_usd:110,contract_status:'contract',c2c_status:'explicitly accepted',duration:'3 months',remote_location:'Remote US',work_arrangement:'remote',work_abroad_restrictions:'US only',geography:'US',application_url:'https://example.com/jobs/1',source_url:'https://example.com/jobs/1',fit_tier:'1 - remote C2C USD100+/hr',fit_reason:'Python',pipeline:'contract',direct_client_classification:'unverified',direct_client_evidence:'Synthetic fixture',official_employer_url:'',contacts:[],review_score:100};
await writeFile(path.join(directory,'leads.json'),JSON.stringify({generated_at:new Date().toISOString(),collected_at:new Date().toISOString(),leads:[fixture],summary:{new_remote_contracts:1,secondary:0,published_project_needs:0,raw:1,duplicates:0,target:50,source_coverage:[]}}));

async function start(extra={}) {
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env:{...process.env,VERCEL:'',DASHBOARD_AUTH_CONFIG:'',DASHBOARD_LOCAL_DIR:directory,DASHBOARD_STORAGE:'local',...extra},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>{logs=(logs+data).slice(-4000);});child.stderr.on('data',data=>{logs=(logs+data).slice(-4000);});
  for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw new Error('Dashboard test server exited: '+logs);try{const response=await fetch(base+'/api/session');if(response.ok)return;}catch{}await delay(100);}
  throw new Error('Test server did not start: '+logs);
}
async function stop(){if(!child||child.exitCode!==null)return;const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
let cookie='';
async function request(route,{body,origin=base,authenticated=true,form=false}={}){
 const headers={};if(authenticated&&cookie)headers.Cookie=cookie;
 if(body!==undefined){headers.Origin=origin;if(!form)headers['Content-Type']='application/json';}
 const response=await fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:form?body:JSON.stringify(body)});
 return response;
}
try {
 await start();
 assert.equal((await request('data')).status,503,'unconfigured login fails closed');
 const info=await(await request('session')).json();assert.equal(info.setupAllowed,true);assert.equal(info.configured,false);
 assert.equal((await request('setup',{body:{username:'owner',password:'disposable-http-test-password'},origin:'https://attacker.example'})).status,403);
 let response=await request('setup',{body:{username:'owner',password:'disposable-http-test-password'}});assert.equal(response.status,200);
 cookie=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly/i);assert.match(response.headers.get('set-cookie'),/SameSite=Strict/i);
 const authBytes=await readFile(path.join(directory,'auth.json'),'utf8');assert.equal(authBytes.includes('disposable-http-test-password'),false);
 assert.equal((await request('data',{authenticated:false})).status,401);
 assert.equal((await request('resume',{authenticated:false})).status,401);
 response=await request('data');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 let data=await response.json();assert.equal(data.snapshot.leads.length,1);
 response=await request('progress',{body:{id:fixture.id,stage:'saved',notes:'Synthetic private note',version:null},origin:'https://attacker.example'});assert.equal(response.status,403);
 response=await request('progress',{body:{id:fixture.id,stage:'saved',notes:'Synthetic private note',version:null}});assert.equal(response.status,200);let saved=await response.json();
 response=await request('progress',{body:{id:fixture.id,stage:'applied',notes:'stale write',version:null}});assert.equal(response.status,409);
 await stop();await start();data=await(await request('data')).json();assert.equal(data.workflow[fixture.id].notes,'Synthetic private note','notes survive restarts');
 response=await request('profile',{body:{name:'Test Candidate',pitch:'Test introduction',portfolio:'javascript:alert(1)',version:null}});assert.equal(response.status,400);
 const form=new FormData();form.set('file',new Blob(['%PDF-1.4 synthetic test resume'],{type:'application/pdf'}),'test-resume.pdf');
 response=await request('resume',{body:form,form:true});assert.equal(response.status,200);
 response=await request('resume');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);assert.ok((await response.text()).startsWith('%PDF-'));
 execFileSync(process.execPath,['scripts/reset-login.mjs'],{env:{...process.env,VERCEL:'',DASHBOARD_LOCAL_DIR:directory},stdio:'pipe'});
 assert.equal((await request('data')).status,401,'reset revokes old session');
 assert.equal((await request('login',{body:{username:'owner',password:'disposable-http-test-password'}})).status,401,'old password disabled during recovery');
 assert.equal((await request('reset-password',{body:{password:'replacement-http-test-password',confirmation:'wrong'}})).status,400);
 response=await request('reset-password',{body:{password:'replacement-http-test-password',confirmation:'replacement-http-test-password'}});assert.equal(response.status,200);cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('reset-password',{body:{password:'different-http-test-password',confirmation:'different-http-test-password'}})).status,403,'recovery is single use');
 assert.equal((await request('data')).status,200);
 await request('logout',{body:{}});cookie='';assert.equal((await request('data')).status,401);
 for(let i=0;i<10;i++)assert.equal((await request('login',{body:{username:'owner',password:'wrong'}})).status,401);
 assert.equal((await request('login',{body:{username:'owner',password:'wrong'}})).status,429,'failed logins rate limited');
 await stop();
 const hostedConfig={...makeAuthConfig('hosted-owner','synthetic-hosted-password-only'),resetAllowedUntil:Date.now()+60000};
 await start({VERCEL:'1',DASHBOARD_AUTH_CONFIG:JSON.stringify(hostedConfig)});
 const hosted=await(await request('session')).json();assert.equal(hosted.setupAllowed,false);assert.equal(hosted.resetAllowed,false);
 assert.equal((await request('setup',{body:{username:'attacker',password:'synthetic-attacker-password'}})).status,403);
 assert.equal((await request('reset-password',{body:{password:'replacement-hosted-password',confirmation:'replacement-hosted-password'}})).status,403,'local recovery never available on hosted deployment');
 console.log('HTTP integration passed: auth, CSRF, persistent notes, stale-write protection, private resume, recovery, session revocation, rate limits, hosted setup denial.');
} finally { await stop();await rm(directory,{recursive:true,force:true}); }
