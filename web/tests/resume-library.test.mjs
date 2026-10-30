import test from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {approvedSiteResume,resumeUploadName,selectExistingResume,recoverableResumeBlock} from '../lib/resume-library.mjs';
test('saved resume approvals are tied to the unchanged master version and site',()=>{
 const library={dice:{master_hash:'abcdef01',filename:'Resume_Matthew_Long.pdf',approval:'user'}};
 assert.equal(approvedSiteResume(library,'https://www.dice.com/jobs/a','abcdef01').filename,'Resume_Matthew_Long.pdf');
 assert.equal(approvedSiteResume(library,'https://www.dice.com/jobs/a','newhash'),null);
 assert.equal(approvedSiteResume(library,'https://www.linkedin.com/jobs/view/1','abcdef01'),null);
 assert.equal(resumeUploadName(library,'https://www.dice.com/jobs/a','abcdef01'),'Resume_Matthew_Long.pdf');
 assert.equal(resumeUploadName(library,'https://www.dice.com/jobs/a','newhash'),'Resume_Matthew_Long_newhash.pdf');
});
test('a page with many old job resumes selects only the approved exact filename',async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<main><fieldset><legend>Résumé</legend><label><input type="radio" name="resume" checked>Resume_Matthew_Long_oldrole.pdf</label><label><input type="radio" name="resume">Resume_Matthew_Long.pdf</label><label><input type="radio" name="resume">Resume_Matthew_Long.pdf.backup</label></fieldset></main>');
  const scope=page.getByRole('main');assert.equal((await selectExistingResume(scope,'Resume_Matthew_Long.pdf')).selected,true);assert.equal(await scope.locator('input').nth(0).isChecked(),false);assert.equal(await scope.locator('input').nth(1).isChecked(),true);assert.equal(await scope.locator('input').nth(2).isChecked(),false);
  assert.equal((await selectExistingResume(scope,'Resume_Matthew_Long_missing.pdf')).selected,false);
  await page.setContent('<label><input type="radio" name="resume">Resume_Matthew_Long.pdf</label><label><input type="radio" name="resume">Resume_Matthew_Long.pdf</label>');assert.equal((await selectExistingResume(page.locator('body'),'Resume_Matthew_Long.pdf')).selected,false,'duplicate filenames require verification, not guessing');
  await page.setContent('<h2>Review your application</h2><section><h3>Resume *</h3><p>Resume_Matthew_Long.pdf</p></section><section><h3>Cover Letter</h3><p>No cover letter uploaded</p></section><button>Submit</button>');const review=await selectExistingResume(page.locator('body'),'Resume_Matthew_Long.pdf');assert.equal(review.selected,true);assert.equal(review.method,'reviewed_saved_file');assert.equal((await selectExistingResume(page.locator('body'),'Different_Resume.pdf')).selected,false);
  await page.setContent('<h2>Documents</h2><div onclick="this.dataset.clicked=Number(this.dataset.clicked||0)+1"><span>Resume_Matthew_Long.pdf</span></div><button type="button">Upload resume</button>');const body=page.locator('body');assert.equal((await selectExistingResume(body,'Resume_Matthew_Long.pdf')).requested,true);assert.equal((await selectExistingResume(body,'Resume_Matthew_Long.pdf',{requested:true})).requested,true);assert.equal(await page.locator('div').getAttribute('data-clicked'),'1');
 }finally{await browser.close();}
});

test('resume repair retries only identified old blockers once and never an uncertain submission',()=>{
 const a={status:'needs_input',reason:'Selection needs a matching approved answer: Resume_Matthew_Long.pdf'};assert.equal(recoverableResumeBlock(a),true);assert.equal(recoverableResumeBlock({...a,submission_intent_at:'recorded'}),false);assert.equal(recoverableResumeBlock({...a,resume_recovery_version:2}),false);assert.equal(recoverableResumeBlock({...a,resume_recovery_version:1}),true);assert.equal(recoverableResumeBlock({status:'needs_input',reason:'Missing Dialogflow years'}),false);
});
