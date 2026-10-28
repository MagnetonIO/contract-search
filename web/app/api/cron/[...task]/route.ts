import { cronAuthorized } from '../../../../lib/digest-schedule.mjs';
import { sendDailyDigest } from '../../../../lib/digest.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ task: string[] }> }) {
  const task = (await context.params).task.join('/');
  if (!['digest', 'digest-backup'].includes(task)) return new Response('Not found', { status: 404 });
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) return new Response('Unauthorized', { status: 401 });
  try {
    return Response.json(await sendDailyDigest(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    console.error('Scheduled digest failed; check the persisted send record and provider receipt before retrying.');
    return Response.json({ error: 'Digest delivery could not be confirmed.' }, { status: 503 });
  }
}
