export async function applicationCycle() {
  'use workflow';
  const id = await acquire();
  if (!id) return;
  try {
    while (await screen()) { /* Each batch is durably checkpointed. */ }
    const limit = await rolloutLimit();
    for (let i = 0; i < limit; i++) {
      const attempt = await next();
      if (!attempt) break;
      await apply(attempt);
    }
  } catch (error) {
    await failed(id);
    throw error;
  } finally {
    await release(id);
  }
}

export async function acquire() {
  'use step';
  const { acquireCycle } = await import('../lib/automation-state.mjs');
  return acquireCycle();
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
  await applyAttempt(id);
}
apply.maxRetries = 0;

export async function rolloutLimit() {
  'use step';
  const { automationSettings } = await import('../lib/automation-state.mjs');
  const state = await automationSettings();
  const count = Object.values(state.attempts).filter((a: any) => a.status === 'submitted').length;
  return count === 0 ? 1 : count < 5 ? 5 : 20;
}
