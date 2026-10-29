// A score alone cannot establish mandatory eligibility. Each required condition
// needs a supporting excerpt from the applicant's confirmed facts.
export function verifiedEligibility(review, facts, posting = '') {
 const normalized = text => String(text).replace(/\s+/g, ' ').trim();
 return Array.isArray(review?.requirements) && review.requirements.length > 0 &&
  review.requirements.every(item => item.status === 'confirmed' &&
   typeof item.posting_evidence === 'string' && item.posting_evidence.length > 10 &&
   normalized(posting).includes(normalized(item.posting_evidence)) &&
   !/\bpreferred\b|\bnice.to.have\b|\boptional\b/i.test(item.posting_evidence) &&
   typeof item.evidence === 'string' && item.evidence.trim().length > 10 &&
   facts.includes(item.evidence));
}
