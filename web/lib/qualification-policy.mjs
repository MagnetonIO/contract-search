const normal=value=>String(value||'').toLowerCase().replace(/u\.s\./g,'us').replace(/[“”"']/g,'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
function legalKind(text){
 if(/\b(?:us|united states|american)\s+citizen|\bcitizenship\b/i.test(text))return 'us_citizen';
 if(/clearance|\bts\/sci\b/i.test(text))return 'clearance';
 if(/permanent resident|green.?card|residency.{0,40}(?:years|required)/i.test(text))return 'residency';
 if(/sponsor|\bvisa\b/i.test(text))return 'sponsorship';
 if(/authori[sz].{0,50}work|legally.{0,30}work|eligible.{0,30}work/i.test(text))return 'work_authorization';
 return null;
}
export function qualificationDecision(review,facts,posting=''){
 const text=normal(posting),items=review?.requirements||[];
 const notes=items.filter(q=>!legalKind(q.requirement+' '+q.posting_evidence)&&q.status!=='confirmed').map(q=>q.requirement);
 const legal=items.filter(q=>legalKind(q.requirement+' '+q.posting_evidence)&&q.posting_evidence&&text.includes(normal(q.posting_evidence))&&!/not required|no.{0,15}(?:citizenship|clearance) requirement|preferred|optional/.test(normal(q.posting_evidence)));
 // Explicit legal restrictions are checked even if a model omitted them.
 const citizen=text.match(/(?:for|only|require[sd]?|must be).{0,45}\b(?:us|united states)\s+citizens?\b|\b(?:us|united states)\s+citizens?(?:hip)?\s+(?:is\s+)?(?:required|only)/)?.[0];
 if(citizen&&!legal.some(q=>legalKind(q.requirement)==='us_citizen'))legal.push({requirement:'U.S. citizenship',posting_evidence:citizen});
 const clearance=text.match(/\b(?:active|current)\s+(?:[\w/-]+\s+){0,3}clearance\b|\b(?:secret|top.secret|ts\/sci|public trust)\s+clearance\s+(?:is\s+)?(?:required|mandatory)/)?.[0];
 if(clearance&&!legal.some(q=>legalKind(q.requirement)==='clearance'))legal.push({requirement:'Active clearance',posting_evidence:clearance});
 for(const q of legal){
  const kind=legalKind(q.requirement+' '+q.posting_evidence);
  if(kind==='us_citizen'&&facts?.us_citizen==='yes')continue;
  if(kind==='work_authorization'&&facts?.work_authorization==='yes')continue;
  if(kind==='sponsorship'&&facts?.sponsorship==='no')continue;
  if(kind==='us_citizen'&&facts?.us_citizen==='no'||kind==='work_authorization'&&facts?.work_authorization==='no')return {status:'skipped',reason:'The posting requires '+q.requirement+', which conflicts with the saved applicant answer.',notes,requirements:[q.requirement]};
  return {status:'held',reason:'Required eligibility answer missing: '+q.requirement+'.',notes,requirements:[q.requirement]};
 }
 return {status:'eligible',reason:'Ready to apply using the saved résumé and confirmed applicant answers.',notes,requirements:[]};
}
