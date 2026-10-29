'use client';
import {useEffect,useRef,useState} from 'react';
import {selectLoginTab} from '../../lib/login-tabs.mjs';
type LoginTab={id:string,label:string,origin:string,live_url:string};
export default function LoginBrowser(){
 const [view,setView]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[disconnected,setDisconnected]=useState(false),[frameKey,setFrameKey]=useState(0);
 const [selectedFrame,setSelectedFrame]=useState<LoginTab|null>(null);
 const frame=useRef<HTMLIFrameElement>(null),selectedId=useRef<string|null>(null),knownIds=useRef<string[]>([]),loading=useRef(false);
 function choose(tab:LoginTab){selectedId.current=tab.id;setSelectedFrame(old=>old&&old.id===tab.id?{...tab,live_url:old.live_url}:tab);setDisconnected(false);}
 async function load(){if(loading.current)return;loading.current=true;try{const response=await fetch('/api/browser-login-view'+window.location.search,{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Sign into Contract Desk to open this browser.');if(data.state==='unavailable'){setError(data.message);return;}if(data.state==='active'){
   const tabs:LoginTab[]=data.tabs||[];const tab=selectLoginTab(tabs,selectedId.current,knownIds.current);
   if(tab){const changed=selectedId.current!==tab.id;selectedId.current=tab.id;setSelectedFrame(old=>old&&old.id===tab.id?{...tab,live_url:old.live_url}:tab);if(changed)setDisconnected(false);}
   else{selectedId.current=null;setSelectedFrame(null);}
   // A popup may first appear as about:blank. Treat it as new after navigation.
   knownIds.current=tabs.filter(tab=>tab.origin!=='about:blank').map(tab=>tab.id);
  }setView(data);}catch(e){setError((e as Error).message);}finally{loading.current=false;}}
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),3000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{function onMessage(event:MessageEvent){if(event.source!==frame.current?.contentWindow||event.data!=='browserbase-disconnected')return;try{if(event.origin!==new URL(selectedFrame?.live_url||'').origin)return;}catch{return;}setDisconnected(true);void load();}window.addEventListener('message',onMessage);return()=>window.removeEventListener('message',onMessage);},[selectedFrame?.live_url]);
 async function act(path:string,body:Record<string,unknown>={}){setBusy(true);setError('');try{const response=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(['browser-login-finish','browser-login-close'].includes(path)?{...body,id:new URLSearchParams(window.location.search).get('id')}:body)});const result=await response.json();if(!response.ok)throw Error(result.error||'Browser action failed');if(result.viewer_url){window.location.replace(result.viewer_url);return;}if(result.message)setError(result.message);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const active=view?.state==='active';const closed=view&&['saved','closed','expired'].includes(view.state);
 return <main className="login-viewer"><header><div><h1>{view?.name||view?.site||'Website'} sign-in</h1><p>Sign in directly in the private browser. Contract Desk does not read or store your password.</p></div><a className="button secondary" href="/?view=automation" target="_blank" rel="noreferrer">Back to automation</a></header>
  {error&&<p className="login-viewer-notice" role="status">{error}</p>}
  {active&&<><div className="automation-actions"><button className="button primary" disabled={busy} onClick={()=>void act('browser-login-finish')}>Verify and save sign-in</button><button className="button secondary" disabled={busy} onClick={()=>void act('browser-login-close')}>Close and keep session</button><button className="button secondary" disabled={busy} onClick={()=>{setDisconnected(false);setFrameKey(x=>x+1);void load();}}>Reconnect view</button><span>Closes at {new Date(view.expires_at).toLocaleTimeString()}.</span></div>
   <p className="login-tabs-help">Google or Apple sign-in may open another tab. New sign-in tabs appear here automatically.</p>
   <div className="login-tabs" role="tablist" aria-label="Private browser tabs">{(view.tabs||[]).map((tab:LoginTab)=><button key={tab.id} type="button" role="tab" aria-selected={selectedFrame?.id===tab.id} className={'button '+(selectedFrame?.id===tab.id?'primary':'secondary')} onClick={()=>choose(tab)}>{tab.label}<small>{tab.origin}</small></button>)}</div>
   {disconnected?<div className="login-viewer-ended"><h2>Viewing connection disconnected</h2><p>Your browser may still be running. Reconnect the view to continue; your remote page stays open.</p></div>:selectedFrame?<iframe key={selectedFrame.id+':'+frameKey} ref={frame} title="Private website sign-in browser" src={selectedFrame.live_url} sandbox="allow-same-origin allow-scripts" allow="clipboard-read; clipboard-write"/>:<p role="status">Waiting for the browser tab…</p>}</>}
  {view?.state==='closing'&&<div className="login-viewer-ended"><h2>Saving your browser session…</h2><p>Waiting for the saved session to finish before another website can open.</p></div>}
  {closed&&<div className="login-viewer-ended"><h2>{view.state==='saved'?'Sign-in verified and saved':view.state==='expired'?'Sign-in browser expired':'Browser session closed'}</h2><p>{view.state==='saved'?'You can close this tab and return to Automatic applications.':view.state==='expired'?'Open a new sign-in browser to continue. Previously saved site sessions are retained.':'Saved browser data is retained. Sign-in may still need verification.'}</p><div className="automation-actions"><a className="button primary" href="/?view=automation">Return to automation</a>{view.site&&<button className="button secondary" disabled={busy} onClick={()=>void act('browser-login',{site:view.site})}>Reopen sign-in browser</button>}</div></div>}
  {!view&&!error&&<p>Connecting to your private sign-in browser…</p>}
 </main>;
}
