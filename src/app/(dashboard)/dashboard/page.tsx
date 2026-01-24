'use client';

/**
 * Dashboard Overview Page
 *
 * Compact analytics dashboard matching 3x-ui style with smaller cards,
 * traffic overview, server status, analytics preview, and activity feed.
 * All content fits in one screen.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrafficChart } from '@/components/ui/traffic-chart';
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
  Cpu,
  HardDrive,
  Zap,
  BarChart3,
  Globe,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

/**
 * Compact KPI Card - Smaller version matching reference design
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
 * System Status Metrics Row
 */
function SystemMetricRow({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-zinc-500">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div className="text-right">
        <span className="text-[10px] font-medium text-gray-900 dark:text-zinc-100">{value}</span>
        {subValue && (
          <span className="text-[10px] text-gray-400 dark:text-zinc-600 ml-1">{subValue}</span>
        )}
      </div>
    </div>
  );
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ') || '< 1m';
}

function formatBytesCompact(bytes: number, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Dashboard Page
 */
export default function DashboardPage() {
  const [trafficDays, setTrafficDays] = useState(30);
  const { t, mounted } = useLocale();

  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: serverStatus, isLoading: serversLoading } = trpc.dashboard.serverStatus.useQuery();
  const { data: activity } = trpc.dashboard.recentActivity.useQuery();
  const { data: trafficHistory, isLoading: trafficLoading } = trpc.dashboard.trafficHistory.useQuery({ days: trafficDays });
  const { data: systemStats } = trpc.system.getStats.useQuery(undefined, { refetchInterval: 5000 });

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

      {/* KPI Cards - Compact 4-column */}
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

      {/* Main Content - 3 Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left Column - Traffic Chart (5 cols) */}
        <div className="lg:col-span-5">
          <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50 h-full">
            <CardHeader className="pb-1 pt-2 px-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-cyan-100 dark:bg-cyan-500/20">
                    <BarChart3 className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold text-gray-900 dark:text-zinc-100">
                      Traffic Overview
                    </CardTitle>
                    <p className="text-[10px] text-gray-500 dark:text-zinc-500">Bandwidth usage over time</p>
                  </div>
                </div>
                <Select value={trafficDays.toString()} onValueChange={(v) => setTrafficDays(parseInt(v))}>
                  <SelectTrigger className="w-[70px] h-6 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7d</SelectItem>
                    <SelectItem value="30">Last 30d</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-1 pb-1">
              {trafficLoading ? (
                <div className="h-[140px] bg-gray-50 dark:bg-zinc-800/30 rounded animate-pulse" />
              ) : trafficHistory && trafficHistory.length > 0 ? (
                <div className="h-[140px]">
                  <TrafficChart data={trafficHistory} type="area" height="100%" />
                </div>
              ) : (
                <div className="h-[140px] flex items-center justify-center text-gray-400 dark:text-zinc-500 text-[10px]">
                  No traffic data
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Middle Column - Analytics Preview + Server Status (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          {/* Analytics Preview */}
          <Link href="/dashboard/analytics">
            <Card className="bg-gradient-to-br from-violet-50 to-cyan-50 dark:from-violet-500/10 dark:to-cyan-500/10 border-violet-200/30 dark:border-zinc-800/50 hover:from-violet-100 hover:to-cyan-100 dark:hover:from-violet-500/15 dark:hover:to-cyan-500/15 transition-all cursor-pointer group">
              <CardContent className="p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-violet-200/50 dark:bg-violet-500/20">
                      <BarChart3 className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-gray-900 dark:text-zinc-100">Analytics</h3>
                      <p className="text-[10px] text-gray-500 dark:text-zinc-500">View detailed usage statistics</p>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-zinc-300 transition-colors" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Server Status */}
          <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50">
            <CardHeader className="pb-1 pt-2 px-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-emerald-100 dark:bg-emerald-500/20">
                    <Globe className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold text-gray-900 dark:text-zinc-100">
                      Server Status
                    </CardTitle>
                    <p className="text-[10px] text-gray-500 dark:text-zinc-500">Real-time server health monitoring</p>
                  </div>
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
                  {serverStatus.slice(0, 4).map((server) => (
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

        {/* Right Column - System Status + Activity (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          {/* System Status */}
          <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50">
            <CardHeader className="pb-1 pt-2 px-3">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-blue-100 dark:bg-blue-500/20">
                  <Activity className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-xs font-semibold text-gray-900 dark:text-zinc-100">
                  System Status
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-2 space-y-0.5">
              {systemStats ? (
                <>
                  <SystemMetricRow icon={Cpu} label="CPU" value={`${systemStats.cpu.percent}%`} subValue={`${systemStats.cpu.cores} Cores`} />
                  <SystemMetricRow icon={Activity} label="Memory" value={`${systemStats.memory.percent}%`} subValue={formatBytesCompact(systemStats.memory.used)} />
                  <SystemMetricRow icon={HardDrive} label="Disk Storage" value={`${systemStats.disk.percent}%`} subValue={formatBytesCompact(systemStats.disk.used)} />
                  <div className="pt-1 mt-1 border-t border-gray-100 dark:border-zinc-800">
                    <SystemMetricRow icon={Clock} label="Uptime" value={formatUptime(systemStats.os.uptime)} />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-3 bg-gray-50 dark:bg-zinc-800/30 rounded animate-pulse" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-white/50 dark:bg-zinc-900/50 border-gray-200/50 dark:border-zinc-800/50">
            <CardHeader className="pb-1 pt-2 px-3">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-amber-100 dark:bg-amber-500/20">
                  <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-xs font-semibold text-gray-900 dark:text-zinc-100">
                    Recent Activity
                  </CardTitle>
                  <p className="text-[10px] text-gray-500 dark:text-zinc-500">Alerts and notifications</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-2 space-y-1 max-h-[120px] overflow-y-auto">
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
                activity.recentKeys.slice(0, 2).map((key) => (
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
                  <div className="py-2 text-center text-gray-400 dark:text-zinc-500 text-[10px]">
                    <CheckCircle2 className="w-4 h-4 mx-auto mb-1 opacity-30" />
                    All systems running smoothly
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
