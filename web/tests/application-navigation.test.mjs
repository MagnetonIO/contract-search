import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
import {navigationPreflight,recoverableNavigationBlock,resumeUploadClickOutcome} from '../lib/application-navigation.mjs';
import {clickApplicationStep,applicationAuxiliaryUrl} from '../lib/application-controls.mjs';
import {visualClickKind} from '../lib/visual-policy.mjs';
test('native Next scrolls inside the active application and cannot submit or open tailoring',async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage({viewport:{width:800,height:600}});await page.setContent('<dialog open aria-label="Application"><h2>Apply to Fixture</h2><form><div style="height:300px;overflow:auto"><div style="height:1200px">Approved résumé</div><a href="https://www.linkedin.com/job-apply-resources/">Tailor resume with AI</a><button type="button" aria-label="Continue to next step" onclick="document.body.dataset.advanced=1">Next</button></div><button type="submit">Submit application</button></form></dialog><script>window.submits=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submits++}</script>');
  assert.ok((await page.getByRole('button',{name:'Continue to next step'}).boundingBox()).y>600);assert.equal((await clickApplicationStep(page,'Continue to next step')).clicked,true);assert.equal(await page.locator('body').getAttribute('data-advanced'),'1');assert.equal((await clickApplicationStep(page,'Submit application')).requires_submit,true);assert.equal(await page.evaluate(()=>window.submits),0);
 }finally{await browser.close();}
});
test('tailoring and premium links are excluded from application navigation',()=>{
 for(const text of ['Tailor resume with AI','Tailor my resume','Create cover letter'])assert.equal(visualClickKind({tag:'A',label:text,text,href:'https://www.linkedin.com/job-apply-resources/'}),'blocked');
 assert.equal(applicationAuxiliaryUrl('https://www.linkedin.com/job-apply-resources/?jobId=123'),true);assert.equal(applicationAuxiliaryUrl('https://www.linkedin.com/jobs/view/123'),false);assert.equal(visualClickKind({tag:'BUTTON',text:'Next',type:'button',inForm:true}),'click');
});
test('native navigation preserves approved-answer and resume checks using the freshest inspection',async()=>{
 const blocked=await navigationPreflight({label:'Next',facts:{work_authorization:'yes'},inspect:async()=>({fields:[{visible:true,type:'select-one',question:'Authorized to work in the US?',label:'Authorized to work in the US?',selected_label:'No'}]})});assert.equal(blocked.blocked,true);assert.equal(blocked.field.required_answer,'yes');
 const scope={getByRole:()=>({filter:()=>({evaluateAll:async()=>[{label:'Upload resume',text:'Upload resume'}]})}),locator:()=>({evaluateAll:async()=>[]})};
 const ready=await navigationPreflight({scope,label:'Next',facts:{},attached:false,inspect:async()=>({approved_resume_attached:true,fields:[]})});assert.equal(ready,null);
 const missing=await navigationPreflight({scope,label:'Next',facts:{},attached:false,inspect:async()=>({approved_resume_attached:false,fields:[]})});assert.equal(missing.requires_upload_resume,true);
 assert.equal(resumeUploadClickOutcome(true).requires_upload_resume,undefined);assert.match(resumeUploadClickOutcome(true).action,/native next/);assert.equal(resumeUploadClickOutcome(false).requires_upload_resume,true);
});
test('only known LinkedIn navigation failures can retry once; uncertain submissions remain locked',()=>{
 const a={status:'failed',selected_resume_filename:'approved.pdf',reason:'This control is unsupported',visual_steps:[{action:'click',status:'blocked'},{action:'click',status:'blocked'}]};assert.equal(recoverableNavigationBlock(a),true);assert.equal(recoverableNavigationBlock({...a,navigation_recovery_version:1}),false);assert.equal(recoverableNavigationBlock({...a,submission_intent_at:'recorded'}),false);assert.equal(recoverableNavigationBlock({...a,reason:'Missing required experience answer'}),false);
});
