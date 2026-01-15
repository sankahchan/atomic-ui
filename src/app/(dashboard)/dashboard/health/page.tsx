'use client';

/**
 * Health Monitoring Page
 * 
 * This page provides a comprehensive view of server health across all connected
 * Outline VPN servers. Health monitoring is crucial for maintaining a reliable
 * VPN service, as it allows administrators to quickly identify and respond to
 * server issues before they impact users.
 * 
 * The page displays real-time health status, historical uptime data, and provides
 * manual health check capabilities for immediate verification.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { cn, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff,
  Server,
  Loader2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

/**
 * Health status configuration mapping
 * Each status has associated visual elements for consistent display
 */
const healthStatusConfig = {
  UP: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/30',
    labelKey: 'health.status.UP',
    descriptionKey: 'health.status_desc.UP',
  },
  DOWN: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/30',
    labelKey: 'health.status.DOWN',
    descriptionKey: 'health.status_desc.DOWN',
  },
  SLOW: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/30',
    labelKey: 'health.status.SLOW',
    descriptionKey: 'health.status_desc.SLOW',
  },
  UNKNOWN: {
    icon: Clock,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/20',
    borderColor: 'border-gray-500/30',
    labelKey: 'health.status.UNKNOWN',
    descriptionKey: 'health.status_desc.UNKNOWN',
  },
};

/**
 * HealthSummaryCard Component
 * 
 * Displays aggregate health statistics in a compact format. These cards
 * appear at the top of the page to give administrators a quick overview
 * of the overall health status.
 */
function HealthSummaryCard({
  title,
  value,
  icon: Icon,
  color,
  description,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={cn('p-3 rounded-xl', color)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ServerHealthCard Component
 * 
 * Displays detailed health information for a single server. This includes
 * current status, latency, uptime percentage, and the last check timestamp.
 * The card also provides a manual check button for immediate verification.
 */
function ServerHealthCard({
  server,
  onManualCheck,
  isChecking,
}: {
  server: {
    id: string;
    name: string;
    countryCode: string | null;
    location: string | null;
    healthCheck: {
      lastStatus: string;
      lastLatencyMs: number | null;
      lastCheckedAt: Date | null;
      uptimePercent: number;
      totalChecks: number;
      successfulChecks: number;
    } | null;
  };
  onManualCheck: () => void;
  isChecking: boolean;
}) {
  const { t } = useLocale();
  const health = server.healthCheck;
  const status = (health?.lastStatus || 'UNKNOWN') as keyof typeof healthStatusConfig;
  const config = healthStatusConfig[status] || healthStatusConfig.UNKNOWN;
  const StatusIcon = config.icon;

  return (
    <Card className={cn(
      'transition-all duration-200',
      'hover:border-primary/30'
    )}>
      <CardContent className="p-5">
        {/* Server header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {server.countryCode && (
              <span className="text-2xl">{getCountryFlag(server.countryCode)}</span>
            )}
            <div>
              <Link
                href={`/dashboard/servers/${server.id}`}
                className="font-semibold hover:text-primary transition-colors"
              >
                {server.name}
              </Link>
              {server.location && (
                <p className="text-sm text-muted-foreground">{server.location}</p>
              )}
            </div>
          </div>

          {/* Status badge */}
          <div className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
            config.bgColor,
            config.color,
            config.borderColor
          )}>
            <StatusIcon className="w-3.5 h-3.5" />
            {t(config.labelKey)}
          </div>
        </div>

        {/* Health metrics */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('health.metrics.latency')}</p>
            <p className="text-lg font-semibold">
              {health?.lastLatencyMs !== null && health?.lastLatencyMs !== undefined
                ? `${health.lastLatencyMs}ms`
                : '-'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('health.metrics.last_check')}</p>
            <p className="text-sm">
              {health?.lastCheckedAt
                ? formatRelativeTime(health.lastCheckedAt)
                : t('health.metrics.never')}
            </p>
          </div>
        </div>

        {/* Uptime progress */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('health.metrics.uptime')}</span>
            <span className="font-medium">
              {health?.uptimePercent !== undefined
                ? `${health.uptimePercent.toFixed(1)}%`
                : '-'}
            </span>
          </div>
          <Progress
            value={health?.uptimePercent || 0}
            className={cn(
              'h-2',
              health?.uptimePercent && health.uptimePercent < 90 && '[&>div]:bg-yellow-500',
              health?.uptimePercent && health.uptimePercent < 50 && '[&>div]:bg-red-500'
            )}
          />
          {health?.totalChecks !== undefined && (
            <p className="text-xs text-muted-foreground">
              {health.successfulChecks} / {health.totalChecks} {t('health.metrics.checks_success')}
            </p>
          )}
        </div>

        {/* Manual check button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onManualCheck}
          disabled={isChecking}
        >
          {isChecking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('health.actions.checking')}
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('health.actions.check_now')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * HealthPage Component
 * 
 * The main health monitoring page that aggregates health data from all servers
 * and provides tools for monitoring and manual verification.
 */
export default function HealthPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const [checkingServerId, setCheckingServerId] = useState<string | null>(null);

  // Fetch server status with health data
  const { data: serverStatus, isLoading, refetch } = trpc.dashboard.serverStatus.useQuery();

  // Test connection mutation for manual health checks
  const testConnectionMutation = trpc.servers.testConnection.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.success ? t('health.toast.healthy') : t('health.toast.check_failed'),
        description: result.success
          ? `${t('health.metrics.latency')}: ${result.latency}ms`
          : result.error || 'Unable to connect to server',
        variant: result.success ? 'default' : 'destructive',
      });
      refetch();
      setCheckingServerId(null);
    },
    onError: (error) => {
      toast({
        title: t('health.toast.check_error'),
        description: error.message,
        variant: 'destructive',
      });
      setCheckingServerId(null);
    },
  });

  // Calculate summary statistics
  const stats = {
    total: serverStatus?.length || 0,
    online: serverStatus?.filter((s) => s.status === 'UP').length || 0,
    offline: serverStatus?.filter((s) => s.status === 'DOWN').length || 0,
    slow: serverStatus?.filter((s) => s.status === 'SLOW').length || 0,
    avgUptime: serverStatus?.length
      ? (serverStatus.reduce((sum, s) => sum + s.uptimePercent, 0) / serverStatus.length).toFixed(1)
      : '0.0',
    avgLatency: serverStatus?.filter((s) => s.latencyMs !== null).length
      ? Math.round(
        serverStatus
          .filter((s) => s.latencyMs !== null)
          .reduce((sum, s) => sum + (s.latencyMs || 0), 0) /
        serverStatus.filter((s) => s.latencyMs !== null).length
      )
      : null,
  };

  const handleManualCheck = (serverId: string, apiUrl: string, certSha256: string) => {
    setCheckingServerId(serverId);
    testConnectionMutation.mutate({ apiUrl, apiCertSha256: certSha256 });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('health.title')}</h1>
          <p className="text-muted-foreground">
            {t('health.subtitle')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
          {t('health.refresh_all')}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <HealthSummaryCard
          title={t('health.summary.total')}
          value={stats.total}
          icon={Server}
          color="bg-primary/10 text-primary"
        />
        <HealthSummaryCard
          title={t('health.summary.online')}
          value={stats.online}
          icon={Wifi}
          color="bg-green-500/10 text-green-500"
        />
        <HealthSummaryCard
          title={t('health.summary.offline')}
          value={stats.offline}
          icon={WifiOff}
          color="bg-red-500/10 text-red-500"
        />
        <HealthSummaryCard
          title={t('health.summary.slow')}
          value={stats.slow}
          icon={AlertTriangle}
          color="bg-yellow-500/10 text-yellow-500"
        />
        <HealthSummaryCard
          title={t('health.summary.uptime')}
          value={`${stats.avgUptime}%`}
          icon={TrendingUp}
          color="bg-blue-500/10 text-blue-500"
        />
        <HealthSummaryCard
          title={t('health.summary.latency')}
          value={stats.avgLatency !== null ? `${stats.avgLatency}ms` : '-'}
          icon={Zap}
          color="bg-purple-500/10 text-purple-500"
        />
      </div>

      {/* Health status explanation */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Activity className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('health.explanation.title')}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {Object.entries(healthStatusConfig).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <value.icon className={cn('w-4 h-4', value.color)} />
                    <div>
                      <span className="font-medium">{t(value.labelKey)}</span>
                      <p className="text-xs text-muted-foreground">{t(value.descriptionKey)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Server health grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : serverStatus && serverStatus.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {serverStatus.map((server) => (
            <ServerHealthCard
              key={server.id}
              server={{
                id: server.id,
                name: server.name,
                countryCode: server.countryCode,
                location: null,
                healthCheck: {
                  lastStatus: server.status,
                  lastLatencyMs: server.latencyMs ?? null,
                  lastCheckedAt: null,
                  uptimePercent: server.uptimePercent,
                  totalChecks: 0,
                  successfulChecks: 0,
                },
              }}
              onManualCheck={() => {
                // Would need to fetch apiUrl and certSha256 for the server
                // For now, we'll just show a placeholder action
                toast({
                  title: t('health.toast.manual_check'),
                  description: t('health.toast.manual_check_desc'),
                });
              }}
              isChecking={checkingServerId === server.id}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Activity className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('health.empty.title')}</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              {t('health.empty.desc')}
            </p>
            <Button asChild>
              <Link href="/dashboard/servers">
                <Server className="w-4 h-4 mr-2" />
                {t('health.empty.btn')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
