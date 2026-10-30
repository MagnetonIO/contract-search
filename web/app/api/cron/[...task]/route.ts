import { cronAuthorized } from '../../../../lib/digest-schedule.mjs';
import { start } from 'workflow/api';
import { applicationCycle } from '../../../../workflows/applications';
import { automationSettings } from '../../../../lib/automation-state.mjs';
import { applicationWindow } from '../../../../lib/automation-policy.mjs';
import { writeJson } from '../../../../lib/store';
import { ensureCollection } from '../../../../lib/collector-scheduler.mjs';
import { sendDailyDigest } from '../../../../lib/digest.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ task: string[] }> }) {
  const task = (await context.params).task.join('/');
  if (!['digest', 'digest-backup', 'digest-final', 'applications', 'collect', 'collect-backup', 'collect-watch', 'collect-watch-backup', 'collect-final', 'collect-final-backup'].includes(task)) return new Response('Not found', { status: 404 });
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) return new Response('Unauthorized', { status: 401 });
  try {
    if(task==='applications'){const state=await automationSettings();if(!state.policy.enabled||!applicationWindow())return Response.json({status:'paused_or_outside_window'});const run=await start(applicationCycle,[]);return Response.json({status:'started',run_id:run.runId});}
    const result = task.startsWith('collect') ? await ensureCollection() : await sendDailyDigest();
    if (task.startsWith('collect')) await writeJson('scheduler-state.json',{...result,checked_at:new Date().toISOString()});
    return Response.json(result, { status: result.status === 'configuration_required' ? 503 : 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    if (task.startsWith('collect')) {
      try { await writeJson('scheduler-state.json',{status:'failed',checked_at:new Date().toISOString()}); } catch {}
    }
    console.error('Scheduled task failed: '+task+'. Check runner status or persisted email receipt before retrying.');
    return Response.json({ error: 'Scheduled task could not be confirmed.', task }, { status: 503 });
  }
}
