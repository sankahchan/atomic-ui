'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, BadgeDollarSign, Bell, Coins, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldAlert, Wallet, XCircle } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { resolveRefundReasonPresetLabel } from '@/lib/finance';
import { formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { withBasePath } from '@/lib/base-path';

type FinanceAction = 'VERIFY' | 'REFUND' | 'CREDIT';

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }

  const normalizedCurrency = (currency || 'MMK').trim().toUpperCase();
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  if (normalizedCurrency === 'MMK') {
    return `${formatted} Kyat`;
  }
  if (normalizedCurrency === 'USD') {
    return `$${formatted}`;
  }
  return `${formatted} ${normalizedCurrency}`;
}

function FinanceStatusBadge({ status }: { status: string }) {
  const className =
    status === 'REFUNDED'
      ? 'border-red-500/30 bg-red-500/10 text-red-300'
      : status === 'CREDITED'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
        : status === 'VERIFIED'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-border/60 bg-background/50 text-foreground';

  return (
    <Badge variant="outline" className={className}>
      {status}
    </Badge>
  );
}

type FinanceTimelineEvent = {
  id: string;
  at: Date;
  title: string;
  detail: string;
  tone: 'default' | 'positive' | 'warning' | 'danger';
  orderCode?: string;
  href?: string;
};

type SupportTimelineEvent = {
  id: string;
  at: Date;
  title: string;
  detail: string;
  tone: 'default' | 'warning' | 'danger' | 'positive';
  href?: string;
};

export default function UserLedgerPage() {
  const params = useParams();
  const userId = params.id as string;
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [financeDialog, setFinanceDialog] = useState<{
    orderId: string;
    orderCode: string;
    action: FinanceAction;
    defaultAmount: number | null;
    currency: string | null;
  } | null>(null);
  const [financeAmount, setFinanceAmount] = useState('');
  const [financeNote, setFinanceNote] = useState('');

  const ledgerQuery = trpc.users.getLedger.useQuery(
    { id: userId },
    { enabled: !!userId },
  );

  const reconcileMutation = trpc.users.reconcileTelegramOrder.useMutation({
    onSuccess: () => {
      toast({
        title: 'Finance action saved',
        description: 'The order finance state was updated.',
      });
      setFinanceDialog(null);
      setFinanceAmount('');
      setFinanceNote('');
      utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: 'Finance action failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const reviewRefundRequestMutation = trpc.users.reviewRefundRequest.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Refund request updated',
        description: 'The customer was notified about the refund request decision.',
      });
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: 'Refund review failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const revenueSummary = useMemo(() => {
    const summary = ledgerQuery.data?.summary;
    if (!summary || summary.revenueByCurrency.length === 0) {
      return 'No paid orders yet';
    }

    return summary.revenueByCurrency
      .map((entry) => formatMoney(entry.amount, entry.currency))
      .join(' • ');
  }, [ledgerQuery.data]);

  const refundedSummary = useMemo(() => {
    const summary = ledgerQuery.data?.summary;
    if (!summary || summary.refundedByCurrency.length === 0) {
      return 'No refunds yet';
    }

    return summary.refundedByCurrency
      .map((entry) => formatMoney(entry.amount, entry.currency))
      .join(' • ');
  }, [ledgerQuery.data]);

  const financeTimeline = useMemo<FinanceTimelineEvent[]>(() => {
    if (!ledgerQuery.data) {
      return [];
    }

    const events: FinanceTimelineEvent[] = [];

    for (const order of ledgerQuery.data.telegramOrders) {
      const orderHref = withBasePath(
        `/dashboard/notifications?orderCode=${encodeURIComponent(order.orderCode)}`,
      );
      const orderAmountLabel = formatMoney(order.priceAmount, order.priceCurrency);
      const planLabel = order.planName || order.planCode || 'Unknown plan';

      events.push({
        id: `${order.id}:created`,
        at: new Date(order.createdAt),
        title: 'Order created',
        detail: `${order.orderCode} • ${planLabel} • ${orderAmountLabel}`,
        tone: 'default',
        orderCode: order.orderCode,
        href: orderHref,
      });

      if (order.status === 'FULFILLED' && order.reviewedAt) {
        events.push({
          id: `${order.id}:fulfilled`,
          at: new Date(order.reviewedAt),
          title: order.kind === 'TRIAL' ? 'Trial delivered' : 'Receipt delivered',
          detail: `${order.orderCode} • ${order.kind === 'TRIAL' ? 'Free trial access sent' : `Paid access delivered for ${planLabel}`}`,
          tone: 'positive',
          orderCode: order.orderCode,
          href: orderHref,
        });
      }

      if (order.refundRequestedAt) {
        events.push({
          id: `${order.id}:refund-requested`,
          at: new Date(order.refundRequestedAt),
          title: 'Refund requested',
          detail: `${order.orderCode}${order.refundRequestMessage ? ` • ${order.refundRequestMessage}` : ''}`,
          tone: 'warning',
          orderCode: order.orderCode,
          href: orderHref,
        });
      }

      if (order.refundRequestReviewedAt && order.refundRequestStatus) {
        events.push({
          id: `${order.id}:refund-reviewed`,
          at: new Date(order.refundRequestReviewedAt),
          title:
            order.refundRequestStatus === 'APPROVED'
              ? 'Refund approved'
              : 'Refund declined',
          detail: [
            order.orderCode,
            order.refundReviewReasonCode
              ? resolveRefundReasonPresetLabel(order.refundReviewReasonCode) || order.refundReviewReasonCode
              : null,
            order.refundRequestCustomerMessage || null,
          ]
            .filter(Boolean)
            .join(' • '),
          tone: order.refundRequestStatus === 'APPROVED' ? 'positive' : 'danger',
          orderCode: order.orderCode,
          href: orderHref,
        });
      }

      for (const action of order.financeActions) {
        const actionAmount = formatMoney(action.amount, action.currency || order.priceCurrency);
        events.push({
          id: `${action.id}:finance-action`,
          at: new Date(action.createdAt),
          title:
            action.actionType === 'VERIFY'
              ? 'Payment verified'
              : action.actionType === 'REFUND'
                ? 'Refund recorded'
                : 'Credit applied',
          detail: [
            order.orderCode,
            actionAmount !== '—' ? actionAmount : null,
            action.createdBy?.email || null,
            action.note || null,
          ]
            .filter(Boolean)
            .join(' • '),
          tone:
            action.actionType === 'VERIFY'
              ? 'positive'
              : action.actionType === 'REFUND'
                ? 'danger'
                : 'warning',
          orderCode: order.orderCode,
          href: orderHref,
        });
      }
    }

    return events
      .sort((left, right) => right.at.getTime() - left.at.getTime())
      .slice(0, 24);
  }, [ledgerQuery.data]);

  const supportTimeline = useMemo<SupportTimelineEvent[]>(() => {
    if (!ledgerQuery.data) {
      return [];
    }

    const events: SupportTimelineEvent[] = [];

    for (const request of ledgerQuery.data.serverChangeRequests) {
      events.push({
        id: `server-change:${request.id}`,
        at: new Date(request.createdAt),
        title: 'Server change request',
        detail: `${request.requestCode} • ${request.currentServerName} → ${request.requestedServerName} • ${request.status}`,
        tone: request.status === 'REJECTED' ? 'danger' : request.status === 'APPROVED' ? 'positive' : 'warning',
      });
    }

    for (const request of ledgerQuery.data.premiumSupportRequests) {
      events.push({
        id: `premium-support:${request.id}`,
        at: new Date(request.createdAt),
        title: 'Premium support request',
        detail: `${request.requestCode} • ${request.requestType} • ${request.status}${request.followUpPending ? ' • waiting for follow-up' : ''}`,
        tone: request.status === 'DISMISSED' ? 'danger' : request.status === 'HANDLED' ? 'positive' : 'warning',
      });
    }

    for (const delivery of ledgerQuery.data.customerNotifications.announcements) {
      events.push({
        id: `announcement:${delivery.id}`,
        at: new Date(delivery.sentAt || delivery.createdAt),
        title: delivery.isPinned ? 'Pinned announcement delivered' : 'Announcement delivered',
        detail: `${delivery.announcement.title} • ${delivery.status}${delivery.readAt ? ' • read' : ' • unread'}`,
        tone: delivery.isPinned ? 'warning' : 'default',
      });
    }

    for (const log of ledgerQuery.data.customerNotifications.keyNotices) {
      events.push({
        id: `notice:${log.id}`,
        at: new Date(log.sentAt),
        title: log.event,
        detail: `${log.accessKeyName || 'Unlinked key'} • ${log.status}`,
        tone: log.status === 'FAILED' ? 'danger' : 'default',
      });
    }

    return events
      .sort((left, right) => right.at.getTime() - left.at.getTime())
      .slice(0, 24);
  }, [ledgerQuery.data]);

  if (ledgerQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-52 animate-pulse rounded-full bg-muted" />
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-[1.5rem] bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!ledgerQuery.data) {
    return (
      <div className="space-y-4">
        <BackButton href="/dashboard/users" label="Back to users" />
        <Card>
          <CardHeader>
            <CardTitle>Customer not found</CardTitle>
            <CardDescription>This user ledger could not be loaded.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { user, summary, accessKeys, dynamicKeys, telegramOrders, serverChangeRequests, premiumSupportRequests, customerNotifications, financePermissions } =
    ledgerQuery.data;
  const announcementDeliveries = [...customerNotifications.announcements].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }
    if (Boolean(left.readAt) !== Boolean(right.readAt)) {
      return left.readAt ? 1 : -1;
    }
    return new Date(right.sentAt || right.createdAt).getTime() - new Date(left.sentAt || left.createdAt).getTime();
  });

  return (
    <div className="space-y-6">
      <section className="ops-hero">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BackButton href="/dashboard/users" label="Back" />
              <Badge
                variant="outline"
                className="ops-pill border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
              >
                <Wallet className="mr-2 h-3.5 w-3.5" />
                Customer CRM
              </Badge>
            </div>

            <Button variant="outline" onClick={() => ledgerQuery.refetch()} disabled={ledgerQuery.isFetching}>
              {ledgerQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{user.email}</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Review keys, Telegram orders, refunds, receipts, announcements, support requests, and server-change history for this customer from one place.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Active keys
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {summary.activeAccessKeys + summary.activeDynamicKeys}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {summary.activeAccessKeys} standard • {summary.activeDynamicKeys} premium dynamic
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Paid purchases
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{summary.fulfilledPaidOrders}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Refund unlocks after more than 3 fulfilled paid purchases.
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Gross revenue
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{revenueSummary}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Total fulfilled Telegram order value for this customer.
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Refundable now
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{summary.refundEligibleCount}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Refund closes automatically above 5 GB usage. Refunded: {refundedSummary}
              </p>
            </div>
          </div>
          {!financePermissions.canManage ? (
            <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              You can view the ledger, but only finance-authorized admins can verify, refund, or credit orders.
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="space-y-6">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BadgeDollarSign className="h-5 w-5 text-primary" />
                Billing and reconciliation
              </CardTitle>
              <CardDescription>
                Verify payments, apply credits, and issue refunds only when the purchase-count and usage policy allows it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {telegramOrders.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  No Telegram orders are linked to this customer yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {telegramOrders.map((order) => {
                    const latestFinanceAction = order.financeActions[0] || null;
                    const orderHref = withBasePath(
                      `/dashboard/notifications?orderCode=${encodeURIComponent(order.orderCode)}`,
                    );
                    const receiptHtmlUrl = withBasePath(
                      `/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=receipt&format=html`,
                    );
                    const receiptPdfUrl = withBasePath(
                      `/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=receipt&format=pdf`,
                    );
                    const refundHtmlUrl = withBasePath(
                      `/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=refund&format=html`,
                    );
                    const refundPdfUrl = withBasePath(
                      `/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=refund&format=pdf`,
                    );

                    return (
                      <div
                        key={order.id}
                        className="rounded-[1.2rem] border border-border/60 bg-background/45 p-4 dark:bg-white/[0.03]"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{order.orderCode}</p>
                              <Badge variant="secondary">{order.kind}</Badge>
                              <Badge variant="outline">{order.status}</Badge>
                              <FinanceStatusBadge status={order.financeStatus} />
                              {order.refundEligible ? (
                                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                                  Refund eligible
                                </Badge>
                              ) : null}
                              {order.refundRequestStatus ? (
                                <Badge variant="outline">
                                  Refund request: {order.refundRequestStatus}
                                </Badge>
                              ) : null}
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p>
                                  <span className="font-medium text-foreground">Plan:</span>{' '}
                                  {order.planName || order.planCode || '—'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Amount:</span>{' '}
                                  {formatMoney(order.priceAmount, order.priceCurrency)}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Usage on delivered key:</span>{' '}
                                  {formatBytes(BigInt(order.usedBytes || '0'))}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Paid purchases for this Telegram user:</span>{' '}
                                  {order.fulfilledPaidPurchaseCount}
                                </p>
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p>
                                  <span className="font-medium text-foreground">Created:</span>{' '}
                                  {formatDateTime(order.createdAt)}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Reviewed:</span>{' '}
                                  {order.reviewedAt ? formatDateTime(order.reviewedAt) : '—'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Reviewer:</span>{' '}
                                  {order.reviewedBy?.email || '—'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Finance updated:</span>{' '}
                                  {order.financeUpdatedAt ? formatRelativeTime(order.financeUpdatedAt) : 'Never'}
                                </p>
                              </div>
                            </div>

                            {!order.refundEligible && order.refundBlockedReason ? (
                              <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                                <span className="font-medium">Refund blocked:</span> {order.refundBlockedReason}
                              </div>
                            ) : null}

                            {order.refundRequestStatus === 'PENDING' ? (
                              <div className="rounded-[1rem] border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
                                <span className="font-medium">Refund requested:</span>{' '}
                                {order.refundRequestedAt ? formatDateTime(order.refundRequestedAt) : 'Pending review'}
                                {order.refundRequestMessage ? ` • ${order.refundRequestMessage}` : ''}
                              </div>
                            ) : null}

                            {order.refundRequestStatus && order.refundRequestStatus !== 'PENDING' ? (
                              <div className="rounded-[1rem] border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground dark:bg-white/[0.03]">
                                <span className="font-medium text-foreground">Refund review:</span>{' '}
                                {order.refundRequestStatus}
                                {order.refundRequestReviewedAt ? ` • ${formatDateTime(order.refundRequestReviewedAt)}` : ''}
                                {order.refundReviewReasonCode
                                  ? ` • ${resolveRefundReasonPresetLabel(order.refundReviewReasonCode) || order.refundReviewReasonCode}`
                                  : ''}
                                {order.refundRequestCustomerMessage ? ` • ${order.refundRequestCustomerMessage}` : ''}
                              </div>
                            ) : null}

                            {latestFinanceAction ? (
                              <div className="rounded-[1rem] border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground dark:bg-white/[0.03]">
                                <span className="font-medium text-foreground">Latest finance action:</span>{' '}
                                {latestFinanceAction.actionType} •{' '}
                                {latestFinanceAction.createdBy?.email || 'Unknown reviewer'} •{' '}
                                {formatRelativeTime(latestFinanceAction.createdAt)}
                                {latestFinanceAction.note ? ` • ${latestFinanceAction.note}` : ''}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-col gap-2 lg:w-[220px]">
                            <Button asChild variant="outline" size="sm">
                              <Link href={orderHref}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Open order
                              </Link>
                            </Button>
                            {order.status === 'FULFILLED' ? (
                              <>
                                <Button asChild variant="outline" size="sm">
                                  <Link href={receiptHtmlUrl} target="_blank">
                                    Printable receipt
                                  </Link>
                                </Button>
                                <Button asChild variant="outline" size="sm">
                                  <Link href={receiptPdfUrl} target="_blank">
                                    Download receipt PDF
                                  </Link>
                                </Button>
                              </>
                            ) : null}
                            {order.financeStatus === 'REFUNDED' || order.refundRequestStatus === 'APPROVED' ? (
                              <>
                                <Button asChild variant="outline" size="sm">
                                  <Link href={refundHtmlUrl} target="_blank">
                                    Printable refund
                                  </Link>
                                </Button>
                                <Button asChild variant="outline" size="sm">
                                  <Link href={refundPdfUrl} target="_blank">
                                    Download refund PDF
                                  </Link>
                                </Button>
                              </>
                            ) : null}
                            {order.financeStatus === 'OPEN' ? (
                              <Button
                                size="sm"
                                disabled={!financePermissions.canManage}
                                onClick={() =>
                                  setFinanceDialog({
                                    orderId: order.id,
                                    orderCode: order.orderCode,
                                    action: 'VERIFY',
                                    defaultAmount: order.priceAmount,
                                    currency: order.priceCurrency,
                                  })
                                }
                              >
                                Verify payment
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!financePermissions.canManage}
                              onClick={() =>
                                setFinanceDialog({
                                  orderId: order.id,
                                  orderCode: order.orderCode,
                                  action: 'CREDIT',
                                  defaultAmount: order.priceAmount,
                                  currency: order.priceCurrency,
                                })
                              }
                            >
                              Apply credit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!financePermissions.canManage || !order.refundEligible}
                              onClick={() =>
                                setFinanceDialog({
                                  orderId: order.id,
                                  orderCode: order.orderCode,
                                  action: 'REFUND',
                                  defaultAmount: order.priceAmount,
                                  currency: order.priceCurrency,
                                })
                              }
                            >
                              Refund
                            </Button>
                            {order.refundRequestStatus === 'PENDING' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={!financePermissions.canManage || reviewRefundRequestMutation.isPending}
                                  onClick={() =>
                                    reviewRefundRequestMutation.mutate({
                                      orderId: order.id,
                                      action: 'APPROVE',
                                      reasonPresetCode: 'approved_policy_eligible',
                                    })
                                  }
                                >
                                  Approve request
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!financePermissions.canManage || reviewRefundRequestMutation.isPending}
                                  onClick={() =>
                                    reviewRefundRequestMutation.mutate({
                                      orderId: order.id,
                                      action: 'REJECT',
                                      reasonPresetCode: 'reject_manual_review',
                                    })
                                  }
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Decline request
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                Key inventory
              </CardTitle>
              <CardDescription>
                Standard and premium keys currently linked to this customer.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium">Standard keys</p>
                {accessKeys.length === 0 ? (
                  <p className="rounded-[1rem] border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                    No standard keys assigned.
                  </p>
                ) : (
                  accessKeys.map((key) => (
                    <div key={key.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{key.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {key.server.name} • {key.status}
                          </p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/keys/${key.id}`}>Open</Link>
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                        <p>Usage: {formatBytes(BigInt(key.usedBytes))}{key.dataLimitBytes ? ` / ${formatBytes(BigInt(key.dataLimitBytes))}` : ''}</p>
                        <p>Expiry: {key.expiresAt ? formatDateTime(key.expiresAt) : 'Never'}</p>
                        <p>Last traffic: {key.lastTrafficAt ? formatRelativeTime(key.lastTrafficAt) : 'No recent traffic'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Premium dynamic keys</p>
                {dynamicKeys.length === 0 ? (
                  <p className="rounded-[1rem] border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                    No premium dynamic keys assigned.
                  </p>
                ) : (
                  dynamicKeys.map((key) => (
                    <div key={key.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{key.name}</p>
                          <p className="text-sm text-muted-foreground">{key.status}</p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/dynamic-keys/${key.id}`}>Open</Link>
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                        <p>Usage: {formatBytes(BigInt(key.usedBytes))}{key.dataLimitBytes ? ` / ${formatBytes(BigInt(key.dataLimitBytes))}` : ''}</p>
                        <p>Expiry: {key.expiresAt ? formatDateTime(key.expiresAt) : 'Never'}</p>
                        <p>Last traffic: {key.lastTrafficAt ? formatRelativeTime(key.lastTrafficAt) : 'No recent traffic'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Finance timeline
              </CardTitle>
              <CardDescription>
                Follow payments, receipts, refund requests, decisions, credits, and finance actions for this customer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {financeTimeline.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  No finance events have been recorded for this customer yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {financeTimeline.map((event) => {
                    const toneClass =
                      event.tone === 'positive'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                        : event.tone === 'warning'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
                          : event.tone === 'danger'
                            ? 'border-red-500/20 bg-red-500/10 text-red-100'
                            : 'border-border/60 bg-background/40 text-muted-foreground dark:bg-white/[0.03]';

                    return (
                      <div key={event.id} className={`rounded-[1rem] border px-4 py-3 ${toneClass}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">{event.title}</p>
                              {event.orderCode ? <Badge variant="outline">{event.orderCode}</Badge> : null}
                            </div>
                            <p className="text-sm">{event.detail}</p>
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                            {event.href ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={event.href}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Open order
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                Customer snapshot
              </CardTitle>
              <CardDescription>Quick billing and support context for this user.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-muted-foreground">Account role</p>
                <p className="mt-1 font-medium">{user.role}</p>
              </div>
              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-muted-foreground">Telegram chat</p>
                <p className="mt-1 font-medium">{user.telegramChatId || 'Not linked'}</p>
              </div>
              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-muted-foreground">Joined</p>
                <p className="mt-1 font-medium">{formatDateTime(user.createdAt)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Customer notifications
              </CardTitle>
              <CardDescription>
                Announcement deliveries, receipts, and recent key or outage-related notices for this customer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Telegram announcements</p>
                {announcementDeliveries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No announcement deliveries recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {announcementDeliveries.map((delivery) => (
                      <div key={delivery.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{delivery.announcement.title}</p>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{delivery.status}</Badge>
                            {delivery.isPinned ? <Badge variant="secondary">Pinned</Badge> : null}
                            {!delivery.readAt ? <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-200">Unread</Badge> : null}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {delivery.announcement.type} • {formatRelativeTime(delivery.sentAt || delivery.createdAt)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{delivery.announcement.message}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Opens: {delivery.openCount || 0} • Clicks: {delivery.clickCount || 0}
                          {delivery.readAt ? ` • Read ${formatRelativeTime(delivery.readAt)}` : ' • Not opened yet'}
                        </p>
                        {(delivery.announcement.targetTag || delivery.announcement.targetServerName || delivery.announcement.targetCountryCode) ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {delivery.announcement.targetTag ? (
                              <Badge variant="secondary">Tag: {delivery.announcement.targetTag}</Badge>
                            ) : null}
                            {delivery.announcement.targetServerName ? (
                              <Badge variant="secondary">Server: {delivery.announcement.targetServerName}</Badge>
                            ) : null}
                            {delivery.announcement.targetCountryCode ? (
                              <Badge variant="secondary">Region: {delivery.announcement.targetCountryCode}</Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Key and outage notices</p>
                {customerNotifications.keyNotices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No key notification logs recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {customerNotifications.keyNotices.map((log) => (
                      <div key={log.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{log.event}</p>
                          <Badge variant="outline">{log.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {log.accessKeyName || 'Unlinked key'} • {formatRelativeTime(log.sentAt)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{log.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Support timeline
              </CardTitle>
              <CardDescription>
                One chronological feed for notices, premium requests, outage-related contact, and server-change history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {supportTimeline.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  No support events have been recorded for this customer yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {supportTimeline.map((event) => {
                    const toneClass =
                      event.tone === 'positive'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                        : event.tone === 'warning'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
                          : event.tone === 'danger'
                            ? 'border-red-500/20 bg-red-500/10 text-red-100'
                            : 'border-border/60 bg-background/40 text-muted-foreground dark:bg-white/[0.03]';

                    return (
                      <div key={event.id} className={`rounded-[1rem] border px-4 py-3 ${toneClass}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{event.title}</p>
                            <p className="text-sm">{event.detail}</p>
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                            {event.href ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={event.href}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Open
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Support activity
              </CardTitle>
              <CardDescription>Recent server-change and premium support requests linked to this customer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Server change requests</p>
                {serverChangeRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No server change requests yet.</p>
                ) : (
                  <div className="space-y-2">
                    {serverChangeRequests.map((request) => (
                      <div key={request.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{request.requestCode}</p>
                          <Badge variant="outline">{request.status}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {request.currentServerName} → {request.requestedServerName}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">{formatRelativeTime(request.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Premium support requests</p>
                {premiumSupportRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No premium support requests yet.</p>
                ) : (
                  <div className="space-y-2">
                    {premiumSupportRequests.map((request) => (
                      <div key={request.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{request.requestCode}</p>
                          <Badge variant="outline">{request.status}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{request.requestType}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatRelativeTime(request.createdAt)}
                          {request.followUpPending ? ' • waiting for customer follow-up' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!financeDialog} onOpenChange={(open) => (!open ? setFinanceDialog(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {financeDialog?.action === 'VERIFY'
                ? 'Verify payment'
                : financeDialog?.action === 'REFUND'
                  ? 'Refund order'
                  : 'Apply credit'}
            </DialogTitle>
            <DialogDescription>
              {financeDialog
                ? `Update the finance state for order ${financeDialog.orderCode}.`
                : 'Update the finance state for this order.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="finance-amount">
                Amount {financeDialog?.currency ? `(${financeDialog.currency})` : ''}
              </Label>
              <Input
                id="finance-amount"
                type="number"
                min="0"
                placeholder={financeDialog?.defaultAmount?.toString() || 'Optional'}
                value={financeAmount}
                onChange={(event) => setFinanceAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance-note">Note</Label>
              <Textarea
                id="finance-note"
                rows={4}
                placeholder="Internal reconciliation note"
                value={financeNote}
                onChange={(event) => setFinanceNote(event.target.value)}
              />
            </div>
            {financeDialog?.action === 'REFUND' ? (
              <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Refunds are only allowed after more than 3 paid purchases and while usage stays at or below 5 GB.
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFinanceDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={financeDialog?.action === 'REFUND' ? 'destructive' : 'default'}
              onClick={() => {
                if (!financeDialog) {
                  return;
                }

                reconcileMutation.mutate({
                  orderId: financeDialog.orderId,
                  action: financeDialog.action,
                  note: financeNote.trim() || undefined,
                  amount:
                    financeAmount.trim().length > 0 && Number.isFinite(Number(financeAmount))
                      ? Number(financeAmount)
                      : undefined,
                });
              }}
              disabled={reconcileMutation.isPending || !financePermissions.canManage}
            >
              {reconcileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
