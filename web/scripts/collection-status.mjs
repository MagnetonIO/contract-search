import { readJson,writeJson } from '../lib/store.ts';
import { WORKFLOW_URL } from '../lib/collection-status.mjs';
const previous=await readJson('collection-state.json',null);
const now=new Date().toISOString();
const starting=process.argv[2]==='running';
const mode=process.env.MODE||'daily';
const id=process.env.GITHUB_RUN_ID;
const published=process.env.COLLECTION_PUBLISHED==='true';
const completed=process.env.COLLECTION_OUTCOME==='success';
const record={status:starting?'running':published?(completed?'completed':'completed_with_warnings'):'failed',mode,
 trigger:process.env.GITHUB_EVENT_NAME||'workflow_dispatch',run_url:id?`https://github.com/MagnetonIO/contract-search/actions/runs/${id}`:WORKFLOW_URL,
 started_at:process.env.COLLECTION_STARTED_AT||(starting?now:previous.value?.started_at||now),finished_at:starting?null:now,
 last_completed_at:starting?previous.value?.last_completed_at:published?now:previous.value?.last_completed_at};
await writeJson('collection-state.json',record,previous.version);
console.log('Collection status recorded: '+record.status+' ('+mode+').');
