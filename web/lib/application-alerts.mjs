import {readJson,writeJson,ConflictError} from './store.ts';
import {deliverStored,sendMail,escapeHtml,MAIL_FROM,DIGEST_TO,DASHBOARD_URL} from './mail.mjs';
import {evidenceText} from './outcome-evidence.mjs';
const store={read:key=>readJson(key,null),write:writeJson,conflict:e=>e instanceof ConflictError};
export function exceptionEmail(attempt){
 const title=evidenceText(attempt.title||'Application'),reason=evidenceText(attempt.reason||'Application needs review.'),instruction=evidenceText(attempt.required_action?.instruction||'Open the private browser and complete the indicated verification.');
 const company=evidenceText(attempt.company||attempt.verification?.company||''),source=evidenceText(attempt.source||'');
 const url=DASHBOARD_URL+'/application-verification?id='+encodeURIComponent(attempt.id);
 const expiry=attempt.verification?.expires_at;
 const until=expiry?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(expiry)):null;
 const text=['CONTRACT DESK','Application needs your attention',title,[company,source].filter(Boolean).join(' · '),reason,'Next step: '+instruction,until?'Private browser available until '+until+'.':'',url,'This application is not confirmed. It does not count toward your daily quota. Other eligible applications can continue.'].filter(Boolean).join('\n\n');
 const paragraph=value=>'<p style="margin:0 0 16px;">'+escapeHtml(value)+'</p>';
 const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#f2f4f7;color:#182b49;"><div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(title)} needs a verification step.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #dce3ed;border-radius:12px;font:16px/1.6 Arial,Helvetica,sans-serif;"><tr><td style="padding:28px;"><p style="margin:0 0 20px;font-size:12px;letter-spacing:1px;font-weight:bold;color:#486587;">CONTRACT DESK</p><h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;">Application needs your attention</h1><h2 style="margin:0 0 4px;font-size:19px;line-height:1.4;">${escapeHtml(title)}</h2><p style="margin:0 0 24px;color:#62748b;">${escapeHtml([company,source].filter(Boolean).join(' · '))}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7e6;border:1px solid #eddaaa;border-radius:8px;"><tr><td style="padding:16px;">${paragraph(reason)}<p style="margin:0;"><strong>Next step</strong><br>${escapeHtml(instruction)}</p></td></tr></table><p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#245be3;color:#fff;text-decoration:none;font-weight:bold;border-radius:6px;">Open private application</a></p>${until?paragraph('Browser available until '+until+'.'):''}<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e3e8ef;color:#62748b;font-size:13px;">This application is not confirmed and does not count toward your daily quota. Other eligible applications can continue.</p></td></tr></table></td></tr></table></body></html>`;
 return {from:MAIL_FROM,to:[DIGEST_TO],subject:'[Contract Desk] Action needed: '+title.replace(/[\r\n]/g,' ').slice(0,140),text,html};
}
export async function notifyApplicationException(attempt,{send=sendMail,storage=store}={}){
 if(['submitted','skipped','failed'].includes(attempt.status)||attempt.required_action?.owner==='automation')return {status:'not_needed'};
 const issue=attempt.verification?.started_at||attempt.updated_at;
 const identity='application-exception/'+attempt.id+'/'+issue;
 const key='application-alerts/'+attempt.id+'.json';
 return deliverStored(storage,key,identity,async()=>{
  return {payload:exceptionEmail(attempt)};
 },send);
}
