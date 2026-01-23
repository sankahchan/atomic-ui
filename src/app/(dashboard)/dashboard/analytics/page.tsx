'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { useLocale } from '@/hooks/use-locale';
import { formatBytes, getCountryFlag, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    BarChart3,
    TrendingUp,
    Users,
    Calendar,
    AlertTriangle,
    Activity,
    Clock,
    Info,
    ArrowUpRight,
    Gauge,
    Key,
    Zap,
} from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

/**
 * ForecastTooltip Component
 *
 * Shows time-to-quota projection for a key
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
                    <Badge variant="outline" className="text-xs">
                        {forecast.confidence} confidence
                    </Badge>
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
                    {!forecast.daysToQuota && forecast.message && (
                        <p className="text-muted-foreground">{forecast.message}</p>
                    )}
                </div>

                <p className="text-[10px] text-muted-foreground italic">
                    * Estimated based on recent usage patterns
                </p>
            </div>
        </TooltipContent>
    );
}

export default function AnalyticsPage() {
    const { t } = useLocale();
    const [days, setDays] = useState(30);
    const [topConsumersRange, setTopConsumersRange] = useState<'24h' | '7d' | '30d'>('24h');

    // Fetch data
    const { data: trafficHistory, isLoading: loadingTraffic } = trpc.dashboard.trafficHistory.useQuery({ days });
    const { data: topUsers, isLoading: loadingTopUsers } = trpc.dashboard.topUsers.useQuery({ limit: 5 });
    const { data: peakHours, isLoading: loadingPeakHours } = trpc.dashboard.peakHours.useQuery({ days });

    // New analytics queries
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

    // Calculate total traffic for the period
    const totalTraffic = trafficHistory?.reduce((acc, curr) => acc + BigInt(curr.bytes), BigInt(0)) || BigInt(0);

    // Helper for heatmap color
    const getHeatmapColor = (bytes: number, maxBytes: number) => {
        if (bytes === 0) return 'bg-muted/30';
        const intensity = bytes / maxBytes;
        if (intensity < 0.2) return 'bg-blue-500/20';
        if (intensity < 0.4) return 'bg-blue-500/40';
        if (intensity < 0.6) return 'bg-blue-500/60';
        if (intensity < 0.8) return 'bg-blue-500/80';
        return 'bg-blue-500';
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
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
                        <p className="text-muted-foreground">
                            Detailed insights into traffic usage and user activity.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select
                            value={days.toString()}
                            onValueChange={(value) => setDays(parseInt(value))}
                        >
                            <SelectTrigger className="w-[120px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7">Last 7 days</SelectItem>
                                <SelectItem value="30">Last 30 days</SelectItem>
                                <SelectItem value="90">Last 90 days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10">
                                    <Activity className="w-5 h-5 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Active Keys</p>
                                    <p className="text-xl font-bold">
                                        {loadingSummary ? '-' : analyticsSummary?.activeKeysCount || 0}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-green-500/10">
                                    <TrendingUp className="w-5 h-5 text-green-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Period Usage</p>
                                    <p className="text-xl font-bold">
                                        {loadingSummary ? '-' : formatBytes(BigInt(analyticsSummary?.totalDeltaBytes || '0'))}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-2 rounded-lg",
                                    (analyticsSummary?.anomalyCount || 0) > 0 ? "bg-yellow-500/10" : "bg-muted"
                                )}>
                                    <AlertTriangle className={cn(
                                        "w-5 h-5",
                                        (analyticsSummary?.anomalyCount || 0) > 0 ? "text-yellow-500" : "text-muted-foreground"
                                    )} />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Anomalies</p>
                                    <p className="text-xl font-bold">
                                        {loadingSummary ? '-' : analyticsSummary?.anomalyCount || 0}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-500/10">
                                    <BarChart3 className="w-5 h-5 text-purple-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Snapshots</p>
                                    <p className="text-xl font-bold">
                                        {loadingSummary ? '-' : analyticsSummary?.snapshotCount || 0}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Traffic Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            Total Traffic
                        </CardTitle>
                        <CardDescription>
                            {formatBytes(totalTraffic)} transferred in the last {days} days
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {loadingTraffic ? (
                            <div className="h-full bg-muted/20 rounded-lg animate-pulse" />
                        ) : (
                            <TrafficChart data={trafficHistory || []} height="100%" />
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Consumers (snapshot-based) */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Zap className="w-5 h-5 text-primary" />
                                        Top Consumers
                                    </CardTitle>
                                    <CardDescription>
                                        Highest usage in selected period
                                    </CardDescription>
                                </div>
                                <Select
                                    value={topConsumersRange}
                                    onValueChange={(v) => setTopConsumersRange(v as '24h' | '7d' | '30d')}
                                >
                                    <SelectTrigger className="w-[100px]">
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
                        <CardContent>
                            {loadingTopConsumers ? (
                                <div className="space-y-2">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : topConsumers && topConsumers.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Key</TableHead>
                                            <TableHead>Server</TableHead>
                                            <TableHead className="text-right">Period Usage</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {topConsumers.map((consumer) => (
                                            <TableRow key={consumer.id}>
                                                <TableCell>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Link
                                                                href={consumer.type === 'ACCESS_KEY'
                                                                    ? `/dashboard/keys/${consumer.id}`
                                                                    : `/dashboard/dynamic-keys/${consumer.id}`
                                                                }
                                                                className="flex items-center gap-2 hover:text-primary"
                                                            >
                                                                <Key className="w-3 h-3" />
                                                                <span className="font-medium truncate max-w-[120px]">
                                                                    {consumer.name}
                                                                </span>
                                                                {consumer.dataLimitBytes && (
                                                                    <Info className="w-3 h-3 text-muted-foreground" />
                                                                )}
                                                            </Link>
                                                        </TooltipTrigger>
                                                        <ForecastTooltip
                                                            keyId={consumer.id}
                                                            keyType={consumer.type}
                                                        />
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {consumer.serverName ? (
                                                        <div className="flex items-center gap-1">
                                                            {consumer.countryCode && getCountryFlag(consumer.countryCode)}
                                                            <span className="truncate max-w-[80px]">{consumer.serverName}</span>
                                                        </div>
                                                    ) : (
                                                        <Badge variant="outline" className="text-xs">Dynamic</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {formatBytes(BigInt(consumer.deltaBytes))}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No usage data available</p>
                                    <p className="text-xs mt-1">
                                        Data will appear after the worker collects snapshots
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Anomalies Detection */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                Usage Anomalies
                            </CardTitle>
                            <CardDescription>
                                Keys with unusual activity (3x baseline or higher)
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingAnomalies ? (
                                <div className="space-y-2">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : anomalies && anomalies.length > 0 ? (
                                <div className="space-y-3">
                                    {anomalies.slice(0, 5).map((anomaly) => (
                                        <div
                                            key={anomaly.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-full bg-yellow-500/10">
                                                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                                                </div>
                                                <div>
                                                    <Link
                                                        href={anomaly.type === 'ACCESS_KEY'
                                                            ? `/dashboard/keys/${anomaly.id}`
                                                            : `/dashboard/dynamic-keys/${anomaly.id}`
                                                        }
                                                        className="font-medium hover:text-primary"
                                                    >
                                                        {anomaly.name}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">
                                                        {anomaly.serverName || 'Dynamic Key'}
                                                    </p>
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
                                <div className="text-center py-8 text-muted-foreground">
                                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No anomalies detected</p>
                                    <p className="text-xs mt-1">
                                        All keys are within normal usage patterns
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Top Users (All-time) */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-primary" />
                                Top Users (All-Time)
                            </CardTitle>
                            <CardDescription>
                                Highest consuming access keys overall
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingTopUsers ? (
                                <div className="space-y-2">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User / Key</TableHead>
                                            <TableHead>Server</TableHead>
                                            <TableHead className="text-right">Usage</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {topUsers?.map((user) => (
                                            <TableRow key={user.id}>
                                                <TableCell className="font-medium">
                                                    {user.name}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    <div className="flex items-center gap-1">
                                                        {user.countryCode && getCountryFlag(user.countryCode)}
                                                        {user.serverName}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {formatBytes(user.usedBytes)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {topUsers?.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                                                    No usage data found
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {/* Peak Hours Heatmap */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-primary" />
                                Peak Usage Hours
                            </CardTitle>
                            <CardDescription>
                                Traffic intensity by day and hour (UTC)
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingPeakHours ? (
                                <div className="h-[300px] bg-muted/20 rounded animate-pulse" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <div className="min-w-[600px]">
                                        {/* Hours Header */}
                                        <div className="flex mb-2">
                                            <div className="w-12 shrink-0"></div>
                                            <div className="flex-1 flex justify-between px-1">
                                                {hours.filter(h => h % 3 === 0).map(h => (
                                                    <div key={h} className="text-xs text-muted-foreground w-6 text-center">
                                                        {h.toString().padStart(2, '0')}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Days Rows */}
                                        <div className="space-y-1">
                                            {daysOfWeek.map((day, dIndex) => (
                                                <div key={dIndex} className="flex items-center gap-1">
                                                    <div className="w-12 text-xs text-muted-foreground font-medium shrink-0">
                                                        {day}
                                                    </div>
                                                    <div className="flex-1 grid grid-cols-24 gap-0.5 h-6">
                                                        {hours.map((hour) => {
                                                            const dataPoint = peakHours?.find(p => p.day === dIndex && p.hour === hour);
                                                            const bytes = dataPoint?.bytes || 0;
                                                            return (
                                                                <div
                                                                    key={hour}
                                                                    className={cn(
                                                                        "rounded-sm transition-colors hover:opacity-80 cursor-help",
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
                                        <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
                                            <span>Low</span>
                                            <div className="flex gap-0.5">
                                                <div className="w-3 h-3 bg-blue-500/20 rounded-sm"></div>
                                                <div className="w-3 h-3 bg-blue-500/40 rounded-sm"></div>
                                                <div className="w-3 h-3 bg-blue-500/60 rounded-sm"></div>
                                                <div className="w-3 h-3 bg-blue-500/80 rounded-sm"></div>
                                                <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                                            </div>
                                            <span>High</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Info about snapshot worker */}
                {(analyticsSummary?.snapshotCount || 0) === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="p-3 rounded-lg bg-blue-500/10">
                                    <Info className="w-6 h-6 text-blue-500" />
                                </div>
                                <div>
                                    <h3 className="font-medium mb-1">Usage Snapshot Worker</h3>
                                    <p className="text-sm text-muted-foreground mb-3">
                                        Advanced analytics features like top consumers, anomaly detection, and
                                        time-to-quota forecasting require the background worker to collect usage snapshots.
                                    </p>
                                    <div className="text-xs text-muted-foreground space-y-1">
                                        <p>To enable these features, run the worker process:</p>
                                        <code className="block bg-muted px-3 py-2 rounded mt-2 font-mono">
                                            npx ts-node src/server/worker.ts
                                        </code>
                                        <p className="mt-2">
                                            Or use pm2/systemd for production. See worker documentation for details.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </TooltipProvider>
    );
}
