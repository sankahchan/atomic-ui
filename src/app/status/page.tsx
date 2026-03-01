'use client';

/**
 * Public Uptime Status Page
 *
 * Displays the current health status of all active servers.
 * This page is fully public (no authentication required) and
 * fetches data from the /api/health-check endpoint.
 *
 * Features:
 * - Overall system status indicator
 * - Per-server status cards with uptime %, latency, and last check time
 * - Auto-refresh every 30 seconds
 * - Responsive dark/light theme based on system preference
 */

import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ServerStatus {
  id: string;
  name: string;
  status: 'UP' | 'DOWN' | 'SLOW' | 'UNKNOWN';
  latencyMs: number | null;
  uptimePercent: number;
  lastCheckedAt: string | null;
  keyCount: number;
}

interface HealthData {
  success: boolean;
  servers: ServerStatus[];
  checkedAt: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getStatusConfig(status: string) {
  switch (status) {
    case 'UP':
      return {
        label: 'Operational',
        color: 'bg-emerald-500',
        textColor: 'text-emerald-500',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        dot: 'bg-emerald-400',
      };
    case 'SLOW':
      return {
        label: 'Degraded',
        color: 'bg-amber-500',
        textColor: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        dot: 'bg-amber-400',
      };
    case 'DOWN':
      return {
        label: 'Down',
        color: 'bg-red-500',
        textColor: 'text-red-500',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        dot: 'bg-red-400',
      };
    default:
      return {
        label: 'Unknown',
        color: 'bg-zinc-500',
        textColor: 'text-zinc-400',
        bgColor: 'bg-zinc-500/10',
        borderColor: 'border-zinc-500/30',
        dot: 'bg-zinc-400',
      };
  }
}

function getOverallStatus(servers: ServerStatus[]): { label: string; color: string; textColor: string } {
  if (servers.length === 0) return { label: 'No Servers', color: 'bg-zinc-500', textColor: 'text-zinc-400' };

  const downCount = servers.filter((s) => s.status === 'DOWN').length;
  const slowCount = servers.filter((s) => s.status === 'SLOW').length;

  if (downCount === servers.length) {
    return { label: 'Major Outage', color: 'bg-red-500', textColor: 'text-red-500' };
  }
  if (downCount > 0) {
    return { label: 'Partial Outage', color: 'bg-orange-500', textColor: 'text-orange-500' };
  }
  if (slowCount > 0) {
    return { label: 'Degraded Performance', color: 'bg-amber-500', textColor: 'text-amber-500' };
  }
  return { label: 'All Systems Operational', color: 'bg-emerald-500', textColor: 'text-emerald-500' };
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ─────────────────────────────────────────────
// Uptime Bar Component
// ─────────────────────────────────────────────

function UptimeBar({ percent }: { percent: number }) {
  // Build a visual bar with 30 segments
  const segments = 30;
  const filled = Math.round((percent / 100) * segments);

  return (
    <div className="flex gap-[2px]" title={`${percent.toFixed(2)}% uptime`}>
      {Array.from({ length: segments }, (_, i) => {
        let color = 'bg-zinc-700';
        if (i < filled) {
          if (percent >= 99) color = 'bg-emerald-500';
          else if (percent >= 95) color = 'bg-amber-500';
          else color = 'bg-red-500';
        }
        return (
          <div
            key={i}
            className={`h-6 w-full rounded-[2px] ${color} transition-colors`}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function StatusPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/health-check');
      if (!res.ok) throw new Error('Failed to fetch status');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const overall = data ? getOverallStatus(data.servers) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <h1 className="text-xl font-bold tracking-tight">System Status</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time health monitoring
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="text-center py-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              Unable to fetch status data
            </div>
          </div>
        )}

        {/* Status content */}
        {data && !loading && (
          <>
            {/* Overall status banner */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`h-3 w-3 rounded-full ${overall?.color}`} />
                  <div className={`absolute inset-0 h-3 w-3 rounded-full ${overall?.color} animate-ping opacity-30`} />
                </div>
                <span className={`text-lg font-semibold ${overall?.textColor}`}>
                  {overall?.label}
                </span>
              </div>
              {data.checkedAt && (
                <p className="text-xs text-zinc-600 mt-2">
                  Last updated: {new Date(data.checkedAt).toLocaleString()}
                </p>
              )}
            </div>

            {/* Server list */}
            <div className="space-y-4">
              {data.servers.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  No servers configured
                </div>
              ) : (
                data.servers.map((server) => {
                  const cfg = getStatusConfig(server.status);
                  return (
                    <div
                      key={server.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4"
                    >
                      {/* Server header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                          <span className="font-medium">{server.name}</span>
                        </div>
                        <span className={`text-sm font-medium ${cfg.textColor}`}>
                          {cfg.label}
                        </span>
                      </div>

                      {/* Uptime bar */}
                      <UptimeBar percent={server.uptimePercent} />

                      {/* Stats row */}
                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <div className="flex items-center gap-4">
                          <span>
                            Uptime: <span className="text-zinc-300">{server.uptimePercent.toFixed(2)}%</span>
                          </span>
                          <span>
                            Latency: <span className="text-zinc-300">{formatLatency(server.latencyMs)}</span>
                          </span>
                        </div>
                        <span>
                          Checked {formatTimeAgo(server.lastCheckedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-zinc-700 pt-4">
              Powered by Atomic-UI
            </div>
          </>
        )}
      </main>
    </div>
  );
}
