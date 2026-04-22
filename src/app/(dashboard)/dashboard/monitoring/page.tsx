'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
} from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/hooks/use-locale';
import { useToast } from '@/hooks/use-toast';
import { trpc } from '@/lib/trpc';
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils';

type MonitoringFormState = {
  backupVerificationAlertCooldownHours: string;
  telegramWebhookAlertCooldownMinutes: string;
  telegramWebhookPendingUpdateThreshold: string;
  adminQueueAlertCooldownHours: string;
  reviewQueueAlertHours: string;
};

function buildFormState(input: {
  backupVerificationAlertCooldownHours: number;
  telegramWebhookAlertCooldownMinutes: number;
  telegramWebhookPendingUpdateThreshold: number;
  adminQueueAlertCooldownHours: number;
  reviewQueueAlertHours: number;
}): MonitoringFormState {
  return {
    backupVerificationAlertCooldownHours: String(input.backupVerificationAlertCooldownHours),
    telegramWebhookAlertCooldownMinutes: String(input.telegramWebhookAlertCooldownMinutes),
    telegramWebhookPendingUpdateThreshold: String(input.telegramWebhookPendingUpdateThreshold),
    adminQueueAlertCooldownHours: String(input.adminQueueAlertCooldownHours),
    reviewQueueAlertHours: String(input.reviewQueueAlertHours),
  };
}

function parseWholeNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  if (!/^-?\d+$/.test(value.trim())) {
    return null;
  }

  return Number.parseInt(value.trim(), 10);
}

function formatMinutes(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  if (value < 60) {
    return `${value}m`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'healthy':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
    case 'error':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200';
    case 'not_configured':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200';
    default:
      return 'border-border/70 bg-background/70 text-muted-foreground';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'error':
      return 'Issue detected';
    case 'warning':
      return 'Attention needed';
    case 'not_configured':
      return 'Not configured';
    default:
      return status;
  }
}

export default function MonitoringPage() {
  const { t } = useLocale();
  const { toast } = useToast();

  const settingsQuery = trpc.system.getMonitoringSettings.useQuery();
  const overviewQuery = trpc.system.getMonitoringOverview.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const [form, setForm] = useState<MonitoringFormState>({
    backupVerificationAlertCooldownHours: '',
    telegramWebhookAlertCooldownMinutes: '',
    telegramWebhookPendingUpdateThreshold: '',
    adminQueueAlertCooldownHours: '',
    reviewQueueAlertHours: '',
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setForm(buildFormState(settingsQuery.data));
  }, [settingsQuery.data]);

  const parsedForm = useMemo(() => {
    const backupVerificationAlertCooldownHours = parseWholeNumber(form.backupVerificationAlertCooldownHours);
    const telegramWebhookAlertCooldownMinutes = parseWholeNumber(form.telegramWebhookAlertCooldownMinutes);
    const telegramWebhookPendingUpdateThreshold = parseWholeNumber(form.telegramWebhookPendingUpdateThreshold);
    const adminQueueAlertCooldownHours = parseWholeNumber(form.adminQueueAlertCooldownHours);
    const reviewQueueAlertHours = parseWholeNumber(form.reviewQueueAlertHours);

    if (
      backupVerificationAlertCooldownHours === null
      || telegramWebhookAlertCooldownMinutes === null
      || telegramWebhookPendingUpdateThreshold === null
      || adminQueueAlertCooldownHours === null
      || reviewQueueAlertHours === null
    ) {
      return null;
    }

    return {
      backupVerificationAlertCooldownHours,
      telegramWebhookAlertCooldownMinutes,
      telegramWebhookPendingUpdateThreshold,
      adminQueueAlertCooldownHours,
      reviewQueueAlertHours,
    };
  }, [form]);

  const settingsDirty = useMemo(() => {
    if (!settingsQuery.data || !parsedForm) {
      return false;
    }

    return (
      parsedForm.backupVerificationAlertCooldownHours !== settingsQuery.data.backupVerificationAlertCooldownHours
      || parsedForm.telegramWebhookAlertCooldownMinutes !== settingsQuery.data.telegramWebhookAlertCooldownMinutes
      || parsedForm.telegramWebhookPendingUpdateThreshold !== settingsQuery.data.telegramWebhookPendingUpdateThreshold
      || parsedForm.adminQueueAlertCooldownHours !== settingsQuery.data.adminQueueAlertCooldownHours
      || parsedForm.reviewQueueAlertHours !== settingsQuery.data.reviewQueueAlertHours
    );
  }, [parsedForm, settingsQuery.data]);

  const updateSettingsMutation = trpc.system.updateMonitoringSettings.useMutation({
    onSuccess: async () => {
      await Promise.all([settingsQuery.refetch(), overviewQuery.refetch()]);
      toast({
        title: 'Monitoring settings saved',
        description: 'The alert thresholds and cooldowns are now updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Monitoring settings failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runJobMutation = trpc.system.runSchedulerJob.useMutation({
    onSuccess: async () => {
      await overviewQuery.refetch();
      toast({
        title: 'Monitoring job finished',
        description: 'The monitoring state has been refreshed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Monitoring job failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (!parsedForm) {
      toast({
        title: 'Invalid thresholds',
        description: 'Use whole numbers for each monitoring threshold and cooldown.',
        variant: 'destructive',
      });
      return;
    }

    updateSettingsMutation.mutate(parsedForm);
  };

  const handleReset = () => {
    if (!settingsQuery.data) {
      return;
    }

    setForm(buildFormState(settingsQuery.data));
  };

  const overview = overviewQuery.data;
  const isRefreshing = overviewQuery.isFetching;

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-5">
            <BackButton href="/dashboard/tools" label={t('nav.tools')} />
            <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
              <Bell className="h-3.5 w-3.5" />
              {t('nav.monitoring')}
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {t('nav.monitoring')}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Watch live backup, webhook, and queue health from one place, then tune the thresholds that decide when operators get paged in Telegram.
              </p>
            </div>
          </div>

          <div className="ops-panel space-y-3">
            <div className="space-y-1">
              <p className="ops-section-heading">Operator Summary</p>
              <h2 className="text-xl font-semibold">Current monitor state</h2>
              <p className="text-sm text-muted-foreground">
                This page combines live health checks with the scheduler’s last-known run results.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-full border-border/70 bg-background/70"
              onClick={() => overviewQuery.refetch()}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh health
            </Button>
            <Button asChild variant="outline" className="h-11 w-full rounded-full border-border/70 bg-background/70">
              <Link href="/dashboard/jobs">
                Open scheduler jobs
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {overviewQuery.isLoading ? (
        <Card className="ops-panel">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading monitoring state…
          </CardContent>
        </Card>
      ) : null}

      {overviewQuery.error ? (
        <Card className="ops-panel border-rose-500/30">
          <CardContent className="flex items-start gap-3 p-6 text-sm text-rose-600 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">Monitoring overview failed to load</p>
              <p className="mt-1 text-rose-500/80">{overviewQuery.error.message}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="ops-panel">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="ops-section-heading">Backup Verification</p>
                    <CardTitle className="text-xl">Portable restore baseline</CardTitle>
                  </div>
                  <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(overview.backupVerification.status))}>
                    {getStatusLabel(overview.backupVerification.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Latest verify</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {overview.backupVerification.latestVerifiedAt
                        ? formatRelativeTime(overview.backupVerification.latestVerifiedAt)
                        : 'No records'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Failed records</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.backupVerification.failedCount}</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/65 p-4 text-xs text-muted-foreground">
                  <p>
                    Alert cooldown: <span className="font-medium text-foreground">{overview.settings.backupVerificationAlertCooldownHours}h</span>
                  </p>
                  <p>
                    Last alert: <span className="font-medium text-foreground">{overview.backupVerification.lastAlertAt ? formatRelativeTime(overview.backupVerification.lastAlertAt) : 'None sent yet'}</span>
                  </p>
                  <p>
                    Last scheduler run: <span className="font-medium text-foreground">{overview.backupVerification.job?.lastFinishedAt ? formatRelativeTime(overview.backupVerification.job.lastFinishedAt) : 'No run yet'}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  {overview.backupVerification.latestRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No backup verification records yet.</p>
                  ) : (
                    overview.backupVerification.latestRecords.map((record) => (
                      <div key={record.id} className="rounded-2xl border border-border/60 bg-background/70 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate font-medium">{record.filename}</p>
                          <Badge className={cn('rounded-full border text-[10px]', getStatusBadgeClass(record.status === 'FAILED' ? 'error' : 'healthy'))}>
                            {record.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {record.error?.trim() || 'pg_restore integrity check passed'}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runJobMutation.mutate({ jobKey: 'backup_verification' })}
                    disabled={runJobMutation.isPending}
                  >
                    {runJobMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Run verify now
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/dashboard/settings">Open backup workspace</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="ops-panel">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="ops-section-heading">Telegram Webhook</p>
                    <CardTitle className="text-xl">Delivery health</CardTitle>
                  </div>
                  <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(overview.telegramWebhook.status))}>
                    {getStatusLabel(overview.telegramWebhook.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Pending updates</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.telegramWebhook.pendingUpdateCount}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Admin chats</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.telegramWebhook.adminChatCount}</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/65 p-4 text-xs text-muted-foreground">
                  <p>
                    Backlog threshold: <span className="font-medium text-foreground">{overview.telegramWebhook.backlogThreshold}</span>
                  </p>
                  <p>
                    Alert cooldown: <span className="font-medium text-foreground">{overview.settings.telegramWebhookAlertCooldownMinutes}m</span>
                  </p>
                  <p>
                    Last alert: <span className="font-medium text-foreground">{overview.telegramWebhook.lastAlertAt ? formatRelativeTime(overview.telegramWebhook.lastAlertAt) : 'None sent yet'}</span>
                  </p>
                </div>

                {!overview.telegramWebhook.configured ? (
                  <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                    Telegram bot settings are not configured yet.
                  </div>
                ) : (
                  <div className="space-y-2 rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {overview.telegramWebhook.summary || 'Webhook and secret token look healthy.'}
                    </p>
                    <p className="break-all">
                      Expected: <span className="font-medium text-foreground">{overview.telegramWebhook.expectedWebhookUrl || 'Not configured'}</span>
                    </p>
                    <p className="break-all">
                      Current: <span className="font-medium text-foreground">{overview.telegramWebhook.currentWebhookUrl || 'Not set'}</span>
                    </p>
                    {overview.telegramWebhook.lastErrorMessage ? (
                      <p>
                        Last error: <span className="font-medium text-foreground">{overview.telegramWebhook.lastErrorMessage}</span>
                      </p>
                    ) : null}
                    {!overview.telegramWebhook.alertsConfigured ? (
                      <p className="text-amber-700 dark:text-amber-200">
                        Telegram admin chats are not configured, so alerts cannot be delivered yet.
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runJobMutation.mutate({ jobKey: 'telegram_webhook_health' })}
                    disabled={runJobMutation.isPending}
                  >
                    {runJobMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Run webhook check
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/dashboard/notifications">Open notifications</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="ops-panel">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="ops-section-heading">Admin Queue</p>
                    <CardTitle className="text-xl">Backlog aging</CardTitle>
                  </div>
                  <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(overview.adminQueue.status))}>
                    {getStatusLabel(overview.adminQueue.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Support overdue</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.adminQueue.supportOverdueCount}</p>
                    <p className="mt-1 text-xs">Oldest: {formatMinutes(overview.adminQueue.oldestSupportOverdueMinutes)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Review pending</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.adminQueue.pendingReviewCount}</p>
                    <p className="mt-1 text-xs">
                      Oldest: {formatMinutes(overview.adminQueue.oldestReviewAgeMinutes)} / threshold {overview.adminQueue.reviewThresholdHours}h
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/65 p-4 text-xs text-muted-foreground">
                  <p>
                    Alert cooldown: <span className="font-medium text-foreground">{overview.settings.adminQueueAlertCooldownHours}h</span>
                  </p>
                  <p>
                    Unclaimed reviews: <span className="font-medium text-foreground">{overview.adminQueue.unclaimedReviewCount}</span>
                  </p>
                  <p>
                    Last alert: <span className="font-medium text-foreground">{overview.adminQueue.lastAlertAt ? formatRelativeTime(overview.adminQueue.lastAlertAt) : 'None sent yet'}</span>
                  </p>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                  <p>
                    Support thread codes: <span className="font-medium text-foreground">{overview.adminQueue.supportThreadCodes.length > 0 ? overview.adminQueue.supportThreadCodes.join(', ') : 'No overdue threads'}</span>
                  </p>
                  <p>
                    Review order codes: <span className="font-medium text-foreground">{overview.adminQueue.reviewOrderCodes.length > 0 ? overview.adminQueue.reviewOrderCodes.join(', ') : 'No aged reviews'}</span>
                  </p>
                  <p>
                    Support aging follows each thread’s first-response due time. This page only tunes the review backlog threshold and alert cooldown.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runJobMutation.mutate({ jobKey: 'admin_queue_health' })}
                    disabled={runJobMutation.isPending}
                  >
                    {runJobMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Run queue check
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/dashboard/support">Open support queue</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="ops-panel">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="ops-section-heading">Threshold Tuning</p>
                  <CardTitle className="text-xl">Alert windows and cooldowns</CardTitle>
                </div>
                <Badge variant="outline" className="rounded-full text-xs">
                  {settingsDirty ? 'Unsaved changes' : 'Saved'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="backupVerificationAlertCooldownHours">Backup cooldown (hours)</Label>
                  <Input
                    id="backupVerificationAlertCooldownHours"
                    inputMode="numeric"
                    value={form.backupVerificationAlertCooldownHours}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      backupVerificationAlertCooldownHours: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telegramWebhookAlertCooldownMinutes">Webhook cooldown (minutes)</Label>
                  <Input
                    id="telegramWebhookAlertCooldownMinutes"
                    inputMode="numeric"
                    value={form.telegramWebhookAlertCooldownMinutes}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      telegramWebhookAlertCooldownMinutes: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telegramWebhookPendingUpdateThreshold">Webhook backlog threshold</Label>
                  <Input
                    id="telegramWebhookPendingUpdateThreshold"
                    inputMode="numeric"
                    value={form.telegramWebhookPendingUpdateThreshold}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      telegramWebhookPendingUpdateThreshold: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminQueueAlertCooldownHours">Queue cooldown (hours)</Label>
                  <Input
                    id="adminQueueAlertCooldownHours"
                    inputMode="numeric"
                    value={form.adminQueueAlertCooldownHours}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      adminQueueAlertCooldownHours: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reviewQueueAlertHours">Review age threshold (hours)</Label>
                  <Input
                    id="reviewQueueAlertHours"
                    inputMode="numeric"
                    value={form.reviewQueueAlertHours}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      reviewQueueAlertHours: event.target.value,
                    }))}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-4 w-4 text-cyan-600 dark:text-cyan-200" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">How these thresholds are applied</p>
                    <p>
                      Backup failures are deduped by file fingerprint. Webhook alerts are deduped by the live issue fingerprint. Queue alerts are deduped by the current backlog fingerprint, so one unchanged stale queue does not spam admins every cycle.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={updateSettingsMutation.isPending || !settingsDirty || !parsedForm}
                >
                  {updateSettingsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save monitoring settings
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={updateSettingsMutation.isPending || !settingsDirty}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            {[overview.backupVerification.job, overview.telegramWebhook.job, overview.adminQueue.job].map((job, index) => (
              <Card key={job?.key || `monitoring-job-${index}`} className="ops-panel">
                <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Scheduler</p>
                      <p className="mt-1 font-semibold text-foreground">{job?.name || 'No scheduler state yet'}</p>
                    </div>
                    {job ? (
                      <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(job.lastStatus === 'SUCCESS' ? 'healthy' : job.lastStatus === 'FAILED' ? 'error' : job.lastStatus === 'SKIPPED' ? 'warning' : 'not_configured'))}>
                        {job.lastStatus}
                      </Badge>
                    ) : null}
                  </div>
                  <p>Cadence: {job?.cadenceLabel || '—'}</p>
                  <p>Last finished: {job?.lastFinishedAt ? formatDateTime(job.lastFinishedAt) : '—'}</p>
                  <p>Next run: {job?.nextRunAt ? formatRelativeTime(job.nextRunAt) : '—'}</p>
                  <p>{job?.lastSummary || 'No summary recorded yet.'}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
