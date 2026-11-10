import test from 'node:test';
import assert from 'node:assert/strict';
const requestedAt='2026-11-10T01:00:00Z';
const expected={recipient:'mlong@magneton.io',company:'Acme',requested_at:requestedAt,length:8,senders:['no-reply@us.greenhouse-mail.io']};
function message(id,code,overrides={}){return {id,internalDate:String(Date.parse(requestedAt)+1000),payload:{headers:[{name:'From',value:'Greenhouse <no-reply@us.greenhouse-mail.io>'},{name:'To',value:'mlong@magneton.io'},{name:'Subject',value:'Security code for your application to Acme'},{name:'Authentication-Results',value:'mx.google.com; dkim=pass header.i=@us.greenhouse-mail.io'}],mimeType:'text/plain',body:{data:Buffer.from('Copy and paste this code into the security code field on your application: '+code).toString('base64url')}},...overrides};}
test('verification matching rejects old, consumed, wrong sender and ambiguous messages',async()=>{
 const {selectVerificationCode}=await import('../lib/gmail-verification.mjs');
 assert.deepEqual(selectVerificationCode([message('a','12345678')],expected),{message_id:'a',code:'12345678'});
 assert.equal(selectVerificationCode([message('a','12345678')],{...expected,consumed:['a']}),null);
 assert.equal(selectVerificationCode([message('a','12345678',{internalDate:String(Date.parse(requestedAt)-1000)})],expected),null);
 assert.equal(selectVerificationCode([message('a','12345678'),message('b','87654321')],expected),null);
 assert.equal(selectVerificationCode([message('a','12345678')],{...expected,company:'Other'}),null);
 assert.equal(selectVerificationCode([message('a','12345678')],{...expected,senders:['attacker.example']}),null);
});
test('stored Gmail tokens are encrypted, authenticated, and never contain plaintext',async()=>{
 const {encryptCredential,decryptCredential}=await import('../lib/gmail-verification.mjs');const key=Buffer.alloc(32,7).toString('base64');
 const saved=encryptCredential({refresh_token:'private-refresh-token'},key);assert.equal(JSON.stringify(saved).includes('private-refresh-token'),false);
 assert.equal(decryptCredential(saved,key).refresh_token,'private-refresh-token');assert.throws(()=>decryptCredential(saved,Buffer.alloc(32,8).toString('base64')));
});
test('cross-site OAuth callback requires the matching browser-bound state cookie',async()=>{
 const {validGmailCallback}=await import('../lib/gmail-verification.mjs');const nonce='a'.repeat(43);
 assert.equal(validGmailCallback(nonce,nonce),true);assert.equal(validGmailCallback(nonce,undefined),false);assert.equal(validGmailCallback(nonce,'b'.repeat(43)),false);assert.equal(validGmailCallback('', ''),false);
});
