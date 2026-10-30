import test from 'node:test';import assert from 'node:assert/strict';
import {qualificationDecision} from '../lib/qualification-policy.mjs';
const facts={work_authorization:'yes',us_citizen:'yes',sponsorship:'no'};
test('broad professional wording and citation formatting become match notes, not blanket holds',()=>{
 const review={requirements:[{requirement:'10+ years overall experience',status:'unverified',posting_evidence:'Experience: 10+ years'},{requirement:'Work iteratively with business users',status:'unverified'},{requirement:'GCP architecture',status:'confirmed',evidence:['a paraphrased excerpt']}]};
 const d=qualificationDecision(review,facts,'Experience: 10+ years. Work iteratively with business users.');assert.equal(d.status,'eligible');assert.equal(d.notes.length,2);
});
test('U.S. citizenship and work authorization use confirmed reusable facts',()=>{
 const review={requirements:[{requirement:'US Citizens',posting_evidence:'Remote opportunity for US Citizens',status:'unverified'}]};
 assert.equal(qualificationDecision(review,facts,'Remote opportunity for US Citizens').status,'eligible');
 assert.equal(qualificationDecision(review,{...facts,us_citizen:''},'Remote opportunity for US Citizens').status,'held');
 assert.equal(qualificationDecision(review,{...facts,us_citizen:'no'},'Remote opportunity for US Citizens').status,'skipped');
});
test('active clearance and residency are not inferred from citizenship, and invented legal restrictions do not block',()=>{
 assert.equal(qualificationDecision({requirements:[{requirement:'Active Secret clearance',posting_evidence:'Active Secret clearance required',status:'unverified'}]},facts,'Active Secret clearance required').status,'held');
 assert.equal(qualificationDecision({requirements:[{requirement:'US Citizens',posting_evidence:'Unrelated invented citizenship rule',status:'unverified'}]},facts,'Azure architecture experience required').status,'eligible');
});
