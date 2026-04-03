'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { getBasePath, withBasePath } from '@/lib/base-path';

type DeployGuardProviderProps = {
  children: React.ReactNode;
  initialBuildId: string;
};

type AppVersionPayload = {
  buildId?: string | null;
  builtAt?: string | null;
};

const DEPLOY_GUARD_POLL_MS = 60_000;
const STALE_SERVER_ACTION_PATTERNS = [
  'Failed to find Server Action',
  'older or newer deployment',
  'Cannot read properties of undefined (reading \'workers\')',
];

function isPublicSharePath(pathname: string | null) {
  const currentPath = pathname || '/';
  const basePath = getBasePath();
  const normalizedPath =
    basePath && currentPath.startsWith(`${basePath}/`)
      ? currentPath.slice(basePath.length) || '/'
      : currentPath === basePath
        ? '/'
        : currentPath;

  return (
    normalizedPath.startsWith('/s/') ||
    normalizedPath.startsWith('/sub/') ||
    normalizedPath.startsWith('/share/') ||
    normalizedPath.startsWith('/c/')
  );
}

function getErrorText(error: unknown) {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }

  return String(error);
}

function isStaleServerActionError(error: unknown) {
  const text = getErrorText(error);
  return STALE_SERVER_ACTION_PATTERNS.some((pattern) => text.includes(pattern));
}

export function DeployGuardProvider({
  children,
  initialBuildId,
}: DeployGuardProviderProps) {
  const pathname = usePathname();
  const { toast } = useToast();
  const initialBuildIdRef = useRef(initialBuildId && initialBuildId !== 'unknown' ? initialBuildId : '');
  const reloadTriggeredRef = useRef(false);
  const toastShownRef = useRef(false);
  const reloadTimerRef = useRef<number | null>(null);

  const triggerReload = useCallback(
    (reason: 'new-build' | 'stale-action') => {
      if (reloadTriggeredRef.current) {
        return;
      }
      reloadTriggeredRef.current = true;

      if (!toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: reason === 'new-build' ? 'Update available' : 'Refreshing outdated tab',
          description:
            reason === 'new-build'
              ? 'A newer deploy is live. This tab will reload to keep actions working.'
              : 'This tab is using an older deploy. Reloading now to restore actions.',
          variant: 'destructive',
          action: (
            <ToastAction altText="Reload now" onClick={() => window.location.reload()}>
              Reload now
            </ToastAction>
          ),
        });
      }

      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
      }

      reloadTimerRef.current = window.setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    [toast],
  );

  const checkForNewBuild = useCallback(async () => {
    if (reloadTriggeredRef.current || isPublicSharePath(pathname)) {
      return;
    }

    try {
      const response = await fetch(withBasePath('/api/app-version'), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as AppVersionPayload;
      const latestBuildId = payload.buildId?.trim();
      const currentBuildId = initialBuildIdRef.current?.trim();

      if (latestBuildId && !currentBuildId) {
        initialBuildIdRef.current = latestBuildId;
        return;
      }

      if (latestBuildId && currentBuildId && latestBuildId !== currentBuildId) {
        triggerReload('new-build');
      }
    } catch {
      // Ignore transient version-check failures.
    }
  }, [pathname, triggerReload]);

  useEffect(() => {
    if (isPublicSharePath(pathname)) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForNewBuild();
      }
    };

    const handleFocus = () => {
      void checkForNewBuild();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isStaleServerActionError(event.reason)) {
        return;
      }
      event.preventDefault();
      triggerReload('stale-action');
    };

    const handleError = (event: ErrorEvent) => {
      if (!isStaleServerActionError(event.error || event.message)) {
        return;
      }
      triggerReload('stale-action');
    };

    const interval = window.setInterval(() => {
      void checkForNewBuild();
    }, DEPLOY_GUARD_POLL_MS);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    void checkForNewBuild();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
      }
    };
  }, [pathname, checkForNewBuild, triggerReload]);

  return children;
}
