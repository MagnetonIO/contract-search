import Browserbase from '@browserbasehq/sdk';
import {readJson} from './store.ts';
import {mutate} from './automation-state.mjs';
export const bb=()=>new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY,maxRetries:0});
export async function browserSession(timeout=300,{isolated=false,proxyCountry=null}={}){
 if(proxyCountry!==null&&proxyCountry!=='US')throw Error('Unsupported application proxy location');
 const client=bb();let context=isolated?null:(await readJson('browser-context.json',null)).value;
 if(!isolated&&!context){const created=await client.contexts.create({projectId:process.env.BROWSERBASE_PROJECT_ID});context={id:created.id};await mutate('browser-context.json',old=>old||context,null);context=(await readJson('browser-context.json',null)).value;}
 const holds=(await readJson('application-attempts.json',{})).value;
 // Concurrent sessions can read an authentication snapshot, but only one may
 // persist changes while a human owns another live form using that snapshot.
 const held=Object.values(holds).some(a=>a.verification?.state==='active'&&Date.parse(a.verification.expires_at)>Date.now()&&a.verification.context_id===context?.id);
 const session=await client.sessions.create({projectId:process.env.BROWSERBASE_PROJECT_ID,api_timeout:timeout,keepAlive:true,proxies:proxyCountry?[{type:'browserbase',geolocation:{country:proxyCountry}}]:false,browserSettings:{...(!isolated?{context:{id:context.id,persist:!held}}:{}),recordSession:false,logSession:false,solveCaptchas:true,viewport:{width:1440,height:900}}});
 return {...session,context_id:context?.id||null};
}
