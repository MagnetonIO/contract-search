import {createGateway} from '@ai-sdk/gateway';
import {readJson,writeJson,ConflictError} from './store.ts';

// Hosted requests belong to this Vercel project, even if a shared key is set.
export function projectGateway(){
 const token=process.env.VERCEL_OIDC_TOKEN;
 return createGateway({...(token?{apiKey:token,headers:{'ai-gateway-auth-method':'oidc'}}:{}),fetch:(url,init)=>fetch(url,{...init,...(/\/v1\/(?:generation|credits)/.test(String(url))?{signal:AbortSignal.timeout(5000)}:{})})});
}
export const gatewayModel=id=>projectGateway()(id);
export async function reservationCost(cost_id,estimated_ai_usd,browser_estimate_usd=0){
 const data=(await readJson('ai-gateway-usage.json',{generations:{}})).value;
 const rows=Object.values(data.generations||{}).filter(g=>g.cost_id===cost_id);
 const complete=rows.length>0&&rows.every(g=>g.status==='reported');
 const reported=rows.filter(g=>g.status==='reported').reduce((s,g)=>s+g.cost_usd,0);
 return {usd:(complete?reported:Math.max(estimated_ai_usd,reported))+browser_estimate_usd,details:{cost_basis:complete?'gateway_reported_plus_browser_estimate':'token_estimate',gateway_reported_usd:reported,gateway_cost_complete:complete,estimated_ai_usd,browser_estimate_usd,generation_ids:rows.map(g=>g.id)}};
}
async function update(change){
 for(let n=0;n<8;n++){
  const old=await readJson('ai-gateway-usage.json',{generations:{}});
  try{const next=change(old.value);await writeJson('ai-gateway-usage.json',next,old.version);return next;}catch(e){if(!(e instanceof ConflictError))throw e;}
 }
 throw Error('Gateway usage record is busy');
}
export function gatewayCostSummary(data,now=new Date()){
 const month=now.toISOString().slice(0,7),rows=Object.values(data?.generations||{}).filter(g=>String(g.created_at).startsWith(month));
 return {month,tracking_started_at:data?.tracking_started_at||null,reported_usd:rows.reduce((s,g)=>s+(g.status==='reported'?g.cost_usd:0),0),reported_generations:rows.filter(g=>g.status==='reported').length,pending_generations:rows.filter(g=>g.status!=='reported').length,balance:data?.balance||null};
}
export async function recordGatewayUsage(result,{cost_id,phase,attempt_id=null,model=null},{client=projectGateway(),defer=false}={}){
 const id=result?.providerMetadata?.gateway?.generationId;
 if(typeof id!=='string'||!id)return {reported:false};
 const now=new Date().toISOString();
 await update(old=>({...old,tracking_started_at:old.tracking_started_at||now,generations:{...old.generations,[id]:old.generations[id]||{id,cost_id,attempt_id,phase,model,created_at:now,status:'pending'}}}));
 if(defer)return {reported:false,id};
 await update(old=>({...old,generations:{...old.generations,[id]:{...old.generations[id],last_lookup_at:now}}}));
 try{
  const info=await client.getGenerationInfo({id});
  if(!Number.isFinite(info.totalCost)||info.totalCost<0)throw Error('Cost not available');
  await update(old=>({...old,generations:{...old.generations,[id]:{...old.generations[id],status:'reported',cost_usd:info.totalCost,model:info.model,provider:info.providerName,reported_at:new Date().toISOString()}}}));
  return {reported:true,usd:info.totalCost,id};
 }catch{return {reported:false,id};}
}
export async function refreshGatewayUsage({client=projectGateway(),now=new Date()}={}){
 let data=(await readJson('ai-gateway-usage.json',{generations:{}})).value;
 // Provider ingestion can lag; a missing lookup remains pending, never zero.
 const pending=Object.values(data.generations||{}).filter(g=>g.status!=='reported').sort((a,b)=>String(a.last_lookup_at||'').localeCompare(String(b.last_lookup_at||''))).slice(0,5);
 await Promise.allSettled(pending.map(g=>recordGatewayUsage({providerMetadata:{gateway:{generationId:g.id}}},g,{client})));
 if(!data.balance?.checked_at||now.getTime()-Date.parse(data.balance.checked_at)>5*60000){
  try{const credit=await client.getCredits();await update(old=>({...old,balance:{usd:Number(credit.balance),checked_at:now.toISOString(),scope:'vercel_team'}}));}catch{/* No provider balance is invented when unavailable. */}
 }
 data=(await readJson('ai-gateway-usage.json',{generations:{}})).value;
 return gatewayCostSummary(data,now);
}
