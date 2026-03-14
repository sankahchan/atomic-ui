
'use client';

import { useMemo } from 'react';
import { formatBytes } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { Activity, BarChart3, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { EmptyState } from '@/components/ui/empty-state';
import { SurfaceSkeleton } from '@/components/ui/surface-skeleton';

interface TrafficHistoryChartProps {
    accessKeyId: string;
}

export function TrafficHistoryChart({ accessKeyId }: TrafficHistoryChartProps) {
    const [range, setRange] = useState<'24h' | '7d' | '30d'>('30d');

    const { data, isLoading } = trpc.analytics.getStats.useQuery({
        keyId: accessKeyId,
        range,
    });

    const chartData = useMemo(() => {
        if (!data?.data) return [];
        return data.data.map((point) => ({
            ...point,
            date: point.timestamp,
            bytes: point.usage,
            label: new Date(point.timestamp).toLocaleDateString(undefined, {
                month: 'numeric',
                day: 'numeric',
                hour: range === '24h' ? 'numeric' : undefined,
            }),
        }));
    }, [data, range]);

    if (isLoading) {
        return (
            <Card className="ops-detail-card border-border/60">
                <CardContent className="p-5">
                    <SurfaceSkeleton className="min-h-[240px]" lines={4} />
                </CardContent>
            </Card>
        );
    }

    // Calculate totals
    const totalUsage = chartData.reduce((acc, curr) => acc + curr.usage, 0);

    return (
        <Card className="ops-detail-card border-border/60">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <div className="space-y-0.5">
                    <CardTitle className="flex items-center gap-2 text-base font-medium">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/14 bg-cyan-500/10 text-cyan-400">
                            <Activity className="h-4 w-4" />
                        </span>
                        <span>Traffic History</span>
                    </CardTitle>
                    <CardDescription>
                        {range === '24h' ? 'Last 24 Hours' : range === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
                        {' • '}
                        Total: {formatBytes(totalUsage)}
                    </CardDescription>
                </div>
                <Select
                    value={range}
                    onValueChange={(value) => setRange(value as '24h' | '7d' | '30d')}
                >
                    <SelectTrigger className="h-10 w-[132px] rounded-full border-border/70 bg-background/70 text-xs dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]">
                        <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="24h">Last 24 Hours</SelectItem>
                        <SelectItem value="7d">Last 7 Days</SelectItem>
                        <SelectItem value="30d">Last 30 Days</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                <div className="ops-chart-shell">
                    {chartData.length === 0 ? (
                        <EmptyState
                            icon={BarChart3}
                            title="No traffic history yet"
                            description="Historical usage will appear after the next analytics snapshots."
                            className="min-h-[220px]"
                        />
                    ) : (
                        <TrafficChart
                            data={chartData}
                            height={220}
                            color="#22d3ee"
                            legendLabel="Traffic history"
                            accentLabel={range === '24h' ? '24h samples' : range === '7d' ? '7 day range' : '30 day range'}
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
