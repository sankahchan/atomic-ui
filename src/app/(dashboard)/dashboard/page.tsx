'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gauge,
  Globe2,
  Info,
  Key,
  Plus,
  RefreshCw,
  Server,
  TrendingUp,
  Zap,
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
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: 'neutral' | 'cyan' | 'emerald' | 'violet' | 'amber';
}) {
  const toneClass = {
    neutral: 'dark:border-cyan-400/12 dark:bg-[linear-gradient(180deg,rgba(5,13,26,0.82),rgba(4,10,22,0.72))]',
    cyan: 'dark:border-cyan-400/16 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_55%),linear-gradient(180deg,rgba(5,13,26,0.84),rgba(4,10,22,0.74))]',
    emerald: 'dark:border-emerald-400/16 dark:bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.1),transparent_55%),linear-gradient(180deg,rgba(5,13,26,0.84),rgba(4,10,22,0.74))]',
    violet: 'dark:border-violet-400/16 dark:bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.1),transparent_55%),linear-gradient(180deg,rgba(5,13,26,0.84),rgba(4,10,22,0.74))]',
    amber: 'dark:border-amber-400/16 dark:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.1),transparent_55%),linear-gradient(180deg,rgba(5,13,26,0.84),rgba(4,10,22,0.74))]',
  }[tone];

  return (
    <div className={cn(
      'rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-4 dark:shadow-[inset_0_1px_0_rgba(125,211,252,0.04)]',
      toneClass
    )}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
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
}) {
  return (
    <Card className="border-white/45 bg-white/65 dark:border-cyan-400/16 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.1),transparent_30%),linear-gradient(180deg,rgba(3,10,22,0.92),rgba(5,12,24,0.82))] dark:shadow-[0_24px_70px_rgba(1,6,20,0.48),0_0_0_1px_rgba(34,211,238,0.05),inset_0_1px_0_rgba(125,211,252,0.05)]">
      <CardHeader className={cn(compact ? 'pb-3' : 'pb-4')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-500 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:shadow-[0_0_24px_rgba(34,211,238,0.12)]">
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
            <SelectTrigger className="h-11 w-full rounded-full border-border/70 bg-background/65 sm:w-[160px] dark:border-cyan-400/18 dark:bg-[linear-gradient(180deg,rgba(7,17,32,0.92),rgba(5,12,24,0.82))]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('dashboard.days_7')}</SelectItem>
              <SelectItem value="30">{t('dashboard.days_30')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-4')}>
          <TrafficSnapshotStat
            label={t('dashboard.total_traffic')}
            value={formatBytes(totalTraffic)}
            helper={t('dashboard.all_time')}
            tone="cyan"
          />
          <TrafficSnapshotStat
            label={t('dashboard.online_servers')}
            value={activeServers}
            helper={t('dashboard.online_servers_desc')}
            tone="emerald"
          />
          <TrafficSnapshotStat
            label={t('dashboard.total_keys')}
            value={totalKeys}
            helper={`${totalKeys} ${t('dashboard.active')}`}
            tone="violet"
          />
          <TrafficSnapshotStat
            label={t('dashboard.expiring_soon')}
            value={expiringSoon}
            helper={t('dashboard.expiring_24h')}
            tone="amber"
          />
        </div>

        {trafficLoading ? (
          <div className={cn('rounded-[1.6rem] bg-muted animate-pulse', compact ? 'h-[210px]' : 'h-[220px]')} />
        ) : trafficHistory && trafficHistory.length > 0 ? (
          <div className="rounded-[1.6rem] border border-border/60 bg-background/45 p-3 dark:border-cyan-400/12 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_26%),linear-gradient(180deg,rgba(4,11,23,0.82),rgba(4,10,21,0.72))]">
            <div className={cn(compact ? 'h-[210px]' : 'h-[220px]')}>
              <TrafficChart data={trafficHistory} type="area" height="100%" color="rgba(34,211,238,0.95)" />
            </div>
          </div>
        ) : (
          <div className={cn(
            'flex flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 px-6 text-center dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(4,11,23,0.7),rgba(4,10,21,0.62))]',
            compact ? 'h-[210px]' : 'h-[220px]'
          )}>
            <TrendingUp className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-semibold">{t('dashboard.no_traffic_title')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_traffic_desc')}</p>
          </div>
        )}
      </CardContent>
    </Card>
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

function ForecastTooltip({
  keyId,
  keyType,
}: {
  keyId: string;
  keyType: 'ACCESS_KEY' | 'DYNAMIC_KEY';
}) {
  const { data: forecast, isLoading } = trpc.analytics.forecast.useQuery(
    { keyId, keyType },
    { staleTime: 60000 }
  );

  if (isLoading) {
    return (
      <TooltipContent className="max-w-xs">
        <p className="text-xs">Loading forecast...</p>
      </TooltipContent>
    );
  }

  if (!forecast || !forecast.hasQuota) {
    return (
      <TooltipContent className="max-w-xs">
        <p className="text-xs text-muted-foreground">No quota limit set</p>
      </TooltipContent>
    );
  }

  return (
    <TooltipContent className="max-w-xs p-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Usage Forecast</span>
        </div>
        <div className="space-y-1 text-xs">
          <p>
            <span className="text-muted-foreground">Current:</span>{' '}
            {formatBytes(BigInt(forecast.currentUsageBytes || '0'))} /{' '}
            {formatBytes(BigInt(forecast.dataLimitBytes || '0'))} ({forecast.usagePercent}%)
          </p>
          {forecast.dailyRateBytes ? (
            <p>
              <span className="text-muted-foreground">Daily rate:</span>{' '}
              ~{formatBytes(BigInt(forecast.dailyRateBytes))}/day
            </p>
          ) : null}
          {forecast.daysToQuota !== null && forecast.daysToQuota !== undefined ? (
            <p
              className={cn(
                'font-medium',
                forecast.daysToQuota <= 3
                  ? 'text-red-500'
                  : forecast.daysToQuota <= 7
                    ? 'text-yellow-500'
                    : 'text-green-500'
              )}
            >
              <Clock className="mr-1 inline h-3 w-3" />
              {forecast.message}
            </p>
          ) : null}
        </div>
      </div>
    </TooltipContent>
  );
}

export default function DashboardPage() {
  const [trafficDays, setTrafficDays] = useState(30);
  const [topConsumersRange, setTopConsumersRange] = useState<'24h' | '7d' | '30d'>('24h');
  const { t, mounted } = useLocale();
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
  const { data: topConsumers, isLoading: loadingTopConsumers } = trpc.analytics.topConsumers.useQuery({
    range: topConsumersRange,
    limit: 5,
  });
  const { data: anomalies, isLoading: loadingAnomalies } = trpc.analytics.anomalies.useQuery({
    range: '24h',
  });

  const totalTraffic = trafficHistory?.reduce((acc, curr) => acc + BigInt(curr.bytes), BigInt(0)) || BigInt(0);
  const totalServerKeys = serverStatus?.reduce((sum, item) => sum + item.keyCount, 0) || 0;
  const attentionCount =
    (stats?.downServers || 0) +
    (stats?.expiringIn24h || 0) +
    (anomalies?.length || 0);
  const healthyShare = stats?.totalServers
    ? Math.round(((stats.activeServers || 0) / stats.totalServers) * 100)
    : 0;

  if (statsLoading || !mounted) {
    return (
      <div className="space-y-6 lg:space-y-8">
        <div className="ops-hero animate-pulse">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_380px]">
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
                <div className="mt-4 h-[220px] rounded-[1.6rem] bg-background/70" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-[420px] rounded-[1.75rem] bg-muted" />
            </div>
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-2 xl:auto-rows-fr">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-72 rounded-[1.75rem] bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 lg:space-y-8">
        <section className="space-y-6 xl:hidden">
          <div className="ops-hero">
            <div className="space-y-5">
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

                <div className="grid gap-3 grid-cols-3">
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/55 px-3 py-3 text-center dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.health_score')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{healthyShare}%</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/55 px-3 py-3 text-center dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.active')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{stats?.activeServers || 0}</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/55 px-3 py-3 text-center dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.expiring_soon')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{stats?.expiringIn24h || 0}</p>
                  </div>
                </div>

                <Link
                  href="/dashboard/notifications"
                  className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-border/60 bg-background/55 px-4 py-4 transition-colors hover:bg-background/80 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                >
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

                <KeyOperationsSummary stats={stats} t={t} embedded />
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
            </div>
          </div>
        </section>

        <section className="hidden xl:block ops-hero">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_400px]">
            <div className="space-y-6">
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

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <ControlMetricTile
                  title={t('dashboard.total_servers')}
                  value={stats?.totalServers || 0}
                  subtitle={`${stats?.activeServers || 0} ${t('dashboard.active')} • ${stats?.downServers || 0} ${t('dashboard.down')}`}
                  icon={Server}
                  iconClassName="border-cyan-500/15 bg-cyan-500/10 text-cyan-500"
                  href="/dashboard/servers"
                />
                <div className="hidden xl:block">
                  <ControlMetricTile
                    title={t('dashboard.online_servers')}
                    value={stats?.activeServers || 0}
                    subtitle={t('dashboard.online_servers_desc')}
                    icon={Globe2}
                    iconClassName="border-emerald-500/15 bg-emerald-500/10 text-emerald-500"
                    href="/dashboard/servers"
                  />
                </div>
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
                <div className="hidden xl:block">
                  <ControlMetricTile
                    title={t('dashboard.expiring_soon')}
                    value={stats?.expiringIn24h || 0}
                    subtitle={t('dashboard.expiring_24h')}
                    icon={Clock}
                    iconClassName="border-amber-500/15 bg-amber-500/10 text-amber-500"
                    href="/dashboard/keys?status=expiring"
                  />
                </div>
                <ControlMetricTile
                  title={t('dashboard.alerts')}
                  value={attentionCount}
                  subtitle={t('dashboard.attention_queue_desc')}
                  icon={AlertTriangle}
                  iconClassName="border-rose-500/15 bg-rose-500/10 text-rose-500"
                  href="/dashboard/notifications"
                />
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
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/55 px-3 py-3 text-center dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.health_score')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{healthyShare}%</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/55 px-3 py-3 text-center dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.active')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{stats?.activeServers || 0}</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/55 px-3 py-3 text-center dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('dashboard.expiring_soon')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{stats?.expiringIn24h || 0}</p>
                  </div>
                </div>

                <Link
                  href="/dashboard/notifications"
                  className="flex items-center justify-between gap-3 rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-4 transition-colors hover:bg-background/80 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                >
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

                <KeyOperationsSummary stats={stats} t={t} embedded />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2 xl:auto-rows-fr">
          <Card className="self-start xl:h-full">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{t('dashboard.top_consumers')}</CardTitle>
                    <CardDescription>{t('dashboard.top_consumers_desc')}</CardDescription>
                  </div>
                </div>
                <Select value={topConsumersRange} onValueChange={(value) => setTopConsumersRange(value as '24h' | '7d' | '30d')}>
                  <SelectTrigger className="h-11 w-full rounded-full border-border/70 bg-background/65 sm:w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">{t('dashboard.range_24h')}</SelectItem>
                    <SelectItem value="7d">{t('dashboard.range_7d')}</SelectItem>
                    <SelectItem value="30d">{t('dashboard.range_30d')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingTopConsumers ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-[1.25rem] bg-muted animate-pulse" />
                ))
              ) : topConsumers && topConsumers.length > 0 ? (
                topConsumers.slice(0, 5).map((consumer) => (
                  <Tooltip key={consumer.id}>
                    <TooltipTrigger asChild>
                      <Link
                        href={
                          consumer.type === 'ACCESS_KEY'
                            ? `/dashboard/keys/${consumer.id}`
                            : `/dashboard/dynamic-keys/${consumer.id}`
                        }
                        className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-3 transition-colors hover:bg-background/80 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
                            <Key className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{consumer.name}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {consumer.serverName
                                ? `${consumer.countryCode ? getCountryFlag(consumer.countryCode) : ''} ${consumer.serverName}`.trim()
                                : t('dashboard.dynamic_target')}
                            </p>
                          </div>
                          {consumer.dataLimitBytes ? (
                            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatBytes(BigInt(consumer.deltaBytes))}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t('dashboard.period_usage')}</p>
                        </div>
                      </Link>
                    </TooltipTrigger>
                    <ForecastTooltip keyId={consumer.id} keyType={consumer.type} />
                    </Tooltip>
                ))
              ) : (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(4,11,23,0.7),rgba(4,10,21,0.62))]">
                  <Activity className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-semibold">{t('dashboard.no_usage_title')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_usage_desc')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="self-start xl:h-full">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">{t('dashboard.usage_anomalies')}</CardTitle>
                  <CardDescription>{t('dashboard.usage_anomalies_desc')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingAnomalies ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-[1.25rem] bg-muted animate-pulse" />
                ))
              ) : anomalies && anomalies.length > 0 ? (
                anomalies.slice(0, 5).map((anomaly) => (
                  <Link
                    key={anomaly.id}
                    href={
                      anomaly.type === 'ACCESS_KEY'
                        ? `/dashboard/keys/${anomaly.id}`
                        : `/dashboard/dynamic-keys/${anomaly.id}`
                    }
                    className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-amber-500/20 bg-amber-500/10 px-4 py-3 transition-colors hover:bg-amber-500/15"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{anomaly.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {anomaly.serverName || t('dashboard.dynamic_target')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">{anomaly.ratio}x</Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatBytes(BigInt(anomaly.recentDeltaBytes))}
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(4,11,23,0.7),rgba(4,10,21,0.62))]">
                  <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500/70" />
                  <p className="text-sm font-semibold">{t('dashboard.no_anomalies_title')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_anomalies_desc')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="self-start xl:h-full">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{t('dashboard.server_status')}</CardTitle>
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
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-[1.25rem] bg-muted animate-pulse" />
                ))
              ) : serverStatus && serverStatus.length > 0 ? (
                serverStatus.slice(0, 5).map((server) => (
                  <ServerRow key={server.id} server={server} />
                ))
              ) : (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(4,11,23,0.7),rgba(4,10,21,0.62))]">
                  <Server className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-semibold">{t('dashboard.no_servers_title')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_servers_desc')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="self-start xl:h-full">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">{t('dashboard.alerts')}</CardTitle>
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
              {activity?.recentKeys && activity.recentKeys.length > 0
                ? activity.recentKeys.slice(0, 4).map((key) => (
                    <ActivityItem
                      key={key.id}
                      type="info"
                      title={t('dashboard.key_created_title')}
                      description={key.name}
                      time={formatRelativeTime(key.createdAt)}
                    />
                  ))
                : null}
              {!((stats?.downServers || 0) > 0) &&
              !((stats?.expiringIn24h || 0) > 0) &&
              (!activity?.recentKeys || activity.recentKeys.length === 0) ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(4,11,23,0.7),rgba(4,10,21,0.62))]">
                  <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500/70" />
                  <p className="text-sm font-semibold">{t('dashboard.system_clear')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_activity_desc')}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </TooltipProvider>
  );
}
