# Postgres Cutover

This is the supported path for moving an existing Atomic-UI production instance from SQLite to Postgres.

## What changed

The repo now chooses the Prisma schema provider from `DATABASE_URL` at command time:

- SQLite `file:...` keeps using `prisma/schema.prisma`
- Postgres `postgresql://...` generates a derived Prisma schema under `prisma/.generated/schema.postgres.prisma`

Use the repo wrappers and npm scripts for all Prisma operations:

```bash
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:studio
```

Do not fall back to raw `npx prisma ...` commands during cutover unless you pass the correct `--schema` path yourself.

## Recommended sequence

### 1. Validate the current production environment

```bash
npm run env:check -- --env-file=.env
npm run db:cutover:report
TARGET_DATABASE_URL='postgresql://user:pass@host:5432/atomic_ui' npm run db:cutover:preflight
```

### 2. Export the live SQLite data

Run this while `DATABASE_URL` still points at the source SQLite file:

```bash
npm run db:cutover:export
```

Optional overrides:

```bash
CUTOVER_EXPORT_LABEL=prod-final \
CUTOVER_BATCH_SIZE=1000 \
npm run db:cutover:export
```

This creates:

- `storage/cutover/<timestamp>-<label>/manifest.json`
- one `*.ndjson` file per Prisma model
- `sqlite-source-safety-backup.db`

### 3. Switch `.env` to Postgres

Update:

```ini
DATABASE_URL="postgresql://user:pass@host:5432/atomic_ui"
```

### 4. Regenerate the Prisma client for Postgres and create the schema

```bash
npm run db:generate
npm run db:push
```

If you use Docker builds for Postgres, pass the runtime engine at build time too:

```bash
docker build --build-arg PRISMA_DATABASE_URL='postgresql://user:pass@host:5432/atomic_ui' -t atomic-ui .
```

### 5. Import the exported dataset into Postgres

```bash
CUTOVER_EXPORT_DIR='storage/cutover/<timestamp>-prod-final' \
npm run db:cutover:import
```

If the target database is disposable and already has data:

```bash
CUTOVER_EXPORT_DIR='storage/cutover/<timestamp>-prod-final' \
CUTOVER_RESET_TARGET=true \
npm run db:cutover:import
```

### 6. Verify counts before starting the app on Postgres

```bash
CUTOVER_EXPORT_DIR='storage/cutover/<timestamp>-prod-final' \
npm run db:cutover:verify
```

The command exits non-zero if any model count differs from the exported manifest.

### 7. Build and start the app

```bash
NODE_HEAP_MB=640 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh
systemctl restart atomic-ui.service
```

Then verify:

```bash
curl -sS http://127.0.0.1:2053/your-panel-path/api/health
curl -sS http://127.0.0.1:2053/your-panel-path/api/app-version
npm run smoke -- --base-url=http://127.0.0.1:2053/your-panel-path --email=admin --password='...'
```

## Notes

- Dashboard backup creation can emit Postgres `.dump` archives from the settings workspace, but restore is still offline-only. Use `pg_restore --dbname "$DATABASE_URL" /absolute/path/to/backup.dump` when restoring Postgres backups.
- Keep the SQLite safety backup until you have completed smoke tests and at least one clean production backup on Postgres.
- Run the export and import from the same Git commit so the manifest model order and Prisma schema stay aligned.
