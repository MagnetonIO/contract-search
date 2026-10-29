import Browserbase from '@browserbasehq/sdk';
import {readJson} from './store.ts';
import {mutate} from './automation-state.mjs';
export const bb=()=>new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY,maxRetries:0});
export async function browserSession(timeout=300){
 const client=bb();let context=(await readJson('browser-context.json',null)).value;
 if(!context){const created=await client.contexts.create({projectId:process.env.BROWSERBASE_PROJECT_ID});context={id:created.id};await mutate('browser-context.json',old=>old||context,null);context=(await readJson('browser-context.json',null)).value;}
 const session=await client.sessions.create({projectId:process.env.BROWSERBASE_PROJECT_ID,api_timeout:timeout,keepAlive:true,proxies:false,browserSettings:{context:{id:context.id,persist:true},recordSession:false,solveCaptchas:false,viewport:{width:1440,height:900}}});
 return session;
}
