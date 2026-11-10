import test from 'node:test';import assert from 'node:assert/strict';
import {uploadApprovedResume} from '../lib/resume-upload.mjs';
import {chromium} from 'playwright-core';
test('a unique current resume upload button works even when model coordinates are stale',async()=>{
 let clicked=0,uploaded=0;
 const button={filter(){return this;},count:async()=>1,click:async()=>{clicked++;}};
 const scope={locator:()=>({count:async()=>0}),getByRole:()=>button};
 const file={name:'approved.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF')};
 const page={waitForEvent:async()=>({setFiles:async f=>{assert.equal(f,file);uploaded++;}}),mouse:{click:()=>{throw Error('Stale screenshot coordinates must not be used when a native upload control exists');}}};
 assert.equal((await uploadApprovedResume({page,scope,file,x:1,y:1})).attached,true);assert.equal(clicked,1);assert.equal(uploaded,1);
});
test('an ambiguous native uploader cannot guess a file destination',async()=>{
 const scope={locator:()=>({count:async()=>0}),getByRole:()=>({filter(){return this;},count:async()=>2,evaluateAll:async()=>[]})};
 assert.equal((await uploadApprovedResume({page:{},scope,file:{name:'approved.pdf'}})).not_uploaded,true);
});
test('an anonymous cover-letter uploader is never used for the resume; replacement is scoped to the Resume card',async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{
  const page=await browser.newPage(),file={name:'Approved_Role.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')};
  await page.setContent('<form><h2>Resume &amp; Cover Letter</h2><div><span>Resume *</span><p>Existing.pdf</p></div><div><span>Cover letter</span><button type="button">Upload your cover letter</button></div><input type="file" aria-describedby="cover letter-description"><button type="button">Next</button></form>');
  const body=page.locator('body');assert.equal((await uploadApprovedResume({page,scope:body,file})).not_uploaded,true);assert.equal(await page.locator('input[type=file]').evaluate(e=>e.files.length),0);
  await page.setContent(`<form><h2>Resume &amp; Cover Letter</h2><div><div><span>Resume *</span></div><div><span id="resume-name">Existing.pdf</span><button type="button" aria-label="File options" onclick="document.querySelector('#menu').hidden=false">...</button></div><div>Uploaded to profile yesterday</div></div><div><span>Cover letter</span><button type="button">Upload your cover letter</button></div><input type="file" aria-describedby="cover letter-description"><div id="menu" hidden><button role="menuitem" type="button" onclick="const i=document.createElement('input');i.type='file';i.setAttribute('aria-describedby','resume-description');i.hidden=true;i.onchange=()=>document.querySelector('#resume-name').textContent=i.files[0].name;document.querySelector('form').append(i);i.click()">Replace</button><button role="menuitem" type="button">Delete</button></div></form>`);
  assert.equal((await uploadApprovedResume({page,scope:body,file})).attached,true);assert.equal(await page.locator('#resume-name').innerText(),file.name);assert.equal(await page.locator('input[aria-describedby="cover letter-description"]').evaluate(e=>e.files.length),0);
 }finally{await browser.close();}
});

test('Indeed resume options select a replacement file instead of its template chooser',async()=>{
 const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage(),file={name:'Approved.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')};await page.setContent(`<main><h1>Review your resume</h1><article><span>Matthew Long Resume</span><button aria-label="Resume options" onclick="document.querySelector('#menu').hidden=false">...</button><button aria-label="Select resume template" onclick="window.templateOpened=true">Select</button></article><div id="menu" hidden><button role="menuitem" onclick="const input=document.createElement('input');input.type='file';input.name='resume';input.hidden=true;input.onchange=()=>window.uploaded=input.files[0].name;document.body.append(input);input.click()">Upload a different resume</button><button role="menuitem">Delete</button></div></main>`);const result=await uploadApprovedResume({page,scope:page.locator('body'),file});assert.equal(result.attached,true);assert.equal(await page.evaluate(()=>window.templateOpened||false),false);assert.equal(await page.evaluate(()=>window.uploaded),file.name);
 }finally{await browser.close();}
});
