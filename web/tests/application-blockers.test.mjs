import test from 'node:test';import assert from 'node:assert/strict';
import {attemptBlocker,blockerFor,coverLetterField,toolOutcomeDetail,queuedAttemptId} from '../lib/application-blockers.mjs';
test('technical control and resume failures never ask for a new applicant answer',()=>{
 for(const reason of ['The visual control remained unavailable after repeated observations.','Attach the approved PDF before submitting','Unrecognized final submission control'])assert.equal(blockerFor(reason).owner,'automation');
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
