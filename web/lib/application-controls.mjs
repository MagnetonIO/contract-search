const normalized=value=>String(value||'').replace(/\s+/g,' ').trim();
export function applicationAuxiliaryUrl(raw){try{const u=new URL(raw);return (u.hostname==='linkedin.com'||u.hostname.endsWith('.linkedin.com'))&&/^\/job-apply-resources(?:\/|$)/i.test(u.pathname);}catch{return false;}}
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
 if(['apply','apply now'].includes(name))return inForm?'submission':'entry';
 if(['easy apply','start application','apply for this job',"i'm interested"].includes(name))return inForm&&type==='submit'?'submission':'entry';
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
 if(matches.length!==1||matches[0].disabled)return {unsupported:true,blocked:true,reason:'Application navigation control is missing, disabled or ambiguous.',action:'Inspect the current controls and scroll if needed. Request only an observed navigation label; use the guarded submit action for the final Submit button.'};
 const button=matches[0],kind=applicationControlKind(button);
 if(kind==='submission')return {requires_submit:true,action:'Use the submit tool for this final application action.'};
 if(kind==='unsupported')return {unsupported:true,blocked:true,reason:'Application control is not a supported navigation step.',action:'Inspect the current form and choose a supported application action.'};
 // Keep the locator tied to the observed label as the page changes. A moving
 // button index must never turn a Next click into a final submission.
 let control=scope.getByRole('button',{name:button.label,exact:true}).filter({visible:true});
 if(await control.count()!==1){
  const text=button.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').split(/\s+/).join('\\s+');
  control=scope.getByRole('button').filter({visible:true,hasText:new RegExp('^\\s*'+text+'\\s*$')});
 }
 if(await control.count()!==1)return {unsupported:true,blocked:true,reason:'Application navigation changed; inspect the form again.'};
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

// Serializable DOM reader shared by inspection and native field actions.
export function applicationFields(items){
 const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
 return items.map((e,index)=>{
  const labelled=e.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>e.ownerDocument.getElementById(id)?.textContent||'').join(' ');
  const label=clean(e.getAttribute('aria-label')||labelled||e.labels?.[0]?.innerText||e.getAttribute('placeholder')||e.name||e.id||'');
  const legend=clean(e.closest('fieldset')?.querySelector('legend')?.innerText);
  const question=['checkbox','radio'].includes(e.type)?legend||label:label||legend;
  const toggles=e.tagName==='SELECT'&&e.getAttribute('aria-hidden')==='true'?[...e.parentElement.querySelectorAll('button[aria-haspopup]')].filter(b=>b.getClientRects().length):[];const proxy=toggles.length===1?toggles[0]:null;
  return {index,label,question,type:e.type||e.tagName.toLowerCase(),role:e.getAttribute('role'),required:e.required||e.getAttribute('aria-required')==='true',visible:Boolean(proxy)||Boolean(e.getClientRects().length)&&e.getAttribute('aria-hidden')!=='true',current_value:e.type==='file'?undefined:e.value,selected_label:e.tagName==='SELECT'?(proxy?clean(proxy.innerText):e.selectedOptions?.[0]?.text):undefined,filled:e.type==='file'?Boolean(e.files?.length):['checkbox','radio'].includes(e.type)?e.checked:Boolean(e.value),options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,label:o.text})):undefined};
 });
}

export async function selectComboboxOption(page,input,value,approved){
 if(!approved({label:value,value}))return {selected:false,blocked:true,reason:'The requested option is not an approved applicant answer.'};
 let toggle=input;
 if(await input.evaluate(e=>e.tagName==='SELECT')&&!await input.isVisible()){
  const buttons=input.locator('..').locator('button[aria-haspopup]').filter({visible:true});
  if(await buttons.count()!==1)return {selected:false,blocked:true,reason:'The hidden select has no unique visible menu control.'};
  toggle=buttons;
 }
 await toggle.click({timeout:5000});
 const options=page.locator('[role=option],[role=menuitem]').filter({visible:true});
 for(let opening=0;opening<2&&!await options.count();opening++){
  await options.first().waitFor({state:'visible',timeout:1500}).catch(()=>{});
  if(!await options.count())await toggle.press('ArrowDown');
 }
 await options.first().waitFor({state:'visible',timeout:3000}).catch(()=>{});
 const observed=await options.evaluateAll(items=>items.map((e,index)=>({index,label:(e.innerText||e.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim(),value:e.getAttribute('data-value')||e.getAttribute('value')||e.innerText||''})));
 const allowed=observed.filter(approved);const exact=allowed.filter(o=>o.label===value||o.value===value||!value.includes('+')&&o.label.replace(/\s*\+\d+$/,'').trim()===value);
 const matches=exact.length?exact:allowed;
 if(matches.length!==1)return {selected:false,blocked:true,reason:'No unique visible option matches the requested approved answer. Inspect the current options.'};
 await options.nth(matches[0].index).click({timeout:5000});return {selected:true,label:matches[0].label};
}

export function sameFieldLabel(actual,requested){
 const canonical=value=>String(value||'').replace(/\s+/g,' ').replace(/\s*\*+$/,'').trim().toLowerCase();
 return Boolean(canonical(actual))&&canonical(actual)===canonical(requested);
}

// Native values may be opaque or ranges. Resolve only among the actual,
// enabled choices whose displayed meaning matches a saved applicant fact.
export async function selectNativeOption(input,requested,approved){
 const options=await input.evaluate(e=>[...e.options].filter(o=>!o.disabled&&!o.parentElement?.disabled).map(o=>({value:o.value,label:o.text.trim()})));
 const allowed=options.filter(approved),normalize=value=>String(value||'').trim().toLowerCase();
 const exact=allowed.filter(o=>normalize(o.value)===normalize(requested)||normalize(o.label)===normalize(requested));
 const candidates=exact.length?exact:allowed;
 if(candidates.length!==1)return {blocked:true,reason:'No unique approved option exists in this dropdown.',options};
 const option=candidates[0];await input.selectOption({value:option.value},{timeout:5000});return {selected:true,...option};
}
