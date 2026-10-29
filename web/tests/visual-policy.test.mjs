import test from 'node:test';import assert from 'node:assert/strict';
import {visualClickKind,choiceMatches,humanCheckText} from '../lib/visual-policy.mjs';
test('passive reCAPTCHA notices do not masquerade as a human-verification challenge',()=>{
 assert.equal(humanCheckText('This site is protected by reCAPTCHA. Privacy Policy and Terms apply.'),false);
 assert.equal(humanCheckText('Verify you are human to continue'),true);
 assert.equal(humanCheckText('Humans only'),true);
});
test('visual navigation cannot bypass submission, answer or authentication gates',()=>{
 assert.equal(visualClickKind({tag:'BUTTON',text:'Next',inForm:true,type:'button'}),'click');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Easy Apply',inForm:false,type:'submit'}),'click','default button type outside a form does not make entry a submission');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Apply',inForm:true,type:'button'}),'submission');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Continue',inForm:true,type:'submit'}),'click');
 assert.equal(visualClickKind({tag:'INPUT',type:'checkbox',label:'Sponsorship?'}),'answer');
 for(const text of ['Sign in','Agree and continue','Delete account','Pay now'])assert.equal(visualClickKind({tag:'BUTTON',text}),'blocked');
 assert.equal(visualClickKind({tag:'INPUT',type:'password'}),'blocked');
 assert.equal(visualClickKind({tag:'BUTTON',text:'',inForm:false,type:'button'}),'click');
 assert.equal(visualClickKind({tag:'BUTTON',text:'',inForm:true,type:'button'}),'blocked');
});
test('visual answer selections must match the question and confirmed facts',()=>{
 const facts={work_authorization:'yes',sponsorship:'no',country:'United States',email:'test@example.com',routine_privacy_consent:'yes'};
 assert.equal(choiceMatches({fact:'sponsorship',value:'0',label:'No',question:'Do you need sponsorship?',facts}),true);
 assert.equal(choiceMatches({fact:'sponsorship',value:'1',label:'Yes',question:'Do you need sponsorship?',facts}),false);
 assert.equal(choiceMatches({fact:'work_authorization',label:'Yes',question:'Are you authorized to work in the United States?',facts}),true);
 assert.equal(choiceMatches({fact:'work_authorization',label:'Yes',question:'Do you have a clearance?',facts}),false);
 assert.equal(choiceMatches({fact:'country',label:'United States (+1)',question:'Phone country code',facts}),true);
 assert.equal(choiceMatches({fact:'email',value:'test@example.com',question:'Email address',facts}),true);
 assert.equal(choiceMatches({fact:'routine_privacy_consent',label:'Yes',question:'Accept arbitration terms',facts}),false);
});
