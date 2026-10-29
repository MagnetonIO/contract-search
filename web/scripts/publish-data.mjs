import { readFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
import path from 'node:path';
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/publish-data.mjs <exported-leads.json>');
const body = await readFile(file, 'utf8');
const data = JSON.parse(body);
if (!Array.isArray(data.leads) || !data.collected_at) throw new Error('Invalid dashboard snapshot');
try {
  const descriptions = await readFile(path.join(path.dirname(file), 'job-content.json'), 'utf8');
  const content = JSON.parse(descriptions);
  if (!content.postings || content.generated_at !== data.generated_at) throw new Error('Posting content does not match snapshot generation');
  await put('job-content.json', descriptions, {access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60});
} catch(error) { if(error.code !== 'ENOENT') throw error; }
await put('leads.json', body, { access: 'private', allowOverwrite: true, addRandomSuffix: false,
  contentType: 'application/json', cacheControlMaxAge: 60 });
console.log(`Published ${data.leads.length} leads to the private dashboard store.`);
if (process.argv.includes('--include-workspace')) {
  for (const key of ['workflow.json', 'profile.json', 'resume.bin']) {
    try {
      const bytes = await readFile(path.join(path.dirname(file), key));
      await put(key, bytes, { access: 'private', allowOverwrite: false, addRandomSuffix: false,
        contentType: key.endsWith('.json') ? 'application/json' : 'application/octet-stream', cacheControlMaxAge: 60 });
      console.log(`Migrated private workspace item: ${key}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
