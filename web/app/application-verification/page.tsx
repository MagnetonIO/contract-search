'use client';
import {useEffect,useState} from 'react';
export default function ApplicationVerification(){
 const [view,setView]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[frame,setFrame]=useState(0),[screen,setScreen]=useState<{id:string,url:string}|null>(null);
 const id=()=>new URLSearchParams(window.location.search).get('id');
 async function load(){try{const r=await fetch('/api/application-verification?id='+encodeURIComponent(id()||''),{cache:'no-store'});const result=await r.json();if(!r.ok)throw Error(result.error||'Sign in to open verification.');if(result.state==='active'&&result.tabs?.[0])setScreen(old=>old?.id===result.session_id?old:{id:result.session_id,url:result.tabs[0].live_url});else if(result.state!=='active')setScreen(null);setView(result);}catch(e){setError((e as Error).message);}}
 async function act(action:string){setBusy(true);setError('');try{const r=await fetch('/api/application-verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id(),action})});const result=await r.json();if(!r.ok)throw Error(result.error||'Verification action failed.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),5000);return()=>clearInterval(timer);},[]);
 return <main className="login-viewer"><header><div><h1>Complete email verification</h1><p>{view?.title}</p></div><a className="button secondary" href="/?view=automation">Back to automation</a></header>
  <p>Enter the employer’s email code directly in the private browser, then use its Submit application button. Your code is not saved by Contract Desk.</p>
  {error&&<p role="alert" className="login-viewer-notice">{error}</p>}
  {view?.message&&<p role="status" className="login-viewer-notice">{view.message}</p>}
  {view?.state==='active'&&<><div className="automation-actions"><button className="button primary" disabled={busy} onClick={()=>void act('check')}>Check submission confirmation</button><button className="button secondary" disabled={busy} onClick={()=>void act('close')}>Close browser</button><button className="button secondary" onClick={()=>{setScreen(null);setFrame(x=>x+1);void load();}}>Reconnect view</button><span>Open until {new Date(view.expires_at).toLocaleTimeString()}.</span></div>{screen?<iframe key={frame} title="Private employer verification browser" src={screen.url} sandbox="allow-same-origin allow-scripts" allow="clipboard-read; clipboard-write"/>:<p>Connecting to the employer page…</p>}</>}
  {view?.state==='submitted'&&<section className="login-viewer-ended"><h2>Application confirmed</h2><p>{view.receipt}</p><a className="button primary" href="/?view=applications">View applications</a></section>}
  {view&&['closed','expired'].includes(view.state)&&<section className="login-viewer-ended"><h2>{view.state==='expired'?'Verification browser expired':'Verification browser is closed'}</h2><p>The earlier code screen is no longer open. Reopen your prepared form, review it, and request a fresh code from the employer. Nothing is resubmitted automatically.</p>{view.can_reopen&&<button className="button primary" disabled={busy} onClick={()=>void act('open')}>{busy?'Preparing form…':'Reopen prepared form'}</button>}</section>}
  {!view&&!error&&<p>Loading verification…</p>}
 </main>;
}
