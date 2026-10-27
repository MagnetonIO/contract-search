import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJson, readBytes, localDir, ConflictError } from './store';
import { contactEmails } from './shared.mjs';
import { deliverStored, sendMail, MailError, MAIL_FROM, MAIL_REPLY_TO, textHtml } from './mail.mjs';
import type { Lead, LeadProgress, Profile, Contact } from './types';

export async function mailKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  if (process.env.VERCEL) return '';
  try { return JSON.parse(await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ localDir(), 'mail.json'), 'utf8')).apiKey || ''; }
  catch { return ''; }
}
const store = { read: (key: string) => readJson<any>(key, null), write: writeJson, conflict: (error: unknown) => error instanceof ConflictError };
export type OutreachMessage = { id: string; lead_id: string; recipient: string; subject: string; text: string; attachResume: boolean; resume_name?: string; status: string; prepared_at: string; approved_at?: string; provider_id?: string; accepted_at?: string };
type Stored = { identity: string; status: string; prepared_at: string; approved_at?: string; first_attempt_at?: string; provider_id?: string; accepted_at?: string; payload: { from: string; to: string[]; reply_to: string; subject: string; text: string; html: string; attachments?: { filename: string; content: string }[] }; meta: { lead_id: string; attachResume: boolean; resume_name?: string } };
const publicMessage = (record: Stored): OutreachMessage => ({ id: record.identity, lead_id: record.meta.lead_id, recipient: record.payload.to[0], subject: record.payload.subject, text: record.payload.text, attachResume: record.meta.attachResume, resume_name: record.meta.resume_name, status: record.status, prepared_at: record.prepared_at, approved_at: record.approved_at, provider_id: record.provider_id, accepted_at: record.accepted_at });
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export async function prepareOutreach(lead: Lead, input: { messageId: unknown; recipient: unknown; subject: unknown; text: unknown; attachResume: unknown }) {
  if (!uuid(input.messageId) || typeof input.recipient !== 'string' || !(contactEmails(lead) as Contact[]).some(contact => contact.email.toLowerCase() === String(input.recipient).toLowerCase()) || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(input.recipient) || typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length>200 || /[\r\n]/.test(input.subject) || typeof input.text !== 'string' || !input.text.trim() || input.text.length>10000 || typeof input.attachResume !== 'boolean') throw new MailError('Choose a listed hiring contact, a subject under 200 characters, and a message under 10,000 characters.');
  const key = 'outreach/'+input.messageId+'.json';
  const existing = await readJson<Stored|null>(key, null);
  if (existing.value) {
    if (existing.value.meta.lead_id !== lead.id || existing.value.payload.to[0] !== input.recipient || existing.value.payload.subject !== input.subject || existing.value.payload.text !== input.text || existing.value.meta.attachResume !== input.attachResume) throw new MailError('This draft was already prepared with different content. Start a new draft to change it.');
    return publicMessage(existing.value);
  }
  const previous = await readJson<{messageId:string}|null>('outreach-lead/'+lead.id+'.json',null);
  if (previous.value && uuid(previous.value.messageId)) {
    const pending = await readJson<Stored|null>('outreach/'+previous.value.messageId+'.json',null);
    if (pending.value?.first_attempt_at && pending.value.status !== 'accepted') throw new MailError('A previous send is unresolved. Open its existing draft and retry the same message, or reconcile its receipt in Resend.');
  }
  const profile = await readJson<Profile|null>('profile.json', null);
  const resume = input.attachResume ? await readBytes('resume.bin') : null;
  if (input.attachResume && (!resume || !profile.value?.resume_name)) throw new MailError('Upload your resume before attaching it.');
  const record: Stored = { identity: input.messageId, status: 'prepared', prepared_at: new Date().toISOString(),
    meta: { lead_id: lead.id, attachResume: input.attachResume, ...(resume?{resume_name:profile.value!.resume_name}:{}) },
    payload: { from: MAIL_FROM, to: [input.recipient], reply_to: MAIL_REPLY_TO, subject: input.subject, text: input.text, html: textHtml(input.text), ...(resume?{attachments:[{filename:profile.value!.resume_name!,content:resume.value.toString('base64')}]}:{}) } };
  try { await writeJson(key, record, null); }
  catch (error) { if (!(error instanceof ConflictError)) throw error; return prepareOutreach(lead, input); }
  // A per-lead pointer keeps prepared/uncertain messages discoverable after a reload.
  await writeJson('outreach-lead/'+lead.id+'.json', { messageId: input.messageId });
  return publicMessage(record);
}

export async function latestOutreach(leadId: string) {
  const pointer = await readJson<{messageId:string}|null>('outreach-lead/'+leadId+'.json', null);
  if (!pointer.value || !uuid(pointer.value.messageId)) return null;
  const stored = await readJson<Stored|null>('outreach/'+pointer.value.messageId+'.json', null);
  return stored.value ? publicMessage(stored.value) : null;
}

export async function sendOutreach(messageId: unknown) {
  if (!uuid(messageId)) throw new MailError('Choose a prepared email.');
  const apiKey = await mailKey();
  if (!apiKey) throw new MailError('Connect Resend before sending email.');
  const key = 'outreach/'+messageId+'.json';
  let current = await readJson<Stored|null>(key, null);
  if (!current.value) throw new MailError('Prepare and review this email before sending.');
  // Stamp the explicit dashboard approval before delivery, preserving the frozen payload.
  if (!current.value.approved_at) {
    await writeJson(key, {...current.value, approved_at:new Date().toISOString()}, current.version);
    current = await readJson<Stored|null>(key, null);
  }
  const record = await deliverStored(store, key, messageId, async()=>{throw new MailError('Prepared email missing.');}, (payload: Stored['payload'], identity: string)=>sendMail(payload, identity, {apiKey})) as Stored;
  for (let attempt=0;attempt<5;attempt++) {
    const workflow = await readJson<Record<string,LeadProgress>>('workflow.json',{});
    const old = workflow.value[record.meta.lead_id] || {stage:'new',notes:'',updated_at:record.accepted_at!};
    const receipt = {id:messageId,recipient:record.payload.to[0],subject:record.payload.subject,provider_id:record.provider_id!,accepted_at:record.accepted_at!};
    const outreach = [...(old.outreach||[]).filter(item=>item.id!==messageId),receipt];
    const next = {...workflow.value,[record.meta.lead_id]:{...old,stage:['applied','applying','not_a_fit'].includes(old.stage)?old.stage:'contacted',updated_at:new Date().toISOString(),outreach}};
    try { const version = await writeJson('workflow.json',next,workflow.version);return { message:publicMessage(record),workflow:next,version }; }
    catch(error){if(!(error instanceof ConflictError)||attempt===4)throw error;}
  }
  throw new ConflictError('Email accepted; refresh to reconcile the contact receipt.');
}
