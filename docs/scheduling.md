# Collection and daily email scheduling

GitHub Actions executes collection. Its scheduled triggers are best effort and remain a fallback. Vercel Cron independently dispatches the workflow at 8:07am Chicago and checks again through the morning. UTC slots cover daylight saving and standard time; the worker enforces Chicago weekdays and time boundaries.

The dispatcher requires production `COLLECTOR_GITHUB_TOKEN`: a fine-grained GitHub token restricted to `MagnetonIO/contract-search`, with Actions read/write. Run `python3 scripts/configure_scheduler.py` to validate it and install it through hidden input. Redeploy production after adding or rotating it. Do not use a broad personal token or paste a token into chat. Rotate before the token expires.

Checks cover the base job-board snapshot, active GitHub runs and a conditional five-minute dispatch reservation. Gmail imports cannot substitute for job scans. GitHub concurrency and the collector's durable Chicago-day guard prevent delayed scheduled runs from spending again. Dispatch uncertainty waits for the next watchdog; spending limits remain enforced.

Source coverage shows the last dispatcher check, runner heartbeat and last published scan. `configuration_required` means the dispatcher has not been activated. `dispatched` means GitHub accepted the request. `runner_active` means a run is queued or running. Only a new base snapshot proves publication.

The digest normally sends at 9:17am Chicago. If the job scan is missing, it waits for publication. Successful morning collection also attempts the same idempotent digest. A continuing delay produces a clearly labelled collection-delay email at the later backup. One recovery digest can follow fresh publication before 11am Chicago. Job scan and email-import timestamps are distinct. Provider acceptance does not establish inbox delivery.

GitHub email backups remain enabled. All triggers share a persisted identity and provider idempotency key. Unresolved delivery is never blindly replaced. Cron routes require `CRON_SECRET`.
