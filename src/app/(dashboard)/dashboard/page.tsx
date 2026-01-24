'use client';

/**
 * Dashboard Overview Page
 *
 * Comprehensive dashboard with analytics features, traffic chart,
 * top consumers, anomalies, peak hours heatmap, server status, and activity feed.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc';
import { formatBytes, formatRelativeTime, getCountryFlag, cn } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import {
  Server,
  Key,
  TrendingUp,
  Clock,
  ChevronRight,
  Plus,
  Activity,
  BarChart3,
  Globe,
  CheckCircle2,
  Zap,
  AlertTriangle,
  Users,
  Calendar,
  Info,
  Gauge,
} from 'lucide-react';
import Link from 'next/link';

/**
 * Compact KPI Card
 */
function CompactKPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  href,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  href?: string;
}) {
  const content = (
    <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50 hover:bg-white dark:hover:bg-zinc-900/70 transition-all">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-500 mb-0.5">
              {title}
            </p>
            <p className="text-xl font-bold tracking-tight text-gray-900 dark:text-zinc-100">
              {value}
            </p>
            {subtitle && (
              <p className="text-[10px] text-gray-500 dark:text-zinc-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className={cn('p-1.5 rounded-lg', iconColor)}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}

/**
 * Compact Server Row
 */
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
      <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            isOnline ? 'bg-emerald-500' : 'bg-rose-500'
          )} />
          {server.countryCode && (
            <span className="text-xs">{getCountryFlag(server.countryCode)}</span>
          )}
          <span className="text-xs font-medium text-gray-900 dark:text-zinc-200">{server.name}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-gray-500 dark:text-zinc-500">
            <span className="font-medium text-gray-700 dark:text-zinc-300">{server.latencyMs || '-'}</span>ms
          </span>
          <span className="text-gray-500 dark:text-zinc-500">
            <span className="font-medium text-gray-700 dark:text-zinc-300">{server.keyCount}</span> keys
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Activity Item
 */
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
    warning: { dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400' },
    error: { dot: 'bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400' },
    info: { dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400' },
    success: { dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  };
  const style = styles[type];

  return (
    <div className={cn('flex items-start gap-2 p-2 rounded text-[10px]', style.bg)}>
      <div className={cn('w-1.5 h-1.5 rounded-full mt-1 shrink-0', style.dot)} />
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium text-xs', style.text)}>{title}</p>
        <p className="text-gray-500 dark:text-zinc-500 truncate">{description}</p>
      </div>
      <span className="text-gray-400 dark:text-zinc-600 whitespace-nowrap">{time}</span>
    </div>
  );
}

/**
 * Forecast Tooltip Component
 */
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
          <Gauge className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Usage Forecast</span>
        </div>
        <div className="text-xs space-y-1">
          <p>
            <span className="text-muted-foreground">Current:</span>{' '}
            {formatBytes(BigInt(forecast.currentUsageBytes || '0'))} /{' '}
            {formatBytes(BigInt(forecast.dataLimitBytes || '0'))} ({forecast.usagePercent}%)
          </p>
          {forecast.dailyRateBytes && (
            <p>
              <span className="text-muted-foreground">Daily rate:</span>{' '}
              ~{formatBytes(BigInt(forecast.dailyRateBytes))}/day
            </p>
          )}
          {forecast.daysToQuota !== null && forecast.daysToQuota !== undefined && (
            <p className={cn(
              'font-medium',
              forecast.daysToQuota <= 3 ? 'text-red-500' :
                forecast.daysToQuota <= 7 ? 'text-yellow-500' : 'text-green-500'
            )}>
              <Clock className="w-3 h-3 inline mr-1" />
              {forecast.message}
            </p>
          )}
        </div>
      </div>
    </TooltipContent>
  );
}

/**
 * Heatmap color helper
 */
function getHeatmapColor(bytes: number, maxBytes: number) {
  if (bytes === 0) return 'bg-muted/30';
  const intensity = bytes / maxBytes;
  if (intensity < 0.2) return 'bg-blue-500/20';
  if (intensity < 0.4) return 'bg-blue-500/40';
  if (intensity < 0.6) return 'bg-blue-500/60';
  if (intensity < 0.8) return 'bg-blue-500/80';
  return 'bg-blue-500';
}

/**
 * Dashboard Page
 */
export default function DashboardPage() {
  const [trafficDays, setTrafficDays] = useState(30);
  const [topConsumersRange, setTopConsumersRange] = useState<'24h' | '7d' | '30d'>('24h');
  const { t, mounted } = useLocale();

  // Dashboard queries
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: serverStatus, isLoading: serversLoading } = trpc.dashboard.serverStatus.useQuery();
  const { data: activity } = trpc.dashboard.recentActivity.useQuery();
  const { data: trafficHistory, isLoading: trafficLoading } = trpc.dashboard.trafficHistory.useQuery({ days: trafficDays });
  const { data: topUsers, isLoading: loadingTopUsers } = trpc.dashboard.topUsers.useQuery({ limit: 5 });
  const { data: peakHours, isLoading: loadingPeakHours } = trpc.dashboard.peakHours.useQuery({ days: trafficDays });

  // Analytics queries
  const { data: topConsumers, isLoading: loadingTopConsumers } = trpc.analytics.topConsumers.useQuery({
    range: topConsumersRange,
    limit: 5,
  });
  const { data: anomalies, isLoading: loadingAnomalies } = trpc.analytics.anomalies.useQuery({
    range: '24h',
  });

  const totalTraffic = trafficHistory?.reduce((acc, curr) => acc + BigInt(curr.bytes), BigInt(0)) || BigInt(0);
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

  if (statsLoading || !mounted) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-zinc-800/50 rounded-lg" />
          ))}
        </div>
        <div className="h-52 bg-gray-100 dark:bg-zinc-800/50 rounded-lg" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-3 pb-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-zinc-100">{t('dashboard.title')}</h1>
            <p className="text-[10px] text-gray-500 dark:text-zinc-500">{t('dashboard.welcome')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/servers">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px] px-2">
                <Plus className="w-3 h-3" />
                Add Server
              </Button>
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <CompactKPICard
            title="Total Servers"
            value={stats?.totalServers || 0}
            subtitle={`${stats?.activeServers || 0} online, ${stats?.downServers || 0} offline`}
            icon={Server}
            iconColor="bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400"
            href="/dashboard/servers"
          />
          <CompactKPICard
            title="Access Keys"
            value={stats?.totalKeys || 0}
            subtitle={`${stats?.activeKeys || 0} active keys`}
            icon={Key}
            iconColor="bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400"
            href="/dashboard/keys"
          />
          <CompactKPICard
            title="Total Traffic"
            value={formatBytes(stats?.totalTrafficBytes || BigInt(0))}
            subtitle="All time usage"
            icon={TrendingUp}
            iconColor="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          />
          <CompactKPICard
            title="Expiring Soon"
            value={stats?.expiringIn24h || 0}
            subtitle="Keys expiring in 24h"
            icon={Clock}
            iconColor={stats?.expiringIn24h && stats.expiringIn24h > 0
              ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
              : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-500"}
            href="/dashboard/keys?status=expiring"
          />
        </div>

        {/* Traffic Chart - Full Width, Medium Height */}
        <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-cyan-100 dark:bg-cyan-500/20">
                  <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                    Total Traffic
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {formatBytes(totalTraffic)} transferred in the last {trafficDays} days
                  </CardDescription>
                </div>
              </div>
              <Select value={trafficDays.toString()} onValueChange={(v) => setTrafficDays(parseInt(v))}>
                <SelectTrigger className="w-[90px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7d</SelectItem>
                  <SelectItem value="30">Last 30d</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {trafficLoading ? (
              <div className="h-[200px] bg-gray-50 dark:bg-zinc-800/30 rounded animate-pulse" />
            ) : trafficHistory && trafficHistory.length > 0 ? (
              <div className="h-[200px]">
                <TrafficChart data={trafficHistory} type="area" height="100%" />
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-400 dark:text-zinc-500 text-sm">
                No traffic data
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analytics Row 1: Top Consumers + Anomalies */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Top Consumers */}
          <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-violet-100 dark:bg-violet-500/20">
                    <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Top Consumers</CardTitle>
                    <CardDescription className="text-xs">Highest usage in period</CardDescription>
                  </div>
                </div>
                <Select value={topConsumersRange} onValueChange={(v) => setTopConsumersRange(v as '24h' | '7d' | '30d')}>
                  <SelectTrigger className="w-[70px] h-6 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7d</SelectItem>
                    <SelectItem value="30d">30d</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {loadingTopConsumers ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-8 bg-gray-50 dark:bg-zinc-800/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : topConsumers && topConsumers.length > 0 ? (
                <div className="space-y-1">
                  {topConsumers.slice(0, 5).map((consumer) => (
                    <Tooltip key={consumer.id}>
                      <TooltipTrigger asChild>
                        <Link
                          href={consumer.type === 'ACCESS_KEY'
                            ? `/dashboard/keys/${consumer.id}`
                            : `/dashboard/dynamic-keys/${consumer.id}`
                          }
                          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Key className="w-3 h-3 text-gray-400 shrink-0" />
                            <span className="text-xs font-medium truncate max-w-[100px]">{consumer.name}</span>
                            {consumer.serverName && (
                              <span className="text-[10px] text-gray-500 dark:text-zinc-500 truncate max-w-[60px]">
                                {consumer.countryCode && getCountryFlag(consumer.countryCode)} {consumer.serverName}
                              </span>
                            )}
                            {consumer.dataLimitBytes && (
                              <Info className="w-3 h-3 text-gray-400 shrink-0" />
                            )}
                          </div>
                          <span className="text-xs font-mono text-gray-600 dark:text-zinc-400">
                            {formatBytes(BigInt(consumer.deltaBytes))}
                          </span>
                        </Link>
                      </TooltipTrigger>
                      <ForecastTooltip keyId={consumer.id} keyType={consumer.type} />
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-gray-400 dark:text-zinc-500 text-xs">
                  <Activity className="w-5 h-5 mx-auto mb-1 opacity-30" />
                  No usage data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage Anomalies */}
          <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-amber-100 dark:bg-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Usage Anomalies</CardTitle>
                  <CardDescription className="text-xs">Keys with unusual activity (3x+ baseline)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {loadingAnomalies ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-10 bg-gray-50 dark:bg-zinc-800/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : anomalies && anomalies.length > 0 ? (
                <div className="space-y-2">
                  {anomalies.slice(0, 4).map((anomaly) => (
                    <Link
                      key={anomaly.id}
                      href={anomaly.type === 'ACCESS_KEY'
                        ? `/dashboard/keys/${anomaly.id}`
                        : `/dashboard/dynamic-keys/${anomaly.id}`
                      }
                      className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{anomaly.name}</p>
                          <p className="text-[10px] text-gray-500 dark:text-zinc-500">{anomaly.serverName || 'Dynamic'}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {anomaly.ratio}x
                        </Badge>
                        <p className="text-[10px] text-gray-500 dark:text-zinc-500 mt-0.5">
                          {formatBytes(BigInt(anomaly.recentDeltaBytes))}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-gray-400 dark:text-zinc-500 text-xs">
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-1 opacity-30" />
                  No anomalies detected
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Analytics Row 2: Top Users + Peak Hours */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Top Users All-Time */}
          <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-blue-100 dark:bg-blue-500/20">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Top Users (All-Time)</CardTitle>
                  <CardDescription className="text-xs">Highest consuming access keys overall</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {loadingTopUsers ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-8 bg-gray-50 dark:bg-zinc-800/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : topUsers && topUsers.length > 0 ? (
                <div className="space-y-1">
                  {topUsers.slice(0, 5).map((user) => (
                    <div key={user.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium truncate max-w-[100px]">{user.name}</span>
                        <span className="text-[10px] text-gray-500 dark:text-zinc-500">
                          {user.countryCode && getCountryFlag(user.countryCode)} {user.serverName}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-gray-600 dark:text-zinc-400">
                        {formatBytes(user.usedBytes)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-gray-400 dark:text-zinc-500 text-xs">
                  <Users className="w-5 h-5 mx-auto mb-1 opacity-30" />
                  No usage data found
                </div>
              )}
            </CardContent>
          </Card>

          {/* Peak Usage Hours Heatmap */}
          <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-purple-100 dark:bg-purple-500/20">
                  <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Peak Usage Hours</CardTitle>
                  <CardDescription className="text-xs">Traffic intensity by day and hour (UTC)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {loadingPeakHours ? (
                <div className="h-[160px] bg-gray-50 dark:bg-zinc-800/30 rounded animate-pulse" />
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[400px]">
                    {/* Hours Header */}
                    <div className="flex mb-1">
                      <div className="w-8 shrink-0"></div>
                      <div className="flex-1 flex justify-between px-0.5">
                        {hours.filter(h => h % 6 === 0).map(h => (
                          <div key={h} className="text-[9px] text-gray-400 dark:text-zinc-600 w-4 text-center">
                            {h.toString().padStart(2, '0')}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Days Rows */}
                    <div className="space-y-0.5">
                      {daysOfWeek.map((day, dIndex) => (
                        <div key={dIndex} className="flex items-center gap-0.5">
                          <div className="w-8 text-[9px] text-gray-500 dark:text-zinc-500 font-medium shrink-0">
                            {day}
                          </div>
                          <div className="flex-1 grid grid-cols-24 gap-px h-4">
                            {hours.map((hour) => {
                              const dataPoint = peakHours?.find(p => p.day === dIndex && p.hour === hour);
                              const bytes = dataPoint?.bytes || 0;
                              return (
                                <div
                                  key={hour}
                                  className={cn(
                                    "rounded-[2px] transition-colors cursor-help",
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

                    {/* Legend */}
                    <div className="flex items-center justify-end gap-1 mt-2 text-[9px] text-gray-400 dark:text-zinc-600">
                      <span>Low</span>
                      <div className="flex gap-px">
                        <div className="w-2.5 h-2.5 bg-blue-500/20 rounded-[2px]"></div>
                        <div className="w-2.5 h-2.5 bg-blue-500/40 rounded-[2px]"></div>
                        <div className="w-2.5 h-2.5 bg-blue-500/60 rounded-[2px]"></div>
                        <div className="w-2.5 h-2.5 bg-blue-500/80 rounded-[2px]"></div>
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-[2px]"></div>
                      </div>
                      <span>High</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row: Server Status + Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Server Status - 4 cols */}
          <div className="lg:col-span-4">
            <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50 h-full">
              <CardHeader className="pb-1 pt-2 px-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-emerald-100 dark:bg-emerald-500/20">
                      <Globe className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <CardTitle className="text-xs font-semibold">Server Status</CardTitle>
                  </div>
                  <Link href="/dashboard/servers">
                    <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5">
                      View all <ChevronRight className="w-2.5 h-2.5 ml-0.5" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                {serversLoading ? (
                  <div className="space-y-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-6 bg-gray-50 dark:bg-zinc-800/30 rounded animate-pulse" />
                    ))}
                  </div>
                ) : serverStatus && serverStatus.length > 0 ? (
                  <div className="space-y-0.5">
                    {serverStatus.slice(0, 5).map((server) => (
                      <ServerRow key={server.id} server={server} />
                    ))}
                  </div>
                ) : (
                  <div className="py-3 text-center text-gray-400 dark:text-zinc-500 text-[10px]">
                    <Server className="w-4 h-4 mx-auto mb-1 opacity-30" />
                    No servers configured
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity - 8 cols */}
          <div className="lg:col-span-8">
            <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50 h-full">
              <CardHeader className="pb-1 pt-2 px-3">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-amber-100 dark:bg-amber-500/20">
                    <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold">Recent Activity</CardTitle>
                    <CardDescription className="text-[10px]">Alerts and notifications</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-[140px] overflow-y-auto">
                  {stats?.downServers && stats.downServers > 0 && (
                    <ActivityItem
                      type="error"
                      title="Servers Offline"
                      description={`${stats.downServers} server(s) unreachable`}
                      time="Now"
                    />
                  )}
                  {stats?.expiringIn24h && stats.expiringIn24h > 0 && (
                    <ActivityItem
                      type="warning"
                      title="Keys Expiring Soon"
                      description={`${stats.expiringIn24h} key(s) will expire within 24 hours`}
                      time="Soon"
                    />
                  )}
                  {activity?.recentKeys && activity.recentKeys.length > 0 ? (
                    activity.recentKeys.slice(0, 4).map((key) => (
                      <ActivityItem
                        key={key.id}
                        type="info"
                        title="Key Created"
                        description={key.name}
                        time={formatRelativeTime(key.createdAt)}
                      />
                    ))
                  ) : (
                    !stats?.downServers && !stats?.expiringIn24h && (
                      <div className="col-span-2 py-4 text-center text-gray-400 dark:text-zinc-500 text-[10px]">
                        <CheckCircle2 className="w-4 h-4 mx-auto mb-1 opacity-30" />
                        All systems running smoothly
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
