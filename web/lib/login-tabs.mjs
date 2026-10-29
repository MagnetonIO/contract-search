const viewerUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='browserbase.com'||u.hostname.endsWith('.browserbase.com'))?u.href:null;}catch{return null;}};
export function loginTabs(debug){
 return (debug?.pages||[]).flatMap(page=>{
  const live_url=viewerUrl(page.debuggerFullscreenUrl||page.debuggerUrl);if(!live_url||!page.id)return [];
  let origin='about:blank';try{const u=new URL(page.url);if(u.origin!=='null')origin=u.origin;}catch{}
  const label=origin==='https://accounts.google.com'?'Google sign-in':origin==='https://appleid.apple.com'?'Apple sign-in':String(page.title||'').trim().slice(0,100)||origin;
  // OAuth codes/state and account URLs stay in the remote browser. Only its
  // origin, title and provider-generated viewing link are exposed to its owner.
  return [{id:String(page.id),label,origin,live_url}];
 });
}
export function selectLoginTab(tabs,selectedId,knownIds=[]){
 if(!tabs.length)return null;
 const visible=tabs.filter(tab=>tab.origin!=='about:blank');const candidates=visible.length?visible:tabs;
 const added=candidates.filter(tab=>!knownIds.includes(tab.id));
 if(added.length)return added.at(-1);
 return candidates.find(tab=>tab.id===selectedId)||candidates.at(-1);
}
