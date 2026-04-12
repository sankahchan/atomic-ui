import { NextResponse } from 'next/server';
import { getCurrentUser, type AuthUser } from '@/lib/auth';

export async function requireAdminRouteScope(input: {
  canAccess: (scope?: string | null) => boolean;
  unauthorizedMessage?: string;
  forbiddenMessage?: string;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return {
      user: null as AuthUser | null,
      response: NextResponse.json(
        { error: input.unauthorizedMessage || 'Unauthorized' },
        { status: 401 },
      ),
    };
  }

  if (!input.canAccess(user.adminScope)) {
    return {
      user: null as AuthUser | null,
      response: NextResponse.json(
        { error: input.forbiddenMessage || 'Forbidden' },
        { status: 403 },
      ),
    };
  }

  return {
    user,
    response: null as NextResponse | null,
  };
}
