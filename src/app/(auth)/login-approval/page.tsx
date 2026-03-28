'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function redirectAfterLogin(target: string) {
  if (typeof window !== 'undefined') {
    window.location.assign(target);
  }
}

function LoginApprovalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const tempToken = searchParams.get('token');
  const completionStarted = useRef(false);

  useEffect(() => {
    router.prefetch('/login');
    router.prefetch('/dashboard');
    router.prefetch('/portal');
  }, [router]);

  const statusQuery = trpc.auth.getAdminLoginApprovalStatus.useQuery(
    { tempToken: tempToken || '' },
    {
      enabled: Boolean(tempToken),
      refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 3000 : false),
      retry: false,
    },
  );

  const completeMutation = trpc.auth.completeAdminLoginApproval.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Approval received',
        description: 'Your sign-in has been approved.',
      });
      redirectAfterLogin(data.role === 'ADMIN' ? '/dashboard' : '/portal');
    },
    onError: (error) => {
      completionStarted.current = false;
      toast({
        title: 'Approval completion failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!tempToken) {
      router.replace('/login');
      return;
    }

    const status = statusQuery.data?.status;
    if (status === 'APPROVED' && !completionStarted.current && !completeMutation.isPending) {
      completionStarted.current = true;
      completeMutation.mutate({ tempToken });
    }
  }, [completeMutation, router, statusQuery.data?.status, tempToken]);

  const approval = statusQuery.data?.approval;
  const status = statusQuery.data?.status ?? 'PENDING';

  const statusMeta = useMemo(() => {
    switch (status) {
      case 'APPROVED':
      case 'COMPLETED':
        return {
          title: 'Approval granted',
          description: 'Finishing your sign-in now.',
          icon: CheckCircle2,
          iconClassName: 'text-emerald-500',
        };
      case 'REJECTED':
        return {
          title: 'Sign-in rejected',
          description: 'An administrator rejected this unusual login attempt.',
          icon: XCircle,
          iconClassName: 'text-red-500',
        };
      case 'EXPIRED':
        return {
          title: 'Approval expired',
          description: 'The approval window expired. Please sign in again.',
          icon: AlertTriangle,
          iconClassName: 'text-amber-500',
        };
      default:
        return {
          title: 'Awaiting approval',
          description: 'An administrator must approve this unusual sign-in before you can continue.',
          icon: Clock3,
          iconClassName: 'text-sky-500',
        };
    }
  }, [status]);

  if (!tempToken) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#dce9f5] dark:bg-[#101828] transition-colors duration-500">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <Button
        variant="ghost"
        onClick={() => router.push('/login')}
        className="absolute top-4 left-4 z-20"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Login
      </Button>

      <Card className={cn('glass-medium w-full max-w-2xl mx-4 rounded-2xl shadow-xl relative z-10')}>
        <CardHeader className="space-y-4 text-center pt-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <ShieldCheck className="h-8 w-8 text-blue-500" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-gray-800 dark:text-white">
              {statusMeta.title}
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400 mt-2">
              {statusMeta.description}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pb-8">
          <div className="rounded-[1.5rem] border border-border/60 bg-background/70 p-5">
            {statusQuery.isLoading ? (
              <div className="flex items-center justify-center gap-3 py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking approval status…
              </div>
            ) : statusQuery.error ? (
              <div className="space-y-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {statusQuery.error.message || 'This approval request is no longer available.'}
                </p>
                <Button onClick={() => router.push('/login')} className="rounded-full">
                  Return to Login
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <statusMeta.icon className={cn('h-5 w-5', statusMeta.iconClassName)} />
                  <div className="text-sm text-muted-foreground">
                    {status === 'PENDING' && approval?.remainingMinutes
                      ? `Approval expires in about ${approval.remainingMinutes} minute${approval.remainingMinutes === 1 ? '' : 's'}.`
                      : status === 'REJECTED'
                        ? approval?.rejectionReason || 'No rejection note was provided.'
                        : status === 'APPROVED'
                          ? 'Your admin approval has been granted. Signing you in now.'
                          : status === 'EXPIRED'
                            ? 'The approval request timed out.'
                            : 'Finalizing your approved sign-in.'}
                  </div>
                </div>

                {approval ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Account</div>
                      <div className="mt-2 text-sm font-medium">{approval.email}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{approval.role}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Source</div>
                      <div className="mt-2 text-sm font-medium">{approval.ip}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[approval.countryCode, approval.host].filter(Boolean).join(' • ') || 'Unknown location'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-4 md:col-span-2">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Device</div>
                      <div className="mt-2 text-sm font-medium">{approval.deviceLabel}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[approval.browser, approval.os, approval.deviceType].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Triggers</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {approval.newDevice && <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-600 dark:text-sky-300">New device</span>}
                        {approval.newCountry && <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-300">New country</span>}
                        {!approval.newDevice && !approval.newCountry && (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Manual review</span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Requested</div>
                      <div className="mt-2 text-sm font-medium">
                        {formatDistanceToNow(approval.createdAt, { addSuffix: true })}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {approval.via2FA ? `Verified with ${approval.method || '2FA'}` : 'Password step completed'}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button variant="outline" className="rounded-full" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching}>
                    {statusQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Refresh Status
                  </Button>
                  {(status === 'REJECTED' || status === 'EXPIRED') && (
                    <Button className="rounded-full" onClick={() => router.push('/login')}>
                      Sign In Again
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginApprovalPage() {
  return (
    <Suspense fallback={null}>
      <LoginApprovalContent />
    </Suspense>
  );
}
