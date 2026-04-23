# Fresh VPS Bootstrap

Use this when you want a brand-new VPS to come up with the same install path every time, without assembling the production steps by hand.

## What this does

- connects to a fresh VPS over SSH
- installs the minimal system packages needed to run the installer
- downloads `install.sh` from the GitHub ref you choose
- runs the normal Atomic-UI installer with your panel/share domain settings
- applies the Prisma schema through the repo's non-interactive safety wrapper so fresh installs do not stall on a confirmation prompt
- verifies that `atomic-ui.service` is running
- probes the local panel route before finishing

It is intended for **first-time installs** on a clean VPS.

For updates on an existing server, use `scripts/deploy-vps.sh` instead.
For turning a fresh server into a restored copy of an existing production server, continue with [new-server-from-production-backup.md](new-server-from-production-backup.md) after bootstrap.

## Before you run it

1. Point DNS at the VPS first if you plan to use `PANEL_DOMAIN` or `PUBLIC_SHARE_DOMAIN`.
2. Make sure the VPS allows inbound `22`, `80`, and `443`.
3. Make sure your workstation has `sshpass` installed if you plan to use password auth.
4. Decide whether you want:
   - IP-only install
   - panel domain only
   - panel domain + public share subdomain
5. Choose non-default admin credentials for production.
6. Decide whether to keep the generated random panel path or set a fixed one such as `control-center`.
7. Decide whether to keep the default Postgres runtime or explicitly opt into SQLite.

## Quick usage

### Bare IP install

This now installs onto local Postgres by default:

```bash
BOOTSTRAP_HOST=152.42.255.135 \
BOOTSTRAP_PASSWORD='your-vps-password' \
BOOTSTRAP_DEFAULT_ADMIN_USERNAME='admin' \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='change-this-now' \
bash scripts/bootstrap-vps.sh
```

### Domain install with HTTPS

```bash
BOOTSTRAP_HOST=152.42.255.135 \
BOOTSTRAP_PASSWORD='your-vps-password' \
BOOTSTRAP_ACME_EMAIL='you@example.com' \
BOOTSTRAP_PANEL_DOMAIN='admin.example.com' \
BOOTSTRAP_PUBLIC_SHARE_DOMAIN='share.example.com' \
BOOTSTRAP_ALLOW_IP_FALLBACK='true' \
BOOTSTRAP_DEFAULT_ADMIN_USERNAME='admin' \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='change-this-now' \
BOOTSTRAP_TELEGRAM_BOT_TOKEN='123456:ABCDEF' \
bash scripts/bootstrap-vps.sh
```

### Predictable first-login path

Use this when you want the panel to come up at a fixed path instead of a generated random one:

```bash
BOOTSTRAP_HOST=152.42.255.135 \
BOOTSTRAP_PASSWORD='your-vps-password' \
BOOTSTRAP_PANEL_PATH='control-center' \
BOOTSTRAP_DEFAULT_ADMIN_USERNAME='admin' \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='change-this-now' \
bash scripts/bootstrap-vps.sh
```

### Opt into SQLite instead

Use this only when you explicitly want a SQLite runtime on the fresh VPS:

```bash
BOOTSTRAP_HOST=152.42.255.135 \
BOOTSTRAP_PASSWORD='your-vps-password' \
BOOTSTRAP_DATABASE_ENGINE='sqlite' \
BOOTSTRAP_DEFAULT_ADMIN_USERNAME='admin' \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='change-this-now' \
bash scripts/bootstrap-vps.sh
```

If you already have a managed Postgres database, pass `BOOTSTRAP_DATABASE_URL` instead of using the installer-managed local Postgres defaults.

## Supported inputs

| Variable | Purpose |
| --- | --- |
| `BOOTSTRAP_HOST` | VPS IP or hostname. Required. |
| `BOOTSTRAP_PASSWORD` | SSH password for password-based login. Optional if SSH key access works. |
| `BOOTSTRAP_USER` | SSH user. Defaults to `root`. |
| `BOOTSTRAP_REPO` | GitHub repo slug. Defaults to `sankahchan/atomic-ui`. |
| `BOOTSTRAP_INSTALL_REF` | Branch, tag, or commit SHA to install. Defaults to `main`. |
| `BOOTSTRAP_INSTALL_HTTPS` | `auto`, `require`, or `false`. Defaults to `auto`. |
| `BOOTSTRAP_DATABASE_ENGINE` | `postgres` or `sqlite`. Defaults to `postgres` for fresh VPS installs. |
| `BOOTSTRAP_DATABASE_URL` | Optional Postgres connection string. If set, the installer uses it instead of creating a local Postgres database. |
| `BOOTSTRAP_PANEL_PATH` | Optional fixed panel path such as `control-center`. If omitted, the installer generates a random path. |
| `BOOTSTRAP_POSTGRES_HOST` | Host for installer-managed Postgres. Keep this local (`127.0.0.1` or `localhost`). |
| `BOOTSTRAP_POSTGRES_PORT` | Port for installer-managed Postgres. Defaults to `5432`. |
| `BOOTSTRAP_POSTGRES_DB` | Database name for installer-managed Postgres. Defaults to `atomic_ui`. |
| `BOOTSTRAP_POSTGRES_USER` | User name for installer-managed Postgres. Defaults to `atomic_ui_app`. |
| `BOOTSTRAP_POSTGRES_PASSWORD` | Optional password for installer-managed Postgres. If omitted, the installer generates one and writes it into `.env`. |
| `BOOTSTRAP_ACME_EMAIL` | Email used for certificate setup. |
| `BOOTSTRAP_PANEL_DOMAIN` | Canonical admin domain. Optional. |
| `BOOTSTRAP_PUBLIC_SHARE_DOMAIN` | Public share/client host. Optional. |
| `BOOTSTRAP_ALLOW_IP_FALLBACK` | Keep IP access alongside the domain. Defaults to `true`. |
| `BOOTSTRAP_DEFAULT_ADMIN_USERNAME` | Initial admin username. Defaults to `admin`. |
| `BOOTSTRAP_DEFAULT_ADMIN_PASSWORD` | Initial admin password. Defaults to `admin123`. Change this. |
| `BOOTSTRAP_TELEGRAM_BOT_TOKEN` | Optional Telegram bot token to seed into `.env` during first install. |

## What you should verify after install

1. Open the printed panel URL.
2. Log in with the admin credentials you supplied.
3. Change the admin password if you used a temporary value.
4. Confirm:
   - login page loads
   - dashboard loads
   - share page host is correct
   - database engine matches what you asked for
5. If Telegram is configured, sign in to the dashboard Notifications workspace and use the webhook set/reset controls there.
6. Confirm inbound Telegram delivery against the public panel URL after the webhook is set.

Atomic-UI registers Telegram webhooks with a secret token and rejects incoming webhook requests that do not include the matching `x-telegram-bot-api-secret-token` header.

## Common causes of failure on fresh VPS

- DNS not pointed yet for `PANEL_DOMAIN` or `PUBLIC_SHARE_DOMAIN`
- ports `80` and `443` blocked by cloud firewall
- missing `sshpass` locally when using `BOOTSTRAP_PASSWORD`
- trying to install a branch/tag/commit that is not available on GitHub
- running a domain HTTPS install before the domain resolves to the VPS

## When to use something else

- use `scripts/deploy-vps.sh` for normal updates
- use `install.sh` directly if you are already logged into the VPS and want to install from inside the server
- use [new-server-from-production-backup.md](new-server-from-production-backup.md) when the fresh server must restore a production backup and become a live replacement
