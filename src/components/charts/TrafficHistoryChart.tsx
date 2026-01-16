
'use client';

import { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
} from 'recharts';
import { formatBytes } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

interface TrafficHistoryChartProps {
    accessKeyId: string;
}

export function TrafficHistoryChart({ accessKeyId }: TrafficHistoryChartProps) {
    const { theme } = useTheme();
    const [range, setRange] = useState<'24h' | '7d' | '30d'>('30d');

    const { data, isLoading } = trpc.analytics.getStats.useQuery({
        keyId: accessKeyId,
        range,
    });

    const chartData = useMemo(() => {
        if (!data?.data) return [];
        return data.data.map((point) => ({
            ...point,
            formattedDate: new Date(point.timestamp).toLocaleDateString(undefined, {
                month: 'numeric',
                day: 'numeric',
                hour: range === '24h' ? 'numeric' : undefined,
            }),
        }));
    }, [data, range]);

    if (isLoading) {
        return (
            <Card className="h-[400px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </Card>
        );
    }

    // Calculate totals
    const totalUsage = chartData.reduce((acc, curr) => acc + curr.usage, 0);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-0.5">
                    <CardTitle className="text-base font-medium">Traffic History</CardTitle>
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
                    <SelectTrigger className="w-[120px] h-8 text-xs">
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
                <div className="h-[300px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={theme === 'dark' ? '#374151' : '#e5e7eb'}
                                vertical={false}
                            />
                            <XAxis
                                dataKey="formattedDate"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => formatBytes(value, 0)}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                                    borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                                    borderRadius: '0.5rem',
                                }}
                                itemStyle={{ color: theme === 'dark' ? '#e5e7eb' : '#1f2937' }}
                                formatter={(value: number) => [formatBytes(value), 'Data Used']}
                                labelFormatter={(label) => `Date: ${label}`}
                            />
                            <Area
                                type="monotone"
                                dataKey="usage"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorUsage)"
                                animationDuration={1000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
