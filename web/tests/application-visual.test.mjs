import test from 'node:test';import assert from 'node:assert/strict';
import {runVisualApplication,visualDecisionSchema} from '../lib/application-visual.mjs';
import {z} from 'zod';
test('visual action schema uses the provider-supported anyOf union',()=>{
 const schema=z.toJSONSchema(visualDecisionSchema);assert.equal(JSON.stringify(schema).includes('"oneOf"'),false);
 assert.ok(schema.properties.action.anyOf);
});
function fixture(actions,url='https://example.com/job'){
 let screenshots=0,calls=0,done=false;const invoked=[],records=[];
 const page={url:()=>url,locator:()=>({filter:()=>({count:async()=>0})}),evaluate:async()=>({width:800,height:600}),screenshot:async()=>Buffer.from('frame-'+(++screenshots))};
 return {invoked,records,run:async(maxSteps=5)=>runVisualApplication({getPage:()=>page,inspect:async()=>({fields:[],buttons:[],text:'Application'}),guard:async()=>{},stopped:async()=>done,job:{title:'Fixture'},facts:{},record:async record=>records.push(record),invoke:async(name,input)=>{invoked.push({name,input});if(name==='pause')done=true;return {fields:Array(100).fill('not accumulated'),text:'old screen'};},generate:async args=>{const parts=args.messages[0].content;assert.equal(parts.filter(p=>p.type==='file').length,1);assert.equal(parts[1].data.data.toString(),'frame-'+screenshots);assert.equal(parts[0].text.includes('not accumulated'),false);return {output:{action:actions[calls++],summary:'Fixture action'},usage:{}};},maxSteps}),get screenshots(){return screenshots;},get calls(){return calls;}};
}
test('hosted visual loop sends a fresh screenshot for each action and stops on an exception',async()=>{
 const f=fixture([{type:'click',x:25,y:35,fact:null},{type:'pause',reason:'Fixture needs an answer'}]);await f.run();
 assert.deepEqual(f.invoked.map(x=>x.name),['visualClick','pause']);assert.equal(f.screenshots,2);assert.equal(f.calls,2);
 assert.equal(f.records.filter(r=>r.image).length,2);assert.equal(f.records.filter(r=>r.action).every(r=>!r.image),true,'image bytes are kept separate from action metadata');
});
test('out-of-bounds coordinates never execute a browser action',async()=>{
 const f=fixture([{type:'click',x:900,y:35,fact:null},{type:'pause',reason:'Stop'}]);await f.run();assert.deepEqual(f.invoked.map(x=>x.name),['pause']);
});
test('authentication pages stop before images or model calls',async()=>{
 const f=fixture([],'https://example.com/login');await f.run();assert.equal(f.calls,0);assert.equal(f.screenshots,0);assert.equal(f.invoked[0].name,'pause');
});
test('repeated submit failures retain the real error and request automation repair, not applicant facts',async()=>{
 const records=[],calls=[];let done=false;
 const page={url:()=> 'https://example.com/job',locator:()=>({filter:()=>({count:async()=>0})}),evaluate:async()=>({width:800,height:600}),screenshot:async()=>Buffer.from('frame')};
 await runVisualApplication({getPage:()=>page,inspect:async()=>({fields:[],text:'Review'}),guard:async()=>{},stopped:async()=>done,job:{},facts:{},record:async r=>records.push(r),generate:async()=>({output:{action:{type:'submit',label:'Submit'},summary:'Submitting now'},usage:{}}),invoke:async(name,input)=>{calls.push({name,input});if(name==='pause'){done=true;return {paused:true};}throw new Error('Attach the approved PDF before submitting');},maxSteps:3});
 assert.equal(calls.at(-1).name,'pause');assert.equal(calls.at(-1).input.technical,true);assert.match(calls.at(-1).input.reason,/Attach the approved PDF/);assert.ok(records.some(r=>r.result_detail?.message==='Attach the approved PDF before submitting'));assert.equal(records.filter(r=>r.outcome==='blocked').length,3);
});
test('a mandatory cover letter is skipped without a model call or letter generation',async()=>{
 let skipped=false;await runVisualApplication({getPage:()=>({url:()=> 'https://example.com/job'}),inspect:async()=>({fields:[{visible:true,required:true,label:'Cover Letter',type:'textarea'}]}),guard:async()=>{},stopped:async()=>false,job:{},facts:{},record:async()=>{},invoke:async name=>{assert.equal(name,'skipCoverLetter');skipped=true;},generate:()=>{throw Error('No model call for a mandatory cover letter');}});assert.equal(skipped,true);
});
