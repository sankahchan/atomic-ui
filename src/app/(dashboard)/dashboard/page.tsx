'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { trpc } from '@/lib/trpc';
import { getTagDisplayLabel, getTagToneClassName, KEY_SOURCE_TAGS } from '@/lib/tags';
import { cn, formatBytes, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Globe2,
  Key,
  Plus,
  RefreshCw,
  Server,
  Shield,
  TrendingUp,
  Unlock,
} from 'lucide-react';

type DashboardStatsSummary = {
  activeKeys?: number;
  expiringIn24h?: number;
  pendingKeys?: number;
  expiredKeys?: number;
};

function ControlMetricTile({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
  href,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  iconClassName: string;
  href?: string;
}) {
  const content = (
    <div className="ops-kpi-tile group/card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {value}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl border', iconClassName)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block transition-transform duration-200 hover:-translate-y-0.5">
      {content}
    </Link>
  );
}

function OpsMiniMetric({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: string | number;
  tone: 'violet' | 'amber' | 'rose' | 'cyan';
  compact?: boolean;
}) {
  const toneClass = {
    violet: 'border-violet-500/15 bg-violet-500/10 text-violet-600 dark:text-violet-300',
    amber: 'border-amber-500/15 bg-amber-500/10 text-amber-600 dark:text-amber-300',
    rose: 'border-rose-500/15 bg-rose-500/10 text-rose-600 dark:text-rose-300',
    cyan: 'border-cyan-500/15 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
  }[tone];

  return (
    <div
      className={cn(
        'rounded-[1.25rem] border border-border/60 bg-background/55 dark:bg-white/[0.02]',
        compact ? 'px-3 py-3' : 'px-4 py-4'
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className={cn('mt-3 inline-flex rounded-full border px-3 py-1 text-sm font-semibold', toneClass)}>
        {value}
      </div>
    </div>
  );
}

function TrafficSnapshotStat({
  label,
  value,
  helper,
  tone = 'neutral',
  compact = false,
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: 'neutral' | 'cyan' | 'emerald' | 'violet' | 'amber';
  compact?: boolean;
}) {
  const toneClass = {
    neutral: 'dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
    cyan: 'dark:border-cyan-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.92),rgba(4,10,22,0.82))]',
    emerald: 'dark:border-emerald-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.92),rgba(4,10,22,0.82))]',
    violet: 'dark:border-violet-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.18),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.92),rgba(4,10,22,0.82))]',
    amber: 'dark:border-amber-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.92),rgba(4,10,22,0.82))]',
  }[tone];

  return (
    <div className={cn(
      compact
        ? 'rounded-[1.35rem] border px-4 py-3.5 dark:shadow-[0_14px_34px_rgba(1,6,20,0.34),inset_0_1px_0_rgba(125,211,252,0.05)]'
        : 'ops-stat-pod dark:shadow-[0_18px_42px_rgba(1,6,20,0.4),inset_0_1px_0_rgba(125,211,252,0.05)]',
      toneClass
    )}>
      <p className={cn(
        'font-semibold uppercase text-muted-foreground',
        compact ? 'text-[10px] tracking-[0.16em]' : 'text-[11px] tracking-[0.18em]'
      )}>
        {label}
      </p>
      <p className={cn('font-semibold', compact ? 'mt-2 text-[1.9rem] leading-none' : 'mt-3 text-2xl')}>
        {value}
      </p>
      <p className={cn('text-muted-foreground', compact ? 'mt-1.5 text-[11px] leading-5' : 'mt-2 text-xs')}>
        {helper}
      </p>
    </div>
  );
}

function KeyOperationsSummary({
  stats,
  t,
  embedded = false,
}: {
  stats: DashboardStatsSummary | null | undefined;
  t: (key: string) => string;
  embedded?: boolean;
}) {
  return (
    <div
      className={cn(
        embedded
          ? 'rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.02]'
          : ''
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <p className={cn('font-semibold', embedded ? 'text-base' : 'text-xl')}>
                {t('dashboard.key_operations_title')}
              </p>
              <p className={cn('mt-1 text-muted-foreground', embedded ? 'text-xs leading-5' : 'text-sm')}>
                {t('dashboard.key_operations_desc')}
              </p>
            </div>
          </div>
          {!embedded ? (
            <Button asChild variant="ghost" className="rounded-full px-3">
              <Link href="/dashboard/keys">
                {t('dashboard.view_all')}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>

        <div className={cn('grid gap-3', embedded ? 'grid-cols-2' : 'sm:grid-cols-2')}>
          <OpsMiniMetric
            label={t('dashboard.active_keys_label')}
            value={stats?.activeKeys || 0}
            tone="violet"
            compact={embedded}
          />
          <OpsMiniMetric
            label={t('dashboard.expiring_soon')}
            value={stats?.expiringIn24h || 0}
            tone="amber"
            compact={embedded}
          />
          <OpsMiniMetric
            label={t('dashboard.pending_keys_label')}
            value={stats?.pendingKeys || 0}
            tone="cyan"
            compact={embedded}
          />
          <OpsMiniMetric
            label={t('dashboard.expired_keys_label')}
            value={stats?.expiredKeys || 0}
            tone="rose"
            compact={embedded}
          />
        </div>

        <Link
          href="/dashboard/keys"
          className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-border/60 bg-background/55 px-4 py-3 transition-colors hover:bg-background/80 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t('dashboard.review_inventory')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('dashboard.review_inventory_desc')}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}

function KeySourceBreakdownCard({
  t,
  sourceCounts,
}: {
  t: (key: string) => string;
  sourceCounts:
    | {
        web: number;
        tele: number;
        trial: number;
        reseller: number;
        untagged: number;
      }
    | null
    | undefined;
}) {
  const sourceItems = KEY_SOURCE_TAGS.map((tag) => ({
    tag,
    count: sourceCounts?.[tag] ?? 0,
  }));

  return (
    <div className="ops-panel space-y-4">
      <div className="space-y-2">
        <p className="ops-section-heading">{t('dashboard.key_sources_title')}</p>
        <div>
          <h2 className="text-xl font-semibold">{t('dashboard.key_sources_title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('dashboard.key_sources_desc')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {sourceItems.map(({ tag, count }) => (
          <div
            key={tag}
            className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]"
          >
            <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', getTagToneClassName(tag))}>
              {getTagDisplayLabel(tag)}
            </span>
            <p className="mt-3 text-2xl font-semibold">{count}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('dashboard.key_sources_keys')}
            </p>
          </div>
        ))}
      </div>

      <Link href="/dashboard/keys" className="ops-action-tile">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('dashboard.key_sources_action')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('dashboard.key_sources_action_desc')}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}

function TrafficOverviewPanel({
  t,
  tf,
  trafficDays,
  setTrafficDays,
  totalTraffic,
  activeServers,
  totalKeys,
  expiringSoon,
  trafficLoading,
  trafficHistory,
  compact = false,
  fillHeight = false,
}: {
  t: (key: string) => string;
  tf: (key: string, values: Record<string, string | number>) => string;
  trafficDays: number;
  setTrafficDays: (days: number) => void;
  totalTraffic: bigint;
  activeServers: number;
  totalKeys: number;
  expiringSoon: number;
  trafficLoading: boolean;
  trafficHistory: Array<{ date: string; bytes: number; label?: string }> | undefined;
  compact?: boolean;
  fillHeight?: boolean;
}) {
  const chartHeight = compact ? (fillHeight ? 340 : 156) : 238;

  return (
    <Card className={cn(
      'overflow-hidden border-white/45 bg-white/65 dark:border-cyan-400/18 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.1),transparent_24%),linear-gradient(145deg,rgba(4,10,24,0.96),rgba(4,11,24,0.88))] dark:shadow-[0_28px_72px_rgba(1,6,20,0.56),0_0_0_1px_rgba(34,211,238,0.05),inset_0_1px_0_rgba(125,211,252,0.06)]',
      compact && fillHeight && 'flex min-h-[36rem] flex-1 flex-col'
    )}>
      <CardHeader className={cn(compact ? 'pb-2' : 'pb-4')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className={cn(compact ? 'space-y-1.5' : 'space-y-2')}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-500 dark:border-cyan-400/28 dark:bg-cyan-400/10 dark:shadow-[0_0_26px_rgba(34,211,238,0.14)]">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className={cn(compact ? 'text-lg' : 'text-xl')}>
                  {t('dashboard.traffic_overview')}
                </CardTitle>
                <CardDescription>
                  {formatBytes(totalTraffic)} {tf('dashboard.traffic_last_days', { days: trafficDays.toString() })}
                </CardDescription>
              </div>
            </div>
          </div>
          <Select value={trafficDays.toString()} onValueChange={(value) => setTrafficDays(parseInt(value, 10))}>
            <SelectTrigger className={cn(
              'w-full rounded-full border-border/70 bg-background/65 sm:w-[160px] dark:border-cyan-400/18 dark:bg-[linear-gradient(180deg,rgba(7,17,32,0.92),rgba(5,12,24,0.82))]',
              compact ? 'h-10' : 'h-11'
            )}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('dashboard.days_7')}</SelectItem>
              <SelectItem value="30">{t('dashboard.days_30')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className={cn(
        compact ? 'space-y-2.5' : 'space-y-4',
        compact && fillHeight && 'flex flex-1 flex-col'
      )}>
        <div className={cn('grid', compact ? 'gap-2 sm:grid-cols-2 xl:grid-cols-4' : 'gap-3 sm:grid-cols-2 xl:grid-cols-4')}>
          <TrafficSnapshotStat
            label={t('dashboard.period_usage')}
            value={formatBytes(totalTraffic)}
            helper={tf('dashboard.traffic_last_days', { days: trafficDays.toString() })}
            tone="cyan"
            compact={compact}
          />
          <TrafficSnapshotStat
            label={t('dashboard.online_servers')}
            value={activeServers}
            helper={t('dashboard.online_servers_desc')}
            tone="emerald"
            compact={compact}
          />
          <TrafficSnapshotStat
            label={t('dashboard.total_keys')}
            value={totalKeys}
            helper={`${totalKeys} ${t('dashboard.active')}`}
            tone="violet"
            compact={compact}
          />
          <TrafficSnapshotStat
            label={t('dashboard.expiring_soon')}
            value={expiringSoon}
            helper={t('dashboard.expiring_24h')}
            tone="amber"
            compact={compact}
          />
        </div>

        {trafficLoading ? (
          <div
            className="rounded-[1.6rem] bg-muted animate-pulse"
            style={{ height: chartHeight }}
          />
        ) : trafficHistory && trafficHistory.length > 0 ? (
          <div className={cn(
            'rounded-[1.6rem] border border-border/60 bg-background/45 dark:border-cyan-400/14 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.1),transparent_26%),linear-gradient(180deg,rgba(4,11,23,0.88),rgba(4,10,21,0.78))]',
            compact ? 'p-2.5' : 'p-3',
            compact && fillHeight && 'flex flex-1 flex-col justify-center'
          )}>
            <div style={{ height: chartHeight }}>
              <TrafficChart data={trafficHistory} type="area" height={chartHeight} color="rgba(34,211,238,0.95)" />
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 px-6 text-center dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(4,11,23,0.7),rgba(4,10,21,0.62))]"
            style={{ height: chartHeight }}
          >
            <TrendingUp className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-semibold">{t('dashboard.no_traffic_title')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_traffic_desc')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SecurityAlertsSummaryCard() {
  const { toast } = useToast();
  const {
    data: overview,
    isLoading,
    refetch,
  } = trpc.security.getAdminLoginAbuseOverview.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const unbanMutation = trpc.security.unbanAdminLoginIp.useMutation({
    onSuccess: async () => {
      toast({
        title: 'IP restriction cleared',
        description: 'The IP was removed from the active admin login restriction list.',
      });
      await refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to unban IP',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="ops-panel space-y-4">
        <div className="space-y-2">
          <p className="ops-section-heading">Security alerts</p>
          <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 animate-pulse rounded-[1.2rem] bg-muted/60" />
          <div className="h-20 animate-pulse rounded-[1.2rem] bg-muted/60" />
        </div>
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  const activeBans = overview.activeRestrictions.filter((restriction) => restriction.restrictionType === 'BAN');
  const displayedRestrictions = overview.activeRestrictions.slice(0, 3);
  const displayedFailures = overview.recentFailures.slice(0, 3);

  return (
    <div className="ops-panel space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ops-section-heading">Security alerts</p>
          <h2 className="mt-2 text-xl font-semibold">Admin login protection</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep an eye on failed-login IPs, active bans, and one-click unban actions.
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold',
            activeBans.length > 0
              ? 'border-rose-500/25 bg-rose-500/10 text-rose-500'
              : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
          )}
        >
          <Shield className="mr-1 h-3.5 w-3.5" />
          {activeBans.length > 0 ? `${activeBans.length} active bans` : 'Monitoring'}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="ops-mini-tile">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Failed last hour</p>
          <p className="mt-2 text-2xl font-semibold">{overview.summary.failuresLastHour}</p>
          <p className="mt-1 text-sm text-muted-foreground">Recent bad-password attempts against the admin panel.</p>
        </div>
        <div className="ops-mini-tile">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active restrictions</p>
          <p className="mt-2 text-2xl font-semibold">{overview.summary.activeRestrictions}</p>
          <p className="mt-1 text-sm text-muted-foreground">{overview.summary.activeBans} bans · {overview.summary.activeRestrictions - overview.summary.activeBans} soft locks</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Currently restricted IPs</p>
            <Badge variant="outline">{overview.activeRestrictions.length}</Badge>
          </div>
          <div className="mt-3 space-y-3">
            {displayedRestrictions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active bans or locks.</p>
            ) : (
              displayedRestrictions.map((restriction) => (
                <div key={restriction.id} className="rounded-[1rem] border border-border/50 bg-background/70 p-3 dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{restriction.ip}</span>
                        <Badge variant={restriction.restrictionType === 'BAN' ? 'destructive' : 'secondary'}>
                          {restriction.restrictionType}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {restriction.attemptedEmail || 'Unknown email'}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={unbanMutation.isPending}
                      onClick={() => unbanMutation.mutate({ ip: restriction.ip })}
                    >
                      <Unlock className="mr-2 h-3.5 w-3.5" />
                      Unban
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {restriction.failureCount} failures · expires {formatRelativeTime(restriction.expiresAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Recent failed IPs</p>
            <Badge variant="outline">{overview.recentFailures.length}</Badge>
          </div>
          <div className="mt-3 space-y-3">
            {displayedFailures.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failed admin logins in the last 24 hours.</p>
            ) : (
              displayedFailures.map((failure) => (
                <div key={failure.id} className="rounded-[1rem] border border-border/50 bg-background/70 p-3 dark:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{failure.ip || 'Unknown IP'}</span>
                        {failure.countryCode ? <Badge variant="outline">{failure.countryCode}</Badge> : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {failure.email || 'Unknown email'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(failure.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[1.2rem] border border-border/60 bg-background/55 px-4 py-3 text-xs text-muted-foreground dark:bg-white/[0.03]">
        {overview.fail2banStatus.available ? (
          <span>
            Server jail <span className="font-medium text-foreground">{overview.fail2banStatus.jail}</span> is active with{' '}
            <span className="font-medium text-foreground">{overview.fail2banStatus.currentlyBanned}</span> banned IPs and{' '}
            <span className="font-medium text-foreground">{overview.fail2banStatus.currentlyFailed}</span> recent failed hits.
          </span>
        ) : (
          <span>
            Server jail status is unavailable right now{overview.fail2banStatus.error ? `: ${overview.fail2banStatus.error}` : '.'}
          </span>
        )}
      </div>

      <Link href="/dashboard/security" className="ops-action-tile">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Open security center</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Review full history, tune thresholds, and manage trusted IPs.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}

function ServerRow({
  server,
}: {
  server: {
    id: string;
    name: string;
    countryCode: string | null;
    status: string;
    latencyMs: number | null | undefined;
    keyCount: number;
  };
}) {
  const isOnline = server.status === 'UP';

  return (
    <Link href={`/dashboard/servers/${server.id}`}>
      <div className="flex items-center justify-between gap-4 rounded-[1.25rem] border border-border/60 bg-background/55 px-4 py-3 transition-colors hover:bg-background/80 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              isOnline ? 'bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.35)]' : 'bg-rose-500'
            )}
          />
          {server.countryCode ? (
            <span className="text-base">{getCountryFlag(server.countryCode)}</span>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{server.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {server.keyCount} keys
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">
            {server.latencyMs != null ? `${server.latencyMs}ms` : '-'}
          </p>
          <p>{isOnline ? 'Online' : 'Offline'}</p>
        </div>
      </div>
    </Link>
  );
}

function ActivityItem({
  type,
  title,
  description,
  time,
}: {
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  description: string;
  time: string;
}) {
  const styles = {
    warning: { dot: 'bg-amber-500', bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-500' },
    error: { dot: 'bg-rose-500', bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-500' },
    info: { dot: 'bg-cyan-500', bg: 'bg-cyan-500/10 border-cyan-500/20', text: 'text-cyan-500' },
    success: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-500' },
  };
  const style = styles[type];

  return (
    <div className={cn('flex items-start gap-3 rounded-[1.25rem] border px-4 py-3', style.bg)}>
      <div className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', style.dot)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', style.text)}>{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
    </div>
  );
}

function ServerStatusCard({
  t,
  serverStatus,
  serversLoading,
  compact = false,
}: {
  t: (key: string) => string;
  serverStatus: Array<{
    id: string;
    name: string;
    countryCode: string | null;
    status: string;
    latencyMs: number | null | undefined;
    keyCount: number;
  }> | undefined;
  serversLoading: boolean;
  compact?: boolean;
}) {
  const visibleServers = compact ? serverStatus?.slice(0, 4) : serverStatus?.slice(0, 5);

  return (
    <Card className={cn(
      'self-start dark:border-cyan-400/14 dark:bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,rgba(4,11,24,0.95),rgba(5,12,25,0.84))] dark:shadow-[0_24px_60px_rgba(1,6,20,0.42)]',
      compact && 'h-full min-h-[19rem]'
    )}>
      <CardHeader className={cn(compact ? 'pb-2' : 'pb-3')}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className={cn(compact ? 'text-lg' : 'text-xl')}>{t('dashboard.server_status')}</CardTitle>
              <CardDescription>{t('dashboard.server_status_desc')}</CardDescription>
            </div>
          </div>
          <Button asChild variant="ghost" className="rounded-full px-3">
            <Link href="/dashboard/servers">
              {t('dashboard.view_all')}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {serversLoading ? (
          Array.from({ length: compact ? 3 : 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-[1.25rem] bg-muted animate-pulse" />
          ))
        ) : visibleServers && visibleServers.length > 0 ? (
          visibleServers.map((server) => <ServerRow key={server.id} server={server} />)
        ) : (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(4,11,23,0.7),rgba(4,10,21,0.62))]">
            <Server className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-semibold">{t('dashboard.no_servers_title')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_servers_desc')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertsActivityCard({
  t,
  tf,
  stats,
  activity,
  compact = false,
}: {
  t: (key: string) => string;
  tf: (key: string, values: Record<string, string | number>) => string;
  stats: {
    downServers?: number;
    expiringIn24h?: number;
  } | undefined;
  activity: {
    recentKeys?: Array<{ id: string; name: string; createdAt: string | Date }>;
  } | undefined;
  compact?: boolean;
}) {
  const recentKeys = compact ? activity?.recentKeys?.slice(0, 3) : activity?.recentKeys?.slice(0, 4);
  const hasSignals =
    (stats?.downServers || 0) > 0 ||
    (stats?.expiringIn24h || 0) > 0 ||
    Boolean(recentKeys && recentKeys.length > 0);

  return (
    <Card className={cn(
      'self-start dark:border-cyan-400/14 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_24%),linear-gradient(180deg,rgba(4,11,24,0.95),rgba(5,12,25,0.84))] dark:shadow-[0_24px_60px_rgba(1,6,20,0.42)]',
      compact && 'h-full min-h-[19rem]'
    )}>
      <CardHeader className={cn(compact ? 'pb-2' : 'pb-3')}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className={cn(compact ? 'text-lg' : 'text-xl')}>{t('dashboard.alerts')}</CardTitle>
            <CardDescription>{t('dashboard.recent_activity_desc')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(stats?.downServers || 0) > 0 ? (
          <ActivityItem
            type="error"
            title={t('dashboard.servers_offline_title')}
            description={tf('dashboard.servers_offline_desc', { count: String(stats?.downServers || 0) })}
            time={t('dashboard.now')}
          />
        ) : null}
        {(stats?.expiringIn24h || 0) > 0 ? (
          <ActivityItem
            type="warning"
            title={t('dashboard.keys_expiring_title')}
            description={tf('dashboard.keys_expiring_desc', { count: String(stats?.expiringIn24h || 0) })}
            time={t('dashboard.soon')}
          />
        ) : null}
        {recentKeys
          ? recentKeys.map((key) => (
              <ActivityItem
                key={key.id}
                type="info"
                title={t('dashboard.key_created_title')}
                description={key.name}
                time={formatRelativeTime(key.createdAt)}
              />
            ))
          : null}
        {!hasSignals ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(4,11,23,0.7),rgba(4,10,21,0.62))]">
            <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500/70" />
            <p className="text-sm font-semibold">{t('dashboard.system_clear')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_activity_desc')}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatDashboardMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }

  const normalizedCurrency = (currency || 'MMK').trim().toUpperCase();
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  return normalizedCurrency === 'MMK' ? `${formatted} Kyat` : `${formatted} ${normalizedCurrency}`;
}

function FinanceTrendCards({
  locale,
  loading,
  dashboard,
}: {
  locale: string;
  loading: boolean;
  dashboard:
    | {
        months: Array<{
          label: string;
          renewalOrders: number;
          churnSignals: number;
          revenueByCurrency: Array<{ currency: string; amount: number }>;
        }>;
        summary: {
          totalRevenueByCurrency: Record<string, number>;
          totalRenewals: number;
          totalChurnSignals: number;
          latestMonthLabel: string | null;
          monthOverMonth:
            | {
                revenueDelta: number;
                renewalDelta: number;
                churnDelta: number;
              }
            | null;
        };
      }
    | null
    | undefined;
}) {
  const isMyanmar = locale === 'my';
  const totalRevenueEntries = useMemo(
    () => Object.entries(dashboard?.summary.totalRevenueByCurrency || {}),
    [dashboard],
  );
  const primaryRevenueEntry = totalRevenueEntries[0] || null;
  const totalRevenueLabel =
    totalRevenueEntries.length === 0
      ? '—'
      : totalRevenueEntries.length === 1
        ? formatDashboardMoney(primaryRevenueEntry?.[1], primaryRevenueEntry?.[0])
        : totalRevenueEntries
            .slice(0, 2)
            .map(([currency, amount]) => formatDashboardMoney(amount, currency))
            .join(' · ');
  const latestMonth = dashboard?.months[dashboard.months.length - 1] || null;
  const latestMonthRevenue =
    latestMonth?.revenueByCurrency?.[0]
      ? formatDashboardMoney(latestMonth.revenueByCurrency[0].amount, latestMonth.revenueByCurrency[0].currency)
      : '—';
  const revenueDelta = dashboard?.summary.monthOverMonth?.revenueDelta ?? null;
  const renewalDelta = dashboard?.summary.monthOverMonth?.renewalDelta ?? null;
  const churnDelta = dashboard?.summary.monthOverMonth?.churnDelta ?? null;

  const cards = [
    {
      title: isMyanmar ? 'Finance revenue' : 'Finance revenue',
      value: loading ? '…' : totalRevenueLabel,
      helper: loading
        ? isMyanmar
          ? 'ငွေစာရင်း အချက်အလက်ကို တင်နေသည်'
          : 'Loading revenue trend'
        : `${dashboard?.summary.latestMonthLabel || (isMyanmar ? 'နောက်ဆုံးလ' : 'Latest month')}: ${latestMonthRevenue}`,
      delta:
        revenueDelta == null
          ? null
          : `${revenueDelta >= 0 ? '+' : ''}${formatDashboardMoney(revenueDelta, primaryRevenueEntry?.[0] || 'MMK')}`,
      tone:
        revenueDelta == null ? 'neutral' : revenueDelta >= 0 ? 'cyan' : 'amber',
    },
    {
      title: isMyanmar ? 'Renewals' : 'Renewals',
      value: loading ? '…' : dashboard?.summary.totalRenewals || 0,
      helper: isMyanmar ? 'လစဉ် renewal လုပ်ထားသော order များ' : 'Renewed paid orders in the selected window',
      delta:
        renewalDelta == null
          ? null
          : `${renewalDelta >= 0 ? '+' : ''}${renewalDelta} ${isMyanmar ? 'vs ယခင်လ' : 'vs previous month'}`,
      tone:
        renewalDelta == null ? 'neutral' : renewalDelta >= 0 ? 'emerald' : 'amber',
    },
    {
      title: isMyanmar ? 'Churn signals' : 'Churn signals',
      value: loading ? '…' : dashboard?.summary.totalChurnSignals || 0,
      helper: isMyanmar ? 'Expired / depleted / disabled key signals' : 'Expired, depleted, or disabled key signals',
      delta:
        churnDelta == null
          ? null
          : `${churnDelta >= 0 ? '+' : ''}${churnDelta} ${isMyanmar ? 'vs ယခင်လ' : 'vs previous month'}`,
      tone:
        churnDelta == null ? 'neutral' : churnDelta <= 0 ? 'emerald' : 'amber',
    },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className={cn(
            'rounded-[1.45rem] border border-border/60 bg-background/70 p-4 shadow-sm dark:bg-white/[0.03]',
            card.tone === 'cyan' && 'dark:border-cyan-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.92),rgba(4,10,22,0.82))]',
            card.tone === 'emerald' && 'dark:border-emerald-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.14),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.92),rgba(4,10,22,0.82))]',
            card.tone === 'amber' && 'dark:border-amber-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.92),rgba(4,10,22,0.82))]',
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {card.title}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{card.value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{card.helper}</p>
          {card.delta ? (
            <div className="mt-3 inline-flex rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] font-semibold text-muted-foreground dark:bg-white/[0.03]">
              {card.delta}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [trafficDays, setTrafficDays] = useState(30);
  const { t, mounted, locale } = useLocale();
  const tf = (key: string, values: Record<string, string | number>) => {
    let text = t(key);
    for (const [name, value] of Object.entries(values)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
    }
    return text;
  };

  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: serverStatus, isLoading: serversLoading } = trpc.dashboard.serverStatus.useQuery();
  const { data: activity } = trpc.dashboard.recentActivity.useQuery();
  const { data: trafficHistory, isLoading: trafficLoading } = trpc.dashboard.trafficHistory.useQuery({ days: trafficDays });
  const { data: monthlyBusinessDashboard, isLoading: financeLoading } =
    trpc.analytics.monthlyBusinessDashboard.useQuery({ months: 6 });

  const totalTraffic = trafficHistory?.reduce((acc, curr) => acc + BigInt(curr.bytes), BigInt(0)) || BigInt(0);
  const totalServerKeys = serverStatus?.reduce((sum, item) => sum + item.keyCount, 0) || 0;
  const attentionCount =
    (stats?.downServers || 0) +
    (stats?.expiringIn24h || 0);
  const healthyShare = stats?.totalServers
    ? Math.round(((stats.activeServers || 0) / stats.totalServers) * 100)
    : 0;

  if (statsLoading || !mounted) {
    return (
      <div className="space-y-6 lg:space-y-8">
        <div className="ops-hero animate-pulse">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
            <div className="space-y-4">
              <div className="h-6 w-40 rounded-full bg-muted" />
              <div className="h-12 w-72 rounded-2xl bg-muted" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-28 rounded-[1.5rem] bg-muted" />
                ))}
              </div>
              <div className="rounded-[1.75rem] bg-muted/80 p-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-24 rounded-[1.35rem] bg-background/70" />
                  ))}
                </div>
                <div className="mt-4 h-[400px] rounded-[1.6rem] bg-background/70" />
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="h-72 rounded-[1.75rem] bg-muted" />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-[420px] rounded-[1.75rem] bg-muted" />
            </div>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-72 rounded-[1.75rem] bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
      <div className="space-y-6 lg:space-y-8">
        <section className="space-y-6 xl:hidden">
          <div className="ops-showcase space-y-5">
            <div className="space-y-3">
              <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
                <BarChart3 className="h-3.5 w-3.5" />
                {t('dashboard.control_center')}
              </span>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {t('dashboard.title')}
                </h1>
                <p className="text-sm leading-7 text-muted-foreground">
                  {t('dashboard.welcome')}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild className="h-11 rounded-full px-5 shadow-sm">
                <Link href="/dashboard/servers">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('dashboard.add_server')}
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-full border-border/70 bg-background/70 px-5 shadow-sm">
                <Link href="/dashboard/keys">
                  <Key className="mr-2 h-4 w-4" />
                  {t('dashboard.create_key')}
                </Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ControlMetricTile
                title={t('dashboard.total_servers')}
                value={stats?.totalServers || 0}
                subtitle={`${stats?.activeServers || 0} ${t('dashboard.active')} • ${stats?.downServers || 0} ${t('dashboard.down')}`}
                icon={Server}
                iconClassName="border-cyan-500/15 bg-cyan-500/10 text-cyan-500"
                href="/dashboard/servers"
              />
              <ControlMetricTile
                title={t('dashboard.total_keys')}
                value={stats?.totalKeys || 0}
                subtitle={`${stats?.activeKeys || 0} ${t('dashboard.active')}`}
                icon={Key}
                iconClassName="border-violet-500/15 bg-violet-500/10 text-violet-500"
                href="/dashboard/keys"
              />
              <ControlMetricTile
                title={t('dashboard.total_traffic')}
                value={formatBytes(stats?.totalTrafficBytes || BigInt(0))}
                subtitle={t('dashboard.all_time')}
                icon={TrendingUp}
                iconClassName="border-cyan-500/15 bg-cyan-500/10 text-cyan-500"
              />
              <ControlMetricTile
                title={t('dashboard.alerts')}
                value={attentionCount}
                subtitle={t('dashboard.attention_queue_desc')}
                icon={AlertTriangle}
                iconClassName="border-rose-500/15 bg-rose-500/10 text-rose-500"
                href="/dashboard/notifications"
              />
            </div>

            <FinanceTrendCards
              locale={locale}
              loading={financeLoading}
              dashboard={monthlyBusinessDashboard}
            />

            <div className="grid gap-4">
              <div className="ops-panel space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="ops-section-heading">{t('dashboard.live_pulse')}</p>
                    <h2 className="mt-2 text-xl font-semibold">{t('dashboard.system_status')}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('dashboard.live_pulse_desc')}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      attentionCount > 0
                        ? 'border-amber-500/25 bg-amber-500/10 text-amber-500'
                        : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
                    )}
                  >
                    {attentionCount > 0 ? t('dashboard.attention_needed') : t('dashboard.system_clear')}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="ops-mini-tile text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.health_score')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{healthyShare}%</p>
                  </div>
                  <div className="ops-mini-tile text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.active')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{stats?.activeServers || 0}</p>
                  </div>
                  <div className="ops-mini-tile text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.expiring_soon')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{stats?.expiringIn24h || 0}</p>
                  </div>
                </div>

                <Link href="/dashboard/notifications" className="ops-action-tile">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {attentionCount > 0 ? t('dashboard.attention_needed') : t('dashboard.system_clear')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('dashboard.review_alerts_desc')}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </div>

              <SecurityAlertsSummaryCard />

              <div className="ops-panel space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="ops-section-heading">{t('dashboard.key_operations_title')}</p>
                    <h2 className="mt-2 text-xl font-semibold">{t('dashboard.key_operations_title')}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('dashboard.key_operations_desc')}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button asChild className="h-11 rounded-full px-5 shadow-sm">
                    <Link href="/dashboard/keys">
                      <Key className="mr-2 h-4 w-4" />
                      {t('dashboard.create_key')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 rounded-full border-border/70 bg-background/70 px-5 shadow-sm">
                    <Link href="/dashboard/servers">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('dashboard.add_server')}
                    </Link>
                  </Button>
                </div>
                <KeyOperationsSummary stats={stats} t={t} embedded />
              </div>

              <KeySourceBreakdownCard t={t} sourceCounts={stats?.sourceCounts} />
            </div>

            <TrafficOverviewPanel
              t={t}
              tf={tf}
              trafficDays={trafficDays}
              setTrafficDays={setTrafficDays}
              totalTraffic={totalTraffic}
              activeServers={stats?.activeServers || 0}
              totalKeys={totalServerKeys}
              expiringSoon={stats?.expiringIn24h || 0}
              trafficLoading={trafficLoading}
              trafficHistory={trafficHistory}
              compact
            />

            <div className="grid gap-6 md:grid-cols-2">
              <ServerStatusCard
                t={t}
                serverStatus={serverStatus}
                serversLoading={serversLoading}
              />
              <AlertsActivityCard
                t={t}
                tf={tf}
                stats={stats}
                activity={activity}
              />
            </div>
          </div>
        </section>

        <section className="hidden xl:grid xl:grid-cols-[minmax(0,1.6fr)_360px] xl:gap-6">
          <div className="ops-showcase flex self-start flex-col gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
                  <BarChart3 className="h-3.5 w-3.5" />
                  {t('dashboard.control_center')}
                </span>
                <div className="space-y-3">
                  <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl xl:text-[2.8rem]">
                    {t('dashboard.title')}
                  </h1>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                    {t('dashboard.welcome')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild className="h-11 rounded-full px-5 shadow-sm">
                  <Link href="/dashboard/servers">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('dashboard.add_server')}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-full border-border/70 bg-background/70 px-5 shadow-sm">
                  <Link href="/dashboard/keys">
                    <Key className="mr-2 h-4 w-4" />
                    {t('dashboard.create_key')}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="ops-metric-strip">
              <ControlMetricTile
                title={t('dashboard.total_servers')}
                value={stats?.totalServers || 0}
                subtitle={`${stats?.activeServers || 0} ${t('dashboard.active')} • ${stats?.downServers || 0} ${t('dashboard.down')}`}
                icon={Server}
                iconClassName="border-cyan-500/15 bg-cyan-500/10 text-cyan-500"
                href="/dashboard/servers"
              />
              <ControlMetricTile
                title={t('dashboard.online_servers')}
                value={stats?.activeServers || 0}
                subtitle={t('dashboard.online_servers_desc')}
                icon={Globe2}
                iconClassName="border-emerald-500/15 bg-emerald-500/10 text-emerald-500"
                href="/dashboard/servers"
              />
              <ControlMetricTile
                title={t('dashboard.total_traffic')}
                value={formatBytes(stats?.totalTrafficBytes || BigInt(0))}
                subtitle={t('dashboard.all_time')}
                icon={TrendingUp}
                iconClassName="border-cyan-500/15 bg-cyan-500/10 text-cyan-500"
              />
              <ControlMetricTile
                title={t('dashboard.alerts')}
                value={attentionCount}
                subtitle={t('dashboard.attention_queue_desc')}
                icon={AlertTriangle}
                iconClassName="border-rose-500/15 bg-rose-500/10 text-rose-500"
                href="/dashboard/notifications"
              />
            </div>

            <FinanceTrendCards
              locale={locale}
              loading={financeLoading}
              dashboard={monthlyBusinessDashboard}
            />

            <TrafficOverviewPanel
              t={t}
              tf={tf}
              trafficDays={trafficDays}
              setTrafficDays={setTrafficDays}
              totalTraffic={totalTraffic}
              activeServers={stats?.activeServers || 0}
              totalKeys={totalServerKeys}
              expiringSoon={stats?.expiringIn24h || 0}
              trafficLoading={trafficLoading}
              trafficHistory={trafficHistory}
              compact
              fillHeight
            />

            <div className="grid items-stretch gap-6 xl:grid-cols-2">
              <ServerStatusCard
                t={t}
                serverStatus={serverStatus}
                serversLoading={serversLoading}
                compact
              />
              <AlertsActivityCard
                t={t}
                tf={tf}
                stats={stats}
                activity={activity}
                compact
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="ops-panel space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="ops-section-heading">{t('dashboard.live_pulse')}</p>
                  <h2 className="mt-2 text-2xl font-semibold">{t('dashboard.system_status')}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('dashboard.live_pulse_desc')}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold',
                    attentionCount > 0
                      ? 'border-amber-500/25 bg-amber-500/10 text-amber-500'
                      : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
                  )}
                >
                  {attentionCount > 0 ? t('dashboard.attention_needed') : t('dashboard.system_clear')}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="ops-mini-tile text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('dashboard.health_score')}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{healthyShare}%</p>
                </div>
                <div className="ops-mini-tile text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('dashboard.active')}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{stats?.activeServers || 0}</p>
                </div>
                <div className="ops-mini-tile text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('dashboard.expiring_soon')}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{stats?.expiringIn24h || 0}</p>
                </div>
              </div>

              <Link href="/dashboard/notifications" className="ops-action-tile">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {attentionCount > 0 ? t('dashboard.attention_needed') : t('dashboard.system_clear')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('dashboard.review_alerts_desc')}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </div>

            <SecurityAlertsSummaryCard />

            <div className="ops-panel space-y-4">
              <div className="space-y-2">
                <p className="ops-section-heading">{t('dashboard.key_operations_title')}</p>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{t('dashboard.key_operations_title')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('dashboard.key_operations_desc')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild className="h-11 rounded-full px-5 shadow-sm">
                  <Link href="/dashboard/keys">
                    <Key className="mr-2 h-4 w-4" />
                    {t('dashboard.create_key')}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-full border-border/70 bg-background/70 px-5 shadow-sm">
                  <Link href="/dashboard/servers">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('dashboard.add_server')}
                  </Link>
                </Button>
              </div>

              <KeyOperationsSummary stats={stats} t={t} embedded />
            </div>

            <KeySourceBreakdownCard t={t} sourceCounts={stats?.sourceCounts} />
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:hidden">
          <ServerStatusCard
            t={t}
            serverStatus={serverStatus}
            serversLoading={serversLoading}
          />
          <AlertsActivityCard
            t={t}
            tf={tf}
            stats={stats}
            activity={activity}
          />
        </section>
      </div>
  );
}
