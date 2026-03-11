'use client';

/**
 * Traffic Chart Component
 *
 * Displays bandwidth usage over time using Recharts.
 * Supports daily, weekly, and monthly views.
 */

import { useId, useMemo } from 'react';
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
      <div className="min-w-[132px] rounded-2xl border border-cyan-400/18 bg-[rgba(5,12,26,0.94)] p-3 text-white shadow-[0_18px_36px_rgba(1,6,20,0.55)] backdrop-blur-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">{label}</p>
        <p className="mt-2 text-lg font-semibold text-cyan-200">
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
  const chartId = useId().replace(/:/g, '');
  const gradientId = `traffic-gradient-${chartId}`;

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
              strokeDasharray="2 10"
              stroke="rgba(125, 211, 252, 0.16)"
              vertical={false}
            />
          )}
          <XAxis
            dataKey="displayLabel"
            stroke="rgba(186, 230, 253, 0.62)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="rgba(186, 230, 253, 0.5)"
            fontSize={11}
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
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="55%" stopColor={color} stopOpacity={0.14} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="2 10"
            stroke="rgba(125, 211, 252, 0.16)"
            vertical={false}
          />
        )}
        <XAxis
          dataKey="displayLabel"
          stroke="rgba(186, 230, 253, 0.62)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="rgba(186, 230, 253, 0.5)"
          fontSize={11}
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
          strokeWidth={2.25}
          fillOpacity={1}
          fill={`url(#${gradientId})`}
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
