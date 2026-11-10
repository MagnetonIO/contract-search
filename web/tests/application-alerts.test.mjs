import test from 'node:test';import assert from 'node:assert/strict';
import {notifyApplicationException,exceptionEmail} from '../lib/application-alerts.mjs';
test('exception messages render separate escaped sections, a private CTA and an explicit expiry',()=>{
 const mail=exceptionEmail({id:'a',title:'Engineer <script>',source:'Greenhouse',reason:'Security check & sign-in',verification:{expires_at:'2026-11-10T03:45:00Z'}});
 assert.match(mail.html,/role="presentation"/);assert.match(mail.html,/Open private application<\/a>/);assert.match(mail.html,/Engineer &lt;script&gt;/);assert.match(mail.html,/9:45 PM CST/);assert.doesNotMatch(mail.html,/white-space:pre-wrap|<script>/);assert.match(mail.text,/\n\nNext step:/);
});
test('technical failures and closed jobs never generate a human action email',async()=>{
 for(const attempt of [{status:'failed'},{status:'skipped'},{required_action:{owner:'automation'}}])assert.equal((await notifyApplicationException(attempt,{send:()=>assert.fail('must not send')})).status,'not_needed');
});
test('exception email is idempotent and links to the authenticated dashboard rather than the browser provider',async()=>{
 let stored=null,sends=0,payload;
 const storage={read:async()=>({value:stored,version:0}),write:async(key,value)=>{stored=value;},conflict:()=>false};
 const attempt={id:'attempt',title:'Engineer',source:'LinkedIn',reason:'Sign-in is required',verification:{started_at:'2026-11-10T02:00:00Z',expires_at:'2026-11-10T02:15:00Z'}};
 const options={storage,send:async p=>{sends++;payload=p;return 'mail-receipt';}};
 await notifyApplicationException(attempt,options);await notifyApplicationException(attempt,options);
 assert.equal(sends,1);assert.equal(stored.status,'accepted');assert.equal(payload.to[0],'mlong@magneton.io');assert.match(payload.text,/contract-search-alpha.vercel.app\/application-verification\?id=attempt/);assert.doesNotMatch(JSON.stringify(payload),/connectUrl|browserbase\.com/);
});
