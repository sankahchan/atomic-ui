'use client';

/**
 * Traffic Chart Component
 *
 * Displays bandwidth usage over time using Recharts.
 * Supports daily, weekly, and monthly views.
 */

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { formatBytes } from '@/lib/utils';

interface TrafficDataPoint {
  date: string;
  bytes: number;
  label?: string;
}

interface TrafficChartProps {
  data: TrafficDataPoint[];
  type?: 'area' | 'bar';
  height?: number | string;
  showGrid?: boolean;
  color?: string;
}

/**
 * Custom tooltip for the chart
 */
function CustomTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-lg font-bold text-primary">
          {formatBytes(BigInt(payload[0].value))}
        </p>
      </div>
    );
  }
  return null;
}

/**
 * Format bytes for Y-axis labels
 */
function formatYAxis(value: number): string {
  if (value === 0) return '0';
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}TB`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}GB`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}MB`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}KB`;
  return `${value}B`;
}

export function TrafficChart({
  data,
  type = 'area',
  height = 300,
  showGrid = true,
  color = 'hsl(var(--primary))',
}: TrafficChartProps) {
  // Process data for the chart
  const chartData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      displayLabel: point.label || point.date,
    }));
  }, [data]);

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
          )}
          <XAxis
            dataKey="displayLabel"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatYAxis}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="bytes"
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={50}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
        )}
        <XAxis
          dataKey="displayLabel"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatYAxis}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="bytes"
          stroke={color}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorTraffic)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Mini spark line for compact displays
 */
export function TrafficSparkline({
  data,
  height = 40,
  color = 'hsl(var(--primary))',
  id,
}: {
  data: TrafficDataPoint[];
  height?: number;
  color?: string;
  id?: string;
}) {
  const gradientId = id ? `sparklineGradient-${id}` : `sparklineGradient-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="bytes"
          stroke={color}
          strokeWidth={1.5}
          fillOpacity={1}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
