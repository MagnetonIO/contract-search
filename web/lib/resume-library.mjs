import {checkApplicationOption} from './application-controls.mjs';
import {siteForUrl} from './browser-accounts.mjs';
export const RESUME_RECOVERY_VERSION=6;
export const MASTER_RESUME_NAME='Resume_Matthew_Long.pdf';
export function resumeSite(url){try{const known=siteForUrl(url);if(known)return known;const u=new URL(url),host=u.hostname.toLowerCase();if(['jobs.ashbyhq.com','jobs.lever.co','jobs.eu.lever.co','boards.greenhouse.io','job-boards.greenhouse.io','job-boards.eu.greenhouse.io'].includes(host)){const tenant=u.pathname.split('/').filter(Boolean)[0];if(tenant&&tenant!=='embed')return host+'/'+tenant;}return host;}catch{return null;}}
export function approvedSiteResume(library,url,masterHash){const site=library?.[resumeSite(url)],entry=site?.master_hash===masterHash?site:site?.versions?.[masterHash];return entry?.master_hash===masterHash?entry:null;}
export function approvedResumeControl(control,saved){
 if(!saved?.filename||!control?.inForm||!['radio','checkbox'].includes(control.type)&&!['radio','option'].includes(control.role))return false;
 return String((control.label||'')+' '+(control.text||'')).split(/\s+/).includes(saved.filename);
}
export function recordSiteResume(library,site,entry){const previous=library?.[site];return {...library,[site]:{...entry,versions:{...previous?.versions,...(previous?.master_hash?{[previous.master_hash]:{master_hash:previous.master_hash,filename:previous.filename,approval:previous.approval,recorded_at:previous.recorded_at}}:{}),[entry.master_hash]:entry}}};}
export function resumeUploadName(library,url,masterHash){const entry=approvedSiteResume(library,url,masterHash);return entry?.filename||'Resume_Matthew_Long_'+masterHash.slice(0,8)+'.pdf';}
export function recoverableResumeBlock(attempt){
 if(attempt.submission_intent_at||attempt.resume_recovery_version>=RESUME_RECOVERY_VERSION||!['needs_input','failed'].includes(attempt.status))return false;
 const error=attempt.outcome_history?.at(-1)?.error_message||'';
 if(/locator\.check/.test(error)&&/input.*type.*radio/.test(error)&&/not visible/.test(error))return true;
 return /(?:selection|approved answer).{0,100}Resume_Matthew_Long|attach.{0,30}approved PDF|approved (?:file|résumé).{0,40}Resume_Matthew_Long|approved résumé.{0,40}(?:not (?:selected|uploaded|attached)|not been (?:selected|uploaded|attached))|(?:visible resume (?:file)?name|resume filename).{0,50}(?:differ|match)|resume and cover letter.{0,30}swapped/i.test(attempt.reason||'')||!attempt.selected_resume_filename&&!attempt.uploaded_resume_filename&&(attempt.visual_steps||[]).filter(s=>s.action==='submit'&&s.status==='blocked').length>=2;
}

// An application may show one attached file in a labelled Resume card rather
// than a radio group. Keep evidence inside that card, never a sibling cover
// letter or a page-wide filename list.
export async function resumeCardSelection(scope,filename){
 const review=await scope.getByText(/^Review your application$/i).filter({visible:true}).count()===1;
 const cards=await scope.locator('section,fieldset,article,div').filter({visible:true}).evaluateAll((items,{review})=>items.flatMap(e=>{
  const text=String(e.innerText||'').trim(),lines=text.split(/\n+/).map(x=>x.trim());
  if(!/^(?:resume|résumé)\s*\*?$/i.test(lines[0]||'')||/cover[\s_-]*letter/i.test(text)||e.querySelector('input[type=radio],[role=radio],select'))return [];
  const files=[...new Set(text.match(/[^\s]+\.(?:pdf|docx?|rtf|txt)\b/gi)||[])];
  if(files.length!==1)return [];
  const attached=review||/\b(?:uploaded|attached|selected)\b/i.test(text)||[...e.querySelectorAll('button')].some(b=>/^file options$/i.test(b.getAttribute('aria-label')||b.innerText||''));
  return attached?[files[0]]:[];
 }),{review});
 const names=[...new Set(cards)];
 return names.length===1?{selected:names[0]===filename,filename,current_filename:names[0],method:review?'reviewed_saved_file':'attached_saved_file',card_present:true}:{selected:false,card_present:names.length>0};
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
  // A prior upload is provenance, not proof that a capped site library still
  // contains it. Restore only after observing a loaded, fully expanded list.
  const upload=scope.getByRole('button',{name:/^Upload (?:resume|résumé)$/i}).filter({visible:true});
  const more=scope.getByRole('button',{name:/show (?:more|all).*resum/i}).filter({visible:true});
  if(await radios.count()>0&&await upload.count()===1&&await more.count()===0)return {selected:false,missing:true,filename,reason:'The approved file is absent from the current resume list; restore this exact version.'};
  const card=await resumeCardSelection(scope,filename);
  if(card.selected||card.card_present)return card;
  const file=scope.getByText(filename,{exact:true}).filter({visible:true});
  if(await file.count()===1){
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
 if(!match.checked){
  if(match.native){const result=await checkApplicationOption(scope,radio);if(!result.selected)return {selected:false,reason:result.reason};}
  else if(await radio.isVisible())await radio.click({timeout:5000});
  else return {selected:false,reason:'The approved résumé radio is not visible.'};
 }
 const selected=await radio.evaluate(e=>e.checked===true||e.getAttribute('aria-checked')==='true');
 return {selected,filename,method:'native_saved_file',...(!selected?{reason:'The approved résumé selection did not stay checked.'}:{})};
}
