export function safeWebUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    // SAM's API uiLink points into an authenticated workspace. Display the public
    // notice URL without changing the stored source URL or its stable lead ID.
    const notice = parsed.pathname.match(/^\/workspace\/contract\/opp\/([a-f0-9-]{32,36})\/view\/?$/i);
    if (['sam.gov','www.sam.gov'].includes(parsed.hostname) && notice) parsed.pathname = '/opp/'+notice[1]+'/view';
    return parsed.href;
  }
  catch { return ''; }
}
export function leadInView(lead, progress, view) {
  if (progress?.disposition) return view === 'removed';
  if (view === 'removed') return false;
  const stage = progress?.stage || 'new';
  switch (view) {
    case 'opportunities': return lead.pipeline === 'contract' && stage !== 'applied';
    case 'email_review': return lead.pipeline === 'email_review' && stage !== 'applied';
    case 'review': return Boolean(lead.qualification);
    case 'saved': return ['saved','ready'].includes(stage);
    case 'contacted': return stage === 'contacted' || Boolean(progress?.outreach?.length);
    case 'applied': return ['applying','applied'].includes(stage);
    case 'secondary': return lead.pipeline === 'secondary';
    case 'projects': return lead.pipeline === 'published_project_need';
    default: return true;
  }
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

export function usLocation(lead) { return ['us_remote_advertised','us_remote_restricted','worldwide_remote_advertised'].includes(lead.location_assessment?.status) && lead.work_arrangement==='remote'; }
export function locationLabel(lead) {return ({us_remote_advertised:'US remote advertised',us_remote_restricted:'US remote — restrictions apply',worldwide_remote_advertised:'Worldwide remote advertised',us_excluded:'US excluded',not_remote:'Hybrid / onsite'})[lead.location_assessment?.status] || 'US eligibility unclear';}
