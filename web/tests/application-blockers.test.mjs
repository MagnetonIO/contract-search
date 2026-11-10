import test from 'node:test';import assert from 'node:assert/strict';
import {attemptBlocker,blockerFor,coverLetterField,toolOutcomeDetail,queuedAttemptId} from '../lib/application-blockers.mjs';
test('technical control and resume failures never ask for a new applicant answer',()=>{
 for(const reason of ['The page shows the job details but no apply form or Easy Apply controls are visible yet; need to open the application flow before proceeding.','The visual control remained unavailable after repeated observations.','Attach the approved PDF before submitting','Unrecognized final submission control','Selection needs a matching approved answer: Resume_Matthew_Long.pdf'])assert.equal(blockerFor(reason).owner,'automation');
 const legacy=attemptBlocker({status:'needs_input',reason:'Control unavailable',visual_steps:[{action:'submit',status:'blocked'},{action:'submit',status:'blocked'}]});assert.match(legacy.instruction,/select your approved existing résumé/);assert.equal(legacy.owner,'automation');
 assert.equal(blockerFor('Missing applicant answer: Dialogflow experience in years').owner,'user');assert.equal(blockerFor('LinkedIn sign-in required').kind,'sign_in');
});
test('priority retries respect enablement, confirmed facts, successful-submission quota and submission intents',()=>{
 const state={policy:{enabled:true},facts:{confirmed:true},quota:{remaining:46},attempts:{uncertain:{id:'uncertain',status:'queued',submission_intent_at:'recorded'},retry:{id:'retry',status:'queued'}}};
 assert.equal(queuedAttemptId(state),'retry');assert.equal(queuedAttemptId({...state,policy:{enabled:false}}),null);assert.equal(queuedAttemptId({...state,quota:{remaining:0}}),null);assert.equal(queuedAttemptId({...state,facts:{confirmed:false}}),null);
});
test('cover letters are omitted, while native required fields are identified explicitly',()=>{
 assert.equal(coverLetterField({label:'Cover letter upload'}),true);assert.equal(coverLetterField({name:'cover_letter'}),true);assert.equal(coverLetterField({label:'Résumé'}),false);assert.match(blockerFor('Cover letter required').instruction,/Do not create or upload/);
});
test('controller results expose the real blocker instead of repeating model intent',()=>{
 const detail=toolOutcomeDetail({requires_upload_resume:true,reason:'Approved resume not selected',action:'Go Back to select the saved resume'});assert.equal(detail.message,'Approved resume not selected');assert.match(detail.action,/Go Back/);assert.equal(detail.requires_upload_resume,true);
});

test('newly confirmed experience unblocks that question once and never replays a submission',async()=>{
 const {experienceRetry}=await import('../lib/application-blockers.mjs');const facts={version:'new',verified_experience:'User-confirmed application answer: 4 years of hands-on work experience with Full Stack.'};
 const a={status:'needs_input',profile_version:'old',reason:'Answer needs verified experience: How many years of experience you have in Full Stack?'};
 assert.equal(experienceRetry(a,facts),true);assert.equal(experienceRetry({...a,profile_version:'new'},facts),false);assert.equal(experienceRetry({...a,submission_intent_at:'recorded'},facts),false);assert.equal(experienceRetry({...a,reason:'Required education dates are missing'},facts),false);assert.equal(experienceRetry({...a,status:'submission_unknown'},facts),false);assert.equal(experienceRetry({...a,reason:'Answer needs verified experience: How many years of experience with Data Governance?'},facts),false);
});

test('a documented technical Yes/No blocker receives one repair retry without needing another profile edit',()=>{
 const facts={version:'current',verified_experience:'Designed production Azure infrastructure.'};const a={status:'needs_input',profile_version:'current',reason:'No approved answer is saved for question: Do you have hands-on experience with Microsoft Azure?. Option: Yes.'};
 return import('../lib/application-blockers.mjs').then(({experienceRetry})=>{assert.equal(experienceRetry(a,facts),true);assert.equal(experienceRetry({...a,answer_control_recovery_version:1},facts),false);assert.equal(experienceRetry({...a,submission_intent_at:'reserved'},facts),false);});
});

test('legacy technical answer failures get one retry when the saved facts now support the question',async()=>{
 const {experienceRetry}=await import('../lib/application-blockers.mjs');const facts={version:'current',verified_experience:'Skills: Java/Spring.'};const a={status:'failed',profile_version:'current',reason:'Automation could not complete choose: The requested option does not match the approved answer for Do you have professional experience developing applications using Java?. Next step: Inspect the fresh field.'};assert.equal(experienceRetry(a,facts),true);assert.equal(experienceRetry({...a,answer_control_recovery_version:1},facts),false);assert.equal(experienceRetry({...a,submission_intent_at:'recorded'},facts),false);
});
