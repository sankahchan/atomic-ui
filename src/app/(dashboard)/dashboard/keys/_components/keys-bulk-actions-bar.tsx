'use client';

import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Power,
  Tag,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type TranslateFn = (key: string) => string;

export function KeysBulkActionsBar(props: {
  t: TranslateFn;
  selectedCount: number;
  isBulkBusy: boolean;
  bulkTogglePending: boolean;
  bulkExtendPending: boolean;
  bulkTagsPending: boolean;
  bulkMovePending: boolean;
  bulkArchivePending: boolean;
  bulkDeletePending: boolean;
  onToggleStatus: (enabled: boolean) => void;
  onOpenExtend: () => void;
  onOpenAddTags: () => void;
  onOpenRemoveTags: () => void;
  onOpenMove: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}) {
  const {
    t,
    selectedCount,
    isBulkBusy,
    bulkTogglePending,
    bulkExtendPending,
    bulkTagsPending,
    bulkMovePending,
    bulkArchivePending,
    bulkDeletePending,
    onToggleStatus,
    onOpenExtend,
    onOpenAddTags,
    onOpenRemoveTags,
    onOpenMove,
    onArchive,
    onDelete,
    onClearSelection,
  } = props;

  return (
    <div className="ops-mobile-action-bar sticky bottom-4 z-20 flex flex-col gap-2.5 border-primary/20 bg-primary/6 shadow-[0_18px_36px_rgba(1,6,20,0.34)] sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs font-medium sm:text-sm">
        {selectedCount} {t('keys.selected_count')}
      </span>
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              disabled={bulkTogglePending}
            >
              {bulkTogglePending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Power className="mr-2 h-4 w-4" />
              )}
              {t('keys.bulk.enable_disable')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onToggleStatus(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
              {t('keys.bulk.enable_all')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleStatus(false)}>
              <XCircle className="mr-2 h-4 w-4 text-orange-500" />
              {t('keys.bulk.disable_all')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onOpenExtend}
          disabled={isBulkBusy}
        >
          {bulkExtendPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Clock className="mr-2 h-4 w-4" />
          )}
          {t('keys.bulk.extend_expiry')}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              disabled={bulkTagsPending}
            >
              {bulkTagsPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Tag className="mr-2 h-4 w-4" />
              )}
              {t('keys.bulk.tags')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onOpenAddTags}>
              <Plus className="mr-2 h-4 w-4" />
              {t('keys.bulk.add_tags')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenRemoveTags}>
              <X className="mr-2 h-4 w-4" />
              {t('keys.bulk.remove_tags')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onOpenMove}
          disabled={isBulkBusy}
        >
          {bulkMovePending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ArrowRightLeft className="mr-2 h-4 w-4" />
          )}
          {t('keys.bulk.move')}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onArchive}
          disabled={bulkArchivePending}
        >
          {bulkArchivePending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Archive className="mr-2 h-4 w-4" />
          )}
          {bulkArchivePending ? t('keys.bulk.archiving') : t('keys.bulk.archive')}
        </Button>

        <Button
          variant="destructive"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onDelete}
          disabled={bulkDeletePending}
        >
          {bulkDeletePending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          {t('keys.delete_selected')}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="h-8 w-full rounded-full px-3 text-xs sm:ml-auto sm:w-auto"
        disabled={isBulkBusy}
      >
        {t('keys.clear_selection')}
      </Button>
    </div>
  );
}
