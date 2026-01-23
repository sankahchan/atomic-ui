'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SegmentedUsageBarProps {
  /** Current usage in bytes */
  valueBytes: number;
  /** Limit in bytes (0 or undefined = unlimited) */
  limitBytes?: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show percentage text */
  showPercent?: boolean;
  /** Number of segments */
  segments?: number;
  /** Additional class name */
  className?: string;
}

/**
 * Segmented Usage Bar Component
 *
 * A capsule-style progress bar with segmented sections that fill based on usage.
 * Color changes based on usage percentage:
 * - 0-49%: Red/Orange gradient (danger zone)
 * - 50-79%: Orange/Yellow gradient (warning zone)
 * - 80-99%: Yellow/Amber gradient (caution zone)
 * - 100%: Green (full/complete)
 */
export function SegmentedUsageBar({
  valueBytes,
  limitBytes = 0,
  size = 'md',
  showPercent = true,
  segments = 10,
  className,
}: SegmentedUsageBarProps) {
  // Calculate percentage (cap at 100 for display, but allow overflow indication)
  const percentage = limitBytes > 0
    ? Math.min((valueBytes / limitBytes) * 100, 100)
    : 0;

  const isUnlimited = !limitBytes || limitBytes === 0;
  const isOverLimit = limitBytes > 0 && valueBytes > limitBytes;

  // Determine how many segments should be filled
  const filledSegments = Math.ceil((percentage / 100) * segments);

  // Get color based on percentage threshold
  const getSegmentColor = (segmentIndex: number, isFilled: boolean) => {
    if (!isFilled) return 'bg-zinc-800/50';

    if (isOverLimit) {
      return 'bg-gradient-to-r from-red-500 to-red-400';
    }

    if (percentage >= 100) {
      return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
    }

    if (percentage >= 80) {
      return 'bg-gradient-to-r from-amber-500 to-yellow-400';
    }

    if (percentage >= 50) {
      return 'bg-gradient-to-r from-orange-500 to-amber-400';
    }

    return 'bg-gradient-to-r from-red-500 to-orange-400';
  };

  // Size configurations
  const sizeConfig = {
    sm: {
      height: 'h-2',
      gap: 'gap-0.5',
      text: 'text-xs',
      padding: 'px-1',
    },
    md: {
      height: 'h-3',
      gap: 'gap-0.5',
      text: 'text-sm',
      padding: 'px-1.5',
    },
    lg: {
      height: 'h-4',
      gap: 'gap-1',
      text: 'text-base',
      padding: 'px-2',
    },
  };

  const config = sizeConfig[size];

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  if (isUnlimited) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className={cn(
          'flex items-center rounded-full bg-zinc-800/30 overflow-hidden',
          config.height,
          config.gap,
          config.padding,
          'min-w-[80px]'
        )}>
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-full transition-all duration-300',
                config.height,
                'bg-zinc-700/30'
              )}
            />
          ))}
        </div>
        {showPercent && (
          <span className={cn(config.text, 'text-zinc-400 whitespace-nowrap')}>
            {formatBytes(valueBytes)} / ∞
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center rounded-full bg-zinc-800/30 overflow-hidden',
          config.height,
          config.gap,
          config.padding,
          'min-w-[80px]'
        )}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {Array.from({ length: segments }).map((_, i) => {
          const isFilled = i < filledSegments;
          const isPartial = i === filledSegments - 1 && percentage % (100 / segments) !== 0;

          return (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-full transition-all duration-300 ease-out',
                config.height,
                getSegmentColor(i, isFilled),
                isFilled && 'shadow-sm',
                isFilled && percentage < 50 && 'shadow-red-500/20',
                isFilled && percentage >= 50 && percentage < 80 && 'shadow-orange-500/20',
                isFilled && percentage >= 80 && percentage < 100 && 'shadow-amber-500/20',
                isFilled && percentage >= 100 && 'shadow-emerald-500/20',
              )}
              style={{
                transform: isFilled ? 'scaleY(1)' : 'scaleY(0.7)',
                opacity: isFilled ? 1 : 0.3,
              }}
            />
          );
        })}
      </div>
      {showPercent && (
        <span className={cn(
          config.text,
          'whitespace-nowrap font-medium tabular-nums',
          percentage < 50 && 'text-red-400',
          percentage >= 50 && percentage < 80 && 'text-orange-400',
          percentage >= 80 && percentage < 100 && 'text-amber-400',
          percentage >= 100 && !isOverLimit && 'text-emerald-400',
          isOverLimit && 'text-red-400',
        )}>
          {percentage.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

/**
 * Compact version for table cells
 */
export function SegmentedUsageBarCompact({
  valueBytes,
  limitBytes,
  className,
}: {
  valueBytes: number;
  limitBytes?: number;
  className?: string;
}) {
  return (
    <SegmentedUsageBar
      valueBytes={valueBytes}
      limitBytes={limitBytes}
      size="sm"
      segments={8}
      showPercent={true}
      className={className}
    />
  );
}

/**
 * Large version for dashboard cards
 */
export function SegmentedUsageBarLarge({
  valueBytes,
  limitBytes,
  label,
  className,
}: {
  valueBytes: number;
  limitBytes?: number;
  label?: string;
  className?: string;
}) {
  const percentage = limitBytes && limitBytes > 0
    ? Math.min((valueBytes / limitBytes) * 100, 100)
    : 0;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">{label}</span>
          <span className="text-sm font-medium text-zinc-200">
            {formatBytes(valueBytes)} / {limitBytes ? formatBytes(limitBytes) : '∞'}
          </span>
        </div>
      )}
      <SegmentedUsageBar
        valueBytes={valueBytes}
        limitBytes={limitBytes}
        size="lg"
        segments={12}
        showPercent={!label}
      />
      {label && (
        <div className="text-right">
          <span className={cn(
            'text-lg font-semibold tabular-nums',
            percentage < 50 && 'text-red-400',
            percentage >= 50 && percentage < 80 && 'text-orange-400',
            percentage >= 80 && percentage < 100 && 'text-amber-400',
            percentage >= 100 && 'text-emerald-400',
          )}>
            {percentage.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
