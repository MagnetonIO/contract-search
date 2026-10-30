import test from 'node:test';import assert from 'node:assert/strict';import {screeningCurrent} from '../lib/automation-screen.mjs';
test('incomplete automated screening retries without asking the applicant, and respects retry backoff',()=>{
 const now=Date.parse('2026-10-30T15:00:00Z');assert.equal(screeningCurrent({version:'v',status:'eligible'},'v',now),true);
 assert.equal(screeningCurrent({version:'v',status:'held',reason:'Screening response was incomplete; waiting for verification.'},'v',now),false);
 assert.equal(screeningCurrent({version:'v',status:'held',reason:'Location: old country confirmation'},'v',now),false);
 assert.equal(screeningCurrent({version:'v',status:'pending',retry_after:'2026-10-30T15:15:00Z'},'v',now),true);
 assert.equal(screeningCurrent({version:'v',status:'pending',retry_after:'2026-10-30T14:59:00Z'},'v',now),false);
});
