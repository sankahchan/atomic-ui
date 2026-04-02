# Atomic-UI

Advanced Outline VPN management panel built with Next.js 14, TypeScript, Prisma, and tRPC.

![Atomic-UI Screenshot](https://github.com/user-attachments/assets/e3a543e6-165f-472b-a46b-462a15c96ed0)

## Features

### Server management
- Multi-server Outline support from a single dashboard
- Server sync and health checks (latency, uptime, status)
- DigitalOcean-based server provisioning flow
- Security probe dashboard (TLS/certificate visibility)

### Access key management
- Full CRUD for access keys and dynamic access keys
- Key templates and bulk actions (extend, enable/disable, tag, archive, delete)
- Data limits and reset strategies (daily/weekly/monthly/never)
- Expiration modes (never/fixed/duration/from first use)
- Subscription links and QR generation

### Portal and self-service
- Dedicated `/portal` experience for non-admin users
- Dynamic subscription endpoint support (`/api/sub/:token`, `/api/subscription/:token`)
- Live usage/device visibility

### Security and auth
- Roles: `ADMIN` and non-admin user roles (`USER` / `CLIENT`)
- Session cookie auth with DB-backed session revocation
- 2FA support: TOTP, recovery codes, and WebAuthn passkeys
- Dashboard access rules (IP/CIDR/Country)

### Integrations
- Telegram notification + command integration
- Backup/restore flows (admin-protected)
- CSV/JSON export (admin-protected)

## Quick start

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

### One-command install (VPS)

```bash
wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh | sudo bash
```

The installer now tries to enable HTTPS by default on the server IP using nginx plus a Let's Encrypt IP certificate. If HTTPS setup fails, it falls back to HTTP on port `80` and tells you how to enable HTTPS later.

Useful install-time overrides:

```bash
sudo env ACME_EMAIL=you@example.com bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
sudo env INSTALL_HTTPS=false bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
sudo env INSTALL_HTTPS=require ACME_EMAIL=you@example.com bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
sudo env PANEL_DOMAIN=admin.example.com PUBLIC_SHARE_DOMAIN=share.example.com ACME_EMAIL=you@example.com bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
```

For production deployment details, see [DEPLOY.md](DEPLOY.md).

### Fresh VPS bootstrap from your workstation

If you are provisioning a brand-new VPS remotely, use the bootstrap wrapper instead of running the install steps manually:

```bash
BOOTSTRAP_HOST=your-server-ip \
BOOTSTRAP_PASSWORD=your-password \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='change-this-now' \
bash scripts/bootstrap-vps.sh
```

See [docs/fresh-vps-bootstrap.md](docs/fresh-vps-bootstrap.md) for the domain/HTTPS examples and the full preflight checklist.

## Environment variables

Set these in `.env` before production use:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite DSN (example: `file:./data/atomic-ui.db`) |
| `JWT_SECRET` | Yes | Session signing secret; must be strong and unique |
| `SESSION_EXPIRY_DAYS` | No | Session TTL in days (default: `7`) |
| `TOTP_ENCRYPTION_KEY` | Strongly recommended | Stable key for encrypting TOTP secrets |
| `CRON_SECRET` | Strongly recommended | Protects task endpoints (`/api/health-check`, `/api/tasks/check-expirations`) |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical admin/app URL used by webhook and server-side flows |
| `APP_URL` | Recommended | Admin/app base URL for server-side flows |
| `PUBLIC_SHARE_URL` | Optional | Public share host origin for `/s`, `/sub`, `/c`, and subscription APIs |
| `NEXT_PUBLIC_PUBLIC_SHARE_URL` | Optional | Client-side mirror of `PUBLIC_SHARE_URL` |
| `TELEGRAM_BOT_TOKEN` | Optional | Bot token from @BotFather |
| `SMTP_HOST` | Optional | SMTP host for `EMAIL` notification channels |
| `SMTP_PORT` | Optional | SMTP port (for example `587` or `465`) |
| `SMTP_USER` | Optional | SMTP username; pair with `SMTP_PASS` if auth is required |
| `SMTP_PASS` | Optional | SMTP password; pair with `SMTP_USER` if auth is required |
| `SMTP_FROM` | Optional | Default sender address for `EMAIL` notification channels |
| `DIGITALOCEAN_TOKEN` | Optional | Enables DO provisioning from UI |
| `LOG_LEVEL` | Optional | `debug`, `info`, `warn`, or `error` (default: `info` in production) |
| `LOG_VERBOSE_SCOPES` | Optional | Comma-separated debug scopes such as `sync,trpc` for temporary deep logs |

## Security checklist

- Set `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, and `CRON_SECRET` before going live.
- Use HTTPS in production.
- If you are using the installer on a bare IP, expect a Let's Encrypt short-lived IP certificate. These typically last about 7 days and are renewed automatically by the installed `atomic-ui-cert-renew.timer`.
- Set `NEXT_PUBLIC_APP_URL` to avoid host-header-derived callback URLs.
- Restrict access to backup/export/admin routes to trusted users only.
- Rotate credentials after initial setup.

## HTTPS notes

- Fresh VPS installs now prefer HTTPS by default.
- The installer uses nginx in front of the app and keeps the internal Node process on port `2053`.
- Set `PANEL_DOMAIN=panel.example.com` during install if you want the panel to use a real domain as its canonical public origin.
- Set `PUBLIC_SHARE_DOMAIN=share.example.com` during install if you want all public share/client URLs to use a dedicated subdomain.
- Set `ALLOW_IP_FALLBACK=true` to keep the original IP reachable alongside the domain on fresh installs. Leave it false if you want raw IP traffic redirected to the domain.
- When `PUBLIC_SHARE_DOMAIN` is configured, nginx only serves public share routes on that host. `/login`, `/dashboard`, and other admin routes return `404`.
- Point the `share` DNS record at the same VPS IP before running the installer if you want HTTPS on the public share host during the first install.
- Bare-IP HTTPS uses Let's Encrypt's short-lived IP certificate profile, not a normal 90-day domain certificate.
- Auto-renew is configured with `atomic-ui-cert-renew.timer` every 12 hours.
- Domain installs use the standard Let's Encrypt domain flow and the system `certbot.timer`.
- For long-term production use, a real domain is still recommended because standard domain certificates are longer-lived and easier to monitor.

## Production readiness

Run these before or after a production deploy:

```bash
npm run env:check -- --env-file=.env
npm run build:low-memory
npm run smoke -- --base-url=http://127.0.0.1:2053 --email=admin --password=admin123
```

The live smoke test is intended for a running instance and verifies:
- login mutation succeeds
- dashboard routes respond
- server/key/dynamic-key detail screens resolve when records exist

## Backup and restore drill

Use this short drill before major upgrades:

1. Create a fresh backup from the dashboard.
2. Copy the backup file off the VPS.
3. Restore the backup into a staging or disposable instance.
4. Run `npm run smoke` against that restored instance.
5. Confirm you can log in and that keys/servers are visible before touching production.

## Useful scripts

```bash
npm run dev
npm run build
npm run build:low-memory
npm run start
npm run lint
npm run env:check -- --env-file=.env
npm run smoke -- --base-url=http://127.0.0.1:2053 --email=admin --password=admin123
npm run deploy:vps
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:studio
```

## Project structure

```text
atomic-ui/
├── prisma/
├── scripts/
├── src/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── server/
│   │   └── routers/
│   └── types/
├── docker-compose.yml
└── Dockerfile
```

## Tech stack

- Next.js 14 (App Router)
- TypeScript
- Prisma + SQLite
- tRPC + React Query
- Tailwind CSS + shadcn/ui
- Recharts

## License

MIT. See [LICENSE](LICENSE).
