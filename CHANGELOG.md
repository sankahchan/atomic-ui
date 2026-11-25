# Changelog

## v1.2.23 - 2026-11-25

### Added

- Optional magic-link self-service for access keys, disabled by default behind the `magicLinkSelfServiceEnabled` setting. Admins can issue a single-use 30-minute link from the Share Page card.
- Magic links mint a key-scoped session accepted only by the Mini App self-service APIs; they never grant an admin session.

### Security

- Tokens travel in the URL fragment, consumption is rate limited and atomic single-use, and issue/consume actions are audited.

## v1.2.22 - 2026-11-25

### Added

- Dynamic key usage is now split across the servers of its active attached access keys, proportional to each server's in-cycle usage. Rounding preserves the exact dynamic total and falls back to the last resolved server when no per-server data is available.

## v1.2.21 - 2026-11-25

### Changed

- Access-key status labels in Telegram storefront and admin cards now use the shared localized vocabulary, including a trial-specific Active label.
- Both `/mykeys` empty states share one localized MarkdownV2-safe header while keeping their existing buttons and guidance.

## v1.2.20 - 2026-11-25

### Added

- Dynamic access key snapshots now record the last resolved server, and per-server analytics lists both access keys and dynamic keys as top consumers.
- Server detail pages render the per-server top-consumer list.

### Changed

- Consolidated 43 duplicated Telegram section dividers into a shared `TELEGRAM_DIVIDER` helper.

### Fixed

- Server bandwidth totals still count only access-key snapshots, so dynamic traffic is not double counted.

## v1.2.19 - 2026-11-24

### Added

- Admin direct-message flow now offers a localized card-style picker (plain, promo, premium, service) before composing the customer message.
- The selected style is stored on the flow, support note and audit record, and is applied to both text and media delivery.
- The shared announcement builder accepts a custom heading so admin messages keep their heading while still receiving the chosen style accent.

## v1.2.18 - 2026-11-24

### Added

- Telegram Mini App with `initData` authentication, short-lived session tokens, linked-key usage cards, self-service actions, one-tap buttons and localized dark/light themes.
- Support queue claim, assignment and SLA handling, plus a persistent `web_app` menu button.
- Self-hosted Unicode Myanmar font with `unicode-range` loading and a glyph-coverage regression guard.
- Telegram usage alerts (80%/90%), depleted-key notices, admin daily digest, and QR/client setup guides on share pages.
- Server selector with daily bandwidth chart, Mini App usage sparkline and self-extend/data requests, bulk key expire/sync/CSV import, and audit keyword/IP filters.

### Changed

- Unified Telegram bot cards with the Mini App: shared Mini App buttons, localized status labels and consistent compact layouts.
- Polished the audit summary and Access Keys header for dense desktop and mobile views.

### Fixed

- Ignored stale Telegram webhook delivery errors so old deploy-time 502s no longer trigger endless health alerts.
- Split AccessKey and DynamicAccessKey alert queries after a runtime field mismatch on production.
- Used configured key duration for Mini App self-extension instead of arbitrary fixed values.
- Replaced Chromium's English fallback for Myanmar dates with explicit localized month labels.

## v1.2.17 - 2026-11-23

### Added

- Reskinned the entire authenticated dashboard with PlopUI, including shared cards, buttons, inputs, tables, badges, charts, and page-level panels.
- Extended the PlopUI skin to Radix portaled surfaces so dialogs, confirmation dialogs, selects, dropdown menus, and sheets inherit the active dashboard theme instead of falling back to the old glass style.
- Added immediate server sync after creating an access key while keeping Auto Sync on its configured interval.
- Added first-use activation for `START_ON_FIRST_USE` keys: a 30-day key stays `PENDING` until real Outline traffic is observed, then becomes `ACTIVE` and starts its duration.
- Added lint and unit-test execution to CI alongside typecheck and build.

### Changed

- Reduced dashboard route prefetching and enabled gzip for proxied HTML, CSS, JavaScript, JSON, and SVG assets to improve first load and navigation speed.
- Optimized Access Keys scrolling by removing global smooth scrolling, unnecessary blur work, oversized transitions, sparkline refetch churn, and excessive live polling.
- Tuned phone and tablet views with denser tablet tables, larger touch targets, and stable mobile card scroll heights.
- Hardened sync handling by excluding empty draining/maintenance servers from `syncAll`, shortening Outline API timeouts, and guarding overlapping sync triggers.

### Fixed

- Restricted `settings.getAll` to admins and filtered authentication artifacts such as temporary login and WebAuthn challenge settings out of settings responses and updates.
- Enforced owner-or-admin access on access-key subscription URLs to prevent cross-user link disclosure.
- Enforced notification-manage scope on security settings procedures instead of relying on role alone.
- Fixed hydration mismatch in the PlopUI shell by mirroring the resolved theme only after mount.
- Stabilized timezone-dependent Telegram commerce tests by pinning them to UTC.

## v1.2.16 - 2026-06-14

### Changed

- Added an Atomic-UI-managed domain certificate renewal sync so direct VPS deploys install their own `atomic-ui-domain-cert-renew.timer` and reload nginx through a Certbot deploy hook when certificates change.

### Fixed

- Healed legacy Certbot renewal configs that still pointed the panel domain at `/var/www/html` even though nginx serves ACME challenges from `/var/www/letsencrypt`, preventing silent renewal failures on older installs.
- Restored the production `outlineadmin.com` HTTPS certificate after the stale renewal webroot mismatch left the site serving an expired certificate.

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
