# Changelog

## v1.2.15 - 2026-05-09

### Changed

- Updated the Telegram user command surface to the current production set: `/start`, `/buy`, `/mykeys`, `/renew`, `/status`, `/switchserver`, `/setup`, `/referral`, `/support`, `/help`, and `/cancel`.
- Added focused Telegram user screens for quick status, setup entry, referral sharing, direct support contact, and help/FAQ while keeping the paid storefront, trial, key detail, and setup-guide flows intact.
- Compacted the Telegram admin support queue summary/detail copy and action labels so support handling stays faster on mobile.

### Fixed

- Synced the Telegram Bot API command menu and smoke script with the new user command set so removed legacy commands are no longer advertised or probed.
- Preserved compatibility for existing referral codes while supporting the new `ref_{telegram_user_id}` referral link format.

## v1.2.14 - 2026-05-08

### Changed

- Refined Telegram paid and trial key delivery screens so `Order Confirmed` and `Trial Activated` now surface the setup guide immediately, include direct Android/iOS/Windows/macOS shortcuts, and keep support and menu actions visible.
- Expanded the Telegram setup guide into richer per-platform screens with download links for Outline, Hiddify, and power-user clients, plus a clearer platform-select handoff and back path.

### Fixed

- Fixed `key_page_{key_id}` so Telegram now re-renders the correct paid or trial screen when users return from the setup guide flow instead of always falling back to the paid confirmation layout.
- Verified the deployed setup-guide callbacks, platform redirects, and post-restart production logs after shipping the Telegram setup-guide refresh.

## v1.2.13 - 2026-05-01

### Changed

- Compacted Telegram `/help` for both customer and admin chats so the command guide stays mobile-friendly and points users toward the reply keyboard instead of a long command wall.
- Hardened the generated `atomic-ui.service` unit with a shorter stop timeout and mixed kill mode so direct VPS deploys stop the old process cleanly instead of hanging on long shutdowns.

### Fixed

- Restricted Telegram admin server-health notices to real availability changes only, so admins now receive `DOWN` and recovery `UP` alerts without the earlier slow-latency noise.
- Revalidated the production `Malaysia`, `SG`, and `SG-2` server fleet after the Telegram alert cleanup and service-stop hardening release work.

## v1.2.12 - 2026-04-30

### Fixed

- Suppressed Telegram admin `Server slow` alerts for isolated one-sample latency spikes so the bot now waits for a short sustained slow streak before notifying.
- Aligned Telegram slow-alert behavior with the web panel’s live health view, which already reflected the latest recovered latency instead of older transient spikes.

## v1.2.11 - 2026-04-30

### Changed

- Raised the direct-deploy runtime baseline to Node.js 24 across the installer, VPS deploy script, CI, Docker, and local development metadata so fresh installs and existing hosts converge on one supported runtime.
- Batched safe maintenance dependency updates for `autoprefixer`, `react-hook-form`, `nodemailer`, `@types/nodemailer`, `geoip-lite`, and `zustand`.

### Fixed

- Fixed the remaining production/runtime mismatch where direct VPS hosts could stay on Node 20 even though the dependency set had already advanced to packages expecting Node 24.
- Hardened the Playwright admin smoke test around access-key creation so the release line does not fail on a brittle dialog-text assertion.

## v1.2.10 - 2026-04-29

### Changed

- Polished Telegram customer support and premium reply-thread flows so draft, sent, reopen, and follow-up messages read more cleanly on mobile.
- Normalized customer reply-state labels across support and premium detail cards with clearer `Reply`, `Last reply`, and `Admin reviewing` wording.

### Fixed

- Fixed premium pending-review support threads showing contradictory reply badges such as `Waiting for you` while the request was still under admin review.
- Revalidated the deployed production Telegram webhook, support-thread detail card, and premium pending-review status wording after shipping the reply-thread polish.

## v1.2.9 - 2026-04-29

### Changed

- Compacted Telegram `/support` into a cleaner support hub with shorter recent-thread and premium-request cards, keeping help actions visible on mobile.
- Polished Telegram customer `/inbox`, `/premium`, and `/premiumregion` so titles, counters, region snapshots, and detail actions read more cleanly in phone-sized chats.

### Fixed

- Fixed lingering awkward inbox and premium wording such as generic `announcement(s)`, `support update(s)`, and `key(s) / request(s)` counters in customer-facing Telegram screens.
- Revalidated the deployed production Telegram webhook with live `/inbox`, `/premium`, and `/premiumregion` smoke coverage after shipping the customer-card refresh.

## v1.2.8 - 2026-04-26

### Changed

- Compacted Telegram customer `/order` detail cards so payment, review, and note context stay readable on mobile without pushing action buttons out of view.
- Compacted Telegram support-thread detail cards into snapshot-first views with a shorter latest-reply block and button-first follow-up actions.

### Fixed

- Fixed Telegram customer detail screens that were still noticeably denser than the newer summary-first commerce flows, especially `/order` and `/supportstatus` thread detail.
- Rechecked the deployed production webhook path with live `/order` and `/supportstatus` detail probes after shipping the compact customer card updates.

## v1.2.7 - 2026-04-26

### Changed

- Added Telegram admin queue detail drill-down cards for review, refund, support-thread, and premium support flows so admins can inspect context without reopening long message dumps.
- Hardened the stale-tab deploy guard so same-origin POST actions carry an immutable client-build marker even after the shared build cookie refreshes.

### Fixed

- Fixed the intermittent `Failed to find Server Action "x"` production error burst that could happen when an older dashboard tab submitted actions after a newer deploy.
- Rechecked live production Telegram admin callbacks, dashboard deploy health, and post-deploy runtime logs after shipping the admin drill-down and stale-tab guard changes.

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
