const normalized=value=>String(value||'').replace(/\s+/g,' ').trim();
const STANDARD_CONFIRMATION_PATTERN=/your application (?:has been |was |is )?(?:submitted|received|sent)|thank you for applying|successfully applied|application submitted|application received/i;
export const CONFIRMATION_PATTERN=new RegExp(STANDARD_CONFIRMATION_PATTERN.source+'|your application is on its way','i');
export function diceApplicationReceipt(text,{url,target}={}){
 try{
  const current=new URL(url),original=new URL(target),dice=u=>u.hostname==='dice.com'||u.hostname.endsWith('.dice.com');
  if(!dice(current)||!dice(original))return null;
  const job=current.pathname.match(/^\/job-applications\/([a-z0-9-]+)\/wizard\/success\/?$/i)?.[1];
  const intended=original.pathname.match(/^\/(?:job-detail|job-applications)\/([a-z0-9-]+)(?:\/|$)/i)?.[1];
  const notice=normalized(text);if(!job||job!==intended||! /find the job listing for this role in your Applied Jobs/i.test(notice))return null;
  return notice.match(/your application is on its way/i)?.[0]||null;
 }catch{return null;}
}
export function applicationReceipt(text,context={}){return normalized(text).match(STANDARD_CONFIRMATION_PATTERN)?.[0]||diceApplicationReceipt(text,context);}
export function applicationControlKind({text='',label='',type='',inForm=false}={}){
 const name=normalized(text||label).toLowerCase();
 if(/submit|send application|complete application/.test(name))return 'submission';
 if(/sign|agree|accept|terms|purchase|pay|delete/.test(name))return 'unsupported';
 if(['apply','apply now'].includes(name))return inForm||type==='submit'?'submission':'entry';
 if(['easy apply','start application'].includes(name))return inForm&&type==='submit'?'submission':'entry';
 if(/^(next|continue|review)(?: (?:to )?(?:the )?(?:next step|application|your application))?$/.test(name))return 'step';
 return 'unsupported';
}
export async function applicationScope(page){
 const dialogs=page.locator('dialog:not([aria-hidden=true]),[role=dialog]:not([aria-hidden=true]),[role=alertdialog]:not([aria-hidden=true])').filter({visible:true});if(await dialogs.count())return dialogs.last();
 const main=page.getByRole('main').filter({visible:true});return await main.count()===1?main:page.locator('body');
}
export async function applicationButtons(scope){
 return scope.getByRole('button').filter({visible:true}).evaluateAll(items=>items.map(e=>({text:(e.innerText||'').replace(/\s+/g,' ').trim(),label:(e.getAttribute('aria-label')||e.innerText||'').replace(/\s+/g,' ').trim(),type:e.getAttribute('type')||'',inForm:Boolean(e.closest('form,[role=dialog],dialog')),disabled:e.disabled||e.getAttribute('aria-disabled')==='true',bounds:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}})));
}
export async function clickApplicationStep(page,label){
 const scope=await applicationScope(page),buttons=await applicationButtons(scope),requested=normalized(label);
 const matches=buttons.map((b,index)=>({...b,index})).filter(b=>b.label===requested||b.text===requested);
 if(matches.length!==1||matches[0].disabled)return {unsupported:true,reason:'Application navigation control is missing, disabled or ambiguous.'};
 const button=matches[0],kind=applicationControlKind(button);
 if(kind==='submission')return {requires_submit:true,action:'Use the submit tool for this final application action.'};
 if(kind==='unsupported')return {unsupported:true,reason:'Application control is not a supported navigation step.'};
 // Keep the locator tied to the observed label as the page changes. A moving
 // button index must never turn a Next click into a final submission.
 let control=scope.getByRole('button',{name:button.label,exact:true}).filter({visible:true});
 if(await control.count()!==1){
  const text=button.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').split(/\s+/).join('\\s+');
  control=scope.getByRole('button').filter({visible:true,hasText:new RegExp('^\\s*'+text+'\\s*$')});
 }
 if(await control.count()!==1)return {unsupported:true,reason:'Application navigation changed; inspect the form again.'};
 await control.click({timeout:15000});
 return {clicked:true};
}
export async function openLinkedInApplication(page){
 // This observed control opens the current listing's Easy Apply dialog. It
 // never clicks a final Apply/Submit control or a recommended job's link.
 let url;try{url=new URL(page.url());}catch{return false;}
 if(!url.hostname.endsWith('.linkedin.com')||!/^\/jobs\/view\//.test(url.pathname))return false;
 const entry=page.getByRole('button',{name:'Easy Apply to this job',exact:true}).filter({visible:true});
 await entry.first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
 if(await entry.count()!==1)return false;
 await entry.click({timeout:15000});
 await page.getByRole('dialog').filter({visible:true}).first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
 return true;
}
