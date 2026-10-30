import test from 'node:test';import assert from 'node:assert/strict';
import {uploadApprovedResume} from '../lib/resume-upload.mjs';
test('a unique current resume upload button works even when model coordinates are stale',async()=>{
 let clicked=0,uploaded=0;
 const button={filter(){return this;},count:async()=>1,click:async()=>{clicked++;}};
 const scope={locator:()=>({count:async()=>0}),getByRole:()=>button};
 const file={name:'approved.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF')};
 const page={waitForEvent:async()=>({setFiles:async f=>{assert.equal(f,file);uploaded++;}}),mouse:{click:()=>{throw Error('Stale screenshot coordinates must not be used when a native upload control exists');}}};
 assert.equal((await uploadApprovedResume({page,scope,file,x:1,y:1})).attached,true);assert.equal(clicked,1);assert.equal(uploaded,1);
});
test('an ambiguous native uploader cannot guess a file destination',async()=>{
 const scope={locator:()=>({count:async()=>0}),getByRole:()=>({filter(){return this;},count:async()=>2})};
 assert.equal((await uploadApprovedResume({page:{},scope,file:{name:'approved.pdf'}})).not_uploaded,true);
});
