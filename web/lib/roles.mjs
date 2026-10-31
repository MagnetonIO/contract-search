import catalog from './role-catalog.json' with {type:'json'};
export const TRACKED_ROLES=catalog;
const priority=['cto','engineering-manager','forward-deployed','data-engineer','full-stack','lead-software'];
export function matchingRoles(title=''){
 const normalized=String(title).replace(/[\u2010-\u2015]/g,'-');
 return catalog.filter(role=>new RegExp(role.pattern,'i').test(normalized)).sort((a,b)=>priority.indexOf(a.id)-priority.indexOf(b.id));
}
export function primaryRole(title=''){return matchingRoles(title)[0]||null;}
export function roleResumeEntry(registry,title,masterHash){
 const role=primaryRole(title),entry=role&&registry?.roles?.[role.id];
 // A changed base invalidates overlays until rebuilt, reviewed and installed.
 return entry?.approved===true&&registry.master_hash===masterHash&&/^[a-f0-9]{64}$/.test(entry.hash||'')&&entry.filename===role.resume_stem+'_'+entry.hash.slice(0,8)+'.pdf'&&entry.key==='applications/resumes/'+entry.hash+'.pdf'?{...entry,role_id:role.id}:null;
}
