'use client';

/**
 * Reports Page
 *
 * Allows admins to generate, view, and download monthly usage reports.
 * Reports include per-server and per-key traffic data with CSV export.
 */

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogSectionDescription,
  DialogSectionHeader,
  DialogSectionTitle,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { withBasePath } from '@/lib/base-path';
import { formatBytes, formatDateTime } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  Download,
  Plus,
  Trash2,
  Loader2,
  Calendar,
  BarChart3,
  Clock3,
  Server,
  Key,
  TrendingUp,
  Eye,
  FileJson,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Send,
} from 'lucide-react';
import type { ScheduledReportsConfig } from '@/lib/services/scheduled-reports';

/**
 * Format a date range nicely
 */
function formatPeriod(start: Date, end: Date, isMyanmar = false): string {
  const s = new Date(start);
  const e = new Date(end);
  const locale = isMyanmar ? 'my-MM' : 'en-US';
  return `${s.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/**
 * Get available months for report generation (last 12 months)
 */
function getAvailableMonths(isMyanmar = false): Array<{ label: string; year: number; month: number }> {
  const months: Array<{ label: string; year: number; month: number }> = [];
  const now = new Date();
  const locale = isMyanmar ? 'my-MM' : 'en-US';

  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
  }

  return months;
}

function getReportStatusLabel(status: string, isMyanmar = false) {
  switch (status) {
    case 'READY':
      return isMyanmar ? 'အသင့်ဖြစ်နေသည်' : 'Ready';
    case 'GENERATING':
      return isMyanmar ? 'ဖန်တီးနေသည်' : 'Generating';
    case 'FAILED':
      return isMyanmar ? 'မအောင်မြင်ပါ' : 'Failed';
    default:
      return status;
  }
}

function getRunStatusLabel(status: string, isMyanmar = false) {
  switch (status) {
    case 'SUCCESS':
      return isMyanmar ? 'အောင်မြင်သည်' : 'Success';
    case 'FAILED':
      return isMyanmar ? 'မအောင်မြင်ပါ' : 'Failed';
    case 'PENDING':
      return isMyanmar ? 'စောင့်ဆိုင်းနေသည်' : 'Pending';
    case 'RUNNING':
      return isMyanmar ? 'လည်ပတ်နေသည်' : 'Running';
    default:
      return status;
  }
}

function getReportTypeLabel(type: string, isMyanmar = false) {
  switch (type) {
    case 'MONTHLY':
      return isMyanmar ? 'လစဉ်' : 'Monthly';
    case 'WEEKLY':
      return isMyanmar ? 'အပတ်စဉ်' : 'Weekly';
    default:
      return type;
  }
}

function getFrequencyLabel(frequency: string, isMyanmar = false) {
  switch (frequency) {
    case 'DAILY':
      return isMyanmar ? 'နေ့စဉ်' : 'Daily';
    case 'WEEKLY':
      return isMyanmar ? 'အပတ်စဉ်' : 'Weekly';
    default:
      return frequency;
  }
}

function getChannelTypeLabel(type: string, isMyanmar = false) {
  switch (type) {
    case 'EMAIL':
      return isMyanmar ? 'အီးမေးလ်' : 'Email';
    case 'WEBHOOK':
      return isMyanmar ? 'ဝဘ်ဟုခ်' : 'Webhook';
    case 'TELEGRAM':
      return isMyanmar ? 'တယ်လီဂရမ်' : 'Telegram';
    default:
      return type;
  }
}

/**
 * Report Detail View Dialog
 */
function ReportDetailDialog({
  open,
  onOpenChange,
  reportId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string | null;
}) {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { data: report, isLoading } = trpc.reports.getById.useQuery(
    { id: reportId! },
    { enabled: !!reportId && open }
  );

  if (!reportId) return null;

  const isScheduledSummary = report?.reportData?.kind === 'scheduled-summary';
  const usageSummary = isScheduledSummary ? report?.reportData?.usage?.summary : report?.reportData?.summary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {report?.name || (isMyanmar ? 'တင်နေသည်...' : 'Loading...')}
          </DialogTitle>
          <DialogDescription>
            {report ? formatPeriod(report.periodStart, report.periodEnd, isMyanmar) : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <DialogBody>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          </DialogBody>
        ) : report?.reportData ? (
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'အစီရင်ခံစာ အနှစ်ချုပ်' : 'Report snapshot'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar
                    ? 'ဤအစီရင်ခံကာလအတွက် အဓိက ကိန်းဂဏန်းများ၊ အသုံးပြုမှုအများဆုံး ဆာဗာများနှင့် ထုတ်ယူမှု လုပ်ဆောင်ချက်များကို စစ်ဆေးပါ။'
                    : 'Review the key metrics, busiest servers, and export actions for this reporting window.'}
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{isMyanmar ? 'ဆာဗာများ' : 'Servers'}</p>
                  </div>
                  <p className="text-xl font-bold">{usageSummary?.totalServers ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Key className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{isMyanmar ? 'စုစုပေါင်း သော့များ' : 'Total Keys'}</p>
                  </div>
                  <p className="text-xl font-bold">{usageSummary?.totalKeys ?? 0}</p>
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? `${usageSummary?.activeKeys ?? 0} ခု အသက်ဝင်နေသည်` : `${usageSummary?.activeKeys ?? 0} active`}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{isMyanmar ? 'စုစုပေါင်း အသုံးပြုမှု' : 'Total Usage'}</p>
                  </div>
                  <p className="text-xl font-bold">
                    {formatBytes(BigInt(usageSummary?.totalBytesUsed ?? 0))}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{isMyanmar ? 'ကာလအတွင်း ကွာဟချက်' : 'Period Delta'}</p>
                  </div>
                  <p className="text-xl font-bold">
                    {formatBytes(BigInt(usageSummary?.totalDeltaBytes ?? 0))}
                  </p>
                </CardContent>
              </Card>
              </div>
            </DialogSection>

            {isScheduledSummary ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{isMyanmar ? 'အချိန်ဇယား အနှစ်ချုပ် အခြေအနေ' : 'Scheduled summary snapshot'}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ဝင်ငွေ' : 'Revenue'}</p>
                    <p className="mt-2 text-lg font-semibold">
                      {report.reportData.summary.revenueAmount != null
                        ? `${report.reportData.summary.revenueAmount} ${report.reportData.summary.revenueCurrency ?? 'USD'}`
                        : isMyanmar ? 'မသတ်မှတ်ရသေးပါ' : 'Not configured'}
                    </p>
                  </div>
                  <div className="rounded-xl border px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ဝင်ရောက်မှု မအောင်မြင်ခြင်း' : 'Failed logins'}</p>
                    <p className="mt-2 text-lg font-semibold">{report.reportData.summary.failedLogins ?? 0}</p>
                  </div>
                  <div className="rounded-xl border px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'မကြာမီ သက်တမ်းကုန်မည်' : 'Expiring soon'}</p>
                    <p className="mt-2 text-lg font-semibold">{report.reportData.summary.expiringSoon ?? 0}</p>
                  </div>
                  <div className="rounded-xl border px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ဆာဗာ ကျန်းမာရေး' : 'Server health'}</p>
                    <p className="mt-2 text-lg font-semibold">
                      {isMyanmar
                        ? `${report.reportData.summary.serverHealth?.up ?? 0} ခု ကောင်း / ${report.reportData.summary.serverHealth?.down ?? 0} ခု ပျက်`
                        : `${report.reportData.summary.serverHealth?.up ?? 0} up / ${report.reportData.summary.serverHealth?.down ?? 0} down`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Top Consumers */}
            {!isScheduledSummary && report.reportData.topConsumers?.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{isMyanmar ? 'အသုံးပြုမှု အများဆုံး ၁၀ ခု' : 'Top 10 Consumers'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>{isMyanmar ? 'သော့အမည်' : 'Key Name'}</TableHead>
                        <TableHead>{isMyanmar ? 'ဆာဗာ' : 'Server'}</TableHead>
                        <TableHead className="text-right">{isMyanmar ? 'အသုံးပြုမှု' : 'Usage'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.reportData.topConsumers.map((consumer: { keyName: string; serverName: string; usedBytes: string }, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{consumer.keyName}</TableCell>
                          <TableCell className="text-muted-foreground">{consumer.serverName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatBytes(BigInt(consumer.usedBytes))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Per-Server Breakdown */}
            {(isScheduledSummary ? report.reportData.usage?.servers : report.reportData.servers)?.map((server: { serverId: string; serverName: string; location: string | null; totalKeys: number; activeKeys: number; totalUsedBytes: string; deltaBytes: string }) => (
              <Card key={server.serverId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      {server.serverName}
                      {server.location && (
                        <span className="text-muted-foreground font-normal">
                          ({server.location})
                        </span>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {server.activeKeys}/{server.totalKeys} {isMyanmar ? 'ခု' : 'keys'}
                      </Badge>
                      <Badge variant="outline">{formatBytes(BigInt(server.totalUsedBytes))}</Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}

            {/* Download Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => window.open(withBasePath(`/api/reports/download?id=${reportId}&format=csv`), '_blank')}
              >
                <Download className="w-4 h-4 mr-2" />
                {isMyanmar ? 'CSV ဖိုင် ထုတ်မည်' : 'Download CSV'}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(withBasePath(`/api/reports/download?id=${reportId}&format=json`), '_blank')}
              >
                <FileJson className="w-4 h-4 mr-2" />
                {isMyanmar ? 'JSON ဖိုင် ထုတ်မည်' : 'Download JSON'}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(withBasePath(`/api/reports/download?id=${reportId}&format=pdf`), '_blank')}
              >
                <FileDown className="w-4 h-4 mr-2" />
                {isMyanmar ? 'PDF ဖိုင် ထုတ်မည်' : 'Download PDF'}
              </Button>
            </div>
          </DialogBody>
        ) : (
          <DialogBody>
            <p className="py-8 text-center text-muted-foreground">
              {isMyanmar ? 'အစီရင်ခံစာ ဒေတာ မရှိပါ။' : 'No report data available.'}
            </p>
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Main Reports Page
 */
export default function ReportsPage() {
  const { locale, t } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [reportType, setReportType] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY');
  const [selectedMonth, setSelectedMonth] = useState('0'); // Index into availableMonths
  const [viewReportId, setViewReportId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduledReportsConfig | null>(null);

  const availableMonths = getAvailableMonths(isMyanmar);

  // Fetch reports
  const { data, isLoading, refetch } = trpc.reports.list.useQuery({
    page,
    pageSize: 10,
  });
  const scheduleQuery = trpc.reports.scheduledConfig.useQuery();
  const scheduledRunsQuery = trpc.reports.scheduledRuns.useQuery({
    page: 1,
    pageSize: 5,
  });
  const channelsQuery = trpc.notifications.listChannels.useQuery();

  useEffect(() => {
    if (scheduleQuery.data) {
      setScheduleForm(scheduleQuery.data);
    }
  }, [scheduleQuery.data]);

  // Generate mutation
  const generateMutation = trpc.reports.generate.useMutation({
    onSuccess: (result) => {
      toast({
        title: isMyanmar ? 'အစီရင်ခံစာ ဖန်တီးပြီးပါပြီ' : 'Report generated',
        description: isMyanmar
          ? `"${result.name}" ကို အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ။`
          : `"${result.name}" has been generated successfully.`,
      });
      setGenerateOpen(false);
      refetch();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ဖန်တီးမှု မအောင်မြင်ပါ' : 'Generation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = trpc.reports.delete.useMutation({
    onSuccess: () => {
      toast({
        title: isMyanmar ? 'အစီရင်ခံစာကို ဖျက်ပြီးပါပြီ' : 'Report deleted',
        description: isMyanmar ? 'အစီရင်ခံစာကို ဖယ်ရှားပြီးပါပြီ။' : 'The report has been deleted.',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ဖျက်ခြင်း မအောင်မြင်ပါ' : 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const saveScheduleMutation = trpc.reports.saveScheduledConfig.useMutation({
    onSuccess: (result) => {
      setScheduleForm(result);
      toast({
        title: isMyanmar ? 'အချိန်ဇယားကို ပြင်ဆင်ပြီးပါပြီ' : 'Schedule updated',
        description: isMyanmar
                    ? 'အချိန်ဇယားသတ်မှတ် အစီရင်ခံစာ ပေးပို့မှု ဆက်တင်များကို သိမ်းပြီးပါပြီ။'
          : 'Scheduled report delivery settings have been saved.',
      });
      void scheduleQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'အချိန်ဇယား ပြင်ဆင်မှု မအောင်မြင်ပါ' : 'Schedule update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runScheduledNowMutation = trpc.reports.runScheduledNow.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.skipped
          ? (isMyanmar ? 'လည်ပတ်မှုကို ကျော်ပြီးထားသည်' : 'Run skipped')
          : (isMyanmar ? 'အချိန်ဇယား အနှစ်ချုပ်ကို စောင့်ဆိုင်းစာရင်းသို့ ထည့်ပြီးပါပြီ' : 'Scheduled summary queued'),
        description: result.skipped
          ? (isMyanmar ? `အကြောင်းရင်း: ${result.reason}` : `Reason: ${result.reason}`)
          : (isMyanmar
            ? `${result.reportName} ကို ပေးပို့ရန် queue ထဲ ထည့်ပြီးပါပြီ။`
            : `${result.reportName} has been queued for delivery.`),
      });
      void refetch();
      void scheduleQuery.refetch();
      void scheduledRunsQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'လည်ပတ်မှု မအောင်မြင်ပါ' : 'Run failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleGenerate = () => {
    if (reportType === 'MONTHLY') {
      const month = availableMonths[parseInt(selectedMonth)];
      generateMutation.mutate({
        type: 'MONTHLY',
        year: month.year,
        month: month.month,
      });
    } else {
      generateMutation.mutate({
        type: 'WEEKLY',
      });
    }
  };

  const availableChannels =
    channelsQuery.data?.filter((channel) => channel.isActive && (channel.type === 'EMAIL' || channel.type === 'WEBHOOK' || channel.type === 'TELEGRAM')) ?? [];

  const toggleChannel = (channelId: string, checked: boolean) => {
    setScheduleForm((current) => {
      if (!current) return current;
      return {
        ...current,
        channelIds: checked
          ? Array.from(new Set([...current.channelIds, channelId]))
          : current.channelIds.filter((id) => id !== channelId),
      };
    });
  };

  const updateScheduleField = <K extends keyof ScheduledReportsConfig>(key: K, value: ScheduledReportsConfig[K]) => {
    setScheduleForm((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5">
          <div className="space-y-5 self-start">
            <Badge variant="outline" className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200">
              <FileText className="h-3.5 w-3.5" />
              {t('nav.reports')}
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {t('nav.reports')}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {isMyanmar
                  ? 'ထုတ်ယူနိုင်သော အသုံးပြုမှုအနှစ်ချုပ်များကို ဖန်တီးပါ၊ နေ့စဉ် သို့မဟုတ် အပတ်စဉ် လုပ်ငန်းဆိုင်ရာအနှစ်ချုပ်များကို အချိန်ဇယားသတ်မှတ်ပါ၊ ထို့ပြင် ပေးပို့မှုမှတ်တမ်းကို တစ်နေရာတည်းမှ စစ်ဆေးပါ။'
                  : 'Generate exportable usage snapshots, schedule daily or weekly operational summaries, and review delivery history from one reporting surface.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:max-w-4xl">
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{isMyanmar ? 'စုစုပေါင်း အစီရင်ခံစာများ' : 'Total reports'}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.total ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'ထုတ်ယူရန် အသင့်ဖြစ်နေသော အစီရင်ခံစာ မှတ်တမ်းများ။' : 'Stored report runs ready for export.'}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{isMyanmar ? 'နောက်ဆုံးကာလ အသုံးပြုမှု' : 'Latest period usage'}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {data?.reports[0] ? formatBytes(BigInt(data.reports[0].totalDeltaBytes)) : '0 B'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး ဖန်တီးထားသော ကာလအလိုက် ကွာဟချက်။' : 'Most recent generated period delta.'}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{isMyanmar ? 'နောက်ဆုံး အနှစ်ချုပ် လည်ပတ်မှု' : 'Last summary run'}</p>
                <p className="mt-2 text-sm font-semibold">
                  {scheduleForm?.lastRunAt ? formatDateTime(scheduleForm.lastRunAt) : isMyanmar ? 'မလုပ်ရသေးပါ' : 'Never'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scheduleForm?.lastRunStatus ? getRunStatusLabel(scheduleForm.lastRunStatus, isMyanmar) : (isMyanmar ? 'အချိန်ဇယား လည်ပတ်မှု မှတ်တမ်း မရှိသေးပါ။' : 'No scheduled run recorded yet.')}
                </p>
              </div>
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'အစီရင်ခံစာ လုပ်ဆောင်ချက်များ' : 'Report actions'}</p>
                <h2 className="text-xl font-semibold">{isMyanmar ? 'ဖန်တီးပြီး ပေးပို့မည်' : 'Generate and deliver'}</h2>
                <p className="text-sm text-muted-foreground">
                  {isMyanmar
                    ? 'ဤစာမျက်နှာမှ မထွက်ဘဲ လိုအပ်သလို အစီရင်ခံစာများ ဖန်တီးနိုင်ပြီး အချိန်ဇယားသတ်မှတ်ထားသော အနှစ်ချုပ်များကို ပေးပို့မည့် လမ်းကြောင်းများသို့ တိုက်ရိုက် ပို့နိုင်သည်။'
                    : 'Create on-demand reports or hand scheduled summaries off to channels without leaving this page.'}
                </p>
              </div>
              <Button className="h-12 w-full rounded-full" onClick={() => setGenerateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {isMyanmar ? 'အစီရင်ခံစာ ဖန်တီးမည်' : 'Generate Report'}
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full rounded-full border-border/70 bg-background/70 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]"
                onClick={() => runScheduledNowMutation.mutate()}
                disabled={runScheduledNowMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                {isMyanmar ? 'အချိန်ဇယား အနှစ်ချုပ်ကို ယခုပင် လည်ပတ်မည်' : 'Run scheduled summary'}
              </Button>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'ပေးပို့မှု အခြေအနေ' : 'Delivery pulse'}</p>
                <h2 className="text-xl font-semibold">{isMyanmar ? 'အချိန်ဇယား အခြေအနေ' : 'Schedule state'}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="ops-row-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဖွင့်ထားမှု' : 'Enabled'}</p>
                  <p className="mt-2 text-xl font-semibold">{scheduleForm?.enabled ? (isMyanmar ? 'လည်ပတ်နေသည်' : 'Active') : isMyanmar ? 'ရပ်ထားသည်' : 'Paused'}</p>
                </div>
                <div className="ops-row-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သတ်မှတ်ထားသော လမ်းကြောင်းများ' : 'Configured channels'}</p>
                  <p className="mt-2 text-xl font-semibold">{scheduleForm?.channelIds.length ?? 0}</p>
                </div>
                <div className="ops-row-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ကြိမ်နှုန်း' : 'Frequency'}</p>
                  <p className="mt-2 text-xl font-semibold">{getFrequencyLabel(scheduleForm?.frequency ?? 'DAILY', isMyanmar)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {scheduleForm ? (
        <Card className="ops-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="w-5 h-5 text-primary" />
              {isMyanmar ? 'အချိန်ဇယားသတ်မှတ် အစီရင်ခံစာများ' : 'Scheduled Reports'}
            </CardTitle>
            <CardDescription>
              {isMyanmar
                ? 'နေ့စဉ် သို့မဟုတ် အပတ်စဉ် အစီရင်ခံစာ အနှစ်ချုပ်များကို အီးမေးလ် သို့မဟုတ် ဝဘ်ဟုခ် လမ်းကြောင်းများသို့ လက်ဖြင့် မဖန်တီးဘဲ ပေးပို့ပါ။'
                : 'Deliver daily or weekly report summaries to email or webhook channels without generating them manually.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="ops-detail-card space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-base">{isMyanmar ? 'အလိုအလျောက် အနှစ်ချုပ်များ ဖွင့်မည်' : 'Enable automatic summaries'}</Label>
                    <p className="text-sm text-muted-foreground">
                    {isMyanmar ? 'အောက်ပါ အချိန်ဇယားအတိုင်း အနှစ်ချုပ် အစီရင်ခံစာကို စောင့်ဆိုင်းစာရင်းသို့ ထည့်မည်။' : 'Queue a summary report on the schedule below.'}
                    </p>
                  </div>
                  <Switch
                    checked={scheduleForm.enabled}
                    onCheckedChange={(checked) => updateScheduleField('enabled', checked)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'ကြိမ်နှုန်း' : 'Frequency'}</Label>
                    <Select
                      value={scheduleForm.frequency}
                      onValueChange={(value) => updateScheduleField('frequency', value as ScheduledReportsConfig['frequency'])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAILY">{isMyanmar ? 'နေ့စဉ်' : 'Daily'}</SelectItem>
                        <SelectItem value="WEEKLY">{isMyanmar ? 'အပတ်စဉ်' : 'Weekly'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'နောက်ကြည့်မည့် အချိန်အပိုင်း (ရက်)' : 'Lookback window (days)'}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={scheduleForm.lookbackDays}
                      onChange={(event) => updateScheduleField('lookbackDays', Math.max(1, Math.min(31, Number(event.target.value) || 7)))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'နာရီ' : 'Hour'}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={scheduleForm.hour}
                      onChange={(event) => updateScheduleField('hour', Math.max(0, Math.min(23, Number(event.target.value) || 0)))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'မိနစ်' : 'Minute'}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={scheduleForm.minute}
                      onChange={(event) => updateScheduleField('minute', Math.max(0, Math.min(59, Number(event.target.value) || 0)))}
                    />
                  </div>
                </div>

                {scheduleForm.frequency === 'WEEKLY' ? (
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'အပတ်၏ နေ့ရက်' : 'Weekday'}</Label>
                    <Select
                      value={String(scheduleForm.weekday)}
                      onValueChange={(value) => updateScheduleField('weekday', Number(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{isMyanmar ? 'တနင်္ဂနွေ' : 'Sunday'}</SelectItem>
                        <SelectItem value="1">{isMyanmar ? 'တနင်္လာ' : 'Monday'}</SelectItem>
                        <SelectItem value="2">{isMyanmar ? 'အင်္ဂါ' : 'Tuesday'}</SelectItem>
                        <SelectItem value="3">{isMyanmar ? 'ဗုဒ္ဓဟူး' : 'Wednesday'}</SelectItem>
                        <SelectItem value="4">{isMyanmar ? 'ကြာသပတေး' : 'Thursday'}</SelectItem>
                        <SelectItem value="5">{isMyanmar ? 'သောကြာ' : 'Friday'}</SelectItem>
                        <SelectItem value="6">{isMyanmar ? 'စနေ' : 'Saturday'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div className="ops-detail-card space-y-4">
                <div>
                <Label className="text-base">{isMyanmar ? 'ပေးပို့မည့် လမ်းကြောင်းများ' : 'Delivery channels'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isMyanmar ? 'အချိန်ဇယား အနှစ်ချုပ်များကို ဘယ်နေရာသို့ ပေးပို့မည်ကို ရွေးပါ။' : 'Choose where scheduled summaries should be sent.'}
                  </p>
                </div>
                <div className="space-y-2">
                  {availableChannels.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {isMyanmar ? 'အချိန်ဇယားပေးပို့မှု မဖွင့်မီ အသိပေးချက်များ စာမျက်နှာတွင် အီးမေးလ် သို့မဟုတ် ဝဘ်ဟုခ် လမ်းကြောင်း တစ်ခု ဖန်တီးပါ။' : 'Create an email or webhook channel in Notifications before enabling scheduled delivery.'}
                    </p>
                  ) : (
                    availableChannels.map((channel) => (
                      <label
                        key={channel.id}
                        className="ops-row-card flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="font-medium">{channel.name}</p>
                      <p className="text-xs text-muted-foreground">{getChannelTypeLabel(channel.type, isMyanmar)}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={scheduleForm.channelIds.includes(channel.id)}
                          onChange={(event) => toggleChannel(channel.id, event.target.checked)}
                        />
                      </label>
                    ))
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'ဝင်ငွေ ပမာဏ (မဖြစ်မနေ မဟုတ်)' : 'Revenue amount (optional)'}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={scheduleForm.revenueAmount ?? ''}
                      placeholder={isMyanmar ? 'ငွေတောင်းခံမှုကို မမှတ်တမ်းတင်ထားပါက အလွတ်ထားပါ' : 'Leave blank if billing is not tracked'}
                      onChange={(event) =>
                        updateScheduleField(
                          'revenueAmount',
                          event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'ငွေကြေးယူနစ်' : 'Currency'}</Label>
                    <Input
                      value={scheduleForm.revenueCurrency}
                      onChange={(event) => updateScheduleField('revenueCurrency', event.target.value.toUpperCase().slice(0, 8) || 'USD')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{isMyanmar ? 'ခေါင်းစဉ် ပုံစံ' : 'Subject template'}</Label>
                  <Input
                    value={scheduleForm.subjectTemplate}
                    onChange={(event) => updateScheduleField('subjectTemplate', event.target.value)}
                    placeholder="Atomic-UI {{frequency_label}} Summary"
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar
                      ? `အသုံးပြုနိုင်သော နေရာဖြည့်အမှတ်များ - {{frequency_label}}, {{generated_at}}, {{period_start}}, {{period_end}}`
                      : 'Available placeholders: {{frequency_label}}, {{generated_at}}, {{period_start}}, {{period_end}}.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{isMyanmar ? 'စာကိုယ် ပုံစံ' : 'Body template'}</Label>
                  <Textarea
                    value={scheduleForm.bodyTemplate}
                    onChange={(event) => updateScheduleField('bodyTemplate', event.target.value)}
                    className="min-h-[180px]"
                    placeholder={isMyanmar ? '{{usage_line}} နှင့် {{server_health_line}} ကဲ့သို့ နေရာဖြည့်အမှတ်များကို အသုံးပြုပါ။' : 'Use placeholders like {{usage_line}} and {{server_health_line}}.'}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar
                      ? `လိုင်း နေရာဖြည့်အမှတ်များ - {{revenue_line}}, {{usage_line}}, {{expirations_line}}, {{failed_logins_line}}, {{server_health_line}}`
                      : 'Line placeholders: {{revenue_line}}, {{usage_line}}, {{expirations_line}}, {{failed_logins_line}}, {{server_health_line}}.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{isMyanmar ? 'ဝင်ငွေ' : 'Revenue'}</span>
                <Switch checked={scheduleForm.includeRevenue} onCheckedChange={(checked) => updateScheduleField('includeRevenue', checked)} />
              </label>
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{isMyanmar ? 'အသုံးပြုမှု' : 'Usage'}</span>
                <Switch checked={scheduleForm.includeUsage} onCheckedChange={(checked) => updateScheduleField('includeUsage', checked)} />
              </label>
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{isMyanmar ? 'သက်တမ်းကုန်မှု' : 'Expirations'}</span>
                <Switch checked={scheduleForm.includeExpirations} onCheckedChange={(checked) => updateScheduleField('includeExpirations', checked)} />
              </label>
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{isMyanmar ? 'ဝင်ရောက်မှု မအောင်မြင်ခြင်း' : 'Failed logins'}</span>
                <Switch checked={scheduleForm.includeFailedLogins} onCheckedChange={(checked) => updateScheduleField('includeFailedLogins', checked)} />
              </label>
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{isMyanmar ? 'ဆာဗာ ကျန်းမာရေး' : 'Server health'}</span>
                <Switch checked={scheduleForm.includeServerHealth} onCheckedChange={(checked) => updateScheduleField('includeServerHealth', checked)} />
              </label>
            </div>

            <div className="ops-detail-card flex flex-col gap-3 border-dashed sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                <p>{isMyanmar ? 'နောက်ဆုံး လည်ပတ်ချိန်:' : 'Last run:'} {scheduleForm.lastRunAt ? formatDateTime(scheduleForm.lastRunAt) : isMyanmar ? 'မလုပ်ရသေးပါ' : 'Never'}</p>
                <p>{isMyanmar ? 'လည်ပတ်မှု အခြေအနေ:' : 'Status:'} {getRunStatusLabel(scheduleForm.lastRunStatus, isMyanmar)}</p>
                {scheduleForm.lastRunSummary ? <p>{scheduleForm.lastRunSummary}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => runScheduledNowMutation.mutate()}
                  disabled={runScheduledNowMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {isMyanmar ? 'ယခုပင် လည်ပတ်မည်' : 'Run now'}
                </Button>
                <Button
                  onClick={() => saveScheduleMutation.mutate(scheduleForm)}
                  disabled={saveScheduleMutation.isPending}
                >
                  {saveScheduleMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {isMyanmar ? 'အချိန်ဇယားကို သိမ်းမည်' : 'Save schedule'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="ops-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            {isMyanmar ? 'အချိန်ဇယား လည်ပတ်မှု မှတ်တမ်း' : 'Scheduled Run History'}
          </CardTitle>
          <CardDescription>
            {isMyanmar ? 'နေ့စဉ် သို့မဟုတ် အပတ်စဉ် အနှစ်ချုပ် လည်ပတ်မှုများ၏ လမ်းကြောင်းအလိုက် ပေးပို့မှု အခြေအနေ။' : 'Recent daily or weekly summary runs with per-channel delivery status.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scheduledRunsQuery.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : scheduledRunsQuery.data?.items.length ? (
            <div className="space-y-4">
              {scheduledRunsQuery.data.items.map((run) => (
                <div key={run.id} className="ops-detail-card">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {getFrequencyLabel(run.frequency, isMyanmar)}
                        </Badge>
                        <Badge
                          variant={
                            run.status === 'SUCCESS'
                              ? 'default'
                              : run.status === 'FAILED'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {getRunStatusLabel(run.status, isMyanmar)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(run.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatPeriod(run.periodStart, run.periodEnd, isMyanmar)}
                      </p>
                    <p className="text-sm">{run.summaryMessage || (isMyanmar ? 'အနှစ်ချုပ် စာကို မသိမ်းထားပါ။' : 'No summary message stored.')}</p>
                      {run.error ? <p className="text-sm text-destructive">{run.error}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {run.report ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(withBasePath(`/api/reports/download?id=${run.report?.id}&format=csv`), '_blank')}
                          >
                            CSV
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(withBasePath(`/api/reports/download?id=${run.report?.id}&format=pdf`), '_blank')}
                          >
                            PDF
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {run.deliveries.length === 0 ? (
                      <div className="ops-row-card border-dashed text-sm text-muted-foreground">
                        {isMyanmar ? 'ဤလည်ပတ်မှုအတွက် လမ်းကြောင်း ပေးပို့မှု မှတ်တမ်း မရှိပါ။' : 'No channel deliveries were recorded for this run.'}
                      </div>
                    ) : (
                      run.deliveries.map((delivery) => (
                        <div key={delivery.id} className="ops-row-card">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{delivery.channelName}</p>
                              <p className="text-xs text-muted-foreground">{getChannelTypeLabel(delivery.channelType, isMyanmar)}</p>
                            </div>
                            <Badge
                              variant={
                                delivery.status === 'SUCCESS'
                                  ? 'default'
                                  : delivery.status === 'FAILED'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {getRunStatusLabel(delivery.status, isMyanmar)}
                            </Badge>
                          </div>
                          {delivery.lastError ? (
                            <p className="mt-2 text-xs text-destructive">{delivery.lastError}</p>
                          ) : null}
                          {delivery.deliveredAt ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {formatDateTime(delivery.deliveredAt)}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ops-support-card border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              {isMyanmar ? 'အချိန်ဇယား လည်ပတ်မှု မှတ်တမ်း မရှိသေးပါ။' : 'No scheduled report runs recorded yet.'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="ops-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {isMyanmar ? 'ဖန်တီးထားသော အစီရင်ခံစာများ' : 'Generated Reports'}
          </CardTitle>
          <CardDescription>
            {isMyanmar ? 'အသုံးပြုမှု အစီရင်ခံစာများကို ကြည့်ရှု၊ ထုတ်ယူ သို့မဟုတ် ဖျက်နိုင်သည်။' : 'View, download, or delete your usage reports.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : data && data.reports.length > 0 ? (
            <>
              <div className="space-y-3 md:hidden">
                {data.reports.map((report) => (
                  <div key={report.id} className="ops-row-card space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{report.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatPeriod(report.periodStart, report.periodEnd, isMyanmar)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          report.status === 'READY'
                            ? 'default'
                            : report.status === 'GENERATING'
                              ? 'secondary'
                              : 'destructive'
                        }
                        className="text-xs"
                      >
                        {getReportStatusLabel(report.status, isMyanmar)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'အမျိုးအစား' : 'Type'}</p>
                        <p className="mt-1 text-sm font-medium">{getReportTypeLabel(report.type, isMyanmar)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'သော့များ' : 'Keys'}</p>
                        <p className="mt-1 text-sm font-medium">{report.totalKeys}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'အသုံးပြုမှု' : 'Usage'}</p>
                        <p className="mt-1 text-sm font-medium">{formatBytes(BigInt(report.totalBytesUsed))}</p>
                      </div>
                    </div>
                    <div className="ops-mobile-action-bar grid-cols-2 sm:grid-cols-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setViewReportId(report.id);
                          setViewDialogOpen(true);
                        }}
                        disabled={report.status !== 'READY'}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {isMyanmar ? 'ကြည့်မည်' : 'View'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.open(withBasePath(`/api/reports/download?id=${report.id}&format=csv`), '_blank')}
                        disabled={report.status !== 'READY'}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        CSV
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.open(withBasePath(`/api/reports/download?id=${report.id}&format=pdf`), '_blank')}
                        disabled={report.status !== 'READY'}
                      >
                        <FileDown className="mr-2 h-4 w-4" />
                        PDF
                      </Button>
                      <Button
                        variant="outline"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(isMyanmar ? 'ဤအစီရင်ခံစာကို ဖျက်လိုပါသလား။' : 'Delete this report?')) {
                            deleteMutation.mutate({ id: report.id });
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isMyanmar ? 'ဖျက်မည်' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ops-data-shell hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isMyanmar ? 'အစီရင်ခံစာ အမည်' : 'Report Name'}</TableHead>
                      <TableHead>{isMyanmar ? 'အမျိုးအစား' : 'Type'}</TableHead>
                      <TableHead>{isMyanmar ? 'ကာလ' : 'Period'}</TableHead>
                      <TableHead className="text-center">{isMyanmar ? 'ဆာဗာများ' : 'Servers'}</TableHead>
                      <TableHead className="text-center">{isMyanmar ? 'သော့များ' : 'Keys'}</TableHead>
                      <TableHead className="text-right">{isMyanmar ? 'စုစုပေါင်း အသုံးပြုမှု' : 'Total Usage'}</TableHead>
                      <TableHead>{isMyanmar ? 'အခြေအနေ' : 'Status'}</TableHead>
                      <TableHead className="text-right">{isMyanmar ? 'လုပ်ဆောင်ချက်များ' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium">
                          {report.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getReportTypeLabel(report.type, isMyanmar)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatPeriod(report.periodStart, report.periodEnd, isMyanmar)}
                        </TableCell>
                        <TableCell className="text-center">{report.totalServers}</TableCell>
                        <TableCell className="text-center">{report.totalKeys}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatBytes(BigInt(report.totalBytesUsed))}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              report.status === 'READY'
                                ? 'default'
                                : report.status === 'GENERATING'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="text-xs"
                          >
                            {report.status === 'READY'
                              ? (isMyanmar ? '✓ အသင့်ဖြစ်နေသည်' : '✓ Ready')
                              : getReportStatusLabel(report.status, isMyanmar)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setViewReportId(report.id);
                                setViewDialogOpen(true);
                              }}
                              disabled={report.status !== 'READY'}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                window.open(
                                  withBasePath(`/api/reports/download?id=${report.id}&format=csv`),
                                  '_blank'
                                )
                              }
                              disabled={report.status !== 'READY'}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                window.open(
                                  withBasePath(`/api/reports/download?id=${report.id}&format=pdf`),
                                  '_blank'
                                )
                              }
                              disabled={report.status !== 'READY'}
                            >
                              <FileDown className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(isMyanmar ? 'ဤအစီရင်ခံစာကို ဖျက်လိုပါသလား။' : 'Delete this report?')) {
                                  deleteMutation.mutate({ id: report.id });
                                }
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="ops-table-toolbar mt-4 rounded-none border-x-0 border-b-0 px-0 pt-4">
                  <p className="text-sm text-muted-foreground">
                    {isMyanmar
                      ? `စာမျက်နှာ ${data.page} / ${data.totalPages} (${data.total} အစီရင်ခံစာ)`
                      : `Page ${data.page} of ${data.totalPages} (${data.total} reports)`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                      disabled={page >= data.totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">{isMyanmar ? 'အစီရင်ခံစာ မရှိသေးပါ' : 'No reports yet'}</h3>
              <p className="text-sm mb-6">
                {isMyanmar
                  ? 'ဆာဗာနှင့် သော့အားလုံး၏ လမ်းကြောင်းဒေတာကို ကြည့်ရန် ပထမဆုံး အသုံးပြုမှု အစီရင်ခံစာကို ဖန်တီးပါ။'
                  : 'Generate your first usage report to see traffic data across all servers and keys.'}
              </p>
              <Button onClick={() => setGenerateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {isMyanmar ? 'အစီရင်ခံစာ ဖန်တီးမည်' : 'Generate Report'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Report Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              {isMyanmar ? 'အသုံးပြုမှု အစီရင်ခံစာ ဖန်တီးမည်' : 'Generate Usage Report'}
            </DialogTitle>
            <DialogDescription>
              {isMyanmar
                ? 'ဆာဗာနှင့် သော့အားလုံး၏ စုစည်းထားသော traffic ဒေတာဖြင့် အစီရင်ခံစာအသစ်ကို ဖန်တီးပါ။'
                : 'Create a new report with aggregated traffic data for all servers and keys.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'အစီရင်ခံကာလ' : 'Report window'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar
                    ? 'လစဉ် အပြည့်အစုံ summary သို့မဟုတ် လှည့်ပတ်သော အပတ်စဉ် snapshot ကို ဖန်တီးမည်ကို ရွေးပါ။'
                    : 'Choose whether to generate a full monthly summary or a rolling weekly snapshot.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{isMyanmar ? 'အစီရင်ခံစာ အမျိုးအစား' : 'Report type'}</Label>
                  <Select
                    value={reportType}
                    onValueChange={(v) => setReportType(v as 'MONTHLY' | 'WEEKLY')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">{isMyanmar ? 'လစဉ် အစီရင်ခံစာ' : 'Monthly report'}</SelectItem>
                      <SelectItem value="WEEKLY">{isMyanmar ? 'အပတ်စဉ် အစီရင်ခံစာ (နောက်ဆုံး ၇ ရက်)' : 'Weekly report (last 7 days)'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {reportType === 'MONTHLY' && (
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'လကို ရွေးပါ' : 'Select month'}</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMonths.map((m, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {isMyanmar ? 'ရွေးထားသော လအပြည့်ကို ဖုံးလွှမ်းသည့် အစီရင်ခံစာကို ဖန်တီးမည်။' : 'Generates a report covering the entire selected month.'}
                    </p>
                  </div>
                )}

                {reportType === 'WEEKLY' && (
                  <div className="ops-modal-note">
                    {isMyanmar ? 'ယနေ့အပါအဝင် နောက်ဆုံး ၇ ရက်အတွက် အစီရင်ခံစာကို ဖန်တီးမည်။' : 'This generates a report for the last 7 days, including today.'}
                  </div>
                )}
              </div>
            </DialogSection>
          </DialogBody>

          <DialogFooter className="ops-modal-sticky-footer">
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {isMyanmar ? 'အစီရင်ခံစာ ဖန်တီးမည်' : 'Generate Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Detail Dialog */}
      <ReportDetailDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        reportId={viewReportId}
      />
    </div>
  );
}
