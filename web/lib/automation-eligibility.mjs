// A score alone cannot establish mandatory eligibility. Each required condition
// needs a supporting excerpt from the applicant's confirmed facts.
export function verifiedEligibility(review, facts, posting = '') {
 const normalized = text => String(text).trim().replace(/^["“](.*)["”]$/s,'$1').replace(/\s+/g, ' ').trim();
 return Array.isArray(review?.requirements) && review.requirements.length > 0 &&
  review.requirements.every(item => item.status === 'confirmed' &&
   typeof item.posting_evidence === 'string' && item.posting_evidence.length > 10 &&
   normalized(posting).includes(normalized(item.posting_evidence)) &&
   !/\bpreferred\b|\bnice.to.have\b|\boptional\b/i.test(item.posting_evidence) &&
   (Array.isArray(item.evidence)?item.evidence:[item.evidence]).length>0 &&
   (Array.isArray(item.evidence)?item.evidence:[item.evidence]).every(quote=>
    typeof quote==='string' && normalized(quote).length>10 &&
    !/\.\.\.|…/.test(quote) && normalized(facts).includes(normalized(quote))));
}
