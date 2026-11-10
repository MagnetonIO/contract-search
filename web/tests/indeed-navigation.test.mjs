import test from 'node:test';import assert from 'node:assert/strict';
import {applicationControlKind} from '../lib/application-controls.mjs';
import {visualClickKind} from '../lib/visual-policy.mjs';
test('Indeed named continuation steps are navigation, while final submission remains guarded',()=>{
 for(const label of ['Continue to resume','Continue to questions','Continue to review','Review your application']){
  assert.equal(applicationControlKind({label,type:'button',inForm:true}),'step');
  assert.equal(visualClickKind({tag:'BUTTON',label,type:'button',inForm:true}),'click');
 }
 assert.equal(applicationControlKind({label:'Submit application',type:'submit',inForm:true}),'submission');
});
