// Explicit opt-in: real model, synthetic facts only, no external application.
import assert from 'node:assert/strict';
import {reviewApplication} from '../lib/application-review.mjs';
if(process.env.LIVE_AUTOMATION_TEST!=='1')throw Error('Set LIVE_AUTOMATION_TEST=1 to run this paid model check.');
const facts={name:'Fixture Applicant',email:'fixture@example.com',work_authorization:'yes',sponsorship:'no',verified_experience:'User-confirmed application answer: 3 years of hands-on work experience with Palantir/Foundry.'};
const base={job:{title:'Palantir Data Engineer',company:'Synthetic employer fixture'},facts,answers:[{label:'Years of Palantir experience',answer:'3'}]};
const review='Apply to Synthetic employer fixture\nReview your application\nFixture Applicant\nfixture@example.com\nYears of Palantir experience: 3\nWill you require sponsorship now or in the future? No';
for(const [name,text,approved] of [
 ['new employer and supported prefilled sponsorship answer',review,true],
 ['contradictory sponsorship answer',review.replace('future? No','future? Yes'),false],
 ['unsupported years',review.replace('experience: 3','experience: 10'),false],
 ['different employer',review.replace('Apply to Synthetic employer fixture','Apply to Different employer'),false],
]){
 const result=await reviewApplication({...base,review_text:text});assert.equal(result.output.approved,approved,name+': '+result.output.reason);console.log({case:name,passed:true});
}
