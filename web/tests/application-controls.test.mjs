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
 assert.equal(applicationControlKind({text:'Review details',type:'button',inForm:true}),'step');
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

test('decorative required markers do not masquerade as a changed form field',async()=>{
 const {sameFieldLabel}=await import('../lib/application-controls.mjs');assert.equal(typeof sameFieldLabel,'function');assert.equal(sameFieldLabel('State *','State'),true);assert.equal(sameFieldLabel('State *','state'),true);assert.equal(sameFieldLabel('Country*','State'),false);assert.equal(sameFieldLabel('Phone country code','Phone'),false);assert.equal(sameFieldLabel('',''),false);
});

test('a visible menu can safely control a hidden native select without inventing an option value',async()=>{
 const {chromium}=await import('playwright-core');const {applicationFields,selectComboboxOption}=await import('../lib/application-controls.mjs');const {choiceMatches}=await import('../lib/visual-policy.mjs');const b=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const p=await b.newPage();await p.setContent(`<label for="state">State *</label><div><button type="button" aria-label="State –Select–" aria-haspopup="true" onclick="document.querySelector('[role=menu]').hidden=false">–Select–</button><select id="state" aria-hidden="true" style="display:none" required><option value=""></option></select></div><div role="menu" hidden><div role="menuitem" onclick="document.querySelector('select').add(new Option('Illinois','12'));document.querySelector('select').value='12'">Illinois</div></div>`);
 const fields=await p.locator('select').evaluateAll(applicationFields);assert.equal(fields[0].visible,true);const selected=await selectComboboxOption(p,p.locator('select'),'IL',o=>choiceMatches({fact:'state',label:o.label,value:o.value,question:'State *',facts:{state:'IL'}}));assert.equal(selected.selected,true);assert.equal(await p.locator('select').inputValue(),'12');
 }finally{await b.close();}
});

test('a confirmed duration selects the actual offered experience range, never a nonexistent numeric option',async()=>{
 const {chromium}=await import('playwright-core');const {selectNativeOption}=await import('../lib/application-controls.mjs');const {choiceMatches}=await import('../lib/visual-policy.mjs');
 const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage();await page.setContent('<label>How many years experience in Data Governance do you have?<select><option value="none">-- No answer --</option><option>1-3 years</option><option>4-6 years</option><option>7+ years</option></select></label>');
 const input=page.locator('select'),facts={verified_experience:'User-confirmed application answer: 4 years of hands-on work experience with Data Governance.'},question='How many years experience in Data Governance do you have?';
 const approved=option=>choiceMatches({fact:'verified_experience',question,...option,facts});
 const result=await selectNativeOption(input,'4',approved);assert.equal(result.selected,true);assert.equal(await input.inputValue(),'4-6 years');
 await input.selectOption('none');assert.equal((await selectNativeOption(input,'7+ years',approved)).selected,true,'the controller uses the uniquely supported range rather than trusting an unsupported model value');assert.equal(await input.inputValue(),'4-6 years');
 }finally{await browser.close();}
});

test('styled answer radios use the associated visible label and expose the real Yes/No meaning',async()=>{
 const {chromium}=await import('playwright-core');const {checkApplicationOption,radioOptionEvidence,applicationFields}=await import('../lib/application-controls.mjs');const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage();await page.setContent('<fieldset><legend>Do you have experience with Azure?</legend><div><div><input id="yes" type="radio" name="q" style="display:none" aria-label="Do you have experience with Azure?"><label for="yes" style="display:inline-block;width:20px;height:20px"></label></div><span>Yes</span></div><div><div><input id="no" type="radio" name="q" style="display:none" aria-label="Do you have experience with Azure?"><label for="no" style="display:inline-block;width:20px;height:20px"></label></div><span>No</span></div></fieldset>');
 const yes=page.locator('#yes'),no=page.locator('#no');const metadata=await page.locator('input').evaluateAll(applicationFields);assert.equal(metadata[0].option_label,'Yes');assert.equal(metadata[1].option_label,'No');assert.equal((await yes.evaluate(radioOptionEvidence)).label,'Yes');assert.equal((await no.evaluate(radioOptionEvidence)).label,'No');assert.equal((await checkApplicationOption(page.locator('body'),yes)).selected,true);assert.equal(await yes.isChecked(),true);assert.equal(await no.isChecked(),false);
 }finally{await browser.close();}
});

test('custom location search uses its nearby single-field label instead of an unrelated placeholder',async()=>{
 const {chromium}=await import('playwright-core');const {applicationFields}=await import('../lib/application-controls.mjs');const {pointControl}=await import('../lib/application-visual.mjs');
 const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage();await page.setContent('<form><div><label>Location</label><div><input role="combobox" placeholder="Start typing..."></div></div><div><label>Email</label><input type="email"></div></form>');const fields=await page.locator('input').evaluateAll(applicationFields);assert.equal(fields[0].label,'Location');assert.equal(fields[1].label,'Email');const bounds=await page.locator('input').first().boundingBox();assert.equal((await pointControl(page,bounds.x+5,bounds.y+5)).question,'Location');}finally{await browser.close();}
});
test('a selected React-style country combobox retains its selected label and hidden value after search clears',async()=>{
 const {chromium}=await import('playwright-core'),{applicationFields}=await import('../lib/application-controls.mjs');const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage();await page.setContent('<label for="country">Country</label><div class="select-container"><div class="select__single-value">United States +1</div><input id="country" role="combobox" value=""><input type="hidden" name="country" value="US"></div>');const [field]=await page.locator('input:not([type=hidden])').evaluateAll(applicationFields);assert.equal(field.filled,true);assert.equal(field.current_value,'US');assert.equal(field.selected_label,'United States +1');}finally{await browser.close();}
});

test('LinkedIn application stays scoped to Easy Apply when Messaging opens after it',async()=>{
 const{chromium}=await import('playwright-core');const{applicationScope,clickApplicationStep}=await import('../lib/application-controls.mjs');const b=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const p=await b.newPage();await p.setContent('<dialog open><h2>Apply to Example</h2><button onclick="window.nextClicked=true">Next</button></dialog><div role="dialog" aria-label="Messaging"><button onclick="window.sent=true">Send</button></div>');const scope=await applicationScope(p);assert.match(await scope.innerText(),/^Apply to Example/);assert.equal((await clickApplicationStep(p,'Next')).clicked,true);assert.equal(await p.evaluate(()=>window.nextClicked),true);assert.equal(await p.evaluate(()=>window.sent),undefined);
 await p.setContent('<div role="dialog" aria-label="Messaging"><button>Send</button></div><dialog open><h2>Apply to Example</h2><button>Submit application</button></dialog>');assert.equal((await clickApplicationStep(p,'Next')).blocked,true,'a missing Next never clicks Submit');
 }finally{await b.close();}
});

test('final application labels accept ordinary wording while excluding agreements and purchases',async()=>{const{finalApplicationLabel}=await import('../lib/application-controls.mjs');assert.equal(typeof finalApplicationLabel,'function');for(const label of ['Submit','Submit application','Submit your application','Send application','Apply now','Complete your application'])assert.equal(finalApplicationLabel(label),true);for(const label of ['Accept and submit','Submit payment','Next','Apply for premium','Agree and submit application'])assert.equal(finalApplicationLabel(label),false);});
