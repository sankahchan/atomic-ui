'use client';

/**
 * Access Keys Page
 * 
 * This page provides comprehensive management of VPN access keys. It displays
 * all keys across servers with filtering, searching, and bulk operations.
 * Each key shows its usage statistics, expiration status, and provides
 * quick actions for common tasks.
 * 
 * The page supports:
 * - Filtering by server, status, and search term
 * - Creating new keys with various configuration options
 * - Bulk operations for efficiency
 * - QR code generation for easy sharing
 * - Detailed key information with copy functionality
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { keepPreviousData } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SegmentedUsageBarCompact } from '@/components/ui/segmented-usage-bar';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogSectionDescription,
  DialogSectionHeader,
  DialogSectionTitle,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { withBasePath } from '@/lib/base-path';
import { useToast } from '@/hooks/use-toast';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { cn, formatBytes, formatRelativeTime, formatDateTime, getCountryFlag } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Plus,
  HelpCircle,
  Key,
  Search,
  RefreshCw,
  Trash2,
  Copy,
  QrCode,
  MoreVertical,
  Filter,
  Download,
  Clock,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  X,
  Power,
  Link as LinkIcon,
  FileJson,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Wifi,
  HardDrive,
  ArrowUpDown,
  Smartphone,
  LayoutGrid,
  LayoutList,
  Share2,
  MessageSquare,
  Calendar,
  FileText,
  Archive,
  List as ListIcon,
  Tag,
  User,
  LinkIcon as LinkCopy,
  Pencil,
  ArrowRightLeft,
  Sparkles,
} from 'lucide-react';
import { MobileCardView } from '@/components/mobile-card-view';
import { TrafficSparkline } from '@/components/ui/traffic-chart';
import { ServerGroupList } from '@/components/keys/server-group-list';
import { ServerLifecycleBadge, getServerLifecycleMeta } from '@/components/servers/server-lifecycle-badge';
import { copyToClipboard } from '@/lib/clipboard';
import { QRCodeWithLogo } from '@/components/qr-code-with-logo';
import { usePersistedFilters } from '@/hooks/use-persisted-filters';
import { getTheme, subscriptionThemeIds, themeList } from '@/lib/subscription-themes';
import {
  getTagDisplayLabel,
  getTagToneClassName,
  KEY_SOURCE_TAGS,
  KEY_TAG_PRESETS,
  stringToTags,
  tagsToString,
  toggleEditableTagList,
} from '@/lib/tags';
import {
  buildSharePageUrl,
  buildShortShareUrl,
  buildSubscriptionClientUrl,
} from '@/lib/subscription-links';
import { normalizePublicSlug, slugifyPublicName } from '@/lib/public-slug';
import { KeysBulkActionsBar } from './_components/keys-bulk-actions-bar';
import { RenewKeyDialog, type RenewKeyDialogKeyData } from '@/components/keys/renew-key-dialog';
import { RenewalPackagePicker } from '@/components/keys/renewal-package-picker';
import type { RenewalPackagePreset } from '@/lib/renewal-package-presets';
import { getRenewalOutreachCurrentCycleActivityAt } from '@/lib/renewal-outreach-tracking';

/**
 * Status badge configuration for visual consistency
 * Each status has a specific color scheme and icon
 */
/**
 * Supported encryption methods for Shadowsocks
 */
const ENCRYPTION_METHODS = [
  { value: 'chacha20-ietf-poly1305', label: 'ChaCha20-IETF-Poly1305 (Recommended)' },
  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
  { value: 'aes-192-gcm', label: 'AES-192-GCM' },
  { value: 'aes-256-gcm', label: 'AES-256-GCM' },
] as const;

const ACCESS_KEY_SOFT_DEVICE_LIMIT_HINT =
  'Counts managed-install and app activity as an estimate. The official share page can block extra installs, but a copied raw ss:// secret can still be reused. Use a dynamic key for stronger anti-sharing.';

const ACCESS_KEY_PROTECTED_INSTALL_HINT =
  'Hide the raw reusable ss:// secret on the official share page and client-link flow. This reduces casual sharing there, but it cannot hard-block a raw ss:// secret copied from an approved device.';

const ACCESS_KEY_RAW_COPY_WARNING =
  'Copying or exporting the raw access URL weakens device-limit protection because Outline will accept that ss:// secret on any device.';

const CREATE_CONTACT_TYPES = [
  { value: 'telegram', label: 'Telegram', icon: '📱' },
  { value: 'discord', label: 'Discord', icon: '🎮' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'phone', label: 'Phone', icon: '📞' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'website', label: 'Website', icon: '🌐' },
  { value: 'facebook', label: 'Facebook', icon: '👤' },
] as const;

type CreateContactLink = {
  type: typeof CREATE_CONTACT_TYPES[number]['value'];
  value: string;
};

const statusConfig = {
  ACTIVE: {
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: CheckCircle2,
    labelKey: 'keys.status.active'
  },
  DISABLED: {
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: XCircle,
    labelKey: 'keys.status.disabled'
  },
  EXPIRED: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: Clock,
    labelKey: 'keys.status.expired'
  },
  DEPLETED: {
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: AlertTriangle,
    labelKey: 'keys.status.depleted'
  },
  PENDING: {
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: Clock,
    labelKey: 'keys.status.pending'
  },
};

type CreatedKeySummary = {
  id: string;
  name: string;
  accessUrl: string | null;
  subscriptionToken: string | null;
  publicSlug?: string | null;
  method: string | null;
  port: number | null;
  password: string | null;
  expiresAt: Date | string | null;
  dataLimitBytes: bigint | null;
  maxDevices?: number | null;
  boundDeviceInstallsOnly?: boolean | null;
  server: {
    id: string;
    name: string;
    countryCode: string | null;
    lifecycleMode?: string | null;
  } | null;
};

type DeviceLimitVisualState = {
  estimatedDevices?: number | null;
  maxDevices?: number | null;
  deviceLimitObservedDevices?: number | null;
  deviceLimitOverLimit?: boolean;
  deviceLimitEnforcementStage?: string | null;
  deviceLimitSuppressedUntil?: Date | string | null;
  deviceLimitAutoDisabledAt?: Date | string | null;
};

type RenewalOutreachOutcome = 'DONE' | 'SENT' | 'REPLIED' | 'RENEWED' | 'NO_RESPONSE';
type RenewalOutreachAgeQuickFilter = 'outreachOlderThan24h' | 'outreachOlderThan72h';
type RenewalOutreachLaneFilter = 'stalePendingResult' | 'staleSent' | 'staleNoResponse';
type RenewalOutreachMetaInput = {
  lastPreparedAt?: Date | string | null;
  lastCompletedAt?: Date | string | null;
  lastResultAt?: Date | string | null;
  lastOutcome?: RenewalOutreachOutcome | null;
  preparedThisCycle?: boolean;
  resultLoggedThisCycle?: boolean;
  completedThisCycle?: boolean;
  pendingResult?: boolean;
  pendingCompletion?: boolean;
  neverPrepared?: boolean;
} | null | undefined;

type RenewalOutreachStaleSummary = {
  olderThan24h: number;
  olderThan72h: number;
  pendingResult24h: number;
  pendingResult72h: number;
  sent24h: number;
  sent72h: number;
  noResponse24h: number;
  noResponse72h: number;
};

type RenewalOutreachQuickFilter =
  | 'outreachNeverPrepared'
  | 'outreachPendingResult'
  | 'outreachSent'
  | 'outreachReplied'
  | 'outreachRenewed'
  | 'outreachNoResponse'
  | 'outreachDone';

const RENEWAL_OUTREACH_OUTCOME_OPTIONS: RenewalOutreachOutcome[] = [
  'SENT',
  'REPLIED',
  'RENEWED',
  'NO_RESPONSE',
  'DONE',
];

function getDeviceLimitVisualState(key: DeviceLimitVisualState) {
  const deviceCount = key.deviceLimitObservedDevices ?? key.estimatedDevices ?? 0;
  const overLimit = key.deviceLimitOverLimit ?? (key.maxDevices != null && deviceCount > key.maxDevices);
  const stage = key.deviceLimitEnforcementStage ?? (overLimit ? 'PENDING_DISABLE' : 'OK');
  const stageLabel =
    stage === 'SUPPRESSED'
      ? 'Suppressed'
      : stage === 'DISABLED'
        ? 'Auto-disabled'
        : stage === 'PENDING_DISABLE'
          ? 'Disable pending'
          : stage === 'WARNED'
            ? 'Warning sent'
            : 'Estimated';

  return {
    deviceCount,
    overLimit,
    stage,
    stageLabel,
  };
}

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function getKeySubscriptionPageUrl(
  subscriptionToken?: string | null,
  publicSlug?: string | null,
  locale?: string | null,
): string {
  if (typeof window === 'undefined') {
    return '';
  }

  if (publicSlug) {
    return buildShortShareUrl(publicSlug, { origin: window.location.origin, lang: locale });
  }

  if (!subscriptionToken) {
    return '';
  }

  return buildSharePageUrl(subscriptionToken, { origin: window.location.origin, lang: locale });
}

function getRenewalReminderMeta(
  reminder: {
    lastReminderAt?: Date | string | null;
    cooldownUntil?: Date | string | null;
    neverReminded?: boolean;
    remindedToday?: boolean;
    reminded24hAgo?: boolean;
    renewedAfterReminder?: boolean;
    pendingFollowUp?: boolean;
    cooldownActive?: boolean;
  } | null | undefined,
  isMyanmar: boolean,
) {
  const lastReminderAt = reminder?.lastReminderAt ? new Date(reminder.lastReminderAt) : null;
  const cooldownUntil = reminder?.cooldownUntil ? new Date(reminder.cooldownUntil) : null;

  if (!lastReminderAt || reminder?.neverReminded) {
    return {
      label: isMyanmar ? 'သတိပေးချက် မပို့ရသေး' : 'Never reminded',
      detail: isMyanmar ? 'Renewal reminder မပို့ရသေးပါ။' : 'No renewal reminder has been sent yet.',
      badgeClassName: 'border-border/60 text-muted-foreground',
    };
  }

  if (reminder?.renewedAfterReminder) {
    return {
      label: isMyanmar ? 'သတိပေးပြီး Renew လုပ်ပြီး' : 'Renewed after reminder',
      detail: isMyanmar
        ? `${formatRelativeTime(lastReminderAt)} တွင် reminder ပို့ပြီးနောက် renew လုပ်ထားသည်။`
        : `Renewed after a reminder sent ${formatRelativeTime(lastReminderAt)}.`,
      badgeClassName: 'border-emerald-500/40 text-emerald-500',
    };
  }

  if (reminder?.pendingFollowUp) {
    return {
      label: isMyanmar ? 'Follow-up လိုအပ်' : 'Follow-up due',
      detail: isMyanmar
        ? `နောက်ဆုံး reminder ကို ${formatRelativeTime(lastReminderAt)} ပို့ခဲ့သည်။`
        : `Last reminder was sent ${formatRelativeTime(lastReminderAt)}.`,
      badgeClassName: 'border-orange-500/40 text-orange-500',
    };
  }

  if (reminder?.cooldownActive) {
    return {
      label: isMyanmar ? 'Cooldown အတွင်း' : 'Cooldown active',
      detail: cooldownUntil
        ? (isMyanmar
          ? `${formatRelativeTime(lastReminderAt)} ပို့ခဲ့သည်။ နောက်တစ်ကြိမ် ${formatDateTime(cooldownUntil)} ပြီးမှ ပို့နိုင်သည်။`
          : `Sent ${formatRelativeTime(lastReminderAt)}. Retry after ${formatDateTime(cooldownUntil)}.`)
        : (isMyanmar
          ? `${formatRelativeTime(lastReminderAt)} ပို့ခဲ့သည်။`
          : `Sent ${formatRelativeTime(lastReminderAt)}.`),
      badgeClassName: 'border-amber-500/40 text-amber-500',
    };
  }

  if (reminder?.remindedToday) {
    return {
      label: isMyanmar ? 'ဒီနေ့ reminder ပို့ပြီး' : 'Reminded today',
      detail: isMyanmar
        ? `${formatRelativeTime(lastReminderAt)} reminder ပို့ခဲ့သည်။`
        : `Reminder sent ${formatRelativeTime(lastReminderAt)}.`,
      badgeClassName: 'border-sky-500/40 text-sky-500',
    };
  }

  return {
    label: isMyanmar ? 'Reminder ပို့ပြီး' : 'Reminder sent',
    detail: isMyanmar
      ? `${formatRelativeTime(lastReminderAt)} reminder ပို့ခဲ့သည်။`
      : `Reminder sent ${formatRelativeTime(lastReminderAt)}.`,
    badgeClassName: 'border-sky-500/40 text-sky-500',
  };
}

function getRenewalExceptionMeta(
  exception: {
    blockedReason?: string | null;
    cooldownUntil?: Date | string | null;
    needsTelegramLink?: boolean;
    deliveryDisabled?: boolean;
    automationBlocked?: boolean;
    reminderFailed?: boolean;
    lastFailedAt?: Date | string | null;
    lastFailedReason?: string | null;
  } | null | undefined,
  isMyanmar: boolean,
) {
  if (!exception) {
    return null;
  }

  const lastFailedAt = exception.lastFailedAt ? new Date(exception.lastFailedAt) : null;
  const cooldownUntil = exception.cooldownUntil ? new Date(exception.cooldownUntil) : null;

  if (exception.reminderFailed) {
    return {
      label: isMyanmar ? 'Reminder ပို့မအောင်မြင်' : 'Reminder failed',
      detail: isMyanmar
        ? `${lastFailedAt ? `${formatRelativeTime(lastFailedAt)} တွင် ` : ''}${exception.lastFailedReason || 'Telegram reminder ပို့မရပါ။'}`
        : `${lastFailedAt ? `Last failure ${formatRelativeTime(lastFailedAt)}. ` : ''}${exception.lastFailedReason || 'Telegram reminder delivery failed.'}`,
      badgeClassName: 'border-red-500/40 text-red-500',
    };
  }

  if (exception.deliveryDisabled) {
    return {
      label: isMyanmar ? 'Telegram ပို့ဆောင်မှု ပိတ်ထားသည်' : 'Telegram delivery off',
      detail: isMyanmar
        ? 'ဒီ key အတွက် Telegram delivery ပိတ်ထားသည်။ ဖွင့်ပြီးမှ reminder ပို့နိုင်သည်။'
        : 'Telegram delivery is disabled for this key. Enable it before sending reminders.',
      badgeClassName: 'border-amber-500/40 text-amber-500',
    };
  }

  if (exception.needsTelegramLink) {
    return {
      label: isMyanmar ? 'Telegram chat မချိတ်ရသေး' : 'No Telegram link',
      detail: isMyanmar
        ? 'Telegram chat ချိတ်ဆက်ထားခြင်းမရှိသေးပါ။ Connect link ကိုပို့ပြီး ချိတ်ဆက်ရန်လိုအပ်သည်။'
        : 'No Telegram chat is linked yet. Send the connect link before retrying reminders.',
      badgeClassName: 'border-violet-500/40 text-violet-400',
    };
  }

  if (exception.automationBlocked) {
    if (exception.blockedReason === 'COOLDOWN') {
      return {
        label: isMyanmar ? 'Automation cooldown' : 'Automation cooldown',
        detail: cooldownUntil
          ? (isMyanmar
            ? `Cooldown ပြီးသည့် ${formatDateTime(cooldownUntil)} နောက်မှ automation က reminder ပို့နိုင်မည်။`
            : `Automation can retry after ${formatDateTime(cooldownUntil)}.`)
          : (isMyanmar
            ? 'Cooldown ကာလအတွင်း ရှိနေသည်။'
            : 'This key is still inside the reminder cooldown window.'),
        badgeClassName: 'border-orange-500/40 text-orange-500',
      };
    }

    if (exception.blockedReason === 'ALREADY_SENT_FOR_WAVE') {
      return {
        label: isMyanmar ? 'ဒီ cycle အတွက် ပို့ပြီး' : 'Already reminded',
        detail: isMyanmar
          ? 'လက်ရှိ renewal cycle အတွက် reminder ပို့ပြီးသားဖြစ်သည်။ Renew ပြီးမှ automation wave အသစ်ရမည်။'
          : 'This renewal cycle already received a reminder. Renew first, then the next cycle becomes eligible.',
        badgeClassName: 'border-sky-500/40 text-sky-500',
      };
    }

    if (exception.blockedReason === 'WAVE_DISABLED') {
      return {
        label: isMyanmar ? 'Automation wave ပိတ်ထားသည်' : 'Automation wave off',
        detail: isMyanmar
          ? 'ဒီ renewal wave ကို Telegram automation settings မှာ ပိတ်ထားသည်။'
          : 'This renewal wave is disabled in Telegram automation settings.',
        badgeClassName: 'border-muted-foreground/40 text-muted-foreground',
      };
    }
  }

  return null;
}

function getRenewalOutreachMeta(
  outreach: RenewalOutreachMetaInput,
  isMyanmar: boolean,
) {
  const lastPreparedAt = outreach?.lastPreparedAt ? new Date(outreach.lastPreparedAt) : null;
  const lastResultAt = outreach?.lastResultAt
    ? new Date(outreach.lastResultAt)
    : outreach?.lastCompletedAt
      ? new Date(outreach.lastCompletedAt)
      : null;

  if ((outreach?.resultLoggedThisCycle || outreach?.completedThisCycle) && lastResultAt) {
    const outcomeMeta = getRenewalOutreachOutcomeMeta(outreach?.lastOutcome ?? 'DONE', isMyanmar);
    return {
      label: outcomeMeta.label,
      detail: isMyanmar
        ? `${formatRelativeTime(lastResultAt)} ${outcomeMeta.detailMy}`
        : `${outcomeMeta.detailEn} ${formatRelativeTime(lastResultAt)}.`,
      badgeClassName: outcomeMeta.badgeClassName,
    };
  }

  if ((outreach?.pendingResult || outreach?.pendingCompletion) && lastPreparedAt) {
    return {
      label: isMyanmar ? 'Outreach pack ပြင်ပြီး' : 'Outreach prepared',
      detail: isMyanmar
        ? `${formatRelativeTime(lastPreparedAt)} outreach pack ကို ပြင်ထားပြီး complete မမှတ်ရသေးပါ။`
        : `Outreach material was prepared ${formatRelativeTime(lastPreparedAt)} but no result is logged yet.`,
      badgeClassName: 'border-sky-500/40 text-sky-500',
    };
  }

  return {
    label: isMyanmar ? 'Outreach မမှတ်ရသေး' : 'No outreach log',
    detail: isMyanmar
      ? 'လက်ရှိ renewal cycle အတွက် manual outreach activity မရှိသေးပါ။'
      : 'No manual outreach activity is logged for this renewal cycle yet.',
    badgeClassName: 'border-border/60 text-muted-foreground',
  };
}

function getRenewalOutreachAgeMeta(outreach: RenewalOutreachMetaInput) {
  const activityAt = getRenewalOutreachCurrentCycleActivityAt({
    lastPreparedAt: outreach?.lastPreparedAt ? new Date(outreach.lastPreparedAt) : null,
    lastCompletedAt: outreach?.lastCompletedAt ? new Date(outreach.lastCompletedAt) : null,
    lastResultAt: outreach?.lastResultAt ? new Date(outreach.lastResultAt) : null,
    preparedThisCycle: outreach?.preparedThisCycle,
    resultLoggedThisCycle: outreach?.resultLoggedThisCycle,
    completedThisCycle: outreach?.completedThisCycle,
    pendingResult: outreach?.pendingResult,
    pendingCompletion: outreach?.pendingCompletion,
  });

  if (!activityAt) {
    return null;
  }

  const ageHours = Math.max(0, (Date.now() - activityAt.getTime()) / (60 * 60 * 1000));
  const outcome = outreach?.lastOutcome ?? null;
  const needsAttention =
    outreach?.pendingResult
    || outreach?.pendingCompletion
    || outcome === 'SENT'
    || outcome === 'NO_RESPONSE';

  const tone =
    !needsAttention
      ? {
          badgeClassName: 'border-emerald-500/40 text-emerald-500',
        }
      : ageHours >= 72
        ? {
            badgeClassName: 'border-red-500/40 text-red-500',
          }
        : ageHours >= 24 || outcome === 'NO_RESPONSE'
          ? {
              badgeClassName: 'border-amber-500/40 text-amber-500',
            }
          : {
              badgeClassName: 'border-sky-500/40 text-sky-500',
            };

  const relativeTime = formatRelativeTime(activityAt);
  return {
    label: relativeTime,
    ...tone,
  };
}

function getRenewalOutreachStaleLaneCount(
  summary: RenewalOutreachStaleSummary,
  lane: RenewalOutreachLaneFilter,
  ageFilter: RenewalOutreachAgeQuickFilter | null,
) {
  const use72h = ageFilter === 'outreachOlderThan72h';

  switch (lane) {
    case 'stalePendingResult':
      return use72h ? summary.pendingResult72h : summary.pendingResult24h;
    case 'staleSent':
      return use72h ? summary.sent72h : summary.sent24h;
    case 'staleNoResponse':
      return use72h ? summary.noResponse72h : summary.noResponse24h;
    default:
      return 0;
  }
}

function getRenewalOutreachOutcomeMeta(outcome: RenewalOutreachOutcome, isMyanmar: boolean) {
  switch (outcome) {
    case 'SENT':
      return {
        label: isMyanmar ? 'Outreach ပို့ပြီး' : 'Outreach sent',
        detailMy: 'manual outreach ပို့ပြီးကြောင်း မှတ်ထားသည်။',
        detailEn: 'Manual outreach was logged as sent',
        badgeClassName: 'border-sky-500/40 text-sky-500',
      };
    case 'REPLIED':
      return {
        label: isMyanmar ? 'အသုံးပြုသူ ပြန်စာပို့' : 'Customer replied',
        detailMy: 'အသုံးပြုသူ ပြန်စာပို့ပြီးကြောင်း မှတ်ထားသည်။',
        detailEn: 'A customer reply was logged',
        badgeClassName: 'border-emerald-500/40 text-emerald-500',
      };
    case 'RENEWED':
      return {
        label: isMyanmar ? 'Outreach ပြီး renew ဖြစ်' : 'Renewed after outreach',
        detailMy: 'manual outreach နောက် renewal ဖြစ်သွားကြောင်း မှတ်ထားသည်။',
        detailEn: 'A renewal conversion was logged',
        badgeClassName: 'border-emerald-500/40 text-emerald-500',
      };
    case 'NO_RESPONSE':
      return {
        label: isMyanmar ? 'ပြန်စာမရှိ' : 'No response',
        detailMy: 'ပြန်စာမရှိသေးကြောင်း မှတ်ထားသည်။',
        detailEn: 'No response was logged',
        badgeClassName: 'border-amber-500/40 text-amber-500',
      };
    case 'DONE':
    default:
      return {
        label: isMyanmar ? 'Outreach ပြီးပါပြီ' : 'Outreach done',
        detailMy: 'manual outreach ပြီးစီးကြောင်း မှတ်ထားသည်။',
        detailEn: 'Manual outreach was marked complete',
        badgeClassName: 'border-emerald-500/40 text-emerald-500',
      };
  }
}

function getRenewalOutreachOutcomeOptionLabel(outcome: RenewalOutreachOutcome, isMyanmar: boolean) {
  switch (outcome) {
    case 'SENT':
      return isMyanmar ? 'ပို့ပြီး' : 'Sent';
    case 'REPLIED':
      return isMyanmar ? 'ပြန်စာရပြီး' : 'Replied';
    case 'RENEWED':
      return isMyanmar ? 'renew ဖြစ်ပြီး' : 'Renewed';
    case 'NO_RESPONSE':
      return isMyanmar ? 'ပြန်စာမရှိ' : 'No response';
    case 'DONE':
    default:
      return isMyanmar ? 'ပြီးစီး' : 'Done';
  }
}

function getRenewalOutreachOutcomeOptionDescription(outcome: RenewalOutreachOutcome, isMyanmar: boolean) {
  switch (outcome) {
    case 'SENT':
      return isMyanmar
        ? 'Message ပို့ပြီးကြောင်းကို audit trail ထဲမှာ မှတ်မည်။'
        : 'Log that the manual outreach message was sent.';
    case 'REPLIED':
      return isMyanmar
        ? 'အသုံးပြုသူ reply ပြန်လာကြောင်းကို မှတ်မည်။'
        : 'Log that the customer replied after outreach.';
    case 'RENEWED':
      return isMyanmar
        ? 'Outreach နောက် renewal conversion ဖြစ်သွားကြောင်း မှတ်မည်။'
        : 'Log that the outreach converted into a renewal.';
    case 'NO_RESPONSE':
      return isMyanmar
        ? 'ပြန်စာမရှိသေးကြောင်းကို မှတ်မည်။'
        : 'Log that no reply has come back yet.';
    case 'DONE':
    default:
      return isMyanmar
        ? 'Outcome မခွဲဘဲ handled အဖြစ် မှတ်မည်။'
        : 'Mark the outreach cycle as handled without a specific outcome.';
  }
}

function KeyTagChip({
  tag,
  count,
  active = false,
  onClick,
  compact = false,
}: {
  tag: string;
  count?: number;
  active?: boolean;
  onClick?: (tag: string) => void;
  compact?: boolean;
}) {
  const content = (
    <>
      <span>{getTagDisplayLabel(tag)}</span>
      {typeof count === 'number' ? (
        <span className="rounded-full bg-black/8 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/10">
          {count}
        </span>
      ) : null}
    </>
  );

  const className = cn(
    'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
    getTagToneClassName(tag),
    active && 'border-primary/45 ring-2 ring-primary/10 dark:border-cyan-400/30'
  );

  if (!onClick) {
    return <span className={className}>{content}</span>;
  }

  return (
    <button type="button" className={className} onClick={() => onClick(tag)}>
      {content}
    </button>
  );
}

/**
 * CreateKeyDialog Component
 * 
 * A comprehensive dialog for creating new access keys with support for
 * various configuration options including data limits, expiration types,
 * and server selection.
 */
function CreateKeyDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (createdKey: CreatedKeySummary) => void;
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [formData, setFormData] = useState<{
    serverId: string;
    name: string;
    publicSlug: string;
    email: string;
    telegramId: string;
    notes: string;
    tags: string;
    dataLimitGB: string;
    dataLimitResetStrategy: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER';
    expirationType: 'NEVER' | 'FIXED_DATE' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE';
    expiresAt: string;
    durationDays: string;
    method: string;
    userId: string;
    templateId: string;
    subscriptionTheme: string;
    coverImageUrl: string;
    subscriptionWelcomeMessage: string;
    sharePageEnabled: boolean;
    clientLinkEnabled: boolean;
    telegramDeliveryEnabled: boolean;
    autoDisableOnLimit: boolean;
    autoDisableOnExpire: boolean;
    autoArchiveAfterDays: string;
    quotaAlertThresholds: string;
    maxDevices: string;
    boundDeviceInstallsOnly: boolean;
    autoRenewPolicy: 'NONE' | 'EXTEND_DURATION';
    autoRenewDurationDays: string;
  }>({
    serverId: 'auto',
    name: '',
    publicSlug: '',
    email: '',
    telegramId: '',
    notes: '',
    tags: '',
    dataLimitGB: '',
    dataLimitResetStrategy: 'NEVER',
    expirationType: 'NEVER',
    expiresAt: '',
    durationDays: '',
    method: 'chacha20-ietf-poly1305',
    userId: 'unassigned', // Use 'unassigned' to represent null/undefined in Select
    templateId: 'none',
    subscriptionTheme: 'default',
    coverImageUrl: '',
    subscriptionWelcomeMessage: '',
    sharePageEnabled: true,
    clientLinkEnabled: true,
    telegramDeliveryEnabled: true,
    autoDisableOnLimit: true,
    autoDisableOnExpire: true,
    autoArchiveAfterDays: '0',
    quotaAlertThresholds: '80,90',
    maxDevices: '',
    boundDeviceInstallsOnly: true,
    autoRenewPolicy: 'NONE',
    autoRenewDurationDays: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [shareContacts, setShareContacts] = useState<CreateContactLink[]>([]);
  const [newContactType, setNewContactType] = useState<CreateContactLink['type']>('telegram');
  const [newContactValue, setNewContactValue] = useState('');
  const [globalSubscriptionTheme, setGlobalSubscriptionTheme] = useState('dark');
  const [openPreviewAfterCreate, setOpenPreviewAfterCreate] = useState(false);
  const [copyShareLinkAfterCreate, setCopyShareLinkAfterCreate] = useState(false);
  const [sendSharePageViaTelegramAfterCreate, setSendSharePageViaTelegramAfterCreate] = useState(false);
  const previewWindowRef = useRef<Window | null>(null);

  // Fetch templates
  const { data: templates } = trpc.templates.list.useQuery(undefined, {
    enabled: open,
  });

  // Fetch servers for selection
  const { data: servers } = trpc.servers.list.useQuery(undefined, {
    enabled: open,
  });
  const smartAssignmentQuery = trpc.servers.recommendAssignmentTarget.useQuery(undefined, {
    enabled: open,
  });
  // Fetch users for assignment
  const { data: users } = trpc.users.list.useQuery(undefined, {
    enabled: open,
  });
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const globalShareThemeName = themeList.find((theme) => theme.id === globalSubscriptionTheme)?.name || globalSubscriptionTheme;
  const selectedShareTheme = getTheme(
    formData.subscriptionTheme === 'default' ? globalSubscriptionTheme : formData.subscriptionTheme,
  );
  const previewSlug = formData.publicSlug.trim();
  const normalizedPreviewSlug = normalizePublicSlug(previewSlug);
  const hasPreviewSlug = normalizedPreviewSlug.length >= 3;
  const slugAvailabilityQuery = trpc.keys.checkPublicSlugAvailability.useQuery(
    { slug: normalizedPreviewSlug },
    {
      enabled: open && hasPreviewSlug,
      retry: false,
      staleTime: 5_000,
    },
  );
  const selectedCreateTags = useMemo(() => stringToTags(formData.tags), [formData.tags]);
  const manuallySelectedServer = useMemo(
    () => servers?.find((server) => server.id === formData.serverId) ?? null,
    [formData.serverId, servers],
  );
  const selectedServerLifecycleMode = manuallySelectedServer?.lifecycleMode ?? 'ACTIVE';

  useEffect(() => {
    if (slugTouched) {
      return;
    }

    const nextSlug = formData.name.trim() ? slugifyPublicName(formData.name) : '';
    setFormData((current) => (
      current.publicSlug === nextSlug
        ? current
        : { ...current, publicSlug: nextSlug }
    ));
  }, [formData.name, slugTouched]);

  useEffect(() => {
    if (!formData.sharePageEnabled) {
      setOpenPreviewAfterCreate(false);
      setCopyShareLinkAfterCreate(false);
    }

    if (!formData.telegramDeliveryEnabled) {
      setSendSharePageViaTelegramAfterCreate(false);
    }
  }, [formData.sharePageEnabled, formData.telegramDeliveryEnabled]);

  const previewOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const previewClientUrl = hasPreviewSlug
    ? buildSubscriptionClientUrl(normalizedPreviewSlug, formData.name || 'Access Key', {
        origin: previewOrigin,
        shortPath: true,
      })
    : '';
  const previewShareUrl = hasPreviewSlug
    ? buildShortShareUrl(normalizedPreviewSlug, {
        origin: previewOrigin,
        lang: locale,
      })
    : '';

  const sendSharePageMutation = trpc.keys.sendSharePageViaTelegram.useMutation({
    onError: (error) => {
      toast({
        title: 'Telegram send failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Create key mutation
  const createMutation = trpc.keys.create.useMutation({
    onSuccess: async (createdKey) => {
      const sharePageUrl = getKeySubscriptionPageUrl(
        createdKey.subscriptionToken,
        createdKey.publicSlug,
        locale,
      );

      if (sharePageUrl && copyShareLinkAfterCreate) {
        void copyToClipboard(sharePageUrl, 'Copied!', 'Share page link copied to clipboard.');
      }

      if (sharePageUrl && openPreviewAfterCreate) {
        if (previewWindowRef.current && !previewWindowRef.current.closed) {
          previewWindowRef.current.location.href = sharePageUrl;
          previewWindowRef.current.focus();
        } else {
          window.open(sharePageUrl, '_blank');
        }
      } else if (previewWindowRef.current && !previewWindowRef.current.closed) {
        previewWindowRef.current.close();
      }

      previewWindowRef.current = null;

      if (sendSharePageViaTelegramAfterCreate) {
        try {
          await sendSharePageMutation.mutateAsync({
            id: createdKey.id,
            reason: 'CREATED',
          });
          toast({
            title: 'Share page sent',
            description: 'The new key has been sent through Telegram.',
          });
        } catch {
          // Error handled by the mutation toast.
        }
      }

      toast({
        title: t('keys.toast.created'),
        description: t('keys.toast.created_desc'),
      });
      onSuccess(createdKey as CreatedKeySummary);
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      if (previewWindowRef.current && !previewWindowRef.current.closed) {
        previewWindowRef.current.close();
      }
      previewWindowRef.current = null;
      toast({
        title: t('keys.toast.create_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);

  // Helper to handle prefix when submitting if template used? 
  // For now the applyTemplate updates the state directly so handleSubmit works as is.


  const resetForm = () => {
    setFormData({
      serverId: 'auto',
      name: '',
      publicSlug: '',
      email: '',
      telegramId: '',
      notes: '',
      tags: '',
      dataLimitGB: '',
      dataLimitResetStrategy: 'NEVER',
      expirationType: 'NEVER',
      expiresAt: '',
      durationDays: '',
      method: 'chacha20-ietf-poly1305',
      userId: 'unassigned',
      templateId: 'none',
      subscriptionTheme: 'default',
      coverImageUrl: '',
      subscriptionWelcomeMessage: '',
      sharePageEnabled: true,
      clientLinkEnabled: true,
      telegramDeliveryEnabled: true,
      autoDisableOnLimit: true,
      autoDisableOnExpire: true,
      autoArchiveAfterDays: '0',
      quotaAlertThresholds: '80,90',
      maxDevices: '',
      boundDeviceInstallsOnly: true,
      autoRenewPolicy: 'NONE',
      autoRenewDurationDays: '',
    });
    setSlugTouched(false);
    setShareContacts([]);
    setNewContactType('telegram');
    setNewContactValue('');
    setOpenPreviewAfterCreate(false);
    setCopyShareLinkAfterCreate(false);
    setSendSharePageViaTelegramAfterCreate(false);
    previewWindowRef.current = null;
  };

  // Handle URL params for template pre-selection
  useEffect(() => {
    if (open) {
      const params = new URLSearchParams(window.location.search);
      const templateId = params.get('template');
      if (templateId && templates) {
        setFormData(prev => ({ ...prev, templateId }));
        // Apply template immediately if found
        const template = templates.find(temp => temp.id === templateId);
        if (template) applyTemplate(template);
      }
    }
  }, [open, templates]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function fetchSubscriptionDefaults() {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const response = await fetch(`${basePath}/api/settings/subscription`);
        if (!response.ok) return;

        const data = await response.json();
        if (!cancelled && typeof data.defaultSubscriptionTheme === 'string' && data.defaultSubscriptionTheme) {
          setGlobalSubscriptionTheme(data.defaultSubscriptionTheme);
        }
      } catch {
        // Keep the local fallback if settings are unavailable.
      }
    }

    fetchSubscriptionDefaults();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const applyTemplate = (template: any) => {
    const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const generatedName = template.namePrefix ? `${template.namePrefix}${randomSuffix}` : null;
    const generatedSlug = normalizePublicSlug(
      template.slugPrefix
        ? `${template.slugPrefix}-${randomSuffix}`
        : generatedName
          ? slugifyPublicName(generatedName)
          : template.publicSlug || '',
    );

    setSlugTouched(Boolean(template.slugPrefix));
    setFormData((prev) => ({
      ...prev,
      name: generatedName || prev.name,
      publicSlug: template.slugPrefix ? generatedSlug : prev.publicSlug,
      dataLimitGB: template.dataLimitBytes ? (Number(template.dataLimitBytes) / (1024 * 1024 * 1024)).toString() : '',
      dataLimitResetStrategy: template.dataLimitResetStrategy as any,
      expirationType: template.expirationType as any,
      expiresAt: template.expiresAt ? new Date(template.expiresAt).toISOString().split('T')[0] : '',
      durationDays: template.durationDays?.toString() || '',
      method: template.method,
      notes: template.notes || '',
      serverId: template.serverId || prev.serverId,
      subscriptionTheme: template.subscriptionTheme || 'default',
      subscriptionWelcomeMessage: template.subscriptionWelcomeMessage || '',
      sharePageEnabled: template.sharePageEnabled ?? true,
      clientLinkEnabled: template.clientLinkEnabled ?? true,
      telegramDeliveryEnabled: template.telegramDeliveryEnabled ?? true,
      autoDisableOnLimit: template.autoDisableOnLimit ?? true,
      autoDisableOnExpire: template.autoDisableOnExpire ?? true,
      autoArchiveAfterDays: String(template.autoArchiveAfterDays ?? 0),
      quotaAlertThresholds: template.quotaAlertThresholds || '80,90',
      maxDevices: prev.maxDevices,
      autoRenewPolicy: template.autoRenewPolicy || 'NONE',
      autoRenewDurationDays: template.autoRenewDurationDays?.toString() || '',
    }));
  };

  const handleTemplateChange = (templateId: string) => {
    setFormData(prev => ({ ...prev, templateId }));
    if (templateId !== 'none' && templates) {
      const template = templates.find(temp => temp.id === templateId);
      if (template) {
        applyTemplate(template);
      }
    }
  };

  const handleAddShareContact = () => {
    const value = newContactValue.trim();
    if (!value || shareContacts.length >= 3) {
      return;
    }

    setShareContacts((prev) => [...prev, { type: newContactType, value }]);
    setNewContactValue('');
  };

  const handleRemoveShareContact = (index: number) => {
    setShareContacts((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.serverId || !formData.name) {
      toast({
        title: t('keys.toast.validation'),
        description: t('keys.toast.validation_create_desc'),
        variant: 'destructive',
      });
      return;
    }

    const slugToCreate = normalizePublicSlug(formData.publicSlug || formData.name);
    if (!slugToCreate || slugToCreate.length < 3) {
      toast({
        title: 'Short link is invalid',
        description: 'Use at least 3 characters for the short link slug.',
        variant: 'destructive',
      });
      return;
    }

    const slugCheck = await utils.keys.checkPublicSlugAvailability.fetch({
      slug: slugToCreate,
    });

    if (!slugCheck.valid || !slugCheck.available) {
      toast({
        title: 'Short link unavailable',
        description: slugCheck.message,
        variant: 'destructive',
      });
      return;
    }

    if (openPreviewAfterCreate && typeof window !== 'undefined') {
      previewWindowRef.current = window.open('about:blank', '_blank');
    } else {
      previewWindowRef.current = null;
    }

    createMutation.mutate({
      serverId: formData.serverId === 'auto' ? undefined : formData.serverId,
      assignmentMode: formData.serverId === 'auto' ? 'AUTO' : 'MANUAL',
      name: formData.name,
      publicSlug: slugToCreate,
      email: formData.email || undefined,
      telegramId: formData.telegramId || undefined,
      notes: formData.notes || undefined,
      tags: tagsToString(['web', formData.tags].filter(Boolean)),
      dataLimitGB: formData.dataLimitGB ? parseFloat(formData.dataLimitGB) : undefined,
      dataLimitResetStrategy: formData.dataLimitResetStrategy,
      expirationType: formData.expirationType,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined,
      durationDays: formData.durationDays ? parseInt(formData.durationDays) : undefined,
      method: formData.method as 'chacha20-ietf-poly1305' | 'aes-128-gcm' | 'aes-192-gcm' | 'aes-256-gcm',
      userId: formData.userId !== 'unassigned' ? formData.userId : undefined,
      subscriptionTheme: formData.subscriptionTheme !== 'default'
        ? (formData.subscriptionTheme as typeof subscriptionThemeIds[number])
        : undefined,
      coverImage: formData.coverImageUrl.trim() || undefined,
      coverImageType: formData.coverImageUrl.trim() ? 'url' : undefined,
      contactLinks: shareContacts.length > 0 ? JSON.stringify(shareContacts) : undefined,
      subscriptionWelcomeMessage: formData.subscriptionWelcomeMessage.trim() || undefined,
      sharePageEnabled: formData.sharePageEnabled,
      clientLinkEnabled: formData.clientLinkEnabled,
      telegramDeliveryEnabled: formData.telegramDeliveryEnabled,
      autoDisableOnLimit: formData.autoDisableOnLimit,
      autoDisableOnExpire: formData.autoDisableOnExpire,
      autoArchiveAfterDays: Number.parseInt(formData.autoArchiveAfterDays || '0', 10) || 0,
      quotaAlertThresholds: formData.quotaAlertThresholds,
      maxDevices: formData.maxDevices ? Number.parseInt(formData.maxDevices, 10) : undefined,
      boundDeviceInstallsOnly: formData.maxDevices ? formData.boundDeviceInstallsOnly : undefined,
      autoRenewPolicy: formData.autoRenewPolicy,
      autoRenewDurationDays:
        formData.autoRenewPolicy === 'EXTEND_DURATION' && formData.autoRenewDurationDays
          ? Number.parseInt(formData.autoRenewDurationDays, 10)
          : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto p-0 sm:max-w-[min(1040px,calc(100vw-2rem))]">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            {t('keys.dialog.create.title')}
          </DialogTitle>
          <DialogDescription>
            {t('keys.dialog.create.desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-0">
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{locale === 'my' ? 'အခြေခံအချက်အလက်' : 'Basics'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {locale === 'my'
                    ? 'သင့်တော်သော တမ်းပလိတ်ကို ရွေးပါ၊ ခွဲဝေပေးမည့် ပုံစံကို သတ်မှတ်ပါ၊ ထို့နောက် ဖောက်သည် မြင်မည့် အတိုလင့်ခ်များကို ပြင်ဆင်ပါ။'
                    : 'Start with the right template, choose assignment mode, and set the short links the customer will actually see.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

          {/* Template Selection */}
          <div className="space-y-2">
            <Label>{t('keys.dialog.apply_template')}</Label>
            <Select
              value={formData.templateId}
              onValueChange={handleTemplateChange}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('keys.dialog.template_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('keys.dialog.template_none')}</SelectItem>
                {templates?.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Server selection */}
          <div className="space-y-2">
            <Label>{t('keys.form.server')} *</Label>
            <div className="grid gap-2 md:grid-cols-2">
              <div
                className={cn(
                  'rounded-2xl border px-3 py-3 text-sm',
                  formData.serverId === 'auto'
                    ? 'border-cyan-500/30 bg-cyan-500/10'
                    : 'border-border/60 bg-background/45 dark:bg-white/[0.03]',
                )}
              >
                <p className="font-medium text-foreground">{locale === 'my' ? 'အလိုအလျောက် ခွဲဝေခြင်း' : 'Auto assignment'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {locale === 'my'
                    ? 'အသင့်အတင့် အလုပ်လုပ်နေသော ဆာဗာများထဲမှ ကျန်းမာရေးအကောင်းဆုံး ဆာဗာကို အလိုအလျောက် ရွေးပေးသည်။ Draining နှင့် maintenance ဆာဗာများကို ကျော်သွားမည်။'
                    : 'Picks the healthiest active server automatically. Draining and maintenance servers are skipped.'}
                </p>
              </div>
              <div
                className={cn(
                  'rounded-2xl border px-3 py-3 text-sm',
                  formData.serverId !== 'auto'
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : 'border-border/60 bg-background/45 dark:bg-white/[0.03]',
                )}
              >
                <p className="font-medium text-foreground">{locale === 'my' ? 'ကိုယ်တိုင် ရွေးချယ်ခွဲဝေခြင်း' : 'Manual assignment'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {locale === 'my'
                    ? 'အောက်တွင် ဆာဗာကို ကိုယ်တိုင် တိတိကျကျ ရွေးချယ်နိုင်သည်။ ကိုယ်တိုင်ရွေးချယ်သည့်အခါ draining ဆာဗာကို အသုံးပြုနိုင်သော်လည်း maintenance ဆာဗာများကို ပိတ်ထားဆဲဖြစ်သည်။'
                    : 'You choose the exact server below. Draining is allowed when you select it manually; maintenance stays blocked.'}
                </p>
              </div>
            </div>
            <Select
              value={formData.serverId}
              onValueChange={(value) => setFormData({ ...formData, serverId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('keys.form.server_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('keys.form.server_auto')}</SelectItem>
                {servers?.map((server) => (
                  <SelectItem
                    key={server.id}
                    value={server.id}
                    disabled={server.lifecycleMode === 'MAINTENANCE'}
                  >
                    <div className="flex items-center gap-2">
                      <span>
                        {server.countryCode && getCountryFlag(server.countryCode)} {server.name}
                      </span>
                      <ServerLifecycleBadge mode={server.lifecycleMode} />
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.serverId === 'auto' && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-3 text-sm">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 text-cyan-500" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      {t('keys.form.server_auto_help')}
                    </p>
                    {smartAssignmentQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">
                        {t('keys.form.server_auto_loading')}
                      </p>
                    ) : smartAssignmentQuery.data ? (
                      <p className="text-xs text-muted-foreground">
                        {fillTemplate(t('keys.form.server_auto_recommended'), {
                          server: `${smartAssignmentQuery.data.countryCode ? `${getCountryFlag(smartAssignmentQuery.data.countryCode)} ` : ''}${smartAssignmentQuery.data.serverName}`,
                          score: smartAssignmentQuery.data.loadScore,
                        })}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-300">
                        {t('keys.form.server_auto_unavailable')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {formData.serverId !== 'auto' && selectedServerLifecycleMode === 'DRAINING' && manuallySelectedServer ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      {t('keys.form.server_draining_help_title')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fillTemplate(
                        t('keys.form.server_draining_help_desc'),
                        {
                          server: manuallySelectedServer.name,
                        },
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Key name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('keys.form.name')} *</Label>
            <Input
              id="name"
              placeholder={t('keys.form.name_placeholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="publicSlug">{locale === 'my' ? 'အတိုလင့်ခ် အမည်' : 'Short Link Slug'}</Label>
              <Input
                id="publicSlug"
                placeholder="premium-access"
                value={formData.publicSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setFormData({ ...formData, publicSlug: normalizePublicSlug(e.target.value) });
                }}
              />
              <p className="text-xs text-muted-foreground">
                {slugTouched
                  ? (locale === 'my'
                    ? 'အတို ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်နှင့် အတို မျှဝေစာမျက်နှာ URL အတွက် အသုံးပြုသည်။'
                    : 'Used for the short client URL and short share page URL.')
                  : (locale === 'my'
                    ? 'သင် မပြင်မချင်း အမည်မှ အလိုအလျောက် ဖန်တီးပေးမည်။'
                    : 'Auto-generated from the name until you edit it.')}
              </p>
            </div>

            {previewSlug ? (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{locale === 'my' ? 'အတိုအမည် အခြေအနေ:' : 'Slug status:'}</span>
                  {slugAvailabilityQuery.isFetching ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {locale === 'my' ? 'အသုံးပြုနိုင်မှုကို စစ်ဆေးနေသည်' : 'Checking availability'}
                    </span>
                  ) : hasPreviewSlug && slugAvailabilityQuery.data?.available ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {slugAvailabilityQuery.data.message}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <XCircle className="h-3.5 w-3.5" />
                      {hasPreviewSlug
                        ? (slugAvailabilityQuery.data?.message || (locale === 'my' ? 'ဤအတိုလင့်ခ်ကို အသုံးမပြုနိုင်ပါ။' : 'This short link is unavailable.'))
                        : (locale === 'my' ? 'အနည်းဆုံး စာလုံး ၃ လုံး ထည့်ပါ။' : 'Enter at least 3 characters.')}
                    </span>
                  )}
                </div>

                {slugAvailabilityQuery.data?.suggestions?.length ? (
                  <div className="space-y-2">
                    <Label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                      {locale === 'my' ? 'အကြံပြု အတိုအမည်များ' : 'Suggested Slugs'}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {slugAvailabilityQuery.data.suggestions.map((suggestion) => (
                        <Button
                          key={suggestion}
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 rounded-full px-3 text-xs"
                          onClick={() => {
                            setSlugTouched(true);
                            setFormData((current) => ({ ...current, publicSlug: suggestion }));
                          }}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                      {locale === 'my' ? 'အတို ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်' : 'Short Client URL'}
                    </Label>
                    <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs break-all">
                      {previewClientUrl || (locale === 'my' ? 'ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ် အကြိုကြည့်ရန် မှန်ကန်သော အတိုအမည်ကို ထည့်ပါ။' : 'Enter a valid slug to preview the client URL.')}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                      {locale === 'my' ? 'အတို မျှဝေစာမျက်နှာ' : 'Short Share Page'}
                    </Label>
                    <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs break-all">
                      {previewShareUrl || (locale === 'my' ? 'မျှဝေစာမျက်နှာ အကြိုကြည့်ရန် မှန်ကန်သော အတိုအမည်ကို ထည့်ပါ။' : 'Enter a valid slug to preview the share page.')}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{locale === 'my' ? 'ပိုင်ဆိုင်မှုနှင့် အသုံးပြုခွင့်' : 'Ownership and access'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {locale === 'my'
                    ? 'သော့ကို ခွဲဝေပေးပါ၊ ချိတ်ဆက်နည်းကို ရွေးပါ၊ ထို့နောက် နောက်ပိုင်း အကူအညီပေးရာတွင် လိုအပ်မည့် ဆက်သွယ်ရန်အချက်အလက်များကို သိမ်းပါ။'
                    : 'Assign the key, choose the connection method, and capture the contact context you will need later.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

          {/* User Assignment */}
          <div className="space-y-2">
            <Label>{t('keys.form.user')}</Label>
            <Select
              value={formData.userId}
              onValueChange={(value) => setFormData({ ...formData, userId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('keys.form.user_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">{t('keys.form.user_unassigned')}</SelectItem>
                {users?.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.email} (Keys: {(user as any)._count?.accessKeys || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Encryption method */}
          <div className="space-y-2">
            <Label>{t('keys.form.method')}</Label>
            <Select
              value={formData.method}
              onValueChange={(value) => setFormData({ ...formData, method: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('keys.form.method_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {ENCRYPTION_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('keys.form.method_help')}
            </p>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">{t('keys.form.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('keys.form.email_placeholder')}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegramId">{t('keys.form.telegram')}</Label>
              <Input
                id="telegramId"
                placeholder={t('keys.form.telegram_placeholder')}
                value={formData.telegramId}
                onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">{t('keys.tags.extra_label')}</Label>
            <Input
              id="tags"
              placeholder={t('keys.tags.extra_placeholder')}
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t('keys.tags.extra_help_prefix')}{' '}
              <span className="font-medium">web</span>{' '}
              {t('keys.tags.extra_help_suffix')}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:bg-white/[0.03]">
                {t('keys.tags.source_prefix')}: <span className="ml-1 font-semibold text-foreground">web</span>
              </span>
              {KEY_TAG_PRESETS.map((tag) => {
                const isSelected = selectedCreateTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      getTagToneClassName(tag),
                      isSelected && 'border-primary/45 ring-2 ring-primary/10 dark:border-cyan-400/30'
                    )}
                    onClick={() =>
                      setFormData((current) => ({
                        ...current,
                        tags: toggleEditableTagList(current.tags, tag),
                      }))
                    }
                  >
                    <Sparkles className="h-3 w-3" />
                    {getTagDisplayLabel(tag)}
                  </button>
                );
              })}
            </div>
          </div>

            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>Limits and lifecycle</DialogSectionTitle>
                <DialogSectionDescription>
                  Define quota, expiration, device caps, and the automation policy that should take over after create.
                </DialogSectionDescription>
              </DialogSectionHeader>

          {/* Data limit */}
          <div className="space-y-2">
            <Label htmlFor="dataLimit">{t('keys.form.data_limit')}</Label>
            <Input
              id="dataLimit"
              type="number"
              placeholder={t('keys.form.data_limit_placeholder')}
              value={formData.dataLimitGB}
              onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
              min="0"
              step="0.5"
            />
            <p className="text-xs text-muted-foreground">
              {t('keys.form.data_limit_help')}
            </p>
          </div>

          {/* Data Limit Reset Strategy */}
          {formData.dataLimitGB && (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
              <div className="space-y-2">
                <Label>{t('keys.form.reset_strategy')}</Label>
                <Select
                  value={formData.dataLimitResetStrategy}
                  onValueChange={(value: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER') =>
                    setFormData({ ...formData, dataLimitResetStrategy: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEVER">{t('keys.form.reset.never')}</SelectItem>
                    <SelectItem value="DAILY">{t('keys.form.reset.daily')}</SelectItem>
                    <SelectItem value="WEEKLY">{t('keys.form.reset.weekly')}</SelectItem>
                    <SelectItem value="MONTHLY">{t('keys.form.reset.monthly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quotaThresholds">Quota alert thresholds (%)</Label>
                <Input
                  id="quotaThresholds"
                  placeholder="80,90"
                  value={formData.quotaAlertThresholds}
                  onChange={(e) => setFormData({ ...formData, quotaAlertThresholds: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated usage thresholds that trigger alerts.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Auto-disable on limit</p>
                  <p className="text-xs text-muted-foreground">
                    Disable the key and schedule archiving when the quota is fully consumed.
                  </p>
                </div>
                <Switch
                  checked={formData.autoDisableOnLimit}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoDisableOnLimit: checked })}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="maxDevices">Soft device limit (estimated)</Label>
            <Input
              id="maxDevices"
              type="number"
              min="1"
              max="20"
              placeholder="Leave empty for no device limit"
              value={formData.maxDevices}
              onChange={(e) => setFormData({ ...formData, maxDevices: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {ACCESS_KEY_SOFT_DEVICE_LIMIT_HINT}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-4 py-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Hide raw config on official install screens</p>
              <p className="text-xs text-muted-foreground">
                {ACCESS_KEY_PROTECTED_INSTALL_HINT}
              </p>
            </div>
            <Switch
              checked={formData.boundDeviceInstallsOnly}
              onCheckedChange={(checked) => setFormData({ ...formData, boundDeviceInstallsOnly: checked })}
            />
          </div>

          {/* Expiration type */}
          <div className="space-y-2">
            <Label>{t('keys.form.expiration')}</Label>
            <Select
              value={formData.expirationType}
              onValueChange={(value: 'NEVER' | 'FIXED_DATE' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE') =>
                setFormData({ ...formData, expirationType: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEVER">{t('keys.never_expires')}</SelectItem>
                <SelectItem value="FIXED_DATE">{t('keys.form.expiration.fixed_date')}</SelectItem>
                <SelectItem value="DURATION_FROM_CREATION">{t('keys.form.expiration.duration_from_creation')}</SelectItem>
                <SelectItem value="START_ON_FIRST_USE">{t('keys.form.expiration.start_on_first_use')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.expirationType === 'FIXED_DATE' && (
            <div className="space-y-2">
              <Label htmlFor="expirationDate">{t('keys.form.expiration_date')}</Label>
              <Input
                id="expirationDate"
                type="date"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{t('keys.form.expiration_date_help')}</p>
            </div>
          )}

          {/* Duration days (conditional) */}
          {(formData.expirationType === 'DURATION_FROM_CREATION' ||
            formData.expirationType === 'START_ON_FIRST_USE') && (
              <div className="space-y-2">
                <Label htmlFor="durationDays">{t('keys.form.duration')}</Label>
                <Input
                  id="durationDays"
                  type="number"
                  placeholder="30"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                  min="1"
                />
              </div>
            )}

          <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">{locale === 'my' ? 'အလိုအလျောက် လုပ်ဆောင်မှု မူဝါဒ' : 'Automation Policy'}</p>
              <p className="text-xs text-muted-foreground">
                {locale === 'my'
                  ? 'သက်တမ်းကုန်ချိန် သို့မဟုတ် quota ကန့်သတ်ချက်ကို ကျော်လွန်ချိန်တွင် ဤ key ကို မည်သို့ လုပ်ဆောင်မည်ကို သတ်မှတ်ပါ။'
                  : 'Control how the key behaves when it expires or crosses quota thresholds.'}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{locale === 'my' ? 'သက်တမ်းကုန်လျှင် အလိုအလျောက် ပိတ်မည်' : 'Auto-disable when expired'}</p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'my'
                    ? 'သတ်မှတ်သက်တမ်း ကျော်လွန်သည်နှင့် Outline မှ ချက်ချင်း ပိတ်ပင်မည်။'
                    : 'Remove the key from Outline immediately after its expiry date passes.'}
                </p>
              </div>
              <Switch
                checked={formData.autoDisableOnExpire}
                onCheckedChange={(checked) => setFormData({ ...formData, autoDisableOnExpire: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoArchiveAfterDays">{locale === 'my' ? 'အလိုအလျောက် မှတ်တမ်းသို့ ရွှေ့မည့်ကာလ (ရက်)' : 'Auto-archive after (days)'}</Label>
              <Input
                id="autoArchiveAfterDays"
                type="number"
                min="0"
                placeholder="0"
                value={formData.autoArchiveAfterDays}
                onChange={(e) => setFormData({ ...formData, autoArchiveAfterDays: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {locale === 'my'
                  ? '0 ဟု သတ်မှတ်ပါက သော့သည် သက်တမ်းကုန် သို့မဟုတ် ကန့်သတ်ချက်ကုန်သည်နှင့် ချက်ချင်း မှတ်တမ်းသို့ ရွှေ့မည်။'
                  : 'Use 0 to archive immediately after the key becomes expired or depleted.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{locale === 'my' ? 'အလိုအလျောက် သက်တမ်းတိုး မူဝါဒ' : 'Auto-renew policy'}</Label>
              <Select
                value={formData.autoRenewPolicy}
                onValueChange={(value: 'NONE' | 'EXTEND_DURATION') =>
                  setFormData({ ...formData, autoRenewPolicy: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{locale === 'my' ? 'အလိုအလျောက် မတိုးပါ' : 'Do not auto-renew'}</SelectItem>
                  <SelectItem value="EXTEND_DURATION">{locale === 'my' ? 'သတ်မှတ်ထားသော ရက်အရေအတွက်ဖြင့် တိုးမည်' : 'Extend by a fixed number of days'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.autoRenewPolicy === 'EXTEND_DURATION' && (
              <div className="space-y-2">
                <Label htmlFor="autoRenewDurationDays">{locale === 'my' ? 'အလိုအလျောက် သက်တမ်းတိုးကာလ (ရက်)' : 'Auto-renew duration (days)'}</Label>
                <Input
                  id="autoRenewDurationDays"
                  type="number"
                  min="1"
                  placeholder={formData.durationDays || '30'}
                  value={formData.autoRenewDurationDays}
                  onChange={(e) => setFormData({ ...formData, autoRenewDurationDays: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {locale === 'my'
                    ? 'ဗလာထားပါက ဤ key အတွက် သတ်မှတ်ထားပြီးသော ကာလအတိုင်း ပြန်လည်အသုံးပြုမည်။'
                    : 'Leave empty to reuse the same duration configured for this key.'}
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t('keys.form.notes')}</Label>
            <Input
              id="notes"
              placeholder={t('keys.form.notes_placeholder')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{locale === 'my' ? 'မျှဝေစာမျက်နှာနှင့် ပို့ဆောင်မှု' : 'Share page and delivery'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {locale === 'my'
                    ? 'ဤသော့ကို ဖန်တီးသည့်အချိန်တွင် အသုံးပြုသူဘက် မြင်ရမည့် စာမျက်နှာ၊ ပို့ဆောင်မှု ရွေးချယ်စရာများနှင့် ချက်ချင်း လုပ်ဆောင်ရမည့်အရာများကို သတ်မှတ်ပါ။'
                    : 'Configure the customer-facing page, delivery options, and the actions that should happen the moment the key is created.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Share2 className="h-4 w-4 text-primary" />
                {locale === 'my' ? 'မျှဝေစာမျက်နှာ' : 'Share Page'}
              </div>
              <p className="text-xs text-muted-foreground">
                {locale === 'my'
                  ? 'ဤ setting များသည် key ဖန်တီးပြီးသည်နှင့် ထုတ်ပေးမည့် subscription စာမျက်နှာတွင် သက်ရောက်ပါမည်။'
                  : 'These settings apply to the subscription page generated with this key right after creation.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                <Switch
                  checked={formData.sharePageEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, sharePageEnabled: checked })}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{locale === 'my' ? 'မျှဝေစာမျက်နှာ' : 'Share page'}</span>
                  <span className="block text-xs text-muted-foreground">
                    {locale === 'my' ? 'အများပြည်သူ ကြိုကြည့်နိုင်သော စာမျက်နှာနှင့် အတိုမျှဝေ URL ။' : 'Public preview and short share URL.'}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                <Switch
                  checked={formData.clientLinkEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, clientLinkEnabled: checked })}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{locale === 'my' ? 'ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်' : 'Client URL'}</span>
                  <span className="block text-xs text-muted-foreground">
                    {locale === 'my' ? 'သဟဇာတဖြစ်သော ကလိုင်းယင့်များက ဆက်တင်ကို ရယူနိုင်စေမည်။' : 'Allow compatible clients to fetch the config.'}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                <Switch
                  checked={formData.telegramDeliveryEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, telegramDeliveryEnabled: checked })}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{locale === 'my' ? 'Telegram ဖြင့် ပို့ဆောင်မှု' : 'Telegram delivery'}</span>
                  <span className="block text-xs text-muted-foreground">
                    {locale === 'my' ? 'Telegram ဖြင့် ပေးပို့ခြင်းနှင့် သက်တမ်းဆိုင်ရာ သတိပေးစာများကို ခွင့်ပြုမည်။' : 'Permit send-via-Telegram and lifecycle pushes.'}
                  </span>
                </span>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{locale === 'my' ? 'စာမျက်နှာ အပြင်အဆင်' : 'Page Theme'}</Label>
                  <Select
                    value={formData.subscriptionTheme}
                    onValueChange={(value) => setFormData({ ...formData, subscriptionTheme: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={locale === 'my' ? 'အပြင်အဆင် ရွေးပါ' : 'Select theme'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        {locale === 'my' ? `Global မူရင်း theme ကို သုံးမည် (${globalShareThemeName})` : `Use global default (${globalShareThemeName})`}
                      </SelectItem>
                      {themeList.map((themeOption) => (
                        <SelectItem key={themeOption.id} value={themeOption.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3.5 w-3.5 rounded-full border"
                              style={{ backgroundColor: themeOption.bgPrimary, borderColor: themeOption.accent }}
                            />
                            {themeOption.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shareBackground">{isMyanmar ? 'နောက်ခံ ပုံ (မထည့်လည်းရ)' : 'Background Image (Optional)'}</Label>
                  <Input
                    id="shareBackground"
                    placeholder="https://example.com/image.jpg"
                    value={formData.coverImageUrl}
                    onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar
                      ? 'သတ်မှတ်ထားပါက share page တွင် ဤပုံကို စာမျက်နှာတစ်ခုလုံး နောက်ခံအဖြစ် အသုံးပြုမည်။'
                      : 'If set, the share page uses this full-page background image.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shareWelcomeMessage">{isMyanmar ? 'ကြိုဆိုစာ (မထည့်လည်းရ)' : 'Welcome Message (Optional)'}</Label>
                  <Textarea
                    id="shareWelcomeMessage"
                    placeholder={isMyanmar ? 'ဤအသုံးပြုသူအတွက် အတိုချုံး မှတ်စု သို့မဟုတ် setup hint ထည့်ပါ။' : 'Add a short note or setup hint for this specific user.'}
                    value={formData.subscriptionWelcomeMessage}
                    onChange={(e) => setFormData({ ...formData, subscriptionWelcomeMessage: e.target.value })}
                    className="min-h-[96px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar
                      ? 'ဤ key အတွက်သာ global subscription page ကြိုဆိုစာကို override လုပ်မည်။'
                      : 'Overrides the global subscription page welcome message for this key only.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{isMyanmar ? `ဆက်သွယ်ရန် လင့်ခ်များ (${shareContacts.length}/3)` : `Contact Links (${shareContacts.length}/3)`}</Label>

                  {shareContacts.length > 0 && (
                    <div className="space-y-2">
                      {shareContacts.map((contact, index) => {
                        const type = CREATE_CONTACT_TYPES.find((item) => item.value === contact.type);
                        return (
                          <div key={`${contact.type}-${index}`} className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                            <span>{type?.icon}</span>
                            <span className="text-sm font-medium">{type?.label}</span>
                            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{contact.value}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleRemoveShareContact(index)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {shareContacts.length < 3 && (
                    <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_40px]">
                      <Select
                        value={newContactType}
                        onValueChange={(value: CreateContactLink['type']) => setNewContactType(value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CREATE_CONTACT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              <span className="flex items-center gap-2">
                                <span>{type.icon}</span>
                                {type.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Enter link or ID"
                        value={newContactValue}
                        onChange={(e) => setNewContactValue(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleAddShareContact}
                        disabled={!newContactValue.trim()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {locale === 'my' ? 'ဖန်တီးပြီးနောက်' : 'After create'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {locale === 'my'
                        ? 'သော့ကို ဖန်တီးပြီးသည့်နောက် မျှဝေစာမျက်နှာလင့်ခ်နှင့်အတူ ဘာလုပ်ဆောင်မည်ကို ရွေးပါ။'
                        : 'The share page link is generated with the key. Choose what should happen as soon as creation finishes.'}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/70 px-3 py-3">
                      <Checkbox
                        checked={openPreviewAfterCreate}
                        onCheckedChange={(checked) => setOpenPreviewAfterCreate(checked === true)}
                        className="mt-0.5"
                        disabled={!formData.sharePageEnabled}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">{locale === 'my' ? 'ဖန်တီးပြီးနောက် အကြိုကြည့်ကို ဖွင့်မည်' : 'Open preview after create'}</span>
                        <span className="block text-xs text-muted-foreground">
                          {locale === 'my'
                            ? 'သော့ဖန်တီးပြီးသည်နှင့် share page အသစ်ကို tab အသစ်တစ်ခုတွင် ချက်ချင်းဖွင့်မည်။'
                            : 'Opens the new share page in a separate tab right after the key is created.'}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/70 px-3 py-3">
                      <Checkbox
                        checked={copyShareLinkAfterCreate}
                        onCheckedChange={(checked) => setCopyShareLinkAfterCreate(checked === true)}
                        className="mt-0.5"
                        disabled={!formData.sharePageEnabled}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">
                          {locale === 'my'
                            ? 'ဖန်တီးပြီးနောက် မျှဝေစာမျက်နှာလင့်ခ်ကို ကူးယူမည်'
                            : 'Copy share page link after create'}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {locale === 'my'
                            ? 'ရလဒ် dialog ကို မစောင့်ဘဲ ဖန်တီးပြီးသော share page လင့်ခ်ကို ချက်ချင်း ကူးယူမည်။'
                            : 'Copies the generated share page link immediately instead of waiting for the result dialog.'}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/70 px-3 py-3">
                      <Checkbox
                        checked={sendSharePageViaTelegramAfterCreate}
                        onCheckedChange={(checked) => setSendSharePageViaTelegramAfterCreate(checked === true)}
                        className="mt-0.5"
                        disabled={!formData.telegramDeliveryEnabled}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">
                          {locale === 'my'
                            ? 'ဖန်တီးပြီးနောက် မျှဝေစာမျက်နှာကို Telegram မှ ပို့မည်'
                            : 'Send share page via Telegram after create'}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {locale === 'my'
                            ? 'သော့၏ Telegram ID သို့မဟုတ် ချိတ်ထားသော အသုံးပြုသူ Telegram chat ရှိပါက ၎င်းကို အသုံးပြုမည်။'
                            : 'Uses the key&apos;s Telegram ID or the assigned user&apos;s linked Telegram chat if one exists.'}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div
                className="rounded-[1.4rem] border p-4"
                style={{
                  backgroundColor: formData.coverImageUrl ? 'transparent' : selectedShareTheme.bgPrimary,
                  borderColor: selectedShareTheme.border,
                }}
              >
                <div className="relative overflow-hidden rounded-[1.1rem]">
                  {formData.coverImageUrl && (
                    <>
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${formData.coverImageUrl})` }}
                      />
                      <div className="absolute inset-0 bg-black/55" />
                    </>
                  )}

                  <div
                    className="relative space-y-3 rounded-[1.1rem] p-4"
                    style={{
                      backgroundColor: formData.coverImageUrl ? 'rgba(0,0,0,0.42)' : selectedShareTheme.bgCard,
                      backdropFilter: formData.coverImageUrl ? 'blur(8px)' : undefined,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                        style={{ backgroundColor: formData.coverImageUrl ? 'rgba(255,255,255,0.18)' : selectedShareTheme.bgSecondary }}
                      >
                        🔗
                      </div>
                      <div>
                        <p
                          className="text-sm font-medium"
                          style={{ color: formData.coverImageUrl ? '#ffffff' : selectedShareTheme.textPrimary }}
                        >
                          Preview
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: formData.coverImageUrl ? 'rgba(255,255,255,0.72)' : selectedShareTheme.textMuted }}
                        >
                          {formData.subscriptionTheme === 'default'
                            ? `${selectedShareTheme.name} via global default`
                            : selectedShareTheme.name}
                        </p>
                      </div>
                    </div>

                    <div
                      className="h-2 rounded-full"
                      style={{ backgroundColor: formData.coverImageUrl ? 'rgba(255,255,255,0.22)' : selectedShareTheme.progressBg }}
                    >
                      <div
                        className="h-full w-2/3 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${selectedShareTheme.progressFill}, ${selectedShareTheme.buttonGradientTo})`,
                        }}
                      />
                    </div>

                    <div className="space-y-1 text-xs" style={{ color: formData.coverImageUrl ? 'rgba(255,255,255,0.78)' : selectedShareTheme.textMuted }}>
                      <p>Contact shortcuts: {shareContacts.length}</p>
                      <p>{formData.sharePageEnabled ? 'Share page enabled' : 'Share page disabled'}</p>
                      <p>{formData.clientLinkEnabled ? (locale === 'my' ? 'ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်ကို ဖွင့်ထားသည်' : 'Client URL enabled') : (locale === 'my' ? 'ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်ကို ပိတ်ထားသည်' : 'Client URL disabled')}</p>
                      <p>{formData.telegramDeliveryEnabled ? 'Telegram delivery enabled' : 'Telegram delivery disabled'}</p>
                      <p>{formData.coverImageUrl ? 'Background image enabled' : 'Color theme only'}</p>
                      <p>{formData.subscriptionWelcomeMessage.trim() ? 'Custom welcome message enabled' : 'Using global welcome message'}</p>
                    </div>

                    <div
                      className="rounded-full px-3 py-2 text-center text-xs font-medium"
                      style={{
                        background: `linear-gradient(135deg, ${selectedShareTheme.buttonGradientFrom}, ${selectedShareTheme.buttonGradientTo})`,
                        color: '#fff',
                      }}
                    >
                      Subscription page ready
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

            </DialogSection>
          </DialogBody>

          <DialogFooter className="ops-modal-sticky-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('keys.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="create-access-key-submit">
              {createMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {t('keys.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreatedKeySummaryDialog({
  createdKey,
  open,
  onOpenChange,
}: {
  createdKey: CreatedKeySummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const subscriptionPageUrl = getKeySubscriptionPageUrl(createdKey?.subscriptionToken, createdKey?.publicSlug);
  const { data: qrData, isLoading } = trpc.keys.generateQRCode.useQuery(
    { id: createdKey?.id ?? '' },
    { enabled: open && !!createdKey?.id },
  );
  const sendSharePageMutation = trpc.keys.sendSharePageViaTelegram.useMutation({
    onSuccess: () => {
      toast({
        title: 'Share page sent',
        description: 'The key has been sent through Telegram.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Telegram send failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const connectLinkMutation = trpc.keys.generateTelegramConnectLink.useMutation({
    onSuccess: async (result) => {
      await copyToClipboard(
        result.url,
        'Copied!',
        'Telegram connect link copied to clipboard.',
      );
    },
    onError: (error) => {
      toast({
        title: 'Connect link failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (!createdKey) {
    return null;
  }

  const expirationLabel = createdKey.expiresAt
    ? formatDateTime(createdKey.expiresAt)
    : t('keys.never_expires');
  const dataLimitLabel = createdKey.dataLimitBytes
    ? formatBytes(createdKey.dataLimitBytes)
    : t('keys.form.data_limit_placeholder');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_240px]">
          <div className="space-y-5 p-6">
            <DialogHeader className="space-y-2 text-left">
              <Badge variant="outline" className="w-fit rounded-full border-primary/20 bg-primary/8 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-primary">
                {t('keys.toast.created')}
              </Badge>
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                {createdKey.name}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-sm text-muted-foreground">
                {t('keys.dialog.created_desc')}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
	              <div className="rounded-[1.1rem] border border-border/60 bg-background/65 p-3">
	                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
	                  {t('keys.dialog.created_server')}
	                </p>
	                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium">
	                  {createdKey.server?.countryCode ? <span>{getCountryFlag(createdKey.server.countryCode)}</span> : null}
	                  <span className="truncate">{createdKey.server?.name ?? '-'}</span>
	                  <ServerLifecycleBadge mode={createdKey.server?.lifecycleMode} />
	                </div>
	              </div>
              <div className="rounded-[1.1rem] border border-border/60 bg-background/65 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('keys.dialog.created_encryption')}
                </p>
                <p className="mt-2 break-all font-mono text-sm">{createdKey.method ?? '-'}</p>
              </div>
              <div className="rounded-[1.1rem] border border-border/60 bg-background/65 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('keys.dialog.created_port')}
                </p>
                <p className="mt-2 font-mono text-sm">{createdKey.port ?? '-'}</p>
              </div>
              <div className="rounded-[1.1rem] border border-border/60 bg-background/65 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('keys.dialog.created_password')}
                </p>
                <p className="mt-2 break-all font-mono text-sm">{createdKey.password ?? '-'}</p>
              </div>
              <div className="rounded-[1.1rem] border border-border/60 bg-background/65 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('keys.dialog.created_expiration')}
                </p>
                <p className="mt-2 text-sm font-medium">{expirationLabel}</p>
              </div>
              <div className="rounded-[1.1rem] border border-border/60 bg-background/65 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('keys.form.data_limit')}
                </p>
                <p className="mt-2 text-sm font-medium">{dataLimitLabel}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">{t('keys.dialog.created_access_url')}</Label>
                <p className="text-xs text-muted-foreground">
                  {createdKey.maxDevices && createdKey.boundDeviceInstallsOnly
                    ? ACCESS_KEY_RAW_COPY_WARNING
                    : t('keys.dialog.qr_desc')}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-border/60 bg-background/70 p-3 font-mono text-xs leading-6 break-all dark:bg-[rgba(4,10,20,0.72)]">
                {createdKey.accessUrl ?? '-'}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => copyToClipboard(createdKey.accessUrl || '', t('keys.toast.copied'), t('keys.toast.copy_access_url'))}
                  disabled={!createdKey.accessUrl}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t('keys.actions.copy_access_url')}
                </Button>
                <Button asChild type="button" variant="outline" className="rounded-full">
                  <Link href={`/dashboard/keys/${createdKey.id}`}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('keys.actions.view_details')}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">{t('keys.dialog.created_subscription_page')}</Label>
                <p className="text-xs text-muted-foreground">{t('keys.dialog.created_subscription_help')}</p>
              </div>
              <div className="rounded-[1.2rem] border border-border/60 bg-background/70 p-3 font-mono text-xs leading-6 break-all dark:bg-[rgba(4,10,20,0.72)]">
                {subscriptionPageUrl || '-'}
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => copyToClipboard(subscriptionPageUrl, t('keys.toast.copied'), t('keys.toast.copy_subscription_url'))}
                disabled={!subscriptionPageUrl}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {t('keys.actions.copy_subscription_url')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  if (subscriptionPageUrl) {
                    window.open(subscriptionPageUrl, '_blank');
                  }
                }}
                disabled={!subscriptionPageUrl}
              >
                <Eye className="mr-2 h-4 w-4" />
                {locale === 'my' ? 'မျှဝေစာမျက်နှာကို ဖွင့်မည်' : 'Open Share Page'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => connectLinkMutation.mutate({ id: createdKey.id })}
                disabled={connectLinkMutation.isPending}
              >
                {connectLinkMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LinkCopy className="mr-2 h-4 w-4" />
                )}
                {locale === 'my' ? 'Telegram ချိတ်ဆက်လင့်ခ်ကို ကူးယူမည်' : 'Copy Telegram Connect Link'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => sendSharePageMutation.mutate({ id: createdKey.id, reason: 'CREATED' })}
                disabled={sendSharePageMutation.isPending}
              >
                {sendSharePageMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="mr-2 h-4 w-4" />
                )}
                {locale === 'my' ? 'Telegram သို့ ပို့မည်' : 'Send via Telegram'}
              </Button>
            </div>
          </div>

          <div className="border-t border-border/60 bg-muted/25 p-6 lg:border-l lg:border-t-0">
            <div className="flex h-full flex-col rounded-[1.5rem] border border-border/60 bg-background/80 p-4 dark:bg-[rgba(4,10,20,0.82)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('keys.actions.show_qr')}
              </p>
              <div className="mt-4 flex flex-1 items-center justify-center rounded-[1.2rem] border border-dashed border-border/60 bg-background/60 p-4 dark:bg-[rgba(255,255,255,0.02)]">
                {isLoading ? (
                  <div className="h-[180px] w-[180px] animate-pulse rounded-[1rem] bg-muted" />
                ) : qrData?.qrCode ? (
                  <QRCodeWithLogo dataUrl={qrData.qrCode} size={180} />
                ) : (
                  <p className="text-center text-sm text-muted-foreground">{t('keys.dialog.qr_failed')}</p>
                )}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                {t('keys.dialog.created_qr_help')}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * QRCodeDialog Component
 * 
 * Displays a QR code for easy key sharing and provides copy functionality
 * for the access URL.
 */
function QRCodeDialog({
  keyId,
  keyName,
  open,
  onOpenChange,
}: {
  keyId: string;
  keyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';

  // Fetch QR code
  const { data, isLoading } = trpc.keys.generateQRCode.useQuery(
    { id: keyId },
    { enabled: open }
  );

  // Fetch key details for access URL
  const { data: keyData } = trpc.keys.getById.useQuery(
    { id: keyId },
    { enabled: open }
  );

  const handleCopyUrl = async () => {
    if (keyData?.accessUrl) {
      await copyToClipboard(keyData.accessUrl, t('keys.toast.copied'), t('keys.toast.copy_access_url'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{t('keys.actions.show_qr')}: {keyName}</DialogTitle>
          <DialogDescription>
            {keyData?.maxDevices && keyData?.boundDeviceInstallsOnly
              ? 'Scan this code or use the managed client link when you want device-limit protection to stay intact. Copying the raw access URL weakens that protection.'
              : 'Scan this code in Outline or copy the raw access URL if you need to deliver the key manually.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <DialogSection>
            <DialogSectionHeader>
              <DialogSectionTitle>QR connection</DialogSectionTitle>
              <DialogSectionDescription>
                This is the fastest way to move the key into a device without exposing the full URL in chat.
              </DialogSectionDescription>
            </DialogSectionHeader>

            <div className="flex flex-col items-center gap-4">
              {isLoading ? (
                <div className="h-[220px] w-[220px] animate-pulse rounded-[1.2rem] bg-muted" />
              ) : data?.qrCode ? (
                <div className="ops-modal-stat-card flex items-center justify-center p-4">
                  <QRCodeWithLogo dataUrl={data.qrCode} size={200} />
                </div>
              ) : (
                <div className="ops-modal-stat-card flex h-[220px] w-full items-center justify-center text-center text-sm text-muted-foreground">
                  {t('keys.dialog.qr_failed')}
                </div>
              )}
            </div>
          </DialogSection>

          <DialogSection>
            <DialogSectionHeader>
              <DialogSectionTitle>Direct access URL</DialogSectionTitle>
              <DialogSectionDescription>
                Use this when the user cannot scan the QR code or when you need to paste the key into another tool.
              </DialogSectionDescription>
            </DialogSectionHeader>

            <div className="ops-modal-code-panel">
              {keyData?.accessUrl || '-'}
            </div>
          </DialogSection>
        </DialogBody>

        <DialogFooter className="ops-modal-sticky-footer">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={handleCopyUrl}
            disabled={!keyData?.accessUrl}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('keys.actions.copy_access_url')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * DeleteKeyDialog Component
 * 
 * A confirmation dialog for deleting an access key.
 */
function DeleteKeyDialog({
  open,
  onOpenChange,
  keyName,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyName: string;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { t, locale } = useLocale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{t('keys.delete_title')}</DialogTitle>
          <DialogDescription>
            Review the impact before removing this key from inventory.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <DialogSection>
            <DialogSectionHeader>
              <DialogSectionTitle>{keyName}</DialogSectionTitle>
              <DialogSectionDescription>
                The access URL, QR code, share page, and renewal trail for this key will stop working immediately after deletion.
              </DialogSectionDescription>
            </DialogSectionHeader>
            <div className="ops-modal-note ops-modal-note-danger">
              {t('keys.confirm_delete')} &quot;{keyName}&quot;? {t('keys.confirm_delete_desc')}
            </div>
          </DialogSection>
        </DialogBody>
        <DialogFooter className="ops-modal-sticky-footer">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('keys.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('keys.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/**
 * BulkRenewDialog Component
 *
 * A dialog for renewing multiple keys with the same duration and quota top-up.
 */
function BulkRenewDialog({
  open,
  onOpenChange,
  count,
  presets,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  presets: RenewalPackagePreset[];
  onConfirm: (input: { months: number; addDataLimitGB: number | null }) => void;
  isPending: boolean;
}) {
  const [months, setMonths] = useState<1 | 2 | 3>(1);
  const [addDataLimitGB, setAddDataLimitGB] = useState('');
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const selectedLabel = count === 1 ? t('keys.bulk.selected_singular') : t('keys.bulk.selected_plural');
  const parsedAddDataLimitGB = addDataLimitGB.trim() === '' ? null : Number(addDataLimitGB);
  const addDataLimitInvalid = parsedAddDataLimitGB != null
    && (!Number.isFinite(parsedAddDataLimitGB) || parsedAddDataLimitGB <= 0);
  const selectedPresetCode =
    presets.find((preset) => preset.months === months && preset.dataLimitGB === parsedAddDataLimitGB)?.code ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t('keys.bulk.extend_title')}
          </DialogTitle>
          <DialogDescription>
            {fillTemplate(
              t(count === 1 ? 'keys.bulk.extend_desc_single' : 'keys.bulk.extend_desc'),
              { count, items: selectedLabel },
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {presets.length > 0 ? (
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'Package presets' : 'Package presets'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar
                    ? 'Telegram sales settings မှ access-key plan များကို အသုံးပြုပြီး renewal လနှင့် GB ကို တစ်ချက်နှိပ်ဖြင့် ဖြည့်မည်။'
                    : 'Reuse access-key plans from Telegram sales settings to fill the renewal months and GB in one tap.'}
                </DialogSectionDescription>
              </DialogSectionHeader>
              <RenewalPackagePicker
                presets={presets}
                selectedCode={selectedPresetCode}
                isMyanmar={isMyanmar}
                onSelect={(preset) => {
                  setMonths(preset.months);
                  setAddDataLimitGB(String(preset.dataLimitGB));
                }}
              />
            </DialogSection>
          ) : null}

          <DialogSection>
            <DialogSectionHeader>
              <DialogSectionTitle>{isMyanmar ? 'Manual adjustment' : 'Manual adjustment'}</DialogSectionTitle>
              <DialogSectionDescription>
                {isMyanmar
                  ? 'Preset ကို ရွေးပြီးနောက် လပိုင်း သို့မဟုတ် top-up data ကို ကိုယ်တိုင် ပြင်နိုင်သည်။'
                  : 'After choosing a preset, you can still fine-tune the months or quota top-up.'}
              </DialogSectionDescription>
            </DialogSectionHeader>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((option) => (
                <Button
                  key={option}
                  variant={months === option ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMonths(option as 1 | 2 | 3)}
                >
                  {isMyanmar
                    ? `${option} လ`
                    : option === 1
                      ? '1 month'
                      : `${option} months`}
                </Button>
              ))}
            </div>
          </DialogSection>

          <DialogSection>
            <DialogSectionHeader>
              <DialogSectionTitle>{isMyanmar ? 'Data top-up' : 'Data top-up'}</DialogSectionTitle>
              <DialogSectionDescription>
                {isMyanmar
                  ? 'လိုအပ်လျှင် data quota ကို GB အလိုက် ထပ်တိုးနိုင်သည်။'
                  : 'Optionally add the same extra quota to every selected key.'}
              </DialogSectionDescription>
            </DialogSectionHeader>
            <div className="space-y-2">
              <Label htmlFor="bulk-renew-add-gb">{isMyanmar ? 'ထပ်တိုးမည့် data (GB)' : 'Add data (GB)'}</Label>
              <Input
                id="bulk-renew-add-gb"
                type="number"
                min="0"
                step="0.01"
                placeholder={isMyanmar ? 'ဥပမာ - 10' : 'e.g. 10'}
                value={addDataLimitGB}
                onChange={(event) => setAddDataLimitGB(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {isMyanmar
                  ? 'ဤပမာဏသည် လက်ရှိ quota ပေါ် ထပ်တိုးမည်ဖြစ်ပြီး total quota ကို မအစားထိုးပါ။'
                  : 'This tops up the existing quota. It does not replace the current total.'}
              </p>
            </div>
          </DialogSection>

          <DialogSection>
            <DialogSectionHeader>
              <DialogSectionTitle>{isMyanmar ? 'Apply to selection' : 'Apply to selection'}</DialogSectionTitle>
            </DialogSectionHeader>
            <div className="ops-modal-note">
              {isMyanmar
                ? `${count} ${selectedLabel} ကို ${months} လ သက်တမ်းတိုးမည်${parsedAddDataLimitGB ? ` နှင့် data ${parsedAddDataLimitGB} GB ထပ်တိုးမည်` : ''}။`
                : `Renew ${count} ${selectedLabel} by ${months === 1 ? '1 month' : `${months} months`}${parsedAddDataLimitGB ? ` and add ${parsedAddDataLimitGB} GB` : ''}.`}
            </div>
            <p className="text-xs text-muted-foreground">
              {isMyanmar
                ? 'Disabled သော့များ သို့မဟုတ် renewal မအောင်မြင်သော သော့များကို result ထဲတွင် သီးသန့်ပြသမည်။'
                : 'Disabled keys or failed renewals will be listed separately in the results.'}
            </p>
          </DialogSection>
        </DialogBody>

        <DialogFooter className="ops-modal-sticky-footer">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('keys.cancel')}
          </Button>
          <Button
            onClick={() => onConfirm({
              months,
              addDataLimitGB: parsedAddDataLimitGB,
            })}
            disabled={isPending || addDataLimitInvalid}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('keys.bulk.progress.processing')}
              </>
            ) : fillTemplate(t('keys.bulk.extend_confirm'), {
              count,
              items: selectedLabel,
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * BulkTagsDialog Component
 *
 * A dialog for adding or removing tags from multiple keys.
 */
function BulkTagsDialog({
  open,
  onOpenChange,
  count,
  mode,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  mode: 'add' | 'remove';
  onConfirm: (tags: string) => void;
  isPending: boolean;
}) {
  const [tags, setTags] = useState('');
  const { t } = useLocale();
  const selectedLabel = count === 1 ? t('keys.bulk.selected_singular') : t('keys.bulk.selected_plural');

  const handleSubmit = () => {
    if (tags.trim()) {
      onConfirm(tags.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            {mode === 'add' ? t('keys.bulk.tags_add_title') : t('keys.bulk.tags_remove_title')}
          </DialogTitle>
          <DialogDescription>
            {fillTemplate(
              t(mode === 'add' ? 'keys.bulk.tags_add_desc' : 'keys.bulk.tags_remove_desc'),
              { count, items: selectedLabel },
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <DialogSection>
            <DialogSectionHeader>
              <DialogSectionTitle>Tag list</DialogSectionTitle>
              <DialogSectionDescription>
                Enter one or more tags separated by commas. The same list will be applied to the current selection.
              </DialogSectionDescription>
            </DialogSectionHeader>
            <div className="space-y-2">
              <Label htmlFor="tags">{t('keys.bulk.tags_label')}</Label>
              <Input
                id="tags"
                placeholder={t('keys.bulk.tags_placeholder')}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('keys.bulk.tags_help')}
              </p>
            </div>
          </DialogSection>
        </DialogBody>

        <DialogFooter className="ops-modal-sticky-footer">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('keys.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !tags.trim()}
            variant={mode === 'remove' ? 'destructive' : 'default'}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === 'add' ? t('keys.bulk.add_tags') : t('keys.bulk.remove_tags')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkRenewalOutreachResultDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: (input: { outcome: RenewalOutreachOutcome; note: string | null }) => void;
  isPending: boolean;
}) {
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const selectedLabel = count === 1 ? t('keys.bulk.selected_singular') : t('keys.bulk.selected_plural');
  const [outcome, setOutcome] = useState<RenewalOutreachOutcome>('SENT');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) {
      setOutcome('SENT');
      setNote('');
    }
  }, [open]);

  const handleSubmit = () => {
    onConfirm({
      outcome,
      note: note.trim() ? note.trim() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {isMyanmar ? 'Outreach result မှတ်ရန်' : 'Log outreach result'}
          </DialogTitle>
          <DialogDescription>
            {isMyanmar
              ? `${count} ${selectedLabel} အတွက် manual outreach outcome ကို audit trail ထဲမှာ မှတ်မည်။`
              : `Log the manual outreach outcome for ${count} ${selectedLabel} in the audit trail.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <DialogSection>
            <DialogSectionHeader>
              <DialogSectionTitle>{isMyanmar ? 'Outcome' : 'Outcome'}</DialogSectionTitle>
              <DialogSectionDescription>
                {isMyanmar
                  ? 'ရွေးထားသော outcome ကို selection တစ်ခုလုံးအပေါ် သက်ရောက်စေမည်။'
                  : 'The selected outcome will be applied to the full current selection.'}
              </DialogSectionDescription>
            </DialogSectionHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="renewal-outreach-outcome">{isMyanmar ? 'မှတ်မည့်အခြေအနေ' : 'Result to log'}</Label>
                <Select value={outcome} onValueChange={(value) => setOutcome(value as RenewalOutreachOutcome)}>
                  <SelectTrigger id="renewal-outreach-outcome">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENEWAL_OUTREACH_OUTCOME_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {getRenewalOutreachOutcomeOptionLabel(option, isMyanmar)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {getRenewalOutreachOutcomeOptionDescription(outcome, isMyanmar)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="renewal-outreach-note">{isMyanmar ? 'မှတ်ချက် (optional)' : 'Note (optional)'}</Label>
                <Textarea
                  id="renewal-outreach-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 280))}
                  placeholder={isMyanmar
                    ? 'ဥပမာ - Viber မှတစ်ဆင့် follow-up လုပ်ပြီး၊ ညပိုင်းတွင်ပြန်ဆက်မည်'
                    : 'Optional context for the audit log, for example: followed up via Viber and asked to check again tonight'}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  {isMyanmar
                    ? `${note.length}/280 စာလုံး။ Audit log ထဲတွင် outcome နှင့်အတူ သိမ်းမည်။`
                    : `${note.length}/280 characters. This note will be stored with the outcome in the audit log.`}
                </p>
              </div>
            </div>
          </DialogSection>
        </DialogBody>

        <DialogFooter className="ops-modal-sticky-footer">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('keys.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isMyanmar ? 'Result မှတ်မည်' : 'Log result'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * BulkProgressDialog Component
 *
 * Shows progress and results of bulk operations.
 */
function BulkProgressDialog({
  open,
  onOpenChange,
  title,
  results,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  results: { success: number; failed: number; errors?: { id: string; name: string; error: string }[] } | null;
  isPending: boolean;
}) {
  const { t, locale } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Review the result before you close the operation window or start another bulk action.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isPending ? (
            <DialogSection className="items-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('keys.bulk.progress.processing')}</p>
            </DialogSection>
          ) : results ? (
            <>
              <DialogSection>
                <DialogSectionHeader>
                  <DialogSectionTitle>Operation summary</DialogSectionTitle>
                </DialogSectionHeader>
                <div className="ops-modal-card-grid-2">
                  <div className="ops-modal-stat-card">
                  <p className="text-2xl font-bold text-green-500">{results.success}</p>
                  <p className="text-sm text-green-500">{t('keys.bulk.progress.successful')}</p>
                  </div>
                  <div className="ops-modal-stat-card">
                  <p className="text-2xl font-bold text-red-500">{results.failed}</p>
                  <p className="text-sm text-red-500">{t('keys.bulk.progress.failed')}</p>
                  </div>
                </div>
              </DialogSection>

              {results.errors && results.errors.length > 0 && (
                <DialogSection>
                  <DialogSectionHeader>
                    <DialogSectionTitle>{t('keys.bulk.progress.errors')}</DialogSectionTitle>
                    <DialogSectionDescription>
                      These items were not completed and may need a retry or a smaller batch.
                    </DialogSectionDescription>
                  </DialogSectionHeader>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {results.errors.map((err, i) => (
                      <div key={i} className="ops-modal-note ops-modal-note-danger text-xs text-red-500 dark:text-red-300">
                        <span className="font-medium">{err.name || err.id}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </DialogSection>
              )}
            </>
          ) : null}
        </DialogBody>

        <DialogFooter className="ops-modal-sticky-footer">
          <Button onClick={() => onOpenChange(false)} disabled={isPending}>
            {isPending ? t('keys.bulk.progress.processing') : t('keys.bulk.progress.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * EditKeyDialog Component
 *
 * A dialog for editing access key properties.
 */
function EditKeyDialog({
  open,
  onOpenChange,
  keyData,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyData: {
    id: string;
    name: string;
    email: string | null;
    telegramId: string | null;
    notes: string | null;
    dataLimitBytes: bigint | null;
    dataLimitResetStrategy: string | null;
    durationDays: number | null;
    expiresAt: Date | null;
    expirationType: string | null;
    maxDevices: number | null;
    boundDeviceInstallsOnly?: boolean | null;
    autoDisableOnLimit: boolean;
    autoDisableOnExpire: boolean;
    autoArchiveAfterDays: number;
    quotaAlertThresholds: string | null;
    autoRenewPolicy: string | null;
    autoRenewDurationDays: number | null;
  };
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const [formData, setFormData] = useState({
    name: keyData.name,
    email: keyData.email || '',
    telegramId: keyData.telegramId || '',
    notes: keyData.notes || '',
    dataLimitGB: keyData.dataLimitBytes
      ? (Number(keyData.dataLimitBytes) / (1024 * 1024 * 1024)).toString()
      : '',
    dataLimitResetStrategy: (keyData.dataLimitResetStrategy as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER') || 'NEVER',
    durationDays: keyData.durationDays?.toString() || '',
    expiresAt: keyData.expiresAt ? new Date(keyData.expiresAt).toISOString().split('T')[0] : '',
    maxDevices: keyData.maxDevices?.toString() || '',
    boundDeviceInstallsOnly: keyData.boundDeviceInstallsOnly ?? Boolean(keyData.maxDevices),
  });

  // Reset form data when keyData changes
  useEffect(() => {
    setFormData({
      name: keyData.name,
      email: keyData.email || '',
      telegramId: keyData.telegramId || '',
      notes: keyData.notes || '',
      dataLimitGB: keyData.dataLimitBytes
        ? (Number(keyData.dataLimitBytes) / (1024 * 1024 * 1024)).toString()
        : '',
      dataLimitResetStrategy: (keyData.dataLimitResetStrategy as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER') || 'NEVER',
      durationDays: keyData.durationDays?.toString() || '',
      expiresAt: keyData.expiresAt ? new Date(keyData.expiresAt).toISOString().split('T')[0] : '',
      maxDevices: keyData.maxDevices?.toString() || '',
      boundDeviceInstallsOnly: keyData.boundDeviceInstallsOnly ?? Boolean(keyData.maxDevices),
    });
  }, [keyData]);

  const updateMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: t('keys.toast.updated'),
        description: t('keys.toast.updated_desc'),
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.update_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('keys.toast.validation'),
        description: t('keys.toast.validation_name_desc'),
        variant: 'destructive',
      });
      return;
    }

    updateMutation.mutate({
      id: keyData.id,
      name: formData.name.trim(),
      email: formData.email || undefined,
      telegramId: formData.telegramId || undefined,
      notes: formData.notes || undefined,
      dataLimitGB: formData.dataLimitGB ? parseFloat(formData.dataLimitGB) : undefined,
      dataLimitResetStrategy: formData.dataLimitResetStrategy,
      durationDays: formData.durationDays ? parseInt(formData.durationDays) : undefined,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined,
      maxDevices: formData.maxDevices ? parseInt(formData.maxDevices, 10) : null,
      boundDeviceInstallsOnly: formData.maxDevices ? formData.boundDeviceInstallsOnly : false,
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto p-0 sm:max-w-[min(860px,calc(100vw-2rem))]">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{t('keys.dialog.edit_title')}</DialogTitle>
          <DialogDescription>
            Update the key record, customer contact info, and lifecycle rules in one pass.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>Identity and contact</DialogSectionTitle>
                <DialogSectionDescription>
                  Keep the key name and owner contact fields accurate so support, renewals, and Telegram delivery stay aligned.
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="editName">{t('keys.form.name')}</Label>
                  <Input
                    id="editName"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editEmail">{t('keys.form.email')}</Label>
                  <Input
                    id="editEmail"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="editTelegram">{t('keys.form.telegram')}</Label>
                  <Input
                    id="editTelegram"
                    value={formData.telegramId}
                    onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
                  />
                </div>
              </div>
            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>Limits and lifecycle</DialogSectionTitle>
                <DialogSectionDescription>
                  Control quota, device guidance, and expiration behavior without jumping into the detail page.
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="editDataLimit">{t('keys.form.data_limit')}</Label>
                  <Input
                    id="editDataLimit"
                    type="number"
                    placeholder={t('keys.form.data_limit_placeholder')}
                    value={formData.dataLimitGB}
                    onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
                    min="0"
                    step="0.5"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editMaxDevices">Soft device limit (estimated)</Label>
                  <Input
                    id="editMaxDevices"
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Leave empty for no device cap"
                    value={formData.maxDevices}
                    onChange={(e) => setFormData({ ...formData, maxDevices: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {ACCESS_KEY_SOFT_DEVICE_LIMIT_HINT}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-4 py-3 sm:col-span-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Hide raw config on official install screens</p>
                    <p className="text-xs text-muted-foreground">
                      {ACCESS_KEY_PROTECTED_INSTALL_HINT}
                    </p>
                  </div>
                  <Switch
                    checked={formData.boundDeviceInstallsOnly}
                    onCheckedChange={(checked) => setFormData({ ...formData, boundDeviceInstallsOnly: checked })}
                  />
                </div>

                {formData.dataLimitGB && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t('keys.form.reset_strategy')}</Label>
                    <Select
                      value={formData.dataLimitResetStrategy}
                      onValueChange={(value: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER') =>
                        setFormData({ ...formData, dataLimitResetStrategy: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEVER">{t('keys.form.reset.never')}</SelectItem>
                        <SelectItem value="DAILY">{t('keys.form.reset.daily')}</SelectItem>
                        <SelectItem value="WEEKLY">{t('keys.form.reset.weekly')}</SelectItem>
                        <SelectItem value="MONTHLY">{t('keys.form.reset.monthly')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="editDuration">{t('keys.form.duration')}</Label>
                  <Input
                    id="editDuration"
                    type="number"
                    placeholder="30"
                    value={formData.durationDays}
                    onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('keys.form.duration_help')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editExpiration">{t('keys.form.expiration_date')}</Label>
                  <Input
                    id="editExpiration"
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('keys.form.expiration_date_help')}
                  </p>
                </div>
              </div>
            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>Internal note</DialogSectionTitle>
                <DialogSectionDescription>
                  Leave a short operational note for future support or admin handoff.
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="space-y-2">
                <Label htmlFor="editNotes">{t('keys.form.notes')}</Label>
                <Input
                  id="editNotes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </DialogSection>
          </DialogBody>

          <DialogFooter className="ops-modal-sticky-footer">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('keys.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('keys.dialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: { success: number; failed: number; errors: string[] }) => void;
}) {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
  const { data: servers } = trpc.servers.list.useQuery(undefined, {
    enabled: open,
  });
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [count, setCount] = useState('5');
  const [namePrefix, setNamePrefix] = useState('Batch');
  const [dataLimitGB, setDataLimitGB] = useState('');
  const [expirationType, setExpirationType] = useState<'NEVER' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE'>('NEVER');
  const [durationDays, setDurationDays] = useState('30');
  const [confirmDrainingServers, setConfirmDrainingServers] = useState(false);

  const bulkCreateMutation = trpc.keys.bulkCreate.useMutation({
    onSuccess: (result) => {
      toast({
        title: isMyanmar ? 'အစုလိုက် ဖန်တီးမှု ပြီးဆုံးပါပြီ' : 'Bulk creation finished',
        description:
          result.failed > 0
            ? isMyanmar
              ? `သော့ ${result.success} ခု ဖန်တီးပြီး၊ ${result.failed} ခု မအောင်မြင်ပါ။`
              : `${result.success} keys created, ${result.failed} failed.`
            : isMyanmar
              ? `သော့ ${result.success} ခုကို အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ။`
              : `${result.success} keys created successfully.`,
        variant: result.failed > 0 ? 'destructive' : 'default',
      });
      onSuccess(result);
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'အစုလိုက် ဖန်တီးမှု မအောင်မြင်ပါ' : 'Bulk creation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!open) {
      setSelectedServerIds([]);
      setCount('5');
      setNamePrefix('Batch');
      setDataLimitGB('');
      setExpirationType('NEVER');
      setDurationDays('30');
      setConfirmDrainingServers(false);
    }
  }, [open]);

  const selectedServers = useMemo(
    () => (servers ?? []).filter((server) => selectedServerIds.includes(server.id)),
    [selectedServerIds, servers],
  );
  const selectedDrainingServers = selectedServers.filter((server) => server.lifecycleMode === 'DRAINING');
  const needsDrainingConfirmation = selectedDrainingServers.length > 0;

  const toggleServer = (serverId: string, checked: boolean) => {
    setSelectedServerIds((prev) =>
      checked ? Array.from(new Set([...prev, serverId])) : prev.filter((id) => id !== serverId),
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (selectedServerIds.length === 0) {
      toast({
        title: isMyanmar ? 'အနည်းဆုံး ဆာဗာတစ်ခု ရွေးပါ' : 'Select at least one server',
        description: isMyanmar
          ? 'အစုလိုက် ဖန်တီးရန် ဦးတည်ဆာဗာ တစ်ခု သို့မဟုတ် ထို့ထက်ပိုသော ဆာဗာများ လိုအပ်သည်။'
          : 'Bulk create needs one or more target servers.',
        variant: 'destructive',
      });
      return;
    }

    if (!namePrefix.trim()) {
      toast({
        title: isMyanmar ? 'အမည် ရှေ့ဆက် စာသား လိုအပ်သည်' : 'Name prefix required',
        description: isMyanmar
          ? 'ဖန်တီးမည့် သော့အမည်များအတွက် ရှေ့ဆက် စာသားတစ်ခု ထည့်ပါ။'
          : 'Enter a prefix for the generated key names.',
        variant: 'destructive',
      });
      return;
    }

    if (needsDrainingConfirmation && !confirmDrainingServers) {
      toast({
        title: isMyanmar ? 'လက်ခံမှုလျှော့ထားသော ဆာဗာများကို အတည်ပြုပါ' : 'Confirm draining servers',
        description: isMyanmar
          ? 'ဤအစုလိုက် ဖန်တီးမှုသည် စီမံခန့်ခွဲသူက တိုက်ရိုက်ရွေးထားသော လုပ်ဆောင်မှုဖြစ်သော်လည်း ဆက်မလုပ်မီ လက်ခံမှုလျှော့ထားသော ဆာဗာများကို အတည်ပြုရန် လိုအပ်ပါသည်။'
          : 'Bulk create is explicit admin use, but you still need to confirm draining targets before continuing.',
        variant: 'destructive',
      });
      return;
    }

    bulkCreateMutation.mutate({
      serverIds: selectedServerIds,
      count: Math.max(1, Math.min(100, Number.parseInt(count || '1', 10) || 1)),
      namePrefix: namePrefix.trim(),
      dataLimitGB: dataLimitGB ? Number.parseFloat(dataLimitGB) : null,
      expirationType,
      durationDays: expirationType === 'DURATION_FROM_CREATION' ? Math.max(1, Number.parseInt(durationDays || '1', 10) || 1) : null,
      confirmDrainingServers: needsDrainingConfirmation ? confirmDrainingServers : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto p-0 sm:max-w-[min(960px,calc(100vw-2rem))]">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{isMyanmar ? 'အသုံးပြုခွင့် သော့များကို အစုလိုက် ဖန်တီးရန်' : 'Bulk create access keys'}</DialogTitle>
          <DialogDescription>
            {isMyanmar
              ? 'ဆာဗာ တစ်ခု သို့မဟုတ် ထို့ထက်ပိုသော ဆာဗာများအတွက် ထပ်တူကျသော သော့အစုများကို ဖန်တီးပါ။ ဤနေရာတွင် draining ဆာဗာများကို ခွင့်ပြုထားခြင်းမှာ admin က တိုက်ရိုက်ရွေးထားခြင်းကြောင့်သာ ဖြစ်သည်။'
              : 'Generate repeatable batches across one or more servers. Draining targets are allowed here only because this is explicit admin placement.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'အမည်နှင့် အရေအတွက်' : 'Naming and quantity'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar
                    ? 'အမည် ရှေ့ဆက်၊ ဦးတည်ဆာဗာတစ်ခုလျှင် သော့အရေအတွက်နှင့် သော့အသစ်တိုင်းအတွက် optional quota ကို သတ်မှတ်ပါ။'
                    : 'Set the shared prefix, the number of keys per target, and an optional quota for every new key in the batch.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="bulk-name-prefix">{isMyanmar ? 'အမည် ရှေ့ဆက်' : 'Name prefix'}</Label>
                  <Input
                    id="bulk-name-prefix"
                    value={namePrefix}
                    onChange={(event) => setNamePrefix(event.target.value)}
                    placeholder="Batch"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk-count">{isMyanmar ? 'ဆာဗာတစ်ခုလျှင် သော့အရေအတွက်' : 'Keys per server'}</Label>
                  <Input
                    id="bulk-count"
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(event) => setCount(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk-limit">{isMyanmar ? 'ဒေတာ ကန့်သတ်ချက် (GB)' : 'Data limit (GB)'}</Label>
                  <Input
                    id="bulk-limit"
                    type="number"
                    min={1}
                    value={dataLimitGB}
                    onChange={(event) => setDataLimitGB(event.target.value)}
                    placeholder={isMyanmar ? 'မထည့်လည်း ရသည်' : 'Optional'}
                  />
                </div>
              </div>
            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'နေရာချထားမှုနှင့် သက်တမ်း' : 'Placement and expiry'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar
                    ? 'ဤအစုတစ်ခုလုံးအတွက် အသုံးပြုမည့် ဦးတည်ဆာဗာများနှင့် သက်တမ်းပုံစံကို ရွေးပါ။'
                    : 'Choose the destination servers and the expiry model that should apply to the whole batch.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-2">
                  <Label>{locale === 'my' ? 'ဦးတည်ဆာဗာများ' : 'Target servers'}</Label>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-border/60 bg-background/45 p-3 dark:bg-white/[0.03]">
                    {(servers ?? []).map((server) => {
                      const lifecycleMeta = getServerLifecycleMeta(server.lifecycleMode);
                      const isDisabled = !server.isActive || server.lifecycleMode === 'MAINTENANCE';
                      const isChecked = selectedServerIds.includes(server.id);

                      return (
                        <label
                          key={server.id}
                          className={cn(
                            'flex items-start gap-3 rounded-xl border px-3 py-3 text-sm',
                            isChecked ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-border/50 bg-background/40 dark:bg-white/[0.02]',
                            isDisabled && 'opacity-50',
                          )}
                        >
                          <Checkbox
                            checked={isChecked}
                            disabled={isDisabled}
                            onCheckedChange={(checked) => toggleServer(server.id, Boolean(checked))}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {server.countryCode && `${getCountryFlag(server.countryCode)} `}{server.name}
                              </span>
                              <ServerLifecycleBadge mode={server.lifecycleMode} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {server.location || lifecycleMeta.assignmentHint}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'သက်တမ်းပုံစံ' : 'Expiry mode'}</Label>
                    <Select value={expirationType} onValueChange={(value) => setExpirationType(value as 'NEVER' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEVER">{isMyanmar ? 'မသက်တမ်းကုန်ပါ' : 'Never expire'}</SelectItem>
                        <SelectItem value="DURATION_FROM_CREATION">{isMyanmar ? 'ဖန်တီးချိန်မှ ရက်တွက်မည်' : 'Duration from creation'}</SelectItem>
                        <SelectItem value="START_ON_FIRST_USE">{isMyanmar ? 'ပထမအသုံးပြုချိန်တွင် စတင်မည်' : 'Start on first use'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {expirationType === 'DURATION_FROM_CREATION' ? (
                    <div className="space-y-2">
                      <Label htmlFor="bulk-duration">{isMyanmar ? 'သက်တမ်း (ရက်)' : 'Duration (days)'}</Label>
                      <Input
                        id="bulk-duration"
                        type="number"
                        min={1}
                        value={durationDays}
                        onChange={(event) => setDurationDays(event.target.value)}
                      />
                    </div>
                  ) : null}

                  <div className="ops-modal-note text-xs">
                    <p className="font-medium text-foreground">{isMyanmar ? 'သတ်မှတ်နေရာချထားမှု မူဝါဒ' : 'Assignment policy'}</p>
                    <p className="mt-1">
                      {isMyanmar
                        ? 'Maintenance ဆာဗာများကို ဆက်လက်ပိတ်ထားမည်။ Draining ဆာဗာများကို သင်တိုက်ရိုက်ရွေးထားသောကြောင့်သာ ခွင့်ပြုထားသည်။'
                        : 'Maintenance targets stay blocked. Draining targets remain allowed only because you selected them intentionally.'}
                    </p>
                  </div>
                </div>
              </div>
            </DialogSection>

            {needsDrainingConfirmation ? (
              <DialogSection>
                <label className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm">
                  <Checkbox
                    checked={confirmDrainingServers}
                    onCheckedChange={(checked) => setConfirmDrainingServers(Boolean(checked))}
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{isMyanmar ? 'လက်ခံမှုလျှော့ထားသော ဆာဗာများကို အတည်ပြုပါ' : 'Confirm draining targets'}</p>
                    <p className="text-xs text-muted-foreground">
                      {isMyanmar
                        ? `${selectedDrainingServers.map((server) => server.name).join(', ')} သည် လက်ခံမှုလျှော့ထားသော အနေအထားတွင် ရှိနေသည်။ အလိုအလျောက်နေရာချထားမှုသည် ၎င်းတို့ကို ရှောင်လွှဲမည်ဖြစ်သော်လည်း သင်တိုက်ရိုက်ရွေးထားသောကြောင့် ဤအစုအတွက် ၎င်းတို့တွင်ပင် သော့များကို ဖန်တီးမည်။`
                        : `${selectedDrainingServers.map((server) => server.name).join(', ')} ${selectedDrainingServers.length === 1 ? 'is' : 'are'} draining. Auto-placement avoids them, but this batch will still create keys there because you selected them explicitly.`}
                    </p>
                  </div>
                </label>
              </DialogSection>
            ) : null}
          </DialogBody>

          <DialogFooter className="ops-modal-sticky-footer">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={bulkCreateMutation.isPending}>
              {bulkCreateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {isMyanmar ? 'သော့များ ဖန်တီးမည်' : 'Create keys'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Online indicator component with blinking animation
 */
function OnlineIndicator({ isOnline }: { isOnline: boolean }) {
  const { t } = useLocale();

  if (!isOnline) return null;

  return (
    <span className="relative flex h-2 w-2 mr-2" title={t('keys.online_active')}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
    </span>
  );
}

/**
 * KeyRow Component
 *
 * Displays a single access key in the table with its metrics and actions.
 */
function KeyRow({
  accessKey,
  onDelete,
  onRenew,
  onSendRenewalReminder,
  canSendRenewalReminder,
  onEnableTelegramDelivery,
  onCopyTelegramConnectLink,
  isTelegramDeliveryMutationPending,
  onShowQR,
  onToggleStatus,
  isSelected,
  onSelect,
  isTogglingStatus,
  isOnline,
  onCopyAccessUrl,
  onCopySubscriptionUrl,
  onEdit,
  onTagClick,
  sparklineData,
  showRenewalSignals,
}: {
  accessKey: {
    id: string;
    name: string;
    email: string | null;
    status: string;
    usedBytes: bigint;
    dataLimitBytes: bigint | null;
    usagePercent?: number;
    expiresAt: Date | null;
    daysRemaining?: number | null;
    isExpiringSoon?: boolean;
    isTrafficWarning?: boolean;
    estimatedDevices?: number;
    maxDevices?: number | null;
    deviceLimitObservedDevices?: number;
    deviceLimitOverLimit?: boolean;
    deviceLimitEnforcementStage?: string;
    deviceLimitSuppressedUntil?: Date | null;
    deviceLimitAutoDisabledAt?: Date | null;
    lastUsedAt?: Date | null;
    lastTrafficAt?: Date | null;
    recentTrafficDeltaBytes?: bigint;
    tags?: string | null;
    renewalReminder?: {
      lastReminderAt?: Date | null;
      cooldownUntil?: Date | null;
      neverReminded?: boolean;
      remindedToday?: boolean;
      reminded24hAgo?: boolean;
      renewedAfterReminder?: boolean;
      pendingFollowUp?: boolean;
      cooldownActive?: boolean;
    } | null;
    renewalException?: {
      blockedReason?: string | null;
      cooldownUntil?: Date | null;
      needsTelegramLink?: boolean;
      deliveryDisabled?: boolean;
      automationBlocked?: boolean;
      reminderFailed?: boolean;
      lastFailedAt?: Date | null;
      lastFailedReason?: string | null;
    } | null;
    renewalOutreach?: {
      lastPreparedAt?: Date | null;
      lastCompletedAt?: Date | null;
      lastResultAt?: Date | null;
      lastOutcome?: RenewalOutreachOutcome | null;
      preparedThisCycle?: boolean;
      resultLoggedThisCycle?: boolean;
      completedThisCycle?: boolean;
      pendingResult?: boolean;
      pendingCompletion?: boolean;
      neverPrepared?: boolean;
    } | null;
    server?: {
      id: string;
      name: string;
      countryCode: string | null;
      lifecycleMode?: string | null;
    };
    createdAt: Date;
  };
  onDelete: () => void;
  onRenew: () => void;
  onSendRenewalReminder: () => void;
  canSendRenewalReminder: boolean;
  onEnableTelegramDelivery: () => void;
  onCopyTelegramConnectLink: () => void;
  isTelegramDeliveryMutationPending: boolean;
  onShowQR: () => void;
  onToggleStatus: () => void;
  isSelected: boolean;
  onSelect: () => void;
  isTogglingStatus: boolean;
  isOnline: boolean;
  onCopyAccessUrl: () => void;
  onCopySubscriptionUrl: () => void;
  onEdit: () => void;
  onTagClick?: (tag: string) => void;
  sparklineData?: { date: string; bytes: number }[];
  showRenewalSignals: boolean;
}) {
  const { t, locale } = useLocale();
  const config = statusConfig[accessKey.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
  const StatusIcon = config.icon;
  const showTrafficState = accessKey.status === 'ACTIVE';
  const { deviceCount, overLimit, stage, stageLabel } = getDeviceLimitVisualState(accessKey);
  const renewalReminderMeta = getRenewalReminderMeta(accessKey.renewalReminder, locale === 'my');
  const renewalExceptionMeta = getRenewalExceptionMeta(accessKey.renewalException, locale === 'my');
  const renewalOutreachMeta = getRenewalOutreachMeta(accessKey.renewalOutreach, locale === 'my');
  const renewalOutreachAgeMeta = getRenewalOutreachAgeMeta(accessKey.renewalOutreach);

  return (
    <tr
      className={cn(
        'border-b border-border/50 transition-colors hover:bg-muted/35 dark:hover:bg-cyan-400/[0.04]',
        isSelected && 'bg-primary/8 dark:bg-cyan-400/[0.07]'
      )}
    >
      {/* Selection checkbox */}
      <td className="px-2 py-3 w-10">
        <button
          onClick={onSelect}
          className="p-1 hover:bg-muted rounded"
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </td>

      {/* Name and email with online indicator */}
      <td className="px-4 py-3">
        <div className="flex items-center">
          <OnlineIndicator isOnline={isOnline} />
          <div className="min-w-0">
            <Link
              href={`/dashboard/keys/${accessKey.id}`}
              className="font-medium hover:text-primary transition-colors"
            >
              {accessKey.name}
            </Link>
            {accessKey.email && (
              <p className="text-xs text-muted-foreground">{accessKey.email}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('keys.last_seen')} {accessKey.lastUsedAt ? formatRelativeTime(accessKey.lastUsedAt) : t('keys.never_seen')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('keys.activity.last_traffic_short')}{' '}
              {accessKey.lastTrafficAt ? formatRelativeTime(accessKey.lastTrafficAt) : t('keys.activity.none')}
            </p>
            {showRenewalSignals ? (
              <>
                <p className="text-xs text-muted-foreground">{renewalReminderMeta.detail}</p>
                {renewalExceptionMeta ? (
                  <p className="text-xs text-muted-foreground">{renewalExceptionMeta.detail}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">{renewalOutreachMeta.detail}</p>
              </>
            ) : null}
            {accessKey.tags && (
              <div className="flex flex-wrap gap-1 mt-1">
                {stringToTags(accessKey.tags).map((tag) => (
                  <KeyTagChip
                    key={tag}
                    tag={tag}
                    compact
                    onClick={onTagClick}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Server */}
      <td className="px-4 py-3">
        {accessKey.server && (
          <div className="space-y-1">
            <Link
              href={`/dashboard/servers/${accessKey.server.id}`}
              className="flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              {accessKey.server.countryCode && (
                <span>{getCountryFlag(accessKey.server.countryCode)}</span>
              )}
              <span className="text-sm">{accessKey.server.name}</span>
            </Link>
            <ServerLifecycleBadge mode={accessKey.server.lifecycleMode} />
          </div>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div className="space-y-1.5">
          <Badge className={cn('border', config.color)}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {t(config.labelKey)}
          </Badge>
          {showTrafficState ? (
            <Badge
              variant="outline"
              className={cn(
                'border text-[11px]',
                isOnline ? 'border-green-500/40 text-green-400' : 'border-border/60 text-muted-foreground',
              )}
            >
              {isOnline ? t('keys.status.online') : t('keys.status.no_recent_traffic')}
            </Badge>
          ) : null}
          {showTrafficState ? (
            <p className="text-[11px] text-muted-foreground">
              {t('keys.activity.last_traffic_short')}{' '}
              {accessKey.lastTrafficAt ? formatRelativeTime(accessKey.lastTrafficAt) : t('keys.activity.none')}
            </p>
          ) : null}
          {showRenewalSignals ? (
            <>
              <Badge
                variant="outline"
                className={cn('border text-[11px]', renewalReminderMeta.badgeClassName)}
              >
                {renewalReminderMeta.label}
              </Badge>
              {renewalExceptionMeta ? (
                <Badge
                  variant="outline"
                  className={cn('border text-[11px]', renewalExceptionMeta.badgeClassName)}
                >
                  {renewalExceptionMeta.label}
                </Badge>
              ) : null}
              <Badge
                variant="outline"
                className={cn('border text-[11px]', renewalOutreachMeta.badgeClassName)}
              >
                {renewalOutreachMeta.label}
              </Badge>
              {renewalOutreachAgeMeta ? (
                <Badge
                  variant="outline"
                  className={cn('border text-[11px]', renewalOutreachAgeMeta.badgeClassName)}
                >
                  {renewalOutreachAgeMeta.label}
                </Badge>
              ) : null}
            </>
          ) : null}
          {accessKey.maxDevices ? (
            <div className="space-y-1">
              <Badge
                variant="outline"
                className={cn(
                  'border text-[11px]',
                  overLimit || stage === 'DISABLED'
                    ? 'border-violet-500/40 text-violet-300'
                    : stage === 'SUPPRESSED'
                      ? 'border-sky-500/40 text-sky-300'
                      : 'border-border/60 text-muted-foreground',
                )}
              >
                {deviceCount}/{accessKey.maxDevices} devices
              </Badge>
              {stage !== 'OK' ? (
                <p className={cn('text-[11px]', overLimit || stage === 'DISABLED' ? 'text-violet-300' : 'text-sky-300')}>
                  {stageLabel}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </td>

      {/* Usage */}
      <td className="px-4 py-3">
        <div className="space-y-1.5">
          <SegmentedUsageBarCompact
            valueBytes={Number(accessKey.usedBytes)}
            limitBytes={accessKey.dataLimitBytes ? Number(accessKey.dataLimitBytes) : undefined}
            className="min-w-[140px]"
          />
          <p className="text-[11px] text-muted-foreground">
            {t('keys.activity.recent_delta')}{' '}
            {accessKey.recentTrafficDeltaBytes && accessKey.recentTrafficDeltaBytes > BigInt(0)
              ? `+${formatBytes(accessKey.recentTrafficDeltaBytes)}`
              : t('keys.activity.no_recent_delta')}
          </p>
        </div>
      </td>

      {/* 7-Day Traffic Sparkline */}
      <td className="px-2 py-3 hidden xl:table-cell">
        <div className="w-[100px] h-[32px]">
          {sparklineData && sparklineData.length > 0 ? (
            <TrafficSparkline data={sparklineData} height={32} id={accessKey.id} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground/40">
              {t('keys.sparkline.empty')}
            </div>
          )}
        </div>
      </td>

      {/* Devices */}
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">
            {deviceCount}
          </span>
        </div>
        {accessKey.maxDevices ? (
          <p className={cn('mt-1 text-[11px]', overLimit || stage === 'DISABLED' ? 'text-violet-300' : stage === 'SUPPRESSED' ? 'text-sky-300' : 'text-muted-foreground')}>
            {stage !== 'OK' ? `${stageLabel} · ` : ''}limit {accessKey.maxDevices}
          </p>
        ) : null}
      </td>

      {/* Expiration */}
      <td className="px-4 py-3">
        {accessKey.expiresAt ? (
          <div className={cn(
            'text-sm',
            accessKey.isExpiringSoon && 'text-orange-500'
          )}>
            {accessKey.daysRemaining != null && accessKey.daysRemaining > 0 ? (
              <span>{accessKey.daysRemaining}{t('keys.expires.remaining_days')}</span>
            ) : accessKey.daysRemaining === 0 ? (
              <span>{t('keys.expires.today')}</span>
            ) : (
              <span className="text-red-500">{t('keys.expires.expired')}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{t('keys.never_expires')}</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onShowQR}
            title={t('keys.actions.show_qr')}
          >
            <QrCode className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              accessKey.status === 'DISABLED' ? 'text-green-500 hover:text-green-600' : 'text-orange-500 hover:text-orange-600'
            )}
            onClick={onToggleStatus}
            disabled={isTogglingStatus}
            title={accessKey.status === 'DISABLED' ? t('keys.actions.enable') : t('keys.actions.disable')}
          >
            {isTogglingStatus ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Power className="w-4 h-4" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/keys/${accessKey.id}`} className="cursor-pointer">
                  <Eye className="w-4 h-4 mr-2" />
                  {t('keys.actions.view_details')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                {t('keys.actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRenew}>
                <Calendar className="w-4 h-4 mr-2" />
                {locale === 'my' ? 'Renew လုပ်မည်' : 'Renew'}
              </DropdownMenuItem>
              {showRenewalSignals && accessKey.renewalException?.deliveryDisabled ? (
                <DropdownMenuItem
                  onClick={onEnableTelegramDelivery}
                  disabled={isTelegramDeliveryMutationPending}
                >
                  <Power className="w-4 h-4 mr-2" />
                  {locale === 'my' ? 'Telegram delivery ဖွင့်မည်' : 'Enable Telegram delivery'}
                </DropdownMenuItem>
              ) : null}
              {showRenewalSignals && accessKey.renewalException?.needsTelegramLink ? (
                <DropdownMenuItem
                  onClick={onCopyTelegramConnectLink}
                  disabled={isTelegramDeliveryMutationPending}
                >
                  <LinkCopy className="w-4 h-4 mr-2" />
                  {locale === 'my' ? 'Telegram connect link ကူးမည်' : 'Copy Telegram connect link'}
                </DropdownMenuItem>
              ) : null}
              {showRenewalSignals ? (
                <DropdownMenuItem onClick={onSendRenewalReminder} disabled={!canSendRenewalReminder}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  {locale === 'my' ? 'သက်တမ်းတိုး သတိပေးချက် ပို့မည်' : 'Send renewal reminder'}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onShowQR}>
                <QrCode className="w-4 h-4 mr-2" />
                {t('keys.actions.show_qr')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onCopyAccessUrl}>
                <Copy className="w-4 h-4 mr-2" />
                {t('keys.actions.copy_access_url')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopySubscriptionUrl}>
                <Share2 className="w-4 h-4 mr-2" />
                {t('keys.actions.copy_subscription_url')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('keys.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

/**
 * KeysPage Component
 * 
 * The main access keys page with listing, filtering, and management functionality.
 */
/**
 * Auto-sync interval options
 * When enabled, syncs with all Outline servers to get latest metrics
 */
const AUTO_SYNC_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

type BulkProgressResult = {
  success: number;
  failed: number;
  errors?: { id: string; name: string; error: string }[];
};

type BulkTelegramConnectLinksResult = BulkProgressResult & {
  links: { id: string; name: string; url: string; expiresAt: string }[];
};

type RenewalOutreachPackResult = BulkProgressResult & {
  items: {
    id: string;
    keyName: string;
    customer: string;
    telegramStatus: string;
    expiry: string;
    connectLink: string | null;
    connectLinkExpiresAt: string | null;
    suggestedMessage: string;
  }[];
  clipboardText: string;
  csv: string;
  filename: string;
};

function buildBulkTelegramConnectLinksClipboardText(
  links: BulkTelegramConnectLinksResult['links'],
  isMyanmar: boolean,
) {
  return links.map((link, index) => [
    `${index + 1}. ${link.name}`,
    `${isMyanmar ? 'ချိတ်ဆက်ရန် link' : 'Connect link'}: ${link.url}`,
    `${isMyanmar ? 'သက်တမ်းကုန်မည့်အချိန်' : 'Expires at'}: ${formatDateTime(new Date(link.expiresAt))}`,
  ].join('\n')).join('\n\n');
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function KeysPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [serverFilter, setServerFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkCreateDialogOpen, setBulkCreateDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKeySummary | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [qrDialogKey, setQrDialogKey] = useState<{ id: string; name: string } | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'group'>('list');
  const [exportingFormat, setExportingFormat] = useState<'json' | 'csv' | null>(null);
  const [editingKey, setEditingKey] = useState<{
    id: string;
    name: string;
    email: string | null;
    telegramId: string | null;
    notes: string | null;
    dataLimitBytes: bigint | null;
    dataLimitResetStrategy: string | null;
    durationDays: number | null;
    expiresAt: Date | null;
    expirationType: string | null;
    autoDisableOnLimit: boolean;
    autoDisableOnExpire: boolean;
    autoArchiveAfterDays: number;
    quotaAlertThresholds: string | null;
    maxDevices: number | null;
    autoRenewPolicy: string | null;
    autoRenewDurationDays: number | null;
  } | null>(null);
  const [renewingKey, setRenewingKey] = useState<RenewKeyDialogKeyData | null>(null);
  const [selectedRenewalQueuePresetCode, setSelectedRenewalQueuePresetCode] = useState<string | null>(null);
  const autoRefreshRef = useRef<(() => void) | null>(null);
  const { t, locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isRenewalWorkspace = pathname === '/dashboard/renewal' || searchParams.get('workspace') === 'renewal';
  const persistedFilterPageKey = isRenewalWorkspace ? 'access-keys-renewal' : 'access-keys';
  const showRenewalOpsFilters = isRenewalWorkspace;
  const inventoryWorkspaceHref = '/dashboard/keys';
  const renewalWorkspaceHref = '/dashboard/renewal';
  const workspaceTitle = isRenewalWorkspace ? (locale === 'my' ? 'Renewal Ops' : 'Renewal Ops') : t('keys.title');
  const getItemLabel = useCallback(
    (count: number) => t(count === 1 ? 'keys.bulk.item_singular' : 'keys.bulk.item_plural'),
    [t],
  );
  const getSelectedLabel = useCallback(
    (count: number) => t(count === 1 ? 'keys.bulk.selected_singular' : 'keys.bulk.selected_plural'),
    [t],
  );

  const { filters, setQuickFilter, setTagFilter, setOwnerFilter, clearFilters: clearPersistedFilters } = usePersistedFilters(persistedFilterPageKey);
  const activeRenewalWindow = filters.quickFilters.expiring3d
    ? 3
    : filters.quickFilters.expiring7d
      ? 7
      : filters.quickFilters.expiring14d
        ? 14
        : null;
  const activeReminderStateFilter = filters.quickFilters.neverReminded
    ? 'neverReminded'
    : filters.quickFilters.remindedToday
      ? 'remindedToday'
      : filters.quickFilters.reminded24hAgo
        ? 'reminded24hAgo'
        : filters.quickFilters.renewedAfterReminder
          ? 'renewedAfterReminder'
          : null;
  const activeExceptionStateFilter = filters.quickFilters.needsTelegramLink
    ? 'needsTelegramLink'
    : filters.quickFilters.deliveryDisabled
      ? 'deliveryDisabled'
      : filters.quickFilters.reminderFailed
        ? 'reminderFailed'
        : filters.quickFilters.automationBlocked
          ? 'automationBlocked'
          : null;
  const activeOutreachStateFilter: RenewalOutreachQuickFilter | null = filters.quickFilters.outreachNeverPrepared
    ? 'outreachNeverPrepared'
    : filters.quickFilters.outreachPendingResult
      ? 'outreachPendingResult'
      : filters.quickFilters.outreachSent
        ? 'outreachSent'
        : filters.quickFilters.outreachReplied
          ? 'outreachReplied'
          : filters.quickFilters.outreachRenewed
            ? 'outreachRenewed'
            : filters.quickFilters.outreachNoResponse
              ? 'outreachNoResponse'
              : filters.quickFilters.outreachDone
              ? 'outreachDone'
                : null;
  const activeOutreachAgeFilter: RenewalOutreachAgeQuickFilter | null = filters.quickFilters.outreachOlderThan72h
    ? 'outreachOlderThan72h'
    : filters.quickFilters.outreachOlderThan24h
      ? 'outreachOlderThan24h'
      : null;
  const activeOutreachLaneFilter: RenewalOutreachLaneFilter | null = activeOutreachAgeFilter
    ? activeOutreachStateFilter === 'outreachPendingResult'
      ? 'stalePendingResult'
      : activeOutreachStateFilter === 'outreachSent'
        ? 'staleSent'
        : activeOutreachStateFilter === 'outreachNoResponse'
          ? 'staleNoResponse'
          : null
    : null;
  const isRenewalQueueDepleted = statusFilter === 'DEPLETED';
  const hasRenewalQueueFilters = Boolean(
    activeRenewalWindow
    || filters.quickFilters.telegramLinked
    || activeReminderStateFilter
    || activeExceptionStateFilter
    || activeOutreachStateFilter
    || activeOutreachAgeFilter
    || isRenewalQueueDepleted,
  );
  const applyTagFilter = useCallback((tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    setTagFilter(filters.tagFilter === normalizedTag ? undefined : normalizedTag);
    setPage(1);
  }, [filters.tagFilter, setTagFilter]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setPage(1);
  }, [persistedFilterPageKey]);

  const setRenewalWindow = useCallback((days: 3 | 7 | 14 | null) => {
    setQuickFilter('expiring3d', days === 3);
    setQuickFilter('expiring7d', days === 7);
    setQuickFilter('expiring14d', days === 14);
    setPage(1);
  }, [setQuickFilter]);

  const toggleRenewalDepletedFilter = useCallback(() => {
    setStatusFilter((current) => (current === 'DEPLETED' ? '' : 'DEPLETED'));
    setPage(1);
  }, []);

  const toggleRenewalTelegramLinkedFilter = useCallback(() => {
    setQuickFilter('telegramLinked', !filters.quickFilters.telegramLinked);
    setPage(1);
  }, [filters.quickFilters.telegramLinked, setQuickFilter]);

  const setReminderStateFilter = useCallback((
    filter: 'neverReminded' | 'remindedToday' | 'reminded24hAgo' | 'renewedAfterReminder' | null,
  ) => {
    setQuickFilter('neverReminded', filter === 'neverReminded');
    setQuickFilter('remindedToday', filter === 'remindedToday');
    setQuickFilter('reminded24hAgo', filter === 'reminded24hAgo');
    setQuickFilter('renewedAfterReminder', filter === 'renewedAfterReminder');
    setPage(1);
  }, [setQuickFilter]);

  const setExceptionStateFilter = useCallback((
    filter: 'needsTelegramLink' | 'deliveryDisabled' | 'reminderFailed' | 'automationBlocked' | null,
  ) => {
    setQuickFilter('needsTelegramLink', filter === 'needsTelegramLink');
    setQuickFilter('deliveryDisabled', filter === 'deliveryDisabled');
    setQuickFilter('reminderFailed', filter === 'reminderFailed');
    setQuickFilter('automationBlocked', filter === 'automationBlocked');
    setPage(1);
  }, [setQuickFilter]);

  const setOutreachStateFilter = useCallback((filter: RenewalOutreachQuickFilter | null) => {
    setQuickFilter('outreachNeverPrepared', filter === 'outreachNeverPrepared');
    setQuickFilter('outreachPendingResult', filter === 'outreachPendingResult');
    setQuickFilter('outreachSent', filter === 'outreachSent');
    setQuickFilter('outreachReplied', filter === 'outreachReplied');
    setQuickFilter('outreachRenewed', filter === 'outreachRenewed');
    setQuickFilter('outreachNoResponse', filter === 'outreachNoResponse');
    setQuickFilter('outreachDone', filter === 'outreachDone');
    setPage(1);
  }, [setQuickFilter]);

  const setOutreachAgeFilter = useCallback((filter: RenewalOutreachAgeQuickFilter | null) => {
    setQuickFilter('outreachOlderThan24h', filter === 'outreachOlderThan24h');
    setQuickFilter('outreachOlderThan72h', filter === 'outreachOlderThan72h');
    setPage(1);
  }, [setQuickFilter]);

  const setOutreachLaneFilter = useCallback((filter: RenewalOutreachLaneFilter | null) => {
    if (!filter) {
      setOutreachStateFilter(null);
      setOutreachAgeFilter(null);
      return;
    }

    setOutreachAgeFilter(activeOutreachAgeFilter ?? 'outreachOlderThan24h');
    setOutreachStateFilter(
      filter === 'stalePendingResult'
        ? 'outreachPendingResult'
        : filter === 'staleSent'
          ? 'outreachSent'
          : 'outreachNoResponse',
    );
  }, [activeOutreachAgeFilter, setOutreachAgeFilter, setOutreachStateFilter]);

  const clearRenewalQueueFilters = useCallback(() => {
    setRenewalWindow(null);
    setQuickFilter('telegramLinked', false);
    setReminderStateFilter(null);
    setExceptionStateFilter(null);
    setOutreachStateFilter(null);
    setOutreachAgeFilter(null);
    setStatusFilter((current) => (current === 'DEPLETED' ? '' : current));
    setPage(1);
  }, [
    setQuickFilter,
    setReminderStateFilter,
    setExceptionStateFilter,
    setOutreachStateFilter,
    setOutreachAgeFilter,
    setRenewalWindow,
  ]);

  const pageSize = 20;

  // Render function for mobile card view
  const renderKeyCard = (key: any) => {
    const config = statusConfig[key.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
    const StatusIcon = config.icon;
    const isOnline = checkIsOnline(key.id, key.status);
    const trafficMeta = liveMetricsById.get(key.id);
    const lastTrafficAt = trafficMeta?.lastTrafficAt ?? (key.lastTrafficAt ? new Date(key.lastTrafficAt) : null);
    const recentTrafficDeltaBytes = trafficMeta?.recentTrafficDeltaBytes ?? BigInt(0);
    const usedBytes = formatBytes(BigInt(key.usedBytes ?? 0));
    const limitBytes = key.dataLimitBytes ? formatBytes(BigInt(key.dataLimitBytes)) : null;
    const tags = typeof key.tags === 'string' ? stringToTags(key.tags) : [];
    const { deviceCount, overLimit, stage, stageLabel } = getDeviceLimitVisualState(key);
    const renewalReminderMeta = getRenewalReminderMeta((key as any).renewalReminder, locale === 'my');
    const renewalExceptionMeta = getRenewalExceptionMeta((key as any).renewalException, locale === 'my');
    const renewalOutreachMeta = getRenewalOutreachMeta((key as any).renewalOutreach, locale === 'my');
    const renewalOutreachAgeMeta = getRenewalOutreachAgeMeta((key as any).renewalOutreach);

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex items-start gap-2">
            <OnlineIndicator isOnline={isOnline} />
            <div className="min-w-0">
              <Link href={`/dashboard/keys/${key.id}`} className="block truncate font-medium hover:underline">
                {key.name}
              </Link>
              {key.email ? (
                <p className="truncate text-xs text-muted-foreground">{key.email}</p>
              ) : null}
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {key.server && (
                  <>
                    {key.server.countryCode && <span>{getCountryFlag(key.server.countryCode)}</span>}
                    <span className="truncate">{key.server.name}</span>
                    <ServerLifecycleBadge mode={key.server.lifecycleMode} />
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('keys.last_seen')} {key.lastUsedAt ? formatRelativeTime(key.lastUsedAt) : t('keys.never_seen')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('keys.activity.last_traffic_short')}{' '}
                {lastTrafficAt ? formatRelativeTime(lastTrafficAt) : t('keys.activity.none')}
              </p>
              {showRenewalOpsFilters ? (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">{renewalReminderMeta.detail}</p>
                  {renewalExceptionMeta ? (
                    <p className="mt-1 text-xs text-muted-foreground">{renewalExceptionMeta.detail}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">{renewalOutreachMeta.detail}</p>
                </>
              ) : null}
            </div>
          </div>
          <div className="ml-3 flex flex-col items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => handleSelectKey(key.id)}
            >
              {selectedKeys.has(key.id) ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            <Badge className={cn('border', config.color)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {t(config.labelKey)}
            </Badge>
            {key.status === 'ACTIVE' ? (
              <Badge
                variant="outline"
                className={cn(
                  isOnline ? 'border-green-500/40 text-green-500' : 'border-border/60 text-muted-foreground',
                )}
              >
                {isOnline ? t('keys.status.online') : t('keys.status.no_recent_traffic')}
              </Badge>
            ) : null}
            {showRenewalOpsFilters ? (
              <>
                <Badge
                  variant="outline"
                  className={cn('text-[11px]', renewalReminderMeta.badgeClassName)}
                >
                  {renewalReminderMeta.label}
                </Badge>
                {renewalExceptionMeta ? (
                  <Badge
                    variant="outline"
                    className={cn('text-[11px]', renewalExceptionMeta.badgeClassName)}
                  >
                    {renewalExceptionMeta.label}
                  </Badge>
                ) : null}
                <Badge
                  variant="outline"
                  className={cn('text-[11px]', renewalOutreachMeta.badgeClassName)}
                >
                  {renewalOutreachMeta.label}
                </Badge>
                {renewalOutreachAgeMeta ? (
                  <Badge
                    variant="outline"
                    className={cn('text-[11px]', renewalOutreachAgeMeta.badgeClassName)}
                  >
                    {renewalOutreachAgeMeta.label}
                  </Badge>
                ) : null}
              </>
            ) : null}
            {key.maxDevices ? (
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant="outline"
                  className={cn(
                    overLimit || stage === 'DISABLED'
                      ? 'border-violet-500/40 text-violet-300'
                      : stage === 'SUPPRESSED'
                        ? 'border-sky-500/40 text-sky-300'
                        : 'border-border/60 text-muted-foreground',
                  )}
                >
                  {deviceCount}/{key.maxDevices} devices
                </Badge>
                {stage !== 'OK' ? (
                  <span className={cn('text-[11px]', overLimit || stage === 'DISABLED' ? 'text-violet-300' : 'text-sky-300')}>
                    {stageLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag: string) => (
              <KeyTagChip key={tag} tag={tag} compact onClick={applyTagFilter} />
            ))}
            {tags.length > 3 ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                +{tags.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="ops-row-card space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('keys.table.usage')}</span>
            <span className="font-medium">
              {usedBytes}
              {limitBytes ? ` / ${limitBytes}` : ''}
            </span>
          </div>
          <SegmentedUsageBarCompact
            valueBytes={Number(key.usedBytes)}
            limitBytes={key.dataLimitBytes ? Number(key.dataLimitBytes) : undefined}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="ops-row-card">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('keys.mobile.devices')}</p>
            <p className="mt-1 flex items-center gap-1 text-sm font-medium">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
              {deviceCount}
            </p>
            {key.maxDevices ? (
              <p className={cn('mt-1 text-[11px]', overLimit || stage === 'DISABLED' ? 'text-violet-300' : stage === 'SUPPRESSED' ? 'text-sky-300' : 'text-muted-foreground')}>
                {stage !== 'OK' ? `${stageLabel} · ` : ''}limit {key.maxDevices}
              </p>
            ) : null}
          </div>
          <div className="ops-row-card">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('keys.mobile.expires')}</p>
            <p className={cn('mt-1 text-sm font-medium', key.isExpiringSoon && 'text-red-500')}>
              {key.expiresAt ? formatRelativeTime(key.expiresAt) : t('keys.never_expires')}
            </p>
          </div>
        </div>

        <div className="ops-row-card flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t('keys.activity.recent_delta')}</span>
          <span className="font-medium">
            {recentTrafficDeltaBytes > BigInt(0)
              ? `+${formatBytes(recentTrafficDeltaBytes)}`
              : t('keys.activity.no_recent_delta')}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-t border-border/50 pt-2">
          <Button asChild variant="outline" size="sm" className="justify-center">
            <Link href={`/dashboard/keys/${key.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              {t('keys.actions.view_details')}
            </Link>
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setQrDialogKey({ id: key.id, name: key.name })}>
              <QrCode className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingKey(key)}>
                <Pencil className="w-4 h-4 mr-2" />
                {t('keys.actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenRenew(key)}>
                <Calendar className="w-4 h-4 mr-2" />
                {locale === 'my' ? 'Renew လုပ်မည်' : 'Renew'}
              </DropdownMenuItem>
              {showRenewalOpsFilters && (key as any).renewalException?.deliveryDisabled ? (
                <DropdownMenuItem
                  onClick={() => handleEnableTelegramDelivery(key)}
                  disabled={bulkEnableTelegramDeliveryMutation.isPending}
                >
                  <Power className="w-4 h-4 mr-2" />
                  {locale === 'my' ? 'Telegram delivery ဖွင့်မည်' : 'Enable Telegram delivery'}
                </DropdownMenuItem>
              ) : null}
              {showRenewalOpsFilters && (key as any).renewalException?.needsTelegramLink ? (
                <DropdownMenuItem
                  onClick={() => handleCopyTelegramConnectLink(key)}
                  disabled={generateTelegramConnectLinkMutation.isPending}
                >
                  <LinkCopy className="w-4 h-4 mr-2" />
                  {locale === 'my' ? 'Telegram connect link ကူးမည်' : 'Copy Telegram connect link'}
                </DropdownMenuItem>
              ) : null}
              {showRenewalOpsFilters ? (
                <DropdownMenuItem
                  onClick={() => handleSendRenewalReminder(key)}
                  disabled={!canSendRenewalReminderForKey(key) || sendRenewalReminderMutation.isPending}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  {locale === 'my' ? 'သက်တမ်းတိုး သတိပေးချက် ပို့မည်' : 'Send renewal reminder'}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => handleToggleStatus(key.id)}>
                <Power className="w-4 h-4 mr-2" />
                {key.status === 'DISABLED' ? t('keys.actions.enable') : t('keys.actions.disable')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDelete(key.id, key.name)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                {t('keys.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  // Auto-refresh hook with localStorage persistence and tab visibility handling
  const autoRefresh = useAutoRefresh({
    onRefresh: useCallback(() => {
      autoRefreshRef.current?.();
    }, []),
  });

  // Fetch keys
  const { data, isLoading, refetch } = trpc.keys.list.useQuery({
    serverId: serverFilter || undefined,
    status: (statusFilter || undefined) as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED' | 'PENDING' | undefined,
    search: searchQuery || undefined,
    page,
    pageSize,
    online: filters.quickFilters.online || undefined,
    expiring3d: filters.quickFilters.expiring3d || undefined,
    expiring7d: filters.quickFilters.expiring7d || undefined,
    expiring14d: filters.quickFilters.expiring14d || undefined,
    overQuota: filters.quickFilters.overQuota || undefined,
    inactive30d: filters.quickFilters.inactive30d || undefined,
    telegramLinked: filters.quickFilters.telegramLinked || undefined,
    neverReminded: filters.quickFilters.neverReminded || undefined,
    remindedToday: filters.quickFilters.remindedToday || undefined,
    reminded24hAgo: filters.quickFilters.reminded24hAgo || undefined,
    renewedAfterReminder: filters.quickFilters.renewedAfterReminder || undefined,
    needsTelegramLink: filters.quickFilters.needsTelegramLink || undefined,
    deliveryDisabled: filters.quickFilters.deliveryDisabled || undefined,
    reminderFailed: filters.quickFilters.reminderFailed || undefined,
    automationBlocked: filters.quickFilters.automationBlocked || undefined,
    outreachNeverPrepared: filters.quickFilters.outreachNeverPrepared || undefined,
    outreachPendingResult: filters.quickFilters.outreachPendingResult || undefined,
    outreachSent: filters.quickFilters.outreachSent || undefined,
    outreachReplied: filters.quickFilters.outreachReplied || undefined,
    outreachRenewed: filters.quickFilters.outreachRenewed || undefined,
    outreachNoResponse: filters.quickFilters.outreachNoResponse || undefined,
    outreachDone: filters.quickFilters.outreachDone || undefined,
    outreachOlderThan24h: filters.quickFilters.outreachOlderThan24h || undefined,
    outreachOlderThan72h: filters.quickFilters.outreachOlderThan72h || undefined,
    overDeviceLimit: filters.quickFilters.overDeviceLimit || undefined,
    deviceLimitWarned: filters.quickFilters.deviceLimitWarned || undefined,
    tag: filters.tagFilter || undefined,
    owner: filters.ownerFilter || undefined,
  }, {
    placeholderData: keepPreviousData,
  });

  // Fetch servers for filter
  const { data: servers } = trpc.servers.list.useQuery();

  // Fetch key stats; interval refresh is handled by the shared read-only page refresher.
  const { data: stats, refetch: refetchStats } = trpc.keys.stats.useQuery();
  const { data: renewalPresets = [] } = trpc.keys.listRenewalPresets.useQuery(
    { locale },
    {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  );
  useEffect(() => {
    if (renewalPresets.length === 0) {
      setSelectedRenewalQueuePresetCode(null);
      return;
    }

    if (!selectedRenewalQueuePresetCode || !renewalPresets.some((preset) => preset.code === selectedRenewalQueuePresetCode)) {
      setSelectedRenewalQueuePresetCode(renewalPresets[0]?.code ?? null);
    }
  }, [renewalPresets, selectedRenewalQueuePresetCode]);

  const selectedRenewalQueuePreset = useMemo(
    () => renewalPresets.find((preset) => preset.code === selectedRenewalQueuePresetCode) ?? renewalPresets[0] ?? null,
    [renewalPresets, selectedRenewalQueuePresetCode],
  );
  const sourceTagChips = useMemo(
    () =>
      KEY_SOURCE_TAGS.map((tag) => ({
        tag,
        count: stats?.sourceCounts?.[tag] ?? 0,
      })),
    [stats],
  );
  const customTopTagChips = useMemo(
    () =>
      (stats?.topTags ?? [])
        .filter(({ tag }) => !KEY_SOURCE_TAGS.includes(tag as (typeof KEY_SOURCE_TAGS)[number]))
        .slice(0, 6),
    [stats],
  );

  // Fetch live usage plus recent server-side session state every 3 seconds.
  const { data: liveMetrics, refetch: refetchOnline } = trpc.keys.getLiveMetrics.useQuery(undefined, {
    refetchInterval: 3000, // Always poll for responsive online detection
    refetchIntervalInBackground: false, // Pause when tab is hidden to save resources
  });

  // Fetch 7-day sparkline data for visible keys
  const keyIdsForSparklines = useMemo(
    () => data?.items?.map((k) => k.id) ?? [],
    [data?.items],
  );
  const { data: sparklineMap, refetch: refetchSparklines } = trpc.keys.getSparklines.useQuery(
    { keyIds: keyIdsForSparklines },
    { enabled: keyIdsForSparklines.length > 0, staleTime: 60_000 },
  );

  autoRefreshRef.current = () => {
    void refetch();
    void refetchStats();
    if (keyIdsForSparklines.length > 0) {
      void refetchSparklines();
    }
  };

  const liveMetricsById = useMemo(
    () =>
      new Map(
        (liveMetrics ?? []).map((metric) => [
          metric.id,
          {
            isOnline: metric.isOnline,
            lastTrafficAt: metric.lastTrafficAt ? new Date(metric.lastTrafficAt) : null,
            recentTrafficDeltaBytes: BigInt(metric.recentTrafficDeltaBytes),
          },
        ]),
      ),
    [liveMetrics],
  );
  const onlineKeyIds = useMemo(
    () =>
      new Set(
        Array.from(liveMetricsById.entries())
          .filter(([, metric]) => metric.isOnline)
          .map(([id]) => id),
      ),
    [liveMetricsById],
  );
  const onlineCount = onlineKeyIds.size;
  const visibleRenewalQueueItems = useMemo(
    () => data?.items ?? [],
    [data?.items],
  );
  const visibleRenewalQueueIds = useMemo(
    () => visibleRenewalQueueItems.map((key) => key.id),
    [visibleRenewalQueueItems],
  );
  const visibleRenewalQueueIdSet = useMemo(
    () => new Set(visibleRenewalQueueIds),
    [visibleRenewalQueueIds],
  );
  const visibleRenewalQueueSelectedCount = useMemo(
    () => Array.from(selectedKeys).filter((id) => visibleRenewalQueueIdSet.has(id)).length,
    [selectedKeys, visibleRenewalQueueIdSet],
  );
  const canSendRenewalReminderForKey = useCallback(
    (key: {
      telegramDeliveryEnabled?: boolean | null;
      telegramId?: string | null;
      user?: { telegramChatId?: string | null } | null;
      renewalReminder?: { cooldownActive?: boolean | null } | null;
    }) =>
      Boolean(
        key.telegramDeliveryEnabled
        && (key.telegramId || key.user?.telegramChatId)
        && !key.renewalReminder?.cooldownActive,
      ),
    [],
  );
  const visibleRenewalReminderEligibleCount = useMemo(
    () =>
      visibleRenewalQueueItems.filter((key) => canSendRenewalReminderForKey(key)).length,
    [canSendRenewalReminderForKey, visibleRenewalQueueItems],
  );
  const renewalReminderSummary = data?.renewalReminderSummary ?? {
    reminded: 0,
    neverReminded: 0,
    remindedToday: 0,
    renewedAfterReminder: 0,
    pendingFollowUp: 0,
  };
  const renewalExceptionSummary = data?.renewalExceptionSummary ?? {
    eligible: 0,
    reachable: 0,
    blocked: 0,
    failed: 0,
    needsTelegramLink: 0,
    deliveryDisabled: 0,
    automationBlocked: 0,
  };
  const renewalOutreachSummary = data?.renewalOutreachSummary ?? {
    tracked: 0,
    neverPrepared: 0,
    pendingResult: 0,
    sent: 0,
    replied: 0,
    renewed: 0,
    noResponse: 0,
    done: 0,
  };
  const renewalOutreachStaleSummary: RenewalOutreachStaleSummary = data?.renewalOutreachStaleSummary ?? {
    olderThan24h: 0,
    olderThan72h: 0,
    pendingResult24h: 0,
    pendingResult72h: 0,
    sent24h: 0,
    sent72h: 0,
    noResponse24h: 0,
    noResponse72h: 0,
  };

  // Helper to check if a key is online using recent server-side session activity.
  const checkIsOnline = useCallback(
    (keyId: string, status?: string) => status === 'ACTIVE' && onlineKeyIds.has(keyId),
    [onlineKeyIds],
  );

  // Sync all servers mutation
  const syncAllMutation = trpc.servers.syncAll.useMutation({
    onSuccess: () => {
      // Refresh keys list, stats, and online users after sync
      refetch();
      refetchStats();
      refetchOnline();
    },
  });

  // Auto-open create dialog if query param present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      setCreateDialogOpen(true);
    }
  }, []);

  // Note: Auto-refresh now refetches read-only queries above; the Sync button
  // below remains the explicit server-write path.

  // Delete mutation
  const deleteMutation = trpc.keys.delete.useMutation({
    onSuccess: () => {
      toast({
        title: t('keys.toast.deleted'),
        description: t('keys.toast.deleted_desc'),
      });
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.delete_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = trpc.keys.toggleStatus.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.status === 'DISABLED' ? t('keys.toast.status_disabled') : t('keys.toast.status_enabled'),
        description: fillTemplate(t('keys.toast.status_changed_desc'), {
          name: result.name,
          status: result.status.toLowerCase(),
        }),
      });
      refetch();
      refetchStats();
      setTogglingKeyId(null);
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.status_change_failed'),
        description: error.message,
        variant: 'destructive',
      });
      setTogglingKeyId(null);
    },
  });

  const renewMutation = trpc.keys.renew.useMutation({
    onSuccess: async (result) => {
      const renewedExpiryLabel = result.expiresAt
        ? formatDateTime(result.expiresAt)
        : (locale === 'my' ? 'မသတ်မှတ်ထား' : 'Not set');
      toast({
        title: locale === 'my' ? 'Renew လုပ်ပြီးပါပြီ' : 'Key renewed',
        description: locale === 'my'
          ? `${result.name} ကို ${renewedExpiryLabel} အထိ သက်တမ်းတိုးပြီးပါပြီ။`
          : `${result.name} now expires on ${renewedExpiryLabel}.`,
      });
      setRenewingKey(null);
      await Promise.all([
        utils.keys.list.invalidate(),
        utils.keys.stats.invalidate(),
      ]);
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'Renew မအောင်မြင်ပါ' : 'Renewal failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sendRenewalReminderMutation = trpc.keys.sendRenewalReminder.useMutation({
    onSuccess: async () => {
      toast({
        title: locale === 'my' ? 'သက်တမ်းတိုး သတိပေးချက် ပို့ပြီးပါပြီ' : 'Renewal reminder sent',
        description: locale === 'my'
          ? 'Telegram သတိပေးချက်ကို ပို့ပြီးပါပြီ။'
          : 'Telegram renewal reminder sent.',
      });
      await Promise.all([
        utils.keys.list.invalidate(),
        utils.keys.stats.invalidate(),
      ]);
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'သတိပေးချက် ပို့မရပါ' : 'Reminder failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const generateTelegramConnectLinkMutation = trpc.keys.generateTelegramConnectLink.useMutation({
    onSuccess: async (result) => {
      await copyToClipboard(
        result.url,
        locale === 'my' ? 'ကူးယူပြီးပါပြီ' : 'Copied',
        locale === 'my'
          ? 'Telegram connect link ကို clipboard သို့ ကူးယူပြီးပါပြီ။'
          : 'Telegram connect link copied to clipboard.',
      );
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'Connect link မရပါ' : 'Connect link failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = trpc.keys.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast({
        title: t('keys.toast.bulk_delete_complete'),
        description: fillTemplate(
          t(result.success === 1 ? 'keys.toast.bulk_delete_complete_desc_single' : 'keys.toast.bulk_delete_complete_desc'),
          { success: result.success, failed: result.failed },
        ),
      });
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.bulk_delete_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkRenewDialogOpen, setBulkRenewDialogOpen] = useState(false);
  const [bulkTagsDialogOpen, setBulkTagsDialogOpen] = useState(false);
  const [bulkRenewalOutreachResultDialogOpen, setBulkRenewalOutreachResultDialogOpen] = useState(false);
  const [bulkTagsMode, setBulkTagsMode] = useState<'add' | 'remove'>('add');
  const [bulkProgressDialogOpen, setBulkProgressDialogOpen] = useState(false);
  const [bulkProgressTitle, setBulkProgressTitle] = useState('');
  const [bulkProgressResults, setBulkProgressResults] = useState<BulkProgressResult | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<{ id: string; name: string } | null>(null);

  // Bulk renew mutation
  const bulkRenewMutation = trpc.keys.bulkRenew.useMutation({
    onSuccess: (result) => {
      toast({
        title: t('keys.toast.extension_complete'),
        description: fillTemplate(
          t(result.success === 1 ? 'keys.toast.extension_complete_desc_single' : 'keys.toast.extension_complete_desc'),
          { success: result.success },
        ),
        variant: result.failed > 0 ? 'destructive' : 'default',
      });
      setSelectedKeys(new Set());
      setBulkProgressResults(result);
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.extension_failed'),
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  const bulkRenewalReminderMutation = trpc.keys.bulkSendRenewalReminders.useMutation({
    onSuccess: async (result) => {
      toast({
        title: locale === 'my' ? 'သက်တမ်းတိုး သတိပေးချက်များ ပို့ပြီးပါပြီ' : 'Renewal reminders sent',
        description: locale === 'my'
          ? `${result.success} ခု ပို့ပြီးပါပြီ။`
          : `Sent ${result.success} renewal reminders.`,
        variant: result.failed > 0 ? 'destructive' : 'default',
      });
      setSelectedKeys(new Set());
      setBulkProgressResults(result);
      await Promise.all([
        utils.keys.list.invalidate(),
        utils.keys.stats.invalidate(),
      ]);
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'သတိပေးချက်များ ပို့မရပါ' : 'Reminder batch failed',
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  const bulkEnableTelegramDeliveryMutation = trpc.keys.bulkEnableTelegramDelivery.useMutation({
    onSuccess: async (result) => {
      toast({
        title: locale === 'my' ? 'Telegram delivery ဖွင့်ပြီးပါပြီ' : 'Telegram delivery enabled',
        description: locale === 'my'
          ? `${result.success} ခုအတွက် Telegram delivery ကို ဖွင့်ပြီးပါပြီ။`
          : `Enabled Telegram delivery for ${result.success} keys.`,
        variant: result.failed > 0 ? 'destructive' : 'default',
      });
      setSelectedKeys(new Set());
      setBulkProgressResults(result);
      await Promise.all([
        utils.keys.list.invalidate(),
        utils.keys.stats.invalidate(),
      ]);
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'Telegram delivery မဖွင့်နိုင်ပါ' : 'Enable Telegram delivery failed',
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  const bulkGenerateTelegramConnectLinksMutation = trpc.keys.bulkGenerateTelegramConnectLinks.useMutation({
    onSuccess: async (result) => {
      if (result.links.length > 0) {
        await copyToClipboard(
          buildBulkTelegramConnectLinksClipboardText(result.links, locale === 'my'),
          locale === 'my' ? 'Connect link များ ကူးယူပြီးပါပြီ' : 'Connect links copied',
          locale === 'my'
            ? `${result.success} ခု၏ Telegram connect link များကို clipboard သို့ ကူးယူပြီးပါပြီ။`
            : `Copied ${result.success} Telegram connect links to the clipboard.`,
        );
      } else {
        toast({
          title: locale === 'my' ? 'Connect link မရပါ' : 'Connect links failed',
          description: locale === 'my'
            ? 'ကူးယူရန် connect link မရှိပါ။'
            : 'No Telegram connect links were generated.',
          variant: 'destructive',
        });
      }

      if (result.failed > 0) {
        toast({
          title: locale === 'my' ? 'တချို့ connect link များ မရပါ' : 'Some connect links failed',
          description: locale === 'my'
            ? `${result.failed} ခုကို မပြင်ဆင်နိုင်ပါ။ bulk result ကို စစ်ဆေးပါ။`
            : `Failed to prepare ${result.failed} connect links. Check the bulk result for details.`,
          variant: 'destructive',
        });
      }

      setSelectedKeys(new Set());
      setBulkProgressResults(result);
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'Connect link များ မရပါ' : 'Connect link batch failed',
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  const prepareRenewalOutreachPackMutation = trpc.keys.prepareRenewalOutreachPack.useMutation({
    onSuccess: async (result: RenewalOutreachPackResult, variables) => {
      if (variables.mode === 'COPY') {
        if (result.items.length > 0) {
          await copyToClipboard(
            result.clipboardText,
            locale === 'my' ? 'Outreach pack ကူးယူပြီးပါပြီ' : 'Outreach pack copied',
            locale === 'my'
              ? `${result.success} ခုအတွက် outreach message များကို clipboard သို့ ကူးယူပြီးပါပြီ။`
              : `Copied outreach messages for ${result.success} keys to the clipboard.`,
          );
        } else {
          toast({
            title: locale === 'my' ? 'Outreach pack မရပါ' : 'Outreach pack unavailable',
            description: locale === 'my'
              ? 'ကူးယူရန် outreach item မရှိပါ။'
              : 'No outreach items were prepared.',
            variant: 'destructive',
          });
        }
      } else {
        if (result.items.length > 0) {
          downloadTextFile(result.csv, result.filename, 'text/csv;charset=utf-8;');
          toast({
            title: locale === 'my' ? 'Outreach CSV ထုတ်ယူပြီးပါပြီ' : 'Outreach CSV exported',
            description: locale === 'my'
              ? `${result.success} ခုအတွက် outreach CSV ကို ထုတ်ယူပြီးပါပြီ။`
              : `Exported outreach CSV for ${result.success} keys.`,
          });
        } else {
          toast({
            title: locale === 'my' ? 'Outreach CSV မရပါ' : 'Outreach CSV unavailable',
            description: locale === 'my'
              ? 'ထုတ်ယူရန် outreach item မရှိပါ။'
              : 'No outreach items were prepared for export.',
            variant: 'destructive',
          });
        }
      }

      if (result.failed > 0) {
        toast({
          title: locale === 'my' ? 'တချို့ outreach item မရပါ' : 'Some outreach items failed',
          description: locale === 'my'
            ? `${result.failed} ခုကို မပြင်ဆင်နိုင်ပါ။ bulk result ကို စစ်ဆေးပါ။`
            : `Failed to prepare ${result.failed} outreach items. Check the bulk result for details.`,
          variant: 'destructive',
        });
      }

      setBulkProgressResults(result);
      await Promise.all([
        utils.keys.list.invalidate(),
        utils.keys.stats.invalidate(),
      ]);
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'Outreach pack မပြင်နိုင်ပါ' : 'Outreach pack failed',
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  const markRenewalOutreachResultMutation = trpc.keys.markRenewalOutreachResult.useMutation({
    onSuccess: async (result, variables) => {
      const outcomeLabel = getRenewalOutreachOutcomeOptionLabel(variables.outcome, locale === 'my');
      toast({
        title: locale === 'my' ? 'Outreach result မှတ်ပြီးပါပြီ' : 'Outreach result logged',
        description: locale === 'my'
          ? `${result.success} ခုကို ${outcomeLabel} အဖြစ် မှတ်ပြီးပါပြီ။`
          : `Logged ${outcomeLabel.toLowerCase()} for ${result.success} keys.`,
        variant: result.failed > 0 ? 'destructive' : 'default',
      });
      setBulkRenewalOutreachResultDialogOpen(false);
      setSelectedKeys(new Set());
      setBulkProgressResults(result);
      await Promise.all([
        utils.keys.list.invalidate(),
        utils.keys.stats.invalidate(),
      ]);
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'Outreach result မမှတ်နိုင်ပါ' : 'Log outreach result failed',
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  // Bulk toggle status mutation
  const bulkToggleStatusMutation = trpc.keys.bulkToggleStatus.useMutation({
    onSuccess: (result) => {
      setBulkProgressResults(result);
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.bulk_status_failed'),
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  // Bulk add tags mutation
  const bulkAddTagsMutation = trpc.keys.bulkAddTags.useMutation({
    onSuccess: (result) => {
      toast({
        title: t('keys.toast.tags_added'),
        description: fillTemplate(
          t(result.success === 1 ? 'keys.toast.tags_added_desc_single' : 'keys.toast.tags_added_desc'),
          { success: result.success },
        ),
      });
      setBulkTagsDialogOpen(false);
      setSelectedKeys(new Set());
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.add_tags_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Bulk remove tags mutation
  const bulkRemoveTagsMutation = trpc.keys.bulkRemoveTags.useMutation({
    onSuccess: (result) => {
      toast({
        title: t('keys.toast.tags_removed'),
        description: fillTemplate(
          t(result.success === 1 ? 'keys.toast.tags_removed_desc_single' : 'keys.toast.tags_removed_desc'),
          { success: result.success },
        ),
      });
      setBulkTagsDialogOpen(false);
      setSelectedKeys(new Set());
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.remove_tags_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Bulk archive mutation
  const bulkArchiveMutation = trpc.keys.bulkArchive.useMutation({
    onSuccess: (result) => {
      setBulkProgressResults(result);
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.archive_failed'),
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  // Bulk move state
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkMoveTargetServerId, setBulkMoveTargetServerId] = useState('');
  const selectedBulkMoveServer = useMemo(
    () => (servers ?? []).find((server) => server.id === bulkMoveTargetServerId) ?? null,
    [bulkMoveTargetServerId, servers],
  );

  // Bulk move mutation
  const bulkMoveMutation = trpc.keys.bulkMove.useMutation({
    onSuccess: (result) => {
      setBulkProgressResults(result);
      setBulkMoveDialogOpen(false);
      setBulkMoveTargetServerId('');
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('keys.toast.move_failed'),
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  const handleBulkMove = () => {
    if (selectedKeys.size === 0 || !bulkMoveTargetServerId) return;
    setBulkProgressTitle(t('keys.bulk.progress_title.moving'));
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    setBulkMoveDialogOpen(false);
    bulkMoveMutation.mutate({
      ids: Array.from(selectedKeys),
      targetServerId: bulkMoveTargetServerId,
    });
  };

  const handleBulkRenew = (input: { months: number; addDataLimitGB: number | null }) => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(t('keys.bulk.progress_title.renewing'));
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    setBulkRenewDialogOpen(false);
    bulkRenewMutation.mutate({
      ids: Array.from(selectedKeys),
      months: input.months,
      addDataLimitGB: input.addDataLimitGB,
    });
  };

  const handleApplyRenewalQueuePreset = () => {
    if (selectedKeys.size === 0 || !selectedRenewalQueuePreset) return;

    const confirmMessage = locale === 'my'
      ? `${selectedKeys.size} ${getSelectedLabel(selectedKeys.size)} အတွက် ${selectedRenewalQueuePreset.label} package ကို အသုံးပြုပြီး renew လုပ်မည်။`
      : `Apply ${selectedRenewalQueuePreset.label} to ${selectedKeys.size} ${getSelectedLabel(selectedKeys.size)}?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setBulkProgressTitle(t('keys.bulk.progress_title.renewing'));
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    bulkRenewMutation.mutate({
      ids: Array.from(selectedKeys),
      months: selectedRenewalQueuePreset.months,
      addDataLimitGB: selectedRenewalQueuePreset.dataLimitGB,
    });
  };

  const handleBulkRenewalReminder = () => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(locale === 'my' ? 'သက်တမ်းတိုး သတိပေးချက်များ ပို့နေသည်' : 'Sending renewal reminders');
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    bulkRenewalReminderMutation.mutate({
      ids: Array.from(selectedKeys),
    });
  };

  const handleBulkEnableTelegramDelivery = () => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(locale === 'my' ? 'Telegram delivery ဖွင့်နေသည်' : 'Enabling Telegram delivery');
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    bulkEnableTelegramDeliveryMutation.mutate({
      ids: Array.from(selectedKeys),
    });
  };

  const handleBulkCopyTelegramConnectLinks = () => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(locale === 'my' ? 'Telegram connect link များ ပြင်ဆင်နေသည်' : 'Preparing Telegram connect links');
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    bulkGenerateTelegramConnectLinksMutation.mutate({
      ids: Array.from(selectedKeys),
    });
  };

  const handleCopyRenewalOutreachPack = () => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(locale === 'my' ? 'Outreach pack ကူးယူရန် ပြင်ဆင်နေသည်' : 'Preparing outreach pack');
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    prepareRenewalOutreachPackMutation.mutate({
      ids: Array.from(selectedKeys),
      locale,
      mode: 'COPY',
    });
  };

  const handleExportRenewalOutreachCsv = () => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(locale === 'my' ? 'Outreach CSV ပြင်ဆင်နေသည်' : 'Preparing outreach CSV');
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    prepareRenewalOutreachPackMutation.mutate({
      ids: Array.from(selectedKeys),
      locale,
      mode: 'EXPORT',
    });
  };

  const handleOpenRenewalOutreachResultDialog = () => {
    if (selectedKeys.size === 0) return;
    setBulkRenewalOutreachResultDialogOpen(true);
  };

  const handleMarkRenewalOutreachResult = (input: { outcome: RenewalOutreachOutcome; note: string | null }) => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(
      locale === 'my'
        ? `Outreach result (${getRenewalOutreachOutcomeOptionLabel(input.outcome, true)}) မှတ်နေသည်`
        : `Logging outreach result (${getRenewalOutreachOutcomeOptionLabel(input.outcome, false)})`,
    );
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    setBulkRenewalOutreachResultDialogOpen(false);
    markRenewalOutreachResultMutation.mutate({
      ids: Array.from(selectedKeys),
      outcome: input.outcome,
      note: input.note,
    });
  };

  const handleBulkToggleStatus = (enable: boolean) => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(
      enable ? t('keys.bulk.progress_title.enabling') : t('keys.bulk.progress_title.disabling'),
    );
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    bulkToggleStatusMutation.mutate({
      ids: Array.from(selectedKeys),
      enable,
    });
  };

  const handleBulkTags = (tags: string) => {
    if (selectedKeys.size === 0) return;
    if (bulkTagsMode === 'add') {
      bulkAddTagsMutation.mutate({
        ids: Array.from(selectedKeys),
        tags,
      });
    } else {
      bulkRemoveTagsMutation.mutate({
        ids: Array.from(selectedKeys),
        tags,
      });
    }
  };

  const handleBulkArchive = () => {
    if (selectedKeys.size === 0) return;
    if (confirm(fillTemplate(t('keys.bulk.archive_confirm'), {
      count: selectedKeys.size,
      items: getItemLabel(selectedKeys.size),
    }))) {
      setBulkProgressTitle(t('keys.bulk.progress_title.archiving'));
      setBulkProgressResults(null);
      setBulkProgressDialogOpen(true);
      bulkArchiveMutation.mutate({
        ids: Array.from(selectedKeys),
      });
    }
  };


  const handleDelete = (keyId: string, keyName: string) => {
    setKeyToDelete({ id: keyId, name: keyName });
    setDeleteDialogOpen(true);
  };

  const handleOpenRenew = (key: {
    id: string;
    name: string;
    status: string;
    expiresAt: Date | null;
    dataLimitBytes: bigint | null;
    usedBytes: bigint;
  }) => {
    setRenewingKey({
      id: key.id,
      name: key.name,
      status: key.status,
      expiresAt: key.expiresAt,
      dataLimitBytes: key.dataLimitBytes,
      usedBytes: key.usedBytes,
    });
  };

  const handleSendRenewalReminder = (key: { id: string; name: string }) => {
    sendRenewalReminderMutation.mutate({ id: key.id });
  };

  const handleEnableTelegramDelivery = (key: { id: string }) => {
    setBulkProgressTitle(locale === 'my' ? 'Telegram delivery ဖွင့်နေသည်' : 'Enabling Telegram delivery');
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    bulkEnableTelegramDeliveryMutation.mutate({
      ids: [key.id],
    });
  };

  const handleCopyTelegramConnectLink = (key: { id: string }) => {
    generateTelegramConnectLinkMutation.mutate({ id: key.id });
  };

  const confirmDelete = () => {
    if (keyToDelete) {
      deleteMutation.mutate({ id: keyToDelete.id });
      setDeleteDialogOpen(false);
    }
  };

  const handleToggleStatus = (keyId: string) => {
    setTogglingKeyId(keyId);
    toggleStatusMutation.mutate({ id: keyId });
  };

  const handleBulkDelete = () => {
    if (selectedKeys.size === 0) return;
    if (confirm(t('keys.confirm_bulk_delete'))) {
      bulkDeleteMutation.mutate({ ids: Array.from(selectedKeys) });
    }
  };

  const handleSelectAll = () => {
    if (!data?.items) return;
    if (selectedKeys.size === data.items.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(data.items.map((k) => k.id)));
    }
  };

  const handleSelectVisibleRenewalQueue = () => {
    setSelectedKeys(new Set(visibleRenewalQueueIds));
  };

  const handleSelectKey = (keyId: string) => {
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(keyId)) {
      newSelected.delete(keyId);
    } else {
      newSelected.add(keyId);
    }
    setSelectedKeys(newSelected);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    setExportingFormat(format);
    try {
      // Use fetch to trigger download
      const params = new URLSearchParams();
      if (serverFilter) params.set('serverIds', serverFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('format', format);

      const response = await fetch(withBasePath(`/api/export-keys?${params.toString()}`));
      if (!response.ok) throw new Error(t('keys.toast.export_failed'));

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `keys-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: t('keys.export_complete'),
        description: fillTemplate(t('keys.export_complete_desc'), {
          format: format.toUpperCase(),
        }),
      });
    } catch {
      toast({
        title: t('keys.toast.export_failed'),
        description: t('keys.toast.export_failed'),
        variant: 'destructive',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setServerFilter('');
    setPage(1);
  };

  const hasPersistedFilters = Boolean(
    filters.quickFilters.online ||
    filters.quickFilters.expiring3d ||
    filters.quickFilters.expiring7d ||
    filters.quickFilters.expiring14d ||
    filters.quickFilters.overQuota ||
    filters.quickFilters.inactive30d ||
    filters.quickFilters.telegramLinked ||
    filters.quickFilters.neverReminded ||
    filters.quickFilters.remindedToday ||
    filters.quickFilters.reminded24hAgo ||
    filters.quickFilters.renewedAfterReminder ||
    filters.quickFilters.needsTelegramLink ||
    filters.quickFilters.deliveryDisabled ||
    filters.quickFilters.reminderFailed ||
    filters.quickFilters.automationBlocked ||
    filters.quickFilters.outreachNeverPrepared ||
    filters.quickFilters.outreachPendingResult ||
    filters.quickFilters.outreachSent ||
    filters.quickFilters.outreachReplied ||
    filters.quickFilters.outreachRenewed ||
    filters.quickFilters.outreachNoResponse ||
    filters.quickFilters.outreachDone ||
    filters.quickFilters.outreachOlderThan24h ||
    filters.quickFilters.outreachOlderThan72h ||
    filters.quickFilters.overDeviceLimit ||
    filters.quickFilters.deviceLimitWarned ||
    filters.tagFilter ||
    filters.ownerFilter,
  );
  const hasActiveFilters = Boolean(searchQuery || statusFilter || serverFilter);
  const hasAnyFilters = hasActiveFilters || hasPersistedFilters;
  const isBulkBusy =
    bulkDeleteMutation.isPending ||
    bulkRenewMutation.isPending ||
    bulkRenewalReminderMutation.isPending ||
    bulkEnableTelegramDeliveryMutation.isPending ||
    bulkGenerateTelegramConnectLinksMutation.isPending ||
    prepareRenewalOutreachPackMutation.isPending ||
    markRenewalOutreachResultMutation.isPending ||
    bulkToggleStatusMutation.isPending ||
    bulkAddTagsMutation.isPending ||
    bulkRemoveTagsMutation.isPending ||
    bulkArchiveMutation.isPending ||
    bulkMoveMutation.isPending;
  const clearAllFilters = () => {
    clearFilters();
    clearPersistedFilters();
  };
  const hasPagination = !!data && data.totalPages > 1;
  const paginationStart = data ? (page - 1) * pageSize + 1 : 0;
  const paginationEnd = data ? Math.min(page * pageSize, data.total) : 0;

  const renderPagination = (mode: 'desktop' | 'mobile') => {
    if (!data || !hasPagination) {
      return null;
    }

    if (mode === 'mobile') {
      return (
        <div className="ops-table-toolbar mb-4 gap-3 px-3 py-3 md:hidden">
          <p className="text-center text-xs text-muted-foreground">
            {t('keys.pagination.showing')} {paginationStart} {t('keys.pagination.to')}{' '}
            {paginationEnd} {t('keys.pagination.of')} {data.total}
          </p>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 rounded-full p-0"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label={locale === 'my' ? 'ရှေ့စာမျက်နှာ' : 'Previous page'}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 text-center">
              <p className="text-sm font-medium">
                {t('keys.pagination.page')} {page} {t('keys.pagination.of_pages')} {data.totalPages}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 rounded-full p-0"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              aria-label={locale === 'my' ? 'နောက်စာမျက်နှာ' : 'Next page'}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="ops-table-toolbar rounded-none border-x-0 border-b-0 px-3 py-2.5">
        <p className="text-xs text-muted-foreground sm:text-sm">
          {t('keys.pagination.showing')} {paginationStart} {t('keys.pagination.to')}{' '}
          {paginationEnd} {t('keys.pagination.of')} {data.total}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-full p-0"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs sm:text-sm">
            {t('keys.pagination.page')} {page} {t('keys.pagination.of_pages')} {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-full p-0"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="ops-showcase space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] xl:items-start">
          <div className="space-y-4">
            <div className="space-y-3">
              <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
                {isRenewalWorkspace ? <Calendar className="h-3.5 w-3.5" /> : <Key className="h-3.5 w-3.5" />}
                {workspaceTitle}
              </span>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.45rem]">{workspaceTitle}</h1>
                  <Badge variant="outline" className="rounded-full border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {locale === 'my' ? 'မြင်ကွင်းသစ်' : 'Frosted'}
                  </Badge>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {isRenewalWorkspace
                    ? locale === 'my'
                      ? 'Renewal queue, reminder, Telegram recovery နှင့် outreach result များကို inventory မရှုပ်စေဘဲ သီးခြား workspace တစ်ခုထဲတွင် စီမံပါ။'
                      : 'Run renewal queues, reminders, Telegram recovery, and outreach from a dedicated workspace without crowding the inventory view.'
                    : locale === 'my'
                      ? 'သော့ကျန်းမာရေး၊ ဒေတာအသုံးပြုမှု၊ စက်ကန့်သတ်ချက်နှင့် per-key control များကို inventory အပေါ် အာရုံစိုက်ပြီး စောင့်ကြည့်ပါ။'
                      : 'Keep this workspace focused on inventory health, traffic, device limits, and direct key actions.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {isRenewalWorkspace ? (
                <>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border/70 bg-background/70 px-4 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]"
                    asChild
                  >
                    <Link href={inventoryWorkspaceHref}>
                      <Key className="mr-2 h-4 w-4" />
                      {locale === 'my' ? 'Access Keys ကို ဖွင့်မည်' : 'Open Access Keys'}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border/70 bg-background/70 px-4 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]"
                    asChild
                  >
                    <Link href="/dashboard/templates">
                      <FileText className="mr-2 h-4 w-4" />
                      {locale === 'my' ? 'တမ်းပလိတ်များကို ဖွင့်မည်' : 'Open templates'}
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => setCreateDialogOpen(true)}
                    className="h-10 rounded-full px-4"
                    data-testid="create-access-key"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'သော့ ဖန်တီးရန်' : 'Create key'}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border/70 bg-background/70 px-4 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]"
                    onClick={() => setBulkCreateDialogOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'အစုလိုက် ဖန်တီးရန်' : 'Bulk create'}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border/70 bg-background/70 px-4 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]"
                    asChild
                  >
                    <Link href="/dashboard/templates">
                      <FileText className="mr-2 h-4 w-4" />
                      {locale === 'my' ? 'တမ်းပလိတ်များကို ဖွင့်မည်' : 'Open templates'}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border/70 bg-background/70 px-4 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]"
                    asChild
                  >
                    <Link href="/dashboard/archived">
                      <Archive className="mr-2 h-4 w-4" />
                      {locale === 'my' ? 'အဟောင်းမှတ်တမ်းကို ကြည့်မည်' : 'View archive'}
                    </Link>
                  </Button>
                </>
              )}
            </div>

            <div className="ops-support-card space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold">{locale === 'my' ? 'လက်ရှိမြင်ကွင်း' : 'Current view'}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {isRenewalWorkspace
                      ? locale === 'my'
                        ? 'Reminders, follow-up lanes, Telegram recovery နှင့် outreach result များကို လက်ရှိ queue context ပျောက်မသွားစေဘဲ တစ်နေရာတည်းတွင် စီမံပါ။'
                        : 'Keep reminder lanes, Telegram recovery, and outreach results visible while you work the current renewal queue.'
                      : locale === 'my'
                        ? 'ဒေတာအသုံးပြုမှု၊ စက်ဖိအား၊ ပိုင်ရှင် သို့မဟုတ် tag အလိုက် စစ်ထုတ်နေစဉ်လည်း လက်ရှိလုပ်ဆောင်နေသောစာရင်းကို မျက်နှာပြင်ပေါ်တွင် ထင်ရှားစွာ ထားရှိပါ။'
                        : 'Keep the working set visible while you filter by traffic, device pressure, owner, or tag.'}
                  </p>
                </div>
                {hasAnyFilters ? (
                  <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-[11px]" onClick={clearAllFilters}>
                    <X className="mr-1 h-3 w-3" />
                    {t('keys.clear_filters')}
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={cn('ops-pill', hasAnyFilters ? 'border-primary/25 bg-primary/10 text-primary dark:text-cyan-200' : '')}>
                  <Filter className="h-3.5 w-3.5" />
                  {hasAnyFilters
                    ? locale === 'my'
                      ? 'စစ်ထုတ်ထားသော မြင်ကွင်း'
                      : 'Filtered view'
                    : locale === 'my'
                      ? 'သော့အားလုံးကို ပြနေသည်'
                      : 'Showing all keys'}
                </span>
                <span className="ops-pill">
                  <Activity className="h-3.5 w-3.5" />
                  {fillTemplate(t('keys.activity.summary'), { count: onlineCount })}
                </span>
                <span className="ops-pill">
                  {isRenewalWorkspace ? <Smartphone className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {isRenewalWorkspace
                    ? locale === 'my'
                      ? `သတိပေးချက် ${stats?.deviceLimitWarned ?? 0} ခု ပို့ထားသည်`
                      : `${stats?.deviceLimitWarned ?? 0} warnings sent`
                    : locale === 'my'
                      ? `24 နာရီအတွင်း expire မည့် သော့ ${stats?.expiringIn24h ?? 0} ခု`
                      : `${stats?.expiringIn24h ?? 0} expiring in 24h`}
                </span>
              </div>
            </div>
          </div>

          <div className="ops-hero-aside space-y-4">
            <div className="space-y-1">
              <p className="ops-section-heading">{locale === 'my' ? 'စာရင်းအကျဉ်းချုပ်' : 'Inventory overview'}</p>
                          <p className="text-sm font-semibold">{locale === 'my' ? 'လက်ရှိ အသုံးပြုခွင့်သော့ အခြေအနေ' : 'Live access key state'}</p>
              <p className="text-sm text-muted-foreground">
                {locale === 'my'
                  ? 'အောက်ပါ အချက်ပြမှုများက ယခုစာရင်းအတွက် ချက်ချင်း လုပ်ဆောင်ရန် လိုအပ်မှု ရှိ/မရှိကို ပြသပေးသည်။'
                  : 'The signals below tell you whether the list needs action right now.'}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="ops-kpi-tile p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'အသုံးပြုနိုင်သော သော့များ' : 'Active keys'}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none">{stats?.active ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {locale === 'my' ? `စုစုပေါင်း သော့ ${stats?.total ?? 0} ခု` : `${stats?.total ?? 0} total keys`}
                </p>
              </div>
              <div className="ops-kpi-tile p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'မကြာသေးမီ ဒေတာအသွားအလာ' : 'Recent traffic'}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none">{onlineCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">{locale === 'my' ? 'လက်ရှိအသုံးပြုမှု ရှိသော သော့များ' : 'Keys with live activity'}</p>
              </div>
              <div className="ops-kpi-tile p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'စက်ကန့်သတ်ချက်' : 'Device caps'}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none">{stats?.deviceLimitOverLimit ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">{locale === 'my' ? 'လက်ရှိ ကန့်သတ်ချက် ကျော်နေသည်' : 'Currently over the limit'}</p>
              </div>
              <div className="ops-kpi-tile p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'စာရင်း အကျယ်အဝန်း' : 'List scope'}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-none">
                  {hasAnyFilters ? (locale === 'my' ? 'စစ်ထုတ်ထား' : 'Filtered') : locale === 'my' ? 'အပြည့်' : 'Full'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasAnyFilters
                    ? locale === 'my'
                      ? 'စစ်ထုတ်မှုများကြောင့် စာရင်းကို ကျဉ်းအောင် ပြထားသည်'
                      : 'Filters are narrowing the table'
                    : locale === 'my'
                      ? 'စာရင်းအားလုံးကို အပြည့်အဝ မြင်နေရသည်'
                      : 'You are seeing the complete inventory'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-border/60 bg-background/50 dark:border-cyan-400/12 dark:bg-[linear-gradient(180deg,rgba(7,15,29,0.88),rgba(6,13,26,0.76))]">
                  <Key className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">{t('keys.total')}</p>
              </div>
              <p className="mt-3 text-[1.65rem] font-semibold leading-none">{stats.total}</p>
            </div>
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-green-500/20 bg-green-500/10">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-xs font-medium text-green-500">{t('keys.active')}</p>
              </div>
              <p className="mt-3 text-[1.65rem] font-semibold leading-none">{stats.active}</p>
            </div>
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-blue-500/20 bg-blue-500/10">
                  <Clock className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-xs font-medium text-blue-500">{t('keys.pending')}</p>
              </div>
              <p className="mt-3 text-[1.65rem] font-semibold leading-none">{stats.pending}</p>
            </div>
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-orange-500/20 bg-orange-500/10">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </div>
                <p className="text-xs font-medium text-orange-500">{t('keys.depleted')}</p>
              </div>
              <p className="mt-3 text-[1.65rem] font-semibold leading-none">{stats.depleted}</p>
            </div>
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-red-500/20 bg-red-500/10">
                  <XCircle className="h-4 w-4 text-red-500" />
                </div>
                <p className="text-xs font-medium text-red-500">{t('keys.expired')}</p>
              </div>
              <p className="mt-3 text-[1.65rem] font-semibold leading-none">{stats.expired}</p>
            </div>
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-primary/20 bg-primary/10">
                  <HardDrive className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">{t('keys.total_usage')}</p>
              </div>
              <p className="mt-3 text-xl font-semibold leading-none xl:text-[1.65rem]">{formatBytes(BigInt(stats.totalUsedBytes))}</p>
            </div>
          </div>
        )}

        {stats && showRenewalOpsFilters ? (
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-violet-500/20 bg-violet-500/10">
                  <Smartphone className="h-4 w-4 text-violet-300" />
                </div>
                <p className="text-xs font-medium text-violet-300">{locale === 'my' ? 'စက်ကန့်သတ်ချက် ကျော်လွန်' : 'Over device limit'}</p>
              </div>
              <p className="mt-3 text-[1.45rem] font-semibold leading-none">{stats.deviceLimitOverLimit ?? 0}</p>
            </div>
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-amber-500/20 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                </div>
                <p className="text-xs font-medium text-amber-300">{locale === 'my' ? 'သတိပေးချက် ပို့ထား' : 'Warning sent'}</p>
              </div>
              <p className="mt-3 text-[1.45rem] font-semibold leading-none">{stats.deviceLimitWarned ?? 0}</p>
            </div>
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-fuchsia-500/20 bg-fuchsia-500/10">
                  <Clock className="h-4 w-4 text-fuchsia-300" />
                </div>
                <p className="text-xs font-medium text-fuchsia-300">Pending disable</p>
              </div>
              <p className="mt-3 text-[1.45rem] font-semibold leading-none">{stats.deviceLimitPendingDisable ?? 0}</p>
            </div>
            <div className="ops-kpi-tile p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-red-500/20 bg-red-500/10">
                  <Power className="h-4 w-4 text-red-300" />
                </div>
                <p className="text-xs font-medium text-red-300">Auto-disabled</p>
              </div>
              <p className="mt-3 text-[1.45rem] font-semibold leading-none">{stats.deviceLimitAutoDisabled ?? 0}</p>
            </div>
          </div>
        ) : null}

        {stats ? (
          <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-3.5 dark:bg-white/[0.02]">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('keys.tags.source_breakdown')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('keys.tags.source_breakdown_desc')}
                </p>
              </div>
              {filters.tagFilter ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={() => {
                    setTagFilter(undefined);
                    setPage(1);
                  }}
                >
                  <X className="mr-1 h-3 w-3" />
                  {t('keys.tags.clear_tag_filter')}
                </Button>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  !filters.tagFilter
                    ? 'border-primary/45 bg-primary/10 text-primary ring-2 ring-primary/10 dark:border-cyan-400/30'
                    : 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-primary dark:bg-white/[0.03]'
                )}
                onClick={() => {
                  setTagFilter(undefined);
                  setPage(1);
                }}
              >
                <span>{t('keys.tags.all')}</span>
                <span className="rounded-full bg-black/8 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/10">
                  {stats.total}
                </span>
              </button>

              {sourceTagChips.map(({ tag, count }) => (
                <KeyTagChip
                  key={tag}
                  tag={tag}
                  count={count}
                  active={filters.tagFilter === tag}
                  onClick={applyTagFilter}
                />
              ))}
            </div>

            {customTopTagChips.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {t('keys.tags.popular')}
                </span>
                {customTopTagChips.map(({ tag, count }) => (
                  <KeyTagChip
                    key={tag}
                    tag={tag}
                    count={count}
                    active={filters.tagFilter === tag}
                    onClick={applyTagFilter}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="space-y-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('keys.search_placeholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 pl-9 dark:border-cyan-400/12 dark:bg-[rgba(4,10,20,0.72)]"
            />
          </div>
          <Button
            variant={hasAnyFilters ? 'default' : 'outline'}
            size="sm"
            className="h-11 shrink-0 rounded-[1.15rem] px-4"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {t('keys.mobile_filters')}
          </Button>
        </div>

        <div className="ops-table-toolbar md:hidden">
          <div className="flex flex-1 items-center justify-center rounded-[0.95rem] border border-border/60 bg-background/55 p-0.5 dark:bg-white/[0.02]">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 flex-1 rounded-[0.8rem] px-2"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 flex-1 rounded-[0.8rem] px-2"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'group' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 flex-1 rounded-[0.8rem] px-2"
              onClick={() => setViewMode('group')}
              title={t('keys.view.group_by_server')}
            >
              <ListIcon className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            className="h-9 flex-1 rounded-[0.95rem] text-xs font-medium"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', syncAllMutation.isPending && 'animate-spin')} />
            {syncAllMutation.isPending ? t('keys.syncing') : t('keys.sync')}
          </Button>
        </div>

        {(autoRefresh.isActive || hasAnyFilters || !!stats) && (
          <div className="ops-table-meta text-xs text-muted-foreground">
            {stats ? (
              <span className="inline-flex items-center gap-1">
                <Activity className="w-3 h-3 text-cyan-500" />
                {fillTemplate(t('keys.activity.summary'), { count: onlineCount })}
              </span>
            ) : null}
            {autoRefresh.isActive ? (
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                {t('keys.refresh_interval')}: {autoRefresh.countdown}s
              </span>
            ) : null}
            {hasAnyFilters ? (
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-[11px]" onClick={clearAllFilters}>
                <X className="w-3 h-3 mr-1" />
                {t('keys.clear_filters')}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Quick Filter Pills */}
      <div className="ops-chip-cloud hidden md:flex">
        <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('keys.quick_filters.label')}:</span>
        <div className="mr-1.5 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
          <Activity className="h-3.5 w-3.5 text-cyan-300" />
          <span>{fillTemplate(t('keys.activity.summary'), { count: onlineCount })}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-3 w-3 text-cyan-200/70" />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('keys.online_tooltip')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          variant={filters.quickFilters.online ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.online && 'bg-green-600 hover:bg-green-700')}
          onClick={() => setQuickFilter('online', !filters.quickFilters.online)}
        >
          <Wifi className="w-3 h-3 mr-1" />
          {t('keys.quick_filters.online')}
        </Button>
        <Button
          variant={filters.quickFilters.expiring3d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.expiring3d && 'bg-orange-600 hover:bg-orange-700')}
          onClick={() => setRenewalWindow(filters.quickFilters.expiring3d ? null : 3)}
        >
          <Clock className="w-3 h-3 mr-1" />
          {locale === 'my' ? '၃ ရက်အတွင်း' : 'Expires in 3d'}
        </Button>
        <Button
          variant={filters.quickFilters.expiring7d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.expiring7d && 'bg-orange-600 hover:bg-orange-700')}
          onClick={() => setRenewalWindow(filters.quickFilters.expiring7d ? null : 7)}
        >
          <Clock className="w-3 h-3 mr-1" />
          {t('keys.quick_filters.expiring7d')}
        </Button>
        <Button
          variant={filters.quickFilters.expiring14d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.expiring14d && 'bg-orange-600 hover:bg-orange-700')}
          onClick={() => setRenewalWindow(filters.quickFilters.expiring14d ? null : 14)}
        >
          <Clock className="w-3 h-3 mr-1" />
          {locale === 'my' ? '၁၄ ရက်အတွင်း' : 'Expires in 14d'}
        </Button>
        <Button
          variant={filters.quickFilters.telegramLinked ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.telegramLinked && 'bg-sky-600 hover:bg-sky-700')}
          onClick={toggleRenewalTelegramLinkedFilter}
        >
          <MessageSquare className="w-3 h-3 mr-1" />
          {locale === 'my' ? 'Telegram ချိတ်ထားသည်' : 'Telegram linked'}
        </Button>
        {showRenewalOpsFilters ? (
          <>
            <Button
              variant={filters.quickFilters.neverReminded ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.neverReminded && 'bg-slate-600 hover:bg-slate-700')}
              onClick={() => setReminderStateFilter(filters.quickFilters.neverReminded ? null : 'neverReminded')}
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              {locale === 'my' ? 'Reminder မပို့ရသေး' : 'Never reminded'}
            </Button>
            <Button
              variant={filters.quickFilters.remindedToday ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.remindedToday && 'bg-sky-600 hover:bg-sky-700')}
              onClick={() => setReminderStateFilter(filters.quickFilters.remindedToday ? null : 'remindedToday')}
            >
              <Clock className="w-3 h-3 mr-1" />
              {locale === 'my' ? 'ဒီနေ့ reminder ပို့ပြီး' : 'Reminded today'}
            </Button>
            <Button
              variant={filters.quickFilters.reminded24hAgo ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.reminded24hAgo && 'bg-orange-600 hover:bg-orange-700')}
              onClick={() => setReminderStateFilter(filters.quickFilters.reminded24hAgo ? null : 'reminded24hAgo')}
            >
              <Clock className="w-3 h-3 mr-1" />
              {locale === 'my' ? 'Follow-up လိုအပ်' : 'Follow-up due'}
            </Button>
            <Button
              variant={filters.quickFilters.renewedAfterReminder ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.renewedAfterReminder && 'bg-emerald-600 hover:bg-emerald-700')}
              onClick={() => setReminderStateFilter(filters.quickFilters.renewedAfterReminder ? null : 'renewedAfterReminder')}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {locale === 'my' ? 'Reminder နောက် Renew လုပ်ပြီး' : 'Renewed after reminder'}
            </Button>
            <Button
              variant={filters.quickFilters.needsTelegramLink ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.needsTelegramLink && 'bg-violet-600 hover:bg-violet-700')}
              onClick={() => setExceptionStateFilter(filters.quickFilters.needsTelegramLink ? null : 'needsTelegramLink')}
            >
              <LinkCopy className="w-3 h-3 mr-1" />
              {locale === 'my' ? 'Telegram link မရှိ' : 'Needs Telegram link'}
            </Button>
            <Button
              variant={filters.quickFilters.deliveryDisabled ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.deliveryDisabled && 'bg-amber-600 hover:bg-amber-700')}
              onClick={() => setExceptionStateFilter(filters.quickFilters.deliveryDisabled ? null : 'deliveryDisabled')}
            >
              <Power className="w-3 h-3 mr-1" />
              {locale === 'my' ? 'Delivery ပိတ်ထား' : 'Delivery disabled'}
            </Button>
            <Button
              variant={filters.quickFilters.reminderFailed ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.reminderFailed && 'bg-red-600 hover:bg-red-700')}
              onClick={() => setExceptionStateFilter(filters.quickFilters.reminderFailed ? null : 'reminderFailed')}
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              {locale === 'my' ? 'Reminder မအောင်မြင်' : 'Reminder failed'}
            </Button>
            <Button
              variant={filters.quickFilters.automationBlocked ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.automationBlocked && 'bg-orange-600 hover:bg-orange-700')}
              onClick={() => setExceptionStateFilter(filters.quickFilters.automationBlocked ? null : 'automationBlocked')}
            >
              <Clock className="w-3 h-3 mr-1" />
              {locale === 'my' ? 'Automation ပိတ်မိ' : 'Automation blocked'}
            </Button>
          </>
        ) : null}
        <Button
          variant={statusFilter === 'DEPLETED' ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', statusFilter === 'DEPLETED' && 'bg-red-600 hover:bg-red-700')}
          onClick={toggleRenewalDepletedFilter}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          {locale === 'my' ? 'Data ကုန်နေသည်' : 'Depleted'}
        </Button>
        <Button
          variant={filters.quickFilters.overQuota ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.overQuota && 'bg-red-600 hover:bg-red-700')}
          onClick={() => setQuickFilter('overQuota', !filters.quickFilters.overQuota)}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          {t('keys.quick_filters.over_quota')}
        </Button>
        <Button
          variant={filters.quickFilters.inactive30d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.inactive30d && 'bg-gray-600 hover:bg-gray-700')}
          onClick={() => setQuickFilter('inactive30d', !filters.quickFilters.inactive30d)}
        >
          <EyeOff className="w-3 h-3 mr-1" />
          {t('keys.quick_filters.inactive30d')}
        </Button>
        <Button
          variant={filters.quickFilters.overDeviceLimit ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.overDeviceLimit && 'bg-violet-600 hover:bg-violet-700')}
          onClick={() => setQuickFilter('overDeviceLimit', !filters.quickFilters.overDeviceLimit)}
        >
          <Smartphone className="w-3 h-3 mr-1" />
          {locale === 'my' ? 'စက်ကန့်သတ်ချက် ကျော်လွန်' : 'Over device limit'}
        </Button>
        {showRenewalOpsFilters ? (
          <Button
            variant={filters.quickFilters.deviceLimitWarned ? 'default' : 'outline'}
            size="sm"
            className={cn('h-8 rounded-full px-2.5 text-[11px]', filters.quickFilters.deviceLimitWarned && 'bg-amber-600 hover:bg-amber-700')}
            onClick={() => setQuickFilter('deviceLimitWarned', !filters.quickFilters.deviceLimitWarned)}
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            {locale === 'my' ? 'သတိပေးချက် ပို့ပြီး' : 'Warning sent'}
          </Button>
        ) : null}
        
        {/* Tag filter */}
        <div className="ops-chip-field ml-1.5">
          <Tag className="w-3 h-3 text-muted-foreground" />
          <Input
            placeholder={t('keys.quick_filters.tag_placeholder')}
            value={filters.tagFilter || ''}
            onChange={(e) => setTagFilter(e.target.value || undefined)}
            className="h-auto w-24 border-0 bg-transparent p-0 text-[11px] shadow-none focus-visible:ring-0"
          />
        </div>
        
        {/* Owner filter */}
        <div className="ops-chip-field">
          <User className="w-3 h-3 text-muted-foreground" />
          <Input
            placeholder={t('keys.quick_filters.owner_placeholder')}
            value={filters.ownerFilter || ''}
            onChange={(e) => setOwnerFilter(e.target.value || undefined)}
            className="h-auto w-24 border-0 bg-transparent p-0 text-[11px] shadow-none focus-visible:ring-0"
          />
        </div>

        {(filters.quickFilters.online || filters.quickFilters.expiring3d || filters.quickFilters.expiring7d || filters.quickFilters.expiring14d || filters.quickFilters.overQuota || filters.quickFilters.inactive30d || filters.quickFilters.telegramLinked || filters.quickFilters.neverReminded || filters.quickFilters.remindedToday || filters.quickFilters.reminded24hAgo || filters.quickFilters.renewedAfterReminder || filters.quickFilters.needsTelegramLink || filters.quickFilters.deliveryDisabled || filters.quickFilters.reminderFailed || filters.quickFilters.automationBlocked || filters.quickFilters.outreachNeverPrepared || filters.quickFilters.outreachPendingResult || filters.quickFilters.outreachSent || filters.quickFilters.outreachReplied || filters.quickFilters.outreachRenewed || filters.quickFilters.outreachNoResponse || filters.quickFilters.outreachDone || filters.quickFilters.outreachOlderThan24h || filters.quickFilters.outreachOlderThan72h || filters.quickFilters.overDeviceLimit || filters.quickFilters.deviceLimitWarned || filters.tagFilter || filters.ownerFilter || statusFilter === 'DEPLETED') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-2.5 text-[11px]"
            onClick={clearAllFilters}
          >
            <X className="w-3 h-3 mr-1" />
            {t('keys.clear_filters')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="ops-table-toolbar hidden md:flex md:gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('keys.search_placeholder')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-[1rem] border-border/70 bg-background/70 pl-9 text-sm dark:border-cyan-400/12 dark:bg-[rgba(4,10,20,0.72)]"
          />
        </div>

        <Select
          value={statusFilter || 'all'}
          onValueChange={(value) => {
            setStatusFilter(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-[140px] rounded-[1rem] border-border/70 bg-background/70 dark:border-cyan-400/12 dark:bg-[rgba(4,10,20,0.72)]">
            <SelectValue placeholder={t('keys.status_filter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('keys.status_filter')}</SelectItem>
            <SelectItem value="ACTIVE">{t('keys.status.active')}</SelectItem>
            <SelectItem value="PENDING">{t('keys.status.pending')}</SelectItem>
            <SelectItem value="DEPLETED">{t('keys.status.depleted')}</SelectItem>
            <SelectItem value="EXPIRED">{t('keys.status.expired')}</SelectItem>
            <SelectItem value="DISABLED">{t('keys.status.disabled')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={serverFilter || 'all'}
          onValueChange={(value) => {
            setServerFilter(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
            <SelectTrigger className="h-10 w-[176px] rounded-[1rem] border-border/70 bg-background/70 dark:border-cyan-400/12 dark:bg-[rgba(4,10,20,0.72)]">
              <SelectValue placeholder={t('keys.server_filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('keys.server_filter')}</SelectItem>
              {servers?.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  <div className="flex items-center gap-2">
                    <span>
                      {server.countryCode && getCountryFlag(server.countryCode)} {server.name}
                    </span>
                    <ServerLifecycleBadge mode={server.lifecycleMode} />
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={clearFilters}
          >
            <X className="w-4 h-4 mr-1" />
            {t('keys.clear_filters')}
          </Button>
        )}

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 rounded-[1rem] px-3.5 text-xs font-medium" disabled={!!exportingFormat}>
              {exportingFormat ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {exportingFormat
                ? fillTemplate(t('keys.exporting'), { format: exportingFormat.toUpperCase() })
                : t('keys.export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('json')} disabled={!!exportingFormat}>
              <FileJson className="w-4 h-4 mr-2" />
              {t('keys.export_json')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')} disabled={!!exportingFormat}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              {t('keys.export_csv')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1.5">
          {/* View mode toggle - visible on all screens */}
          <div className="flex items-center rounded-[0.95rem] border border-border/60 bg-background/55 p-0.5 dark:bg-white/[0.02]">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 rounded-[0.75rem] px-2.5"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 rounded-[0.75rem] px-2.5"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'group' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 rounded-[0.75rem] px-2.5"
              onClick={() => setViewMode('group')}
              title={t('keys.view.group_by_server')}
            >
              <ListIcon className="w-4 h-4" />
            </Button>
          </div>

          {/* Auto-sync selector */}
          <div className="flex items-center gap-1 rounded-[0.95rem] border border-border/60 bg-background/55 px-2 py-1 dark:bg-white/[0.02]">
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', syncAllMutation.isPending && 'animate-spin')} />
            <Select
              value={autoRefresh.interval.toString()}
              onValueChange={(value) => autoRefresh.setInterval(parseInt(value))}
            >
              <SelectTrigger className="h-8 w-[78px] rounded-[0.8rem] border-0 bg-transparent shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_SYNC_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {autoRefresh.isActive && (
              <span className="min-w-[24px] text-[11px] text-muted-foreground">
                {autoRefresh.countdown}s
              </span>
            )}
          </div>

          <Button
            variant="outline"
            className="h-10 rounded-[1rem] px-3.5 text-xs font-medium"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', syncAllMutation.isPending && 'animate-spin')} />
            {syncAllMutation.isPending ? t('keys.syncing') : t('keys.sync')}
          </Button>
        </div>
      </div>

      <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('keys.mobile_filters')}</DialogTitle>
            <DialogDescription>{t('keys.mobile_filters_desc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('keys.status_filter')}</Label>
                <Select
                  value={statusFilter || 'all'}
                  onValueChange={(value) => {
                    setStatusFilter(value === 'all' ? '' : value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('keys.status_filter')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('keys.status_filter')}</SelectItem>
                    <SelectItem value="ACTIVE">{t('keys.status.active')}</SelectItem>
                    <SelectItem value="PENDING">{t('keys.status.pending')}</SelectItem>
                    <SelectItem value="DEPLETED">{t('keys.status.depleted')}</SelectItem>
                    <SelectItem value="EXPIRED">{t('keys.status.expired')}</SelectItem>
                    <SelectItem value="DISABLED">{t('keys.status.disabled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('keys.server_filter')}</Label>
                <Select
                  value={serverFilter || 'all'}
                  onValueChange={(value) => {
                    setServerFilter(value === 'all' ? '' : value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('keys.server_filter')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('keys.server_filter')}</SelectItem>
                    {servers?.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        <div className="flex items-center gap-2">
                          <span>
                            {server.countryCode && getCountryFlag(server.countryCode)} {server.name}
                          </span>
                          <ServerLifecycleBadge mode={server.lifecycleMode} />
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('keys.quick_filters.label')}</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filters.quickFilters.online ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.online && 'bg-green-600 hover:bg-green-700')}
                  onClick={() => setQuickFilter('online', !filters.quickFilters.online)}
                >
                  <Wifi className="w-3 h-3 mr-1" />
                  {t('keys.quick_filters.online')}
                </Button>
                <Button
                  variant={filters.quickFilters.expiring3d ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.expiring3d && 'bg-orange-600 hover:bg-orange-700')}
                  onClick={() => setRenewalWindow(filters.quickFilters.expiring3d ? null : 3)}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  {locale === 'my' ? '၃ ရက်အတွင်း' : 'Expires in 3d'}
                </Button>
                <Button
                  variant={filters.quickFilters.expiring7d ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.expiring7d && 'bg-orange-600 hover:bg-orange-700')}
                  onClick={() => setRenewalWindow(filters.quickFilters.expiring7d ? null : 7)}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  {t('keys.quick_filters.expiring7d')}
                </Button>
                <Button
                  variant={filters.quickFilters.expiring14d ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.expiring14d && 'bg-orange-600 hover:bg-orange-700')}
                  onClick={() => setRenewalWindow(filters.quickFilters.expiring14d ? null : 14)}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  {locale === 'my' ? '၁၄ ရက်အတွင်း' : 'Expires in 14d'}
                </Button>
                <Button
                  variant={filters.quickFilters.telegramLinked ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.telegramLinked && 'bg-sky-600 hover:bg-sky-700')}
                  onClick={toggleRenewalTelegramLinkedFilter}
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  {locale === 'my' ? 'Telegram ချိတ်ထားသည်' : 'Telegram linked'}
                </Button>
                {showRenewalOpsFilters ? (
                  <>
                    <Button
                      variant={filters.quickFilters.neverReminded ? 'default' : 'outline'}
                      size="sm"
                      className={cn(filters.quickFilters.neverReminded && 'bg-slate-600 hover:bg-slate-700')}
                      onClick={() => setReminderStateFilter(filters.quickFilters.neverReminded ? null : 'neverReminded')}
                    >
                      <MessageSquare className="w-3 h-3 mr-1" />
                      {locale === 'my' ? 'Reminder မပို့ရသေး' : 'Never reminded'}
                    </Button>
                    <Button
                      variant={filters.quickFilters.remindedToday ? 'default' : 'outline'}
                      size="sm"
                      className={cn(filters.quickFilters.remindedToday && 'bg-sky-600 hover:bg-sky-700')}
                      onClick={() => setReminderStateFilter(filters.quickFilters.remindedToday ? null : 'remindedToday')}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      {locale === 'my' ? 'ဒီနေ့ reminder ပို့ပြီး' : 'Reminded today'}
                    </Button>
                    <Button
                      variant={filters.quickFilters.reminded24hAgo ? 'default' : 'outline'}
                      size="sm"
                      className={cn(filters.quickFilters.reminded24hAgo && 'bg-orange-600 hover:bg-orange-700')}
                      onClick={() => setReminderStateFilter(filters.quickFilters.reminded24hAgo ? null : 'reminded24hAgo')}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      {locale === 'my' ? 'Follow-up လိုအပ်' : 'Follow-up due'}
                    </Button>
                    <Button
                      variant={filters.quickFilters.renewedAfterReminder ? 'default' : 'outline'}
                      size="sm"
                      className={cn(filters.quickFilters.renewedAfterReminder && 'bg-emerald-600 hover:bg-emerald-700')}
                      onClick={() => setReminderStateFilter(filters.quickFilters.renewedAfterReminder ? null : 'renewedAfterReminder')}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {locale === 'my' ? 'Reminder နောက် Renew လုပ်ပြီး' : 'Renewed after reminder'}
                    </Button>
                    <Button
                      variant={filters.quickFilters.needsTelegramLink ? 'default' : 'outline'}
                      size="sm"
                      className={cn(filters.quickFilters.needsTelegramLink && 'bg-violet-600 hover:bg-violet-700')}
                      onClick={() => setExceptionStateFilter(filters.quickFilters.needsTelegramLink ? null : 'needsTelegramLink')}
                    >
                      <LinkCopy className="w-3 h-3 mr-1" />
                      {locale === 'my' ? 'Telegram link မရှိ' : 'Needs Telegram link'}
                    </Button>
                    <Button
                      variant={filters.quickFilters.deliveryDisabled ? 'default' : 'outline'}
                      size="sm"
                      className={cn(filters.quickFilters.deliveryDisabled && 'bg-amber-600 hover:bg-amber-700')}
                      onClick={() => setExceptionStateFilter(filters.quickFilters.deliveryDisabled ? null : 'deliveryDisabled')}
                    >
                      <Power className="w-3 h-3 mr-1" />
                      {locale === 'my' ? 'Delivery ပိတ်ထား' : 'Delivery disabled'}
                    </Button>
                    <Button
                      variant={filters.quickFilters.reminderFailed ? 'default' : 'outline'}
                      size="sm"
                      className={cn(filters.quickFilters.reminderFailed && 'bg-red-600 hover:bg-red-700')}
                      onClick={() => setExceptionStateFilter(filters.quickFilters.reminderFailed ? null : 'reminderFailed')}
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {locale === 'my' ? 'Reminder မအောင်မြင်' : 'Reminder failed'}
                    </Button>
                    <Button
                      variant={filters.quickFilters.automationBlocked ? 'default' : 'outline'}
                      size="sm"
                      className={cn(filters.quickFilters.automationBlocked && 'bg-orange-600 hover:bg-orange-700')}
                      onClick={() => setExceptionStateFilter(filters.quickFilters.automationBlocked ? null : 'automationBlocked')}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      {locale === 'my' ? 'Automation ပိတ်မိ' : 'Automation blocked'}
                    </Button>
                  </>
                ) : null}
                <Button
                  variant={statusFilter === 'DEPLETED' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(statusFilter === 'DEPLETED' && 'bg-red-600 hover:bg-red-700')}
                  onClick={toggleRenewalDepletedFilter}
                >
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {locale === 'my' ? 'Data ကုန်နေသည်' : 'Depleted'}
                </Button>
                <Button
                  variant={filters.quickFilters.overQuota ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.overQuota && 'bg-red-600 hover:bg-red-700')}
                  onClick={() => setQuickFilter('overQuota', !filters.quickFilters.overQuota)}
                >
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {t('keys.quick_filters.over_quota')}
                </Button>
                <Button
                  variant={filters.quickFilters.inactive30d ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.inactive30d && 'bg-gray-600 hover:bg-gray-700')}
                  onClick={() => setQuickFilter('inactive30d', !filters.quickFilters.inactive30d)}
                >
                  <EyeOff className="w-3 h-3 mr-1" />
                  {t('keys.quick_filters.inactive30d')}
                </Button>
                <Button
                  variant={filters.quickFilters.overDeviceLimit ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.overDeviceLimit && 'bg-violet-600 hover:bg-violet-700')}
                  onClick={() => setQuickFilter('overDeviceLimit', !filters.quickFilters.overDeviceLimit)}
                >
                  <Smartphone className="w-3 h-3 mr-1" />
                  {locale === 'my' ? 'စက်ကန့်သတ်ချက် ကျော်လွန်' : 'Over device limit'}
                </Button>
                {showRenewalOpsFilters ? (
                  <Button
                    variant={filters.quickFilters.deviceLimitWarned ? 'default' : 'outline'}
                    size="sm"
                    className={cn(filters.quickFilters.deviceLimitWarned && 'bg-amber-600 hover:bg-amber-700')}
                    onClick={() => setQuickFilter('deviceLimitWarned', !filters.quickFilters.deviceLimitWarned)}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {locale === 'my' ? 'သတိပေးချက် ပို့ပြီး' : 'Warning sent'}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mobile-key-tag-filter">{t('keys.quick_filters.tag')}</Label>
                <Input
                  id="mobile-key-tag-filter"
                  placeholder={t('keys.quick_filters.tag_placeholder')}
                  value={filters.tagFilter || ''}
                  onChange={(e) => setTagFilter(e.target.value || undefined)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile-key-owner-filter">{t('keys.quick_filters.owner')}</Label>
                <Input
                  id="mobile-key-owner-filter"
                  placeholder={t('keys.quick_filters.owner_placeholder')}
                  value={filters.ownerFilter || ''}
                  onChange={(e) => setOwnerFilter(e.target.value || undefined)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('keys.refresh_interval')}</Label>
              <Select
                value={autoRefresh.interval.toString()}
                onValueChange={(value) => autoRefresh.setInterval(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTO_SYNC_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => handleExport('json')}
                disabled={!!exportingFormat}
              >
                <FileJson className="w-4 h-4 mr-2" />
                {t('keys.export_json')}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport('csv')}
                disabled={!!exportingFormat}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {t('keys.export_csv')}
              </Button>
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 gap-2 border-t bg-background pt-4 sm:gap-0">
            <Button variant="outline" onClick={clearAllFilters}>
              <X className="w-4 h-4 mr-2" />
              {t('keys.clear_filters')}
            </Button>
            <Button onClick={() => setMobileFiltersOpen(false)}>{t('keys.cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isRenewalWorkspace ? (
        <Card className="mb-6 overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-background shadow-[0_20px_45px_rgba(12,18,38,0.12)]">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5 text-primary" />
                {locale === 'my' ? 'သက်တမ်းတိုး အလုပ်စာရင်း' : 'Renewal queue'}
              </CardTitle>
              <CardDescription>
                {locale === 'my'
                  ? 'Expire နီးနေသော သို့မဟုတ် data ကုန်နေသော key များကို စစ်ပြီး package ဖြင့် renew လုပ်ကာ Telegram reminder ပို့နိုင်သည်။ Priority order သည် first touch မရှိသေးသော key များနှင့် unresolved outreach များကို အရင်တင်ပေးသည်။'
                  : 'Filter expiring or depleted keys, select the current queue, then renew with a package or send Telegram reminders. Priority order keeps untouched and unresolved outreach work at the top.'}
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Queue စုစုပေါင်း' : 'Queue total'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? data?.total ?? 0 : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'မြင်နေသောစာမျက်နှာ' : 'Visible page'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{visibleRenewalQueueItems.length}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'ရွေးထားပြီး' : 'Selected'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{selectedKeys.size}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Reminder ရနိုင်' : 'Reminder-ready'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{visibleRenewalReminderEligibleCount}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Reminder ပို့ပြီး' : 'Reminded'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalReminderSummary.reminded : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Reminder မပို့ရသေး' : 'Never reminded'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalReminderSummary.neverReminded : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Reminder နောက် Renew လုပ်ပြီး' : 'Renewed after reminder'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalReminderSummary.renewedAfterReminder : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Follow-up လိုအပ်' : 'Follow-up due'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalReminderSummary.pendingFollowUp : 0}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Telegram ရောက်နိုင်' : 'Reachable'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalExceptionSummary.reachable : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Blocked' : 'Blocked'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalExceptionSummary.blocked : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Telegram link မရှိ' : 'No Telegram link'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalExceptionSummary.needsTelegramLink : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Failed sends' : 'Failed sends'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalExceptionSummary.failed : 0}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Outreach မမှတ်ရသေး' : 'No outreach log'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalOutreachSummary.neverPrepared : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'ရလဒ်မမှတ်ရသေး' : 'Awaiting result'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalOutreachSummary.pendingResult : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'အသုံးပြုသူ ပြန်စာပို့' : 'Customer replied'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalOutreachSummary.replied : 0}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {locale === 'my' ? 'Outreach ပြီး renew ဖြစ်' : 'Renewed after outreach'}
                </p>
                <p className="mt-2 text-2xl font-semibold">{hasRenewalQueueFilters ? renewalOutreachSummary.renewed : 0}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {locale === 'my' ? 'အလုပ်လမ်းကြောင်း' : 'Queue focus'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locale === 'my'
                      ? 'တစ်ချက်နှိပ်ပြီး first touch, reply စောင့်နေမှု, conversion lane များသို့ တန်းဝင်နိုင်သည်။'
                      : 'Jump straight into first-touch, waiting-for-reply, and conversion lanes with one click.'}
                  </p>
                </div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {locale === 'my'
                    ? 'ဦးစားပေး: no log -> pending -> sent -> no response -> converted'
                    : 'Priority: no log -> pending -> sent -> no response -> converted'}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant={activeOutreachStateFilter === 'outreachNeverPrepared' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(activeOutreachStateFilter === 'outreachNeverPrepared' && 'bg-slate-600 hover:bg-slate-700')}
                  onClick={() => setOutreachStateFilter(activeOutreachStateFilter === 'outreachNeverPrepared' ? null : 'outreachNeverPrepared')}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {locale === 'my' ? 'ပထမဆက်သွယ်ရန်' : 'Needs first touch'}
                  <span className="ml-2 text-xs opacity-80">{renewalOutreachSummary.neverPrepared}</span>
                </Button>
                <Button
                  variant={activeOutreachStateFilter === 'outreachPendingResult' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(activeOutreachStateFilter === 'outreachPendingResult' && 'bg-sky-600 hover:bg-sky-700')}
                  onClick={() => setOutreachStateFilter(activeOutreachStateFilter === 'outreachPendingResult' ? null : 'outreachPendingResult')}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {locale === 'my' ? 'ရလဒ်စောင့်နေသည်' : 'Awaiting result'}
                  <span className="ml-2 text-xs opacity-80">{renewalOutreachSummary.pendingResult}</span>
                </Button>
                <Button
                  variant={activeOutreachStateFilter === 'outreachSent' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(activeOutreachStateFilter === 'outreachSent' && 'bg-sky-600 hover:bg-sky-700')}
                  onClick={() => setOutreachStateFilter(activeOutreachStateFilter === 'outreachSent' ? null : 'outreachSent')}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {locale === 'my' ? 'ပြန်စာစောင့်နေသည်' : 'Waiting for reply'}
                  <span className="ml-2 text-xs opacity-80">{renewalOutreachSummary.sent}</span>
                </Button>
                <Button
                  variant={activeOutreachStateFilter === 'outreachNoResponse' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(activeOutreachStateFilter === 'outreachNoResponse' && 'bg-amber-600 hover:bg-amber-700')}
                  onClick={() => setOutreachStateFilter(activeOutreachStateFilter === 'outreachNoResponse' ? null : 'outreachNoResponse')}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {locale === 'my' ? 'ပြန်စာမရှိ' : 'No response'}
                  <span className="ml-2 text-xs opacity-80">{renewalOutreachSummary.noResponse}</span>
                </Button>
                <Button
                  variant={activeOutreachStateFilter === 'outreachRenewed' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(activeOutreachStateFilter === 'outreachRenewed' && 'bg-emerald-600 hover:bg-emerald-700')}
                  onClick={() => setOutreachStateFilter(activeOutreachStateFilter === 'outreachRenewed' ? null : 'outreachRenewed')}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {locale === 'my' ? 'Renew ဖြစ်ပြီး' : 'Converted'}
                  <span className="ml-2 text-xs opacity-80">{renewalOutreachSummary.renewed}</span>
                </Button>
              </div>
              <div className="mt-4 border-t border-border/60 pt-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {locale === 'my' ? 'ဟောင်းနေသော follow-up lane များ' : 'Stale follow-up lanes'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {locale === 'my'
                        ? '24 နာရီ၊ 72 နာရီ ကျော်သွားသော unresolved outreach work ကို lane အလိုက် ချက်ချင်းစိစစ်နိုင်သည်။'
                        : 'Jump straight into unresolved outreach work that has aged past 24 or 72 hours.'}
                    </p>
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {activeOutreachAgeFilter === 'outreachOlderThan72h'
                      ? (locale === 'my' ? 'လက်ရှိ threshold: 72h+' : 'Current threshold: 72h+')
                      : activeOutreachAgeFilter === 'outreachOlderThan24h'
                        ? (locale === 'my' ? 'လက်ရှိ threshold: 24h+' : 'Current threshold: 24h+')
                        : (locale === 'my' ? 'Threshold: 24h+ / 72h+' : 'Threshold: 24h+ / 72h+')}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={activeOutreachAgeFilter === 'outreachOlderThan24h' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(activeOutreachAgeFilter === 'outreachOlderThan24h' && 'bg-amber-600 hover:bg-amber-700')}
                    onClick={() => setOutreachAgeFilter(activeOutreachAgeFilter === 'outreachOlderThan24h' ? null : 'outreachOlderThan24h')}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {locale === 'my' ? '24h ကျော်' : 'Older than 24h'}
                    <span className="ml-2 text-xs opacity-80">{renewalOutreachStaleSummary.olderThan24h}</span>
                  </Button>
                  <Button
                    variant={activeOutreachAgeFilter === 'outreachOlderThan72h' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(activeOutreachAgeFilter === 'outreachOlderThan72h' && 'bg-red-600 hover:bg-red-700')}
                    onClick={() => setOutreachAgeFilter(activeOutreachAgeFilter === 'outreachOlderThan72h' ? null : 'outreachOlderThan72h')}
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    {locale === 'my' ? '72h ကျော်' : 'Older than 72h'}
                    <span className="ml-2 text-xs opacity-80">{renewalOutreachStaleSummary.olderThan72h}</span>
                  </Button>
                  <Button
                    variant={activeOutreachLaneFilter === 'stalePendingResult' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(activeOutreachLaneFilter === 'stalePendingResult' && 'bg-sky-600 hover:bg-sky-700')}
                    onClick={() => setOutreachLaneFilter(activeOutreachLaneFilter === 'stalePendingResult' ? null : 'stalePendingResult')}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'ဟောင်းနေသော awaiting result' : 'Stale awaiting result'}
                    <span className="ml-2 text-xs opacity-80">
                      {getRenewalOutreachStaleLaneCount(
                        renewalOutreachStaleSummary,
                        'stalePendingResult',
                        activeOutreachAgeFilter,
                      )}
                    </span>
                  </Button>
                  <Button
                    variant={activeOutreachLaneFilter === 'staleSent' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(activeOutreachLaneFilter === 'staleSent' && 'bg-sky-600 hover:bg-sky-700')}
                    onClick={() => setOutreachLaneFilter(activeOutreachLaneFilter === 'staleSent' ? null : 'staleSent')}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'ဟောင်းနေသော sent' : 'Stale sent'}
                    <span className="ml-2 text-xs opacity-80">
                      {getRenewalOutreachStaleLaneCount(
                        renewalOutreachStaleSummary,
                        'staleSent',
                        activeOutreachAgeFilter,
                      )}
                    </span>
                  </Button>
                  <Button
                    variant={activeOutreachLaneFilter === 'staleNoResponse' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(activeOutreachLaneFilter === 'staleNoResponse' && 'bg-amber-600 hover:bg-amber-700')}
                    onClick={() => setOutreachLaneFilter(activeOutreachLaneFilter === 'staleNoResponse' ? null : 'staleNoResponse')}
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'ဟောင်းနေသော no response' : 'Stale no response'}
                    <span className="ml-2 text-xs opacity-80">
                      {getRenewalOutreachStaleLaneCount(
                        renewalOutreachStaleSummary,
                        'staleNoResponse',
                        activeOutreachAgeFilter,
                      )}
                    </span>
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {locale === 'my'
                    ? 'Lane filter များက visible queue ကိုသာ ကျဉ်းစေသည်။ အောက်က Select visible page နှင့် bulk outreach/result action များက လက်ရှိ lane အပေါ်မှာပဲ အလုပ်လုပ်မည်။'
                    : 'Lane filters narrow only the visible queue. Use Select visible page and the bulk outreach/result actions below to work the current lane only.'}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeRenewalWindow === 3 ? 'default' : 'outline'}
              size="sm"
              className={cn(activeRenewalWindow === 3 && 'bg-orange-600 hover:bg-orange-700')}
              onClick={() => setRenewalWindow(activeRenewalWindow === 3 ? null : 3)}
            >
              <Clock className="mr-2 h-4 w-4" />
              {locale === 'my' ? '၃ ရက်အတွင်း' : 'Expires in 3d'}
            </Button>
            <Button
              variant={activeRenewalWindow === 7 ? 'default' : 'outline'}
              size="sm"
              className={cn(activeRenewalWindow === 7 && 'bg-orange-600 hover:bg-orange-700')}
              onClick={() => setRenewalWindow(activeRenewalWindow === 7 ? null : 7)}
            >
              <Clock className="mr-2 h-4 w-4" />
              {locale === 'my' ? '၇ ရက်အတွင်း' : 'Expires in 7d'}
            </Button>
            <Button
              variant={activeRenewalWindow === 14 ? 'default' : 'outline'}
              size="sm"
              className={cn(activeRenewalWindow === 14 && 'bg-orange-600 hover:bg-orange-700')}
              onClick={() => setRenewalWindow(activeRenewalWindow === 14 ? null : 14)}
            >
              <Clock className="mr-2 h-4 w-4" />
              {locale === 'my' ? '၁၄ ရက်အတွင်း' : 'Expires in 14d'}
            </Button>
            <Button
              variant={isRenewalQueueDepleted ? 'default' : 'outline'}
              size="sm"
              className={cn(isRenewalQueueDepleted && 'bg-red-600 hover:bg-red-700')}
              onClick={toggleRenewalDepletedFilter}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Data ကုန်နေသည်' : 'Depleted'}
            </Button>
            <Button
              variant={filters.quickFilters.telegramLinked ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.telegramLinked && 'bg-sky-600 hover:bg-sky-700')}
              onClick={toggleRenewalTelegramLinkedFilter}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Telegram ချိတ်ထားသည်' : 'Telegram linked'}
            </Button>
            <Button
              variant={filters.quickFilters.neverReminded ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.neverReminded && 'bg-slate-600 hover:bg-slate-700')}
              onClick={() => setReminderStateFilter(filters.quickFilters.neverReminded ? null : 'neverReminded')}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Reminder မပို့ရသေး' : 'Never reminded'}
            </Button>
            <Button
              variant={filters.quickFilters.remindedToday ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.remindedToday && 'bg-sky-600 hover:bg-sky-700')}
              onClick={() => setReminderStateFilter(filters.quickFilters.remindedToday ? null : 'remindedToday')}
            >
              <Clock className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'ဒီနေ့ reminder ပို့ပြီး' : 'Reminded today'}
            </Button>
            <Button
              variant={filters.quickFilters.reminded24hAgo ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.reminded24hAgo && 'bg-orange-600 hover:bg-orange-700')}
              onClick={() => setReminderStateFilter(filters.quickFilters.reminded24hAgo ? null : 'reminded24hAgo')}
            >
              <Clock className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Follow-up လိုအပ်' : 'Follow-up due'}
            </Button>
            <Button
              variant={filters.quickFilters.renewedAfterReminder ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.renewedAfterReminder && 'bg-emerald-600 hover:bg-emerald-700')}
              onClick={() => setReminderStateFilter(filters.quickFilters.renewedAfterReminder ? null : 'renewedAfterReminder')}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Reminder နောက် Renew လုပ်ပြီး' : 'Renewed after reminder'}
            </Button>
            <Button
              variant={filters.quickFilters.needsTelegramLink ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.needsTelegramLink && 'bg-violet-600 hover:bg-violet-700')}
              onClick={() => setExceptionStateFilter(filters.quickFilters.needsTelegramLink ? null : 'needsTelegramLink')}
            >
              <LinkCopy className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Telegram link မရှိ' : 'Needs Telegram link'}
            </Button>
            <Button
              variant={filters.quickFilters.deliveryDisabled ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.deliveryDisabled && 'bg-amber-600 hover:bg-amber-700')}
              onClick={() => setExceptionStateFilter(filters.quickFilters.deliveryDisabled ? null : 'deliveryDisabled')}
            >
              <Power className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Delivery ပိတ်ထား' : 'Delivery disabled'}
            </Button>
            <Button
              variant={filters.quickFilters.reminderFailed ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.reminderFailed && 'bg-red-600 hover:bg-red-700')}
              onClick={() => setExceptionStateFilter(filters.quickFilters.reminderFailed ? null : 'reminderFailed')}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Reminder မအောင်မြင်' : 'Reminder failed'}
            </Button>
            <Button
              variant={filters.quickFilters.automationBlocked ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.automationBlocked && 'bg-orange-600 hover:bg-orange-700')}
              onClick={() => setExceptionStateFilter(filters.quickFilters.automationBlocked ? null : 'automationBlocked')}
            >
              <Clock className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Automation ပိတ်မိ' : 'Automation blocked'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachNeverPrepared ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachNeverPrepared && 'bg-slate-600 hover:bg-slate-700')}
              onClick={() => setOutreachStateFilter(filters.quickFilters.outreachNeverPrepared ? null : 'outreachNeverPrepared')}
            >
              <FileText className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Outreach မမှတ်ရသေး' : 'No outreach log'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachPendingResult ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachPendingResult && 'bg-sky-600 hover:bg-sky-700')}
              onClick={() => setOutreachStateFilter(filters.quickFilters.outreachPendingResult ? null : 'outreachPendingResult')}
            >
              <Clock className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'ရလဒ်မမှတ်ရသေး' : 'Awaiting result'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachSent ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachSent && 'bg-sky-600 hover:bg-sky-700')}
              onClick={() => setOutreachStateFilter(filters.quickFilters.outreachSent ? null : 'outreachSent')}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Outreach ပို့ပြီး' : 'Outreach sent'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachReplied ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachReplied && 'bg-emerald-600 hover:bg-emerald-700')}
              onClick={() => setOutreachStateFilter(filters.quickFilters.outreachReplied ? null : 'outreachReplied')}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'အသုံးပြုသူ ပြန်စာပို့' : 'Customer replied'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachRenewed ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachRenewed && 'bg-emerald-600 hover:bg-emerald-700')}
              onClick={() => setOutreachStateFilter(filters.quickFilters.outreachRenewed ? null : 'outreachRenewed')}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Outreach ပြီး renew ဖြစ်' : 'Renewed after outreach'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachNoResponse ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachNoResponse && 'bg-amber-600 hover:bg-amber-700')}
              onClick={() => setOutreachStateFilter(filters.quickFilters.outreachNoResponse ? null : 'outreachNoResponse')}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'ပြန်စာမရှိ' : 'No response'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachDone ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachDone && 'bg-emerald-600 hover:bg-emerald-700')}
              onClick={() => setOutreachStateFilter(filters.quickFilters.outreachDone ? null : 'outreachDone')}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Outreach ပြီးစီး' : 'Outreach done'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachOlderThan24h ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachOlderThan24h && 'bg-amber-600 hover:bg-amber-700')}
              onClick={() => setOutreachAgeFilter(filters.quickFilters.outreachOlderThan24h ? null : 'outreachOlderThan24h')}
            >
              <Clock className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Outreach 24h ကျော်' : 'Outreach older than 24h'}
            </Button>
            <Button
              variant={filters.quickFilters.outreachOlderThan72h ? 'default' : 'outline'}
              size="sm"
              className={cn(filters.quickFilters.outreachOlderThan72h && 'bg-red-600 hover:bg-red-700')}
              onClick={() => setOutreachAgeFilter(filters.quickFilters.outreachOlderThan72h ? null : 'outreachOlderThan72h')}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'Outreach 72h ကျော်' : 'Outreach older than 72h'}
            </Button>
            {hasRenewalQueueFilters ? (
              <Button variant="ghost" size="sm" onClick={clearRenewalQueueFilters}>
                <X className="mr-2 h-4 w-4" />
                {locale === 'my' ? 'Queue filter များ ဖြုတ်မည်' : 'Clear queue filters'}
              </Button>
            ) : null}
          </div>

          {renewalPresets.length > 0 ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {locale === 'my' ? 'Renewal package ကို ရွေးပါ' : 'Choose a renewal package'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'my'
                    ? 'Visible queue ကို ရွေးပြီးနောက် preset ကို တစ်ချက်နှိပ်ဖြင့် အစုလိုက် renew လုပ်နိုင်သည်။'
                    : 'Select the visible queue, then apply one preset to the current batch in a single action.'}
                </p>
              </div>
              <RenewalPackagePicker
                presets={renewalPresets}
                selectedCode={selectedRenewalQueuePreset?.code ?? null}
                isMyanmar={locale === 'my'}
                onSelect={(preset) => setSelectedRenewalQueuePresetCode(preset.code)}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectVisibleRenewalQueue}
              disabled={visibleRenewalQueueIds.length === 0}
            >
              <CheckSquare className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'မြင်နေသောစာမျက်နှာကို ရွေးမည်' : 'Select visible page'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkRenewDialogOpen(true)}
              disabled={selectedKeys.size === 0}
            >
              <Calendar className="mr-2 h-4 w-4" />
              {locale === 'my' ? 'လနှင့် GB ကို ကိုယ်တိုင်ရွေးမည်' : 'Manual renew'}
            </Button>
            <Button
              size="sm"
              onClick={handleApplyRenewalQueuePreset}
              disabled={selectedKeys.size === 0 || !selectedRenewalQueuePreset || bulkRenewMutation.isPending}
            >
              {bulkRenewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {locale === 'my'
                ? `${selectedRenewalQueuePreset?.label ?? 'Package'} ဖြင့် renew`
                : `Apply ${selectedRenewalQueuePreset?.label ?? 'package'}`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkRenewalReminder}
              disabled={selectedKeys.size === 0 || bulkRenewalReminderMutation.isPending}
            >
              {bulkRenewalReminderMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
              {locale === 'my' ? 'သက်တမ်းတိုး သတိပေးချက် ပို့မည်' : 'Send renewal reminders'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkEnableTelegramDelivery}
              disabled={selectedKeys.size === 0 || bulkEnableTelegramDeliveryMutation.isPending}
            >
              {bulkEnableTelegramDeliveryMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
              {locale === 'my' ? 'Telegram delivery ဖွင့်မည်' : 'Enable Telegram delivery'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkCopyTelegramConnectLinks}
              disabled={selectedKeys.size === 0 || bulkGenerateTelegramConnectLinksMutation.isPending}
            >
              {bulkGenerateTelegramConnectLinksMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkCopy className="mr-2 h-4 w-4" />}
              {locale === 'my' ? 'Telegram connect link များ ကူးမည်' : 'Copy connect links'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyRenewalOutreachPack}
              disabled={selectedKeys.size === 0 || prepareRenewalOutreachPackMutation.isPending}
            >
              {prepareRenewalOutreachPackMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {locale === 'my' ? 'Outreach message များ ကူးမည်' : 'Copy outreach pack'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportRenewalOutreachCsv}
              disabled={selectedKeys.size === 0 || prepareRenewalOutreachPackMutation.isPending}
            >
              {prepareRenewalOutreachPackMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {locale === 'my' ? 'Outreach CSV ထုတ်မည်' : 'Export outreach CSV'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenRenewalOutreachResultDialog}
              disabled={selectedKeys.size === 0 || markRenewalOutreachResultMutation.isPending}
            >
              {markRenewalOutreachResultMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {locale === 'my' ? 'Outreach result မှတ်မည်' : 'Log outreach result'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {locale === 'my'
              ? `Renew, reminder, outreach action များ၏ result ကို bulk progress dialog နှင့် audit trail ထဲတွင် ဆက်လက်မြင်နိုင်မည်။ Visible selection ${visibleRenewalQueueSelectedCount} ခု ရွေးထားသည်။`
              : `Renew, reminder, and outreach actions feed the existing bulk progress dialog and audit trail. ${visibleRenewalQueueSelectedCount} visible queue items are currently selected.`}
          </p>
        </CardContent>
        </Card>
      ) : (
        <Card className="mb-6 border-border/60 bg-background/70 shadow-[0_18px_40px_rgba(12,18,38,0.08)]">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                  {locale === 'my' ? 'Renewal Ops' : 'Renewal Ops'}
                </CardTitle>
                <CardDescription>
                  {locale === 'my'
                    ? 'Reminder, Telegram recovery, outreach logging နှင့် package renew workflow များကို သီးခြား workspace ထဲသို့ ရွှေ့ထားသည်။ Access Keys မျက်နှာပြင်ကို inventory အပေါ်ပိုမို သန့်ရှင်းစွာ ထားရှိထားသည်။'
                    : 'Reminders, Telegram recovery, outreach logging, and package renewals now live in a dedicated workspace so this page stays focused on inventory.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" className="rounded-full px-4">
                  <Link href={renewalWorkspaceHref}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'Renewal Ops ကို ဖွင့်မည်' : 'Open Renewal Ops'}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="rounded-full px-4">
                  <Link href="/dashboard/templates">
                    <FileText className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'တမ်းပလိတ်များ' : 'Templates'}
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {locale === 'my' ? '24 နာရီအတွင်း Expire' : 'Expires in 24h'}
              </p>
              <p className="mt-2 text-2xl font-semibold">{stats?.expiringIn24h ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {locale === 'my' ? 'Data ကုန်ပြီး' : 'Depleted'}
              </p>
              <p className="mt-2 text-2xl font-semibold">{stats?.depleted ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/55 px-4 py-3 text-sm text-muted-foreground">
              {locale === 'my'
                ? 'Inventory search, usage review, edit, share, and per-key actions ကို ဒီစာမျက်နှာပေါ်တွင် ဆက်ထားပြီး renewal work ကို သီးခြား workspace ထဲတွင် ထိန်းထားသည်။'
                : 'Inventory search, usage review, edit, share, and per-key actions stay here. Renewal work lives in its own workspace.'}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk actions bar */}
      {selectedKeys.size > 0 && (
        <KeysBulkActionsBar
          t={t}
          selectedCount={selectedKeys.size}
          isBulkBusy={isBulkBusy}
          bulkTogglePending={bulkToggleStatusMutation.isPending}
          bulkRenewPending={bulkRenewMutation.isPending}
          bulkTagsPending={bulkAddTagsMutation.isPending || bulkRemoveTagsMutation.isPending}
          bulkMovePending={bulkMoveMutation.isPending}
          bulkArchivePending={bulkArchiveMutation.isPending}
          bulkDeletePending={bulkDeleteMutation.isPending}
          onToggleStatus={handleBulkToggleStatus}
          onOpenRenew={() => setBulkRenewDialogOpen(true)}
          onOpenAddTags={() => {
            setBulkTagsMode('add');
            setBulkTagsDialogOpen(true);
          }}
          onOpenRemoveTags={() => {
            setBulkTagsMode('remove');
            setBulkTagsDialogOpen(true);
          }}
          onOpenMove={() => setBulkMoveDialogOpen(true)}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onClearSelection={() => setSelectedKeys(new Set())}
        />
      )}

      {/* Mobile Card View - only show when viewMode is 'grid' */}
      {isLoading ? (
        <div className="md:hidden space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-32 bg-muted animate-pulse" />
          ))}
        </div>
      ) : viewMode === 'group' ? (
        <ServerGroupList
          keys={data?.items || []}
          onToggleStatus={(key, checked) => handleToggleStatus(key.id)}
          onEdit={(key) => setEditingKey(key)}
          onRenew={(key) => handleOpenRenew(key)}
          onDelete={(key) => handleDelete(key.id, key.name)}
          onCopy={(key) => {
            if (key.accessUrl) {
              copyToClipboard(key.accessUrl, t('keys.toast.copied'), t('keys.toast.copy_access_url'));
            } else {
              toast({ title: t('keys.toast.error'), description: t('keys.toast.no_access_url'), variant: 'destructive' });
            }
          }}
          onQr={(key) => setQrDialogKey({ id: key.id, name: key.name })}
          isProcessingId={togglingKeyId}
        />
      ) : (viewMode === 'grid' || viewMode === 'list') ? (
        <MobileCardView
          data={data?.items || []}
          renderCard={renderKeyCard}
          keyExtractor={(item) => item.id}
          className="md:hidden"
        />
      ) : null}
      {renderPagination('mobile')}

      {/* Desktop Grid View */}
      {viewMode === 'grid' && (
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          {isLoading ? (
            [...Array(8)].map((_, i) => (
              <Card key={i} className="h-48 bg-muted animate-pulse" />
            ))
          ) : data?.items && data.items.length > 0 ? (
            data.items.map((key) => {
              const config = statusConfig[key.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
              const StatusIcon = config.icon;
              const isOnline = checkIsOnline(key.id, key.status);
              const trafficMeta = liveMetricsById.get(key.id);
              const lastTrafficAt = trafficMeta?.lastTrafficAt ?? (key.lastTrafficAt ? new Date(key.lastTrafficAt) : null);
              const tags = typeof key.tags === 'string' ? stringToTags(key.tags) : [];
              const { deviceCount, overLimit, stage, stageLabel } = getDeviceLimitVisualState(key);
              const renewalReminderMeta = getRenewalReminderMeta((key as any).renewalReminder, locale === 'my');
              const renewalExceptionMeta = getRenewalExceptionMeta((key as any).renewalException, locale === 'my');
              const renewalOutreachMeta = getRenewalOutreachMeta((key as any).renewalOutreach, locale === 'my');
              const renewalOutreachAgeMeta = getRenewalOutreachAgeMeta((key as any).renewalOutreach);

              return (
                <Card key={key.id} className="group hover:border-primary/30 transition-all duration-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="relative">
                          {isOnline && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                            </span>
                          )}
                          <Key className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/dashboard/keys/${key.id}`} className="font-medium hover:underline truncate block">
                            {key.name}
                          </Link>
                          {key.server && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {key.server.countryCode && <span>{getCountryFlag(key.server.countryCode)}</span>}
                              <span className="truncate">{key.server.name}</span>
                              <ServerLifecycleBadge mode={key.server.lifecycleMode} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="ml-3 flex items-start gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          onClick={() => handleSelectKey(key.id)}
                        >
                          {selectedKeys.has(key.id) ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Badge className={cn('border shrink-0', config.color)}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {t(config.labelKey)}
                        </Badge>
                      </div>
                    </div>

                    {key.status === 'ACTIVE' ? (
                      <div className="flex items-center justify-between text-xs">
                        <Badge
                          variant="outline"
                          className={cn(
                            'border',
                            isOnline ? 'border-green-500/40 text-green-400' : 'border-border/60 text-muted-foreground',
                          )}
                        >
                          {isOnline ? t('keys.status.online') : t('keys.status.no_recent_traffic')}
                        </Badge>
                        <span className="text-muted-foreground">
                          {t('keys.activity.last_traffic_short')}{' '}
                          {lastTrafficAt ? formatRelativeTime(lastTrafficAt) : t('keys.activity.none')}
                        </span>
                      </div>
                    ) : null}
                    {showRenewalOpsFilters ? (
                      <div className="space-y-1 text-xs">
                        <Badge
                          variant="outline"
                          className={cn('border w-fit', renewalReminderMeta.badgeClassName)}
                        >
                          {renewalReminderMeta.label}
                        </Badge>
                        <p className="text-muted-foreground">{renewalReminderMeta.detail}</p>
                        {renewalExceptionMeta ? (
                          <>
                            <Badge
                              variant="outline"
                              className={cn('border w-fit', renewalExceptionMeta.badgeClassName)}
                            >
                              {renewalExceptionMeta.label}
                            </Badge>
                            <p className="text-muted-foreground">{renewalExceptionMeta.detail}</p>
                          </>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={cn('border w-fit', renewalOutreachMeta.badgeClassName)}
                        >
                          {renewalOutreachMeta.label}
                        </Badge>
                        <p className="text-muted-foreground">{renewalOutreachMeta.detail}</p>
                        {renewalOutreachAgeMeta ? (
                          <Badge
                            variant="outline"
                            className={cn('border w-fit', renewalOutreachAgeMeta.badgeClassName)}
                          >
                            {renewalOutreachAgeMeta.label}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                    {key.maxDevices ? (
                      <div className="flex items-center justify-between text-xs">
                        <Badge
                          variant="outline"
                          className={cn(
                            'border',
                            overLimit ? 'border-violet-500/40 text-violet-300' : 'border-border/60 text-muted-foreground',
                          )}
                        >
                          {deviceCount}/{key.maxDevices} devices
                        </Badge>
                        <span
                          className={cn(
                            'text-[11px]',
                            overLimit || stage === 'DISABLED'
                              ? 'text-violet-300'
                              : stage === 'SUPPRESSED'
                                ? 'text-sky-300'
                                : 'text-muted-foreground',
                          )}
                        >
                          {stageLabel}
                        </span>
                      </div>
                    ) : null}

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{t('keys.table.usage')}</span>
                      </div>
                      <SegmentedUsageBarCompact
                        valueBytes={Number(key.usedBytes)}
                        limitBytes={key.dataLimitBytes ? Number(key.dataLimitBytes) : undefined}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Smartphone className="w-3 h-3" />
                        {deviceCount} {t('keys.devices_count')}
                      </span>
                      <span className={cn('text-muted-foreground', key.isExpiringSoon && 'text-red-500')}>
                        {key.expiresAt ? formatRelativeTime(key.expiresAt) : t('keys.never_expires')}
                      </span>
                    </div>

                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.slice(0, 3).map((tag) => (
                          <KeyTagChip key={tag} tag={tag} compact onClick={applyTagFilter} />
                        ))}
                        {tags.length > 3 ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            +{tags.length - 3}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQrDialogKey({ id: key.id, name: key.name })}>
                          <QrCode className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            const url = getKeySubscriptionPageUrl(key.subscriptionToken, (key as any).publicSlug);
                            copyToClipboard(url, t('keys.toast.copied'), t('keys.toast.copy_subscription_url'));
                          }}
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/keys/${key.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              {t('keys.actions.view_details')}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingKey(key)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            {t('keys.actions.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenRenew(key)}>
                            <Calendar className="w-4 h-4 mr-2" />
                            {locale === 'my' ? 'Renew လုပ်မည်' : 'Renew'}
                          </DropdownMenuItem>
                          {showRenewalOpsFilters && (key as any).renewalException?.deliveryDisabled ? (
                            <DropdownMenuItem
                              onClick={() => handleEnableTelegramDelivery(key)}
                              disabled={bulkEnableTelegramDeliveryMutation.isPending}
                            >
                              <Power className="w-4 h-4 mr-2" />
                              {locale === 'my' ? 'Telegram delivery ဖွင့်မည်' : 'Enable Telegram delivery'}
                            </DropdownMenuItem>
                          ) : null}
                          {showRenewalOpsFilters && (key as any).renewalException?.needsTelegramLink ? (
                            <DropdownMenuItem
                              onClick={() => handleCopyTelegramConnectLink(key)}
                              disabled={generateTelegramConnectLinkMutation.isPending}
                            >
                              <LinkCopy className="w-4 h-4 mr-2" />
                              {locale === 'my' ? 'Telegram connect link ကူးမည်' : 'Copy Telegram connect link'}
                            </DropdownMenuItem>
                          ) : null}
                          {showRenewalOpsFilters ? (
                            <DropdownMenuItem
                              onClick={() => handleSendRenewalReminder(key)}
                              disabled={!canSendRenewalReminderForKey(key) || sendRenewalReminderMutation.isPending}
                            >
                              <MessageSquare className="w-4 h-4 mr-2" />
                              {locale === 'my' ? 'သက်တမ်းတိုး သတိပေးချက် ပို့မည်' : 'Send renewal reminder'}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => handleToggleStatus(key.id)}>
                            <Power className="w-4 h-4 mr-2" />
                            {key.status === 'DISABLED' ? t('keys.actions.enable') : t('keys.actions.disable')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(key.id, key.name)} className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('keys.actions.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="col-span-full py-12 text-center">
              <Key className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {hasAnyFilters ? t('keys.empty.no_match') : t('keys.empty.no_keys')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Keys table (List View) - show on desktop always when list mode, and on mobile when list mode */}
      <Card className={cn('ops-data-shell mb-6 overflow-hidden', viewMode === 'list' ? 'hidden md:block' : 'hidden')}>
        <div className="overflow-x-auto">
          <table className="w-full">

            <thead>
              <tr className="border-b border-border/60 bg-background/55 text-left align-middle backdrop-blur-sm dark:bg-[rgba(4,10,21,0.72)]">
                <th className="px-2 py-3 w-10">
                  <button
                    onClick={handleSelectAll}
                    className="p-1 hover:bg-muted rounded"
                    title={selectedKeys.size === (data?.items?.length || 0) ? t('keys.deselect_all') : t('keys.select_all')}
                  >
                    {data?.items && selectedKeys.size === data.items.length && data.items.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('keys.table.name')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('keys.table.server')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('keys.table.status')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('keys.table.usage')}</th>
                <th className="hidden px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:table-cell">{t('keys.table.traffic_7d')}</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('keys.devices')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('keys.table.expires')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('keys.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3">
                      <div className="h-14 rounded-[1.1rem] bg-muted animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : data?.items && data.items.length > 0 ? (
                data.items.map((key) => (
                  <KeyRow
                    key={key.id}
                    accessKey={{
                      ...key,
                      lastTrafficAt: liveMetricsById.get(key.id)?.lastTrafficAt ?? (key.lastTrafficAt ? new Date(key.lastTrafficAt) : null),
                      recentTrafficDeltaBytes: liveMetricsById.get(key.id)?.recentTrafficDeltaBytes ?? BigInt(0),
                    }}
                    onDelete={() => handleDelete(key.id, key.name)}
                    onRenew={() => handleOpenRenew(key)}
                    onSendRenewalReminder={() => handleSendRenewalReminder(key)}
                    canSendRenewalReminder={canSendRenewalReminderForKey(key) && !sendRenewalReminderMutation.isPending}
                    onEnableTelegramDelivery={() => handleEnableTelegramDelivery(key)}
                    onCopyTelegramConnectLink={() => handleCopyTelegramConnectLink(key)}
                    isTelegramDeliveryMutationPending={
                      bulkEnableTelegramDeliveryMutation.isPending || generateTelegramConnectLinkMutation.isPending
                    }
                    onShowQR={() => setQrDialogKey({ id: key.id, name: key.name })}
                    onToggleStatus={() => handleToggleStatus(key.id)}
                    isSelected={selectedKeys.has(key.id)}
                    onSelect={() => handleSelectKey(key.id)}
                    isTogglingStatus={togglingKeyId === key.id}
                    isOnline={checkIsOnline(key.id, key.status)}
                    sparklineData={sparklineMap?.[key.id]}
                    onCopyAccessUrl={() => {
                      if (key.accessUrl) {
                        copyToClipboard(key.accessUrl, t('keys.toast.copied'), t('keys.toast.copy_access_url'));
                      } else {
                        toast({ title: t('keys.toast.error'), description: t('keys.toast.no_access_url'), variant: 'destructive' });
                      }
                    }}
                    onCopySubscriptionUrl={() => {
                      if (key.subscriptionToken) {
                        const url = getKeySubscriptionPageUrl(key.subscriptionToken, (key as any).publicSlug);
                        copyToClipboard(url, t('keys.toast.copied'), t('keys.toast.copy_subscription_url'));
                      } else {
                        toast({ title: t('keys.toast.error'), description: t('keys.toast.no_subscription_url'), variant: 'destructive' });
                      }
                    }}
                    onEdit={() => setEditingKey(key)}
                    onTagClick={applyTagFilter}
                    showRenewalSignals={showRenewalOpsFilters}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-10">
                    <div className="ops-chart-empty">
                      <Key className="mb-3 h-10 w-10 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        {hasAnyFilters
                          ? t('keys.empty.no_match')
                          : t('keys.empty.no_keys')}
                      </p>
                      {!hasAnyFilters && (
                        <Button
                          className="mt-4 rounded-full"
                          onClick={() => setCreateDialogOpen(true)}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          {t('keys.empty.create_first')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {renderPagination('desktop')}
      </Card>

      {/* Dialogs */}
      <CreateKeyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={(newKey) => {
          setCreatedKey(newKey);
          refetch();
          refetchStats();
        }}
      />

      <BulkCreateDialog
        open={bulkCreateDialogOpen}
        onOpenChange={setBulkCreateDialogOpen}
        onSuccess={() => {
          refetch();
          refetchStats();
        }}
      />

      <CreatedKeySummaryDialog
        createdKey={createdKey}
        open={!!createdKey}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedKey(null);
          }
        }}
      />

      {qrDialogKey && (
        <QRCodeDialog
          keyId={qrDialogKey.id}
          keyName={qrDialogKey.name}
          open={!!qrDialogKey}
          onOpenChange={(open) => !open && setQrDialogKey(null)}
        />
      )}

      {keyToDelete && (
        <DeleteKeyDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          keyName={keyToDelete.name}
          onConfirm={confirmDelete}
          isPending={deleteMutation.isPending}
        />
      )}

      <RenewKeyDialog
        open={!!renewingKey}
        onOpenChange={(open) => !open && setRenewingKey(null)}
        keyData={renewingKey}
        presets={renewalPresets}
        isPending={renewMutation.isPending}
        onConfirm={({ months, addDataLimitGB }) => {
          if (!renewingKey) {
            return;
          }

          renewMutation.mutate({
            id: renewingKey.id,
            months,
            addDataLimitGB,
          });
        }}
      />

      <BulkRenewDialog
        open={bulkRenewDialogOpen}
        onOpenChange={setBulkRenewDialogOpen}
        count={selectedKeys.size}
        presets={renewalPresets}
        onConfirm={handleBulkRenew}
        isPending={bulkRenewMutation.isPending}
      />

      <BulkTagsDialog
        open={bulkTagsDialogOpen}
        onOpenChange={setBulkTagsDialogOpen}
        count={selectedKeys.size}
        mode={bulkTagsMode}
        onConfirm={handleBulkTags}
        isPending={bulkAddTagsMutation.isPending || bulkRemoveTagsMutation.isPending}
      />

      <BulkRenewalOutreachResultDialog
        open={bulkRenewalOutreachResultDialogOpen}
        onOpenChange={setBulkRenewalOutreachResultDialogOpen}
        count={selectedKeys.size}
        onConfirm={handleMarkRenewalOutreachResult}
        isPending={markRenewalOutreachResultMutation.isPending}
      />

      <BulkProgressDialog
        open={bulkProgressDialogOpen}
        onOpenChange={setBulkProgressDialogOpen}
        title={bulkProgressTitle}
        results={bulkProgressResults}
        isPending={isBulkBusy}
      />

      {/* Bulk Move Dialog */}
      <Dialog open={bulkMoveDialogOpen} onOpenChange={setBulkMoveDialogOpen}>
        <DialogContent className="max-w-lg overflow-hidden p-0">
          <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
            <DialogTitle>{t('keys.bulk.move_title')}</DialogTitle>
            <DialogDescription>
              {fillTemplate(t('keys.bulk.move_desc'), {
                count: selectedKeys.size,
                items: getSelectedLabel(selectedKeys.size),
              })}
              {' '}
              {t('keys.bulk.move_desc_extra')}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{locale === 'my' ? 'ဦးတည်ဆာဗာ' : 'Target server'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {locale === 'my'
                    ? 'ရွေးထားသော key များအတွက် ဦးတည်မည့် ဆာဗာအသစ်ကို ရွေးပါ။ ထိန်းသိမ်းရေးဆာဗာများကို ပိတ်ထားစဉ် explicit draining move များကိုတော့ ခွင့်ပြုထားမည်။'
                    : 'Pick the new destination for the selected keys. This keeps maintenance targets blocked while still allowing explicit draining moves.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="space-y-3">
                <Label>{t('keys.bulk.move_target_server')}</Label>
                <Select value={bulkMoveTargetServerId} onValueChange={setBulkMoveTargetServerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('keys.bulk.move_target_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(servers ?? []).map((s: { id: string; name: string; location?: string | null; lifecycleMode?: string | null; isActive?: boolean }) => (
                      <SelectItem key={s.id} value={s.id} disabled={s.lifecycleMode === 'MAINTENANCE' || s.isActive === false}>
                        <div className="flex items-center gap-2">
                          <span>{s.name}{s.location ? ` (${s.location})` : ''}</span>
                          <ServerLifecycleBadge mode={s.lifecycleMode} />
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="ops-modal-note text-xs">
                  <p className="font-medium text-foreground">Assignment policy</p>
                  <p className="mt-1">
                    Maintenance targets are blocked. Draining targets are still allowed because bulk move is an explicit admin action.
                  </p>
                </div>

                {selectedBulkMoveServer?.lifecycleMode === 'DRAINING' ? (
                  <div className="ops-modal-note ops-modal-note-danger text-xs">
                    <p className="font-medium text-foreground">Manual draining target selected</p>
                    <p className="mt-1">
                      {selectedBulkMoveServer.name} is draining. Auto-placement avoids it, but this explicit bulk move will still assign keys there.
                    </p>
                  </div>
                ) : null}
              </div>
            </DialogSection>
          </DialogBody>
          <DialogFooter className="ops-modal-sticky-footer">
            <Button variant="outline" onClick={() => setBulkMoveDialogOpen(false)}>{t('keys.cancel')}</Button>
            <Button onClick={handleBulkMove} disabled={!bulkMoveTargetServerId}>
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              {fillTemplate(t('keys.bulk.move_confirm'), {
                count: selectedKeys.size,
                items: getItemLabel(selectedKeys.size),
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingKey && (
        <EditKeyDialog
          open={!!editingKey}
          onOpenChange={(open) => !open && setEditingKey(null)}
          keyData={editingKey}
          onSuccess={() => {
            refetch();
            setEditingKey(null);
          }}
        />
      )}
    </div>
  );
}
