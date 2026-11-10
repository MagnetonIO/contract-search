import test from 'node:test';import assert from 'node:assert/strict';
test('routine contact entry uses saved facts across all four flows without guessing unknown fields',async()=>{
 const {routineAction}=await import('../lib/application-routine.mjs');
 for(const host of ['www.linkedin.com','www.dice.com','smartapply.indeed.com','job-boards.greenhouse.io']){
  const form={url:'https://'+host+'/application',fields:[{index:0,label:'First Name',type:'text',visible:true,current_value:''},{index:1,label:'Email',type:'email',visible:true,current_value:''},{index:2,label:'Certification number',type:'text',visible:true,current_value:''}]};
  assert.deepEqual(routineAction(form,{first_name:'Matthew',email:'mlong@magneton.io'}),{type:'fill_known_fields',fields:[{index:0,label:'First Name',fact:'first_name'},{index:1,label:'Email',fact:'email'}]});
 }
});
test('routine navigation never submits, answers unknown requirements or uploads a saved resume again',async()=>{
 const {routineAction}=await import('../lib/application-routine.mjs');
 const base={url:'https://www.dice.com/application',approved_resume_attached:true,fields:[],buttons:['Submit']};assert.equal(routineAction(base,{}),null);
 assert.equal(routineAction({...base,buttons:['Next'],fields:[{index:0,label:'Unknown required answer',required:true,visible:true,filled:false,type:'text'}]},{}),null);
 assert.deepEqual(routineAction({...base,buttons:['Next']},{}),{type:'next',label:'Next'});
 assert.deepEqual(routineAction({...base,approved_resume_attached:false,resume_upload_allowed:true,fields:[{index:0,label:'Resume',type:'file',visible:false}]},{}),{type:'upload_resume',x:0,y:0});
});
test('an observed non-final Apply entry opens before a resume exists, while an in-form Apply remains guarded',async()=>{
 const {routineAction}=await import('../lib/application-routine.mjs');const base={url:'https://www.indeed.com/job/example',fields:[],approved_resume_attached:false,buttons:['Apply now'],controls:[{label:'Apply now',text:'Apply now',type:'button',inForm:false}]};
 assert.deepEqual(routineAction(base,{}),{type:'next',label:'Apply now'});
 assert.equal(routineAction({...base,controls:[{label:'Apply now',text:'Apply now',inForm:true,type:'submit'}]},{}),null);
});
test('a persistent Greenhouse Apply shortcut never interrupts an already-open form or repeats entry clicks',async()=>{
 const {routineAction}=await import('../lib/application-routine.mjs');const form={url:'https://job-boards.greenhouse.io/acme/jobs/123',approved_resume_attached:false,resume_upload_allowed:true,controls:[{label:'Apply',inForm:false}],buttons:['Apply','Submit application'],fields:[{index:0,label:'First Name',type:'text',visible:true,required:true,filled:true,current_value:'Matthew'},{index:1,label:'Resume/CV',type:'file',visible:false}]};
 assert.deepEqual(routineAction(form,{first_name:'Matthew'}),{type:'upload_resume',x:0,y:0});
});
test('empty numeric experience questions go directly to grounded duration inference without a screenshot guess',async()=>{
 const {routineAction}=await import('../lib/application-routine.mjs');const form={url:'https://job-boards.greenhouse.io/acme/jobs/123',fields:[{index:0,label:'How many years of professional experience do you have building ML models?',type:'text',visible:true,filled:false,required:true,current_value:''}]};const facts={verified_experience:'ML Engineer 2020 - Present. Built production models.'};
 assert.deepEqual(routineAction(form,facts),{type:'fill_answer',index:0,label:form.fields[0].label,answer:'',evidence:[facts.verified_experience]});
});
test('phone country and factual Yes/No text fields fill without a model or repeating an already-selected country',async()=>{
 const {routineAction}=await import('../lib/application-routine.mjs');const facts={country:'United States',work_authorization:'yes',sponsorship:'no'};
 const field={index:0,label:'Country',question:'Country',type:'text',role:'combobox',visible:true,filled:false,current_value:''};const form={url:'https://job-boards.greenhouse.io/acme/jobs/123',fields:[field]};assert.deepEqual(routineAction(form,facts),{type:'choose',index:0,label:'Country',value:'United States',fact:'country'});
 assert.equal(routineAction({...form,fields:[{...field,filled:true,current_value:'US',selected_label:'United States +1'}]},facts),null);
 const q={index:1,label:'Are you currently located in the United States?',type:'text',visible:true,filled:false};assert.equal(routineAction({...form,fields:[q]},facts).answer,'yes');
});
