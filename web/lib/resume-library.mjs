import {siteForUrl} from './browser-accounts.mjs';
export const RESUME_RECOVERY_VERSION=2;
export const MASTER_RESUME_NAME='Resume_Matthew_Long.pdf';
export function resumeSite(url){try{return siteForUrl(url)||new URL(url).hostname.toLowerCase();}catch{return null;}}
export function approvedSiteResume(library,url,masterHash){const entry=library?.[resumeSite(url)];return entry?.master_hash===masterHash?entry:null;}
export function resumeUploadName(library,url,masterHash){const entry=approvedSiteResume(library,url,masterHash);return entry?.filename||'Resume_Matthew_Long_'+masterHash.slice(0,8)+'.pdf';}
export function recoverableResumeBlock(attempt){
 if(attempt.submission_intent_at||attempt.resume_recovery_version>=RESUME_RECOVERY_VERSION||!['needs_input','failed'].includes(attempt.status))return false;
 return /(?:selection|approved answer).{0,100}Resume_Matthew_Long|attach.{0,30}approved PDF|approved résumé.{0,30}not (?:selected|uploaded)/i.test(attempt.reason||'')||!attempt.selected_resume_filename&&!attempt.uploaded_resume_filename&&(attempt.visual_steps||[]).filter(s=>s.action==='submit'&&s.status==='blocked').length>=2;
}

// Only select the exact approved file. Never choose the first/latest file or
// match an older job-specific file by a shortened name.
export async function selectExistingResume(scope,filename,{requested=false}={}){
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
 if(!matches.length){
  const file=scope.getByText(filename,{exact:true}).filter({visible:true});
  if(await file.count()===1){
   const review=scope.getByText(/^Review your application$/i).filter({visible:true});
   const caption=scope.getByText(/^(?:Resume|Résumé)\s*\*?$/i).filter({visible:true});
   if(await review.count()===1&&await caption.count()>=1)return {selected:true,filename,method:'reviewed_saved_file'};
   // Some boards draw file cards without a native/ARIA radio. Request this
   // exact file once; final review must still confirm it before submission.
   const upload=scope.getByText(/^Upload (?:resume|résumé)$/i).filter({visible:true});
   if(await upload.count()===1){
    const safe=await file.evaluate(e=>!e.closest('a[href],button[type=submit],button:not([type]),[role=checkbox]'));
    if(safe){if(!requested)await file.click({timeout:5000});return {selected:false,requested:true,filename,reason:'Saved file selected; awaiting confirmation on the review page.'};}
   }
  }
 }
 if(matches.length!==1)return {selected:false,reason:matches.length?'Approved filename is ambiguous on this page.':'Approved saved résumé selection is not identified on this page.'};
 const match=matches[0],radio=radios.nth(match.index);
 if(!match.checked){if(match.native)await radio.check({timeout:5000});else await radio.click({timeout:5000});}
 const selected=await radio.evaluate(e=>e.checked===true||e.getAttribute('aria-checked')==='true');
 return {selected,filename,method:'native_saved_file',...(!selected?{reason:'The approved résumé selection did not stay checked.'}:{})};
}
