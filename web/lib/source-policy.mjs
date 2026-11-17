export const APPLICATION_SOURCES=['LinkedIn','Indeed','Greenhouse','Dice'];
const key=value=>String(value||'').trim().toLowerCase();
function names(lead){
 const result=[lead?.source];
 for(const raw of [lead?.application_url,lead?.source_url])try{
  const host=new URL(raw).hostname.toLowerCase();
  for(const [domain,name] of [['dice.com','Dice'],['linkedin.com','LinkedIn'],['indeed.com','Indeed'],['greenhouse.io','Greenhouse']])if(host===domain||host.endsWith('.'+domain))result.push(name);
 }catch{}
 return result.filter(Boolean);
}
export function blockedApplicationSource(lead,policy={}){
 const disabled=new Set((policy.disabled_sources||[]).map(key));
 return names(lead).find(name=>disabled.has(key(name)))||null;
}
export function withoutRemovedSources(snapshot,workflow,policy={}){
 if(!snapshot?.leads||!policy.removed_sources?.length)return snapshot;
 const removed=new Set(policy.removed_sources.map(key));
 return {...snapshot,leads:snapshot.leads.filter(lead=>workflow[lead.id]?.stage==='applied'||workflow[lead.id]?.application?.submission_recorded_at||!names(lead).some(name=>removed.has(key(name))))};
}
