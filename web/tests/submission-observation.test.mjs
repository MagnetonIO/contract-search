import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {watchSubmission} from '../lib/submission-observation.mjs';
test('visible client validation permits correction only when no write or navigation occurred',()=>{
 const context=new EventEmitter(),watch=watchSubmission(context);
 assert.equal(watch.rejected(['Country']),true);assert.equal(watch.rejected([]),false);
 context.emit('request',{method:()=> 'GET',isNavigationRequest:()=>false});assert.equal(watch.rejected(['Country']),true);
 context.emit('request',{method:()=> 'POST',isNavigationRequest:()=>false});assert.equal(watch.rejected(['Country']),false);watch.dispose();assert.equal(context.listenerCount('request'),0);
});
test('navigation or an unobservable request never permits resetting a submission',()=>{
 for(const request of [{method:()=> 'GET',isNavigationRequest:()=>true},{}]){const context=new EventEmitter(),watch=watchSubmission(context);context.emit('request',request);assert.equal(watch.rejected(['Country']),false);watch.dispose();}
});
