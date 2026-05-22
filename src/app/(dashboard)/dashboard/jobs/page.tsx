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
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
  const jobsQuery = trpc.system.getSchedulerJobs.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const runJobMutation = trpc.system.runSchedulerJob.useMutation({
    onSuccess: async () => {
      await jobsQuery.refetch();
      toast({
        title: isMyanmar ? 'အချိန်ဇယားအလုပ်ကို စတင်ပြီးပါပြီ' : 'Scheduler job started',
        description: isMyanmar ? 'လက်ဖြင့် လည်ပတ်မှု ပြီးဆုံးပြီး အချိန်ဇယား အခြေအနေကို ပြန်လည်ရယူထားပါသည်။' : 'The manual run finished and the scheduler state has been refreshed.',
      });
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'အချိန်ဇယားအလုပ် မအောင်မြင်ပါ' : 'Scheduler job failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const pauseJobMutation = trpc.system.setSchedulerJobPaused.useMutation({
    onSuccess: async (_data, variables) => {
      await jobsQuery.refetch();
      toast({
        title: variables.paused ? (isMyanmar ? 'အချိန်ဇယားအလုပ်ကို ရပ်ထားပြီး' : 'Scheduler job paused') : (isMyanmar ? 'အချိန်ဇယားအလုပ်ကို ပြန်လည်စတင်ပြီး' : 'Scheduler job resumed'),
        description: variables.paused
          ? (isMyanmar ? 'ဤအလုပ်ကို ပြန်မဖွင့်မချင်း အချိန်ဇယား လည်ပတ်မှုများကို ရပ်ထားမည်။' : 'Scheduled runs are paused until you resume the job.')
          : (isMyanmar ? 'အချိန်ဇယား လုပ်ဆောင်မှုကို ပြန်လည်အသက်သွင်းထားပါသည်။' : 'Scheduled execution has been restored.'),
      });
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'အချိန်ဇယား အပ်ဒိတ် မအောင်မြင်ပါ' : 'Scheduler update failed',
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
                {isMyanmar
                  ? 'အချိန်ဇယား ကျန်းမာရေးကို စောင့်ကြည့်ပါ၊ ထပ်တလဲလဲ လည်ပတ်သော အလုပ်တစ်ခုချင်းစီ၏ နောက်ဆုံးရလဒ်ကို စစ်ဆေးပါ၊ လက်ရှိ မအောင်မြင်သော သို့မဟုတ် ကျော်ထားသော automation များကို ကြည့်ပါ။'
                  : 'Watch scheduler health, check the last result for each recurring job, and see which automations are currently failing or skipping.'}
              </p>
            </div>
          </div>

          <div className="ops-panel space-y-3">
            <div className="space-y-1">
              <p className="ops-section-heading">{isMyanmar ? 'အော်ပရေးရှင်း အနှစ်ချုပ်' : 'Operator Summary'}</p>
              <h2 className="text-xl font-semibold">{isMyanmar ? 'အချိန်ဇယား အခြေအနေ' : 'Scheduler pulse'}</h2>
              <p className="text-sm text-muted-foreground">
                {isMyanmar ? 'စက္ကန့် ၃၀ တိုင်း ပြန်လည်ရယူပြီး ဝန်ဆောင်မှု ပြန်စတင်သော်လည်း အခြေအနေကို ဆက်လက်ပြသမည်။' : 'Refreshes every 30 seconds and persists across service restarts.'}
              </p>
              {databaseRuntime ? (
                <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {isMyanmar ? 'ဒေတာဘေ့စ် အင်ဂျင်' : 'Database engine'}: {databaseRuntime.engine.toUpperCase()}
                  </p>
                  <p className="mt-1">
                    {isMyanmar ? 'အရန်သိမ်း နည်းလမ်း' : 'Backup mode'}: {databaseRuntime.backupMode === 'SQLITE_FILE' ? (isMyanmar ? 'SQLite ဖိုင် ကူးယူမှု' : 'SQLite file copy') : databaseRuntime.backupMode === 'POSTGRES_DUMP' ? (isMyanmar ? 'Postgres ဒမ့်' : 'Postgres dump') : (isMyanmar ? 'မထောက်ပံ့ပါ' : 'Unsupported')}
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
              {isMyanmar ? 'ယခုပင် ပြန်လည်ရယူမည်' : 'Refresh now'}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'လုပ်ငန်းများ' : 'Jobs'}</p>
            <p className="mt-2 text-2xl font-semibold">{totals.jobs}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ကောင်းမွန်' : 'Healthy'}</p>
            <p className="mt-2 text-2xl font-semibold">{totals.healthy}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'လည်ပတ်နေ' : 'Running'}</p>
            <p className="mt-2 text-2xl font-semibold">{totals.running}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'မအောင်မြင်' : 'Failed'}</p>
            <p className="mt-2 text-2xl font-semibold">{totals.failed}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ကျော်သွား' : 'Skipped'}</p>
            <p className="mt-2 text-2xl font-semibold">{totals.skipped}</p>
          </CardContent>
        </Card>
        <Card className="ops-panel">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ရပ်ထား' : 'Paused'}</p>
            <p className="mt-2 text-2xl font-semibold">{totals.paused}</p>
          </CardContent>
        </Card>
      </div>

      {databaseRuntime?.warnings?.length ? (
        <Card className="ops-panel border-amber-500/30">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-amber-700 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="space-y-1">
              <p className="font-medium">{isMyanmar ? 'ဒေတာဘေ့စ် runtime မှတ်ချက်' : 'Database runtime note'}</p>
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
            {isMyanmar ? 'အချိန်ဇယားအလုပ်များကို ရယူနေသည်…' : 'Loading scheduler jobs…'}
          </CardContent>
        </Card>
      ) : null}

      {jobsQuery.error ? (
        <Card className="ops-panel border-rose-500/30">
          <CardContent className="flex items-start gap-3 p-6 text-sm text-rose-600 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">{isMyanmar ? 'အချိန်ဇယား အခြေအနေကို မရယူနိုင်ပါ' : 'Scheduler status failed to load'}</p>
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
                            {job.consecutiveFailures} {isMyanmar ? 'ကြိမ်ဆက် မအောင်မြင်' : 'consecutive fail'}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{job.description}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{job.cadenceLabel || (isMyanmar ? 'လက်ဖြင့်' : 'Manual')}</p>
                      <p className="mt-1">{job.nextRunAt ? `${isMyanmar ? 'နောက်ထပ်' : 'Next'}: ${formatRelativeTime(job.nextRunAt)}` : isMyanmar ? 'နောက်ထပ် လည်ပတ်မှု မရှိပါ' : 'No next run'}</p>
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
                      {job.isPaused ? (isMyanmar ? 'ပြန်ဖွင့်မည်' : 'Resume') : (isMyanmar ? 'ရပ်မည်' : 'Pause')}
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
                        {isMyanmar ? 'ယခုပင် လည်ပတ်မည်' : 'Run now'}
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                    <p>{isMyanmar ? 'နောက်ဆုံး စတင်အကြောင်းရင်း' : 'Last trigger'}: {job.lastTrigger || '—'}</p>
                    <p>{isMyanmar ? 'စတင်ချိန်' : 'Started'}: {job.lastStartedAt ? formatDateTime(job.lastStartedAt) : '—'}</p>
                    <p>{isMyanmar ? 'ပြီးဆုံးချိန်' : 'Finished'}: {job.lastFinishedAt ? formatDateTime(job.lastFinishedAt) : '—'}</p>
                    <p>{isMyanmar ? 'ကြာချိန်' : 'Duration'}: {formatDuration(job.lastDurationMs)}</p>
                    <p>{isMyanmar ? 'လည်ပတ်မှု အရေအတွက်' : 'Runs'}: {job.runCount}</p>
                    <p>{isMyanmar ? 'အောင်မြင်' : 'Success'}: {job.successCount}</p>
                    <p>{isMyanmar ? 'မအောင်မြင်' : 'Failed'}: {job.failureCount}</p>
                    <p>{isMyanmar ? 'ကျော်သွား' : 'Skipped'}: {job.skippedCount}</p>
                  </div>

                  {job.isPaused ? (
                    <div className="mt-3 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-200">
                      <span className="font-medium">{isMyanmar ? 'ရပ်ထားသည်:' : 'Paused:'}</span>{' '}
                      {job.pausedReason?.trim() || (isMyanmar ? 'ဤအလုပ်အတွက် အချိန်ဇယားလည်ပတ်မှုကို ပိတ်ထားပါသည်။' : 'Scheduled runs are disabled for this job.')}
                      {job.pausedBy ? ` • ${job.pausedBy}` : ''}
                      {job.pausedAt ? ` • ${formatDateTime(job.pausedAt)}` : ''}
                    </div>
                  ) : null}

                  {!job.isPaused && (job.backoffMinutes || 0) > 0 && job.backoffUntil ? (
                    <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                      <span className="font-medium">{isMyanmar ? 'ပြန်ကြိုးစားရန် အအေးချိန်:' : 'Retry cooldown:'}</span>{' '}
                      {isMyanmar
                        ? `ထပ်ခါတလဲလဲ မအောင်မြင်ပြီးနောက် ${job.backoffMinutes} မိနစ် အနားပေးထားပါသည်။ နောက်တစ်ကြိမ် ပြန်လည်ကြိုးစားနိုင်မည့်အချိန်မှာ ${formatDateTime(job.backoffUntil)} ဖြစ်သည်။`
                        : `Suggested backoff is ${job.backoffMinutes} minute${job.backoffMinutes === 1 ? '' : 's'} after repeated failures. Next retry window: ${formatDateTime(job.backoffUntil)}.`}
                    </div>
                  ) : null}

                  {job.lastSummary ? (
                    <div className="mt-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{isMyanmar ? 'နောက်ဆုံး အနှစ်ချုပ်:' : 'Latest summary:'}</span> {job.lastSummary}
                    </div>
                  ) : null}

                  {job.lastError ? (
                    <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                      <span className="font-medium">{isMyanmar ? 'နောက်ဆုံး အမှား:' : 'Latest error:'}</span> {job.lastError}
                    </div>
                  ) : null}

                  {latestFailedRun?.resultPreview ? (
                    <div className="mt-3 rounded-xl border border-border/50 bg-background/65 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{isMyanmar ? 'နောက်ဆုံး မအောင်မြင်မှု အသေးစိတ်:' : 'Latest failure detail:'}</span>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5">{latestFailedRun.resultPreview}</pre>
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isMyanmar ? 'မကြာသေးမီ လည်ပတ်မှုများ' : 'Recent Runs'}
                    </div>
                    {job.runs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{isMyanmar ? 'လည်ပတ်မှု မှတ်တမ်း မရှိသေးပါ။' : 'No runs recorded yet.'}</p>
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
