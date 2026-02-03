'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';
import {
    Activity,
    RefreshCw,
    Wifi,
    WifiOff,
    AlertTriangle,
    Server,
    TrendingUp,
    Zap,
} from 'lucide-react';
import Link from 'next/link';
import { ServerHealthCard, healthStatusConfig } from './server-health-card';
import { HealthSummaryCard } from './health-summary-card';

/**
 * ServerHealthMonitor Component
 * 
 * The comprehensive health monitoring dashboard that aggregates health data
 * from all servers and provides tools for monitoring and manual verification.
 */
export function ServerHealthMonitor() {
    const { toast } = useToast();
    const { t } = useLocale();
    const [checkingServerId, setCheckingServerId] = useState<string | null>(null);

    // Fetch server status with health data
    const { data: serverStatus, isLoading, refetch } = trpc.dashboard.serverStatus.useQuery();


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

    const handleManualCheck = async (serverId: string) => {
        setCheckingServerId(serverId);
        try {
            const response = await fetch(`/api/health-check?serverId=${encodeURIComponent(serverId)}`, {
                method: 'POST',
            });

            const result = await response.json().catch(() => null);

            if (!response.ok || !result?.success) {
                throw new Error(result?.error || 'Manual health check failed');
            }

            const first = Array.isArray(result.results) ? result.results[0] : null;
            toast({
                title: t('health.toast.manual_check'),
                description: first
                    ? `${first.status}${first.latencyMs != null ? ` • ${first.latencyMs}ms` : ''}`
                    : t('health.toast.manual_check_desc'),
            });
            refetch();
        } catch (error) {
            toast({
                title: t('health.toast.check_error'),
                description: error instanceof Error ? error.message : 'Manual health check failed',
                variant: 'destructive',
            });
        } finally {
            setCheckingServerId(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page header actions */}
            <div className="flex justify-end">
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
                                handleManualCheck(server.id);
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
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
