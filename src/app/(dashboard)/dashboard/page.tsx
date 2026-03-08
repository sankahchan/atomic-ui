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
  ArrowRight,
  ArrowUpRight,
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
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

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

function QuickActionLink({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-background/75 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function FocusRow({
  title,
  description,
  count,
  tone,
  href,
}: {
  title: string;
  description: string;
  count: string | number;
  tone: 'danger' | 'warning' | 'success' | 'info';
  href?: string;
}) {
  const toneClass = {
    danger: 'border-rose-500/20 bg-rose-500/10 text-rose-500',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
    info: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-500',
  }[tone];

  const content = (
    <div className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-3 dark:bg-white/[0.02]">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className={cn('rounded-full border px-3 py-1 text-xs font-semibold', toneClass)}>
        {count}
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
  const { data: topUsers, isLoading: loadingTopUsers } = trpc.dashboard.topUsers.useQuery({ limit: 5 });
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
              <div className="h-[320px] rounded-[1.75rem] bg-muted" />
            </div>
            <div className="space-y-4">
              <div className="h-64 rounded-[1.75rem] bg-muted" />
              <div className="h-64 rounded-[1.75rem] bg-muted" />
            </div>
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="h-72 rounded-[1.75rem] bg-muted animate-pulse" />
          <div className="h-72 rounded-[1.75rem] bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 lg:space-y-8">
        <section className="ops-hero">
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
                <ControlMetricTile
                  title={t('dashboard.online_servers')}
                  value={stats?.activeServers || 0}
                  subtitle={t('dashboard.online_servers_desc')}
                  icon={Globe2}
                  iconClassName="border-emerald-500/15 bg-emerald-500/10 text-emerald-500"
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
                  title={t('dashboard.expiring_soon')}
                  value={stats?.expiringIn24h || 0}
                  subtitle={t('dashboard.expiring_24h')}
                  icon={Clock}
                  iconClassName="border-amber-500/15 bg-amber-500/10 text-amber-500"
                  href="/dashboard/keys?status=expiring"
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

              <Card className="border-white/45 bg-white/65 dark:border-white/10 dark:bg-slate-950/30">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
                          <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-xl">{t('dashboard.traffic_overview')}</CardTitle>
                          <CardDescription>
                            {formatBytes(totalTraffic)} {tf('dashboard.traffic_last_days', { days: trafficDays.toString() })}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                    <Select value={trafficDays.toString()} onValueChange={(value) => setTrafficDays(parseInt(value, 10))}>
                      <SelectTrigger className="h-11 w-full rounded-full border-border/70 bg-background/65 sm:w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">{t('dashboard.days_7')}</SelectItem>
                        <SelectItem value="30">{t('dashboard.days_30')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-4 dark:bg-white/[0.02]">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t('dashboard.total_traffic')}
                      </p>
                      <p className="mt-3 text-2xl font-semibold">{formatBytes(totalTraffic)}</p>
                    </div>
                    <div className="rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-4 dark:bg-white/[0.02]">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t('dashboard.online_servers')}
                      </p>
                      <p className="mt-3 text-2xl font-semibold">{stats?.activeServers || 0}</p>
                    </div>
                    <div className="rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-4 dark:bg-white/[0.02]">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t('dashboard.total_keys')}
                      </p>
                      <p className="mt-3 text-2xl font-semibold">{totalServerKeys}</p>
                    </div>
                  </div>

                  {trafficLoading ? (
                    <div className="h-[300px] rounded-[1.6rem] bg-muted animate-pulse" />
                  ) : trafficHistory && trafficHistory.length > 0 ? (
                    <div className="h-[300px] rounded-[1.6rem] border border-border/60 bg-background/45 p-2 dark:bg-white/[0.02]">
                      <TrafficChart data={trafficHistory} type="area" height="100%" />
                    </div>
                  ) : (
                    <div className="flex h-[240px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:bg-white/[0.02]">
                      <TrendingUp className="mb-3 h-10 w-10 text-muted-foreground/50" />
                      <p className="text-sm font-semibold">{t('dashboard.no_traffic_title')}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_traffic_desc')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
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
                      {t('dashboard.alerts')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{attentionCount}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <FocusRow
                    title={t('dashboard.server_status')}
                    description={t('dashboard.focus_servers_desc')}
                    count={`${stats?.downServers || 0}`}
                    tone={(stats?.downServers || 0) > 0 ? 'danger' : 'success'}
                    href="/dashboard/servers"
                  />
                  <FocusRow
                    title={t('dashboard.expiring_soon')}
                    description={t('dashboard.focus_expiring_desc')}
                    count={`${stats?.expiringIn24h || 0}`}
                    tone={(stats?.expiringIn24h || 0) > 0 ? 'warning' : 'success'}
                    href="/dashboard/keys?status=expiring"
                  />
                  <FocusRow
                    title={t('dashboard.usage_anomalies')}
                    description={t('dashboard.focus_anomalies_desc')}
                    count={`${anomalies?.length || 0}`}
                    tone={(anomalies?.length || 0) > 0 ? 'warning' : 'info'}
                    href="/dashboard/audit"
                  />
                </div>
              </div>

              <div className="ops-panel space-y-4">
                <div>
                  <p className="ops-section-heading">{t('dashboard.quick_actions')}</p>
                  <h2 className="mt-2 text-2xl font-semibold">{t('dashboard.quick_actions')}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{t('dashboard.quick_actions_desc')}</p>
                </div>

                <div className="grid gap-3">
                  <QuickActionLink
                    href="/dashboard/servers"
                    title={t('dashboard.add_server')}
                    description={t('dashboard.manage_servers_desc')}
                    icon={Server}
                  />
                  <QuickActionLink
                    href="/dashboard/keys"
                    title={t('dashboard.create_key')}
                    description={t('dashboard.manage_keys_desc')}
                    icon={Key}
                  />
                  <QuickActionLink
                    href="/dashboard/notifications"
                    title={t('dashboard.configure_alerts')}
                    description={t('dashboard.review_alerts_desc')}
                    icon={ShieldCheck}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2 xl:items-start">
          <Card className="self-start">
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
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:bg-white/[0.02]">
                  <Activity className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-semibold">{t('dashboard.no_usage_title')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_usage_desc')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="self-start">
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
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:bg-white/[0.02]">
                  <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500/70" />
                  <p className="text-sm font-semibold">{t('dashboard.no_anomalies_title')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_anomalies_desc')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="self-start">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">{t('dashboard.top_users_title')}</CardTitle>
                  <CardDescription>{t('dashboard.top_users_desc')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingTopUsers ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-[1.25rem] bg-muted animate-pulse" />
                ))
              ) : topUsers && topUsers.length > 0 ? (
                topUsers.slice(0, 5).map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-border/60 bg-background/55 px-4 py-3 dark:bg-white/[0.02]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {user.countryCode ? getCountryFlag(user.countryCode) : ''} {user.serverName}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatBytes(user.usedBytes)}</p>
                  </div>
                ))
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:bg-white/[0.02]">
                  <Users className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-semibold">{t('dashboard.no_top_users_title')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_top_users_desc')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start">
          <Card className="self-start">
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
                <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:bg-white/[0.02]">
                  <Server className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-semibold">{t('dashboard.no_servers_title')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.no_servers_desc')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="self-start">
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
                <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-background/45 text-center dark:bg-white/[0.02]">
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
