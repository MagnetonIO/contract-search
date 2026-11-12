import { readJson, writeJson, ConflictError } from './store.ts';
import { collectionHealth } from './collection-status.mjs';

export function collectorWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type,p.value]));
  const minute = Number(parts.hour)*60+Number(parts.minute);
  return !['Sat','Sun'].includes(parts.weekday) && minute >= 487 && minute < 660;
}
const defaultStore = { read: key => readJson(key,null), write: writeJson, conflict: e => e instanceof ConflictError };
export async function ensureCollection({ now = new Date(), manual = false, token = process.env.COLLECTOR_GITHUB_TOKEN, store = defaultStore, fetchImpl = fetch } = {}) {
  if (!manual && !collectorWindow(now)) return { status: 'outside_collection_window' };
  const snapshot = (await store.read('leads.json')).value;
  const expected = collectionHealth(snapshot || {collected_at:''},null,now).expected_at;
  if (!manual && Date.parse(snapshot?.collected_at) >= Date.parse(expected)) return {status:'already_collected',collected_at:snapshot.collected_at};
  if (!token) return {status:'configuration_required', detail:'Connect a repository-scoped GitHub token with Actions read/write permission.'};
  const headers = { Authorization:'Bearer '+token, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'ContractDesk-Scheduler' };
  const api = async (path, options={}) => {
    const response = await fetchImpl('https://api.github.com/repos/MagnetonIO/contract-search/actions/workflows/contracts.yml/'+path, {...options,headers:{...headers,...options.headers},redirect:'error',signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('Collector dispatch API returned HTTP '+response.status);
    return response.status === 204 ? null : response.json();
  };
  const runs = await api('runs?per_page=20');
  const active = runs.workflow_runs?.find(r => ['queued','in_progress','waiting','pending','requested'].includes(r.status) && now.getTime()-Date.parse(r.created_at)<55*60000);
  if (active) return {status:'runner_active',run_url:active.html_url};
  const lease = await store.read('collection-dispatch.json');
  if (lease.value?.status!=='failed'&&now.getTime()-Date.parse(lease.value?.attempted_at)<5*60000) return {status:'dispatch_pending'};
  let dispatchVersion;
  try { dispatchVersion=await store.write('collection-dispatch.json',{attempted_at:now.toISOString(),status:'dispatching'},lease.version); }
  catch(e) {if(store.conflict(e))return {status:'dispatch_pending'};throw e;}
  try { await api('dispatches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{mode:'daily',...(manual?{force:'true'}:{})}})}); }
  catch(error){
    // Explicit rejection is safe to retry. A network timeout or server failure
    // may have accepted the dispatch; retain its lease to prevent duplicates.
    if(/HTTP (400|401|403|404|422)\b/.test(error.message))await store.write('collection-dispatch.json',{attempted_at:now.toISOString(),status:'failed'},dispatchVersion).catch(()=>{});
    throw error;
  }
  return {status:'dispatched',expected_at:expected,requested_at:now.toISOString()};
}
