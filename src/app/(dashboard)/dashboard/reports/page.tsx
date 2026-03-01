'use client';

/**
 * Reports Page
 *
 * Allows admins to generate, view, and download monthly usage reports.
 * Reports include per-server and per-key traffic data with CSV export.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { formatBytes, cn } from '@/lib/utils';
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
  Server,
  Key,
  TrendingUp,
  Eye,
  FileJson,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

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
                  <p className="text-xl font-bold">{report.reportData.summary.totalServers}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Key className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Total Keys</p>
                  </div>
                  <p className="text-xl font-bold">{report.reportData.summary.totalKeys}</p>
                  <p className="text-xs text-muted-foreground">
                    {report.reportData.summary.activeKeys} active
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
                    {formatBytes(BigInt(report.reportData.summary.totalBytesUsed))}
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
                    {formatBytes(BigInt(report.reportData.summary.totalDeltaBytes))}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Top Consumers */}
            {report.reportData.topConsumers?.length > 0 && (
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
            {report.reportData.servers?.map((server: { serverId: string; serverName: string; location: string | null; totalKeys: number; activeKeys: number; totalUsedBytes: string; deltaBytes: string }) => (
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
                onClick={() => window.open(`/api/reports/download?id=${reportId}&format=csv`, '_blank')}
              >
                <Download className="w-4 h-4 mr-2" />
                Download CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(`/api/reports/download?id=${reportId}&format=json`, '_blank')}
              >
                <FileJson className="w-4 h-4 mr-2" />
                Download JSON
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

  const availableMonths = getAvailableMonths();

  // Fetch reports
  const { data, isLoading, refetch } = trpc.reports.list.useQuery({
    page,
    pageSize: 10,
  });

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <FileText className="w-7 h-7 text-primary" />
            {t('nav.reports')}
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate and download usage reports for your servers and keys.
          </p>
        </div>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Generate Report
        </Button>
      </div>

      {/* Summary Stats */}
      {data && data.reports.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Reports</p>
                  <p className="text-2xl font-bold">{data.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Calendar className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Latest Report</p>
                  <p className="text-lg font-semibold truncate max-w-[200px]">
                    {data.reports[0]?.name || 'None'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Latest Period Usage</p>
                  <p className="text-2xl font-bold">
                    {data.reports[0]
                      ? formatBytes(BigInt(data.reports[0].totalDeltaBytes))
                      : '0 B'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reports Table */}
      <Card>
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
                                `/api/reports/download?id=${report.id}&format=csv`,
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

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
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
