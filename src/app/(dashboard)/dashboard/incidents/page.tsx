'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollText, AlertTriangle, ServerCrash, Users, KeyRound, Flame, BellRing, CheckCircle2, RefreshCw } from 'lucide-react';
import { cn, formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function IncidentStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: 'critical' | 'warning' | 'info' | 'success' | 'violet';
}) {
  const toneClass = {
    critical:
      'dark:border-rose-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
    warning:
      'dark:border-amber-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
    info:
      'dark:border-cyan-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
    success:
      'dark:border-emerald-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
    violet:
      'dark:border-violet-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.18),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
  }[tone];

  return (
    <div
      className={cn(
        'ops-stat-pod dark:shadow-[0_18px_42px_rgba(1,6,20,0.4),inset_0_1px_0_rgba(125,211,252,0.05)]',
        toneClass,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SeverityBadge({
  severity,
  isMyanmar = false,
}: {
  severity: 'critical' | 'warning' | 'info';
  isMyanmar?: boolean;
}) {
  const styles =
    severity === 'critical'
      ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
      : severity === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
        : 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300';

  return (
    <Badge variant="outline" className={styles}>
      {isMyanmar
        ? severity === 'critical'
          ? 'အလွန်ပြင်းထန်'
          : severity === 'warning'
            ? 'သတိပေး'
            : 'အချက်အလက်'
        : severity}
    </Badge>
  );
}

function WorkflowBadge({
  status,
  isMyanmar = false,
}: {
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  isMyanmar?: boolean;
}) {
  const styles =
    status === 'RESOLVED'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
      : status === 'ACKNOWLEDGED'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300';

  return (
    <Badge variant="outline" className={styles}>
      {isMyanmar
        ? status === 'RESOLVED'
          ? 'ဖြေရှင်းပြီး'
          : status === 'ACKNOWLEDGED'
            ? 'လက်ခံထားသည်'
            : 'ဖွင့်ထားသည်'
        : status.toLowerCase()}
    </Badge>
  );
}

export default function IncidentCenterPage() {
  const { locale, t } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const utils = trpc.useUtils();
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('unassigned');

  const overviewQuery = trpc.incidents.overview.useQuery({ lookbackDays: 14 });
  const assigneesQuery = trpc.incidents.assignees.useQuery();
  const detailQuery = trpc.incidents.detail.useQuery(
    { incidentId: selectedIncidentId ?? '', lookbackDays: 30 },
    { enabled: !!selectedIncidentId },
  );

  useEffect(() => {
    if (!selectedIncidentId && overviewQuery.data?.openIncidents?.[0]?.id) {
      setSelectedIncidentId(overviewQuery.data.openIncidents[0].id);
    }
  }, [overviewQuery.data, selectedIncidentId]);

  useEffect(() => {
    if (detailQuery.data?.incident.assignedUserId) {
      setSelectedAssigneeId(detailQuery.data.incident.assignedUserId);
    } else if (detailQuery.data) {
      setSelectedAssigneeId('unassigned');
    }
  }, [detailQuery.data]);

  const refetchAll = async () => {
    await Promise.all([
      overviewQuery.refetch(),
      selectedIncidentId ? detailQuery.refetch() : Promise.resolve(),
      assigneesQuery.refetch(),
    ]);
  };

  const acknowledgeMutation = trpc.incidents.acknowledge.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'အဖြစ်အပျက်ကို လက်ခံထားသည်' : 'Incident acknowledged',
        description: isMyanmar
          ? 'အဖြစ်အပျက် workflow အခြေအနေကို ပြင်ဆင်ပြီးပါပြီ။'
          : 'The incident workflow status has been updated.',
      });
      setNoteInput('');
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'လက်ခံမှု မအောင်မြင်ပါ' : 'Acknowledge failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const assignMutation = trpc.incidents.assign.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'တာဝန်ပေးမှုကို ပြင်ဆင်ပြီးပါပြီ' : 'Incident assignment updated',
        description: isMyanmar ? 'ပိုင်ဆိုင်မှုကို ပြင်ဆင်ပြီးပါပြီ။' : 'Ownership has been updated.',
      });
      setNoteInput('');
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'တာဝန်ပေးမှု မအောင်မြင်ပါ' : 'Assignment failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const addNoteMutation = trpc.incidents.addNote.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'မှတ်စု ထည့်ပြီးပါပြီ' : 'Note added',
        description: isMyanmar
          ? 'ဤမှတ်စုသည် အဖြစ်အပျက် timeline ထဲတွင် ပါဝင်သွားပါပြီ။'
          : 'The note is now part of the incident timeline.',
      });
      setNoteInput('');
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'မှတ်စု ထည့်မှု မအောင်မြင်ပါ' : 'Note failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resolveMutation = trpc.incidents.resolve.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'အဖြစ်အပျက်ကို ဖြေရှင်းပြီးပါပြီ' : 'Incident resolved',
        description: isMyanmar ? 'ဤအဖြစ်အပျက်ကို ပိတ်လိုက်ပါပြီ။' : 'The incident has been closed.',
      });
      setNoteInput('');
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ဖြေရှင်းမှု မအောင်မြင်ပါ' : 'Resolve failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const severityMutation = trpc.incidents.updateSeverity.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'ပြင်းထန်မှုကို ပြင်ဆင်ပြီးပါပြီ' : 'Severity updated',
        description: isMyanmar
          ? 'အဖြစ်အပျက်၏ ပြင်းထန်မှုကို ပြင်ဆင်ပြီးပါပြီ။'
          : 'Incident severity has been updated.',
      });
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ပြင်းထန်မှု ပြင်ဆင်မှု မအောင်မြင်ပါ' : 'Severity update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const selectedDetail = detailQuery.data;
  const alertHistory = useMemo(() => overviewQuery.data?.alertHistory ?? [], [overviewQuery.data]);

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5">
          <div className="space-y-5 self-start">
            <Badge variant="outline" className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200">
              <Flame className="mr-2 h-3.5 w-3.5" />
              {isMyanmar ? 'အဖြစ်အပျက် ဗဟို' : 'Incident Center'}
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {isMyanmar ? 'လည်ပတ်မှုဆိုင်ရာ အဖြစ်အပျက်များ' : 'Operational incidents'}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {isMyanmar
                  ? 'ဆာဗာအဖြစ်အပျက်များကို တိုက်ရိုက်စောင့်ကြည့်ပါ၊ တာဝန်ခံသတ်မှတ်ပါ၊ မှတ်စုထည့်ပါ၊ သတိပေးချက် နောက်ခံအချက်အလက်နှင့် ထိခိုက်မှုခွဲခြမ်းစိတ်ဖြာချက် ပါဝင်သော ဖြေရှင်းမှတ်တမ်းကို ထိန်းသိမ်းပါ။'
                  : 'Track live server incidents, assign owners, add notes, and preserve a real resolution history with alert context and impact analysis.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <IncidentStatCard label={isMyanmar ? 'ဖွင့်ထားသည်' : 'Open'} value={overviewQuery.data?.summary.openIncidents ?? 0} tone="critical" />
              <IncidentStatCard label={isMyanmar ? 'ပြင်းထန်' : 'Critical'} value={overviewQuery.data?.summary.criticalOpen ?? 0} tone="warning" />
              <IncidentStatCard label={isMyanmar ? 'လက်ခံထားသည်' : 'Acknowledged'} value={overviewQuery.data?.summary.acknowledgedOpen ?? 0} tone="info" />
              <IncidentStatCard label={isMyanmar ? 'ထိခိုက်သော သော့များ' : 'Affected keys'} value={overviewQuery.data?.summary.affectedKeys ?? 0} tone="violet" />
              <IncidentStatCard label={isMyanmar ? 'နောက်ဆုံး သတိပေးချက်များ' : 'Recent alerts'} value={overviewQuery.data?.summary.recentAlerts ?? 0} tone="success" />
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{t('dashboard.command_rail')}</p>
                <h2 className="text-xl font-semibold">{isMyanmar ? 'တုံ့ပြန်ထိန်းချုပ်မှုများ' : 'Response controls'}</h2>
                <p className="text-sm text-muted-foreground">
                  {isMyanmar
                    ? 'အဖြစ်အပျက်စာရင်းကို အမြဲသစ်နေစေပြီး တုံ့ပြန်မှုစာမျက်နှာမှ မထွက်ဘဲ ဆက်စပ် ပေးပို့မှု မှတ်တမ်းကို ကြည့်ပါ။'
                    : 'Keep the incident list fresh and jump into linked delivery history without leaving the response surface.'}
                </p>
              </div>
              <Button className="h-12 w-full rounded-full" onClick={() => void refetchAll()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {isMyanmar ? 'အဖြစ်အပျက်များကို ပြန်တင်မည်' : 'Refresh incidents'}
              </Button>
              <Button variant="outline" asChild className="h-11 w-full rounded-full border-border/70 bg-background/70 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]">
                <Link href="/dashboard/notifications">{isMyanmar ? 'အသိပေးချက်များကို ဖွင့်မည်' : 'Open notifications'}</Link>
              </Button>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'အသိပေးချက် စီးကြောင်း' : 'Alert feed'}</p>
                <h2 className="text-xl font-semibold">{isMyanmar ? 'ချိတ်ဆက်ထားသော သတိပေးချက် မှတ်တမ်း' : 'Linked alert history'}</h2>
              </div>
              {alertHistory.length === 0 ? (
                <div className="ops-support-card text-sm text-muted-foreground">
                  {isMyanmar ? 'ရွေးထားသော နောက်ပြန်ကြည့်ကာလ အတွင်း နောက်ဆုံး သတိပေးချက်များ မရှိပါ။' : 'No recent alerts were recorded in the selected lookback window.'}
                </div>
              ) : (
                alertHistory.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="ops-row-card space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={entry.severity} isMyanmar={isMyanmar} />
                          <p className="text-sm font-medium">{entry.event.replace(/_/g, ' ')}</p>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">{entry.message}</p>
                      </div>
                      <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {formatRelativeTime(entry.sentAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="ops-panel">
          <CardHeader>
            <CardTitle className="text-xl">{isMyanmar ? 'ဖွင့်ထားသော အဖြစ်အပျက်များ' : 'Open incidents'}</CardTitle>
            <CardDescription>{isMyanmar ? 'လက်ရှိ နှေးကွေးသော သို့မဟုတ် offline ဖြစ်နေသော ဆာဗာများနှင့် ထိခိုက်မှုအတိုင်းအတာ။' : 'Current slow or down servers and the scope of impact.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overviewQuery.data?.openIncidents.length ? (
              overviewQuery.data.openIncidents.map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => setSelectedIncidentId(incident.id)}
                  className={cn(
                    'w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors',
                    selectedIncidentId === incident.id
                      ? 'border-primary/40 bg-primary/8 dark:border-cyan-300/30 dark:bg-cyan-400/[0.08]'
                      : 'border-border/70 bg-background/65 hover:border-primary/25 dark:bg-white/[0.02] dark:hover:border-cyan-300/18',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={incident.severity} isMyanmar={isMyanmar} />
                        <WorkflowBadge status={incident.workflowStatus} isMyanmar={isMyanmar} />
                      </div>
                      <p className="font-semibold">{incident.serverName}</p>
                      <p className="text-sm text-muted-foreground">{incident.summary}</p>
                    </div>
                    <p className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(incident.startedAt)}
                    </p>
                  </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="h-3.5 w-3.5" />
                        {incident.affectedKeyCount} {isMyanmar ? 'သော့ ခု' : 'key(s)'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {incident.affectedUserCount} {isMyanmar ? 'အသုံးပြုသူ ယောက်' : 'user(s)'}
                      </span>
                      {incident.assignedUserEmail ? (
                        <span>
                          {isMyanmar ? 'တာဝန်ခံ:' : 'Assigned:'} {incident.assignedUserEmail}
                        </span>
                      ) : null}
                    </div>
                </button>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-8 text-center">
                <p className="text-base font-medium text-emerald-600 dark:text-emerald-300">{isMyanmar ? 'ဖွင့်ထားသော အဖြစ်အပျက် မရှိပါ' : 'No open incidents'}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isMyanmar ? 'စောင့်ကြည့်ထားသော ဆာဗာအားလုံးသည် လက်ရှိတွင် အသက်ဝင် အဖြစ်အပျက် မရှိဘဲ လည်ပတ်နေပါသည်။' : 'All monitored servers are currently operating without an active incident.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="ops-panel">
          <CardHeader>
            <CardTitle className="text-xl">{isMyanmar ? 'အဖြစ်အပျက် လုပ်ငန်းစဉ်နှင့် ထိခိုက်မှု' : 'Incident workflow and impact'}</CardTitle>
            <CardDescription>
              {selectedDetail
                ? isMyanmar
                  ? `${selectedDetail.server?.name ?? selectedDetail.incident.title} အတွက် အခြေအနေ၊ တာဝန်ပေးမှု၊ မှတ်စုနှင့် အသိပေးချက်မှတ်တမ်းကို စီမံပါ။`
                  : `Manage status, assignments, notes, and notification history for ${selectedDetail.server?.name ?? selectedDetail.incident.title}.`
                : isMyanmar
                  ? 'သော့များ၊ အသုံးပြုသူများ၊ အသိပေးချက်များနှင့် ဖြေရှင်းမှု အချိန်လိုင်းကို စစ်ဆေးရန် ဖွင့်ထားသော အဖြစ်အပျက်တစ်ခုကို ရွေးပါ။'
                  : 'Select an open incident to inspect keys, users, notifications, and the resolution timeline.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedDetail ? (
              <div className="rounded-[1.5rem] border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                {isMyanmar ? 'စစ်ဆေးပြီး စီမံရန် ဘယ်ဘက်က အဖြစ်အပျက်တစ်ခုကို ရွေးပါ။' : 'Choose an incident from the left column to inspect and manage it.'}
              </div>
            ) : (
              <>
                <div className="ops-section-grid">
                  <Card className="ops-detail-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{isMyanmar ? 'တုံ့ပြန် လုပ်ငန်းစဉ်' : 'Workflow'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={selectedDetail.incident.severity} isMyanmar={isMyanmar} />
                        <WorkflowBadge status={selectedDetail.incident.status} isMyanmar={isMyanmar} />
                        {selectedDetail.incident.assignedUserEmail ? (
                          <Badge variant="outline">
                            {isMyanmar ? 'တာဝန်ခံ' : 'Assigned to'} {selectedDetail.incident.assignedUserEmail}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">{isMyanmar ? 'ပြင်းထန်မှု' : 'Severity'}</p>
                        <Select
                          value={selectedDetail.incident.severity}
                          onValueChange={(value) =>
                            severityMutation.mutate({
                              incidentId: selectedDetail.incident.id,
                              severity: value as 'critical' | 'warning' | 'info',
                            })
                          }
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">{isMyanmar ? 'အလွန်ပြင်းထန်' : 'critical'}</SelectItem>
                            <SelectItem value="warning">{isMyanmar ? 'သတိပေး' : 'warning'}</SelectItem>
                            <SelectItem value="info">{isMyanmar ? 'အချက်အလက်' : 'info'}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">{isMyanmar ? 'တာဝန်ခံ သတ်မှတ်မည်' : 'Assign owner'}</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Select value={selectedAssigneeId} onValueChange={setSelectedAssigneeId}>
                            <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder={isMyanmar ? 'တာဝန်ခံကို ရွေးပါ' : 'Select assignee'} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">{isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned'}</SelectItem>
                              {(assigneesQuery.data ?? []).map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            className="rounded-xl"
                            onClick={() =>
                              assignMutation.mutate({
                                incidentId: selectedDetail.incident.id,
                                assigneeUserId: selectedAssigneeId === 'unassigned' ? null : selectedAssigneeId,
                                note: noteInput.trim() || undefined,
                              })
                            }
                            disabled={assignMutation.isPending}
                          >
                            {isMyanmar ? 'သတ်မှတ်မည်' : 'Assign'}
                          </Button>
                        </div>
                      </div>
                      <div className="ops-mobile-action-bar grid-cols-1 sm:grid-cols-3">
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() =>
                            acknowledgeMutation.mutate({
                              incidentId: selectedDetail.incident.id,
                              note: noteInput.trim() || undefined,
                            })
                          }
                          disabled={acknowledgeMutation.isPending || selectedDetail.incident.status === 'ACKNOWLEDGED'}
                        >
                          {isMyanmar ? 'လက်ခံမည်' : 'Acknowledge'}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() =>
                            addNoteMutation.mutate({
                              incidentId: selectedDetail.incident.id,
                              note: noteInput.trim(),
                            })
                          }
                          disabled={addNoteMutation.isPending || !noteInput.trim()}
                        >
                          {isMyanmar ? 'မှတ်စု ထည့်မည်' : 'Add note'}
                        </Button>
                        <Button
                          className="rounded-xl"
                          onClick={() =>
                            resolveMutation.mutate({
                              incidentId: selectedDetail.incident.id,
                              note: noteInput.trim() || undefined,
                            })
                          }
                          disabled={resolveMutation.isPending || selectedDetail.incident.status === 'RESOLVED'}
                        >
                          {isMyanmar ? 'ဖြေရှင်းမည်' : 'Resolve'}
                        </Button>
                      </div>
                      <Textarea
                        value={noteInput}
                        onChange={(event) => setNoteInput(event.target.value)}
                        placeholder={
                          isMyanmar
                            ? 'တာဝန်ပေးရသည့်အကြောင်းအရာ၊ လက်ခံမှတ်စု သို့မဟုတ် ဖြေရှင်းချက်မှတ်စုများကို ထည့်ပါ…'
                            : 'Add assignment context, acknowledgement note, or resolution notes…'
                        }
                        className="min-h-[120px] rounded-2xl"
                      />
                    </CardContent>
                  </Card>

                  <Card className="ops-detail-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{isMyanmar ? 'တစ်ချက်ကြည့် ထိခိုက်မှု' : 'At-a-glance impact'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="ops-row-card">
                        <p className="font-medium">{selectedDetail.incident.title}</p>
                        <p className="mt-1 text-muted-foreground">{selectedDetail.incident.summary}</p>
                      </div>
                      {selectedDetail.server ? (
                        <div className="ops-row-card">
                          <p className="font-medium">{selectedDetail.server.name}</p>
                          <p className="mt-1 text-muted-foreground">
                            {selectedDetail.server.status} •{' '}
                            {selectedDetail.server.latencyMs != null ? `${selectedDetail.server.latencyMs} ms` : (isMyanmar ? 'ကြန့်ကြာချိန် မရှိ' : 'No latency')}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {isMyanmar ? 'နောက်ဆုံး စစ်ဆေးချိန် ' : 'Last checked '} {selectedDetail.server.lastCheckedAt ? formatDateTime(selectedDetail.server.lastCheckedAt) : (isMyanmar ? 'မရှိသေး' : 'Never')}
                          </p>
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="ops-row-card">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{isMyanmar ? 'ထိခိုက်သော သော့များ' : 'Affected keys'}</p>
                          <p className="mt-2 text-2xl font-semibold">{selectedDetail.incident.affectedKeyCount}</p>
                        </div>
                        <div className="ops-row-card">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{isMyanmar ? 'ထိခိုက်သော အသုံးပြုသူများ' : 'Affected users'}</p>
                          <p className="mt-2 text-2xl font-semibold">{selectedDetail.incident.affectedUserCount}</p>
                        </div>
                      </div>
                      <div className="ops-row-card">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{isMyanmar ? 'မှတ်စုများ' : 'Notes'}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {selectedDetail.incident.notes || (isMyanmar ? 'လုပ်ဆောင်သူ မှတ်စု မရှိသေးပါ။' : 'No operator notes yet.')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="ops-section-grid">
                  <Card className="ops-detail-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{isMyanmar ? 'ထိခိုက်သော သော့များ' : 'Affected keys'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedDetail.affectedKeys.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'ဤဆာဗာတွင် လက်ရှိချိတ်ဆက်ထားသော သော့ မရှိပါ။' : 'No keys are currently attached to this server.'}</p>
                      ) : (
                        selectedDetail.affectedKeys.slice(0, 8).map((key) => (
                          <div key={key.id} className="ops-row-card flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{key.name}</p>
                              <p className="text-xs text-muted-foreground">{key.status}</p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <p>{formatBytes(BigInt(key.usedBytes))}</p>
                              <p>{key.expiresAt ? formatDateTime(key.expiresAt) : (isMyanmar ? 'သက်တမ်းမရှိ' : 'No expiry')}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="ops-detail-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{isMyanmar ? 'ထိခိုက်သော အသုံးပြုသူများ' : 'Affected users'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedDetail.affectedUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'ဤဆာဗာ၏ သော့များနှင့် ဆက်စပ်ထားသော အသုံးပြုသူ ပိုင်ဆိုင်မှု မရှိပါ။' : 'No user ownership is attached to this server’s keys.'}</p>
                      ) : (
                        selectedDetail.affectedUsers.map((user) => (
                          <div key={`${user.type}-${user.label}`} className="ops-row-card flex items-center justify-between gap-3">
                            <p className="font-medium">{user.label}</p>
                            <Badge variant="outline">{user.type}</Badge>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="ops-detail-card">
                  <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-base">{isMyanmar ? 'အသိပေးချက် ချိတ်ဆက်မှုများ' : 'Notification links'}</CardTitle>
                      <CardDescription>{isMyanmar ? 'ဤအဖြစ်အပျက်နှင့် ဆက်စပ်သော နောက်ဆုံး ပေးပို့မှု မှတ်တမ်း။' : 'Recent delivery history connected to this incident.'}</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild className="rounded-full">
                      <Link href="/dashboard/notifications">{isMyanmar ? 'ပေးပို့မှု မှတ်တမ်းကို ဖွင့်မည်' : 'Open delivery history'}</Link>
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedDetail.notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{isMyanmar ? 'ဤအဖြစ်အပျက်နှင့် ဆက်စပ်ထားသော အသိပေးချက် ပေးပို့မှု မရှိသေးပါ။' : 'No notification deliveries were linked to this incident yet.'}</p>
                    ) : (
                      selectedDetail.notifications.slice(0, 8).map((entry) => (
                        <div key={entry.id} className="ops-row-card flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <BellRing className="h-4 w-4 text-primary" />
                              <p className="font-medium">{entry.event.replace(/_/g, ' ')}</p>
                              <Badge variant="outline">{entry.status}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{entry.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.channelName ? `${entry.channelName} (${entry.channelType})` : (isMyanmar ? 'စနစ် မှတ်တမ်း' : 'System log')}
                            </p>
                            {entry.error ? <p className="text-xs text-red-500">{entry.error}</p> : null}
                          </div>
                          <p className="whitespace-nowrap text-xs text-muted-foreground">{formatRelativeTime(entry.sentAt)}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="ops-detail-card">
                  <CardHeader className="pb-3">
                      <CardTitle className="text-base">{isMyanmar ? 'ဖြေရှင်းမှု အချိန်လိုင်း' : 'Resolution timeline'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedDetail.timeline.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{isMyanmar ? 'ဤအဖြစ်အပျက်အတွက် အချိန်လိုင်း မှတ်တမ်း မရှိသေးပါ။' : 'No timeline entries were found for this incident yet.'}</p>
                    ) : (
                      selectedDetail.timeline.slice(0, 16).map((entry) => (
                        <div key={entry.id} className="ops-row-card flex gap-3">
                          <div className="mt-0.5">
                            {entry.category === 'alert' ? (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            ) : entry.category === 'audit' ? (
                              <ScrollText className="h-4 w-4 text-sky-500" />
                            ) : entry.category === 'state' ? (
                              <ServerCrash className="h-4 w-4 text-rose-500" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{entry.title}</p>
                              <SeverityBadge severity={entry.severity} />
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                            {entry.actorEmail ? (
                              <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'လုပ်ဆောင်သူ:' : 'Actor:'} {entry.actorEmail}</p>
                            ) : null}
                          </div>
                          <p className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatRelativeTime(entry.timestamp)}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
