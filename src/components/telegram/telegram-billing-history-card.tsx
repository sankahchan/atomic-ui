'use client';

import Link from 'next/link';
import { Receipt, ExternalLink } from 'lucide-react';
import { useLocale } from '@/hooks/use-locale';
import { withBasePath } from '@/lib/base-path';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type TelegramBillingHistoryEntry = {
  id: string;
  orderCode: string;
  kind: string;
  status: string;
  planCode?: string | null;
  planName?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  paymentMethodCode?: string | null;
  paymentMethodLabel?: string | null;
  requestedEmail?: string | null;
  retentionSource?: string | null;
  reviewedAt?: string | Date | null;
  fulfilledAt?: string | Date | null;
  rejectedAt?: string | Date | null;
  createdAt: string | Date;
  reviewedByEmail?: string | null;
};

function formatOrderPrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: 'en' | 'my',
) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return locale === 'my' ? 'အခမဲ့ / သတ်မှတ်မထား' : 'Free / not set';
  }

  const normalizedCurrency = (currency || 'MMK').trim().toUpperCase();
  const formatted = new Intl.NumberFormat(locale === 'my' ? 'my-MM' : 'en-US').format(amount);
  if (normalizedCurrency === 'MMK') {
    return locale === 'my' ? `${formatted} ကျပ်` : `${formatted} Kyat`;
  }
  if (normalizedCurrency === 'USD') {
    return locale === 'my' ? `${formatted} ဒေါ်လာ` : `$${formatted}`;
  }
  return `${formatted} ${normalizedCurrency}`;
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'FULFILLED':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'PENDING_REVIEW':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'REJECTED':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    case 'CANCELLED':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
    default:
      return 'border-border/60 bg-background/50 text-foreground';
  }
}

export function TelegramBillingHistoryCard({
  title,
  description,
  orders,
  emptyLabel,
}: {
  title: string;
  description: string;
  orders: TelegramBillingHistoryEntry[];
  emptyLabel: string;
}) {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const ui = {
    order: isMyanmar ? 'Order' : 'Order',
    kind: isMyanmar ? 'အမျိုးအစား' : 'Kind',
    price: isMyanmar ? 'ငွေပေးချေမှု' : 'Price',
    paymentMethod: isMyanmar ? 'Payment method' : 'Payment method',
    retentionSource: isMyanmar ? 'Source' : 'Source',
    reviewedBy: isMyanmar ? 'စစ်ဆေးသူ' : 'Reviewed by',
    created: isMyanmar ? 'ဖန်တီးခဲ့ချိန်' : 'Created',
    updated: isMyanmar ? 'နောက်ဆုံးအခြေအနေ' : 'Latest status',
    renew: isMyanmar ? 'Renewal' : 'Renewal',
    newOrder: isMyanmar ? 'New order' : 'New order',
    openOrders: isMyanmar ? 'Orders တွင်ကြည့်မည်' : 'Open in Orders',
  };

  return (
    <Card className="ops-detail-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const latestTimestamp =
                order.fulfilledAt || order.rejectedAt || order.reviewedAt || order.createdAt;
              const orderHref = withBasePath(
                `/dashboard/notifications?orderCode=${encodeURIComponent(order.orderCode)}`,
              );

              return (
                <div
                  key={order.id}
                  className="rounded-[1.2rem] border border-border/60 bg-background/45 p-4 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{order.orderCode}</p>
                        <Badge variant="secondary" className="rounded-full">
                          {order.kind === 'RENEW' ? ui.renew : ui.newOrder}
                        </Badge>
                        <Badge variant="outline" className={getStatusBadgeClass(order.status)}>
                          {order.status}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>{order.planName || order.planCode || '—'}</p>
                        <p>
                          {ui.price}: {formatOrderPrice(order.priceAmount, order.priceCurrency, locale)}
                          {order.paymentMethodLabel || order.paymentMethodCode
                            ? ` • ${ui.paymentMethod}: ${order.paymentMethodLabel || order.paymentMethodCode}`
                            : ''}
                        </p>
                        {order.retentionSource ? (
                          <p>
                            {ui.retentionSource}: <span className="font-medium text-foreground">{order.retentionSource}</span>
                          </p>
                        ) : null}
                        {order.reviewedByEmail ? (
                          <p>
                            {ui.reviewedBy}: <span className="font-medium text-foreground">{order.reviewedByEmail}</span>
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>
                          {ui.created}: {formatDateTime(order.createdAt)} ({formatRelativeTime(order.createdAt)})
                        </span>
                        <span>
                          {ui.updated}: {formatDateTime(latestTimestamp)} ({formatRelativeTime(latestTimestamp)})
                        </span>
                      </div>
                    </div>

                    <Button asChild variant="outline" size="sm" className="rounded-full">
                      <Link href={orderHref}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {ui.openOrders}
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
