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
