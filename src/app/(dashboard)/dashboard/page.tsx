'use client';

/**
 * Dashboard Overview Page
 * 
 * This is the main landing page after login, providing a comprehensive overview
 * of the VPN management system. It displays key metrics, server status, recent
 * activity, and alerts in a visually organized layout.
 * 
 * The page is designed to give administrators an at-a-glance view of:
 * - Total servers, keys, and their statuses
 * - Traffic usage and trends
 * - Server health status
 * - Recent activity and alerts
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
} from 'lucide-react';
import Link from 'next/link';
import { SystemStatus } from '../_components/system-status';

/**
 * StatCard Component
 * 
 * Displays a single statistic with an icon, value, label, and optional
 * trend indicator. Used for the main metrics row at the top of the dashboard.
 */
function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendValue,
  href,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  href?: string;
}) {
  const content = (
    <Card className="stat-card group cursor-pointer hover:border-primary/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && (
              <p className="text-[10px] text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={cn(
            'p-2 rounded-lg transition-colors',
            'bg-primary/10 text-primary',
            'group-hover:bg-primary group-hover:text-primary-foreground'
          )}>
            <Icon className="w-4 h-4" />
          </div>
        </div>

        {trend && trendValue && (
          <div className="mt-2 flex items-center gap-2">
            {trend === 'up' && (
              <span className="flex items-center text-green-500 text-xs">
                <ArrowUpRight className="w-3 h-3" />
                {trendValue}
              </span>
            )}
            {trend === 'down' && (
              <span className="flex items-center text-red-500 text-xs">
                <ArrowDownRight className="w-3 h-3" />
                {trendValue}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">vs last week</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

/**
 * ServerStatusCard Component
 * 
 * Displays the status of a single server with health indicators,
 * latency, and key count. Clicking navigates to the server detail page.
 */
function ServerStatusCard({
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
  const { t } = useLocale();
  const statusColors = {
    UP: 'bg-green-500',
    DOWN: 'bg-red-500',
    SLOW: 'bg-yellow-500',
    UNKNOWN: 'bg-gray-500',
  };

  const statusIcons = {
    UP: CheckCircle2,
    DOWN: XCircle,
    SLOW: AlertTriangle,
    UNKNOWN: Clock,
  };

  const StatusIcon = statusIcons[server.status as keyof typeof statusIcons] || Clock;

  return (
    <Link href={`/dashboard/servers/${server.id}`}>
      <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {server.countryCode && (
                <span className="text-base">{getCountryFlag(server.countryCode)}</span>
              )}
              <span className="font-medium text-sm truncate max-w-[100px]">{server.name}</span>
            </div>
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              statusColors[server.status as keyof typeof statusColors] || 'bg-gray-500'
            )} />
          </div>

          <div className="grid grid-cols-3 gap-1 text-xs">
            <div>
              <p className="text-muted-foreground text-[10px]">Status</p>
              <div className="flex items-center gap-1 mt-0.5">
                <StatusIcon className="w-3 h-3" />
                <span className="font-medium">{server.status}</span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Latency</p>
              <p className="font-medium mt-0.5">
                {server.latencyMs ? `${server.latencyMs}ms` : '-'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Keys</p>
              <p className="font-medium mt-0.5">{server.keyCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * AlertItem Component
 * 
 * Displays a single alert or notification item with appropriate styling
 * based on the alert severity.
 */
function AlertItem({
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
    warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: AlertTriangle, iconColor: 'text-yellow-500' },
    error: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: XCircle, iconColor: 'text-red-500' },
    info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Activity, iconColor: 'text-blue-500' },
    success: { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: CheckCircle2, iconColor: 'text-green-500' },
  };

  const style = styles[type];
  const Icon = style.icon;

  return (
    <div className={cn(
      'flex items-start gap-2 p-2 rounded-md border text-xs',
      style.bg,
      style.border
    )}>
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', style.iconColor)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-[10px] text-muted-foreground truncate">{description}</p>
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{time}</span>
    </div>
  );
}

/**
 * DashboardPage Component
 * 
 * The main dashboard page that assembles all the overview components.
 * It fetches data from multiple endpoints and displays them in an
 * organized, responsive layout.
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
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-theme(spacing.20))] overflow-hidden flex flex-col">
      {/* Page header - Compact */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            {t('dashboard.welcome')}
          </p>
        </div>

        {/* Quick Actions Inline */}
        <div className="flex items-center gap-2">
          <Link href="/dashboard/servers/new">
            <Button size="sm" variant="outline" className="h-8 gap-2">
              <Server className="w-4 h-4" />
              <span className="hidden sm:inline">{t('dashboard.add_server')}</span>
            </Button>
          </Link>
          <Link href="/dashboard/keys/new">
            <Button size="sm" variant="outline" className="h-8 gap-2">
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">{t('dashboard.create_key')}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <StatCard
          title={t('dashboard.total_servers')}
          value={stats?.totalServers || 0}
          description={`${stats?.activeServers || 0} active, ${stats?.downServers || 0} down`}
          icon={Server}
          href="/dashboard/servers"
        />
        <StatCard
          title={t('dashboard.total_keys')}
          value={stats?.totalKeys || 0}
          description={`${stats?.activeKeys || 0} active`}
          icon={Key}
          href="/dashboard/keys"
        />
        <StatCard
          title={t('dashboard.total_traffic')}
          value={formatBytes(stats?.totalTrafficBytes || BigInt(0))}
          description={t('dashboard.all_time')}
          icon={TrendingUp}
        />
        <StatCard
          title={t('dashboard.expiring_soon')}
          value={stats?.expiringIn24h || 0}
          description={t('dashboard.expiring_24h')}
          icon={Clock}
          href="/dashboard/keys?status=expiring"
        />
      </div>

      {/* Main Content Area - Scrollable if needed, but designed to fit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 flex-1">
        {/* Left Column: Traffic & Servers */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {/* Traffic Chart */}
          <Card className="flex-1 min-h-[200px] flex flex-col overflow-hidden">
            <CardHeader className="p-4 pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  {t('dashboard.traffic_overview')}
                </CardTitle>
                <Select
                  value={trafficDays.toString()}
                  onValueChange={(value) => setTrafficDays(parseInt(value))}
                >
                  <SelectTrigger className="w-[100px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex-1 min-h-0">
              {trafficLoading ? (
                <div className="h-full bg-muted/20 rounded-lg animate-pulse" />
              ) : trafficHistory && trafficHistory.length > 0 ? (
                <div className="-ml-4 h-full w-full">
                  <TrafficChart data={trafficHistory} type="area" height="100%" />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p className="text-xs">No traffic data</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Server Status Grid - Compact */}
          <Card className="flex-1 min-h-[180px] overflow-hidden flex flex-col">
            <CardHeader className="p-4 pb-2 border-b shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  {t('dashboard.server_status')}
                </CardTitle>
                <Link href="/dashboard/servers" className="text-xs text-primary hover:underline">
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4 overflow-y-auto">
              {serversLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="h-24 bg-muted rounded-lg animate-pulse" />
                  <div className="h-24 bg-muted rounded-lg animate-pulse" />
                </div>
              ) : serverStatus && serverStatus.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {serverStatus.slice(0, 4).map((server) => (
                    <ServerStatusCard key={server.id} server={server} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  No servers online
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: System & Alerts */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* System Status - Fixed height */}
          <div className="shrink-0">
            <SystemStatus />
          </div>

          {/* Alerts - Fills remaining space */}
          <Card className="flex-1 min-h-[150px] flex flex-col overflow-hidden">
            <CardHeader className="p-4 pb-2 shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                {t('dashboard.alerts')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 overflow-y-auto space-y-2">
              {/* Alerts Logic */}
              {stats?.downServers && stats.downServers > 0 && (
                <AlertItem
                  type="error"
                  title="Servers Down"
                  description={`${stats.downServers} server(s) unreachable`}
                  time="Now"
                />
              )}
              {stats?.expiringIn24h && stats.expiringIn24h > 0 && (
                <AlertItem
                  type="warning"
                  title="Keys Expiring"
                  description={`${stats.expiringIn24h} keys expiring soon`}
                  time="Soon"
                />
              )}
              {activity?.recentKeys && activity.recentKeys.length > 0 ? (
                activity.recentKeys.slice(0, 5).map((key) => (
                  <AlertItem
                    key={key.id}
                    type="info"
                    title="Key Created"
                    description={`${key.name}`}
                    time={formatRelativeTime(key.createdAt)}
                  />
                ))
              ) : (
                <p className="text-center text-xs text-muted-foreground py-4">No recent alerts</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
