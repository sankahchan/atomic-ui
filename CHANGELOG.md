# Changelog

## v1.2.6 - 2026-04-25

### Changed

- Polished Telegram admin queue cards so renewal review items hide raw key IDs and stay action-first on mobile.
- Localized Myanmar admin queue/detail labels across review, premium support, and refund flows.

### Fixed

- Fixed remaining English fallback labels in Myanmar admin keyboards, including duplicate-proof, blurry-proof, amount, navigation, panel, refresh, and admin-home actions.
- Verified production Telegram smoke coverage with Myanmar admin locale after deployment.

## v1.2.5 - 2026-04-25

### Changed

- Simplified Telegram `/orders` and `/renew` entry screens so buttons show the next user action clearly on mobile.
- Simplified Telegram `/admin` into a compact summary-first admin home with button-first queue navigation.

### Fixed

- Fixed Premium support queue navigation so “Next needing action” opens the support admin queue instead of the order review queue.
- Verified the deployed Telegram webhook, admin commands, and post-deploy logs after the Telegram UX rollout.

## v1.2.4 - 2026-04-25

### Changed

- Simplified Telegram admin queues for review, support, refunds, and finance so admin commands stay summary-first and button-first on mobile.
- Added live Telegram smoke coverage for `/supportthreads` and `/refunds` so admin refund/support surfaces are checked during deploy QA.

### Fixed

- Fixed admin refund queue button coverage with a safe production QA path that verifies claim callbacks without touching real customer data.
- Confirmed deployed Telegram admin commands and post-deploy logs are clean after the admin UX rollout.

## v1.2.3 - 2026-04-23

### Changed

- Upgraded Next.js, `eslint-config-next`, `node-cron`, `nodemailer`, and `systeminformation` to patched versions while keeping the VPS lockfile install flow deterministic.
- Replaced the abandoned DigitalOcean SDK dependency with a small typed API client for provisioning calls.

### Fixed

- Cleared the current `npm audit` vulnerability report, including the transitive `request`/`form-data` chain previously pulled in by the DigitalOcean SDK.

## v1.2.2 - 2026-04-23

### Changed

- Expanded live Telegram smoke coverage for the summary-first commerce commands: `/buy`, `/renew`, `/premiumregion`, and `/supportstatus`.
- Changed VPS install, update, and deploy paths to prefer `npm ci --include=dev` so the committed lockfile is preserved during normal operations.

### Fixed

- Fixed recurring package-lock drift caused by installer and deploy scripts deleting `package-lock.json` and running plain `npm install`.

## v1.2.1 - 2026-04-23

### Fixed

- Fixed standalone VPS deployments so `npm run build:low-memory` publishes the matching `.next/static` assets into `.next/standalone` by default.
- Fixed systemd service sync to fail fast when the standalone server or static asset bundle is missing, preventing production from serving unstyled HTML after deploys.

## v1.2.0 - 2026-04-22

### Added

- Added Postgres-first fresh VPS bootstrap and portable `.postgres.zip` backup bundles with dashboard upload, verification, and restore support.
- Added cross-server recovery runbooks, fixed panel-path install support, and IPv4-friendly raw-IP access handling for new servers.
- Added a summary-first Telegram UX refresh across buy, renew, keys, premium, inbox, support, orders, refunds, and the main admin queue surfaces in both English and Myanmar.

### Changed

- Changed backup restore handling so portable Postgres bundles carry the secret metadata needed for cross-server recovery.
- Changed database-backed provider, webhook, and Telegram secrets to dedicated at-rest encryption with `SETTINGS_ENCRYPTION_KEY`.
- Changed Telegram regression coverage to enforce message-size and keyboard-layout budgets during smoke and unit validation.

### Fixed

- Fixed fresh VPS bootstrap ordering, Prisma prompt hangs, raw-IP panel URL selection, and the benign Next compiler `SIGTERM` build noise.
- Fixed cross-server restore verification noise, duplicate backup verification failures, and restore readiness reporting on Postgres targets.
- Fixed Telegram smoke/runtime secret handling so encrypted settings, webhook secret enforcement, and live support/order flows continue to work after deploys and restores.

## v1.1.0 - 2026-04-15

### Added

- Added broader frosted workspace polish across detail pages, dialogs, and create flows.
- Added stronger smoke and visual coverage for the updated dashboard workspaces.

### Changed

- Updated restore operations to run offline only from the CLI restore path.
- Updated operator documentation for restore handling, Telegram webhook secret enforcement, and fresh VPS bootstrap behavior.

### Fixed

- Fixed Telegram webhook setup and inbound secret validation behavior.
- Fixed owner-only enforcement for subscription settings and restore-related admin controls.
- Fixed fresh VPS bootstrap to use the non-interactive Prisma safety wrapper instead of hanging on a confirmation prompt.
