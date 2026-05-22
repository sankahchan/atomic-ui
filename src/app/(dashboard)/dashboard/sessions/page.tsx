'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import {
  Clock3,
  Loader2,
  Power,
  Search,
  ShieldAlert,
  Smartphone,
  Wifi,
  WifiOff,
  ShieldCheck,
  Users,
} from 'lucide-react';

type SessionStatusFilter = 'ALL' | 'ACTIVE' | 'STALE' | 'ENDED';

function getSessionStatus(session: {
  isActive: boolean;
  stale: boolean;
  endedReason: string | null;
}, isMyanmar: boolean) {
  if (session.isActive && session.stale) {
    return {
      label: isMyanmar ? 'ဟောင်းနေ' : 'Stale',
      className: 'border-amber-500/40 text-amber-500',
    };
  }

  if (session.isActive) {
    return {
      label: isMyanmar ? 'အသက်ဝင်' : 'Active',
      className: 'border-emerald-500/40 text-emerald-500',
    };
  }

  return {
    label: session.endedReason === 'ADMIN_TERMINATED'
      ? (isMyanmar ? 'ပိတ်သိမ်းခဲ့သည်' : 'Terminated')
      : (isMyanmar ? 'ပြီးဆုံး' : 'Ended'),
    className: 'border-muted-foreground/30 text-muted-foreground',
  };
}

function formatDuration(minutes: number, isMyanmar: boolean) {
  if (minutes < 60) {
    return isMyanmar ? `${minutes} မိနစ်` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return isMyanmar ? `${hours} နာရီ ${remainingMinutes} မိနစ်` : `${hours}h ${remainingMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  return isMyanmar ? `${days} ရက် ${hours % 24} နာရီ` : `${days}d ${hours % 24}h`;
}

function getEndedReasonLabel(reason: string | null, isMyanmar: boolean) {
  if (!reason) {
    return '-';
  }

  const labels: Record<string, { en: string; my: string }> = {
    ADMIN_TERMINATED: { en: 'Admin terminated', my: 'အက်မင်မှ ပိတ်သိမ်းခဲ့သည်' },
    ADMIN_STALE_CLEANUP: { en: 'Stale cleanup', my: 'ဟောင်းနေသည့် ချိတ်ဆက်မှုကို ရှင်းလင်းခဲ့သည်' },
    INACTIVITY_TIMEOUT: { en: 'Inactivity timeout', my: 'မလှုပ်ရှားသည့် အချိန်ကန့်သတ်ချက် ကျော်လွန်သည်' },
    SERVER_REPLACED: { en: 'Server replaced', my: 'ဆာဗာ ပြောင်းလဲထားသည်' },
    KEY_DISABLED: { en: 'Key disabled', my: 'သော့ကို ပိတ်ထားသည်' },
    KEY_DEPLETED: { en: 'Quota exhausted', my: 'ဒေတာကန့်သတ်ချက် ပြည့်သွားသည်' },
    KEY_EXPIRED: { en: 'Key expired', my: 'သော့ သက်တမ်းကုန်သွားသည်' },
    KEY_ARCHIVED: { en: 'Key archived', my: 'သော့ကို သိမ်းဆည်းထားသည်' },
    KEY_ROTATED: { en: 'Key rotated', my: 'သော့ကို အသစ်ပြောင်းထားသည်' },
  };

  const label = labels[reason];
  return label ? (isMyanmar ? label.my : label.en) : reason;
}

export default function SessionsPage() {
  const { locale, t } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SessionStatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    setPage(1);
  }, [status, deferredSearch]);

  const { data: summary, isLoading: summaryLoading } = trpc.sessions.summary.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const { data, isLoading, isFetching } = trpc.sessions.list.useQuery(
    {
      page,
      pageSize: 20,
      status,
      search: deferredSearch || undefined,
    },
    {
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );

  const terminateMutation = trpc.sessions.terminate.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'ချိတ်ဆက်မှုကို ပိတ်ပြီးပါပြီ' : 'Session closed',
        description: isMyanmar ? 'ချိတ်ဆက်ထားသော အစည်းအဝေးကို ပိတ်သိမ်းလိုက်ပါပြီ။' : 'The connection session has been terminated.',
      });
      await Promise.all([
        utils.sessions.summary.invalidate(),
        utils.sessions.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ချိတ်ဆက်မှုကို မပိတ်နိုင်ပါ' : 'Failed to close session',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const terminateStaleMutation = trpc.sessions.terminateStale.useMutation({
    onSuccess: async (result) => {
      toast({
        title: isMyanmar ? 'အဟောင်းချိတ်ဆက်မှုများကို ရှင်းလင်းပြီးပါပြီ' : 'Stale sessions cleaned up',
        description: result.closedCount > 0
          ? isMyanmar
            ? `${result.closedCount} stale session ကို ပိတ်ခဲ့ပါသည်။`
            : `Closed ${result.closedCount} stale sessions.`
          : isMyanmar
            ? 'Stale session မတွေ့ပါ။'
            : 'No stale sessions were found.',
      });
      await Promise.all([
        utils.sessions.summary.invalidate(),
        utils.sessions.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'အဟောင်းချိတ်ဆက်မှုများကို မရှင်းလင်းနိုင်ပါ' : 'Failed to clean up stale sessions',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sessions = data?.items ?? [];

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <Smartphone className="mr-2 h-3.5 w-3.5" />
              {isMyanmar ? 'စက်ချိတ်ဆက်မှုများ' : 'Device Sessions'}
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {isMyanmar ? 'ချိတ်ဆက်မှု အစည်းအဝေးများ' : 'Connection sessions'}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {isMyanmar
                  ? 'အသက်ဝင်နေသော စက်ချိတ်ဆက်မှု အစည်းအဝေးများကို စစ်ဆေးပါ၊ ဟောင်းနေသော ချိတ်ဆက်မှုများကို ခွဲခြားသတ်မှတ်ပါ၊ အမှန်တကယ် အသုံးပြုမှု မဟုတ်တော့သည့်အခါ ပိတ်ပါ။'
                  : 'Review active device sessions, identify stale connections, and terminate them when they no longer reflect real client activity.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အသက်ဝင် ချိတ်ဆက်မှုများ' : 'Active sessions'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{summaryLoading ? '…' : summary?.activeCount ?? 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isMyanmar ? `နောက်ဆုံး ${summary?.staleThresholdMinutes ?? 5} မိနစ်အတွင်း အသက်ဝင်သည်။` : `Active within the last ${summary?.staleThresholdMinutes ?? 5} minutes.`}
                </p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဟောင်းနေသော ချိတ်ဆက်မှုများ' : 'Stale sessions'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{summaryLoading ? '…' : summary?.staleCount ?? 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'အသက်ဝင်ဟု သတ်မှတ်ထားသော်လည်း သတ်မှတ်ချိန်ကို ကျော်လွန်နေသည်။' : 'Marked active, but older than the timeout.'}</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အသက်ဝင် သော့များ' : 'Active keys'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{summaryLoading ? '…' : summary?.activeKeys ?? 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'အသက်ဝင် ချိတ်ဆက်မှု အနည်းဆုံးတစ်ခု ရှိသော သော့များ။' : 'Keys with at least one live connection session.'}</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အသက်ဝင် ပိုင်ရှင်များ' : 'Active owners'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{summaryLoading ? '…' : summary?.activeUsers ?? 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isMyanmar ? 'အသက်ဝင် အစည်းအဝေးများနောက်ကွယ်ရှိ သီးခြား အသုံးပြုသူများ။' : 'Distinct users behind active sessions.'}
                </p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အသက်ဝင် လမ်းကြောင်းအသုံးပြုမှု' : 'Active traffic'}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {summaryLoading ? '…' : formatBytes(BigInt(summary?.totalActiveBytes ?? '0'))}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isMyanmar ? 'လက်ရှိ အစည်းအဝေးများမှ စုဆောင်းထားသော byte ပမာဏ။' : 'Bytes accumulated by current sessions.'}
                </p>
              </div>
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'ချိတ်ဆက်မှု ထိန်းချုပ်မှုများ' : 'Session controls'}</p>
                <h2 className="text-xl font-semibold">{t('dashboard.command_rail')}</h2>
                <p className="text-sm text-muted-foreground">
                  {isMyanmar
                    ? 'ဟောင်းနေသော စက်ချိတ်ဆက်မှုများကို ရှင်းပါ၊ အသက်ဝင်နေသော သော့စာရင်းကို စစ်ဆေးပါ၊ သို့မဟုတ် ချိတ်ဆက်မှု စီးဆင်းမှုကို ကြည့်နေစဉ် ဆာဗာအခြေအနေကို ဝင်ကြည့်ပါ။'
                    : 'Clear stale devices, inspect active key inventory, or drill into server state while you review the session stream.'}
                </p>
              </div>

              <Button
                className="h-11 w-full rounded-full"
                onClick={() => terminateStaleMutation.mutate()}
                disabled={terminateStaleMutation.isPending}
              >
                {terminateStaleMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldAlert className="mr-2 h-4 w-4" />
                )}
                {isMyanmar ? 'အဟောင်းချိတ်ဆက်မှုများကို ပိတ်မည်' : 'Close stale sessions'}
              </Button>

              <div className="space-y-2">
                <Link href="/dashboard/keys" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Wifi className="h-4 w-4 text-primary" />
                    {isMyanmar ? 'အသုံးပြုခွင့်သော့များကို ဖွင့်မည်' : 'Open access keys'}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.open')}</span>
                </Link>
                <Link href="/dashboard/servers" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-primary" />
                    {isMyanmar ? 'ဆာဗာများကို စစ်ဆေးမည်' : 'Review servers'}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.open')}</span>
                </Link>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'လက်ရှိအခြေအနေ' : 'Live status'}</p>
                <h2 className="text-xl font-semibold">{isMyanmar ? 'ချိတ်ဆက်မှု အခြေအနေ' : 'Session pulse'}</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အချိန်ကန့်သတ်ချက်' : 'Timeout'}</p>
                  <p className="text-2xl font-semibold tracking-tight">{summary?.staleThresholdMinutes ?? 5}m</p>
                  <p className="text-sm text-muted-foreground">
                    {isMyanmar ? 'အစည်းအဝေးကို ဟောင်းနေသည်ဟု သတ်မှတ်မီ အသုံးပြုသည့် ကန့်သတ်ချိန်။' : 'Threshold before a session is marked stale.'}
                  </p>
                </div>
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'လက်ရှိ စာမျက်နှာ' : 'Current page'}</p>
                  <p className="text-2xl font-semibold tracking-tight">{data?.page ?? 1}/{data?.totalPages ?? 1}</p>
                  <p className="text-sm text-muted-foreground">{isMyanmar ? `လက်ရှိ စစ်ထုတ်မှု အစုအဖွဲ့အတွင်း ချိတ်ဆက်မှု ${data?.total ?? 0} ခုရှိသည်။` : `${data?.total ?? 0} sessions across the current filter set.`}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card className="ops-panel">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Smartphone className="w-5 h-5 text-primary" />
                {isMyanmar ? 'စက်ချိတ်ဆက်မှုများ' : 'Device sessions'}
              </CardTitle>
              <CardDescription>
                {isMyanmar ? 'အခြေအနေအလိုက် စစ်ထုတ်ပါ သို့မဟုတ် သော့၊ ပိုင်ရှင်၊ ဆာဗာအမည်ဖြင့် ရှာဖွေပါ။' : 'Filter by status or search by key, owner, or server name.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="ops-filter-bar grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <Label htmlFor="session-search">{isMyanmar ? 'ရှာဖွေမည်' : 'Search'}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="session-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isMyanmar ? 'သော့၊ ပိုင်ရှင် သို့မဟုတ် ဆာဗာကို ရှာပါ' : 'Search key, owner, or server'}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isMyanmar ? 'အခြေအနေ' : 'Status'}</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as SessionStatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{isMyanmar ? 'ချိတ်ဆက်မှု အားလုံး' : 'All sessions'}</SelectItem>
                  <SelectItem value="ACTIVE">{isMyanmar ? 'အသက်ဝင်' : 'Active'}</SelectItem>
                  <SelectItem value="STALE">{isMyanmar ? 'ဟောင်းနေ' : 'Stale'}</SelectItem>
                  <SelectItem value="ENDED">{isMyanmar ? 'ပြီးဆုံး' : 'Ended'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="ops-table-toolbar">
            <div className="flex flex-wrap items-center gap-2">
              <div className="ops-table-meta">{data?.total ?? 0} {isMyanmar ? 'ချိတ်ဆက်မှု' : 'sessions'}</div>
              <div className="ops-table-meta">{isMyanmar ? 'စာမျက်နှာ' : 'Page'} {data?.page ?? 1} / {data?.totalPages ?? 1}</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{isFetching ? (isMyanmar ? 'ပြန်လည်ရယူနေသည်…' : 'Refreshing…') : (isMyanmar ? 'တိုက်ရိုက် ချိတ်ဆက်မှု စီးဆင်းမှု' : 'Live session stream')}</span>
            </div>
          </div>

          <div className="space-y-3 lg:hidden">
            {isLoading ? (
              <div className="ops-chart-empty py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="ops-chart-empty border-dashed p-8 text-center text-sm text-muted-foreground">
                {isMyanmar ? 'လက်ရှိ စစ်ထုတ်မှုများနှင့် ကိုက်ညီသော ချိတ်ဆက်မှု မရှိပါ။' : 'No sessions match the current filters.'}
              </div>
            ) : (
              sessions.map((session) => {
                const sessionStatus = getSessionStatus(session, isMyanmar);
                return (
                  <div key={session.id} className="ops-mobile-card space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{session.accessKeyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.serverCountryCode ? `${getCountryFlag(session.serverCountryCode)} ` : ''}
                          {session.serverName}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn(sessionStatus.className)}>
                        {sessionStatus.label}
                      </Badge>
                    </div>
                    <div className="grid gap-1 text-sm">
                      <p><span className="text-muted-foreground">{isMyanmar ? 'ပိုင်ရှင်:' : 'Owner:'}</span> {session.userEmail ?? session.accessKeyEmail ?? '-'}</p>
                      <p><span className="text-muted-foreground">{isMyanmar ? 'စတင်ချိန်:' : 'Started:'}</span> {formatDateTime(session.startedAt)}</p>
                      <p><span className="text-muted-foreground">{isMyanmar ? 'နောက်ဆုံးလှုပ်ရှားချိန်:' : 'Last active:'}</span> {formatRelativeTime(session.lastActiveAt)}</p>
                      <p><span className="text-muted-foreground">{isMyanmar ? 'ကြာချိန်:' : 'Duration:'}</span> {formatDuration(session.durationMinutes, isMyanmar)}</p>
                      <p><span className="text-muted-foreground">{isMyanmar ? 'အသုံးပြုဒေတာ:' : 'Traffic:'}</span> {formatBytes(BigInt(session.bytesUsed))}</p>
                      <p><span className="text-muted-foreground">{isMyanmar ? 'ပိတ်သိမ်းရသည့် အကြောင်း:' : 'Ended reason:'}</span> {getEndedReasonLabel(session.endedReason, isMyanmar)}</p>
                    </div>
                    {session.isActive ? (
                      <div className="ops-mobile-action-bar flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => terminateMutation.mutate({ id: session.id })}
                          disabled={terminateMutation.isPending}
                        >
                          {terminateMutation.isPending && terminateMutation.variables?.id === session.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4 mr-2" />
                          )}
                          {isMyanmar ? 'ပိတ်မည်' : 'Terminate'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="ops-data-shell hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isMyanmar ? 'သော့' : 'Key'}</TableHead>
                  <TableHead>{isMyanmar ? 'ပိုင်ရှင်' : 'Owner'}</TableHead>
                  <TableHead>{isMyanmar ? 'ဆာဗာ' : 'Server'}</TableHead>
                  <TableHead>{isMyanmar ? 'အခြေအနေ' : 'Status'}</TableHead>
                  <TableHead>{isMyanmar ? 'စတင်ချိန်' : 'Started'}</TableHead>
                  <TableHead>{isMyanmar ? 'နောက်ဆုံး လှုပ်ရှားချိန်' : 'Last Active'}</TableHead>
                  <TableHead>{isMyanmar ? 'ကြာချိန်' : 'Duration'}</TableHead>
                  <TableHead>{isMyanmar ? 'အသုံးပြုဒေတာ' : 'Traffic'}</TableHead>
                  <TableHead>{isMyanmar ? 'အကြောင်းရင်း' : 'Reason'}</TableHead>
                  <TableHead className="text-right">{isMyanmar ? 'လုပ်ဆောင်ချက်များ' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      {isMyanmar ? 'လက်ရှိ စစ်ထုတ်မှုများနှင့် ကိုက်ညီသော ချိတ်ဆက်မှု မရှိပါ။' : 'No sessions match the current filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((session) => {
                        const sessionStatus = getSessionStatus(session, isMyanmar);
                    return (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{session.accessKeyName}</p>
                            <p className="text-xs text-muted-foreground">{session.accessKeyEmail ?? '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>{session.userEmail ?? '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {session.serverCountryCode ? <span>{getCountryFlag(session.serverCountryCode)}</span> : null}
                            <span>{session.serverName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(sessionStatus.className)}>
                            {sessionStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{formatDateTime(session.startedAt)}</p>
                            <p className="text-xs text-muted-foreground">{formatRelativeTime(session.startedAt)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            {session.isActive ? (
                              session.stale ? <Clock3 className="w-4 h-4 text-amber-500" /> : <Wifi className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <WifiOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span>{formatRelativeTime(session.lastActiveAt)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDuration(session.durationMinutes, isMyanmar)}</TableCell>
                        <TableCell>{formatBytes(BigInt(session.bytesUsed))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{getEndedReasonLabel(session.endedReason, isMyanmar)}</TableCell>
                        <TableCell className="text-right">
                          {session.isActive ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => terminateMutation.mutate({ id: session.id })}
                              disabled={terminateMutation.isPending}
                            >
                              {terminateMutation.isPending && terminateMutation.variables?.id === session.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Power className="w-4 h-4 mr-2" />
                              )}
                              {isMyanmar ? 'ပိတ်မည်' : 'Terminate'}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{isMyanmar ? 'ပိတ်ထားသည်' : 'Closed'}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="ops-table-toolbar">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {isMyanmar ? 'ယခင်' : 'Previous'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= (data?.totalPages ?? 1) || isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              {isMyanmar ? 'နောက်တစ်ခု' : 'Next'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
