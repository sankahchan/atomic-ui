'use client';

/**
 * Notifications Page
 *
 * This page allows administrators to configure notification channels for
 * receiving alerts about important system events and view key alerts.
 */

import { keepPreviousData } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useState } from 'react';
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
};

const DEFAULT_TELEGRAM_SETTINGS: TelegramSettings = {
  botToken: '',
  botUsername: '',
  welcomeMessage: 'Welcome! Use /mykeys to view your linked VPN keys.',
  keyNotFoundMessage: 'No linked keys were found. Please contact support to connect your Telegram account.',
  localizedWelcomeMessages: {},
  localizedKeyNotFoundMessages: {},
  isEnabled: false,
  adminChatIds: [],
  dailyDigestEnabled: false,
  dailyDigestHour: 9,
  dailyDigestMinute: 0,
  digestLookbackHours: 24,
};

type TelegramSalesPlanCode = '1m_150gb' | '2m_300gb' | '3plus_unlimited';

type TelegramSalesPlanForm = {
  code: TelegramSalesPlanCode;
  enabled: boolean;
  label: string;
  localizedLabels: {
    en: string;
    my: string;
  };
  priceLabel: string;
  localizedPriceLabels: {
    en: string;
    my: string;
  };
  templateId?: string | null;
  fixedDurationMonths?: number | null;
  minDurationMonths?: number | null;
  dataLimitGB?: number | null;
  unlimitedQuota: boolean;
};

type TelegramSalesSettingsForm = {
  enabled: boolean;
  allowRenewals: boolean;
  paymentInstructions: string;
  localizedPaymentInstructions: {
    en: string;
    my: string;
  };
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
  priceLabel?: string | null;
  durationMonths?: number | null;
  dataLimitBytes?: string | null;
  unlimitedQuota: boolean;
  templateId?: string | null;
  targetAccessKeyId?: string | null;
  targetAccessKeyName?: string | null;
  approvedAccessKeyId?: string | null;
  approvedAccessKeyName?: string | null;
  paymentProofType?: string | null;
  paymentSubmittedAt?: Date | null;
  paymentCaption?: string | null;
  adminNote?: string | null;
  reviewedAt?: Date | null;
  fulfilledAt?: Date | null;
  rejectedAt?: Date | null;
  createdAt: Date;
  reviewedBy?: {
    id: string;
    email?: string | null;
  } | null;
};

const DEFAULT_TELEGRAM_SALES_SETTINGS: TelegramSalesSettingsForm = {
  enabled: false,
  allowRenewals: true,
  paymentInstructions:
    'After payment, send the screenshot here as a photo or document. Your order will stay pending until the admin approves it.',
  localizedPaymentInstructions: {
    en: 'After payment, send the screenshot here as a photo or document. Your order will stay pending until the admin approves it.',
    my: 'ငွေပေးချေပြီးပါက screenshot ကို ဤနေရာတွင် photo သို့မဟုတ် document အဖြစ် ပို့ပေးပါ။ Admin အတည်ပြုပြီးမှ key ကို ထုတ်ပေးပါမည်။',
  },
  plans: [
    {
      code: '1m_150gb',
      enabled: true,
      label: '1 Month / 150 GB',
      localizedLabels: { en: '1 Month / 150 GB', my: '၁ လ / 150 GB' },
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      templateId: null,
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
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      templateId: null,
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
      priceLabel: '',
      localizedPriceLabels: { en: '', my: '' },
      templateId: null,
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
                {telegramUi.userCommands}: <code>/start</code>, <code>/mykeys</code>, <code>/sub</code>,{' '}
                <code>/usage</code>, <code>/server</code>, <code>/renew</code>, <code>/support</code>
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
  const ordersQuery = trpc.telegramBot.listOrders.useQuery({ limit: 30 });
  const templatesQuery = trpc.templates.list.useQuery();
  const [form, setForm] = useState<TelegramSalesSettingsForm>(DEFAULT_TELEGRAM_SALES_SETTINGS);
  const [reviewTarget, setReviewTarget] = useState<{ orderId: string; mode: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const salesUi = {
    title: isMyanmar ? 'Telegram အော်ဒါ flow' : 'Telegram order workflow',
    desc: isMyanmar
      ? 'အသုံးပြုသူများက bot မှတစ်ဆင့် plan ရွေးခြင်း၊ payment proof ပို့ခြင်းနှင့် admin အတည်ပြုချက်ဖြင့် key ရယူနိုင်ပါသည်။'
      : 'Let users pick a plan, upload payment proof, and wait for admin approval before a key is delivered.',
    enableOrders: isMyanmar ? 'Telegram order flow ကို ဖွင့်မည်' : 'Enable Telegram order flow',
    allowRenewals: isMyanmar ? 'Renewal order များကို ခွင့်ပြုမည်' : 'Allow renewal orders',
    paymentInstructions: isMyanmar ? 'Payment လမ်းညွှန်' : 'Payment instructions',
    englishInstructions: isMyanmar ? 'English instructions' : 'English instructions',
    burmeseInstructions: isMyanmar ? 'မြန်မာ instructions' : 'Burmese instructions',
    planConfig: isMyanmar ? 'Plan configuration' : 'Plan configuration',
    planLabel: isMyanmar ? 'Plan အမည်' : 'Plan label',
    burmeseLabel: isMyanmar ? 'မြန်မာ label' : 'Burmese label',
    priceLabel: isMyanmar ? 'စျေးနှုန်း label' : 'Price label',
    burmesePriceLabel: isMyanmar ? 'မြန်မာ စျေးနှုန်း label' : 'Burmese price label',
    template: isMyanmar ? 'အသုံးပြုမည့် template' : 'Template to apply',
    noTemplate: isMyanmar ? 'Template မသုံးပါ' : 'No template',
    behavior: isMyanmar ? 'Plan behavior' : 'Plan behavior',
    enabled: isMyanmar ? 'ဖွင့်ထားသည်' : 'Enabled',
    disabled: isMyanmar ? 'ပိတ်ထားသည်' : 'Disabled',
    unlimited: isMyanmar ? 'Unlimited quota' : 'Unlimited quota',
    months: (count: number) => (isMyanmar ? `${count} လ` : `${count} month${count === 1 ? '' : 's'}`),
    minMonths: (count: number) => (isMyanmar ? `အနည်းဆုံး ${count} လ` : `Minimum ${count} months`),
    dataLimit: (gb: number | null | undefined) =>
      gb ? (isMyanmar ? `${gb} GB limit` : `${gb} GB limit`) : isMyanmar ? 'Unlimited quota' : 'Unlimited quota',
    saveConfig: isMyanmar ? 'Order settings သိမ်းမည်' : 'Save order settings',
    saved: isMyanmar ? 'Telegram order settings သိမ်းပြီးပါပြီ' : 'Telegram order settings saved',
    savedDesc: isMyanmar ? 'Plan configuration နှင့် payment instructions ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Plan configuration and payment instructions were updated.',
    pendingTitle: isMyanmar ? 'Pending review orders' : 'Pending review orders',
    reviewQueue: isMyanmar ? 'Review queue' : 'Review queue',
    noOrders: isMyanmar ? 'အော်ဒါ မရှိသေးပါ။' : 'No Telegram orders yet.',
    user: isMyanmar ? 'User' : 'User',
    order: isMyanmar ? 'Order' : 'Order',
    proof: isMyanmar ? 'Payment proof' : 'Payment proof',
    target: isMyanmar ? 'Target key' : 'Target key',
    submitted: isMyanmar ? 'Submitted' : 'Submitted',
    status: isMyanmar ? 'Status' : 'Status',
    approve: isMyanmar ? 'အတည်ပြုမည်' : 'Approve',
    reject: isMyanmar ? 'ပယ်မည်' : 'Reject',
    adminNote: isMyanmar ? 'Admin note' : 'Admin note',
    approveSuccess: isMyanmar ? 'အော်ဒါကို အတည်ပြုပြီး key ပေးပြီးပါပြီ' : 'Order approved and key delivered',
    rejectSuccess: isMyanmar ? 'အော်ဒါကို ပယ်ပြီး Telegram သို့ အသိပေးပြီးပါပြီ' : 'Order rejected and user notified',
    deliveryWarning: isMyanmar ? 'Key ကို ဖန်တီးပြီးပေမယ့် Telegram ပို့မှု မအောင်မြင်ပါ' : 'Key was created but Telegram delivery failed',
    markForReview: isMyanmar ? 'Payment proof ကို admin များ Telegram chat တွင် စစ်ဆေးပါ။' : 'Review the payment proof from your Telegram admin chat before approving.',
    awaitingProof: isMyanmar ? 'Payment proof စောင့်နေသည်' : 'Awaiting payment proof',
    fulfilled: isMyanmar ? 'Fulfilled' : 'Fulfilled',
    rejected: isMyanmar ? 'Rejected' : 'Rejected',
    pending: isMyanmar ? 'Pending review' : 'Pending review',
  };

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setForm({
      enabled: settingsQuery.data.enabled ?? false,
      allowRenewals: settingsQuery.data.allowRenewals ?? true,
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
      plans: DEFAULT_TELEGRAM_SALES_SETTINGS.plans.map((fallbackPlan) => {
        const override = settingsQuery.data.plans.find((plan) => plan.code === fallbackPlan.code);
        return {
          ...fallbackPlan,
          ...override,
          localizedLabels: {
            en: override?.localizedLabels?.en || override?.label || fallbackPlan.localizedLabels.en,
            my: override?.localizedLabels?.my || fallbackPlan.localizedLabels.my,
          },
          localizedPriceLabels: {
            en: override?.localizedPriceLabels?.en || override?.priceLabel || fallbackPlan.localizedPriceLabels.en,
            my: override?.localizedPriceLabels?.my || fallbackPlan.localizedPriceLabels.my,
          },
          templateId: override?.templateId ?? fallbackPlan.templateId,
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

  const updatePlan = (
    planCode: TelegramSalesPlanCode,
    updater: (plan: TelegramSalesPlanForm) => TelegramSalesPlanForm,
  ) => {
    setForm((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) => (plan.code === planCode ? updater(plan) : plan)),
    }));
  };

  const handleSaveConfig = () => {
    saveConfigMutation.mutate({
      enabled: form.enabled,
      allowRenewals: form.allowRenewals,
      paymentInstructions: form.paymentInstructions.trim(),
      localizedPaymentInstructions: {
        en: form.localizedPaymentInstructions.en.trim(),
        my: form.localizedPaymentInstructions.my.trim(),
      },
      plans: form.plans.map((plan) => ({
        code: plan.code,
        enabled: plan.enabled,
        label: plan.label.trim(),
        localizedLabels: {
          en: plan.localizedLabels.en.trim(),
          my: plan.localizedLabels.my.trim(),
        },
        priceLabel: plan.priceLabel.trim(),
        localizedPriceLabels: {
          en: plan.localizedPriceLabels.en.trim(),
          my: plan.localizedPriceLabels.my.trim(),
        },
        templateId: plan.templateId || null,
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
              <p className="text-sm font-medium">{salesUi.planConfig}</p>
              <p className="text-xs text-muted-foreground">
                {isMyanmar ? 'Bot မှ အသုံးပြုမည့် plan, price label နှင့် template ကို သတ်မှတ်ပါ။' : 'Set the plan labels, price labels, and templates used by the Telegram bot.'}
              </p>
            </div>
            <div className="space-y-3">
              {form.plans.map((plan) => (
                <div key={plan.code} className="rounded-2xl border border-border/60 bg-background/55 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{plan.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {plan.fixedDurationMonths
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
          <div className="flex flex-wrap gap-2">
            <Badge variant={pendingOrders.length > 0 ? 'default' : 'secondary'}>
              {salesUi.pendingTitle}: {pendingOrders.length}
            </Badge>
            <Badge variant="outline">
              {isMyanmar ? `စုစုပေါင်း ${ordersQuery.data?.length || 0} ခု` : `Total ${ordersQuery.data?.length || 0} orders`}
            </Badge>
          </div>

          {ordersQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isMyanmar ? 'Telegram orders များကို ရယူနေသည်…' : 'Loading Telegram orders…'}
            </div>
          ) : !ordersQuery.data?.length ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
              {salesUi.noOrders}
            </div>
          ) : (
            <div className="space-y-3">
              {ordersQuery.data.map((order) => (
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
                                : order.status}
                        </Badge>
                        <Badge variant="outline">{order.kind}</Badge>
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
                        {order.requestedName || order.targetAccessKeyName || '—'}
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

                  {order.adminNote ? (
                    <div className="mt-3 rounded-xl border border-border/50 bg-background/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {salesUi.adminNote}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{order.adminNote}</p>
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
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewTarget?.mode === 'approve' ? salesUi.approve : salesUi.reject}
            </DialogTitle>
            <DialogDescription>{salesUi.markForReview}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="telegram-order-review-note">{salesUi.adminNote}</Label>
            <Textarea
              id="telegram-order-review-note"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              rows={5}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewTarget(null);
                setReviewNote('');
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
                });
              }}
              disabled={approveOrderMutation.isPending || rejectOrderMutation.isPending}
            >
              {approveOrderMutation.isPending || rejectOrderMutation.isPending ? (
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
