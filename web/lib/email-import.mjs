import { createHash, timingSafeEqual } from 'node:crypto';
import { load } from 'cheerio';
const hash = text => createHash('sha256').update(text).digest('hex').slice(0,20);
export const SOURCE = 'Catalant email';
export function validImportToken(actual, expected) {
  return typeof expected === 'string' && expected.length >= 32 && typeof actual === 'string' && timingSafeEqual(createHash('sha256').update(actual).digest(),createHash('sha256').update(expected).digest());
}
export function parseDigest(message, now = new Date()) {
  if (!message || !/^Catalant Opportunity Digest$/i.test(message.subject || '') || !/^(?:(?:"?Catalant Technologies"?)\s*<)?donotreply@gocatalant\.com>?$/i.test(message.sender || '')) return [];
  if (typeof message.id !== 'string' || !/^[a-f0-9]{10,40}$/.test(message.id) || !Number.isFinite(Date.parse(message.received_at))) throw new Error('Invalid email metadata');
  if (Date.parse(message.received_at) < now.getTime()-7*86400000 || Date.parse(message.received_at)>now.getTime()+300000) return [];
  if (typeof message.html !== 'string' || message.html.length > 500000) throw new Error('Invalid email body');
  const $ = load(message.html); $('script,style,iframe,img').remove();
  const result = new Map();
  $('a[href]').each((_, element) => {
    const a = $(element); const title = a.text().replace(/\s+/g,' ').trim();
    let url; try { url = new URL(a.attr('href')); } catch { return; }
    if (url.hostname === 'links.gocatalant.com' && url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.username || url.password || !['links.gocatalant.com','app.gocatalant.com'].includes(url.hostname)) return;
    if (!/font-weight:\s*(600|700|bold)/i.test(a.attr('style') || '') && !a.find('b,strong').length) return;
    a.after(' ');
    const card = a.closest('table').text().replace(/\s+/g,' ').trim();
    if (/\b(onsite|on-site|travel required|UK\/EMEA|Northern EU|Alberta|Canada)\b/i.test(card)) return;
    const published = card.match(/Published\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
    const posted = published ? new Date(Date.UTC(Number(published[3])+(published[3].length===2?2000:0),Number(published[1])-1,Number(published[2]))) : null;
    if (posted && (!Number.isFinite(posted.getTime()) || posted.getTime()<now.getTime()-7*86400000)) return;
    if (title.length<12 || title.length>250 || !/\b(software|engineer|architect|cloud|devops|data|AI|artificial intelligence|machine learning|digital transformation|platform|technology|automation)\b/i.test(title)) return;
    if (/\b(onsite|on-site|travel required|UK\/EMEA|Northern EU|Alberta|Canada)\b/i.test(title)) return;
    // Digest links repeat for a title, description, category and status. Only
    // title-sized text is a candidate; descriptions usually exceed 250 chars.
    if (/\.\.\.$|Published |^Digital Transformation & Technology$|^View More Projects$/i.test(title)) return;
    const key = title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const id = hash('catalant-email:'+key);
    if (result.has(id)) return;
    const gmail = 'https://mail.google.com/mail/?authuser=mlong%40magneton.io#all/'+message.thread_id;
    result.set(id, { id,title,company_agency:'Client not disclosed',source:SOURCE,source_job_id:key,
      source_posted_at:posted?.toISOString() || '',source_date_text:published?published[0]:'Publication date not supplied in digest',first_seen:now.toISOString(),pay:'unknown',hourly_min_usd:'',contract_status:'Project terms to confirm',c2c_status:'unknown',duration:'unknown',remote_location:'Location to confirm',work_arrangement:'unknown',work_abroad_restrictions:'unknown',geography:'unknown',application_url:url.href,source_url:url.href,fit_tier:'3 - Needs confirmation',fit_reason:'Relevant project title from Catalant digest; terms need review.',pipeline:'email_review',direct_client_classification:'unknown',direct_client_evidence:'Email does not identify the hiring client.',official_employer_url:'',contacts:[],review_score:0,
      email_origin:{sender:message.sender,subject:message.subject,received_at:message.received_at,message_id:message.id,excerpt:card.slice(0,1500),gmail_url:/^[a-f0-9]{10,40}$/.test(message.thread_id || '')?gmail:'https://mail.google.com/mail/?authuser=mlong%40magneton.io#label/Catalant'} });
  });
  return [...result.values()];
}
export function mergeEmailLeads(previous, messages, now = new Date()) {
  const leads = new Map((previous?.leads || []).map(lead=>[lead.id,lead]));
  for (const message of messages) for (const lead of parseDigest(message,now)) {
    const old = leads.get(lead.id);
    leads.set(lead.id, old ? {...lead,first_seen:old.first_seen, pipeline:old.pipeline,qualification:old.qualification} : lead);
  }
  return {leads:[...leads.values()],last_success_at:now.toISOString()};
}
export function mergeSnapshot(base, email, now = new Date()) {
  if (!email?.last_success_at) return base;
  const snapshot = base || {generated_at:now.toISOString(),collected_at:email.last_success_at,leads:[],summary:{new_remote_contracts:0,secondary:0,published_project_needs:0,raw:0,duplicates:0,target:0,source_coverage:[]}};
  return {...snapshot,digest_cutoff:[snapshot.collected_at,email.last_success_at].sort().at(-1),leads:[...snapshot.leads,...email.leads],summary:{...snapshot.summary,source_coverage:[...snapshot.summary.source_coverage,{source:SOURCE,status:'saved',raw:email.leads.length,saved_count:email.leads.length,last_success_at:email.last_success_at,detail:'Daily Gmail import; terms need review. Saved results retained between imports.'}]}};
}
