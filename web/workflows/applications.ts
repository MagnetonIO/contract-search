import {sleep} from 'workflow';

export async function applicationCycle(options: {manual?: boolean} = {}) {
  'use workflow';
  const id = await acquire(options.manual === true);
  if (!id) return;
  try {
    const limit = await rolloutLimit();
    let attempted = 0;
    // A user-resumed application already passed screening. Do not leave it
    // behind a fresh collection; the browser still checks current conditions.
    let retry = await queued();
    while (retry && attempted < limit) {
      await executeApplication(retry);
      attempted++;
      retry = attempted < limit ? await queued() : null;
    }
    while (await refresh()) { /* Public checks are bounded and cached; no paid collectors. */ }
    while (await screen()) {
      // Pick up retries requested while the screening pass was in progress.
      const retry = attempted < limit ? await queued() : null;
      if (retry) { await executeApplication(retry); attempted++; }
    }
    await reconcile();
    for (let i = attempted; i < limit; i++) {
      const attempt = await next();
      if (!attempt) break;
      await executeApplication(attempt);
    }
  } catch (error) {
    await failed(id);
    throw error;
  } finally {
    await release(id);
  }
}

export async function queued() {
  'use step';
  const {automationSettings} = await import('../lib/automation-state.mjs');
  const {queuedAttemptId} = await import('../lib/application-blockers.mjs');
  return queuedAttemptId(await automationSettings());
}

export async function refresh() {
  'use step';
  const {refreshPostingBatch} = await import('../lib/posting-refresh.mjs');
  return refreshPostingBatch();
}

export async function acquire(manual = false) {
  'use step';
  const { acquireCycle } = await import('../lib/automation-state.mjs');
  return acquireCycle(manual);
}

export async function release(id: string) {
  'use step';
  const { releaseCycle } = await import('../lib/automation-state.mjs');
  await releaseCycle(id);
}

export async function failed(id: string) {
  'use step';
  const { failCycle } = await import('../lib/automation-state.mjs');
  await failCycle(id);
}

export async function screen() {
  'use step';
  const { screenBatch } = await import('../lib/automation-screen.mjs');
  return screenBatch();
}

export async function next() {
  'use step';
  const { nextAttempt } = await import('../lib/automation-screen.mjs');
  return nextAttempt();
}

export async function apply(id: string) {
  'use step';
  const { applyAttempt } = await import('../lib/application-browser.mjs');
  return applyAttempt(id);
}
apply.maxRetries = 0;

export async function rolloutLimit() {
  'use step';
  const { automationSettings } = await import('../lib/automation-state.mjs');
  const state = await automationSettings();
  const count = Object.values(state.attempts).filter((a: any) => a.status === 'submitted').length;
  return count === 0 ? 1 : count < 5 ? 5 : 20;
}

export async function reconcile() {
  'use step';
  const {reconcileQualificationReviews} = await import('../lib/automation-screen.mjs');
  return reconcileQualificationReviews();
}

async function executeApplication(id: string) {
 let segment=0;
 for(let tick=0;tick<120&&segment<8;tick++){
  const result=await apply(id);
  if(result?.busy){await sleep('5s');continue;}
  segment++;
  if(result?.verification){await startVerification(id);return;}
  if(!result?.continue)return;
  await sleep('2s');
 }
 await stopInterrupted(id);
}
export async function applicationContinuation(id: string){
 'use workflow';
 await executeApplication(id);
}
export async function targetedApplicationPilot(ids: string[]){
 'use workflow';
 for(const id of ids)await executeApplication(id);
}
export async function applicationVerification(id: string){
 'use workflow';
 for(let tick=0;tick<100;tick++){
  const result=await recover(id);
  if(result.resume){await executeApplication(id);return;}
  if(!result.waiting)return;
  await sleep('10s');
 }
 await recover(id);
}
export async function recover(id: string){
 'use step';
 const {recoverVerification}=await import('../lib/application-verification.mjs');
 return recoverVerification(id);
}
recover.maxRetries=0;
export async function startVerification(id: string){
 'use step';
 const {start}=await import('workflow/api');
 const run=await start(applicationVerification,[id]);return {run_id:run.runId};
}
export async function stopInterrupted(id: string){
 'use step';
 const {patchAttempt}=await import('../lib/automation-state.mjs');
 await patchAttempt(id,{status:'failed',reason:'The application exhausted its bounded recovery segments. No new submission was attempted.'});
}
