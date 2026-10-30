import {readJson} from './store.ts';
import {readSnapshot} from './snapshot.mjs';
import {automationSettings,mutate,activity} from './automation-state.mjs';
import {applicationRunAllowed,fingerprint} from './automation-policy.mjs';
import {leadInView} from './shared.mjs';
import {recordDisposition} from './disposition.mjs';
import {checkPublicPosting,publicPostingUrl} from './posting-status.mjs';

export async function refreshPostingBatch({check=checkPublicPosting,now=new Date()}={}){
 const state=await automationSettings();if(!state.policy.enabled||!applicationRunAllowed(state,now))return false;
 const [{value:snapshot},{value:workflow},{value:validation}]=await Promise.all([readSnapshot(),readJson('workflow.json',{}),readJson('posting-status.json',{postings:{},hosts:{}})]);
 const open=(snapshot?.leads||[]).filter(l=>leadInView(l,workflow[l.id],'opportunities'));
 const stale=open.filter(l=>{const p=validation.postings?.[l.id];return !p||p.source_url!==(l.application_url||l.source_url)||now.getTime()-Date.parse(p.checked_at)>6*3600000;}).slice(0,12);
 if(!stale.length)return false;
 await activity('posting_check_batch',{phase:'validating',title:stale[0].title,message:`Checking current posting availability and published pay for ${stale.length} opportunities.`});
 const updates={},hosts={...validation.hosts},content={};
 for(let offset=0;offset<stale.length;offset+=2){
  const results=await Promise.allSettled(stale.slice(offset,offset+2).map(async lead=>{
   const url=publicPostingUrl(lead),host=url?new URL(url).hostname:null;
   let result;
   if(host&&Date.parse(hosts[host]?.retry_after||'')>now.getTime())result={status:'unknown',checked_at:now.toISOString(),source_url:lead.application_url||lead.source_url,reason:'Public source access is restricted; availability will be checked in the application browser.'};
   else result=await check(lead,{now});
   if(host&&[403,429].includes(result.http_status))hosts[host]={retry_after:new Date(now.getTime()+6*3600000).toISOString(),http_status:result.http_status};
   const {description,...metadata}=result;updates[lead.id]=metadata;
   if(description&&description.length>50)content[lead.id]={text:description,hash:fingerprint(description),validated_at:now.toISOString()};
  }));
  for(const result of results)if(result.status==='rejected')throw result.reason;
 }
 await mutate('posting-status.json',old=>({...old,postings:{...old.postings,...updates},hosts:{...old.hosts,...hosts}}),{postings:{},hosts:{}});
 const closed=stale.filter(l=>updates[l.id]?.status==='closed');
 if(closed.length)await mutate('workflow.json',old=>{for(const lead of closed)if(old[lead.id]?.stage!=='applied'&&!old[lead.id]?.disposition)old[lead.id]={...recordDisposition(old[lead.id],'closed',now.toISOString()),availability_reason:updates[lead.id].reason,availability_evidence:updates[lead.id]};return old;});
 if(Object.keys(content).length)await mutate('job-content.json',old=>({...old,postings:{...old.postings,...content}}),{postings:{}});
 await activity('posting_check_result',{message:`Checked ${stale.length} postings; ${closed.length} confirmed closed and removed from active opportunities.`});
 return true;
}
