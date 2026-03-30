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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { withBasePath } from '@/lib/base-path';
import type { LocalizedTemplateMap } from '@/lib/localized-templates';
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
} from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';

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

type TelegramSalesPlanCode = 'trial_1d_3gb' | '1m_150gb' | '2m_300gb' | '3plus_unlimited';

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
  templateId?: string | null;
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
  paymentReminderHours: string;
  pendingReviewReminderHours: string;
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
  templateId?: string | null;
  selectedServerId?: string | null;
  selectedServerName?: string | null;
  selectedServerCountryCode?: string | null;
  targetAccessKeyId?: string | null;
  targetAccessKeyName?: string | null;
  approvedAccessKeyId?: string | null;
  approvedAccessKeyName?: string | null;
  paymentProofType?: string | null;
  paymentProofRevision?: number | null;
  paymentSubmittedAt?: Date | null;
  paymentCaption?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
  rejectionReasonCode?: string | null;
  reviewedAt?: Date | null;
  fulfilledAt?: Date | null;
  rejectedAt?: Date | null;
  createdAt: Date;
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

const DEFAULT_TELEGRAM_SALES_SETTINGS: TelegramSalesSettingsForm = {
  enabled: false,
  allowRenewals: true,
  supportLink: '',
  paymentReminderHours: '3',
  pendingReviewReminderHours: '6',
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
      templateId: null,
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
      templateId: null,
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
      templateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 2,
      minDurationMonths: null,
      dataLimitGB: 300,
      unlimitedQuota: false,
    },
    {
      code: '3plus_unlimited',
      enabled: true,
      label: '3+ Months / Unlimited',
      localizedLabels: { en: '3+ Months / Unlimited', my: '၃ လနှင့်အထက် / Unlimited' },
      priceAmount: '',
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      templateId: null,
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

function TelegramBotSetupCard() {
  const { toast } = useToast();
  const { t, locale } = useLocale();
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
  };
  const utils = trpc.useUtils();
  const settingsQuery = trpc.telegramBot.getSettings.useQuery();
  const webhookInfoQuery = trpc.telegramBot.getWebhookInfo.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const [form, setForm] = useState<TelegramSettings>(DEFAULT_TELEGRAM_SETTINGS);
  const [adminChatIdsInput, setAdminChatIdsInput] = useState('');

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setForm({
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
    });
    setAdminChatIdsInput((settingsQuery.data.adminChatIds || []).join(', '));
  }, [settingsQuery.data, t]);

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

  const isSaving = saveSettingsMutation.isPending;
  const hasToken = form.botToken.trim().length > 0;
  const webhookUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/telegram/webhook`;

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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="space-y-4">
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
                    {testConnectionMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="mr-2 h-4 w-4" />
                    )}
                    {t('settings.telegram.test')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.telegram.help')}{' '}
                  <Link
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
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
                  onValueChange={(value: 'en' | 'my') =>
                    setForm((prev) => ({ ...prev, defaultLanguage: value }))
                  }
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      {telegramUi.languageSelectorOnStartDesc}
                    </p>
                  </div>
                  <Switch
                    checked={form.showLanguageSelectorOnStart}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, showLanguageSelectorOnStart: checked }))
                    }
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
                      onChange={(event) =>
                        updateLocalizedTelegramText('localizedWelcomeMessages', 'en', event.target.value)
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telegram-welcome-message-my">{telegramUi.burmeseTemplate}</Label>
                    <Textarea
                      id="telegram-welcome-message-my"
                      value={form.localizedWelcomeMessages?.my || ''}
                      onChange={(event) =>
                        updateLocalizedTelegramText('localizedWelcomeMessages', 'my', event.target.value)
                      }
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
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, keyNotFoundMessage: event.target.value }))
                  }
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
                      onChange={(event) =>
                        updateLocalizedTelegramText('localizedKeyNotFoundMessages', 'en', event.target.value)
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telegram-not-found-message-my">{telegramUi.burmeseTemplate}</Label>
                    <Textarea
                      id="telegram-not-found-message-my"
                      value={form.localizedKeyNotFoundMessages?.my || ''}
                      onChange={(event) =>
                        updateLocalizedTelegramText('localizedKeyNotFoundMessages', 'my', event.target.value)
                      }
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
                  <p className="text-xs text-muted-foreground">
                    {telegramUi.enableBotDesc}
                  </p>
                </div>
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isEnabled: checked }))}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{telegramUi.dailyDigest}</p>
                  <p className="text-xs text-muted-foreground">
                    {telegramUi.dailyDigestDesc}
                  </p>
                </div>
                <Switch
                  checked={form.dailyDigestEnabled}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, dailyDigestEnabled: checked }))
                  }
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
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        dailyDigestHour: Math.min(23, Math.max(0, Number(event.target.value) || 0)),
                      }))
                    }
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
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        dailyDigestMinute: Math.min(59, Math.max(0, Number(event.target.value) || 0)),
                      }))
                    }
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
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        digestLookbackHours: Math.min(168, Math.max(1, Number(event.target.value) || 1)),
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/75 p-4 dark:bg-white/[0.02]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t('settings.telegram.webhook_status')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {telegramUi.webhookDesc}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => webhookInfoQuery.refetch()}
                  disabled={webhookInfoQuery.isFetching}
                >
                  <RefreshCw className={cn('h-4 w-4', webhookInfoQuery.isFetching && 'animate-spin')} />
                </Button>
              </div>

              <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs break-all">
                {webhookUrl || telegramUi.webhookUnavailable}
              </div>

              <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                <p>
                  {telegramUi.pendingUpdates}:{' '}
                  <span className="font-medium text-foreground">
                    {webhookInfoQuery.data?.pendingUpdateCount ?? 0}
                  </span>
                </p>
                {webhookInfoQuery.data?.lastErrorMessage ? (
                  <p className="text-destructive">
                    {telegramUi.lastError}: {webhookInfoQuery.data.lastErrorMessage}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => setWebhookMutation.mutate({ webhookUrl })}
                  disabled={!hasToken || !webhookUrl || setWebhookMutation.isPending}
                >
                  {setWebhookMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  {t('settings.telegram.set_webhook')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => deleteWebhookMutation.mutate()}
                  disabled={!hasToken || deleteWebhookMutation.isPending}
                >
                  {deleteWebhookMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  {t('settings.telegram.remove_webhook')}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/75 p-4 dark:bg-white/[0.02]">
              <p className="text-sm font-medium">{telegramUi.commandSurface}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {telegramUi.userCommands}: <code>/start</code>, <code>/buy</code>, <code>/renew</code>,{' '}
                <code>/orders</code>, <code>/order</code>, <code>/mykeys</code>, <code>/sub</code>,{' '}
                <code>/usage</code>, <code>/server</code>, <code>/support</code>, <code>/language</code>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {telegramUi.adminCommands}: <code>/expiring</code>, <code>/find</code>, <code>/disable</code>,{' '}
                <code>/enable</code>, <code>/resend</code>, <code>/status</code>, <code>/sysinfo</code>,{' '}
                <code>/backup</code>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => runDigestMutation.mutate()}
                  disabled={runDigestMutation.isPending || !hasToken}
                >
                  {runDigestMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {telegramUi.sendDigestNow}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('settings.telegram.save')}
          </Button>
        </div>
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

function TelegramSalesWorkflowCard() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const utils = trpc.useUtils();
  const settingsQuery = trpc.telegramBot.getSalesConfig.useQuery();
  const templatesQuery = trpc.templates.list.useQuery();
  const serversQuery = trpc.servers.list.useQuery();
  const [form, setForm] = useState<TelegramSalesSettingsForm>(DEFAULT_TELEGRAM_SALES_SETTINGS);
  const [reviewTarget, setReviewTarget] = useState<{ orderId: string; mode: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewCustomerMessage, setReviewCustomerMessage] = useState('');
  const [reviewReasonCode, setReviewReasonCode] = useState<string>('custom');
  const [reviewPlanCode, setReviewPlanCode] = useState<TelegramSalesPlanCode | ''>('');
  const [reviewDurationMonths, setReviewDurationMonths] = useState('');
  const [reviewSelectedServerId, setReviewSelectedServerId] = useState('auto');
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_REVIEW' | 'FULFILLED' | 'REJECTED' | 'CANCELLED'>('ALL');
  const [kindFilter, setKindFilter] = useState<'ALL' | 'NEW' | 'RENEW'>('ALL');
  const deferredOrderSearch = useDeferredValue(orderSearch.trim());
  const ordersQuery = trpc.telegramBot.listOrders.useQuery(
    {
      limit: 50,
      statuses: statusFilter === 'ALL' ? undefined : [statusFilter],
      kinds: kindFilter === 'ALL' ? undefined : [kindFilter],
      query: deferredOrderSearch || undefined,
    },
    {
      placeholderData: keepPreviousData,
    },
  );
  const templatesById = useMemo(
    () => new Map((templatesQuery.data || []).map((template) => [template.id, template])),
    [templatesQuery.data],
  );

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
    template: isMyanmar ? 'အသုံးပြုမည့် template' : 'Template to apply',
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
    proofPreview: isMyanmar ? 'Proof preview' : 'Proof preview',
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
  };

  const renderTemplateSummary = (templateId?: string | null, compact = false) => {
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
    if (!settingsQuery.data) {
      return;
    }

    setForm({
      enabled: settingsQuery.data.enabled ?? false,
      allowRenewals: settingsQuery.data.allowRenewals ?? true,
      supportLink: settingsQuery.data.supportLink || DEFAULT_TELEGRAM_SALES_SETTINGS.supportLink,
      paymentReminderHours: String(
        settingsQuery.data.paymentReminderHours ?? DEFAULT_TELEGRAM_SALES_SETTINGS.paymentReminderHours,
      ),
      pendingReviewReminderHours: String(
        settingsQuery.data.pendingReviewReminderHours ??
          DEFAULT_TELEGRAM_SALES_SETTINGS.pendingReviewReminderHours,
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
          templateId: override?.templateId ?? fallbackPlan.templateId,
          fixedDurationDays: override?.fixedDurationDays ?? fallbackPlan.fixedDurationDays ?? null,
        };
      }),
    });
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

  const handleSaveConfig = () => {
    saveConfigMutation.mutate({
      enabled: form.enabled,
      allowRenewals: form.allowRenewals,
      supportLink: form.supportLink.trim(),
      paymentReminderHours: (() => {
        const parsed = Number.parseInt(form.paymentReminderHours.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
      })(),
      pendingReviewReminderHours: (() => {
        const parsed = Number.parseInt(form.pendingReviewReminderHours.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
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
        templateId: plan.templateId || null,
        fixedDurationDays: plan.fixedDurationDays ?? null,
        fixedDurationMonths: plan.fixedDurationMonths ?? null,
        minDurationMonths: plan.minDurationMonths ?? null,
        dataLimitGB: plan.dataLimitGB ?? null,
        unlimitedQuota: plan.unlimitedQuota,
      })),
    });
  };

  const pendingOrders = ((ordersQuery.data || []).filter(
    (order) => order.status === 'PENDING_REVIEW',
  ) as TelegramOrderRow[]);
  const matchedOrders = (ordersQuery.data || []) as TelegramOrderRow[];
  const selectedOrder = reviewTarget
    ? matchedOrders.find((order) => order.id === reviewTarget.orderId) || null
    : null;
  const selectedOrderId = selectedOrder?.id ?? null;
  const selectedOrderRejectionReasonCode = selectedOrder?.rejectionReasonCode ?? null;
  const selectedOrderPlanCode = (selectedOrder?.planCode as TelegramSalesPlanCode | null) ?? null;
  const selectedOrderDurationMonths = selectedOrder?.durationMonths ?? null;
  const selectedOrderSelectedServerId = selectedOrder?.selectedServerId ?? null;
  const selectedOrderProofUrl = selectedOrder
    ? withBasePath(`/api/telegram/orders/${selectedOrder.id}/proof`)
    : '';
  const selectedOrderProofDownloadUrl = selectedOrder
    ? withBasePath(`/api/telegram/orders/${selectedOrder.id}/proof?download=1`)
    : '';
  const selectedOrderProofIsImage = selectedOrder?.paymentProofType === 'photo';
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
  const describeQuota = (order: TelegramOrderRow) => {
    if (order.unlimitedQuota) {
      return isMyanmar ? 'Unlimited quota' : 'Unlimited quota';
    }
    if (!order.dataLimitBytes) {
      return '—';
    }
    return formatBytes(BigInt(order.dataLimitBytes));
  };

  useEffect(() => {
    if (!selectedOrderId) {
      setReviewReasonCode('custom');
      setReviewPlanCode('');
      setReviewDurationMonths('');
      setReviewSelectedServerId('auto');
      return;
    }

    setReviewReasonCode(selectedOrderRejectionReasonCode || 'custom');
    setReviewPlanCode(selectedOrderPlanCode || '');
    setReviewDurationMonths(selectedOrderDurationMonths ? String(selectedOrderDurationMonths) : '');
    setReviewSelectedServerId(selectedOrderSelectedServerId || 'auto');
  }, [
    selectedOrderId,
    selectedOrderRejectionReasonCode,
    selectedOrderPlanCode,
    selectedOrderDurationMonths,
    selectedOrderSelectedServerId,
    reviewTarget?.mode,
  ]);

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
          <div className="grid gap-4 md:grid-cols-2">
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

          <div className="space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{salesUi.paymentAutomation}</p>
              <p className="text-xs text-muted-foreground">{salesUi.paymentAutomationDesc}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
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
                      <Label>{salesUi.template}</Label>
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
                      {renderTemplateSummary(plan.templateId, true)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} disabled={saveConfigMutation.isPending}>
              {saveConfigMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {salesUi.saveConfig}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/[0.03] dark:bg-amber-500/[0.05]">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            {salesUi.reviewQueue}
          </CardTitle>
          <CardDescription>{salesUi.markForReview}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <div key={order.id} className="rounded-2xl border border-border/60 bg-background/55 p-4">
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
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {salesUi.user}: @{order.telegramUsername || 'unknown'} · {order.telegramUserId}
                      </p>
                    </div>
                    {order.status === 'PENDING_REVIEW' ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setReviewTarget({ orderId: order.id, mode: 'approve' });
                            setReviewNote(order.adminNote || '');
                            setReviewCustomerMessage(order.customerMessage || '');
                            setReviewReasonCode(order.rejectionReasonCode || 'custom');
                          }}
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
                            setReviewReasonCode(order.rejectionReasonCode || 'custom');
                          }}
                        >
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          {salesUi.reject}
                        </Button>
                      </div>
                    ) : null}
                  </div>

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
                      <p className="mt-2 text-sm font-medium">{order.targetAccessKeyName || 'New key'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {order.approvedAccessKeyName || order.reviewedBy?.email || '—'}
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

                  {renderTemplateSummary(order.templateId, true)}

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
                                <p className="truncate text-sm font-medium">{key.name}</p>
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

      <Dialog
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewTarget(null);
            setReviewNote('');
            setReviewCustomerMessage('');
            setReviewReasonCode('custom');
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
                    {selectedOrder.requestedName || selectedOrder.targetAccessKeyName || '—'}
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
                  <p className="text-xs text-muted-foreground">{salesUi.proofForwardedHint}</p>
                  {selectedOrder.paymentProofType ? (
                    <div className="mt-3 flex flex-wrap gap-2">
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
                      className="max-h-[26rem] w-full object-contain"
                      loading="lazy"
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

          {selectedOrder ? renderTemplateSummary(selectedOrder.templateId) : null}

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
                          <p className="truncate text-sm font-medium">{key.name}</p>
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
                  disabled={updateOrderDraftMutation.isPending}
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
                approveOrderMutation.isPending ||
                rejectOrderMutation.isPending ||
                updateOrderDraftMutation.isPending
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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className={cn(
              'w-5 h-5',
              hasAlerts ? 'text-orange-500' : 'text-muted-foreground'
            )} />
            {t('notifications.key_alerts.title')}
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
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);

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

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
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
              <div className="ops-support-card">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('notifications.summary.channels')}
                </p>
                <p className="mt-3 text-2xl font-semibold">{channels.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('notifications.summary.channels_desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('notifications.summary.active_channels')}
                </p>
                <p className="mt-3 text-2xl font-semibold">{activeChannels}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('notifications.channel_inactive')}: {Math.max(0, channels.length - activeChannels)}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('notifications.summary.coverage')}
                </p>
                <p className="mt-3 text-2xl font-semibold">{subscribedEventCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('notifications.summary.coverage_desc')}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:hidden">
              <Button onClick={handleOpenCreate} className="h-11 rounded-full px-5">
                <Plus className="w-4 h-4 mr-2" />
                {t('notifications.add_channel')}
              </Button>
            </div>
          </div>

          <div className="hidden xl:block">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{t('notifications.add_channel')}</p>
                <h2 className="text-xl font-semibold">{t('notifications.add_channel')}</h2>
                <p className="text-sm text-muted-foreground">{t('notifications.subtitle')}</p>
              </div>
              <Button onClick={handleOpenCreate} className="h-11 w-full rounded-full">
                <Plus className="w-4 h-4 mr-2" />
                {t('notifications.add_channel')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Key Alerts Card - Primary feature */}
      <KeyAlertsCard />

      <QueueStatusCard />

      {/* Info card */}
      <Card className="border-dashed bg-background/55 dark:bg-white/[0.02]">
        <CardContent className="p-5">
          <div className="flex gap-3">
            <Bell className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('notifications.info.title')}</p>
              <p className="text-sm text-muted-foreground">
                {t('notifications.info.desc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <TelegramBotSetupCard />
      <TelegramSalesWorkflowCard />

      {/* Channels grid */}
      {isChannelsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((item) => (
            <Card key={item}>
              <CardContent className="p-5">
                <div className="space-y-3 animate-pulse">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <Bell className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('notifications.empty.title')}</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              {t('notifications.empty.desc')}
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-2" />
              {t('notifications.empty.btn')}
            </Button>
          </CardContent>
        </Card>
      )}

      <DeliveryHistoryCard channels={channels} />

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
