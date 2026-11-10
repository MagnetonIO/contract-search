'use client';
import {attemptBlocker} from '../lib/application-blockers.mjs';
export default function ApplicationResolution({attempt}:{attempt:any}){
 const action=attemptBlocker(attempt);if(!action)return null;
 return <section className="application-resolution"><strong>{action.title}</strong><p>{action.instruction}</p><p><strong>{action.owner==='automation'?'Technical blocker':'Specific step / question'}:</strong> {action.detail}</p>
  {action.owner==='user'&&action.kind==='answer'&&<button className="button secondary" onClick={()=>{const section=document.getElementById('applicant-answers');if(section instanceof HTMLDetailsElement)section.open=true;section?.scrollIntoView({behavior:'smooth',block:'start'});}}>Update reusable answer</button>}
  {(action.kind==='email_verification'||attempt.verification?.state==='active')&&<a className="button primary" href={'/application-verification?id='+attempt.id} target="_blank" rel="noreferrer">Open private application browser</a>}
  {action.kind==='sign_in'&&attempt.verification?.state!=='active'&&<a className="button secondary" href="#website-signins">Open website sign-ins</a>}
  {attempt.notification_error&&<p role="alert">{attempt.notification_error}</p>}
 </section>;
}
