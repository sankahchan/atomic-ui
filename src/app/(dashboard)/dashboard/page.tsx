'use client';

/**
 * Dashboard Overview Page
 *
 * Premium analytics dashboard with modern UI, improved typography,
 * and refined visual hierarchy. Supports both light and dark modes.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { trpc } from '@/lib/trpc';
import { formatBytes, formatRelativeTime, getCountryFlag, cn } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import {
  Server,
  Key,
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Globe,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Shield,
  Wifi,
  ChevronRight,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { SystemStatus } from '../_components/system-status';

/**
 * Premium KPI Card Component
 *
 * Modern stat card with gradient accents, improved spacing,
 * and subtle animations on hover. Works in both light and dark modes.
 */
function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  href,
  accentColor = 'cyan',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  href?: string;
  accentColor?: 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose';
}) {
  const accentStyles = {
    cyan: {
      gradient: 'from-cyan-500/10 to-cyan-500/5 dark:from-cyan-500/20 dark:to-cyan-500/5',
      icon: 'text-cyan-600 dark:text-cyan-400',
      iconBg: 'bg-cyan-100 dark:bg-cyan-500/10',
      border: 'group-hover:border-cyan-300 dark:group-hover:border-cyan-500/30',
      shadow: 'group-hover:shadow-cyan-500/10',
    },
    emerald: {
      gradient: 'from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:to-emerald-500/5',
      icon: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-100 dark:bg-emerald-500/10',
      border: 'group-hover:border-emerald-300 dark:group-hover:border-emerald-500/30',
      shadow: 'group-hover:shadow-emerald-500/10',
    },
    violet: {
      gradient: 'from-violet-500/10 to-violet-500/5 dark:from-violet-500/20 dark:to-violet-500/5',
      icon: 'text-violet-600 dark:text-violet-400',
      iconBg: 'bg-violet-100 dark:bg-violet-500/10',
      border: 'group-hover:border-violet-300 dark:group-hover:border-violet-500/30',
      shadow: 'group-hover:shadow-violet-500/10',
    },
    amber: {
      gradient: 'from-amber-500/10 to-amber-500/5 dark:from-amber-500/20 dark:to-amber-500/5',
      icon: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-100 dark:bg-amber-500/10',
      border: 'group-hover:border-amber-300 dark:group-hover:border-amber-500/30',
      shadow: 'group-hover:shadow-amber-500/10',
    },
    rose: {
      gradient: 'from-rose-500/10 to-rose-500/5 dark:from-rose-500/20 dark:to-rose-500/5',
      icon: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-100 dark:bg-rose-500/10',
      border: 'group-hover:border-rose-300 dark:group-hover:border-rose-500/30',
      shadow: 'group-hover:shadow-rose-500/10',
    },
  };

  const accent = accentStyles[accentColor];

  const content = (
    <Card className={cn(
      'group relative overflow-hidden transition-all duration-300',
      'bg-white dark:bg-zinc-900/50',
      'border-gray-200 dark:border-zinc-800/50',
      'hover:shadow-lg dark:hover:shadow-black/20',
      accent.border,
      accent.shadow
    )}>
      {/* Gradient overlay */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300',
        accent.gradient
      )} />

      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-500">
              {title}
            </p>
            <div className="space-y-1">
              <p className="text-3xl font-bold tracking-tight text-gray-900 dark:text-zinc-100">
                {value}
              </p>
              {subtitle && (
                <p className="text-xs text-gray-500 dark:text-zinc-500">{subtitle}</p>
              )}
            </div>
          </div>
          <div className={cn(
            'p-3 rounded-xl transition-all duration-300',
            accent.iconBg,
            'group-hover:scale-110'
          )}>
            <Icon className={cn('w-5 h-5', accent.icon)} />
          </div>
        </div>

        {trend && trendValue && (
          <div className="mt-4 flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-zinc-800/50">
            {trend === 'up' && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <ArrowUpRight className="w-3.5 h-3.5" />
                {trendValue}
              </span>
            )}
            {trend === 'down' && (
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs font-medium">
                <ArrowDownRight className="w-3.5 h-3.5" />
                {trendValue}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-zinc-600">vs last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}

/**
 * Server Status Row Component
 *
 * Compact horizontal server status display for the server list.
 */
function ServerStatusRow({
  server,
}: {
  server: {
    id: string;
    name: string;
    countryCode: string | null;
    status: string;
    latencyMs: number | null | undefined;
    keyCount: number;
    uptimePercent: number;
  };
}) {
  const statusConfig = {
    UP: { color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'Online' },
    DOWN: { color: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', label: 'Offline' },
    SLOW: { color: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'Slow' },
    UNKNOWN: { color: 'bg-gray-400 dark:bg-zinc-500', text: 'text-gray-600 dark:text-zinc-400', label: 'Unknown' },
  };

  const config = statusConfig[server.status as keyof typeof statusConfig] || statusConfig.UNKNOWN;

  return (
    <Link href={`/dashboard/servers/${server.id}`}>
      <div className="group flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-zinc-800/30 hover:bg-gray-100 dark:hover:bg-zinc-800/50 transition-all duration-200 cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={cn(
              'w-2 h-2 rounded-full',
              config.color
            )} />
            {server.status === 'UP' && (
              <div className={cn(
                'absolute inset-0 w-2 h-2 rounded-full animate-ping',
                config.color,
                'opacity-75'
              )} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {server.countryCode && (
              <span className="text-base">{getCountryFlag(server.countryCode)}</span>
            )}
            <span className="font-medium text-sm text-gray-900 dark:text-zinc-200">{server.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-zinc-500">Latency</p>
            <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 tabular-nums">
              {server.latencyMs ? `${server.latencyMs}ms` : '-'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-zinc-500">Keys</p>
            <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 tabular-nums">
              {server.keyCount}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-zinc-600 group-hover:text-gray-600 dark:group-hover:text-zinc-400 transition-colors" />
        </div>
      </div>
    </Link>
  );
}

/**
 * Activity Item Component
 *
 * Compact activity/alert item with status indicator.
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
    warning: {
      dot: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/5',
    },
    error: {
      dot: 'bg-rose-500',
      text: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-500/5',
    },
    info: {
      dot: 'bg-blue-500',
      text: 'text-blue-700 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/5',
    },
    success: {
      dot: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/5',
    },
  };

  const style = styles[type];

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg transition-colors',
      style.bg,
      'hover:bg-gray-50 dark:hover:bg-zinc-800/30'
    )}>
      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', style.dot)} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', style.text)}>{title}</p>
        <p className="text-xs text-gray-500 dark:text-zinc-500 truncate mt-0.5">{description}</p>
      </div>
      <span className="text-xs text-gray-400 dark:text-zinc-600 whitespace-nowrap">{time}</span>
    </div>
  );
}

/**
 * DashboardPage Component
 *
 * Premium analytics dashboard with modern UI design.
 */
export default function DashboardPage() {
  const [trafficDays, setTrafficDays] = useState(30);
  const { t, mounted } = useLocale();

  // Fetch dashboard statistics
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();

  // Fetch server status list
  const { data: serverStatus, isLoading: serversLoading } = trpc.dashboard.serverStatus.useQuery();

  // Fetch recent activity
  const { data: activity, isLoading: activityLoading } = trpc.dashboard.recentActivity.useQuery();

  // Fetch traffic history
  const { data: trafficHistory, isLoading: trafficLoading } = trpc.dashboard.trafficHistory.useQuery({ days: trafficDays });

  // Loading state
  if (statsLoading || !mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-zinc-800/50 rounded-xl" />
          ))}
        </div>
        <div className="h-80 bg-gray-100 dark:bg-zinc-800/50 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-screen pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-1">
            {t('dashboard.welcome')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/servers">
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-2 border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Server</span>
            </Button>
          </Link>
          <Link href="/dashboard/keys">
            <Button
              size="sm"
              className="h-9 gap-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white border-0 shadow-lg shadow-cyan-500/25"
            >
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">Create Key</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Servers"
          value={stats?.totalServers || 0}
          subtitle={`${stats?.activeServers || 0} online, ${stats?.downServers || 0} offline`}
          icon={Server}
          accentColor="cyan"
          href="/dashboard/servers"
        />
        <KPICard
          title="Access Keys"
          value={stats?.totalKeys || 0}
          subtitle={`${stats?.activeKeys || 0} active keys`}
          icon={Key}
          accentColor="violet"
          href="/dashboard/keys"
        />
        <KPICard
          title="Total Traffic"
          value={formatBytes(stats?.totalTrafficBytes || BigInt(0))}
          subtitle="All time usage"
          icon={TrendingUp}
          accentColor="emerald"
        />
        <KPICard
          title="Expiring Soon"
          value={stats?.expiringIn24h || 0}
          subtitle="Keys expiring in 24h"
          icon={Clock}
          accentColor={stats?.expiringIn24h && stats.expiringIn24h > 0 ? 'amber' : 'cyan'}
          href="/dashboard/keys?status=expiring"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Traffic Chart Card */}
          <Card className="bg-white dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800/50 overflow-hidden">
            <CardHeader className="border-b border-gray-100 dark:border-zinc-800/50 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-500/10">
                    <BarChart3 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                      Traffic Overview
                    </CardTitle>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                      Bandwidth usage over time
                    </p>
                  </div>
                </div>
                <Select
                  value={trafficDays.toString()}
                  onValueChange={(value) => setTrafficDays(parseInt(value))}
                >
                  <SelectTrigger className="w-[100px] h-8 text-xs border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {trafficLoading ? (
                <div className="h-[280px] bg-gray-50 dark:bg-zinc-800/30 rounded-lg animate-pulse" />
              ) : trafficHistory && trafficHistory.length > 0 ? (
                <div className="h-[280px] -ml-4">
                  <TrafficChart data={trafficHistory} type="area" height="100%" />
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-400 dark:text-zinc-500">
                  <div className="text-center">
                    <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No traffic data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Server Status Card */}
          <Card className="bg-white dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800/50 overflow-hidden">
            <CardHeader className="border-b border-gray-100 dark:border-zinc-800/50 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/10">
                    <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                      Server Status
                    </CardTitle>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                      Real-time server health monitoring
                    </p>
                  </div>
                </div>
                <Link href="/dashboard/servers">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
                  >
                    View all
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {serversLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-gray-50 dark:bg-zinc-800/30 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : serverStatus && serverStatus.length > 0 ? (
                <div className="space-y-2">
                  {serverStatus.slice(0, 5).map((server) => (
                    <ServerStatusRow key={server.id} server={server} />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-400 dark:text-zinc-500">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No servers configured</p>
                  <Link href="/dashboard/servers">
                    <Button variant="link" size="sm" className="mt-2 text-cyan-600 dark:text-cyan-400">
                      Add your first server
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Activity & Status */}
        <div className="space-y-6">
          {/* System Status */}
          <SystemStatus />

          {/* Quick Analytics Link */}
          <Link href="/dashboard/analytics">
            <Card className="bg-gradient-to-br from-violet-50 to-cyan-50 dark:from-violet-500/10 dark:to-cyan-500/10 border-violet-200/50 dark:border-zinc-800/50 overflow-hidden hover:from-violet-100 hover:to-cyan-100 dark:hover:from-violet-500/15 dark:hover:to-cyan-500/15 transition-all duration-300 group cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-200/50 dark:bg-violet-500/20">
                    <BarChart3 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-zinc-100">Analytics</h3>
                    <p className="text-xs text-gray-500 dark:text-zinc-500">
                      View detailed usage statistics
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-zinc-300 transition-colors" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Activity Feed */}
          <Card className="bg-white dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800/50 overflow-hidden">
            <CardHeader className="border-b border-gray-100 dark:border-zinc-800/50 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/10">
                  <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                    Recent Activity
                  </CardTitle>
                  <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                    Alerts and notifications
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
              {/* System Alerts */}
              {stats?.downServers && stats.downServers > 0 && (
                <ActivityItem
                  type="error"
                  title="Servers Offline"
                  description={`${stats.downServers} server(s) are currently unreachable`}
                  time="Now"
                />
              )}
              {stats?.expiringIn24h && stats.expiringIn24h > 0 && (
                <ActivityItem
                  type="warning"
                  title="Keys Expiring Soon"
                  description={`${stats.expiringIn24h} access key(s) will expire within 24 hours`}
                  time="Soon"
                />
              )}

              {/* Recent Key Activity */}
              {activity?.recentKeys && activity.recentKeys.length > 0 ? (
                activity.recentKeys.slice(0, 5).map((key) => (
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
                  <div className="py-6 text-center text-gray-400 dark:text-zinc-500">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">All systems running smoothly</p>
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
