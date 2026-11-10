import test from 'node:test';import assert from 'node:assert/strict';
import {reviewApplication} from '../lib/application-review.mjs';
test('an explicit different application employer is rejected before a model can waive the mismatch',async()=>{
 const result=await reviewApplication({job:{company:'Acme Labs',title:'Data Engineer'},facts:{},answers:[],review_text:'Apply to Other Labs\nReview your application'}, {generate:()=>{throw Error('Different employer must not reach the model');}});
 assert.equal(result.output.approved,false);assert.match(result.output.reason,/employer/i);
});
test('matching application heading proceeds to answer verification even for a new employer',async()=>{
 let calls=0;const result=await reviewApplication({job:{company:'Acme Labs',title:'Data Engineer'},facts:{name:'Applicant',sponsorship:'no'},answers:[],review_text:'Apply to ACME Labs\nWill you need sponsorship? No'}, {generate:async()=>{calls++;return {output:{approved:true},usage:{}};}});
 assert.equal(calls,1);assert.equal(result.output.approved,true);
});

test('an explicitly different contact email is repaired before any final-review model call',async()=>{
 let calls=0;const generate=async()=>{calls++;return{output:{approved:true,reason:'Supported'},usage:{}};};const facts={email:'applicant@example.com'},job={title:'Engineer',company:'Example'};const bad=await reviewApplication({facts,answers:[],job,review_text:'Review your application\nContact information\nEmail\nold@example.net\nPhone number\n555-0100'},{generate});assert.equal(bad.output.approved,false);assert.match(bad.output.reason,/contact email/i);assert.equal(calls,0);const good=await reviewApplication({facts,answers:[],job,review_text:'Email\napplicant@example.com\nResume\napplicant123@indeedemail.com'},{generate});assert.equal(good.output.approved,true);assert.equal(calls,1);
});
