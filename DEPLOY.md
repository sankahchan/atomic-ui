# Atomic-UI Deployment Guide

This guide describes how to deploy Atomic-UI for production use.
The recommended deployment method is using **Docker** and **Docker Compose**, which ensures all dependencies (including the database) are handled correctly.

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

### 3. Build and Start
Run the following command to build and start the container:
```bash
docker-compose up -d --build
```

Atomic-UI will be available at `http://your-server-ip:3000`.

### 4. Initial Setup
On the first run, the database will be initialized automatically.
Check the logs to get the default admin credentials:
```bash
docker-compose logs -f atomic-ui
```
Look for:
```
Login Credentials:
   Username: admin
   Password: [random_password]
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

## Troubleshooting
- **Logs**: `docker-compose logs -f`
- **Shell Access**: `docker-compose exec atomic-ui sh`
- **Manual Setup**: If setup script fails, run inside container: `docker-compose exec atomic-ui npx tsx scripts/setup.ts`
