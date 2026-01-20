'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import {
    RefreshCw,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Clock,
    Loader2,
} from 'lucide-react';

/**
 * Health status configuration mapping
 * Each status has associated visual elements for consistent display
 */
export const healthStatusConfig = {
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
 * ServerHealthCard Component
 * 
 * Displays detailed health information for a single server. This includes
 * current status, latency, uptime percentage, and the last check timestamp.
 * The card also provides a manual check button for immediate verification.
 */
export function ServerHealthCard({
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
