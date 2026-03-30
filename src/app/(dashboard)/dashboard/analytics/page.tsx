'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { useLocale } from '@/hooks/use-locale';
import { cn, formatBytes, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Gauge,
  Info,
  Key,
  QrCode,
  Send,
  Share2,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

function ForecastTooltip({
  keyId,
  keyType,
}: {
  keyId: string;
  keyType: 'ACCESS_KEY' | 'DYNAMIC_KEY';
}) {
  const { data: forecast, isLoading } = trpc.analytics.forecast.useQuery(
    { keyId, keyType },
    { staleTime: 60_000 }
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
          <Badge variant="outline" className="text-xs">
            {forecast.confidence} confidence
          </Badge>
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
          {!forecast.daysToQuota && forecast.message ? (
            <p className="text-muted-foreground">{forecast.message}</p>
          ) : null}
        </div>

        <p className="text-[10px] italic text-muted-foreground">
          * Estimated from recent usage patterns
        </p>
      </div>
    </TooltipContent>
  );
}

function AnalyticsStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="ops-kpi-tile">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

function getShareEventLabel(eventType: string) {
  switch (eventType) {
    case 'PAGE_VIEW':
      return 'Page view';
    case 'INVITE_OPEN':
      return 'Invite opened';
    case 'COPY_URL':
      return 'Copy URL';
    case 'OPEN_QR':
      return 'Open QR';
    case 'DOWNLOAD_QR':
      return 'QR downloaded';
    case 'OPEN_APP':
      return 'Open in app';
    case 'DOWNLOAD_CONFIG':
      return 'Config downloaded';
    case 'TELEGRAM_SENT':
      return 'Telegram send';
    case 'TELEGRAM_CONNECTED':
      return 'Telegram connected';
    default:
      return eventType.replaceAll('_', ' ');
  }
}

export default function AnalyticsPage() {
  const { t } = useLocale();
  const [days, setDays] = useState(30);
  const [topConsumersRange, setTopConsumersRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [shareRange, setShareRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [telegramSalesRange, setTelegramSalesRange] = useState<'24h' | '7d' | '30d'>('30d');

  const { data: trafficHistory, isLoading: loadingTraffic } = trpc.dashboard.trafficHistory.useQuery({ days });
  const { data: topUsers, isLoading: loadingTopUsers } = trpc.dashboard.topUsers.useQuery({ limit: 5 });
  const { data: peakHours, isLoading: loadingPeakHours } = trpc.dashboard.peakHours.useQuery({ days });
  const { data: topConsumers, isLoading: loadingTopConsumers } = trpc.analytics.topConsumers.useQuery({
    range: topConsumersRange,
    limit: 5,
  });
  const { data: anomalies, isLoading: loadingAnomalies } = trpc.analytics.anomalies.useQuery({
    range: '24h',
  });
  const { data: analyticsSummary, isLoading: loadingSummary } = trpc.analytics.summary.useQuery({
    range: topConsumersRange,
  });
  const { data: shareDashboard, isLoading: loadingShareDashboard } = trpc.analytics.shareDashboard.useQuery({
    range: shareRange,
    limit: 6,
  });
  const { data: telegramSalesDashboard, isLoading: loadingTelegramSalesDashboard } =
    trpc.analytics.telegramSalesDashboard.useQuery({
      range: telegramSalesRange,
      limit: 6,
    });

  const totalTraffic =
    trafficHistory?.reduce((acc, curr) => acc + BigInt(curr.bytes), BigInt(0)) ?? BigInt(0);

  const getHeatmapColor = (bytes: number, maxBytes: number) => {
    if (bytes === 0) return 'bg-muted/30 dark:bg-white/[0.03]';
    const intensity = bytes / maxBytes;
    if (intensity < 0.2) return 'bg-cyan-400/20';
    if (intensity < 0.4) return 'bg-cyan-400/35';
    if (intensity < 0.6) return 'bg-cyan-400/50';
    if (intensity < 0.8) return 'bg-cyan-400/70';
    return 'bg-cyan-300';
  };

  const maxPeakBytes = peakHours?.reduce((max, curr) => Math.max(max, curr.bytes), 0) || 0;

  const formatRevenueLabel = (currency: string, amount: number) => {
    const normalizedCurrency = currency.trim().toUpperCase();
    const formattedAmount = new Intl.NumberFormat('en-US').format(amount);
    if (normalizedCurrency === 'MMK') {
      return `${formattedAmount} Kyat`;
    }
    return `${formattedAmount} ${normalizedCurrency}`;
  };

  const daysOfWeek = [
    t('days.sunday') || 'Sun',
    t('days.monday') || 'Mon',
    t('days.tuesday') || 'Tue',
    t('days.wednesday') || 'Wed',
    t('days.thursday') || 'Thu',
    t('days.friday') || 'Fri',
    t('days.saturday') || 'Sat',
  ];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <section className="ops-showcase">
          <div className="ops-showcase-grid">
            <div className="space-y-5 self-start">
              <Badge
                variant="outline"
                className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
              >
                <BarChart3 className="mr-2 h-3.5 w-3.5" />
                Analytics Command Center
              </Badge>

              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                  Analytics
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Review period traffic, detect unusual usage, and identify the keys driving your highest bandwidth demand.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AnalyticsStatCard
                  label="Active keys"
                  value={loadingSummary ? '…' : analyticsSummary?.activeKeysCount || 0}
                  helper="Keys contributing to recent traffic activity."
                />
                <AnalyticsStatCard
                  label="Period usage"
                  value={loadingSummary ? '…' : formatBytes(BigInt(analyticsSummary?.totalDeltaBytes || '0'))}
                  helper={`Transferred in the selected ${topConsumersRange} window.`}
                />
                <AnalyticsStatCard
                  label="Anomalies"
                  value={loadingSummary ? '…' : analyticsSummary?.anomalyCount || 0}
                  helper="Usage spikes above the detected baseline."
                />
                <AnalyticsStatCard
                  label="Snapshots"
                  value={loadingSummary ? '…' : analyticsSummary?.snapshotCount || 0}
                  helper="Historical samples available for advanced reporting."
                />
              </div>
            </div>

            <div className="ops-detail-rail">
              <div className="ops-panel space-y-3">
                <div className="space-y-1">
                  <p className="ops-section-heading">Analytics controls</p>
                  <h2 className="text-xl font-semibold">Command rail</h2>
                  <p className="text-sm text-muted-foreground">
                    Change the history window, inspect operational summaries, or jump to exported reports and incidents.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Traffic window
                    </p>
                    <Select value={days.toString()} onValueChange={(value) => setDays(parseInt(value, 10))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Consumer range
                    </p>
                    <Select value={topConsumersRange} onValueChange={(v) => setTopConsumersRange(v as '24h' | '7d' | '30d')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">24h</SelectItem>
                        <SelectItem value="7d">7 days</SelectItem>
                        <SelectItem value="30d">30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Link href="/dashboard/reports" className="ops-action-tile">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Open reports
                    </span>
                    <span className="text-xs text-muted-foreground">Open</span>
                  </Link>
                  <Link href="/dashboard/incidents" className="ops-action-tile">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-primary" />
                      Review incidents
                    </span>
                    <span className="text-xs text-muted-foreground">Open</span>
                  </Link>
                </div>
              </div>

              <div className="ops-panel space-y-3">
                <div className="space-y-1">
                  <p className="ops-section-heading">Worker note</p>
                  <h2 className="text-xl font-semibold">Snapshot health</h2>
                </div>
                <div className="ops-detail-card space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Advanced analytics depend on periodic usage snapshots. Forecasts, anomalies, and top-consumer rankings improve as more samples are collected.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Snapshot worker
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {(analyticsSummary?.snapshotCount || 0) > 0 ? 'Collecting data' : 'Needs attention'}
                      </p>
                    </div>
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Forecast coverage
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {topConsumers?.filter((consumer) => consumer.dataLimitBytes).length || 0} quota-aware keys
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Card className="ops-panel">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-5 w-5 text-primary" />
              Traffic overview
            </CardTitle>
            <CardDescription>
              {formatBytes(totalTraffic)} transferred in the last {days} days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-0 pb-0">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Total traffic
                </p>
                <p className="mt-2 text-2xl font-semibold">{formatBytes(totalTraffic)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Across the selected chart range.</p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Online servers
                </p>
                <p className="mt-2 text-2xl font-semibold">{loadingSummary ? '…' : analyticsSummary?.activeKeysCount || 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">Keys currently showing recent traffic.</p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Active keys
                </p>
                <p className="mt-2 text-2xl font-semibold">{loadingSummary ? '…' : analyticsSummary?.activeKeysCount || 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">Keys contributing to current data samples.</p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Detected spikes
                </p>
                <p className="mt-2 text-2xl font-semibold">{loadingSummary ? '…' : analyticsSummary?.anomalyCount || 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">Flagged by the anomaly detector.</p>
              </div>
            </div>

            <div className="ops-detail-card h-[220px] md:h-[280px]">
              {loadingTraffic ? (
                <div className="ops-chart-empty h-full">
                  <div className="h-full w-full animate-pulse rounded-[1.5rem] bg-muted/40 dark:bg-white/[0.04]" />
                </div>
              ) : trafficHistory && trafficHistory.length > 0 ? (
                <TrafficChart data={trafficHistory} height="100%" />
              ) : (
                <div className="ops-chart-empty h-full">
                  <div className="space-y-2 text-center">
                    <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">No traffic history yet</p>
                    <p className="text-sm text-muted-foreground">
                      Traffic samples will appear here once the analytics worker has collected usage snapshots.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Share2 className="h-5 w-5 text-primary" />
                    Public share performance
                  </CardTitle>
                  <CardDescription>How users interact with public share pages, copied configs, and Telegram deliveries.</CardDescription>
                </div>
                <Select value={shareRange} onValueChange={(value) => setShareRange(value as '24h' | '7d' | '30d')}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-0 pb-0">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Public links</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.activePublicLinks || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Access + dynamic links currently exposed.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Page views</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.pageViews || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Share page opens in the selected range.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Invite opens</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.inviteOpens || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Distribution-link opens before the share page.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Copy clicks</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.copyClicks || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Raw URLs copied from public pages.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">QR opens</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.qrOpens || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Manual setup / QR-focused interactions.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">QR downloads</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.qrDownloads || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">QR PNG files downloaded from public pages.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">App opens</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.appOpens || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">One-click import attempts from the share page.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Config downloads</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.configDownloads || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Client config files downloaded by users.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Telegram sends</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.telegramSends || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Deliveries initiated through Telegram sharing.</p>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Access-key invites</p>
                    <h3 className="mt-2 text-lg font-semibold">Invite-link performance</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Track how access-key invite links are opened before users reach the public share page.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active invites</p>
                      <p className="mt-2 text-xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.accessInviteSummary.activeInviteLinks || 0}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Currently usable access-key invite links.</p>
                    </div>
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tracked keys</p>
                      <p className="mt-2 text-xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.accessInviteSummary.trackedAccessKeys || 0}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Access keys with invite links configured.</p>
                    </div>
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Invite opens</p>
                      <p className="mt-2 text-xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.accessInviteSummary.inviteOpens || 0}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Invite redirects recorded in the selected range.</p>
                    </div>
                  </div>
                </div>

                {loadingShareDashboard ? (
                  <div className="mt-4 space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                    ))}
                  </div>
                ) : shareDashboard && shareDashboard.topAccessInviteKeys.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {shareDashboard.topAccessInviteKeys.map((key) => (
                      <div key={key.id} className="rounded-[1.2rem] border border-border/60 bg-background/65 p-4 dark:bg-white/[0.02]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/dashboard/keys/${key.id}`} className="truncate font-medium hover:text-primary">
                              {key.name}
                            </Link>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {key.publicSlug ? `/s/${key.publicSlug}` : 'Token share link'}
                            </p>
                          </div>
                          <Badge variant="outline">{key.inviteOpens} opens</Badge>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Active links</p>
                            <p className="mt-2 text-lg font-semibold">{key.activeInviteLinks}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{key.totalInviteLinks} total</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Last invite open</p>
                            <p className="mt-2 text-sm font-medium">
                              {key.lastInviteOpenAt ? formatRelativeTime(key.lastInviteOpenAt) : 'No invite hits yet'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{key.pageViews} share-page views</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ops-chart-empty mt-4">
                    <div className="space-y-2 text-center">
                      <ExternalLink className="mx-auto h-8 w-8 text-muted-foreground/60" />
                      <p className="font-medium text-foreground">No access-key invite activity yet</p>
                      <p className="text-sm text-muted-foreground">
                        Create invite links on an access-key detail page to start tracking opens and conversions here.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {loadingShareDashboard ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : shareDashboard && shareDashboard.topLinks.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {shareDashboard.topLinks.map((link) => (
                      <div key={`${link.type}-${link.id}`} className="ops-mobile-card space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={link.type === 'ACCESS_KEY' ? `/dashboard/keys/${link.id}` : `/dashboard/dynamic-keys/${link.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {link.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {link.type === 'ACCESS_KEY' ? 'Access key' : 'Dynamic key'}
                              {link.publicSlug ? ` · /s/${link.publicSlug}` : ''}
                            </p>
                          </div>
                          <Badge variant="outline">{link.metrics.pageViews} views</Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Events</p>
                            <p className="mt-2 text-lg font-semibold">{link.metrics.totalEvents}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Invites {link.metrics.inviteOpens} · Copies {link.metrics.copyClicks} · App opens {link.metrics.appOpens}</p>
                          </div>
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Last activity</p>
                            <p className="mt-2 text-sm font-medium">
                              {link.lastEventAt ? formatRelativeTime(link.lastEventAt) : 'No recent activity'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {link.lastEventType ? getShareEventLabel(link.lastEventType) : 'Waiting for first hit'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="ops-data-shell hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Public link</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                          <TableHead className="text-right">Invites</TableHead>
                          <TableHead className="text-right">Copies</TableHead>
                          <TableHead className="text-right">Downloads</TableHead>
                          <TableHead className="text-right">App opens</TableHead>
                          <TableHead className="text-right">Telegram</TableHead>
                          <TableHead>Last activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shareDashboard.topLinks.map((link) => (
                          <TableRow key={`${link.type}-${link.id}`}>
                            <TableCell>
                              <div className="space-y-1">
                                <Link
                                  href={link.type === 'ACCESS_KEY' ? `/dashboard/keys/${link.id}` : `/dashboard/dynamic-keys/${link.id}`}
                                  className="font-medium hover:text-primary"
                                >
                                  {link.name}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                  {link.type === 'ACCESS_KEY' ? 'Access key' : 'Dynamic key'}
                                  {link.publicSlug ? ` · /s/${link.publicSlug}` : ''}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.pageViews}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.inviteOpens}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.copyClicks}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.qrDownloads + link.metrics.configDownloads}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.appOpens}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.telegramSends}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {link.lastEventAt ? (
                                <>
                                  <div>{formatRelativeTime(link.lastEventAt)}</div>
                                  <div className="text-xs">{link.lastEventType ? getShareEventLabel(link.lastEventType) : ''}</div>
                                </>
                              ) : (
                                'No recent activity'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Share2 className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">No public-share traffic yet</p>
                    <p className="text-sm text-muted-foreground">
                      Share-link events will appear here after users open pages, copy configs, or launch client apps.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Clock className="h-5 w-5 text-primary" />
                Recent share activity
              </CardTitle>
              <CardDescription>Latest page views, copy actions, app launches, and Telegram handoffs across public links.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-0 pb-0">
              {loadingShareDashboard ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                ))
              ) : shareDashboard && shareDashboard.recentEvents.length > 0 ? (
                shareDashboard.recentEvents.map((event) => {
                  const icon = event.eventType === 'COPY_URL'
                    ? <Copy className="h-4 w-4" />
                    : event.eventType === 'INVITE_OPEN'
                      ? <ExternalLink className="h-4 w-4" />
                    : event.eventType === 'OPEN_QR'
                      ? <QrCode className="h-4 w-4" />
                      : event.eventType === 'DOWNLOAD_QR' || event.eventType === 'DOWNLOAD_CONFIG'
                        ? <Download className="h-4 w-4" />
                      : event.eventType === 'TELEGRAM_SENT' || event.eventType === 'TELEGRAM_CONNECTED'
                        ? <Send className="h-4 w-4" />
                        : <Share2 className="h-4 w-4" />;

                  return (
                    <div key={event.id} className="ops-row-card flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2 text-primary">{icon}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {event.entityId ? (
                              <Link
                                href={event.type === 'ACCESS_KEY' ? `/dashboard/keys/${event.entityId}` : `/dashboard/dynamic-keys/${event.entityId}`}
                                className="truncate font-medium hover:text-primary"
                              >
                                {event.entityName}
                              </Link>
                            ) : (
                              <span className="truncate font-medium">{event.entityName}</span>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {event.type === 'ACCESS_KEY' ? 'Access key' : 'Dynamic key'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {getShareEventLabel(event.eventType)}
                            {event.platform ? ` · ${event.platform}` : ''}
                            {event.source ? ` · ${event.source}` : ''}
                            {event.publicSlug ? ` · /s/${event.publicSlug}` : ''}
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(event.createdAt)}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Clock className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">No recent share activity</p>
                    <p className="text-sm text-muted-foreground">
                      The latest public interactions will appear here once users start using share links.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Send className="h-5 w-5 text-primary" />
                    Telegram sales
                  </CardTitle>
                  <CardDescription>
                    Track Telegram order volume, review speed, plan performance, and collected pricing signals.
                  </CardDescription>
                </div>
                <Select
                  value={telegramSalesRange}
                  onValueChange={(value) => setTelegramSalesRange(value as '24h' | '7d' | '30d')}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-0 pb-0">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Orders</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.summary.totalOrders || 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Total Telegram sales orders in the selected range.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending review</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.summary.pendingReview || 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Orders waiting for payment-proof review.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fulfilled</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.summary.fulfilled || 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Orders that created or renewed keys successfully.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Awaiting proof</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.summary.awaitingPayment || 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Users still choosing a payment method or uploading proof.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg review time</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard
                      ? '…'
                      : telegramSalesDashboard?.averages.reviewMinutes !== null &&
                          telegramSalesDashboard?.averages.reviewMinutes !== undefined
                        ? `${Math.round(telegramSalesDashboard.averages.reviewMinutes)}m`
                        : '—'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">From proof upload to admin review.</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg fulfillment</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard
                      ? '…'
                      : telegramSalesDashboard?.averages.fulfillmentMinutes !== null &&
                          telegramSalesDashboard?.averages.fulfillmentMinutes !== undefined
                        ? `${Math.round(telegramSalesDashboard.averages.fulfillmentMinutes)}m`
                        : '—'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">From proof upload to delivered access.</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Top plans</p>
                      <h3 className="mt-2 text-lg font-semibold">Plan performance</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Best-performing Telegram plans by order volume and fulfilled revenue.
                      </p>
                    </div>
                    <Badge variant="outline">
                      {loadingTelegramSalesDashboard ? '…' : `${telegramSalesDashboard?.summary.newOrders || 0} new / ${telegramSalesDashboard?.summary.renewalOrders || 0} renew`}
                    </Badge>
                  </div>

                  {loadingTelegramSalesDashboard ? (
                    <div className="mt-4 space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                      ))}
                    </div>
                  ) : telegramSalesDashboard && telegramSalesDashboard.topPlans.length > 0 ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {telegramSalesDashboard.topPlans.map((plan) => (
                        <div key={plan.planCode || plan.planName} className="rounded-[1.2rem] border border-border/60 bg-background/65 p-4 dark:bg-white/[0.02]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{plan.planName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {plan.planCode || 'Custom plan'}
                              </p>
                            </div>
                            <Badge variant="outline">{plan.orders} orders</Badge>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Fulfilled</p>
                              <p className="mt-2 text-lg font-semibold">{plan.fulfilled}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {plan.orders > 0 ? `${Math.round((plan.fulfilled / plan.orders) * 100)}% success` : 'No approvals yet'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Revenue</p>
                              <div className="mt-2 space-y-1">
                                {plan.revenueByCurrency.length > 0 ? (
                                  plan.revenueByCurrency.map((revenue) => (
                                    <p key={`${plan.planCode || plan.planName}-${revenue.currency}`} className="text-sm font-medium">
                                      {formatRevenueLabel(revenue.currency, revenue.amount)}
                                    </p>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">No priced fulfillments yet</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ops-chart-empty mt-4">
                      <div className="space-y-2 text-center">
                        <Send className="mx-auto h-8 w-8 text-muted-foreground/60" />
                        <p className="font-medium text-foreground">No Telegram sales data yet</p>
                        <p className="text-sm text-muted-foreground">
                          Orders created from the bot will show plan performance and revenue here.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Conversion funnel</p>
                    <h3 className="mt-2 text-lg font-semibold">Telegram storefront flow</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          label: 'Orders created',
                          value: telegramSalesDashboard?.funnel.created || 0,
                        },
                        {
                          label: 'Method selected',
                          value: telegramSalesDashboard?.funnel.paymentMethodSelected || 0,
                        },
                        {
                          label: 'Proof uploaded',
                          value: telegramSalesDashboard?.funnel.proofUploaded || 0,
                        },
                        {
                          label: 'Reviewed',
                          value: telegramSalesDashboard?.funnel.reviewed || 0,
                        },
                        {
                          label: 'Fulfilled',
                          value: telegramSalesDashboard?.funnel.fulfilled || 0,
                        },
                      ].map((step) => (
                        <div key={step.label} className="ops-mini-tile">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {step.label}
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {loadingTelegramSalesDashboard ? '…' : step.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reminder conversion</p>
                    <h3 className="mt-2 text-lg font-semibold">Reminder effectiveness</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Payment reminders</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.reminders.paymentReminderSent || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : `${telegramSalesDashboard?.reminders.paymentReminderConverted || 0} progressed after reminder`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Review reminders</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.reminders.pendingReviewReminderSent || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : `${telegramSalesDashboard?.reminders.pendingReviewReminderConverted || 0} fulfilled after reminder`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Trial conversion</p>
                    <h3 className="mt-2 text-lg font-semibold">Free trial to paid</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fulfilled trials</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.trialConversion.fulfilledTrials || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Trial orders that were actually delivered.</p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Converted users</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.trialConversion.convertedUsers || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : telegramSalesDashboard?.trialConversion.conversionRate !== null &&
                                telegramSalesDashboard?.trialConversion.conversionRate !== undefined
                              ? `${Math.round(telegramSalesDashboard.trialConversion.conversionRate)}% trial-to-paid conversion`
                              : 'No paid conversions yet'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Converted paid orders</p>
                      <p className="mt-2 text-xl font-semibold">
                        {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.trialConversion.convertedPaidOrders || 0}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Paid Telegram orders linked to users who had a fulfilled free trial first.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Rejection reasons</p>
                    <h3 className="mt-2 text-lg font-semibold">Why proofs are rejected</h3>
                    <div className="mt-4 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.rejectionReasons.length > 0 ? (
                        telegramSalesDashboard.rejectionReasons.map((reason) => (
                          <div
                            key={reason.code}
                            className="rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{reason.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{reason.code}</p>
                              </div>
                              <Badge variant="outline">{reason.count}</Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="ops-chart-empty">
                          <div className="space-y-2 text-center">
                            <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">No rejection reasons yet</p>
                            <p className="text-sm text-muted-foreground">
                              Once orders are rejected with a preset reason, the breakdown will appear here.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Revenue by currency</p>
                    <h3 className="mt-2 text-lg font-semibold">Collected pricing</h3>
                    <div className="mt-4 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.revenueByCurrency.length > 0 ? (
                        telegramSalesDashboard.revenueByCurrency.map((revenue) => (
                          <div key={revenue.currency} className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {revenue.currency}
                            </p>
                            <p className="mt-2 text-xl font-semibold">{formatRevenueLabel(revenue.currency, revenue.amount)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">From fulfilled Telegram orders in this range.</p>
                          </div>
                        ))
                      ) : (
                        <div className="ops-chart-empty">
                          <div className="space-y-2 text-center">
                            <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">No revenue signals yet</p>
                            <p className="text-sm text-muted-foreground">
                              Set plan pricing in Telegram sales settings to track collected amounts here.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Payment methods</p>
                    <h3 className="mt-2 text-lg font-semibold">Checkout choices</h3>
                    <div className="mt-4 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.paymentMethods.length > 0 ? (
                        telegramSalesDashboard.paymentMethods.map((method) => (
                          <div key={method.paymentMethodCode || method.paymentMethodLabel} className="ops-mini-tile">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{method.paymentMethodLabel}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {method.orders} orders • {method.fulfilled} fulfilled
                                </p>
                              </div>
                              <Badge variant="outline">{method.paymentMethodCode || 'custom'}</Badge>
                            </div>
                            <div className="mt-3 space-y-1">
                              {method.revenueByCurrency.length > 0 ? (
                                method.revenueByCurrency.map((revenue) => (
                                  <p key={`${method.paymentMethodCode || method.paymentMethodLabel}-${revenue.currency}`} className="text-xs font-medium text-muted-foreground">
                                    {formatRevenueLabel(revenue.currency, revenue.amount)}
                                  </p>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">No fulfilled revenue yet</p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="ops-chart-empty">
                          <div className="space-y-2 text-center">
                            <Copy className="mx-auto h-8 w-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">No payment method data yet</p>
                            <p className="text-sm text-muted-foreground">
                              Orders will show whether customers picked KPay, Wave Pay, AYA Pay, or another method.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent orders</p>
                    <h3 className="mt-2 text-lg font-semibold">Latest Telegram orders</h3>
                    <div className="mt-4 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(4)].map((_, i) => (
                          <div key={i} className="h-18 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.recentOrders.length > 0 ? (
                        telegramSalesDashboard.recentOrders.map((order) => (
                          <div key={order.id} className="rounded-[1.1rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium">{order.orderCode}</p>
                                <p className="mt-1 truncate text-sm text-muted-foreground">
                                  {order.planName || order.planCode || order.kind}
                                </p>
                              </div>
                              <Badge variant="outline">{order.status}</Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{order.requestedName || `@${order.telegramUsername || order.telegramUserId}`}</span>
                              <span>•</span>
                              <span>{formatRelativeTime(order.createdAt)}</span>
                              {order.paymentMethodLabel ? (
                                <>
                                  <span>•</span>
                                  <span>{order.paymentMethodLabel}</span>
                                </>
                              ) : null}
                              {typeof order.priceAmount === 'number' && order.priceAmount > 0 ? (
                                <>
                                  <span>•</span>
                                  <span>{formatRevenueLabel(order.priceCurrency || 'MMK', order.priceAmount)}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="ops-chart-empty">
                          <div className="space-y-2 text-center">
                            <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">No recent Telegram orders</p>
                            <p className="text-sm text-muted-foreground">
                              The latest customer buy and renew requests will appear here.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Zap className="h-5 w-5 text-primary" />
                    Top consumers
                  </CardTitle>
                  <CardDescription>Highest traffic keys in the selected snapshot window.</CardDescription>
                </div>
                <Select value={topConsumersRange} onValueChange={(v) => setTopConsumersRange(v as '24h' | '7d' | '30d')}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingTopConsumers ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : topConsumers && topConsumers.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {topConsumers.map((consumer) => (
                      <div key={consumer.id} className="ops-mobile-card space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={consumer.type === 'ACCESS_KEY' ? `/dashboard/keys/${consumer.id}` : `/dashboard/dynamic-keys/${consumer.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {consumer.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {consumer.serverName ? `${consumer.countryCode ? `${getCountryFlag(consumer.countryCode)} ` : ''}${consumer.serverName}` : 'Dynamic key'}
                            </p>
                          </div>
                          <Badge variant="outline">{consumer.type === 'ACCESS_KEY' ? 'Key' : 'Dynamic'}</Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Usage</p>
                            <p className="mt-2 text-lg font-semibold">{formatBytes(BigInt(consumer.deltaBytes))}</p>
                          </div>
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Forecast</p>
                            <div className="mt-2 text-sm">
                              {consumer.dataLimitBytes ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button className="inline-flex items-center gap-1 text-primary">
                                      View quota outlook
                                      <Info className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <ForecastTooltip keyId={consumer.id} keyType={consumer.type} />
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">No quota</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="ops-data-shell hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Key</TableHead>
                          <TableHead>Server</TableHead>
                          <TableHead>Forecast</TableHead>
                          <TableHead className="text-right">Period usage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topConsumers.map((consumer) => (
                          <TableRow key={consumer.id}>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link
                                    href={consumer.type === 'ACCESS_KEY' ? `/dashboard/keys/${consumer.id}` : `/dashboard/dynamic-keys/${consumer.id}`}
                                    className="inline-flex items-center gap-2 font-medium hover:text-primary"
                                  >
                                    <Key className="h-3 w-3" />
                                    <span className="truncate">{consumer.name}</span>
                                  </Link>
                                </TooltipTrigger>
                                <ForecastTooltip keyId={consumer.id} keyType={consumer.type} />
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {consumer.serverName ? (
                                <div className="flex items-center gap-1">
                                  {consumer.countryCode ? getCountryFlag(consumer.countryCode) : null}
                                  <span>{consumer.serverName}</span>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs">Dynamic</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {consumer.dataLimitBytes ? 'Quota tracked' : 'No quota'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatBytes(BigInt(consumer.deltaBytes))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Activity className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">No usage data yet</p>
                    <p className="text-sm text-muted-foreground">
                      Highest-usage keys will appear after snapshot collection starts.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Usage anomalies
              </CardTitle>
              <CardDescription>Keys operating outside their normal traffic baseline.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingAnomalies ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : anomalies && anomalies.length > 0 ? (
                <div className="space-y-3">
                  {anomalies.slice(0, 5).map((anomaly) => (
                    <div key={anomaly.id} className="ops-row-card flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-yellow-500/10 p-2 text-yellow-500">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                          <Link
                            href={anomaly.type === 'ACCESS_KEY' ? `/dashboard/keys/${anomaly.id}` : `/dashboard/dynamic-keys/${anomaly.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {anomaly.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{anomaly.serverName || 'Dynamic key'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="destructive" className="mb-1">
                          {anomaly.ratio}x spike
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(BigInt(anomaly.recentDeltaBytes))} vs {formatBytes(BigInt(anomaly.baselineDeltaBytes))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Activity className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">No anomalies detected</p>
                    <p className="text-sm text-muted-foreground">
                      Current traffic patterns are within the expected baseline.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5 text-primary" />
                Top users
              </CardTitle>
              <CardDescription>Highest-consuming access keys across all recorded time.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingTopUsers ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : topUsers && topUsers.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {topUsers.map((user) => (
                      <div key={user.id} className="ops-mobile-card space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{user.name}</p>
                          <span className="font-mono text-sm">{formatBytes(user.usedBytes)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {user.countryCode ? `${getCountryFlag(user.countryCode)} ` : ''}
                          {user.serverName}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="ops-data-shell hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User / key</TableHead>
                          <TableHead>Server</TableHead>
                          <TableHead className="text-right">Usage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                {user.countryCode ? getCountryFlag(user.countryCode) : null}
                                {user.serverName}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatBytes(user.usedBytes)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">No usage data found</p>
                    <p className="text-sm text-muted-foreground">
                      This ranking appears once at least one key has recorded traffic.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Calendar className="h-5 w-5 text-primary" />
                Peak usage hours
              </CardTitle>
              <CardDescription>Traffic intensity by day and hour (UTC).</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingPeakHours ? (
                <div className="ops-chart-empty h-[280px]">
                  <div className="h-full w-full animate-pulse rounded-[1.5rem] bg-muted/40 dark:bg-white/[0.04]" />
                </div>
              ) : (
                <div className="ops-detail-card overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="mb-2 flex">
                      <div className="w-12 shrink-0" />
                      <div className="flex flex-1 justify-between px-1">
                        {hours.filter((hour) => hour % 3 === 0).map((hour) => (
                          <div key={hour} className="w-6 text-center text-xs text-muted-foreground">
                            {hour.toString().padStart(2, '0')}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      {daysOfWeek.map((day, dayIndex) => (
                        <div key={dayIndex} className="flex items-center gap-1">
                          <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground">{day}</div>
                          <div className="grid h-6 flex-1 grid-cols-24 gap-0.5">
                            {hours.map((hour) => {
                              const dataPoint = peakHours?.find((point) => point.day === dayIndex && point.hour === hour);
                              const bytes = dataPoint?.bytes || 0;
                              return (
                                <div
                                  key={hour}
                                  className={cn(
                                    'cursor-help rounded-sm transition-colors hover:opacity-80',
                                    getHeatmapColor(bytes, maxPeakBytes)
                                  )}
                                  title={`${day} ${hour}:00 - ${formatBytes(BigInt(bytes))}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                      <span>Low</span>
                      <div className="flex gap-0.5">
                        <div className="h-3 w-3 rounded-sm bg-cyan-400/20" />
                        <div className="h-3 w-3 rounded-sm bg-cyan-400/35" />
                        <div className="h-3 w-3 rounded-sm bg-cyan-400/50" />
                        <div className="h-3 w-3 rounded-sm bg-cyan-400/70" />
                        <div className="h-3 w-3 rounded-sm bg-cyan-300" />
                      </div>
                      <span>High</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {(analyticsSummary?.snapshotCount || 0) === 0 ? (
          <Card className="ops-panel border-dashed">
            <CardContent className="px-0 py-0">
              <div className="flex items-start gap-4">
                <div className="rounded-[1.2rem] bg-blue-500/10 p-3">
                  <Info className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-medium">Usage snapshot worker</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Advanced analytics like anomaly detection and quota forecasting depend on the background worker collecting periodic usage snapshots.
                  </p>
                  <code className="mt-3 block rounded-xl bg-muted px-3 py-2 font-mono text-xs dark:bg-white/[0.04]">
                    npx ts-node src/server/worker.ts
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
