// Install reviewed local documents into the existing private store, never public assets.
// Usage: node --env-file=.env.local scripts/install_role_resumes.mjs
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readJson,writeJson,readBytes,writeBytes} from '../web/lib/store.ts';
import {TRACKED_ROLES} from '../web/lib/roles.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../resumes');
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
const profile=(await readJson('profile.json',{})).value;
if(profile.resume_hash!==manifest.source_hashes['Resume_Matthew_Long.pdf'])throw Error('The stored base résumé differs from the reviewed source PDF. Rebuild against the active base before installing.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const registry={schema_version:1,master_hash:profile.resume_hash,roles:{}};
for(const role of TRACKED_ROLES){
 const entry=manifest.roles.find(r=>r.id===role.id);
 if(!entry||entry.pages!==2)throw Error('Missing reviewed two-page role résumé: '+role.id);
 const bytes=await readFile(path.join(root,role.id,role.resume_stem+'.pdf'));
 if(hash(bytes)!==entry.sha256||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Rebuild required: PDF changed since the manifest');
 const key='applications/resumes/'+entry.sha256+'.pdf';
 const existing=await readBytes(key);if(existing&&hash(existing.value)!==entry.sha256)throw Error('Stored PDF hash mismatch');
 if(!existing)await writeBytes(key,bytes,'application/pdf',null);
 const docx=await readFile(path.join(root,role.id,role.resume_stem+'.docx')),docxHash=hash(docx),docxKey='role-resumes/docx/'+docxHash+'.docx';
 if(!await readBytes(docxKey))await writeBytes(docxKey,docx,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',null);
 if(hash((await readBytes(key)).value)!==entry.sha256||hash((await readBytes(docxKey)).value)!==docxHash)throw Error('Private store round-trip verification failed');
 registry.roles[role.id]={approved:true,hash:entry.sha256,key,filename:role.resume_stem+'_'+entry.sha256.slice(0,8)+'.pdf',docx_key:docxKey,docx_hash:docxHash,installed_at:new Date().toISOString()};
}
const previous=await readJson('role-resumes.json',{});await writeJson('role-resumes.json',registry,previous.version);
console.log(JSON.stringify({installed:Object.keys(registry.roles),access:'private',verified_hashes:true,selection:'role version reused until content changes'}));
