export function safeWebUrl(value) {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : ''; }
  catch { return ''; }
}
export function formatPay(value) {
  if (!value || value === 'unknown') return 'Rate not published';
  if (value.startsWith('{')) {
    try {
      const pay = JSON.parse(value); const data = pay.value || pay;
      const minimum = data.minValue ?? data.value; const maximum = data.maxValue;
      if (minimum != null) return `${pay.currency || ''} ${Number(minimum).toLocaleString('en-US')}${maximum ? '–'+Number(maximum).toLocaleString('en-US') : ''}${data.unitText ? ' / '+String(data.unitText).toLowerCase() : ''}`.trim();
    } catch { /* Keep the original source pay text. */ }
  }
  return value;
}
export function applicationUrl(lead) {
  const reviewed = lead.qualification?.contact?.url || '';
  const jobLink = /\/j\/|careerplug\.com\/jobs\/|icims\.com\/jobs\//.test(reviewed) ? reviewed : '';
  return [jobLink, lead.official_employer_url, lead.application_url, lead.source_url].map(safeWebUrl).find(Boolean) || '';
}
export function draftEmail(lead, profile) {
  const name = lead.qualification?.contact?.name;
  const greeting = name && !lead.qualification?.contact?.email_name ? `Hi ${name.split(' ')[0]},` : 'Hello,';
  return `${greeting}\n\nI'm interested in the ${lead.title} opportunity at ${lead.company_agency}. ${profile.pitch}\n\nCould you confirm the hourly budget, C2C eligibility, location and time-zone requirements, and the hiring client? I'd be happy to share my resume and relevant work.${profile.portfolio ? '\n\nPortfolio: '+profile.portfolio : ''}\n\nThank you,\n${profile.name}`;
}
export function contactEmails(lead) {
  const contacts = (lead.contacts || []).filter(contact => contact.kind !== 'accessibility_only');
  const email = lead.qualification?.contact?.email;
  if (email && !contacts.some(contact => contact.email.toLowerCase() === email.toLowerCase())) contacts.unshift({ email, kind: 'hiring', detail: lead.qualification.contact.detail });
  return contacts;
}
export function emailHref(email, lead, profile) {
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return '';
  return `mailto:${email}?subject=${encodeURIComponent('Contract inquiry: '+lead.title)}&body=${encodeURIComponent(draftEmail(lead, profile))}`;
}
