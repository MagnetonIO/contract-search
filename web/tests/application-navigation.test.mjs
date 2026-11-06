import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
import {navigationPreflight,recoverableNavigationBlock,resumeUploadClickOutcome} from '../lib/application-navigation.mjs';
import {clickApplicationStep,applicationAuxiliaryUrl} from '../lib/application-controls.mjs';
import {visualClickKind} from '../lib/visual-policy.mjs';
test('native Next scrolls inside the active application and cannot submit or open tailoring',async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage({viewport:{width:800,height:600}});await page.setContent('<dialog open aria-label="Application"><h2>Apply to Fixture</h2><form><div style="height:300px;overflow:auto"><div style="height:1200px">Approved résumé</div><a href="https://www.linkedin.com/job-apply-resources/">Tailor resume with AI</a><button type="button" aria-label="Continue to next step" onclick="document.body.dataset.advanced=1">Next</button></div><button type="submit">Submit application</button></form></dialog><script>window.submits=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submits++}</script>');
  assert.ok((await page.getByRole('button',{name:'Continue to next step'}).boundingBox()).y>600);assert.equal((await clickApplicationStep(page,'Continue to next step')).clicked,true);assert.equal(await page.locator('body').getAttribute('data-advanced'),'1');assert.equal((await clickApplicationStep(page,'Submit application')).requires_submit,true);assert.equal(await page.evaluate(()=>window.submits),0);
  await page.getByRole('button',{name:'Continue to next step'}).evaluate(e=>e.remove());
  const stale=await clickApplicationStep(page,'Next');assert.equal(stale.blocked,true);assert.match(stale.action,/guarded submit/);assert.equal(await page.evaluate(()=>window.submits),0);
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
test('a preselected default resume cannot advance when a tailored version is required',async()=>{
 const filename='Resume_Matthew_Long_Data_Engineer_abcdef01.pdf';
 const fields=[{visible:true,type:'radio',filled:true,label:'Resume_Matthew_Long.pdf',question:'Resume'}];
 // Dice can render its uploader without a native button. The saved-file
 // radio group is enough to identify the resume step and require the version.
 const missing=await navigationPreflight({scope:{},facts:{},attached:false,label:'Next',inspect:async()=>({approved_resume_attached:false,approved_resume_filename:filename,fields})});
 assert.equal(missing.requires_upload_resume,true);assert.match(missing.action,/Data_Engineer_abcdef01\.pdf/);
 assert.equal(await navigationPreflight({scope:{},facts:{},attached:false,label:'Next',inspect:async()=>({approved_resume_attached:true,approved_resume_filename:filename,fields})}),null);
});
test('only known LinkedIn navigation failures can retry once; uncertain submissions remain locked',()=>{
 const a={status:'failed',selected_resume_filename:'approved.pdf',reason:'This control is unsupported',visual_steps:[{action:'click',status:'blocked'},{action:'click',status:'blocked'}]};assert.equal(recoverableNavigationBlock(a),true);assert.equal(recoverableNavigationBlock({...a,navigation_recovery_version:3}),false);assert.equal(recoverableNavigationBlock({...a,submission_intent_at:'recorded'}),false);assert.equal(recoverableNavigationBlock({...a,reason:'Missing required experience answer'}),false);
});

test('a stale Next on final review can recover once without replaying a submission',()=>{
 const a={status:'failed',selected_resume_filename:'approved.pdf',reason:'Application navigation control is missing, disabled or ambiguous.',visual_steps:[{action:'next',status:'needs_input'}]};
 assert.equal(recoverableNavigationBlock(a),true);assert.equal(recoverableNavigationBlock({...a,navigation_recovery_version:3}),false);assert.equal(recoverableNavigationBlock({...a,submission_intent_at:'recorded'}),false);
});

test('known cookie and employer entry failures can retry once even before a resume step',()=>{
 const cookie={status:'failed',reason:'Automation could not complete click: Use submit for this final action.',visual_steps:[{action:'click',status:'blocked',summary:'Cookie banner visible; accepting all cookies to proceed.'}]};
 const entry={status:'failed',reason:"Automation could not complete click: This control is unsupported. Target: Apply for This Job"};
 const country={status:'failed',reason:'The controller could not map the saved answer for question: Phone. Option: United States.'};
 for(const a of [cookie,entry,country]){assert.equal(recoverableNavigationBlock(a),true);assert.equal(recoverableNavigationBlock({...a,submission_intent_at:'reserved'}),false);assert.equal(recoverableNavigationBlock({...a,navigation_recovery_version:3}),false);}
 assert.equal(recoverableNavigationBlock({status:'failed',reason:'Use submit for this final action.'}),false);
});

test('employer control repair does not require a resume already saved on that website',async()=>{
 const {recoverableApplicationBlock}=await import('../lib/application-navigation.mjs');assert.equal(typeof recoverableApplicationBlock,'function');
 const entry={status:'failed',reason:'Automation could not complete click: This control is unsupported. Target: Apply for This Job'};
 const resume={status:'failed',reason:'Selection needs a matching approved answer: Resume_Matthew_Long.pdf'};
 assert.equal(recoverableApplicationBlock(entry,{savedResume:null}),true);assert.equal(recoverableApplicationBlock({...entry,submission_intent_at:'reserved'},{savedResume:null}),false);
 assert.equal(recoverableApplicationBlock(resume,{savedResume:null}),false);assert.equal(recoverableApplicationBlock(resume,{savedResume:{filename:'Resume_Matthew_Long.pdf'}}),true);
});
