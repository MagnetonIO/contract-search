import {createHash} from 'node:crypto';
import {roleResumeEntry,TRACKED_ROLES} from './roles.mjs';

export async function applicationResume(attempt,title,{readJson,readBytes}){
 const registry=(await readJson('role-resumes.json',{})).value;
 const pinned=attempt.resume_variant;
 if(pinned&&(!TRACKED_ROLES.some(r=>r.id===pinned.role_id&&pinned.filename===r.resume_stem+'_'+String(pinned.hash).slice(0,8)+'.pdf')||!/^applications\/resumes\/[a-f0-9]{64}\.pdf$/.test(pinned.key||'')||pinned.key!=='applications/resumes/'+pinned.hash+'.pdf'))throw Error('Pinned résumé version is invalid');
 const variant=pinned||roleResumeEntry(registry,title,attempt.resume_hash);
 const key=variant?.key||'resume.bin',hash=variant?.hash||attempt.resume_hash;
 const bytes=(await readBytes(key))?.value;
 if(!bytes||bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Approved PDF résumé is missing or changed; reinstall the recorded version');
 return {bytes,hash,key,filename:variant?.filename||null,variant:variant?{role_id:variant.role_id,hash:variant.hash,key:variant.key,filename:variant.filename}:null};
}
