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
  legendLabel?: string;
  accentLabel?: string;
}

function glowShadow(color: string) {
  return `0 0 16px ${color}55`;
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
  legendLabel = 'Traffic',
  accentLabel = 'Recent usage',
}: TrafficChartProps) {
  const chartId = useId().replace(/:/g, '');
  const gradientId = `traffic-gradient-${chartId}`;
  const glowGradientId = `traffic-glow-${chartId}`;

  // Process data for the chart
  const chartData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      displayLabel: point.label || point.date,
    }));
  }, [data]);

  if (type === 'bar') {
    return (
      <div className="space-y-3">
        <div className="ops-chart-legend">
          <span className="ops-chart-legend-chip">
            <span className="ops-chart-dot" style={{ backgroundColor: color }} />
            {legendLabel}
          </span>
          <span className="ops-chart-legend-chip">{accentLabel}</span>
        </div>
        <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="2 10"
              stroke="rgba(125, 211, 252, 0.12)"
              vertical={false}
            />
          )}
          <XAxis
            dataKey="displayLabel"
            stroke="rgba(186, 230, 253, 0.58)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            stroke="rgba(186, 230, 253, 0.44)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatYAxis}
            width={48}
            tickMargin={6}
            tickCount={4}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="bytes"
            fill={color}
            radius={[8, 8, 0, 0]}
            maxBarSize={50}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="ops-chart-legend">
        <span className="ops-chart-legend-chip">
          <span className="ops-chart-dot" style={{ backgroundColor: color }} />
          {legendLabel}
        </span>
        <span className="ops-chart-legend-chip">{accentLabel}</span>
      </div>
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={glowGradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.08} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.44} />
            <stop offset="35%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill={`url(#${glowGradientId})`} />
        {showGrid && (
          <CartesianGrid
            strokeDasharray="2 10"
            stroke="rgba(125, 211, 252, 0.12)"
            vertical={false}
          />
        )}
        <XAxis
          dataKey="displayLabel"
          stroke="rgba(186, 230, 253, 0.58)"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={18}
        />
        <YAxis
          stroke="rgba(186, 230, 253, 0.44)"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatYAxis}
          width={48}
          tickMargin={6}
          tickCount={4}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="bytes"
          stroke={color}
          strokeWidth={2.5}
          fillOpacity={1}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4, strokeWidth: 0, fill: color, style: { filter: glowShadow(color) } }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
    </div>
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
          strokeWidth={1.65}
          fillOpacity={1}
          fill={`url(#${gradientId})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
