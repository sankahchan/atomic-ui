# Atomic-UI Deployment Guide

This guide covers both Docker and direct VPS/systemd deployment.
For low-memory VPS hosts, prefer the built-in low-memory build flow and smoke checks from this repository.

## Prerequisites

- **Docker** and **Docker Compose** installed on your server.
  - [Install Docker Engine](https://docs.docker.com/engine/install/)
  - [Install Docker Compose](https://docs.docker.com/compose/install/)
- A domain name pointing to your server (optional but recommended for HTTPS).

## Deployment Steps

### 1. Clone the Repository
Clone the code to your server (or upload the files):
```bash
git clone https://github.com/sankahchan/atomic-ui.git
cd atomic-ui
```

### 2. Configure Environment
Create a `.env` file from the example:
```bash
cp .env.example .env
```
Edit `.env` and set secure values:
```ini
# Generate a secure random string for JWT_SECRET
JWT_SECRET=production_secret_change_me_to_something_long_and_random

# Application URL (e.g. https://vpn.yourdomain.com)
APP_URL=http://your-server-ip:3000

# Other settings
NODE_ENV=production
HEALTH_CHECK_ENABLED=true
```

### 3. Validate Environment
Before the first production build, validate the generated `.env`:

```bash
npm install
npm run env:check -- --env-file=.env
```

### 4. Build and Start
Run the following command to build and start the container:
```bash
docker-compose up -d --build
```

Atomic-UI will be available at `http://your-server-ip:3000`.

### 5. Initial Setup
On the first run, the database will be initialized automatically.
Check the logs to get the default admin credentials:
```bash
docker-compose logs -f atomic-ui
```
Look for the generated admin credentials in the install/setup output.

## Direct VPS / systemd deployment

This path matches the way the panel is running on your existing VPS.

### Database engine note

Atomic-UI now supports both SQLite and Postgres at Prisma-client generation time. Always use the repo wrappers instead of raw Prisma commands:

```bash
npm run db:generate
npm run db:push
npm run db:migrate
```

Those commands select the correct Prisma schema provider from `DATABASE_URL`.

### 0. Fresh VPS bootstrap from your workstation

For a brand-new VPS, prefer the remote bootstrap wrapper instead of hand-running the install steps:

```bash
BOOTSTRAP_HOST=your-server-ip \
BOOTSTRAP_PASSWORD=your-password \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='change-this-now' \
bash scripts/bootstrap-vps.sh
```

Domain example:

```bash
BOOTSTRAP_HOST=your-server-ip \
BOOTSTRAP_PASSWORD=your-password \
BOOTSTRAP_ACME_EMAIL=you@example.com \
BOOTSTRAP_PANEL_DOMAIN=admin.example.com \
BOOTSTRAP_PUBLIC_SHARE_DOMAIN=share.example.com \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='change-this-now' \
bash scripts/bootstrap-vps.sh
```

See [docs/fresh-vps-bootstrap.md](docs/fresh-vps-bootstrap.md) for the full checklist and all supported inputs.

### 1. First-time install

```bash
git clone https://github.com/sankahchan/atomic-ui.git
cd atomic-ui
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run setup
npm run env:check -- --env-file=.env
NODE_HEAP_MB=640 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh
```

Or use the one-command installer directly from inside the VPS, which now prefers HTTPS by default:

```bash
sudo env ACME_EMAIL=you@example.com bash <(wget -qO- https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
```

Installer behavior:
- `INSTALL_HTTPS=auto` (default): try HTTPS on the server IP, fall back to HTTP if certificate setup fails
- `INSTALL_HTTPS=require`: fail the install if HTTPS cannot be enabled
- `INSTALL_HTTPS=false`: skip HTTPS and keep nginx on plain HTTP

### 2. systemd service

Use a service file similar to:

```ini
[Unit]
Description=Atomic-UI
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/atomic-ui
ExecStart=/usr/bin/node /opt/atomic-ui/.next/standalone/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=2053
Environment=NODE_OPTIONS=--max-old-space-size=384

[Install]
WantedBy=multi-user.target
```

### 3. Low-memory deploy/update flow

On small VPS instances, do not rebuild while the panel is still running if memory is tight.

```bash
cd /opt/atomic-ui
git pull --ff-only origin main
systemctl stop atomic-ui.service
NODE_HEAP_MB=640 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh
systemctl start atomic-ui.service
```

Or run the scripted remote flow from your workstation:

```bash
DEPLOY_HOST=your-server-ip \
DEPLOY_PASSWORD=your-password \
bash scripts/deploy-vps.sh
```

If you are moving an existing host off SQLite, use [docs/postgres-cutover.md](docs/postgres-cutover.md) before you change the production `DATABASE_URL`.

## Configuring HTTPS

### Bare IP (default installer path)

The repository includes a reusable IP-HTTPS setup script:

```bash
sudo APP_PORT=2053 ACME_EMAIL=you@example.com bash scripts/setup-nginx-https.sh
```

Notes:
- This uses nginx in front of the app and keeps the Node server on `2053`.
- It requests a Let's Encrypt IP certificate using the `shortlived` profile.
- IP certificates are intentionally short-lived, usually around 7 days.
- Auto-renew is installed as `atomic-ui-cert-renew.timer` and runs every 12 hours.

### Domain-based HTTPS

The same script now supports real domains too:

```bash
sudo APP_PORT=2053 \
  PANEL_PATH=/7061c5df \
  PANEL_DOMAIN=admin.example.com \
  PUBLIC_SHARE_DOMAIN=share.example.com \
  ALLOW_IP_FALLBACK=true \
  ACME_EMAIL=you@example.com \
  bash scripts/setup-nginx-https.sh
```

Notes:
- `PANEL_DOMAIN` makes the domain the canonical public origin used by the installer.
- `PUBLIC_SHARE_DOMAIN` adds a dedicated public-only host for `/s`, `/sub`, `/c`, `/api/subscription/*`, and `/api/sub/*`.
- `ALLOW_IP_FALLBACK=true` keeps the original server IP reachable in parallel. Set it to `false` if you want raw IP traffic redirected to the domain instead.
- Domain certificates use the standard Let's Encrypt flow through `certbot`.
- Auto-renew is handled by `certbot.timer`.
- On the public share host, nginx blocks admin routes like `/login`, `/dashboard`, and `/settings` with `404`.
- Make sure the `share` DNS record already points at your VPS before the HTTPS script runs, or certificate issuance for the public share host will fail.

## Updates
To update the application:
```bash
git pull
docker-compose down
docker-compose up -d --build
```
Your database (`data/atomic-ui.db`) is persisted in a Docker volume, so data is safe during updates.

For Postgres-backed Docker builds, pass a Postgres build arg so Prisma generates the correct client:

```bash
docker build --build-arg PRISMA_DATABASE_URL='postgresql://user:pass@host:5432/atomic_ui' -t atomic-ui .
```

For direct VPS deployments:

```bash
git pull --ff-only origin main
systemctl stop atomic-ui.service
NODE_HEAP_MB=640 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh
systemctl start atomic-ui.service
npm run smoke -- --base-url=http://127.0.0.1:2053 --email=admin --password='your-password'
```

If nginx is fronting the app, test the public URL too:

```bash
curl -I http://your-server-ip/
curl -I https://your-server-ip/
```

## Backup drill and rollback

Before major upgrades:

1. Create a backup in the dashboard.
2. Copy it off the server.
3. Restore it in a staging/disposable instance.
4. Run the smoke test against that restored instance.

For SQLite-to-Postgres migrations, replace the dashboard backup/restore steps with:

1. `npm run db:cutover:export`
2. `npm run db:cutover:import`
3. `npm run db:cutover:verify`

If a direct VPS deploy fails:

1. `git reset --hard <previous-commit>` is not recommended on a shared working tree; instead checkout the last known good commit in a clean deploy directory or use `git checkout <commit>` on the VPS only if you control that host.
2. Rebuild with `NODE_HEAP_MB=640 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh`.
3. Restart `atomic-ui.service`.
4. Re-run the smoke test and inspect `journalctl -u atomic-ui.service -n 50`.

## Troubleshooting
- **Logs**: `docker-compose logs -f`
- **Shell Access**: `docker-compose exec atomic-ui sh`
- **Manual Setup**: If setup script fails, run inside container: `docker-compose exec atomic-ui npx tsx scripts/setup.ts`
- **Verbose sync logs**: temporarily set `LOG_VERBOSE_SCOPES=sync,trpc` in `.env`, restart the service, and remove it after debugging
