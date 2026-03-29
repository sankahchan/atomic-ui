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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
function formatPeriod(start: Date, end: Date): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/**
 * Get available months for report generation (last 12 months)
 */
function getAvailableMonths(): Array<{ label: string; year: number; month: number }> {
  const months: Array<{ label: string; year: number; month: number }> = [];
  const now = new Date();

  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
  }

  return months;
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
  const { data: report, isLoading } = trpc.reports.getById.useQuery(
    { id: reportId! },
    { enabled: !!reportId && open }
  );

  if (!reportId) return null;

  const isScheduledSummary = report?.reportData?.kind === 'scheduled-summary';
  const usageSummary = isScheduledSummary ? report?.reportData?.usage?.summary : report?.reportData?.summary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {report?.name || 'Loading...'}
          </DialogTitle>
          <DialogDescription>
            {report ? formatPeriod(report.periodStart, report.periodEnd) : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : report?.reportData ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Servers</p>
                  </div>
                  <p className="text-xl font-bold">{usageSummary?.totalServers ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Key className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Total Keys</p>
                  </div>
                  <p className="text-xl font-bold">{usageSummary?.totalKeys ?? 0}</p>
                  <p className="text-xs text-muted-foreground">
                    {usageSummary?.activeKeys ?? 0} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Total Usage</p>
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
                    <p className="text-xs text-muted-foreground">Period Delta</p>
                  </div>
                  <p className="text-xl font-bold">
                    {formatBytes(BigInt(usageSummary?.totalDeltaBytes ?? 0))}
                  </p>
                </CardContent>
              </Card>
            </div>

            {isScheduledSummary ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Scheduled summary snapshot</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Revenue</p>
                    <p className="mt-2 text-lg font-semibold">
                      {report.reportData.summary.revenueAmount != null
                        ? `${report.reportData.summary.revenueAmount} ${report.reportData.summary.revenueCurrency ?? 'USD'}`
                        : 'Not configured'}
                    </p>
                  </div>
                  <div className="rounded-xl border px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Failed logins</p>
                    <p className="mt-2 text-lg font-semibold">{report.reportData.summary.failedLogins ?? 0}</p>
                  </div>
                  <div className="rounded-xl border px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Expiring soon</p>
                    <p className="mt-2 text-lg font-semibold">{report.reportData.summary.expiringSoon ?? 0}</p>
                  </div>
                  <div className="rounded-xl border px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Server health</p>
                    <p className="mt-2 text-lg font-semibold">
                      {(report.reportData.summary.serverHealth?.up ?? 0)} up / {(report.reportData.summary.serverHealth?.down ?? 0)} down
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Top Consumers */}
            {!isScheduledSummary && report.reportData.topConsumers?.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Top 10 Consumers</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Key Name</TableHead>
                        <TableHead>Server</TableHead>
                        <TableHead className="text-right">Usage</TableHead>
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
                      <Badge variant="secondary">{server.activeKeys}/{server.totalKeys} keys</Badge>
                      <Badge variant="outline">{formatBytes(BigInt(server.totalUsedBytes))}</Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}

            {/* Download Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => window.open(withBasePath(`/api/reports/download?id=${reportId}&format=csv`), '_blank')}
              >
                <Download className="w-4 h-4 mr-2" />
                Download CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(withBasePath(`/api/reports/download?id=${reportId}&format=json`), '_blank')}
              >
                <FileJson className="w-4 h-4 mr-2" />
                Download JSON
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(withBasePath(`/api/reports/download?id=${reportId}&format=pdf`), '_blank')}
              >
                <FileDown className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground py-8 text-center">No report data available.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Main Reports Page
 */
export default function ReportsPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [reportType, setReportType] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY');
  const [selectedMonth, setSelectedMonth] = useState('0'); // Index into availableMonths
  const [viewReportId, setViewReportId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduledReportsConfig | null>(null);

  const availableMonths = getAvailableMonths();

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
        title: 'Report generated',
        description: `"${result.name}" has been generated successfully.`,
      });
      setGenerateOpen(false);
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Generation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = trpc.reports.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Report deleted',
        description: 'The report has been deleted.',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const saveScheduleMutation = trpc.reports.saveScheduledConfig.useMutation({
    onSuccess: (result) => {
      setScheduleForm(result);
      toast({
        title: 'Schedule updated',
        description: 'Scheduled report delivery settings have been saved.',
      });
      void scheduleQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Schedule update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runScheduledNowMutation = trpc.reports.runScheduledNow.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.skipped ? 'Run skipped' : 'Scheduled summary queued',
        description: result.skipped
          ? `Reason: ${result.reason}`
          : `${result.reportName} has been queued for delivery.`,
      });
      void refetch();
      void scheduleQuery.refetch();
      void scheduledRunsQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Run failed',
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
        <div className="ops-showcase-grid">
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
                Generate exportable usage snapshots, schedule daily or weekly operational summaries, and review delivery history from one reporting surface.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:max-w-4xl">
              <div className="ops-support-card">
                <p className="text-sm font-semibold">Total reports</p>
                <p className="mt-2 text-2xl font-semibold">{data?.total ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Stored report runs ready for export.</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">Latest period usage</p>
                <p className="mt-2 text-2xl font-semibold">
                  {data?.reports[0] ? formatBytes(BigInt(data.reports[0].totalDeltaBytes)) : '0 B'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Most recent generated period delta.</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">Last summary run</p>
                <p className="mt-2 text-sm font-semibold">
                  {scheduleForm?.lastRunAt ? formatDateTime(scheduleForm.lastRunAt) : 'Never'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scheduleForm?.lastRunStatus ?? 'No scheduled run recorded yet.'}
                </p>
              </div>
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Report actions</p>
                <h2 className="text-xl font-semibold">Generate and deliver</h2>
                <p className="text-sm text-muted-foreground">
                  Create on-demand reports or hand scheduled summaries off to channels without leaving this page.
                </p>
              </div>
              <Button className="h-12 w-full rounded-full" onClick={() => setGenerateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full rounded-full border-border/70 bg-background/70 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]"
                onClick={() => runScheduledNowMutation.mutate()}
                disabled={runScheduledNowMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                Run scheduled summary
              </Button>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Delivery pulse</p>
                <h2 className="text-xl font-semibold">Schedule state</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="ops-row-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Enabled</p>
                  <p className="mt-2 text-xl font-semibold">{scheduleForm?.enabled ? 'Active' : 'Paused'}</p>
                </div>
                <div className="ops-row-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Configured channels</p>
                  <p className="mt-2 text-xl font-semibold">{scheduleForm?.channelIds.length ?? 0}</p>
                </div>
                <div className="ops-row-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Frequency</p>
                  <p className="mt-2 text-xl font-semibold">{scheduleForm?.frequency ?? 'DAILY'}</p>
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
              Scheduled Reports
            </CardTitle>
            <CardDescription>
              Deliver daily or weekly report summaries to email or webhook channels without generating them manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="ops-detail-card space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-base">Enable automatic summaries</Label>
                    <p className="text-sm text-muted-foreground">
                      Queue a summary report on the schedule below.
                    </p>
                  </div>
                  <Switch
                    checked={scheduleForm.enabled}
                    onCheckedChange={(checked) => updateScheduleField('enabled', checked)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select
                      value={scheduleForm.frequency}
                      onValueChange={(value) => updateScheduleField('frequency', value as ScheduledReportsConfig['frequency'])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAILY">Daily</SelectItem>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Lookback window (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={scheduleForm.lookbackDays}
                      onChange={(event) => updateScheduleField('lookbackDays', Math.max(1, Math.min(31, Number(event.target.value) || 7)))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Hour</Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={scheduleForm.hour}
                      onChange={(event) => updateScheduleField('hour', Math.max(0, Math.min(23, Number(event.target.value) || 0)))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Minute</Label>
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
                    <Label>Weekday</Label>
                    <Select
                      value={String(scheduleForm.weekday)}
                      onValueChange={(value) => updateScheduleField('weekday', Number(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Sunday</SelectItem>
                        <SelectItem value="1">Monday</SelectItem>
                        <SelectItem value="2">Tuesday</SelectItem>
                        <SelectItem value="3">Wednesday</SelectItem>
                        <SelectItem value="4">Thursday</SelectItem>
                        <SelectItem value="5">Friday</SelectItem>
                        <SelectItem value="6">Saturday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div className="ops-detail-card space-y-4">
                <div>
                  <Label className="text-base">Delivery channels</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose where scheduled summaries should be sent.
                  </p>
                </div>
                <div className="space-y-2">
                  {availableChannels.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Create an email or webhook channel in Notifications before enabling scheduled delivery.
                    </p>
                  ) : (
                    availableChannels.map((channel) => (
                      <label
                        key={channel.id}
                        className="ops-row-card flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="font-medium">{channel.name}</p>
                          <p className="text-xs text-muted-foreground">{channel.type}</p>
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
                    <Label>Revenue amount (optional)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={scheduleForm.revenueAmount ?? ''}
                      placeholder="Leave blank if billing is not tracked"
                      onChange={(event) =>
                        updateScheduleField(
                          'revenueAmount',
                          event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Input
                      value={scheduleForm.revenueCurrency}
                      onChange={(event) => updateScheduleField('revenueCurrency', event.target.value.toUpperCase().slice(0, 8) || 'USD')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Subject template</Label>
                  <Input
                    value={scheduleForm.subjectTemplate}
                    onChange={(event) => updateScheduleField('subjectTemplate', event.target.value)}
                    placeholder="Atomic-UI {{frequency_label}} Summary"
                  />
                  <p className="text-xs text-muted-foreground">
                    Available placeholders: {'{{frequency_label}}'}, {'{{generated_at}}'}, {'{{period_start}}'}, {'{{period_end}}'}.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Body template</Label>
                  <Textarea
                    value={scheduleForm.bodyTemplate}
                    onChange={(event) => updateScheduleField('bodyTemplate', event.target.value)}
                    className="min-h-[180px]"
                    placeholder="Use placeholders like {{usage_line}} and {{server_health_line}}."
                  />
                  <p className="text-xs text-muted-foreground">
                    Line placeholders: {'{{revenue_line}}'}, {'{{usage_line}}'}, {'{{expirations_line}}'}, {'{{failed_logins_line}}'}, {'{{server_health_line}}'}.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Revenue</span>
                <Switch checked={scheduleForm.includeRevenue} onCheckedChange={(checked) => updateScheduleField('includeRevenue', checked)} />
              </label>
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Usage</span>
                <Switch checked={scheduleForm.includeUsage} onCheckedChange={(checked) => updateScheduleField('includeUsage', checked)} />
              </label>
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Expirations</span>
                <Switch checked={scheduleForm.includeExpirations} onCheckedChange={(checked) => updateScheduleField('includeExpirations', checked)} />
              </label>
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Failed logins</span>
                <Switch checked={scheduleForm.includeFailedLogins} onCheckedChange={(checked) => updateScheduleField('includeFailedLogins', checked)} />
              </label>
              <label className="ops-row-card flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Server health</span>
                <Switch checked={scheduleForm.includeServerHealth} onCheckedChange={(checked) => updateScheduleField('includeServerHealth', checked)} />
              </label>
            </div>

            <div className="ops-detail-card flex flex-col gap-3 border-dashed sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                <p>Last run: {scheduleForm.lastRunAt ? formatDateTime(scheduleForm.lastRunAt) : 'Never'}</p>
                <p>Status: {scheduleForm.lastRunStatus}</p>
                {scheduleForm.lastRunSummary ? <p>{scheduleForm.lastRunSummary}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => runScheduledNowMutation.mutate()}
                  disabled={runScheduledNowMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Run now
                </Button>
                <Button
                  onClick={() => saveScheduleMutation.mutate(scheduleForm)}
                  disabled={saveScheduleMutation.isPending}
                >
                  {saveScheduleMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save schedule
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
            Scheduled Run History
          </CardTitle>
          <CardDescription>
            Recent daily or weekly summary runs with per-channel delivery status.
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
                        <Badge variant="outline">{run.frequency}</Badge>
                        <Badge
                          variant={
                            run.status === 'SUCCESS'
                              ? 'default'
                              : run.status === 'FAILED'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {run.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(run.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatPeriod(run.periodStart, run.periodEnd)}
                      </p>
                      <p className="text-sm">{run.summaryMessage || 'No summary message stored.'}</p>
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
                        No channel deliveries were recorded for this run.
                      </div>
                    ) : (
                      run.deliveries.map((delivery) => (
                        <div key={delivery.id} className="ops-row-card">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{delivery.channelName}</p>
                              <p className="text-xs text-muted-foreground">{delivery.channelType}</p>
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
                              {delivery.status}
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
              No scheduled report runs recorded yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="ops-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Generated Reports
          </CardTitle>
          <CardDescription>
            View, download, or delete your usage reports.
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
                          {formatPeriod(report.periodStart, report.periodEnd)}
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
                        {report.status === 'READY' ? 'READY' : report.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Type</p>
                        <p className="mt-1 text-sm font-medium">{report.type}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Keys</p>
                        <p className="mt-1 text-sm font-medium">{report.totalKeys}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Usage</p>
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
                        View
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
                          if (confirm('Delete this report?')) {
                            deleteMutation.mutate({ id: report.id });
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ops-data-shell hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-center">Servers</TableHead>
                      <TableHead className="text-center">Keys</TableHead>
                      <TableHead className="text-right">Total Usage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                            {report.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatPeriod(report.periodStart, report.periodEnd)}
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
                            {report.status === 'READY' ? '✓ Ready' : report.status}
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
                                if (confirm('Delete this report?')) {
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
                    Page {data.page} of {data.totalPages} ({data.total} reports)
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
              <h3 className="text-lg font-medium mb-2">No reports yet</h3>
              <p className="text-sm mb-6">
                Generate your first usage report to see traffic data across all servers and keys.
              </p>
              <Button onClick={() => setGenerateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Generate Report
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Report Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Generate Usage Report
            </DialogTitle>
            <DialogDescription>
              Create a new report with aggregated traffic data for all servers and keys.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Report Type */}
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select
                value={reportType}
                onValueChange={(v) => setReportType(v as 'MONTHLY' | 'WEEKLY')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly Report</SelectItem>
                  <SelectItem value="WEEKLY">Weekly Report (Last 7 Days)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Month Selector (only for monthly) */}
            {reportType === 'MONTHLY' && (
              <div className="space-y-2">
                <Label>Select Month</Label>
                <Select
                  value={selectedMonth}
                  onValueChange={setSelectedMonth}
                >
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
                  Generates a report covering the entire selected month.
                </p>
              </div>
            )}

            {reportType === 'WEEKLY' && (
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                This will generate a report for the last 7 days, including today.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Generate Report
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
