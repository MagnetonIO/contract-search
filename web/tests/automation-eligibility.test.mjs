import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedEligibility} from '../lib/automation-eligibility.mjs';

test('mandatory duration and residency require explicit verified evidence',()=>{
 const facts='Experienced Python engineer with Databricks and Spark production pipelines.';
 const confirmed={requirement:'Python development',posting_evidence:'Python development required',status:'confirmed',evidence:'Experienced Python engineer'};
 assert.equal(verifiedEligibility({requirements:[confirmed]},facts,'Python development required'),true);
 assert.equal(verifiedEligibility({requirements:[confirmed]},facts,'No such requirement'),false);
 assert.equal(verifiedEligibility({requirements:[{...confirmed,posting_evidence:'Python preferred'}]},facts,'Python preferred'),false);
 assert.equal(verifiedEligibility({requirements:[confirmed,{requirement:'3+ years Databricks',status:'unverified',evidence:''}]},facts),false);
 assert.equal(verifiedEligibility({requirements:[{requirement:'5 years US residency',status:'confirmed',evidence:'Has lived in the US for 5 years'}]},facts),false);
 assert.equal(verifiedEligibility({requirements:[]},facts),false);
});
