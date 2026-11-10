import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

test('provider recovery waits across an error and a second challenge, then checks readiness',async()=>{
 const {watchChallenges}=await import('../lib/application-recovery.mjs');
 const page=new EventEmitter();let now=0,polls=0;
 const tracker=watchChallenges(page,{now:()=>now});
 page.emit('console',{text:()=> 'browserbase-solving-started'});
 const result=await tracker.wait({timeout:100,ready:async()=>polls>=3,pause:async()=>{now+=25;polls++;page.emit('console',{text:()=>polls===1?'browserbase-solving-errored':polls===2?'browserbase-solving-started':'browserbase-solving-finished'});}});
 assert.equal(result.state,'ready');assert.equal(polls,3);tracker.dispose();assert.equal(page.listenerCount('console'),0);
});
test('an active solve at the deadline is not falsely reported as ready',async()=>{
 const {watchChallenges}=await import('../lib/application-recovery.mjs');const page=new EventEmitter();let now=0;
 const tracker=watchChallenges(page,{now:()=>now});page.emit('console',{text:()=> 'browserbase-solving-started'});
 assert.equal((await tracker.wait({timeout:50,ready:async()=>true,pause:async()=>{now+=25;}})).state,'solving');tracker.dispose();
});
test('only the four agreed destinations are supported',async()=>{
 const {supportedApplication}=await import('../lib/application-recovery.mjs');
 for(const url of ['https://www.linkedin.com/jobs/view/123','https://www.dice.com/job-detail/123','https://smartapply.indeed.com/beta/indeedapply/form','https://job-boards.greenhouse.io/acme/jobs/123'])assert.equal(supportedApplication(url),true);
 for(const url of ['https://evil-linkedin.com/jobs/123','https://jobs.ashbyhq.com/acme/123','http://www.dice.com/job-detail/123'])assert.equal(supportedApplication(url),false);
});
test('a passive invisible reCAPTCHA badge does not interrupt an ordinary application',async()=>{
 const {chromium}=await import('playwright-core'),{securityBlocked}=await import('../lib/application-recovery.mjs');
 const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{const page=await browser.newPage();await page.route('https://www.google.com/recaptcha/**',r=>r.fulfill({contentType:'text/html',body:'Protected by reCAPTCHA'}));
 await page.setContent('<h1>Engineer</h1><button>Apply</button><div class="grecaptcha-badge"><iframe src="https://www.google.com/recaptcha/api2/anchor?size=invisible" width="256" height="60"></iframe></div>');assert.equal(await securityBlocked(page),false);
 await page.setContent('<p>Verify you are human</p>');assert.equal(await securityBlocked(page),true);
 await page.setContent('<h1>Additional Verification Required</h1><p>Your Ray ID for this request is abc</p><a>Troubleshooting Cloudflare Errors</a>');assert.equal(await securityBlocked(page),true);
 await page.setContent('<h1>Additional verification required</h1><p>Please supply your professional license.</p>');assert.equal(await securityBlocked(page),false);
 }finally{await browser.close();}
});
test('no-handoff mode records an unresolved form as automation-owned without requiring applicant input',async()=>{
 const {unresolvedAction}=await import('../lib/application-recovery.mjs');
 assert.deepEqual(unresolvedAction({human_handoff:false},{owner:'user',kind:'answer',detail:'Unknown fact'}),{owner:'automation',kind:'answer_unresolved',title:'Application could not be completed automatically',instruction:'No applicant action is requested. Continue with other eligible jobs and retain this outcome in the report.',detail:'Unknown fact'});
 assert.equal(unresolvedAction({}, {owner:'user',kind:'answer'}).owner,'user');
});
