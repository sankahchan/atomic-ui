'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { cn, getCountryFlag, formatBytes } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import {
    RefreshCw,
    MoreVertical,
    Trash2,
    ExternalLink,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Activity,
    ArrowUpDown,
    Zap,
    Key,
} from 'lucide-react';

/**
 * ServerSystemStats Component
 * Fetches and displays real-time system stats (CPU, RAM, Disk)
 */
function ServerSystemStats() {
    // Poll every 5 seconds
    const { data: stats, isLoading } = trpc.system.getStats.useQuery(undefined, {
        refetchInterval: 5000,
    });

    if (isLoading || !stats) return null;

    // Helper for color coding usage
    const getUsageColor = (percent: number) => {
        if (percent >= 90) return 'bg-red-500';
        if (percent >= 75) return 'bg-yellow-500';
        return 'bg-primary';
    };

    return (
        <div className="mb-4 space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <div className="space-y-1">
                <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">CPU ({stats.cpu.cores} cores)</span>
                    <span className="font-medium">{stats.cpu.percent}%</span>
                </div>
                <Progress value={stats.cpu.percent} className="h-1.5" indicatorClassName={getUsageColor(stats.cpu.percent)} />
            </div>

            <div className="space-y-1">
                <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">RAM ({formatBytes(stats.memory.total)})</span>
                    <span className="font-medium">{stats.memory.percent}%</span>
                </div>
                <Progress value={stats.memory.percent} className="h-1.5" indicatorClassName={getUsageColor(stats.memory.percent)} />
            </div>

            <div className="space-y-1">
                <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Disk ({formatBytes(stats.disk.total)})</span>
                    <span className="font-medium">{stats.disk.percent}%</span>
                </div>
                <Progress value={stats.disk.percent} className="h-1.5" indicatorClassName={getUsageColor(stats.disk.percent)} />
            </div>

            <div className="pt-1 flex justify-between items-center text-xs text-muted-foreground border-t border-border/50 mt-2">
                <span>System Uptime:</span>
                <span className="font-mono">{new Date(stats.os.uptime * 1000).toISOString().substr(11, 8)}</span>
            </div>
        </div>
    );
}

/**
 * ServerLiveStats Component
 * Display live active connections by measuring traffic delta
 */
function ServerLiveStats({ serverId, defaultActive }: { serverId: string, defaultActive: number }) {
    // Poll every 10 seconds to avoid overwhelming the server
    const { data: stats } = trpc.servers.getLiveStats.useQuery({ id: serverId }, {
        refetchInterval: 10000,
        placeholderData: { activeConnections: defaultActive, bandwidthBps: 0 } as any,
    });

    return (
        <span className="text-lg font-semibold text-emerald-500 block min-w-[20px]">
            {stats ? stats.activeConnections : defaultActive}
        </span>
    );
}

/**
 * ServerCard Component
 *
 * Displays a single server with its status, metrics, and quick actions.
 * The card is clickable and navigates to the server's detail page.
 */
export function ServerCard({
    server,
    onSync,
    onDelete,
    isSyncing,
}: {
    server: {
        id: string;
        name: string;
        apiUrl: string;
        location: string | null;
        countryCode: string | null;
        isActive: boolean;
        lastSyncAt: Date | null;
        outlineVersion: string | null;
        _count?: { accessKeys: number };
        tags: Array<{ id: string; name: string; color: string }>;
        healthCheck: {
            lastStatus: string;
            lastLatencyMs: number | null;
            uptimePercent: number;
        } | null;
        metrics?: {
            totalBandwidth: bigint;
            activeKeys: number;
            totalKeys: number;
        };
    };
    onSync: () => void;
    onDelete: () => void;
    isSyncing?: boolean;
}) {
    const { t } = useLocale();
    const status = server.healthCheck?.lastStatus || 'UNKNOWN';

    const statusConfig = {
        UP: { color: 'text-green-500', bg: 'bg-green-500', icon: CheckCircle2, labelKey: 'servers.status.online' },
        DOWN: { color: 'text-red-500', bg: 'bg-red-500', icon: XCircle, labelKey: 'servers.status.offline' },
        SLOW: { color: 'text-yellow-500', bg: 'bg-yellow-500', icon: AlertTriangle, labelKey: 'servers.status.slow' },
        UNKNOWN: { color: 'text-gray-500', bg: 'bg-gray-500', icon: Activity, labelKey: 'servers.status.unknown' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.UNKNOWN;

    // Heuristic to check if server is local (localhost or 127.0.0.1)
    // In a real multi-server setup, we might need a dedicated flag in the DB
    const isLocal = server.apiUrl.includes('localhost') || server.apiUrl.includes('127.0.0.1');

    return (
        <Card className={cn(
            'group hover:border-primary/30 transition-all duration-200 flex flex-col',
            !server.isActive && 'opacity-60'
        )}>
            <CardContent className="p-5 flex-1">
                {/* Header */}
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

                    {/* Status indicator */}
                    <div className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
                        `${config.bg}/20 ${config.color}`
                    )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', config.bg)} />
                        {t(config.labelKey)}
                    </div>
                </div>

                {/* Bandwidth metric - prominent display */}
                <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <ArrowUpDown className="w-4 h-4 text-primary" />
                        <span className="text-xs text-muted-foreground">{t('servers.total_bandwidth')}</span>
                    </div>
                    <p className="text-2xl font-bold">
                        {server.metrics?.totalBandwidth
                            ? formatBytes(server.metrics.totalBandwidth)
                            : '0 B'}
                    </p>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <Zap className="w-3 h-3 text-emerald-500" />
                        </div>
                        {/* Live Stats Component - Online connections */}
                        <ServerLiveStats serverId={server.id} defaultActive={server.metrics?.activeKeys || 0} />
                        <p className="text-xs text-muted-foreground">{t('servers.active')}</p>
                    </div>
                    <div className="text-center p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <Key className="w-3 h-3 text-primary" />
                        </div>
                        {/* Total active keys count from DB */}
                        <p className="text-lg font-semibold text-primary">
                            {server.metrics?.activeKeys || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('servers.active')}</p>
                    </div>
                    <div className="text-center p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <Activity className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <p className="text-lg font-semibold">
                            {server.healthCheck?.lastLatencyMs
                                ? `${server.healthCheck.lastLatencyMs}ms`
                                : '-'}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('servers.latency')}</p>
                    </div>
                </div>

                {/* System Stats (Local Server Only) */}
                {isLocal && (
                    <ServerSystemStats />
                )}

                {/* Tags */}
                {server.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                        {server.tags.map((tag) => (
                            <Badge
                                key={tag.id}
                                variant="outline"
                                style={{ borderColor: tag.color, color: tag.color }}
                                className="text-xs"
                            >
                                {tag.name}
                            </Badge>
                        ))}
                    </div>
                )}
            </CardContent>

            {/* Footer Actions */}
            <div className="px-5 py-3 border-t border-border/50 bg-muted/10">
                <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                        {server.outlineVersion && `v${server.outlineVersion}`}
                        {server.healthCheck?.uptimePercent !== undefined && (
                            <span className="ml-2">
                                {t('servers.uptime')}: {server.healthCheck.uptimePercent.toFixed(1)}%
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onSync}
                            disabled={isSyncing}
                            title={t('servers.actions.sync')}
                        >
                            <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
                        </Button>
                        <Link href={`/dashboard/servers/${server.id}`}>
                            <Button variant="ghost" size="sm" title={t('servers.actions.view')}>
                                <ExternalLink className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onDelete}
                            className="text-destructive hover:text-destructive"
                            title={t('servers.actions.delete')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}
