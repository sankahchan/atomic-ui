'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid as RechartsCartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from 'recharts';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrafficChart } from '@/components/ui/traffic-chart';
import { useLocale } from '@/hooks/use-locale';
import { useToast } from '@/hooks/use-toast';
import { cn, formatBytes, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Gauge,
  Info,
  Key,
  Loader2,
  QrCode,
  Send,
  Share2,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';

function ForecastTooltip({
  keyId,
  keyType,
}: {
  keyId: string;
  keyType: 'ACCESS_KEY' | 'DYNAMIC_KEY';
}) {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { data: forecast, isLoading } = trpc.analytics.forecast.useQuery(
    { keyId, keyType },
    { staleTime: 60_000 }
  );

  if (isLoading) {
    return (
      <TooltipContent className="max-w-xs">
        <p className="text-xs">{isMyanmar ? 'ခန့်မှန်းချက်ကို တင်နေသည်...' : 'Loading forecast...'}</p>
      </TooltipContent>
    );
  }

  if (!forecast || !forecast.hasQuota) {
    return (
      <TooltipContent className="max-w-xs">
        <p className="text-xs text-muted-foreground">
          {isMyanmar ? 'ဒေတာကန့်သတ်ချက် မသတ်မှတ်ထားပါ' : 'No quota limit set'}
        </p>
      </TooltipContent>
    );
  }

  return (
    <TooltipContent className="max-w-xs p-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{isMyanmar ? 'အသုံးပြုမှု ခန့်မှန်းချက်' : 'Usage Forecast'}</span>
          <Badge variant="outline" className="text-xs">
            {isMyanmar ? `${forecast.confidence} ယုံကြည်စိတ်ချရမှု` : `${forecast.confidence} confidence`}
          </Badge>
        </div>

        <div className="space-y-1 text-xs">
          <p>
            <span className="text-muted-foreground">{isMyanmar ? 'လက်ရှိ:' : 'Current:'}</span>{' '}
            {formatBytes(BigInt(forecast.currentUsageBytes || '0'))} /{' '}
            {formatBytes(BigInt(forecast.dataLimitBytes || '0'))} ({forecast.usagePercent}%)
          </p>
          {forecast.dailyRateBytes ? (
            <p>
              <span className="text-muted-foreground">{isMyanmar ? 'နေ့စဉ်နှုန်း:' : 'Daily rate:'}</span>{' '}
              ~{formatBytes(BigInt(forecast.dailyRateBytes))}/day
            </p>
          ) : null}
          {forecast.daysToQuota !== null && forecast.daysToQuota !== undefined ? (
            <p
              className={cn(
                'font-medium',
                forecast.daysToQuota <= 3
                  ? 'text-red-500'
                  : forecast.daysToQuota <= 7
                    ? 'text-yellow-500'
                    : 'text-green-500'
              )}
            >
              <Clock className="mr-1 inline h-3 w-3" />
              {forecast.message}
            </p>
          ) : null}
          {!forecast.daysToQuota && forecast.message ? (
            <p className="text-muted-foreground">{forecast.message}</p>
          ) : null}
        </div>

        <p className="text-[10px] italic text-muted-foreground">
          {isMyanmar ? '* လတ်တလော အသုံးပြုမှု ပုံစံများအပေါ် အခြေခံ၍ ခန့်မှန်းထားသည်' : '* Estimated from recent usage patterns'}
        </p>
      </div>
    </TooltipContent>
  );
}

function AnalyticsStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="ops-kpi-tile">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

function getShareEventLabel(eventType: string, isMyanmar = false) {
  switch (eventType) {
    case 'PAGE_VIEW':
      return isMyanmar ? 'စာမျက်နှာ ကြည့်ရှုမှု' : 'Page view';
    case 'INVITE_OPEN':
      return isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် ဖွင့်ထားသည်' : 'Invite opened';
    case 'COPY_URL':
      return isMyanmar ? 'URL ကူးယူမှု' : 'Copy URL';
    case 'OPEN_QR':
      return isMyanmar ? 'QR ဖွင့်မှု' : 'Open QR';
    case 'DOWNLOAD_QR':
      return isMyanmar ? 'QR ဒေါင်းလုဒ်လုပ်မှု' : 'QR downloaded';
    case 'OPEN_APP':
      return isMyanmar ? 'အက်ပ်ထဲတွင် ဖွင့်ထားသည်' : 'Open in app';
    case 'DOWNLOAD_CONFIG':
      return isMyanmar ? 'သတ်မှတ်ချက်ဖိုင်ကို ဒေါင်းလုဒ်လုပ်ထားသည်' : 'Config downloaded';
    case 'TELEGRAM_SENT':
      return isMyanmar ? 'တယ်လီဂရမ်သို့ ပေးပို့ထားသည်' : 'Telegram send';
    case 'TELEGRAM_CONNECTED':
      return isMyanmar ? 'တယ်လီဂရမ်နှင့် ချိတ်ဆက်ပြီး' : 'Telegram connected';
    default:
      return eventType.replaceAll('_', ' ');
  }
}

function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatCompactFinanceAxisValue(value: number) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function FinanceChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  valueFormatter: (value: number, seriesLabel: string) => string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="min-w-[164px] rounded-2xl border border-cyan-400/18 bg-[rgba(5,12,26,0.94)] p-3 text-white shadow-[0_18px_36px_rgba(1,6,20,0.55)] backdrop-blur-xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">
        {label}
      </p>
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-cyan-50/80">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color || 'rgba(34,211,238,0.95)' }}
              />
              {item.name || 'Value'}
            </span>
            <span className="font-medium text-cyan-200">
              {valueFormatter(item.value || 0, item.name || 'Value')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const [days, setDays] = useState(30);
  const [topConsumersRange, setTopConsumersRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [shareRange, setShareRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [telegramSalesRange, setTelegramSalesRange] = useState<'24h' | '7d' | '30d'>('30d');

  const { data: trafficHistory, isLoading: loadingTraffic } = trpc.dashboard.trafficHistory.useQuery({ days });
  const { data: topUsers, isLoading: loadingTopUsers } = trpc.dashboard.topUsers.useQuery({ limit: 5 });
  const { data: peakHours, isLoading: loadingPeakHours } = trpc.dashboard.peakHours.useQuery({ days });
  const { data: topConsumers, isLoading: loadingTopConsumers } = trpc.analytics.topConsumers.useQuery({
    range: topConsumersRange,
    limit: 5,
  });
  const { data: anomalies, isLoading: loadingAnomalies } = trpc.analytics.anomalies.useQuery({
    range: '24h',
  });
  const { data: analyticsSummary, isLoading: loadingSummary } = trpc.analytics.summary.useQuery({
    range: topConsumersRange,
  });
  const { data: shareDashboard, isLoading: loadingShareDashboard } = trpc.analytics.shareDashboard.useQuery({
    range: shareRange,
    limit: 6,
  });
  const { data: telegramSalesDashboard, isLoading: loadingTelegramSalesDashboard } =
    trpc.analytics.telegramSalesDashboard.useQuery({
      range: telegramSalesRange,
      limit: 6,
    });
  const { data: monthlyBusinessDashboard, isLoading: loadingMonthlyBusinessDashboard } =
    trpc.analytics.monthlyBusinessDashboard.useQuery({
      months: 6,
    });
  const financeExportMutation = trpc.analytics.financeCsvExport.useMutation({
    onSuccess: (result) => {
      downloadCsvFile(result.filename, result.csv);
      toast({
        title: isMyanmar ? 'ဘဏ္ဍာရေး မှတ်တမ်းထုတ်ယူမှု အသင့်ဖြစ်ပါပြီ' : 'Finance export ready',
        description: isMyanmar ? `${result.filename} ကို ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ။` : `${result.filename} downloaded.`,
      });
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ဘဏ္ဍာရေး မှတ်တမ်းထုတ်ယူမှု မအောင်မြင်ပါ' : 'Finance export failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const totalTraffic =
    trafficHistory?.reduce((acc, curr) => acc + BigInt(curr.bytes), BigInt(0)) ?? BigInt(0);

  const getHeatmapColor = (bytes: number, maxBytes: number) => {
    if (bytes === 0) return 'bg-muted/30 dark:bg-white/[0.03]';
    const intensity = bytes / maxBytes;
    if (intensity < 0.2) return 'bg-cyan-400/20';
    if (intensity < 0.4) return 'bg-cyan-400/35';
    if (intensity < 0.6) return 'bg-cyan-400/50';
    if (intensity < 0.8) return 'bg-cyan-400/70';
    return 'bg-cyan-300';
  };

  const maxPeakBytes = peakHours?.reduce((max, curr) => Math.max(max, curr.bytes), 0) || 0;

  const formatRevenueLabel = (currency: string, amount: number) => {
    const normalizedCurrency = currency.trim().toUpperCase();
    const formattedAmount = new Intl.NumberFormat('en-US').format(amount);
    if (normalizedCurrency === 'MMK') {
      return `${formattedAmount} Kyat`;
    }
    return `${formattedAmount} ${normalizedCurrency}`;
  };

  const formatDurationMetric = (minutes?: number | null) => {
    if (minutes === null || minutes === undefined) {
      return '—';
    }
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    if (minutes < 24 * 60) {
      return `${(minutes / 60).toFixed(1)}h`;
    }
    return `${(minutes / (24 * 60)).toFixed(1)}d`;
  };

  const telegramFunnelSteps = useMemo(() => {
    const started = telegramSalesDashboard?.funnel.botStarted || 0;
    const rawSteps = [
      {
        key: 'started',
        label: isMyanmar ? 'ဘော့စတင်ခဲ့သည်' : 'Bot started',
        value: started,
      },
      {
        key: 'created',
        label: isMyanmar ? 'အမှာစာ ဖန်တီးထားသည်' : 'Orders created',
        value: telegramSalesDashboard?.funnel.created || 0,
      },
      {
        key: 'method',
        label: isMyanmar ? 'ငွေပေးချေမှုနည်းလမ်း ရွေးထားသည်' : 'Method selected',
        value: telegramSalesDashboard?.funnel.paymentMethodSelected || 0,
      },
      {
        key: 'proof',
        label: isMyanmar ? 'ငွေလွှဲအထောက်အထား တင်ထားသည်' : 'Proof uploaded',
        value: telegramSalesDashboard?.funnel.proofUploaded || 0,
      },
      {
        key: 'reviewed',
        label: isMyanmar ? 'စစ်ဆေးပြီး' : 'Reviewed',
        value: telegramSalesDashboard?.funnel.reviewed || 0,
      },
      {
        key: 'fulfilled',
        label: isMyanmar ? 'ပြီးမြောက်ပြီး' : 'Fulfilled',
        value: telegramSalesDashboard?.funnel.fulfilled || 0,
      },
    ];

    return rawSteps.map((step, index) => {
      const previousValue = index === 0 ? started : rawSteps[index - 1]?.value || 0;
      return {
        ...step,
        cumulativeRate: started > 0 ? (step.value / started) * 100 : 0,
        stepRate: index === 0 ? 100 : previousValue > 0 ? (step.value / previousValue) * 100 : 0,
        dropOff: index === 0 ? 0 : Math.max(previousValue - step.value, 0),
      };
    });
  }, [isMyanmar, telegramSalesDashboard]);

  const daysOfWeek = [
    t('days.sunday') || 'Sun',
    t('days.monday') || 'Mon',
    t('days.tuesday') || 'Tue',
    t('days.wednesday') || 'Wed',
    t('days.thursday') || 'Thu',
    t('days.friday') || 'Fri',
    t('days.saturday') || 'Sat',
  ];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const primaryRevenueCurrency = useMemo(() => {
    const entries = monthlyBusinessDashboard
      ? Object.entries(monthlyBusinessDashboard.summary.totalRevenueByCurrency)
      : [];
    if (entries.length === 0) {
      return 'MMK';
    }
    return entries.sort((left, right) => right[1] - left[1])[0]?.[0] || 'MMK';
  }, [monthlyBusinessDashboard]);
  const financeTrendRows = useMemo(
    () =>
      (monthlyBusinessDashboard?.months || []).map((month) => ({
        label: month.label,
        revenue:
          month.revenueByCurrency.find((entry) => entry.currency === primaryRevenueCurrency)?.amount || 0,
        renewals: month.renewalOrders,
        newOrders: month.newOrders,
        churn: month.churnSignals,
      })),
    [monthlyBusinessDashboard, primaryRevenueCurrency],
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <section className="ops-showcase">
          <div className="ops-showcase-grid">
            <div className="space-y-5 self-start">
              <Badge
                variant="outline"
                className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
              >
                <BarChart3 className="mr-2 h-3.5 w-3.5" />
                {isMyanmar ? 'သုံးသပ်ချက် ထိန်းချုပ်ရေးဌာန' : 'Analytics Command Center'}
              </Badge>

              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                  {isMyanmar ? 'သုံးသပ်ချက်များ' : 'Analytics'}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  {isMyanmar
                    ? 'ကာလအလိုက် လမ်းကြောင်းအသုံးပြုမှုကို စစ်ဆေးပါ၊ မူမမှန်သော အသုံးပြုမှုများကို ရှာဖွေပါ၊ bandwidth အများဆုံး အသုံးပြုနေသော သော့များကို ခွဲခြားသတ်မှတ်ပါ။'
                    : 'Review period traffic, detect unusual usage, and identify the keys driving your highest bandwidth demand.'}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AnalyticsStatCard
                  label={isMyanmar ? 'အသက်ဝင် သော့များ' : 'Active keys'}
                  value={loadingSummary ? '…' : analyticsSummary?.activeKeysCount || 0}
                  helper={isMyanmar ? 'မကြာသေးမီ လမ်းကြောင်းအသုံးပြုမှုတွင် ပါဝင်နေသော သော့များ။' : 'Keys contributing to recent traffic activity.'}
                />
                <AnalyticsStatCard
                  label={isMyanmar ? 'ကာလအသုံးပြုမှု' : 'Period usage'}
                  value={loadingSummary ? '…' : formatBytes(BigInt(analyticsSummary?.totalDeltaBytes || '0'))}
                  helper={isMyanmar ? `ရွေးချယ်ထားသော ${topConsumersRange} window အတွင်း လွှဲပြောင်းထားသည့် ပမာဏ။` : `Transferred in the selected ${topConsumersRange} window.`}
                />
                <AnalyticsStatCard
                  label={isMyanmar ? 'မူမမှန်မှုများ' : 'Anomalies'}
                  value={loadingSummary ? '…' : analyticsSummary?.anomalyCount || 0}
                  helper={isMyanmar ? 'သတ်မှတ်ထားသော အခြေခံမျဉ်းထက် အသုံးပြုမှု မြင့်တက်လာမှုများ။' : 'Usage spikes above the detected baseline.'}
                />
                <AnalyticsStatCard
                  label={isMyanmar ? 'မှတ်တမ်းပုံများ' : 'Snapshots'}
                  value={loadingSummary ? '…' : analyticsSummary?.snapshotCount || 0}
                  helper={isMyanmar ? 'အဆင့်မြင့် အစီရင်ခံမှုအတွက် သမိုင်းမှတ်တမ်း နမူနာများ။' : 'Historical samples available for advanced reporting.'}
                />
              </div>
            </div>

            <div className="ops-detail-rail">
              <div className="ops-panel space-y-3">
                <div className="space-y-1">
                  <p className="ops-section-heading">{isMyanmar ? 'သုံးသပ်ချက် ထိန်းချုပ်မှုများ' : 'Analytics controls'}</p>
                  <h2 className="text-xl font-semibold">{t('dashboard.command_rail')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {isMyanmar
                      ? 'သမိုင်းကာလကို ပြောင်းပါ၊ လုပ်ငန်းဆိုင်ရာ အနှစ်ချုပ်များကို စစ်ဆေးပါ၊ သို့မဟုတ် ထုတ်ထားသော အစီရင်ခံစာများနှင့် အဖြစ်အပျက်များသို့ တိုက်ရိုက်ဝင်ပါ။'
                      : 'Change the history window, inspect operational summaries, or jump to exported reports and incidents.'}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'လမ်းကြောင်း ကာလ' : 'Traffic window'}
                    </p>
                    <Select value={days.toString()} onValueChange={(value) => setDays(parseInt(value, 10))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">{isMyanmar ? 'နောက်ဆုံး ၇ ရက်' : 'Last 7 days'}</SelectItem>
                        <SelectItem value="30">{isMyanmar ? 'နောက်ဆုံး ၃၀ ရက်' : 'Last 30 days'}</SelectItem>
                        <SelectItem value="90">{isMyanmar ? 'နောက်ဆုံး ၉၀ ရက်' : 'Last 90 days'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'အသုံးပြုသူ ကာလ' : 'Consumer range'}
                    </p>
                    <Select value={topConsumersRange} onValueChange={(v) => setTopConsumersRange(v as '24h' | '7d' | '30d')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">24h</SelectItem>
                        <SelectItem value="7d">{isMyanmar ? '၇ ရက်' : '7 days'}</SelectItem>
                        <SelectItem value="30d">{isMyanmar ? '၃၀ ရက်' : '30 days'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Link href="/dashboard/reports" className="ops-action-tile">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      {isMyanmar ? 'အစီရင်ခံစာများကို ဖွင့်မည်' : 'Open reports'}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('dashboard.open')}</span>
                  </Link>
                  <Link href="/dashboard/incidents" className="ops-action-tile">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-primary" />
                      {isMyanmar ? 'အဖြစ်အပျက်များကို စစ်ဆေးမည်' : 'Review incidents'}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('dashboard.open')}</span>
                  </Link>
                </div>

                <div className="space-y-2 rounded-[1.2rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {isMyanmar ? 'ဘဏ္ဍာရေး ထုတ်ယူမှုများ' : 'Finance exports'}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={financeExportMutation.isPending}
                    onClick={() =>
                      financeExportMutation.mutate({
                        kind: 'orders',
                        range: telegramSalesRange,
                        months: 6,
                      })
                    }
                  >
                    {financeExportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isMyanmar ? 'အမှာစာစာရင်း CSV ထုတ်မည်' : 'Export order ledger CSV'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={financeExportMutation.isPending}
                    onClick={() =>
                      financeExportMutation.mutate({
                        kind: 'actions',
                        range: telegramSalesRange,
                        months: 6,
                      })
                    }
                  >
                    {financeExportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isMyanmar ? 'ဘဏ္ဍာရေးလုပ်ဆောင်ချက် CSV ထုတ်မည်' : 'Export finance actions CSV'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={financeExportMutation.isPending}
                    onClick={() =>
                      financeExportMutation.mutate({
                        kind: 'monthly',
                        range: telegramSalesRange,
                        months: 6,
                      })
                    }
                  >
                    {financeExportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isMyanmar ? 'လစဉ်ဝင်ငွေ CSV ထုတ်မည်' : 'Export monthly revenue CSV'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={financeExportMutation.isPending}
                    onClick={() =>
                      financeExportMutation.mutate({
                        kind: 'receipts',
                        range: telegramSalesRange,
                        months: 6,
                      })
                    }
                  >
                    {financeExportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isMyanmar ? 'လက်ခံပြေစာမှတ်တမ်း CSV ထုတ်မည်' : 'Export receipt register CSV'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={financeExportMutation.isPending}
                    onClick={() =>
                      financeExportMutation.mutate({
                        kind: 'refunds',
                        range: telegramSalesRange,
                        months: 6,
                      })
                    }
                  >
                    {financeExportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isMyanmar ? 'ငွေပြန်အမ်းမှတ်တမ်း CSV ထုတ်မည်' : 'Export refund register CSV'}
                  </Button>
                </div>
              </div>

              <div className="ops-panel space-y-3">
                <div className="space-y-1">
                  <p className="ops-section-heading">{isMyanmar ? 'လုပ်ဆောင်သူ မှတ်ချက်' : 'Worker note'}</p>
                  <h2 className="text-xl font-semibold">{isMyanmar ? 'မှတ်တမ်းပုံ အခြေအနေ' : 'Snapshot health'}</h2>
                </div>
                <div className="ops-detail-card space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {isMyanmar
                      ? 'အဆင့်မြင့် သုံးသပ်ချက်များသည် ကာလအလိုက် သိမ်းဆည်းထားသော အသုံးပြုမှု မှတ်တမ်းပုံများအပေါ် မူတည်ပါသည်။ နမူနာများ ပိုများလာသရွေ့ ခန့်မှန်းချက်များ၊ မူမမှန်မှုရှာဖွေမှုများနှင့် ထိပ်တန်းအသုံးပြုသူ အဆင့်သတ်မှတ်ချက်များ ပိုမိုကောင်းမွန်လာမည်။'
                      : 'Advanced analytics depend on periodic usage snapshots. Forecasts, anomalies, and top-consumer rankings improve as more samples are collected.'}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {isMyanmar ? 'မှတ်တမ်းပုံ လုပ်ဆောင်စနစ်' : 'Snapshot worker'}
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {(analyticsSummary?.snapshotCount || 0) > 0
                          ? (isMyanmar ? 'ဒေတာ စုဆောင်းနေသည်' : 'Collecting data')
                          : (isMyanmar ? 'စစ်ဆေးရန် လိုအပ်သည်' : 'Needs attention')}
                      </p>
                    </div>
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {isMyanmar ? 'ခန့်မှန်းချက် လွှမ်းခြုံမှု' : 'Forecast coverage'}
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {(topConsumers?.filter((consumer) => consumer.dataLimitBytes).length || 0)} {isMyanmar ? 'ဒေတာကန့်သတ်ချက် သိထားသော သော့များ' : 'quota-aware keys'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Card className="ops-panel">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-5 w-5 text-primary" />
              {isMyanmar ? 'လမ်းကြောင်း အနှစ်ချုပ်' : 'Traffic overview'}
            </CardTitle>
            <CardDescription>
              {isMyanmar
                ? `နောက်ဆုံး ${days} ရက်အတွင်း ${formatBytes(totalTraffic)} လွှဲပြောင်းခဲ့သည်။`
                : `${formatBytes(totalTraffic)} transferred in the last ${days} days.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-0 pb-0">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isMyanmar ? 'စုစုပေါင်း လမ်းကြောင်း' : 'Total traffic'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{formatBytes(totalTraffic)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'ရွေးထားသော ဇယားကာလအတွင်း။' : 'Across the selected chart range.'}</p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isMyanmar ? 'အွန်လိုင်း သော့များ' : 'Online keys'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{loadingSummary ? '…' : analyticsSummary?.activeKeysCount || 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'လတ်တလော လမ်းကြောင်းအသုံးပြုမှု ပြနေသော သော့များ။' : 'Keys currently showing recent traffic.'}</p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isMyanmar ? 'အသက်ဝင် သော့များ' : 'Active keys'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{loadingSummary ? '…' : analyticsSummary?.activeKeysCount || 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'လက်ရှိ ဒေတာနမူနာများတွင် ပါဝင်နေသော သော့များ။' : 'Keys contributing to current data samples.'}</p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isMyanmar ? 'တွေ့ရှိထားသော မြင့်တက်မှုများ' : 'Detected spikes'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{loadingSummary ? '…' : analyticsSummary?.anomalyCount || 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'မူမမှန်မှု စစ်ဆေးကိရိယာမှ အမှတ်အသားပြုထားသည်။' : 'Flagged by the anomaly detector.'}</p>
              </div>
            </div>

            <div className="ops-detail-card h-[220px] md:h-[280px]">
              {loadingTraffic ? (
                <div className="ops-chart-empty h-full">
                  <div className="h-full w-full animate-pulse rounded-[1.5rem] bg-muted/40 dark:bg-white/[0.04]" />
                </div>
              ) : trafficHistory && trafficHistory.length > 0 ? (
                <TrafficChart data={trafficHistory} height="100%" />
              ) : (
                <div className="ops-chart-empty h-full">
                  <div className="space-y-2 text-center">
                    <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">{isMyanmar ? 'လမ်းကြောင်း မှတ်တမ်း မရှိသေးပါ' : 'No traffic history yet'}</p>
                    <p className="text-sm text-muted-foreground">
                      {isMyanmar
                        ? 'analytics worker က အသုံးပြုမှု မှတ်တမ်းပုံများ စုဆောင်းပြီးသည်နှင့် ဤနေရာတွင် လမ်းကြောင်းနမူနာများ ပေါ်လာမည်။'
                        : 'Traffic samples will appear here once the analytics worker has collected usage snapshots.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Share2 className="h-5 w-5 text-primary" />
                    {isMyanmar ? 'အများသုံး မျှဝေမှု စွမ်းဆောင်ရည်' : 'Public share performance'}
                  </CardTitle>
                  <CardDescription>{isMyanmar ? 'အသုံးပြုသူများက အများသုံး မျှဝေစာမျက်နှာများ၊ ကူးယူထားသော ဆက်တင်အချက်အလက်များနှင့် Telegram ပေးပို့မှုများကို မည်သို့ အသုံးပြုနေသလဲ။' : 'How users interact with public share pages, copied configs, and Telegram deliveries.'}</CardDescription>
                </div>
                <Select value={shareRange} onValueChange={(value) => setShareRange(value as '24h' | '7d' | '30d')}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-0 pb-0">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အများသုံး လင့်ခ်များ' : 'Public links'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.activePublicLinks || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'လက်ရှိ ဖွင့်ထားသော အသုံးပြုခွင့်နှင့် ပြောင်းလဲသတ်မှတ် လင့်ခ်များ။' : 'Access + dynamic links currently exposed.'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'စာမျက်နှာ ကြည့်ရှုမှု' : 'Page views'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.pageViews || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'ရွေးထားသော ကာလအတွင်း မျှဝေစာမျက်နှာ ဖွင့်မှုများ။' : 'Share page opens in the selected range.'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဖိတ်ခေါ် လင့်ခ်ဖွင့်မှု' : 'Invite opens'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.inviteOpens || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'မျှဝေစာမျက်နှာ မတိုင်မီ ဖြန့်ဝေမှု လင့်ခ်ဖွင့်မှုများ။' : 'Distribution-link opens before the share page.'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ကူးယူမှု နှိပ်ချက်များ' : 'Copy clicks'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.copyClicks || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'အများသုံး စာမျက်နှာများမှ မူလ URL များကို ကူးယူထားမှု။' : 'Raw URLs copied from public pages.'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'QR ဖွင့်မှုများ' : 'QR opens'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.qrOpens || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'လက်ဖြင့် တပ်ဆင်မှုနှင့် QR အခြေပြု အပြန်အလှန်များ။' : 'Manual setup / QR-focused interactions.'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'QR ဒေါင်းလုဒ်များ' : 'QR downloads'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.qrDownloads || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'အများသုံး စာမျက်နှာမှ ဒေါင်းလုဒ်ဆွဲထားသော QR PNG ဖိုင်များ။' : 'QR PNG files downloaded from public pages.'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အက်ပ် ဖွင့်မှုများ' : 'App opens'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.appOpens || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'မျှဝေစာမျက်နှာမှ တစ်ချက်နှိပ် ထည့်သွင်းမှု ကြိုးပမ်းချက်များ။' : 'One-click import attempts from the share page.'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဆက်တင်ဖိုင် ဒေါင်းလုဒ်များ' : 'Config downloads'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.configDownloads || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'အသုံးပြုသူများ ဒေါင်းလုဒ်ဆွဲထားသော ကလိုင်းယင့် ဆက်တင်ဖိုင်များ။' : 'Client config files downloaded by users.'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'တယ်လီဂရမ် ပေးပို့မှုများ' : 'Telegram sends'}</p>
                  <p className="mt-2 text-2xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.summary.telegramSends || 0}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isMyanmar ? 'တယ်လီဂရမ် မျှဝေမှုမှ စတင်ထားသော ပေးပို့မှုများ။' : 'Deliveries initiated through Telegram sharing.'}</p>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'အသုံးပြုခွင့်သော့ ဖိတ်ခေါ်လင့်ခ်များ' : 'Access-key invites'}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">
                      {isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် စွမ်းဆောင်ရည်' : 'Invite-link performance'}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isMyanmar
                        ? 'အသုံးပြုသူများ အများသုံး မျှဝေစာမျက်နှာသို့ မရောက်မီ အသုံးပြုခွင့်သော့ ဖိတ်ခေါ်လင့်ခ်များကို မည်သို့ ဖွင့်သည်ကို စောင့်ကြည့်ပါ။'
                        : 'Track how access-key invite links are opened before users reach the public share page.'}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {isMyanmar ? 'လက်ရှိဖိတ်ခေါ်လင့်ခ်များ' : 'Active invites'}
                      </p>
                      <p className="mt-2 text-xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.accessInviteSummary.activeInviteLinks || 0}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isMyanmar ? 'လက်ရှိ အသုံးပြုနိုင်သော အသုံးပြုခွင့်သော့ ဖိတ်ခေါ်လင့်ခ်များ။' : 'Currently usable access-key invite links.'}
                      </p>
                    </div>
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {isMyanmar ? 'စောင့်ကြည့်ထားသော သော့များ' : 'Tracked keys'}
                      </p>
                      <p className="mt-2 text-xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.accessInviteSummary.trackedAccessKeys || 0}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် တပ်ဆင်ထားသော အသုံးပြုခွင့်သော့များ။' : 'Access keys with invite links configured.'}
                      </p>
                    </div>
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် ဖွင့်မှုများ' : 'Invite opens'}
                      </p>
                      <p className="mt-2 text-xl font-semibold">{loadingShareDashboard ? '…' : shareDashboard?.accessInviteSummary.inviteOpens || 0}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isMyanmar ? 'ရွေးထားသော ကာလအတွင်း မှတ်တမ်းတင်ထားသော ဖိတ်ခေါ်လင့်ခ် ပြန်လည်ညွှန်ပေးမှုများ။' : 'Invite redirects recorded in the selected range.'}
                      </p>
                    </div>
                  </div>
                </div>

                {loadingShareDashboard ? (
                  <div className="mt-4 space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                    ))}
                  </div>
                ) : shareDashboard && shareDashboard.topAccessInviteKeys.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {shareDashboard.topAccessInviteKeys.map((key) => (
                      <div key={key.id} className="rounded-[1.2rem] border border-border/60 bg-background/65 p-4 dark:bg-white/[0.02]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/dashboard/keys/${key.id}`} className="truncate font-medium hover:text-primary">
                              {key.name}
                            </Link>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {key.publicSlug ? `/s/${key.publicSlug}` : isMyanmar ? 'တိုကင် မျှဝေလင့်ခ်' : 'Token share link'}
                            </p>
                          </div>
                          <Badge variant="outline">{key.inviteOpens} {isMyanmar ? 'ဖွင့်မှု' : 'opens'}</Badge>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {isMyanmar ? 'လက်ရှိလင့်ခ်များ' : 'Active links'}
                            </p>
                            <p className="mt-2 text-lg font-semibold">{key.activeInviteLinks}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{key.totalInviteLinks} {isMyanmar ? 'စုစုပေါင်း' : 'total'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {isMyanmar ? 'နောက်ဆုံး ဖွင့်မှု' : 'Last invite open'}
                            </p>
                            <p className="mt-2 text-sm font-medium">
                              {key.lastInviteOpenAt ? formatRelativeTime(key.lastInviteOpenAt) : isMyanmar ? 'ဖွင့်မှု မရှိသေးပါ' : 'No invite hits yet'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{key.pageViews} {isMyanmar ? 'မျှဝေစာမျက်နှာ ကြည့်ရှုမှု' : 'share-page views'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ops-chart-empty mt-4">
                    <div className="space-y-2 text-center">
                      <ExternalLink className="mx-auto h-8 w-8 text-muted-foreground/60" />
                      <p className="font-medium text-foreground">{isMyanmar ? 'အသုံးပြုခွင့်သော့ ဖိတ်ခေါ်လင့်ခ် လှုပ်ရှားမှု မရှိသေးပါ' : 'No access-key invite activity yet'}</p>
                      <p className="text-sm text-muted-foreground">
                        {isMyanmar
                          ? 'အသုံးပြုခွင့်သော့ အသေးစိတ်စာမျက်နှာတွင် ဖိတ်ခေါ်လင့်ခ် ဖန်တီးပြီး ဤနေရာတွင် ဖွင့်မှုနှင့် ပြောင်းလဲမှုများကို စတင်စောင့်ကြည့်ပါ။'
                          : 'Create invite links on an access-key detail page to start tracking opens and conversions here.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {loadingShareDashboard ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : shareDashboard && shareDashboard.topLinks.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {shareDashboard.topLinks.map((link) => (
                      <div key={`${link.type}-${link.id}`} className="ops-mobile-card space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={link.type === 'ACCESS_KEY' ? `/dashboard/keys/${link.id}` : `/dashboard/dynamic-keys/${link.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {link.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {link.type === 'ACCESS_KEY' ? (isMyanmar ? 'အသုံးပြုခွင့်သော့' : 'Access key') : (isMyanmar ? 'ပြောင်းလဲသတ်မှတ်သော့' : 'Dynamic key')}
                              {link.publicSlug ? ` · /s/${link.publicSlug}` : ''}
                            </p>
                          </div>
                          <Badge variant="outline">{link.metrics.pageViews} {isMyanmar ? 'ကြည့်ရှုမှု' : 'views'}</Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {isMyanmar ? 'ဖြစ်ရပ်များ' : 'Events'}
                            </p>
                            <p className="mt-2 text-lg font-semibold">{link.metrics.totalEvents}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {isMyanmar
                                ? `ဖိတ်ခေါ်မှု ${link.metrics.inviteOpens} · ကူးယူမှု ${link.metrics.copyClicks} · အက်ပ်ဖွင့်မှု ${link.metrics.appOpens}`
                                : `Invites ${link.metrics.inviteOpens} · Copies ${link.metrics.copyClicks} · App opens ${link.metrics.appOpens}`}
                            </p>
                          </div>
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {isMyanmar ? 'နောက်ဆုံး လှုပ်ရှားမှု' : 'Last activity'}
                            </p>
                            <p className="mt-2 text-sm font-medium">
                              {link.lastEventAt ? formatRelativeTime(link.lastEventAt) : isMyanmar ? 'မကြာသေးသော လှုပ်ရှားမှု မရှိပါ' : 'No recent activity'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {link.lastEventType ? getShareEventLabel(link.lastEventType, isMyanmar) : isMyanmar ? 'ပထမဆုံး လှုပ်ရှားမှုကို စောင့်နေသည်' : 'Waiting for first hit'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="ops-data-shell hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isMyanmar ? 'အများသုံး လင့်ခ်' : 'Public link'}</TableHead>
                          <TableHead className="text-right">{isMyanmar ? 'ကြည့်ရှုမှု' : 'Views'}</TableHead>
                          <TableHead className="text-right">{isMyanmar ? 'ဖိတ်ခေါ်မှု' : 'Invites'}</TableHead>
                          <TableHead className="text-right">{isMyanmar ? 'ကူးယူမှု' : 'Copies'}</TableHead>
                          <TableHead className="text-right">{isMyanmar ? 'ဒေါင်းလုဒ်' : 'Downloads'}</TableHead>
                          <TableHead className="text-right">{isMyanmar ? 'အက်ပ်ဖွင့်မှု' : 'App opens'}</TableHead>
                          <TableHead className="text-right">{isMyanmar ? 'တယ်လီဂရမ်' : 'Telegram'}</TableHead>
                          <TableHead>{isMyanmar ? 'နောက်ဆုံး လှုပ်ရှားမှု' : 'Last activity'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shareDashboard.topLinks.map((link) => (
                          <TableRow key={`${link.type}-${link.id}`}>
                            <TableCell>
                              <div className="space-y-1">
                                <Link
                                  href={link.type === 'ACCESS_KEY' ? `/dashboard/keys/${link.id}` : `/dashboard/dynamic-keys/${link.id}`}
                                  className="font-medium hover:text-primary"
                                >
                                  {link.name}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                  {link.type === 'ACCESS_KEY' ? (isMyanmar ? 'အသုံးပြုခွင့်သော့' : 'Access key') : (isMyanmar ? 'ပြောင်းလဲသတ်မှတ်သော့' : 'Dynamic key')}
                                  {link.publicSlug ? ` · /s/${link.publicSlug}` : ''}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.pageViews}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.inviteOpens}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.copyClicks}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.qrDownloads + link.metrics.configDownloads}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.appOpens}</TableCell>
                            <TableCell className="text-right font-mono">{link.metrics.telegramSends}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {link.lastEventAt ? (
                                <>
                                  <div>{formatRelativeTime(link.lastEventAt)}</div>
                                  <div className="text-xs">{link.lastEventType ? getShareEventLabel(link.lastEventType, isMyanmar) : ''}</div>
                                </>
                              ) : (
                                isMyanmar ? 'မကြာသေးသော လှုပ်ရှားမှု မရှိပါ' : 'No recent activity'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Share2 className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">{isMyanmar ? 'အများသုံး မျှဝေမှု လမ်းကြောင်းဒေတာ မရှိသေးပါ' : 'No public-share traffic yet'}</p>
                    <p className="text-sm text-muted-foreground">
                      {isMyanmar
                        ? 'အသုံးပြုသူများ စာမျက်နှာဖွင့်ခြင်း၊ config ကူးယူခြင်း သို့မဟုတ် client app ဖွင့်ခြင်းများ စတင်သောအခါ share-link ဖြစ်ရပ်များကို ဤနေရာတွင် တွေ့ရပါမည်။'
                        : 'Share-link events will appear here after users open pages, copy configs, or launch client apps.'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Clock className="h-5 w-5 text-primary" />
                {isMyanmar ? 'မကြာသေးသော မျှဝေလှုပ်ရှားမှု' : 'Recent share activity'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'အများသုံး လင့်ခ်များအပေါ် နောက်ဆုံး page views၊ copy actions၊ app launches နှင့် Telegram handoff များ။'
                  : 'Latest page views, copy actions, app launches, and Telegram handoffs across public links.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-0 pb-0">
              {loadingShareDashboard ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                ))
              ) : shareDashboard && shareDashboard.recentEvents.length > 0 ? (
                shareDashboard.recentEvents.map((event) => {
                  const icon = event.eventType === 'COPY_URL'
                    ? <Copy className="h-4 w-4" />
                    : event.eventType === 'INVITE_OPEN'
                      ? <ExternalLink className="h-4 w-4" />
                    : event.eventType === 'OPEN_QR'
                      ? <QrCode className="h-4 w-4" />
                      : event.eventType === 'DOWNLOAD_QR' || event.eventType === 'DOWNLOAD_CONFIG'
                        ? <Download className="h-4 w-4" />
                      : event.eventType === 'TELEGRAM_SENT' || event.eventType === 'TELEGRAM_CONNECTED'
                        ? <Send className="h-4 w-4" />
                        : <Share2 className="h-4 w-4" />;

                  return (
                    <div key={event.id} className="ops-row-card flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2 text-primary">{icon}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {event.entityId ? (
                              <Link
                                href={event.type === 'ACCESS_KEY' ? `/dashboard/keys/${event.entityId}` : `/dashboard/dynamic-keys/${event.entityId}`}
                                className="truncate font-medium hover:text-primary"
                              >
                                {event.entityName}
                              </Link>
                            ) : (
                              <span className="truncate font-medium">{event.entityName}</span>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {event.type === 'ACCESS_KEY' ? (isMyanmar ? 'အသုံးပြုခွင့်သော့' : 'Access key') : (isMyanmar ? 'ပြောင်းလဲသတ်မှတ်သော့' : 'Dynamic key')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {getShareEventLabel(event.eventType, isMyanmar)}
                            {event.platform ? ` · ${event.platform}` : ''}
                            {event.source ? ` · ${event.source}` : ''}
                            {event.publicSlug ? ` · /s/${event.publicSlug}` : ''}
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(event.createdAt)}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Clock className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">{isMyanmar ? 'မကြာသေးသော မျှဝေလှုပ်ရှားမှု မရှိပါ' : 'No recent share activity'}</p>
                    <p className="text-sm text-muted-foreground">
                      {isMyanmar
                        ? 'အသုံးပြုသူများ share လင့်ခ်များကို စတင်အသုံးပြုသောအခါ နောက်ဆုံး အများသုံး လှုပ်ရှားမှုများကို ဤနေရာတွင် တွေ့ရပါမည်။'
                        : 'The latest public interactions will appear here once users start using share links.'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Send className="h-5 w-5 text-primary" />
                    {isMyanmar ? 'တယ်လီဂရမ် အရောင်း' : 'Telegram sales'}
                  </CardTitle>
                  <CardDescription>
                    {isMyanmar
                      ? 'Telegram order ပမာဏ၊ စစ်ဆေးနှုန်း၊ plan စွမ်းဆောင်ရည်နှင့် လက်ခံရရှိသော ဝင်ငွေ အချက်အလက်များကို စောင့်ကြည့်ပါ။'
                      : 'Track Telegram order volume, review speed, plan performance, and collected pricing signals.'}
                  </CardDescription>
                </div>
                <Select
                  value={telegramSalesRange}
                  onValueChange={(value) => setTelegramSalesRange(value as '24h' | '7d' | '30d')}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-0 pb-0">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အော်ဒါများ' : 'Orders'}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.summary.totalOrders || 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isMyanmar ? 'ရွေးထားသော ကာလအတွင်း စုစုပေါင်း တယ်လီဂရမ် အရောင်း အော်ဒါများ။' : 'Total Telegram sales orders in the selected range.'}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'စစ်ဆေးရန် စောင့်နေ' : 'Pending review'}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.summary.pendingReview || 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isMyanmar ? 'ငွေပေးချေမှု အထောက်အထားကို စီမံခန့်ခွဲသူ စစ်ဆေးရန် စောင့်နေသော အော်ဒါများ။' : 'Orders waiting for payment-proof review.'}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပြီးမြောက်ပြီး' : 'Fulfilled'}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.summary.fulfilled || 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isMyanmar ? 'သော့အသစ် ဖန်တီးခြင်း သို့မဟုတ် သက်တမ်းတိုးမှု အောင်မြင်ပြီးသော အော်ဒါများ။' : 'Orders that created or renewed keys successfully.'}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အထောက်အထား စောင့်နေ' : 'Awaiting proof'}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.summary.awaitingPayment || 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isMyanmar ? 'အသုံးပြုသူများသည် ငွေပေးချေ နည်းလမ်း ရွေးနေဆဲ သို့မဟုတ် အထောက်အထား တင်နေဆဲ ဖြစ်သည်။' : 'Users still choosing a payment method or uploading proof.'}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပျမ်းမျှ စစ်ဆေးချိန်' : 'Avg review time'}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard
                      ? '…'
                      : telegramSalesDashboard?.averages.reviewMinutes !== null &&
                          telegramSalesDashboard?.averages.reviewMinutes !== undefined
                        ? `${Math.round(telegramSalesDashboard.averages.reviewMinutes)}m`
                        : '—'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isMyanmar ? 'အထောက်အထား တင်ပြီးမှ စီမံခန့်ခွဲသူ စစ်ဆေးချိန်အထိ ပျမ်းမျှကြာချိန်။' : 'From proof upload to admin review.'}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပျမ်းမျှ ပေးပို့ချိန်' : 'Avg fulfillment'}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {loadingTelegramSalesDashboard
                      ? '…'
                      : telegramSalesDashboard?.averages.fulfillmentMinutes !== null &&
                          telegramSalesDashboard?.averages.fulfillmentMinutes !== undefined
                        ? `${Math.round(telegramSalesDashboard.averages.fulfillmentMinutes)}m`
                        : '—'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isMyanmar ? 'အထောက်အထား တင်ပြီးမှ အသုံးပြုခွင့် ပေးပို့ပြီးချိန်အထိ ပျမ်းမျှကြာချိန်။' : 'From proof upload to delivered access.'}
                  </p>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အဆင့်မြင့် ပြောင်းလဲသတ်မှတ်သော့ အရောင်း' : 'Premium dynamic sales'}</p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'အဆင့်မြင့် အကူအညီနှင့် လိုအပ်ချက်' : 'Premium support and demand'}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isMyanmar
                        ? 'ပုံမှန် တယ်လီဂရမ် အရောင်းမျက်နှာစာမှ အဆင့်မြင့် ပြောင်းလဲသတ်မှတ်သော့ အရောင်း၊ ဒေသလိုအပ်ချက်နှင့် အကူအညီ စာရင်းကို သီးခြားကြည့်ရှုပါ။'
                        : 'Split premium dynamic-key sales, region demand, and support workload from the normal Telegram storefront.'}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {loadingTelegramSalesDashboard
                      ? '…'
                      : isMyanmar
                        ? `${telegramSalesDashboard?.premium.summary.openSupportRequests || 0} ခု ဖွင့်ထားသည်`
                        : `${telegramSalesDashboard?.premium.summary.openSupportRequests || 0} open support`}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အဆင့်မြင့် အော်ဒါများ' : 'Premium orders'}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.premium.summary.premiumOrders || 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isMyanmar ? 'ပြောင်းလဲသတ်မှတ်သော့အဖြစ် ပေးပို့ပြီးသော တယ်လီဂရမ် အဆင့်မြင့် အော်ဒါများ။' : 'Telegram premium orders delivered as dynamic keys.'}
                    </p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အသက်ဝင် အဆင့်မြင့် အသုံးပြုသူ' : 'Active premium users'}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.premium.summary.activeUsers || 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isMyanmar ? 'ရွေးထားသော ကာလအတွင်း အဆင့်မြင့် ပြောင်းလဲသတ်မှတ် အော်ဒါ ပြီးမြောက်ခဲ့သော ထူးခြား တယ်လီဂရမ် အသုံးပြုသူများ။' : 'Unique Telegram users with fulfilled premium dynamic orders in range.'}
                    </p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အသက်ဝင် အဆင့်မြင့် သော့များ' : 'Active premium keys'}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.premium.summary.activeDynamicKeys || 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isMyanmar ? 'ရွေးထားသော ကာလအတွင်း ပေးပို့ပြီးသော အဆင့်မြင့် ပြောင်းလဲသတ်မှတ်သော့များ။' : 'Premium dynamic keys fulfilled in the selected range.'}
                    </p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပြီးစီးသော အကူအညီ တောင်းဆိုမှု' : 'Handled support'}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {loadingTelegramSalesDashboard
                        ? '…'
                        : (telegramSalesDashboard?.premium.summary.approvedRegionRequests || 0) +
                          (telegramSalesDashboard?.premium.summary.handledSupportRequests || 0)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {loadingTelegramSalesDashboard
                        ? '…'
                        : isMyanmar
                          ? `${telegramSalesDashboard?.premium.summary.dismissedSupportRequests || 0} ခု ပယ်ဖျက်`
                          : `${telegramSalesDashboard?.premium.summary.dismissedSupportRequests || 0} dismissed`}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပထမဆုံး ပြန်ကြားချိန် ပျမ်းမျှ' : 'Avg first response'}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {loadingTelegramSalesDashboard
                        ? '…'
                        : formatDurationMetric(
                            telegramSalesDashboard?.premium.sla.avgFirstResponseMinutes,
                          )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'တောင်းဆိုချက် တင်သွင်းချိန်မှ ပထမဆုံး စီမံခန့်ခွဲသူ စစ်ဆေးချိန်အထိ။' : 'From request submission to first admin review.'}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဖြေရှင်းချိန် ပျမ်းမျှ' : 'Avg resolution'}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {loadingTelegramSalesDashboard
                        ? '…'
                        : formatDurationMetric(
                            telegramSalesDashboard?.premium.sla.avgResolutionMinutes,
                          )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'တောင်းဆိုချက် တင်သွင်းချိန်မှ အတည်ပြု၊ ကိုင်တွယ်ပြီး သို့မဟုတ် ပယ်ဖျက်သည်အထိ။' : 'From request submission to approved, handled, or dismissed.'}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? '၆ နာရီကျော် စောင့်ဆိုင်းမှု' : 'Backlog > 6h'}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {loadingTelegramSalesDashboard
                        ? '…'
                        : telegramSalesDashboard?.premium.sla.openOlderThan6Hours || 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {loadingTelegramSalesDashboard
                        ? '…'
                          : isMyanmar
                            ? `၂၄ နာရီကျော် ${telegramSalesDashboard?.premium.sla.openOlderThan24Hours || 0} ခု`
                            : `${telegramSalesDashboard?.premium.sla.openOlderThan24Hours || 0} older than 24h`}
                    </p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အကြာဆုံး စောင့်ဆိုင်းနေမှု' : 'Oldest open'}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {loadingTelegramSalesDashboard
                        ? '…'
                        : formatDurationMetric(
                            telegramSalesDashboard?.premium.sla.oldestOpenMinutes,
                          )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'စောင့်ဆိုင်းစာရင်းထဲရှိ အကြာဆုံး အဆင့်မြင့် အကူအညီ တောင်းဆိုမှု။' : 'Oldest pending premium support request in the queue.'}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-4 dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အဆင့်မြင့် ဝင်ငွေ' : 'Premium revenue'}</p>
                    <div className="mt-3 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(2)].map((_, i) => (
                          <div key={i} className="h-16 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.premium.revenueByCurrency.length > 0 ? (
                        telegramSalesDashboard.premium.revenueByCurrency.map((revenue) => (
                          <div key={revenue.currency} className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{revenue.currency}</p>
                            <p className="mt-2 text-xl font-semibold">{formatRevenueLabel(revenue.currency, revenue.amount)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'အဆင့်မြင့် ဝင်ငွေ မရှိသေးပါ။' : 'No premium revenue yet.'}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-4 dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဒေသ လိုအပ်ချက်' : 'Region demand'}</p>
                    <div className="mt-3 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-14 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.premium.regionDemand.length > 0 ? (
                        telegramSalesDashboard.premium.regionDemand.slice(0, 6).map((region) => (
                          <div key={region.region} className="ops-mini-tile">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">{region.region}</p>
                              <Badge variant="outline">{region.count}</Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'အဆင့်မြင့် ဒေသ တောင်းဆိုမှု မရှိသေးပါ။' : 'No premium region requests yet.'}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-4 dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဆာဗာအလိုက် လမ်းကြောင်း ပြဿနာများ' : 'Route issues by server'}</p>
                    <div className="mt-3 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-14 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.premium.routeIssuesByServer.length > 0 ? (
                        telegramSalesDashboard.premium.routeIssuesByServer.slice(0, 6).map((server) => (
                          <div key={server.label} className="ops-mini-tile">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">{server.label}</p>
                              <Badge variant="outline">{server.count}</Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'အဆင့်မြင့် လမ်းကြောင်း ပြဿနာ မရှိသေးပါ။' : 'No premium route issues yet.'}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-4 dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အဆိုးဆုံး ဒေသ' : 'Most degraded region'}</p>
                    <div className="mt-3 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-14 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.premium.mostDegradedRegions.length > 0 ? (
                        telegramSalesDashboard.premium.mostDegradedRegions.map((region) => (
                          <div key={region.region} className="ops-mini-tile">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">{region.region}</p>
                              <Badge variant="outline">{region.count}</Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'ထိခိုက်နေသော အဆင့်မြင့် ဒေသ မရှိသေးပါ။' : 'No degraded premium regions yet.'}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-4 dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အများဆုံး တောင်းဆိုသော အရန်ဒေသ' : 'Most requested fallback'}</p>
                    <div className="mt-3 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-14 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.premium.mostRequestedFallbackRegions.length > 0 ? (
                        telegramSalesDashboard.premium.mostRequestedFallbackRegions.map((region) => (
                          <div key={region.region} className="ops-mini-tile">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">{region.region}</p>
                              <Badge variant="outline">{region.count}</Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'အရန်ပြောင်းလဲ လှုပ်ရှားမှု မရှိသေးပါ။' : 'No fallback activity yet.'}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-4 dark:bg-white/[0.02]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဒေသအလိုက် ပြန်ကောင်းချိန်' : 'Recovery time by region'}</p>
                    <div className="mt-3 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-14 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.premium.recoveryTimeByRegion.length > 0 ? (
                        telegramSalesDashboard.premium.recoveryTimeByRegion.map((region) => (
                          <div key={region.region} className="ops-mini-tile">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">{region.region}</p>
                              <Badge variant="outline">{region.recoveries}</Badge>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {region.avgMinutes !== null
                                ? isMyanmar
                                  ? `ပျမ်းမျှ ${Math.round(region.avgMinutes)} မိနစ်`
                                  : `${Math.round(region.avgMinutes)} min avg`
                                : isMyanmar
                                  ? 'ပြန်ကောင်းချိန် မရှိသေးပါ'
                                  : 'No recovery time yet'}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'ပြန်ကောင်းပြီးသော အဆင့်မြင့် ဖြစ်ရပ် မရှိသေးပါ။' : 'No recovered premium incidents yet.'}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.2rem] border border-border/60 bg-background/60 p-4 dark:bg-white/[0.02]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဖြစ်ရပ်တစ်ခုချင်းစီအလိုက် ထိခိုက်သော အဆင့်မြင့် အသုံးပြုသူများ' : 'Affected premium users by incident'}</p>
                  <div className="mt-3 space-y-3">
                    {loadingTelegramSalesDashboard ? (
                      [...Array(3)].map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                      ))
                    ) : telegramSalesDashboard && telegramSalesDashboard.premium.affectedUsersByIncident.length > 0 ? (
                      telegramSalesDashboard.premium.affectedUsersByIncident.map((incident) => (
                        <div key={incident.incidentKey} className="ops-mini-tile">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{incident.region}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Started {formatRelativeTime(new Date(incident.startedAt))}
                              </p>
                            </div>
                            <Badge variant="outline">{incident.affectedUsers} users</Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">{isMyanmar ? 'အဆင့်မြင့် ဖြစ်ရပ် မှတ်တမ်း မရှိသေးပါ။' : 'No premium incidents recorded yet.'}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ထိပ်ဆုံး အစီအစဉ်များ' : 'Top plans'}</p>
                      <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'အစီအစဉ် စွမ်းဆောင်ရည်' : 'Plan performance'}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {isMyanmar
                          ? 'Order ပမာဏနှင့် ပြီးမြောက်သော ဝင်ငွေအလိုက် အကောင်းဆုံး Telegram plan များ။'
                          : 'Best-performing Telegram plans by order volume and fulfilled revenue.'}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {loadingTelegramSalesDashboard
                        ? '…'
                        : isMyanmar
                          ? `${telegramSalesDashboard?.summary.newOrders || 0} ခု အသစ် / ${telegramSalesDashboard?.summary.renewalOrders || 0} ခု renewal`
                          : `${telegramSalesDashboard?.summary.newOrders || 0} new / ${telegramSalesDashboard?.summary.renewalOrders || 0} renew`}
                    </Badge>
                  </div>

                  {loadingTelegramSalesDashboard ? (
                    <div className="mt-4 space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                      ))}
                    </div>
                  ) : telegramSalesDashboard && telegramSalesDashboard.topPlans.length > 0 ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {telegramSalesDashboard.topPlans.map((plan) => (
                        <div key={plan.planCode || plan.planName} className="rounded-[1.2rem] border border-border/60 bg-background/65 p-4 dark:bg-white/[0.02]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{plan.planName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {plan.planCode || (isMyanmar ? 'စိတ်ကြိုက် အစီအစဉ်' : 'Custom plan')}
                              </p>
                            </div>
                            <Badge variant="outline">{isMyanmar ? `${plan.orders} ခု` : `${plan.orders} orders`}</Badge>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ပြီးမြောက်ပြီး' : 'Fulfilled'}</p>
                              <p className="mt-2 text-lg font-semibold">{plan.fulfilled}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {plan.orders > 0
                                  ? isMyanmar
                                    ? `${Math.round((plan.fulfilled / plan.orders) * 100)}% အောင်မြင်`
                                    : `${Math.round((plan.fulfilled / plan.orders) * 100)}% success`
                                  : isMyanmar
                                    ? 'Approve မရှိသေးပါ'
                                    : 'No approvals yet'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ဝင်ငွေ' : 'Revenue'}</p>
                              <div className="mt-2 space-y-1">
                                {plan.revenueByCurrency.length > 0 ? (
                                  plan.revenueByCurrency.map((revenue) => (
                                    <p key={`${plan.planCode || plan.planName}-${revenue.currency}`} className="text-sm font-medium">
                                      {formatRevenueLabel(revenue.currency, revenue.amount)}
                                    </p>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'စျေးနှုန်းပါသော ပြီးမြောက်မှု မရှိသေးပါ' : 'No priced fulfillments yet'}</p>
                                )}
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {plan.orders > 0
                                    ? isMyanmar
                                      ? `${Math.round(plan.conversionRate)}% ပြောင်းလဲမှု`
                                      : `${Math.round(plan.conversionRate)}% conversion`
                                    : isMyanmar
                                      ? 'ပြောင်းလဲမှု မရှိသေးပါ'
                                      : 'No conversions yet'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ops-chart-empty mt-4">
                      <div className="space-y-2 text-center">
                        <Send className="mx-auto h-8 w-8 text-muted-foreground/60" />
                        <p className="font-medium text-foreground">{isMyanmar ? 'တယ်လီဂရမ် အရောင်းဒေတာ မရှိသေးပါ' : 'No Telegram sales data yet'}</p>
                        <p className="text-sm text-muted-foreground">
                          {isMyanmar
                            ? 'ဘော့မှ စတင်သော အော်ဒါများ ပေါ်လာသည်နှင့် အစီအစဉ် စွမ်းဆောင်ရည်နှင့် ဝင်ငွေကို ဤနေရာတွင် ပြမည်။'
                            : 'Orders created from the bot will show plan performance and revenue here.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပြောင်းလဲမှု လမ်းကြောင်း' : 'Conversion funnel'}</p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'တယ်လီဂရမ် ဝယ်ယူမှု လုပ်ငန်းစဉ်' : 'Telegram storefront flow'}</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'စစ်ဆေးနှုန်း' : 'Review velocity'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : formatDurationMetric(telegramSalesDashboard?.averages.reviewMinutes)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isMyanmar ? 'ငွေလွှဲအထောက်အထား တင်ပြီးမှ စစ်ဆေးချိန်အထိ ပျမ်းမျှကြာချိန်' : 'Average time from proof to review'}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'ပေးပို့နှုန်း' : 'Fulfillment velocity'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : formatDurationMetric(telegramSalesDashboard?.averages.fulfillmentMinutes)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isMyanmar ? 'ငွေလွှဲအထောက်အထား တင်ပြီးမှ ပေးပို့ချိန်အထိ ပျမ်းမျှကြာချိန်' : 'Average time from proof to delivery'}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'နောက်ဆုံး ပြောင်းလဲမှု' : 'Final conversion'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : `${Math.round(telegramFunnelSteps[telegramFunnelSteps.length - 1]?.cumulativeRate || 0)}%`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isMyanmar ? 'စတင်ဖန်တီးခဲ့သော အော်ဒါများအနက် ပြီးမြောက်သွားသော အချိုး' : 'Created orders that became fulfilled'}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'အများဆုံး ကျဆင်းရာအဆင့်' : 'Largest drop-off'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : `${Math.max(...telegramFunnelSteps.map((step) => step.dropOff))}`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isMyanmar ? 'အဆင့်တစ်ခုနှင့် နောက်အဆင့်ကြား လက်လွတ်သွားသော အသုံးပြုသူများ' : 'Users lost between one step and the next'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {telegramFunnelSteps.map((step) => (
                        <div key={step.key} className="ops-mini-tile">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {step.label}
                              </p>
                              <p className="mt-2 text-2xl font-semibold">
                                {loadingTelegramSalesDashboard ? '…' : step.value}
                              </p>
                            </div>
                            <Badge variant="outline" className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100">
                              {step.key === 'started'
                                ? isMyanmar ? '100% စတင်' : '100% start'
                                : isMyanmar
                                  ? `ယခင်အဆင့်မှ ${Math.round(step.stepRate)}%`
                                  : `${Math.round(step.stepRate)}% from prev`}
                            </Badge>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-cyan-400 transition-[width]"
                              style={{ width: `${Math.max(step.cumulativeRate, step.value > 0 ? 6 : 0)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {step.key === 'started'
                              ? isMyanmar
                                ? 'ဝယ်ယူမှု လမ်းကြောင်းအတွက် စတင်အခြေခံ'
                                : 'Baseline for the storefront funnel'
                              : isMyanmar
                                ? `ဤအဆင့်မရောက်မီ ${step.dropOff} ခု ကျဆင်းခဲ့သည် • စတင်ခဲ့သော အသုံးပြုသူများ၏ ${Math.round(step.cumulativeRate)}% သည် ဤနေရာသို့ ရောက်သည်`
                                : `${step.dropOff} dropped before this step • ${Math.round(step.cumulativeRate)}% of bot starters reached here`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အစီအစဉ်အလိုက် ပြောင်းလဲမှု' : 'Plan conversion'}</p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'အစီအစဉ်အလိုက် ရောင်းချမှု စွမ်းဆောင်ရည်' : 'Sales performance by plan'}</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {telegramSalesDashboard?.topPlans.map((plan) => (
                        <div key={plan.planCode || plan.planName} className="ops-mini-tile">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{plan.planName}</p>
                          <p className="mt-2 text-2xl font-semibold">
                            {Math.round(plan.conversionRate)}%
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {plan.fulfilled} / {plan.orders} {isMyanmar ? 'အော်ဒါ ပြီးမြောက်သည်' : 'orders fulfilled'}
                          </p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-cyan-400 transition-[width]"
                              style={{ width: `${Math.max(plan.conversionRate, plan.fulfilled > 0 ? 6 : 0)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သတိပေးစာ ပြောင်းလဲမှု' : 'Reminder conversion'}</p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'သတိပေးစာ ထိရောက်မှု' : 'Reminder effectiveness'}</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ငွေပေးချေမှု သတိပေးစာများ' : 'Payment reminders'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.reminders.paymentReminderSent || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `သတိပေးစာ နောက်ပိုင်း ${telegramSalesDashboard?.reminders.paymentReminderConverted || 0} ခု ရှေ့ဆက်သွားသည်`
                              : `${telegramSalesDashboard?.reminders.paymentReminderConverted || 0} progressed after reminder`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'စစ်ဆေးမှု သတိပေးစာများ' : 'Review reminders'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.reminders.pendingReviewReminderSent || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `သတိပေးစာ နောက်ပိုင်း ${telegramSalesDashboard?.reminders.pendingReviewReminderConverted || 0} ခု ပြီးမြောက်သည်`
                              : `${telegramSalesDashboard?.reminders.pendingReviewReminderConverted || 0} fulfilled after reminder`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ငြင်းပယ်ပြီးနောက် နောက်ဆက်တွဲ' : 'Rejected follow-ups'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.reminders.rejectedFollowUpSent || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `သတိပေးစာ နောက်ပိုင်း ${telegramSalesDashboard?.reminders.rejectedFollowUpConverted || 0} ခု ပြန်ကြိုးစားသည်`
                              : `${telegramSalesDashboard?.reminders.rejectedFollowUpConverted || 0} retried after reminder`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပြန်ကြိုးစားရန် တွန်းအားပေးစာများ' : 'Retry nudges'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.reminders.retryReminderSent || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `သတိပေးစာ နောက်ပိုင်း ${telegramSalesDashboard?.reminders.retryReminderConverted || 0} ခု ပြန်စသည်`
                              : `${telegramSalesDashboard?.reminders.retryReminderConverted || 0} resumed after reminder`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သက်တမ်းတိုး ပြောင်းလဲနှုန်း' : 'Renewal conversion'}</p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'သက်တမ်းတိုး ထိန်းသိမ်းမှု' : 'Renewal retention'}</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သက်တမ်းတိုး အော်ဒါများ' : 'Renewal orders'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.renewalConversion.totalOrders || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'တယ်လီဂရမ်မှ စတင်သော သက်တမ်းတိုး တောင်းဆိုမှုများ။' : 'Renew requests created from Telegram.'}</p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သက်တမ်းတိုး နှုန်း' : 'Renewal rate'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : telegramSalesDashboard?.renewalConversion.conversionRate !== null &&
                                telegramSalesDashboard?.renewalConversion.conversionRate !== undefined
                              ? `${Math.round(telegramSalesDashboard.renewalConversion.conversionRate)}%`
                              : '0%'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `သက်တမ်းတိုး ${telegramSalesDashboard?.renewalConversion.fulfilledOrders || 0} ခု ပြီးမြောက်သည်`
                              : `${telegramSalesDashboard?.renewalConversion.fulfilledOrders || 0} fulfilled renewals`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပြန်လည်ရယူမှု လုပ်ငန်းစဉ်များ' : 'Recovery flows'}</p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'ပြန်လည်ရရှိသော အရောင်း' : 'Recovered sales'}</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပြန်ကြိုးစားသော အော်ဒါများ' : 'Retried orders'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.retention.retriedOrders || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `Retry နောက်ပိုင်း ${telegramSalesDashboard?.retention.retriedFulfilled || 0} ခု ပြီးမြောက်သည်`
                              : `${telegramSalesDashboard?.retention.retriedFulfilled || 0} fulfilled after retry`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အစမ်းသုံးမှ အဆင့်မြှင့် ဝယ်ယူမှုများ' : 'Trial upsells'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.retention.trialUpsellOrders || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `Trial ပြီးဆုံးချိန် prompt များမှ ${telegramSalesDashboard?.retention.trialUpsellFulfilled || 0} ခု ပြီးမြောက်သည်`
                              : `${telegramSalesDashboard?.retention.trialUpsellFulfilled || 0} fulfilled from trial-ending prompts`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သက်တမ်းကုန်ပြီးနောက် ပြန်ရယူမှု' : 'Expired recovery'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.retention.expiredRecoveryOrders || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `သက်တမ်းကုန်ပြီးနောက် ပြန်ရယူမှုမှ ${telegramSalesDashboard?.retention.expiredRecoveryFulfilled || 0} ခု ပြီးမြောက်သည်`
                              : `${telegramSalesDashboard?.retention.expiredRecoveryFulfilled || 0} fulfilled after expiry recovery`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အဆင့်မြင့် သက်တမ်းတိုး သတိပေးချက်များ' : 'Premium renewal prompts'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.retention.premiumRenewalOrders || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `အဆင့်မြင့် သက်တမ်းတိုး သတိပေးချက်များမှ ${telegramSalesDashboard?.retention.premiumRenewalFulfilled || 0} ခု ပြီးမြောက်သည်`
                              : `${telegramSalesDashboard?.retention.premiumRenewalFulfilled || 0} fulfilled from premium renewal prompts`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'ကူပွန် လုပ်ဆောင်ရည်' : 'Coupon performance'}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'ပရိုမိုးရှင်း ပြောင်းလဲမှု' : 'Promo conversion'}</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'ထုတ်ပေးထားသော ကူပွန်များ' : 'Coupons issued'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.coupons.summary.issued || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isMyanmar ? 'ဤအချိန်အပိုင်းအခြားအတွင်း ကမ်ပိန်း လျှော့ဈေးကူပွန်များ ပို့ထားသည်။' : 'Campaign coupons sent in this range.'}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'အသုံးပြုပြီးသော ကူပွန်များ' : 'Coupons redeemed'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.coupons.summary.redeemed || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : telegramSalesDashboard?.coupons.summary.redemptionRate !== null &&
                                telegramSalesDashboard?.coupons.summary.redemptionRate !== undefined
                              ? isMyanmar
                                ? `${Math.round(telegramSalesDashboard.coupons.summary.redemptionRate)}% အသုံးပြုနှုန်း`
                                : `${Math.round(telegramSalesDashboard.coupons.summary.redemptionRate)}% redemption rate`
                              : isMyanmar
                                ? 'အသုံးပြုထားသော coupon မရှိသေးပါ'
                                : 'No redemptions yet'}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'ကူပွန်နှင့် ဆက်စပ်သော အော်ဒါများ' : 'Coupon-backed orders'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.coupons.summary.attributedOrders || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : isMyanmar
                              ? `ကူပွန်ဈေးနှုန်းဖြင့် ${telegramSalesDashboard?.coupons.summary.attributedFulfilled || 0} ခု ပြီးမြောက်သည်`
                              : `${telegramSalesDashboard?.coupons.summary.attributedFulfilled || 0} fulfilled with coupon pricing`}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'ကူပွန် ပြောင်းလဲမှုနှုန်း' : 'Coupon conversion'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : telegramSalesDashboard?.coupons.summary.attributedConversionRate !== null &&
                                telegramSalesDashboard?.coupons.summary.attributedConversionRate !== undefined
                              ? `${Math.round(telegramSalesDashboard.coupons.summary.attributedConversionRate)}%`
                              : '0%'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isMyanmar ? 'ကူပွန်ဖြင့် စတင်သော ငွေရှင်းလုပ်ငန်းစဉ်များမှ တွက်ချက်ထားသည်။' : 'From coupon-attributed checkout starts.'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
                      <div className="space-y-3">
                        {loadingTelegramSalesDashboard ? (
                          [...Array(3)].map((_, i) => (
                            <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                          ))
                        ) : telegramSalesDashboard && telegramSalesDashboard.coupons.byCampaign.length > 0 ? (
                          telegramSalesDashboard.coupons.byCampaign.map((campaign) => {
                            const labelMap: Record<string, string> = {
                              TRIAL_TO_PAID: isMyanmar ? 'အစမ်းသုံးမှ ငွေပေးချေမှုသို့' : 'Trial to paid',
                              RENEWAL_SOON: isMyanmar ? 'သက်တမ်းတိုး ကူပွန်' : 'Renewal coupon',
                              PREMIUM_UPSELL: isMyanmar ? 'အဆင့်မြှင့် ဝယ်ယူမှု အကြံပြု' : 'Premium upsell',
                              WINBACK: isMyanmar ? 'ပြန်လည်ဖိတ်ခေါ်မှု' : 'Win-back',
                            };
                            return (
                              <div
                                key={campaign.campaignType}
                                className="rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {labelMap[campaign.campaignType] || campaign.campaignType}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {isMyanmar
                                        ? `${campaign.issued} ခု ထုတ်ပေး • ${campaign.redeemed} ခု အသုံးပြု • ${campaign.attributedOrders} ခု order`
                                        : `${campaign.issued} issued • ${campaign.redeemed} redeemed • ${campaign.attributedOrders} orders`}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {campaign.redemptionRate !== null && campaign.redemptionRate !== undefined
                                        ? isMyanmar
                                          ? `${Math.round(campaign.redemptionRate)}% အသုံးပြုနှုန်း`
                                          : `${Math.round(campaign.redemptionRate)}% redemption`
                                        : isMyanmar
                                          ? 'အသုံးပြုထားမှု မရှိသေးပါ'
                                          : 'No redemption yet'}
                                      {' • '}
                                      {campaign.conversionRate !== null && campaign.conversionRate !== undefined
                                        ? isMyanmar
                                          ? `${Math.round(campaign.conversionRate)}% checkout ပြောင်းလဲမှု`
                                          : `${Math.round(campaign.conversionRate)}% checkout conversion`
                                        : isMyanmar
                                          ? 'checkout ပြောင်းလဲမှု မရှိသေးပါ'
                                          : 'No checkout conversion yet'}
                                    </p>
                                  </div>
                                  <Badge variant="outline">
                                    {isMyanmar ? `${campaign.fulfilledOrders} ခု ပြီးမြောက်` : `${campaign.fulfilledOrders} fulfilled`}
                                  </Badge>
                                </div>
                                {campaign.revenueByCurrency.length > 0 ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {campaign.revenueByCurrency.map((revenue) => (
                                      <Badge key={revenue.currency} variant="secondary">
                                        {formatRevenueLabel(revenue.currency, revenue.amount)}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        ) : (
                          <div className="ops-chart-empty">
                            <div className="space-y-2 text-center">
                              <Wallet className="mx-auto h-8 w-8 text-muted-foreground/60" />
                              <p className="font-medium text-foreground">{isMyanmar ? 'ကူပွန် ကမ်ပိန်း မရှိသေးပါ' : 'No coupon campaigns yet'}</p>
                              <p className="text-sm text-muted-foreground">
                                {isMyanmar
                                  ? 'အစမ်းသုံး၊ သက်တမ်းတိုး၊ အဆင့်မြှင့်တင်ဝယ်ယူမှု သို့မဟုတ် ပြန်လည်ဖိတ်ခေါ်မှု ကူပွန်များကို ဖွင့်ပြီး ပရိုမိုးရှင်း လုပ်ဆောင်ရည်ကို ဤနေရာတွင် ကြည့်ပါ။'
                                  : 'Enable trial, renewal, upsell, or win-back coupons to see promo performance here.'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {isMyanmar ? 'လျှော့ဈေးတန်ဖိုး' : 'Discount value'}
                          </p>
                          <div className="mt-3 space-y-2">
                            {loadingTelegramSalesDashboard ? (
                              <div className="h-24 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                            ) : telegramSalesDashboard && telegramSalesDashboard.coupons.summary.discountValueByCurrency.length > 0 ? (
                              telegramSalesDashboard.coupons.summary.discountValueByCurrency.map((entry) => (
                                <div key={entry.currency} className="ops-mini-tile">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    {entry.currency}
                                  </p>
                                  <p className="mt-2 text-xl font-semibold">
                                    {formatRevenueLabel(entry.currency, entry.amount)}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {isMyanmar ? 'အသုံးပြုပြီးသော လျှော့ဈေးတန်ဖိုး။' : 'Redeemed discount value.'}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {isMyanmar ? 'ဤအချိန်အပိုင်းအခြားတွင် အသုံးပြုပြီးသော လျှော့ဈေး မရှိသေးပါ။' : 'No redeemed discounts in this range.'}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {isMyanmar ? 'အထိပ်တန်း ကူပွန်ကုဒ်များ' : 'Top coupon codes'}
                          </p>
                          <div className="mt-3 space-y-2">
                            {loadingTelegramSalesDashboard ? (
                              <div className="h-24 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                            ) : telegramSalesDashboard && telegramSalesDashboard.coupons.byCode.length > 0 ? (
                              telegramSalesDashboard.coupons.byCode.map((code) => (
                                <div key={code.couponCode} className="flex items-center justify-between gap-3 rounded-[1rem] border border-border/50 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{code.couponCode}</p>
                                    <p className="text-xs text-muted-foreground">{code.campaignType}</p>
                                  </div>
                                  <Badge variant="outline">
                                    {code.redeemed}/{code.issued}
                                  </Badge>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {isMyanmar ? 'ထုတ်ပေးထားသော ကူပွန်ကုဒ် မရှိသေးပါ။' : 'No coupon codes issued yet.'}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'ကူပွန် ပါ/မပါ ပြောင်းလဲမှုနှုန်း' : 'Coupon vs no-coupon conversion'}
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {[
                            {
                              label: isMyanmar ? 'ကူပွန်ပါသော အော်ဒါ' : 'With coupon',
                              data: telegramSalesDashboard?.coupons.couponVsNonCoupon.withCoupon,
                            },
                            {
                              label: isMyanmar ? 'ကူပွန်မပါသော အော်ဒါ' : 'Without coupon',
                              data: telegramSalesDashboard?.coupons.couponVsNonCoupon.withoutCoupon,
                            },
                          ].map((entry) => (
                            <div
                              key={entry.label}
                              className="rounded-[1rem] border border-border/50 p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium">{entry.label}</p>
                                <Badge variant="outline">
                                  {loadingTelegramSalesDashboard
                                    ? '…'
                                    : entry.data?.conversionRate !== null &&
                                        entry.data?.conversionRate !== undefined
                                      ? `${Math.round(entry.data.conversionRate)}%`
                                      : '0%'}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {loadingTelegramSalesDashboard
                                  ? '…'
                                  : isMyanmar
                                    ? `${entry.data?.fulfilled || 0}/${entry.data?.orders || 0} ခု ပြီးမြောက်`
                                    : `${entry.data?.fulfilled || 0}/${entry.data?.orders || 0} fulfilled`}
                              </p>
                              <div className="mt-3 space-y-1">
                                {(entry.data?.revenueByCurrency || []).length > 0 ? (
                                  entry.data?.revenueByCurrency.map((revenue) => (
                                    <p key={`${entry.label}-${revenue.currency}`} className="text-xs text-muted-foreground">
                                      {formatRevenueLabel(revenue.currency, revenue.amount)}
                                    </p>
                                  ))
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    {isMyanmar ? 'ပြီးမြောက်သော ဝင်ငွေ မရှိသေးပါ။' : 'No fulfilled revenue yet.'}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {isMyanmar ? 'ကမ်ပိန်းအလိုက် ပြန်လည်ရရှိသော ဝင်ငွေ' : 'Recovery revenue by campaign'}
                        </p>
                        <div className="mt-3 space-y-2">
                          {loadingTelegramSalesDashboard ? (
                            [...Array(4)].map((_, i) => (
                              <div key={i} className="h-16 animate-pulse rounded-[1rem] bg-muted/40 dark:bg-white/[0.04]" />
                            ))
                          ) : telegramSalesDashboard && telegramSalesDashboard.coupons.revenueByLifecycle.length > 0 ? (
                            telegramSalesDashboard.coupons.revenueByLifecycle.map((bucket) => (
                              <div key={bucket.bucket} className="rounded-[1rem] border border-border/50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium">{bucket.label}</p>
                                  <Badge variant="outline">
                                    {bucket.conversionRate !== null && bucket.conversionRate !== undefined
                                      ? isMyanmar
                                        ? `${Math.round(bucket.conversionRate)}% ပြောင်းလဲမှု`
                                        : `${Math.round(bucket.conversionRate)}% conv.`
                                      : isMyanmar
                                        ? '0% ပြောင်းလဲမှု'
                                        : '0% conv.'}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {isMyanmar ? `${bucket.fulfilled}/${bucket.orders} ခု ပြီးမြောက်` : `${bucket.fulfilled}/${bucket.orders} fulfilled`}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {bucket.revenueByCurrency.length > 0
                                    ? bucket.revenueByCurrency
                                        .map((revenue) => formatRevenueLabel(revenue.currency, revenue.amount))
                                        .join(' • ')
                                    : isMyanmar
                                      ? 'ပြီးမြောက်သော ဝင်ငွေ မရှိသေးပါ။'
                                      : 'No fulfilled revenue yet'}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">
                          {isMyanmar ? 'ပြန်လည်ရရှိသော ဝင်ငွေ မရှိသေးပါ။' : 'No recovery revenue yet.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အစမ်းသုံး ပြောင်းလဲမှု' : 'Trial conversion'}</p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'အခမဲ့ အစမ်းသုံးမှ ငွေပေးချေမှုသို့' : 'Free trial to paid'}</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပြီးမြောက်သော အစမ်းသုံးများ' : 'Fulfilled trials'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.trialConversion.fulfilledTrials || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isMyanmar ? 'အမှန်တကယ် ပေးပို့ပြီးခဲ့သော အစမ်းသုံး အော်ဒါများ။' : 'Trial orders that were actually delivered.'}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ငွေပေးချေမှုသို့ ပြောင်းလဲထားသော အသုံးပြုသူများ' : 'Converted users'}</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.trialConversion.convertedUsers || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {loadingTelegramSalesDashboard
                            ? '…'
                            : telegramSalesDashboard?.trialConversion.conversionRate !== null &&
                                telegramSalesDashboard?.trialConversion.conversionRate !== undefined
                              ? (isMyanmar
                                ? `အစမ်းသုံးမှ ငွေပေးချေမှုသို့ ပြောင်းလဲမှု ${Math.round(telegramSalesDashboard.trialConversion.conversionRate)}%`
                                : `${Math.round(telegramSalesDashboard.trialConversion.conversionRate)}% trial-to-paid conversion`)
                              : (isMyanmar ? 'ငွေပေးချေမှုသို့ ပြောင်းလဲမှု မရှိသေးပါ' : 'No paid conversions yet')}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {isMyanmar ? 'ငွေပေးချေသော အော်ဒါအဖြစ် ပြောင်းလဲထားမှု' : 'Converted paid orders'}
                      </p>
                      <p className="mt-2 text-xl font-semibold">
                        {loadingTelegramSalesDashboard ? '…' : telegramSalesDashboard?.trialConversion.convertedPaidOrders || 0}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isMyanmar
                          ? 'အရင် fulfilled free trial ရရှိခဲ့သော အသုံးပြုသူများနှင့် ချိတ်ဆက်ထားသော paid Telegram order များ။'
                          : 'Paid Telegram orders linked to users who had a fulfilled free trial first.'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'ငြင်းပယ်ရသည့် အကြောင်းများ' : 'Rejection reasons'}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'ငွေလွှဲအထောက်အထားများကို အဘယ်ကြောင့် ငြင်းပယ်ရသည်' : 'Why proofs are rejected'}</h3>
                    <div className="mt-4 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.rejectionReasons.length > 0 ? (
                        telegramSalesDashboard.rejectionReasons.map((reason) => (
                          <div
                            key={reason.code}
                            className="rounded-[1.2rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{reason.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{reason.code}</p>
                              </div>
                              <Badge variant="outline">{reason.count}</Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="ops-chart-empty">
                          <div className="space-y-2 text-center">
                            <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">{isMyanmar ? 'ငြင်းပယ်ရသည့် အကြောင်းအရာ မရှိသေးပါ' : 'No rejection reasons yet'}</p>
                            <p className="text-sm text-muted-foreground">
                              {isMyanmar
                                  ? 'ကြိုတင်သတ်မှတ်ထားသော အကြောင်းပြချက်ဖြင့် အော်ဒါများကို ငြင်းပယ်ပြီးမှ ဤနေရာတွင် အကြောင်းအရာခွဲခြမ်းကို ပြသပါမည်။'
                                  : 'Once orders are rejected with a preset reason, the breakdown will appear here.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'ငွေကြေးအလိုက် ဝင်ငွေ' : 'Revenue by currency'}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'ကောက်ခံထားသော စျေးနှုန်း' : 'Collected pricing'}</h3>
                    <div className="mt-4 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.revenueByCurrency.length > 0 ? (
                        telegramSalesDashboard.revenueByCurrency.map((revenue) => (
                          <div key={revenue.currency} className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {revenue.currency}
                            </p>
                            <p className="mt-2 text-xl font-semibold">{formatRevenueLabel(revenue.currency, revenue.amount)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {isMyanmar ? 'ဤကာလအတွင်း ပြီးမြောက်သော တယ်လီဂရမ် အော်ဒါများမှ ကောက်ခံထားသည်။' : 'From fulfilled Telegram orders in this range.'}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="ops-chart-empty">
                          <div className="space-y-2 text-center">
                            <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">{isMyanmar ? 'ဝင်ငွေ အချက်အလက် မရှိသေးပါ' : 'No revenue signals yet'}</p>
                            <p className="text-sm text-muted-foreground">
                              {isMyanmar
                                ? 'တယ်လီဂရမ် အရောင်းဆက်တင်များတွင် အစီအစဉ် ဈေးနှုန်း သတ်မှတ်ပြီး ဤနေရာတွင် ကောက်ခံငွေကို ခြေရာခံနိုင်သည်။'
                                : 'Set plan pricing in Telegram sales settings to track collected amounts here.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'ငွေပေးချေမှု နည်းလမ်းများ' : 'Payment methods'}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'ငွေရှင်း ရွေးချယ်မှုများ' : 'Checkout choices'}</h3>
                    <div className="mt-4 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(3)].map((_, i) => (
                          <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.paymentMethods.length > 0 ? (
                        telegramSalesDashboard.paymentMethods.map((method) => (
                          <div key={method.paymentMethodCode || method.paymentMethodLabel} className="ops-mini-tile">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{method.paymentMethodLabel}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {isMyanmar ? `${method.orders} ခု အော်ဒါ • ${method.fulfilled} ခု ပြီးမြောက်` : `${method.orders} orders • ${method.fulfilled} fulfilled`}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {method.orders > 0
                                  ? (isMyanmar ? `${Math.round(method.conversionRate)}% ပြောင်းလဲမှု` : `${Math.round(method.conversionRate)}% conversion`)
                                  : (isMyanmar ? 'ပြောင်းလဲမှု မရှိသေးပါ' : 'No conversions yet')}
                              </p>
                            </div>
                              <Badge variant="outline">{method.paymentMethodCode || (isMyanmar ? 'စိတ်ကြိုက်' : 'custom')}</Badge>
                            </div>
                            <div className="mt-3 space-y-1">
                              {method.revenueByCurrency.length > 0 ? (
                                method.revenueByCurrency.map((revenue) => (
                                  <p key={`${method.paymentMethodCode || method.paymentMethodLabel}-${revenue.currency}`} className="text-xs font-medium text-muted-foreground">
                                    {formatRevenueLabel(revenue.currency, revenue.amount)}
                                  </p>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">{isMyanmar ? 'ပြီးမြောက်သော ဝင်ငွေ မရှိသေးပါ' : 'No fulfilled revenue yet'}</p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="ops-chart-empty">
                          <div className="space-y-2 text-center">
                            <Copy className="mx-auto h-8 w-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">{isMyanmar ? 'ငွေပေးချေမှုနည်းလမ်း ဒေတာ မရှိသေးပါ' : 'No payment method data yet'}</p>
                            <p className="text-sm text-muted-foreground">
                              {isMyanmar
                                ? 'ဖောက်သည်များက KPay၊ Wave Pay၊ AYA Pay သို့မဟုတ် အခြားနည်းလမ်းများ ရွေးထားမှုကို အော်ဒါများတွင် ပြသမည်။'
                                : 'Orders will show whether customers picked KPay, Wave Pay, AYA Pay, or another method.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'နောက်ဆုံး အော်ဒါများ' : 'Recent orders'}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">{isMyanmar ? 'နောက်ဆုံး တယ်လီဂရမ် အော်ဒါများ' : 'Latest Telegram orders'}</h3>
                    <div className="mt-4 space-y-3">
                      {loadingTelegramSalesDashboard ? (
                        [...Array(4)].map((_, i) => (
                          <div key={i} className="h-18 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                        ))
                      ) : telegramSalesDashboard && telegramSalesDashboard.recentOrders.length > 0 ? (
                        telegramSalesDashboard.recentOrders.map((order) => (
                          <div key={order.id} className="rounded-[1.1rem] border border-border/60 bg-background/60 p-3 dark:bg-white/[0.02]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium">{order.orderCode}</p>
                                <p className="mt-1 truncate text-sm text-muted-foreground">
                                  {order.planName || order.planCode || order.kind}
                                </p>
                              </div>
                              <Badge variant="outline">{order.status}</Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{order.requestedName || `@${order.telegramUsername || order.telegramUserId}`}</span>
                              <span>•</span>
                              <span>{formatRelativeTime(order.createdAt)}</span>
                              {order.paymentMethodLabel ? (
                                <>
                                  <span>•</span>
                                  <span>{order.paymentMethodLabel}</span>
                                </>
                              ) : null}
                              {typeof order.priceAmount === 'number' && order.priceAmount > 0 ? (
                                <>
                                  <span>•</span>
                                  <span>{formatRevenueLabel(order.priceCurrency || 'MMK', order.priceAmount)}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="ops-chart-empty">
                          <div className="space-y-2 text-center">
                            <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">
                              {isMyanmar ? 'နောက်ဆုံး တယ်လီဂရမ် အော်ဒါ မရှိသေးပါ။' : 'No recent Telegram orders'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {isMyanmar
                                ? 'ဖောက်သည်များ၏ ဝယ်ယူမှုနှင့် သက်တမ်းတိုး တောင်းဆိုမှု နောက်ဆုံးများကို ဤနေရာတွင် ပြသမည်။'
                                : 'The latest customer buy and renew requests will appear here.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="ops-panel xl:col-span-3">
          <CardHeader className="px-0 pt-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Calendar className="h-5 w-5 text-primary" />
                  {isMyanmar ? 'လစဉ် ငွေကြေး ခြုံငုံမြင်ကွင်း' : 'Monthly finance dashboard'}
                </CardTitle>
                <CardDescription>
                  {isMyanmar ? 'နောက်ဆုံး ၆ လအတွင်း ဝင်ငွေ၊ သက်တမ်းတိုးမှုများနှင့် ထွက်ခွာမှု လက္ခဏာများကို ပြသထားသည်။' : 'Revenue, renewals, and churn signals for the last 6 months.'}
                </CardDescription>
              </div>
              <Badge variant="outline">{isMyanmar ? '၆ လ' : '6 months'}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-0 pb-0">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isMyanmar ? 'စုစုပေါင်း ဝင်ငွေ' : 'Total revenue'}
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {loadingMonthlyBusinessDashboard
                    ? '…'
                    : monthlyBusinessDashboard
                      ? Object.entries(monthlyBusinessDashboard.summary.totalRevenueByCurrency)
                          .map(([currency, amount]) => formatRevenueLabel(currency, amount))
                          .join(' • ') || (isMyanmar ? 'ဝင်ငွေ မရှိသေးပါ' : 'No revenue')
                      : isMyanmar ? 'ဝင်ငွေ မရှိသေးပါ' : 'No revenue'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isMyanmar ? 'ပြီးမြောက်ပြီးသော တယ်လီဂရမ် အော်ဒါများမှ ရရှိသော ဝင်ငွေ။' : 'Fulfilled Telegram order revenue.'}
                </p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isMyanmar ? 'သက်တမ်းတိုးမှုများ' : 'Renewals'}
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {loadingMonthlyBusinessDashboard ? '…' : monthlyBusinessDashboard?.summary.totalRenewals || 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {monthlyBusinessDashboard?.summary.monthOverMonth
                    ? isMyanmar
                      ? `ယခင်လနှင့် နှိုင်းယှဉ်လျှင် ${monthlyBusinessDashboard.summary.monthOverMonth.renewalDelta >= 0 ? '+' : ''}${monthlyBusinessDashboard.summary.monthOverMonth.renewalDelta}`
                      : `${monthlyBusinessDashboard.summary.monthOverMonth.renewalDelta >= 0 ? '+' : ''}${monthlyBusinessDashboard.summary.monthOverMonth.renewalDelta} vs previous month`
                    : isMyanmar
                      ? 'လစဉ် နှိုင်းယှဉ်ချက် မရှိသေးပါ'
                      : 'No month-over-month comparison yet'}
                </p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isMyanmar ? 'ထွက်ခွာမှု လက္ခဏာ' : 'Churn signal'}
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {loadingMonthlyBusinessDashboard ? '…' : monthlyBusinessDashboard?.summary.totalChurnSignals || 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {monthlyBusinessDashboard?.summary.monthOverMonth
                    ? isMyanmar
                      ? `ယခင်လနှင့် နှိုင်းယှဉ်လျှင် ${monthlyBusinessDashboard.summary.monthOverMonth.churnDelta >= 0 ? '+' : ''}${monthlyBusinessDashboard.summary.monthOverMonth.churnDelta}`
                      : `${monthlyBusinessDashboard.summary.monthOverMonth.churnDelta >= 0 ? '+' : ''}${monthlyBusinessDashboard.summary.monthOverMonth.churnDelta} vs previous month`
                    : isMyanmar
                      ? 'သက်တမ်းကုန်၊ ပမာဏကုန်၊ ပိတ်ထားပြီး မှတ်တမ်းတင်ထားသော အခြေအနေများကို ထွက်ခွာမှု လက္ခဏာအဖြစ် တွက်ချက်ထားသည်'
                      : 'Uses expired, depleted, disabled, and archived churn signals'}
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1.3rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                <div className="mb-3 space-y-1">
                  <p className="text-sm font-semibold">{isMyanmar ? 'ဝင်ငွေ လမ်းကြောင်း' : 'Revenue trend'}</p>
                  <p className="text-xs text-muted-foreground">
                    {monthlyBusinessDashboard && Object.keys(monthlyBusinessDashboard.summary.totalRevenueByCurrency).length > 1
                      ? isMyanmar
                        ? `ငွေကြေးအမျိုးအစား အများအပြား ရှိနေသောကြောင့် ဇယားကို ဖတ်ရလွယ်စေရန် ${primaryRevenueCurrency} ဝင်ငွေကိုသာ ပြထားသည်။`
                        : `Showing ${primaryRevenueCurrency} revenue to keep the chart readable when multiple currencies are active.`
                      : isMyanmar
                        ? `${primaryRevenueCurrency} ဖြင့် လစဉ် ဝင်ငွေ လမ်းကြောင်း`
                        : `Monthly revenue trend in ${primaryRevenueCurrency}.`}
                  </p>
                </div>
                {loadingMonthlyBusinessDashboard ? (
                  <div className="ops-chart-empty h-[240px]">{isMyanmar ? 'ငွေကြေး ဇယားကို တင်နေသည်...' : 'Loading finance chart...'}</div>
                ) : financeTrendRows.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <RechartsAreaChart data={financeTrendRows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="financeRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(34,197,94,0.75)" stopOpacity={0.55} />
                          <stop offset="100%" stopColor="rgba(34,197,94,0.15)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <RechartsCartesianGrid strokeDasharray="2 10" stroke="rgba(125, 211, 252, 0.12)" vertical={false} />
                      <RechartsXAxis
                        dataKey="label"
                        stroke="rgba(186, 230, 253, 0.58)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <RechartsYAxis
                        stroke="rgba(186, 230, 253, 0.44)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatCompactFinanceAxisValue}
                        width={48}
                        tickMargin={6}
                      />
                      <RechartsTooltip
                        content={
                          <FinanceChartTooltip
                            valueFormatter={(value) => formatRevenueLabel(primaryRevenueCurrency, value)}
                          />
                        }
                      />
                      <RechartsArea
                        type="monotone"
                        dataKey="revenue"
                        name={isMyanmar ? 'ဝင်ငွေ' : 'Revenue'}
                        stroke="rgba(34,197,94,0.95)"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#financeRevenueGradient)"
                        dot={false}
                      />
                    </RechartsAreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="ops-chart-empty h-[240px]">
                    <div className="space-y-2 text-center">
                      <Wallet className="mx-auto h-8 w-8 text-muted-foreground/60" />
                      <p className="font-medium text-foreground">{isMyanmar ? 'ငွေကြေး လမ်းကြောင်း မရှိသေးပါ' : 'No finance trend yet'}</p>
                      <p className="text-sm text-muted-foreground">
                        {isMyanmar ? 'လစဉ် ပြီးမြောက်သော အော်ဒါများမှ ဝင်ငွေကို ဤနေရာတွင် ပြသမည်။' : 'Monthly fulfilled-order revenue will appear here.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[1.3rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                <div className="mb-3 space-y-1">
                  <p className="text-sm font-semibold">{isMyanmar ? 'သက်တမ်းတိုးမှုနှင့် ထွက်ခွာမှု လမ်းကြောင်း' : 'Renewal vs churn trend'}</p>
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'လစဉ် အသစ် ငွေပေးချေ အော်ဒါများ၊ သက်တမ်းတိုးမှုများနှင့် ထွက်ခွာမှု လက္ခဏာများကို နှိုင်းယှဉ်ပြထားသည်။' : 'Compare new paid orders, renewals, and churn signals month over month.'}
                  </p>
                </div>
                {loadingMonthlyBusinessDashboard ? (
                  <div className="ops-chart-empty h-[240px]">{isMyanmar ? 'ငွေကြေး ဇယားကို တင်နေသည်...' : 'Loading finance chart...'}</div>
                ) : financeTrendRows.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <RechartsBarChart data={financeTrendRows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <RechartsCartesianGrid strokeDasharray="2 10" stroke="rgba(125, 211, 252, 0.12)" vertical={false} />
                      <RechartsXAxis
                        dataKey="label"
                        stroke="rgba(186, 230, 253, 0.58)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <RechartsYAxis
                        stroke="rgba(186, 230, 253, 0.44)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatCompactFinanceAxisValue}
                        width={44}
                        tickMargin={6}
                      />
                      <RechartsTooltip
                        content={
                          <FinanceChartTooltip
                            valueFormatter={(value, seriesLabel) => `${Math.round(value)} ${seriesLabel.toLowerCase()}`}
                          />
                        }
                      />
                      <RechartsBar dataKey="newOrders" name={isMyanmar ? 'အသစ် ငွေပေးချေ အော်ဒါ' : 'New paid'} fill="rgba(34,211,238,0.92)" radius={[6, 6, 0, 0]} />
                      <RechartsBar dataKey="renewals" name={isMyanmar ? 'သက်တမ်းတိုးမှု' : 'Renewals'} fill="rgba(168,85,247,0.92)" radius={[6, 6, 0, 0]} />
                      <RechartsBar dataKey="churn" name={isMyanmar ? 'ထွက်ခွာမှု' : 'Churn'} fill="rgba(251,191,36,0.92)" radius={[6, 6, 0, 0]} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="ops-chart-empty h-[240px]">
                    <div className="space-y-2 text-center">
                      <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/60" />
                      <p className="font-medium text-foreground">{isMyanmar ? 'လမ်းကြောင်း မှတ်တမ်း မရှိသေးပါ' : 'No trend history yet'}</p>
                      <p className="text-sm text-muted-foreground">
                        {isMyanmar ? 'လစဉ် ဒေတာ လုံလောက်လာသောအခါ သက်တမ်းတိုးမှုနှင့် ထွက်ခွာမှု လက္ခဏာများကို ဤနေရာတွင် ပြသမည်။' : 'Renewal and churn signals will appear once monthly data builds up.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="ops-data-shell">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isMyanmar ? 'လ' : 'Month'}</TableHead>
                    <TableHead>{isMyanmar ? 'ဝင်ငွေ' : 'Revenue'}</TableHead>
                    <TableHead>{isMyanmar ? 'အသစ် ငွေပေးချေ အော်ဒါ' : 'New paid'}</TableHead>
                    <TableHead>{isMyanmar ? 'သက်တမ်းတိုးမှုများ' : 'Renewals'}</TableHead>
                    <TableHead>{isMyanmar ? 'ထွက်ခွာမှု လက္ခဏာ' : 'Churn signal'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingMonthlyBusinessDashboard ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        {isMyanmar ? 'လစဉ် စီးပွားရေး အချက်အလက်များကို တင်နေသည်...' : 'Loading monthly business metrics...'}
                      </TableCell>
                    </TableRow>
                  ) : monthlyBusinessDashboard && monthlyBusinessDashboard.months.length > 0 ? (
                    monthlyBusinessDashboard.months.map((month) => (
                      <TableRow key={month.key}>
                        <TableCell className="font-medium">{month.label}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {month.revenueByCurrency.length > 0
                            ? month.revenueByCurrency
                                .map((entry) => formatRevenueLabel(entry.currency, entry.amount))
                                .join(' • ')
                            : isMyanmar
                              ? 'ဝင်ငွေ မရှိသေးပါ'
                              : 'No revenue'}
                        </TableCell>
                        <TableCell>{month.newOrders}</TableCell>
                        <TableCell>{month.renewalOrders}</TableCell>
                        <TableCell>{month.churnSignals}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        {isMyanmar ? 'လစဉ် ငွေကြေးဒေတာ မရှိသေးပါ။' : 'No monthly finance data yet.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Zap className="h-5 w-5 text-primary" />
                    {isMyanmar ? 'အသုံးပြုမှု အများဆုံးများ' : 'Top consumers'}
                  </CardTitle>
                  <CardDescription>
                    {isMyanmar ? 'ရွေးချယ်ထားသော အချိန်အပိုင်းအတွင်း အသုံးပြုမှုအများဆုံး သော့များ။' : 'Highest traffic keys in the selected snapshot window.'}
                  </CardDescription>
                </div>
                <Select value={topConsumersRange} onValueChange={(v) => setTopConsumersRange(v as '24h' | '7d' | '30d')}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">{isMyanmar ? '၇ ရက်' : '7 days'}</SelectItem>
                    <SelectItem value="30d">{isMyanmar ? '၃၀ ရက်' : '30 days'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingTopConsumers ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : topConsumers && topConsumers.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {topConsumers.map((consumer) => (
                      <div key={consumer.id} className="ops-mobile-card space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={consumer.type === 'ACCESS_KEY' ? `/dashboard/keys/${consumer.id}` : `/dashboard/dynamic-keys/${consumer.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {consumer.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {consumer.serverName
                                ? `${consumer.countryCode ? `${getCountryFlag(consumer.countryCode)} ` : ''}${consumer.serverName}`
                                : isMyanmar
                                  ? 'အလှုပ်ရှားသော သော့'
                                  : 'Dynamic key'}
                            </p>
                          </div>
                          <Badge variant="outline">{consumer.type === 'ACCESS_KEY' ? (isMyanmar ? 'သော့' : 'Key') : (isMyanmar ? 'ပြောင်းလဲသတ်မှတ်' : 'Dynamic')}</Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {isMyanmar ? 'အသုံးပြုမှု' : 'Usage'}
                            </p>
                            <p className="mt-2 text-lg font-semibold">{formatBytes(BigInt(consumer.deltaBytes))}</p>
                          </div>
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {isMyanmar ? 'ခန့်မှန်းချက်' : 'Forecast'}
                            </p>
                            <div className="mt-2 text-sm">
                              {consumer.dataLimitBytes ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button className="inline-flex items-center gap-1 text-primary">
                                      {isMyanmar ? 'ခွင့်ပြုပမာဏ ခန့်မှန်းချက် ကြည့်မည်' : 'View quota outlook'}
                                      <Info className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <ForecastTooltip keyId={consumer.id} keyType={consumer.type} />
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">{isMyanmar ? 'ခွင့်ပြုပမာဏ မရှိပါ' : 'No quota'}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="ops-data-shell hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isMyanmar ? 'သော့' : 'Key'}</TableHead>
                          <TableHead>{isMyanmar ? 'ဆာဗာ' : 'Server'}</TableHead>
                          <TableHead>{isMyanmar ? 'ခန့်မှန်းချက်' : 'Forecast'}</TableHead>
                          <TableHead className="text-right">{isMyanmar ? 'ကာလအသုံးပြုမှု' : 'Period usage'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topConsumers.map((consumer) => (
                          <TableRow key={consumer.id}>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link
                                    href={consumer.type === 'ACCESS_KEY' ? `/dashboard/keys/${consumer.id}` : `/dashboard/dynamic-keys/${consumer.id}`}
                                    className="inline-flex items-center gap-2 font-medium hover:text-primary"
                                  >
                                    <Key className="h-3 w-3" />
                                    <span className="truncate">{consumer.name}</span>
                                  </Link>
                                </TooltipTrigger>
                                <ForecastTooltip keyId={consumer.id} keyType={consumer.type} />
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {consumer.serverName ? (
                                <div className="flex items-center gap-1">
                                  {consumer.countryCode ? getCountryFlag(consumer.countryCode) : null}
                                  <span>{consumer.serverName}</span>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs">{isMyanmar ? 'ပြောင်းလဲသတ်မှတ်' : 'Dynamic'}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {consumer.dataLimitBytes
                                ? (isMyanmar ? 'ခွင့်ပြုပမာဏကို ခြေရာခံထားသည်' : 'Quota tracked')
                                : (isMyanmar ? 'ခွင့်ပြုပမာဏ မရှိပါ' : 'No quota')}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatBytes(BigInt(consumer.deltaBytes))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Activity className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">{isMyanmar ? 'အသုံးပြုမှု ဒေတာ မရှိသေးပါ' : 'No usage data yet'}</p>
                    <p className="text-sm text-muted-foreground">
                      {isMyanmar
                        ? 'Snapshot စုဆောင်းမှု စတင်ပြီးနောက် အသုံးပြုမှုအများဆုံး key များကို ဤနေရာတွင် ပြသမည်။'
                        : 'Highest-usage keys will appear after snapshot collection starts.'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                {isMyanmar ? 'အသုံးပြုမှု မမှန်ကန်မှုများ' : 'Usage anomalies'}
              </CardTitle>
              <CardDescription>
                {isMyanmar ? 'ပုံမှန် အသုံးပြုမှု အခြေခံစံထက် လွန်ကဲစွာ မြင့်တက်နေသော သော့များ။' : 'Keys operating outside their normal traffic baseline.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingAnomalies ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : anomalies && anomalies.length > 0 ? (
                <div className="space-y-3">
                  {anomalies.slice(0, 5).map((anomaly) => (
                    <div key={anomaly.id} className="ops-row-card flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-yellow-500/10 p-2 text-yellow-500">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                          <Link
                            href={anomaly.type === 'ACCESS_KEY' ? `/dashboard/keys/${anomaly.id}` : `/dashboard/dynamic-keys/${anomaly.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {anomaly.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {anomaly.serverName || (isMyanmar ? 'အလှုပ်ရှားသော သော့' : 'Dynamic key')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="destructive" className="mb-1">
                          {isMyanmar ? `${anomaly.ratio}x မြင့်တက်မှု` : `${anomaly.ratio}x spike`}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(BigInt(anomaly.recentDeltaBytes))} vs {formatBytes(BigInt(anomaly.baselineDeltaBytes))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Activity className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">{isMyanmar ? 'မမှန်ကန်မှု မတွေ့ရပါ' : 'No anomalies detected'}</p>
                    <p className="text-sm text-muted-foreground">
                      {isMyanmar ? 'လက်ရှိ လမ်းကြောင်းအသုံးပြုမှုပုံစံများသည် မျှော်မှန်းထားသော အခြေခံပမာဏအတွင်း ရှိနေသည်။' : 'Current traffic patterns are within the expected baseline.'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5 text-primary" />
                {isMyanmar ? 'အသုံးပြုမှု အများဆုံး အသုံးပြုသူများ' : 'Top users'}
              </CardTitle>
              <CardDescription>
                {isMyanmar ? 'မှတ်တမ်းတင်ထားသည့် ကာလတစ်လျှောက် အသုံးပြုမှုအများဆုံး အသုံးပြုခွင့်သော့များ။' : 'Highest-consuming access keys across all recorded time.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingTopUsers ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-[1.2rem] bg-muted/40 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : topUsers && topUsers.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {topUsers.map((user) => (
                      <div key={user.id} className="ops-mobile-card space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{user.name}</p>
                          <span className="font-mono text-sm">{formatBytes(user.usedBytes)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {user.countryCode ? `${getCountryFlag(user.countryCode)} ` : ''}
                          {user.serverName}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="ops-data-shell hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isMyanmar ? 'အသုံးပြုသူ / သော့' : 'User / key'}</TableHead>
                          <TableHead>{isMyanmar ? 'ဆာဗာ' : 'Server'}</TableHead>
                          <TableHead className="text-right">{isMyanmar ? 'အသုံးပြုမှု' : 'Usage'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                {user.countryCode ? getCountryFlag(user.countryCode) : null}
                                {user.serverName}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatBytes(user.usedBytes)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="ops-chart-empty">
                  <div className="space-y-2 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">{isMyanmar ? 'အသုံးပြုမှု ဒေတာ မတွေ့ရပါ' : 'No usage data found'}</p>
                    <p className="text-sm text-muted-foreground">
                      {isMyanmar
                        ? 'အနည်းဆုံး key တစ်ခုတွင် traffic မှတ်တမ်းရှိလာသောအခါ ဤအဆင့်သတ်မှတ်ချက်ကို ပြသမည်။'
                        : 'This ranking appears once at least one key has recorded traffic.'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-panel">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Calendar className="h-5 w-5 text-primary" />
                {isMyanmar ? 'အသုံးပြုမှု အမြင့်ဆုံး အချိန်များ' : 'Peak usage hours'}
              </CardTitle>
              <CardDescription>{isMyanmar ? 'နေ့နှင့် နာရီအလိုက် လမ်းကြောင်းအသုံးပြုမှု ပြင်းထန်ချက် (UTC)' : 'Traffic intensity by day and hour (UTC).'}</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingPeakHours ? (
                <div className="ops-chart-empty h-[280px]">
                  <div className="h-full w-full animate-pulse rounded-[1.5rem] bg-muted/40 dark:bg-white/[0.04]" />
                </div>
              ) : (
                <div className="ops-detail-card overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="mb-2 flex">
                      <div className="w-12 shrink-0" />
                      <div className="flex flex-1 justify-between px-1">
                        {hours.filter((hour) => hour % 3 === 0).map((hour) => (
                          <div key={hour} className="w-6 text-center text-xs text-muted-foreground">
                            {hour.toString().padStart(2, '0')}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      {daysOfWeek.map((day, dayIndex) => (
                        <div key={dayIndex} className="flex items-center gap-1">
                          <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground">{day}</div>
                          <div className="grid h-6 flex-1 grid-cols-24 gap-0.5">
                            {hours.map((hour) => {
                              const dataPoint = peakHours?.find((point) => point.day === dayIndex && point.hour === hour);
                              const bytes = dataPoint?.bytes || 0;
                              return (
                                <div
                                  key={hour}
                                  className={cn(
                                    'cursor-help rounded-sm transition-colors hover:opacity-80',
                                    getHeatmapColor(bytes, maxPeakBytes)
                                  )}
                                  title={`${day} ${hour}:00 - ${formatBytes(BigInt(bytes))}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                      <span>{isMyanmar ? 'နည်း' : 'Low'}</span>
                      <div className="flex gap-0.5">
                        <div className="h-3 w-3 rounded-sm bg-cyan-400/20" />
                        <div className="h-3 w-3 rounded-sm bg-cyan-400/35" />
                        <div className="h-3 w-3 rounded-sm bg-cyan-400/50" />
                        <div className="h-3 w-3 rounded-sm bg-cyan-400/70" />
                        <div className="h-3 w-3 rounded-sm bg-cyan-300" />
                      </div>
                      <span>{isMyanmar ? 'မြင့်' : 'High'}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {(analyticsSummary?.snapshotCount || 0) === 0 ? (
          <Card className="ops-panel border-dashed">
            <CardContent className="px-0 py-0">
              <div className="flex items-start gap-4">
                <div className="rounded-[1.2rem] bg-blue-500/10 p-3">
                  <Info className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-medium">{isMyanmar ? 'အသုံးပြုမှု မှတ်တမ်းပုံ လုပ်ဆောင်စနစ်' : 'Usage snapshot worker'}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isMyanmar
                      ? 'Anomaly detection နှင့် quota forecasting ကဲ့သို့သော advanced analytics များသည် background worker က ပုံမှန် usage snapshot များ စုဆောင်းပေးရန် လိုအပ်သည်။'
                      : 'Advanced analytics like anomaly detection and quota forecasting depend on the background worker collecting periodic usage snapshots.'}
                  </p>
                  <code className="mt-3 block rounded-xl bg-muted px-3 py-2 font-mono text-xs dark:bg-white/[0.04]">
                    npx ts-node src/server/worker.ts
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
