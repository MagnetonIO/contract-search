import {siteForUrl} from './browser-accounts.mjs';
export const MASTER_RESUME_NAME='Resume_Matthew_Long.pdf';
export function resumeSite(url){try{return siteForUrl(url)||new URL(url).hostname.toLowerCase();}catch{return null;}}
export function approvedSiteResume(library,url,masterHash){const entry=library?.[resumeSite(url)];return entry?.master_hash===masterHash?entry:null;}
export function resumeUploadName(library,url,masterHash){const entry=approvedSiteResume(library,url,masterHash);return entry?.filename||'Resume_Matthew_Long_'+masterHash.slice(0,8)+'.pdf';}
export function recoverableResumeBlock(attempt){
 if(attempt.submission_intent_at||attempt.resume_recovery_version===1||!['needs_input','failed'].includes(attempt.status))return false;
 return /(?:selection|approved answer).{0,100}Resume_Matthew_Long|attach.{0,30}approved PDF|approved résumé.{0,30}not (?:selected|uploaded)/i.test(attempt.reason||'')||!attempt.uploaded_resume_filename&&(attempt.visual_steps||[]).filter(s=>s.action==='submit'&&s.status==='blocked').length>=2;
}

// Only select the exact approved file. Never choose the first/latest file or
// match an older job-specific file by a shortened name.
export async function selectExistingResume(scope,filename){
 const radios=scope.locator('input[type=radio],[role=radio]');
 const matches=await radios.evaluateAll((items,filename)=>items.flatMap((e,index)=>{
  const exact=text=>String(text||'').split(/\s+/).includes(filename);
  let row=e;for(let depth=0;row&&depth<6;depth++,row=row.parentElement){
   if(row!==e&&row.querySelectorAll('input[type=radio],[role=radio]').length>1)break;
   const text=[e.getAttribute('aria-label'),...[...(e.labels||[])].map(l=>l.innerText),row.innerText].filter(Boolean).join(' ');
   if(exact(text))return [{index,checked:e.checked===true||e.getAttribute('aria-checked')==='true',native:e.tagName==='INPUT'}];
  }
  return [];
 }),filename);
 if(matches.length!==1)return {selected:false,reason:matches.length?'Approved filename is ambiguous on this page.':'Approved saved résumé is not listed on this page.'};
 const match=matches[0],radio=radios.nth(match.index);
 if(!match.checked){if(match.native)await radio.check({timeout:5000});else await radio.click({timeout:5000});}
 const selected=await radio.evaluate(e=>e.checked===true||e.getAttribute('aria-checked')==='true');
 return {selected,filename,...(!selected?{reason:'The approved résumé selection did not stay checked.'}:{})};
}
