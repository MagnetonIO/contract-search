'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApplicationEvent, DashboardData, Lead, LeadProgress, Profile, Stage, Evidence, Contact } from '../lib/types';
import type { OutreachMessage } from '../lib/outreach';
import { STAGES } from '../lib/types';
import { safeWebUrl, formatPay, draftEmail, contactEmails, emailHref, applicationUrl, leadInView, usLocation, locationLabel } from '../lib/shared.mjs';

type IconName = 'grid'|'search'|'bookmark'|'send'|'briefcase'|'user'|'shield'|'arrow'|'check'|'close'|'mail'|'copy'|'link'|'file'|'refresh'|'clock'|'logout'|'filter'|'chevron';
const paths: Record<IconName,string> = {
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  search:'m21 21-5-5M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15',
  bookmark:'M6 3h12v18l-6-4-6 4z',send:'m3 3 19 9-19 9 4-9-4-9zm4 9h15',
  briefcase:'M3 7h18v14H3zM8 7V3h8v4M3 12c6 4 12 4 18 0M10 14h4',
  user:'M4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4zm-4 10 3 3 5-6',
  arrow:'M5 12h14m-6-6 6 6-6 6',check:'m5 12 4 4L19 6',close:'m6 6 12 12M6 18 18 6',
  mail:'M3 5h18v14H3zM3 5l9 8 9-8',copy:'M9 9h12v12H9zM15 9V3H3v12h6',
  link:'m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  file:'M5 2h9l5 5v15H5zM14 2v6h5M8 13h8M8 17h6',
  refresh:'M20 7a9 9 0 1 0 1 8M20 2v6h-6',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2',
  logout:'M9 3H3v18h6M9 12h12m-5-5 5 5-5 5',filter:'M3 4h18l-7 8v7l-4 2v-9z',chevron:'m9 5 7 7-7 7',
};
function Icon({name,size=18}:{name:IconName;size?:number}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>; }
const stageName = (stage: string) => ({new:'New',saved:'Saved',ready:'Ready for outreach',contacted:'Contacted',applying:'Application started',applied:'Submitted',not_a_fit:'Not a fit'}[stage] || stage);
const date = (value:string) => value ? new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Not provided';
async function api(path: string, body?: unknown) {
  const response = await fetch('/api/'+path, body instanceof FormData ? {method:'POST',body} : body !== undefined ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true} : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not complete this action.');
  return data;
}
function External({href,children,className='',...props}:{href:string;children:React.ReactNode;className?:string;title?:string;onClick?:()=>void}) {
  const safe = safeWebUrl(href); if (!safe) return null;
  return <a href={safe} target="_blank" rel="noopener noreferrer" className={className} {...props}>{children}</a>;
}
function Badge({children,tone='neutral'}:{children:React.ReactNode;tone?:string}) { return <span className={'badge '+tone}>{children}</span>; }

type PendingApplication = { id:string; submittedId:string; cancelledId:string };
const pendingKey = 'contract_desk_pending_applications';

export default function Dashboard() {
  const [session,setSession] = useState<{authenticated:boolean;configured:boolean;setupAllowed:boolean;resetAllowed?:boolean;resetPending?:boolean}|null>(null);
  const [data,setData] = useState<DashboardData|null>(null);
  const [error,setError] = useState(''); const [toast,setToast] = useState('');
  const [view,setView] = useState('opportunities'); const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('all'); const [source,setSource] = useState('all');
  const [sort,setSort] = useState('fit'); const [selected,setSelected] = useState<string|null>(null); const [page,setPage] = useState(0);
  const openedInitialLink = useRef(false);
  const pendingRef = useRef<PendingApplication[]>([]);
  const [pending,setPending] = useState<PendingApplication[]>([]);
  const [returned,setReturned] = useState(false);
  const [opening,setOpening] = useState(0);
  function rememberPending(next:PendingApplication[]) {
    pendingRef.current=next;setPending(next);
    try {sessionStorage.setItem(pendingKey,JSON.stringify(next));} catch { /* Tracking still works for this page when browser storage is unavailable. */ }
  }
  function dismissPending(id:string){rememberPending(pendingRef.current.filter(item=>item.id!==id));}
  useEffect(()=>{try {
    const saved=JSON.parse(sessionStorage.getItem(pendingKey)||'[]');
    if(Array.isArray(saved))rememberPending(saved.filter(item=>item&&/^[a-f0-9]{20}$/.test(item.id)&&/^[a-f0-9-]{36}$/.test(item.submittedId)&&/^[a-f0-9-]{36}$/.test(item.cancelledId)).slice(-20));
    setReturned(true);
  } catch { /* Ignore unavailable or invalid browser storage. */ }},[]);
  const notify = (message:string) => {setToast(message);setTimeout(()=>setToast(''),3500);};
  async function load() { setError(''); try { const current=await api('session');setSession(current);if(current.authenticated){const next=await api('data');if(!openedInitialLink.current){openedInitialLink.current=true;const linked=new URLSearchParams(window.location.search).get('lead');if(linked&&next.workflow[linked]?.stage==='applied')setView('applied');else if(linked&&next.snapshot.leads.some((l:Lead)=>l.id===linked&&l.pipeline==='email_review'))setView('email_review');}setData(next);setSelected(old=>{const id=new URLSearchParams(window.location.search).get('lead');return old||(next.snapshot.leads.some((lead:Lead)=>lead.id===id)?id:null)||(window.innerWidth>=930?next.snapshot.leads.find((lead:Lead)=>leadInView(lead,next.workflow[lead.id],view))?.id:null)||null;});}}catch(e){setError((e as Error).message);} }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible'){setReturned(false);void load().finally(()=>setReturned(true));}};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[view]);
  function selectLead(id:string|null){setSelected(id);const url=new URL(window.location.href);if(id)url.searchParams.set('lead',id);else url.searchParams.delete('lead');window.history.replaceState(null,'',url);}
  function switchView(next:string){setView(next);setFilter('all');setSearch('');setSource('all');selectLead(null);}
  useEffect(()=>setPage(0),[search,filter,source,sort,view]);
  const leads=data?.snapshot.leads||[];
  const contracts=leads.filter(lead=>leadInView(lead,data?.workflow[lead.id],'opportunities'));
  const visible=useMemo(()=>{
    let rows=leads.filter(lead=>{
      if(!leadInView(lead,data?.workflow[lead.id],view))return false;
      if(filter==='us' && !usLocation(lead))return false;
      if(filter==='c2c' && !lead.fit_tier.startsWith('1 -'))return false;
      if(filter==='email' && !contactEmails(lead).length)return false;
      if(filter==='reviewed' && !lead.qualification)return false;
      if(source!=='all' && lead.source!==source)return false;
      return `${lead.title} ${lead.company_agency} ${lead.fit_reason} ${lead.qualification?.summary||''}`.toLowerCase().includes(search.toLowerCase());
    });
    rows=[...rows].sort((a,b)=>sort==='newest'?b.first_seen.localeCompare(a.first_seen):sort==='pay'?Number(b.hourly_min_usd||0)-Number(a.hourly_min_usd||0):b.review_score-a.review_score);
    return rows;
  },[leads,data?.workflow,view,filter,source,search,sort]);
  const previousRows=useRef<string[]>([]);
  useEffect(()=>{
    if(view==='opportunities'&&selected&&data?.workflow[selected]?.stage==='applied'){
      const index=Math.max(0,previousRows.current.indexOf(selected));
      selectLead(window.innerWidth>=930?visible[Math.min(index,visible.length-1)]?.id||null:null);
    }
    previousRows.current=visible.map(lead=>lead.id);
  },[view,selected,data?.workflow,visible]);
  useEffect(()=>setPage(old=>Math.min(old,Math.max(0,Math.ceil(visible.length/20)-1))),[visible.length]);
  const active=leads.find(lead=>lead.id===selected);
  async function progress(lead:Lead,stage:Stage,notes:string) {
    if(!data)return; const updated=await api('progress',{id:lead.id,stage,notes,version:data.version});setData(old=>old?{...old,workflow:updated.workflow,version:updated.version}:old);if(stage==='applied')notify('Submitted — saved in Applications');else notify('Pipeline updated');
  }
  async function application(lead:Lead,kind:ApplicationEvent['kind'],eventId:string=crypto.randomUUID()) {
    if(kind==='opened'){
      if(data?.workflow[lead.id]?.stage!=='applied'){
        setReturned(false);
        rememberPending([...pendingRef.current.filter(item=>item.id!==lead.id),{id:lead.id,submittedId:crypto.randomUUID(),cancelledId:crypto.randomUUID()}]);
      }
      setOpening(count=>count+1);
    }
    try {
      const updated=await api('application',{id:lead.id,kind,eventId});
      setData(old=>old?{...old,workflow:updated.workflow,version:updated.version}:old);
      if(kind!=='opened')dismissPending(lead.id);
      notify(kind==='opened'?'Application started. Confirm submission when you return.':kind==='submitted'?'Submitted — saved in Applications':'Application cancelled — opportunity stays open');
    } finally {if(kind==='opened')setOpening(count=>count-1);}
  }
  const waiting=pending.find(item=>data?.snapshot.leads.some(lead=>lead.id===item.id)&&data.workflow[item.id]?.stage!=='applied');
  const returnLead=leads.find(lead=>lead.id===waiting?.id);
  if(!session)return <div className="loading-screen"><div className="brand-mark">C</div><p>{error||'Opening your workspace…'}</p>{error&&<button onClick={load}>Try again</button>}</div>;
  if(!session.authenticated)return <Login setup={!session.configured&&session.setupAllowed} reset={Boolean(session.resetAllowed)} resetPending={Boolean(session.resetPending)} unavailable={(!session.configured&&!session.setupAllowed)||Boolean(session.resetPending&&!session.resetAllowed)} onDone={load}/>;
  const nav:[string,string,IconName,number?][]=[['opportunities','Opportunities','grid',contracts.length],['email_review','Needs review','mail',leads.filter(l=>l.pipeline==='email_review'&&data?.workflow[l.id]?.stage!=='applied').length],['review','Reviewed leads','shield',leads.filter(lead=>lead.qualification).length],['saved','Saved & ready','bookmark',Object.values(data?.workflow||{}).filter(p=>['saved','ready'].includes(p.stage)).length],['contacted','Contacted','send'],['applied','Applications','briefcase',Object.values(data?.workflow||{}).filter(p=>['applying','applied'].includes(p.stage)).length],['secondary','Secondary roles','filter'],['projects','Project needs','file']];
  const titles:Record<string,string>={opportunities:'Contract opportunities',email_review:'Email leads — needs review',review:'Reviewed leads',saved:'Saved & ready',contacted:'Contact history',applied:'Your applications',secondary:'Secondary opportunities',projects:'Published project needs',profile:'Your profile & resume',coverage:'Search coverage'};
  return <div className="app-shell">
    <aside className="sidebar"><a href="/" className="brand"><span className="brand-mark">C</span><span>Contract Desk<small>Your next engagement</small></span></a>
      <nav aria-label="Workspace">{nav.map(([key,label,icon,count])=><button key={key} onClick={()=>switchView(key)} className={view===key?'active':''}><Icon name={icon}/><span>{label}</span>{count!==undefined&&<span className="nav-count">{count}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="schedule"><Icon name="clock"/><div><strong>Weekday search</strong><span>8:07am Chicago</span></div><span className="status-dot"/></div><button className={view==='coverage'?'nav-extra active':'nav-extra'} onClick={()=>setView('coverage')}><Icon name="shield"/>Source coverage</button><button className={view==='profile'?'nav-extra active':'nav-extra'} onClick={()=>setView('profile')}><Icon name="user"/>Profile & resume</button><div className="account"><span className="avatar">ML</span><div><strong>{data?.profile.name||'Your workspace'}</strong><small>Private workspace</small></div><button title="Sign out" aria-label="Sign out" onClick={async()=>{await api('logout',{});openedInitialLink.current=false;rememberPending([]);setData(null);setSession({...session,authenticated:false});}}><Icon name="logout"/></button></div></div>
    </aside>
    <main className="main"><header className="topbar"><div className="breadcrumb">Workspace <Icon name="chevron" size={12}/> <span>{titles[view]}</span></div><Badge tone="blue"><Icon name="shield" size={13}/> Private</Badge></header>
      <div className="page-content"><div className="page-heading"><div><h1>{titles[view]}</h1><p>{view==='profile'?'Keep your introduction and resume ready for the next conversation.':'Find the right work. Check the terms. Make the next connection.'}</p></div><button className="button secondary" onClick={load}><Icon name="refresh"/>Refresh</button></div>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {!data?<div className="empty"><h2>Your workspace is loading</h2><p>{error||'Loading collected opportunities…'}</p></div>:view==='profile'?<ProfilePanel data={data} update={(profile,version)=>{setData({...data,profile,profileVersion:version});notify('Profile updated');}}/>:view==='coverage'?<Coverage data={data}/>:<>
        <section className="metrics" aria-label="Pipeline counts"><div><span>Open opportunities</span><strong>{contracts.length}</strong><small>Submitted jobs are in Applications</small></div><div><span>US remote advertised</span><strong>{contracts.filter(l=>usLocation(l)).length}</strong><small>Posting evidence; restrictions shown per role</small></div><div className="metric-priority"><span>C2C at $100+/hour</span><strong>{contracts.filter(l=>l.fit_tier.startsWith('1 -')).length}<span className="metric-check"><Icon name="check" size={16}/></span></strong><small>Explicitly advertised in the posting</small></div><div><span>Reviewed for you</span><strong>{leads.filter(l=>l.qualification).length}</strong><small>Evidence and next steps included</small></div></section>
        <div className="scan-note"><span><span className="status-dot"/>Last collection: {date(data.snapshot.collected_at)} <span className="muted">at {new Date(data.snapshot.collected_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Chicago'})} Chicago</span></span><span>First-seen leads from a 7-day search window</span></div>
        <div className={'workbench '+(active?'has-detail':'')}><section className="opportunity-panel"><div className="list-toolbar"><label className="search-box"><Icon name="search"/><input aria-label="Search opportunities" placeholder="Search roles, companies, or skills" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="Clear search" onClick={()=>setSearch('')}><Icon name="close" size={14}/></button>}</label><select aria-label="Sort opportunities" value={sort} onChange={e=>setSort(e.target.value)}><option value="fit">Best fit first</option><option value="newest">Newest seen</option><option value="pay">Highest stated rate</option></select></div>
          <div className="filter-row">{[['all','All'],['us','US remote'],['c2c','$100+ C2C'],['email','Has email'],['reviewed','Reviewed']].map(([key,label])=><button key={key} className={filter===key?'filter active':'filter'} onClick={()=>setFilter(key)}>{label}</button>)}<select aria-label="Filter by source" value={source} onChange={e=>setSource(e.target.value)}><option value="all">All sources</option>{[...new Set(leads.map(l=>l.source))].sort().map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="list-summary"><strong>{visible.length} {view==='applied'?(visible.length===1?'application':'applications'):(visible.length===1?'opportunity':'opportunities')}</strong><span>{view==='opportunities'?'Submitted jobs are in Applications':'Rate and C2C terms are labeled when unknown'}</span></div>
          <div className="lead-table" role="list" aria-label="Opportunities">{visible.slice(page*20,(page+1)*20).map(lead=><button role="listitem" key={lead.id} className={'lead-row '+(selected===lead.id?'selected':'')} onClick={()=>selectLead(lead.id)}><span className="company-avatar" aria-hidden="true">{lead.company_agency.slice(0,2).toUpperCase()}</span><span className="lead-main"><span className="lead-title">{lead.title}</span><span className="lead-company">{lead.company_agency}</span><span className="lead-meta"><span>{locationLabel(lead)}</span><span>{lead.source}</span>{lead.qualification&&<span className="reviewed-label"><Icon name="check" size={11}/>Reviewed</span>}</span></span><span className="lead-terms"><strong>{formatPay(lead.pay)}</strong><span className={lead.c2c_status==='explicitly accepted'?'positive':'muted'}>{lead.c2c_status==='explicitly accepted'?'C2C accepted':lead.c2c_status==='not accepted'?'C2C excluded':'C2C to confirm'}</span><span className={'row-stage '+(data.workflow[lead.id]?.stage==='applied'?'submitted':'')}>{data.workflow[lead.id]?.stage==='applied'&&<Icon name="check" size={12}/>}{stageName(data.workflow[lead.id]?.stage||'new')}{contactEmails(lead).length>0&&<Icon name="mail" size={12}/>}</span></span><Icon name="chevron" size={14}/></button>)}</div>
          {!visible.length&&<div className="empty"><Icon name="search" size={26}/><h3>No matches in this view</h3><p>{['saved','contacted','applied'].includes(view)?'Open an opportunity and update its stage to add it here.':view==='email_review'?'Connect the Catalant Gmail importer in Profile to load opportunity emails.':'Try a different search or clear a filter.'}</p><button className="button secondary" onClick={()=>{setSearch('');setFilter('all');setSource('all');}}>Clear filters</button></div>}
          <div className="pagination"><span>{visible.length?`${page*20+1}–${Math.min((page+1)*20,visible.length)} of ${visible.length}`:'0 results'}</span><div><button disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button><button disabled={(page+1)*20>=visible.length} onClick={()=>setPage(page+1)}>Next</button></div></div>
        </section>{active&&<Detail key={active.id} lead={active} profile={data.profile} progress={data.workflow[active.id]} onSave={progress} onApplication={application} close={()=>selectLead(null)} notify={notify} openProfile={()=>setView('profile')} emailReady={data.email.configured} onContact={()=>void load()}/>}</div>
      </>}
      </div><footer className="page-footer"><Icon name="shield" size={13}/>Your workspace is private. Contact links open drafts or application pages for your review.</footer>
    </main>{returned&&!opening&&waiting&&returnLead&&<ApplicationReturn key={waiting.id} lead={returnLead} onAnswer={kind=>application(returnLead,kind,kind==='submitted'?waiting.submittedId:waiting.cancelledId)} onLater={()=>{dismissPending(waiting.id);notify('Still in progress. Use Mark submitted when you finish.');}}/>}{toast&&<div className="toast" role="status"><Icon name="check"/>{toast}</div>}
  </div>;
}

function ApplicationReturn({lead,onAnswer,onLater}:{lead:Lead;onAnswer:(kind:'submitted'|'cancelled')=>Promise<void>;onLater:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function answer(kind:'submitted'|'cancelled'){
    setBusy(true);setError('');try{await onAnswer(kind);}catch(e){setError((e as Error).message);setBusy(false);}
  }
  return <dialog ref={dialog} className="application-return" aria-labelledby="return-title" aria-describedby="return-job" onCancel={event=>{event.preventDefault();if(!busy)onLater();}}>
    <div className="return-icon"><Icon name="briefcase" size={24}/></div>
    <h2 id="return-title">Did you submit your application?</h2>
    <p id="return-job"><strong>{lead.title}</strong><br/>{lead.company_agency}</p>
    <p>Confirm submission to move this job from Opportunities to Applications.</p>
    {error&&<div role="alert" className="alert error">{error}</div>}
    <div className="return-actions"><button className="button primary" disabled={busy} onClick={()=>void answer('submitted')} autoFocus><Icon name="check"/>Submitted</button><button className="button secondary" disabled={busy} onClick={onLater}>Still working</button><button className="button secondary" disabled={busy} onClick={()=>void answer('cancelled')}>Cancelled</button></div>
    <small>Still working keeps the application started. Cancelled keeps the opportunity open.</small>
  </dialog>;
}

function Login({setup,reset,resetPending,unavailable,onDone}:{setup:boolean;reset:boolean;resetPending:boolean;unavailable:boolean;onDone:()=>void}) {
  const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [confirmation,setConfirmation]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  return <div className="login-page"><div className="login-intro"><div className="login-brand"><span className="brand-mark">C</span>Contract Desk</div><div><h1>A clear path to<br/>your next contract.</h1><p>Your opportunities, the evidence behind them, and the right way to get in touch. All in one private workspace.</p><ul><li><Icon name="check"/>Relevant remote contracts</li><li><Icon name="check"/>Verified terms and honest unknowns</li><li><Icon name="check"/>Applications and follow-ups in one place</li></ul></div><small>Built for independent engineering.</small></div><div className="login-form-wrap"><form className="login-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api(reset?'reset-password':setup?'setup':'login',{username,password,confirmation});setPassword('');onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><div className="login-lock"><Icon name="shield" size={24}/></div><h2>{reset?'Reset your password':setup?'Create your private login':'Welcome back'}</h2><p>{reset?'Your username stays the same. Choose a new, unique password.':setup?'Choose the username and password you’ll use locally and on your hosted dashboard.':'Sign in to your contract workspace.'}</p>{unavailable?<div className="alert">{resetPending?'The reset window expired. Request another local password reset.':'Your dashboard is being configured. Please try again shortly.'}</div>:<>{!reset&&<label>Username<input autoComplete="username" required minLength={3} maxLength={64} pattern={setup?'[a-zA-Z0-9_.-]{3,64}':undefined} value={username} onChange={e=>setUsername(e.target.value)} autoFocus/></label>}<label>{reset?'New password':'Password'}<input type="password" autoComplete={setup||reset?'new-password':'current-password'} required minLength={setup||reset?12:undefined} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/>{(setup||reset)&&<small>At least 12 characters. A password manager can create one for you.</small>}</label>{reset&&<label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>}{error&&<div role="alert" className="alert error">{error}</div>}<button className="button primary login-submit" disabled={busy}>{busy?'Opening workspace…':reset?'Set new password & open dashboard':setup?'Create login & open dashboard':'Sign in'}<Icon name="arrow"/></button></>}<div className="login-private"><Icon name="shield" size={14}/>Username and password required for all lead data.</div></form></div></div>;
}

function EvidenceRow({label,evidence}:{label:string;evidence:Evidence}) {
  const positive=['confirmed','direct'].includes(evidence.status);const negative=['excluded','secondary'].includes(evidence.status);
  return <div className="evidence-row"><span className={'evidence-icon '+(positive?'positive':negative?'negative':'amber')}><Icon name={positive?'check':'filter'} size={13}/></span><div><div className="evidence-label">{label}<Badge tone={positive?'green':'amber'}>{evidence.status.replaceAll('_',' ')}</Badge></div><p>{evidence.detail}</p>{evidence.source_url&&<External href={evidence.source_url} className="evidence-source">View evidence<Icon name="link" size={11}/></External>}</div></div>;
}
function Detail({lead,profile,progress,onSave,onApplication,close,notify,openProfile,emailReady,onContact}:{lead:Lead;profile:Profile;progress?:LeadProgress;onSave:(lead:Lead,stage:Stage,notes:string)=>Promise<void>;onApplication:(lead:Lead,kind:'opened'|'submitted')=>Promise<void>;close:()=>void;notify:(message:string)=>void;openProfile:()=>void;emailReady:boolean;onContact:()=>void}) {
  const [stage,setStage]=useState<Stage>(progress?.stage||'new');const [notes,setNotes]=useState(progress?.notes||'');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>setStage(progress?.stage||'new'),[progress?.stage]);
  useEffect(()=>setNotes(progress?.notes||''),[progress?.notes]);
  async function record(kind:'opened'|'submitted'){setBusy(true);setError('');try{await onApplication(lead,kind);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const q=lead.qualification;const contacts=contactEmails(lead) as Contact[];const draft=draftEmail(lead,profile);
  async function save(next=stage){setBusy(true);setError('');try{await onSave(lead,next,notes);setStage(next);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <aside className="detail-panel" aria-label="Opportunity details"><div className="detail-top"><span><Icon name="briefcase" size={15}/>Opportunity details</span><button aria-label="Close opportunity details" onClick={close}><Icon name="close" size={17}/></button></div><div className="detail-body"><div className="detail-tags"><Badge tone={q?.verdict==='priority'?'green':'blue'}>{q?.verdict==='priority'?'Priority lead':q?'Reviewed':'Needs verification'}</Badge><span>{lead.source}</span></div><h2>{lead.title}</h2><div className="detail-company">{lead.company_agency}</div><div className="detail-location">{lead.remote_location}</div>{lead.email_origin&&<section className="detail-section"><strong>From Catalant opportunity email</strong><p>{lead.email_origin.excerpt}</p><p>Received {new Date(lead.email_origin.received_at).toLocaleString()}. Location, rate, C2C eligibility and client need review.</p><External className="button secondary" href={lead.email_origin.gmail_url}>Open original email</External></section>}<div className="detail-pay">{formatPay(lead.pay)}</div><div className="quick-actions"><External className="button primary" href={applicationUrl(lead)} onClick={()=>void record('opened')}><Icon name="briefcase" size={15}/>{lead.email_origin?'Open project':progress?.stage==='applied'?'View posting':'Apply'}</External>{contacts[0]&&<a className="button secondary" href={emailHref(contacts[0].email,lead,profile)} title={contacts[0].email}><Icon name="mail" size={15}/>{q?.contact?.email_name?'Email agency':'Draft email'}</a>}</div><section className="application-status" aria-label="Application tracking"><strong>{stageName(progress?.stage||'new')}</strong>{progress?.stage==='applying'&&<p>Finished the application? Mark it submitted so it stays in your Applications list.</p>}{progress?.stage==='applied'?<p>Submission reported by you. Recorded {new Date(progress.application?.submission_recorded_at||progress.updated_at).toLocaleString()}; actual submission date not supplied.</p>:<button className="button primary wide" disabled={busy} onClick={()=>void record('submitted')}><Icon name="check"/>Mark submitted</button>}<button className="button secondary wide" onClick={async()=>{const url=new URL(window.location.href);url.searchParams.set('lead',lead.id);try{await navigator.clipboard.writeText(url.href);notify('Dashboard link copied');}catch{notify('Copy the dashboard URL from your address bar.');}}}><Icon name="link"/>Copy dashboard link</button>{error&&<div role="alert" className="alert error">{error}</div>}<details><summary>Application activity ({progress?.events?.length||0})</summary><ol>{[...(progress?.events||[])].reverse().map(event=><li key={event.id}>{event.kind==='opened'?'Application link opened':event.kind==='cancelled'?'Application cancelled by you':'Submission reported by you'}<small>{new Date(event.recorded_at).toLocaleString()}</small><External href={event.url}>Application page</External></li>)}</ol></details></section>{!['applying','applied','contacted'].includes(progress?.stage||'new')&&<button className={'button save-button '+(stage==='saved'?'is-saved':'')} disabled={busy} onClick={()=>save(stage==='saved'?'new':'saved')}><Icon name="bookmark"/>{stage==='saved'?'Saved to your pipeline':'Save opportunity'}</button>}
      {q&&<div className={'review-summary '+(q.verdict==='secondary'?'caution':'')}><Icon name="shield" size={18}/><div><strong>{q.verdict==='priority'?'Worth prioritizing':q.verdict==='secondary'?'Secondary after review':q.verdict==='not_a_fit'?'Not a fit after review':'Terms to confirm'}</strong><p>{q.summary}</p><small>Reviewed {q.reviewed_at}</small></div></div>}
      <section className="detail-section"><h3>Qualification evidence</h3><EvidenceRow label="Rate" evidence={q?.pay||{status:lead.hourly_min_usd?'advertised':'unknown',detail:formatPay(lead.pay),source_url:lead.source_url}}/><EvidenceRow label="C2C & duration" evidence={q?.c2c||{status:lead.c2c_status==='explicitly accepted'?'confirmed':'unknown',detail:`${lead.c2c_status}. Duration: ${lead.duration}.`,source_url:lead.source_url}}/><EvidenceRow label="Location & restrictions" evidence={{status:lead.location_assessment?.status||'unclear',detail:locationLabel(lead)+'. '+(lead.location_assessment?.evidence||[]).join(' ')+' '+(lead.location_assessment?.restrictions||[]).join(' '),source_url:lead.source_url}}/>{q?.location&&<EvidenceRow label="Previous location review" evidence={q.location}/>}<EvidenceRow label="Hiring client" evidence={q?.client||{status:'unverified',detail:`${lead.direct_client_classification}. ${lead.direct_client_evidence}`,source_url:lead.official_employer_url||lead.source_url}}/></section>
      <section className="detail-section contact-section"><h3>How to contact</h3><External className="button primary wide" href={applicationUrl(lead)} onClick={()=>void record('opened')}><Icon name="briefcase"/>Open application<Icon name="arrow" size={15}/></External>{q?.contact?.url&&q.contact.url.includes('linkedin.com/in/')&&<External className="button secondary wide" href={q.contact.url}><Icon name="user"/>View {q.contact.name||'recruiter'}’s profile</External>}
        {contacts.map(contact=><div key={contact.email} className="email-contact"><strong>{q?.contact?.email===contact.email&&q?.contact?.email_name?q?.contact?.email_name:contact.kind==='hiring'?'Public hiring contact':'Public email; purpose unverified'}</strong><a href={emailHref(contact.email,lead,profile)} className="email-address"><Icon name="mail" size={15}/>{contact.email}</a><p>{contact.detail}</p><a className="button secondary wide" href={emailHref(contact.email,lead,profile)}><Icon name="mail"/>Open email draft</a></div>)}
        {!contacts.length&&<p className="contact-hint">No hiring email has been verified. Use the application link{q?.contact?.name?' or the named recruiter’s profile':''}.</p>}{lead.contacts.some(contact=>contact.kind==='accessibility_only')&&<p className="contact-hint amber-text">An accommodation or policy email appears in this posting. It is excluded from hiring-contact actions.</p>}
        <OutreachComposer lead={lead} profile={profile} configured={emailReady} onSent={onContact}/><details className="draft-box"><summary><Icon name="file" size={15}/>Review an inquiry draft</summary><textarea aria-label="Inquiry draft" readOnly value={draft} rows={10}/><button className="button secondary wide" onClick={async()=>{try{await navigator.clipboard.writeText(draft);notify('Inquiry draft copied');}catch{notify('Select the draft text to copy it.');}}}><Icon name="copy"/>Copy draft</button></details>
        {profile.resume_name?<div className="resume-ready"><Icon name="file"/><div><a href="/api/resume">Download your resume</a><small>Attach it in your email app or the application form.</small></div></div>:<button className="resume-prompt" onClick={openProfile}><Icon name="file"/><span>Add your resume to keep it ready</span><Icon name="chevron" size={13}/></button>}
      </section>{q&&<section className="detail-section"><h3>Before you reach out</h3><ol className="next-steps">{q.next_steps.map(step=><li key={step}>{step}</li>)}</ol></section>}
      <section className="detail-section"><h3>Your follow-up</h3><label className="field-label">Stage<select aria-label="Opportunity stage" value={stage} onChange={e=>setStage(e.target.value as Stage)}>{STAGES.map(s=><option value={s} key={s}>{stageName(s)}</option>)}</select></label><label className="field-label">Private notes<textarea placeholder="Questions, contact history, or your next step…" value={notes} maxLength={10000} onChange={e=>setNotes(e.target.value)} rows={4}/></label><button className="button secondary wide" disabled={busy} onClick={()=>save()}>{busy?'Saving…':'Save follow-up'}</button></section>
      {Boolean(progress?.outreach?.length)&&<section className="detail-section"><h3>Contact receipts</h3>{progress!.outreach!.map(receipt=><p key={receipt.id}><strong>{receipt.recipient}</strong><br/>{receipt.subject}<br/><small>Accepted by Resend {new Date(receipt.accepted_at).toLocaleString()}<br/>Receipt: {receipt.provider_id}</small></p>)}</section>}<div className="original-link"><External href={lead.source_url}><Icon name="link" size={13}/>Original posting</External><span>First seen {date(lead.first_seen)}</span></div>
    </div></aside>;
}

function OutreachComposer({lead,profile,configured,onSent}:{lead:Lead;profile:Profile;configured:boolean;onSent:()=>void}) {
  const contacts=contactEmails(lead) as Contact[];
  const [recipient,setRecipient]=useState(contacts[0]?.email||'');
  const [subject,setSubject]=useState('Contract inquiry: '+lead.title);
  const [text,setText]=useState(draftEmail(lead,profile));
  const [attach,setAttach]=useState(false);const [message,setMessage]=useState<OutreachMessage|null>(null);
  const [messageId,setMessageId]=useState('');const [busy,setBusy]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{let active=true;api('outreach?lead='+lead.id).then(result=>{if(active&&result.message)setMessage(result.message);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[lead.id]);
  if(!contacts.length)return null;
  const accepted=message?.status==='accepted';
  return <div className="outreach-composer"><h3>Send through Contract Desk</h3><p>From Matthew Long &lt;mlong@magneton.io&gt;. Replies go to mlong@magneton.io.</p>{!configured&&<div className="alert">Resend is not connected yet. You can prepare a draft now.</div>}
    {message?<><div className="email-review"><strong>To: {message.recipient}</strong><p>{message.subject}</p><pre>{message.text}</pre><p>Attachment: {message.resume_name||'None'}</p></div>{accepted?<div className="alert">Accepted by Resend {new Date(message.accepted_at!).toLocaleString()}. Receipt: {message.provider_id}</div>:<button className="button primary wide" disabled={busy||!configured} onClick={async()=>{setBusy(true);setError('');try{const result=await api('outreach/send',{messageId:message.id,approved:true});setMessage(result.message);onSent();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Sending…':'Approve & send this email'}</button>}<button className="button secondary wide" disabled={busy} onClick={()=>{setMessage(null);setMessageId('');setError('');}}>Start a new draft</button></>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const id=messageId||crypto.randomUUID();setMessageId(id);try{const result=await api('outreach',{id:lead.id,messageId:id,recipient,subject,text,attachResume:attach});setMessage(result.message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
      <label className="field-label">Recruiter or agency email<select value={recipient} onChange={e=>{setRecipient(e.target.value);setMessageId('');}}>{contacts.map(contact=><option value={contact.email} key={contact.email}>{contact.email}{contact.kind==='unverified'?' (purpose unverified)':''}</option>)}</select></label>
      <label className="field-label">Subject<input value={subject} maxLength={200} required onChange={e=>{setSubject(e.target.value);setMessageId('');}}/></label>
      <label className="field-label">Message<textarea rows={12} value={text} maxLength={10000} required onChange={e=>{setText(e.target.value);setMessageId('');}}/></label>
      <label className="attachment-choice"><input type="checkbox" disabled={!profile.resume_name} checked={attach} onChange={e=>{setAttach(e.target.checked);setMessageId('');}}/>Attach {profile.resume_name||'resume (upload in Profile first)'}</label>
      <button className="button secondary wide" disabled={busy}>{busy?'Preparing…':'Review email before sending'}</button>
    </form>}{error&&<div role="alert" className="alert error">{error}</div>}
  </div>;
}

function ProfilePanel({data,update}:{data:DashboardData;update:(profile:Profile,version:string)=>void}) {
  const [name,setName]=useState(data.profile.name);const [pitch,setPitch]=useState(data.profile.pitch);const [portfolio,setPortfolio]=useState(data.profile.portfolio);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  return <div className="profile-layout"><section className="settings-panel"><h2>Your introduction</h2><p>This information appears in the inquiry drafts you review.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const next=await api('profile',{name,pitch,portfolio,version:data.profileVersion});update(next.profile,next.version);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label className="field-label">Full name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={100}/></label><label className="field-label">Professional introduction<textarea rows={5} value={pitch} onChange={e=>setPitch(e.target.value)} maxLength={2000}/></label><label className="field-label">Portfolio or GitHub URL<input type="url" placeholder="https://…" value={portfolio} onChange={e=>setPortfolio(e.target.value)}/></label><button className="button primary" disabled={busy}>Save profile</button></form></section><section className="settings-panel"><h2>Your resume</h2><p>Keep a private copy here, then download it when you apply or prepare an email.</p><div className="resume-upload"><Icon name="file" size={32}/><strong>{data.profile.resume_name||'Add your resume'}</strong><span>PDF or DOCX, up to 3 MB</span><label className="button secondary">Choose resume<input type="file" accept=".pdf,.docx" aria-label="Upload resume" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setError('');try{const form=new FormData();form.set('file',file);const next=await api('resume',form);update(next.profile,next.version);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/></label>{data.profile.resume_name&&<a href="/api/resume" className="text-link">Download current resume</a>}</div><div className="privacy-note"><Icon name="shield"/><p>Resume downloads require your login. Email drafts open in your mail app so you can attach the file and review the recipient.</p></div><h3>Catalant email import</h3><p>{data.snapshot.summary.source_coverage.find(s=>s.source==='Catalant email')?.last_success_at ? 'Last import: '+new Date(data.snapshot.summary.source_coverage.find(s=>s.source==='Catalant email')!.last_success_at!).toLocaleString() : 'Waiting for Google authorization and first import.'}</p><p>Import the last seven days of Catalant digests from mlong@magneton.io daily, between 7–8am Chicago. Leads appear in Needs review.</p><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const files=await api('email-import-script',{});await navigator.clipboard.writeText(files.script);}catch{setError('Clipboard unavailable. Download Code.gs instead.');}finally{setBusy(false);}}}>Copy importer code</button>{(['Code.gs','appsscript.json'] as const).map(filename=><button key={filename} className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const files=await api('email-import-script',{});const url=URL.createObjectURL(new Blob([filename==='Code.gs'?files.script:files.manifest],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Download {filename}</button>)}<ol><li>Open script.google.com with mlong@magneton.io and create a project.</li><li>Paste Code.gs. In Project Settings, enable the manifest editor and replace appsscript.json with the downloaded file.</li><li>Run installCatalantImport and approve Gmail read-only access, external requests, and managing this script’s schedule.</li></ol><p>The downloaded Code.gs contains a private import key. Keep it private. Gmail permission allows mailbox reading; the script filters only Catalant digests.</p><h3>Email delivery</h3><Badge tone={data.email.configured?'green':'amber'}>{data.email.configured?'Resend connected':'Resend setup needed'}</Badge><p>From: {data.email.from}<br/>Daily digest to: {data.email.recipient}<br/>Digest scheduled: 9:17am Chicago, every day.</p><p>{data.email.last_digest?`Last digest accepted ${new Date(data.email.last_digest).toLocaleString()} (${data.email.digest_count} new candidates).`:'No daily digest receipt recorded yet.'}</p><p>Prepare and approve recruiter emails from an opportunity. Delivery receipts appear in its contact history. Provider acceptance does not confirm inbox delivery.</p></section>{error&&<div role="alert" className="alert error">{error}</div>}</div>;
}
function Coverage({data}:{data:DashboardData}) {
  const chicagoTime=(value:string)=>new Date(value).toLocaleString(undefined,{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'});
  return <section className="settings-panel coverage-panel"><h2>What the search covered</h2><p>Each weekday, the collector searches a 7-day window and removes leads seen before. The target is 50 new relevant contracts; actual results vary.</p><div className="coverage-stats"><span><strong>{data.snapshot.summary.raw}</strong>listings fetched in latest scan</span><span><strong>{data.snapshot.summary.duplicates}</strong>previously seen / duplicate listings</span><span><strong>$6 / $50</strong>daily / billing-cycle allowance</span></div>{data.snapshot.summary.budget&&<p>Cycle allowance reserved: ${data.snapshot.summary.budget.reserved_usd.toFixed(2)}; remaining: ${data.snapshot.summary.budget.remaining_usd.toFixed(2)}. Resets {new Date(data.snapshot.summary.budget.cycle.endAt).toLocaleString()}. Reserved limits include uncertain charges and are separate from provider-reported spend.</p>}<table><thead><tr><th>Source</th><th>Status</th><th>Raw / retained</th><th>Details</th></tr></thead><tbody>{data.snapshot.summary.source_coverage.map(row=>{
    const saved=row.status==='saved';const scheduled=row.status==='scheduled';
    return <tr key={row.source}><td>{row.source}</td><td><Badge tone={saved||row.status==='ok'?'green':scheduled?'blue':'amber'}>{saved?'Saved results':scheduled?'Scheduled':row.status==='ok'?'Collected':row.status}</Badge></td><td>{saved?`${row.saved_count ?? 0} saved`:scheduled?'—':`${row.raw} / ${row.retained ?? '—'}`}</td><td>{row.detail||'Public feed'}{row.last_success_at&&<div className="muted">Last collected {chicagoTime(row.last_success_at)} Chicago.</div>}{row.next_check_at&&<div className="muted">Next check {chicagoTime(row.next_check_at)} Chicago.</div>}</td></tr>;
  })}</tbody></table><p className="muted">Last collection {new Date(data.snapshot.collected_at).toLocaleString()}. Saved results keep their original collection time; scheduled checks wait for the source allowance. Unknown rates, C2C eligibility, and employer identities remain labeled until evidence confirms them.</p></section>;
}
