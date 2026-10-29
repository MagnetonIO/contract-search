# Automatic applications

The existing Contract Desk app has an authenticated Automatic applications view. Screening, browser work, private résumé versions, receipts and email outcomes use the existing private workspace. It starts paused and requires confirmed reusable applicant answers, a PDF résumé and a verified browser integration check before it can be enabled.

## Operation

- Browserbase owns the saved browser context; users enter logins and MFA in its private live view. Secrets are not supplied to the language model.
- AI SDK uses `openai/gpt-5.4-nano` for five-job screening batches and final factual checks, and `openai/gpt-5.4-mini` for bounded browser tool use.
- Workflow checkpoints batches and individual applications. A global lease serializes cycles. Each attempt and final submission intent is claimed with conditional writes. Browser steps never replay automatically after failure.
- Up to 20 attempts per Chicago weekday, 8am–6pm. First run attempts one application; subsequent runs allow five until five confirmed submissions, then twenty.
- The automation allowance is $50/calendar month, including a conservative $20 browser subscription reservation. Each screen reserves $0.05; each application reserves $2.50. Known usage settles reservations. Unknown provider charges retain their reservation. Resuming an exception reserves a new attempt allowance.
- Unknown rate and C2C are accepted. Explicit W2-only, incompatible location, low advertised hourly rates, prior submissions and persistent dispositions are excluded. Fit requires score 80, US-remote eligibility, mandatory requirements and résumé evidence.
- The collector exports `job-content.json` separately from the browser snapshot. Full descriptions stay private. Decisions are cached by content, facts, policy and disposition/stage.
- Résumé tailoring adds relevant verbatim highlights and preserves the master text and dates. Each attempt stores immutable PDF versions. Changed master PDFs require a matching canonical text source for tailoring; otherwise the approved PDF is used unchanged.
- Browser tools support labelled native forms on supported domains; unsupported controls, CAPTCHAs, new agreements and unknown required answers become exceptions. This is not a guarantee that every job board or ATS form can be completed.
- Every scored match receives an independent mandatory-requirement check before browser work. Required durations, residency and named tools need verbatim verified evidence. Resolved application URLs are claimed across records to prevent cross-board duplicate submissions.
- Vercel invokes `/api/cron/applications` hourly at minute 27 on weekdays; the engine enforces the Chicago work window and global lease. The dashboard shows the current run and saved results.
- Closed postings receive a persistent closed disposition. Confirmed submissions become Applied. Ambiguous submission results are never silently retried. Results appear in the next morning digest.

## Credentials and local use

`python3 scripts/configure_ai_gateway.py` validates a hidden key, writes it to the native credential store (service `contract-search`, account `AI_GATEWAY_API_KEY`) and installs the Vercel production secret. The hosted app can also authenticate through Vercel OIDC. No key is embedded in browser code or résumé files.

Start locally with `python3 scripts/run_dashboard.py`; it loads the AI key from the native vault into process memory. Add `--hosted-data` to use the existing private hosted workspace; the local username/password gate remains required. Next.js runs on Node 24. `npm --prefix web test`, `npm --prefix web run typecheck`, `npm --prefix web run build`, and `.venv/bin/python -m unittest discover -s tests -v` validate the app and collector. Python credential helpers use macOS Keychain, Windows Credential Manager, or Linux Secret Service/KWallet, and refuse plaintext vault backends.

The opt-in integration test uses real Browserbase and model calls with synthetic applicant data and an intercepted employer form: `LIVE_AUTOMATION_TEST=1 node --env-file=.env.local web/scripts/test-application-browser.mjs`. It never submits to an actual employer. The separate first real application remains a live canary and must produce an actual employer confirmation before being reported as submitted.
