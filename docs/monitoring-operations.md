# Monitoring Operations

Use this page when you need a single operator view for backup verification, Telegram webhook health, and admin queue aging.

## Where to find it

Open:

- `Tools -> Monitoring`
- direct route: `/dashboard/monitoring`

The page is read-only for live state until you change the threshold form or run one of the manual checks.

## What each card means

### Backup Verification

Shows whether recent dashboard backups are still passing restore pre-checks.

Use it to answer:

- is the current backup baseline restore-ready
- how many recent verification records failed
- when the last verification alert was sent

`Run verify now` triggers the same backup verification job used by the scheduler.

### Telegram Webhook

Shows whether the live Telegram webhook still matches the expected app URL and whether Telegram is reporting delivery trouble or a large pending-update backlog.

Use it to answer:

- is the webhook registered on the correct URL
- is Telegram reporting a recent webhook error
- are updates backing up faster than operators should allow

`Run webhook check` triggers the same webhook health monitor used by the scheduler.

### Admin Queue

Shows overdue support threads plus aged order reviews.

Use it to answer:

- whether support threads are already past their first-response SLA
- whether payment/review work is aging beyond the current review threshold
- whether the queue alert has already fired for the current backlog fingerprint

`Run queue check` triggers the same queue-aging monitor used by the scheduler.

## Threshold settings

The form at the bottom controls when Telegram alert jobs page operators:

- `Backup cooldown (hours)`: minimum time between repeated backup-failure alerts for the same failing backup fingerprint
- `Webhook cooldown (minutes)`: minimum time between repeated alerts for the same current webhook issue
- `Webhook backlog threshold`: pending Telegram updates that count as unhealthy backlog
- `Queue cooldown (hours)`: minimum time between repeated alerts for the same support/review backlog fingerprint
- `Review age threshold (hours)`: age at which pending review work is considered overdue

These values are whole numbers only.

## Recommended operator flow

1. Open `Tools -> Monitoring`.
2. Check whether any card is in `Issue detected` or `Attention needed`.
3. If backup health is bad, open `Settings -> Backup & Restore` and inspect the newest failed verification record.
4. If Telegram webhook health is bad, open `Settings -> Notifications`, confirm the webhook URL, then reset the webhook only on the real live server.
5. If admin queue health is bad, open the support queue or review queue and clear the overdue work.
6. Use the `Run ... now` button after corrective action to confirm the page returns to healthy state.

## Important notes

- A warning on `Admin Queue` may be real business data, not a system fault.
- Do not reset the Telegram webhook from a test or restored standby server unless you are intentionally promoting that server to become live.
- This page reads scheduler state, but the scheduler jobs still remain the source of truth for cadence and run history.
