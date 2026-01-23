# Usage Snapshot Worker Setup

The Usage Snapshot Worker is a background process that collects periodic usage data from Outline servers to enable advanced analytics features.

## Features Enabled by the Worker

- **Top Consumers**: See which keys are using the most bandwidth in 24h/7d/30d periods
- **Anomaly Detection**: Automatically detect keys with unusual usage spikes (>3x baseline)
- **Time-to-Quota Forecasting**: Predict when keys will hit their data limits

## How It Works

1. Every 5 minutes, the worker fetches usage metrics from all active Outline servers
2. It stores usage snapshots in the database with delta calculations
3. The analytics API uses these snapshots to calculate trends and detect anomalies
4. Old snapshots (>30 days) are automatically cleaned up

## Running the Worker

### Development (Manual)

```bash
# From the atomic-ui directory
npx ts-node src/server/worker.ts
```

### Production with PM2

```bash
# Install pm2 globally if not already installed
npm install -g pm2

# Start the worker
pm2 start src/server/worker.ts --name atomic-worker --interpreter ts-node

# Or after building
npm run build
pm2 start dist/server/worker.js --name atomic-worker

# View logs
pm2 logs atomic-worker

# Monitor
pm2 monit

# Restart
pm2 restart atomic-worker

# Stop
pm2 stop atomic-worker

# Auto-start on system boot
pm2 startup
pm2 save
```

### Production with systemd

Create `/etc/systemd/system/atomic-worker.service`:

```ini
[Unit]
Description=Atomic UI Usage Snapshot Worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/atomic-ui
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:./prisma/data/atomic-ui.db
ExecStart=/usr/bin/node /path/to/atomic-ui/dist/server/worker.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Start the service
sudo systemctl start atomic-worker

# Enable auto-start on boot
sudo systemctl enable atomic-worker

# Check status
sudo systemctl status atomic-worker

# View logs
sudo journalctl -u atomic-worker -f
```

### Production with Docker Compose

Add to your `docker-compose.yml`:

```yaml
services:
  atomic-ui:
    # ... your existing web service config

  atomic-worker:
    build: .
    command: node dist/server/worker.js
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:/data/atomic-ui.db
    volumes:
      - ./data:/data
    restart: unless-stopped
    depends_on:
      - atomic-ui
```

## Configuration

The worker uses these environment variables (same as the main app):

- `DATABASE_URL`: SQLite database path (e.g., `file:./prisma/data/atomic-ui.db`)

Built-in configuration (in `src/server/worker.ts`):

- `SNAPSHOT_INTERVAL_MS`: Collection interval (default: 5 minutes)
- `LOCK_TTL_MS`: Lock timeout for preventing double-runs (default: 10 minutes)
- `MAX_BACKOFF_MS`: Maximum backoff on server errors (default: 5 minutes)

## Distributed Lock

The worker uses a database-based lock to ensure only one instance runs at a time:

1. On startup, it tries to acquire a lock in the `WorkerLock` table
2. If another worker holds the lock, it exits gracefully
3. The lock has an expiration time (10 min) - if a worker crashes, the lock auto-releases
4. Active workers send heartbeats every minute to extend their lock

This makes it safe to run the worker on multiple servers (e.g., in a HA setup) - only one will actually run.

## Troubleshooting

### Worker exits immediately
- Another worker instance may be running
- Check `WorkerLock` table: `SELECT * FROM WorkerLock;`
- If stuck, delete the lock: `DELETE FROM WorkerLock WHERE id = 'usage-snapshot-worker';`

### No snapshots being collected
- Check if servers are active and reachable
- Look at worker logs for error messages
- Server in backoff? Wait for backoff to clear or restart worker

### High CPU/Memory
- This is usually caused by too many keys. The worker processes keys sequentially
- Consider increasing snapshot interval for very large deployments

## Manual Test Checklist

1. [ ] Start the worker manually: `npx ts-node src/server/worker.ts`
2. [ ] Verify lock acquisition in logs: "Lock acquired successfully"
3. [ ] Wait 5 minutes for first collection cycle
4. [ ] Check Analytics page - should show snapshot count > 0
5. [ ] Verify Top Consumers shows data (if keys have recent usage)
6. [ ] Start a second worker instance - should exit with "Could not acquire lock"
7. [ ] Kill first worker (Ctrl+C) - verify graceful shutdown
8. [ ] Restart worker - should acquire lock again
