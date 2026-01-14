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
    <Card className="stat-card group cursor-pointer">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={cn(
            'p-3 rounded-xl transition-colors',
            'bg-primary/10 text-primary',
            'group-hover:bg-primary group-hover:text-primary-foreground'
          )}>
            <Icon className="w-5 h-5" />
          </div>
        </div>

        {trend && trendValue && (
          <div className="mt-4 flex items-center gap-2">
            {trend === 'up' && (
              <span className="flex items-center text-green-500 text-sm">
                <ArrowUpRight className="w-4 h-4" />
                {trendValue}
              </span>
            )}
            {trend === 'down' && (
              <span className="flex items-center text-red-500 text-sm">
                <ArrowDownRight className="w-4 h-4" />
                {trendValue}
              </span>
            )}
            <span className="text-xs text-muted-foreground">vs last week</span>
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
      <Card className="hover:border-primary/30 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {server.countryCode && (
                <span className="text-lg">{getCountryFlag(server.countryCode)}</span>
              )}
              <span className="font-medium">{server.name}</span>
            </div>
            <div className={cn(
              'w-2 h-2 rounded-full',
              statusColors[server.status as keyof typeof statusColors] || 'bg-gray-500'
            )} />
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Status</p>
              <div className="flex items-center gap-1 mt-0.5">
                <StatusIcon className="w-3.5 h-3.5" />
                <span className="font-medium">{server.status}</span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Latency</p>
              <p className="font-medium mt-0.5">
                {server.latencyMs ? `${server.latencyMs}ms` : '-'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Keys</p>
              <p className="font-medium mt-0.5">{server.keyCount}</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">{t('dashboard.uptime')}</span>
              <span className="font-medium">{server.uptimePercent.toFixed(1)}%</span>
            </div>
            <Progress value={server.uptimePercent} className="h-1.5" />
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
      'flex items-start gap-3 p-3 rounded-lg border',
      style.bg,
      style.border
    )}>
      <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', style.iconColor)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{time}</span>
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
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">
          {t('dashboard.welcome')}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('dashboard.total_servers')}
          value={stats?.totalServers || 0}
          description={`${stats?.activeServers || 0} ${t('dashboard.active')}, ${stats?.downServers || 0} ${t('dashboard.down')}`}
          icon={Server}
          href="/dashboard/servers"
        />
        <StatCard
          title={t('dashboard.total_keys')}
          value={stats?.totalKeys || 0}
          description={`${stats?.activeKeys || 0} ${t('dashboard.active')}, ${stats?.expiredKeys || 0} ${t('dashboard.expired')}`}
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

      {/* Traffic & System Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  {t('dashboard.traffic_overview')}
                </CardTitle>
                <CardDescription>
                  Bandwidth usage over time
                </CardDescription>
              </div>
              <Select
                value={trafficDays.toString()}
                onValueChange={(value) => setTrafficDays(parseInt(value))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {trafficLoading ? (
              <div className="h-[300px] bg-muted rounded-lg animate-pulse" />
            ) : trafficHistory && trafficHistory.length > 0 ? (
              <TrafficChart data={trafficHistory} type="area" height={300} />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No traffic data available yet</p>
                  <p className="text-sm">Traffic will appear here after keys are used</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <div className="lg:col-span-1">
          <SystemStatus />
        </div>
      </div>

      {/* Two-column layout for detailed sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server status section - takes 2 columns */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  {t('dashboard.server_status')}
                </CardTitle>
                <CardDescription>
                  Real-time health status of your Outline servers
                </CardDescription>
              </div>
              <Link href="/dashboard/servers">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                  {t('dashboard.view_all')}
                </Badge>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {serversLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : serverStatus && serverStatus.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {serverStatus.slice(0, 6).map((server) => (
                  <ServerStatusCard key={server.id} server={server} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No servers configured yet.</p>
                <Link href="/dashboard/servers" className="text-primary hover:underline text-sm">
                  Add your first server
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts & Activity section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  {t('dashboard.alerts')}
                </CardTitle>
                <CardDescription>
                  Recent events and notifications
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.downServers && stats.downServers > 0 && (
                <AlertItem
                  type="error"
                  title="Servers Down"
                  description={`${stats.downServers} server(s) are currently unreachable`}
                  time="Now"
                />
              )}

              {stats?.expiringIn24h && stats.expiringIn24h > 0 && (
                <AlertItem
                  type="warning"
                  title="Keys Expiring"
                  description={`${stats.expiringIn24h} key(s) will expire in 24 hours`}
                  time="Soon"
                />
              )}

              {stats?.depletedKeys && stats.depletedKeys > 0 && (
                <AlertItem
                  type="warning"
                  title="Traffic Depleted"
                  description={`${stats.depletedKeys} key(s) have exhausted their data limit`}
                  time="Recent"
                />
              )}

              {activityLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : activity?.recentKeys && activity.recentKeys.length > 0 ? (
                activity.recentKeys.slice(0, 5).map((key) => (
                  <AlertItem
                    key={key.id}
                    type="info"
                    title="Key Created"
                    description={`${key.name} on ${key.serverName}`}
                    time={formatRelativeTime(key.createdAt)}
                  />
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No recent activity
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks you might want to perform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/dashboard/servers/new">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer">
                <Server className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium">{t('dashboard.add_server')}</p>
                  <p className="text-xs text-muted-foreground">Connect new Outline server</p>
                </div>
              </div>
            </Link>

            <Link href="/dashboard/keys/new">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer">
                <Key className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium">{t('dashboard.create_key')}</p>
                  <p className="text-xs text-muted-foreground">Generate new access key</p>
                </div>
              </div>
            </Link>

            <Link href="/dashboard/health">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer">
                <Activity className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium">{t('dashboard.health_check')}</p>
                  <p className="text-xs text-muted-foreground">Monitor server health</p>
                </div>
              </div>
            </Link>

            <Link href="/dashboard/notifications">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer">
                <Activity className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium">{t('dashboard.configure_alerts')}</p>
                  <p className="text-xs text-muted-foreground">Configure alerts</p>
                </div>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div >
  );
}
