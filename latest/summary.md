# Contract search — 2026-11-25

Mode: **daily**. New remote contracts: **32 / 50**. Secondary roles: **132**. Published project needs: **6**.
Raw rows: 1109; normalized relevant rows: 990; unique new relevant leads: 170; duplicates: 647; stale: 173; rejected: 119.

First-seen means new to this collector, not newly published. Unknown original dates stay unknown. The 7-day overlap includes weekend postings on Monday; missed runs longer than 7 days require backfill.

## Top 10 remote contracts

1. [Sr. EBS Architect and Engagement Lead](https://careers.viasat.com/jobs/7128) — Viasat, Inc.; {"@type": "MonetaryAmount", "currency": "USD", "value": {"@type": "QuantitativeValue", "value": 0, "minValue": 0, "maxValue": 0, "unitText": "YEAR"}}; 2 - remote contract; terms to verify; Employer ATS discovery. employer posting verified; agency status to confirm.
2. [Boomi Integration lead / Architect](https://www.linkedin.com/jobs/view/4494726538?pageNum=0&position=17) — Cbase Inc; unknown; 2 - remote contract; terms to verify; LinkedIn. unverified employer.
3. [Engineering Expert - Pod Lead](https://www.linkedin.com/jobs/view/4494774815?pageNum=0&position=5) — Turing; unknown; 2 - remote contract; terms to verify; LinkedIn. unverified employer.
4. [Federal IT Specialist (Security & Systems)](https://himalayas.app/companies/micro1/jobs/federal-it-specialist-security-systems) — micro1; $80 - $105/hr; 2 - remote contract; terms to verify; Himalayas. unverified employer.
5. [Forward Deployed Engineer](https://www.linkedin.com/jobs/view/4494387209?pageNum=0&position=4) — Highbrow Technology Inc; unknown; 2 - remote contract; terms to verify; LinkedIn. unverified employer.
6. [Informatica IICS Lead Data Engineer](https://www.linkedin.com/jobs/view/4493029522?pageNum=0&position=38) — Signature IT World Inc; unknown; 2 - remote contract; terms to verify; LinkedIn. unverified employer.
7. [Ivalua Solutions Architect](https://www.linkedin.com/jobs/view/4494752097?pageNum=0&position=2) — Experis; unknown; 2 - remote contract; terms to verify; LinkedIn. agency / client unverified.
8. [Lead/Senior Software Engineer](https://www.linkedin.com/jobs/view/4493030509?pageNum=0&position=33) — Horizontal Talent; $76 - $100 per hour; 2 - remote contract; terms to verify; LinkedIn. agency / client unverified.
9. [Mobile Platform Engineer/Architect](https://www.linkedin.com/jobs/view/4493021396?pageNum=0&position=21) — Zodiac Solutions, Inc; unknown; 2 - remote contract; terms to verify; LinkedIn. unverified employer.
10. [Observability Data Engineer](https://www.linkedin.com/jobs/view/4493662068?pageNum=0&position=22) — Blu Omega; unknown; 2 - remote contract; terms to verify; LinkedIn. unverified employer.

**Shortfall: 18.** Source failures, bounded search limits, stale postings, deduplication and relevance/contract filters constrain the count. Secondary roles and project notices do not fill the contract target. No inferred prospects are counted.

## Source coverage

| Source | Status | Raw rows | Detail |
|---|---|---:|---|
| LinkedIn | ok | 300 | Capped runs iWpK9dvP5i4Sdal3L; configured result ceiling reached; coverage is partial |
| Indeed | ok | 75 | Capped runs ib3vtkifa1yv5t7Kx; configured result ceiling reached; coverage is partial |
| Dice | not validated | 0 | Awaiting live validation |
| Employer ATS discovery | ok | 25 | Capped runs e4XnTWDyHHWbCSooq |
| Glassdoor | ok | 28 | Capped runs VNK8NcXvRpPVX3Exw, wFqLzhNPhG6NAZvTk, M5c1VUrujemxTfpHN |
| Wellfound | ok | 84 | Capped runs MBj5gXJaYI0Yfa0wH; configured result ceiling reached; coverage is partial |
| Built In | partial | 87 | Capped runs b2TjjnlzwIF6v7ybI; timed-out run retained completed dataset rows; search coverage is incomplete; configured result ceiling reached; coverage is partial |
| Staffing firm career feeds | ok | 40 | Capped runs uGGOPyTcEathB1jqy; provider ATS index; end client unverified; configured result ceiling reached; coverage is partial |
| JobServe US | ok | 41 | Capped runs 3vG4pfUjaKcpBdspf |
| Remotive | ok | 15 |  |
| We Work Remotely | ok | 25 |  |
| We Work Remotely DevOps | ok | 79 |  |
| US SAM.gov solicitations | ok | 11 | Bounded discovery: 3 title searches, up to 1000 results each; only active solicitations retained; 0 cached queries; 10 requests per rolling 24h; federal projects, not individual jobs |
| Myticas direct career feed | ok | 30 | Direct agency career feeds: Myticas Consulting; hiring client unverified |
| TechFetch | disabled | 0 | Public headless canary blocked by TechFetch security (HTTP 403); public-only adapter installed; awaiting permitted access |
| Direct employer boards (Ashby) | ok | 6 |  |
| Himalayas | ok | 119 |  |
| Jobicy | ok | 144 |  |

Daily paid-run allowance $6; configured daily caps $2.00; smoke cap $0.15 per source. Reservations include uncertain charges. Provider charge snapshots are in summary.json and can settle after completion. Actor caps are spending limits, not expected costs. No applications or outreach are sent.

Remotive listings are delayed by its public API. We Work Remotely and all other sources are credited with original posting links. Published procurement notices are separate buying opportunities; delivery and vendor eligibility must be checked.
