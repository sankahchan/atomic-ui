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

## Configuring HTTPS (Recommended)
To secure your dashboard with HTTPS, you can use a reverse proxy like Nginx or Caddy.

### Example: Caddy (Easiest)
Create a `Caddyfile` in the project root:
```
vpn.yourdomain.com {
    reverse_proxy localhost:3000
}
```
Run Caddy with Docker (add to docker-compose.yml or run separately).

### Example: Nginx
Configure a server block to proxy `localhost:3000`:
```nginx
server {
    listen 80;
    server_name vpn.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
Use Certbot (`sudo certbot --nginx`) to enable HTTPS.

## Updates
To update the application:
```bash
git pull
docker-compose down
docker-compose up -d --build
```
Your database (`data/atomic-ui.db`) is persisted in a Docker volume, so data is safe during updates.

For direct VPS deployments:

```bash
git pull --ff-only origin main
systemctl stop atomic-ui.service
NODE_HEAP_MB=640 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh
systemctl start atomic-ui.service
npm run smoke -- --base-url=http://127.0.0.1:2053 --email=admin --password='your-password'
```

## Backup drill and rollback

Before major upgrades:

1. Create a backup in the dashboard.
2. Copy it off the server.
3. Restore it in a staging/disposable instance.
4. Run the smoke test against that restored instance.

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
