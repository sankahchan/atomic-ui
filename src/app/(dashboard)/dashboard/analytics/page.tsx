'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { useLocale } from '@/hooks/use-locale';
import { formatBytes, getCountryFlag, cn } from '@/lib/utils';
import { BarChart3, TrendingUp, Users, Calendar, ArrowUpRight } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

export default function AnalyticsPage() {
    const { t } = useLocale();
    const [days, setDays] = useState(30);

    // Fetch data
    const { data: trafficHistory, isLoading: loadingTraffic } = trpc.dashboard.trafficHistory.useQuery({ days });
    const { data: topUsers, isLoading: loadingTopUsers } = trpc.dashboard.topUsers.useQuery({ limit: 5 });
    const { data: peakHours, isLoading: loadingPeakHours } = trpc.dashboard.peakHours.useQuery({ days });

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Users */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" />
                            Top Users
                        </CardTitle>
                        <CardDescription>
                            Highest consuming access keys (All time)
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
        </div>
    );
}
