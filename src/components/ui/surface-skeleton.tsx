'use client';

import { cn } from '@/lib/utils';

export function SurfaceSkeleton({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={cn('ops-surface-skeleton p-5', className)}>
      <div className="space-y-3">
        <div className="ops-skeleton-line h-5 w-32" />
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={cn(
              'ops-skeleton-line h-4',
              index === lines - 1 ? 'w-3/5' : 'w-full'
            )}
          />
        ))}
      </div>
    </div>
  );
}
