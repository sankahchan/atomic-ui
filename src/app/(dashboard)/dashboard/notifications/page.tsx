'use client';

/**
 * Notifications Page
 *
 * This page allows administrators to configure notification channels for
 * receiving alerts about important system events and view key alerts.
 */

import { keepPreviousData } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import {
  hasTelegramAnnouncementManageScope,
  hasTelegramReviewManageScope,
} from '@/lib/admin-scope';
import { withBasePath } from '@/lib/base-path';
import { copyToClipboard } from '@/lib/clipboard';
import type { LocalizedTemplateMap } from '@/lib/localized-templates';
import {
  TELEGRAM_ANNOUNCEMENT_PRESETS,
  buildTelegramAnnouncementCommand,
} from '@/lib/telegram-presets';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';
import {
  Plus,
  Bell,
  Send,
  Mail,
  Globe,
  Trash2,
  Edit,
  CheckCircle2,
  Loader2,
  TestTube,
  MessageSquare,
  AlertTriangle,
  Clock,
  KeyRound,
  HardDrive,
  ExternalLink,
  RefreshCw,
  History,
  RotateCcw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Save,
  Eye,
  Download,
  Copy,
} from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { AnnouncementBroadcastsTab } from './_components/announcement-broadcasts-tab';
import { AnnouncementExperimentsPanel } from './_components/announcement-experiments-panel';
import { AnnouncementAnalyticsInsights } from './_components/announcement-analytics-insights';
import { AnnouncementHistoryTab } from './_components/announcement-history-tab';
import { AnnouncementTemplatesTab } from './_components/announcement-templates-tab';

/**
 * Notification channel type definitions
 */
type ChannelType = 'TELEGRAM' | 'EMAIL' | 'WEBHOOK';

/**
 * Event types that can trigger notifications
 */
const EVENT_TYPES = [
  { id: 'SERVER_DOWN', labelKey: 'notifications.event.SERVER_DOWN' },
  { id: 'SERVER_UP', labelKey: 'notifications.event.SERVER_UP' },
  { id: 'SERVER_SLOW', labelKey: 'notifications.event.SERVER_SLOW' },
  { id: 'KEY_EXPIRING', labelKey: 'notifications.event.KEY_EXPIRING' },
  { id: 'KEY_EXPIRED', labelKey: 'notifications.event.KEY_EXPIRED' },
  { id: 'TRAFFIC_WARNING', labelKey: 'notifications.event.TRAFFIC_WARNING' },
  { id: 'TRAFFIC_DEPLETED', labelKey: 'notifications.event.TRAFFIC_DEPLETED' },
  { id: 'AUDIT_ALERT', labelKey: 'notifications.event.AUDIT_ALERT' },
  { id: 'SCHEDULED_REPORT', labelKey: 'notifications.event.SCHEDULED_REPORT' },
  { id: 'DYNAMIC_ROUTING_ALERT', labelKey: 'notifications.event.DYNAMIC_ROUTING_ALERT' },
] as const;

type NotificationEventId = (typeof EVENT_TYPES)[number]['id'];
const MAX_NOTIFICATION_COOLDOWN_MINUTES = 24 * 60;
const WEBHOOK_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const RESERVED_WEBHOOK_HEADERS = new Set([
  'content-type',
  'content-length',
  'host',
  'user-agent',
  'x-atomic-event',
  'x-atomic-timestamp',
  'x-atomic-signature',
]);

/**
 * Channel type configuration with icons and descriptions
 */
const CHANNEL_TYPES = {
  TELEGRAM: {
    icon: Send,
    labelKey: 'notifications.type.TELEGRAM',
    descriptionKey: 'notifications.channel_desc.telegram', // We can simplify or reuse
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  EMAIL: {
    icon: Mail,
    labelKey: 'notifications.type.EMAIL',
    descriptionKey: 'notifications.channel_desc.email',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  WEBHOOK: {
    icon: Globe,
    labelKey: 'notifications.type.WEBHOOK',
    descriptionKey: 'notifications.channel_desc.webhook',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
};

// Channel type for state
type Channel = {
  id: string;
  name: string;
  type: ChannelType;
  isActive: boolean;
  config: Record<string, string>;
  events: NotificationEventId[];
};

type NotificationWorkspaceId = 'overview' | 'telegram' | 'workflow' | 'channels';
type TelegramBotSubtabId = 'setup' | 'broadcasts' | 'templates' | 'analytics' | 'history';
type WorkflowSubtabId = 'settings' | 'coupons' | 'guardrails' | 'review' | 'premium';

type DeliveryStatusFilter = 'ALL' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
type EventCooldownInputs = Partial<Record<NotificationEventId, string>>;
type WebhookHeaderRow = {
  id: string;
  key: string;
  value: string;
};

type DeliveryLog = {
  id: string;
  channelId: string | null;
  channelName: string | null;
  channelType: string | null;
  channelIsActive: boolean | null;
  channelMissing: boolean;
  event: string;
  message: string;
  status: string;
  error: string | null;
  sentAt: Date;
  accessKeyId: string | null;
  accessKeyName: string | null;
  canRetry: boolean;
  retryQueued?: boolean;
};

type TelegramSettings = {
  botToken: string;
  botUsername?: string;
  welcomeMessage?: string;
  keyNotFoundMessage?: string;
  localizedWelcomeMessages: LocalizedTemplateMap;
  localizedKeyNotFoundMessages: LocalizedTemplateMap;
  isEnabled: boolean;
  adminChatIds: string[];
  dailyDigestEnabled: boolean;
  dailyDigestHour: number;
  dailyDigestMinute: number;
  digestLookbackHours: number;
  defaultLanguage: 'en' | 'my';
  showLanguageSelectorOnStart: boolean;
};

type TelegramAnnouncementAudience = 'ACTIVE_USERS' | 'STANDARD_USERS' | 'PREMIUM_USERS' | 'TRIAL_USERS' | 'DIRECT_USER';
type TelegramAnnouncementType = 'INFO' | 'ANNOUNCEMENT' | 'PROMO' | 'NEW_SERVER' | 'MAINTENANCE';
type TelegramAnnouncementCardStyle = 'DEFAULT' | 'PROMO' | 'PREMIUM' | 'OPERATIONS';
type TelegramAnnouncementRecurrenceType = 'NONE' | 'DAILY' | 'WEEKLY';
type TelegramAnnouncementSegment = 'TRIAL_TO_PAID' | 'PREMIUM_UPSELL' | 'RENEWAL_SOON' | 'HIGH_VALUE';
type TelegramAnnouncementPanelAudience = Exclude<TelegramAnnouncementAudience, 'DIRECT_USER'>;

type TelegramAnnouncementTemplateRow = {
  id: string;
  name: string;
  audience: TelegramAnnouncementPanelAudience;
  type: TelegramAnnouncementType;
  targetTag?: string | null;
  targetSegment?: string | null;
  targetServerId?: string | null;
  targetServerName?: string | null;
  targetCountryCode?: string | null;
  cardStyle: TelegramAnnouncementCardStyle;
  title: string;
  message: string;
  heroImageUrl?: string | null;
  includeSupportButton: boolean;
  pinToInbox: boolean;
  recurrenceType?: TelegramAnnouncementRecurrenceType | null;
  createdByEmail?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TelegramAnnouncementHistoryRow = {
  id: string;
  audience: TelegramAnnouncementAudience;
  type: TelegramAnnouncementType;
  targetTag?: string | null;
  targetSegment?: string | null;
  targetServerId?: string | null;
  targetServerName?: string | null;
  targetCountryCode?: string | null;
  targetDirectUserLabel?: string | null;
  targetDirectChatId?: string | null;
  cardStyle: TelegramAnnouncementCardStyle;
  experimentId?: string | null;
  experimentVariantKey?: string | null;
  experimentVariantLabel?: string | null;
  title: string;
  message: string;
  heroImageUrl?: string | null;
  includeSupportButton: boolean;
  pinToInbox: boolean;
  status: string;
  scheduledFor?: Date | null;
  lastAttemptedAt?: Date | null;
  sentAt?: Date | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  resendAttemptCount?: number;
  resendRecoveredCount?: number;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
  recurrenceType?: TelegramAnnouncementRecurrenceType | null;
  recurrenceParentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deliveries: Array<{
    id: string;
    chatId: string;
    error?: string | null;
    updatedAt: Date;
  }>;
};

type TelegramAnnouncementExperimentVariantRow = {
  id: string;
  variantKey: string;
  label: string;
  allocationPercent: number;
  title: string;
  message: string;
  heroImageUrl?: string | null;
  cardStyle: TelegramAnnouncementCardStyle;
  templateId?: string | null;
  templateName?: string | null;
  announcements: number;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  latestAnnouncementId?: string | null;
  latestSentAt?: Date | null;
};

type TelegramAnnouncementExperimentRow = {
  id: string;
  name: string;
  status: string;
  audience: TelegramAnnouncementPanelAudience;
  type: TelegramAnnouncementType;
  targetTag?: string | null;
  targetSegment?: string | null;
  targetServerId?: string | null;
  targetServerName?: string | null;
  targetCountryCode?: string | null;
  includeSupportButton: boolean;
  pinToInbox: boolean;
  createdByEmail?: string | null;
  launchedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  latestAnnouncementId?: string | null;
  latestSentAt?: Date | null;
  recentAnnouncements: Array<{
    id: string;
    status: string;
    experimentVariantKey?: string | null;
    experimentVariantLabel?: string | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    sentAt?: Date | null;
    createdAt: Date;
  }>;
  variants: TelegramAnnouncementExperimentVariantRow[];
};

type TelegramAnnouncementTargetOptions = {
  tags: Array<{ value: string; count: number }>;
  segments: Array<{ value: string; count: number }>;
  servers: Array<{ value: string; label: string; countryCode?: string | null; count: number }>;
  regions: Array<{ value: string; count: number }>;
};

type TelegramAnnouncementAnalytics = {
  range: '7d' | '30d' | '90d';
  totals: {
    announcements: number;
    recipients: number;
    sentCount: number;
    failedCount: number;
    openCount: number;
    clickCount: number;
    deliverySuccessRate: number;
    openRate: number;
    clickRate: number;
    resendAttempts: number;
    resendRecovered: number;
    resendRecoveryRate: number;
    promoAttributedOrders: number;
    promoAttributedRevenue: Array<{ currency: string; amount: number }>;
  };
  byType: Array<{
    type: string;
    announcements: number;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    openCount: number;
    clickCount: number;
    deliverySuccessRate: number;
    openRate: number;
    clickRate: number;
  }>;
  byAudience: Array<{
    audience: string;
    announcements: number;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    deliverySuccessRate: number;
    attributedOrders: number;
    attributedRevenue: Array<{ currency: string; amount: number }>;
    conversionRate: number;
  }>;
  byTemplate: Array<{
    templateId: string | null;
    templateName: string;
    announcements: number;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    openCount: number;
    clickCount: number;
    attributedOrders: number;
    attributedRevenue: Array<{ currency: string; amount: number }>;
    deliverySuccessRate: number;
    openRate: number;
    clickRate: number;
    conversionRate: number;
  }>;
  byExperiment: Array<{
    experimentId: string;
    name: string;
    status: string;
    audience: string;
    type: string;
    announcements: number;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    openCount: number;
    clickCount: number;
    attributedOrders: number;
    attributedRevenue: Array<{ currency: string; amount: number }>;
    latestAnnouncementId: string | null;
    deliverySuccessRate: number;
    openRate: number;
    clickRate: number;
    conversionRate: number;
    variants: Array<{
      variantKey: string;
      label: string;
      announcements: number;
      totalRecipients: number;
      sentCount: number;
      failedCount: number;
      openCount: number;
      clickCount: number;
      attributedOrders: number;
      attributedRevenue: Array<{ currency: string; amount: number }>;
      latestAnnouncementId: string | null;
      deliverySuccessRate: number;
      openRate: number;
      clickRate: number;
      conversionRate: number;
    }>;
  }>;
  bestSendTimes: Array<{
    hour: number;
    sentCount: number;
    openCount: number;
    clickCount: number;
    openRate: number;
    clickRate: number;
  }>;
  bySegment: Array<{
    segment: string;
    announcements: number;
    sentCount: number;
    attributedOrders: number;
    attributedRevenue: Array<{ currency: string; amount: number }>;
    conversionRate: number;
  }>;
  bySendHour: Array<{
    hour: number;
    sentCount: number;
    attributedOrders: number;
    attributedRevenue: Array<{ currency: string; amount: number }>;
    conversionRate: number;
  }>;
  recentAttribution: Array<{
    orderId: string;
    orderCode: string;
    createdAt: string | Date;
    couponCode: string | null;
    announcementId: string;
    announcementTitle: string;
    templateName: string | null;
    audience: string;
    targetSegment: string | null;
    sentAt: string | Date;
    minutesFromSend: number;
    priceAmount: number | null;
    priceCurrency: string | null;
  }>;
};

function formatAnnouncementMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }

  const normalizedCurrency = (currency || 'MMK').trim().toUpperCase();
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  return normalizedCurrency === 'MMK' ? `${formatted} Kyat` : `${formatted} ${normalizedCurrency}`;
}

function buildTelegramAnnouncementTemplateCommand(input: {
  audience: TelegramAnnouncementPanelAudience;
  type: TelegramAnnouncementType;
  title: string;
  message: string;
  includeSupportButton: boolean;
  cardStyle?: TelegramAnnouncementCardStyle;
  targetTag?: string | null;
  targetSegment?: string | null;
  targetServerId?: string | null;
  targetCountryCode?: string | null;
}) {
  return buildTelegramAnnouncementCommand({
    audience: input.audience,
    type: input.type,
    title: input.title,
    message: input.message,
    includeSupportButton: input.includeSupportButton,
    cardStyle: input.cardStyle,
    filters: {
      tag: input.targetTag || null,
      segment: input.targetSegment || null,
      serverId: input.targetServerId || null,
      countryCode: input.targetCountryCode || null,
    },
  });
}

function getAnnouncementCardStyleLabel(
  cardStyle: TelegramAnnouncementCardStyle,
  isMyanmar: boolean,
) {
  switch (cardStyle) {
    case 'PROMO':
      return isMyanmar ? 'Promo card' : 'Promo card';
    case 'PREMIUM':
      return isMyanmar ? 'Premium card' : 'Premium card';
    case 'OPERATIONS':
      return isMyanmar ? 'Operations card' : 'Operations card';
    case 'DEFAULT':
    default:
      return isMyanmar ? 'Default card' : 'Default card';
  }
}

function getAnnouncementSegmentLabel(
  segment: string,
  isMyanmar: boolean,
) {
  switch (segment) {
    case 'TRIAL_TO_PAID':
      return isMyanmar ? 'Trial မှ paid သို့' : 'Trial to paid';
    case 'PREMIUM_UPSELL':
      return isMyanmar ? 'Premium upsell' : 'Premium upsell';
    case 'RENEWAL_SOON':
      return isMyanmar ? 'Renewal မကြာမီ' : 'Renewal soon';
    case 'HIGH_VALUE':
      return isMyanmar ? 'တန်ဖိုးမြင့် customer' : 'High-value customer';
    default:
      return segment;
  }
}

function getAnnouncementCardPreviewClass(cardStyle: TelegramAnnouncementCardStyle) {
  switch (cardStyle) {
    case 'PROMO':
      return 'border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-background to-rose-500/10';
    case 'PREMIUM':
      return 'border-cyan-500/30 bg-gradient-to-br from-cyan-500/15 via-background to-blue-500/10';
    case 'OPERATIONS':
      return 'border-orange-500/30 bg-gradient-to-br from-orange-500/15 via-background to-yellow-500/10';
    case 'DEFAULT':
    default:
      return 'border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-background to-background';
  }
}

function getAnnouncementRecurrenceLabel(
  recurrenceType: TelegramAnnouncementRecurrenceType | null | undefined,
  isMyanmar: boolean,
) {
  switch (recurrenceType) {
    case 'DAILY':
      return isMyanmar ? 'နေ့စဉ်' : 'Daily';
    case 'WEEKLY':
      return isMyanmar ? 'အပတ်စဉ်' : 'Weekly';
    case 'NONE':
    case null:
    case undefined:
    default:
      return isMyanmar ? 'တစ်ကြိမ်သာ' : 'One-time';
  }
}

const DEFAULT_TELEGRAM_SETTINGS: TelegramSettings = {
  botToken: '',
  botUsername: '',
  welcomeMessage:
    'Welcome to Atomic-UI. Use /buy to order a new key, /renew to extend an existing key, or send your email address to link a current key.',
  keyNotFoundMessage:
    'No active key is linked to this account yet. Send your email address to link an existing key, or use /buy to place a new order.',
  localizedWelcomeMessages: {
    en: 'Welcome to Atomic-UI. Use /buy to order a new key, /renew to extend an existing key, or send your email address to link a current key.',
    my: 'Atomic-UI မှ ကြိုဆိုပါတယ်။ /buy ဖြင့် key အသစ်မှာယူနိုင်သည်၊ /renew ဖြင့် လက်ရှိ key ကို သက်တမ်းတိုးနိုင်သည်၊ သို့မဟုတ် သင့် email ကို ပို့ပြီး လက်ရှိ key ကို ချိတ်ဆက်နိုင်သည်။',
  },
  localizedKeyNotFoundMessages: {
    en: 'No active key is linked to this account yet. Send your email address to link an existing key, or use /buy to place a new order.',
    my: 'ဤ account နှင့် ချိတ်ထားသော active key မရှိသေးပါ။ လက်ရှိ key ကို ချိတ်ရန် သင့် email ကို ပို့ပါ၊ သို့မဟုတ် key အသစ်မှာယူရန် /buy ကို အသုံးပြုပါ။',
  },
  isEnabled: false,
  adminChatIds: [],
  dailyDigestEnabled: false,
  dailyDigestHour: 9,
  dailyDigestMinute: 0,
  digestLookbackHours: 24,
  defaultLanguage: 'en',
  showLanguageSelectorOnStart: true,
};

type TelegramSalesPlanCode =
  | 'trial_1d_3gb'
  | '1m_150gb'
  | '2m_300gb'
  | 'premium_1m_200gb'
  | 'premium_1m_500gb'
  | 'premium_1m_unlimited'
  | 'premium_3m_unlimited'
  | 'premium_6m_unlimited'
  | '3plus_unlimited';

type TelegramSalesPlanForm = {
  code: TelegramSalesPlanCode;
  enabled: boolean;
  label: string;
  localizedLabels: {
    en: string;
    my: string;
  };
  priceAmount: string;
  priceCurrency: string;
  priceLabel: string;
  localizedPriceLabels: {
    en: string;
    my: string;
  };
  deliveryType: 'ACCESS_KEY' | 'DYNAMIC_KEY';
  templateId?: string | null;
  dynamicTemplateId?: string | null;
  fixedDurationDays?: number | null;
  fixedDurationMonths?: number | null;
  minDurationMonths?: number | null;
  dataLimitGB?: number | null;
  unlimitedQuota: boolean;
};

type TelegramSalesPaymentMethodForm = {
  code: string;
  enabled: boolean;
  label: string;
  localizedLabels: {
    en: string;
    my: string;
  };
  accountName: string;
  accountNumber: string;
  imageUrl: string;
  note: string;
  localizedNotes: {
    en: string;
    my: string;
  };
};

type TelegramSalesSettingsForm = {
  enabled: boolean;
  allowRenewals: boolean;
  supportLink: string;
  dailySalesDigestEnabled: boolean;
  dailySalesDigestHour: number;
  dailySalesDigestMinute: number;
  trialCouponEnabled: boolean;
  trialCouponPaused: boolean;
  trialCouponLeadHours: string;
  trialCouponMaxRecipientsPerRun: string;
  trialCouponCode: string;
  trialCouponDiscountLabel: string;
  trialCouponDiscountAmount: string;
  renewalCouponEnabled: boolean;
  renewalCouponPaused: boolean;
  renewalCouponLeadDays: string;
  renewalCouponMaxRecipientsPerRun: string;
  renewalCouponCode: string;
  renewalCouponDiscountLabel: string;
  renewalCouponDiscountAmount: string;
  premiumUpsellCouponEnabled: boolean;
  premiumUpsellCouponPaused: boolean;
  premiumUpsellUsageThresholdPercent: string;
  premiumUpsellCouponMaxRecipientsPerRun: string;
  premiumUpsellCouponCode: string;
  premiumUpsellCouponDiscountLabel: string;
  premiumUpsellCouponDiscountAmount: string;
  winbackCouponEnabled: boolean;
  winbackCouponPaused: boolean;
  winbackCouponInactivityDays: string;
  winbackCouponMaxRecipientsPerRun: string;
  winbackCouponCode: string;
  winbackCouponDiscountLabel: string;
  winbackCouponDiscountAmount: string;
  promoCampaignCooldownHours: string;
  promoExcludeRecentRefundUsers: boolean;
  promoExcludeRecentRefundDays: string;
  promoExcludeSupportHeavyUsers: boolean;
  promoSupportHeavyLookbackDays: string;
  promoSupportHeavyThreshold: string;
  paymentReminderHours: string;
  pendingReviewReminderHours: string;
  rejectedOrderReminderHours: string;
  retryOrderReminderHours: string;
  unpaidOrderExpiryHours: string;
  paymentInstructions: string;
  localizedPaymentInstructions: {
    en: string;
    my: string;
  };
  paymentMethods: TelegramSalesPaymentMethodForm[];
  plans: TelegramSalesPlanForm[];
};

type TelegramOrderRow = {
  id: string;
  orderCode: string;
  kind: string;
  status: string;
  telegramChatId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  locale: string;
  requestedName?: string | null;
  requestedEmail?: string | null;
  planCode?: string | null;
  planName?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceLabel?: string | null;
  paymentMethodCode?: string | null;
  paymentMethodLabel?: string | null;
  paymentMethodAccountName?: string | null;
  paymentMethodAccountNumber?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  dataLimitBytes?: string | null;
  unlimitedQuota: boolean;
  deliveryType?: 'ACCESS_KEY' | 'DYNAMIC_KEY' | null;
  templateId?: string | null;
  dynamicTemplateId?: string | null;
  selectedServerId?: string | null;
  selectedServerName?: string | null;
  selectedServerCountryCode?: string | null;
  targetAccessKeyId?: string | null;
  targetAccessKeyName?: string | null;
  targetDynamicKeyId?: string | null;
  targetDynamicKeyName?: string | null;
  approvedAccessKeyId?: string | null;
  approvedAccessKeyName?: string | null;
  approvedDynamicKeyId?: string | null;
  approvedDynamicKeyName?: string | null;
  paymentProofType?: string | null;
  paymentProofUniqueId?: string | null;
  paymentProofRevision?: number | null;
  duplicateProofOrderId?: string | null;
  duplicateProofOrderCode?: string | null;
  duplicateProofDetectedAt?: Date | null;
  paymentSubmittedAt?: Date | null;
  paymentCaption?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
  rejectionReasonCode?: string | null;
  reviewedAt?: Date | null;
  fulfilledAt?: Date | null;
  rejectedAt?: Date | null;
  createdAt: Date;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskReasons: Array<
    | 'duplicate_proof'
    | 'repeated_rejections'
    | 'payment_history_mismatch'
    | 'retry_pattern'
    | 'multiple_open_orders'
    | 'resubmitted_proof'
  >;
  assignedReviewerUserId?: string | null;
  assignedReviewerEmail?: string | null;
  assignedAt?: Date | null;
  reviewedBy?: {
    id: string;
    email?: string | null;
  } | null;
  customerProfile?: {
    telegramUserId: string;
    telegramChatId: string | null;
    username?: string | null;
    displayName?: string | null;
    locale?: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  customerLinkedKeys: Array<{
    id: string;
    type?: 'ACCESS_KEY' | 'DYNAMIC_KEY';
    name: string;
    status: string;
    email?: string | null;
    publicSlug?: string | null;
    usedBytes: string;
    dataLimitBytes?: string | null;
    expiresAt?: Date | null;
  }>;
  customerRecentOrders: Array<{
    id: string;
    orderCode: string;
    status: string;
    kind: string;
    planName?: string | null;
    approvedAccessKeyName?: string | null;
    approvedDynamicKeyName?: string | null;
    createdAt: Date;
    fulfilledAt?: Date | null;
    rejectedAt?: Date | null;
  }>;
  customerSummary: {
    totalOrders: number;
    pendingOrders: number;
    fulfilledOrders: number;
    rejectedOrders: number;
    lastOrderAt?: Date | null;
    lastFulfilledAt?: Date | null;
  };
};

type TelegramServerChangeRequestRow = {
  id: string;
  requestCode: string;
  status: string;
  locale: string;
  telegramChatId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  currentServerId: string;
  currentServerName: string;
  currentServerCountryCode?: string | null;
  requestedServerId: string;
  requestedServerName: string;
  requestedServerCountryCode?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  reviewedAt?: Date | null;
  fulfilledAt?: Date | null;
  rejectedAt?: Date | null;
  createdAt: Date;
  remainingChangesBeforeApproval: number;
  remainingChangesAfterApproval: number;
  accessKey: {
    id: string;
    name: string;
    status: string;
    telegramId?: string | null;
    email?: string | null;
    usedBytes: string;
    dataLimitBytes?: string | null;
    expiresAt?: Date | null;
    publicSlug?: string | null;
    serverChangeCount: number;
    serverChangeLimit: number;
  };
};

type TelegramPremiumSupportRequestRow = {
  id: string;
  requestCode: string;
  status: string;
  requestType: string;
  locale: string;
  telegramChatId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  requestedRegionCode?: string | null;
  currentPoolSummary?: string | null;
  currentResolvedServerId?: string | null;
  currentResolvedServerName?: string | null;
  currentResolvedServerCountryCode?: string | null;
  appliedPinServerId?: string | null;
  appliedPinServerName?: string | null;
  appliedPinExpiresAt?: Date | null;
  followUpPending: boolean;
  lastFollowUpAt?: Date | null;
  lastAdminReplyAt?: Date | null;
  adminNote?: string | null;
  customerMessage?: string | null;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  reviewedAt?: Date | null;
  handledAt?: Date | null;
  dismissedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  linkedOutage?: {
    id: string;
    incidentCode: string;
    status: string;
    startedAt: Date;
    userAlertSentAt?: Date | null;
    migrationTargetServerName?: string | null;
    recoveredAt?: Date | null;
    serverId?: string | null;
    serverName?: string | null;
  } | null;
  reviewedBy?: {
    id: string;
    email?: string | null;
  } | null;
  replies: Array<{
    id: string;
    senderType: string;
    telegramUserId?: string | null;
    telegramUsername?: string | null;
    adminUserId?: string | null;
    senderName?: string | null;
    message: string;
    createdAt: Date;
  }>;
  dynamicAccessKey: {
    id: string;
    name: string;
    status: string;
    dynamicUrl?: string | null;
    publicSlug?: string | null;
    lastResolvedServerId?: string | null;
    lastResolvedAt?: Date | null;
    preferredCountryCodesJson?: string | null;
    preferredRegionMode?: string | null;
    pinnedServerId?: string | null;
    pinExpiresAt?: Date | null;
    notes?: string | null;
    availableRegionCodes: string[];
    availablePinServers: Array<{
      id: string;
      name: string;
      countryCode?: string | null;
    }>;
  };
};

type PremiumSupportHistoryEntry = {
  key: string;
  label: string;
  at: Date;
  detail?: string | null;
};

const TELEGRAM_REJECTION_REASON_PRESETS = [
  {
    code: 'proof_unclear',
    label: { en: 'Screenshot unclear', my: 'Screenshot မရှင်းလင်း' },
    message: {
      en: 'The payment screenshot is not clear enough to verify. Please send a clearer screenshot that shows the amount, account, and transfer time.',
      my: 'Payment screenshot ကို အတည်ပြုရန် မရှင်းလင်းသေးပါ။ Amount, account နှင့် transfer time ကို ရှင်းလင်းစွာ မြင်ရသော screenshot အသစ်တစ်ခု ပြန်ပို့ပေးပါ။',
    },
  },
  {
    code: 'amount_mismatch',
    label: { en: 'Amount mismatch', my: 'ငွေပမာဏ မကိုက်ညီ' },
    message: {
      en: 'The payment amount does not match the selected plan. Please contact support or send a corrected payment screenshot.',
      my: 'ငွေပေးချေထားသော amount သည် ရွေးထားသော plan နှင့် မကိုက်ညီပါ။ Support ကို ဆက်သွယ်ပါ သို့မဟုတ် မှန်ကန်သော payment screenshot ကို ပြန်ပို့ပေးပါ။',
    },
  },
  {
    code: 'wrong_payment_method',
    label: { en: 'Wrong payment method', my: 'ငွေပေးချေမှုနည်းလမ်း မမှန်' },
    message: {
      en: 'The screenshot does not match the selected payment method. Please switch the payment method or upload the correct screenshot.',
      my: 'Screenshot သည် ရွေးထားသော payment method နှင့် မကိုက်ညီပါ။ Payment method ကို ပြောင်းပါ သို့မဟုတ် မှန်ကန်သော screenshot ကို တင်ပေးပါ။',
    },
  },
  {
    code: 'duplicate_payment',
    label: { en: 'Duplicate proof', my: 'Duplicate proof' },
    message: {
      en: 'This payment proof appears to have been used before. Please contact support for manual review.',
      my: 'ဤ payment proof ကို ယခင်က အသုံးပြုထားသည့်ပုံစံ တွေ့ရပါသည်။ Manual review အတွက် support ကို ဆက်သွယ်ပါ။',
    },
  },
  {
    code: 'manual_review_required',
    label: { en: 'Needs manual review', my: 'Manual review လိုအပ်' },
    message: {
      en: 'We need a little more time to review this payment. Please contact support for follow-up on this order.',
      my: 'ဤ payment ကို စစ်ဆေးရန် အချိန်ပိုလိုအပ်ပါသည်။ ဤ order အတွက် နောက်ဆက်တွဲအခြေအနေကို support နှင့် ဆက်သွယ်ပေးပါ။',
    },
  },
] as const;

function formatPremiumSupportRequestTypeLabel(
  requestType: string,
  salesUi: {
    premiumRequestTypeRegion: string;
    premiumRequestTypeRoute: string;
  },
) {
  return requestType === 'REGION_CHANGE'
    ? salesUi.premiumRequestTypeRegion
    : salesUi.premiumRequestTypeRoute;
}

function formatPremiumSupportRequestStatusLabel(
  status: string,
  salesUi: {
    premiumStatusPending: string;
    premiumStatusApproved: string;
    premiumStatusHandled: string;
    premiumStatusDismissed: string;
  },
) {
  switch (status) {
    case 'PENDING_REVIEW':
      return salesUi.premiumStatusPending;
    case 'APPROVED':
      return salesUi.premiumStatusApproved;
    case 'HANDLED':
      return salesUi.premiumStatusHandled;
    case 'DISMISSED':
      return salesUi.premiumStatusDismissed;
    default:
      return status;
  }
}

function buildPremiumSupportHistory(
  request: TelegramPremiumSupportRequestRow,
  salesUi: {
    premiumHistorySubmitted: string;
    premiumHistoryReviewed: string;
    premiumHistoryApproved: string;
    premiumHistoryHandled: string;
    premiumHistoryDismissed: string;
    premiumHistoryPinApplied: string;
    premiumHistoryCustomerReply: string;
    premiumHistoryAdminReply: string;
    premiumPinExpires: string;
  },
): PremiumSupportHistoryEntry[] {
  const entries: PremiumSupportHistoryEntry[] = [
    {
      key: 'submitted',
      label: salesUi.premiumHistorySubmitted,
      at: request.createdAt,
      detail: request.requestedRegionCode || null,
    },
  ];

  if (request.reviewedAt) {
    entries.push({
      key: 'reviewed',
      label: salesUi.premiumHistoryReviewed,
      at: request.reviewedAt,
      detail: request.reviewerName || request.reviewedBy?.email || null,
    });
  }

  if (request.status === 'APPROVED' && request.reviewedAt) {
    entries.push({
      key: 'approved',
      label: salesUi.premiumHistoryApproved,
      at: request.reviewedAt,
      detail: request.requestedRegionCode || null,
    });
  }

  if (request.status === 'HANDLED' && (request.handledAt || request.reviewedAt)) {
    entries.push({
      key: 'handled',
      label: salesUi.premiumHistoryHandled,
      at: request.handledAt || request.reviewedAt!,
      detail: request.currentResolvedServerName || request.currentResolvedServerCountryCode || null,
    });
  }

  if (request.appliedPinServerName || request.appliedPinServerId) {
    entries.push({
      key: 'pin',
      label: salesUi.premiumHistoryPinApplied,
      at: request.handledAt || request.reviewedAt || request.updatedAt,
      detail: request.appliedPinExpiresAt
        ? `${request.appliedPinServerName || request.appliedPinServerId} · ${salesUi.premiumPinExpires}: ${formatDateTime(request.appliedPinExpiresAt)}`
        : request.appliedPinServerName || request.appliedPinServerId || null,
    });
  }

  if (request.status === 'DISMISSED' && (request.dismissedAt || request.reviewedAt)) {
    entries.push({
      key: 'dismissed',
      label: salesUi.premiumHistoryDismissed,
      at: request.dismissedAt || request.reviewedAt!,
      detail: request.customerMessage || null,
    });
  }

  if (request.linkedOutage) {
    entries.push({
      key: 'linked-outage',
      label: `Linked outage ${request.linkedOutage.incidentCode}`,
      at: request.linkedOutage.startedAt,
      detail: request.linkedOutage.serverName || request.linkedOutage.serverId || null,
    });
  }

  for (const reply of request.replies || []) {
    entries.push({
      key: `reply-${reply.id}`,
      label:
        reply.senderType === 'ADMIN'
          ? salesUi.premiumHistoryAdminReply
          : salesUi.premiumHistoryCustomerReply,
      at: reply.createdAt,
      detail: reply.message,
    });
  }

  return entries.sort((left, right) => left.at.getTime() - right.at.getTime());
}

const DEFAULT_TELEGRAM_SALES_SETTINGS: TelegramSalesSettingsForm = {
  enabled: false,
  allowRenewals: true,
  supportLink: '',
  dailySalesDigestEnabled: false,
  dailySalesDigestHour: 20,
  dailySalesDigestMinute: 0,
  trialCouponEnabled: true,
  trialCouponPaused: false,
  trialCouponLeadHours: '12',
  trialCouponMaxRecipientsPerRun: '25',
  trialCouponCode: 'TRIAL500',
  trialCouponDiscountLabel: '500 Kyat off your first paid order',
  trialCouponDiscountAmount: '500',
  renewalCouponEnabled: true,
  renewalCouponPaused: false,
  renewalCouponLeadDays: '5',
  renewalCouponMaxRecipientsPerRun: '20',
  renewalCouponCode: 'RENEW500',
  renewalCouponDiscountLabel: '500 Kyat off your renewal',
  renewalCouponDiscountAmount: '500',
  premiumUpsellCouponEnabled: true,
  premiumUpsellCouponPaused: false,
  premiumUpsellUsageThresholdPercent: '80',
  premiumUpsellCouponMaxRecipientsPerRun: '15',
  premiumUpsellCouponCode: 'PREMIUM1000',
  premiumUpsellCouponDiscountLabel: '1,000 Kyat off your premium upgrade',
  premiumUpsellCouponDiscountAmount: '1000',
  winbackCouponEnabled: true,
  winbackCouponPaused: false,
  winbackCouponInactivityDays: '30',
  winbackCouponMaxRecipientsPerRun: '20',
  winbackCouponCode: 'WELCOME700',
  winbackCouponDiscountLabel: '700 Kyat off your comeback order',
  winbackCouponDiscountAmount: '700',
  promoCampaignCooldownHours: '72',
  promoExcludeRecentRefundUsers: true,
  promoExcludeRecentRefundDays: '30',
  promoExcludeSupportHeavyUsers: true,
  promoSupportHeavyLookbackDays: '14',
  promoSupportHeavyThreshold: '3',
  paymentReminderHours: '3',
  pendingReviewReminderHours: '6',
  rejectedOrderReminderHours: '12',
  retryOrderReminderHours: '8',
  unpaidOrderExpiryHours: '24',
  paymentInstructions:
    'After payment, send the payment screenshot here as a photo or document. Please make sure the amount, transfer ID, and payment time are visible. Your order will stay pending until an admin approves it.',
  localizedPaymentInstructions: {
    en: 'After payment, send the payment screenshot here as a photo or document. Please make sure the amount, transfer ID, and payment time are visible. Your order will stay pending until an admin approves it.',
    my: 'ငွေပေးချေပြီးပါက payment screenshot ကို ဤနေရာတွင် photo သို့မဟုတ် document အဖြစ် ပို့ပေးပါ။ Amount, transfer ID နှင့် အချိန်ကို ရှင်းလင်းစွာ မြင်ရပါမည်။ Admin အတည်ပြုပြီးမှ key ကို ထုတ်ပေးပါမည်။',
  },
  paymentMethods: [
    {
      code: 'kpay',
      enabled: true,
      label: 'KPay',
      localizedLabels: { en: 'KPay', my: 'KPay' },
      accountName: '',
      accountNumber: '',
      imageUrl: '',
      note: '',
      localizedNotes: { en: '', my: '' },
    },
    {
      code: 'wavepay',
      enabled: true,
      label: 'Wave Pay',
      localizedLabels: { en: 'Wave Pay', my: 'Wave Pay' },
      accountName: '',
      accountNumber: '',
      imageUrl: '',
      note: '',
      localizedNotes: { en: '', my: '' },
    },
    {
      code: 'aya_pay',
      enabled: true,
      label: 'AYA Pay',
      localizedLabels: { en: 'AYA Pay', my: 'AYA Pay' },
      accountName: '',
      accountNumber: '',
      imageUrl: '',
      note: '',
      localizedNotes: { en: '', my: '' },
    },
  ],
  plans: [
    {
      code: 'trial_1d_3gb',
      enabled: true,
      label: 'Free Trial / 1 Day / 3 GB',
      localizedLabels: { en: 'Free Trial / 1 Day / 3 GB', my: 'Free Trial / ၁ ရက် / 3 GB' },
      priceAmount: '0',
      priceCurrency: 'MMK',
      priceLabel: 'Free Trial',
      localizedPriceLabels: { en: 'Free Trial', my: 'အခမဲ့ အစမ်းသုံး' },
      deliveryType: 'ACCESS_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: 1,
      fixedDurationMonths: null,
      minDurationMonths: null,
      dataLimitGB: 3,
      unlimitedQuota: false,
    },
    {
      code: '1m_150gb',
      enabled: true,
      label: '1 Month / 150 GB',
      localizedLabels: { en: '1 Month / 150 GB', my: '၁ လ / 150 GB' },
      priceAmount: '5000',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      deliveryType: 'ACCESS_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 1,
      minDurationMonths: null,
      dataLimitGB: 150,
      unlimitedQuota: false,
    },
    {
      code: '2m_300gb',
      enabled: true,
      label: '2 Months / 300 GB',
      localizedLabels: { en: '2 Months / 300 GB', my: '၂ လ / 300 GB' },
      priceAmount: '',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      deliveryType: 'ACCESS_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 2,
      minDurationMonths: null,
      dataLimitGB: 300,
      unlimitedQuota: false,
    },
    {
      code: 'premium_1m_200gb',
      enabled: true,
      label: 'Premium / 1 Month / 200 GB',
      localizedLabels: { en: 'Premium / 1 Month / 200 GB', my: 'Premium / ၁ လ / 200 GB' },
      priceAmount: '6000',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      deliveryType: 'DYNAMIC_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 1,
      minDurationMonths: null,
      dataLimitGB: 200,
      unlimitedQuota: false,
    },
    {
      code: 'premium_1m_500gb',
      enabled: true,
      label: 'Premium / 1 Month / 500 GB',
      localizedLabels: { en: 'Premium / 1 Month / 500 GB', my: 'Premium / ၁ လ / 500 GB' },
      priceAmount: '13000',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      deliveryType: 'DYNAMIC_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 1,
      minDurationMonths: null,
      dataLimitGB: 500,
      unlimitedQuota: false,
    },
    {
      code: 'premium_1m_unlimited',
      enabled: false,
      label: 'Premium / 1 Month / Unlimited (Legacy)',
      localizedLabels: { en: 'Premium / 1 Month / Unlimited (Legacy)', my: 'Premium / ၁ လ / Unlimited (Legacy)' },
      priceAmount: '',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      deliveryType: 'DYNAMIC_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 1,
      minDurationMonths: null,
      dataLimitGB: null,
      unlimitedQuota: true,
    },
    {
      code: 'premium_3m_unlimited',
      enabled: false,
      label: 'Premium / 3 Months / Unlimited (Legacy)',
      localizedLabels: { en: 'Premium / 3 Months / Unlimited (Legacy)', my: 'Premium / ၃ လ / Unlimited (Legacy)' },
      priceAmount: '',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      deliveryType: 'DYNAMIC_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 3,
      minDurationMonths: null,
      dataLimitGB: null,
      unlimitedQuota: true,
    },
    {
      code: 'premium_6m_unlimited',
      enabled: false,
      label: 'Premium / 6 Months / Unlimited (Legacy)',
      localizedLabels: { en: 'Premium / 6 Months / Unlimited (Legacy)', my: 'Premium / ၆ လ / Unlimited (Legacy)' },
      priceAmount: '',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      deliveryType: 'DYNAMIC_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 6,
      minDurationMonths: null,
      dataLimitGB: null,
      unlimitedQuota: true,
    },
    {
      code: '3plus_unlimited',
      enabled: false,
      label: 'Premium / 3+ Months / Unlimited (Legacy)',
      localizedLabels: { en: 'Premium / 3+ Months / Unlimited (Legacy)', my: 'Premium / ၃ လနှင့်အထက် / Unlimited (Legacy)' },
      priceAmount: '',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      deliveryType: 'DYNAMIC_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: null,
      minDurationMonths: 3,
      dataLimitGB: null,
      unlimitedQuota: true,
    },
  ],
};

function getEventLabel(eventId: string, t: (key: string) => string) {
  const isTestEvent = eventId.startsWith('TEST_');
  const normalizedEventId = isTestEvent ? eventId.slice(5) : eventId;
  const knownEvent = EVENT_TYPES.find((event) => event.id === normalizedEventId);
  const baseLabel = knownEvent ? t(knownEvent.labelKey) : normalizedEventId.replaceAll('_', ' ');

  return isTestEvent ? `${t('notifications.delivery.test_prefix')} ${baseLabel}` : baseLabel;
}

function getChannelLabel(log: DeliveryLog, t: (key: string) => string) {
  if (log.channelName) {
    return log.channelName;
  }

  if (log.channelId && log.channelMissing) {
    return t('notifications.delivery.deleted_channel');
  }

  return t('notifications.delivery.system');
}

function getStatusLabel(status: string, t: (key: string) => string) {
  if (status === 'SUCCESS' || status === 'FAILED' || status === 'SKIPPED') {
    return t(`notifications.status.${status}`);
  }

  return status;
}

function getStatusBadgeClass(status: string) {
  if (status === 'SUCCESS') {
    return 'border-emerald-500/40 text-emerald-500';
  }

  if (status === 'SKIPPED') {
    return 'border-amber-500/40 text-amber-500';
  }

  return '';
}

function parseStoredEventCooldowns(value?: string): EventCooldownInputs {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, rawValue]) => EVENT_TYPES.some((event) => event.id === key) && typeof rawValue === 'number')
        .map(([key, rawValue]) => [key, String(rawValue)]),
    ) as EventCooldownInputs;
  } catch {
    return {};
  }
}

function parseCooldownNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_NOTIFICATION_COOLDOWN_MINUTES) {
    return null;
  }

  return parsed;
}

function createWebhookHeaderRow(key = '', value = ''): WebhookHeaderRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    key,
    value,
  };
}

function parseStoredWebhookHeaders(value?: string): WebhookHeaderRow[] {
  if (!value) {
    return [createWebhookHeaderRow()];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [createWebhookHeaderRow()];
    }

    const rows = Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, headerValue]) => createWebhookHeaderRow(key, headerValue));

    return rows.length > 0 ? rows : [createWebhookHeaderRow()];
  } catch {
    return [createWebhookHeaderRow()];
  }
}

function buildWebhookHeadersPayload(headers: WebhookHeaderRow[]) {
  const next: Record<string, string> = {};
  const seenHeaders = new Set<string>();

  for (const header of headers) {
    const key = header.key.trim();
    const value = header.value.trim();

    if (!key && !value) {
      continue;
    }

    if (!key || !WEBHOOK_HEADER_NAME_PATTERN.test(key)) {
      return null;
    }

    const normalizedKey = key.toLowerCase();
    if (RESERVED_WEBHOOK_HEADERS.has(normalizedKey) || seenHeaders.has(normalizedKey)) {
      return null;
    }

    seenHeaders.add(normalizedKey);
    next[key] = value;
  }

  return next;
}

function buildEventCooldownPayload(eventCooldowns: EventCooldownInputs) {
  const next: Partial<Record<NotificationEventId, number>> = {};

  for (const [eventId, rawValue] of Object.entries(eventCooldowns) as Array<[NotificationEventId, string]>) {
    if (!rawValue.trim()) {
      continue;
    }

    const parsed = parseCooldownNumber(rawValue);
    if (parsed === null) {
      return null;
    }

    next[eventId] = parsed;
  }

  return next;
}

function TelegramBotSetupCard({ isActive }: { isActive: boolean }) {
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMyanmar = locale === 'my';
  const telegramUi = {
    enabled: isMyanmar ? 'ဖွင့်ထားသည်' : 'Enabled',
    disabled: isMyanmar ? 'ပိတ်ထားသည်' : 'Disabled',
    botUsername: isMyanmar ? 'ဘော့ Username' : 'Bot Username',
    botUsernamePlaceholder: '@yourbot',
    defaultLanguage: isMyanmar ? 'ဘော့ မူရင်းဘာသာစကား' : 'Bot default language',
    defaultLanguageDesc: isMyanmar
      ? 'အသုံးပြုသူက ဘာသာစကား မရွေးထားသေးပါက ဤဘာသာစကားကို သုံးမည်။'
      : 'Use this language until a user chooses their own bot language.',
    languageSelectorOnStart: isMyanmar ? 'ပထမဆုံး /start မှာ ဘာသာစကား ရွေးခိုင်းမည်' : 'Show language selector on first /start',
    languageSelectorOnStartDesc: isMyanmar
      ? 'အသုံးပြုသူအသစ်များသည် English / မြန်မာ ကို ရွေးပြီး welcome flow ကို ဆက်လုပ်မည်။'
      : 'New users choose English or Burmese before the welcome flow continues.',
    englishLanguage: 'English',
    burmeseLanguage: isMyanmar ? 'မြန်မာ' : 'Burmese',
    enableBot: isMyanmar ? 'Telegram bot ကို ဖွင့်မည်' : 'Enable Telegram bot',
    enableBotDesc: isMyanmar ? 'အသုံးပြုသူများက key ကို ချိတ်ဆက်နိုင်ခြင်း၊ share page ရယူနိုင်ခြင်းနှင့် self-service command များ အသုံးပြုနိုင်ခြင်းကို ခွင့်ပြုမည်။' : 'Allow users to link keys, receive share pages, and run self-service bot commands.',
    dailyDigest: isMyanmar ? 'Admin digest ကို နေ့စဉ် ပို့မည်' : 'Daily admin digest',
    dailyDigestDesc: isMyanmar ? 'သက်တမ်းကုန်နီးသော key များ၊ usage နှင့် share-page activity summary များကို admin chat များသို့ ပို့မည်။' : 'Send expiring-key, usage, and share-page activity summaries to admin chats.',
    digestHour: isMyanmar ? 'Digest ပို့ချိန် (နာရီ)' : 'Digest hour',
    digestMinute: isMyanmar ? 'Digest ပို့ချိန် (မိနစ်)' : 'Digest minute',
    lookbackWindow: isMyanmar ? 'ပြန်ကြည့်မည့် အချိန်အပိုင်းအခြား' : 'Lookback window',
    localizedWelcome: isMyanmar ? 'ဘာသာစကားလိုက် Welcome template များ' : 'Localized welcome templates',
    localizedWelcomeDesc: isMyanmar ? 'Default welcome message ကို အစားထိုးမည့် English / Burmese message များကို သတ်မှတ်နိုင်ပါသည်။' : 'Set English and Burmese variants for the bot welcome message.',
    localizedNotFound: isMyanmar ? 'ဘာသာစကားလိုက် Key-not-found template များ' : 'Localized key-not-found templates',
    localizedNotFoundDesc: isMyanmar ? 'Key မတွေ့သောအခါ အသုံးပြုမည့် English / Burmese message များကို သတ်မှတ်နိုင်ပါသည်။' : 'Set English and Burmese variants for the missing-key reply.',
    englishTemplate: isMyanmar ? 'English template' : 'English template',
    burmeseTemplate: isMyanmar ? 'မြန်မာ template' : 'Burmese template',
    settingsSaved: isMyanmar ? 'Telegram ဆက်တင်များ သိမ်းပြီးပါပြီ' : 'Telegram settings saved',
    settingsSavedDesc: isMyanmar ? 'ဘော့ configuration နှင့် digest schedule ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The bot configuration and digest schedule were updated.',
    settingsFailed: isMyanmar ? 'Telegram ဆက်တင် သိမ်းမရပါ' : 'Telegram settings failed',
    connected: isMyanmar ? 'Telegram ချိတ်ဆက်ပြီးပါပြီ' : 'Telegram connected',
    connectedDesc: (botName: string) => isMyanmar ? `@${botName} အဖြစ် ချိတ်ဆက်ထားသည်။` : `Connected as @${botName}.`,
    webhookSet: isMyanmar ? 'Webhook သတ်မှတ်ပြီးပါပြီ' : 'Webhook set',
    webhookSetDesc: isMyanmar ? 'ယခုမှစပြီး Telegram သည် update များကို ဤ panel သို့ ပို့မည်။' : 'Telegram will now send updates to this panel.',
    webhookRemoved: isMyanmar ? 'Webhook ဖယ်ရှားပြီးပါပြီ' : 'Webhook removed',
    webhookRemovedDesc: isMyanmar ? 'Telegram webhook delivery ကို ပိတ်လိုက်ပါပြီ။' : 'Telegram webhook delivery has been disabled.',
    webhookFailed: isMyanmar ? 'Webhook ပြင်ဆင်မှု မအောင်မြင်ပါ' : 'Webhook setup failed',
    webhookRemoveFailed: isMyanmar ? 'Webhook ဖယ်ရှားမှု မအောင်မြင်ပါ' : 'Webhook removal failed',
    digestSent: isMyanmar ? 'Telegram digest ပို့ပြီးပါပြီ' : 'Telegram digest sent',
    digestSentDesc: (count: number) => isMyanmar ? `Admin chat ${count} ခုသို့ ပို့ပြီးပါပြီ။` : `Delivered to ${count} admin chat(s).`,
    digestFailed: isMyanmar ? 'Digest ပို့မှု မအောင်မြင်ပါ' : 'Digest failed',
    webhookDesc: isMyanmar ? 'Webhook ဖွင့်ထားပါက message အသစ်များကို Telegram မှ ဤ endpoint သို့ ပို့မည်။' : 'Telegram sends new messages to this endpoint when the webhook is active.',
    webhookUnavailable: isMyanmar ? 'ဤ environment တွင် Webhook URL မရနိုင်ပါ' : 'Webhook URL unavailable in this environment',
    pendingUpdates: isMyanmar ? 'စောင့်ဆိုင်းနေသော update များ' : 'Pending updates',
    lastError: isMyanmar ? 'နောက်ဆုံးအမှား' : 'Last error',
    commandSurface: isMyanmar ? 'ဘော့ command မျက်နှာပြင်' : 'Bot command surface',
    userCommands: isMyanmar ? 'အသုံးပြုသူ command များ' : 'User commands',
    adminCommands: isMyanmar ? 'Admin command များ' : 'Admin commands',
    sendDigestNow: isMyanmar ? 'Digest ကို ယခုချက်ချင်း ပို့မည်' : 'Send digest now',
    announcementTitle: isMyanmar ? 'အသိပေးစာ ပို့ခြင်း' : 'Send announcement',
    announcementDesc: isMyanmar
      ? 'Discount, new server, maintenance, သို့မဟုတ် အခြား announcement များကို Telegram အသုံးပြုသူများထံသို့ တိုက်ရိုက်ပို့နိုင်သည်။'
      : 'Send discounts, new server updates, maintenance notes, or any other manual Telegram announcement to users.',
    announcementAudience: isMyanmar ? 'ပို့မည့် audience' : 'Audience',
    announcementType: isMyanmar ? 'Announcement အမျိုးအစား' : 'Announcement type',
    announcementSubject: isMyanmar ? 'ခေါင်းစဉ်' : 'Title',
    announcementBody: isMyanmar ? 'မက်ဆေ့ချ်' : 'Message',
    announcementTargetTag: isMyanmar ? 'Tag ဖြင့် target' : 'Target by tag',
    announcementTargetServer: isMyanmar ? 'Server ဖြင့် target' : 'Target by server',
    announcementTargetRegion: isMyanmar ? 'Region ဖြင့် target' : 'Target by region',
    announcementAllTargets: isMyanmar ? 'အားလုံး' : 'All',
    announcementCardStyle: isMyanmar ? 'Card style' : 'Card style',
    announcementCardPreview: isMyanmar ? 'Card preview' : 'Card preview',
    announcementCardPreviewDesc: isMyanmar
      ? 'Telegram တွင် ပို့မည့် branded card preview ကို ကြည့်နိုင်သည်။'
      : 'Preview the branded card style that will be sent to Telegram.',
    announcementRecurrence: isMyanmar ? 'Repeat schedule' : 'Repeat schedule',
    announcementOneTime: isMyanmar ? 'တစ်ကြိမ်သာ' : 'One-time',
    announcementDaily: isMyanmar ? 'နေ့စဉ်' : 'Daily',
    announcementWeekly: isMyanmar ? 'အပတ်စဉ်' : 'Weekly',
    includeSupportButton: isMyanmar ? 'Support button ထည့်မည်' : 'Include support button',
    sendAnnouncementNow: isMyanmar ? 'ယခုပဲ ပို့မည်' : 'Send now',
    announcementSent: isMyanmar ? 'Announcement ပို့ပြီးပါပြီ' : 'Announcement sent',
    announcementFailed: isMyanmar ? 'Announcement ပို့မရပါ' : 'Announcement failed',
    recipientsLabel: isMyanmar ? 'လက်ခံသူ' : 'Recipients',
    announcementScheduleAt: isMyanmar ? 'ပို့မည့် အချိန်' : 'Schedule for',
    announcementScheduleHint: isMyanmar ? 'အချိန် သတ်မှတ်ထားပါက နောက်မှ ပို့ပါမည်။' : 'Set a future time to send it later.',
    announcementScheduleNow: isMyanmar ? 'အချိန်ဇယားဖြင့် သိမ်းမည်' : 'Schedule',
    announcementPreviewSelf: isMyanmar ? 'ကိုယ့် Telegram သို့ preview ပို့မည်' : 'Preview to myself',
    announcementPreviewSent: isMyanmar ? 'Preview ပို့ပြီးပါပြီ' : 'Preview sent',
    announcementTemplateName: isMyanmar ? 'Template အမည်' : 'Template name',
    announcementSaveTemplate: isMyanmar ? 'Template အဖြစ် သိမ်းမည်' : 'Save template',
    announcementTemplateSaved: isMyanmar ? 'Template သိမ်းပြီးပါပြီ' : 'Template saved',
    announcementTemplateDeleted: isMyanmar ? 'Template ဖျက်ပြီးပါပြီ' : 'Template deleted',
    announcementTemplatesTitle: isMyanmar ? 'Saved templates' : 'Saved templates',
    announcementTemplatesDesc: isMyanmar ? 'အကြိမ်ကြိမ်အသုံးပြုမည့် announcement များကို template အဖြစ် သိမ်းနိုင်သည်။' : 'Save reusable announcement presets for discounts, new servers, maintenance, and more.',
    announcementPresetTemplatesTitle: isMyanmar ? 'Quick template presets' : 'Quick template presets',
    announcementPresetTemplatesDesc: isMyanmar
      ? 'အသင့်သုံး announcement template များကို form ထဲသို့ ထည့်နိုင်သလို Telegram admin command အဖြစ် copy လည်း လုပ်နိုင်သည်။'
      : 'Load ready-to-send announcement presets into the form or copy them as exact Telegram admin commands.',
    announcementHistoryTitle: isMyanmar ? 'Announcement history' : 'Announcement history',
    announcementHistoryDesc: isMyanmar ? 'ပို့ထားသော announcement များ၊ schedule များနှင့် failed deliveries များကို ကြည့်နိုင်သည်။' : 'Review sent announcements, scheduled sends, and failed deliveries.',
    announcementHeroImage: isMyanmar ? 'Hero image URL' : 'Hero image URL',
    announcementHeroImageHint: isMyanmar ? 'Telegram တွင် image card အဖြစ် ပို့လိုပါက image URL ကို ထည့်ပါ။' : 'Add an image URL to send the announcement as a branded Telegram image card.',
    announcementPinToInbox: isMyanmar ? 'Inbox တွင် pin လုပ်မည်' : 'Pin in customer inbox',
    announcementPinToInboxHint: isMyanmar
      ? 'ဤ announcement ကို customer inbox ထိပ်တွင် အရေးကြီး notice အဖြစ် ပြပါမည်။'
      : 'Keep this announcement pinned near the top of the customer inbox.',
    announcementAnalyticsTitle: isMyanmar ? 'Delivery analytics' : 'Delivery analytics',
    announcementAnalyticsDesc: isMyanmar ? 'Open/click performance၊ audience success rate နှင့် resend recovery ကို ကြည့်နိုင်သည်။' : 'Track delivery success, opens, clicks, and resend recovery for announcements.',
    announcementAnalyticsRange: isMyanmar ? 'Analytics window' : 'Analytics window',
    announcementOpens: isMyanmar ? 'Open များ' : 'Opens',
    announcementClicks: isMyanmar ? 'Clicks' : 'Clicks',
    announcementOpenRate: isMyanmar ? 'Open rate' : 'Open rate',
    announcementClickRate: isMyanmar ? 'Click rate' : 'Click rate',
    announcementSuccessRate: isMyanmar ? 'Success rate' : 'Success rate',
    announcementResendRecovery: isMyanmar ? 'Resend recovery' : 'Resend recovery',
    announcementByType: isMyanmar ? 'By announcement type' : 'By announcement type',
    announcementByAudience: isMyanmar ? 'By audience' : 'By audience',
    announcementApplyTemplate: isMyanmar ? 'Template သုံးမည်' : 'Use template',
    announcementSavePreset: isMyanmar ? 'Preset ကို သိမ်းမည်' : 'Save preset',
    announcementCopyCommand: isMyanmar ? 'Command ကို copy လုပ်မည်' : 'Copy command',
    announcementCommandCopied: isMyanmar ? 'Announcement command ကို copy လုပ်ပြီးပါပြီ' : 'Announcement command copied',
    announcementCommandPreview: isMyanmar ? 'Telegram command' : 'Telegram command',
    announcementDeleteTemplate: isMyanmar ? 'Template ဖျက်မည်' : 'Delete template',
    announcementNoTemplates: isMyanmar ? 'Saved template မရှိသေးပါ။' : 'No saved templates yet.',
    announcementNoHistory: isMyanmar ? 'Announcement history မရှိသေးပါ။' : 'No announcements sent yet.',
    announcementResendFailed: isMyanmar ? 'Failed များကို ပြန်ပို့မည်' : 'Resend failed',
    announcementSendScheduledNow: isMyanmar ? 'ယခုပဲ ပို့မည်' : 'Send now',
    announcementScheduled: isMyanmar ? 'Schedule လုပ်ပြီးပါပြီ' : 'Announcement scheduled',
    announcementScheduledDesc: (when: string) => isMyanmar ? `${when} တွင် ပို့မည်။` : `Scheduled for ${when}.`,
    announcementExperimentsTitle: isMyanmar ? 'A/B experiments' : 'A/B experiments',
    announcementExperimentsDesc: isMyanmar
      ? 'Promo copy, hero image နှင့် banner variant များကို audience တစ်ခုအပေါ် compare လုပ်နိုင်သည်။'
      : 'Compare promo copy, hero image, and banner variants against the same audience.',
    announcementExperimentName: isMyanmar ? 'Experiment name' : 'Experiment name',
    announcementExperimentVariantA: isMyanmar ? 'Variant A' : 'Variant A',
    announcementExperimentVariantB: isMyanmar ? 'Variant B' : 'Variant B',
    announcementExperimentSplit: isMyanmar ? 'Audience split' : 'Audience split',
    announcementExperimentSave: isMyanmar ? 'Experiment သိမ်းမည်' : 'Save experiment',
    announcementExperimentLaunch: isMyanmar ? 'Experiment စတင်မည်' : 'Launch experiment',
    announcementExperimentSaved: isMyanmar ? 'Experiment သိမ်းပြီးပါပြီ' : 'Experiment saved',
    announcementExperimentLaunched: isMyanmar ? 'Experiment စတင်ပြီးပါပြီ' : 'Experiment launched',
    announcementExperimentCreateNew: isMyanmar ? 'အသစ်ဖန်တီးမည်' : 'Create new',
    announcementExperimentJumpHistory: isMyanmar ? 'History သို့ သွားမည်' : 'Jump to history',
    announcementExperimentLoad: isMyanmar ? 'Edit form ထဲသို့ ထည့်မည်' : 'Load into form',
  };
  const utils = trpc.useUtils();
  const currentUserQuery = trpc.auth.me.useQuery();
  const settingsQuery = trpc.telegramBot.getSettings.useQuery();
  const webhookInfoQuery = trpc.telegramBot.getWebhookInfo.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const [form, setForm] = useState<TelegramSettings>(DEFAULT_TELEGRAM_SETTINGS);
  const [adminChatIdsInput, setAdminChatIdsInput] = useState('');
  const botTabParam = searchParams.get('botTab');
  const announcementIdParam = searchParams.get('announcementId')?.trim() || '';
  const [activeBotTab, setActiveBotTab] = useState<TelegramBotSubtabId>(
    botTabParam === 'broadcasts' ||
      botTabParam === 'templates' ||
      botTabParam === 'analytics' ||
      botTabParam === 'history'
      ? (botTabParam as TelegramBotSubtabId)
      : 'setup',
  );
  const [botAdvancedOpen, setBotAdvancedOpen] = useState(false);
  const [savedBotSnapshot, setSavedBotSnapshot] = useState<{
    form: TelegramSettings;
    adminChatIdsInput: string;
  } | null>(null);
  const [announcementAudience, setAnnouncementAudience] = useState<TelegramAnnouncementPanelAudience>('ACTIVE_USERS');
  const [announcementType, setAnnouncementType] = useState<TelegramAnnouncementType>('ANNOUNCEMENT');
  const [announcementCardStyle, setAnnouncementCardStyle] = useState<TelegramAnnouncementCardStyle>('DEFAULT');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementHeroImageUrl, setAnnouncementHeroImageUrl] = useState('');
  const [announcementIncludeSupportButton, setAnnouncementIncludeSupportButton] = useState(true);
  const [announcementPinToInbox, setAnnouncementPinToInbox] = useState(false);
  const [announcementTemplateName, setAnnouncementTemplateName] = useState('');
  const [announcementSourceTemplateId, setAnnouncementSourceTemplateId] = useState<string | null>(null);
  const [announcementSourceTemplateName, setAnnouncementSourceTemplateName] = useState<string | null>(null);
  const [announcementScheduledFor, setAnnouncementScheduledFor] = useState('');
  const [announcementRecurrenceType, setAnnouncementRecurrenceType] =
    useState<TelegramAnnouncementRecurrenceType>('NONE');
  const [announcementTargetTag, setAnnouncementTargetTag] = useState('ALL');
  const [announcementTargetSegment, setAnnouncementTargetSegment] = useState('ALL');
  const [announcementTargetServerId, setAnnouncementTargetServerId] = useState('ALL');
  const [announcementTargetCountryCode, setAnnouncementTargetCountryCode] = useState('ALL');
  const [announcementExperimentId, setAnnouncementExperimentId] = useState<string | null>(null);
  const [announcementExperimentName, setAnnouncementExperimentName] = useState('');
  const [announcementExperimentAudience, setAnnouncementExperimentAudience] =
    useState<TelegramAnnouncementPanelAudience>('ACTIVE_USERS');
  const [announcementExperimentType, setAnnouncementExperimentType] =
    useState<TelegramAnnouncementType>('PROMO');
  const [announcementExperimentTargetTag, setAnnouncementExperimentTargetTag] = useState('ALL');
  const [announcementExperimentTargetSegment, setAnnouncementExperimentTargetSegment] = useState('ALL');
  const [announcementExperimentTargetServerId, setAnnouncementExperimentTargetServerId] = useState('ALL');
  const [announcementExperimentTargetCountryCode, setAnnouncementExperimentTargetCountryCode] =
    useState('ALL');
  const [announcementExperimentIncludeSupportButton, setAnnouncementExperimentIncludeSupportButton] =
    useState(true);
  const [announcementExperimentPinToInbox, setAnnouncementExperimentPinToInbox] = useState(false);
  const [announcementExperimentVariantASplit, setAnnouncementExperimentVariantASplit] =
    useState('50');
  const [announcementExperimentVariantATitle, setAnnouncementExperimentVariantATitle] = useState('');
  const [announcementExperimentVariantAMessage, setAnnouncementExperimentVariantAMessage] =
    useState('');
  const [announcementExperimentVariantAHeroImageUrl, setAnnouncementExperimentVariantAHeroImageUrl] =
    useState('');
  const [announcementExperimentVariantACardStyle, setAnnouncementExperimentVariantACardStyle] =
    useState<TelegramAnnouncementCardStyle>('PROMO');
  const [announcementExperimentVariantBTitle, setAnnouncementExperimentVariantBTitle] = useState('');
  const [announcementExperimentVariantBMessage, setAnnouncementExperimentVariantBMessage] =
    useState('');
  const [announcementExperimentVariantBHeroImageUrl, setAnnouncementExperimentVariantBHeroImageUrl] =
    useState('');
  const [announcementExperimentVariantBCardStyle, setAnnouncementExperimentVariantBCardStyle] =
    useState<TelegramAnnouncementCardStyle>('PROMO');
  const [announcementAnalyticsRange, setAnnouncementAnalyticsRange] = useState<'7d' | '30d' | '90d'>('30d');
  const isBroadcastsTabActive = isActive && activeBotTab === 'broadcasts';
  const isTemplatesTabActive = isActive && activeBotTab === 'templates';
  const isAnalyticsTabActive = isActive && activeBotTab === 'analytics';
  const isHistoryTabActive = isActive && activeBotTab === 'history';
  const botSettingsDirty = useMemo(() => {
    if (!savedBotSnapshot) {
      return false;
    }

    return (
      JSON.stringify({ form, adminChatIdsInput }) !==
      JSON.stringify(savedBotSnapshot)
    );
  }, [form, adminChatIdsInput, savedBotSnapshot]);

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    const nextForm: TelegramSettings = {
      botToken: settingsQuery.data.botToken || '',
      botUsername: settingsQuery.data.botUsername || '',
      welcomeMessage: settingsQuery.data.welcomeMessage || t('settings.telegram.welcome_placeholder'),
      keyNotFoundMessage:
        settingsQuery.data.keyNotFoundMessage || t('settings.telegram.not_found_placeholder'),
      localizedWelcomeMessages: settingsQuery.data.localizedWelcomeMessages || {},
      localizedKeyNotFoundMessages: settingsQuery.data.localizedKeyNotFoundMessages || {},
      isEnabled: settingsQuery.data.isEnabled ?? false,
      adminChatIds: settingsQuery.data.adminChatIds || [],
      dailyDigestEnabled: settingsQuery.data.dailyDigestEnabled ?? false,
      dailyDigestHour: settingsQuery.data.dailyDigestHour ?? 9,
      dailyDigestMinute: settingsQuery.data.dailyDigestMinute ?? 0,
      digestLookbackHours: settingsQuery.data.digestLookbackHours ?? 24,
      defaultLanguage: settingsQuery.data.defaultLanguage === 'my' ? 'my' : 'en',
      showLanguageSelectorOnStart: settingsQuery.data.showLanguageSelectorOnStart ?? true,
    };
    const nextAdminChatIdsInput = (settingsQuery.data.adminChatIds || []).join(', ');
    setForm(nextForm);
    setAdminChatIdsInput(nextAdminChatIdsInput);
    setSavedBotSnapshot({
      form: JSON.parse(JSON.stringify(nextForm)) as TelegramSettings,
      adminChatIdsInput: nextAdminChatIdsInput,
    });
  }, [settingsQuery.data, t]);

  useEffect(() => {
    if (
      botTabParam === 'setup' ||
      botTabParam === 'broadcasts' ||
      botTabParam === 'templates' ||
      botTabParam === 'analytics' ||
      botTabParam === 'history'
    ) {
      setActiveBotTab(botTabParam);
    }
  }, [botTabParam]);

  const updateTelegramUrlState = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const saveSettingsMutation = trpc.telegramBot.updateSettings.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.telegramBot.getSettings.invalidate(),
        utils.telegramBot.getWebhookInfo.invalidate(),
      ]);
      toast({
        title: telegramUi.settingsSaved,
        description: telegramUi.settingsSavedDesc,
      });
    },
    onError: (error) => {
      toast({
        title: telegramUi.settingsFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const testConnectionMutation = trpc.telegramBot.testConnection.useMutation({
    onSuccess: (result) => {
      setForm((prev) => ({ ...prev, botUsername: result.botUsername || prev.botUsername }));
      toast({
        title: telegramUi.connected,
        description: telegramUi.connectedDesc(result.botUsername || result.botName),
      });
    },
    onError: (error) => {
      toast({
        title: 'Telegram connection failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setWebhookMutation = trpc.telegramBot.setWebhook.useMutation({
    onSuccess: async () => {
      await webhookInfoQuery.refetch();
      toast({
        title: telegramUi.webhookSet,
        description: telegramUi.webhookSetDesc,
      });
    },
    onError: (error) => {
      toast({
        title: telegramUi.webhookFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteWebhookMutation = trpc.telegramBot.deleteWebhook.useMutation({
    onSuccess: async () => {
      await webhookInfoQuery.refetch();
      toast({
        title: telegramUi.webhookRemoved,
        description: telegramUi.webhookRemovedDesc,
      });
    },
    onError: (error) => {
      toast({
        title: telegramUi.webhookRemoveFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runDigestMutation = trpc.telegramBot.runDigestNow.useMutation({
    onSuccess: (result) => {
      toast({
        title: telegramUi.digestSent,
        description: telegramUi.digestSentDesc(result.adminChats ?? 0),
      });
    },
    onError: (error) => {
      toast({
        title: telegramUi.digestFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const announcementAudienceCountsQuery = trpc.telegramBot.getAnnouncementAudienceCounts.useQuery(
    {
      filters: {
        tag: announcementTargetTag === 'ALL' ? null : announcementTargetTag,
        segment:
          announcementTargetSegment === 'ALL'
            ? null
            : (announcementTargetSegment as TelegramAnnouncementSegment),
        serverId: announcementTargetServerId === 'ALL' ? null : announcementTargetServerId,
        countryCode: announcementTargetCountryCode === 'ALL' ? null : announcementTargetCountryCode,
      },
      type: announcementType,
    },
    {
      enabled: isBroadcastsTabActive,
    },
  );
  const announcementTargetOptionsQuery = trpc.telegramBot.listAnnouncementTargetOptions.useQuery(undefined, {
    enabled: isBroadcastsTabActive || isTemplatesTabActive || isAnalyticsTabActive,
  });
  const announcementTemplatesQuery = trpc.telegramBot.listAnnouncementTemplates.useQuery(undefined, {
    enabled: isBroadcastsTabActive || isTemplatesTabActive || isAnalyticsTabActive,
  });
  const announcementExperimentsQuery = trpc.telegramBot.listAnnouncementExperiments.useQuery(
    undefined,
    {
      enabled: isTemplatesTabActive || isAnalyticsTabActive || isHistoryTabActive,
    },
  );
  const announcementHistoryQuery = trpc.telegramBot.listAnnouncementHistory.useQuery(
    { limit: 12, includeArchived: false },
    {
      enabled: isHistoryTabActive,
    },
  );
  const announcementAnalyticsQuery = trpc.telegramBot.getAnnouncementAnalytics.useQuery(
    {
      range: announcementAnalyticsRange,
    },
    {
      enabled: isAnalyticsTabActive,
    },
  );
  const canManageAnnouncements = hasTelegramAnnouncementManageScope(currentUserQuery.data?.adminScope);
  const sendAnnouncementMutation = trpc.telegramBot.sendAnnouncement.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.telegramBot.listAnnouncementHistory.invalidate(),
        utils.telegramBot.getAnnouncementAudienceCounts.invalidate(),
        utils.telegramBot.getAnnouncementAnalytics.invalidate(),
      ]);
      toast({
        title: result.scheduled ? telegramUi.announcementScheduled : telegramUi.announcementSent,
        description: result.scheduled
          ? telegramUi.announcementScheduledDesc(
              announcementScheduledFor ? formatDateTime(new Date(announcementScheduledFor)) : '',
            )
          : `${result.sentCount} ${telegramUi.recipientsLabel.toLowerCase()}${result.failedCount > 0 ? ` · ${result.failedCount} failed` : ''}`,
      });
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setAnnouncementHeroImageUrl('');
      setAnnouncementCardStyle('DEFAULT');
      setAnnouncementPinToInbox(false);
      setAnnouncementScheduledFor('');
      setAnnouncementRecurrenceType('NONE');
      setAnnouncementSourceTemplateId(null);
      setAnnouncementSourceTemplateName(null);
    },
    onError: (error) => {
      toast({
        title: telegramUi.announcementFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const previewAnnouncementToSelfMutation = trpc.telegramBot.previewAnnouncementToSelf.useMutation({
    onSuccess: () => {
      toast({
        title: telegramUi.announcementPreviewSent,
        description: 'Sent to your linked Telegram admin chat.',
      });
    },
    onError: (error) => {
      toast({
        title: telegramUi.announcementFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const saveAnnouncementTemplateMutation = trpc.telegramBot.saveAnnouncementTemplate.useMutation({
    onSuccess: async () => {
      await utils.telegramBot.listAnnouncementTemplates.invalidate();
      toast({
        title: telegramUi.announcementTemplateSaved,
      });
      setAnnouncementTemplateName('');
    },
    onError: (error) => {
      toast({
        title: telegramUi.announcementFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const deleteAnnouncementTemplateMutation = trpc.telegramBot.deleteAnnouncementTemplate.useMutation({
    onSuccess: async () => {
      await utils.telegramBot.listAnnouncementTemplates.invalidate();
      toast({
        title: telegramUi.announcementTemplateDeleted,
      });
    },
    onError: (error) => {
      toast({
        title: telegramUi.announcementFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const saveAnnouncementExperimentMutation =
    trpc.telegramBot.saveAnnouncementExperiment.useMutation({
      onSuccess: async (result) => {
        await Promise.all([
          utils.telegramBot.listAnnouncementExperiments.invalidate(),
          utils.telegramBot.getAnnouncementAnalytics.invalidate(),
        ]);
        if (result?.id) {
          setAnnouncementExperimentId(result.id);
        }
        toast({
          title: telegramUi.announcementExperimentSaved,
        });
      },
      onError: (error) => {
        toast({
          title: telegramUi.announcementFailed,
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  const launchAnnouncementExperimentMutation =
    trpc.telegramBot.launchAnnouncementExperiment.useMutation({
      onSuccess: async (result) => {
        await Promise.all([
          utils.telegramBot.listAnnouncementExperiments.invalidate(),
          utils.telegramBot.listAnnouncementHistory.invalidate(),
          utils.telegramBot.getAnnouncementAnalytics.invalidate(),
        ]);
        toast({
          title: telegramUi.announcementExperimentLaunched,
          description: `${result.results.length} variant${result.results.length === 1 ? '' : 's'} dispatched.`,
        });
        if (result.firstAnnouncementId) {
          setActiveBotTab('history');
          updateTelegramUrlState({
            workspace: 'telegram',
            botTab: 'history',
            announcementId: result.firstAnnouncementId,
          });
        }
      },
      onError: (error) => {
        toast({
          title: telegramUi.announcementFailed,
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  const resendAnnouncementFailedMutation = trpc.telegramBot.resendAnnouncementFailed.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.telegramBot.listAnnouncementHistory.invalidate(),
        utils.telegramBot.getAnnouncementAnalytics.invalidate(),
      ]);
      toast({
        title: telegramUi.announcementSent,
      });
    },
    onError: (error) => {
      toast({
        title: telegramUi.announcementFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const resendAnnouncementFailedBatchMutation =
    trpc.telegramBot.resendAnnouncementFailedBatch.useMutation({
      onSuccess: async (result) => {
        await Promise.all([
          utils.telegramBot.listAnnouncementHistory.invalidate(),
          utils.telegramBot.getAnnouncementAnalytics.invalidate(),
        ]);
        toast({
          title: telegramUi.announcementSent,
          description: `${result.processed} announcement${result.processed === 1 ? '' : 's'} processed.`,
        });
      },
      onError: (error) => {
        toast({
          title: telegramUi.announcementFailed,
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  const archiveAnnouncementsMutation = trpc.telegramBot.archiveAnnouncements.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.telegramBot.listAnnouncementHistory.invalidate(),
        utils.telegramBot.getAnnouncementAnalytics.invalidate(),
      ]);
      toast({
        title: isMyanmar ? 'Announcement များကို archive လုပ်ပြီးပါပြီ' : 'Announcements archived',
        description: isMyanmar
          ? `${result.archivedCount} ခုကို history မှ archive လုပ်ပြီးပါပြီ။`
          : `${result.archivedCount} announcement${result.archivedCount === 1 ? '' : 's'} archived.`,
      });
      if (announcementIdParam) {
        updateTelegramUrlState({ announcementId: null });
      }
    },
    onError: (error) => {
      toast({
        title: telegramUi.announcementFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const dispatchScheduledAnnouncementMutation = trpc.telegramBot.dispatchScheduledAnnouncement.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.telegramBot.listAnnouncementHistory.invalidate(),
        utils.telegramBot.getAnnouncementAnalytics.invalidate(),
      ]);
      toast({
        title: telegramUi.announcementSent,
      });
    },
    onError: (error) => {
      toast({
        title: telegramUi.announcementFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const isSaving = saveSettingsMutation.isPending;
  const hasToken = form.botToken.trim().length > 0;
  const announcementFilters = {
    tag: announcementTargetTag === 'ALL' ? null : announcementTargetTag,
    segment:
      announcementTargetSegment === 'ALL'
        ? null
        : (announcementTargetSegment as TelegramAnnouncementSegment),
    serverId: announcementTargetServerId === 'ALL' ? null : announcementTargetServerId,
    countryCode: announcementTargetCountryCode === 'ALL' ? null : announcementTargetCountryCode,
  };
  const parsedExperimentVariantASplit = Number.parseInt(
    announcementExperimentVariantASplit.trim() || '50',
    10,
  );
  const normalizedExperimentVariantASplit = Number.isFinite(parsedExperimentVariantASplit)
    ? Math.min(95, Math.max(5, parsedExperimentVariantASplit))
    : 50;
  const normalizedExperimentVariantBSplit = 100 - normalizedExperimentVariantASplit;
  const announcementExperimentFilters = {
    tag: announcementExperimentTargetTag === 'ALL' ? null : announcementExperimentTargetTag,
    segment:
      announcementExperimentTargetSegment === 'ALL'
        ? null
        : (announcementExperimentTargetSegment as TelegramAnnouncementSegment),
    serverId:
      announcementExperimentTargetServerId === 'ALL' ? null : announcementExperimentTargetServerId,
    countryCode:
      announcementExperimentTargetCountryCode === 'ALL'
        ? null
        : announcementExperimentTargetCountryCode,
  };
  const announcementAudienceCount = announcementAudienceCountsQuery.data?.[announcementAudience] ?? 0;
  const announcementTemplates = useMemo(
    () => (announcementTemplatesQuery.data ?? []) as TelegramAnnouncementTemplateRow[],
    [announcementTemplatesQuery.data],
  );
  const announcementExperiments = useMemo(
    () => (announcementExperimentsQuery.data ?? []) as TelegramAnnouncementExperimentRow[],
    [announcementExperimentsQuery.data],
  );
  const announcementHistory = useMemo(
    () => (announcementHistoryQuery.data ?? []) as TelegramAnnouncementHistoryRow[],
    [announcementHistoryQuery.data],
  );
  const announcementAnalytics = useMemo(
    () => (announcementAnalyticsQuery.data ?? null) as TelegramAnnouncementAnalytics | null,
    [announcementAnalyticsQuery.data],
  );
  const announcementAnalyticsByExperiment = useMemo(
    () =>
      new Map(
        (announcementAnalytics?.byExperiment || []).map((experiment) => [
          experiment.experimentId,
          experiment,
        ]),
      ),
    [announcementAnalytics],
  );
  const failedAnnouncementIds = useMemo(
    () =>
      announcementHistory
        .filter((announcement) => announcement.failedCount > 0)
        .map((announcement) => announcement.id),
    [announcementHistory],
  );
  const archivableAnnouncementIds = useMemo(
    () =>
      announcementHistory
        .filter((announcement) => {
          if (
            announcement.status === 'PROCESSING' ||
            announcement.status === 'SCHEDULED' ||
            announcement.status === 'ARCHIVED'
          ) {
            return false;
          }
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          return new Date(announcement.createdAt).getTime() <= sevenDaysAgo;
        })
        .map((announcement) => announcement.id),
    [announcementHistory],
  );
  const announcementTargetOptions = (announcementTargetOptionsQuery.data ?? {
    tags: [],
    segments: [],
    servers: [],
    regions: [],
  }) as TelegramAnnouncementTargetOptions;
  const announcementPresetTemplates = useMemo(
    () =>
      TELEGRAM_ANNOUNCEMENT_PRESETS.map((preset) => {
        const title = preset.title[isMyanmar ? 'my' : 'en'];
        const message = preset.message[isMyanmar ? 'my' : 'en'];
        return {
          code: preset.code,
          name: preset.name[isMyanmar ? 'my' : 'en'],
          title,
          message,
          audience: preset.audience,
          type: preset.type,
          cardStyle: preset.cardStyle,
          includeSupportButton: preset.includeSupportButton,
          recurrenceType: preset.recurrenceType || 'NONE',
          targetTag: preset.filters?.tag || null,
          targetSegment: preset.filters?.segment || null,
          targetServerId: preset.filters?.serverId || null,
          targetCountryCode: preset.filters?.countryCode || null,
          command: buildTelegramAnnouncementTemplateCommand({
            audience: preset.audience,
            type: preset.type,
            title,
            message,
            includeSupportButton: preset.includeSupportButton,
            cardStyle: preset.cardStyle,
            targetTag: preset.filters?.tag || null,
            targetSegment: preset.filters?.segment || null,
            targetServerId: preset.filters?.serverId || null,
            targetCountryCode: preset.filters?.countryCode || null,
          }),
        };
      }),
    [isMyanmar],
  );
  const webhookUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/telegram/webhook`;

  const copyAnnouncementCommand = async (command: string) => {
    await copyToClipboard(command, telegramUi.announcementCommandCopied, telegramUi.announcementCommandPreview);
  };

  useEffect(() => {
    if (!isHistoryTabActive || !announcementIdParam) {
      return;
    }

    const announcementCard = document.getElementById(`announcement-history-${announcementIdParam}`);
    if (announcementCard) {
      announcementCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [announcementHistory, announcementIdParam, isHistoryTabActive]);

  const resetAnnouncementExperimentForm = () => {
    setAnnouncementExperimentId(null);
    setAnnouncementExperimentName('');
    setAnnouncementExperimentAudience('ACTIVE_USERS');
    setAnnouncementExperimentType('PROMO');
    setAnnouncementExperimentTargetTag('ALL');
    setAnnouncementExperimentTargetSegment('ALL');
    setAnnouncementExperimentTargetServerId('ALL');
    setAnnouncementExperimentTargetCountryCode('ALL');
    setAnnouncementExperimentIncludeSupportButton(true);
    setAnnouncementExperimentPinToInbox(false);
    setAnnouncementExperimentVariantASplit('50');
    setAnnouncementExperimentVariantATitle('');
    setAnnouncementExperimentVariantAMessage('');
    setAnnouncementExperimentVariantAHeroImageUrl('');
    setAnnouncementExperimentVariantACardStyle('PROMO');
    setAnnouncementExperimentVariantBTitle('');
    setAnnouncementExperimentVariantBMessage('');
    setAnnouncementExperimentVariantBHeroImageUrl('');
    setAnnouncementExperimentVariantBCardStyle('PROMO');
  };

  const loadAnnouncementExperimentIntoForm = (experiment: TelegramAnnouncementExperimentRow) => {
    const variantA = experiment.variants[0];
    const variantB = experiment.variants[1];

    setAnnouncementExperimentId(experiment.id);
    setAnnouncementExperimentName(experiment.name);
    setAnnouncementExperimentAudience(experiment.audience);
    setAnnouncementExperimentType(experiment.type);
    setAnnouncementExperimentTargetTag(experiment.targetTag || 'ALL');
    setAnnouncementExperimentTargetSegment(experiment.targetSegment || 'ALL');
    setAnnouncementExperimentTargetServerId(experiment.targetServerId || 'ALL');
    setAnnouncementExperimentTargetCountryCode(experiment.targetCountryCode || 'ALL');
    setAnnouncementExperimentIncludeSupportButton(experiment.includeSupportButton);
    setAnnouncementExperimentPinToInbox(experiment.pinToInbox);
    setAnnouncementExperimentVariantASplit(String(variantA?.allocationPercent || 50));
    setAnnouncementExperimentVariantATitle(variantA?.title || '');
    setAnnouncementExperimentVariantAMessage(variantA?.message || '');
    setAnnouncementExperimentVariantAHeroImageUrl(variantA?.heroImageUrl || '');
    setAnnouncementExperimentVariantACardStyle(variantA?.cardStyle || 'PROMO');
    setAnnouncementExperimentVariantBTitle(variantB?.title || '');
    setAnnouncementExperimentVariantBMessage(variantB?.message || '');
    setAnnouncementExperimentVariantBHeroImageUrl(variantB?.heroImageUrl || '');
    setAnnouncementExperimentVariantBCardStyle(variantB?.cardStyle || 'PROMO');
  };

  const handleSave = () => {
    const adminChatIds = adminChatIdsInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    saveSettingsMutation.mutate({
      botToken: form.botToken.trim(),
      botUsername: form.botUsername?.trim() || undefined,
      welcomeMessage: form.welcomeMessage?.trim() || undefined,
      keyNotFoundMessage: form.keyNotFoundMessage?.trim() || undefined,
      localizedWelcomeMessages: Object.fromEntries(
        Object.entries(form.localizedWelcomeMessages || {})
          .map(([localeCode, value]) => [localeCode, value.trim()])
          .filter(([, value]) => value.length > 0),
      ),
      localizedKeyNotFoundMessages: Object.fromEntries(
        Object.entries(form.localizedKeyNotFoundMessages || {})
          .map(([localeCode, value]) => [localeCode, value.trim()])
          .filter(([, value]) => value.length > 0),
      ),
      isEnabled: form.isEnabled,
      adminChatIds,
      dailyDigestEnabled: form.dailyDigestEnabled,
      dailyDigestHour: form.dailyDigestHour,
      dailyDigestMinute: form.dailyDigestMinute,
      digestLookbackHours: form.digestLookbackHours,
      defaultLanguage: form.defaultLanguage,
      showLanguageSelectorOnStart: form.showLanguageSelectorOnStart,
    });
  };

  const handleResetBotSettings = () => {
    if (!savedBotSnapshot) {
      return;
    }

    setForm(JSON.parse(JSON.stringify(savedBotSnapshot.form)) as TelegramSettings);
    setAdminChatIdsInput(savedBotSnapshot.adminChatIdsInput);
  };

  const updateLocalizedTelegramText = (
    key: 'localizedWelcomeMessages' | 'localizedKeyNotFoundMessages',
    localeCode: 'en' | 'my',
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [localeCode]: value,
      },
    }));
  };

  return (
    <Card className="border-blue-500/20 bg-blue-500/[0.04] dark:bg-blue-500/[0.06]">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              {t('settings.telegram.title')}
            </CardTitle>
            <CardDescription>{t('settings.telegram.desc')}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={form.isEnabled ? 'default' : 'secondary'}>
              {form.isEnabled ? telegramUi.enabled : telegramUi.disabled}
            </Badge>
            <Badge variant={webhookInfoQuery.data?.webhookSet ? 'default' : 'outline'}>
              {webhookInfoQuery.data?.webhookSet
                ? t('settings.telegram.webhook_active')
                : t('settings.telegram.webhook_inactive')}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs
          value={activeBotTab}
          onValueChange={(value) => {
            const nextTab = value as TelegramBotSubtabId;
            setActiveBotTab(nextTab);
            updateTelegramUrlState({
              workspace: 'telegram',
              botTab: nextTab,
              announcementId: nextTab === 'history' ? announcementIdParam || null : null,
            });
          }}
          className="space-y-5"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-[1.35rem] border border-border/60 bg-background/50 p-2 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(4,11,24,0.82),rgba(5,12,24,0.74))] lg:grid-cols-5">
            <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="setup">Bot setup</TabsTrigger>
            <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="broadcasts">Broadcasts</TabsTrigger>
            <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="templates">Templates</TabsTrigger>
            <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="analytics">Analytics</TabsTrigger>
            <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="history">History</TabsTrigger>
          </TabsList>

          <div className="sticky top-20 z-20 rounded-2xl border border-border/60 bg-background/85 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {botSettingsDirty ? 'Unsaved Telegram bot changes' : 'Telegram bot settings are in sync'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {botSettingsDirty
                    ? 'Save or reset before leaving this workspace.'
                    : 'Your bot identity, language, and digest settings match the latest saved version.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!botSettingsDirty || isSaving}
                  onClick={handleResetBotSettings}
                >
                  Reset
                </Button>
                <Button type="button" onClick={handleSave} disabled={isSaving || !botSettingsDirty}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {t('settings.telegram.save')}
                </Button>
              </div>
            </div>
          </div>

          <TabsContent value="setup" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="telegram-bot-token">{t('settings.telegram.token')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="telegram-bot-token"
                    type="password"
                    placeholder={t('settings.telegram.token_placeholder')}
                    value={form.botToken}
                    onChange={(event) => setForm((prev) => ({ ...prev, botToken: event.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => testConnectionMutation.mutate({ botToken: form.botToken.trim() })}
                    disabled={!hasToken || testConnectionMutation.isPending}
                  >
                    {testConnectionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                    {t('settings.telegram.test')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.telegram.help')}{' '}
                  <Link href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
                    @BotFather
                  </Link>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram-bot-username">{telegramUi.botUsername}</Label>
                <Input
                  id="telegram-bot-username"
                  placeholder={telegramUi.botUsernamePlaceholder}
                  value={form.botUsername || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, botUsername: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram-admin-chat-ids">{t('settings.telegram.admin_ids')}</Label>
                <Input
                  id="telegram-admin-chat-ids"
                  placeholder={t('settings.telegram.admin_ids_placeholder')}
                  value={adminChatIdsInput}
                  onChange={(event) => setAdminChatIdsInput(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{telegramUi.defaultLanguage}</Label>
                <Select
                  value={form.defaultLanguage}
                  onValueChange={(value: 'en' | 'my') => setForm((prev) => ({ ...prev, defaultLanguage: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{telegramUi.englishLanguage}</SelectItem>
                    <SelectItem value="my">{telegramUi.burmeseLanguage}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{telegramUi.defaultLanguageDesc}</p>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/60 bg-background/55 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{telegramUi.languageSelectorOnStart}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{telegramUi.languageSelectorOnStartDesc}</p>
                  </div>
                  <Switch
                    checked={form.showLanguageSelectorOnStart}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, showLanguageSelectorOnStart: checked }))}
                  />
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="telegram-welcome-message">{t('settings.telegram.welcome')}</Label>
                <Textarea
                  id="telegram-welcome-message"
                  value={form.welcomeMessage || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, welcomeMessage: event.target.value }))}
                  rows={3}
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-border/60 bg-background/55 p-4 md:col-span-2">
                <div>
                  <p className="text-sm font-medium">{telegramUi.localizedWelcome}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{telegramUi.localizedWelcomeDesc}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="telegram-welcome-message-en">{telegramUi.englishTemplate}</Label>
                    <Textarea
                      id="telegram-welcome-message-en"
                      value={form.localizedWelcomeMessages?.en || ''}
                      onChange={(event) => updateLocalizedTelegramText('localizedWelcomeMessages', 'en', event.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telegram-welcome-message-my">{telegramUi.burmeseTemplate}</Label>
                    <Textarea
                      id="telegram-welcome-message-my"
                      value={form.localizedWelcomeMessages?.my || ''}
                      onChange={(event) => updateLocalizedTelegramText('localizedWelcomeMessages', 'my', event.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="telegram-not-found-message">{t('settings.telegram.not_found')}</Label>
                <Textarea
                  id="telegram-not-found-message"
                  value={form.keyNotFoundMessage || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, keyNotFoundMessage: event.target.value }))}
                  rows={3}
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-border/60 bg-background/55 p-4 md:col-span-2">
                <div>
                  <p className="text-sm font-medium">{telegramUi.localizedNotFound}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{telegramUi.localizedNotFoundDesc}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="telegram-not-found-message-en">{telegramUi.englishTemplate}</Label>
                    <Textarea
                      id="telegram-not-found-message-en"
                      value={form.localizedKeyNotFoundMessages?.en || ''}
                      onChange={(event) => updateLocalizedTelegramText('localizedKeyNotFoundMessages', 'en', event.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telegram-not-found-message-my">{telegramUi.burmeseTemplate}</Label>
                    <Textarea
                      id="telegram-not-found-message-my"
                      value={form.localizedKeyNotFoundMessages?.my || ''}
                      onChange={(event) => updateLocalizedTelegramText('localizedKeyNotFoundMessages', 'my', event.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/65 p-4 dark:bg-white/[0.02]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{telegramUi.enableBot}</p>
                  <p className="text-xs text-muted-foreground">{telegramUi.enableBotDesc}</p>
                </div>
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isEnabled: checked }))}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{telegramUi.dailyDigest}</p>
                  <p className="text-xs text-muted-foreground">{telegramUi.dailyDigestDesc}</p>
                </div>
                <Switch
                  checked={form.dailyDigestEnabled}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, dailyDigestEnabled: checked }))}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="telegram-digest-hour">{telegramUi.digestHour}</Label>
                  <Input
                    id="telegram-digest-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={String(form.dailyDigestHour)}
                    onChange={(event) => setForm((prev) => ({ ...prev, dailyDigestHour: Math.min(23, Math.max(0, Number(event.target.value) || 0)) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telegram-digest-minute">{telegramUi.digestMinute}</Label>
                  <Input
                    id="telegram-digest-minute"
                    type="number"
                    min={0}
                    max={59}
                    value={String(form.dailyDigestMinute)}
                    onChange={(event) => setForm((prev) => ({ ...prev, dailyDigestMinute: Math.min(59, Math.max(0, Number(event.target.value) || 0)) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telegram-lookback-hours">{telegramUi.lookbackWindow}</Label>
                  <Input
                    id="telegram-lookback-hours"
                    type="number"
                    min={1}
                    max={168}
                    value={String(form.digestLookbackHours)}
                    onChange={(event) => setForm((prev) => ({ ...prev, digestLookbackHours: Math.min(168, Math.max(1, Number(event.target.value) || 1)) }))}
                  />
                </div>
              </div>
            </div>

            <Collapsible open={botAdvancedOpen} onOpenChange={setBotAdvancedOpen} className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Advanced bot controls</p>
                  <p className="text-xs text-muted-foreground">Webhook lifecycle, bot commands, and manual digest actions.</p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    {botAdvancedOpen ? 'Hide advanced' : 'Show advanced'}
                    <ChevronRight className={cn('ml-2 h-4 w-4 transition-transform', botAdvancedOpen && 'rotate-90')} />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="rounded-2xl border border-border/60 bg-background/75 p-4 dark:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{t('settings.telegram.webhook_status')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{telegramUi.webhookDesc}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => webhookInfoQuery.refetch()} disabled={webhookInfoQuery.isFetching}>
                      <RefreshCw className={cn('h-4 w-4', webhookInfoQuery.isFetching && 'animate-spin')} />
                    </Button>
                  </div>
                  <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs break-all">
                    {webhookUrl || telegramUi.webhookUnavailable}
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                    <p>{telegramUi.pendingUpdates}: <span className="font-medium text-foreground">{webhookInfoQuery.data?.pendingUpdateCount ?? 0}</span></p>
                    {webhookInfoQuery.data?.lastErrorMessage ? <p className="text-destructive">{telegramUi.lastError}: {webhookInfoQuery.data.lastErrorMessage}</p> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" className="rounded-full" onClick={() => setWebhookMutation.mutate({ webhookUrl })} disabled={!hasToken || !webhookUrl || setWebhookMutation.isPending}>
                      {setWebhookMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                      {t('settings.telegram.set_webhook')}
                    </Button>
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => deleteWebhookMutation.mutate()} disabled={!hasToken || deleteWebhookMutation.isPending}>
                      {deleteWebhookMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                      {t('settings.telegram.remove_webhook')}
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/75 p-4 dark:bg-white/[0.02]">
                  <p className="text-sm font-medium">{telegramUi.commandSurface}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {telegramUi.userCommands}: <code>/start</code>, <code>/buy</code>, <code>/renew</code>, <code>/orders</code>, <code>/order</code>, <code>/mykeys</code>, <code>/sub</code>, <code>/usage</code>, <code>/inbox</code>, <code>/notifications</code>, <code>/premium</code>, <code>/premiumregion</code>, <code>/supportstatus</code>, <code>/server</code>, <code>/support</code>, <code>/language</code>
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {telegramUi.adminCommands}: <code>/expiring</code>, <code>/find</code>, <code>/disable</code>, <code>/enable</code>, <code>/resend</code>, <code>/announce</code>, <code>/announcements</code>, <code>/announcehistory</code>, <code>/scheduleannouncement</code>, <code>/finance</code>, <code>/sendfinance</code>, <code>/refunds</code>, <code>/claimrefund</code>, <code>/reassignrefund</code>, <code>/serverdown</code>, <code>/maintenance</code>, <code>/serverupdate</code>, <code>/serverrecovered</code>, <code>/status</code>, <code>/sysinfo</code>, <code>/backup</code>
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => runDigestMutation.mutate()} disabled={runDigestMutation.isPending || !hasToken}>
                      {runDigestMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      {telegramUi.sendDigestNow}
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          <AnnouncementBroadcastsTab
            ui={{
              announcementTitle: telegramUi.announcementTitle,
              announcementDesc: telegramUi.announcementDesc,
              announcementAudience: telegramUi.announcementAudience,
              recipientsLabel: telegramUi.recipientsLabel,
              announcementType: telegramUi.announcementType,
              announcementSubject: telegramUi.announcementSubject,
              announcementBody: telegramUi.announcementBody,
              announcementCardStyle: telegramUi.announcementCardStyle,
              announcementRecurrence: telegramUi.announcementRecurrence,
              announcementOneTime: telegramUi.announcementOneTime,
              announcementDaily: telegramUi.announcementDaily,
              announcementWeekly: telegramUi.announcementWeekly,
              announcementTargetTag: telegramUi.announcementTargetTag,
              announcementAllTargets: telegramUi.announcementAllTargets,
              announcementTargetServer: telegramUi.announcementTargetServer,
              announcementTargetRegion: telegramUi.announcementTargetRegion,
              announcementHeroImage: telegramUi.announcementHeroImage,
              announcementHeroImageHint: telegramUi.announcementHeroImageHint,
              announcementScheduleAt: telegramUi.announcementScheduleAt,
              announcementScheduleHint: telegramUi.announcementScheduleHint,
              includeSupportButton: telegramUi.includeSupportButton,
              announcementPinToInbox: telegramUi.announcementPinToInbox,
              announcementPinToInboxHint: telegramUi.announcementPinToInboxHint,
              announcementCardPreview: telegramUi.announcementCardPreview,
              announcementCardPreviewDesc: telegramUi.announcementCardPreviewDesc,
              announcementPreviewSelf: telegramUi.announcementPreviewSelf,
              sendAnnouncementNow: telegramUi.sendAnnouncementNow,
              announcementScheduleNow: telegramUi.announcementScheduleNow,
            }}
            isMyanmar={isMyanmar}
            hasToken={hasToken}
            canManageAnnouncements={canManageAnnouncements}
            audience={announcementAudience}
            audienceCount={announcementAudienceCount}
            audienceCountLoading={announcementAudienceCountsQuery.isLoading}
            type={announcementType}
            title={announcementTitle}
            message={announcementMessage}
            cardStyle={announcementCardStyle}
            recurrenceType={announcementRecurrenceType}
            targetTag={announcementTargetTag}
            targetSegment={announcementTargetSegment}
            targetServerId={announcementTargetServerId}
            targetCountryCode={announcementTargetCountryCode}
            heroImageUrl={announcementHeroImageUrl}
            scheduledFor={announcementScheduledFor}
            includeSupportButton={announcementIncludeSupportButton}
            pinToInbox={announcementPinToInbox}
            targetOptions={announcementTargetOptions}
            previewPending={previewAnnouncementToSelfMutation.isPending}
            sendPending={sendAnnouncementMutation.isPending}
            onAudienceChange={setAnnouncementAudience}
            onTypeChange={setAnnouncementType}
            onTitleChange={setAnnouncementTitle}
            onMessageChange={setAnnouncementMessage}
            onCardStyleChange={setAnnouncementCardStyle}
            onRecurrenceTypeChange={setAnnouncementRecurrenceType}
            onTargetTagChange={setAnnouncementTargetTag}
            onTargetSegmentChange={setAnnouncementTargetSegment}
            onTargetServerIdChange={setAnnouncementTargetServerId}
            onTargetCountryCodeChange={setAnnouncementTargetCountryCode}
            onHeroImageUrlChange={setAnnouncementHeroImageUrl}
            onScheduledForChange={setAnnouncementScheduledFor}
            onIncludeSupportButtonChange={setAnnouncementIncludeSupportButton}
            onPinToInboxChange={setAnnouncementPinToInbox}
            onPreviewSelf={() =>
              previewAnnouncementToSelfMutation.mutate({
                type: announcementType,
                title: announcementTitle.trim(),
                message: announcementMessage.trim(),
                cardStyle: announcementCardStyle,
                heroImageUrl: announcementHeroImageUrl.trim() || null,
                includeSupportButton: announcementIncludeSupportButton,
                pinToInbox: announcementPinToInbox,
              })
            }
            onSendNow={() =>
              sendAnnouncementMutation.mutate({
                audience: announcementAudience,
                type: announcementType,
                filters: announcementFilters,
                title: announcementTitle.trim(),
                message: announcementMessage.trim(),
                cardStyle: announcementCardStyle,
                templateId: announcementSourceTemplateId,
                templateName: announcementSourceTemplateName,
                heroImageUrl: announcementHeroImageUrl.trim() || null,
                includeSupportButton: announcementIncludeSupportButton,
                pinToInbox: announcementPinToInbox,
                scheduledFor: null,
                recurrenceType: announcementRecurrenceType,
              })
            }
            onSchedule={() =>
              sendAnnouncementMutation.mutate({
                audience: announcementAudience,
                type: announcementType,
                filters: announcementFilters,
                title: announcementTitle.trim(),
                message: announcementMessage.trim(),
                cardStyle: announcementCardStyle,
                templateId: announcementSourceTemplateId,
                templateName: announcementSourceTemplateName,
                heroImageUrl: announcementHeroImageUrl.trim() || null,
                includeSupportButton: announcementIncludeSupportButton,
                pinToInbox: announcementPinToInbox,
                scheduledFor: announcementScheduledFor
                  ? new Date(announcementScheduledFor).toISOString()
                  : null,
                recurrenceType: announcementRecurrenceType,
              })
            }
            getAnnouncementCardStyleLabel={getAnnouncementCardStyleLabel}
            getAnnouncementRecurrenceLabel={getAnnouncementRecurrenceLabel}
            getAnnouncementSegmentLabel={getAnnouncementSegmentLabel}
            getAnnouncementCardPreviewClass={getAnnouncementCardPreviewClass}
          />

          <AnnouncementTemplatesTab
            ui={{
              announcementPresetTemplatesTitle: telegramUi.announcementPresetTemplatesTitle,
              announcementPresetTemplatesDesc: telegramUi.announcementPresetTemplatesDesc,
              announcementTemplatesTitle: telegramUi.announcementTemplatesTitle,
              announcementTemplatesDesc: telegramUi.announcementTemplatesDesc,
              announcementTemplateName: telegramUi.announcementTemplateName,
              announcementSaveTemplate: telegramUi.announcementSaveTemplate,
              announcementSavePreset: telegramUi.announcementSavePreset,
              announcementApplyTemplate: telegramUi.announcementApplyTemplate,
              announcementCopyCommand: telegramUi.announcementCopyCommand,
              announcementDeleteTemplate: telegramUi.announcementDeleteTemplate,
              announcementNoTemplates: telegramUi.announcementNoTemplates,
              announcementCommandPreview: telegramUi.announcementCommandPreview,
            }}
            isMyanmar={isMyanmar}
            canManageAnnouncements={canManageAnnouncements}
            templateName={announcementTemplateName}
            presetTemplates={announcementPresetTemplates}
            templates={announcementTemplates}
            savePending={saveAnnouncementTemplateMutation.isPending}
            deletePending={deleteAnnouncementTemplateMutation.isPending}
            onTemplateNameChange={setAnnouncementTemplateName}
            onSaveCurrentTemplate={() =>
              saveAnnouncementTemplateMutation.mutate({
                name: announcementTemplateName.trim(),
                audience: announcementAudience,
                type: announcementType,
                filters: announcementFilters,
                title: announcementTitle.trim(),
                message: announcementMessage.trim(),
                cardStyle: announcementCardStyle,
                heroImageUrl: announcementHeroImageUrl.trim() || null,
                includeSupportButton: announcementIncludeSupportButton,
                pinToInbox: announcementPinToInbox,
                recurrenceType: announcementRecurrenceType,
              })
            }
            onApplyPresetTemplate={(preset) => {
              setAnnouncementAudience(preset.audience);
              setAnnouncementType(preset.type);
              setAnnouncementTargetTag(preset.targetTag || 'ALL');
              setAnnouncementTargetSegment(preset.targetSegment || 'ALL');
              setAnnouncementTargetServerId(preset.targetServerId || 'ALL');
              setAnnouncementTargetCountryCode(preset.targetCountryCode || 'ALL');
              setAnnouncementTitle(preset.title);
              setAnnouncementMessage(preset.message);
              setAnnouncementCardStyle(preset.cardStyle);
              setAnnouncementHeroImageUrl('');
              setAnnouncementIncludeSupportButton(preset.includeSupportButton);
              setAnnouncementPinToInbox(false);
              setAnnouncementScheduledFor('');
              setAnnouncementRecurrenceType(preset.recurrenceType);
              setAnnouncementSourceTemplateId(null);
              setAnnouncementSourceTemplateName(preset.name);
              setActiveBotTab('broadcasts');
            }}
            onCopyCommand={(command) => {
              void copyAnnouncementCommand(command);
            }}
            onSavePresetTemplate={(preset) =>
              saveAnnouncementTemplateMutation.mutate({
                name: preset.name,
                audience: preset.audience,
                type: preset.type,
                filters: {
                  tag: preset.targetTag,
                  segment: (preset.targetSegment as TelegramAnnouncementSegment | null) || null,
                  serverId: preset.targetServerId,
                  countryCode: preset.targetCountryCode,
                },
                title: preset.title,
                message: preset.message,
                cardStyle: preset.cardStyle,
                includeSupportButton: preset.includeSupportButton,
                pinToInbox: false,
                recurrenceType: preset.recurrenceType,
              })
            }
            onApplyTemplate={(template) => {
              setAnnouncementAudience(template.audience);
              setAnnouncementType(template.type);
              setAnnouncementTargetTag(template.targetTag || 'ALL');
              setAnnouncementTargetSegment(template.targetSegment || 'ALL');
              setAnnouncementTargetServerId(template.targetServerId || 'ALL');
              setAnnouncementTargetCountryCode(template.targetCountryCode || 'ALL');
              setAnnouncementTitle(template.title);
              setAnnouncementMessage(template.message);
              setAnnouncementCardStyle(template.cardStyle);
              setAnnouncementHeroImageUrl(template.heroImageUrl || '');
              setAnnouncementIncludeSupportButton(template.includeSupportButton);
              setAnnouncementPinToInbox(template.pinToInbox);
              setAnnouncementScheduledFor('');
              setAnnouncementRecurrenceType(template.recurrenceType || 'NONE');
              setAnnouncementSourceTemplateId(template.id);
              setAnnouncementSourceTemplateName(template.name);
              setActiveBotTab('broadcasts');
              updateTelegramUrlState({
                workspace: 'telegram',
                botTab: 'broadcasts',
                announcementId: null,
              });
            }}
            onDeleteTemplate={(templateId) =>
              deleteAnnouncementTemplateMutation.mutate({ templateId })
            }
            buildTemplateCommand={(template) =>
              buildTelegramAnnouncementTemplateCommand({
                audience: template.audience,
                type: template.type,
                title: template.title,
                message: template.message,
                cardStyle: template.cardStyle,
                includeSupportButton: template.includeSupportButton,
                targetTag: template.targetTag,
                targetSegment: template.targetSegment,
                targetServerId: template.targetServerId,
                targetCountryCode: template.targetCountryCode,
              })
            }
            getAnnouncementCardStyleLabel={getAnnouncementCardStyleLabel}
            getAnnouncementRecurrenceLabel={getAnnouncementRecurrenceLabel}
          />

          <TabsContent value="analytics" className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{telegramUi.announcementAnalyticsTitle}</p>
                  <p className="text-xs text-muted-foreground">{telegramUi.announcementAnalyticsDesc}</p>
                </div>
                <div className="w-full sm:w-40">
                  <Label className="mb-2 block">{telegramUi.announcementAnalyticsRange}</Label>
                  <Select value={announcementAnalyticsRange} onValueChange={(value: '7d' | '30d' | '90d') => setAnnouncementAnalyticsRange(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                      <SelectItem value="90d">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {announcementAnalyticsQuery.isLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading analytics…</div>
              ) : announcementAnalytics ? (
                <div className="mt-4 space-y-4">
                  <AnnouncementExperimentsPanel
                    ui={{
                      announcementExperimentsTitle: telegramUi.announcementExperimentsTitle,
                      announcementExperimentsDesc: telegramUi.announcementExperimentsDesc,
                      announcementExperimentCreateNew: telegramUi.announcementExperimentCreateNew,
                      announcementExperimentSave: telegramUi.announcementExperimentSave,
                      announcementExperimentLaunch: telegramUi.announcementExperimentLaunch,
                      announcementExperimentName: telegramUi.announcementExperimentName,
                      announcementAudience: telegramUi.announcementAudience,
                      announcementType: telegramUi.announcementType,
                      announcementExperimentSplit: telegramUi.announcementExperimentSplit,
                      announcementTargetTag: telegramUi.announcementTargetTag,
                      announcementTargetServer: telegramUi.announcementTargetServer,
                      announcementTargetRegion: telegramUi.announcementTargetRegion,
                      announcementAllTargets: telegramUi.announcementAllTargets,
                      announcementExperimentVariantA: telegramUi.announcementExperimentVariantA,
                      announcementExperimentVariantB: telegramUi.announcementExperimentVariantB,
                      announcementSubject: telegramUi.announcementSubject,
                      announcementBody: telegramUi.announcementBody,
                      announcementCardStyle: telegramUi.announcementCardStyle,
                      announcementHeroImage: telegramUi.announcementHeroImage,
                      includeSupportButton: telegramUi.includeSupportButton,
                      announcementPinToInbox: telegramUi.announcementPinToInbox,
                      announcementExperimentLoad: telegramUi.announcementExperimentLoad,
                      announcementExperimentJumpHistory: telegramUi.announcementExperimentJumpHistory,
                    }}
                    isMyanmar={isMyanmar}
                    canManageAnnouncements={canManageAnnouncements}
                    targetOptions={announcementTargetOptions}
                    experiments={announcementExperiments}
                    analyticsByExperiment={announcementAnalyticsByExperiment}
                    experimentId={announcementExperimentId}
                    experimentName={announcementExperimentName}
                    experimentAudience={announcementExperimentAudience}
                    experimentType={announcementExperimentType}
                    experimentTargetTag={announcementExperimentTargetTag}
                    experimentTargetSegment={announcementExperimentTargetSegment}
                    experimentTargetServerId={announcementExperimentTargetServerId}
                    experimentTargetCountryCode={announcementExperimentTargetCountryCode}
                    experimentIncludeSupportButton={announcementExperimentIncludeSupportButton}
                    experimentPinToInbox={announcementExperimentPinToInbox}
                    experimentVariantASplit={announcementExperimentVariantASplit}
                    normalizedExperimentVariantASplit={normalizedExperimentVariantASplit}
                    normalizedExperimentVariantBSplit={normalizedExperimentVariantBSplit}
                    experimentVariantATitle={announcementExperimentVariantATitle}
                    experimentVariantAMessage={announcementExperimentVariantAMessage}
                    experimentVariantAHeroImageUrl={announcementExperimentVariantAHeroImageUrl}
                    experimentVariantACardStyle={announcementExperimentVariantACardStyle}
                    experimentVariantBTitle={announcementExperimentVariantBTitle}
                    experimentVariantBMessage={announcementExperimentVariantBMessage}
                    experimentVariantBHeroImageUrl={announcementExperimentVariantBHeroImageUrl}
                    experimentVariantBCardStyle={announcementExperimentVariantBCardStyle}
                    savePending={saveAnnouncementExperimentMutation.isPending}
                    launchPending={launchAnnouncementExperimentMutation.isPending}
                    onReset={resetAnnouncementExperimentForm}
                    onSave={() =>
                      saveAnnouncementExperimentMutation.mutate({
                        experimentId: announcementExperimentId || undefined,
                        name: announcementExperimentName.trim(),
                        audience: announcementExperimentAudience,
                        type: announcementExperimentType,
                        filters: announcementExperimentFilters,
                        includeSupportButton: announcementExperimentIncludeSupportButton,
                        pinToInbox: announcementExperimentPinToInbox,
                        variants: [
                          {
                            variantKey: 'A',
                            label: 'Variant A',
                            allocationPercent: normalizedExperimentVariantASplit,
                            title: announcementExperimentVariantATitle.trim(),
                            message: announcementExperimentVariantAMessage.trim(),
                            heroImageUrl: announcementExperimentVariantAHeroImageUrl.trim() || null,
                            cardStyle: announcementExperimentVariantACardStyle,
                          },
                          {
                            variantKey: 'B',
                            label: 'Variant B',
                            allocationPercent: normalizedExperimentVariantBSplit,
                            title: announcementExperimentVariantBTitle.trim(),
                            message: announcementExperimentVariantBMessage.trim(),
                            heroImageUrl: announcementExperimentVariantBHeroImageUrl.trim() || null,
                            cardStyle: announcementExperimentVariantBCardStyle,
                          },
                        ],
                      })
                    }
                    onLaunchCurrent={() => {
                      if (!announcementExperimentId) {
                        return;
                      }
                      launchAnnouncementExperimentMutation.mutate({
                        experimentId: announcementExperimentId,
                      });
                    }}
                    onExperimentNameChange={setAnnouncementExperimentName}
                    onExperimentAudienceChange={setAnnouncementExperimentAudience}
                    onExperimentTypeChange={setAnnouncementExperimentType}
                    onExperimentVariantASplitChange={setAnnouncementExperimentVariantASplit}
                    onExperimentTargetTagChange={setAnnouncementExperimentTargetTag}
                    onExperimentTargetSegmentChange={setAnnouncementExperimentTargetSegment}
                    onExperimentTargetServerIdChange={setAnnouncementExperimentTargetServerId}
                    onExperimentTargetCountryCodeChange={setAnnouncementExperimentTargetCountryCode}
                    onExperimentVariantATitleChange={setAnnouncementExperimentVariantATitle}
                    onExperimentVariantAMessageChange={setAnnouncementExperimentVariantAMessage}
                    onExperimentVariantAHeroImageUrlChange={setAnnouncementExperimentVariantAHeroImageUrl}
                    onExperimentVariantACardStyleChange={setAnnouncementExperimentVariantACardStyle}
                    onExperimentVariantBTitleChange={setAnnouncementExperimentVariantBTitle}
                    onExperimentVariantBMessageChange={setAnnouncementExperimentVariantBMessage}
                    onExperimentVariantBHeroImageUrlChange={setAnnouncementExperimentVariantBHeroImageUrl}
                    onExperimentVariantBCardStyleChange={setAnnouncementExperimentVariantBCardStyle}
                    onExperimentIncludeSupportButtonChange={setAnnouncementExperimentIncludeSupportButton}
                    onExperimentPinToInboxChange={setAnnouncementExperimentPinToInbox}
                    onLoadExperiment={loadAnnouncementExperimentIntoForm}
                    onLaunchExperiment={(experimentId) =>
                      launchAnnouncementExperimentMutation.mutate({ experimentId })
                    }
                    onJumpToHistory={(announcementId) => {
                      if (!announcementId) {
                        return;
                      }
                      setActiveBotTab('history');
                      updateTelegramUrlState({
                        workspace: 'telegram',
                        botTab: 'history',
                        announcementId,
                      });
                    }}
                    getAnnouncementSegmentLabel={getAnnouncementSegmentLabel}
                  />
                  <AnnouncementAnalyticsInsights
                    ui={{
                      announcementSuccessRate: telegramUi.announcementSuccessRate,
                      announcementOpenRate: telegramUi.announcementOpenRate,
                      announcementOpens: telegramUi.announcementOpens,
                      announcementClickRate: telegramUi.announcementClickRate,
                      announcementClicks: telegramUi.announcementClicks,
                      announcementResendRecovery: telegramUi.announcementResendRecovery,
                      announcementByType: telegramUi.announcementByType,
                      announcementByAudience: telegramUi.announcementByAudience,
                      announcementNoHistory: telegramUi.announcementNoHistory,
                    }}
                    analytics={announcementAnalytics}
                    formatMoney={formatAnnouncementMoney}
                    onJumpToHistoryItem={(announcementId) => {
                      setActiveBotTab('history');
                      updateTelegramUrlState({
                        workspace: 'telegram',
                        botTab: 'history',
                        announcementId,
                      });
                    }}
                  />
                </div>
              ) : null}
            </div>
          </TabsContent>

          <AnnouncementHistoryTab
            ui={{
              announcementHistoryTitle: telegramUi.announcementHistoryTitle,
              announcementHistoryDesc: telegramUi.announcementHistoryDesc,
              announcementNoHistory: telegramUi.announcementNoHistory,
              announcementSendScheduledNow: telegramUi.announcementSendScheduledNow,
              announcementResendFailed: telegramUi.announcementResendFailed,
              recipientsLabel: telegramUi.recipientsLabel,
            }}
            isMyanmar={isMyanmar}
            history={announcementHistory}
            announcementIdParam={announcementIdParam}
            failedAnnouncementIds={failedAnnouncementIds}
            archivableAnnouncementIds={archivableAnnouncementIds}
            resendAnnouncementFailedBatchPending={resendAnnouncementFailedBatchMutation.isPending}
            archiveAnnouncementsPending={archiveAnnouncementsMutation.isPending}
            dispatchScheduledAnnouncementPending={dispatchScheduledAnnouncementMutation.isPending}
            resendAnnouncementFailedPending={resendAnnouncementFailedMutation.isPending}
            onResendFailedBatch={(announcementIds) =>
              resendAnnouncementFailedBatchMutation.mutate({ announcementIds })
            }
            onArchiveAnnouncements={(announcementIds) =>
              archiveAnnouncementsMutation.mutate({ announcementIds })
            }
            onDispatchScheduledAnnouncement={(announcementId) =>
              dispatchScheduledAnnouncementMutation.mutate({ announcementId })
            }
            onResendFailed={(announcementId) =>
              resendAnnouncementFailedMutation.mutate({ announcementId })
            }
            getAnnouncementCardStyleLabel={getAnnouncementCardStyleLabel}
            getAnnouncementRecurrenceLabel={getAnnouncementRecurrenceLabel}
          />
        </Tabs>
      </CardContent>
    </Card>
  );
}

function getChannelRuleSummary(channel: Channel, t: (key: string) => string) {
  const defaultCooldown = parseCooldownNumber(channel.config.cooldownMinutes || '0') ?? 0;
  const eventCooldowns = parseStoredEventCooldowns(channel.config.eventCooldowns);
  const overrideCount = Object.keys(eventCooldowns).length;

  if (defaultCooldown === 0 && overrideCount === 0) {
    return t('notifications.rules.none');
  }

  const parts = [];
  if (defaultCooldown > 0) {
    parts.push(`${t('notifications.rules.default_short')} ${defaultCooldown}m`);
  }
  if (overrideCount > 0) {
    parts.push(`${overrideCount} ${t('notifications.rules.overrides_short')}`);
  }

  return parts.join(' · ');
}

/**
 * ChannelDialog Component
 */
function ChannelDialog({
  open,
  onOpenChange,
  editChannel,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editChannel?: Channel | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const saveChannelMutation = trpc.notifications.saveChannel.useMutation({
    onSuccess: async () => {
      toast({
        title: editChannel ? t('notifications.toast.channel_updated') : t('notifications.toast.channel_created'),
        description: t('notifications.toast.success_desc'),
      });
      await Promise.all([
        utils.notifications.listChannels.invalidate(),
        utils.notifications.listLogs.invalidate(),
        utils.notifications.queueStatus.invalidate(),
      ]);
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.failed_save'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const [formData, setFormData] = useState({
    id: editChannel?.id,
    name: editChannel?.name || '',
    type: editChannel?.type || 'TELEGRAM' as ChannelType,
    isActive: editChannel?.isActive ?? true,
    cooldownMinutes: editChannel?.config.cooldownMinutes || '0',
    eventCooldowns: parseStoredEventCooldowns(editChannel?.config.eventCooldowns),
    telegramChatId: editChannel?.type === 'TELEGRAM' ? editChannel.config.chatId || '' : '',
    email: editChannel?.type === 'EMAIL' ? editChannel.config.email || '' : '',
    webhookUrl: editChannel?.type === 'WEBHOOK' ? editChannel.config.url || '' : '',
    webhookSigningSecret: editChannel?.type === 'WEBHOOK' ? editChannel.config.signingSecret || '' : '',
    webhookHeaders: parseStoredWebhookHeaders(editChannel?.type === 'WEBHOOK' ? editChannel.config.headers : undefined),
    events: editChannel?.events || [],
  });
  const telegramSettingsQuery = trpc.telegramBot.getSettings.useQuery(undefined, {
    enabled: open && formData.type === 'TELEGRAM',
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setFormData({
      id: editChannel?.id,
      name: editChannel?.name || '',
      type: editChannel?.type || 'TELEGRAM',
      isActive: editChannel?.isActive ?? true,
      cooldownMinutes: editChannel?.config.cooldownMinutes || '0',
      eventCooldowns: parseStoredEventCooldowns(editChannel?.config.eventCooldowns),
      telegramChatId: editChannel?.type === 'TELEGRAM' ? editChannel.config.chatId || '' : '',
      email: editChannel?.type === 'EMAIL' ? editChannel.config.email || '' : '',
      webhookUrl: editChannel?.type === 'WEBHOOK' ? editChannel.config.url || '' : '',
      webhookSigningSecret: editChannel?.type === 'WEBHOOK' ? editChannel.config.signingSecret || '' : '',
      webhookHeaders: parseStoredWebhookHeaders(editChannel?.type === 'WEBHOOK' ? editChannel.config.headers : undefined),
      events: editChannel?.events || [],
    });
  }, [editChannel, open]);

  const configuredAdminChatIds = telegramSettingsQuery.data?.adminChatIds ?? [];
  const trimmedTelegramChatId = formData.telegramChatId.trim();
  const usingSuggestedAdminChat = trimmedTelegramChatId.length > 0 && configuredAdminChatIds.includes(trimmedTelegramChatId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.name_required'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.type === 'TELEGRAM' && !formData.telegramChatId) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.chat_id_required'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.type === 'EMAIL' && !formData.email) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.email_required'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.type === 'WEBHOOK' && !formData.webhookUrl) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.webhook_required'),
        variant: 'destructive',
      });
      return;
    }

    const webhookHeaders = buildWebhookHeadersPayload(formData.webhookHeaders);
    if (formData.type === 'WEBHOOK' && !webhookHeaders) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.webhook_headers_invalid'),
        variant: 'destructive',
      });
      return;
    }

    const cooldownMinutes = parseCooldownNumber(formData.cooldownMinutes);
    if (cooldownMinutes === null) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.cooldown_invalid'),
        variant: 'destructive',
      });
      return;
    }

    const eventCooldowns = buildEventCooldownPayload(formData.eventCooldowns);
    if (!eventCooldowns) {
      toast({
        title: t('notifications.toast.validation_error'),
        description: t('notifications.toast.cooldown_invalid'),
        variant: 'destructive',
      });
      return;
    }

    saveChannelMutation.mutate({
      id: formData.id,
      name: formData.name.trim(),
      type: formData.type,
      isActive: formData.isActive,
      cooldownMinutes,
      eventCooldowns,
      telegramChatId: formData.type === 'TELEGRAM' ? formData.telegramChatId.trim() : undefined,
      email: formData.type === 'EMAIL' ? formData.email.trim() : undefined,
      webhookUrl: formData.type === 'WEBHOOK' ? formData.webhookUrl.trim() : undefined,
      webhookSigningSecret: formData.type === 'WEBHOOK' ? formData.webhookSigningSecret.trim() : undefined,
      webhookHeaders: formData.type === 'WEBHOOK' ? formData.webhookHeaders.map((header) => ({
        key: header.key,
        value: header.value,
      })) : [],
      events: formData.events,
    });
  };

  const toggleEvent = (eventId: NotificationEventId) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter((e) => e !== eventId)
        : [...prev.events, eventId],
      eventCooldowns: prev.events.includes(eventId)
        ? Object.fromEntries(
            Object.entries(prev.eventCooldowns).filter(([key]) => key !== eventId),
          ) as EventCooldownInputs
        : prev.eventCooldowns,
    }));
  };

  const cooldownEvents = formData.events.length > 0
    ? EVENT_TYPES.filter((event) => formData.events.includes(event.id))
    : EVENT_TYPES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            {editChannel ? t('notifications.edit_channel') : t('notifications.create_channel')}
          </DialogTitle>
          <DialogDescription>
            {t('notifications.dialog.desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Channel name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('notifications.dialog.name')}</Label>
            <Input
              id="name"
              placeholder={t('notifications.dialog.name_placeholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t('notifications.channel_active_title')}</p>
              <p className="text-xs text-muted-foreground">{t('notifications.channel_active_desc')}</p>
            </div>
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
          </div>

          {/* Channel type */}
          <div className="space-y-2">
            <Label>{t('notifications.dialog.type')}</Label>
            <Select
              value={formData.type}
              onValueChange={(value: ChannelType) => setFormData({ ...formData, type: value })}
              disabled={!!editChannel}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_TYPES).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <config.icon className={cn('w-4 h-4', config.color)} />
                      {t(config.labelKey)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type-specific configuration */}
          {formData.type === 'TELEGRAM' && (
            <div className="space-y-2">
              <Label htmlFor="chatId">{t('notifications.dialog.chat_id')}</Label>
              <Input
                id="chatId"
                placeholder={t('notifications.dialog.chat_id_placeholder')}
                value={formData.telegramChatId}
                onChange={(e) => setFormData({ ...formData, telegramChatId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('notifications.dialog.chat_id_help')}
              </p>
              {configuredAdminChatIds.length > 0 ? (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <p className="text-xs font-medium text-foreground/85">Configured admin chats</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {configuredAdminChatIds.map((chatId: string) => (
                      <Button
                        key={chatId}
                        type="button"
                        size="sm"
                        variant={trimmedTelegramChatId === chatId ? 'default' : 'outline'}
                        className="h-8 rounded-full px-3 text-xs"
                        onClick={() => setFormData((prev) => ({ ...prev, telegramChatId: chatId }))}
                      >
                        {chatId}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    The bot can only send to chats that already started the bot. Using a configured admin chat is the safest way to make test delivery work.
                  </p>
                </div>
              ) : null}
              {trimmedTelegramChatId && configuredAdminChatIds.length > 0 && !usingSuggestedAdminChat ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    This chat ID is different from your configured admin chats. Make sure the bot can already message it, otherwise the test button will fail with
                    {' '}<span className="font-semibold">chat not found</span>.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {formData.type === 'EMAIL' && (
            <div className="space-y-2">
              <Label htmlFor="email">{t('notifications.dialog.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('notifications.dialog.email_placeholder')}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('notifications.dialog.email_help')}
              </p>
            </div>
          )}

          {formData.type === 'WEBHOOK' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">{t('notifications.dialog.webhook')}</Label>
                <Input
                  id="webhookUrl"
                  type="url"
                  placeholder={t('notifications.dialog.webhook_placeholder')}
                  value={formData.webhookUrl}
                  onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t('notifications.dialog.webhook_help')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhookSigningSecret">{t('notifications.dialog.webhook_signing')}</Label>
                <Input
                  id="webhookSigningSecret"
                  type="password"
                  placeholder={t('notifications.dialog.webhook_signing_placeholder')}
                  value={formData.webhookSigningSecret}
                  onChange={(e) => setFormData({ ...formData, webhookSigningSecret: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t('notifications.dialog.webhook_signing_help')}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <Label>{t('notifications.dialog.webhook_headers')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('notifications.dialog.webhook_headers_help')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData((prev) => ({
                      ...prev,
                      webhookHeaders: [...prev.webhookHeaders, createWebhookHeaderRow()],
                    }))}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t('notifications.dialog.webhook_add_header')}
                  </Button>
                </div>

                <div className="space-y-2">
                  {formData.webhookHeaders.map((header) => (
                    <div key={header.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                      <Input
                        placeholder={t('notifications.dialog.webhook_header_name')}
                        value={header.key}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          webhookHeaders: prev.webhookHeaders.map((row) =>
                            row.id === header.id ? { ...row, key: e.target.value } : row,
                          ),
                        }))}
                      />
                      <Input
                        placeholder={t('notifications.dialog.webhook_header_value')}
                        value={header.value}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          webhookHeaders: prev.webhookHeaders.map((row) =>
                            row.id === header.id ? { ...row, value: e.target.value } : row,
                          ),
                        }))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setFormData((prev) => ({
                          ...prev,
                          webhookHeaders:
                            prev.webhookHeaders.length === 1
                              ? [createWebhookHeaderRow()]
                              : prev.webhookHeaders.filter((row) => row.id !== header.id),
                        }))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cooldownMinutes">{t('notifications.rules.default')}</Label>
            <Input
              id="cooldownMinutes"
              type="number"
              min={0}
              max={MAX_NOTIFICATION_COOLDOWN_MINUTES}
              value={formData.cooldownMinutes}
              onChange={(e) => setFormData({ ...formData, cooldownMinutes: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t('notifications.rules.default_help')}
            </p>
          </div>

          {/* Event subscriptions */}
          <div className="space-y-3">
            <Label>{t('notifications.dialog.events')}</Label>
            <div className="grid grid-cols-1 gap-2">
              {EVENT_TYPES.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => toggleEvent(event.id)}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors text-left',
                    formData.events.includes(event.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <div>
                    <p className="font-medium text-sm">{t(event.labelKey)}</p>
                  </div>
                  <div className={cn(
                    'w-5 h-5 rounded border flex items-center justify-center',
                    formData.events.includes(event.id)
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30'
                  )}>
                    {formData.events.includes(event.id) && (
                      <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t('notifications.rules.overrides')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('notifications.rules.overrides_help')}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {cooldownEvents.map((event) => (
                <div key={event.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{t(event.labelKey)}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('notifications.rules.override_hint')}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={MAX_NOTIFICATION_COOLDOWN_MINUTES}
                      className="w-28"
                      value={formData.eventCooldowns[event.id] ?? ''}
                      placeholder={t('notifications.rules.use_default')}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        eventCooldowns: {
                          ...prev.eventCooldowns,
                          [event.id]: e.target.value,
                        },
                      }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('notifications.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={saveChannelMutation.isPending}>
              {saveChannelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editChannel ? t('notifications.dialog.save') : t('notifications.dialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ChannelCard Component
 */
function ChannelCard({
  channel,
  onEdit,
  onDelete,
  onTest,
}: {
  channel: Channel;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const { t } = useLocale();
  const config = CHANNEL_TYPES[channel.type];
  const Icon = config.icon;

  return (
    <Card className="group transition-all duration-200 hover:-translate-y-1 hover:border-primary/25">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn('rounded-2xl border p-2.5', config.bgColor)}>
              <Icon className={cn('w-5 h-5', config.color)} />
            </div>
            <div>
              <h3 className="font-semibold">{channel.name}</h3>
              <p className="text-sm text-muted-foreground">{t(config.labelKey)}</p>
            </div>
          </div>
          <Badge variant={channel.isActive ? 'default' : 'secondary'}>
            {channel.isActive ? t('notifications.channel_active') : t('notifications.channel_inactive')}
          </Badge>
        </div>

        {/* Subscribed events */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">{t('notifications.events.subscribed')}</p>
          <div className="flex min-h-[2rem] flex-wrap gap-1.5">
            {channel.events.length > 0 ? (
              channel.events.map((eventId) => {
                const event = EVENT_TYPES.find((e) => e.id === eventId);
                return (
                  <Badge key={eventId} variant="outline" className="rounded-full text-xs">
                    {event ? t(event.labelKey) : eventId}
                  </Badge>
                );
              })
            ) : (
              <span className="text-sm text-muted-foreground">{t('notifications.events.none')}</span>
            )}
          </div>
        </div>

        <div className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t('notifications.rules.title')}:</span>{' '}
          {getChannelRuleSummary(channel, t)}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <Button
            variant="outline"
            size="sm"
            className="min-w-[132px] flex-1 rounded-2xl"
            onClick={onTest}
          >
            <TestTube className="w-4 h-4 mr-2" />
            {t('notifications.actions.test')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-2xl"
            onClick={onEdit}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-2xl text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TelegramSalesWorkflowCard({ isActive }: { isActive: boolean }) {
  const { toast } = useToast();
  const { locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMyanmar = locale === 'my';
  const utils = trpc.useUtils();
  const currentUserQuery = trpc.auth.me.useQuery();
  const canManageSalesSettings = hasTelegramAnnouncementManageScope(currentUserQuery.data?.adminScope);
  const canManageTelegramReviews = hasTelegramReviewManageScope(currentUserQuery.data?.adminScope);
  const reviewersQuery = trpc.telegramBot.listOrderReviewers.useQuery(undefined, {
    staleTime: 60_000,
  });
  const settingsQuery = trpc.telegramBot.getSalesConfig.useQuery();
  const templatesQuery = trpc.templates.list.useQuery();
  const dynamicTemplatesQuery = trpc.dynamicKeys.listTemplates.useQuery();
  const serversQuery = trpc.servers.list.useQuery();
  const [form, setForm] = useState<TelegramSalesSettingsForm>(DEFAULT_TELEGRAM_SALES_SETTINGS);
  const [reviewTarget, setReviewTarget] = useState<{ orderId: string; mode: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewCustomerMessage, setReviewCustomerMessage] = useState('');
  const [reviewReasonCode, setReviewReasonCode] = useState<string>('custom');
  const [reviewPlanCode, setReviewPlanCode] = useState<TelegramSalesPlanCode | ''>('');
  const [reviewDurationMonths, setReviewDurationMonths] = useState('');
  const [reviewSelectedServerId, setReviewSelectedServerId] = useState('auto');
  const [reviewAssignedReviewerId, setReviewAssignedReviewerId] = useState('unassigned');
  const [proofPreviewOpen, setProofPreviewOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_REVIEW' | 'FULFILLED' | 'REJECTED' | 'CANCELLED'>('ALL');
  const [kindFilter, setKindFilter] = useState<'ALL' | 'NEW' | 'RENEW'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<
    'ALL' | 'UNCLAIMED' | 'HIGH_RISK' | 'PREMIUM' | 'MY_QUEUE' | 'OLDEST'
  >('ALL');
  const workflowTabParam = searchParams.get('workflowTab');
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkflowSubtabId>(
    workflowTabParam && ['settings', 'coupons', 'guardrails', 'review', 'premium'].includes(workflowTabParam)
      ? (workflowTabParam as WorkflowSubtabId)
      : 'settings',
  );
  const [workflowAdvancedOpen, setWorkflowAdvancedOpen] = useState(false);
  const [savedWorkflowSnapshot, setSavedWorkflowSnapshot] =
    useState<TelegramSalesSettingsForm | null>(null);
  const deferredOrderSearch = useDeferredValue(orderSearch.trim());
  const orderCodeParam = searchParams.get('orderCode')?.trim() || '';
  const updateWorkflowUrlState = (updates: {
    workspace?: NotificationWorkspaceId;
    workflowTab?: WorkflowSubtabId | null;
    orderCode?: string | null;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    const currentWorkspace = searchParams.get('workspace');
    const nextWorkspace =
      updates.workspace ??
      (currentWorkspace && ['overview', 'telegram', 'workflow', 'channels'].includes(currentWorkspace)
        ? (currentWorkspace as NotificationWorkspaceId)
        : 'workflow');
    params.set('workspace', nextWorkspace);
    if (updates.workflowTab) {
      params.set('workflowTab', updates.workflowTab);
    } else if (updates.workflowTab === null) {
      params.delete('workflowTab');
    }
    if (updates.orderCode) {
      params.set('orderCode', updates.orderCode);
    } else if (updates.orderCode === null) {
      params.delete('orderCode');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (
      workflowTabParam &&
      ['settings', 'coupons', 'guardrails', 'review', 'premium'].includes(workflowTabParam) &&
      workflowTabParam !== activeWorkflowTab
    ) {
      setActiveWorkflowTab(workflowTabParam as WorkflowSubtabId);
    }
  }, [activeWorkflowTab, workflowTabParam]);

  const ordersQuery = trpc.telegramBot.listOrders.useQuery(
    {
      limit: 50,
      statuses: statusFilter === 'ALL' ? undefined : [statusFilter],
      kinds: kindFilter === 'ALL' ? undefined : [kindFilter],
      query: deferredOrderSearch || undefined,
    },
    {
      placeholderData: keepPreviousData,
      enabled: isActive && activeWorkflowTab === 'review',
    },
  );
  const serverChangeRequestsQuery = trpc.telegramBot.listServerChangeRequests.useQuery(
    {
      limit: 20,
      statuses: ['PENDING_REVIEW'],
    },
    {
      placeholderData: keepPreviousData,
      enabled: isActive && activeWorkflowTab === 'review',
    },
  );
  const [premiumRequestSearch, setPremiumRequestSearch] = useState('');
  const deferredPremiumRequestSearch = useDeferredValue(premiumRequestSearch.trim());
  const [premiumRequestStatusFilter, setPremiumRequestStatusFilter] = useState<
    'ALL' | 'PENDING_REVIEW' | 'APPROVED' | 'HANDLED' | 'DISMISSED'
  >('ALL');
  const [premiumRequestTypeFilter, setPremiumRequestTypeFilter] = useState<
    'ALL' | 'REGION_CHANGE' | 'ROUTE_ISSUE'
  >('ALL');
  const premiumSupportRequestsQuery = trpc.telegramBot.listPremiumSupportRequests.useQuery(
    {
      limit: 50,
      statuses:
        premiumRequestStatusFilter === 'ALL'
          ? undefined
          : [premiumRequestStatusFilter],
      requestTypes:
        premiumRequestTypeFilter === 'ALL'
          ? undefined
          : [premiumRequestTypeFilter],
      query: deferredPremiumRequestSearch || undefined,
    },
    {
      placeholderData: keepPreviousData,
      enabled: isActive && activeWorkflowTab === 'premium',
    },
  );
  const [premiumReviewTarget, setPremiumReviewTarget] = useState<{
    requestId: string;
    mode: 'approve' | 'handle' | 'dismiss' | 'reply';
  } | null>(null);
  const [premiumReviewNote, setPremiumReviewNote] = useState('');
  const [premiumReviewCustomerMessage, setPremiumReviewCustomerMessage] = useState('');
  const [premiumReviewRegionCode, setPremiumReviewRegionCode] = useState('');
  const [premiumReviewPinServerId, setPremiumReviewPinServerId] = useState('none');
  const [premiumReviewPinExpires, setPremiumReviewPinExpires] = useState('60');
  const [premiumAppendNoteToKey, setPremiumAppendNoteToKey] = useState(true);
  const templatesById = useMemo(
    () => new Map((templatesQuery.data || []).map((template) => [template.id, template])),
    [templatesQuery.data],
  );
  const premiumDynamicTemplates = useMemo(
    () => (dynamicTemplatesQuery.data || []).filter((template) => template.type === 'SELF_MANAGED'),
    [dynamicTemplatesQuery.data],
  );
  const dynamicTemplatesById = useMemo(
    () => new Map((dynamicTemplatesQuery.data || []).map((template) => [template.id, template])),
    [dynamicTemplatesQuery.data],
  );
  const workflowConfigDirty = useMemo(() => {
    if (!savedWorkflowSnapshot) {
      return false;
    }

    return JSON.stringify(form) !== JSON.stringify(savedWorkflowSnapshot);
  }, [form, savedWorkflowSnapshot]);

  const salesUi = {
    title: isMyanmar ? 'Telegram အော်ဒါ flow' : 'Telegram order workflow',
    desc: isMyanmar
      ? 'အသုံးပြုသူများက bot မှတစ်ဆင့် plan ရွေးခြင်း၊ payment proof ပို့ခြင်းနှင့် admin အတည်ပြုချက်ဖြင့် key ရယူနိုင်ပါသည်။'
      : 'Let users pick a plan, upload payment proof, and wait for admin approval before a key is delivered.',
    enableOrders: isMyanmar ? 'Telegram order flow ကို ဖွင့်မည်' : 'Enable Telegram order flow',
    allowRenewals: isMyanmar ? 'Renewal order များကို ခွင့်ပြုမည်' : 'Allow renewal orders',
    supportLink: isMyanmar ? 'Telegram support link' : 'Telegram support link',
    supportLinkDesc: isMyanmar
      ? 'Bot အတွင်း /support command နှင့် payment prompt များတွင် ဤ link ကို အသုံးပြုမည်။ မထည့်ပါက Subscription Page support link ကို fallback အဖြစ် သုံးမည်။'
      : 'Use this link for the bot /support command and payment prompts. If left empty, the Subscription Page support link is used as a fallback.',
    paymentAutomation: isMyanmar ? 'Unpaid order automation' : 'Unpaid order automation',
    paymentAutomationDesc: isMyanmar
      ? 'Payment method မရွေးသေးသော သို့မဟုတ် screenshot မပို့ရသေးသော order များကို reminder ပို့ပြီး အချိန်ကျော်လျှင် အလိုအလျောက် cancel လုပ်ပါမည်။'
      : 'Send one reminder for unpaid orders, then automatically cancel them if the user never selects a method or submits proof.',
    paymentReminderHours: isMyanmar ? 'Reminder after (hours)' : 'Reminder after (hours)',
    pendingReviewReminderHours: isMyanmar
      ? 'Admin review reminder (hours)'
      : 'Admin review reminder (hours)',
    rejectedOrderReminderHours: isMyanmar
      ? 'Rejected follow-up reminder (hours)'
      : 'Rejected follow-up reminder (hours)',
    retryOrderReminderHours: isMyanmar
      ? 'Retry reminder (hours)'
      : 'Retry reminder (hours)',
    unpaidOrderExpiryHours: isMyanmar ? 'Auto-expire after (hours)' : 'Auto-expire after (hours)',
    paymentInstructions: isMyanmar ? 'Payment လမ်းညွှန်' : 'Payment instructions',
    englishInstructions: isMyanmar ? 'English instructions' : 'English instructions',
    burmeseInstructions: isMyanmar ? 'မြန်မာ instructions' : 'Burmese instructions',
    paymentMethodsTitle: isMyanmar ? 'ငွေပေးချေမှု အကောင့်များ' : 'Payment methods',
    paymentMethodsDesc: isMyanmar
      ? 'KPay, Wave Pay, AYA Pay စသည့် ငွေပေးချေမှု account အချက်အလက်များကို bot မှ ပြသပါမည်။'
      : 'Show KPay, Wave Pay, AYA Pay, and other payment account details in the bot before users upload screenshots.',
    paymentMethodLabel: isMyanmar ? 'Payment method' : 'Payment method',
    accountName: isMyanmar ? 'အကောင့်အမည်' : 'Account name',
    accountNumber: isMyanmar ? 'အကောင့်နံပါတ်' : 'Account number',
    paymentImageUrl: isMyanmar ? 'QR / account image URL' : 'QR / account image URL',
    englishMethodInstructions: isMyanmar ? 'English instructions' : 'English instructions',
    burmeseMethodInstructions: isMyanmar ? 'မြန်မာ instructions' : 'Burmese instructions',
    planConfig: isMyanmar ? 'Plan configuration' : 'Plan configuration',
    planLabel: isMyanmar ? 'Plan အမည်' : 'Plan label',
    burmeseLabel: isMyanmar ? 'မြန်မာ label' : 'Burmese label',
    priceAmount: isMyanmar ? 'ငွေပမာဏ' : 'Price amount',
    priceCurrency: isMyanmar ? 'ငွေကြေး' : 'Currency',
    priceLabel: isMyanmar ? 'စျေးနှုန်း label' : 'Price label',
    burmesePriceLabel: isMyanmar ? 'မြန်မာ စျေးနှုန်း label' : 'Burmese price label',
    autoPricePreview: isMyanmar ? 'အလိုအလျောက် စျေးနှုန်း preview' : 'Automatic price preview',
    deliveryType: isMyanmar ? 'Delivery type' : 'Delivery type',
    accessKeyDelivery: isMyanmar ? 'Normal access key' : 'Normal access key',
    dynamicKeyDelivery: isMyanmar ? 'Premium dynamic key' : 'Premium dynamic key',
    premiumTemplateOnlyHint: isMyanmar
      ? 'Premium plan များအတွက် self-managed dynamic template များကိုသာ ပြသပါမည်။'
      : 'Premium plans only show self-managed dynamic templates.',
    premiumPool: isMyanmar ? 'Premium pool' : 'Premium pool',
    stableLink: isMyanmar ? 'Stable link' : 'Stable link',
    autoFailover: isMyanmar ? 'Auto failover' : 'Auto failover',
    preferredRouting: isMyanmar ? 'Preferred routing' : 'Preferred routing',
    template: isMyanmar ? 'အသုံးပြုမည့် template' : 'Template to apply',
    dynamicTemplate: isMyanmar ? 'အသုံးပြုမည့် dynamic template' : 'Dynamic template to apply',
    noTemplate: isMyanmar ? 'Template မသုံးပါ' : 'No template',
    noTemplateSelected: isMyanmar ? 'ဤ plan အတွက် template မရွေးထားသေးပါ။' : 'No template is selected for this plan yet.',
    templateMissing: isMyanmar ? 'ရွေးထားသော template ကို မတွေ့ပါ။' : 'The selected template could not be found.',
    templateSummary: isMyanmar ? 'Template summary' : 'Template summary',
    server: isMyanmar ? 'Server' : 'Server',
    autoSelectServer: isMyanmar ? 'Auto-select' : 'Auto-select',
    method: isMyanmar ? 'Method' : 'Method',
    slugRule: isMyanmar ? 'Slug rule' : 'Slug rule',
    theme: isMyanmar ? 'Theme' : 'Theme',
    shareDelivery: isMyanmar ? 'Share page' : 'Share page',
    clientDelivery: isMyanmar ? 'Client link' : 'Client link',
    telegramDelivery: isMyanmar ? 'Telegram delivery' : 'Telegram delivery',
    enabledShort: isMyanmar ? 'ဖွင့်ထား' : 'Enabled',
    disabledShort: isMyanmar ? 'ပိတ်ထား' : 'Disabled',
    none: isMyanmar ? 'မရှိ' : 'None',
    behavior: isMyanmar ? 'Plan behavior' : 'Plan behavior',
    duration: isMyanmar ? 'သက်တမ်း' : 'Duration',
    days: (count: number) => (isMyanmar ? `${count} ရက်` : `${count} day${count === 1 ? '' : 's'}`),
    enabled: isMyanmar ? 'ဖွင့်ထားသည်' : 'Enabled',
    disabled: isMyanmar ? 'ပိတ်ထားသည်' : 'Disabled',
    unlimited: isMyanmar ? 'Unlimited quota' : 'Unlimited quota',
    months: (count: number) => (isMyanmar ? `${count} လ` : `${count} month${count === 1 ? '' : 's'}`),
    minMonths: (count: number) => (isMyanmar ? `အနည်းဆုံး ${count} လ` : `Minimum ${count} months`),
    dataLimit: (gb: number | null | undefined) =>
      gb ? (isMyanmar ? `${gb} GB limit` : `${gb} GB limit`) : isMyanmar ? 'Unlimited quota' : 'Unlimited quota',
    saveConfig: isMyanmar ? 'Order settings သိမ်းမည်' : 'Save order settings',
    saved: isMyanmar ? 'Telegram order settings သိမ်းပြီးပါပြီ' : 'Telegram order settings saved',
    savedDesc: isMyanmar ? 'Plan configuration, pricing နှင့် payment instructions ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Plan configuration, pricing, and payment instructions were updated.',
    pendingTitle: isMyanmar ? 'Pending review orders' : 'Pending review orders',
    reviewQueue: isMyanmar ? 'Review queue' : 'Review queue',
    noOrders: isMyanmar ? 'အော်ဒါ မရှိသေးပါ။' : 'No Telegram orders yet.',
    searchPlaceholder: isMyanmar
      ? 'Order code၊ Telegram username၊ email သို့မဟုတ် key name ဖြင့် ရှာရန်'
      : 'Search by order code, Telegram username, email, or key name',
    allStatuses: isMyanmar ? 'Status အားလုံး' : 'All statuses',
    allTypes: isMyanmar ? 'Type အားလုံး' : 'All types',
    newOrders: isMyanmar ? 'အသစ်' : 'New orders',
    renewals: isMyanmar ? 'Renewals' : 'Renewals',
    customer: isMyanmar ? 'Customer' : 'Customer',
    linkedKeys: isMyanmar ? 'Linked keys' : 'Linked keys',
    recentOrders: isMyanmar ? 'Recent orders' : 'Recent orders',
    orderStatusCommand: isMyanmar ? 'Order status command' : 'Order status command',
    customerProfile: isMyanmar ? 'Telegram profile' : 'Telegram profile',
    orderContext: isMyanmar ? 'Order context' : 'Order context',
    noLinkedKeys: isMyanmar ? 'ဆက်စပ် key မတွေ့ပါ။' : 'No linked keys found.',
    noRecentOrders: isMyanmar ? 'ယခင် order မတွေ့ပါ။' : 'No previous orders.',
    noCaption: isMyanmar ? 'Caption မရှိပါ' : 'No caption',
    proofForwardedHint: isMyanmar
      ? 'Proof screenshot ကို admin Telegram chat သို့ copy လုပ်ထားပါသည်။'
      : 'The proof screenshot has been copied into the admin Telegram chat.',
    ordersMatched: (count: number) =>
      isMyanmar ? `ကိုက်ညီသော order ${count} ခု` : `${count} matching orders`,
    localeLabel: isMyanmar ? 'Locale' : 'Locale',
    lastFulfilled: isMyanmar ? 'နောက်ဆုံး fulfilled' : 'Last fulfilled',
    totalOrders: isMyanmar ? 'စုစုပေါင်း orders' : 'Total orders',
    proofCaption: isMyanmar ? 'Proof caption' : 'Proof caption',
    selectedServer: isMyanmar ? 'ရွေးထားသော server' : 'Selected server',
    reviewContextHint: isMyanmar
      ? 'Approve မပြုမီ customer context နှင့် linked keys ကို စစ်ဆေးပါ။'
      : 'Review customer context and linked keys before approving.',
    reviewerAssignment: isMyanmar ? 'Reviewer assignment' : 'Reviewer assignment',
    reviewer: isMyanmar ? 'Reviewer' : 'Reviewer',
    updateReviewer: isMyanmar ? 'Reviewer ကို အပ်ဒိတ်လုပ်မည်' : 'Update reviewer',
    assignToMe: isMyanmar ? 'ကိုယ့်ထံ assign လုပ်မည်' : 'Assign to me',
    reviewerUpdated: isMyanmar ? 'Reviewer ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Reviewer updated',
    reviewerUpdatedDesc: isMyanmar
      ? 'Order reviewer assignment ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။'
      : 'The order reviewer assignment was updated.',
    claimOrder: isMyanmar ? 'Claim' : 'Claim',
    releaseOrder: isMyanmar ? 'Release' : 'Release',
    claimedBy: isMyanmar ? 'Claimed by' : 'Claimed by',
    claimedAt: isMyanmar ? 'Claimed at' : 'Claimed at',
    claimedByMe: isMyanmar ? 'Claimed by me' : 'Claimed by me',
    unassigned: isMyanmar ? 'Unassigned' : 'Unassigned',
    claimSuccess: isMyanmar ? 'Order ကို claim လုပ်ပြီးပါပြီ' : 'Order claimed',
    releaseSuccess: isMyanmar ? 'Order claim ကို လွှတ်ပြီးပါပြီ' : 'Order released',
    salesDigest: isMyanmar ? 'Daily sales digest' : 'Daily sales digest',
    salesDigestDesc: isMyanmar
      ? 'Telegram admin chat များသို့ sales summary ကို နေ့စဉ် ပို့မည်။'
      : 'Send a daily Telegram sales summary to the configured admin chats.',
    salesDigestHour: isMyanmar ? 'Sales digest hour' : 'Sales digest hour',
    salesDigestMinute: isMyanmar ? 'Sales digest minute' : 'Sales digest minute',
    sendSalesDigestNow: isMyanmar ? 'Sales digest ကို ယခု ပို့မည်' : 'Send sales digest now',
    salesDigestSent: isMyanmar ? 'Sales digest ပို့ပြီးပါပြီ' : 'Sales digest sent',
    salesDigestFailed: isMyanmar ? 'Sales digest မပို့နိုင်ပါ' : 'Sales digest failed',
    salesDigestSentDesc: (count: number) =>
      isMyanmar ? `Admin chat ${count} ခုသို့ ပို့ပြီးပါပြီ။` : `Delivered to ${count} admin chat(s).`,
    priorityQueue: isMyanmar ? 'Priority queue' : 'Priority queue',
    reviewerWorkload: isMyanmar ? 'Reviewer workload' : 'Reviewer workload',
    queueAll: isMyanmar ? 'All' : 'All',
    queueUnclaimed: isMyanmar ? 'Unclaimed' : 'Unclaimed',
    queueHighRisk: isMyanmar ? 'High risk' : 'High risk',
    queuePremium: isMyanmar ? 'Premium' : 'Premium',
    queueMine: isMyanmar ? 'My queue' : 'My queue',
    queueOldest: isMyanmar ? 'Oldest first' : 'Oldest first',
    highRiskPending: isMyanmar ? 'High-risk pending' : 'High-risk pending',
    myClaimed: isMyanmar ? 'My claimed' : 'My claimed',
    claimedByOthers: isMyanmar ? 'Claimed by others' : 'Claimed by others',
    quickApprove: isMyanmar ? 'Quick approve' : 'Quick approve',
    macroRejectDuplicate: isMyanmar ? 'Reject duplicate' : 'Reject duplicate',
    macroRejectBlurry: isMyanmar ? 'Reject blurry' : 'Reject blurry',
    macroRejectAmount: isMyanmar ? 'Wrong amount' : 'Wrong amount',
    macroRejectMethod: isMyanmar ? 'Wrong method' : 'Wrong method',
    macroApplied: isMyanmar ? 'Review macro applied' : 'Review macro applied',
    macroApplyFailed: isMyanmar ? 'Review macro failed' : 'Review macro failed',
    noAssignedReviewers: isMyanmar ? 'No claimed pending orders yet.' : 'No claimed pending orders yet.',
    riskLabel: isMyanmar ? 'Risk score' : 'Risk score',
    riskLow: isMyanmar ? 'Low' : 'Low',
    riskMedium: isMyanmar ? 'Medium' : 'Medium',
    riskHigh: isMyanmar ? 'High' : 'High',
    riskCritical: isMyanmar ? 'Critical' : 'Critical',
    riskReasonDuplicateProof: isMyanmar ? 'Duplicate proof history' : 'Duplicate proof history',
    riskReasonRepeatedRejections: isMyanmar ? 'Repeated rejected orders' : 'Repeated rejected orders',
    riskReasonPaymentMismatch: isMyanmar ? 'Payment mismatch history' : 'Payment mismatch history',
    riskReasonRetryPattern: isMyanmar ? 'Retry-heavy order pattern' : 'Retry-heavy order pattern',
    riskReasonMultipleOpenOrders: isMyanmar ? 'Multiple open orders' : 'Multiple open orders',
    riskReasonResubmittedProof: isMyanmar ? 'Proof resubmitted' : 'Proof resubmitted',
    user: isMyanmar ? 'User' : 'User',
    order: isMyanmar ? 'Order' : 'Order',
    proof: isMyanmar ? 'Payment proof' : 'Payment proof',
    target: isMyanmar ? 'Target key' : 'Target key',
    submitted: isMyanmar ? 'Submitted' : 'Submitted',
    status: isMyanmar ? 'Status' : 'Status',
    approve: isMyanmar ? 'အတည်ပြုမည်' : 'Approve',
    reject: isMyanmar ? 'ပယ်မည်' : 'Reject',
    adminNote: isMyanmar ? 'Admin note' : 'Admin note',
    customerMessage: isMyanmar ? 'Customer message' : 'Customer message',
    customerMessageDesc: isMyanmar
      ? 'User ကို Telegram မှာ ပြသမည့် စာသားဖြစ်ပါသည်။ မထည့်ပါက support နှင့် ပြန်စနိုင်ကြောင်း default message ကို ပို့မည်။'
      : 'This message is shown to the user in Telegram. Leave it empty to send the default support/retry message.',
    rejectPresets: isMyanmar ? 'Reject reason presets' : 'Reject reason presets',
    rejectPresetCustom: isMyanmar ? 'Custom message' : 'Custom message',
    proofRevision: isMyanmar ? 'Proof revisions' : 'Proof revisions',
    duplicateProofFlag: isMyanmar ? 'Duplicate proof detected' : 'Duplicate proof detected',
    duplicateProofHint: isMyanmar
      ? 'ဤ payment screenshot သည် ယခင် order တစ်ခုတွင် အသုံးပြုထားသော proof နှင့် ကိုက်ညီနေပါသည်။'
      : 'This payment screenshot matches proof already used on another order.',
    duplicateProofOrderLabel: isMyanmar ? 'Matched order' : 'Matched order',
    duplicateProofDetectedAt: isMyanmar ? 'Detected at' : 'Detected at',
    proofPreview: isMyanmar ? 'Proof preview' : 'Proof preview',
    zoomProof: isMyanmar ? 'Proof ကို ချဲ့ကြည့်မည်' : 'Zoom proof',
    openProof: isMyanmar ? 'Proof ဖွင့်မည်' : 'Open proof',
    downloadProof: isMyanmar ? 'Proof ဒေါင်းလုဒ်လုပ်မည်' : 'Download proof',
    editBeforeApproval: isMyanmar ? 'Approve မပြုမီ order ကို ပြင်ဆင်မည်' : 'Edit order before approval',
    editBeforeApprovalDesc: isMyanmar
      ? 'Plan၊ သက်တမ်းနှင့် server ကို ပြောင်းပြီး key ဖန်တီးမည့် setting ကို အတည်ပြုပြီးမှ approve လုပ်ပါ။'
      : 'Adjust the plan, duration, or preferred server before you approve and create the key.',
    saveOrderChanges: isMyanmar ? 'Order changes သိမ်းမည်' : 'Save order changes',
    orderUpdated: isMyanmar ? 'Order ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Order updated',
    orderUpdatedDesc: isMyanmar
      ? 'Approve မပြုမီ order အသေးစိတ်ကို ပြင်ဆင်ပြီးပါပြီ။'
      : 'The order details were updated before approval.',
    updateFailed: isMyanmar ? 'Order အပ်ဒိတ် မအောင်မြင်ပါ' : 'Order update failed',
    paymentProofImage: isMyanmar ? 'Payment proof image' : 'Payment proof image',
    noImagePreview: isMyanmar ? 'ဤ proof ကို panel ထဲတွင် preview မပြနိုင်ပါ။' : 'This proof cannot be previewed inline.',
    approveSuccess: isMyanmar ? 'အော်ဒါကို အတည်ပြုပြီး key ပေးပြီးပါပြီ' : 'Order approved and key delivered',
    rejectSuccess: isMyanmar ? 'အော်ဒါကို ပယ်ပြီး Telegram သို့ အသိပေးပြီးပါပြီ' : 'Order rejected and user notified',
    deliveryWarning: isMyanmar ? 'Key ကို ဖန်တီးပြီးပေမယ့် Telegram ပို့မှု မအောင်မြင်ပါ' : 'Key was created but Telegram delivery failed',
    markForReview: isMyanmar ? 'Payment proof ကို admin များ Telegram chat တွင် စစ်ဆေးပါ။' : 'Review the payment proof from your Telegram admin chat before approving.',
    awaitingProof: isMyanmar ? 'Payment proof စောင့်နေသည်' : 'Awaiting payment proof',
    fulfilled: isMyanmar ? 'ပြီးစီးပြီး' : 'Fulfilled',
    rejected: isMyanmar ? 'ပယ်ထားပြီး' : 'Rejected',
    cancelled: isMyanmar ? 'ပယ်ဖျက်ပြီး' : 'Cancelled',
    pending: isMyanmar ? 'Pending review' : 'Pending review',
    serverChangeRequestsTitle: isMyanmar ? 'Server change requests' : 'Server change requests',
    serverChangeRequestsDesc: isMyanmar
      ? 'User များက normal key အတွက် server ပြောင်းရန် တောင်းဆိုထားသော request များကို စစ်ဆေးပြီး approve/reject လုပ်ပါ။'
      : 'Review requests from users who need a normal access key moved to another server.',
    noServerChangeRequests: isMyanmar
      ? 'Pending server change request မရှိသေးပါ။'
      : 'No pending server change requests.',
    requestedMove: isMyanmar ? 'Requested move' : 'Requested move',
    remainingAfterApproval: isMyanmar ? 'Approve ပြီးနောက် ကျန်မည့် ပြောင်းခွင့်' : 'Remaining after approval',
    reviewInKeyPage: isMyanmar ? 'Key page ဖွင့်မည်' : 'Open key page',
    currentServer: isMyanmar ? 'လက်ရှိ server' : 'Current server',
    requestedServer: isMyanmar ? 'တောင်းဆိုထားသော server' : 'Requested server',
    requestSubmittedAt: isMyanmar ? 'Requested' : 'Requested',
    approveMoveSuccess: isMyanmar ? 'Server change request ကို approve လုပ်ပြီး key ကို ပြောင်းပြီးပါပြီ' : 'Server change request approved and key moved',
    rejectMoveSuccess: isMyanmar ? 'Server change request ကို reject လုပ်ပြီး user ကို အသိပေးပြီးပါပြီ' : 'Server change request rejected and user notified',
    premiumSupportRequestsTitle: isMyanmar ? 'Premium support requests' : 'Premium support requests',
    premiumSupportRequestsDesc: isMyanmar
      ? 'Premium dynamic key များအတွက် region preference နှင့် route issue request များကို စစ်ဆေးပြီး လိုအပ်သလို update လုပ်ပါ။'
      : 'Review preferred-region changes and premium route-issue reports for dynamic keys.',
    noPremiumSupportRequests: isMyanmar
      ? 'Pending premium support request မရှိသေးပါ။'
      : 'No pending premium support requests.',
    premiumRequestType: isMyanmar ? 'Request type' : 'Request type',
    premiumRequestTypeRegion: isMyanmar ? 'Preferred region change' : 'Preferred region change',
    premiumRequestTypeRoute: isMyanmar ? 'Route issue report' : 'Route issue report',
    premiumPoolSummary: isMyanmar ? 'Current premium pool' : 'Current premium pool',
    premiumResolvedServer: isMyanmar ? 'Last resolved server' : 'Last resolved server',
    premiumRequestedRegion: isMyanmar ? 'Requested region' : 'Requested region',
    premiumApproveRegion: isMyanmar ? 'Region approve' : 'Approve region',
    premiumHandleIssue: isMyanmar ? 'Handle issue' : 'Handle issue',
    premiumDismiss: isMyanmar ? 'Dismiss' : 'Dismiss',
    premiumReply: isMyanmar ? 'Reply to user' : 'Reply to user',
    premiumReplySuccess: isMyanmar ? 'Premium reply ကို user ထံ ပို့ပြီးပါပြီ' : 'Premium reply sent to the user',
    premiumPinServer: isMyanmar ? 'Temporary pin server' : 'Temporary pin server',
    premiumPinExpires: isMyanmar ? 'Pin duration' : 'Pin duration',
    premiumNoPinServer: isMyanmar ? 'No temporary pin' : 'No temporary pin',
    premiumAppendNoteToKey: isMyanmar ? 'Dynamic key note ထဲသို့ admin note ကို ထည့်မည်' : 'Append admin note to the dynamic key',
    premiumApproveSuccess: isMyanmar ? 'Premium region request ကို approve လုပ်ပြီး user ကို အသိပေးပြီးပါပြီ' : 'Premium region request approved and user notified',
    premiumHandleSuccess: isMyanmar ? 'Premium route issue ကို handle လုပ်ပြီး user ကို အသိပေးပြီးပါပြီ' : 'Premium route issue handled and user notified',
    premiumDismissSuccess: isMyanmar ? 'Premium support request ကို dismiss လုပ်ပြီး user ကို အသိပေးပြီးပါပြီ' : 'Premium support request dismissed and user notified',
    premiumOpenDynamicKey: isMyanmar ? 'Dynamic key page ဖွင့်မည်' : 'Open dynamic key page',
    premiumPinPresets: isMyanmar ? 'Pin time' : 'Pin time',
    premiumCurrentPin: isMyanmar ? 'Current pin' : 'Current pin',
    premiumNoRequestedRegion: isMyanmar ? 'Auto / admin review' : 'Auto / admin review',
    premiumSearchPlaceholder: isMyanmar
      ? 'Request code၊ key၊ region သို့မဟုတ် Telegram user ဖြင့် ရှာရန်'
      : 'Search by request code, key, region, or Telegram user',
    premiumAllStatuses: isMyanmar ? 'Status အားလုံး' : 'All statuses',
    premiumAllTypes: isMyanmar ? 'Request type အားလုံး' : 'All request types',
    premiumQueueMatches: (count: number) =>
      isMyanmar ? `ကိုက်ညီသော request ${count} ခု` : `${count} matching requests`,
    premiumStatusPending: isMyanmar ? 'Pending review' : 'Pending review',
    premiumStatusApproved: isMyanmar ? 'Approved' : 'Approved',
    premiumStatusHandled: isMyanmar ? 'Handled' : 'Handled',
    premiumStatusDismissed: isMyanmar ? 'Dismissed' : 'Dismissed',
    premiumHistoryTitle: isMyanmar ? 'Status history' : 'Status history',
    premiumHistorySubmitted: isMyanmar ? 'Submitted' : 'Submitted',
    premiumHistoryReviewed: isMyanmar ? 'Reviewed' : 'Reviewed',
    premiumHistoryApproved: isMyanmar ? 'Preferred region applied' : 'Preferred region applied',
    premiumHistoryHandled: isMyanmar ? 'Issue handled' : 'Issue handled',
    premiumHistoryDismissed: isMyanmar ? 'Dismissed' : 'Dismissed',
    premiumHistoryPinApplied: isMyanmar ? 'Temporary pin applied' : 'Temporary pin applied',
    premiumHistoryCustomerReply: isMyanmar ? 'Customer follow-up' : 'Customer follow-up',
    premiumHistoryAdminReply: isMyanmar ? 'Admin reply' : 'Admin reply',
    premiumFollowUpPending: isMyanmar ? 'Follow-up waiting' : 'Follow-up waiting',
    premiumReplyThreadTitle: isMyanmar ? 'Conversation' : 'Conversation',
    premiumLatestReply: isMyanmar ? 'Latest reply' : 'Latest reply',
    premiumLastUpdate: isMyanmar ? 'Last update' : 'Last update',
  };

  const renderTemplateSummary = (
    deliveryType?: 'ACCESS_KEY' | 'DYNAMIC_KEY' | null,
    templateId?: string | null,
    dynamicTemplateId?: string | null,
    compact = false,
  ) => {
    if (deliveryType === 'DYNAMIC_KEY') {
      if (!dynamicTemplateId) {
        return (
          <div className="mt-3 rounded-xl border border-dashed border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
            {salesUi.noTemplateSelected}
          </div>
        );
      }

      const template = dynamicTemplatesById.get(dynamicTemplateId);
      if (!template) {
        return (
          <div className="mt-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/[0.04] p-3 text-xs text-destructive">
            {salesUi.templateMissing}
          </div>
        );
      }

      const serverSummary = template.preferredServerIds.length > 0
        ? `${template.preferredServerIds.length} preferred server${template.preferredServerIds.length === 1 ? '' : 's'}`
        : template.preferredCountryCodes.length > 0
          ? template.preferredCountryCodes.join(', ')
          : salesUi.autoSelectServer;
      const benefitBadges = [
        salesUi.stableLink,
        template.type === 'SELF_MANAGED' ? salesUi.autoFailover : null,
        template.preferredCountryCodes.length > 0 || template.preferredServerIds.length > 0
          ? salesUi.preferredRouting
          : null,
      ].filter(Boolean) as string[];

      return (
        <div className="mt-3 rounded-xl border border-border/50 bg-background/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>{template.name}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{salesUi.dynamicKeyDelivery}</Badge>
              <Badge variant="outline">{template.type === 'SELF_MANAGED' ? 'Self-managed' : 'Manual'}</Badge>
              {template.subscriptionTheme ? (
                <Badge variant="outline">{template.subscriptionTheme}</Badge>
              ) : null}
            </div>
          </div>
          {template.description ? (
            <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{salesUi.premiumPool}: {serverSummary}</Badge>
            {benefitBadges.map((badge) => (
              <Badge key={badge} variant="outline">
                {badge}
              </Badge>
            ))}
          </div>
          <div className={cn('mt-3 grid gap-2', compact ? 'sm:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4')}>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {salesUi.server}
              </p>
              <p className="mt-1 text-sm font-medium">{serverSummary}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {salesUi.method}
              </p>
              <p className="mt-1 text-sm font-medium">{template.method}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {salesUi.behavior}
              </p>
              <p className="mt-1 text-sm font-medium">
                {template.rotationEnabled ? `Rotation · ${template.rotationTriggerMode.toLowerCase()}` : 'Stable routing'}
              </p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {salesUi.duration}
              </p>
              <p className="mt-1 text-sm font-medium">
                {template.durationDays ? salesUi.days(template.durationDays) : salesUi.none}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={template.sharePageEnabled ? 'default' : 'secondary'}>
              {salesUi.shareDelivery}: {template.sharePageEnabled ? salesUi.enabledShort : salesUi.disabledShort}
            </Badge>
            <Badge variant="outline">
              {salesUi.clientDelivery}: {salesUi.enabledShort}
            </Badge>
            <Badge variant="outline">
              {salesUi.telegramDelivery}: {salesUi.enabledShort}
            </Badge>
          </div>
        </div>
      );
    }

    if (!templateId) {
      return (
        <div className="mt-3 rounded-xl border border-dashed border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
          {salesUi.noTemplateSelected}
        </div>
      );
    }

    const template = templatesById.get(templateId);
    if (!template) {
      return (
        <div className="mt-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/[0.04] p-3 text-xs text-destructive">
          {salesUi.templateMissing}
        </div>
      );
    }

    const serverLabel = template.server?.name
      ? `${template.server.name}${template.server.countryCode ? ` (${template.server.countryCode})` : ''}`
      : salesUi.autoSelectServer;

    return (
      <div className="mt-3 rounded-xl border border-border/50 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>{template.name}</p>
          {template.subscriptionTheme ? (
            <Badge variant="outline">{template.subscriptionTheme}</Badge>
          ) : null}
        </div>
        {template.description ? (
          <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
        ) : null}
        <div className={cn('mt-3 grid gap-2', compact ? 'sm:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4')}>
          <div className="rounded-lg border border-border/40 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {salesUi.server}
            </p>
            <p className="mt-1 text-xs">{serverLabel}</p>
          </div>
          <div className="rounded-lg border border-border/40 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {salesUi.method}
            </p>
            <p className="mt-1 text-xs">{template.method}</p>
          </div>
          <div className="rounded-lg border border-border/40 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {salesUi.slugRule}
            </p>
            <p className="mt-1 text-xs">{template.slugPrefix || salesUi.none}</p>
          </div>
          <div className="rounded-lg border border-border/40 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {salesUi.theme}
            </p>
            <p className="mt-1 text-xs">{template.subscriptionTheme || salesUi.none}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={template.sharePageEnabled ? 'default' : 'secondary'}>
            {salesUi.shareDelivery}: {template.sharePageEnabled ? salesUi.enabledShort : salesUi.disabledShort}
          </Badge>
          <Badge variant={template.clientLinkEnabled ? 'default' : 'secondary'}>
            {salesUi.clientDelivery}: {template.clientLinkEnabled ? salesUi.enabledShort : salesUi.disabledShort}
          </Badge>
          <Badge variant={template.telegramDeliveryEnabled ? 'default' : 'secondary'}>
            {salesUi.telegramDelivery}: {template.telegramDeliveryEnabled ? salesUi.enabledShort : salesUi.disabledShort}
          </Badge>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!orderCodeParam || orderSearch.trim().length > 0) {
      return;
    }

    setOrderSearch(orderCodeParam);
  }, [orderCodeParam, orderSearch]);

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    const nextForm: TelegramSalesSettingsForm = {
      enabled: settingsQuery.data.enabled ?? false,
      allowRenewals: settingsQuery.data.allowRenewals ?? true,
      supportLink: settingsQuery.data.supportLink || DEFAULT_TELEGRAM_SALES_SETTINGS.supportLink,
      dailySalesDigestEnabled:
        settingsQuery.data.dailySalesDigestEnabled ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.dailySalesDigestEnabled,
      dailySalesDigestHour:
        settingsQuery.data.dailySalesDigestHour ?? DEFAULT_TELEGRAM_SALES_SETTINGS.dailySalesDigestHour,
      dailySalesDigestMinute:
        settingsQuery.data.dailySalesDigestMinute ?? DEFAULT_TELEGRAM_SALES_SETTINGS.dailySalesDigestMinute,
      trialCouponEnabled:
        settingsQuery.data.trialCouponEnabled ?? DEFAULT_TELEGRAM_SALES_SETTINGS.trialCouponEnabled,
      trialCouponPaused:
        settingsQuery.data.trialCouponPaused ?? DEFAULT_TELEGRAM_SALES_SETTINGS.trialCouponPaused,
      trialCouponLeadHours: String(
        settingsQuery.data.trialCouponLeadHours ?? DEFAULT_TELEGRAM_SALES_SETTINGS.trialCouponLeadHours,
      ),
      trialCouponMaxRecipientsPerRun: String(
        settingsQuery.data.trialCouponMaxRecipientsPerRun ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.trialCouponMaxRecipientsPerRun,
      ),
      trialCouponCode:
        settingsQuery.data.trialCouponCode ?? DEFAULT_TELEGRAM_SALES_SETTINGS.trialCouponCode,
      trialCouponDiscountLabel:
        settingsQuery.data.trialCouponDiscountLabel ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.trialCouponDiscountLabel,
      trialCouponDiscountAmount: String(
        settingsQuery.data.trialCouponDiscountAmount ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.trialCouponDiscountAmount,
      ),
      renewalCouponEnabled:
        settingsQuery.data.renewalCouponEnabled ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.renewalCouponEnabled,
      renewalCouponPaused:
        settingsQuery.data.renewalCouponPaused ?? DEFAULT_TELEGRAM_SALES_SETTINGS.renewalCouponPaused,
      renewalCouponLeadDays: String(
        settingsQuery.data.renewalCouponLeadDays ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.renewalCouponLeadDays,
      ),
      renewalCouponMaxRecipientsPerRun: String(
        settingsQuery.data.renewalCouponMaxRecipientsPerRun ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.renewalCouponMaxRecipientsPerRun,
      ),
      renewalCouponCode:
        settingsQuery.data.renewalCouponCode ?? DEFAULT_TELEGRAM_SALES_SETTINGS.renewalCouponCode,
      renewalCouponDiscountLabel:
        settingsQuery.data.renewalCouponDiscountLabel ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.renewalCouponDiscountLabel,
      renewalCouponDiscountAmount: String(
        settingsQuery.data.renewalCouponDiscountAmount ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.renewalCouponDiscountAmount,
      ),
      premiumUpsellCouponEnabled:
        settingsQuery.data.premiumUpsellCouponEnabled ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.premiumUpsellCouponEnabled,
      premiumUpsellCouponPaused:
        settingsQuery.data.premiumUpsellCouponPaused ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.premiumUpsellCouponPaused,
      premiumUpsellUsageThresholdPercent: String(
        settingsQuery.data.premiumUpsellUsageThresholdPercent ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.premiumUpsellUsageThresholdPercent,
      ),
      premiumUpsellCouponMaxRecipientsPerRun: String(
        settingsQuery.data.premiumUpsellCouponMaxRecipientsPerRun ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.premiumUpsellCouponMaxRecipientsPerRun,
      ),
      premiumUpsellCouponCode:
        settingsQuery.data.premiumUpsellCouponCode ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.premiumUpsellCouponCode,
      premiumUpsellCouponDiscountLabel:
        settingsQuery.data.premiumUpsellCouponDiscountLabel ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.premiumUpsellCouponDiscountLabel,
      premiumUpsellCouponDiscountAmount: String(
        settingsQuery.data.premiumUpsellCouponDiscountAmount ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.premiumUpsellCouponDiscountAmount,
      ),
      winbackCouponEnabled:
        settingsQuery.data.winbackCouponEnabled ?? DEFAULT_TELEGRAM_SALES_SETTINGS.winbackCouponEnabled,
      winbackCouponPaused:
        settingsQuery.data.winbackCouponPaused ?? DEFAULT_TELEGRAM_SALES_SETTINGS.winbackCouponPaused,
      winbackCouponInactivityDays: String(
        settingsQuery.data.winbackCouponInactivityDays ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.winbackCouponInactivityDays,
      ),
      winbackCouponMaxRecipientsPerRun: String(
        settingsQuery.data.winbackCouponMaxRecipientsPerRun ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.winbackCouponMaxRecipientsPerRun,
      ),
      winbackCouponCode:
        settingsQuery.data.winbackCouponCode ?? DEFAULT_TELEGRAM_SALES_SETTINGS.winbackCouponCode,
      winbackCouponDiscountLabel:
        settingsQuery.data.winbackCouponDiscountLabel ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.winbackCouponDiscountLabel,
      winbackCouponDiscountAmount: String(
        settingsQuery.data.winbackCouponDiscountAmount ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.winbackCouponDiscountAmount,
      ),
      promoCampaignCooldownHours: String(
        settingsQuery.data.promoCampaignCooldownHours ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.promoCampaignCooldownHours,
      ),
      promoExcludeRecentRefundUsers:
        settingsQuery.data.promoExcludeRecentRefundUsers ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.promoExcludeRecentRefundUsers,
      promoExcludeRecentRefundDays: String(
        settingsQuery.data.promoExcludeRecentRefundDays ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.promoExcludeRecentRefundDays,
      ),
      promoExcludeSupportHeavyUsers:
        settingsQuery.data.promoExcludeSupportHeavyUsers ??
        DEFAULT_TELEGRAM_SALES_SETTINGS.promoExcludeSupportHeavyUsers,
      promoSupportHeavyLookbackDays: String(
        settingsQuery.data.promoSupportHeavyLookbackDays ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.promoSupportHeavyLookbackDays,
      ),
      promoSupportHeavyThreshold: String(
        settingsQuery.data.promoSupportHeavyThreshold ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.promoSupportHeavyThreshold,
      ),
      paymentReminderHours: String(
        settingsQuery.data.paymentReminderHours ?? DEFAULT_TELEGRAM_SALES_SETTINGS.paymentReminderHours,
      ),
      pendingReviewReminderHours: String(
        settingsQuery.data.pendingReviewReminderHours ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.pendingReviewReminderHours,
      ),
      rejectedOrderReminderHours: String(
        settingsQuery.data.rejectedOrderReminderHours ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.rejectedOrderReminderHours,
      ),
      retryOrderReminderHours: String(
        settingsQuery.data.retryOrderReminderHours ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.retryOrderReminderHours,
      ),
      unpaidOrderExpiryHours: String(
        settingsQuery.data.unpaidOrderExpiryHours ?? DEFAULT_TELEGRAM_SALES_SETTINGS.unpaidOrderExpiryHours,
      ),
      paymentInstructions: settingsQuery.data.paymentInstructions || DEFAULT_TELEGRAM_SALES_SETTINGS.paymentInstructions,
      localizedPaymentInstructions: {
        en:
          settingsQuery.data.localizedPaymentInstructions?.en ||
          settingsQuery.data.paymentInstructions ||
          DEFAULT_TELEGRAM_SALES_SETTINGS.localizedPaymentInstructions.en,
        my:
          settingsQuery.data.localizedPaymentInstructions?.my ||
          DEFAULT_TELEGRAM_SALES_SETTINGS.localizedPaymentInstructions.my,
      },
      paymentMethods: DEFAULT_TELEGRAM_SALES_SETTINGS.paymentMethods.map((fallbackMethod) => {
        const override = settingsQuery.data.paymentMethods?.find(
          (method) => method.code === fallbackMethod.code,
        );
        return {
          ...fallbackMethod,
          ...override,
          imageUrl: override?.imageUrl || fallbackMethod.imageUrl,
          localizedLabels: {
            en: override?.localizedLabels?.en || override?.label || fallbackMethod.localizedLabels.en,
            my: override?.localizedLabels?.my || fallbackMethod.localizedLabels.my,
          },
          localizedNotes: {
            en: override?.localizedNotes?.en || override?.note || fallbackMethod.localizedNotes.en,
            my: override?.localizedNotes?.my || fallbackMethod.localizedNotes.my,
          },
        };
      }),
      plans: DEFAULT_TELEGRAM_SALES_SETTINGS.plans.map((fallbackPlan) => {
        const override = settingsQuery.data.plans.find((plan) => plan.code === fallbackPlan.code);
        return {
          ...fallbackPlan,
          ...override,
          localizedLabels: {
            en: override?.localizedLabels?.en || override?.label || fallbackPlan.localizedLabels.en,
            my: override?.localizedLabels?.my || fallbackPlan.localizedLabels.my,
          },
          priceAmount:
            typeof override?.priceAmount === 'number' && Number.isFinite(override.priceAmount)
              ? String(override.priceAmount)
              : fallbackPlan.priceAmount,
          priceCurrency:
            typeof override?.priceCurrency === 'string' && override.priceCurrency.trim().length > 0
              ? override.priceCurrency.trim().toUpperCase()
              : fallbackPlan.priceCurrency,
          localizedPriceLabels: {
            en: override?.localizedPriceLabels?.en || override?.priceLabel || fallbackPlan.localizedPriceLabels.en,
            my: override?.localizedPriceLabels?.my || fallbackPlan.localizedPriceLabels.my,
          },
          deliveryType: override?.deliveryType ?? fallbackPlan.deliveryType,
          templateId: override?.templateId ?? fallbackPlan.templateId,
          dynamicTemplateId: override?.dynamicTemplateId ?? fallbackPlan.dynamicTemplateId,
          fixedDurationDays: override?.fixedDurationDays ?? fallbackPlan.fixedDurationDays ?? null,
          fixedDurationMonths: override?.fixedDurationMonths ?? fallbackPlan.fixedDurationMonths ?? null,
          minDurationMonths: override?.minDurationMonths ?? fallbackPlan.minDurationMonths ?? null,
          dataLimitGB: override?.dataLimitGB ?? fallbackPlan.dataLimitGB ?? null,
          unlimitedQuota: override?.unlimitedQuota ?? fallbackPlan.unlimitedQuota,
        };
      }),
    };
    setForm(nextForm);
    setSavedWorkflowSnapshot(JSON.parse(JSON.stringify(nextForm)) as TelegramSalesSettingsForm);
  }, [settingsQuery.data]);

  const saveConfigMutation = trpc.telegramBot.updateSalesConfig.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.telegramBot.getSalesConfig.invalidate(),
        utils.telegramBot.listOrders.invalidate(),
      ]);
      toast({
        title: salesUi.saved,
        description: salesUi.savedDesc,
      });
    },
    onError: (error) => {
      toast({
        title: 'Telegram sales settings failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const simulateCampaignAudienceMutation = trpc.telegramBot.simulateCampaignAudience.useMutation({
    onError: (error) => {
      toast({
        title: 'Campaign simulation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const approveOrderMutation = trpc.telegramBot.approveOrder.useMutation({
    onSuccess: async (result) => {
      await utils.telegramBot.listOrders.invalidate();
      setReviewTarget(null);
      setReviewNote('');
      setReviewCustomerMessage('');
      setReviewReasonCode('custom');
      toast({
        title: salesUi.approveSuccess,
        description: result.deliveryError || result.sharePageUrl || result.accessKeyName,
        variant: result.deliveryError ? 'destructive' : 'default',
      });
    },
    onError: (error) => {
      toast({
        title: 'Approval failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rejectOrderMutation = trpc.telegramBot.rejectOrder.useMutation({
    onSuccess: async () => {
      await utils.telegramBot.listOrders.invalidate();
      setReviewTarget(null);
      setReviewNote('');
      setReviewCustomerMessage('');
      setReviewReasonCode('custom');
      toast({
        title: salesUi.rejectSuccess,
      });
    },
    onError: (error) => {
      toast({
        title: 'Rejection failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const claimOrderMutation = trpc.telegramBot.claimOrder.useMutation({
    onSuccess: async (_result, variables) => {
      await utils.telegramBot.listOrders.invalidate();
      toast({
        title: variables.claimed ? salesUi.claimSuccess : salesUi.releaseSuccess,
      });
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'Order assignment failed' : 'Order assignment failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const applyOrderMacroMutation = trpc.telegramBot.applyOrderMacro.useMutation({
    onSuccess: async (result) => {
      await utils.telegramBot.listOrders.invalidate();
      toast({
        title: salesUi.macroApplied,
        description:
          result.action === 'APPROVED' ? salesUi.approveSuccess : salesUi.rejectSuccess,
      });
    },
    onError: (error) => {
      toast({
        title: salesUi.macroApplyFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const runSalesDigestMutation = trpc.telegramBot.runSalesDigestNow.useMutation({
    onSuccess: (result) => {
      toast({
        title: salesUi.salesDigestSent,
        description: salesUi.salesDigestSentDesc(result.adminChats ?? 0),
      });
    },
    onError: (error) => {
      toast({
        title: salesUi.salesDigestFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const approveServerChangeRequestMutation = trpc.telegramBot.approveServerChangeRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.telegramBot.listServerChangeRequests.invalidate(),
        utils.keys.list.invalidate(),
        utils.keys.getById.invalidate(),
      ]);
      toast({
        title: salesUi.approveMoveSuccess,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: salesUi.updateFailed,
        description: error.message,
      });
    },
  });
  const rejectServerChangeRequestMutation = trpc.telegramBot.rejectServerChangeRequest.useMutation({
    onSuccess: async () => {
      await utils.telegramBot.listServerChangeRequests.invalidate();
      toast({
        title: salesUi.rejectMoveSuccess,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: salesUi.updateFailed,
        description: error.message,
      });
    },
  });
  const approvePremiumSupportRequestMutation = trpc.telegramBot.approvePremiumSupportRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.telegramBot.listPremiumSupportRequests.invalidate(),
        utils.analytics.telegramSalesDashboard.invalidate(),
        utils.dynamicKeys.list.invalidate(),
        utils.dynamicKeys.getById.invalidate(),
      ]);
      setPremiumReviewTarget(null);
      setPremiumReviewNote('');
      setPremiumReviewCustomerMessage('');
      setPremiumReviewRegionCode('');
      setPremiumReviewPinServerId('none');
      setPremiumReviewPinExpires('60');
      setPremiumAppendNoteToKey(true);
      toast({
        title: salesUi.premiumApproveSuccess,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: salesUi.updateFailed,
        description: error.message,
      });
    },
  });
  const handlePremiumSupportRequestMutation = trpc.telegramBot.handlePremiumSupportRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.telegramBot.listPremiumSupportRequests.invalidate(),
        utils.analytics.telegramSalesDashboard.invalidate(),
        utils.dynamicKeys.list.invalidate(),
        utils.dynamicKeys.getById.invalidate(),
      ]);
      setPremiumReviewTarget(null);
      setPremiumReviewNote('');
      setPremiumReviewCustomerMessage('');
      setPremiumReviewRegionCode('');
      setPremiumReviewPinServerId('none');
      setPremiumReviewPinExpires('60');
      setPremiumAppendNoteToKey(true);
      toast({
        title: salesUi.premiumHandleSuccess,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: salesUi.updateFailed,
        description: error.message,
      });
    },
  });
  const dismissPremiumSupportRequestMutation = trpc.telegramBot.dismissPremiumSupportRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.telegramBot.listPremiumSupportRequests.invalidate(),
        utils.analytics.telegramSalesDashboard.invalidate(),
      ]);
      setPremiumReviewTarget(null);
      setPremiumReviewNote('');
      setPremiumReviewCustomerMessage('');
      setPremiumReviewRegionCode('');
      setPremiumReviewPinServerId('none');
      setPremiumReviewPinExpires('60');
      setPremiumAppendNoteToKey(true);
      toast({
        title: salesUi.premiumDismissSuccess,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: salesUi.updateFailed,
        description: error.message,
      });
    },
  });
  const replyPremiumSupportRequestMutation = trpc.telegramBot.replyPremiumSupportRequest.useMutation({
    onSuccess: () => {
      toast({
        title: salesUi.premiumReplySuccess,
      });
      void premiumSupportRequestsQuery.refetch();
      setPremiumReviewTarget(null);
      setPremiumReviewNote('');
      setPremiumReviewCustomerMessage('');
    },
    onError: (error) => {
      toast({
        title: salesUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateOrderDraftMutation = trpc.telegramBot.updateOrderDraft.useMutation({
    onSuccess: async (result) => {
      await utils.telegramBot.listOrders.invalidate();
      setReviewPlanCode((result.planCode as TelegramSalesPlanCode | null) || '');
      setReviewDurationMonths(result.durationMonths ? String(result.durationMonths) : '');
      setReviewSelectedServerId(result.selectedServerId || 'auto');
      toast({
        title: salesUi.orderUpdated,
        description: salesUi.orderUpdatedDesc,
      });
    },
    onError: (error) => {
      toast({
        title: salesUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const assignOrderReviewerMutation = trpc.telegramBot.assignOrderReviewer.useMutation({
    onSuccess: async (result) => {
      await utils.telegramBot.listOrders.invalidate();
      setReviewAssignedReviewerId(result.assignedReviewerUserId || 'unassigned');
      toast({
        title: salesUi.reviewerUpdated,
        description: salesUi.reviewerUpdatedDesc,
      });
    },
    onError: (error) => {
      toast({
        title: salesUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updatePlan = (
    planCode: TelegramSalesPlanCode,
    updater: (plan: TelegramSalesPlanForm) => TelegramSalesPlanForm,
  ) => {
    setForm((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) => (plan.code === planCode ? updater(plan) : plan)),
    }));
  };

  const updatePaymentMethod = (
    methodCode: string,
    updater: (method: TelegramSalesPaymentMethodForm) => TelegramSalesPaymentMethodForm,
  ) => {
    setForm((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.map((method) =>
        method.code === methodCode ? updater(method) : method,
      ),
    }));
  };

  const formatAutomaticPricePreview = (plan: TelegramSalesPlanForm) => {
    const trimmedAmount = plan.priceAmount.trim();
    if (!trimmedAmount) {
      return '—';
    }

    const parsedAmount = Number.parseInt(trimmedAmount, 10);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return '—';
    }

    const currency = (plan.priceCurrency || 'MMK').trim().toUpperCase();
    if (currency === 'MMK') {
      return `${new Intl.NumberFormat('en-US').format(parsedAmount)} ${isMyanmar ? 'ကျပ်' : 'Kyat'}`;
    }

    return `${new Intl.NumberFormat('en-US').format(parsedAmount)} ${currency}`;
  };

  const buildSalesConfigPayload = () => {
    return {
      enabled: form.enabled,
      allowRenewals: form.allowRenewals,
      supportLink: form.supportLink.trim(),
      dailySalesDigestEnabled: form.dailySalesDigestEnabled,
      dailySalesDigestHour: form.dailySalesDigestHour,
      dailySalesDigestMinute: form.dailySalesDigestMinute,
      trialCouponEnabled: form.trialCouponEnabled,
      trialCouponPaused: form.trialCouponPaused,
      trialCouponLeadHours: (() => {
        const parsed = Number.parseInt(form.trialCouponLeadHours.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
      })(),
      trialCouponMaxRecipientsPerRun: (() => {
        const parsed = Number.parseInt(form.trialCouponMaxRecipientsPerRun.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 25;
      })(),
      trialCouponCode: form.trialCouponCode.trim() || 'TRIAL500',
      trialCouponDiscountLabel:
        form.trialCouponDiscountLabel.trim() || '500 Kyat off your first paid order',
      trialCouponDiscountAmount: (() => {
        const parsed = Number.parseInt(form.trialCouponDiscountAmount.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
      })(),
      renewalCouponEnabled: form.renewalCouponEnabled,
      renewalCouponPaused: form.renewalCouponPaused,
      renewalCouponLeadDays: (() => {
        const parsed = Number.parseInt(form.renewalCouponLeadDays.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
      })(),
      renewalCouponMaxRecipientsPerRun: (() => {
        const parsed = Number.parseInt(form.renewalCouponMaxRecipientsPerRun.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 20;
      })(),
      renewalCouponCode: form.renewalCouponCode.trim() || 'RENEW500',
      renewalCouponDiscountLabel:
        form.renewalCouponDiscountLabel.trim() || '500 Kyat off your renewal',
      renewalCouponDiscountAmount: (() => {
        const parsed = Number.parseInt(form.renewalCouponDiscountAmount.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
      })(),
      premiumUpsellCouponEnabled: form.premiumUpsellCouponEnabled,
      premiumUpsellCouponPaused: form.premiumUpsellCouponPaused,
      premiumUpsellUsageThresholdPercent: (() => {
        const parsed = Number.parseInt(form.premiumUpsellUsageThresholdPercent.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.max(parsed, 10), 100) : 80;
      })(),
      premiumUpsellCouponMaxRecipientsPerRun: (() => {
        const parsed = Number.parseInt(form.premiumUpsellCouponMaxRecipientsPerRun.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 15;
      })(),
      premiumUpsellCouponCode: form.premiumUpsellCouponCode.trim() || 'PREMIUM1000',
      premiumUpsellCouponDiscountLabel:
        form.premiumUpsellCouponDiscountLabel.trim() || '1,000 Kyat off your premium upgrade',
      premiumUpsellCouponDiscountAmount: (() => {
        const parsed = Number.parseInt(form.premiumUpsellCouponDiscountAmount.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
      })(),
      winbackCouponEnabled: form.winbackCouponEnabled,
      winbackCouponPaused: form.winbackCouponPaused,
      winbackCouponInactivityDays: (() => {
        const parsed = Number.parseInt(form.winbackCouponInactivityDays.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
      })(),
      winbackCouponMaxRecipientsPerRun: (() => {
        const parsed = Number.parseInt(form.winbackCouponMaxRecipientsPerRun.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 20;
      })(),
      winbackCouponCode: form.winbackCouponCode.trim() || 'WELCOME700',
      winbackCouponDiscountLabel:
        form.winbackCouponDiscountLabel.trim() || '700 Kyat off your comeback order',
      winbackCouponDiscountAmount: (() => {
        const parsed = Number.parseInt(form.winbackCouponDiscountAmount.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 700;
      })(),
      promoCampaignCooldownHours: (() => {
        const parsed = Number.parseInt(form.promoCampaignCooldownHours.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 72;
      })(),
      promoExcludeRecentRefundUsers: form.promoExcludeRecentRefundUsers,
      promoExcludeRecentRefundDays: (() => {
        const parsed = Number.parseInt(form.promoExcludeRecentRefundDays.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
      })(),
      promoExcludeSupportHeavyUsers: form.promoExcludeSupportHeavyUsers,
      promoSupportHeavyLookbackDays: (() => {
        const parsed = Number.parseInt(form.promoSupportHeavyLookbackDays.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
      })(),
      promoSupportHeavyThreshold: (() => {
        const parsed = Number.parseInt(form.promoSupportHeavyThreshold.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
      })(),
      paymentReminderHours: (() => {
        const parsed = Number.parseInt(form.paymentReminderHours.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
      })(),
      pendingReviewReminderHours: (() => {
        const parsed = Number.parseInt(form.pendingReviewReminderHours.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
      })(),
      rejectedOrderReminderHours: (() => {
        const parsed = Number.parseInt(form.rejectedOrderReminderHours.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
      })(),
      retryOrderReminderHours: (() => {
        const parsed = Number.parseInt(form.retryOrderReminderHours.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
      })(),
      unpaidOrderExpiryHours: (() => {
        const parsed = Number.parseInt(form.unpaidOrderExpiryHours.trim(), 10);
        const reminderHours = Number.parseInt(form.paymentReminderHours.trim(), 10);
        const safeReminder = Number.isFinite(reminderHours) && reminderHours > 0 ? reminderHours : 3;
        return Number.isFinite(parsed) && parsed > 0 ? Math.max(parsed, safeReminder) : 24;
      })(),
      paymentInstructions: form.paymentInstructions.trim(),
      localizedPaymentInstructions: {
        en: form.localizedPaymentInstructions.en.trim(),
        my: form.localizedPaymentInstructions.my.trim(),
      },
      paymentMethods: form.paymentMethods.map((method) => ({
        code: method.code,
        enabled: method.enabled,
        label: method.label.trim(),
        localizedLabels: {
          en: method.localizedLabels.en.trim(),
          my: method.localizedLabels.my.trim(),
        },
        accountName: method.accountName.trim(),
        accountNumber: method.accountNumber.trim(),
        imageUrl: method.imageUrl.trim(),
        note: method.note.trim(),
        localizedNotes: {
          en: method.localizedNotes.en.trim(),
          my: method.localizedNotes.my.trim(),
        },
      })),
      plans: form.plans.map((plan) => ({
        code: plan.code,
        enabled: plan.enabled,
        label: plan.label.trim(),
        localizedLabels: {
          en: plan.localizedLabels.en.trim(),
          my: plan.localizedLabels.my.trim(),
        },
        priceAmount: (() => {
          const trimmed = plan.priceAmount.trim();
          if (!trimmed) {
            return null;
          }
          const parsed = Number.parseInt(trimmed, 10);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
        })(),
        priceCurrency: plan.priceCurrency.trim() || 'MMK',
        priceLabel: plan.priceLabel.trim(),
        localizedPriceLabels: {
          en: plan.localizedPriceLabels.en.trim(),
          my: plan.localizedPriceLabels.my.trim(),
        },
        deliveryType: plan.deliveryType,
        templateId: plan.deliveryType === 'ACCESS_KEY' ? plan.templateId || null : null,
        dynamicTemplateId: plan.deliveryType === 'DYNAMIC_KEY' ? plan.dynamicTemplateId || null : null,
        fixedDurationDays: plan.fixedDurationDays ?? null,
        fixedDurationMonths: plan.fixedDurationMonths ?? null,
        minDurationMonths: plan.minDurationMonths ?? null,
        dataLimitGB: plan.dataLimitGB ?? null,
        unlimitedQuota: plan.unlimitedQuota,
      })),
    };
  };

  const handleSaveConfig = () => {
    saveConfigMutation.mutate(buildSalesConfigPayload());
  };

  const handleResetWorkflowConfig = () => {
    if (!savedWorkflowSnapshot) {
      return;
    }

    setForm(JSON.parse(JSON.stringify(savedWorkflowSnapshot)) as TelegramSalesSettingsForm);
  };

  const currentReviewerId = currentUserQuery.data?.id ?? null;
  const allOrders = useMemo(
    () => ((ordersQuery.data || []) as TelegramOrderRow[]),
    [ordersQuery.data],
  );
  const pendingOrders = allOrders.filter((order) => order.status === 'PENDING_REVIEW');
  const matchedOrders = useMemo(() => {
    const filtered = [...allOrders].filter((order) => {
      switch (priorityFilter) {
        case 'UNCLAIMED':
          return order.status === 'PENDING_REVIEW' && !order.assignedReviewerUserId;
        case 'HIGH_RISK':
          return (
            order.status === 'PENDING_REVIEW' &&
            (order.riskLevel === 'HIGH' || order.riskLevel === 'CRITICAL')
          );
        case 'PREMIUM':
          return order.status === 'PENDING_REVIEW' && order.deliveryType === 'DYNAMIC_KEY';
        case 'MY_QUEUE':
          return (
            order.status === 'PENDING_REVIEW' &&
            Boolean(currentReviewerId && order.assignedReviewerUserId === currentReviewerId)
          );
        case 'OLDEST':
        case 'ALL':
        default:
          return true;
      }
    });

    return filtered.sort((left, right) => {
      if (priorityFilter === 'OLDEST') {
        const leftTime = new Date(left.paymentSubmittedAt || left.createdAt).getTime();
        const rightTime = new Date(right.paymentSubmittedAt || right.createdAt).getTime();
        return leftTime - rightTime;
      }

      const pendingDelta =
        Number(right.status === 'PENDING_REVIEW') - Number(left.status === 'PENDING_REVIEW');
      if (pendingDelta !== 0) {
        return pendingDelta;
      }

      const mineDelta =
        Number(Boolean(currentReviewerId && right.assignedReviewerUserId === currentReviewerId)) -
        Number(Boolean(currentReviewerId && left.assignedReviewerUserId === currentReviewerId));
      if (mineDelta !== 0) {
        return mineDelta;
      }

      const unclaimedDelta =
        Number(!right.assignedReviewerUserId) - Number(!left.assignedReviewerUserId);
      if (unclaimedDelta !== 0) {
        return unclaimedDelta;
      }

      const riskDelta = (right.riskScore || 0) - (left.riskScore || 0);
      if (riskDelta !== 0) {
        return riskDelta;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [allOrders, currentReviewerId, priorityFilter]);
  const selectedOrder = reviewTarget
    ? matchedOrders.find((order) => order.id === reviewTarget.orderId) || null
    : null;
  const selectedOrderId = selectedOrder?.id ?? null;
  const selectedOrderRejectionReasonCode = selectedOrder?.rejectionReasonCode ?? null;
  const selectedOrderPlanCode = (
    selectedOrder?.planCode as TelegramSalesPlanCode | null
  ) ?? null;
  const selectedOrderDurationMonths = selectedOrder?.durationMonths ?? null;
  const selectedOrderSelectedServerId = selectedOrder?.selectedServerId ?? null;
  const selectedOrderProofUrl = selectedOrder
    ? withBasePath(`/api/telegram/orders/${selectedOrder.id}/proof`)
    : '';
  const selectedOrderProofDownloadUrl = selectedOrder
    ? withBasePath(`/api/telegram/orders/${selectedOrder.id}/proof?download=1`)
    : '';
  const selectedOrderProofIsImage = selectedOrder?.paymentProofType === 'photo';
  const selectedPremiumSupportRequest = premiumReviewTarget
    ? ((premiumSupportRequestsQuery.data || []) as TelegramPremiumSupportRequestRow[]).find(
        (request) => request.id === premiumReviewTarget.requestId,
      ) || null
    : null;
  const selectedPlan = reviewPlanCode
    ? form.plans.find((plan) => plan.code === reviewPlanCode) || null
    : null;
  const summaryCounts = matchedOrders.reduce(
    (acc, order) => {
      if (order.status === 'PENDING_REVIEW') acc.pending += 1;
      if (order.status === 'FULFILLED') acc.fulfilled += 1;
      if (order.status === 'REJECTED') acc.rejected += 1;
      if (order.kind === 'NEW') acc.newOrders += 1;
      if (order.kind === 'RENEW') acc.renewals += 1;
      return acc;
    },
    { pending: 0, fulfilled: 0, rejected: 0, newOrders: 0, renewals: 0 },
  );
  const queueMetrics = useMemo(
    () => ({
      pending: pendingOrders.length,
      unclaimed: pendingOrders.filter((order) => !order.assignedReviewerUserId).length,
      myClaimed: pendingOrders.filter(
        (order) => Boolean(currentReviewerId && order.assignedReviewerUserId === currentReviewerId),
      ).length,
      claimedByOthers: pendingOrders.filter(
        (order) => Boolean(order.assignedReviewerUserId && order.assignedReviewerUserId !== currentReviewerId),
      ).length,
      highRisk: pendingOrders.filter(
        (order) => order.riskLevel === 'HIGH' || order.riskLevel === 'CRITICAL',
      ).length,
      premium: pendingOrders.filter((order) => order.deliveryType === 'DYNAMIC_KEY').length,
    }),
    [pendingOrders, currentReviewerId],
  );
  const reviewerWorkload = useMemo(() => {
    const workload = new Map<string, { label: string; count: number; mine: boolean }>();
    for (const order of pendingOrders) {
      if (!order.assignedReviewerEmail) {
        continue;
      }
      const key = order.assignedReviewerUserId || order.assignedReviewerEmail;
      const current = workload.get(key) || {
        label: order.assignedReviewerEmail,
        count: 0,
        mine: Boolean(currentReviewerId && order.assignedReviewerUserId === currentReviewerId),
      };
      current.count += 1;
      current.mine = Boolean(currentReviewerId && order.assignedReviewerUserId === currentReviewerId);
      workload.set(key, current);
    }
    return Array.from(workload.values()).sort((left, right) => {
      if (Number(right.mine) !== Number(left.mine)) {
        return Number(right.mine) - Number(left.mine);
      }
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.label.localeCompare(right.label);
    });
  }, [pendingOrders, currentReviewerId]);
  const describeQuota = (order: TelegramOrderRow) => {
    if (order.unlimitedQuota) {
      return isMyanmar ? 'Unlimited quota' : 'Unlimited quota';
    }
    if (!order.dataLimitBytes) {
      return '—';
    }
    return formatBytes(BigInt(order.dataLimitBytes));
  };

  const formatOrderRiskLevelLabel = (level: TelegramOrderRow['riskLevel']) => {
    switch (level) {
      case 'CRITICAL':
        return salesUi.riskCritical;
      case 'HIGH':
        return salesUi.riskHigh;
      case 'MEDIUM':
        return salesUi.riskMedium;
      default:
        return salesUi.riskLow;
    }
  };

  const formatOrderRiskReasonLabel = (reason: TelegramOrderRow['riskReasons'][number]) => {
    switch (reason) {
      case 'duplicate_proof':
        return salesUi.riskReasonDuplicateProof;
      case 'repeated_rejections':
        return salesUi.riskReasonRepeatedRejections;
      case 'payment_history_mismatch':
        return salesUi.riskReasonPaymentMismatch;
      case 'retry_pattern':
        return salesUi.riskReasonRetryPattern;
      case 'multiple_open_orders':
        return salesUi.riskReasonMultipleOpenOrders;
      case 'resubmitted_proof':
        return salesUi.riskReasonResubmittedProof;
      default:
        return reason;
    }
  };

  const getOrderRiskBadgeClass = (level: TelegramOrderRow['riskLevel']) => {
    switch (level) {
      case 'CRITICAL':
        return 'border-red-500/40 bg-red-500/10 text-red-200';
      case 'HIGH':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
      case 'MEDIUM':
        return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200';
      default:
        return 'border-slate-500/40 bg-slate-500/10 text-slate-200';
    }
  };

  const isOrderClaimedByCurrentUser = (order: TelegramOrderRow) =>
    Boolean(order.assignedReviewerUserId && currentReviewerId && order.assignedReviewerUserId === currentReviewerId);

  const isOrderClaimedByOtherUser = (order: TelegramOrderRow) =>
    Boolean(order.assignedReviewerUserId && (!currentReviewerId || order.assignedReviewerUserId !== currentReviewerId));

  const handleClaimOrder = (orderId: string, claimed: boolean) => {
    claimOrderMutation.mutate({ orderId, claimed });
  };

  const handleAssignOrderReviewer = (orderId: string, reviewerUserId: string | null) => {
    assignOrderReviewerMutation.mutate({
      orderId,
      reviewerUserId,
    });
  };

  const handleApplyOrderMacro = (
    orderId: string,
    macro:
      | 'APPROVE_QUICK'
      | 'REJECT_DUPLICATE'
      | 'REJECT_BLURRY'
      | 'REJECT_WRONG_AMOUNT'
      | 'REJECT_WRONG_METHOD',
  ) => {
    applyOrderMacroMutation.mutate({ orderId, macro });
  };

  useEffect(() => {
    if (!selectedOrderId) {
      setReviewReasonCode('custom');
      setReviewPlanCode('');
      setReviewDurationMonths('');
      setReviewSelectedServerId('auto');
      setReviewAssignedReviewerId('unassigned');
      return;
    }

    setReviewReasonCode(
      selectedOrderRejectionReasonCode || (selectedOrder?.duplicateProofOrderCode ? 'duplicate_payment' : 'custom'),
    );
    setReviewPlanCode(selectedOrderPlanCode || '');
    setReviewDurationMonths(selectedOrderDurationMonths ? String(selectedOrderDurationMonths) : '');
    setReviewSelectedServerId(selectedOrderSelectedServerId || 'auto');
    setReviewAssignedReviewerId(selectedOrder?.assignedReviewerUserId || 'unassigned');
  }, [
    selectedOrderId,
    selectedOrderRejectionReasonCode,
    selectedOrderPlanCode,
    selectedOrderDurationMonths,
    selectedOrderSelectedServerId,
    selectedOrder?.assignedReviewerUserId,
    selectedOrder?.duplicateProofOrderCode,
    reviewTarget?.mode,
  ]);

  const workflowConfigWorkspace =
    activeWorkflowTab === 'settings' ||
    activeWorkflowTab === 'coupons' ||
    activeWorkflowTab === 'guardrails';
  const campaignSimulation = simulateCampaignAudienceMutation.data;
  const campaignTypeLabels: Record<string, string> = {
    TRIAL_TO_PAID: isMyanmar ? 'Trial to paid' : 'Trial to paid',
    RENEWAL_SOON: isMyanmar ? 'Renewal' : 'Renewal',
    PREMIUM_UPSELL: isMyanmar ? 'Premium upsell' : 'Premium upsell',
    WINBACK: isMyanmar ? 'Win-back' : 'Win-back',
  };
  const campaignReasonLabels: Record<string, string> = {
    DISABLED: isMyanmar ? 'Campaign disabled' : 'Campaign disabled',
    PAUSED: isMyanmar ? 'Campaign paused' : 'Campaign paused',
    NO_TELEGRAM: isMyanmar ? 'No Telegram link' : 'No Telegram link',
    MANUAL_BLOCK: isMyanmar ? 'Manually suppressed' : 'Manually suppressed',
    RECENT_REFUND: isMyanmar ? 'Recent refund' : 'Recent refund',
    SUPPORT_HEAVY: isMyanmar ? 'Support-heavy' : 'Support-heavy',
    COOLDOWN: isMyanmar ? 'Cooling down' : 'Cooling down',
    ACTIVE_COUPON: isMyanmar ? 'Already has active coupon' : 'Already has active coupon',
    LIMIT_REACHED: isMyanmar ? 'Per-user limit reached' : 'Per-user limit reached',
    CONVERTED: isMyanmar ? 'Already converted' : 'Already converted',
  };

  return (
    <>
      <Card className="border-violet-500/20 bg-violet-500/[0.04] dark:bg-violet-500/[0.06]">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-violet-500" />
            {salesUi.title}
          </CardTitle>
          <CardDescription>{salesUi.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs
            value={activeWorkflowTab}
            onValueChange={(value) => {
              const nextTab = value as WorkflowSubtabId;
              setActiveWorkflowTab(nextTab);
              updateWorkflowUrlState({
                workspace: 'workflow',
                workflowTab: nextTab,
                orderCode: nextTab === 'review' ? orderCodeParam || null : null,
              });
            }}
            className="space-y-6"
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-[1.35rem] border border-border/60 bg-background/50 p-2 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(4,11,24,0.82),rgba(5,12,24,0.74))] lg:grid-cols-5">
              <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="settings">Order settings</TabsTrigger>
              <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="coupons">Coupons</TabsTrigger>
              <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="guardrails">Guardrails</TabsTrigger>
              <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="review">Review queue</TabsTrigger>
              <TabsTrigger className="dark:text-slate-300 dark:data-[state=active]:bg-[linear-gradient(180deg,rgba(7,32,48,0.96),rgba(7,63,88,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_12px_24px_rgba(6,182,212,0.14)]" value="premium">Premium support</TabsTrigger>
            </TabsList>

            <div className="sticky top-20 z-20 rounded-2xl border border-border/60 bg-background/85 px-4 py-3 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {workflowConfigWorkspace
                      ? workflowConfigDirty
                        ? 'Unsaved Telegram workflow changes'
                        : 'Workflow settings are in sync'
                      : activeWorkflowTab === 'review'
                        ? 'Review workspace'
                        : 'Premium support workspace'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {workflowConfigWorkspace
                      ? workflowConfigDirty
                        ? 'Save or reset before leaving this workspace.'
                        : 'Coupons, payment rules, and order settings match the latest saved configuration.'
                      : activeWorkflowTab === 'review'
                        ? 'Queue, reviewer actions, and server-change requests are isolated below.'
                        : 'Premium support requests and follow-up actions are isolated below.'}
                  </p>
                </div>
                {workflowConfigWorkspace ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!workflowConfigDirty || saveConfigMutation.isPending}
                      onClick={handleResetWorkflowConfig}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveConfig}
                      disabled={!canManageSalesSettings || saveConfigMutation.isPending || !workflowConfigDirty}
                    >
                      {saveConfigMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {salesUi.saveConfig}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            {!workflowConfigWorkspace ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-5 text-sm text-muted-foreground">
                {activeWorkflowTab === 'review'
                  ? 'Use the review workspace below for Telegram payment review, quick macros, and server-change approvals.'
                  : 'Use the premium workspace below for premium support requests, replies, and routing actions.'}
              </div>
            ) : null}

          <div className={cn('grid gap-4 md:grid-cols-2', activeWorkflowTab !== 'settings' && 'hidden')}>
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{salesUi.enableOrders}</p>
                <p className="text-xs text-muted-foreground">{salesUi.markForReview}</p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{salesUi.allowRenewals}</p>
                <p className="text-xs text-muted-foreground">
                  {isMyanmar ? 'ရှိပြီးသော key များကို Telegram မှ renewal အော်ဒါတင်နိုင်ပါသည်။' : 'Allow Telegram users to place renewal orders for existing keys.'}
                </p>
              </div>
              <Switch
                checked={form.allowRenewals}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, allowRenewals: checked }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{salesUi.supportLink}</Label>
            <Input
              value={form.supportLink}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  supportLink: event.target.value,
                }))
              }
              placeholder="https://t.me/your_support"
            />
            <p className="text-xs text-muted-foreground">{salesUi.supportLinkDesc}</p>
          </div>

          <div className={cn('space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4', activeWorkflowTab !== 'settings' && 'hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{salesUi.salesDigest}</p>
                <p className="text-xs text-muted-foreground">{salesUi.salesDigestDesc}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.dailySalesDigestEnabled}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, dailySalesDigestEnabled: checked }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => runSalesDigestMutation.mutate()}
                  disabled={!canManageSalesSettings || runSalesDigestMutation.isPending}
                >
                  {runSalesDigestMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {salesUi.sendSalesDigestNow}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{salesUi.salesDigestHour}</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={String(form.dailySalesDigestHour)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      dailySalesDigestHour: Math.min(23, Math.max(0, Number(event.target.value) || 0)),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{salesUi.salesDigestMinute}</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={String(form.dailySalesDigestMinute)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      dailySalesDigestMinute: Math.min(59, Math.max(0, Number(event.target.value) || 0)),
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className={cn('space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4', activeWorkflowTab !== 'settings' && 'hidden')}>
            <div className="space-y-1">
              <p className="text-sm font-medium">{salesUi.paymentAutomation}</p>
              <p className="text-xs text-muted-foreground">{salesUi.paymentAutomationDesc}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label>{salesUi.paymentReminderHours}</Label>
                <Input
                  inputMode="numeric"
                  value={form.paymentReminderHours}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      paymentReminderHours: event.target.value,
                    }))
                  }
                  placeholder="3"
                />
              </div>
              <div className="space-y-2">
                <Label>{salesUi.pendingReviewReminderHours}</Label>
                <Input
                  inputMode="numeric"
                  value={form.pendingReviewReminderHours}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      pendingReviewReminderHours: event.target.value,
                    }))
                  }
                  placeholder="6"
                />
              </div>
              <div className="space-y-2">
                <Label>{salesUi.rejectedOrderReminderHours}</Label>
                <Input
                  inputMode="numeric"
                  value={form.rejectedOrderReminderHours}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      rejectedOrderReminderHours: event.target.value,
                    }))
                  }
                  placeholder="12"
                />
              </div>
              <div className="space-y-2">
                <Label>{salesUi.retryOrderReminderHours}</Label>
                <Input
                  inputMode="numeric"
                  value={form.retryOrderReminderHours}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      retryOrderReminderHours: event.target.value,
                    }))
                  }
                  placeholder="8"
                />
              </div>
              <div className="space-y-2">
                <Label>{salesUi.unpaidOrderExpiryHours}</Label>
                <Input
                  inputMode="numeric"
                  value={form.unpaidOrderExpiryHours}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      unpaidOrderExpiryHours: event.target.value,
                    }))
                  }
                  placeholder="24"
                />
              </div>
            </div>
          </div>

          <div className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-4', activeWorkflowTab !== 'coupons' && 'hidden')}>
            {[
              {
                key: 'trial',
                title: 'Trial-to-paid',
                enabled: form.trialCouponEnabled,
                paused: form.trialCouponPaused,
                onToggle: () =>
                  setForm((prev) => ({
                    ...prev,
                    trialCouponPaused: !prev.trialCouponPaused,
                  })),
              },
              {
                key: 'renewal',
                title: 'Renewal',
                enabled: form.renewalCouponEnabled,
                paused: form.renewalCouponPaused,
                onToggle: () =>
                  setForm((prev) => ({
                    ...prev,
                    renewalCouponPaused: !prev.renewalCouponPaused,
                  })),
              },
              {
                key: 'premium',
                title: 'Premium upsell',
                enabled: form.premiumUpsellCouponEnabled,
                paused: form.premiumUpsellCouponPaused,
                onToggle: () =>
                  setForm((prev) => ({
                    ...prev,
                    premiumUpsellCouponPaused: !prev.premiumUpsellCouponPaused,
                  })),
              },
              {
                key: 'winback',
                title: 'Win-back',
                enabled: form.winbackCouponEnabled,
                paused: form.winbackCouponPaused,
                onToggle: () =>
                  setForm((prev) => ({
                    ...prev,
                    winbackCouponPaused: !prev.winbackCouponPaused,
                  })),
              },
            ].map((campaign) => (
              <div
                key={campaign.key}
                className="rounded-2xl border border-border/60 bg-background/55 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{campaign.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {campaign.enabled ? (campaign.paused ? 'Enabled but paused' : 'Enabled and running') : 'Disabled'}
                    </p>
                  </div>
                  <Badge variant={campaign.enabled ? 'default' : 'secondary'}>
                    {campaign.enabled ? (campaign.paused ? 'Paused' : 'Running') : 'Disabled'}
                  </Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={campaign.onToggle}
                  disabled={!campaign.enabled}
                >
                  {campaign.paused ? 'Resume campaign' : 'Pause campaign'}
                </Button>
              </div>
            ))}
          </div>

          <div className={cn('space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4', activeWorkflowTab !== 'coupons' && 'hidden')}>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {isMyanmar ? 'Trial-to-paid coupon campaign' : 'Trial-to-paid coupon campaign'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isMyanmar
                    ? 'Trial သက်တမ်းကုန်ရန်နီးသော user များထံ automatic coupon notice ပို့မည်။'
                    : 'Automatically send a coupon-style upsell message to trial users who are close to expiry.'}
                </p>
              </div>
              <Switch
                checked={form.trialCouponEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, trialCouponEnabled: checked }))
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={form.trialCouponEnabled ? 'default' : 'secondary'}>
                {form.trialCouponEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge variant={form.trialCouponPaused ? 'outline' : 'secondary'}>
                {form.trialCouponPaused ? 'Paused' : 'Running'}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((prev) => ({ ...prev, trialCouponPaused: !prev.trialCouponPaused }))
                }
                disabled={!form.trialCouponEnabled}
              >
                {form.trialCouponPaused ? 'Resume campaign' : 'Pause campaign'}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Send before expiry (hours)' : 'Send before expiry (hours)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.trialCouponLeadHours}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      trialCouponLeadHours: event.target.value,
                    }))
                  }
                  placeholder="12"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Coupon code' : 'Coupon code'}</Label>
                <Input
                  value={form.trialCouponCode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      trialCouponCode: event.target.value,
                    }))
                  }
                  placeholder="TRIAL500"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Offer label' : 'Offer label'}</Label>
                <Input
                  value={form.trialCouponDiscountLabel}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      trialCouponDiscountLabel: event.target.value,
                    }))
                  }
                  placeholder="500 Kyat off your first paid order"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Discount amount (Kyat)' : 'Discount amount (Kyat)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.trialCouponDiscountAmount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      trialCouponDiscountAmount: event.target.value,
                    }))
                  }
                  placeholder="500"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Max sends per run' : 'Max sends per run'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.trialCouponMaxRecipientsPerRun}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      trialCouponMaxRecipientsPerRun: event.target.value,
                    }))
                  }
                  placeholder="25"
                />
              </div>
            </div>
          </div>

          <div className={cn('space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4', activeWorkflowTab !== 'coupons' && 'hidden')}>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {isMyanmar ? 'Renewal coupon campaign' : 'Renewal coupon campaign'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isMyanmar
                    ? 'သက်တမ်းကုန်ရန်နီးသော user များထံ renewal coupon ကို automatic ပို့မည်။'
                    : 'Automatically send renewal coupons to users whose keys are close to expiry.'}
                </p>
              </div>
              <Switch
                checked={form.renewalCouponEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, renewalCouponEnabled: checked }))
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={form.renewalCouponEnabled ? 'default' : 'secondary'}>
                {form.renewalCouponEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge variant={form.renewalCouponPaused ? 'outline' : 'secondary'}>
                {form.renewalCouponPaused ? 'Paused' : 'Running'}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((prev) => ({ ...prev, renewalCouponPaused: !prev.renewalCouponPaused }))
                }
                disabled={!form.renewalCouponEnabled}
              >
                {form.renewalCouponPaused ? 'Resume campaign' : 'Pause campaign'}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Lead time (days)' : 'Lead time (days)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.renewalCouponLeadDays}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      renewalCouponLeadDays: event.target.value,
                    }))
                  }
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Coupon code' : 'Coupon code'}</Label>
                <Input
                  value={form.renewalCouponCode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      renewalCouponCode: event.target.value,
                    }))
                  }
                  placeholder="RENEW500"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Offer label' : 'Offer label'}</Label>
                <Input
                  value={form.renewalCouponDiscountLabel}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      renewalCouponDiscountLabel: event.target.value,
                    }))
                  }
                  placeholder="500 Kyat off your renewal"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Discount amount (Kyat)' : 'Discount amount (Kyat)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.renewalCouponDiscountAmount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      renewalCouponDiscountAmount: event.target.value,
                    }))
                  }
                  placeholder="500"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Max sends per run' : 'Max sends per run'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.renewalCouponMaxRecipientsPerRun}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      renewalCouponMaxRecipientsPerRun: event.target.value,
                    }))
                  }
                  placeholder="20"
                />
              </div>
            </div>
          </div>

          <div className={cn('space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4', activeWorkflowTab !== 'coupons' && 'hidden')}>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {isMyanmar ? 'Premium upsell coupon campaign' : 'Premium upsell coupon campaign'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isMyanmar
                    ? 'Usage မြင့်လာသော standard user များထံ premium upgrade coupon ကို automatic ပို့မည်။'
                    : 'Automatically send premium upgrade coupons to standard users with high usage.'}
                </p>
              </div>
              <Switch
                checked={form.premiumUpsellCouponEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, premiumUpsellCouponEnabled: checked }))
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={form.premiumUpsellCouponEnabled ? 'default' : 'secondary'}>
                {form.premiumUpsellCouponEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge variant={form.premiumUpsellCouponPaused ? 'outline' : 'secondary'}>
                {form.premiumUpsellCouponPaused ? 'Paused' : 'Running'}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    premiumUpsellCouponPaused: !prev.premiumUpsellCouponPaused,
                  }))
                }
                disabled={!form.premiumUpsellCouponEnabled}
              >
                {form.premiumUpsellCouponPaused ? 'Resume campaign' : 'Pause campaign'}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Usage threshold (%)' : 'Usage threshold (%)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.premiumUpsellUsageThresholdPercent}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      premiumUpsellUsageThresholdPercent: event.target.value,
                    }))
                  }
                  placeholder="80"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Coupon code' : 'Coupon code'}</Label>
                <Input
                  value={form.premiumUpsellCouponCode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      premiumUpsellCouponCode: event.target.value,
                    }))
                  }
                  placeholder="PREMIUM1000"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Offer label' : 'Offer label'}</Label>
                <Input
                  value={form.premiumUpsellCouponDiscountLabel}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      premiumUpsellCouponDiscountLabel: event.target.value,
                    }))
                  }
                  placeholder="1,000 Kyat off your premium upgrade"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Discount amount (Kyat)' : 'Discount amount (Kyat)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.premiumUpsellCouponDiscountAmount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      premiumUpsellCouponDiscountAmount: event.target.value,
                    }))
                  }
                  placeholder="1000"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Max sends per run' : 'Max sends per run'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.premiumUpsellCouponMaxRecipientsPerRun}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      premiumUpsellCouponMaxRecipientsPerRun: event.target.value,
                    }))
                  }
                  placeholder="15"
                />
              </div>
            </div>
          </div>

          <div className={cn('space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4', activeWorkflowTab !== 'coupons' && 'hidden')}>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {isMyanmar ? 'Win-back coupon campaign' : 'Win-back coupon campaign'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isMyanmar
                    ? 'အချိန်တစ်ခုကြာ inactive ဖြစ်နေသော user များထံ comeback coupon ကို automatic ပို့မည်။'
                    : 'Automatically send comeback coupons to inactive past buyers.'}
                </p>
              </div>
              <Switch
                checked={form.winbackCouponEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, winbackCouponEnabled: checked }))
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={form.winbackCouponEnabled ? 'default' : 'secondary'}>
                {form.winbackCouponEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge variant={form.winbackCouponPaused ? 'outline' : 'secondary'}>
                {form.winbackCouponPaused ? 'Paused' : 'Running'}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((prev) => ({ ...prev, winbackCouponPaused: !prev.winbackCouponPaused }))
                }
                disabled={!form.winbackCouponEnabled}
              >
                {form.winbackCouponPaused ? 'Resume campaign' : 'Pause campaign'}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Inactive after (days)' : 'Inactive after (days)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.winbackCouponInactivityDays}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      winbackCouponInactivityDays: event.target.value,
                    }))
                  }
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Coupon code' : 'Coupon code'}</Label>
                <Input
                  value={form.winbackCouponCode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      winbackCouponCode: event.target.value,
                    }))
                  }
                  placeholder="WELCOME700"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Offer label' : 'Offer label'}</Label>
                <Input
                  value={form.winbackCouponDiscountLabel}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      winbackCouponDiscountLabel: event.target.value,
                    }))
                  }
                  placeholder="700 Kyat off your comeback order"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Discount amount (Kyat)' : 'Discount amount (Kyat)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.winbackCouponDiscountAmount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      winbackCouponDiscountAmount: event.target.value,
                    }))
                  }
                  placeholder="700"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Max sends per run' : 'Max sends per run'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.winbackCouponMaxRecipientsPerRun}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      winbackCouponMaxRecipientsPerRun: event.target.value,
                    }))
                  }
                  placeholder="20"
                />
              </div>
            </div>
          </div>

          <div className={cn('space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4', activeWorkflowTab !== 'guardrails' && 'hidden')}>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isMyanmar ? 'Campaign guardrails' : 'Campaign guardrails'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isMyanmar
                  ? 'Promo များကို အရမ်းများများမပို့မိစေရန် cool-down, refund, support volume rules များကို သတ်မှတ်ပါ။'
                  : 'Set cool-down, refund, and support-volume rules so the same customer does not receive too many promos.'}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Promo cool-down (hours)' : 'Promo cool-down (hours)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.promoCampaignCooldownHours}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      promoCampaignCooldownHours: event.target.value,
                    }))
                  }
                  placeholder="72"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Recent refund lookback (days)' : 'Recent refund lookback (days)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.promoExcludeRecentRefundDays}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      promoExcludeRecentRefundDays: event.target.value,
                    }))
                  }
                  placeholder="30"
                  disabled={!form.promoExcludeRecentRefundUsers}
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Support lookback (days)' : 'Support lookback (days)'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.promoSupportHeavyLookbackDays}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      promoSupportHeavyLookbackDays: event.target.value,
                    }))
                  }
                  placeholder="14"
                  disabled={!form.promoExcludeSupportHeavyUsers}
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Support-heavy threshold' : 'Support-heavy threshold'}</Label>
                <Input
                  inputMode="numeric"
                  value={form.promoSupportHeavyThreshold}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      promoSupportHeavyThreshold: event.target.value,
                    }))
                  }
                  placeholder="3"
                  disabled={!form.promoExcludeSupportHeavyUsers}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Exclude recent refund users</p>
                  <p className="text-xs text-muted-foreground">Skip promo sends after recent refund activity.</p>
                </div>
                <Switch
                  checked={form.promoExcludeRecentRefundUsers}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, promoExcludeRecentRefundUsers: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Exclude support-heavy users</p>
                  <p className="text-xs text-muted-foreground">Skip promo sends for customers with recent support volume.</p>
                </div>
                <Switch
                  checked={form.promoExcludeSupportHeavyUsers}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, promoExcludeSupportHeavyUsers: checked }))
                  }
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              'space-y-4 rounded-2xl border border-border/60 bg-background/55 p-4',
              activeWorkflowTab !== 'guardrails' && 'hidden',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Campaign audience simulation</p>
                <p className="text-xs text-muted-foreground">
                  Preview who would receive each coupon campaign right now, then inspect why others are blocked.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => simulateCampaignAudienceMutation.mutate(buildSalesConfigPayload())}
                disabled={!canManageSalesSettings || simulateCampaignAudienceMutation.isPending}
              >
                {simulateCampaignAudienceMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Run simulation
              </Button>
            </div>

            {campaignSimulation ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {campaignSimulation.campaigns.map((campaign) => (
                  <div
                    key={campaign.campaignType}
                    className="rounded-2xl border border-border/60 bg-background/65 p-4 dark:bg-white/[0.02]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {campaignTypeLabels[campaign.campaignType] || campaign.campaignType}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {campaign.enabled
                            ? campaign.paused
                              ? 'Enabled but paused'
                              : 'Enabled and ready'
                            : 'Disabled'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={campaign.enabled ? 'default' : 'secondary'}>
                          {campaign.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <Badge variant={campaign.paused ? 'outline' : 'secondary'}>
                          {campaign.paused ? 'Paused' : 'Running'}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-border/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Candidates</p>
                        <p className="mt-2 text-xl font-semibold">{campaign.totalCandidates}</p>
                      </div>
                      <div className="rounded-xl border border-border/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Eligible</p>
                        <p className="mt-2 text-xl font-semibold">{campaign.eligibleCount}</p>
                      </div>
                      <div className="rounded-xl border border-border/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Would send</p>
                        <p className="mt-2 text-xl font-semibold">{campaign.wouldSendCount}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Cap {campaign.maxRecipientsPerRun > 0 ? campaign.maxRecipientsPerRun : 'No cap'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Blocked</p>
                        <p className="mt-2 text-xl font-semibold">{campaign.blockedCount}</p>
                      </div>
                    </div>

                    {campaign.blockedReasons.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Blocked by reason</p>
                        <div className="flex flex-wrap gap-2">
                          {campaign.blockedReasons.map((reason) => (
                            <Badge key={`${campaign.campaignType}-${reason.reason}`} variant="outline">
                              {campaignReasonLabels[reason.reason] || reason.reason} · {reason.count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-5 text-sm text-muted-foreground">
                Run the simulation to preview caps, cooldowns, refund blocks, and support-heavy exclusions before the next promo cycle.
              </div>
            )}
          </div>

          <Collapsible
            open={workflowAdvancedOpen}
            onOpenChange={setWorkflowAdvancedOpen}
            className={cn('space-y-4', activeWorkflowTab !== 'settings' && 'hidden')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/55 p-4">
              <div>
                <p className="text-sm font-medium">Advanced order configuration</p>
                <p className="text-xs text-muted-foreground">
                  Payment instructions, payment methods, and plan/template mapping live here so the base workflow stays lighter.
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  {workflowAdvancedOpen ? 'Hide advanced' : 'Show advanced'}
                  <ChevronRight
                    className={cn('ml-2 h-4 w-4 transition-transform', workflowAdvancedOpen && 'rotate-90')}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>{salesUi.englishInstructions}</Label>
              <Textarea
                value={form.localizedPaymentInstructions.en}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    paymentInstructions: event.target.value,
                    localizedPaymentInstructions: {
                      ...prev.localizedPaymentInstructions,
                      en: event.target.value,
                    },
                  }))
                }
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label>{salesUi.burmeseInstructions}</Label>
              <Textarea
                value={form.localizedPaymentInstructions.my}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    localizedPaymentInstructions: {
                      ...prev.localizedPaymentInstructions,
                      my: event.target.value,
                    },
                  }))
                }
                rows={5}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{salesUi.paymentMethodsTitle}</p>
              <p className="text-xs text-muted-foreground">{salesUi.paymentMethodsDesc}</p>
            </div>
            <div className="space-y-3">
              {form.paymentMethods.map((method) => (
                <div key={method.code} className="rounded-2xl border border-border/60 bg-background/55 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{method.label}</p>
                      <p className="text-xs text-muted-foreground">{method.code}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={method.enabled ? 'default' : 'secondary'}>
                        {method.enabled ? salesUi.enabled : salesUi.disabled}
                      </Badge>
                      <Switch
                        checked={method.enabled}
                        onCheckedChange={(checked) =>
                          updatePaymentMethod(method.code, (current) => ({
                            ...current,
                            enabled: checked,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{salesUi.paymentMethodLabel}</Label>
                      <Input
                        value={method.label}
                        onChange={(event) =>
                          updatePaymentMethod(method.code, (current) => ({
                            ...current,
                            label: event.target.value,
                            localizedLabels: {
                              ...current.localizedLabels,
                              en: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.burmeseLabel}</Label>
                      <Input
                        value={method.localizedLabels.my}
                        onChange={(event) =>
                          updatePaymentMethod(method.code, (current) => ({
                            ...current,
                            localizedLabels: {
                              ...current.localizedLabels,
                              my: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.accountName}</Label>
                      <Input
                        value={method.accountName}
                        onChange={(event) =>
                          updatePaymentMethod(method.code, (current) => ({
                            ...current,
                            accountName: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.accountNumber}</Label>
                      <Input
                        value={method.accountNumber}
                        onChange={(event) =>
                          updatePaymentMethod(method.code, (current) => ({
                            ...current,
                            accountNumber: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                      <Label>{salesUi.paymentImageUrl}</Label>
                      <Input
                        value={method.imageUrl}
                        onChange={(event) =>
                          updatePaymentMethod(method.code, (current) => ({
                            ...current,
                            imageUrl: event.target.value,
                          }))
                        }
                        placeholder="https://example.com/kpay-qr.png"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.englishMethodInstructions}</Label>
                      <Textarea
                        value={method.note}
                        onChange={(event) =>
                          updatePaymentMethod(method.code, (current) => ({
                            ...current,
                            note: event.target.value,
                            localizedNotes: {
                              ...current.localizedNotes,
                              en: event.target.value,
                            },
                          }))
                        }
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.burmeseMethodInstructions}</Label>
                      <Textarea
                        value={method.localizedNotes.my}
                        onChange={(event) =>
                          updatePaymentMethod(method.code, (current) => ({
                            ...current,
                            localizedNotes: {
                              ...current.localizedNotes,
                              my: event.target.value,
                            },
                          }))
                        }
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{salesUi.planConfig}</p>
              <p className="text-xs text-muted-foreground">
                {isMyanmar ? 'Bot မှ အသုံးပြုမည့် plan, ဈေးနှုန်း, custom label နှင့် template ကို သတ်မှတ်ပါ။' : 'Set the plan labels, prices, custom labels, and templates used by the Telegram bot.'}
              </p>
            </div>
            <div className="space-y-3">
              {form.plans.map((plan) => (
                <div key={plan.code} className="rounded-2xl border border-border/60 bg-background/55 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{plan.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {plan.fixedDurationDays
                          ? `${salesUi.days(plan.fixedDurationDays)} • ${salesUi.dataLimit(plan.dataLimitGB)}`
                          : plan.fixedDurationMonths
                          ? `${salesUi.months(plan.fixedDurationMonths)} • ${salesUi.dataLimit(plan.dataLimitGB)}`
                          : `${salesUi.minMonths(plan.minDurationMonths ?? 3)} • ${salesUi.unlimited}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={plan.enabled ? 'default' : 'secondary'}>
                        {plan.enabled ? salesUi.enabled : salesUi.disabled}
                      </Badge>
                      <Switch
                        checked={plan.enabled}
                        onCheckedChange={(checked) =>
                          updatePlan(plan.code, (current) => ({
                            ...current,
                            enabled: checked,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{salesUi.planLabel}</Label>
                      <Input
                        value={plan.label}
                        onChange={(event) =>
                          updatePlan(plan.code, (current) => ({
                            ...current,
                            label: event.target.value,
                            localizedLabels: {
                              ...current.localizedLabels,
                              en: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.burmeseLabel}</Label>
                      <Input
                        value={plan.localizedLabels.my}
                        onChange={(event) =>
                          updatePlan(plan.code, (current) => ({
                            ...current,
                            localizedLabels: {
                              ...current.localizedLabels,
                              my: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.priceAmount}</Label>
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={plan.priceAmount}
                        onChange={(event) =>
                          updatePlan(plan.code, (current) => ({
                            ...current,
                            priceAmount: event.target.value,
                          }))
                        }
                        placeholder="5000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.priceCurrency}</Label>
                      <Input
                        value={plan.priceCurrency}
                        onChange={(event) =>
                          updatePlan(plan.code, (current) => ({
                            ...current,
                            priceCurrency: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="MMK"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.priceLabel}</Label>
                      <Input
                        value={plan.priceLabel}
                        onChange={(event) =>
                          updatePlan(plan.code, (current) => ({
                            ...current,
                            priceLabel: event.target.value,
                            localizedPriceLabels: {
                              ...current.localizedPriceLabels,
                              en: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.burmesePriceLabel}</Label>
                      <Input
                        value={plan.localizedPriceLabels.my}
                        onChange={(event) =>
                          updatePlan(plan.code, (current) => ({
                            ...current,
                            localizedPriceLabels: {
                              ...current.localizedPriceLabels,
                              my: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{salesUi.autoPricePreview}</Label>
                      <Input
                        readOnly
                        value={formatAutomaticPricePreview(plan)}
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                      <Label>{salesUi.deliveryType}</Label>
                      <Select
                        value={plan.deliveryType}
                        onValueChange={(value: 'ACCESS_KEY' | 'DYNAMIC_KEY') =>
                          updatePlan(plan.code, (current) => ({
                            ...current,
                            deliveryType: value,
                            templateId: value === 'ACCESS_KEY' ? current.templateId : null,
                            dynamicTemplateId: value === 'DYNAMIC_KEY' ? current.dynamicTemplateId : null,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACCESS_KEY">{salesUi.accessKeyDelivery}</SelectItem>
                          <SelectItem value="DYNAMIC_KEY">{salesUi.dynamicKeyDelivery}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                      <Label>{plan.deliveryType === 'DYNAMIC_KEY' ? salesUi.dynamicTemplate : salesUi.template}</Label>
                      {plan.deliveryType === 'DYNAMIC_KEY' ? (
                        <Select
                          value={plan.dynamicTemplateId || 'none'}
                          onValueChange={(value) =>
                            updatePlan(plan.code, (current) => ({
                              ...current,
                              dynamicTemplateId: value === 'none' ? null : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={salesUi.noTemplate} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{salesUi.noTemplate}</SelectItem>
                            {premiumDynamicTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                                {template.preferredCountryCodes.length > 0
                                  ? ` • ${template.preferredCountryCodes.join(', ')}`
                                  : template.preferredServerIds.length > 0
                                    ? ` • ${template.preferredServerIds.length} preferred server${template.preferredServerIds.length === 1 ? '' : 's'}`
                                    : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select
                          value={plan.templateId || 'none'}
                          onValueChange={(value) =>
                            updatePlan(plan.code, (current) => ({
                              ...current,
                              templateId: value === 'none' ? null : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={salesUi.noTemplate} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{salesUi.noTemplate}</SelectItem>
                            {(templatesQuery.data || []).map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {plan.deliveryType === 'DYNAMIC_KEY' ? (
                        <p className="text-xs text-muted-foreground">{salesUi.premiumTemplateOnlyHint}</p>
                      ) : null}
                      {renderTemplateSummary(plan.deliveryType, plan.templateId, plan.dynamicTemplateId, true)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

            </CollapsibleContent>
          </Collapsible>

          <div className={cn('flex justify-end', !workflowConfigWorkspace && 'hidden')}>
            <Button onClick={handleSaveConfig} disabled={!canManageSalesSettings || saveConfigMutation.isPending}>
              {saveConfigMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {salesUi.saveConfig}
            </Button>
          </div>
          </Tabs>
        </CardContent>
      </Card>

      {activeWorkflowTab === 'review' ? (
      <Card className="border-amber-500/20 bg-amber-500/[0.03] dark:bg-amber-500/[0.05]">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            {salesUi.reviewQueue}
          </CardTitle>
          <CardDescription>{salesUi.markForReview}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageTelegramReviews ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {isMyanmar
                ? 'Telegram review action များကို အသုံးပြုရန် Owner, Admin သို့မဟုတ် Support scope လိုအပ်ပါသည်။'
                : 'Owner, Admin, or Support scope is required to manage Telegram review actions.'}
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-[1.4fr,0.8fr,0.8fr]">
            <div className="space-y-2">
              <Label>{salesUi.reviewQueue}</Label>
              <Input
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder={salesUi.searchPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label>{salesUi.status}</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as 'ALL' | 'PENDING_REVIEW' | 'FULFILLED' | 'REJECTED' | 'CANCELLED')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={salesUi.allStatuses} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{salesUi.allStatuses}</SelectItem>
                  <SelectItem value="PENDING_REVIEW">{salesUi.pending}</SelectItem>
                  <SelectItem value="FULFILLED">{salesUi.fulfilled}</SelectItem>
                  <SelectItem value="REJECTED">{salesUi.rejected}</SelectItem>
                  <SelectItem value="CANCELLED">{salesUi.cancelled}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{salesUi.order}</Label>
              <Select
                value={kindFilter}
                onValueChange={(value) => setKindFilter(value as 'ALL' | 'NEW' | 'RENEW')}
              >
                <SelectTrigger>
                  <SelectValue placeholder={salesUi.allTypes} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{salesUi.allTypes}</SelectItem>
                  <SelectItem value="NEW">{salesUi.newOrders}</SelectItem>
                  <SelectItem value="RENEW">{salesUi.renewals}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.pendingTitle}</p>
              <p className="mt-2 text-2xl font-semibold">{summaryCounts.pending}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.newOrders}</p>
              <p className="mt-2 text-2xl font-semibold">{summaryCounts.newOrders}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.renewals}</p>
              <p className="mt-2 text-2xl font-semibold">{summaryCounts.renewals}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.ordersMatched(matchedOrders.length)}</p>
              <p className="mt-2 text-2xl font-semibold">{matchedOrders.length}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.priorityQueue}</p>
              <p className="mt-2 text-2xl font-semibold">{queueMetrics.pending}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.queueUnclaimed}</p>
              <p className="mt-2 text-2xl font-semibold">{queueMetrics.unclaimed}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.myClaimed}</p>
              <p className="mt-2 text-2xl font-semibold">{queueMetrics.myClaimed}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.claimedByOthers}</p>
              <p className="mt-2 text-2xl font-semibold">{queueMetrics.claimedByOthers}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.highRiskPending}</p>
              <p className="mt-2 text-2xl font-semibold">{queueMetrics.highRisk}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{salesUi.queuePremium}</p>
              <p className="mt-2 text-2xl font-semibold">{queueMetrics.premium}</p>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{salesUi.priorityQueue}</Badge>
                {([
                  ['ALL', salesUi.queueAll],
                  ['UNCLAIMED', salesUi.queueUnclaimed],
                  ['HIGH_RISK', salesUi.queueHighRisk],
                  ['PREMIUM', salesUi.queuePremium],
                  ['MY_QUEUE', salesUi.queueMine],
                  ['OLDEST', salesUi.queueOldest],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={priorityFilter === value ? 'default' : 'outline'}
                    onClick={() => setPriorityFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {isMyanmar
                  ? 'Pending review orders များကို unclaimed, high risk, premium နှင့် oldest-first အလိုက် ချက်ချင်း စစ်ဆေးနိုင်ပါသည်။'
                  : 'Review pending orders instantly by unclaimed, high risk, premium, or oldest-first priority.'}
              </p>
            </div>
            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{salesUi.reviewerWorkload}</p>
                <Badge variant="outline">{reviewerWorkload.length}</Badge>
              </div>
              <div className="space-y-2">
                {reviewerWorkload.length > 0 ? (
                  reviewerWorkload.map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.mine ? salesUi.claimedByMe : salesUi.claimedBy}
                        </p>
                      </div>
                      <Badge variant={item.mine ? 'default' : 'secondary'}>{item.count}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{salesUi.noAssignedReviewers}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={pendingOrders.length > 0 ? 'default' : 'secondary'}>
              {salesUi.pendingTitle}: {pendingOrders.length}
            </Badge>
            <Badge variant="outline">
              {isMyanmar ? `စုစုပေါင်း ${matchedOrders.length} ခု` : `Total ${matchedOrders.length} orders`}
            </Badge>
            {ordersQuery.isFetching && !ordersQuery.isLoading ? (
              <Badge variant="outline">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                {isMyanmar ? 'အပ်ဒိတ်လုပ်နေသည်' : 'Updating'}
              </Badge>
            ) : null}
          </div>

          {ordersQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isMyanmar ? 'Telegram orders များကို ရယူနေသည်…' : 'Loading Telegram orders…'}
            </div>
          ) : !matchedOrders.length ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
              {salesUi.noOrders}
            </div>
          ) : (
            <div className="space-y-3">
              {matchedOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-2xl border border-border/60 bg-background/55 p-4"
                  data-testid={`review-order-${order.orderCode}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{order.orderCode}</p>
                        <Badge
                          variant={
                            order.status === 'PENDING_REVIEW'
                              ? 'default'
                              : order.status === 'FULFILLED'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {order.status === 'PENDING_REVIEW'
                            ? salesUi.pending
                            : order.status === 'FULFILLED'
                              ? salesUi.fulfilled
                              : order.status === 'REJECTED'
                                ? salesUi.rejected
                                : order.status === 'CANCELLED'
                                  ? salesUi.cancelled
                                  : order.status}
                        </Badge>
                        <Badge variant="outline">{order.kind}</Badge>
                        <Badge variant="outline">{order.locale === 'my' ? 'မြန်မာ' : 'English'}</Badge>
                        {order.riskScore > 0 ? (
                          <Badge variant="outline" className={cn('font-medium', getOrderRiskBadgeClass(order.riskLevel))}>
                            {salesUi.riskLabel}: {formatOrderRiskLevelLabel(order.riskLevel)} · {order.riskScore}
                          </Badge>
                        ) : null}
                        {order.assignedReviewerEmail ? (
                          <Badge variant="outline">
                            {isOrderClaimedByCurrentUser(order)
                              ? salesUi.claimedByMe
                              : `${salesUi.claimedBy} ${order.assignedReviewerEmail}`}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{salesUi.unassigned}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {salesUi.user}: @{order.telegramUsername || 'unknown'} · {order.telegramUserId}
                      </p>
                    </div>
                    {order.status === 'PENDING_REVIEW' ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {!order.assignedReviewerUserId ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleClaimOrder(order.id, true)}
                              disabled={!canManageTelegramReviews || claimOrderMutation.isPending}
                              data-testid={`review-order-claim-${order.orderCode}`}
                            >
                              <KeyRound className="mr-2 h-4 w-4" />
                              {salesUi.claimOrder}
                            </Button>
                          ) : isOrderClaimedByCurrentUser(order) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleClaimOrder(order.id, false)}
                              disabled={!canManageTelegramReviews || claimOrderMutation.isPending}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              {salesUi.releaseOrder}
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            onClick={() => {
                              setReviewTarget({ orderId: order.id, mode: 'approve' });
                              setReviewNote(order.adminNote || '');
                              setReviewCustomerMessage(order.customerMessage || '');
                              setReviewReasonCode(
                                order.rejectionReasonCode || (order.duplicateProofOrderCode ? 'duplicate_payment' : 'custom'),
                              );
                            }}
                            disabled={!canManageTelegramReviews || isOrderClaimedByOtherUser(order)}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {salesUi.approve}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReviewTarget({ orderId: order.id, mode: 'reject' });
                              setReviewNote(order.adminNote || '');
                              setReviewCustomerMessage(order.customerMessage || '');
                              setReviewReasonCode(
                                order.rejectionReasonCode || (order.duplicateProofOrderCode ? 'duplicate_payment' : 'custom'),
                              );
                            }}
                            disabled={!canManageTelegramReviews || isOrderClaimedByOtherUser(order)}
                          >
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            {salesUi.reject}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleApplyOrderMacro(order.id, 'APPROVE_QUICK')}
                            disabled={!canManageTelegramReviews || applyOrderMacroMutation.isPending || isOrderClaimedByOtherUser(order)}
                            data-testid={`review-order-quick-approve-${order.orderCode}`}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {salesUi.quickApprove}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleApplyOrderMacro(
                                order.id,
                                order.duplicateProofOrderCode ? 'REJECT_DUPLICATE' : 'REJECT_BLURRY',
                              )
                            }
                            disabled={!canManageTelegramReviews || applyOrderMacroMutation.isPending || isOrderClaimedByOtherUser(order)}
                            data-testid={`review-order-reject-primary-${order.orderCode}`}
                          >
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            {order.duplicateProofOrderCode
                              ? salesUi.macroRejectDuplicate
                              : salesUi.macroRejectBlurry}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleApplyOrderMacro(order.id, 'REJECT_WRONG_AMOUNT')}
                            disabled={!canManageTelegramReviews || applyOrderMacroMutation.isPending || isOrderClaimedByOtherUser(order)}
                          >
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            {salesUi.macroRejectAmount}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleApplyOrderMacro(order.id, 'REJECT_WRONG_METHOD')}
                            disabled={!canManageTelegramReviews || applyOrderMacroMutation.isPending || isOrderClaimedByOtherUser(order)}
                          >
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            {salesUi.macroRejectMethod}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {order.duplicateProofOrderCode ? (
                    <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{salesUi.duplicateProofFlag}</p>
                          <p className="text-xs text-muted-foreground">{salesUi.duplicateProofHint}</p>
                          <p className="text-xs text-muted-foreground">
                            {salesUi.duplicateProofOrderLabel}: <span className="font-medium text-foreground">{order.duplicateProofOrderCode}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {order.riskScore > 0 ? (
                    <div className="mt-4 rounded-xl border border-border/50 bg-background/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{salesUi.riskLabel}</p>
                        <Badge variant="outline" className={cn('font-medium', getOrderRiskBadgeClass(order.riskLevel))}>
                          {formatOrderRiskLevelLabel(order.riskLevel)} · {order.riskScore}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {order.riskReasons.map((reason) => (
                          <Badge key={reason} variant="secondary" className="text-[11px]">
                            {formatOrderRiskReasonLabel(reason)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {order.assignedReviewerEmail ? (
                    <div className="mt-4 rounded-xl border border-border/50 bg-background/50 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">{salesUi.reviewerAssignment}</p>
                        <Badge variant="outline">
                          {isOrderClaimedByCurrentUser(order)
                            ? salesUi.claimedByMe
                            : `${salesUi.claimedBy} ${order.assignedReviewerEmail}`}
                        </Badge>
                      </div>
                      {order.assignedAt ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {salesUi.claimedAt}: {formatDateTime(order.assignedAt)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-border/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.order}
                      </p>
                      <p className="mt-2 text-sm font-medium">{order.planName || order.planCode || '—'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[order.requestedName || order.targetAccessKeyName || '—', describeQuota(order)]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                      {order.paymentMethodLabel ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {salesUi.paymentMethodLabel}: {order.paymentMethodLabel}
                        </p>
                      ) : null}
                      {order.selectedServerName ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {salesUi.selectedServer}: {order.selectedServerName}
                          {order.selectedServerCountryCode ? ` (${order.selectedServerCountryCode})` : ''}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {salesUi.orderStatusCommand}: <code>/order {order.orderCode}</code>
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.proof}
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {order.paymentProofType || salesUi.awaitingProof}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {order.paymentSubmittedAt ? formatDateTime(order.paymentSubmittedAt) : '—'}
                      </p>
                      {typeof order.paymentProofRevision === 'number' && order.paymentProofRevision > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {salesUi.proofRevision}: {order.paymentProofRevision}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-border/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.target}
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {order.targetAccessKeyName || order.targetDynamicKeyName || 'New key'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {order.approvedAccessKeyName || order.approvedDynamicKeyName || order.reviewedBy?.email || '—'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.submitted}
                      </p>
                      <p className="mt-2 text-sm font-medium">{formatRelativeTime(order.createdAt)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                  </div>

                  {renderTemplateSummary(order.deliveryType, order.templateId, order.dynamicTemplateId, true)}

                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    <div className="rounded-xl border border-border/50 bg-background/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.customerProfile}
                      </p>
                      <div className="mt-2 space-y-1 text-sm">
                        <p className="font-medium">
                          {order.customerProfile?.displayName ||
                            order.telegramUsername ||
                            order.requestedName ||
                            '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{order.customerProfile?.username || order.telegramUsername || 'unknown'} · {order.telegramChatId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {salesUi.localeLabel}: {order.customerProfile?.locale === 'my' ? 'မြန်မာ' : 'English'}
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-muted-foreground">
                          <div>
                            <p className="font-medium text-foreground">{order.customerSummary.totalOrders}</p>
                            <p>{salesUi.totalOrders}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{order.customerSummary.fulfilledOrders}</p>
                            <p>{salesUi.fulfilled}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-background/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.linkedKeys}
                      </p>
                      <div className="mt-2 space-y-2">
                        {order.customerLinkedKeys.length > 0 ? (
                          order.customerLinkedKeys.slice(0, 3).map((key) => (
                            <div key={key.id} className="rounded-lg border border-border/40 p-2">
                              <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-sm font-medium">{key.name}</p>
                                {key.type ? (
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {key.type === 'DYNAMIC_KEY' ? salesUi.dynamicKeyDelivery : salesUi.accessKeyDelivery}
                                  </Badge>
                                ) : null}
                              </div>
                              <Badge variant="outline">{key.status}</Badge>
                            </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {key.email || '—'} • {formatBytes(BigInt(key.usedBytes))}
                                {key.dataLimitBytes ? ` / ${formatBytes(BigInt(key.dataLimitBytes))}` : ` / ${salesUi.unlimited}`}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">{salesUi.noLinkedKeys}</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-background/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.recentOrders}
                      </p>
                      <div className="mt-2 space-y-2">
                        {order.customerRecentOrders.length > 0 ? (
                          order.customerRecentOrders.map((recentOrder) => (
                            <div key={recentOrder.id} className="rounded-lg border border-border/40 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{recentOrder.orderCode}</p>
                                <Badge variant="outline">{recentOrder.status}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {recentOrder.planName || recentOrder.kind} • {formatRelativeTime(recentOrder.createdAt)}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">{salesUi.noRecentOrders}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {order.adminNote ? (
                    <div className="mt-3 rounded-xl border border-border/50 bg-background/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.adminNote}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{order.adminNote}</p>
                    </div>
                  ) : null}

                  {order.customerMessage ? (
                    <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.customerMessage}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{order.customerMessage}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeWorkflowTab === 'review' ? (
      <Card className="border border-border/60 bg-background/80 shadow-[0_22px_50px_-24px_rgba(15,23,42,0.35)] dark:bg-[#050816]/90">
        <CardHeader>
          <CardTitle>{salesUi.serverChangeRequestsTitle}</CardTitle>
          <CardDescription>{salesUi.serverChangeRequestsDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {serverChangeRequestsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : !serverChangeRequestsQuery.data || serverChangeRequestsQuery.data.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
              {salesUi.noServerChangeRequests}
            </div>
          ) : (
            <div className="space-y-3">
              {serverChangeRequestsQuery.data.map((request: TelegramServerChangeRequestRow) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-border/60 bg-background/45 p-4"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{request.requestCode}</p>
                        <Badge variant="outline">{request.status}</Badge>
                        <Badge variant="secondary">{request.accessKey.name}</Badge>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.user}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            @{request.telegramUsername || 'unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">{request.telegramUserId}</p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.currentServer}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {request.currentServerName}
                            {request.currentServerCountryCode ? ` (${request.currentServerCountryCode})` : ''}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.requestedServer}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {request.requestedServerName}
                            {request.requestedServerCountryCode ? ` (${request.requestedServerCountryCode})` : ''}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.remainingAfterApproval}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {request.remainingChangesAfterApproval}/{request.accessKey.serverChangeLimit}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {salesUi.requestSubmittedAt}: {formatRelativeTime(request.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {salesUi.order}: {request.accessKey.status} • {formatBytes(BigInt(request.accessKey.usedBytes))}
                        {request.accessKey.dataLimitBytes
                          ? ` / ${formatBytes(BigInt(request.accessKey.dataLimitBytes))}`
                          : ` / ${salesUi.unlimited}`}
                        {request.accessKey.expiresAt ? ` • ${formatDateTime(request.accessKey.expiresAt)}` : ''}
                      </div>
                      {request.adminNote ? (
                        <div className="rounded-xl border border-border/40 bg-background/40 p-3 text-sm text-muted-foreground">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.adminNote}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap">{request.adminNote}</p>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 xl:w-[13rem] xl:flex-col">
                      <Button
                        type="button"
                        className="rounded-full"
                        onClick={() =>
                          approveServerChangeRequestMutation.mutate({
                            requestId: request.id,
                          })
                        }
                        disabled={
                          !canManageTelegramReviews ||
                          approveServerChangeRequestMutation.isPending ||
                          rejectServerChangeRequestMutation.isPending
                        }
                      >
                        {approveServerChangeRequestMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        {salesUi.approve}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={() =>
                          rejectServerChangeRequestMutation.mutate({
                            requestId: request.id,
                          })
                        }
                        disabled={
                          !canManageTelegramReviews ||
                          approveServerChangeRequestMutation.isPending ||
                          rejectServerChangeRequestMutation.isPending
                        }
                      >
                        {rejectServerChangeRequestMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <AlertTriangle className="mr-2 h-4 w-4" />
                        )}
                        {salesUi.reject}
                      </Button>
                      <Button asChild type="button" variant="ghost" className="rounded-full">
                        <Link href={withBasePath(`/dashboard/keys/${request.accessKey.id}`)}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {salesUi.reviewInKeyPage}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeWorkflowTab === 'premium' ? (
      <Card className="border border-border/60 bg-background/80 shadow-[0_22px_50px_-24px_rgba(15,23,42,0.35)] dark:bg-[#050816]/90">
        <CardHeader>
          <CardTitle>{salesUi.premiumSupportRequestsTitle}</CardTitle>
          <CardDescription>{salesUi.premiumSupportRequestsDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
            <Input
              value={premiumRequestSearch}
              onChange={(event) => setPremiumRequestSearch(event.target.value)}
              placeholder={salesUi.premiumSearchPlaceholder}
            />
            <Select
              value={premiumRequestStatusFilter}
              onValueChange={(value) =>
                setPremiumRequestStatusFilter(
                  value as 'ALL' | 'PENDING_REVIEW' | 'APPROVED' | 'HANDLED' | 'DISMISSED',
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={salesUi.premiumAllStatuses} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{salesUi.premiumAllStatuses}</SelectItem>
                <SelectItem value="PENDING_REVIEW">{salesUi.premiumStatusPending}</SelectItem>
                <SelectItem value="APPROVED">{salesUi.premiumStatusApproved}</SelectItem>
                <SelectItem value="HANDLED">{salesUi.premiumStatusHandled}</SelectItem>
                <SelectItem value="DISMISSED">{salesUi.premiumStatusDismissed}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={premiumRequestTypeFilter}
              onValueChange={(value) =>
                setPremiumRequestTypeFilter(value as 'ALL' | 'REGION_CHANGE' | 'ROUTE_ISSUE')
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={salesUi.premiumAllTypes} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{salesUi.premiumAllTypes}</SelectItem>
                <SelectItem value="REGION_CHANGE">{salesUi.premiumRequestTypeRegion}</SelectItem>
                <SelectItem value="ROUTE_ISSUE">{salesUi.premiumRequestTypeRoute}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {premiumSupportRequestsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : !premiumSupportRequestsQuery.data || premiumSupportRequestsQuery.data.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
              {salesUi.noPremiumSupportRequests}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{salesUi.premiumQueueMatches(premiumSupportRequestsQuery.data.length)}</span>
                <span>{salesUi.premiumLastUpdate}: {formatRelativeTime(premiumSupportRequestsQuery.data[0]?.updatedAt || premiumSupportRequestsQuery.data[0]?.createdAt)}</span>
              </div>
              {premiumSupportRequestsQuery.data.map((request: TelegramPremiumSupportRequestRow) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-border/60 bg-background/45 p-4"
                >
                  {(() => {
                    const history = buildPremiumSupportHistory(request, salesUi);
                    const latestHistory = history[history.length - 1];
                    const latestReply = request.replies[request.replies.length - 1];
                    return (
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{request.requestCode}</p>
                        <Badge variant="outline">
                          {formatPremiumSupportRequestStatusLabel(request.status, salesUi)}
                        </Badge>
                        <Badge variant="secondary">{request.dynamicAccessKey.name}</Badge>
                        <Badge variant="outline">
                          {formatPremiumSupportRequestTypeLabel(request.requestType, salesUi)}
                        </Badge>
                        {request.followUpPending ? (
                          <Badge variant="secondary">{salesUi.premiumFollowUpPending}</Badge>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.user}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            @{request.telegramUsername || 'unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">{request.telegramUserId}</p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.premiumPoolSummary}
                          </p>
                          <p className="mt-1 text-sm font-medium">{request.currentPoolSummary || '—'}</p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.premiumResolvedServer}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {request.currentResolvedServerName || '—'}
                            {request.currentResolvedServerCountryCode
                              ? ` (${request.currentResolvedServerCountryCode})`
                              : ''}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.requestSubmittedAt}
                          </p>
                          <p className="mt-1 text-sm font-medium">{formatRelativeTime(request.createdAt)}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(request.createdAt)}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.premiumRequestedRegion}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {request.requestedRegionCode || salesUi.premiumNoRequestedRegion}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.premiumCurrentPin}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {request.dynamicAccessKey.pinnedServerId
                              ? `${request.dynamicAccessKey.pinnedServerId}${request.dynamicAccessKey.pinExpiresAt ? ` · ${formatRelativeTime(request.dynamicAccessKey.pinExpiresAt)}` : ''}`
                              : salesUi.premiumNoPinServer}
                          </p>
                        </div>
                        {request.linkedOutage ? (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3 md:col-span-2 xl:col-span-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Linked outage
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">
                                {request.linkedOutage.incidentCode}
                              </p>
                              <Badge variant="outline">{request.linkedOutage.status}</Badge>
                              {request.linkedOutage.serverName ? (
                                <Badge variant="secondary">{request.linkedOutage.serverName}</Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Started {formatRelativeTime(request.linkedOutage.startedAt)}
                              {request.linkedOutage.migrationTargetServerName
                                ? ` · target ${request.linkedOutage.migrationTargetServerName}`
                                : ''}
                              {request.linkedOutage.userAlertSentAt
                                ? ` · user alert ${formatRelativeTime(request.linkedOutage.userAlertSentAt)}`
                                : ''}
                            </p>
                          </div>
                        ) : null}
                        <div className="rounded-xl border border-border/40 p-3 md:col-span-2 xl:col-span-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.premiumLastUpdate}
                          </p>
                          <p className="mt-1 text-sm font-medium">{latestHistory.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(latestHistory.at)}
                            {latestHistory.detail ? ` · ${latestHistory.detail}` : ''}
                          </p>
                        </div>
                        {latestReply ? (
                          <div className="rounded-xl border border-border/40 p-3 md:col-span-2 xl:col-span-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {salesUi.premiumLatestReply}
                            </p>
                            <p className="mt-1 text-sm font-medium">
                              {latestReply.senderType === 'ADMIN'
                                ? salesUi.premiumHistoryAdminReply
                                : salesUi.premiumHistoryCustomerReply}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              {latestReply.message}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {formatRelativeTime(latestReply.createdAt)}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      {request.adminNote ? (
                        <div className="rounded-xl border border-border/40 bg-background/40 p-3 text-sm text-muted-foreground">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {salesUi.adminNote}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap">{request.adminNote}</p>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 xl:w-[13rem] xl:flex-col">
                      {request.requestType === 'REGION_CHANGE' ? (
                        <Button
                          type="button"
                          className="rounded-full"
                          onClick={() => {
                            setPremiumReviewTarget({ requestId: request.id, mode: 'approve' });
                            setPremiumReviewNote(request.adminNote || '');
                            setPremiumReviewCustomerMessage(request.customerMessage || '');
                            setPremiumReviewRegionCode(
                              request.requestedRegionCode ||
                                request.dynamicAccessKey.availableRegionCodes[0] ||
                                '',
                            );
                            setPremiumReviewPinServerId('none');
                            setPremiumReviewPinExpires('60');
                            setPremiumAppendNoteToKey(true);
                          }}
                          disabled={!canManageTelegramReviews}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {salesUi.premiumApproveRegion}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="rounded-full"
                          onClick={() => {
                            setPremiumReviewTarget({ requestId: request.id, mode: 'handle' });
                            setPremiumReviewNote(request.adminNote || '');
                            setPremiumReviewCustomerMessage(request.customerMessage || '');
                            setPremiumReviewRegionCode('');
                            setPremiumReviewPinServerId('none');
                            setPremiumReviewPinExpires('60');
                            setPremiumAppendNoteToKey(true);
                          }}
                          disabled={!canManageTelegramReviews}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {salesUi.premiumHandleIssue}
                        </Button>
                      )}
                      {request.status !== 'DISMISSED' ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => {
                            setPremiumReviewTarget({ requestId: request.id, mode: 'reply' });
                            setPremiumReviewNote('');
                            setPremiumReviewCustomerMessage('');
                            setPremiumReviewRegionCode(
                              request.requestedRegionCode ||
                                request.dynamicAccessKey.availableRegionCodes[0] ||
                                '',
                            );
                            setPremiumReviewPinServerId('none');
                            setPremiumReviewPinExpires('60');
                            setPremiumAppendNoteToKey(false);
                          }}
                          disabled={!canManageTelegramReviews}
                        >
                          <MessageSquare className="mr-2 h-4 w-4" />
                          {salesUi.premiumReply}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => {
                          setPremiumReviewTarget({ requestId: request.id, mode: 'dismiss' });
                          setPremiumReviewNote(request.adminNote || '');
                          setPremiumReviewCustomerMessage(request.customerMessage || '');
                          setPremiumReviewRegionCode(
                            request.requestedRegionCode ||
                              request.dynamicAccessKey.availableRegionCodes[0] ||
                              '',
                          );
                          setPremiumReviewPinServerId('none');
                          setPremiumReviewPinExpires('60');
                          setPremiumAppendNoteToKey(false);
                        }}
                        disabled={!canManageTelegramReviews}
                      >
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        {salesUi.premiumDismiss}
                      </Button>
                      <Button asChild type="button" variant="ghost" className="rounded-full">
                        <Link href={withBasePath(`/dashboard/dynamic-keys/${request.dynamicAccessKey.id}`)}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {salesUi.premiumOpenDynamicKey}
                        </Link>
                      </Button>
                    </div>
                  </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      <Dialog
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewTarget(null);
            setReviewNote('');
            setReviewCustomerMessage('');
            setReviewReasonCode('custom');
            setProofPreviewOpen(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {reviewTarget?.mode === 'approve' ? salesUi.approve : salesUi.reject}
            </DialogTitle>
            <DialogDescription>{salesUi.reviewContextHint}</DialogDescription>
          </DialogHeader>

          {selectedOrder ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {salesUi.orderContext}
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-medium">{selectedOrder.orderCode}</p>
                  <p className="text-muted-foreground">{selectedOrder.planName || selectedOrder.planCode || '—'}</p>
                  <p className="text-xs text-muted-foreground">
                          {selectedOrder.requestedName || selectedOrder.targetAccessKeyName || selectedOrder.targetDynamicKeyName || '—'}
                  </p>
                  {selectedOrder.selectedServerName ? (
                    <p className="text-xs text-muted-foreground">
                      {salesUi.selectedServer}: {selectedOrder.selectedServerName}
                      {selectedOrder.selectedServerCountryCode ? ` (${selectedOrder.selectedServerCountryCode})` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-border/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {salesUi.customer}
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-medium">
                    {selectedOrder.customerProfile?.displayName ||
                      selectedOrder.telegramUsername ||
                      selectedOrder.requestedName ||
                      '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{selectedOrder.customerProfile?.username || selectedOrder.telegramUsername || 'unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedOrder.requestedEmail || selectedOrder.telegramUserId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {salesUi.lastFulfilled}:{' '}
                    {selectedOrder.customerSummary.lastFulfilledAt
                      ? formatDateTime(selectedOrder.customerSummary.lastFulfilledAt)
                      : '—'}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {salesUi.proof}
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-medium">{selectedOrder.paymentProofType || salesUi.awaitingProof}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedOrder.paymentSubmittedAt
                      ? formatDateTime(selectedOrder.paymentSubmittedAt)
                      : '—'}
                  </p>
                  {typeof selectedOrder.paymentProofRevision === 'number' && selectedOrder.paymentProofRevision > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {salesUi.proofRevision}: {selectedOrder.paymentProofRevision}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {salesUi.proofCaption}: {selectedOrder.paymentCaption || salesUi.noCaption}
                  </p>
                  {selectedOrder.paymentMethodLabel ? (
                    <p className="text-xs text-muted-foreground">
                      {salesUi.paymentMethodLabel}: {selectedOrder.paymentMethodLabel}
                    </p>
                  ) : null}
                  {selectedOrder.paymentMethodAccountName ? (
                    <p className="text-xs text-muted-foreground">
                      {salesUi.accountName}: {selectedOrder.paymentMethodAccountName}
                    </p>
                  ) : null}
                  {selectedOrder.paymentMethodAccountNumber ? (
                    <p className="text-xs text-muted-foreground">
                      {salesUi.accountNumber}: {selectedOrder.paymentMethodAccountNumber}
                    </p>
                  ) : null}
                  {selectedOrder.duplicateProofOrderCode ? (
                    <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{salesUi.duplicateProofFlag}</p>
                          <p className="text-xs text-muted-foreground">{salesUi.duplicateProofHint}</p>
                          <p className="text-xs text-muted-foreground">
                            {salesUi.duplicateProofOrderLabel}: <span className="font-medium text-foreground">{selectedOrder.duplicateProofOrderCode}</span>
                          </p>
                          {selectedOrder.duplicateProofDetectedAt ? (
                            <p className="text-xs text-muted-foreground">
                              {salesUi.duplicateProofDetectedAt}: {formatDateTime(selectedOrder.duplicateProofDetectedAt)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{salesUi.proofForwardedHint}</p>
                  {selectedOrder.paymentProofType ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedOrderProofIsImage ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setProofPreviewOpen(true)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {salesUi.zoomProof}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(selectedOrderProofUrl, '_blank', 'noopener,noreferrer')}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {salesUi.openProof}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(selectedOrderProofDownloadUrl, '_blank', 'noopener,noreferrer')
                        }
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {salesUi.downloadProof}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
              {selectedOrder.riskScore > 0 ? (
                <div className="rounded-xl border border-border/50 p-3 md:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {salesUi.riskLabel}
                    </p>
                    <Badge variant="outline" className={cn('font-medium', getOrderRiskBadgeClass(selectedOrder.riskLevel))}>
                      {formatOrderRiskLevelLabel(selectedOrder.riskLevel)} · {selectedOrder.riskScore}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedOrder.riskReasons.map((reason) => (
                      <Badge key={reason} variant="secondary" className="text-[11px]">
                        {formatOrderRiskReasonLabel(reason)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-xl border border-border/50 p-3 md:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {salesUi.reviewerAssignment}
                    </p>
                    <p className="mt-2 text-sm font-medium">
                      {selectedOrder.assignedReviewerEmail
                        ? isOrderClaimedByCurrentUser(selectedOrder)
                          ? salesUi.claimedByMe
                          : `${salesUi.claimedBy} ${selectedOrder.assignedReviewerEmail}`
                        : salesUi.unassigned}
                    </p>
                    {selectedOrder.assignedAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {salesUi.claimedAt}: {formatDateTime(selectedOrder.assignedAt)}
                      </p>
                    ) : null}
                  </div>
                  {selectedOrder.status === 'PENDING_REVIEW' ? (
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      <div className="flex flex-wrap gap-2">
                        {!selectedOrder.assignedReviewerUserId ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => handleClaimOrder(selectedOrder.id, true)}
                            disabled={!canManageTelegramReviews || claimOrderMutation.isPending}
                          >
                            <KeyRound className="mr-2 h-4 w-4" />
                            {salesUi.claimOrder}
                          </Button>
                        ) : isOrderClaimedByCurrentUser(selectedOrder) ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleClaimOrder(selectedOrder.id, false)}
                            disabled={!canManageTelegramReviews || claimOrderMutation.isPending}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {salesUi.releaseOrder}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleAssignOrderReviewer(selectedOrder.id, currentReviewerId || null)}
                          disabled={!canManageTelegramReviews || !currentReviewerId || assignOrderReviewerMutation.isPending}
                        >
                          <KeyRound className="mr-2 h-4 w-4" />
                          {salesUi.assignToMe}
                        </Button>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:min-w-[260px]">
                        <Label className="text-xs text-muted-foreground">{salesUi.reviewer}</Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Select
                            value={reviewAssignedReviewerId}
                            onValueChange={setReviewAssignedReviewerId}
                          >
                            <SelectTrigger className="w-full sm:flex-1">
                              <SelectValue placeholder={salesUi.unassigned} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">{salesUi.unassigned}</SelectItem>
                              {(reviewersQuery.data || []).map((reviewer) => (
                                <SelectItem key={reviewer.id} value={reviewer.id}>
                                  {reviewer.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              handleAssignOrderReviewer(
                                selectedOrder.id,
                                reviewAssignedReviewerId === 'unassigned' ? null : reviewAssignedReviewerId,
                              )
                            }
                            disabled={!canManageTelegramReviews || assignOrderReviewerMutation.isPending}
                          >
                            {assignOrderReviewerMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {salesUi.updateReviewer}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {selectedOrder ? (
            <div className="rounded-xl border border-border/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {salesUi.proofPreview}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedOrderProofIsImage ? salesUi.paymentProofImage : salesUi.noImagePreview}
                  </p>
                </div>
                {selectedOrder.paymentProofType ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedOrderProofIsImage ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setProofPreviewOpen(true)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {salesUi.zoomProof}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedOrderProofUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {salesUi.openProof}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedOrderProofDownloadUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {salesUi.downloadProof}
                    </Button>
                  </div>
                ) : null}
              </div>
              {selectedOrder.paymentProofType ? (
                selectedOrderProofIsImage ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border/50 bg-background/50">
                    {/* Preview stays same-origin through an admin-authenticated proxy route. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedOrderProofUrl}
                      alt={salesUi.paymentProofImage}
                      className="max-h-[26rem] w-full cursor-zoom-in object-contain"
                      loading="lazy"
                      onClick={() => setProofPreviewOpen(true)}
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-border/50 bg-background/40 p-4 text-sm text-muted-foreground">
                    {salesUi.noImagePreview}
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          {selectedOrder ? renderTemplateSummary(selectedOrder.deliveryType, selectedOrder.templateId, selectedOrder.dynamicTemplateId) : null}

          {selectedOrder ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {salesUi.linkedKeys}
                </p>
                <div className="mt-2 space-y-2">
                  {selectedOrder.customerLinkedKeys.length > 0 ? (
                    selectedOrder.customerLinkedKeys.slice(0, 4).map((key) => (
                      <div key={key.id} className="rounded-lg border border-border/40 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-medium">{key.name}</p>
                            {key.type ? (
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                {key.type === 'DYNAMIC_KEY' ? salesUi.dynamicKeyDelivery : salesUi.accessKeyDelivery}
                              </Badge>
                            ) : null}
                          </div>
                          <Badge variant="outline">{key.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {key.email || '—'} • {formatBytes(BigInt(key.usedBytes))}
                          {key.dataLimitBytes ? ` / ${formatBytes(BigInt(key.dataLimitBytes))}` : ` / ${salesUi.unlimited}`}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{salesUi.noLinkedKeys}</p>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {salesUi.recentOrders}
                </p>
                <div className="mt-2 space-y-2">
                  {selectedOrder.customerRecentOrders.length > 0 ? (
                    selectedOrder.customerRecentOrders.map((order) => (
                      <div key={order.id} className="rounded-lg border border-border/40 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{order.orderCode}</p>
                          <Badge variant="outline">{order.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {order.planName || order.kind} • {formatDateTime(order.createdAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{salesUi.noRecentOrders}</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {selectedOrder ? (
            <div className="rounded-xl border border-border/50 p-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {salesUi.editBeforeApproval}
                </p>
                <p className="text-sm text-muted-foreground">{salesUi.editBeforeApprovalDesc}</p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>{salesUi.planConfig}</Label>
                  <Select
                    value={reviewPlanCode || selectedOrder.planCode || ''}
                    onValueChange={(value) => setReviewPlanCode(value as TelegramSalesPlanCode)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={salesUi.planLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      {form.plans.map((plan) => (
                        <SelectItem key={plan.code} value={plan.code}>
                          {plan.localizedLabels[isMyanmar ? 'my' : 'en'] || plan.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{salesUi.duration}</Label>
                  <Input
                    inputMode="numeric"
                    value={reviewDurationMonths}
                    onChange={(event) => setReviewDurationMonths(event.target.value)}
                    placeholder={
                      selectedPlan?.fixedDurationMonths
                        ? String(selectedPlan.fixedDurationMonths)
                        : selectedPlan?.minDurationMonths
                          ? String(selectedPlan.minDurationMonths)
                          : selectedOrder.durationMonths
                            ? String(selectedOrder.durationMonths)
                            : '1'
                    }
                    disabled={Boolean(selectedPlan?.fixedDurationDays || selectedPlan?.fixedDurationMonths)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{salesUi.server}</Label>
                  <Select
                    value={reviewSelectedServerId}
                    onValueChange={(value) => setReviewSelectedServerId(value)}
                    disabled={selectedOrder.kind !== 'NEW'}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={salesUi.autoSelectServer} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{salesUi.autoSelectServer}</SelectItem>
                      {(serversQuery.data || []).map((server) => (
                        <SelectItem key={server.id} value={server.id}>
                          {server.name}
                          {server.countryCode ? ` (${server.countryCode})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    updateOrderDraftMutation.mutate({
                      orderId: selectedOrder.id,
                      planCode: (reviewPlanCode || selectedOrder.planCode || undefined) as
                        | TelegramSalesPlanCode
                        | undefined,
                      durationMonths: (() => {
                        if (!reviewDurationMonths.trim()) {
                          return selectedOrder.durationMonths || undefined;
                        }
                        const parsed = Number.parseInt(reviewDurationMonths.trim(), 10);
                        return Number.isFinite(parsed) ? parsed : selectedOrder.durationMonths || undefined;
                      })(),
                      selectedServerId:
                        selectedOrder.kind === 'NEW'
                          ? reviewSelectedServerId === 'auto'
                            ? null
                            : reviewSelectedServerId
                          : null,
                    })
                  }
                  disabled={!canManageTelegramReviews || updateOrderDraftMutation.isPending || isOrderClaimedByOtherUser(selectedOrder)}
                >
                  {updateOrderDraftMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {salesUi.saveOrderChanges}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="telegram-order-review-note">{salesUi.adminNote}</Label>
            <Textarea
              id="telegram-order-review-note"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              rows={5}
            />
          </div>

          {reviewTarget?.mode === 'reject' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{salesUi.rejectPresets}</Label>
                <div className="flex flex-wrap gap-2">
                  {TELEGRAM_REJECTION_REASON_PRESETS.map((preset) => (
                    <Button
                      key={preset.code}
                      type="button"
                      variant={reviewReasonCode === preset.code ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setReviewReasonCode(preset.code);
                        setReviewCustomerMessage(preset.message[isMyanmar ? 'my' : 'en']);
                      }}
                    >
                      {preset.label[isMyanmar ? 'my' : 'en']}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant={reviewReasonCode === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setReviewReasonCode('custom')}
                  >
                    {salesUi.rejectPresetCustom}
                  </Button>
                </div>
              </div>
              <Label htmlFor="telegram-order-customer-message">{salesUi.customerMessage}</Label>
              <Textarea
                id="telegram-order-customer-message"
                value={reviewCustomerMessage}
                onChange={(event) => setReviewCustomerMessage(event.target.value)}
                rows={4}
                placeholder={salesUi.customerMessageDesc}
              />
              <p className="text-xs text-muted-foreground">{salesUi.customerMessageDesc}</p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewTarget(null);
                setReviewNote('');
                setReviewCustomerMessage('');
                setReviewReasonCode('custom');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reviewTarget) {
                  return;
                }

                if (reviewTarget.mode === 'approve') {
                  approveOrderMutation.mutate({
                    orderId: reviewTarget.orderId,
                    adminNote: reviewNote.trim() || undefined,
                  });
                  return;
                }

                rejectOrderMutation.mutate({
                  orderId: reviewTarget.orderId,
                  adminNote: reviewNote.trim() || undefined,
                  customerMessage: reviewCustomerMessage.trim() || undefined,
                  reasonCode: reviewReasonCode === 'custom' ? undefined : reviewReasonCode,
                });
              }}
              disabled={
                !canManageTelegramReviews ||
                approveOrderMutation.isPending ||
                rejectOrderMutation.isPending ||
                updateOrderDraftMutation.isPending ||
                (selectedOrder ? isOrderClaimedByOtherUser(selectedOrder) : false)
              }
            >
              {approveOrderMutation.isPending ||
              rejectOrderMutation.isPending ||
              updateOrderDraftMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : reviewTarget?.mode === 'approve' ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : (
                <AlertTriangle className="mr-2 h-4 w-4" />
              )}
              {reviewTarget?.mode === 'approve' ? salesUi.approve : salesUi.reject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={proofPreviewOpen} onOpenChange={setProofPreviewOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{salesUi.proofPreview}</DialogTitle>
            <DialogDescription>{selectedOrder?.orderCode || '—'}</DialogDescription>
          </DialogHeader>
          {selectedOrder && selectedOrderProofIsImage ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedOrderProofUrl}
                  alt={salesUi.paymentProofImage}
                  className="max-h-[72vh] w-full object-contain"
                  loading="eager"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.open(selectedOrderProofUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {salesUi.openProof}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.open(selectedOrderProofDownloadUrl, '_blank', 'noopener,noreferrer')}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {salesUi.downloadProof}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
              {salesUi.noImagePreview}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(premiumReviewTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setPremiumReviewTarget(null);
            setPremiumReviewNote('');
            setPremiumReviewCustomerMessage('');
            setPremiumReviewRegionCode('');
            setPremiumReviewPinServerId('none');
            setPremiumReviewPinExpires('60');
            setPremiumAppendNoteToKey(true);
          }
        }}
      >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {premiumReviewTarget?.mode === 'approve'
                ? salesUi.premiumApproveRegion
                : premiumReviewTarget?.mode === 'handle'
                  ? salesUi.premiumHandleIssue
                  : premiumReviewTarget?.mode === 'reply'
                    ? salesUi.premiumReply
                    : salesUi.premiumDismiss}
            </DialogTitle>
            <DialogDescription>{salesUi.reviewContextHint}</DialogDescription>
          </DialogHeader>

          {selectedPremiumSupportRequest ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {salesUi.orderContext}
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="font-medium">{selectedPremiumSupportRequest.requestCode}</p>
                    <p className="text-muted-foreground">
                      {formatPremiumSupportRequestTypeLabel(
                        selectedPremiumSupportRequest.requestType,
                        salesUi,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedPremiumSupportRequest.dynamicAccessKey.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {salesUi.premiumPoolSummary}: {selectedPremiumSupportRequest.currentPoolSummary || '—'}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-border/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {salesUi.customer}
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="font-medium">@{selectedPremiumSupportRequest.telegramUsername || 'unknown'}</p>
                    <p className="text-xs text-muted-foreground">{selectedPremiumSupportRequest.telegramUserId}</p>
                    <p className="text-xs text-muted-foreground">
                      {salesUi.requestSubmittedAt}: {formatDateTime(selectedPremiumSupportRequest.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {salesUi.premiumResolvedServer}: {selectedPremiumSupportRequest.currentResolvedServerName || '—'}
                      {selectedPremiumSupportRequest.currentResolvedServerCountryCode
                        ? ` (${selectedPremiumSupportRequest.currentResolvedServerCountryCode})`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {salesUi.premiumHistoryTitle}
                </p>
                <div className="mt-3 space-y-3">
                  {buildPremiumSupportHistory(selectedPremiumSupportRequest, salesUi).map((entry) => (
                    <div key={entry.key} className="flex items-start justify-between gap-3 rounded-lg border border-border/40 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{entry.label}</p>
                        {entry.detail ? (
                          <p className="mt-1 text-xs text-muted-foreground break-words">
                            {entry.detail}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium">{formatRelativeTime(entry.at)}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDateTime(entry.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedPremiumSupportRequest.replies?.length ? (
                <div className="rounded-xl border border-border/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {salesUi.premiumReplyThreadTitle}
                  </p>
                  <div className="mt-3 space-y-3">
                    {selectedPremiumSupportRequest.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="rounded-lg border border-border/40 bg-background/40 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {reply.senderType === 'ADMIN'
                                ? salesUi.premiumHistoryAdminReply
                                : salesUi.premiumHistoryCustomerReply}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              {reply.message}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-medium">
                              {formatRelativeTime(reply.createdAt)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDateTime(reply.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {selectedPremiumSupportRequest?.requestType === 'REGION_CHANGE' &&
          premiumReviewTarget?.mode === 'approve' ? (
            <div className="space-y-2">
              <Label>{salesUi.premiumRequestedRegion}</Label>
              <Select value={premiumReviewRegionCode} onValueChange={setPremiumReviewRegionCode}>
                <SelectTrigger>
                  <SelectValue placeholder={salesUi.premiumNoRequestedRegion} />
                </SelectTrigger>
                <SelectContent>
                  {selectedPremiumSupportRequest.dynamicAccessKey.availableRegionCodes.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {(premiumReviewTarget?.mode === 'approve' ||
            premiumReviewTarget?.mode === 'handle') &&
          selectedPremiumSupportRequest ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{salesUi.premiumPinServer}</Label>
                <Select value={premiumReviewPinServerId} onValueChange={setPremiumReviewPinServerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={salesUi.premiumNoPinServer} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{salesUi.premiumNoPinServer}</SelectItem>
                    {selectedPremiumSupportRequest.dynamicAccessKey.availablePinServers.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        {server.name}
                        {server.countryCode ? ` (${server.countryCode})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{salesUi.premiumPinExpires}</Label>
                <Select value={premiumReviewPinExpires} onValueChange={setPremiumReviewPinExpires}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="180">3 hours</SelectItem>
                    <SelectItem value="720">12 hours</SelectItem>
                    <SelectItem value="1440">24 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {premiumReviewTarget?.mode === 'approve' ||
          premiumReviewTarget?.mode === 'handle' ? (
            <div className="flex items-center justify-between rounded-xl border border-border/50 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{salesUi.premiumAppendNoteToKey}</p>
                <p className="text-xs text-muted-foreground">{salesUi.adminNote}</p>
              </div>
              <Switch checked={premiumAppendNoteToKey} onCheckedChange={setPremiumAppendNoteToKey} />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="telegram-premium-review-note">{salesUi.adminNote}</Label>
            <Textarea
              id="telegram-premium-review-note"
              value={premiumReviewNote}
              onChange={(event) => setPremiumReviewNote(event.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telegram-premium-customer-message">{salesUi.customerMessage}</Label>
            <Textarea
              id="telegram-premium-customer-message"
              value={premiumReviewCustomerMessage}
              onChange={(event) => setPremiumReviewCustomerMessage(event.target.value)}
              rows={4}
              placeholder={salesUi.customerMessageDesc}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPremiumReviewTarget(null);
                setPremiumReviewNote('');
                setPremiumReviewCustomerMessage('');
                setPremiumReviewRegionCode('');
                setPremiumReviewPinServerId('none');
                setPremiumReviewPinExpires('60');
                setPremiumAppendNoteToKey(true);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!premiumReviewTarget || !selectedPremiumSupportRequest) {
                  return;
                }

                if (premiumReviewTarget.mode === 'approve') {
                  approvePremiumSupportRequestMutation.mutate({
                    requestId: premiumReviewTarget.requestId,
                    adminNote: premiumReviewNote.trim() || undefined,
                    customerMessage: premiumReviewCustomerMessage.trim() || undefined,
                    approvedRegionCode: premiumReviewRegionCode || undefined,
                    pinServerId: premiumReviewPinServerId === 'none' ? null : premiumReviewPinServerId,
                    pinExpiresInMinutes:
                      premiumReviewPinServerId === 'none'
                        ? null
                        : Number.parseInt(premiumReviewPinExpires, 10) || 60,
                    appendNoteToKey: premiumAppendNoteToKey,
                  });
                  return;
                }

                if (premiumReviewTarget.mode === 'handle') {
                  handlePremiumSupportRequestMutation.mutate({
                    requestId: premiumReviewTarget.requestId,
                    adminNote: premiumReviewNote.trim() || undefined,
                    customerMessage: premiumReviewCustomerMessage.trim() || undefined,
                    pinServerId: premiumReviewPinServerId === 'none' ? null : premiumReviewPinServerId,
                    pinExpiresInMinutes:
                      premiumReviewPinServerId === 'none'
                        ? null
                        : Number.parseInt(premiumReviewPinExpires, 10) || 60,
                    appendNoteToKey: premiumAppendNoteToKey,
                  });
                  return;
                }

                if (premiumReviewTarget.mode === 'reply') {
                  replyPremiumSupportRequestMutation.mutate({
                    requestId: premiumReviewTarget.requestId,
                    adminNote: premiumReviewNote.trim() || undefined,
                    customerMessage: premiumReviewCustomerMessage.trim(),
                  });
                  return;
                }

                dismissPremiumSupportRequestMutation.mutate({
                  requestId: premiumReviewTarget.requestId,
                  adminNote: premiumReviewNote.trim() || undefined,
                  customerMessage: premiumReviewCustomerMessage.trim() || undefined,
                });
              }}
              disabled={
                !canManageTelegramReviews ||
                approvePremiumSupportRequestMutation.isPending ||
                handlePremiumSupportRequestMutation.isPending ||
                replyPremiumSupportRequestMutation.isPending ||
                dismissPremiumSupportRequestMutation.isPending ||
                (premiumReviewTarget?.mode === 'reply' && !premiumReviewCustomerMessage.trim())
              }
            >
              {approvePremiumSupportRequestMutation.isPending ||
              handlePremiumSupportRequestMutation.isPending ||
              replyPremiumSupportRequestMutation.isPending ||
              dismissPremiumSupportRequestMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : premiumReviewTarget?.mode === 'dismiss' ? (
                <AlertTriangle className="mr-2 h-4 w-4" />
              ) : premiumReviewTarget?.mode === 'reply' ? (
                <MessageSquare className="mr-2 h-4 w-4" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {premiumReviewTarget?.mode === 'approve'
                ? salesUi.premiumApproveRegion
                : premiumReviewTarget?.mode === 'handle'
                  ? salesUi.premiumHandleIssue
                  : premiumReviewTarget?.mode === 'reply'
                    ? salesUi.premiumReply
                  : salesUi.premiumDismiss}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * KeyAlertsCard Component
 *
 * Displays alerts for keys that are:
 * - Reaching 80% data usage
 * - Expiring within 7 days
 */
function KeyAlertsCard() {
  const { t } = useLocale();
  const { data: alertsData, isLoading, refetch } = trpc.keys.getKeyAlerts.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            {t('notifications.key_alerts.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAlerts = alertsData && alertsData.totalAlerts > 0;

  return (
    <Card className={cn(
      hasAlerts ? 'border-orange-500/25 bg-orange-500/[0.06]' : 'border-border/60'
    )}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 text-xl leading-tight sm:text-2xl">
            <AlertTriangle className={cn(
              'h-5 w-5 shrink-0',
              hasAlerts ? 'text-orange-500' : 'text-muted-foreground'
            )} />
            <span className="min-w-0 break-words">{t('notifications.key_alerts.title')}</span>
          </CardTitle>
          <Button variant="ghost" size="icon" className="rounded-2xl" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <CardDescription>
          {t('notifications.key_alerts.desc')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAlerts ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
            <p className="font-medium text-green-600">{t('notifications.key_alerts.all_healthy')}</p>
            <p className="text-sm text-muted-foreground">
              {t('notifications.key_alerts.no_issues')}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className={cn(
                'rounded-[1.35rem] border p-4',
                alertsData.expiringCount > 0
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-muted/50 border-border'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className={cn(
                    'w-4 h-4',
                    alertsData.expiringCount > 0 ? 'text-red-500' : 'text-muted-foreground'
                  )} />
                  <span className="text-sm font-medium">{t('notifications.key_alerts.expiring')}</span>
                </div>
                <p className={cn(
                  'text-2xl font-bold',
                  alertsData.expiringCount > 0 ? 'text-red-500' : 'text-muted-foreground'
                )}>
                  {alertsData.expiringCount} keys
                </p>
                <p className="text-xs text-muted-foreground">{t('notifications.key_alerts.expiring_desc')}</p>
              </div>

              <div className={cn(
                'rounded-[1.35rem] border p-4',
                alertsData.trafficWarningCount > 0
                  ? 'bg-orange-500/10 border-orange-500/30'
                  : 'bg-muted/50 border-border'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <HardDrive className={cn(
                    'w-4 h-4',
                    alertsData.trafficWarningCount > 0 ? 'text-orange-500' : 'text-muted-foreground'
                  )} />
                  <span className="text-sm font-medium">{t('notifications.key_alerts.high_usage')}</span>
                </div>
                <p className={cn(
                  'text-2xl font-bold',
                  alertsData.trafficWarningCount > 0 ? 'text-orange-500' : 'text-muted-foreground'
                )}>
                  {alertsData.trafficWarningCount} keys
                </p>
                <p className="text-xs text-muted-foreground">{t('notifications.key_alerts.high_usage_desc')}</p>
              </div>
            </div>

            {/* Expiring keys list */}
            {alertsData.expiringKeys.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-500" />
                  {t('notifications.key_alerts.expiring_title')}
                </h4>
                <div className="space-y-2">
                  {alertsData.expiringKeys.slice(0, 5).map((key) => (
                    <div
                      key={key.id}
                      className="flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                      
                    >
                      <div className="flex items-center gap-3">
                        <KeyRound className="w-4 h-4 text-red-500" />
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground">{key.serverName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <Badge variant="destructive" className="text-xs">
                          {key.daysRemaining === 0
                            ? t('notifications.key_alerts.expires_today')
                            : key.daysRemaining === 1
                              ? t('notifications.key_alerts.day_left')
                              : `${key.daysRemaining} ${t('notifications.key_alerts.days_left')}`}
                        </Badge>
                        <Link href={`/dashboard/keys/${key.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-2xl">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                  {alertsData.expiringKeys.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      +{alertsData.expiringKeys.length - 5} {t('notifications.key_alerts.more')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Traffic warning keys list */}
            {alertsData.trafficWarningKeys.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-orange-500" />
                  {t('notifications.key_alerts.usage_title')}
                </h4>
                <div className="space-y-2">
                  {alertsData.trafficWarningKeys.slice(0, 5).map((key) => (
                    <div
                      key={key.id}
                      className="flex flex-col gap-3 rounded-lg border border-orange-500/20 bg-orange-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <KeyRound className="w-4 h-4 text-orange-500" />
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground">{key.serverName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="w-24">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span>{formatBytes(BigInt(key.usedBytes))}</span>
                            <span className="text-muted-foreground">{formatBytes(BigInt(key.dataLimitBytes))}</span>
                          </div>
                          <Progress
                            value={key.usagePercent}
                            className={cn(
                              'h-1.5',
                              key.usagePercent >= 90 && '[&>div]:bg-red-500',
                              key.usagePercent >= 80 && key.usagePercent < 90 && '[&>div]:bg-orange-500'
                            )}
                          />
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            key.usagePercent >= 90
                              ? 'border-red-500/50 text-red-500'
                              : 'border-orange-500/50 text-orange-500'
                          )}
                        >
                          {key.usagePercent}%
                        </Badge>
                        <Link href={`/dashboard/keys/${key.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-2xl">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                  {alertsData.trafficWarningKeys.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      +{alertsData.trafficWarningKeys.length - 5} {t('notifications.key_alerts.more')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueueStatusCard() {
  const { toast } = useToast();
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const { data, isLoading, isFetching } = trpc.notifications.queueStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const processQueueMutation = trpc.notifications.processQueueNow.useMutation({
    onSuccess: async (result) => {
      toast({
        title: t('notifications.queue.processed'),
        description:
          result.claimed > 0
            ? `${result.delivered} ${t('notifications.queue.delivered')}, ${result.rescheduled} ${t('notifications.queue.rescheduled')}, ${result.failed} ${t('notifications.queue.failed_count')}`
            : t('notifications.queue.nothing_due'),
      });

      await Promise.all([
        utils.notifications.queueStatus.invalidate(),
        utils.notifications.listLogs.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: t('notifications.queue.process_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <Card className="ops-detail-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{t('notifications.queue.title')}</CardTitle>
            <CardDescription>{t('notifications.queue.desc')}</CardDescription>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {isFetching && !isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
            <Button
              variant="outline"
              className="flex-1 rounded-2xl sm:flex-none"
              onClick={() => processQueueMutation.mutate({ limit: 50 })}
              disabled={processQueueMutation.isPending || isLoading}
            >
              {processQueueMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {t('notifications.queue.process_now')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="ops-inline-stat">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.due_now')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.dueNowCount ?? 0}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.pending')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.pendingCount ?? 0}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.retrying')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.retryingCount ?? 0}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.processing')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.processingCount ?? 0}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('notifications.queue.failed')}</p>
                <p className="mt-2 text-2xl font-semibold">{data?.failedCount ?? 0}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                {t('notifications.queue.success_today')}: <span className="font-medium text-foreground">{data?.successTodayCount ?? 0}</span>
              </span>
              <span>
                {data?.nextDelivery
                  ? `${t('notifications.queue.next_attempt')}: ${formatDateTime(data.nextDelivery.nextAttemptAt)}`
                  : t('notifications.queue.empty')}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DeliveryHistoryCard({ channels }: { channels: Channel[] }) {
  const { toast } = useToast();
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [status, setStatus] = useState<DeliveryStatusFilter>('ALL');
  const [channelId, setChannelId] = useState('ALL');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    setPage(1);
  }, [status, channelId, deferredSearch]);

  const { data, isLoading, isFetching } = trpc.notifications.listLogs.useQuery(
    {
      page,
      pageSize: 15,
      status,
      channelId: channelId === 'ALL' ? undefined : channelId,
      search: deferredSearch || undefined,
    },
    {
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  );

  const retryLogMutation = trpc.notifications.retryLog.useMutation({
    onSuccess: async (result) => {
      toast({
        title: result.alreadyQueued ? t('notifications.toast.retry_already_queued') : t('notifications.toast.retry_queued'),
        description: result.alreadyQueued
          ? t('notifications.toast.retry_already_queued_desc')
          : t('notifications.toast.retry_queued_desc'),
      });
      await Promise.all([
        utils.notifications.listLogs.invalidate(),
        utils.notifications.queueStatus.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: t('notifications.toast.retry_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const logs: DeliveryLog[] = data?.items ?? [];
  const retryingLogId = retryLogMutation.isPending ? retryLogMutation.variables?.logId : null;
  const hasActiveFilters = Boolean(deferredSearch || channelId !== 'ALL' || status !== 'ALL');

  return (
    <Card className="ops-detail-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              {t('notifications.delivery.title')}
            </CardTitle>
            <CardDescription>{t('notifications.delivery.desc')}</CardDescription>
          </div>
          {isFetching && !isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                id="delivery-search-mobile"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('notifications.delivery.search_placeholder')}
                className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]"
              />
            </div>
            <Button
              variant={hasActiveFilters ? 'default' : 'outline'}
              size="sm"
              className="h-11 rounded-[1.15rem] px-4"
              onClick={() => setMobileFilterOpen(true)}
            >
              <Filter className="w-4 h-4 mr-2" />
              {t('notifications.delivery.filters')}
            </Button>
          </div>
          <div className="ops-table-meta">
            <span>
              {data?.total ?? 0} {t('notifications.delivery.results')}
            </span>
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full px-2 text-xs"
                onClick={() => {
                  setStatus('ALL');
                  setChannelId('ALL');
                  setSearch('');
                }}
              >
                {t('notifications.delivery.clear_filters')}
              </Button>
            ) : (
              <span>
                {t('notifications.delivery.page')} {data?.page ?? 1} / {data?.totalPages ?? 1}
              </span>
            )}
          </div>
        </div>

        <div className="ops-table-toolbar hidden gap-3 md:grid md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="delivery-search">{t('notifications.delivery.search')}</Label>
            <Input
              id="delivery-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('notifications.delivery.search_placeholder')}
              className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('notifications.delivery.channel')}</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('notifications.delivery.all_channels')}</SelectItem>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('notifications.delivery.status')}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as DeliveryStatusFilter)}>
              <SelectTrigger className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('notifications.delivery.all_statuses')}</SelectItem>
                <SelectItem value="SUCCESS">{t('notifications.status.SUCCESS')}</SelectItem>
                <SelectItem value="FAILED">{t('notifications.status.FAILED')}</SelectItem>
                <SelectItem value="SKIPPED">{t('notifications.status.SKIPPED')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Dialog open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
          <DialogContent className="max-w-lg rounded-[1.75rem]">
            <DialogHeader>
              <DialogTitle>{t('notifications.delivery.filters')}</DialogTitle>
              <DialogDescription>{t('notifications.delivery.filters_desc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('notifications.delivery.channel')}</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('notifications.delivery.all_channels')}</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('notifications.delivery.status')}</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as DeliveryStatusFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('notifications.delivery.all_statuses')}</SelectItem>
                    <SelectItem value="SUCCESS">{t('notifications.status.SUCCESS')}</SelectItem>
                    <SelectItem value="FAILED">{t('notifications.status.FAILED')}</SelectItem>
                    <SelectItem value="SKIPPED">{t('notifications.status.SKIPPED')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  setStatus('ALL');
                  setChannelId('ALL');
                  setSearch('');
                }}
              >
                {t('notifications.delivery.clear_filters')}
              </Button>
              <Button className="rounded-2xl" onClick={() => setMobileFilterOpen(false)}>{t('notifications.dialog.cancel')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="ops-table-meta hidden md:flex">
          <span>
            {data?.total ?? 0} {t('notifications.delivery.results')}
          </span>
          <span>
            {t('notifications.delivery.page')} {data?.page ?? 1} / {data?.totalPages ?? 1}
          </span>
        </div>

        <div className="space-y-3 md:hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="ops-chart-empty">
              {t('notifications.delivery.empty')}
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="ops-mobile-card space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{getEventLabel(log.event, t)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(log.sentAt)} · {formatRelativeTime(log.sentAt)}
                    </p>
                  </div>
                  <Badge
                    variant={log.status === 'FAILED' ? 'destructive' : 'outline'}
                    className={cn(getStatusBadgeClass(log.status))}
                  >
                    {getStatusLabel(log.status, t)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="ops-row-card">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t('notifications.delivery.channel')}
                    </p>
                    <p className="mt-1 break-words text-sm font-medium">
                      {getChannelLabel(log, t)}
                    </p>
                  </div>
                  <div className="ops-row-card">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t('notifications.delivery.key')}
                    </p>
                    <p className="mt-1 break-words text-sm font-medium">
                      {log.accessKeyName ?? '-'}
                    </p>
                  </div>
                </div>

                <div className="ops-row-card">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('notifications.delivery.message')}
                  </p>
                  <p className="mt-1 break-words text-sm leading-5">
                    {log.message}
                  </p>
                </div>

                <div className="space-y-1 text-sm">
                  {log.error ? (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive">
                      <p className="text-[11px] uppercase tracking-wide text-destructive/80">
                        {t('notifications.delivery.error')}
                      </p>
                      <p className="mt-1 break-words text-sm leading-5">{log.error}</p>
                    </div>
                  ) : null}
                </div>

                {(log.accessKeyId || log.canRetry || log.retryQueued) ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {log.accessKeyId ? (
                      <Button asChild variant="outline" size="sm" className="w-full justify-center rounded-2xl">
                        <Link href={`/dashboard/keys/${log.accessKeyId}`}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          {t('notifications.delivery.open_key')}
                        </Link>
                      </Button>
                    ) : null}
                    {log.canRetry ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-center rounded-2xl"
                        onClick={() => retryLogMutation.mutate({ logId: log.id })}
                        disabled={retryingLogId === log.id}
                      >
                        {retryingLogId === log.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        {t('notifications.delivery.retry')}
                      </Button>
                    ) : log.retryQueued ? (
                      <div className={cn('flex items-center justify-center rounded-lg border px-3 py-2 text-sm', 'border-amber-500/40 text-amber-500')}>
                        {t('notifications.delivery.retry_queued')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('notifications.delivery.time')}</TableHead>
                <TableHead>{t('notifications.delivery.channel')}</TableHead>
                <TableHead>{t('notifications.delivery.event')}</TableHead>
                <TableHead>{t('notifications.delivery.status')}</TableHead>
                <TableHead>{t('notifications.delivery.message')}</TableHead>
                <TableHead>{t('notifications.delivery.error')}</TableHead>
                <TableHead>{t('notifications.delivery.key')}</TableHead>
                <TableHead className="text-right">{t('notifications.delivery.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    {t('notifications.delivery.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="min-w-40">
                      <div className="space-y-1">
                        <p className="text-sm">{formatDateTime(log.sentAt)}</p>
                        <p className="text-xs text-muted-foreground">{formatRelativeTime(log.sentAt)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-40">
                      <div className="space-y-1">
                        <p className="font-medium">{getChannelLabel(log, t)}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.channelType ? t(`notifications.type.${log.channelType}`) : t('notifications.delivery.system')}
                          {log.channelIsActive === false ? ` · ${t('notifications.channel_inactive')}` : ''}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-36">{getEventLabel(log.event, t)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={log.status === 'FAILED' ? 'destructive' : 'outline'}
                        className={cn(getStatusBadgeClass(log.status))}
                      >
                        {getStatusLabel(log.status, t)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal break-words text-sm">{log.message}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal break-words text-sm text-destructive">
                      {log.error ?? '—'}
                    </TableCell>
                    <TableCell>{log.accessKeyName ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {log.canRetry ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryLogMutation.mutate({ logId: log.id })}
                          disabled={retryingLogId === log.id}
                        >
                          {retryingLogId === log.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4 mr-2" />
                          )}
                          {t('notifications.delivery.retry')}
                        </Button>
                      ) : log.retryQueued ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                          {t('notifications.delivery.retry_queued')}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="ops-table-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {logs.length > 0 ? `${logs.length} / ${data?.total ?? logs.length}` : `0 / ${data?.total ?? 0}`} {t('notifications.delivery.visible')}
          </div>
          <div className="flex items-center gap-2 self-end">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page <= 1 || isLoading}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('notifications.delivery.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              disabled={isLoading || (data?.page ?? 1) >= (data?.totalPages ?? 1)}
            >
              {t('notifications.delivery.next')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * NotificationsPage Component
 */
export default function NotificationsPage() {
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const utils = trpc.useUtils();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);
  const workspaceParam = searchParams.get('workspace');
  const [activeWorkspace, setActiveWorkspace] = useState<NotificationWorkspaceId>(
    workspaceParam && ['overview', 'telegram', 'workflow', 'channels'].includes(workspaceParam)
      ? (workspaceParam as NotificationWorkspaceId)
      : 'overview',
  );

  useEffect(() => {
    if (
      workspaceParam &&
      ['overview', 'telegram', 'workflow', 'channels'].includes(workspaceParam) &&
      workspaceParam !== activeWorkspace
    ) {
      setActiveWorkspace(workspaceParam as NotificationWorkspaceId);
    }
  }, [activeWorkspace, workspaceParam]);

  const updateWorkspaceUrlState = (workspace: NotificationWorkspaceId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('workspace', workspace);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const { data: channels = [], isLoading: isChannelsLoading } = trpc.notifications.listChannels.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
    },
  );
  const deleteChannelMutation = trpc.notifications.deleteChannel.useMutation({
    onSuccess: async () => {
      toast({
        title: t('notifications.toast.deleted'),
        description: t('notifications.toast.deleted_desc'),
      });
      await Promise.all([
        utils.notifications.listChannels.invalidate(),
        utils.notifications.listLogs.invalidate(),
        utils.notifications.queueStatus.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const testChannelMutation = trpc.notifications.testChannel.useMutation({
    onSuccess: async () => {
      toast({
        title: t('notifications.toast.test_sent'),
        description: t('notifications.toast.test_desc'),
      });
      await Promise.all([
        utils.notifications.listLogs.invalidate(),
        utils.notifications.queueStatus.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: 'Test failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (channel: Channel) => {
    setEditChannel(channel);
    setDialogOpen(true);
  };

  const handleDelete = (channel: Channel) => {
    if (confirm(`${t('notifications.confirm_delete')} "${channel.name}"?`)) {
      deleteChannelMutation.mutate({ id: channel.id });
    }
  };

  const handleTest = async (channel: Channel) => {
    testChannelMutation.mutate({ id: channel.id });
  };

  const handleOpenCreate = () => {
    setEditChannel(null);
    setDialogOpen(true);
  };

  const activeChannels = channels.filter((channel) => channel.isActive).length;
  const subscribedEventCount = new Set(channels.flatMap((channel) => channel.events)).size;
  const workspaces: Array<{
    id: NotificationWorkspaceId;
    title: string;
    description: string;
    meta: string;
    icon: typeof Bell;
  }> = [
    {
      id: 'overview',
      title: isMyanmar ? 'Overview' : 'Overview',
      description: isMyanmar
        ? 'Alert များ၊ queue နှင့် delivery health ကို အမြန်ကြည့်ရန်'
        : 'Alerts, queue health, and the most important notification signals.',
      meta: `${channels.length} ${isMyanmar ? 'channels' : 'channels'} • ${subscribedEventCount} ${isMyanmar ? 'events' : 'events'}`,
      icon: Bell,
    },
    {
      id: 'telegram',
      title: isMyanmar ? 'Telegram bot' : 'Telegram bot',
      description: isMyanmar
        ? 'Bot setup, webhook, welcome flows နှင့် broadcasts'
        : 'Bot setup, webhook controls, localized flows, and broadcasts.',
      meta: isMyanmar ? 'Bot + broadcasts' : 'Bot + broadcasts',
      icon: MessageSquare,
    },
    {
      id: 'workflow',
      title: isMyanmar ? 'Order workflow' : 'Order workflow',
      description: isMyanmar
        ? 'Sales automation, coupon campaigns, review queue'
        : 'Sales automation, coupon campaigns, and review operations.',
      meta: isMyanmar ? 'Sales + review' : 'Sales + review',
      icon: Send,
    },
    {
      id: 'channels',
      title: isMyanmar ? 'Channels & history' : 'Channels & history',
      description: isMyanmar
        ? 'Channel setup နှင့် delivery history ကို စီမံရန်'
        : 'Channel setup, testing, and delivery history in one place.',
      meta: `${activeChannels} ${isMyanmar ? 'active' : 'active'} • ${Math.max(0, channels.length - activeChannels)} ${isMyanmar ? 'inactive' : 'inactive'}`,
      icon: History,
    },
  ];

  return (
    <div className="space-y-6 dark:[&_.ops-section-heading]:text-slate-300/90 dark:[&_.text-muted-foreground]:text-slate-300/82">
      <section className="ops-showcase">
        <div className="grid gap-5">
          <div className="space-y-5">
            <BackButton href="/dashboard" label={t('nav.dashboard')} />
            <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
              <Bell className="h-3.5 w-3.5" />
              {t('notifications.title')}
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">{t('notifications.title')}</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t('notifications.subtitle')}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:max-w-3xl">
              <div className="ops-kpi-tile p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('notifications.summary.channels')}
                </p>
                <p className="mt-3 text-2xl font-semibold">{channels.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('notifications.summary.channels_desc')}</p>
              </div>
              <div className="ops-kpi-tile p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('notifications.summary.active_channels')}
                </p>
                <p className="mt-3 text-2xl font-semibold">{activeChannels}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('notifications.channel_inactive')}: {Math.max(0, channels.length - activeChannels)}</p>
              </div>
              <div className="ops-kpi-tile p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('notifications.summary.coverage')}
                </p>
                <p className="mt-3 text-2xl font-semibold">{subscribedEventCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('notifications.summary.coverage_desc')}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleOpenCreate} className="h-11 rounded-full px-5">
                <Plus className="w-4 h-4 mr-2" />
                {t('notifications.add_channel')}
              </Button>
            </div>
          </div>

          <div>
            <div className="ops-hero-aside space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="ops-section-heading">Command rail</p>
                  <h2 className="text-xl font-semibold">{t('notifications.add_channel')}</h2>
                  <p className="text-sm text-muted-foreground">{t('notifications.subtitle')}</p>
                </div>
                <Badge
                  variant="outline"
                  className="h-auto w-fit max-w-full self-start whitespace-normal break-words rounded-full border-cyan-500/20 bg-cyan-500/10 text-cyan-700 leading-tight dark:text-cyan-200 sm:self-auto"
                >
                  {workspaces.length} workspaces
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="ops-kpi-tile p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Active workspace
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-tight">
                    {workspaces.find((workspace) => workspace.id === activeWorkspace)?.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {workspaces.find((workspace) => workspace.id === activeWorkspace)?.meta}
                  </p>
                </div>
                <div className="ops-kpi-tile p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Delivery focus
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-tight">{activeChannels} live</p>
                  <p className="mt-1 text-xs text-muted-foreground">{subscribedEventCount} subscribed events</p>
                </div>
              </div>

              <Button onClick={handleOpenCreate} className="h-11 w-full rounded-full">
                <Plus className="w-4 h-4 mr-2" />
                {t('notifications.add_channel')}
              </Button>

              <div className="flex flex-wrap gap-2">
                {workspaces.map((workspace) => (
                  <button
                    key={`hero:${workspace.id}`}
                    type="button"
                    onClick={() => {
                      setActiveWorkspace(workspace.id);
                      updateWorkspaceUrlState(workspace.id);
                    }}
                    className={cn(
                      'ops-pill max-w-full justify-start text-left whitespace-normal break-words transition-colors',
                      activeWorkspace === workspace.id
                        ? 'border-primary/25 bg-primary/10 text-primary dark:text-cyan-200'
                        : 'text-muted-foreground'
                    )}
                  >
                    <workspace.icon className="h-3.5 w-3.5" />
                    {workspace.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Tabs
        value={activeWorkspace}
        onValueChange={(value) => {
          const workspace = value as NotificationWorkspaceId;
          setActiveWorkspace(workspace);
          updateWorkspaceUrlState(workspace);
        }}
      >
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-[1.8rem] border border-border/60 bg-background/55 p-2 md:grid-cols-2 2xl:grid-cols-4 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(4,11,24,0.9),rgba(5,12,24,0.76))] dark:shadow-[0_16px_38px_rgba(1,6,20,0.34)]">
          {workspaces.map((workspace) => {
            const Icon = workspace.icon;
            return (
              <TabsTrigger
                key={workspace.id}
                value={workspace.id}
                className="min-h-[94px] w-full min-w-0 flex-col items-start justify-start gap-2 overflow-hidden whitespace-normal rounded-[1.25rem] border border-transparent px-4 py-4 text-left text-sm font-medium text-foreground/90 dark:text-slate-200 dark:[&_.workspace-caption]:text-slate-400 dark:[&_.workspace-meta]:text-slate-500 data-[state=active]:border-primary/20 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:[&_.workspace-caption]:text-primary-foreground/80 data-[state=active]:[&_.workspace-meta]:text-primary-foreground/70 dark:data-[state=active]:border-cyan-300/20 dark:data-[state=active]:bg-[linear-gradient(135deg,rgba(8,33,49,0.98),rgba(7,75,104,0.92))] dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:[&_.workspace-caption]:text-cyan-100/90 dark:data-[state=active]:[&_.workspace-meta]:text-cyan-200/85 dark:data-[state=active]:shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_18px_34px_rgba(6,182,212,0.18)]"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2 whitespace-normal text-sm font-semibold">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{workspace.title}</span>
                </span>
                <span className="workspace-caption min-w-0 whitespace-normal break-words text-xs leading-5 text-muted-foreground">
                  {workspace.description}
                </span>
                <span className="workspace-meta min-w-0 whitespace-normal break-words text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {workspace.meta}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview" forceMount className="mt-6 space-y-6">
          <div className={cn('space-y-6', activeWorkspace !== 'overview' && 'hidden')}>
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
              <div className="space-y-6">
                <KeyAlertsCard />
              </div>
              <div className="space-y-6">
                <QueueStatusCard />

                <Card className="border-dashed bg-background/55 dark:bg-white/[0.02]">
                  <CardContent className="p-5">
                    <div className="flex gap-3">
                      <Bell className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{t('notifications.info.title')}</p>
                        <p className="text-sm text-muted-foreground">{t('notifications.info.desc')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-background/60 dark:bg-white/[0.02]">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-lg">
                      {isMyanmar ? 'Focused workspaces' : 'Focused workspaces'}
                    </CardTitle>
                    <CardDescription>
                      {isMyanmar
                        ? 'Notifications ကို အလုပ်အမျိုးအစားအလိုက် ခွဲထားပြီး scroll များမဖြစ်စေရန် တစ်ခန်းချင်း စီမံနိုင်ပါသည်။'
                        : 'Open only the part of Notifications you need instead of working through one long page.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    {workspaces.slice(1).map((workspace) => {
                      const Icon = workspace.icon;
                      return (
                        <button
                          key={`jump:${workspace.id}`}
                          type="button"
                          onClick={() => {
                            setActiveWorkspace(workspace.id);
                            updateWorkspaceUrlState(workspace.id);
                          }}
                          className="rounded-2xl border border-border/60 bg-background/70 p-4 text-left transition-colors hover:border-primary/30 hover:bg-background"
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Icon className="h-4 w-4 text-primary" />
                            {workspace.title}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {workspace.description}
                          </p>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="telegram" forceMount className="mt-6 space-y-6">
          <div className={cn('space-y-6', activeWorkspace !== 'telegram' && 'hidden')}>
            <Card className="border-border/60 bg-background/60 dark:bg-white/[0.02]">
              <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {isMyanmar ? 'Bot setup and broadcasts' : 'Bot setup and broadcasts'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isMyanmar
                      ? 'Bot identity, webhook, localized messages, announcements, templates, analytics နှင့် history ကို တစ်နေရာတည်းတွင် စီမံနိုင်ပါသည်။'
                      : 'Manage bot identity, webhook, localized messages, broadcasts, templates, analytics, and history without mixing them with the rest of the page.'}
                  </p>
                </div>
                <Badge variant="outline" className="w-fit">
                  {isMyanmar ? 'Cleaner full-width workspace' : 'Cleaner full-width workspace'}
                </Badge>
              </CardContent>
            </Card>

            <TelegramBotSetupCard isActive={activeWorkspace === 'telegram'} />
          </div>
        </TabsContent>

        <TabsContent value="workflow" forceMount className="mt-6 space-y-6">
          <div className={cn('space-y-6', activeWorkspace !== 'workflow' && 'hidden')}>
            <Card className="border-border/60 bg-background/60 dark:bg-white/[0.02]">
              <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {isMyanmar ? 'Sales automation and review operations' : 'Sales automation and review operations'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isMyanmar
                      ? 'Order flow, coupons, automation guardrails, reviewer queue နှင့် premium support ကို သီးခြား workspace အဖြစ်ထားပေးထားသည်။'
                      : 'Keep order flow, coupons, automation guardrails, reviewer queues, and premium support in a dedicated operations workspace.'}
                  </p>
                </div>
                <Badge variant="outline" className="w-fit">
                  {isMyanmar ? 'Sales + review' : 'Sales + review'}
                </Badge>
              </CardContent>
            </Card>

            <TelegramSalesWorkflowCard isActive={activeWorkspace === 'workflow'} />
          </div>
        </TabsContent>

        <TabsContent value="channels" forceMount className="mt-6 space-y-6">
          <div className={cn('space-y-6', activeWorkspace !== 'channels' && 'hidden')}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <Card className="border-border/60 bg-background/60 dark:bg-white/[0.02]">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg">
                    {isMyanmar ? 'Delivery channels' : 'Delivery channels'}
                  </CardTitle>
                  <CardDescription>
                    {isMyanmar
                      ? 'Telegram, email နှင့် webhook channel များကို ပြုပြင်၊ test လုပ်ပြီး delivery history ကို စစ်ဆေးနိုင်သည်။'
                      : 'Manage Telegram, email, and webhook delivery channels, then review what the worker actually sent.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div className="ops-kpi-tile p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('notifications.summary.channels')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{channels.length}</p>
                  </div>
                  <div className="ops-kpi-tile p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('notifications.summary.active_channels')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{activeChannels}</p>
                  </div>
                  <div className="ops-kpi-tile p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t('notifications.summary.coverage')}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{subscribedEventCount}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-background/60 dark:bg-white/[0.02]">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg">{t('notifications.add_channel')}</CardTitle>
                  <CardDescription>
                    {isMyanmar
                      ? 'Delivery endpoint အသစ် ထည့်ပြီး event coverage ကို တိုးချဲ့နိုင်သည်။'
                      : 'Create a new delivery endpoint and expand your event coverage.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleOpenCreate} className="h-11 w-full rounded-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('notifications.add_channel')}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {isChannelsLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <Card key={item}>
                    <CardContent className="p-5">
                      <div className="animate-pulse space-y-3">
                        <div className="h-5 w-32 rounded bg-muted" />
                        <div className="h-4 w-24 rounded bg-muted" />
                        <div className="h-16 rounded bg-muted" />
                        <div className="h-9 rounded bg-muted" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : channels.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {channels.map((channel) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    onEdit={() => handleEdit(channel)}
                    onDelete={() => handleDelete(channel)}
                    onTest={() => handleTest(channel)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Bell className="mb-4 h-16 w-16 text-muted-foreground/50" />
                  <h3 className="mb-2 text-lg font-semibold">{t('notifications.empty.title')}</h3>
                  <p className="mb-6 max-w-md text-center text-muted-foreground">
                    {t('notifications.empty.desc')}
                  </p>
                  <Button onClick={handleOpenCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('notifications.empty.btn')}
                  </Button>
                </CardContent>
              </Card>
            )}

            <DeliveryHistoryCard channels={channels} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Channel dialog */}
      <ChannelDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditChannel(null);
          }
        }}
        editChannel={editChannel}
        onSuccess={() => {
          setEditChannel(null);
        }}
      />
    </div>
  );
}
