'use client';
import {useEffect,useRef,useState} from 'react';
import type {DashboardData} from '../lib/types';
import {WORKFLOW_URL} from '../lib/collection-status.mjs';
import {safeWebUrl} from '../lib/shared.mjs';

export default function CollectionPull({data,onRefresh}:{data:DashboardData|null;onRefresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [requestedAt,setRequestedAt]=useState(''),[now,setNow]=useState(Date.now());
 const refresh=useRef(onRefresh);refresh.current=onRefresh;
 const requestTime=Math.max(Date.parse(requestedAt)||0,data?.collectionDispatch?.status==='failed'?0:Date.parse(data?.collectionDispatch?.attempted_at||'')||0);
 const run=data?.collection,started=Date.parse(run?.started_at||'')||0,finished=Date.parse(run?.finished_at||'')||0;
 const running=run?.status==='running'&&now-started<55*60000;
 const queued=requestTime>0&&now-requestTime<5*60000&&finished<requestTime&&started<requestTime;
 const waiting=busy||running||queued;
 const completed=requestedAt&&finished>=Date.parse(requestedAt);
 useEffect(()=>{if(!waiting)return;const timer=setInterval(()=>{setNow(Date.now());void refresh.current();},10000);return()=>clearInterval(timer);},[waiting]);
 async function pull(){
  if(waiting)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/collect-now',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Could not start job collection.');
   if(!['dispatched','dispatch_pending','runner_active'].includes(result.status))throw Error(result.detail||'Collection could not be started. Try again or check Source coverage.');
   setRequestedAt(result.requested_at||new Date().toISOString());setNow(Date.now());
   await refresh.current();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="collection-pull">
  <button className="button secondary" disabled={!data||waiting} onClick={()=>void pull()} aria-busy={waiting}>
   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden="true"><path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/></svg>
   {busy?'Starting…':running?'Getting new jobs…':queued?'Collection queued…':'Get new jobs'}
  </button>
  {error?<p role="alert" className="collection-error">{error}</p>:waiting?<p role="status">{running?'Searching sources. Results will update here.':'Waiting for the collector to start.'} <a href={safeWebUrl(run?.run_url||'')||WORKFLOW_URL} target="_blank" rel="noreferrer">View progress</a></p>:completed?<p role="status">{run?.status==='failed'?'Collection failed. Check Source coverage.':run?.status==='completed_with_warnings'?'Results updated; some sources failed. Check Source coverage.':'Collection finished. The list is up to date.'}</p>:requestedAt?<p role="status">No new collector heartbeat yet. <a href={WORKFLOW_URL} target="_blank" rel="noreferrer">Check the run</a> or try again.</p>:null}
 </div>;
}
