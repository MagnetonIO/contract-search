import { start } from 'workflow/api';
import { applicationCycle } from '../../../workflows/applications';
import { automationSettings, automationDashboard, saveFacts, setEnabled, patchAttempt, reviseAttempt, activity } from '../../../lib/automation-state.mjs';
import { ensureCollection } from '../../../lib/collector-scheduler.mjs';
import { NextResponse } from 'next/server';
import { authConfig, isLoggedIn, sessionFor, checkOrigin, localSetupAllowed, createLocalAccount, resetLocalAccount, checkLogin } from '../../../lib/auth';
import { readBytes, writeBytes, readJson, writeJson, ConflictError } from '../../../lib/store';
import type { Snapshot, Profile, LeadProgress } from '../../../lib/types';
import { STAGES } from '../../../lib/types';
import { safeWebUrl } from '../../../lib/auth-core.mjs';
import { recordApplication, saveApplication, saveDisposition, deleteRemoved } from '../../../lib/workflow';
import { readSnapshot } from '../../../lib/snapshot.mjs';
import { scriptTemplate, scriptManifest } from '../../../lib/gmail-script.mjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mailKey, prepareOutreach, latestOutreach, sendOutreach } from '../../../lib/outreach';
import { MailError, MAIL_FROM, DIGEST_TO } from '../../../lib/mail.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const defaultProfile: Profile = { name: 'Matthew Long', pitch: 'Senior software architect with 20+ years of engineering experience across cloud platforms, backend systems, and AI workflows.', portfolio: '' };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function handle(request: Request, context: Context) {
  const action = (await context.params).path.join('/');
  const config = await authConfig();
  if (request.method !== 'GET') {
    try { checkOrigin(request); } catch { return json({ error: 'Request origin rejected.' }, 403); }
    if (Number(request.headers.get('content-length') || 0) > 3_500_000) return json({ error: 'Use a resume smaller than 3 MB.' }, 413);
  }
  if (action === 'session' && request.method === 'GET') return json({ authenticated: await isLoggedIn(config), configured: Boolean(config), setupAllowed: localSetupAllowed(request), resetPending: Boolean(config?.resetAllowedUntil), resetAllowed: Boolean(config?.resetAllowedUntil && config.resetAllowedUntil > Date.now() && localSetupAllowed(request)) });
  if (action === 'reset-password' && request.method === 'POST') {
    if (!localSetupAllowed(request) || !config?.resetAllowedUntil || config.resetAllowedUntil < Date.now()) return json({ error: 'A local password reset is not active.' }, 403);
    const input = await request.json();
    try {
      const changed = await resetLocalAccount(input.password, input.confirmation);
      const session = await sessionFor(changed); session.username = changed.username; await session.save();
      return json({ success: true });
    } catch (error) { return json({ error: (error as Error).message }, 400); }
  }
  if (action === 'setup' && request.method === 'POST') {
    if (config || !localSetupAllowed(request)) return json({ error: 'Account setup is not available here.' }, 403);
    const input = await request.json();
    try {
      const created = await createLocalAccount(input.username, input.password);
      const session = await sessionFor(created); session.username = created.username; await session.save();
      return json({ success: true });
    } catch (error) { return json({ error: (error as Error).message }, 400); }
  }
  if (!config) return json({ error: 'Dashboard login is not configured yet.' }, 503);
  if (action === 'login' && request.method === 'POST') {
    if (config.resetAllowedUntil) return json({ error: 'Complete the local password reset before signing in.' }, 401);
    const input = await request.json();
    const result = await checkLogin(request, config, input.username, input.password);
    if (result.limited) return json({ error: 'Too many login attempts. Try again in 15 minutes.' }, 429);
    if (!result.success) return json({ error: 'Username or password is incorrect.' }, 401);
    const session = await sessionFor(config); session.username = config.username; await session.save();
    return json({ success: true });
  }
  if (!await isLoggedIn(config)) return json({ error: 'Sign in to continue.' }, 401);
  if (action === 'email-import-script' && request.method === 'POST') {
    let stored = await readJson<{token:string}|null>('email-import-config.json',null);
    if (!stored.value) {
      try { await writeJson('email-import-config.json',{token:randomBytes(32).toString('hex')},stored.version); }
      catch (error) { if (!(error instanceof ConflictError)) throw error; }
      stored = await readJson('email-import-config.json',null);
    }
    const endpoint = new URL('/api/import/catalant',request.url).href;
    return json({script:scriptTemplate.replace('__ENDPOINT__',endpoint).replace('__TOKEN__',stored.value!.token),manifest:scriptManifest});
  }
  if (action === 'automation-resume' && request.method === 'GET') {
    const id=new URL(request.url).searchParams.get('id');if(!id||! /^[a-f0-9-]{36}$/.test(id))return json({error:'Invalid attempt'},400);
    const state=await automationSettings();const a=(state.attempts as Record<string,any>)[id];if(!a?.resume_key)return json({error:'Resume unavailable'},404);
    const file=await readBytes(a.resume_key);if(!file)return json({error:'Resume unavailable'},404);
    return new Response(new Uint8Array(file.value),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename=Resume_Matthew_Long.pdf','Cache-Control':'private, no-store'}});
  }
  if (action === 'automation' && request.method === 'GET') return json(await automationDashboard());
  if (action === 'automation-profile' && request.method === 'POST') return json(await saveFacts(await request.json()));
  if (action === 'automation-settings' && request.method === 'POST') {const input=await request.json();return json(await setEnabled(input.enabled));}
  if (['automation-run','automation-start'].includes(action) && request.method === 'POST') {const state=await automationSettings();if((state.run as {active?:boolean}|null)?.active)return json({already_running:true});await setEnabled(true);const requestedAt=new Date().toISOString();const run=await start(applicationCycle,[]);await writeJson('automation-request.json',{run_id:run.runId,requested_at:requestedAt});await activity('run_requested',{message:'Start accepted. Waiting for the worker to begin.',workflow_run_id:run.runId});return json({run_id:run.runId});}
  if (action === 'browser-login-view' && request.method === 'GET') {const {getLoginView}=await import('../../../lib/login-browser.mjs');const id=new URL(request.url).searchParams.get('id');if(id&&!/^[a-f0-9-]{36}$/.test(id))return json({error:'Invalid browser session'},400);return json(await getLoginView({expectedId:id||undefined}));}
  if (action === 'browser-login-close' && request.method === 'POST') {const {closeLogin}=await import('../../../lib/login-browser.mjs');const input=await request.json();if(input.id&&!/^[a-f0-9-]{36}$/.test(input.id))return json({error:'Invalid browser session'},400);return json(await closeLogin({expectedId:input.id}));}
  if (action === 'browser-login' && request.method === 'POST') {const {openLogin}=await import('../../../lib/application-browser.mjs');const input=await request.json();return json(await openLogin(input.site));}
  if (action === 'browser-login-finish' && request.method === 'POST') {const {finishLogin}=await import('../../../lib/application-browser.mjs');const input=await request.json();if(input.id&&!/^[a-f0-9-]{36}$/.test(input.id))return json({error:'Invalid browser session'},400);return json(await finishLogin({expectedId:input.id}));}
  if (action === 'automation-attempt' && request.method === 'POST') {
    const input=await request.json();if(!/^[a-f0-9-]{36}$/.test(input.id))return json({error:'Invalid attempt'},400);
    const state=await automationSettings();const attempt=(state.attempts as Record<string, any>)[input.id];
    if(!attempt)return json({error:'Attempt missing'},404);
    if(input.action==='resume'&&['needs_input','failed'].includes(attempt.status)&&!attempt.submission_intent_at){await setEnabled(true);await reviseAttempt(input.id,'resume');const run=await start(applicationCycle,[]);return json({run_id:run.runId});}
    if(input.action==='cancel'&&!attempt.submission_intent_at){await reviseAttempt(input.id,'cancel');return json({cancelled:true});}
    return json({error:'An uncertain submission must be reconciled before another attempt.'},409);
  }
  if (action === 'collect-now' && request.method === 'POST') return json(await ensureCollection());
  if (action === 'logout' && request.method === 'POST') { (await sessionFor(config)).destroy(); return json({ success: true }); }
  if (action === 'data' && request.method === 'GET') {
    const [snapshot, workflow, profile] = await Promise.all([
      readSnapshot(), readJson<Record<string, LeadProgress>>('workflow.json', {}), readJson<Profile>('profile.json', defaultProfile),
    ]);
    if (!snapshot.value) return json({ error: 'No collected leads have been loaded yet.' }, 503);
    const schedulerState=await readJson('scheduler-state.json',null);
    const collection=await readJson('collection-state.json',null);
    const digest = await readJson<{status:string;accepted_at?:string;meta?:{count:number}}|null>('digest-state.json',null);
    return json({ collection:collection.value, snapshot: snapshot.value, workflow: workflow.value, version: workflow.version, profile: profile.value, profileVersion: profile.version, scheduler:{configured:Boolean(process.env.COLLECTOR_GITHUB_TOKEN),state:schedulerState.value}, email:{configured:Boolean(await mailKey()),from:MAIL_FROM,recipient:DIGEST_TO,last_digest:digest.value?.status==='accepted'?digest.value.accepted_at:undefined,digest_count:digest.value?.meta?.count} });
  }
  if (action === 'outreach' && request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('lead');
    if (!id || !/^[a-f0-9]{20}$/.test(id)) return json({error:'Choose an opportunity.'},400);
    return json({message:await latestOutreach(id)});
  }
  if (action === 'outreach' && request.method === 'POST') {
    const input = await request.json();
    const snapshot = await readSnapshot();
    const lead = snapshot.value?.leads.find(lead=>lead.id===input.id);
    if (!lead) return json({error:'Opportunity not found.'},404);
    return json({message:await prepareOutreach(lead,input)});
  }
  if (action === 'outreach/send' && request.method === 'POST') {
    const input = await request.json();
    if (input.approved !== true) return json({error:'Review the recipient, message, and attachment before sending.'},400);
    return json(await sendOutreach(input.messageId));
  }
  if (['purge-removed', 'purge-not-fit'].includes(action) && request.method === 'POST') {
    const input = await request.json();
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 5000 || input.ids.some((id: unknown) => typeof id !== 'string' || !/^[a-f0-9]{20}$/.test(id))) return json({ error: 'Choose valid removed opportunities.' }, 400);
    return json(await deleteRemoved(input.ids, action === 'purge-not-fit' ? 'not_a_fit' : 'removed'));
  }
  if (action === 'disposition' && request.method === 'POST') {
    const input = await request.json();
    if (typeof input.id !== 'string' || !/^[a-f0-9]{20}$/.test(input.id) || !['closed', 'deleted', 'not_a_fit', 'restore'].includes(input.action)) return json({ error: 'Choose an opportunity and a valid removal action.' }, 400);
    const snapshot = await readSnapshot();
    if (!snapshot.value?.leads.some(lead => lead.id === input.id)) return json({ error: 'Opportunity not found.' }, 404);
    return json(await saveDisposition(input.id, input.action));
  }
  if (action === 'application' && request.method === 'POST') {
    const input = await request.json();
    if (typeof input.id !== 'string' || !/^[a-f0-9]{20}$/.test(input.id) || !['opened', 'submitted', 'cancelled'].includes(input.kind) || typeof input.eventId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.eventId)) return json({ error: 'Choose an opportunity and a valid application action.' }, 400);
    const snapshot = await readSnapshot();
    const lead = snapshot.value?.leads.find(lead => lead.id === input.id);
    if (!lead) return json({ error: 'Opportunity not found.' }, 404);
    return json(await saveApplication(lead, input.kind, input.eventId));
  }
  if (action === 'progress' && request.method === 'POST') {
    const input = await request.json();
    if (typeof input.id !== 'string' || !/^[a-f0-9]{20}$/.test(input.id) || !STAGES.includes(input.stage) || typeof input.notes !== 'string' || input.notes.length > 10000) return json({ error: 'Choose a valid stage and a note under 10,000 characters.' }, 400);
    const [snapshot, workflow] = await Promise.all([readSnapshot(), readJson<Record<string, LeadProgress>>('workflow.json', {})]);
    if (!snapshot.value?.leads.some(lead => lead.id === input.id)) return json({ error: 'Opportunity not found.' }, 404);
    if (input.version !== workflow.version) throw new ConflictError('Another session updated your pipeline. Refresh and try again.');
    let progress: LeadProgress = { ...workflow.value[input.id], stage: input.stage, notes: input.notes, updated_at: new Date().toISOString() };
    if (input.stage === 'applied' && workflow.value[input.id]?.stage !== 'applied') progress = recordApplication(progress, snapshot.value.leads.find(lead => lead.id === input.id)!, 'submitted', randomUUID());
    const next = { ...workflow.value, [input.id]: progress };
    const version = await writeJson('workflow.json', next, workflow.version);
    return json({ workflow: next, version });
  }
  if (action === 'profile' && request.method === 'POST') {
    const input = await request.json();
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || typeof input.pitch !== 'string' || input.pitch.length > 2000 || (input.portfolio && !safeWebUrl(input.portfolio))) return json({ error: 'Enter your name, a short introduction, and a valid HTTPS portfolio URL.' }, 400);
    const current = await readJson<Profile>('profile.json', defaultProfile);
    if (input.version !== current.version) throw new ConflictError('Your profile changed in another session. Refresh and try again.');
    const profile = { ...current.value, name: input.name.trim(), pitch: input.pitch, portfolio: input.portfolio || '' };
    const version = await writeJson('profile.json', profile, current.version);
    return json({ profile, version });
  }
  if (action === 'resume' && request.method === 'POST') {
    const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File) || file.size > 3_000_000 || file.size === 0) return json({ error: 'Choose a PDF or DOCX resume under 3 MB.' }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const pdf = file.name.toLowerCase().endsWith('.pdf') && bytes.subarray(0,5).toString() === '%PDF-';
    const docx = file.name.toLowerCase().endsWith('.docx') && bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!pdf && !docx) return json({ error: 'Choose a PDF or DOCX resume.' }, 400);
    const current = await readJson<Profile>('profile.json', defaultProfile);
    const mime = pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    await writeBytes('resume.bin', bytes, mime);
    const profile = { ...current.value, resume_hash: createHash('sha256').update(bytes).digest('hex'), resume_name: file.name.replace(/[^a-zA-Z0-9_. -]/g, '_').slice(0,150), resume_type: mime };
    const version = await writeJson('profile.json', profile, current.version);
    return json({ profile, version });
  }
  if (action === 'resume' && request.method === 'GET') {
    const [file, profile] = await Promise.all([readBytes('resume.bin'), readJson<Profile>('profile.json', defaultProfile)]);
    if (!file || !profile.value.resume_name) return json({ error: 'Upload your resume in Profile first.' }, 404);
    return new Response(new Uint8Array(file.value), { headers: { 'Content-Type': profile.value.resume_type || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${profile.value.resume_name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  return json({ error: 'Not found.' }, 404);
}
async function dispatch(request: Request, context: Context) {
  try { return await handle(request, context); }
  catch (error) {
    if ((error as Error).name==='AutomationInputError') return json({error:(error as Error).message},400);
    if (error instanceof MailError) return json({error:error.message},400);
    if (error instanceof ConflictError) return json({ error: error.message }, 409);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    console.error('Dashboard request failed:', (error as Error).name);
    return json({ error: 'Could not load or save your workspace. Please try again.' }, 503);
  }
}
export const GET = dispatch;
export const POST = dispatch;
