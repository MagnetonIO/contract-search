import test from 'node:test';import assert from 'node:assert/strict';
import {reviewTechnicalChoice} from '../lib/application-answers.mjs';
const facts={verified_experience:'Built production web applications using React, Next.js, JavaScript and TypeScript.'};
test('ordinary compound technical questions can use exact supporting resume excerpts',async()=>{
 const result=await reviewTechnicalChoice({question:'Do you have strong proficiency in JavaScript and TypeScript?',answer:'Yes',facts},{generate:async()=>({output:{supported:true,evidence:[facts.verified_experience]},usage:{}})});
 assert.equal(result.approved,true);
});
test('a model cannot invent its evidence or substitute experience for unconfirmed preferences',async()=>{
 let calls=0;const generate=async()=>{calls++;return {output:{supported:true,evidence:['Invented experience']},usage:{}};};
 assert.equal((await reviewTechnicalChoice({question:'Have you developed applications with React?',answer:'Yes',facts},{generate})).approved,false);
 for(const question of ['Are you available from 2 PM to 11 PM EET?','Do you have 10 years of React experience?','Is your internet faster than 20 mbps?','Are you a certified AWS architect?','Are you fluent in French?','What are your monthly compensation requirements?','Are you legally authorized to work?'])assert.equal((await reviewTechnicalChoice({question,answer:'Yes',facts},{generate})).approved,false);
 assert.equal(calls,1);
});
test('a technical No also requires explicit evidence; unknown is never automatically No',async()=>{
 const result=await reviewTechnicalChoice({question:'Have you built Kubernetes operators?',answer:'No',facts},{generate:async()=>({output:{supported:false,evidence:[]},usage:{}})});assert.equal(result.approved,false);
});
