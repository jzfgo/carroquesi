# ADR-018: Scheduled jobs run through a token-guarded endpoint

**Status:** Accepted
**Date:** 2026-11-04

## Context

The monthly spend report is the app's first scheduled job. Until now
everything time-based was evaluated at read time (a trip tears off when
someone next looks at it), so there was no scheduler.

The backend runs on Cloud Run, which scales to zero: no process is awake to
run a timer. A self-hosted deployment may be always on and have plain cron
instead. Either way, a trigger can fire twice, fail halfway, or fire again
on retry, and a report must never go out twice.

The month belongs to the list owner's calendar (ADR-012), but a scheduled
request has no `X-Client-Timezone` to read, and no table stored a zone.

## Decision

**One HTTP endpoint, any scheduler.** `POST /internal/reports/monthly` runs
the job. Cloud Scheduler calls it on Cloud Run; cron with `curl` calls it on
an always-on host. It is guarded by a shared secret in the `X-Trigger-Token`
header (`REPORT_TRIGGER_TOKEN`). An unset token turns the endpoint off with
a 404. It is kept out of the OpenAPI schema, because no app client calls it.

**The trigger may fire as often as it likes.** Daily is the intended
cadence. Each list's period is "last month" in its owner's zone, worked out
at run time, so owners in different zones each get theirs on the first
trigger after their own month ends.

**A `report_runs` row per (list, period) makes repeats safe.** A run claims
its row before it sends: an insert for a new period, a conditional update to
take back a `failed` one. Both are atomic, so of two racing triggers only one
sends. Statuses are `running`, `sent` and `failed`.

- `failed` is retried by the next trigger.
- `running` is never retried automatically. The process may have sent the
  email before it died, and sending twice is the worse mistake. A row still
  `running` an hour after it started (Cloud Run's request limit) comes back
  in the response's `stuck` list and is logged at ERROR. A person checks it
  and sets it to `failed` to retry.
- While a deployment cannot send email (no SMTP host, sender or
  `EMAIL_TOKEN_SECRET`), the trigger claims nothing, so the month that is
  pending when email is set up is still sent.

**The owner's zone is the one their browser last declared.** Authentication
stores `X-Client-Timezone` in `users.timezone` when it changes. An owner never
seen with a valid zone falls back to `REPORT_DEFAULT_TIMEZONE`, then UTC.

**Who gets a report is a feature flag on the owner** (`monthly_report`, off by
default), until the email's final design ships. An owner who followed the
unsubscribe link for a list is skipped before anything is claimed.

## Alternatives considered

- **Cloud Scheduler OIDC tokens** instead of a shared secret. Stronger on
  GCP, but cron on a self-hosted box has no identity provider. One mechanism
  for both wins.
- **An in-process scheduler** (APScheduler and the like). It does not run on
  scale-to-zero Cloud Run, and several instances would each fire it.
- **A timezone setting in the UI.** More precise for travellers, but it needs
  a design and a screen. The last declared zone is right for nearly everyone.
- **Retrying `running` rows after a timeout.** Automatic, but it can send a
  report twice. Silence is avoided by reporting stuck rows instead.

## Consequences

- Deployments that want reports set `REPORT_TRIGGER_TOKEN` and create a
  scheduler job that POSTs to the endpoint with that header.
- Only last month is ever sent. If the trigger is down for more than a
  whole month, the month it missed is never sent. A daily trigger makes that
  unlikely, and catching up would only send old news.
- A report for a month that has passed is never recomputed or resent. Late
  receipts still change what the app shows for that month (the engine reads
  live), just not the email already sent.
- The next scheduled job can reuse the same router and the same ledger
  pattern.
