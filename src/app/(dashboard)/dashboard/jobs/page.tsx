'use client';

import { useMemo } from 'react';
import { ActivitySquare, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { useToast } from '@/hooks/use-toast';
import { trpc } from '@/lib/trpc';
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils';

type SchedulerJobRunRow = {
  id: string;
  trigger: string;
  status: string;
  startedAt: string | Date;
  finishedAt?: string | Date | null;
  durationMs?: number | null;
  summary?: string | null;
  error?: string | null;
  resultPreview?: string | null;
};

type SchedulerJobRow = {
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  cadenceLabel?: string | null;
  cronExpression?: string | null;
  lastStatus: string;
  runtimeStatus?: string;
  lastTrigger?: string | null;
  lastStartedAt?: string | Date | null;
  lastFinishedAt?: string | Date | null;
  lastSucceededAt?: string | Date | null;
  lastDurationMs?: number | null;
  lastSummary?: string | null;
  lastError?: string | null;
  nextRunAt?: string | Date | null;
  runCount: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  consecutiveFailures: number;
  isPaused?: boolean;
  pausedAt?: string | Date | null;
  pausedReason?: string | null;
  pausedBy?: string | null;
  backoffMinutes?: number;
  backoffUntil?: string | Date | null;
  manualRunSupported?: boolean;
  runs: SchedulerJobRunRow[];
};

type DatabaseRuntimeSummary = {
  engine: 'sqlite' | 'postgres' | 'unknown';
  backupMode: 'SQLITE_FILE' | 'POSTGRES_DUMP' | 'UNSUPPORTED';
  productionReady: boolean;
  warnings: string[];
};

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'SUCCESS':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
    case 'FAILED':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300';
    case 'RUNNING':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200';
    case 'SKIPPED':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200';
    case 'PAUSED':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200';
    default:
      return 'border-border/70 bg-background/70 text-muted-foreground';
  }
}

function formatDuration(durationMs?: number | null) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
    return '—';
  }
  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }
  const seconds = durationMs / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  return `${(seconds / 60).toFixed(1)} min`;
}

export default function SchedulerJobsPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const jobsQuery = trpc.system.getSchedulerJobs.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const runJobMutation = trpc.system.runSchedulerJob.useMutation({
    onSuccess: async () => {
      await jobsQuery.refetch();
      toast({
        title: 'Scheduler job started',
        description: 'The manual run finished and the scheduler state has been refreshed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Scheduler job failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const pauseJobMutation = trpc.system.setSchedulerJobPaused.useMutation({
    onSuccess: async (_data, variables) => {
      await jobsQuery.refetch();
      toast({
        title: variables.paused ? 'Scheduler job paused' : 'Scheduler job resumed',
        description: variables.paused
          ? 'Scheduled runs are paused until you resume the job.'
          : 'Scheduled execution has been restored.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Scheduler update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const jobs = useMemo(
    () => (jobsQuery.data?.jobs ?? []) as SchedulerJobRow[],
    [jobsQuery.data?.jobs],
  );
  const totals = jobsQuery.data?.totals ?? {
    jobs: 0,
    running: 0,
    failed: 0,
    skipped: 0,
    paused: 0,
    healthy: 0,
  };
  const databaseRuntime = jobsQuery.data?.databaseRuntime as DatabaseRuntimeSummary | undefined;

  const jobsByCategory = useMemo(() => {
    const groups = new Map<string, SchedulerJobRow[]>();
    for (const job of jobs) {
      const category = job.category || 'OTHER';
      const list = groups.get(category) || [];
      list.push(job);
      groups.set(category, list);
    }
    return Array.from(groups.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [jobs]);

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-5">
            <BackButton href="/dashboard/tools" label={t('nav.tools')} />
            <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
              <ActivitySquare className="h-3.5 w-3.5" />
              {t('nav.jobs')}
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {t('nav.jobs')}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Watch scheduler health, check the last result for each recurring job, and see which automations are currently failing or skipping.
              </p>
            </div>
          </div>

          <div className="ops-panel space-y-3">
            <div className="space-y-1">
              <p className="ops-section-heading">Operator Summary</p>
              <h2 className="text-xl font-semibold">Scheduler pulse</h2>
              <p className="text-sm text-muted-foreground">
                Refreshes every 30 seconds and persists across service restarts.
              </p>
              {databaseRuntime ? (
                <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Database engine: {databaseRuntime.engine.toUpperCase()}
                  </p>
                  <p className="mt-1">
                    Backup mode: {databaseRuntime.backupMode === 'SQLITE_FILE' ? 'SQLite file copy' : databaseRuntime.backupMode === 'POSTGRES_DUMP' ? 'Postgres dump' : 'Unsupported'}
                  </p>
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-full border-border/70 bg-background/70"
              onClick={() => jobsQuery.refetch()}
              disabled={jobsQuery.isFetching}
            >
              {jobsQuery.isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh now
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Jobs</p>
            <p className="mt-2 text-2xl font-semibold">{totals.jobs}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Healthy</p>
            <p className="mt-2 text-2xl font-semibold">{totals.healthy}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Running</p>
            <p className="mt-2 text-2xl font-semibold">{totals.running}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Failed</p>
            <p className="mt-2 text-2xl font-semibold">{totals.failed}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Skipped</p>
            <p className="mt-2 text-2xl font-semibold">{totals.skipped}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Paused</p>
            <p className="mt-2 text-2xl font-semibold">{totals.paused}</p>
          </CardContent>
        </Card>
      </div>

      {databaseRuntime?.warnings?.length ? (
        <Card className="ops-panel border-amber-500/30">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-amber-700 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="space-y-1">
              <p className="font-medium">Database runtime note</p>
              {databaseRuntime.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {jobsQuery.isLoading ? (
        <Card className="ops-panel">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading scheduler jobs…
          </CardContent>
        </Card>
      ) : null}

      {jobsQuery.error ? (
        <Card className="ops-panel border-rose-500/30">
          <CardContent className="flex items-start gap-3 p-6 text-sm text-rose-600 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">Scheduler status failed to load</p>
              <p className="mt-1 text-rose-500/80">{jobsQuery.error.message}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-5">
        {jobsByCategory.map(([category, categoryJobs]) => (
          <Card key={category} className="ops-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{category}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoryJobs.map((job) => (
                <div
                  key={job.key}
                  data-testid={`scheduler-job-${job.key}`}
                  className="rounded-2xl border border-border/60 bg-background/70 p-4"
                >
                  {(() => {
                    const latestFailedRun = job.runs.find((run) => run.status === 'FAILED');
                    return (
                      <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{job.name}</p>
                        <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(job.runtimeStatus || job.lastStatus))}>
                          {job.runtimeStatus || job.lastStatus}
                        </Badge>
                        {job.consecutiveFailures > 0 ? (
                          <Badge variant="outline" className="rounded-full text-xs">
                            {job.consecutiveFailures} consecutive fail
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{job.description}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{job.cadenceLabel || 'Manual'}</p>
                      <p className="mt-1">{job.nextRunAt ? `Next: ${formatRelativeTime(job.nextRunAt)}` : 'No next run'}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`scheduler-pause-${job.key}`}
                      onClick={() =>
                        pauseJobMutation.mutate({
                          jobKey: job.key,
                          paused: !job.isPaused,
                          reason: job.isPaused ? undefined : 'Paused from the jobs workspace',
                        })
                      }
                      disabled={pauseJobMutation.isPending || runJobMutation.isPending}
                    >
                      {job.isPaused ? 'Resume' : 'Pause'}
                    </Button>
                    {job.manualRunSupported ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid={`scheduler-run-${job.key}`}
                        onClick={() => runJobMutation.mutate({ jobKey: job.key })}
                        disabled={runJobMutation.isPending || pauseJobMutation.isPending || job.runtimeStatus === 'RUNNING' || job.isPaused}
                      >
                        {runJobMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Run now
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                    <p>Last trigger: {job.lastTrigger || '—'}</p>
                    <p>Started: {job.lastStartedAt ? formatDateTime(job.lastStartedAt) : '—'}</p>
                    <p>Finished: {job.lastFinishedAt ? formatDateTime(job.lastFinishedAt) : '—'}</p>
                    <p>Duration: {formatDuration(job.lastDurationMs)}</p>
                    <p>Runs: {job.runCount}</p>
                    <p>Success: {job.successCount}</p>
                    <p>Failed: {job.failureCount}</p>
                    <p>Skipped: {job.skippedCount}</p>
                  </div>

                  {job.isPaused ? (
                    <div className="mt-3 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-200">
                      <span className="font-medium">Paused:</span>{' '}
                      {job.pausedReason?.trim() || 'Scheduled runs are disabled for this job.'}
                      {job.pausedBy ? ` • ${job.pausedBy}` : ''}
                      {job.pausedAt ? ` • ${formatDateTime(job.pausedAt)}` : ''}
                    </div>
                  ) : null}

                  {!job.isPaused && (job.backoffMinutes || 0) > 0 && job.backoffUntil ? (
                    <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                      <span className="font-medium">Retry cooldown:</span> Suggested backoff is {job.backoffMinutes} minute
                      {job.backoffMinutes === 1 ? '' : 's'} after repeated failures. Next retry window: {formatDateTime(job.backoffUntil)}.
                    </div>
                  ) : null}

                  {job.lastSummary ? (
                    <div className="mt-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Latest summary:</span> {job.lastSummary}
                    </div>
                  ) : null}

                  {job.lastError ? (
                    <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                      <span className="font-medium">Latest error:</span> {job.lastError}
                    </div>
                  ) : null}

                  {latestFailedRun?.resultPreview ? (
                    <div className="mt-3 rounded-xl border border-border/50 bg-background/65 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Latest failure detail:</span>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5">{latestFailedRun.resultPreview}</pre>
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Recent Runs
                    </div>
                    {job.runs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No runs recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {job.runs.map((run) => (
                          <div key={run.id} className="rounded-xl border border-border/50 px-3 py-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={cn('rounded-full border text-[11px]', getStatusBadgeClass(run.status))}>
                                  {run.status}
                                </Badge>
                                <span className="text-muted-foreground">{run.trigger}</span>
                              </div>
                              <span className="text-muted-foreground">
                                {formatDateTime(run.startedAt)} • {formatDuration(run.durationMs)}
                              </span>
                            </div>
                            {run.summary ? (
                              <p className="mt-2 text-muted-foreground">{run.summary}</p>
                            ) : null}
                            {run.error ? (
                              <p className="mt-2 text-rose-600 dark:text-rose-300">{run.error}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
