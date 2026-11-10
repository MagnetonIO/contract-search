import {pointControl} from './application-visual.mjs';

// Runs in the browser. An anonymous file input in a mixed Resume/Cover Letter
// form is not a verified resume destination, even if it is the only input.
export function documentInputKind(e){
 const own=[e.name,e.id,e.getAttribute('aria-label'),e.getAttribute('aria-describedby'),...[...(e.labels||[])].map(l=>l.innerText)].filter(Boolean).join(' ');
 const classify=text=>/cover[\s_-]*letter|photo|avatar/i.test(text)?'other':/resume|résumé|\bcv\b/i.test(text)?'resume':null;
 const direct=classify(own);if(direct)return direct;
 for(let row=e.parentElement,depth=0;row&&depth<5;row=row.parentElement,depth++){
  if(['FORM','MAIN','BODY'].includes(row.tagName))break;
  const kind=classify(row.innerText||'');if(kind)return kind;
 }
 return 'unknown';
}

export async function uploadApprovedResume({page,scope,file,index,label,byIndex,x,y}){
 if(/cover[\s_-]*letter/i.test(label||''))return {not_uploaded:true,action:'Skip the cover letter; this helper only uploads the approved résumé.'};
 const inputs=scope.locator('input[type=file]');
 const destinations=[];for(let i=0;i<await inputs.count();i++)if(await inputs.nth(i).evaluate(documentInputKind)==='resume')destinations.push(inputs.nth(i));
 if(destinations.length===1){await destinations[0].setInputFiles(file);return {attached:true};}
 if(destinations.length>1)return {not_uploaded:true,action:'Multiple resume upload fields are present; identify the active resume control before uploading.'};
 if(index!==undefined&&label&&byIndex){const input=await byIndex(index,label);if(await input.evaluate(documentInputKind)!=='resume')return {not_uploaded:true,action:'This file input is not identified as the resume field. Use the Resume upload or replacement control; never the cover letter input.'};await input.setInputFiles(file);return {attached:true};}
 const button=scope.getByRole('button',{name:/^(?!.*(?:template|builder|tailor|generate|premium))(?:upload|attach|replace|choose|select)\b.*\b(?:resume|résumé|cv)\b/i}).filter({visible:true});
 let click;
 if(await button.count()===1)click=()=>button.click({timeout:10000});
 else {
  // Some boards expose replacement only through the attached Resume card's
  // File options menu. Bind the menu to that card, not a cover-letter card.
  const options=scope.getByRole('button',{name:/^(?:File options|Resume options)$/i}).filter({visible:true});
  const matches=await options.evaluateAll(items=>items.flatMap((e,index)=>{
   if(/^Resume options$/i.test(e.getAttribute('aria-label')||e.innerText||''))return [index];
   for(let row=e.parentElement;row&&!['FORM','MAIN','BODY'].includes(row.tagName);row=row.parentElement){
    const text=String(row.innerText||'').trim();
    if(/^(?:resume|résumé)\s*\*?\s*\n/i.test(text)&&! /cover[\s_-]*letter/i.test(text))return [index];
   }return [];
  }));
  if(matches.length===1){
   await options.nth(matches[0]).click({timeout:10000});
   const replace=page.getByRole('menuitem',{name:/^(?:Replace(?:Replace)?|Upload (?:a )?(?:different |new )?resume|Use (?:a )?(?:different|new) resume)$/i}).filter({visible:true});
   if(await replace.count()===1)click=()=>replace.click({timeout:10000});
  }
 }
 if(!click&&Number.isFinite(x)&&Number.isFinite(y)){
  const control=await pointControl(page,x,y);
  if(control&&!/photo|avatar|cover.?letter|tailor|generate|premium|template|builder|options/i.test(control.label+' '+control.text)&&/resume|résumé|\bcv\b/i.test(control.label+' '+control.text))click=()=>page.mouse.click(x,y);
 }
 if(!click)return {not_uploaded:true,action:'No unique resume uploader was identified. Inspect the current resume upload control.'};
 const picker=page.waitForEvent('filechooser',{timeout:10000}).catch(()=>null);
 await click();const chooser=await picker;
 if(!chooser)return {not_uploaded:true,action:'The resume control did not open a file chooser. Inspect the fresh page before retrying.'};
 await chooser.setFiles(file);return {attached:true};
}
