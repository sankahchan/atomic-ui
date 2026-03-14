'use client';

/**
 * Archived Keys Page
 *
 * Displays expired, deleted, and depleted keys that are stored for 3 months
 * before permanent deletion. Supports filtering, export to CSV/Excel, and
 * permanent deletion.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MobileCardView } from '@/components/mobile-card-view';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SurfaceSkeleton } from '@/components/ui/surface-skeleton';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { formatBytes } from '@/lib/utils';
import {
  Archive,
  Search,
  Trash2,
  Download,
  FileSpreadsheet,
  FileText,
  Clock,
  AlertCircle,
  Ban,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

type ArchiveReason = 'ALL' | 'EXPIRED' | 'DEPLETED' | 'DELETED' | 'DISABLED';

// Helper to format date
function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Helper to format date with time
function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Get icon for archive reason
function getReasonIcon(reason: string) {
  switch (reason) {
    case 'EXPIRED':
      return <Clock className="w-4 h-4 text-amber-500" />;
    case 'DEPLETED':
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case 'DELETED':
      return <XCircle className="w-4 h-4 text-gray-500" />;
    case 'DISABLED':
      return <Ban className="w-4 h-4 text-orange-500" />;
    default:
      return <Archive className="w-4 h-4" />;
  }
}

// Get badge color for archive reason
function getReasonBadgeClass(reason: string): string {
  switch (reason) {
    case 'EXPIRED':
      return 'bg-amber-500/20 text-amber-500';
    case 'DEPLETED':
      return 'bg-red-500/20 text-red-500';
    case 'DELETED':
      return 'bg-gray-500/20 text-gray-400';
    case 'DISABLED':
      return 'bg-orange-500/20 text-orange-500';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function ArchivedKeysPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState<ArchiveReason>('ALL');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Fetch archived keys
  const { data, isLoading } = trpc.archivedKeys.list.useQuery({
    page,
    limit: 20,
    reason,
    search: search || undefined,
  });

  // Fetch stats
  const { data: stats } = trpc.archivedKeys.getStats.useQuery();

  // Export data query
  const { data: exportData, refetch: fetchExportData } =
    trpc.archivedKeys.exportData.useQuery({ reason }, { enabled: false });

  // Delete mutations
  const deleteMutation = trpc.archivedKeys.permanentDelete.useMutation({
    onSuccess: () => {
      toast({ title: t('archived.toast.deleted') });
      utils.archivedKeys.list.invalidate();
      utils.archivedKeys.getStats.invalidate();
      setKeyToDelete(null);
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteManyMutation = trpc.archivedKeys.permanentDeleteMany.useMutation({
    onSuccess: (result) => {
      toast({ title: `${result.deleted} ${t('archived.toast.deleted_multiple')}` });
      utils.archivedKeys.list.invalidate();
      utils.archivedKeys.getStats.invalidate();
      setSelectedIds([]);
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Handle export to CSV
  const exportToCSV = async () => {
    const result = await fetchExportData();
    if (!result.data) return;

    const headers = [
      'Name',
      'Email',
      'Telegram ID',
      'Server',
      'Location',
      'Used Bytes',
      'Data Limit',
      'Archive Reason',
      'Original Status',
      'Expires At',
      'First Used',
      'Last Used',
      'Created At',
      'Archived At',
      'Delete After',
    ];

    const rows = result.data.map((key) => [
      key.name,
      key.email,
      key.telegramId,
      key.serverName,
      key.serverLocation,
      key.usedBytes,
      key.dataLimitBytes,
      key.archiveReason,
      key.originalStatus,
      key.expiresAt,
      key.firstUsedAt,
      key.lastUsedAt,
      key.createdAt,
      key.archivedAt,
      key.deleteAfter,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    downloadFile(csv, 'archived-keys.csv', 'text/csv');
    toast({ title: t('archived.toast.exported_csv') });
  };

  // Handle export to Excel (actually TSV for simplicity, can be opened in Excel)
  const exportToExcel = async () => {
    const result = await fetchExportData();
    if (!result.data) return;

    const headers = [
      'Name',
      'Email',
      'Telegram ID',
      'Server',
      'Location',
      'Used Bytes',
      'Data Limit',
      'Archive Reason',
      'Original Status',
      'Expires At',
      'First Used',
      'Last Used',
      'Created At',
      'Archived At',
      'Delete After',
    ];

    const rows = result.data.map((key) => [
      key.name,
      key.email,
      key.telegramId,
      key.serverName,
      key.serverLocation,
      key.usedBytes,
      key.dataLimitBytes,
      key.archiveReason,
      key.originalStatus,
      key.expiresAt,
      key.firstUsedAt,
      key.lastUsedAt,
      key.createdAt,
      key.archivedAt,
      key.deleteAfter,
    ]);

    // Create TSV (Tab Separated Values) which Excel opens correctly
    const tsv = [headers.join('\t'), ...rows.map((row) => row.join('\t'))].join('\n');
    downloadFile(tsv, 'archived-keys.xls', 'application/vnd.ms-excel');
    toast({ title: t('archived.toast.exported_excel') });
  };

  // Download file helper
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedIds.length === data?.keys.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data?.keys.map((k) => k.id) || []);
    }
  };

  // Handle single selection
  const handleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Handle delete confirmation
  const handleDeleteClick = (id: string) => {
    setKeyToDelete(id);
    setDeleteDialogOpen(true);
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setKeyToDelete(null);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const confirmDelete = () => {
    if (keyToDelete) {
      deleteMutation.mutate({ id: keyToDelete });
    } else if (selectedIds.length > 0) {
      deleteManyMutation.mutate({ ids: selectedIds });
    }
  };

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="ops-showcase-grid">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <Archive className="mr-2 h-3.5 w-3.5" />
              Archive vault
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {t('archived.title')}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t('archived.subtitle')}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('archived.stats.total')}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{stats?.total || 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">Archived keys retained before permanent purge.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
                  <Clock className="h-3.5 w-3.5" />
                  {t('archived.stats.expired')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{stats?.expired || 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">Keys archived because their term ended.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t('archived.stats.depleted')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{stats?.depleted || 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">Quota-depleted keys stored for investigation.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  <XCircle className="h-3.5 w-3.5" />
                  {t('archived.stats.deleted')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{stats?.deleted || 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">Keys removed manually and kept for audit history.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('archived.stats.total_usage')}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{formatBytes(Number(stats?.totalUsedBytes || 0))}</p>
                <p className="mt-2 text-sm text-muted-foreground">Total traffic retained across archived inventory.</p>
              </div>
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Archive actions</p>
                <h2 className="text-xl font-semibold">Command rail</h2>
                <p className="text-sm text-muted-foreground">
                  Export the archive for reporting or permanently purge selected records when retention is no longer required.
                </p>
              </div>

              <Button variant="secondary" className="w-full rounded-full" onClick={exportToCSV}>
                <FileText className="mr-2 h-4 w-4" />
                {t('archived.export_csv')}
              </Button>
              <Button variant="outline" className="w-full rounded-full" onClick={exportToExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {t('archived.export_excel')}
              </Button>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Retention note</p>
                <h2 className="text-xl font-semibold">Auto-purge window</h2>
              </div>
              <div className="ops-detail-card space-y-2">
                <p className="text-sm text-muted-foreground">
                  Archived keys remain available for audit, export, and forensic review until their configured delete-after date is reached.
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Bulk actions</p>
                    <p className="mt-2 text-sm font-medium">{selectedIds.length} currently selected</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Scope</p>
                    <p className="mt-2 text-sm font-medium">{reason === 'ALL' ? 'All archive reasons' : reason.toLowerCase()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="ops-panel space-y-4">
        <div className="ops-filter-bar grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="archived-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="archived-search"
                placeholder={t('archived.search_placeholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="archived-reason-filter">{t('archived.filter.reason')}</Label>
            <Select
              value={reason}
              onValueChange={(v) => {
                setReason(v as ArchiveReason);
                setPage(1);
              }}
            >
              <SelectTrigger id="archived-reason-filter">
                <SelectValue placeholder={t('archived.filter.reason')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('archived.filter.all')}</SelectItem>
                <SelectItem value="EXPIRED">{t('archived.filter.expired')}</SelectItem>
                <SelectItem value="DEPLETED">{t('archived.filter.depleted')}</SelectItem>
                <SelectItem value="DELETED">{t('archived.filter.deleted')}</SelectItem>
                <SelectItem value="DISABLED">{t('archived.filter.disabled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ops-table-meta">
            {data ? `${data.total} archived keys` : 'Archive inventory'}
          </div>
        </div>

        {selectedIds.length > 0 ? (
          <div className="ops-mobile-action-bar lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="text-sm text-muted-foreground">
              {selectedIds.length} selected for permanent deletion.
            </div>
            <Button variant="destructive" onClick={handleBulkDelete} className="rounded-full">
              <Trash2 className="mr-2 h-4 w-4" />
              {t('archived.delete_selected')} ({selectedIds.length})
            </Button>
          </div>
        ) : null}

        <div className="hidden md:block">
          <div className="ops-data-shell">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === data?.keys.length && (data?.keys.length || 0) > 0}
                      onChange={handleSelectAll}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>{t('archived.table.name')}</TableHead>
                  <TableHead>{t('archived.table.server')}</TableHead>
                  <TableHead>{t('archived.table.usage')}</TableHead>
                  <TableHead>{t('archived.table.reason')}</TableHead>
                  <TableHead>{t('archived.table.archived_at')}</TableHead>
                  <TableHead>{t('archived.table.delete_after')}</TableHead>
                  <TableHead className="text-right">{t('archived.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-6">
                      <SurfaceSkeleton className="min-h-[220px]" lines={5} />
                    </TableCell>
                  </TableRow>
                ) : data?.keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-6">
                      <EmptyState
                        icon={Archive}
                        title="Archive is empty"
                        description={t('archived.empty')}
                        className="min-h-[220px]"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(key.id)}
                          onChange={() => handleSelect(key.id)}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{key.name}</p>
                          {key.email ? <p className="text-xs text-muted-foreground">{key.email}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{key.serverName}</p>
                          {key.serverLocation ? <p className="text-xs text-muted-foreground">{key.serverLocation}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatBytes(Number(key.usedBytes))}
                        {key.dataLimitBytes ? (
                          <span className="text-muted-foreground">
                            {' / '}
                            {formatBytes(Number(key.dataLimitBytes))}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${getReasonBadgeClass(key.archiveReason)}`}
                        >
                          {getReasonIcon(key.archiveReason)}
                          {t(`archived.filter.${key.archiveReason.toLowerCase()}`)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{formatDateTime(key.archivedAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(key.deleteAfter)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(key.id)}
                          title="Permanently delete"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <MobileCardView
          data={data?.keys || []}
          emptyMessage={t('archived.empty')}
          keyExtractor={(key) => key.id}
          renderCard={(key) => (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">{key.name}</p>
                  {key.email ? <p className="text-xs text-muted-foreground">{key.email}</p> : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDeleteClick(key.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('archived.table.server')}</p>
                  <p className="mt-2 text-sm font-medium">{key.serverName}</p>
                  {key.serverLocation ? <p className="mt-1 text-xs text-muted-foreground">{key.serverLocation}</p> : null}
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('archived.table.usage')}</p>
                  <p className="mt-2 text-sm font-medium">
                    {formatBytes(Number(key.usedBytes))}
                    {key.dataLimitBytes ? ` / ${formatBytes(Number(key.dataLimitBytes))}` : ''}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('archived.table.reason')}</p>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${getReasonBadgeClass(key.archiveReason)}`}
                    >
                      {getReasonIcon(key.archiveReason)}
                      {t(`archived.filter.${key.archiveReason.toLowerCase()}`)}
                    </span>
                  </div>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('archived.table.delete_after')}</p>
                  <p className="mt-2 text-sm font-medium">{formatDate(key.deleteAfter)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(key.archivedAt)}</p>
                </div>
              </div>
            </div>
          )}
        />

        {data && data.totalPages > 1 ? (
          <div className="ops-mobile-action-bar lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="text-sm text-muted-foreground">
              Page {data.page} of {data.totalPages} ({data.total} total)
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-full"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="rounded-full"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('archived.dialog.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {keyToDelete
                ? t('archived.dialog.delete.single')
                : t('archived.dialog.delete.multiple').replace('{count}', selectedIds.length.toString())}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('archived.dialog.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending || deleteManyMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {t('archived.dialog.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
