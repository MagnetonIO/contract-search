import test from 'node:test';import assert from 'node:assert/strict';
import {parsePostingStatus,publicPostingUrl} from '../lib/posting-status.mjs';
const lead={id:'a',title:'Azure Architect - Cloud Solutions',source_url:'https://www.dice.com/job-detail/fixture'};
const page=(extra='')=>`<main><h1>${lead.title}</h1>${extra}<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title:lead.title,description:'Build production cloud systems and enterprise architecture.',baseSalary:{currency:'USD',value:{minValue:70,maxValue:73,unitText:'HOUR'}}})}</script></main>`;
test('HTTP 410 and the current posting closure banner are closed, with live hourly pay retained',()=>{
 const x=parsePostingStatus(lead,{status:410,html:page('<div role="alert">Sorry this job is no longer available.</div>')});assert.equal(x.status,'closed');assert.equal(x.pay,'$70 - $73/hr');
 assert.equal(parsePostingStatus(lead,{status:200,html:page('<div role="alert">No longer accepting applications</div>')}).status,'closed');
});
test('similar-job text and access failures cannot be mistaken for the current job closing',()=>{
 assert.equal(parsePostingStatus(lead,{status:200,html:page('<h2>Similar Jobs</h2><section>No longer accepting applications</section>')}).status,'open');
 for(const status of [403,429,500])assert.equal(parsePostingStatus(lead,{status,html:'Access denied'}).status,'unknown');
 assert.equal(parsePostingStatus(lead,{status:200,html:'<h1>Sign in</h1>'}).status,'unknown');
});
test('salary stays unknown unless the current posting supplies a unit and USD evidence',()=>{
 assert.equal(parsePostingStatus(lead,{status:200,html:'<h1>'+lead.title+'</h1><h2>Similar Jobs</h2><div>$500/hr</div>'}).pay,undefined);
 assert.equal(parsePostingStatus(lead,{status:200,html:page().replace('HOUR','YEAR')}).pay,'$70 - $73/yr');
});
test('public checks never call SAM APIs, credential links, local addresses or arbitrary hosts',()=>{
 for(const source_url of ['https://api.sam.gov/opportunities/v2/search','https://user:secret@www.dice.com/job-detail/x','http://www.dice.com/job-detail/x','https://127.0.0.1/job','https://unknown.example/job'])assert.equal(publicPostingUrl({source_url}),null);
 assert.equal(publicPostingUrl(lead),lead.source_url);
});

test('closure evidence retains the exact matched site notice',()=>{
 const result=parsePostingStatus(lead,{status:200,html:'<h1>'+lead.title+'</h1><div role="alert">Sorry, this job is no longer available.</div>'});
 assert.equal(result.status,'closed');assert.equal(result.site_notice,'Sorry, this job is no longer available.');
});

test('LinkedIn not-currently-accepting text closes only the current listing',()=>{
 const result=parsePostingStatus(lead,{status:200,html:page('<div role="alert">Not currently accepting applications</div>')});
 assert.equal(result.status,'closed');assert.equal(result.site_notice,'Not currently accepting applications');
 assert.equal(parsePostingStatus(lead,{status:200,html:page('<h2>Similar Jobs</h2><section>Not currently accepting applications</section>')}).status,'open');
});
test('Indeed expired-job banners close the selected posting without a handoff',()=>{
 const indeed={title:'CTO / Senior Developer (part-time, remote)',source_url:'https://www.indeed.com/job/cto-example'};
 const html='<main><div role="alert">This job has expired on Indeed. Reasons could include: the employer is not accepting applications.</div><h1>'+indeed.title+'</h1></main>';
 const result=parsePostingStatus(indeed,{status:200,html});assert.equal(result.status,'closed');assert.match(result.site_notice,/This job has expired on Indeed/);
});
test('a closed page without a heading requires its observed URL to identify this exact posting',()=>{
 const html='<div class="jobsearch-JobInfoHeader-expired">This job has expired on Indeed</div>';
 const job={title:'Engineer',application_url:'https://www.indeed.com/job/engineer-abc'};
 assert.equal(parsePostingStatus(job,{status:200,html,url:job.application_url}).status,'closed');
 assert.equal(parsePostingStatus(job,{status:200,html,url:'https://www.indeed.com/job/other-def'}).status,'unknown');
 assert.equal(parsePostingStatus(job,{status:200,html:'Access denied',url:job.application_url}).status,'unknown');
});
