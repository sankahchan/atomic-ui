'use client';

import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn('ops-empty-state', className)}>
      {Icon ? (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary dark:border-cyan-400/16 dark:bg-cyan-400/10 dark:text-cyan-300">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
