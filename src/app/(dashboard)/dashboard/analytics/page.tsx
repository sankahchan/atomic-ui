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
import { cn, formatBytes, getCountryFlag } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  Clock,
  Gauge,
  Info,
  Key,
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

export default function AnalyticsPage() {
  const { t } = useLocale();
  const [days, setDays] = useState(30);
  const [topConsumersRange, setTopConsumersRange] = useState<'24h' | '7d' | '30d'>('24h');

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
