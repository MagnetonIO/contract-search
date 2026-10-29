import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {detectWorkflowPatterns} from '../node_modules/@workflow/builders/dist/transform-utils.js';
test('SDK discovery includes application step functions in its deployed registry',async()=>{
 const source=await readFile(new URL('../workflows/applications.ts',import.meta.url),'utf8');
 const patterns=detectWorkflowPatterns(source);
 assert.equal(patterns.hasUseWorkflow,true);
 assert.equal(patterns.hasUseStep,true,'Step directives must be discoverable by the SDK fast scanner, not only the compiler');
});
