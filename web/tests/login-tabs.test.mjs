import test from 'node:test';import assert from 'node:assert/strict';
import {loginTabs,selectLoginTab} from '../lib/login-tabs.mjs';
test('new OAuth tabs become visible, manual choices persist, and a closed popup returns to the site',()=>{
 const root={id:'site',origin:'https://www.glassdoor.com',live_url:'https://www.browserbase.com/site'};
 const google={id:'google',origin:'https://accounts.google.com',live_url:'https://www.browserbase.com/google'};
 assert.equal(selectLoginTab([root],null,[]).id,'site');
 assert.equal(selectLoginTab([root,google],'site',['site']).id,'google');
 assert.equal(selectLoginTab([root,google],'site',['site','google']).id,'site');
 assert.equal(selectLoginTab([root],'google',['site','google']).id,'site');
 assert.equal(selectLoginTab([root,google],null,[]).id,'google');
});
test('viewer metadata never returns OAuth query parameters or non-provider frame URLs',()=>{
 const tabs=loginTabs({pages:[{id:'a',title:'Google sign-in',url:'https://accounts.google.com/signin?code=private-code&state=private-state',debuggerFullscreenUrl:'https://www.browserbase.com/live-a'},{id:'b',title:'Untrusted frame',url:'https://example.com',debuggerFullscreenUrl:'https://evil.example/frame'}]});
 assert.equal(tabs.length,1);assert.equal(tabs[0].origin,'https://accounts.google.com');assert.equal(JSON.stringify(tabs).includes('private-code'),false);assert.equal(JSON.stringify(tabs).includes('private-state'),false);
});
