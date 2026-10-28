import { randomUUID } from 'node:crypto';
import { readJson, writeJson, ConflictError } from './store';
import { applicationUrl } from './shared.mjs';
import type { Lead, LeadProgress, ApplicationEvent } from './types';
import { recordDisposition, purgeRemoved } from './disposition.mjs';

export async function deleteRemoved(ids: string[]) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readJson<Record<string, LeadProgress>>('workflow.json', {});
    const result = purgeRemoved(current.value, ids);
    try { return { ...result, version: await writeJson('workflow.json', result.workflow, current.version) }; }
    catch (error) { if (!(error instanceof ConflictError) || attempt === 4) throw error; }
  }
  throw new ConflictError('Removed opportunities changed. Please try again.');
}

export async function saveDisposition(id: string, action: 'closed' | 'deleted' | 'restore') {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readJson<Record<string, LeadProgress>>('workflow.json', {});
    const progress = recordDisposition(current.value[id], action) as LeadProgress;
    const next = { ...current.value, [id]: progress };
    try { return { workflow: next, version: await writeJson('workflow.json', next, current.version) }; }
    catch (error) { if (!(error instanceof ConflictError) || attempt === 4) throw error; }
  }
  throw new ConflictError('Opportunity changed. Please try again.');
}

export function recordApplication(current: LeadProgress | undefined, lead: Lead, kind: ApplicationEvent['kind'], eventId: string) {
  if (current?.events?.some(event => event.id === eventId)) return current;
  const now = new Date().toISOString();
  const old = current || { stage: 'new', notes: '', updated_at: now };
  const application = { ...old.application };
  if (kind === 'opened') {
    if (old.stage !== 'applying' && old.stage !== 'applied') application.previous_stage = old.stage;
    application.first_opened_at ||= now;
    application.last_opened_at = now;
  } else if (kind === 'submitted') application.submission_recorded_at ||= now;
  const stage = old.stage === 'applied' || kind === 'submitted' ? 'applied'
    : kind === 'cancelled' ? old.stage === 'applying' ? application.previous_stage || 'new' : old.stage : 'applying';
  const event: ApplicationEvent = { id: eventId, kind, recorded_at: now, url: applicationUrl(lead), evidence: kind === 'opened' ? 'link_opened' : 'user_reported' };
  return { ...old, stage, updated_at: now, application, events: [...(old.events || []), event].slice(-100) } as LeadProgress;
}

export async function saveApplication(lead: Lead, kind: ApplicationEvent['kind'], eventId = randomUUID()) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readJson<Record<string, LeadProgress>>('workflow.json', {});
    const progress = recordApplication(current.value[lead.id], lead, kind, eventId);
    if (progress === current.value[lead.id]) return { workflow: current.value, version: current.version };
    const next = { ...current.value, [lead.id]: progress };
    try { return { workflow: next, version: await writeJson('workflow.json', next, current.version) }; }
    catch (error) { if (!(error instanceof ConflictError) || attempt === 4) throw error; }
  }
  throw new ConflictError('Application activity changed. Please try again.');
}
