import test from 'node:test';import assert from 'node:assert/strict';
import {applicationControlKind,applicationReceipt} from '../lib/application-controls.mjs';
test('actual sent/received confirmations are distinct from drafts and future submission',()=>{
 assert.equal(applicationReceipt('Your application was sent to Example Company.'),'Your application was sent');
 assert.ok(applicationReceipt('Thank you for applying'));
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
