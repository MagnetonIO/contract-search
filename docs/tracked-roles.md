# Tracked roles and resume versions

| Family | Included title examples | Resume emphasis |
|---|---|---|
| CTO | CTO, Chief Technology Officer, Fractional CTO, Interim CTO | Technical leadership, architecture, governance, reliability, cost control |
| Lead Software Engineer | Lead Developer, Technical Lead, Staff or Principal Software Engineer | Hands-on architecture, implementation, code review, engineering standards |
| Software Engineering Manager | Engineering Manager, Software Development Manager, Head of Engineering | Technical direction, delivery practices, release governance, handoffs |
| Data Engineer | Senior/Lead Data Engineer, Data Platform Engineer, Databricks Engineer, Spark Engineer | Pipelines, streaming, data quality, SQL, Python, ML platforms |
| Full Stack Engineer | Full-Stack Developer, Fullstack Engineer, Product Engineer | Web applications, APIs, enterprise identity, end-to-end delivery |
| Forward Deployed Engineer | Forward-Deployed Software/AI/Data Engineer, Customer Solutions Engineer | Client implementations, integrations, operational workflows, deployment |

The catalog lives in `web/lib/role-catalog.json`. The opportunity filter lists these families with counts; Profile & resume lists title aliases and private PDF/DOCX downloads. Classification uses job titles, with specific families preceding broad lead titles. Other roles, including DevOps, remain visible and retain the default resume.

`scripts/sync_role_searches.py` synchronizes these search terms into the existing collector configuration. It preserves paid-run caps, total item limits, the daily/cycle budgets and existing DevOps searches. Broader coverage shares the existing fetch allowance. Search terms are configured for the next collection; changing configuration does not establish that a live source ran or returned matches. TechFetch remains subject to its existing access state. Wellfound and public feeds retain their supported broad categories.

Contract, remote, rate, location and application policies still determine pipeline placement and automatic eligibility. Tracking a leadership family does not make a permanent, on-site or incompatible job automatically eligible.

## Resume lifecycle

The local `resumes/` workspace contains unchanged PDF/DOCX sources, shared factual JSON, role overlays, a builder, readable Markdown and six PDF/DOCX pairs. It has a separate local Git repository with no remote and is excluded from the public app repository and deployment bundle.

After rebuilding, visually checking every page and validating the files, install the reviewed artifacts with `node --env-file=.env.local scripts/install_role_resumes.mjs`, using the existing private-store environment. No credential value belongs in the command or source files. Installation requires the reviewed source PDF to match the active base; it writes content-addressed files, verifies their hashes by reading them back, then publishes the private registry last.

At application time the worker selects the matching reviewed role version, verifies the file hash and pins it to the attempt. The employer-site library retains every known file hash, allowing the default and all role versions to coexist. Uploads occur only for a version not already registered at that site. A new base invalidates unrebuilt overlays. Unknown titles fall back to the approved default. Retries preserve the exact pinned document, and submitted/uncertain applications are never resubmitted to change a resume.
