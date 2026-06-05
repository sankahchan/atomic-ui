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
  RENEWAL_AUDIT_ACTIONS,
  formatAuditAddedData,
  formatAuditBytes,
  formatAuditDateTimeValue,
  formatAuditMonths,
  formatAuditTransition,
  isRenewalAuditAction,
} from '@/lib/audit-log-format';
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

const ENTITY_OPTIONS = ['ALL', 'SERVER', 'BACKUP', 'USER', 'ACCESS_KEY', 'REPORT', 'TASK', 'AUDIT_LOG', 'NOTIFICATION_CHANNEL'] as const;
const PAGE_SIZE_OPTIONS = ['10', '20', '50'] as const;
type AuditActionPreset = 'ALL' | 'RENEWALS';

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
    case 'ACCESS_KEY':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
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

function getAuditActionLabel(action: string, t: (key: string) => string) {
  if (action === 'ACCESS_KEY_RENEWED') {
    return t('audit.renewal.single');
  }

  if (action === 'ACCESS_KEY_RENEWED_BULK') {
    return t('audit.renewal.bulk');
  }

  return prettifyLabel(action);
}

function formatAuditStatus(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? prettifyLabel(value) : fallback;
}

function getRenewalAuditSummary(log: AuditLogItem, t: (key: string) => string) {
  if (!isRenewalAuditAction(log.action) || !log.details) {
    return null;
  }

  const details = log.details;
  const summary = [
    formatAuditMonths(details.months),
    formatAuditAddedData(details.addedDataLimitGB, t('audit.renewal.no_data_added')),
  ];

  if (log.action === 'ACCESS_KEY_RENEWED_BULK' && details.batchSize) {
    summary.push(`${t('audit.renewal.batch')}: ${String(details.batchSize)}`);
  }

  return summary.filter((entry) => entry !== '-').join(' / ');
}

function RenewalDetailSummary({
  log,
}: {
  log: AuditLogItem;
}) {
  const { t } = useLocale();

  if (!isRenewalAuditAction(log.action) || !log.details) {
    return null;
  }

  const details = log.details;
  const unknown = t('audit.renewal.unknown');
  const unlimited = t('audit.renewal.unlimited');
  const items = [
    {
      label: t('audit.renewal.key'),
      value: typeof details.keyName === 'string' && details.keyName.trim() ? details.keyName : log.entityId || unknown,
    },
    {
      label: t('audit.renewal.extension'),
      value: formatAuditMonths(details.months, unknown),
    },
    {
      label: t('audit.renewal.data_added'),
      value: formatAuditAddedData(details.addedDataLimitGB, t('audit.renewal.no_data_added')),
    },
    {
      label: t('audit.renewal.expiry'),
      value: formatAuditTransition(
        details.previousExpiresAt,
        details.nextExpiresAt,
        (value) => formatAuditDateTimeValue(value, unknown),
      ),
    },
    {
      label: t('audit.renewal.quota'),
      value: formatAuditTransition(
        details.previousDataLimitBytes,
        details.nextDataLimitBytes,
        (value) => formatAuditBytes(value, unlimited),
      ),
    },
    {
      label: t('audit.renewal.status'),
      value: formatAuditTransition(
        details.previousStatus,
        details.nextStatus,
        (value) => formatAuditStatus(value, unknown),
      ),
    },
  ];

  if (log.action === 'ACCESS_KEY_RENEWED_BULK' && details.batchSize) {
    items.push({
      label: t('audit.renewal.batch'),
      value: String(details.batchSize),
    });
  }

  return (
    <div className="rounded-[1.1rem] border border-blue-500/20 bg-blue-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-blue-500" />
        <p className="text-sm font-semibold">{t('audit.renewal.summary')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-background/70 p-3 dark:bg-white/[0.03]">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-1 break-words text-sm font-medium">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
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
  const { t } = useLocale();

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
            {getAuditActionLabel(log.action, t)}
          </DialogTitle>
          <DialogDescription>
            {formatDateTime(log.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('audit.detail.metadata')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.detail.action')}</p>
                <p className="mt-1 break-words font-medium">{log.action}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.detail.entity')}</p>
                <Badge className={cn('border', getEntityBadgeClass(log.entity))}>
                  {log.entity}
                </Badge>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.detail.entity_id')}</p>
                <p className="mt-1 break-all font-mono text-xs">{log.entityId || '-'}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.detail.timestamp')}</p>
                <p className="mt-1">{formatDateTime(log.createdAt)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('audit.detail.actor')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.detail.user')}</p>
                <p className="mt-1 break-all">{log.userEmail || log.userId || t('audit.system')}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.detail.user_id')}</p>
                <p className="mt-1 break-all font-mono text-xs">{log.userId || '-'}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.detail.ip')}</p>
                <p className="mt-1 break-all font-mono text-xs">{log.ip || '-'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('audit.detail.details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RenewalDetailSummary log={log} />

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
                <p className="text-xs font-medium text-muted-foreground">{t('audit.detail.raw_details')}</p>
                <pre className="rounded-lg bg-muted/40 p-4 text-xs overflow-x-auto whitespace-pre-wrap break-words">
                  {detailJson}
                </pre>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground text-center">
                {t('audit.detail.no_structured_details')}
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
  const [actionPreset, setActionPreset] = useState<AuditActionPreset>('ALL');
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
      action: actionPreset === 'ALL' ? actionFilter.trim() || undefined : undefined,
      actions: actionPreset === 'RENEWALS' ? [...RENEWAL_AUDIT_ACTIONS] : undefined,
      entity: entityFilter === 'ALL' ? undefined : entityFilter,
      userId: userFilter === 'ALL' ? undefined : userFilter,
      dateFrom,
      dateTo,
    }),
    [actionFilter, actionPreset, dateFrom, dateTo, entityFilter, page, pageSize, userFilter],
  );

  const auditExportQueryInput = useMemo(
    () => ({
      action: actionPreset === 'ALL' ? actionFilter.trim() || undefined : undefined,
      actions: actionPreset === 'RENEWALS' ? [...RENEWAL_AUDIT_ACTIONS] : undefined,
      entity: entityFilter === 'ALL' ? undefined : entityFilter,
      userId: userFilter === 'ALL' ? undefined : userFilter,
      dateFrom,
      dateTo,
    }),
    [actionFilter, actionPreset, dateFrom, dateTo, entityFilter, userFilter],
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
    setActionPreset('ALL');
    setActionFilter(value);
  };

  const handleRenewalQuickFilter = () => {
    setPage(1);
    setActionFilter('');
    setActionPreset('RENEWALS');
    setEntityFilter('ACCESS_KEY');
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
        title: t('audit.export.failed'),
        description: t('audit.export.failed_invalid_range'),
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
        throw new Error(t('audit.export.no_data'));
      }

      downloadFile(`\uFEFF${result.data.data}`, result.data.filename, 'text/csv;charset=utf-8;');
      toast({
        title: t('audit.export.complete'),
        description: t('audit.export.complete_desc'),
      });
    } catch (error) {
      toast({
        title: t('audit.export.failed'),
        description: error instanceof Error ? error.message : t('audit.export.failed'),
        variant: 'destructive',
      });
    }
  };

  const clearFilters = () => {
    setPage(1);
    setActionFilter('');
    setActionPreset('ALL');
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
      <section className="ops-hero">
        <div className="grid gap-5">
          <div className="space-y-4">
            <BackButton href="/dashboard" label={t('nav.dashboard')} />
            <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
              <ScrollText className="h-3.5 w-3.5" />
              {t('nav.audit')}
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('nav.audit')}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t('audit.subtitle')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-1">
              <div className="ops-inline-stat">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('audit.summary.total_entries')}</p>
                <p className="mt-3 text-2xl font-semibold">{totalEntries}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('audit.summary.current_page')}</p>
                <p className="mt-3 text-2xl font-semibold">{page}</p>
              </div>
              <div className="ops-inline-stat col-span-2 md:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('audit.summary.visible_rows')}</p>
                <p className="mt-3 text-2xl font-semibold">{currentItems.length}</p>
              </div>
            </div>

            <Card className="hidden xl:block ops-detail-card">
              <CardContent className="flex gap-3 p-4">
                <Shield className="mt-0.5 h-5 w-5 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{t('audit.filters.title')}</p>
                  <p className="text-xs text-muted-foreground">{t('audit.filters.hint')}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Card className="ops-detail-card">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-4 h-4 text-primary" />
            {t('audit.filters.title')}
          </CardTitle>
          <CardDescription>
            {t('audit.filters.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="ops-table-toolbar grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2">
              <Label htmlFor="actionFilter">{t('audit.filters.action')}</Label>
              <Input
                id="actionFilter"
                placeholder={t('audit.filters.action_placeholder')}
                value={actionFilter}
                onChange={(e) => handleActionChange(e.target.value)}
                className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('audit.filters.entity')}</Label>
              <Select value={entityFilter} onValueChange={handleEntityChange}>
                <SelectTrigger className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'ALL' ? t('audit.filters.all_entities') : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('audit.filters.actor')}</Label>
              <Select value={userFilter} onValueChange={handleUserChange}>
                <SelectTrigger className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('audit.filters.all_actors')}</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFromFilter">{t('audit.filters.from')}</Label>
              <Input
                id="dateFromFilter"
                type="date"
                value={dateFromFilter}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateToFilter">{t('audit.filters.to')}</Label>
              <Input
                id="dateToFilter"
                type="date"
                value={dateToFilter}
                onChange={(e) => handleDateToChange(e.target.value)}
                className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('audit.filters.rows_per_page')}</Label>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option} {t('audit.filters.rows')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('audit.filters.quick')}
            </span>
            <Button
              type="button"
              variant={actionPreset === 'RENEWALS' ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={handleRenewalQuickFilter}
            >
              {t('audit.filters.quick_renewals')}
            </Button>
          </div>

          <div className="ops-table-meta flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4" />
                <span>{t('audit.filters.hint')}</span>
              </div>
              {hasInvalidDateRange ? (
                <p className="text-sm text-destructive">{t('audit.filters.invalid_range')}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={clearFilters}>
                {t('audit.filters.clear')}
              </Button>
              <Button size="sm" className="rounded-full" onClick={handleExportCsv} disabled={hasInvalidDateRange || isExportingCsv}>
                {isExportingCsv ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {t('audit.filters.export_csv')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="ops-data-shell hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('audit.table.time')}</TableHead>
              <TableHead>{t('audit.table.action')}</TableHead>
              <TableHead>{t('audit.table.entity')}</TableHead>
              <TableHead>{t('audit.table.actor')}</TableHead>
              <TableHead>{t('audit.table.ip')}</TableHead>
              <TableHead>{t('audit.table.target')}</TableHead>
              <TableHead className="text-right">{t('audit.table.details')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hasInvalidDateRange ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-10">
                  <div className="ops-chart-empty">{t('audit.empty.invalid_range')}</div>
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-10">
                  <div className="ops-chart-empty inline-flex min-h-[180px] items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('audit.empty.loading')}
                  </div>
                </TableCell>
              </TableRow>
            ) : currentItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-10">
                  <div className="ops-chart-empty">{t('audit.empty.no_match')}</div>
                </TableCell>
              </TableRow>
            ) : (
              currentItems.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{formatDateTime(log.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{getAuditActionLabel(log.action, t)}</div>
                    <div className="text-xs text-muted-foreground font-mono">{log.action}</div>
                    {getRenewalAuditSummary(log, t) ? (
                      <div className="mt-1 text-xs text-muted-foreground">{getRenewalAuditSummary(log, t)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('border', getEntityBadgeClass(log.entity))}>
                      {log.entity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="break-all">{log.userEmail || log.userId || t('audit.system')}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.ip || '-'}</TableCell>
                  <TableCell className="font-mono text-xs break-all">{log.entityId || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                      <Eye className="w-4 h-4 mr-2" />
                      {t('audit.actions.view')}
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
            ? t('audit.empty.invalid_range')
            : isLoading
              ? t('audit.empty.loading')
              : t('audit.empty.no_match')
        }
        renderCard={(log) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{getAuditActionLabel(log.action, t)}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">{log.action}</p>
                {getRenewalAuditSummary(log, t) ? (
                  <p className="mt-1 text-xs text-muted-foreground">{getRenewalAuditSummary(log, t)}</p>
                ) : null}
              </div>
              <Badge className={cn('border', getEntityBadgeClass(log.entity))}>
                {log.entity}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="ops-row-card">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.table.time')}</p>
                <p className="mt-1 text-xs">{formatDateTime(log.createdAt)}</p>
              </div>
              <div className="ops-row-card">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.table.actor')}</p>
                <p className="mt-1 break-all text-xs">{log.userEmail || log.userId || t('audit.system')}</p>
              </div>
              <div className="ops-row-card col-span-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('audit.table.target')}</p>
                <p className="mt-1 break-all font-mono text-xs">{log.entityId || '-'}</p>
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedLog(log)}>
              <Eye className="w-4 h-4 mr-2" />
              {t('audit.actions.view_details')}
            </Button>
          </div>
        )}
      />

      <div className="ops-table-toolbar flex items-center justify-between gap-4 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {formatTemplate(t('audit.pagination.page_of'), { page, total: totalPages })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {t('audit.pagination.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={page >= totalPages}
          >
            {t('audit.pagination.next')}
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
