import { randomUUID } from 'node:crypto';
import { readJson, writeJson, ConflictError } from './store';
import { applicationUrl } from './shared.mjs';
import type { Lead, LeadProgress, ApplicationEvent } from './types';

export function recordApplication(current: LeadProgress | undefined, lead: Lead, kind: ApplicationEvent['kind'], eventId: string) {
  if (current?.events?.some(event => event.id === eventId)) return current;
  const now = new Date().toISOString();
  const old = current || { stage: 'new', notes: '', updated_at: now };
  const application = { ...old.application };
  if (kind === 'opened') {
    application.first_opened_at ||= now;
    application.last_opened_at = now;
  } else application.submission_recorded_at ||= now;
  const stage = kind === 'submitted' ? 'applied' : old.stage === 'applied' ? 'applied' : 'applying';
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
