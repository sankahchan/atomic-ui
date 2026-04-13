'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

type AnnouncementAnalyticsInsightsUi = {
  announcementSuccessRate: string;
  announcementOpenRate: string;
  announcementOpens: string;
  announcementClickRate: string;
  announcementClicks: string;
  announcementResendRecovery: string;
  announcementByType: string;
  announcementByAudience: string;
  announcementNoHistory: string;
};

type AnnouncementAnalyticsInsightsData = {
  totals: {
    deliverySuccessRate: number;
    openRate: number;
    openCount: number;
    clickRate: number;
    clickCount: number;
    resendRecoveryRate: number;
    resendRecovered: number;
    resendAttempts: number;
  };
  byType: Array<{
    type: string;
    totalRecipients: number;
    sentCount: number;
    openCount: number;
    clickCount: number;
    deliverySuccessRate: number;
  }>;
  byAudience: Array<{
    audience: string;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    attributedOrders: number;
    attributedRevenue: Array<{ currency: string; amount: number }>;
    conversionRate: number;
  }>;
  byTemplate: Array<{
    templateId: string | null;
    templateName: string;
    totalRecipients: number;
    sentCount: number;
    openCount: number;
    clickCount: number;
    attributedOrders: number;
    attributedRevenue: Array<{ currency: string; amount: number }>;
    conversionRate: number;
  }>;
  bestSendTimes: Array<{
    hour: number;
    sentCount: number;
    openRate: number;
    clickRate: number;
  }>;
  recentAttribution: Array<{
    orderId: string;
    orderCode: string;
    couponCode: string | null;
    announcementId: string;
    announcementTitle: string;
    templateName: string | null;
    audience: string;
    targetSegment: string | null;
    minutesFromSend: number;
    priceAmount: number | null;
    priceCurrency: string | null;
  }>;
};

type AnnouncementAnalyticsInsightsProps = {
  ui: AnnouncementAnalyticsInsightsUi;
  analytics: AnnouncementAnalyticsInsightsData;
  formatMoney: (amount: number | null | undefined, currency: string | null | undefined) => string;
  onJumpToHistoryItem: (announcementId: string) => void;
};

export function AnnouncementAnalyticsInsights({
  ui,
  analytics,
  formatMoney,
  onJumpToHistoryItem,
}: AnnouncementAnalyticsInsightsProps) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {ui.announcementSuccessRate}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {Math.round(analytics.totals.deliverySuccessRate * 100)}%
          </p>
          <Progress value={analytics.totals.deliverySuccessRate * 100} className="mt-3 h-2" />
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {ui.announcementOpenRate}
          </p>
          <p className="mt-2 text-2xl font-semibold">{Math.round(analytics.totals.openRate * 100)}%</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {analytics.totals.openCount} {ui.announcementOpens.toLowerCase()}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {ui.announcementClickRate}
          </p>
          <p className="mt-2 text-2xl font-semibold">{Math.round(analytics.totals.clickRate * 100)}%</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {analytics.totals.clickCount} {ui.announcementClicks.toLowerCase()}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {ui.announcementResendRecovery}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {Math.round(analytics.totals.resendRecoveryRate * 100)}%
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {analytics.totals.resendRecovered}/{analytics.totals.resendAttempts || 0}
          </p>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <p className="text-sm font-medium">{ui.announcementByType}</p>
          <div className="mt-3 space-y-2">
            {analytics.byType.length === 0 ? (
              <p className="text-xs text-muted-foreground">{ui.announcementNoHistory}</p>
            ) : (
              analytics.byType.map((entry) => (
                <div key={entry.type} className="rounded-xl border border-border/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{entry.type}</p>
                    <Badge variant="outline">{Math.round(entry.deliverySuccessRate * 100)}%</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.sentCount}/{entry.totalRecipients} sent • {entry.openCount} opens • {entry.clickCount} clicks
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <p className="text-sm font-medium">{ui.announcementByAudience}</p>
          <div className="mt-3 space-y-2">
            {analytics.byAudience.length === 0 ? (
              <p className="text-xs text-muted-foreground">{ui.announcementNoHistory}</p>
            ) : (
              analytics.byAudience.map((entry) => (
                <div key={entry.audience} className="rounded-xl border border-border/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{entry.audience}</p>
                    <Badge variant="outline">{Math.round(entry.conversionRate * 100)}% conv.</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.sentCount}/{entry.totalRecipients} sent • {entry.failedCount} failed
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.attributedOrders} attributed orders •{' '}
                    {entry.attributedRevenue.length > 0
                      ? entry.attributedRevenue
                          .map((value) => formatMoney(value.amount, value.currency))
                          .join(' • ')
                      : '0 revenue'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Template comparison</p>
            <Badge variant="outline">
              {analytics.byTemplate.length >= 2 ? 'Side by side' : 'Need 2 templates'}
            </Badge>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {analytics.byTemplate.length >= 2 ? (
              analytics.byTemplate.slice(0, 2).map((entry) => (
                <div
                  key={`compare:${entry.templateId || entry.templateName}`}
                  className="rounded-xl border border-border/50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{entry.templateName}</p>
                    <Badge variant="outline">{Math.round(entry.conversionRate * 100)}% conv.</Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {entry.sentCount}/{entry.totalRecipients} sent • {entry.openCount} opens • {entry.clickCount} clicks
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.attributedOrders} orders •{' '}
                    {entry.attributedRevenue.length > 0
                      ? entry.attributedRevenue
                          .map((value) => formatMoney(value.amount, value.currency))
                          .join(' • ')
                      : '0 revenue'}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                Send at least two announcement templates to compare them side by side.
              </p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <p className="text-sm font-medium">Best send time hints</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {analytics.bestSendTimes.length === 0 ? (
              <p className="text-xs text-muted-foreground">{ui.announcementNoHistory}</p>
            ) : (
              analytics.bestSendTimes.map((entry) => (
                <div key={entry.hour} className="rounded-xl border border-border/50 p-3">
                  <p className="text-sm font-medium">{String(entry.hour).padStart(2, '0')}:00</p>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.sentCount} sent</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {Math.round(entry.openRate * 100)}% open • {Math.round(entry.clickRate * 100)}% click
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
        <p className="text-sm font-medium">Recent promo attribution</p>
        <div className="mt-3 space-y-2">
          {analytics.recentAttribution.length === 0 ? (
            <p className="text-xs text-muted-foreground">{ui.announcementNoHistory}</p>
          ) : (
            analytics.recentAttribution.map((entry) => (
              <div key={`${entry.orderId}:${entry.announcementId}`} className="rounded-xl border border-border/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{entry.orderCode}</p>
                  <Badge variant="outline">{entry.minutesFromSend} min</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.announcementTitle}
                  {entry.templateName ? ` • ${entry.templateName}` : ''}
                  {entry.targetSegment ? ` • ${entry.targetSegment}` : ''}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.audience} • {formatMoney(entry.priceAmount, entry.priceCurrency)}
                  {entry.couponCode ? ` • coupon ${entry.couponCode}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onJumpToHistoryItem(entry.announcementId)}
                  >
                    Jump to history item
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
