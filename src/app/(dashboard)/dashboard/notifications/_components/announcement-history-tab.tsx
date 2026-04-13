'use client';

import { Loader2, RotateCcw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { cn, formatDateTime } from '@/lib/utils';

type AnnouncementHistoryRow = {
  id: string;
  type: string;
  cardStyle: 'DEFAULT' | 'PROMO' | 'PREMIUM' | 'OPERATIONS';
  status: string;
  recurrenceType?: 'NONE' | 'DAILY' | 'WEEKLY' | null;
  experimentId?: string | null;
  experimentVariantKey?: string | null;
  experimentVariantLabel?: string | null;
  title: string;
  message: string;
  heroImageUrl?: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  resendAttemptCount?: number | null;
  resendRecoveredCount?: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  scheduledFor?: string | Date | null;
  sentAt?: string | Date | null;
  deliveries: Array<{
    id: string;
    chatId: string;
    error?: string | null;
  }>;
};

type AnnouncementHistoryUi = {
  announcementHistoryTitle: string;
  announcementHistoryDesc: string;
  announcementNoHistory: string;
  announcementSendScheduledNow: string;
  announcementResendFailed: string;
  recipientsLabel: string;
};

type AnnouncementHistoryTabProps = {
  ui: AnnouncementHistoryUi;
  isMyanmar: boolean;
  history: AnnouncementHistoryRow[];
  announcementIdParam: string;
  failedAnnouncementIds: string[];
  archivableAnnouncementIds: string[];
  resendAnnouncementFailedBatchPending: boolean;
  archiveAnnouncementsPending: boolean;
  dispatchScheduledAnnouncementPending: boolean;
  resendAnnouncementFailedPending: boolean;
  onResendFailedBatch: (announcementIds: string[]) => void;
  onArchiveAnnouncements: (announcementIds: string[]) => void;
  onDispatchScheduledAnnouncement: (announcementId: string) => void;
  onResendFailed: (announcementId: string) => void;
  getAnnouncementCardStyleLabel: (
    cardStyle: 'DEFAULT' | 'PROMO' | 'PREMIUM' | 'OPERATIONS',
    isMyanmar: boolean,
  ) => string;
  getAnnouncementRecurrenceLabel: (
    recurrenceType: 'NONE' | 'DAILY' | 'WEEKLY' | null | undefined,
    isMyanmar: boolean,
  ) => string;
};

export function AnnouncementHistoryTab({
  ui,
  isMyanmar,
  history,
  announcementIdParam,
  failedAnnouncementIds,
  archivableAnnouncementIds,
  resendAnnouncementFailedBatchPending,
  archiveAnnouncementsPending,
  dispatchScheduledAnnouncementPending,
  resendAnnouncementFailedPending,
  onResendFailedBatch,
  onArchiveAnnouncements,
  onDispatchScheduledAnnouncement,
  onResendFailed,
  getAnnouncementCardStyleLabel,
  getAnnouncementRecurrenceLabel,
}: AnnouncementHistoryTabProps) {
  return (
    <TabsContent value="history" className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">{ui.announcementHistoryTitle}</p>
            <p className="text-xs text-muted-foreground">{ui.announcementHistoryDesc}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onResendFailedBatch(failedAnnouncementIds)}
              disabled={resendAnnouncementFailedBatchPending || failedAnnouncementIds.length === 0}
            >
              {resendAnnouncementFailedBatchPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Bulk resend failed
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onArchiveAnnouncements(archivableAnnouncementIds)}
              disabled={archiveAnnouncementsPending || archivableAnnouncementIds.length === 0}
            >
              {archiveAnnouncementsPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Bulk archive old
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {history.length ? history.map((announcement) => (
            <div
              key={announcement.id}
              id={`announcement-history-${announcement.id}`}
              className={cn(
                'rounded-2xl border border-border/60 bg-background/70 p-3',
                announcement.id === announcementIdParam && 'border-primary/50 bg-primary/5 shadow-sm',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{announcement.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{announcement.message}</p>
                  {announcement.heroImageUrl ? (
                    <p className="mt-2 break-all text-[11px] text-muted-foreground">
                      Image: {announcement.heroImageUrl}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{announcement.type}</Badge>
                  <Badge variant="outline">{getAnnouncementCardStyleLabel(announcement.cardStyle, isMyanmar)}</Badge>
                  <Badge variant="outline">{announcement.status}</Badge>
                  {announcement.experimentId ? (
                    <Badge variant="secondary">
                      {announcement.experimentVariantLabel || announcement.experimentVariantKey || 'Experiment'}
                    </Badge>
                  ) : null}
                  {announcement.recurrenceType && announcement.recurrenceType !== 'NONE' ? (
                    <Badge variant="secondary">
                      {getAnnouncementRecurrenceLabel(announcement.recurrenceType, isMyanmar)}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <p>{ui.recipientsLabel}: {announcement.totalRecipients}</p>
                <p>Sent: {announcement.sentCount} · Failed: {announcement.failedCount}</p>
                <p>
                  {announcement.experimentId
                    ? `Experiment: ${announcement.experimentVariantLabel || announcement.experimentVariantKey || announcement.experimentId}`
                    : 'Ad hoc send'}
                </p>
                <p>Resend attempts: {announcement.resendAttemptCount || 0}</p>
                <p>Recovered: {announcement.resendRecoveredCount || 0}</p>
                <p>Created: {formatDateTime(announcement.createdAt)}</p>
                <p>
                  {announcement.scheduledFor
                    ? `Scheduled: ${formatDateTime(announcement.scheduledFor)}`
                    : announcement.sentAt
                      ? `Sent: ${formatDateTime(announcement.sentAt)}`
                      : `Updated: ${formatDateTime(announcement.updatedAt)}`}
                </p>
              </div>
              {announcement.deliveries.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-border/60 bg-background/60 p-3">
                  <p className="text-xs font-medium text-foreground">Recent failures</p>
                  <div className="mt-2 space-y-2">
                    {announcement.deliveries.map((delivery) => (
                      <div key={delivery.id} className="rounded-xl border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                        <p>Chat: {delivery.chatId}</p>
                        <p>Error: {delivery.error || 'send-failed'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {announcement.status === 'SCHEDULED' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDispatchScheduledAnnouncement(announcement.id)}
                    disabled={dispatchScheduledAnnouncementPending}
                  >
                    {ui.announcementSendScheduledNow}
                  </Button>
                ) : null}
                {announcement.failedCount > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onResendFailed(announcement.id)}
                    disabled={resendAnnouncementFailedPending}
                  >
                    {ui.announcementResendFailed}
                  </Button>
                ) : null}
                {['SENT', 'FAILED', 'COMPLETED'].includes(announcement.status) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onArchiveAnnouncements([announcement.id])}
                    disabled={archiveAnnouncementsPending}
                  >
                    Archive
                  </Button>
                ) : null}
              </div>
            </div>
          )) : <p className="text-xs text-muted-foreground">{ui.announcementNoHistory}</p>}
        </div>
      </div>
    </TabsContent>
  );
}
