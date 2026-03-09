'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, RefreshCw, Rocket, Server, ShieldCheck, ArrowRightLeft, LifeBuoy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';

function StepBadge({ status }: { status: 'complete' | 'attention' | 'warning' | 'pending' }) {
  const styles =
    status === 'complete'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
      : status === 'attention'
        ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
        : status === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
          : 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300';

  return (
    <Badge variant="outline" className={styles}>
      {status}
    </Badge>
  );
}

export default function OnboardingPage() {
  const { toast } = useToast();
  const statusQuery = trpc.onboarding.status.useQuery();
  const syncAllMutation = trpc.servers.syncAll.useMutation({
    onSuccess: () => {
      toast({
        title: 'Server sync started',
        description: 'The latest server inventory has been synced.',
      });
      void statusQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Sync failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const progress =
    statusQuery.data?.summary.totalSteps
      ? (statusQuery.data.summary.completedSteps / statusQuery.data.summary.totalSteps) * 100
      : 0;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader className="space-y-4">
            <Badge variant="outline" className="w-fit rounded-full border-primary/25 bg-primary/10 px-3 py-1 text-primary">
              <Rocket className="mr-2 h-3.5 w-3.5" />
              Onboarding & Migration Wizard
            </Badge>
            <div>
              <CardTitle className="text-3xl font-semibold tracking-tight">Launch checklist</CardTitle>
              <CardDescription className="mt-2 max-w-2xl text-base">
                Guide the first server setup, import existing keys and users, and validate env and runtime health before go-live.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-[1.75rem] border border-border/70 bg-background/65 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Readiness</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {statusQuery.data?.summary.completedSteps ?? 0}/{statusQuery.data?.summary.totalSteps ?? 0}
                  </p>
                </div>
                {statusQuery.data?.summary.readyForLaunch ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                    Ready for launch
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300">
                    Still in setup
                  </Badge>
                )}
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-[1.4rem] border border-border/70 bg-background/65">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Active servers</p>
                  <p className="mt-3 text-3xl font-semibold">{statusQuery.data?.summary.activeServers ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.4rem] border border-border/70 bg-background/65">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Healthy servers</p>
                  <p className="mt-3 text-3xl font-semibold">{statusQuery.data?.summary.onlineServers ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.4rem] border border-border/70 bg-background/65">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Imported keys</p>
                  <p className="mt-3 text-3xl font-semibold">{statusQuery.data?.summary.accessKeyCount ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.4rem] border border-border/70 bg-background/65">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Users</p>
                  <p className="mt-3 text-3xl font-semibold">{statusQuery.data?.summary.userCount ?? 0}</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-xl">Quick actions</CardTitle>
            <CardDescription>Finish the common first-run tasks without leaving the wizard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-between rounded-2xl" asChild>
              <Link href="/dashboard/servers/deploy">
                <span className="inline-flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Deploy first server
                </span>
                <span>Open</span>
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-between rounded-2xl" asChild>
              <Link href="/dashboard/migration">
                <span className="inline-flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" />
                  Open migration tools
                </span>
                <span>Open</span>
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-between rounded-2xl" asChild>
              <Link href="/dashboard/incidents">
                <span className="inline-flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4" />
                  Review incident center
                </span>
                <span>Open</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between rounded-2xl"
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending}
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Sync all connected servers
              </span>
              {syncAllMutation.isPending ? 'Running...' : 'Run'}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-xl">Guided steps</CardTitle>
            <CardDescription>Follow the steps in order for a smoother first deployment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusQuery.data?.steps.map((step, index) => (
              <div key={step.id} className="rounded-[1.5rem] border border-border/70 bg-background/65 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background text-sm font-semibold">
                        {index + 1}
                      </div>
                      <StepBadge status={step.status} />
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{step.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                      <p className="mt-3 text-sm font-medium text-foreground">{step.summary}</p>
                    </div>
                  </div>
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link href={step.href}>{step.actionLabel}</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border border-border/70 bg-background/75">
            <CardHeader>
              <CardTitle className="text-xl">Environment validation</CardTitle>
              <CardDescription>Fresh VPS installs should clear these checks before public traffic is allowed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {statusQuery.data?.validation.errors.length ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Blocking issues</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {statusQuery.data.validation.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Blocking checks passed</AlertTitle>
                  <AlertDescription>No blocking production env issues were detected.</AlertDescription>
                </Alert>
              )}

              {statusQuery.data?.validation.warnings.length ? (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Warnings to review</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {statusQuery.data.validation.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border border-border/70 bg-background/75">
            <CardHeader>
              <CardTitle className="text-xl">Latest backup verification</CardTitle>
              <CardDescription>Use this as a final gate before migration cutover.</CardDescription>
            </CardHeader>
            <CardContent>
              {statusQuery.data?.latestBackupVerification ? (
                <div className="rounded-[1.5rem] border border-border/70 bg-background/65 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{statusQuery.data.latestBackupVerification.filename}</p>
                      <p className="text-sm text-muted-foreground">
                        Verified {formatDateTime(statusQuery.data.latestBackupVerification.verifiedAt)}
                      </p>
                    </div>
                    <StepBadge
                      status={statusQuery.data.latestBackupVerification.restoreReady ? 'complete' : 'warning'}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No backup verification record was found yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
