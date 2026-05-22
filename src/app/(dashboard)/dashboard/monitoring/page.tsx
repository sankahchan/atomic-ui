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

function getStatusLabel(status: string, isMyanmar: boolean) {
  switch (status) {
    case 'healthy':
      return isMyanmar ? 'ကောင်းမွန်' : 'Healthy';
    case 'error':
      return isMyanmar ? 'ပြဿနာ တွေ့ရှိသည်' : 'Issue detected';
    case 'warning':
      return isMyanmar ? 'ဂရုပြုရန် လိုအပ်' : 'Attention needed';
    case 'not_configured':
      return isMyanmar ? 'မပြင်ဆင်ရသေးပါ' : 'Not configured';
    default:
      return status;
  }
}

export default function MonitoringPage() {
  const { locale, t } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';

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
        title: isMyanmar ? 'စောင့်ကြည့်မှု သတ်မှတ်ချက်များကို သိမ်းပြီးပါပြီ' : 'Monitoring settings saved',
        description: isMyanmar
          ? 'သတိပေးချက် သတ်မှတ်ကန့်သတ်ချက်များနှင့် cooldown ကာလများကို ပြင်ဆင်ပြီးပါပြီ။'
          : 'The alert thresholds and cooldowns are now updated.',
      });
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'စောင့်ကြည့်မှု သတ်မှတ်ချက်များကို မသိမ်းနိုင်ပါ' : 'Monitoring settings failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runJobMutation = trpc.system.runSchedulerJob.useMutation({
    onSuccess: async () => {
      await overviewQuery.refetch();
      toast({
        title: isMyanmar ? 'စောင့်ကြည့်မှု လုပ်ငန်းပြီးပါပြီ' : 'Monitoring job finished',
        description: isMyanmar ? 'စောင့်ကြည့်မှု အခြေအနေကို ပြန်လည်သစ်စေပြီးပါပြီ။' : 'The monitoring state has been refreshed.',
      });
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'စောင့်ကြည့်မှု လုပ်ငန်း မအောင်မြင်ပါ' : 'Monitoring job failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (!parsedForm) {
      toast({
        title: isMyanmar ? 'သတ်မှတ်ကန့်သတ်ချက် မမှန်ပါ' : 'Invalid thresholds',
        description: isMyanmar
          ? 'စောင့်ကြည့်မှု သတ်မှတ်ကန့်သတ်ချက်နှင့် cooldown တစ်ခုချင်းစီအတွက် ကိန်းပြည့်ကိုသာ ထည့်ပါ။'
          : 'Use whole numbers for each monitoring threshold and cooldown.',
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
                {isMyanmar
                  ? 'အရန်သိမ်းမှု၊ webhook နှင့် queue အခြေအနေများကို တစ်နေရာတည်းတွင် တိုက်ရိုက်ကြည့်ရှုပါ၊ ထို့နောက် Telegram ထဲတွင် လုပ်ဆောင်သူများထံ သတိပေးပို့မည့် သတ်မှတ်ကန့်သတ်ချက်များကို ညှိနှိုင်းပါ။'
                  : 'Watch live backup, webhook, and queue health from one place, then tune the thresholds that decide when operators get paged in Telegram.'}
              </p>
            </div>
          </div>

          <div className="ops-panel space-y-3">
            <div className="space-y-1">
              <p className="ops-section-heading">{isMyanmar ? 'လုပ်ဆောင်သူ အကျဉ်းချုပ်' : 'Operator Summary'}</p>
              <h2 className="text-xl font-semibold">{isMyanmar ? 'လက်ရှိ စောင့်ကြည့်မှု အခြေအနေ' : 'Current monitor state'}</h2>
              <p className="text-sm text-muted-foreground">
                {isMyanmar
                  ? 'ဤစာမျက်နှာသည် တိုက်ရိုက် ကျန်းမာရေး စစ်ဆေးချက်များနှင့် အချိန်ဇယား စနစ်၏ နောက်ဆုံး လည်ပတ်မှုရလဒ်များကို ပေါင်းစည်းပြသပါသည်။'
                  : 'This page combines live health checks with the scheduler’s last-known run results.'}
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
              {isMyanmar ? 'ကျန်းမာရေး အခြေအနေကို ပြန်သစ်မည်' : 'Refresh health'}
            </Button>
            <Button asChild variant="outline" className="h-11 w-full rounded-full border-border/70 bg-background/70">
              <Link href="/dashboard/jobs">
                {isMyanmar ? 'အချိန်ဇယား လုပ်ငန်းများကို ဖွင့်မည်' : 'Open scheduler jobs'}
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
            {isMyanmar ? 'စောင့်ကြည့်မှု အခြေအနေကို ရယူနေသည်…' : 'Loading monitoring state…'}
          </CardContent>
        </Card>
      ) : null}

      {overviewQuery.error ? (
        <Card className="ops-panel border-rose-500/30">
          <CardContent className="flex items-start gap-3 p-6 text-sm text-rose-600 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">{isMyanmar ? 'စောင့်ကြည့်မှု အကျဉ်းချုပ်ကို မရယူနိုင်ပါ' : 'Monitoring overview failed to load'}</p>
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
                    <p className="ops-section-heading">{isMyanmar ? 'အရန်သိမ်း အတည်ပြုမှု' : 'Backup Verification'}</p>
                    <CardTitle className="text-xl">{isMyanmar ? 'ပြန်လည်ထည့်သွင်းစမ်းသပ်မှု အခြေခံစစ်ဆေးချက်' : 'Portable restore baseline'}</CardTitle>
                  </div>
                  <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(overview.backupVerification.status))}>
                    {getStatusLabel(overview.backupVerification.status, isMyanmar)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{isMyanmar ? 'နောက်ဆုံး အတည်ပြုချက်' : 'Latest verify'}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {overview.backupVerification.latestVerifiedAt
                        ? formatRelativeTime(overview.backupVerification.latestVerifiedAt)
                        : (isMyanmar ? 'မှတ်တမ်း မရှိသေးပါ' : 'No records')}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{isMyanmar ? 'မအောင်မြင်သော မှတ်တမ်းများ' : 'Failed records'}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.backupVerification.failedCount}</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/65 p-4 text-xs text-muted-foreground">
                  <p>
                    {isMyanmar ? 'သတိပေး အနားကာလ:' : 'Alert cooldown:'} <span className="font-medium text-foreground">{overview.settings.backupVerificationAlertCooldownHours}h</span>
                  </p>
                  <p>
                    {isMyanmar ? 'နောက်ဆုံး သတိပေးချက်:' : 'Last alert:'} <span className="font-medium text-foreground">{overview.backupVerification.lastAlertAt ? formatRelativeTime(overview.backupVerification.lastAlertAt) : (isMyanmar ? 'မပို့ရသေးပါ' : 'None sent yet')}</span>
                  </p>
                  <p>
                    {isMyanmar ? 'နောက်ဆုံး အချိန်ဇယား လည်ပတ်မှု:' : 'Last scheduler run:'} <span className="font-medium text-foreground">{overview.backupVerification.job?.lastFinishedAt ? formatRelativeTime(overview.backupVerification.job.lastFinishedAt) : (isMyanmar ? 'မလည်ပတ်ရသေးပါ' : 'No run yet')}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  {overview.backupVerification.latestRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{isMyanmar ? 'အရန်သိမ်း အတည်ပြု မှတ်တမ်း မရှိသေးပါ။' : 'No backup verification records yet.'}</p>
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
                      {record.error?.trim() || (isMyanmar ? 'pg_restore အကြမ်းဖျဉ်း စစ်ဆေးချက် အောင်မြင်ပါသည်' : 'pg_restore integrity check passed')}
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
                    {isMyanmar ? 'အတည်ပြု စစ်ဆေးချက်ကို ယခု လည်ပတ်မည်' : 'Run verify now'}
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/dashboard/settings">{isMyanmar ? 'အရန်သိမ်း စာမျက်နှာကို ဖွင့်မည်' : 'Open backup workspace'}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="ops-panel">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="ops-section-heading">{isMyanmar ? 'တယ်လီဂရမ် ဝက်ဘ်ဟွတ်' : 'Telegram Webhook'}</p>
                    <CardTitle className="text-xl">{isMyanmar ? 'ပေးပို့မှု ကျန်းမာရေး အခြေအနေ' : 'Delivery health'}</CardTitle>
                  </div>
                  <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(overview.telegramWebhook.status))}>
                    {getStatusLabel(overview.telegramWebhook.status, isMyanmar)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{isMyanmar ? 'စောင့်ဆိုင်းနေသော အပ်ဒိတ်များ' : 'Pending updates'}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.telegramWebhook.pendingUpdateCount}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{isMyanmar ? 'စီမံခန့်ခွဲရေး ချတ်များ' : 'Admin chats'}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.telegramWebhook.adminChatCount}</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/65 p-4 text-xs text-muted-foreground">
                  <p>
                    {isMyanmar ? 'စုပုံမှု ကန့်သတ်ချက်:' : 'Backlog threshold:'} <span className="font-medium text-foreground">{overview.telegramWebhook.backlogThreshold}</span>
                  </p>
                  <p>
                    {isMyanmar ? 'သတိပေး အနားကာလ:' : 'Alert cooldown:'} <span className="font-medium text-foreground">{overview.settings.telegramWebhookAlertCooldownMinutes}m</span>
                  </p>
                  <p>
                    {isMyanmar ? 'နောက်ဆုံး သတိပေးချက်:' : 'Last alert:'} <span className="font-medium text-foreground">{overview.telegramWebhook.lastAlertAt ? formatRelativeTime(overview.telegramWebhook.lastAlertAt) : (isMyanmar ? 'မပို့ရသေးပါ' : 'None sent yet')}</span>
                  </p>
                </div>

                {!overview.telegramWebhook.configured ? (
                  <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                    {isMyanmar ? 'တယ်လီဂရမ် ဘော့တ် ဆက်တင်များ မပြင်ဆင်ရသေးပါ။' : 'Telegram bot settings are not configured yet.'}
                  </div>
                ) : (
                  <div className="space-y-2 rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {overview.telegramWebhook.summary || (isMyanmar ? 'ဝဘ်ဟွတ်နှင့် လျှို့ဝှက်တိုကင် အခြေအနေ ကောင်းမွန်ပါသည်။' : 'Webhook and secret token look healthy.')}
                    </p>
                    <p className="break-all">
                      {isMyanmar ? 'မျှော်လင့်ထားသော URL:' : 'Expected:'} <span className="font-medium text-foreground">{overview.telegramWebhook.expectedWebhookUrl || (isMyanmar ? 'မပြင်ဆင်ရသေးပါ' : 'Not configured')}</span>
                    </p>
                    <p className="break-all">
                      {isMyanmar ? 'လက်ရှိ URL:' : 'Current:'} <span className="font-medium text-foreground">{overview.telegramWebhook.currentWebhookUrl || (isMyanmar ? 'မသတ်မှတ်ရသေးပါ' : 'Not set')}</span>
                    </p>
                    {overview.telegramWebhook.lastErrorMessage ? (
                      <p>
                        {isMyanmar ? 'နောက်ဆုံး အမှား:' : 'Last error:'} <span className="font-medium text-foreground">{overview.telegramWebhook.lastErrorMessage}</span>
                      </p>
                    ) : null}
                    {!overview.telegramWebhook.alertsConfigured ? (
                      <p className="text-amber-700 dark:text-amber-200">
                        {isMyanmar ? 'တယ်လီဂရမ် စီမံခန့်ခွဲရေး ချတ်များ မပြင်ဆင်ရသေးသောကြောင့် သတိပေးချက်များကို မပို့နိုင်သေးပါ။' : 'Telegram admin chats are not configured, so alerts cannot be delivered yet.'}
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
                    {isMyanmar ? 'ဝက်ဘ်ဟွတ် စစ်ဆေးမှုကို လည်ပတ်မည်' : 'Run webhook check'}
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/dashboard/notifications">{isMyanmar ? 'အသိပေးချက်များကို ဖွင့်မည်' : 'Open notifications'}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="ops-panel">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="ops-section-heading">{isMyanmar ? 'စီမံခန့်ခွဲရေး စောင့်ဆိုင်းစာရင်း' : 'Admin Queue'}</p>
                    <CardTitle className="text-xl">{isMyanmar ? 'နောက်ကျကျန်ရှိမှု အိုမင်းမှု' : 'Backlog aging'}</CardTitle>
                  </div>
                  <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(overview.adminQueue.status))}>
                    {getStatusLabel(overview.adminQueue.status, isMyanmar)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{isMyanmar ? 'နောက်ကျနေသော အကူအညီ' : 'Support overdue'}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.adminQueue.supportOverdueCount}</p>
                    <p className="mt-1 text-xs">{isMyanmar ? 'အကြာဆုံး:' : 'Oldest:'} {formatMinutes(overview.adminQueue.oldestSupportOverdueMinutes)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{isMyanmar ? 'စောင့်ဆိုင်းနေသော စစ်ဆေးမှု' : 'Review pending'}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{overview.adminQueue.pendingReviewCount}</p>
                    <p className="mt-1 text-xs">
                      {isMyanmar ? 'အကြာဆုံး:' : 'Oldest:'} {formatMinutes(overview.adminQueue.oldestReviewAgeMinutes)} / {isMyanmar ? 'သတ်မှတ်ကန့်သတ်ချက်' : 'threshold'} {overview.adminQueue.reviewThresholdHours}h
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/65 p-4 text-xs text-muted-foreground">
                  <p>
                    {isMyanmar ? 'သတိပေး အနားကာလ:' : 'Alert cooldown:'} <span className="font-medium text-foreground">{overview.settings.adminQueueAlertCooldownHours}h</span>
                  </p>
                  <p>
                    {isMyanmar ? 'မယူထားသေးသော စစ်ဆေးမှုများ:' : 'Unclaimed reviews:'} <span className="font-medium text-foreground">{overview.adminQueue.unclaimedReviewCount}</span>
                  </p>
                  <p>
                    {isMyanmar ? 'နောက်ဆုံး သတိပေးချက်:' : 'Last alert:'} <span className="font-medium text-foreground">{overview.adminQueue.lastAlertAt ? formatRelativeTime(overview.adminQueue.lastAlertAt) : (isMyanmar ? 'မပို့ရသေးပါ' : 'None sent yet')}</span>
                  </p>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                  <p>
                    {isMyanmar ? 'အကူအညီ စကားဝိုင်းကုဒ်များ:' : 'Support thread codes:'} <span className="font-medium text-foreground">{overview.adminQueue.supportThreadCodes.length > 0 ? overview.adminQueue.supportThreadCodes.join(', ') : (isMyanmar ? 'နောက်ကျနေသော စကားဝိုင်း မရှိပါ' : 'No overdue threads')}</span>
                  </p>
                  <p>
                    {isMyanmar ? 'စစ်ဆေးရန် အော်ဒါကုဒ်များ:' : 'Review order codes:'} <span className="font-medium text-foreground">{overview.adminQueue.reviewOrderCodes.length > 0 ? overview.adminQueue.reviewOrderCodes.join(', ') : (isMyanmar ? 'နောက်ကျနေသော စစ်ဆေးမှု မရှိပါ' : 'No aged reviews')}</span>
                  </p>
                  <p>
                    {isMyanmar
                        ? 'အကူအညီ စောင့်ဆိုင်းချိန်သည် စကားဝိုင်းတစ်ခုချင်းစီ၏ ပထမတုံ့ပြန်ချိန်အတိုင်း လိုက်နာပါသည်။ ဤစာမျက်နှာတွင် စစ်ဆေးမှု စုပုံမှု ကန့်သတ်ချက်နှင့် သတိပေး အနားကာလကိုသာ ညှိနှိုင်းပေးပါသည်။'
                        : 'Support aging follows each thread’s first-response due time. This page only tunes the review backlog threshold and alert cooldown.'}
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
                    {isMyanmar ? 'စောင့်ဆိုင်းစာရင်း စစ်ဆေးမှုကို လည်ပတ်မည်' : 'Run queue check'}
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/dashboard/support">{isMyanmar ? 'အကူအညီ အလုပ်စောင့်စာရင်းကို ဖွင့်မည်' : 'Open support queue'}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="ops-panel">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="ops-section-heading">{isMyanmar ? 'ကန့်သတ်ချက် ချိန်ညှိမှု' : 'Threshold Tuning'}</p>
                  <CardTitle className="text-xl">{isMyanmar ? 'သတိပေးချက် အချိန်ကာလများနှင့် အအေးချိန်များ' : 'Alert windows and cooldowns'}</CardTitle>
                </div>
                <Badge variant="outline" className="rounded-full text-xs">
                  {settingsDirty ? (isMyanmar ? 'မသိမ်းရသေးသော ပြောင်းလဲမှုများ' : 'Unsaved changes') : isMyanmar ? 'သိမ်းပြီး' : 'Saved'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="backupVerificationAlertCooldownHours">{isMyanmar ? 'အရန်သိမ်း အနားကာလ (နာရီ)' : 'Backup cooldown (hours)'}</Label>
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
                  <Label htmlFor="telegramWebhookAlertCooldownMinutes">{isMyanmar ? 'ဝက်ဘ်ဟွတ် အနားကာလ (မိနစ်)' : 'Webhook cooldown (minutes)'}</Label>
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
                  <Label htmlFor="telegramWebhookPendingUpdateThreshold">{isMyanmar ? 'ဝက်ဘ်ဟွတ် စုပုံမှု ကန့်သတ်ချက်' : 'Webhook backlog threshold'}</Label>
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
                  <Label htmlFor="adminQueueAlertCooldownHours">{isMyanmar ? 'စောင့်ဆိုင်းစာရင်း အနားကာလ (နာရီ)' : 'Queue cooldown (hours)'}</Label>
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
                  <Label htmlFor="reviewQueueAlertHours">{isMyanmar ? 'စစ်ဆေးမှု သက်တမ်း ကန့်သတ်ချက် (နာရီ)' : 'Review age threshold (hours)'}</Label>
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
                    <p className="font-medium text-foreground">{isMyanmar ? 'ဤသတ်မှတ်ချက်များ လုပ်ဆောင်ပုံ' : 'How these thresholds are applied'}</p>
                    <p>
                      {isMyanmar
                        ? 'အရန်သိမ်း မအောင်မြင်မှုများကို ဖိုင်လက်ဗွေအလိုက် တစ်ကြိမ်တည်းသာ သိမ်းဆည်းပါသည်။ ဝက်ဘ်ဟွတ် သတိပေးချက်များကို လက်ရှိပြဿနာ လက်ဗွေအလိုက် ပေါင်းစည်းထားပြီး စောင့်ဆိုင်းစာရင်း သတိပေးချက်များကို လက်ရှိ စုပုံမှု လက်ဗွေအလိုက် ပေါင်းစည်းထားသဖြင့် မပြောင်းလဲသော စောင့်ဆိုင်းစာရင်းတစ်ခုက လည်ပတ်တိုင်း စီမံခန့်ခွဲသူများကို ထပ်ခါထပ်ခါ မပို့ပါ။'
                        : 'Backup failures are deduped by file fingerprint. Webhook alerts are deduped by the live issue fingerprint. Queue alerts are deduped by the current backlog fingerprint, so one unchanged stale queue does not spam admins every cycle.'}
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
                  {isMyanmar ? 'စောင့်ကြည့်မှု ဆက်တင်များကို သိမ်းမည်' : 'Save monitoring settings'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={updateSettingsMutation.isPending || !settingsDirty}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {isMyanmar ? 'ပြောင်းလဲမှုများကို မူလအတိုင်း ပြန်ထားမည်' : 'Reset changes'}
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
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{isMyanmar ? 'အချိန်ဇယား လည်ပတ်မှု' : 'Scheduler'}</p>
                      <p className="mt-1 font-semibold text-foreground">{job?.name || (isMyanmar ? 'အချိန်ဇယား အခြေအနေ မရှိသေးပါ' : 'No scheduler state yet')}</p>
                    </div>
                    {job ? (
                      <Badge className={cn('rounded-full border text-xs', getStatusBadgeClass(job.lastStatus === 'SUCCESS' ? 'healthy' : job.lastStatus === 'FAILED' ? 'error' : job.lastStatus === 'SKIPPED' ? 'warning' : 'not_configured'))}>
                        {job.lastStatus === 'SUCCESS'
                          ? (isMyanmar ? 'အောင်မြင်' : 'SUCCESS')
                          : job.lastStatus === 'FAILED'
                            ? (isMyanmar ? 'မအောင်မြင်' : 'FAILED')
                            : job.lastStatus === 'SKIPPED'
                              ? (isMyanmar ? 'ကျော်ထား' : 'SKIPPED')
                              : job.lastStatus}
                      </Badge>
                    ) : null}
                  </div>
                  <p>{isMyanmar ? 'ကြိမ်နှုန်း' : 'Cadence'}: {job?.cadenceLabel || '—'}</p>
                  <p>{isMyanmar ? 'နောက်ဆုံး ပြီးဆုံးချိန်' : 'Last finished'}: {job?.lastFinishedAt ? formatDateTime(job.lastFinishedAt) : '—'}</p>
                  <p>{isMyanmar ? 'နောက်ထပ် လည်ပတ်ချိန်' : 'Next run'}: {job?.nextRunAt ? formatRelativeTime(job.nextRunAt) : '—'}</p>
                  <p>{job?.lastSummary || (isMyanmar ? 'အနှစ်ချုပ် မှတ်တမ်း မရှိသေးပါ။' : 'No summary recorded yet.')}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
