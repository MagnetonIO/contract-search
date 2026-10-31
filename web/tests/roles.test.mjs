import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {TRACKED_ROLES,matchingRoles,primaryRole,roleResumeEntry} from '../lib/roles.mjs';
import {applicationResume} from '../lib/application-resume.mjs';
import {approvedSiteResume,recordSiteResume} from '../lib/resume-library.mjs';
test('target families match title aliases with specific roles preceding broad lead titles',()=>{
 for(const role of TRACKED_ROLES)for(const alias of role.aliases)assert.ok(matchingRoles(alias).some(r=>r.id===role.id),alias);
 assert.equal(primaryRole('Lead Full-Stack Engineer').id,'full-stack');
 assert.equal(primaryRole('Lead Data Engineer').id,'data-engineer');
 assert.equal(primaryRole('Forward-Deployed AI Engineer').id,'forward-deployed');
 assert.equal(primaryRole('CTO / Lead Software Engineer').id,'cto');
 assert.equal(primaryRole('Principal DevOps Engineer'),null,'existing other roles are retained without assigning the wrong resume');
 assert.equal(primaryRole('Account Manager'),null);
});
test('role documents are hash-verified, pinned across retries and invalidated on base changes',async()=>{
 const bytes=Buffer.from('%PDF-1.4 reviewed role version'),hash=createHash('sha256').update(bytes).digest('hex'),role=TRACKED_ROLES.find(r=>r.id==='data-engineer');
 const entry={approved:true,hash,key:'applications/resumes/'+hash+'.pdf',filename:role.resume_stem+'_'+hash.slice(0,8)+'.pdf'};
 const registry={master_hash:'master',roles:{'data-engineer':entry}};
 assert.equal(roleResumeEntry(registry,'Data Engineer','changed'),null);
 assert.equal(roleResumeEntry({...registry,roles:{'data-engineer':{...entry,approved:false}}},'Data Engineer','master'),null);
 const store={readJson:async()=>({value:registry}),readBytes:async key=>({value:key===entry.key?bytes:Buffer.from('wrong')})};
 const selected=await applicationResume({resume_hash:'master'},'Lead Data Engineer',store);
 assert.equal(selected.hash,hash);assert.equal(selected.variant.role_id,'data-engineer');
 const retried=await applicationResume({resume_hash:'master',resume_variant:selected.variant},'CTO',{...store,readJson:async()=>({value:{}})});
 assert.equal(retried.hash,hash,'retry uses the exact previously chosen file');
 await assert.rejects(applicationResume({resume_hash:'master'},'Data Engineer',{...store,readBytes:async()=>({value:Buffer.from('%PDF-1.4 changed')})}),/missing or changed/);
});
test('saved site library retains default and all role versions when jobs alternate',()=>{
 let library={linkedin:{master_hash:'base',filename:'Resume_Matthew_Long.pdf',approval:'user'}};
 for(const hash of ['data','cto','data'])library=recordSiteResume(library,'linkedin',{master_hash:hash,filename:hash+'.pdf',approval:'upload'});
 for(const [hash,name] of [['base','Resume_Matthew_Long.pdf'],['data','data.pdf'],['cto','cto.pdf']])assert.equal(approvedSiteResume(library,'https://www.linkedin.com/jobs/view/123',hash).filename,name);
});
