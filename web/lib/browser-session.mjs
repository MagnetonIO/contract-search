import Browserbase from '@browserbasehq/sdk';
import {readJson} from './store.ts';
import {mutate} from './automation-state.mjs';
export const bb=()=>new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY,maxRetries:0});
async function checkProxyAllowance(client){
 let timer;
 const rows=await Promise.race([(async()=>{
  const projects=await client.projects.list({timeout:5000});
  if(!projects.length)throw Error('Browserbase proxy usage is unavailable');
  return Promise.all(projects.map(p=>client.projects.usage(p.id,{timeout:5000})));
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browserbase proxy usage lookup timed out')),10000);})]).finally(()=>clearTimeout(timer));
 if(rows.some(r=>!Number.isFinite(r.proxyBytes)||r.proxyBytes<0))throw Error('Browserbase proxy usage is unavailable');
 const proxyBytes=rows.reduce((sum,r)=>sum+r.proxyBytes,0),limit=900000000;
 // Developer includes 1 GB; retain headroom and meter all accessible projects
 // because the provider allowance is shared. This is traffic, never a charge.
 await mutate('browserbase-usage.json',()=>({proxy_bytes:proxyBytes,proxy_limit_bytes:limit,scope:'all_accessible_projects',checked_at:new Date().toISOString()}),null);
 if(proxyBytes>=limit)throw Error('Browserbase proxy usage limit reached; keep other application sources running');
}
export async function browserSession(timeout=300,{isolated=false,proxyCountry=null}={},client=bb()){
 if(proxyCountry!==null&&proxyCountry!=='US')throw Error('Unsupported application proxy location');
 if(proxyCountry)await checkProxyAllowance(client);
 let context=isolated?null:(await readJson('browser-context.json',null)).value;
 if(!isolated&&!context){const created=await client.contexts.create({projectId:process.env.BROWSERBASE_PROJECT_ID});context={id:created.id};await mutate('browser-context.json',old=>old||context,null);context=(await readJson('browser-context.json',null)).value;}
 const holds=(await readJson('application-attempts.json',{})).value;
 // Concurrent sessions can read an authentication snapshot, but only one may
 // persist changes while a human owns another live form using that snapshot.
 const held=Object.values(holds).some(a=>a.verification?.state==='active'&&Date.parse(a.verification.expires_at)>Date.now()&&a.verification.context_id===context?.id);
 const session=await client.sessions.create({projectId:process.env.BROWSERBASE_PROJECT_ID,api_timeout:timeout,keepAlive:true,proxies:proxyCountry?[{type:'browserbase',geolocation:{country:proxyCountry}}]:false,browserSettings:{...(!isolated?{context:{id:context.id,persist:!held}}:{}),recordSession:false,logSession:false,solveCaptchas:true,viewport:{width:1440,height:900}}});
 return {...session,context_id:context?.id||null};
}
