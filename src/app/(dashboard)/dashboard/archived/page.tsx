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
import { Input } from '@/components/ui/input';
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="w-6 h-6 text-primary" />
            {t('archived.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('archived.subtitle')}
          </p>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <FileText className="w-4 h-4 mr-2" />
            {t('archived.export_csv')}
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            {t('archived.export_excel')}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-card rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{t('archived.stats.total')}</div>
          <div className="text-2xl font-bold">{stats?.total || 0}</div>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="text-sm text-amber-500 flex items-center gap-1">
            <Clock className="w-4 h-4" /> {t('archived.stats.expired')}
          </div>
          <div className="text-2xl font-bold">{stats?.expired || 0}</div>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {t('archived.stats.depleted')}
          </div>
          <div className="text-2xl font-bold">{stats?.depleted || 0}</div>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <XCircle className="w-4 h-4" /> {t('archived.stats.deleted')}
          </div>
          <div className="text-2xl font-bold">{stats?.deleted || 0}</div>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{t('archived.stats.total_usage')}</div>
          <div className="text-2xl font-bold">
            {formatBytes(Number(stats?.totalUsedBytes || 0))}
          </div>
        </div>
      </div>

      {/* Filters and actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('archived.search_placeholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>

        <Select
          value={reason}
          onValueChange={(v) => {
            setReason(v as ArchiveReason);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
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

        {selectedIds.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            {t('archived.delete_selected')} ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.length === data?.keys.length && data?.keys.length > 0}
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
              <TableHead className="w-20">{t('archived.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : data?.keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {t('archived.empty')}
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
                    <div>
                      <div className="font-medium">{key.name}</div>
                      {key.email && (
                        <div className="text-xs text-muted-foreground">{key.email}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="text-sm">{key.serverName}</div>
                      {key.serverLocation && (
                        <div className="text-xs text-muted-foreground">{key.serverLocation}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {formatBytes(Number(key.usedBytes))}
                      {key.dataLimitBytes && (
                        <span className="text-muted-foreground">
                          {' / '}
                          {formatBytes(Number(key.dataLimitBytes))}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getReasonBadgeClass(key.archiveReason)}`}
                    >
                      {getReasonIcon(key.archiveReason)}
                      {t(`archived.filter.${key.archiveReason.toLowerCase()}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(key.archivedAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(key.deleteAfter)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(key.id)}
                      title="Permanently delete"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} ({data.total} total)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

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
