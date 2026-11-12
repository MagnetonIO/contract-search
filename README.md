# Contract Desk

Contract Desk discovers contract and consulting opportunities, matches them to an applicant profile, and manages browser-assisted job applications. It combines a Python collection pipeline with an authenticated Next.js dashboard and hosted application workers.

## Features

- Search and review opportunities by source, role, location, rate, and fit.
- Track CTO, Lead Software Engineer, Engineering Manager, Data Engineer, Full Stack Engineer, and Forward Deployed Engineer roles.
- Select reviewed role-specific résumés, reuse approved saved files, and record which version each application used.
- Fill application forms through Playwright, with language models interpreting questions and unfamiliar controls.
- Retain application outcomes, screenshots where appropriate, and submission receipts.
- Send opportunity digests and daily application reports.

A job is counted as submitted only after a target-site confirmation or verified employer receipt. Failed, skipped, closed, and unconfirmed attempts are recorded separately. Browser automation is subject to site changes, login requirements, and security checks; support does not guarantee completion of every application.

## Architecture

| Component | Responsibility |
| --- | --- |
| Python collectors | Collect, normalize, deduplicate, and export opportunities |
| Next.js and React | Authenticated opportunity, profile, application, and reporting dashboard |
| Vercel Workflows | Durable application orchestration and continuation |
| Browserbase | Hosted browser sessions and persistent login contexts |
| Playwright | Form inspection, field entry, résumé uploads, navigation, and confirmation checks |
| Vercel AI Gateway and AI SDK | Model calls for fit assessment, question interpretation, visual assistance, and final review |
| Vercel Blob | Private hosted state, résumé artifacts, and application evidence |
| Resend | Email digests, reports, and exceptional-action notifications |
| Gmail OAuth | Optional read-only access for supported application-verification messages |

The application worker creates a Browserbase session, connects Playwright to its remote browser, and combines ordinary form actions with model assistance. Vercel runs the hosted workflow independently of a local computer. Local development uses filesystem storage by default.

## Local setup

Use Python 3.12 or later and Node.js 24. Run these commands from the repository root:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm --prefix web ci
python scripts/run_dashboard.py
```

Open <http://127.0.0.1:3100> and create the local dashboard account when prompted. On Windows, activate the environment with `.venv\Scripts\Activate.ps1` in PowerShell.

The launcher reads supported credentials from the native OS credential store and the ignored root `.env.local` file. Starting the dashboard alone does not configure external services or prove that an application can be submitted.

To start Next.js directly with an already configured environment:

```sh
npm --prefix web run dev
```

## Collection

Searches and source allocations are configured in `config.json`; applicant qualifications are configured in `qualifications.json`.

```sh
# Collect from configured public feeds without paid actors.
python runner.py --mode public

# Inspect collection options before starting a paid collection.
python runner.py --help
```

Paid actor sources require their configured credentials and retain their own collection allowances. To export existing collector data for the local dashboard, inspect and use the export helper:

```sh
python scripts/export_dashboard.py --help
```

Collection produces opportunities; it does not submit applications. Application automation is enabled separately through the dashboard after the applicant profile, approved résumé, and browser integration are ready.

## Configuration

Keep credentials in the deployment environment or a supported local credential store. Never commit keys, OAuth tokens, browser login data, or applicant documents.

| Setting | Purpose |
| --- | --- |
| `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | Hosted application and sign-in browsers |
| `AI_GATEWAY_API_KEY` | Local Gateway authentication; hosted requests prefer project-scoped Vercel OIDC |
| `BLOB_READ_WRITE_TOKEN` | Access to the configured private Blob store when token authentication is used |
| `DASHBOARD_AUTH_CONFIG` | Hosted login configuration containing the username, password hash, and session secret |
| `DASHBOARD_STORAGE=blob` | Opt a local process into hosted storage; Vercel uses Blob automatically |
| `DASHBOARD_LOCAL_DIR` | Override the local state directory, normally `web/.local/` when running from `web/` |
| `RESEND_API_KEY` | Email delivery |
| `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `GMAIL_TOKEN_ENCRYPTION_KEY` | Optional Gmail verification integration, including encrypted credential storage |

Gmail requires completed OAuth consent in addition to environment configuration. Read-only mailbox access is broader than the verification queries used by the application.

The helpers in `scripts/` configure collector, email, AI Gateway, and scheduler credentials. Review their options before running them: some also update GitHub or Vercel configuration. `python scripts/run_dashboard.py --hosted-data` connects local development to the existing hosted workspace and can affect its real application state.

## Automation and reporting

- Scheduled applications run in the America/Chicago work window: Monday–Thursday, 8:30 AM–6 PM; Friday, 8:30 AM–3 PM. Scheduled applications do not run on weekends. Manual starts have a separate bounded window.
- Eligibility, source capacity, and daily limits are controlled by persisted automation settings; only confirmed submissions consume the successful-application quota.
- Routine answers use the saved profile and résumé. Unsupported controls, unresolved factual answers, and security checks retain explicit outcomes instead of being reported as success.
- Submission intent is recorded before the final click. Uncertain submissions require reconciliation before another attempt to avoid duplicates.
- Gateway-reported model costs, browser estimates, and internal reservations are distinct. Reservations are not provider charges, and Gateway credit can be shared at the Vercel team level.
- Daily reports list confirmed applications and other outcomes by source. A source is where the job was found; the application destination may be a different site.

See [Automatic applications](docs/automatic-applications.md), [Scheduling](docs/scheduling.md), and [Tracked roles](docs/tracked-roles.md) for implementation and operating details. Persisted settings and provider records determine current limits and usage; historical examples in the detailed guides may differ.

## Résumé workspace

`resumes/` is intentionally ignored by the public application repository. It is a separate local Git workspace containing source documents, factual data, role overlays, builders, and generated artifacts. Its commits are not pushed by `git push` from this repository.

Reviewed application documents are installed into the private hosted store; the worker pins the selected file and hash to each attempt. Do not remove the ignore rule to publish personal documents. See the [résumé lifecycle](docs/tracked-roles.md#resume-lifecycle) for the installation workflow.

## Checks

```sh
python -m unittest discover -s tests -v
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run build
```

GitHub Actions runs collector and dashboard checks across Linux, macOS, and Windows. Paid browser/model integration checks are opt-in and described in [Automatic applications](docs/automatic-applications.md#credentials-and-local-use). A passing synthetic check is separate from a real employer submission receipt.

## Deployment

Deploy the `web/` application to Vercel with Node.js 24, a private Blob store, authentication, and the required provider credentials. `web/vercel.json` defines cron triggers; application code enforces the Chicago work window. The Workflow integration is configured in `web/next.config.ts`.

Use the current Vercel CLI for deployment management (`npm i -g vercel@latest`). Workflows are tied to the deployment that starts them, so verify the actual run deployment when validating a repair.

## Repository layout

```text
runner.py                 Collection entry point
collectors.py             Collection adapters and source coverage
public_jobs.py            Public opportunity feeds
config.json               Search and collection configuration
qualifications.json       Applicant qualification configuration
scripts/                  Setup, export, and résumé-install helpers
tests/                    Python collector tests
docs/                     Operating and role documentation
web/app/                  Dashboard pages and API routes
web/lib/                  Application, browser, storage, and reporting logic
web/workflows/            Durable workflow definitions
web/tests/                Dashboard and automation tests
resumes/                  Ignored local résumé workspace
```
