import {pointControl} from './application-visual.mjs';

export async function uploadApprovedResume({page,scope,file,index,label,byIndex,x,y}){
 const inputs=scope.locator('input[type=file]');
 if(await inputs.count()===1){
  const meta=await inputs.evaluate(e=>({accept:e.accept||'',label:[e.name,e.id,e.getAttribute('aria-label'),e.labels?.[0]?.innerText].join(' ')}));
  if(!/photo|avatar|cover.?letter/i.test(meta.label)&&!(/image\//i.test(meta.accept)&&!/pdf/i.test(meta.accept))){await inputs.setInputFiles(file);return {attached:true};}
 }
 if(index!==undefined&&label&&byIndex){await(await byIndex(index,label)).setInputFiles(file);return {attached:true};}
 const button=scope.getByRole('button',{name:/^(?:upload|attach|replace|choose|select)\b.*\b(?:resume|résumé|cv)\b/i}).filter({visible:true});
 let click;
 if(await button.count()===1)click=()=>button.click({timeout:10000});
 else if(Number.isFinite(x)&&Number.isFinite(y)){
  const control=await pointControl(page,x,y);
  if(control&&!/photo|avatar|tailor|generate|premium/i.test(control.label+' '+control.text)&&/resume|résumé|upload|attach|choose.*file|select.*file/i.test(control.label+' '+control.text))click=()=>page.mouse.click(x,y);
 }
 if(!click)return {not_uploaded:true,action:'No unique resume uploader was identified. Inspect the current resume upload control.'};
 const picker=page.waitForEvent('filechooser',{timeout:10000}).catch(()=>null);
 await click();const chooser=await picker;
 if(!chooser)return {not_uploaded:true,action:'The resume control did not open a file chooser. Inspect the fresh page before retrying.'};
 await chooser.setFiles(file);return {attached:true};
}
