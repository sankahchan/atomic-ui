import { z } from 'zod';

export const serverLifecycleModeSchema = z.enum(['ACTIVE', 'DRAINING', 'MAINTENANCE']);
export type ServerLifecycleMode = z.infer<typeof serverLifecycleModeSchema>;

type ServerAssignmentCheckOptions = {
  allowDraining?: boolean;
};

export function canAssignKeysToServer(server: {
  isActive: boolean;
  lifecycleMode?: string | null;
}, options: ServerAssignmentCheckOptions = {}) {
  if (!server.isActive) {
    return {
      allowed: false as const,
      reason: 'Server is inactive.',
    };
  }

  const lifecycleMode = serverLifecycleModeSchema.safeParse(server.lifecycleMode ?? 'ACTIVE');
  const mode = lifecycleMode.success ? lifecycleMode.data : 'ACTIVE';

  if (mode === 'DRAINING' && !options.allowDraining) {
    return {
      allowed: false as const,
      reason: 'Server is draining and not accepting new assignments.',
    };
  }

  if (mode === 'MAINTENANCE') {
    return {
      allowed: false as const,
      reason: 'Server is in maintenance mode and not accepting assignments.',
    };
  }

  return {
    allowed: true as const,
    reason: null,
  };
}
