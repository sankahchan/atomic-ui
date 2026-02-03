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

For production deployment details, see [DEPLOY.md](DEPLOY.md).

## Environment variables

Set these in `.env` before production use:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite DSN (example: `file:./data/atomic-ui.db`) |
| `JWT_SECRET` | Yes | Session signing secret; must be strong and unique |
| `SESSION_EXPIRY_DAYS` | No | Session TTL in days (default: `7`) |
| `TOTP_ENCRYPTION_KEY` | Strongly recommended | Stable key for encrypting TOTP secrets |
| `CRON_SECRET` | Strongly recommended | Protects task endpoints (`/api/health-check`, `/api/tasks/check-expirations`) |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical public URL used by webhook/subscription links |
| `APP_URL` | Recommended | App base URL for server-side flows |
| `TELEGRAM_BOT_TOKEN` | Optional | Bot token from @BotFather |
| `DIGITALOCEAN_TOKEN` | Optional | Enables DO provisioning from UI |

## Security checklist

- Set `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, and `CRON_SECRET` before going live.
- Use HTTPS in production.
- Set `NEXT_PUBLIC_APP_URL` to avoid host-header-derived callback URLs.
- Restrict access to backup/export/admin routes to trusted users only.
- Rotate credentials after initial setup.

## Useful scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
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
