'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { getBasePath, withBasePath } from '@/lib/base-path';
import {
  buildFetchRequestWithClientBuild,
  isNextRouterRscFetch,
  isSameOriginUrl,
} from '@/lib/deploy-guard-client';

type DeployGuardProviderProps = {
  children: React.ReactNode;
  initialBuildId: string;
};

type AppVersionPayload = {
  buildId?: string | null;
  builtAt?: string | null;
};

type BuildStatus = 'current' | 'stale' | 'unknown';

const DEPLOY_GUARD_POLL_MS = 60_000;
const DEPLOY_GUARD_INLINE_CHECK_TTL_MS = 5_000;
const STALE_SERVER_ACTION_PATTERNS = [
  'Failed to find Server Action',
  'older or newer deployment',
  'Cannot read properties of undefined (reading \'workers\')',
  'STALE_BUILD',
];
const SAME_ORIGIN_POST_METHOD = 'POST';

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

function resolveSubmitMethod(form: HTMLFormElement, submitter: HTMLElement | null) {
  const submitterMethod =
    submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
      ? submitter.getAttribute('formmethod')
      : null;

  return (submitterMethod || form.getAttribute('method') || 'GET').toUpperCase();
}

function shouldGuardFormSubmit(form: HTMLFormElement, submitter: HTMLElement | null) {
  const method = resolveSubmitMethod(form, submitter);
  if (method !== SAME_ORIGIN_POST_METHOD) {
    return false;
  }

  return isSameOriginUrl(form.getAttribute('action') || window.location.href, window.location.href);
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
  const bypassedFormsRef = useRef(new WeakSet<HTMLFormElement>());
  const pendingFormsRef = useRef(new WeakSet<HTMLFormElement>());
  const inlineBuildStatusRef = useRef<{
    checkedAt: number;
    status: BuildStatus;
    promise: Promise<BuildStatus> | null;
  }>({
    checkedAt: 0,
    status: 'unknown',
    promise: null,
  });

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

  const resolveBuildStatus = useCallback(async () => {
    try {
      const response = await fetch(withBasePath('/api/app-version'), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        return 'unknown' as const;
      }

      const payload = (await response.json()) as AppVersionPayload;
      const latestBuildId = payload.buildId?.trim();
      const currentBuildId = initialBuildIdRef.current?.trim();

      if (latestBuildId && !currentBuildId) {
        initialBuildIdRef.current = latestBuildId;
        return 'current' as const;
      }

      if (latestBuildId && currentBuildId && latestBuildId !== currentBuildId) {
        return 'stale' as const;
      }

      return 'current' as const;
    } catch {
      return 'unknown' as const;
    }
  }, []);

  const resolveRecentBuildStatus = useCallback(async () => {
    const cached = inlineBuildStatusRef.current;
    const now = Date.now();
    if (now - cached.checkedAt < DEPLOY_GUARD_INLINE_CHECK_TTL_MS) {
      return cached.status;
    }

    if (cached.promise) {
      return cached.promise;
    }

    const promise = resolveBuildStatus()
      .then((status) => {
        inlineBuildStatusRef.current = {
          checkedAt: Date.now(),
          status,
          promise: null,
        };
        return status;
      })
      .catch(() => {
        inlineBuildStatusRef.current = {
          checkedAt: Date.now(),
          status: 'unknown',
          promise: null,
        };
        return 'unknown' as const;
      });

    inlineBuildStatusRef.current = {
      checkedAt: cached.checkedAt,
      status: cached.status,
      promise,
    };

    return promise;
  }, [resolveBuildStatus]);

  const checkForNewBuild = useCallback(async () => {
    if (reloadTriggeredRef.current || isPublicSharePath(pathname)) {
      return;
    }

    if ((await resolveBuildStatus()) === 'stale') {
      triggerReload('new-build');
    }
  }, [pathname, resolveBuildStatus, triggerReload]);

  useEffect(() => {
    if (isPublicSharePath(pathname)) {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const buildId = initialBuildIdRef.current?.trim();
      if (
        !reloadTriggeredRef.current &&
        isNextRouterRscFetch(args[0], args[1], window.location.href) &&
        (await resolveRecentBuildStatus()) === 'stale'
      ) {
        triggerReload('new-build');
        throw new Error('STALE_BUILD');
      }

      const requestArgs = buildFetchRequestWithClientBuild(
        args[0],
        args[1],
        buildId,
        window.location.href,
      );
      const response = await originalFetch(requestArgs[0], requestArgs[1]);

      if (
        !reloadTriggeredRef.current &&
        response.headers.get('x-atomic-stale-build') === '1'
      ) {
        triggerReload('stale-action');
        throw new Error('STALE_BUILD');
      }

      return response;
    };

    const handleSubmitCapture = (event: Event) => {
      const submitEvent = event as SubmitEvent;
      const form = submitEvent.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const submitter = submitEvent.submitter instanceof HTMLElement ? submitEvent.submitter : null;
      if (!shouldGuardFormSubmit(form, submitter)) {
        return;
      }

      if (bypassedFormsRef.current.has(form)) {
        bypassedFormsRef.current.delete(form);
        return;
      }

      if (pendingFormsRef.current.has(form)) {
        submitEvent.preventDefault();
        return;
      }

      submitEvent.preventDefault();
      pendingFormsRef.current.add(form);

      void (async () => {
        try {
          if ((await resolveBuildStatus()) === 'stale') {
            triggerReload('new-build');
            return;
          }

          if (!form.isConnected) {
            return;
          }

          bypassedFormsRef.current.add(form);
          if (
            (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
            submitter.isConnected
          ) {
            form.requestSubmit(submitter);
            return;
          }

          form.requestSubmit();
        } finally {
          pendingFormsRef.current.delete(form);
        }
      })();
    };

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
    document.addEventListener('submit', handleSubmitCapture, true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    void checkForNewBuild();

    return () => {
      window.fetch = originalFetch;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('submit', handleSubmitCapture, true);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
      }
    };
  }, [pathname, checkForNewBuild, resolveBuildStatus, resolveRecentBuildStatus, triggerReload]);

  return children;
}
