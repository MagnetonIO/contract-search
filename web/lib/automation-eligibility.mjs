// A score alone cannot establish mandatory eligibility. Each required condition
// needs a supporting excerpt from the applicant's confirmed facts.
export function verifiedEligibility(review, facts) {
 return Array.isArray(review?.requirements) && review.requirements.length > 0 &&
  review.requirements.every(item => item.status === 'confirmed' &&
   typeof item.evidence === 'string' && item.evidence.trim().length > 10 &&
   facts.includes(item.evidence));
}
