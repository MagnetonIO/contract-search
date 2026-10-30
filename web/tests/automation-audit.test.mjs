import test from 'node:test';
import assert from 'node:assert/strict';
import {automationAudit, automationLocation,nextApplicationCheck} from '../lib/automation-audit.mjs';

const applicant={city:'Chicago',state:'IL',country:'United States'};
const lead={id:'a',pipeline:'contract',title:'Python Engineer',work_arrangement:'remote',remote_location:'Remote (US)',location_assessment:{status:'us_remote_advertised',restrictions:[]}};
test('US remote includes Chicago; Central time and higher offered pay are not mismatches',()=>{
 assert.equal(automationLocation(lead,applicant).status,'allowed');
 assert.equal(automationLocation(lead,applicant,'Build hybrid keyword and semantic retrieval. Only candidates with Python experience should apply.').status,'allowed');
 assert.equal(automationLocation({...lead,location_assessment:{status:'us_remote_restricted',restrictions:['Remote (must be willing to work CST)']}},applicant).status,'allowed');
 assert.equal(automationLocation({...lead,location_assessment:{status:'unclear',restrictions:[]}},applicant).status,'allowed');
 assert.equal(automationLocation({...lead,location_assessment:{status:'us_remote_restricted',restrictions:['Candidates must reside in Texas only.']}},applicant).status,'blocked');
 assert.equal(automationLocation({...lead,remote_location:'Unknown',location_assessment:{status:'unclear',restrictions:[]}},applicant).status,'allowed');
 assert.equal(automationLocation({...lead,remote_location:'Chicago, IL',location_assessment:{status:'unclear',restrictions:[]}},applicant).status,'allowed');
 assert.equal(automationLocation({...lead,remote_location:'Remote Canada',location_assessment:{status:'unclear',restrictions:[]}},applicant).status,'blocked');
 assert.equal(automationLocation(lead,applicant,'Must live in the Continental US.').status,'allowed');
 assert.equal(automationLocation({...lead,location_assessment:{status:'us_remote_restricted',restrictions:['First week onsite at the client office.']}},applicant).status,'blocked');
});
test('automation totals use the same open-opportunity population as the sidebar',()=>{
 const leads=[lead,{...lead,id:'secondary',pipeline:'secondary'},{...lead,id:'applied'},{...lead,id:'removed'}];
 const result=automationAudit(leads,{applied:{stage:'applied'},removed:{disposition:{status:'closed'}}},{a:{status:'held',reason:'Needs location confirmation',score:90}});
 assert.equal(result.total,1);assert.equal(result.evaluated,1);assert.equal(result.held,1);assert.equal(result.skipped,0);
 assert.equal(result.outside_opportunities,3);assert.equal(result.rows[0].title,'Python Engineer');
});
test('time-zone rules match complete zone names, not words such as requests',()=>{
 assert.equal(automationLocation(lead,applicant,'This contact information is for accommodation requests only and cannot be used to inquire about the status of applications.').status,'allowed');
 assert.equal(automationLocation(lead,applicant,'EST only.').status,'allowed');
 assert.equal(automationLocation(lead,applicant,'PST only.').status,'allowed');
 assert.equal(automationLocation(lead,applicant,'Only PST candidates.').status,'blocked');
});
test('next application check skips nights/weekends and follows Chicago DST',()=>{
 assert.equal(nextApplicationCheck(new Date('2026-10-29T17:08:00Z')),'2026-10-29T17:30:00.000Z');
 assert.equal(nextApplicationCheck(new Date('2026-10-30T22:30:00Z')),'2026-11-02T14:30:00.000Z');
});
