# Atomic-UI

Advanced Outline VPN control center built with Next.js 14, TypeScript, Prisma, and tRPC.

Atomic-UI combines:
- multi-server Outline operations
- access-key and dynamic-key lifecycle management
- Telegram storefront, support, and admin operations
- customer CRM, finance, and announcement tooling
- direct VPS install/deploy flows for low-memory hosts

![Atomic-UI Screenshot](https://github.com/user-attachments/assets/e3a543e6-165f-472b-a46b-462a15c96ed0)

## What Atomic-UI Does

### Control center
- Multi-server Outline management with health, latency, lifecycle, and outage tools
- Normal access keys and dynamic keys with quotas, expirations, templates, bulk actions, and QR/share delivery
- Server lifecycle controls including draining, maintenance, and manual-vs-auto assignment behavior

### Telegram product surface
- Customer commands for `/start`, `/buy`, `/renew`, `/mykeys`, `/orders`, `/inbox`, `/offers`, `/support`, `/premium`, and `/premiumregion`
- Admin commands and button-driven flows for announcements, finance, refunds, review queues, support queues, and key management
- Telegram-based creation and management of both normal keys and dynamic keys
- Branded QR codes, receipt cards, promo cards, payment guides, and proof examples

### Customer operations
- Customer CRM with keys, orders, refunds, announcements, outage notices, server-change history, and Telegram support-thread history
- Dedicated support center with queue filtering, ownership, SLA visibility, and thread pages
- Customer communication center with direct Telegram sends, templates, and delivery history

### Notifications and growth
- Channel-based notifications with delivery history and retry visibility
- Telegram announcement editor with audience targeting, branded cards, scheduling, recurrence, preview-to-self, and analytics
- Coupon campaigns, offer wallet, attribution, conversion analytics, and retention flows

### Security and access control
- Admin scopes: `OWNER`, `ADMIN`, `FINANCE`, `SUPPORT`
- Session auth, 2FA, recovery codes, and WebAuthn passkeys
- Dashboard access rules by IP/CIDR/country
- Backup and restore flows with smoke validation

## Quick Start

### Local development

```bash
git clone https://github.com/sankahchan/atomic-ui.git
cd atomic-ui
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run dev
```

Open `http://localhost:3000`.

### Docker

```bash
git clone https://github.com/sankahchan/atomic-ui.git
cd atomic-ui
cp .env.example .env
docker-compose up -d --build
```

### One-command install on a VPS

```bash
wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh | sudo bash
```

Fresh VPS installs now default to a local Postgres runtime so production `.postgres.zip` backup bundles can be restored onto replacement servers without an extra database conversion step.

The installer now prefers HTTPS by default. If HTTPS setup fails, it falls back to HTTP and prints the next steps.

Useful install-time overrides:

```bash
sudo env ACME_EMAIL=you@example.com bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
sudo env INSTALL_HTTPS=false bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
sudo env INSTALL_HTTPS=require ACME_EMAIL=you@example.com bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
sudo env PANEL_DOMAIN=admin.example.com PUBLIC_SHARE_DOMAIN=share.example.com ACME_EMAIL=you@example.com bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
sudo env INSTALL_PANEL_PATH=control-center bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
sudo env INSTALL_DATABASE_ENGINE=sqlite bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
```

### Fresh VPS bootstrap from your workstation

For a brand-new VPS, use the remote bootstrap wrapper instead of hand-running the install path:

```bash
BOOTSTRAP_HOST=your-server-ip \
BOOTSTRAP_PASSWORD=your-password \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='change-this-now' \
bash scripts/bootstrap-vps.sh
```

See [docs/fresh-vps-bootstrap.md](docs/fresh-vps-bootstrap.md) for domain/HTTPS examples and the full checklist.

If the new server needs to become a restored copy of an existing production server, follow [docs/new-server-from-production-backup.md](docs/new-server-from-production-backup.md) after bootstrap.
Fresh VPS bootstrap now defaults to Postgres too. If you intentionally want SQLite instead, set `BOOTSTRAP_DATABASE_ENGINE=sqlite`.
If you want a predictable first-login path instead of a generated random one, set `BOOTSTRAP_PANEL_PATH=control-center` or `INSTALL_PANEL_PATH=control-center`.

## Production Workflow

### Validate, typecheck, build

Use these as the primary repo checks:

```bash
npm run env:check -- --env-file=.env
npm run typecheck
npm run build
```

`npm run typecheck` is the canonical source-only TypeScript pass for this repo.

### Smoke tests

```bash
npm run smoke -- --base-url=http://127.0.0.1:2053 --email=admin --password=admin123
npm run smoke:telegram
```

### Operator notes

- SQLite restore runs offline only. Stop `atomic-ui.service`, then run `npm run restore:sqlite -- --backup /absolute/path/to/backup.zip`.
- Dashboard backup creation follows the active runtime: SQLite creates `.db` file-copy backups, and Postgres creates portable `.postgres.zip` bundles containing `backup.dump` plus restore encryption metadata. Raw `.dump` and `.sql` restores remain supported for older backups.
- Postgres backup creation, verification, and restore require the PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) on the host. On Debian/Ubuntu installs, use `apt-get install -y postgresql-client`.
- Runtime types must match the backup: SQLite backups restore onto SQLite runtimes, and Postgres `.postgres.zip`, `.dump`, or `.sql` backups restore onto servers configured with a PostgreSQL `DATABASE_URL`.
- Telegram webhook set/reset in the dashboard registers a secret token with Telegram. Incoming webhook calls without a matching `x-telegram-bot-api-secret-token` header are rejected with `401`. Set `TELEGRAM_WEBHOOK_SECRET` only if you need to override the derived default.
- Subscription branding no longer supports custom CSS. Legacy `subscriptionCustomCss` values are ignored and cleared on save.

### Low-memory VPS deploy

```bash
DEPLOY_HOST=your-server-ip \
DEPLOY_PASSWORD=your-password \
bash scripts/deploy-vps.sh
```

For direct VPS deployment details, see [DEPLOY.md](DEPLOY.md).

## Releases

This repository now uses semver-style Git tags:
- `v1.0.0` first stable release
- `v1.1.0` feature release
- `v1.1.1` bug-fix release
- `v2.0.0` breaking release

### Recommended release flow

Use `npm version` so `package.json` and `package-lock.json` stay aligned with the tag:

```bash
npm version patch   # or minor / major
git push origin main --follow-tags
```

When a tag like `v1.1.0` is pushed:
- [`.github/workflows/release.yml`](.github/workflows/release.yml) publishes a GitHub release
- [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) publishes container images

If you need to publish an existing tag manually, run the `Publish GitHub Release` workflow from GitHub Actions and supply the tag.

## Core Environment Variables

Set these in `.env` before production use:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | SQLite DSN such as `file:./data/atomic-ui.db` or a Postgres DSN such as `postgresql://user:pass@host:5432/atomic_ui` |
| `JWT_SECRET` | Yes | Session signing secret |
| `TOTP_ENCRYPTION_KEY` | Yes | Encrypts 2FA/TOTP secrets; generate with `openssl rand -hex 32` |
| `SETTINGS_ENCRYPTION_KEY` | Yes | Encrypts provider tokens, webhook secrets, and other database-backed setting secrets; generate with `openssl rand -hex 32` |
| `CRON_SECRET` | Strongly recommended | Protects scheduled task endpoints |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical admin/app URL |
| `APP_URL` | Recommended | Server-side admin/app base URL |
| `PUBLIC_SHARE_URL` | Optional | Canonical public share host |
| `NEXT_PUBLIC_PUBLIC_SHARE_URL` | Optional | Client-side mirror of `PUBLIC_SHARE_URL` |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token |
| `SMTP_HOST` | Optional | SMTP host for email channels |
| `SMTP_PORT` | Optional | SMTP port |
| `SMTP_USER` | Optional | SMTP username |
| `SMTP_PASS` | Optional | SMTP password |
| `SMTP_FROM` | Optional | Sender address for email delivery |
| `DIGITALOCEAN_ACCESS_TOKEN` | Optional | Enables DO provisioning from the UI when no token is saved in settings |
| `LOG_LEVEL` | Optional | `debug`, `info`, `warn`, `error` |
| `LOG_VERBOSE_SCOPES` | Optional | Temporary verbose scopes such as `sync,trpc` |

See [DEPLOY.md](DEPLOY.md) for production examples and HTTPS notes.

## Useful Commands

```bash
npm run dev
npm run build
npm run build:low-memory
npm run start
npm run lint
npm run typecheck
npm run test
npm run env:check -- --env-file=.env
npm run smoke -- --base-url=http://127.0.0.1:2053 --email=admin --password=admin123
npm run smoke:telegram
npm run deploy:vps
npm run bootstrap:vps
npm run db:generate
npm run db:push
npm run restore:sqlite -- --backup /absolute/path/to/backup.zip
npm run db:migrate
npm run db:cutover:report
npm run db:cutover:preflight -- TARGET_DATABASE_URL=postgresql://...
npm run db:cutover:export
npm run db:cutover:import -- --dir=storage/cutover/<export-dir>
npm run db:cutover:verify -- --dir=storage/cutover/<export-dir>
npm run db:studio
```

`db:cutover:report` prints the current database engine, data counts, and production warnings. `db:cutover:preflight` validates a planned SQLite-to-Postgres cutover before you switch production. `db:cutover:export`, `db:cutover:import`, and `db:cutover:verify` are the supported SQLite-to-Postgres data move path.

## Documentation

- [DEPLOY.md](DEPLOY.md): Docker and direct VPS deployment
- [docs/postgres-cutover.md](docs/postgres-cutover.md): SQLite to Postgres cutover runbook
- [docs/fresh-vps-bootstrap.md](docs/fresh-vps-bootstrap.md): first-time VPS bootstrap
- [docs/new-server-from-production-backup.md](docs/new-server-from-production-backup.md): recovery server from a production backup
- [docs/worker-setup.md](docs/worker-setup.md): usage snapshot worker setup

## Project Structure

```text
atomic-ui/
├── prisma/
├── scripts/
├── docs/
├── src/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── server/
│   │   └── routers/
│   └── types/
├── public/
├── .github/workflows/
├── docker-compose.yml
└── Dockerfile
```

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Prisma + SQLite/Postgres
- tRPC + React Query
- Tailwind CSS + shadcn/ui
- Recharts
- Telegram Bot API

## License

MIT. See [LICENSE](LICENSE).
