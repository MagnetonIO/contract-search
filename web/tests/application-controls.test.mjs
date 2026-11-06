import test from 'node:test';import assert from 'node:assert/strict';
import {applicationControlKind,applicationReceipt} from '../lib/application-controls.mjs';
test('actual sent/received confirmations are distinct from drafts and future submission',()=>{
 assert.equal(applicationReceipt('Your application was sent to Example Company.'),'Your application was sent');
 assert.ok(applicationReceipt('Thank you for applying'));assert.equal(applicationReceipt('Your application\nwas sent to Example Company'),'Your application was sent');
 assert.equal(applicationReceipt('Your application will be sent after review.'),null);
 assert.equal(applicationReceipt('Your application was saved as a draft.'),null);
});
test('LinkedIn accessible labels preserve Easy Apply entry and Next step semantics',()=>{
 assert.equal(applicationControlKind({text:'Easy Apply',label:'Easy Apply to this job'}),'entry');
 assert.equal(applicationControlKind({text:'Next',label:'Continue to next step',inForm:true}),'step');
 assert.equal(applicationControlKind({text:'Review',label:'Review your application',inForm:true}),'step');
});
test('final Apply controls and agreements cannot use ordinary navigation',()=>{
 assert.equal(applicationControlKind({text:'Apply',type:'submit',inForm:true}),'submission');
 assert.equal(applicationControlKind({text:'Apply now',inForm:true}),'submission');
 assert.equal(applicationControlKind({text:'Submit application'}),'submission');
 for(const text of ['Sign in','Accept terms','Agree and continue','Pay now','Delete account'])assert.equal(applicationControlKind({text}),'unsupported');
});

test('an individual country field keeps its own label instead of the surrounding Phone legend',async()=>{
 const {chromium}=await import('playwright-core');const {applicationFields}=await import('../lib/application-controls.mjs');
 const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage();await page.setContent('<fieldset><legend>Phone</legend><label id="country-label" for="country">Country*</label><input id="country" role="combobox" aria-labelledby="country-label" aria-required="true"><label for="phone">Phone*</label><input id="phone" type="tel" aria-label="Phone"></fieldset>');
 assert.equal(typeof applicationFields,'function');const fields=await page.locator('input').evaluateAll(applicationFields);assert.equal(fields[0].label,'Country*');assert.equal(fields[0].question,'Country*');assert.equal(fields[0].required,true);assert.equal(fields[0].role,'combobox');assert.equal(fields[1].question,'Phone');
 }finally{await browser.close();}
});

test('custom combobox choices require an exact visible option and approved applicant fact',async()=>{
 const {chromium}=await import('playwright-core');const {selectComboboxOption}=await import('../lib/application-controls.mjs');const {choiceMatches}=await import('../lib/visual-policy.mjs');
 const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage();await page.setContent(`<input role="combobox" aria-label="Country" onclick="document.querySelector('[role=listbox]').hidden=false"><div role="listbox" hidden><div role="option" onclick="document.querySelector('input').value=this.innerText">United States +1</div><div role="option" onclick="document.querySelector('input').value=this.innerText">Canada</div></div>`);
 assert.equal(typeof selectComboboxOption,'function');const approved=option=>choiceMatches({fact:'country',label:option.label,value:option.value,question:'Country*',facts:{country:'United States'}});
 const input=page.getByRole('combobox');assert.equal((await selectComboboxOption(page,input,'Canada',approved)).selected,false);assert.equal(await input.inputValue(),'');assert.equal((await selectComboboxOption(page,input,'United States',approved)).selected,true);assert.equal(await input.inputValue(),'United States +1');
 await page.setContent(`<input role="combobox" aria-expanded="false" onkeydown="if(event.key==='ArrowDown'&&++window.opens>1){this.setAttribute('aria-expanded','true');document.querySelector('[role=listbox]').hidden=false}"><div role="listbox" hidden><div role="option" onclick="window.committed='US'">United States +1</div></div><script>window.opens=0;window.committed=null</script>`);
 assert.equal((await selectComboboxOption(page,page.getByRole('combobox'),'United States',approved)).selected,true);assert.equal(await page.evaluate(()=>window.committed),'US');
 }finally{await browser.close();}
});
