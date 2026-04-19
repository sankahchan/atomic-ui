# New Server From Production Backup

Use this when you need a replacement Atomic-UI server that becomes a working copy of an existing production server.

This runbook is for the case where the source server already creates Postgres `.dump` backups in the dashboard.

## Outcome

After this runbook:

- the new server is running Atomic-UI on Postgres
- the production backup is restored onto the new server
- dashboard backup upload, verify, and restore work on the new server too
- you log in with the source server's admin account, not the temporary bootstrap admin

## Before you start

You need:

1. A fresh VPS with SSH access.
2. A production backup file from the source server.
3. The source server admin credentials.
4. The current repo `main` branch or a release tag that already includes:
   - dashboard backup upload/restore support
   - Postgres restore verification
   - `scripts/sync-systemd-service.sh`

## Important rule

Fresh Atomic-UI installs still default to SQLite.

A Postgres `.dump` backup can only be restored onto a server that is also configured with a Postgres `DATABASE_URL`.

If you skip the Postgres conversion step below, restore will fail with the expected message:

```text
This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.
```

## Recommended sequence

### 1. Bootstrap the new VPS

Preferred path now: bootstrap the new VPS directly on Postgres so it is restore-ready from the start.

Use the workstation bootstrap wrapper:

```bash
BOOTSTRAP_HOST=your-server-ip \
BOOTSTRAP_PASSWORD='your-vps-password' \
BOOTSTRAP_DATABASE_ENGINE='postgres' \
BOOTSTRAP_DEFAULT_ADMIN_USERNAME='admin' \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD='temporary-password' \
bash scripts/bootstrap-vps.sh
```

If you need domains and HTTPS, use the domain example in [fresh-vps-bootstrap.md](fresh-vps-bootstrap.md).

Verify after bootstrap:

- the panel login page loads
- `atomic-ui.service` is active
- the app health route answers on the local panel path

### 2. Take a safety snapshot of the new server

Before you change database engines, keep a rollback copy of the fresh server state.

Recommended items to save:

- `/opt/atomic-ui/.env`
- `/opt/atomic-ui/.panel_path`
- `/opt/atomic-ui/.panel_port`
- `/opt/atomic-ui/prisma/data/atomic-ui.db`

Example:

```bash
cd /opt/atomic-ui
SAFETY_DIR="storage/migration-safety/$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "${SAFETY_DIR}"
cp .env "${SAFETY_DIR}/.env.pre-postgres"
cp .panel_path "${SAFETY_DIR}/.panel_path" 2>/dev/null || true
cp .panel_port "${SAFETY_DIR}/.panel_port" 2>/dev/null || true
cp prisma/data/atomic-ui.db "${SAFETY_DIR}/atomic-ui-pre-postgres.db"
```

### 3. Convert the target server to Postgres

Skip this step if you already bootstrapped with `BOOTSTRAP_DATABASE_ENGINE=postgres`.

Install the required packages:

```bash
apt-get update
apt-get install -y postgresql postgresql-client
systemctl enable --now postgresql
```

Create a dedicated database and user:

```bash
sudo -u postgres psql <<'SQL'
create user atomic_ui_app with password 'replace-this-password';
create database atomic_ui owner atomic_ui_app;
SQL
```

Switch `/opt/atomic-ui/.env` to Postgres:

```ini
DATABASE_URL=postgresql://atomic_ui_app:replace-this-password@127.0.0.1:5432/atomic_ui
```

Then regenerate Prisma, push the schema, rebuild the standalone bundle, and resync the systemd service from `.env`:

```bash
cd /opt/atomic-ui
sh scripts/prisma-command.sh generate
node scripts/prisma-safe-db-push.js
NODE_HEAP_MB=640 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh
APP_DIR=/opt/atomic-ui SERVICE_NAME=atomic-ui.service bash scripts/sync-systemd-service.sh
systemctl restart atomic-ui.service
```

Verify:

```bash
curl -sS "http://127.0.0.1:$(cat /opt/atomic-ui/.panel_port)$(cat /opt/atomic-ui/.panel_path)/api/health"
```

Expected result: `database: connected`

### 4. Move the production backup onto the new server

You can either:

- upload it in the dashboard with `Upload Backup`
- or copy it directly to `/opt/atomic-ui/storage/backups/`

Example with `scp`:

```bash
scp -P 22022 /absolute/path/to/backup.dump root@your-server-ip:/opt/atomic-ui/storage/backups/
```

### 5. Verify the backup in the dashboard

Open:

- `Settings -> Backup & Restore`

Then:

1. Upload the backup if it is not already listed.
2. Click `Verify Again` if needed.
3. Confirm the status becomes `Verified` or `Restore ready`.

If verification fails:

- `pg_restore ENOENT` means the host is missing `postgresql-client`
- `This server is using SQLite...` means the target runtime is still SQLite

### 6. Restore the backup

From the backup row in the dashboard:

1. Click `Restore`
2. Confirm the action
3. Wait for the restore job to complete and the app to restart

Dashboard restore automatically:

- runs a verification pre-check
- creates a safety backup
- schedules the detached restore job
- restarts Atomic-UI when finished

### 7. Log in with the source server account

After restore, the target server no longer uses the temporary bootstrap admin.

The restore replaces:

- users
- passwords
- admin scopes
- Telegram settings
- servers
- keys
- orders and support data

Log in with the source server owner/admin credentials.

If you restored the main production server backup, use the main production owner login on the new server too.

### 8. Validate the restored server

Check:

- login succeeds
- dashboard loads
- users, servers, and keys are present
- `Settings -> Backup & Restore` still verifies current backups successfully
- Telegram settings and webhook configuration match the source environment

Useful probes:

```bash
curl -sS "http://127.0.0.1:$(cat /opt/atomic-ui/.panel_port)$(cat /opt/atomic-ui/.panel_path)/api/health"
curl -I "http://127.0.0.1:$(cat /opt/atomic-ui/.panel_port)$(cat /opt/atomic-ui/.panel_path)/login"
```

## Cleanup after successful recovery

Once the restored server looks correct:

1. Create a fresh new Postgres backup on the target server.
2. Keep the migration safety snapshot until you are fully satisfied.
3. Remove stale incompatible backup files and verification rows if they are no longer needed.
4. Record the target server's SSH port, panel path, and backup status in your ops notes.

## Troubleshooting

### Restore fails because the target is still SQLite

Message:

```text
This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.
```

Fix:

- set a Postgres `DATABASE_URL` in `.env`
- run `sh scripts/prisma-command.sh generate`
- run `node scripts/prisma-safe-db-push.js`
- rebuild and restart

### Restore fails with `pg_restore ENOENT`

Fix:

```bash
apt-get update
apt-get install -y postgresql-client
```

### App starts but reports `database: disconnected`

Most likely the service unit is still carrying an old runtime `DATABASE_URL`.

Fix:

```bash
cd /opt/atomic-ui
APP_DIR=/opt/atomic-ui SERVICE_NAME=atomic-ui.service bash scripts/sync-systemd-service.sh
systemctl restart atomic-ui.service
```

### The restored server login no longer accepts the temporary bootstrap admin

That is expected. Restore replaces the target `User` table with the source backup's users.

Use the source server admin credentials instead.

## Related docs

- [fresh-vps-bootstrap.md](fresh-vps-bootstrap.md)
- [postgres-cutover.md](postgres-cutover.md)
- [DEPLOY.md](../DEPLOY.md)
