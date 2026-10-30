import {load} from 'cheerio';
const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const publicHosts=['dice.com','linkedin.com','indeed.com','glassdoor.com','wellfound.com','builtin.com','jobserve.com','techfetch.com','remotive.com','weworkremotely.com','greenhouse.io','lever.co','ashbyhq.com','workable.com','icims.com','smartrecruiters.com','myworkdayjobs.com','myworkdaysite.com','taleo.net','applytojob.com'];
export function publicPostingUrl(lead){
 for(const raw of [lead.application_url,lead.source_url])try{const u=new URL(raw);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&publicHosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))return u.href;}catch{}
 return null;
}
export function parsePostingStatus(lead,{status,html=''}){
 const $=load(html);const jobs=[];
 function visit(value){if(Array.isArray(value))return value.forEach(visit);if(!value||typeof value!=='object')return;if([value['@type']].flat().includes('JobPosting'))jobs.push(value);if(value['@graph'])visit(value['@graph']);}
 $('script[type="application/ld+json"]').each((_,e)=>{try{visit(JSON.parse($(e).text()));}catch{}});
 const job=jobs.find(j=>normalize(j.title)===normalize(lead.title));
 const matching=Boolean(job)||$('h1').toArray().some(e=>normalize($(e).text())===normalize(lead.title));
 $('script,style,noscript').remove();
 $('h1,h2,h3,p,div,li,span,br').append(' ');
 const visible=$('main').length?$('main').text():$('body').text();
 const summary=visible.split(/Similar Jobs|Recommended jobs|People also viewed/i)[0];
 const salary=job?.baseSalary;const amount=salary?.value||salary;const min=Number(amount?.minValue??amount?.value),max=Number(amount?.maxValue??amount?.value??amount?.minValue);
 const unit=String(amount?.unitText||salary?.unitText||'').toUpperCase();
 let pay;
 if(salary?.currency==='USD'&&Number.isFinite(min)&&Number.isFinite(max)){
  const range=min===max?'$'+min:'$'+min+' - $'+max;
  if(/HOUR/.test(unit))pay=range+'/hr';else if(/YEAR|ANNUAL/.test(unit))pay=range+'/yr';
  else{const hourly=[...summary.slice(0,5000).matchAll(/\$([\d,]+(?:\.\d+)?)\s*(?:-|–|to)\s*\$?([\d,]+(?:\.\d+)?)\s*\/\s*hr\b/gi)];if(hourly.some(m=>Number(m[1].replaceAll(',',''))===min&&Number(m[2].replaceAll(',',''))===max))pay=range+'/hr';}
 }
 const base={http_status:status,...(pay?{pay}:{}),...(job?.description?{description:load(String(job.description)).text().replace(/\s+/g,' ').trim().slice(0,25000)}:{})};
 if([404,410].includes(status))return {...base,status:'closed',reason:'The posting returned HTTP '+status+'.'};
 if(status!==200)return {...base,status:'unknown',reason:[403,429].includes(status)?'Public access is restricted; availability will be checked in the application browser.':'Public availability could not be confirmed.'};
 if(!matching)return {...base,status:'unknown',reason:'The response did not identify the selected posting.'};
 const closed=/no longer accepting applications|(?:this )?job is no longer available|(?:this )?position has been filled|posting has expired/i;
 const alerts=$('[role="alert"],.alert-type-page,.artdeco-inline-feedback,[data-testid*="expired"]').toArray().map(e=>$(e).text());
 const siteNotice=alerts.find(t=>closed.test(t));
 if(siteNotice)return {...base,status:'closed',site_notice:siteNotice.replace(/\s+/g,' ').trim().slice(0,1000),reason:'The selected posting explicitly reports that applications are closed.'};
 return {...base,status:'open',reason:'The current public posting was identified.'};
}
export async function checkPublicPosting(lead,{fetcher=fetch,now=new Date()}={}){
 const url=publicPostingUrl(lead);const base={checked_at:now.toISOString(),source_url:lead.application_url||lead.source_url};
 if(!url)return {...base,status:'unknown',reason:'Availability will be checked in the application browser; no supported public check is configured.'};
 try{
  const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'}});
  const reader=response.body?.getReader();let bytes=0;const parts=[];
  if(reader){while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2_000_000){await reader.cancel();return {...base,status:'unknown',reason:'Public page exceeded the bounded availability check.'};}parts.push(Buffer.from(value));}}
  return {...base,...parsePostingStatus(lead,{status:response.status,html:Buffer.concat(parts).toString('utf8')})};
 }catch{return {...base,status:'unknown',reason:'Public availability check was unavailable; the application browser will check again.'};}
}
export function overlayPostingEvidence(snapshot,validation){
 if(!snapshot)return snapshot;
 return {...snapshot,leads:snapshot.leads.map(lead=>{const checked=validation?.postings?.[lead.id];return checked?.source_url===(lead.application_url||lead.source_url)&&checked.pay?{...lead,pay:checked.pay}:lead;})};
}
