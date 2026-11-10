import test from 'node:test';import assert from 'node:assert/strict';
import {inferExperienceYears} from '../lib/application-answers.mjs';
const facts={overall_experience_years:'20',verified_experience:'ML Engineer 2018 - 2022\nBuilt and deployed NLP classification models.\nML Engineer 2020 - Present\nDeployed and monitored production models.'};
test('derived experience counts conservative, nonoverlapping documented years rather than overall seniority',async()=>{
 const r=await inferExperienceYears({question:'How many years of experience building ML models do you have?',facts,now:new Date('2026-11-09T12:00:00Z')},{generate:async()=>({output:{employment_ids:[0,1]},usage:{}})});
 assert.equal(r.answer,'7');
});
test('nonexistent employment IDs cannot create invented dates or an experience answer',async()=>{
 const r=await inferExperienceYears({question:'How many years of ML experience?',facts,now:new Date('2026-11-09T12:00:00Z')},{generate:async()=>({output:{employment_ids:[999]},usage:{}})});assert.equal(r.answer,null);
});
test('duration inference cannot answer credentials or unrelated numeric questions',async()=>{
 const generate=()=>assert.fail('not an experience duration');for(const question of ['What is your monthly salary?','How many years have you held an active security clearance?'])assert.equal((await inferExperienceYears({question,facts},{generate})).answer,null);
});
test('employment records parse formatted role dates and exclude the global skills list',async()=>{
 const {employmentRecords}=await import('../lib/application-answers.mjs');const records=employmentRecords('Lead Engineer     July 2026 - October 26, 2026\nCompany\nBuilt private Azure infrastructure.\nSenior Engineer    2020 - May 2026\nBuilt ML services.\nSKILLS\nUnrelated tools');assert.equal(records.length,2);assert.equal(records[0].start_year,2026);assert.equal(records[0].end_year,2026);assert.equal(records[1].end_year,2026);assert.doesNotMatch(records[1].text,/Unrelated tools/);
});
