'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MobileCardView } from '@/components/mobile-card-view';
import { useLocale } from '@/hooks/use-locale';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDateTime } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Loader2,
  ScrollText,
  Shield,
  User as UserIcon,
} from 'lucide-react';

type AuditLogItem = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: Date | string;
};

const ENTITY_OPTIONS = ['ALL', 'SERVER', 'BACKUP', 'USER', 'REPORT', 'TASK', 'AUDIT_LOG', 'NOTIFICATION_CHANNEL'] as const;
const PAGE_SIZE_OPTIONS = ['10', '20', '50'] as const;

function prettifyLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getEntityBadgeClass(entity: string) {
  switch (entity) {
    case 'SERVER':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    case 'BACKUP':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'USER':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'REPORT':
      return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
    case 'TASK':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    case 'AUDIT_LOG':
      return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'NOTIFICATION_CHANNEL':
      return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function parseDateInput(value: string, endOfDay = false) {
  if (!value) return undefined;

  const [year, month, day] = value.split('-').map(Number);
  if ([year, month, day].some((part) => Number.isNaN(part))) {
    return undefined;
  }

  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function isRenderableAuditDetailValue(value: unknown) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    (Array.isArray(value) && value.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry) || entry === null))
  );
}

function formatAuditDetailValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(', ');
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (value === null) {
    return 'null';
  }

  return String(value);
}

function AuditDetailDialog({
  log,
  open,
  onOpenChange,
}: {
  log: AuditLogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!log) return null;

  const detailJson = log.details ? JSON.stringify(log.details, null, 2) : null;
  const detailEntries = log.details
    ? Object.entries(log.details).filter(([, value]) => isRenderableAuditDetailValue(value))
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            {prettifyLabel(log.action)}
          </DialogTitle>
          <DialogDescription>
            {formatDateTime(log.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Action</p>
                <p className="mt-1 break-words font-medium">{log.action}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Entity</p>
                <Badge className={cn('border', getEntityBadgeClass(log.entity))}>
                  {log.entity}
                </Badge>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Entity ID</p>
                <p className="mt-1 break-all font-mono text-xs">{log.entityId || '-'}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Timestamp</p>
                <p className="mt-1">{formatDateTime(log.createdAt)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Actor</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">User</p>
                <p className="mt-1 break-all">{log.userEmail || log.userId || 'System'}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">User ID</p>
                <p className="mt-1 break-all font-mono text-xs">{log.userId || '-'}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IP</p>
                <p className="mt-1 break-all font-mono text-xs">{log.ip || '-'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailEntries.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {detailEntries.map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {prettifyLabel(key)}
                    </p>
                    <p className="mt-1 break-words text-sm">{formatAuditDetailValue(value)}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {detailJson ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Raw Details</p>
                <pre className="rounded-lg bg-muted/40 p-4 text-xs overflow-x-auto whitespace-pre-wrap break-words">
                  {detailJson}
                </pre>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground text-center">
                No structured details recorded for this action.
              </div>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

export default function AuditPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState<(typeof ENTITY_OPTIONS)[number]>('ALL');
  const [userFilter, setUserFilter] = useState('ALL');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const dateFrom = useMemo(() => parseDateInput(dateFromFilter), [dateFromFilter]);
  const dateTo = useMemo(() => parseDateInput(dateToFilter, true), [dateToFilter]);
  const hasInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const auditQueryInput = useMemo(
    () => ({
      page,
      pageSize,
      action: actionFilter.trim() || undefined,
      entity: entityFilter === 'ALL' ? undefined : entityFilter,
      userId: userFilter === 'ALL' ? undefined : userFilter,
      dateFrom,
      dateTo,
    }),
    [actionFilter, dateFrom, dateTo, entityFilter, page, pageSize, userFilter],
  );

  const auditExportQueryInput = useMemo(
    () => ({
      action: actionFilter.trim() || undefined,
      entity: entityFilter === 'ALL' ? undefined : entityFilter,
      userId: userFilter === 'ALL' ? undefined : userFilter,
      dateFrom,
      dateTo,
    }),
    [actionFilter, dateFrom, dateTo, entityFilter, userFilter],
  );

  const { data: auditLogs, isLoading } = trpc.audit.list.useQuery(auditQueryInput, {
    refetchOnWindowFocus: false,
    enabled: !hasInvalidDateRange,
  });
  const { data: users } = trpc.users.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { refetch: fetchAuditCsv, isFetching: isExportingCsv } = trpc.audit.exportCsv.useQuery(
    auditExportQueryInput,
    {
      enabled: false,
      retry: false,
    },
  );

  const handleActionChange = (value: string) => {
    setPage(1);
    setActionFilter(value);
  };

  const handleEntityChange = (value: (typeof ENTITY_OPTIONS)[number]) => {
    setPage(1);
    setEntityFilter(value);
  };

  const handleUserChange = (value: string) => {
    setPage(1);
    setUserFilter(value);
  };

  const handleDateFromChange = (value: string) => {
    setPage(1);
    setDateFromFilter(value);
  };

  const handleDateToChange = (value: string) => {
    setPage(1);
    setDateToFilter(value);
  };

  const handlePageSizeChange = (value: string) => {
    setPage(1);
    setPageSize(parseInt(value, 10));
  };

  const handleExportCsv = async () => {
    if (hasInvalidDateRange) {
      toast({
        title: 'Export failed',
        description: 'Choose a valid date range before exporting.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await fetchAuditCsv();

      if (result.error) {
        throw result.error;
      }

      if (!result.data) {
        throw new Error('No CSV export data was returned.');
      }

      downloadFile(`\uFEFF${result.data.data}`, result.data.filename, 'text/csv;charset=utf-8;');
      toast({
        title: 'Export complete',
        description: 'Audit log exported as CSV.',
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to export audit log.',
        variant: 'destructive',
      });
    }
  };

  const clearFilters = () => {
    setPage(1);
    setActionFilter('');
    setEntityFilter('ALL');
    setUserFilter('ALL');
    setDateFromFilter('');
    setDateToFilter('');
  };

  const currentItems = hasInvalidDateRange ? [] : auditLogs?.items ?? [];
  const totalEntries = hasInvalidDateRange ? 0 : auditLogs?.total ?? 0;
  const totalPages = hasInvalidDateRange ? 1 : Math.max(1, auditLogs?.totalPages ?? 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <BackButton href="/dashboard" label={t('nav.dashboard')} />
          <h1 className="text-2xl font-bold tracking-tight">{t('nav.audit')}</h1>
          <p className="text-muted-foreground">
            Review recent administrative activity, investigate changes, and inspect structured action details.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:min-w-[360px]">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Entries</p>
              <p className="text-2xl font-bold">{totalEntries}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Current Page</p>
              <p className="text-2xl font-bold">{page}</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Visible Rows</p>
              <p className="text-2xl font-bold">{currentItems.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-4 h-4 text-primary" />
            Filters
          </CardTitle>
          <CardDescription>
            Narrow the audit stream by action, entity type, actor, or a specific date range.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2">
              <Label htmlFor="actionFilter">Action</Label>
              <Input
                id="actionFilter"
                placeholder="SERVER_SYNC, USER_DELETE..."
                value={actionFilter}
                onChange={(e) => handleActionChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Entity</Label>
              <Select value={entityFilter} onValueChange={handleEntityChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'ALL' ? 'All entities' : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Actor</Label>
              <Select value={userFilter} onValueChange={handleUserChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All actors</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFromFilter">From</Label>
              <Input
                id="dateFromFilter"
                type="date"
                value={dateFromFilter}
                onChange={(e) => handleDateFromChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateToFilter">To</Label>
              <Input
                id="dateToFilter"
                type="date"
                value={dateToFilter}
                onChange={(e) => handleDateToChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Rows Per Page</Label>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option} rows
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4" />
                <span>Every recorded admin action is stored with timestamp, actor, and optional structured metadata.</span>
              </div>
              {hasInvalidDateRange ? (
                <p className="text-sm text-destructive">The start date must be on or before the end date.</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
              <Button size="sm" onClick={handleExportCsv} disabled={hasInvalidDateRange || isExportingCsv}>
                {isExportingCsv ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="hidden md:block rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hasInvalidDateRange ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Choose a valid date range to load audit log entries.
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading audit logs...
                  </div>
                </TableCell>
              </TableRow>
            ) : currentItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No audit log entries match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              currentItems.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{formatDateTime(log.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{prettifyLabel(log.action)}</div>
                    <div className="text-xs text-muted-foreground font-mono">{log.action}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('border', getEntityBadgeClass(log.entity))}>
                      {log.entity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="break-all">{log.userEmail || log.userId || 'System'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.ip || '-'}</TableCell>
                  <TableCell className="font-mono text-xs break-all">{log.entityId || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <MobileCardView
        data={currentItems}
        keyExtractor={(log) => log.id}
        emptyMessage={
          hasInvalidDateRange
            ? 'Choose a valid date range to load audit log entries.'
            : isLoading
              ? 'Loading audit logs...'
              : 'No audit log entries match the current filters.'
        }
        renderCard={(log) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{prettifyLabel(log.action)}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">{log.action}</p>
              </div>
              <Badge className={cn('border', getEntityBadgeClass(log.entity))}>
                {log.entity}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Time</p>
                <p className="mt-1 text-xs">{formatDateTime(log.createdAt)}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actor</p>
                <p className="mt-1 break-all text-xs">{log.userEmail || log.userId || 'System'}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Target</p>
                <p className="mt-1 break-all font-mono text-xs">{log.entityId || '-'}</p>
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedLog(log)}>
              <Eye className="w-4 h-4 mr-2" />
              View Details
            </Button>
          </div>
        )}
      />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      <AuditDetailDialog
        log={selectedLog}
        open={!!selectedLog}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLog(null);
          }
        }}
      />
    </div>
  );
}
