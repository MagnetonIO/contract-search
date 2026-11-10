import test from 'node:test';import assert from 'node:assert/strict';
import {inferExperienceYears} from '../lib/application-answers.mjs';
const facts={overall_experience_years:'20',verified_experience:'ML Engineer 2018 - 2022\nBuilt and deployed NLP classification models.\nML Engineer 2020 - Present\nDeployed and monitored production models.'};
test('derived experience counts conservative, nonoverlapping documented years rather than overall seniority',async()=>{
 const r=await inferExperienceYears({question:'How many years of experience building ML models do you have?',facts,now:new Date('2026-11-09T12:00:00Z')},{generate:async()=>({output:{periods:[{start_year:2018,end_year:2022,evidence:'ML Engineer 2018 - 2022\nBuilt and deployed NLP classification models.'},{start_year:2020,end_year:null,evidence:'ML Engineer 2020 - Present\nDeployed and monitored production models.'}]},usage:{}})});
 assert.equal(r.answer,'7');
});
test('invented dates, quotes or future periods never yield an experience answer',async()=>{
 const r=await inferExperienceYears({question:'How many years of ML experience?',facts,now:new Date('2026-11-09T12:00:00Z')},{generate:async()=>({output:{periods:[{start_year:2000,end_year:null,evidence:'ML Engineer 2020 - Present\nDeployed and monitored production models.'},{start_year:2030,end_year:null,evidence:'Future work.'}]},usage:{}})});assert.equal(r.answer,null);
});
test('duration inference cannot answer credentials or unrelated numeric questions',async()=>{
 const generate=()=>assert.fail('not an experience duration');for(const question of ['What is your monthly salary?','How many years have you held an active security clearance?'])assert.equal((await inferExperienceYears({question,facts},{generate})).answer,null);
});
