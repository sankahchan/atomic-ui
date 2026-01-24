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
 *
 * Supports both light and dark modes.
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
  // Color logic: green (low usage) -> orange -> red (high usage/near limit)
  const getSegmentColor = (segmentIndex: number, isFilled: boolean) => {
    if (!isFilled) return 'bg-gray-200 dark:bg-zinc-800/50';

    if (isOverLimit) {
      return 'bg-gradient-to-r from-red-600 to-red-500';
    }

    if (percentage >= 90) {
      return 'bg-gradient-to-r from-red-600 to-red-500';
    }

    if (percentage >= 75) {
      return 'bg-gradient-to-r from-orange-500 to-red-500';
    }

    if (percentage >= 50) {
      return 'bg-gradient-to-r from-amber-500 to-orange-500';
    }

    return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
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
          'flex items-center rounded-full bg-gray-100 dark:bg-zinc-800/30 overflow-hidden',
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
                'bg-gray-200 dark:bg-zinc-700/30'
              )}
            />
          ))}
        </div>
        {showPercent && (
          <span className={cn(config.text, 'text-gray-500 dark:text-zinc-400 whitespace-nowrap')}>
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
          'flex items-center rounded-full bg-gray-100 dark:bg-zinc-800/30 overflow-hidden',
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
          percentage < 50 && 'text-red-600 dark:text-red-400',
          percentage >= 50 && percentage < 80 && 'text-orange-600 dark:text-orange-400',
          percentage >= 80 && percentage < 100 && 'text-amber-600 dark:text-amber-400',
          percentage >= 100 && !isOverLimit && 'text-emerald-600 dark:text-emerald-400',
          isOverLimit && 'text-red-600 dark:text-red-400',
        )}>
          {percentage.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

/**
 * Compact version for table cells - shows usage data like x-ui style
 * Format: "224.82 MB / 100.00 GB" with bar and percentage
 */
export function SegmentedUsageBarCompact({
  valueBytes,
  limitBytes,
  className,
  showDataLabel = true,
}: {
  valueBytes: number;
  limitBytes?: number;
  className?: string;
  /** Show usage data label (e.g., "224 MB / 100 GB") */
  showDataLabel?: boolean;
}) {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const percentage = limitBytes && limitBytes > 0
    ? Math.min((valueBytes / limitBytes) * 100, 100)
    : 0;

  const isUnlimited = !limitBytes || limitBytes === 0;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {showDataLabel && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">
            {formatBytes(valueBytes)}
          </span>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-muted-foreground">
            {isUnlimited ? '∞' : formatBytes(limitBytes)}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-full bg-gray-100 dark:bg-zinc-800/30 overflow-hidden h-2 gap-0.5 px-1 min-w-[80px] flex-1">
          {Array.from({ length: 8 }).map((_, i) => {
            const filledSegments = Math.ceil((percentage / 100) * 8);
            const isFilled = i < filledSegments;

            const getColor = () => {
              if (!isFilled) return 'bg-gray-200 dark:bg-zinc-700/30';
              // Color based on usage: green (low usage) -> orange -> red (high usage/near limit)
              if (percentage >= 90) return 'bg-gradient-to-r from-red-600 to-red-500';
              if (percentage >= 75) return 'bg-gradient-to-r from-orange-500 to-red-500';
              if (percentage >= 50) return 'bg-gradient-to-r from-amber-500 to-orange-500';
              return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
            };

            return (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-full transition-all duration-300 h-2',
                  getColor(),
                  isFilled && 'shadow-sm'
                )}
                style={{
                  transform: isFilled ? 'scaleY(1)' : 'scaleY(0.7)',
                  opacity: isFilled ? 1 : 0.3,
                }}
              />
            );
          })}
        </div>
        <span className={cn(
          'text-xs whitespace-nowrap font-medium tabular-nums min-w-[32px] text-right',
          // Color based on usage: green (low usage) -> orange -> red (high usage/near limit)
          percentage < 50 && 'text-emerald-600 dark:text-emerald-400',
          percentage >= 50 && percentage < 75 && 'text-amber-600 dark:text-amber-400',
          percentage >= 75 && percentage < 90 && 'text-orange-600 dark:text-orange-400',
          percentage >= 90 && 'text-red-600 dark:text-red-400',
          isUnlimited && 'text-gray-500 dark:text-zinc-400',
        )}>
          {isUnlimited ? '—' : `${percentage.toFixed(percentage < 1 && percentage > 0 ? 1 : 0)}%`}
        </span>
      </div>
    </div>
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
          <span className="text-sm text-gray-500 dark:text-zinc-400">{label}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-zinc-200">
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
            // Color based on usage: green (low usage) -> orange -> red (high usage/near limit)
            percentage < 50 && 'text-emerald-600 dark:text-emerald-400',
            percentage >= 50 && percentage < 75 && 'text-amber-600 dark:text-amber-400',
            percentage >= 75 && percentage < 90 && 'text-orange-600 dark:text-orange-400',
            percentage >= 90 && 'text-red-600 dark:text-red-400',
          )}>
            {percentage.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
