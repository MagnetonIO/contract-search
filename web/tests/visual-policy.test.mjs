import test from 'node:test';import assert from 'node:assert/strict';
import {visualClickKind,choiceMatches,humanCheckText,needsResumeUpload,experienceAnswer,optionalTopChoice,knownChoiceAnswer,visualTextFactAllowed} from '../lib/visual-policy.mjs';
test('numeric experience comes only from the matching explicit user-confirmed answer',()=>{
 const sentence='User-confirmed application answer: 3 years of hands-on work experience with Palantir/Foundry.';
 const facts={verified_experience:sentence};
 assert.equal(experienceAnswer('How many years of work experience do you have with Palantir?',facts).answer,'3');
 assert.equal(experienceAnswer('Years of working experience with Foundry?',facts).answer,'3');
 assert.equal(experienceAnswer('Years of Python experience?',facts),null);
 assert.equal(experienceAnswer('Desired hourly rate?',facts),null);
 assert.equal(experienceAnswer('Years of Palantir experience?',{verified_experience:'General 20 years engineering experience'}),null);
 assert.equal(experienceAnswer('Years of Palantir experience?',{verified_experience:sentence+' User-confirmed application answer: 5 years of hands-on work experience with Palantir.'}),null);
});
test('passive reCAPTCHA notices do not masquerade as a human-verification challenge',()=>{
 assert.equal(humanCheckText('This site is protected by reCAPTCHA. Privacy Policy and Terms apply.'),false);
 assert.equal(humanCheckText('Verify you are human to continue'),true);
 assert.equal(humanCheckText('Humans only'),true);
});
test('visual navigation cannot bypass submission, answer or authentication gates',()=>{
 assert.equal(visualClickKind({tag:'BUTTON',text:'Next',inForm:true,type:'button'}),'click');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Easy Apply',inForm:false,type:'submit'}),'click','default button type outside a form does not make entry a submission');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Apply',inForm:true,type:'button'}),'submission');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Continue',inForm:true,type:'submit'}),'click');
 assert.equal(visualClickKind({tag:'INPUT',type:'checkbox',label:'Sponsorship?'}),'answer');
 for(const text of ['Sign in','Agree and continue','Delete account','Pay now'])assert.equal(visualClickKind({tag:'BUTTON',text}),'blocked');
 assert.equal(visualClickKind({tag:'INPUT',type:'password'}),'blocked');
 assert.equal(visualClickKind({tag:'BUTTON',text:'',inForm:false,type:'button'}),'click');
 assert.equal(visualClickKind({tag:'BUTTON',text:'',inForm:true,type:'button'}),'blocked');
 assert.equal(visualClickKind({tag:'BUTTON',label:'Dismiss',applicationDialog:true}),'blocked');
 assert.equal(visualClickKind({tag:'BUTTON',label:'Dismiss',applicationDialog:false}),'click');
});
test('a preselected old resume cannot bypass the approved upload before Next',()=>{
 const args={attached:false,control:{text:'Next'},uploadAvailable:true};
 assert.equal(needsResumeUpload(args),true);
 assert.equal(needsResumeUpload({...args,attached:true}),false);
 assert.equal(needsResumeUpload({...args,uploadAvailable:false}),false);
 assert.equal(needsResumeUpload({...args,control:{text:'Back'}}),false);
});
test('visual answer selections must match the question and confirmed facts',()=>{
 const facts={work_authorization:'yes',sponsorship:'no',country:'United States',email:'test@example.com',routine_privacy_consent:'yes'};
 assert.equal(choiceMatches({fact:'sponsorship',value:'0',label:'No',question:'Do you need sponsorship?',facts}),true);
 assert.equal(choiceMatches({fact:'sponsorship',value:'1',label:'Yes',question:'Do you need sponsorship?',facts}),false);
 assert.equal(choiceMatches({fact:'work_authorization',label:'Yes',question:'Are you authorized to work in the United States?',facts}),true);
 assert.equal(choiceMatches({fact:'work_authorization',label:'Yes',question:'Do you have a clearance?',facts}),false);
 assert.equal(choiceMatches({fact:'country',label:'United States (+1)',question:'Phone country code',facts}),true);
 assert.equal(choiceMatches({fact:'email',value:'test@example.com',question:'Email address',facts}),true);
 assert.equal(choiceMatches({fact:'routine_privacy_consent',label:'Yes',question:'Accept arbitration terms',facts}),false);
});

test('optional top-choice promotion is recognized without answering an eligibility question',()=>{
 assert.equal(optionalTopChoice({type:'checkbox',question:'Mark job as a top choice'}),true);
 assert.equal(optionalTopChoice({type:'radio',label:'Top choice'}),true);
 assert.equal(optionalTopChoice({type:'checkbox',question:'Are you authorized to work?'}),false);
 assert.equal(optionalTopChoice({type:'button',label:'Top choice'}),false);
});

test('authorization without sponsorship is a combined question, not a request for sponsorship',()=>{
 const facts={work_authorization:'yes',sponsorship:'no'};
 const question='Are you authorized to work in the United States without the need for current or future visa sponsorship?';
 assert.deepEqual(knownChoiceAnswer(question,facts),{fact:'work_authorization',answer:'yes'});
 assert.equal(choiceMatches({fact:'sponsorship',label:'No',question,facts}),false);
 assert.equal(choiceMatches({fact:'work_authorization',label:'Yes',question,facts}),true);
 assert.equal(knownChoiceAnswer('Do you need sponsorship?',facts).answer,'no');
 assert.equal(knownChoiceAnswer('Do you have a clearance?',facts),null);
 assert.equal(knownChoiceAnswer(question,{work_authorization:'yes'}),null);
});
test('confirmed U.S. citizenship can answer the matching question without implying clearance',()=>{
 const facts={us_citizen:'yes'};assert.equal(knownChoiceAnswer('Are you a U.S. citizen?',facts).answer,'yes');
 assert.equal(choiceMatches({fact:'us_citizen',label:'Yes',question:'Are you a United States citizen?',facts}),true);
 assert.equal(knownChoiceAnswer('Are you a U.S. citizen with active Secret clearance?',facts),null);
});

test('cookie rejection does not become a job submission and acceptance of new agreements stays blocked',()=>{
 assert.equal(visualClickKind({tag:'BUTTON',text:'Decline all',type:'submit',inForm:true,cookieConsent:true}),'click');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Accept all',type:'submit',inForm:true,cookieConsent:true}),'blocked');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Decline all',type:'submit',inForm:true,cookieConsent:false}),'submission');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Accept terms',type:'button',cookieConsent:true}),'blocked');
});
test('employer entry buttons can open a form without bypassing final submission',()=>{
 assert.equal(visualClickKind({tag:'BUTTON',text:'Apply for This Job',type:'button',inForm:false}),'click');
 assert.equal(visualClickKind({tag:'BUTTON',text:"I'm interested",type:'button',inForm:false}),'click');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Apply for This Job',type:'submit',inForm:true}),'submission');
});

test('an employer Apply now button outside a form opens the form even with the default submit type',()=>{
 assert.equal(visualClickKind({tag:'BUTTON',text:'Apply now',type:'submit',inForm:false}),'click');
 assert.equal(visualClickKind({tag:'BUTTON',text:'Apply now',type:'submit',inForm:true}),'submission');
});

test('a US phone-country option may display the calling code without parentheses',()=>{
 const facts={country:'United States'};assert.equal(choiceMatches({fact:'country',label:'United States +1',question:'Country*',facts}),true);assert.equal(choiceMatches({fact:'country',label:'Canada +1',question:'Country*',facts}),false);assert.equal(choiceMatches({fact:'country',label:'United States +44',question:'Country*',facts}),false);
});

test('state selectors accept the full name of the confirmed state without accepting another state',()=>{
 assert.equal(choiceMatches({fact:'state',label:'Illinois',value:'12',question:'State *',facts:{state:'IL'}}),true);assert.equal(choiceMatches({fact:'state',label:'California',value:'5',question:'State *',facts:{state:'IL'}}),false);assert.equal(choiceMatches({fact:'state',label:'IL',question:'State *',facts:{state:'Illinois'}}),true);
});

test('experience dropdowns accept a matching confirmed duration without borrowing years from another skill',()=>{
 const facts={verified_experience:'User-confirmed application answer: 10 years of hands-on work experience with Conversational AI.\nUser-confirmed application answer: 3 years of hands-on work experience with Palantir/Foundry.'};
 assert.equal(choiceMatches({fact:'verified_experience',question:'How many years of experience do you have with Conversational AI?',value:'10',label:'10 years',facts}),true);
 assert.equal(choiceMatches({fact:'verified_experience',question:'How many years of experience do you have with Conversational AI?',value:'5',label:'5 years',facts}),false);
 assert.equal(choiceMatches({fact:'verified_experience',question:'How many years of experience do you have with Data Governance?',value:'3',label:'3 years',facts}),false);
 assert.equal(choiceMatches({fact:'verified_experience',question:'How many years of experience do you have with AI Agent development?',value:'10',label:'10 years',facts}),false);
});

test('experience range boundaries contain the confirmed years without overstating them',()=>{
 const facts={verified_experience:'User-confirmed application answer: 4 years of hands-on work experience with Data Governance.'};const match=label=>choiceMatches({fact:'verified_experience',question:'How many years experience in Data Governance do you have?',value:label,label,facts});
 assert.equal(match('4-6 years'),true);assert.equal(match('1-3 years'),false);assert.equal(match('7+ years'),false);assert.equal(match('4+ years'),true);assert.equal(match('6-4 years'),false);
});

test('documented hands-on technical skills can answer Yes without a separate repeated confirmation',()=>{
 const facts={verified_experience:'Designed private Azure infrastructure using modular Bicep for Container Apps and PostgreSQL. Skills: Python, Kubernetes, Java/Spring.'};
 const match=(question,label,f=facts)=>choiceMatches({fact:'verified_experience',question,label,value:label,facts:f});
 assert.equal(match('Do you have hands-on experience with Microsoft Azure?','Yes'),true);
 assert.equal(match('Do you have experience with Kubernetes?','Yes'),true);
 assert.equal(match('Do you have professional experience developing applications using Java?','Yes'),true);
 assert.equal(match('Do you have professional experience developing applications using Java?','Yes',{verified_experience:'Skills: JavaScript.'}),false);
 assert.equal(match('Do you have experience with an undocumented product?','Yes'),false);
 assert.equal(match('Do you have experience with Microsoft Azure?','No'),false);
 assert.equal(match('Do you have a Microsoft Azure certification?','Yes'),false);
 const zeroAlias={verified_experience:'User-confirmed application answer: 0 years of hands-on work experience with Microsoft Azure.'};assert.equal(match('Do you have hands-on experience with Microsoft Azure?','No',zeroAlias),true);
 const zero={verified_experience:'User-confirmed application answer: 0 years of hands-on work experience with Azure.'};assert.equal(match('Do you have hands-on experience with Microsoft Azure?','No',zero),true);assert.equal(match('Do you have hands-on experience with Microsoft Azure?','Yes',zero),false);
});

test('authorization categories use confirmed citizenship without substituting for clearance or sponsorship',()=>{
 const args={fact:'us_citizen',label:'U.S. Citizen',question:'What is your current work authorization?*',facts:{us_citizen:'yes',work_authorization:'yes'}};
 assert.equal(choiceMatches(args),true);
 assert.equal(choiceMatches({...args,facts:{work_authorization:'yes'}}),false);
 assert.equal(choiceMatches({...args,label:'Green Card'}),false);
 assert.equal(choiceMatches({...args,question:'Work authorization and active clearance?'}),false);
 assert.equal(choiceMatches({...args,question:'Work authorization without sponsorship?'}),false);
});

test('visual typing uses only matching routine facts and location options respect the saved region',()=>{
 const facts={city:'Chicago',state:'IL',country:'United States',work_authorization:'yes'};
 assert.equal(visualTextFactAllowed('Location *','city',facts),true);assert.equal(visualTextFactAllowed('Years of experience?','city',facts),false);assert.equal(visualTextFactAllowed('Password','city',facts),false);assert.equal(visualTextFactAllowed('Location','work_authorization',facts),false);
 assert.equal(choiceMatches({fact:'city',label:'Chicago, Illinois, United States',question:'Location',facts}),true);assert.equal(choiceMatches({fact:'city',label:'Chicago, Ontario, Canada',question:'Location',facts}),false);assert.equal(choiceMatches({fact:'city',label:'Chicago, Wisconsin, United States',question:'Location',facts}),false);assert.equal(choiceMatches({fact:'city',label:'Chicago, WI',question:'Location',facts}),false);assert.equal(choiceMatches({fact:'city',label:'Chicago, IL',question:'Location',facts}),true);
});

test('overall seniority uses confirmed overall years without assigning that duration to a new technology',()=>{
 const facts={overall_experience_years:'20',general_experience_years:'10',verified_experience:'User-confirmed application answer: 4 years of hands-on work experience with AI Agent development.'};
 assert.equal(experienceAnswer('How many years of professional software engineering experience do you have?',facts).answer,'20');
 assert.equal(experienceAnswer('How many years of AI Agent development experience do you have?',facts).answer,'4');
 assert.equal(experienceAnswer('How many years of Rust experience do you have?',facts),null);
});
