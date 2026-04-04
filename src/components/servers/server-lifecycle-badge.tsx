'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ServerLifecycleModeLike = 'ACTIVE' | 'DRAINING' | 'MAINTENANCE' | string | null | undefined;

export function getServerLifecycleMeta(mode: ServerLifecycleModeLike) {
  const normalizedMode = mode || 'ACTIVE';

  switch (normalizedMode) {
    case 'DRAINING':
      return {
        label: 'Draining',
        className: 'border-amber-500/30 text-amber-500',
        assignmentHint: 'Auto avoids it. Manual admin use is allowed.',
      };
    case 'MAINTENANCE':
      return {
        label: 'Maintenance',
        className: 'border-sky-500/30 text-sky-500',
        assignmentHint: 'All new assignments are blocked.',
      };
    case 'ACTIVE':
      return {
        label: 'Active',
        className: 'border-emerald-500/30 text-emerald-500',
        assignmentHint: 'Auto and manual assignments are allowed.',
      };
    default:
      return {
        label: normalizedMode,
        className: 'border-border/60 text-muted-foreground',
        assignmentHint: 'Server lifecycle state is custom.',
      };
  }
}

export function ServerLifecycleBadge({
  mode,
  className,
  showActive = false,
}: {
  mode: ServerLifecycleModeLike;
  className?: string;
  showActive?: boolean;
}) {
  const meta = getServerLifecycleMeta(mode);

  if (meta.label === 'Active' && !showActive) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold', meta.className, className)}
    >
      {meta.label}
    </Badge>
  );
}
