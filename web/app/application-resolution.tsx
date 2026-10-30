'use client';
import {attemptBlocker} from '../lib/application-blockers.mjs';
export default function ApplicationResolution({attempt}:{attempt:any}){
 const action=attemptBlocker(attempt);if(!action)return null;
 return <section className="application-resolution"><strong>{action.title}</strong><p>{action.instruction}</p><p><strong>{action.owner==='automation'?'Technical blocker':'Specific step / question'}:</strong> {action.detail}</p>
  {action.owner==='user'&&action.kind==='answer'&&<button className="button secondary" onClick={()=>{const section=document.getElementById('applicant-answers');if(section instanceof HTMLDetailsElement)section.open=true;section?.scrollIntoView({behavior:'smooth',block:'start'});}}>Update reusable answer</button>}
  {action.kind==='sign_in'&&<a className="button secondary" href="#website-signins">Open website sign-ins</a>}
 </section>;
}
