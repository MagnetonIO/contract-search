import test from 'node:test';
import { execFileSync } from 'node:child_process';

// Run separately so the Blob fixture cannot affect other tests or real storage.
test('private Blob reads retain the strong version required for conditional saves', () => {
  execFileSync(process.execPath, ['--input-type=module'], {
    cwd: process.cwd(), encoding: 'utf8', input: `
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const fixture = 'data:text/javascript,' + encodeURIComponent(\`
 let value = 'x'.repeat(2048), version = '"version-1"';
 export const calls = {};
 export class BlobPreconditionFailedError extends Error {}
 export async function get(key, options) {
   calls[key] = (calls[key] || 0) + 1;
   if (key === 'transient.json' && calls[key] < 3) throw Error('Vercel Blob: Failed to fetch blob: 500 Internal Server Error');
   if (key === 'unauthorized.json') throw Error('Vercel Blob: 401 Unauthorized');
   if (key === 'unavailable.json') throw Error('Vercel Blob: 503 Service Unavailable');
   return { statusCode: 200, stream: new Response(value).body,
     blob: { etag: options.headers?.['accept-encoding'] === 'identity' ? version : 'W/' + version } };
 }
 export async function put(key, next, options) {
   if(key==='conditional-conflict.json')throw Error('Vercel Blob: The conditional request cannot succeed due to a conflicting operation against this resource.');
   if (options.ifMatch && options.ifMatch !== version) throw new BlobPreconditionFailedError();
   value = next; version = '"version-2"'; return { etag: version };
 }
\`);
registerHooks({ resolve(specifier, context, next) {
 return specifier === '@vercel/blob' ? { url: fixture, shortCircuit: true } : next(specifier, context);
}});
process.env.DASHBOARD_STORAGE = 'blob';
const { readBytes, writeBytes, ConflictError } = await import('./lib/store.ts');
const original = await readBytes('workflow.json');
assert.equal(original.value.length, 2048);
assert.equal(original.version, '"version-1"', 'compressed weak ETags cannot be used for writes');
const nextVersion = await writeBytes('workflow.json', 'saved application', 'application/json', original.version);
assert.equal(nextVersion, '"version-2"');
await assert.rejects(writeBytes('conditional-conflict.json','data','application/json',nextVersion),ConflictError);
await assert.rejects(writeBytes('conditional-conflict.json','data','application/json'),e=>!(e instanceof ConflictError));
await assert.rejects(writeBytes('workflow.json', 'stale edit', 'application/json', original.version), ConflictError);
assert.equal((await readBytes('workflow.json')).value.toString(), 'saved application');
const {calls} = await import('@vercel/blob');
assert.equal((await readBytes('transient.json')).value.toString(), 'saved application');
assert.equal(calls['transient.json'], 3, 'a transient storage error retries only the read');
await assert.rejects(readBytes('unauthorized.json'), /401/);assert.equal(calls['unauthorized.json'], 1);
await assert.rejects(readBytes('unavailable.json'), /503/);assert.equal(calls['unavailable.json'], 3, 'persistent outages remain bounded and fail closed');
`
  });
});
