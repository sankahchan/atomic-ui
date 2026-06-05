'use client';

/**
 * Access Key Detail Page
 * 
 * This page provides a comprehensive view of a single access key, including
 * its configuration, usage statistics, QR code for sharing, and management
 * controls. It's the primary interface for administrators to inspect and
 * modify individual keys.
 * 
 * The page displays:
 * - Key metadata (name, email, notes)
 * - Server association and access URL
 * - Traffic usage with visual progress
 * - Expiration status and type
 * - QR code for easy client configuration
 * - Action buttons for common operations
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
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
import {
  DetailHero,
  DetailHeroAside,
  DetailHeroGrid,
  DetailKpiTile,
  DetailMetricGrid,
  DetailMiniTile,
  DetailMiniTileGrid,
  DetailNoteBlock,
} from '@/components/ui/detail-workspace';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import { buildDownloadFilename, downloadDataUrl, downloadTextFile } from '@/lib/download';
import { QRCodeWithLogo } from '@/components/qr-code-with-logo';
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import {
  buildAccessDistributionLinkUrl,
  buildSharePageUrl,
  buildShortClientUrl,
  buildShortShareUrl,
  buildSubscriptionApiUrl,
  buildSubscriptionClientUrl,
  getPublicBasePath,
} from '@/lib/subscription-links';
import { normalizePublicSlug } from '@/lib/public-slug';
import { getQuotaAlertState } from '@/lib/access-key-policies';
import {
  formatAuditAddedData,
  formatAuditBytes,
  formatAuditDateTimeValue,
  formatAuditMonths,
  formatAuditTransition,
  isRenewalAuditAction,
} from '@/lib/audit-log-format';
import {
  ArrowLeft,
  Key,
  Copy,
  QrCode,
  Edit,
  Trash2,
  Server,
  Activity,
  Clock,
  Calendar,
  Mail,
  MessageSquare,
  FileText,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Link2,
  Download,
  Share2,
  Eye,
  Palette,
  ExternalLink,
  Smartphone,
  Wifi,
  WifiOff,
  Plus,
  X,
  Image as ImageIcon,
  Phone,
  Globe,
  RotateCw,
  Shield,
} from 'lucide-react';
import { themeList, getTheme } from '@/lib/subscription-themes';
import { TrafficHistoryChart } from '@/components/charts/TrafficHistoryChart';
import { useLocale } from '@/hooks/use-locale';
import { ClientEndpointTestCard } from '@/components/subscription/client-endpoint-test-card';
import { RenewKeyDialog } from '@/components/keys/renew-key-dialog';
import { ServerLifecycleBadge, getServerLifecycleMeta } from '@/components/servers/server-lifecycle-badge';
import {
  TelegramBillingHistoryCard,
} from '@/components/telegram/telegram-billing-history-card';
import { TELEGRAM_SUPPORT_REPLY_MACROS } from '@/lib/telegram-presets';

const ACCESS_KEY_SOFT_DEVICE_LIMIT_HINT =
  'Counts managed-install and app activity as an estimate. The share page can block extra installs, but a copied raw ss:// secret can still be reused. Use a dynamic key for stronger anti-sharing.';

const ACCESS_KEY_PROTECTED_INSTALL_HINT =
  'Hide the raw reusable ss:// secret on the official share page and client-link flow. This reduces casual sharing there, but it cannot hard-block a raw ss:// secret copied from an approved device.';

const ACCESS_KEY_RAW_COPY_WARNING =
  'Copying or exporting the raw access URL weakens device-limit protection because Outline will accept that ss:// secret on any device.';

/**
 * Status badge configuration
 * Provides consistent styling for different key statuses
 */
const statusConfig = {
  ACTIVE: {
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: CheckCircle2,
    label: 'Active'
  },
  DISABLED: {
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: XCircle,
    label: 'Disabled'
  },
  EXPIRED: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: Clock,
    label: 'Expired'
  },
  DEPLETED: {
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: AlertTriangle,
    label: 'Depleted'
  },
  PENDING: {
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: Clock,
    label: 'Pending (Start on First Use)'
  },
};

const TRAFFIC_ACTIVE_WINDOW_MS = 60 * 1000;

/**
 * EditKeyDialog Component
 * 
 * A dialog for editing key properties such as name, data limit, and contact
 * information. Changes are synced to the Outline server when applicable.
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
    autoDisableOnLimit: boolean;
    autoDisableOnExpire: boolean;
    autoArchiveAfterDays: number;
    quotaAlertThresholds: string | null;
    maxDevices: number | null;
    boundDeviceInstallsOnly: boolean | null;
    autoRenewPolicy: string | null;
    autoRenewDurationDays: number | null;
  };
  onSuccess: () => void;
}) {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
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
    autoDisableOnLimit: keyData.autoDisableOnLimit ?? true,
    autoDisableOnExpire: keyData.autoDisableOnExpire ?? true,
    autoArchiveAfterDays: String(keyData.autoArchiveAfterDays ?? 0),
    quotaAlertThresholds: keyData.quotaAlertThresholds || '80,90',
    maxDevices: keyData.maxDevices?.toString() || '',
    boundDeviceInstallsOnly: keyData.boundDeviceInstallsOnly ?? Boolean(keyData.maxDevices),
    autoRenewPolicy: (keyData.autoRenewPolicy as 'NONE' | 'EXTEND_DURATION') || 'NONE',
    autoRenewDurationDays: keyData.autoRenewDurationDays?.toString() || '',
  });

  const updateMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: isMyanmar ? 'သော့ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Key updated',
        description: isMyanmar ? 'အသုံးပြုခွင့်သော့ကို အောင်မြင်စွာ အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The access key has been updated successfully.',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'အပ်ဒိတ် မအောင်မြင်ပါ' : 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: isMyanmar ? 'အချက်အလက် မမှန်ကန်ပါ' : 'Validation error',
        description: isMyanmar ? 'သော့အမည်ကို ထည့်ပါ။' : 'Please enter a key name.',
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
      autoDisableOnLimit: formData.autoDisableOnLimit,
      autoDisableOnExpire: formData.autoDisableOnExpire,
      autoArchiveAfterDays: Number.parseInt(formData.autoArchiveAfterDays || '0', 10) || 0,
      quotaAlertThresholds: formData.quotaAlertThresholds,
      maxDevices: formData.maxDevices ? Number.parseInt(formData.maxDevices, 10) : null,
      boundDeviceInstallsOnly: formData.maxDevices ? formData.boundDeviceInstallsOnly : false,
      autoRenewPolicy: formData.autoRenewPolicy,
      autoRenewDurationDays:
        formData.autoRenewPolicy === 'EXTEND_DURATION' && formData.autoRenewDurationDays
          ? Number.parseInt(formData.autoRenewDurationDays, 10)
          : undefined,
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto p-0 sm:max-w-[min(760px,calc(100vw-2rem))]">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{isMyanmar ? 'အသုံးပြုခွင့်သော့ကို ပြင်ဆင်မည်' : 'Edit Access Key'}</DialogTitle>
          <DialogDescription>
            {isMyanmar ? 'သော့၏ သတ်မှတ်ချက်များကို ပြင်ဆင်ပါ။ အမည်ပြောင်းလဲမှုကို Outline ထံ တစ်ပြိုင်နက် ချိန်ညှိမည်။' : 'Update the key configuration. Name changes will sync to Outline.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'အခြေခံ အချက်အလက်' : 'Identity'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar ? 'အက်မင် panel၊ CRM နှင့် မျှဝေမှု flow များတစ်လျှောက် ပြသမည့် သော့အချက်အလက်များကို ပြင်ဆင်ပါ။' : 'Update the visible key details used across the admin panel, CRM, and share flows.'}
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="editName">{isMyanmar ? 'အမည်' : 'Name'}</Label>
                  <Input
                    id="editName"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editEmail">{isMyanmar ? 'အီးမေးလ်' : 'Email'}</Label>
                  <Input
                    id="editEmail"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editTelegram">{isMyanmar ? 'Telegram အိုင်ဒီ' : 'Telegram ID'}</Label>
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
                <DialogSectionTitle>{isMyanmar ? 'ကန့်သတ်ချက်နှင့် သက်တမ်း' : 'Quota and lifecycle'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar ? 'ဤစာမျက်နှာကို မထွက်ဘဲ အသုံးပြုမှုကန့်သတ်ချက်၊ သက်တမ်းကုန်စည်းမျဉ်းနှင့် စက်ထိန်းချုပ်မှုများကို သတ်မှတ်ပါ။' : 'Set usage limits, expiration rules, and device controls without leaving the detail page.'}
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="editDataLimit">{isMyanmar ? 'ဒေတာ ကန့်သတ်ချက် (GB)' : 'Data limit (GB)'}</Label>
                  <Input
                    id="editDataLimit"
                    type="number"
                    placeholder={isMyanmar ? 'အကန့်အသတ်မရှိလိုပါက ဗလာထားပါ' : 'Leave empty for unlimited'}
                    value={formData.dataLimitGB}
                    onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
                    min="0"
                    step="0.5"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editMaxDevices">{isMyanmar ? 'ခန့်မှန်း စက်ကန့်သတ်ချက်' : 'Soft device limit (estimated)'}</Label>
                  <Input
                    id="editMaxDevices"
                    type="number"
                    min="1"
                    max="20"
                    placeholder={isMyanmar ? 'စက်ကန့်သတ်ချက် မရှိစေလိုပါက ဗလာထားပါ' : 'Leave empty for no device limit'}
                    value={formData.maxDevices}
                    onChange={(e) => setFormData({ ...formData, maxDevices: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {ACCESS_KEY_SOFT_DEVICE_LIMIT_HINT}
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/55 px-4 py-3 sm:col-span-2 dark:bg-white/[0.03]">
                  <div className="space-y-0.5">
                    <Label htmlFor="editBoundDeviceInstallsOnly" className="text-sm font-medium">
                      {isMyanmar ? 'တရားဝင် ထည့်သွင်းစာမျက်နှာများတွင် မူရင်းဆက်တင်ကို ဖျောက်မည်' : 'Hide raw config on official install screens'}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {ACCESS_KEY_PROTECTED_INSTALL_HINT}
                    </p>
                  </div>
                  <Switch
                    id="editBoundDeviceInstallsOnly"
                    checked={formData.boundDeviceInstallsOnly}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, boundDeviceInstallsOnly: checked })
                    }
                    disabled={!formData.maxDevices}
                  />
                </div>

                {formData.dataLimitGB && (
                  <>
                    <div className="space-y-2">
                      <Label>{isMyanmar ? 'ပြန်လည်စတင်နည်း' : 'Reset strategy'}</Label>
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
                          <SelectItem value="NEVER">{isMyanmar ? 'မပြန်လည်စတင်ပါ' : 'Never reset'}</SelectItem>
                          <SelectItem value="DAILY">{isMyanmar ? 'နေ့စဉ် (၂၄ နာရီတိုင်း)' : 'Daily (every 24h)'}</SelectItem>
                          <SelectItem value="WEEKLY">{isMyanmar ? 'အပတ်စဉ် (၇ ရက်တိုင်း)' : 'Weekly (every 7 days)'}</SelectItem>
                          <SelectItem value="MONTHLY">{isMyanmar ? 'လစဉ် (၃၀ ရက်တိုင်း)' : 'Monthly (every 30 days)'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="editQuotaThresholds">{isMyanmar ? 'ကန့်သတ်ချက် အသိပေးချက် သတ်မှတ်ချက်များ (%)' : 'Quota alert thresholds (%)'}</Label>
                      <Input
                        id="editQuotaThresholds"
                        placeholder="80,90"
                        value={formData.quotaAlertThresholds}
                        onChange={(e) => setFormData({ ...formData, quotaAlertThresholds: e.target.value })}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/55 px-4 py-3 sm:col-span-2 dark:bg-white/[0.03]">
                      <div className="space-y-0.5">
                        <Label htmlFor="autoDisable" className="text-sm font-medium">{isMyanmar ? 'ကန့်သတ်ချက်ရောက်လျှင် အလိုအလျောက် ပိတ်မည်' : 'Auto-disable on limit'}</Label>
                        <p className="text-xs text-muted-foreground">
                          {isMyanmar ? 'ကန့်သတ်ချက် ပြည့်သွားသည်နှင့် သော့ကို အလိုအလျောက် ပိတ်ပါမည်။ အဆင့်သတ်မှတ်ချက် အသိပေးချက်များကိုတော့ ကိုယ်တိုင်သာ ပို့ပါမည်။' : 'Automatically disable the key when its quota is fully consumed. Threshold alerts stay manual.'}
                        </p>
                      </div>
                      <Switch
                        id="autoDisable"
                        checked={formData.autoDisableOnLimit}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, autoDisableOnLimit: checked })
                        }
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="editDuration">{isMyanmar ? 'သက်တမ်း (ရက်)' : 'Duration (days)'}</Label>
                  <Input
                    id="editDuration"
                    type="number"
                    placeholder={isMyanmar ? 'ဥပမာ 30၊ 45၊ 60' : 'e.g., 30, 45, 60'}
                    value={formData.durationDays}
                    onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'ဤနေရာတွင် သတ်မှတ်ထားသော ရက်အရေအတွက်အတိုင်း သက်တမ်းကုန်မည့်ရက်ကို ပြန်တွက်မည်။' : 'Recalculates the expiration date from the duration you set here.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editExpiration">{isMyanmar ? 'သက်တမ်းကုန်မည့်ရက်' : 'Expiration date'}</Label>
                  <Input
                    id="editExpiration"
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'ရိုးရိုးသက်တမ်းမသုံးသော သော့များအတွက် သတ်မှတ်ရက်ကို တိုက်ရိုက်ရွေးနိုင်သည်။' : 'Or set a fixed date directly if the key does not use a simple duration.'}
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/55 px-4 py-3 sm:col-span-2 dark:bg-white/[0.03]">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoDisableOnExpire" className="text-sm font-medium">{isMyanmar ? 'သက်တမ်းကုန်လျှင် အလိုအလျောက် ပိတ်မည်' : 'Auto-disable on expiry'}</Label>
                    <p className="text-xs text-muted-foreground">
                      {isMyanmar ? 'သက်တမ်းကုန်သွားလျှင် Outline မှ သော့ကို အလိုအလျောက် ဖယ်ရှားပါမည်။' : 'Remove the key from Outline automatically after it expires.'}
                    </p>
                  </div>
                  <Switch
                    id="autoDisableOnExpire"
                    checked={formData.autoDisableOnExpire}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, autoDisableOnExpire: checked })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="autoArchiveAfterDays">{isMyanmar ? 'အလိုအလျောက် မှတ်တမ်းသို့ ရွှေ့မည့် ကြာချိန် (ရက်)' : 'Auto-archive after (days)'}</Label>
                  <Input
                    id="autoArchiveAfterDays"
                    type="number"
                    min="0"
                    value={formData.autoArchiveAfterDays}
                    onChange={(e) => setFormData({ ...formData, autoArchiveAfterDays: e.target.value })}
                  />
                </div>
              </div>
            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'သက်တမ်းတိုးခြင်းနှင့် မှတ်စုများ' : 'Renewal and notes'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar ? 'ဤသော့ကို အလိုအလျောက် သက်တမ်းတိုးနိုင်မလားနှင့် အတွင်းသုံး မှတ်စုကို သိမ်းထားမလားကို စီမံပါ။' : 'Control whether this key can auto-extend and keep an internal note for support or operations.'}
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{isMyanmar ? 'အလိုအလျောက် သက်တမ်းတိုး မူဝါဒ' : 'Auto-renew policy'}</Label>
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
                      <SelectItem value="NONE">{isMyanmar ? 'အလိုအလျောက် မတိုးပါ' : 'Do not auto-renew'}</SelectItem>
                      <SelectItem value="EXTEND_DURATION">{isMyanmar ? 'သတ်မှတ်ထားသော ရက်အတိုင်း တိုးမည်' : 'Extend by fixed duration'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.autoRenewPolicy === 'EXTEND_DURATION' ? (
                  <div className="space-y-2">
                    <Label htmlFor="autoRenewDurationDays">{isMyanmar ? 'အလိုအလျောက် သက်တမ်းတိုးမည့် ရက်' : 'Auto-renew duration (days)'}</Label>
                    <Input
                      id="autoRenewDurationDays"
                      type="number"
                      min="1"
                      value={formData.autoRenewDurationDays}
                      onChange={(e) => setFormData({ ...formData, autoRenewDurationDays: e.target.value })}
                    />
                  </div>
                ) : null}

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="editNotes">{isMyanmar ? 'မှတ်စု' : 'Notes'}</Label>
                  <Input
                    id="editNotes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>
            </DialogSection>
          </DialogBody>

          <DialogFooter className="ops-modal-sticky-footer">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isMyanmar ? 'အပြောင်းအလဲများကို သိမ်းမည်' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
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
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{isMyanmar ? 'အသုံးပြုခွင့်သော့ကို ဖျက်မည်' : 'Delete Access Key'}</DialogTitle>
          <DialogDescription>
            {isMyanmar ? `“${keyName}” ကို ဖျက်မည်မှာ သေချာပါသလား။` : `Are you sure you want to delete "${keyName}"?`}
            <br />
            {isMyanmar ? 'ဤလုပ်ဆောင်ချက်ကို နောက်ပြန်မလှည့်နိုင်ပါ။ သော့ကို ဆာဗာမှ အပြီးတိုင် ဖယ်ရှားပါမည်။' : 'This action cannot be undone. The key will be permanently removed from the server.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <DialogSection>
            <div className="ops-modal-note-danger">
              {isMyanmar ? 'ဤလုပ်ဆောင်ချက်သည် သော့ကို Atomic-UI နှင့် Outline မှ အပြီးတိုင် ဖယ်ရှားမည်ဖြစ်သည်။ လက်ရှိ ကလိုင်းယင့်များသည် ချက်ချင်း ချိတ်ဆက်မရတော့ပါ။' : 'This permanently removes the key from Atomic-UI and Outline. Existing clients will stop connecting immediately.'}
            </div>
          </DialogSection>
        </DialogBody>
        <DialogFooter className="ops-modal-sticky-footer">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isMyanmar ? 'ဖျက်မည်' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Contact type options for subscription page
const CONTACT_TYPES = [
  { value: 'telegram', label: 'Telegram', icon: '📱' },
  { value: 'discord', label: 'Discord', icon: '🎮' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'phone', label: 'Phone', icon: '📞' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'website', label: 'Website', icon: '🌐' },
  { value: 'facebook', label: 'Facebook', icon: '👤' },
] as const;

interface ContactLink {
  type: typeof CONTACT_TYPES[number]['value'];
  value: string;
}

/**
 * SubscriptionShareCard Component
 *
 * Card for sharing the subscription page with theme selection, cover image, and contact links.
 */
function SubscriptionShareCard({
  keyId,
  subscriptionToken,
  publicSlug,
  slugHistory,
  keyName,
  currentTheme,
  currentCoverImage,
  currentCoverImageType,
  currentContactLinks,
  currentWelcomeMessage,
  currentSharePageEnabled,
  currentClientLinkEnabled,
  currentTelegramDeliveryEnabled,
  onThemeChange,
}: {
  keyId: string;
  subscriptionToken: string | null;
  publicSlug: string | null;
  slugHistory: Array<{ id: string; slug: string; createdAt: Date | string }>;
  keyName: string;
  currentTheme: string | null;
  currentCoverImage: string | null;
  currentCoverImageType: string | null;
  currentContactLinks: ContactLink[] | null;
  currentWelcomeMessage: string | null;
  currentSharePageEnabled: boolean;
  currentClientLinkEnabled: boolean;
  currentTelegramDeliveryEnabled: boolean;
  onThemeChange: () => void;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const shareUi = {
    title: isMyanmar ? 'မျှဝေရန် စာမျက်နှာ' : 'Share Page',
    description: isMyanmar ? 'အသုံးပြုသူထံသို့ လှပသော စာရင်းသွင်းမှု စာမျက်နှာကို မျှဝေပါ' : 'Share a beautiful subscription page with your user',
    theme: isMyanmar ? 'စာမျက်နှာ အပြင်အဆင်' : 'Page Theme',
    selectTheme: isMyanmar ? 'အပြင်အဆင်ကို ရွေးပါ' : 'Select theme',
    shortSlug: isMyanmar ? 'အတိုလင့်ခ် အမည်' : 'Short Link Slug',
    slugPlaceholder: isMyanmar ? 'my-access-key' : 'my-access-key',
    slugHelp: isMyanmar ? 'အတို မျှဝေစာမျက်နှာ URL နှင့် Outline ကလိုင်းယင့် ချိတ်ဆက်လင့်ခ်အတွက် အသုံးပြုသည်။' : 'Used for the short share page and short Outline client URL.',
    save: isMyanmar ? 'သိမ်းမည်' : 'Save',
    regenerateShortSlug: isMyanmar ? 'အတိုလင့်ခ် အမည်ကို ပြန်ဖန်တီးမည်' : 'Regenerate short slug',
    backgroundImage: isMyanmar ? 'နောက်ခံပုံ (ရွေးချယ်နိုင်သည်)' : 'Background Image (Optional)',
    backgroundImageHelp: isMyanmar ? 'ပုံထည့်ပါက အပြည့်အစုံ နောက်ခံပုံစံအဖြစ် အသုံးပြုမည်။ အပြင်အဆင် အရောင်ကို အစားထိုးနိုင်သည်။' : 'Use image as full-page background theme. Overrides color theme when set.',
    contactLinks: isMyanmar ? 'ဆက်သွယ်ရန် လင့်ခ်များ' : 'Contact Links',
    contactPlaceholder: isMyanmar ? 'လင့်ခ် သို့မဟုတ် ID ကို ထည့်ပါ' : 'Enter link or ID',
    welcomeOverride: isMyanmar ? 'ကြိုဆိုစာ အစားထိုးသတ်မှတ်ချက်' : 'Welcome Message Override',
    welcomePlaceholder: isMyanmar ? 'ဤသော့၏ မျှဝေစာမျက်နှာ အပေါ်ဘက်တွင် ပြသမည့် စာသား။ မဖြည့်ပါက မူလစာကို အသုံးပြုမည်။' : "Shown near the top of this key's share page. Leave empty to use the global message.",
    welcomeHelp: isMyanmar ? 'ဤသော့အတွက်သာ မူလ စာရင်းသွင်းမှု စာမျက်နှာ ကြိုဆိုစာကို အစားထိုးမည်။' : 'This overrides the global subscription page welcome message for this key only.',
    preview: isMyanmar ? 'အကြိုကြည့်မည်' : 'Preview',
    previewImage: isMyanmar ? 'ပုံနောက်ခံကို ဖွင့်ထားသည်' : 'Image Background',
    previewColorOnly: isMyanmar ? 'အရောင်အပြင်အဆင်သာ' : 'Color theme only',
    previewCustomWelcome: isMyanmar ? 'ကိုယ်ပိုင်ကြိုဆိုစာကို အသုံးပြုနေသည်' : 'Custom welcome message enabled',
    previewGlobalWelcome: isMyanmar ? 'မူလကြိုဆိုစာကို အသုံးပြုနေသည်' : 'Using global welcome message',
    previewContacts: isMyanmar ? 'ဆက်သွယ်ရန် အမြန်ခလုတ်များ' : 'Contact shortcuts',
    previewAddToOutline: isMyanmar ? 'Outline ထဲသို့ ထည့်မည်' : 'Add to Outline',
    copyLink: isMyanmar ? 'လင့်ခ်ကို ကူးယူမည်' : 'Copy Link',
    copyClientUrl: isMyanmar ? 'ကလိုင်းယင့် ချိတ်ဆက်လင့်ခ်ကို ကူးယူမည်' : 'Copy Client URL',
    connectTelegram: isMyanmar ? 'တယ်လီဂရမ်နှင့် ချိတ်ဆက်မည်' : 'Connect Telegram',
    sendTelegram: isMyanmar ? 'တယ်လီဂရမ်ဖြင့် ပို့မည်' : 'Send via Telegram',
    regenerateLink: isMyanmar ? 'လင့်ခ်ကို ပြန်ဖန်တီးမည်' : 'Regenerate Link',
    sharePageUrl: isMyanmar ? 'မျှဝေစာမျက်နှာ URL' : 'Share Page URL',
    clientUrl: isMyanmar ? 'ကလိုင်းယင့် ချိတ်ဆက်လင့်ခ်' : 'Client URL',
    pageViews: isMyanmar ? 'စာမျက်နှာကြည့်ရှုမှု' : 'Page Views',
    inviteOpens: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် ဖွင့်မှု' : 'Invite Opens',
    copyClicks: isMyanmar ? 'ကူးယူခံရသော အကြိမ်ရေ' : 'Copy Clicks',
    qrDownloads: isMyanmar ? 'QR ဒေါင်းလုဒ်များ' : 'QR Downloads',
    configDownloads: isMyanmar ? 'ဆက်တင်ဖိုင် ဒေါင်းလုဒ်များ' : 'Config Downloads',
    clientFetches: isMyanmar ? 'ကလိုင်းယင့် ခေါ်ယူမှုများ' : 'Client Fetches',
    telegramSends: isMyanmar ? 'တယ်လီဂရမ် ပေးပို့မှုများ' : 'Telegram Sends',
    lastViewed: isMyanmar ? 'နောက်ဆုံး ကြည့်ရှုချိန်' : 'Last Viewed',
    never: isMyanmar ? 'မရှိသေးပါ' : 'Never',
    copied: isMyanmar ? 'ကူးယူပြီးပါပြီ!' : 'Copied!',
    copiedShareUrl: isMyanmar ? 'စာရင်းသွင်းမှု စာမျက်နှာ URL ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Subscription page URL copied to clipboard.',
    copiedClientUrl: isMyanmar ? 'ကလိုင်းယင့် ချိတ်ဆက်လင့်ခ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Client URL copied to clipboard.',
    copiedConnectLink: isMyanmar ? 'တယ်လီဂရမ် ချိတ်ဆက်လင့်ခ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Telegram connect link copied to clipboard.',
    copiedNewShareUrl: isMyanmar ? 'မျှဝေစာမျက်နှာ လင့်ခ်အသစ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'New share page link copied to clipboard.',
    copiedNewShortLink: isMyanmar ? 'အတို မျှဝေလင့်ခ်အသစ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'New short share link copied to clipboard.',
    updatedTitle: isMyanmar ? 'အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Updated',
    updateFailed: isMyanmar ? 'အပ်ဒိတ် မအောင်မြင်ပါ' : 'Update failed',
    themeUpdated: isMyanmar ? 'စာရင်းသွင်းမှု စာမျက်နှာ အပြင်အဆင်ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The subscription page theme has been updated.',
    shortLinkUpdated: isMyanmar ? 'အတို မျှဝေလင့်ခ်ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The short share link has been updated.',
    coverUpdated: isMyanmar ? 'နောက်ခံပုံကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The cover image has been updated.',
    contactsUpdated: isMyanmar ? 'ဆက်သွယ်ရန် လင့်ခ်များကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Contact links have been updated.',
    welcomeUpdatedTitle: isMyanmar ? 'ကြိုဆိုစာကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Welcome message updated',
    welcomeUpdatedDesc: isMyanmar ? 'မျှဝေစာမျက်နှာ ကြိုဆိုစာကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The share page welcome message has been updated.',
    shareRegeneratedTitle: isMyanmar ? 'မျှဝေလင့်ခ်ကို ပြန်ဖန်တီးပြီးပါပြီ' : 'Share link regenerated',
    shareRegeneratedDesc: isMyanmar ? 'အဟောင်း မျှဝေလင့်ခ်သည် မအသုံးပြုနိုင်တော့ပါ။' : 'The old shared link is no longer valid.',
    shortRegeneratedTitle: isMyanmar ? 'အတိုလင့်ခ်ကို ပြန်ဖန်တီးပြီးပါပြီ' : 'Short link regenerated',
    shortRegeneratedDesc: isMyanmar ? 'အတို မျှဝေလင့်ခ်အသစ်ကို အသုံးပြုနိုင်ပါပြီ။' : 'The new short share link is ready to use.',
    slugRegenerationFailed: isMyanmar ? 'အမည်တို ပြန်ဖန်တီးမှု မအောင်မြင်ပါ' : 'Slug regeneration failed',
    shareSentTitle: isMyanmar ? 'မျှဝေစာမျက်နှာကို ပို့ပြီးပါပြီ' : 'Share page sent',
    shareSentDesc: isMyanmar ? 'နောက်ဆုံး မျှဝေစာမျက်နှာကို တယ်လီဂရမ်မှတစ်ဆင့် ပို့ပြီးပါပြီ။' : 'The latest share page was sent through Telegram.',
    telegramFailed: isMyanmar ? 'တယ်လီဂရမ် ပို့မှု မအောင်မြင်ပါ' : 'Telegram send failed',
    connectFailed: isMyanmar ? 'ချိတ်ဆက်လင့်ခ် ဖန်တီးမှု မအောင်မြင်ပါ' : 'Connect link failed',
    errorTitle: isMyanmar ? 'အမှား' : 'Error',
    contactRequired: isMyanmar ? 'ဆက်သွယ်ရန် တန်ဖိုးတစ်ခု ထည့်ပါ။' : 'Please enter a contact value.',
    limitReached: isMyanmar ? 'အများဆုံး အရေအတွက် ပြည့်သွားပါပြီ' : 'Limit reached',
    limitDesc: isMyanmar ? 'ဆက်သွယ်ရန် ၃ ခုအထိသာ ထည့်နိုင်ပါသည်။' : 'Maximum 3 contacts allowed.',
    missingSlug: isMyanmar ? 'အတိုလင့်ခ် အမည် မပြည့်စုံပါ' : 'Missing slug',
    missingSlugDesc: isMyanmar ? 'သိမ်းမီ အနည်းဆုံး တရားဝင် စာလုံး ၃ လုံး ထည့်ပါ။' : 'Enter at least 3 valid characters before saving.',
    generatingNewToken: isMyanmar ? 'စာရင်းသွင်းမှု တိုကင်အသစ်ကို ဖန်တီးနေသည်...' : 'Generating new subscription token...',
    generatingToken: isMyanmar ? 'စာရင်းသွင်းမှု တိုကင်ကို ဖန်တီးနေသည်...' : 'Generating subscription token...',
    slugStatus: isMyanmar ? 'အတိုလင့်ခ် အခြေအနေ' : 'Short link status',
    slugChecking: isMyanmar ? 'စစ်ဆေးနေသည်...' : 'Checking availability...',
    slugAvailable: isMyanmar ? 'အသုံးပြုနိုင်ပါသည်' : 'Available',
    slugUnavailable: isMyanmar ? 'မရနိုင်ပါ' : 'Unavailable',
    slugSuggestions: isMyanmar ? 'အကြံပြု အတိုလင့်ခ် အမည်များ' : 'Suggested slugs',
    slugHistory: isMyanmar ? 'အဟောင်း အတိုလင့်ခ်များ' : 'Slug history',
    slugHistoryHelp: isMyanmar ? 'အောက်ပါ အတိုလင့်ခ်အဟောင်းများသည် လက်ရှိ လင့်ခ်သို့ ပြန်ညွှန်မည်။' : 'Older short links below will redirect to the current link.',
    deliveryUpdated: isMyanmar ? 'အများသုံး အသုံးပြုခွင့် ထိန်းချုပ်မှုများကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Public access controls have been updated.',
    sharePageToggle: isMyanmar ? 'မျှဝေစာမျက်နှာ' : 'Share page',
    sharePageToggleHelp: isMyanmar ? 'အများသုံး စာမျက်နှာကို ဖွင့်/ပိတ် လုပ်ပါ။' : 'Public page availability.',
    clientLinkToggle: isMyanmar ? 'ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်' : 'Client URL',
    clientLinkToggleHelp: isMyanmar ? 'ကလိုင်းယင့် ထည့်သွင်းမှုနှင့် ခေါ်ယူမှုကို ဖွင့်/ပိတ် လုပ်ပါ။' : 'Allow app imports and client fetches.',
    telegramToggle: isMyanmar ? 'တယ်လီဂရမ် ပေးပို့မှု' : 'Telegram delivery',
    telegramToggleHelp: isMyanmar ? 'တယ်လီဂရမ် ပို့ခြင်းနှင့် ချိတ်ဆက်လင့်ခ် ဖန်တီးမှုကို ဖွင့်/ပိတ် လုပ်ပါ။' : 'Allow Telegram delivery and link generation.',
    shareDisabled: isMyanmar ? 'မျှဝေစာမျက်နှာကို ပိတ်ထားသည်' : 'Share page disabled',
    clientDisabled: isMyanmar ? 'ကလိုင်းယင့် ချိတ်ဆက်လင့်ခ်ကို ပိတ်ထားသည်' : 'Client URL disabled',
  };
  const getContactTypeLabel = (type: ContactLink['type']) =>
    locale === 'my'
      ? ({
          telegram: 'တယ်လီဂရမ်',
          discord: 'ဒစ်စကော့ဒ်',
          whatsapp: 'ဝတ်စ်အက်ပ်',
          phone: 'ဖုန်း',
          email: 'အီးမေးလ်',
          website: 'ဝဘ်ဆိုက်',
          facebook: 'ဖေ့စ်ဘွတ်ခ်',
        } as const)[type]
      : CONTACT_TYPES.find((item) => item.value === type)?.label || type;
  const [selectedTheme, setSelectedTheme] = useState(currentTheme || 'dark');
  const [coverImageUrl, setCoverImageUrl] = useState(
    currentCoverImageType === 'url' ? currentCoverImage || '' : ''
  );
  const [slugInput, setSlugInput] = useState(publicSlug || '');
  const [contacts, setContacts] = useState<ContactLink[]>(currentContactLinks || []);
  const [welcomeMessage, setWelcomeMessage] = useState(currentWelcomeMessage || '');
  const [sharePageEnabled, setSharePageEnabled] = useState(currentSharePageEnabled);
  const [clientLinkEnabled, setClientLinkEnabled] = useState(currentClientLinkEnabled);
  const [telegramDeliveryEnabled, setTelegramDeliveryEnabled] = useState(currentTelegramDeliveryEnabled);
  const [newContactType, setNewContactType] = useState<string>('telegram');
  const [newContactValue, setNewContactValue] = useState('');
  const normalizedSlugInput = normalizePublicSlug(slugInput);
  const slugAvailabilityQuery = trpc.keys.checkPublicSlugAvailability.useQuery(
    {
      slug: normalizedSlugInput,
      excludeId: keyId,
    },
    {
      enabled: normalizedSlugInput.length >= 3,
      retry: false,
      staleTime: 5_000,
    },
  );

  const updateThemeMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.updatedTitle,
        description: shareUi.themeUpdated,
      });
      onThemeChange();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const updateSlugMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.updatedTitle,
        description: shareUi.shortLinkUpdated,
      });
      onThemeChange();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateCoverMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.updatedTitle,
        description: shareUi.coverUpdated,
      });
      onThemeChange();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateContactsMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.updatedTitle,
        description: shareUi.contactsUpdated,
      });
      onThemeChange();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateWelcomeMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.welcomeUpdatedTitle,
        description: shareUi.welcomeUpdatedDesc,
      });
      onThemeChange();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const updateDeliveryMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.updatedTitle,
        description: shareUi.deliveryUpdated,
      });
      onThemeChange();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const regenerateTokenMutation = trpc.keys.regenerateSubscriptionToken.useMutation({
    onSuccess: (result) => {
      toast({
        title: shareUi.shareRegeneratedTitle,
        description: shareUi.shareRegeneratedDesc,
      });
      onThemeChange();
      void copyToClipboard(result.sharePageUrl, shareUi.copied, shareUi.copiedNewShareUrl);
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const regenerateSlugMutation = trpc.keys.regeneratePublicSlug.useMutation({
    onSuccess: (result) => {
      setSlugInput(result.publicSlug || '');
      toast({
        title: shareUi.shortRegeneratedTitle,
        description: shareUi.shortRegeneratedDesc,
      });
      onThemeChange();
      void copyToClipboard(result.sharePageUrl, shareUi.copied, shareUi.copiedNewShortLink);
    },
    onError: (error) => {
      toast({
        title: shareUi.slugRegenerationFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const sendSharePageMutation = trpc.keys.sendSharePageViaTelegram.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.shareSentTitle,
        description: shareUi.shareSentDesc,
      });
    },
    onError: (error) => {
      toast({
        title: shareUi.telegramFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const connectLinkMutation = trpc.keys.generateTelegramConnectLink.useMutation({
    onSuccess: async (result) => {
      await copyToClipboard(result.url, shareUi.copied, shareUi.copiedConnectLink);
    },
    onError: (error) => {
      toast({
        title: shareUi.connectFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const analyticsQuery = trpc.keys.getSharePageAnalytics.useQuery(
    { id: keyId },
    {
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  );

  const handleThemeChange = (value: string) => {
    setSelectedTheme(value);
    updateThemeMutation.mutate({
      id: keyId,
      subscriptionTheme: value,
    } as any);
  };

  const handleCoverImageSave = () => {
    if (coverImageUrl.trim()) {
      updateCoverMutation.mutate({
        id: keyId,
        coverImage: coverImageUrl.trim(),
        coverImageType: 'url',
      } as any);
    } else {
      // Clear cover image
      updateCoverMutation.mutate({
        id: keyId,
        coverImage: null,
        coverImageType: null,
      } as any);
    }
  };

  const handleAddContact = () => {
    if (!newContactValue.trim()) {
      toast({
        title: shareUi.errorTitle,
        description: shareUi.contactRequired,
        variant: 'destructive',
      });
      return;
    }
    if (contacts.length >= 3) {
      toast({
        title: shareUi.limitReached,
        description: shareUi.limitDesc,
        variant: 'destructive',
      });
      return;
    }
    const newContacts = [...contacts, { type: newContactType as ContactLink['type'], value: newContactValue.trim() }];
    setContacts(newContacts);
    setNewContactValue('');
    updateContactsMutation.mutate({
      id: keyId,
      contactLinks: JSON.stringify(newContacts),
    } as any);
  };

  const handleRemoveContact = (index: number) => {
    const newContacts = contacts.filter((_, i) => i !== index);
    setContacts(newContacts);
    updateContactsMutation.mutate({
      id: keyId,
      contactLinks: newContacts.length > 0 ? JSON.stringify(newContacts) : null,
    } as any);
  };

  const handleWelcomeMessageSave = () => {
    updateWelcomeMutation.mutate({
      id: keyId,
      subscriptionWelcomeMessage: welcomeMessage.trim() || null,
    } as any);
  };

  const getSubscriptionPageUrl = () => {
    if (typeof window === 'undefined') return '';
    if (slugInput.trim()) {
      return buildShortShareUrl(slugInput.trim(), { origin: window.location.origin, lang: locale });
    }
    if (!subscriptionToken) return '';
    return buildSharePageUrl(subscriptionToken, { origin: window.location.origin, lang: locale });
  };

  const getClientUrl = () => {
    if (typeof window === 'undefined') return '';
    if (slugInput.trim()) {
      return buildSubscriptionClientUrl(slugInput.trim(), keyName, {
        origin: window.location.origin,
        shortPath: true,
      });
    }
    if (!subscriptionToken) return '';
    return buildSubscriptionClientUrl(subscriptionToken, keyName, {
      origin: window.location.origin,
    });
  };

  const copySubscriptionPageUrl = async () => {
    const url = getSubscriptionPageUrl();
    await copyToClipboard(url, shareUi.copied, shareUi.copiedShareUrl);
  };

  const copyClientUrl = async () => {
    const url = getClientUrl();
    await copyToClipboard(url, shareUi.copied, shareUi.copiedClientUrl);
  };

  const shareActionButtonClassName =
    'h-auto min-w-0 justify-start whitespace-normal px-4 py-3 text-left text-sm leading-5';

  const saveSlug = () => {
    const normalizedSlug = normalizedSlugInput;
    if (!normalizedSlug || normalizedSlug.length < 3) {
      toast({
        title: shareUi.missingSlug,
        description: shareUi.missingSlugDesc,
        variant: 'destructive',
      });
      return;
    }

    if (
      slugAvailabilityQuery.data &&
      (!slugAvailabilityQuery.data.valid || !slugAvailabilityQuery.data.available)
    ) {
      toast({
        title: shareUi.slugUnavailable,
        description: slugAvailabilityQuery.data.message,
        variant: 'destructive',
      });
      return;
    }

    setSlugInput(normalizedSlug);
    updateSlugMutation.mutate({
      id: keyId,
      publicSlug: normalizedSlug,
    } as any);
  };

  const theme = getTheme(selectedTheme);

  const handleToggleUpdate = (
    field: 'sharePageEnabled' | 'clientLinkEnabled' | 'telegramDeliveryEnabled',
    checked: boolean,
  ) => {
    if (field === 'sharePageEnabled') {
      setSharePageEnabled(checked);
    } else if (field === 'clientLinkEnabled') {
      setClientLinkEnabled(checked);
    } else {
      setTelegramDeliveryEnabled(checked);
    }

    updateDeliveryMutation.mutate({
      id: keyId,
      [field]: checked,
    } as any);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-primary" />
          {shareUi.title}
        </CardTitle>
        <CardDescription>
          {shareUi.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="min-w-0 rounded-xl border border-border/60 bg-muted/20 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-medium">{shareUi.sharePageToggle}</span>
                <span className="block text-xs leading-5 text-muted-foreground">{shareUi.sharePageToggleHelp}</span>
              </span>
              <Switch
                checked={sharePageEnabled}
                onCheckedChange={(checked) => handleToggleUpdate('sharePageEnabled', checked)}
              />
            </div>
          </label>
          <label className="min-w-0 rounded-xl border border-border/60 bg-muted/20 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-medium">{shareUi.clientLinkToggle}</span>
                <span className="block text-xs leading-5 text-muted-foreground">{shareUi.clientLinkToggleHelp}</span>
              </span>
              <Switch
                checked={clientLinkEnabled}
                onCheckedChange={(checked) => handleToggleUpdate('clientLinkEnabled', checked)}
              />
            </div>
          </label>
          <label className="min-w-0 rounded-xl border border-border/60 bg-muted/20 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-medium">{shareUi.telegramToggle}</span>
                <span className="block text-xs leading-5 text-muted-foreground">{shareUi.telegramToggleHelp}</span>
              </span>
              <Switch
                checked={telegramDeliveryEnabled}
                onCheckedChange={(checked) => handleToggleUpdate('telegramDeliveryEnabled', checked)}
              />
            </div>
          </label>
        </div>

        {/* Theme Selector */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <Palette className="w-4 h-4" />
            {shareUi.theme}
          </Label>
          <Select value={selectedTheme} onValueChange={handleThemeChange}>
            <SelectTrigger>
              <SelectValue placeholder={shareUi.selectTheme} />
            </SelectTrigger>
            <SelectContent>
              {themeList.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border"
                      style={{ backgroundColor: t.bgPrimary, borderColor: t.accent }}
                    />
                    {t.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            {shareUi.shortSlug}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder={shareUi.slugPlaceholder}
              value={slugInput}
              onChange={(e) => setSlugInput(normalizePublicSlug(e.target.value))}
            />
            <div className="flex gap-2 sm:shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={saveSlug}
                disabled={
                  updateSlugMutation.isPending ||
                  normalizedSlugInput.length < 3 ||
                  (slugAvailabilityQuery.isSuccess &&
                    (!slugAvailabilityQuery.data.valid || !slugAvailabilityQuery.data.available))
                }
              >
                {updateSlugMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : shareUi.save}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => regenerateSlugMutation.mutate({ id: keyId })}
                disabled={regenerateSlugMutation.isPending}
                title={shareUi.regenerateShortSlug}
              >
                {regenerateSlugMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {shareUi.slugHelp}
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{shareUi.slugStatus}:</span>
              {normalizedSlugInput.length < 3 ? (
                <span className="text-muted-foreground">{shareUi.missingSlugDesc}</span>
              ) : slugAvailabilityQuery.isFetching ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {shareUi.slugChecking}
                </span>
              ) : slugAvailabilityQuery.data?.available ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {slugAvailabilityQuery.data.message || shareUi.slugAvailable}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <XCircle className="h-3.5 w-3.5" />
                  {slugAvailabilityQuery.data?.message || shareUi.slugUnavailable}
                </span>
              )}
            </div>
            {slugAvailabilityQuery.data?.suggestions?.length ? (
              <div className="mt-3 space-y-2">
                <p className="font-medium text-foreground">{shareUi.slugSuggestions}</p>
                <div className="flex flex-wrap gap-2">
                  {slugAvailabilityQuery.data.suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => setSlugInput(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {slugHistory.length > 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
              <p className="font-medium text-foreground">{shareUi.slugHistory}</p>
              <p className="mt-1 text-muted-foreground">{shareUi.slugHistoryHelp}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {slugHistory.map((entry) => (
                  <Badge key={entry.id} variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                    {entry.slug}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Background Image URL */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            {shareUi.backgroundImage}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="https://example.com/image.jpg"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              className="sm:shrink-0"
              onClick={handleCoverImageSave}
              disabled={updateCoverMutation.isPending}
            >
              {updateCoverMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                shareUi.save
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {shareUi.backgroundImageHelp}
          </p>
        </div>

        {/* Contact Links */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <Phone className="w-4 h-4" />
            {shareUi.contactLinks} ({contacts.length}/3)
          </Label>

          {/* Existing contacts */}
          {contacts.length > 0 && (
            <div className="space-y-2">
              {contacts.map((contact, index) => {
                const contactType = CONTACT_TYPES.find(t => t.value === contact.type);
                return (
                  <div key={index} className="flex min-w-0 items-center gap-2 rounded bg-muted p-2">
                    <span>{contactType?.icon}</span>
                    <span className="text-sm font-medium">{contactType ? getContactTypeLabel(contact.type) : contact.type}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{contact.value}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleRemoveContact(index)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new contact */}
          {contacts.length < 3 && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={newContactType} onValueChange={setNewContactType}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <span className="flex items-center gap-2">
                        <span>{type.icon}</span>
                        {getContactTypeLabel(type.value)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={shareUi.contactPlaceholder}
                value={newContactValue}
                onChange={(e) => setNewContactValue(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                className="sm:shrink-0"
                onClick={handleAddContact}
                disabled={updateContactsMutation.isPending}
              >
                {updateContactsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            {shareUi.welcomeOverride}
          </Label>
          <Textarea
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            placeholder={shareUi.welcomePlaceholder}
            className="min-h-[96px]"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {shareUi.welcomeHelp}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleWelcomeMessageSave}
              disabled={updateWelcomeMutation.isPending}
            >
              {updateWelcomeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                shareUi.save
              )}
            </Button>
          </div>
        </div>

        {/* Theme Preview */}
        <div
          className="rounded-lg p-4 border transition-colors relative overflow-hidden"
          style={{
            backgroundColor: coverImageUrl ? 'transparent' : theme.bgPrimary,
            borderColor: theme.border,
          }}
        >
          {/* Background image preview */}
          {coverImageUrl && (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${coverImageUrl})` }}
              />
              <div className="absolute inset-0 bg-black/60" />
            </>
          )}
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                style={{
                  backgroundColor: coverImageUrl ? 'rgba(0,0,0,0.4)' : theme.bgCard,
                  backdropFilter: coverImageUrl ? 'blur(8px)' : undefined,
                }}
              >
                📊
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: coverImageUrl ? '#ffffff' : theme.textPrimary }}>
                  {shareUi.preview}
                </div>
                <div className="text-xs" style={{ color: coverImageUrl ? 'rgba(255,255,255,0.7)' : theme.textMuted }}>
                  {coverImageUrl ? shareUi.previewImage : `${theme.name} Theme`}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <div
                className="flex-1 h-2 rounded-full"
                style={{ backgroundColor: coverImageUrl ? 'rgba(255,255,255,0.3)' : theme.progressBg }}
              >
                <div
                  className="h-full rounded-full w-2/3"
                  style={{ backgroundColor: coverImageUrl ? '#ffffff' : theme.progressFill }}
                />
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs" style={{ color: coverImageUrl ? 'rgba(255,255,255,0.76)' : theme.textMuted }}>
              <p>{shareUi.previewContacts}: {contacts.length}</p>
              <p>{coverImageUrl ? shareUi.previewImage : shareUi.previewColorOnly}</p>
              <p>{welcomeMessage.trim() ? shareUi.previewCustomWelcome : shareUi.previewGlobalWelcome}</p>
            </div>
            <div
              className="mt-3 py-2 px-3 rounded-lg text-center text-xs font-medium"
              style={{
                background: `linear-gradient(135deg, ${theme.buttonGradientFrom}, ${theme.buttonGradientTo})`,
                color: '#fff',
              }}
            >
              {shareUi.previewAddToOutline}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Button
            variant="outline"
            className={cn('w-full', shareActionButtonClassName)}
            disabled={!sharePageEnabled || (!subscriptionToken && !slugInput.trim())}
            onClick={() => {
              const url = getSubscriptionPageUrl();
              if (url) window.open(url, '_blank');
            }}
          >
            <Eye className="w-4 h-4 mr-2" />
            {shareUi.preview}
          </Button>
          <Button
            className={cn('w-full', shareActionButtonClassName)}
            onClick={copySubscriptionPageUrl}
            disabled={!sharePageEnabled || (!subscriptionToken && !slugInput.trim())}
          >
            <Copy className="w-4 h-4 mr-2" />
            {shareUi.copyLink}
          </Button>
          <Button
            variant="outline"
            className={cn('w-full', shareActionButtonClassName)}
            onClick={copyClientUrl}
            disabled={!clientLinkEnabled || (!subscriptionToken && !slugInput.trim())}
          >
            <Link2 className="w-4 h-4 mr-2" />
            {shareUi.copyClientUrl}
          </Button>
          <Button
            variant="outline"
            className={cn('w-full', shareActionButtonClassName)}
            onClick={() => connectLinkMutation.mutate({ id: keyId })}
            disabled={!telegramDeliveryEnabled || connectLinkMutation.isPending}
          >
            {connectLinkMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4 mr-2" />
            )}
            {shareUi.connectTelegram}
          </Button>
          <Button
            className={cn('w-full', shareActionButtonClassName)}
            onClick={() => sendSharePageMutation.mutate({ id: keyId, reason: 'RESENT' })}
            disabled={!telegramDeliveryEnabled || sendSharePageMutation.isPending}
          >
            {sendSharePageMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <MessageSquare className="w-4 h-4 mr-2" />
            )}
            {shareUi.sendTelegram}
          </Button>
          <Button
            variant="outline"
            className={cn('w-full md:col-span-2', shareActionButtonClassName)}
            onClick={() => regenerateTokenMutation.mutate({ id: keyId })}
            disabled={!sharePageEnabled || regenerateTokenMutation.isPending}
          >
            {regenerateTokenMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {shareUi.regenerateLink}
          </Button>
        </div>

        {/* URL Display */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground break-all p-2 bg-muted rounded">
            <p className="mb-1 font-medium text-foreground">{shareUi.sharePageUrl}</p>
            {sharePageEnabled
              ? subscriptionToken || slugInput.trim()
              ? getSubscriptionPageUrl()
              : regenerateTokenMutation.isPending
                ? shareUi.generatingNewToken
                : shareUi.generatingToken
              : shareUi.shareDisabled}
          </div>
          <div className="text-xs text-muted-foreground break-all p-2 bg-muted rounded">
            <p className="mb-1 font-medium text-foreground">{shareUi.clientUrl}</p>
            {clientLinkEnabled
              ? subscriptionToken || slugInput.trim()
              ? getClientUrl()
              : `${shareUi.clientUrl}...`
              : shareUi.clientDisabled}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.pageViews}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.pageViews ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.inviteOpens}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.inviteOpens ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.copyClicks}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.copyClicks ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.qrDownloads}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.qrDownloads ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.configDownloads}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.configDownloads ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.clientFetches}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.clientFetches ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.telegramSends}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.telegramSends ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.lastViewed}</p>
            <p className="mt-2 text-sm font-medium">
              {analyticsQuery.data?.lastViewedAt ? formatRelativeTime(analyticsQuery.data.lastViewedAt) : shareUi.never}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccessDistributionSecurityCard({
  keyId,
  keyName,
  hasPassword,
  accessExpiresAt,
  distributionLinks,
  auditTrail,
  onUpdated,
}: {
  keyId: string;
  keyName: string;
  hasPassword: boolean;
  accessExpiresAt: string | Date | null;
  distributionLinks: Array<{
    id: string;
    token: string;
    label?: string | null;
    note?: string | null;
    expiresAt: string | Date;
    maxUses?: number | null;
    currentUses: number;
    createdAt: string | Date;
    lastOpenedAt?: string | Date | null;
    lastOpenedIp?: string | null;
  }>;
  auditTrail: Array<{
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    ip?: string | null;
    createdAt: string | Date;
  }>;
  onUpdated: () => void;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const ui = {
    title: isMyanmar ? 'မျှဝေစာမျက်နှာ လုံခြုံရေးနှင့် ဖိတ်ခေါ်လင့်ခ်များ' : 'Share Protection & Invite Links',
    description: isMyanmar ? 'အများသုံး မျှဝေစာမျက်နှာကို စကားဝှက်၊ သက်တမ်းကုန်ချိန်နှင့် ဖိတ်ခေါ်လင့်ခ်များဖြင့် ထိန်းချုပ်ပါ။' : 'Protect the public share page with a password, expiry, and one-time invite links.',
    protection: isMyanmar ? 'မျှဝေစာမျက်နှာ လုံခြုံရေး' : 'Share page protection',
    protectionDesc: isMyanmar ? 'လိုအပ်လျှင် စကားဝှက်တပ်ပြီး မျှဝေစာမျက်နှာ အသုံးပြုခွင့် သက်တမ်းကုန်ချိန်တစ်ခု သတ်မှတ်နိုင်သည်။' : 'Add an optional password and access expiry for the public share page.',
    password: isMyanmar ? 'မျှဝေစာမျက်နှာ စကားဝှက်' : 'Share page password',
    passwordPlaceholder: isMyanmar ? 'အသစ်တစ်ခု သတ်မှတ်ရန် စကားဝှက် ထည့်ပါ' : 'Enter a password to protect the page',
    expiresAt: isMyanmar ? 'အများသုံး အသုံးပြုခွင့် သက်တမ်းကုန်ချိန်' : 'Public access expiry',
    saveProtection: isMyanmar ? 'လုံခြုံရေး သိမ်းမည်' : 'Save Protection',
    clearPassword: isMyanmar ? 'စကားဝှက် ဖျက်မည်' : 'Clear Password',
    protectedOn: isMyanmar ? 'စကားဝှက် ကာကွယ်မှု ဖွင့်ထားသည်' : 'Password protection enabled',
    protectedOff: isMyanmar ? 'လက်ရှိ စကားဝှက် မသတ်မှတ်ထားပါ' : 'No password currently set',
    inviteTitle: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ်များ' : 'Invite links',
    inviteDesc: isMyanmar ? 'သတ်မှတ်အသုံးပြုခွင့်ရှိသော ဖိတ်ခေါ်လင့်ခ်များကို ဖန်တီးပြီး ကူးယူခြင်း သို့မဟုတ် ရုပ်သိမ်းခြင်း ပြုလုပ်နိုင်သည်။' : 'Create limited invite links that can be copied or revoked anytime.',
    label: isMyanmar ? 'အမည်' : 'Label',
    labelPlaceholder: isMyanmar ? 'ဥပမာ - Reseller batch' : 'For example: Reseller batch',
    note: isMyanmar ? 'မှတ်ချက်' : 'Note',
    notePlaceholder: isMyanmar ? 'လိုအပ်ပါက အသေးစိတ် မှတ်ချက် ထည့်ပါ' : 'Optional internal note',
    inviteExpiry: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် သက်တမ်းကုန်ချိန်' : 'Invite expiry',
    maxUses: isMyanmar ? 'အများဆုံး အသုံးပြုခွင့်' : 'Max uses',
    unlimited: isMyanmar ? 'အကန့်အသတ်မရှိ' : 'Unlimited',
    createInvite: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် ဖန်တီးမည်' : 'Create Invite',
    copyInvite: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် ကူးယူမည်' : 'Copy Invite',
    openInvite: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် ဖွင့်မည်' : 'Open Invite',
    revokeInvite: isMyanmar ? 'ရုပ်သိမ်းမည်' : 'Revoke',
    noInvites: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် မရှိသေးပါ' : 'No invite links yet',
    inviteUses: isMyanmar ? 'အသုံးပြုပြီး' : 'Uses',
    lastOpened: isMyanmar ? 'နောက်ဆုံးဖွင့်ထားချိန်' : 'Last opened',
    never: isMyanmar ? 'မရှိသေးပါ' : 'Never',
    copySuccess: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Invite link copied to clipboard.',
    protectionSaved: isMyanmar ? 'မျှဝေစာမျက်နှာ လုံခြုံရေးကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Share page protection has been updated.',
    passwordCleared: isMyanmar ? 'မျှဝေစာမျက်နှာ စကားဝှက်ကို ဖျက်ပြီးပါပြီ။' : 'Share page password has been cleared.',
    inviteCreated: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် အသစ် ဖန်တီးပြီးပါပြီ။' : 'New invite link created.',
    inviteRevoked: isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ်ကို ရုပ်သိမ်းပြီးပါပြီ။' : 'Invite link revoked.',
    actionFailed: isMyanmar ? 'လုပ်ဆောင်မှု မအောင်မြင်ပါ' : 'Action failed',
    auditTitle: isMyanmar ? 'စစ်ဆေးမှတ်တမ်း' : 'Audit trail',
    auditDesc: isMyanmar ? 'ဤသော့အတွက် သက်တမ်းတိုးခြင်း၊ မျှဝေခြင်း၊ လုံခြုံရေးနှင့် အကူအညီ လုပ်ဆောင်ချက်များ၏ လတ်တလော မှတ်တမ်း' : 'Recent renewal, share, protection, and support actions for this key.',
    noAudit: isMyanmar ? 'စစ်ဆေးမှတ်တမ်း မရှိသေးပါ' : 'No audit entries yet',
    renewed: isMyanmar ? 'Key သက်တမ်းတိုးခဲ့သည်' : 'Renewed key',
    bulkRenewed: isMyanmar ? 'Key ကို အစုလိုက် သက်တမ်းတိုးမှုမှ တိုးခဲ့သည်' : 'Renewed in bulk batch',
    renewalExtension: isMyanmar ? 'တိုးထားသောကာလ' : 'Extension',
    renewalDataAdded: isMyanmar ? 'ထည့်ထားသော data' : 'Data added',
    renewalExpiry: isMyanmar ? 'သက်တမ်းကုန်ချိန်' : 'Expiry',
    renewalQuota: isMyanmar ? 'Quota' : 'Quota',
    renewalStatus: isMyanmar ? 'အခြေအနေ' : 'Status',
    renewalBatch: isMyanmar ? 'အစုလိုက် အရေအတွက်' : 'Batch',
    noDataAdded: isMyanmar ? 'Data မထည့်ထားပါ' : 'No data added',
    unknown: isMyanmar ? 'မသိရှိပါ' : 'Unknown',
  };

  const toDateTimeLocalValue = (value?: string | Date | null) => {
    if (!value) return '';
    const date = new Date(value);
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return adjusted.toISOString().slice(0, 16);
  };

  const [passwordInput, setPasswordInput] = useState('');
  const [hasPasswordProtection, setHasPasswordProtection] = useState(hasPassword);
  const [accessExpiryInput, setAccessExpiryInput] = useState(toDateTimeLocalValue(accessExpiresAt));
  const [linkLabel, setLinkLabel] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const [linkExpiresAt, setLinkExpiresAt] = useState(toDateTimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
  const [linkMaxUses, setLinkMaxUses] = useState('');

  useEffect(() => {
    setHasPasswordProtection(hasPassword);
    setAccessExpiryInput(toDateTimeLocalValue(accessExpiresAt));
  }, [accessExpiresAt, hasPassword]);

  const updateProtectionMutation = trpc.keys.updateShareProtection.useMutation({
    onSuccess: (result) => {
      setHasPasswordProtection(result.hasPassword);
      setPasswordInput('');
      toast({
        title: ui.protection,
        description: result.hasPassword ? ui.protectionSaved : ui.passwordCleared,
      });
      onUpdated();
    },
    onError: (error) => {
      toast({
        title: ui.actionFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createInviteMutation = trpc.keys.createDistributionLink.useMutation({
    onSuccess: async (result) => {
      setLinkLabel('');
      setLinkNote('');
      setLinkMaxUses('');
      setLinkExpiresAt(toDateTimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
      toast({
        title: ui.inviteTitle,
        description: ui.inviteCreated,
      });
      onUpdated();
      await copyToClipboard(result.url, 'Copied!', ui.copySuccess);
    },
    onError: (error) => {
      toast({
        title: ui.actionFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const revokeInviteMutation = trpc.keys.revokeDistributionLink.useMutation({
    onSuccess: () => {
      toast({
        title: ui.inviteTitle,
        description: ui.inviteRevoked,
      });
      onUpdated();
    },
    onError: (error) => {
      toast({
        title: ui.actionFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSaveProtection = () => {
    const payload: Record<string, unknown> = {
      id: keyId,
      accessExpiresAt: accessExpiryInput ? new Date(accessExpiryInput) : null,
    };

    if (passwordInput.trim()) {
      payload.password = passwordInput.trim();
    } else if (!hasPasswordProtection) {
      payload.password = '';
    }

    updateProtectionMutation.mutate(payload as any);
  };

  const handleClearPassword = () => {
    updateProtectionMutation.mutate({
      id: keyId,
      clearPassword: true,
      accessExpiresAt: accessExpiryInput ? new Date(accessExpiryInput) : null,
    });
  };

  const handleCreateInvite = () => {
    if (!linkExpiresAt) {
      toast({
        title: ui.actionFailed,
        description: ui.inviteExpiry,
        variant: 'destructive',
      });
      return;
    }

    createInviteMutation.mutate({
      id: keyId,
      label: linkLabel.trim() || null,
      note: linkNote.trim() || null,
      expiresAt: new Date(linkExpiresAt),
      maxUses: linkMaxUses.trim() ? Number(linkMaxUses) : null,
      lang: locale,
    });
  };

  const formatAuditAction = (action: string) => {
    switch (action) {
      case 'ACCESS_KEY_RENEWED':
        return ui.renewed;
      case 'ACCESS_KEY_RENEWED_BULK':
        return ui.bulkRenewed;
      case 'ACCESS_KEY_SHARE_PROTECTION_UPDATED':
        return isMyanmar ? 'မျှဝေကာကွယ်မှုကို အပ်ဒိတ်လုပ်ခဲ့သည်' : 'Updated share protection';
      case 'ACCESS_KEY_DISTRIBUTION_LINK_CREATED':
        return isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ် ဖန်တီးခဲ့သည်' : 'Created invite link';
      case 'ACCESS_KEY_DISTRIBUTION_LINK_REVOKED':
        return isMyanmar ? 'ဖိတ်ခေါ်လင့်ခ်ကို ပြန်ရုပ်သိမ်းခဲ့သည်' : 'Revoked invite link';
      case 'ACCESS_KEY_SHARE_TOKEN_REGENERATED':
        return isMyanmar ? 'မျှဝေတိုကင်ကို ပြန်ဖန်တီးခဲ့သည်' : 'Regenerated share token';
      case 'ACCESS_KEY_PUBLIC_SLUG_REGENERATED':
        return isMyanmar ? 'အတိုအမည် ပြန်ဖန်တီးခဲ့သည်' : 'Regenerated short slug';
      case 'ACCESS_KEY_ACCESS_RESENT':
      case 'TELEGRAM_SHARE_SENT':
        return isMyanmar ? 'အသုံးပြုခွင့်လင့်ခ်ကို ထပ်ပို့ခဲ့သည်' : 'Resent access';
      case 'ACCESS_KEY_RENEWAL_REMINDER_SENT':
      case 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED':
        return isMyanmar ? 'သက်တမ်းတိုး သတိပေးချက် ပို့ခဲ့သည်' : 'Sent renewal reminder';
      case 'ACCESS_KEY_SUPPORT_MESSAGE_SENT':
      case 'ACCESS_KEY_SUPPORT_MESSAGE_TRIGGERED':
        return isMyanmar ? 'အကူအညီ မက်ဆေ့ချ် ပို့ခဲ့သည်' : 'Sent support message';
      case 'ACCESS_KEY_PROBLEM_REPORTED':
        return isMyanmar ? 'ပြဿနာတင်ပြခဲ့သည်' : 'Reported a problem';
      default:
        return action.replaceAll('_', ' ').toLowerCase();
    }
  };

  const getInviteUrl = (token: string) =>
    buildAccessDistributionLinkUrl(token, {
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      lang: locale,
    });

  const formatStatus = (value: unknown) => (
    typeof value === 'string' && value.trim()
      ? value.replaceAll('_', ' ').toLowerCase()
      : ui.unknown
  );

  const formatAuditDetails = (details: Record<string, unknown> | null, action?: string) => {
    if (!details) {
      return [];
    }

    if (action && isRenewalAuditAction(action)) {
      const renewalLines = [
        `${ui.renewalExtension}: ${formatAuditMonths(details.months, ui.unknown)}`,
        `${ui.renewalDataAdded}: ${formatAuditAddedData(details.addedDataLimitGB, ui.noDataAdded)}`,
        `${ui.renewalExpiry}: ${formatAuditTransition(
          details.previousExpiresAt,
          details.nextExpiresAt,
          (value) => formatAuditDateTimeValue(value, ui.unknown),
        )}`,
        `${ui.renewalQuota}: ${formatAuditTransition(
          details.previousDataLimitBytes,
          details.nextDataLimitBytes,
          (value) => formatAuditBytes(value, ui.unlimited),
        )}`,
        `${ui.renewalStatus}: ${formatAuditTransition(
          details.previousStatus,
          details.nextStatus,
          formatStatus,
        )}`,
      ];

      if (action === 'ACCESS_KEY_RENEWED_BULK' && details.batchSize) {
        renewalLines.push(`${ui.renewalBatch}: ${String(details.batchSize)}`);
      }

      return renewalLines;
    }

    const preferredOrder = [
      'reason',
      'summary',
      'message',
      'destinationChatId',
      'sharePageUrl',
      'clientUrl',
      'source',
      'lang',
    ];

    return Object.entries(details)
      .sort(([left], [right]) => {
        const leftIndex = preferredOrder.indexOf(left);
        const rightIndex = preferredOrder.indexOf(right);
        return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
          - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
      })
      .slice(0, 4)
      .map(([key, value]) => {
        const label = key
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/_/g, ' ')
          .replace(/^./, (char) => char.toUpperCase());
        return `${label}: ${String(value)}`;
      });
  };

  return (
    <Card className="ops-detail-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          {ui.title}
        </CardTitle>
        <CardDescription>{ui.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-[1.5rem] border border-border/60 bg-background/45 p-4 dark:bg-white/[0.03]">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{ui.protection}</h3>
            <p className="text-sm text-muted-foreground">{ui.protectionDesc}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>{ui.password}</Label>
              <Input
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder={ui.passwordPlaceholder}
              />
              <p className="text-xs text-muted-foreground">
                {hasPasswordProtection ? ui.protectedOn : ui.protectedOff}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{ui.expiresAt}</Label>
              <Input
                type="datetime-local"
                value={accessExpiryInput}
                onChange={(event) => setAccessExpiryInput(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveProtection} disabled={updateProtectionMutation.isPending}>
              {updateProtectionMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Shield className="mr-2 h-4 w-4" />
              )}
              {ui.saveProtection}
            </Button>
            <Button
              variant="outline"
              onClick={handleClearPassword}
              disabled={!hasPasswordProtection || updateProtectionMutation.isPending}
            >
              {ui.clearPassword}
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-[1.5rem] border border-border/60 bg-background/45 p-4 dark:bg-white/[0.03]">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{ui.inviteTitle}</h3>
            <p className="text-sm text-muted-foreground">{ui.inviteDesc}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>{ui.label}</Label>
              <Input
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder={ui.labelPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label>{ui.maxUses}</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={linkMaxUses}
                onChange={(event) => setLinkMaxUses(event.target.value)}
                placeholder={ui.unlimited}
              />
            </div>
            <div className="space-y-2">
              <Label>{ui.inviteExpiry}</Label>
              <Input
                type="datetime-local"
                value={linkExpiresAt}
                onChange={(event) => setLinkExpiresAt(event.target.value)}
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>{ui.note}</Label>
              <Textarea
                value={linkNote}
                onChange={(event) => setLinkNote(event.target.value)}
                placeholder={ui.notePlaceholder}
                className="min-h-[88px]"
              />
            </div>
          </div>

          <Button onClick={handleCreateInvite} disabled={createInviteMutation.isPending}>
            {createInviteMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {ui.createInvite}
          </Button>

          <div className="space-y-3">
            {distributionLinks.length === 0 ? (
              <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                {ui.noInvites}
              </div>
            ) : (
              distributionLinks.map((link) => {
                const inviteUrl = getInviteUrl(link.token);
                const usageLabel = link.maxUses ? `${link.currentUses}/${link.maxUses}` : `${link.currentUses}/${ui.unlimited}`;

                return (
                  <div key={link.id} className="rounded-[1.25rem] border border-border/60 bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{link.label || keyName}</p>
                          <Badge variant="outline" className="rounded-full">
                            {ui.inviteUses}: {usageLabel}
                          </Badge>
                        </div>
                        {link.note ? (
                          <p className="text-sm text-muted-foreground">{link.note}</p>
                        ) : null}
                        <div className="rounded-lg border border-border/50 bg-background/70 p-3 text-xs break-all text-muted-foreground dark:bg-white/[0.03]">
                          {inviteUrl}
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>{ui.inviteExpiry}: {formatDateTime(link.expiresAt)}</span>
                          <span>{ui.lastOpened}: {link.lastOpenedAt ? formatRelativeTime(link.lastOpenedAt) : ui.never}</span>
                          {link.lastOpenedIp ? <span>IP: {link.lastOpenedIp}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
                        <Button variant="outline" size="sm" className="h-auto justify-start whitespace-normal px-4 py-2 text-left" onClick={() => void copyToClipboard(inviteUrl, 'Copied!', ui.copySuccess)}>
                          <Copy className="mr-2 h-4 w-4" />
                          {ui.copyInvite}
                        </Button>
                        <Button variant="outline" size="sm" className="h-auto justify-start whitespace-normal px-4 py-2 text-left" onClick={() => window.open(inviteUrl, '_blank')}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {ui.openInvite}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-auto justify-start whitespace-normal px-4 py-2 text-left"
                          onClick={() => revokeInviteMutation.mutate({ id: keyId, linkId: link.id })}
                          disabled={revokeInviteMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {ui.revokeInvite}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-[1.5rem] border border-border/60 bg-background/45 p-4 dark:bg-white/[0.03]">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{ui.auditTitle}</h3>
            <p className="text-sm text-muted-foreground">{ui.auditDesc}</p>
          </div>

          {auditTrail.length === 0 ? (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
              {ui.noAudit}
            </div>
          ) : (
            <div className="space-y-3">
              {auditTrail.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-2 rounded-[1.1rem] border border-border/60 bg-muted/20 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1 min-w-0">
                    <p className="font-medium">{formatAuditAction(entry.action)}</p>
                    {entry.details ? (
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {formatAuditDetails(entry.details, entry.action).map((line) => (
                          <p key={line} className="break-all leading-5">
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground lg:text-right">
                    <p>{formatRelativeTime(entry.createdAt)}</p>
                    {entry.ip ? <p className="mt-1 font-mono">{entry.ip}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SupportWorkflowCard({
  keyId,
  keyName,
  telegramDeliveryEnabled,
  supportActivity,
  openIncidents,
  onUpdated,
}: {
  keyId: string;
  keyName: string;
  telegramDeliveryEnabled: boolean;
  supportActivity: Array<{
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    createdAt: Date | string;
  }>;
  openIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    openedAt: Date | string;
    assignedUserEmail: string | null;
  }>;
  onUpdated: () => void;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const supportUi = {
    title: isMyanmar ? 'ပံ့ပိုးကူညီမှု လုပ်ဆောင်ချက်' : 'Support Workflow',
    description: isMyanmar ? `${keyName} အတွက် အသုံးပြုသူထံသို့ အကူအညီပို့ခြင်းနှင့် ပြဿနာတင်ပြမှုများကို တစ်နေရာတည်းကနေ စီမံပါ။` : `Resend access, send reminders, and report issues for ${keyName} from one place.`,
    resend: isMyanmar ? 'အသုံးပြုခွင့်လင့်ခ်ကို ထပ်ပို့မည်' : 'Resend Access',
    renewal: isMyanmar ? 'သက်တမ်းတိုး သတိပေးချက် ပို့မည်' : 'Send Renewal Reminder',
    support: isMyanmar ? 'အကူအညီ မက်ဆေ့ချ် ပို့မည်' : 'Send Support Message',
    report: isMyanmar ? 'ပြဿနာ တင်ပြမည်' : 'Report Problem',
    disabledHint: isMyanmar ? 'Telegram ပေးပို့မှုကို ပိတ်ထားသဖြင့် Telegram လုပ်ဆောင်ချက်များ မရနိုင်ပါ။' : 'Telegram delivery is disabled for this key, so Telegram actions are unavailable.',
    sentTitle: isMyanmar ? 'ပို့ပြီးပါပြီ' : 'Sent',
    resendSuccess: isMyanmar ? 'အသုံးပြုခွင့်လင့်ခ်ကို Telegram မှတစ်ဆင့် ထပ်ပို့ပြီးပါပြီ။' : 'The access link has been resent through Telegram.',
    renewalSuccess: isMyanmar ? 'သက်တမ်းတိုး သတိပေးချက်ကို ပို့ပြီးပါပြီ။' : 'The renewal reminder has been sent.',
    supportSuccess: isMyanmar ? 'အကူအညီ မက်ဆေ့ချ်ကို ပို့ပြီးပါပြီ။' : 'The support message has been sent.',
    reportSuccess: isMyanmar ? 'ပြဿနာကို မှတ်တမ်းတင်ပြီးပါပြီ။' : 'The problem has been reported and logged.',
    errorTitle: isMyanmar ? 'လုပ်ဆောင်မှု မအောင်မြင်ပါ' : 'Action failed',
    supportDialogTitle: isMyanmar ? 'အကူအညီ မက်ဆေ့ချ် ပို့ရန်' : 'Send support message',
    supportDialogDesc: isMyanmar ? 'အသုံးပြုသူထံသို့ ပို့မည့် အကူအညီ မက်ဆေ့ချ်ကို ရေးပါ။' : 'Write the support message to send to this user.',
    supportMacrosTitle: isMyanmar ? 'အမြန် အကြောင်းပြန် စာပုံစံများ' : 'Quick reply macros',
    supportMacrosDesc: isMyanmar
      ? 'မကြာခဏပို့လေ့ရှိသော အကြောင်းပြန် စာပုံစံများကို ရွေးပြီး မက်ဆေ့ချ်ထဲသို့ ထည့်နိုင်သည်။'
      : 'Load a common support reply into the message box, then adjust it if needed.',
    supportPlaceholder: isMyanmar ? 'အသုံးပြုသူထံသို့ ပို့လိုသော မက်ဆေ့ချ်ကို ရေးပါ...' : 'Write the message you want to send to this user...',
    supportRequired: isMyanmar ? 'အကူအညီ မက်ဆေ့ချ်ကို ရေးပါ။' : 'Enter a support message.',
    reportDialogTitle: isMyanmar ? 'ပြဿနာ တင်ပြရန်' : 'Report a problem',
    reportDialogDesc: isMyanmar ? 'ဤအသုံးပြုခွင့်သော့အတွက် ပြဿနာအသေးစိတ်ကို မှတ်တမ်းတင်ပါ။' : 'Capture the issue details for this access key.',
    reportPlaceholder: isMyanmar ? 'ဥပမာ - အသုံးပြုသူက စာရင်းသွင်းလင့်ခ် ခေါ်ယူမရကြောင်း အကြောင်းကြားထားသည်...' : 'For example: User reported that subscription fetch is failing...',
    reportRequired: isMyanmar ? 'ပြဿနာအကျဉ်းကို ရေးပါ။' : 'Enter a problem summary.',
    severity: isMyanmar ? 'အရေးကြီးမှု' : 'Severity',
    severityInfo: isMyanmar ? 'အချက်အလက်' : 'Info',
    severityWarning: isMyanmar ? 'သတိပေးချက်' : 'Warning',
    severityCritical: isMyanmar ? 'ပြင်းထန်' : 'Critical',
    cancel: isMyanmar ? 'မလုပ်တော့' : 'Cancel',
    send: isMyanmar ? 'ပို့မည်' : 'Send',
    createIncident: isMyanmar ? 'အဖြစ်အပျက် တစ်ခု ဖန်တီးမည်' : 'Create Incident',
    recentActivity: isMyanmar ? 'မကြာသေးမီ လုပ်ဆောင်ချက်' : 'Recent Activity',
    openIncidents: isMyanmar ? 'ဖွင့်ထားသော အဖြစ်အပျက်များ' : 'Open Incidents',
    none: isMyanmar ? 'မရှိသေးပါ' : 'None yet',
    assignedTo: isMyanmar ? 'တာဝန်ပေးထားသူ' : 'Assigned to',
    actionResent: isMyanmar ? 'အသုံးပြုခွင့်လင့်ခ်ကို ထပ်ပို့ခဲ့သည်' : 'Access resent',
    actionRenewal: isMyanmar ? 'သက်တမ်းတိုး သတိပေးချက် ပို့ခဲ့သည်' : 'Renewal reminder sent',
    actionSupport: isMyanmar ? 'အကူအညီ မက်ဆေ့ချ် ပို့ခဲ့သည်' : 'Support message sent',
    actionProblem: isMyanmar ? 'ပြဿနာ တင်ပြခဲ့သည်' : 'Problem reported',
    supportMessageTitle: isMyanmar ? 'မက်ဆေ့ချ်' : 'Message',
    supportMessageDesc: isMyanmar
      ? 'ဤ key အတွက် support update ပို့ရန် သို့မဟုတ် admin queue ထံ အကူအညီတောင်းရန် message ရေးပါ။'
      : 'Send a support update or request help from the admin queue for this key.',
  };

  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [problemSummary, setProblemSummary] = useState('');
  const [problemSeverity, setProblemSeverity] = useState<'critical' | 'warning' | 'info'>('warning');
  const supportReplyMacros = TELEGRAM_SUPPORT_REPLY_MACROS.map((macro) => ({
    code: macro.code,
    label: macro.label[isMyanmar ? 'my' : 'en'],
    message: macro.message[isMyanmar ? 'my' : 'en'],
  }));

  const resendAccessMutation = trpc.keys.resendAccess.useMutation({
    onSuccess: () => {
      toast({ title: supportUi.sentTitle, description: supportUi.resendSuccess });
      onUpdated();
    },
    onError: (error) => {
      toast({ title: supportUi.errorTitle, description: error.message, variant: 'destructive' });
    },
  });
  const sendRenewalMutation = trpc.keys.sendRenewalReminder.useMutation({
    onSuccess: () => {
      toast({ title: supportUi.sentTitle, description: supportUi.renewalSuccess });
      onUpdated();
    },
    onError: (error) => {
      toast({ title: supportUi.errorTitle, description: error.message, variant: 'destructive' });
    },
  });
  const sendSupportMutation = trpc.keys.sendSupportMessage.useMutation({
    onSuccess: () => {
      setSupportDialogOpen(false);
      setSupportMessage('');
      toast({ title: supportUi.sentTitle, description: supportUi.supportSuccess });
      onUpdated();
    },
    onError: (error) => {
      toast({ title: supportUi.errorTitle, description: error.message, variant: 'destructive' });
    },
  });
  const reportProblemMutation = trpc.keys.reportProblem.useMutation({
    onSuccess: () => {
      setReportDialogOpen(false);
      setProblemSummary('');
      setProblemSeverity('warning');
      toast({ title: supportUi.sentTitle, description: supportUi.reportSuccess });
      onUpdated();
    },
    onError: (error) => {
      toast({ title: supportUi.errorTitle, description: error.message, variant: 'destructive' });
    },
  });

  const activityLabel = (action: string) => {
    switch (action) {
      case 'ACCESS_KEY_ACCESS_RESENT':
      case 'TELEGRAM_SHARE_SENT':
        return supportUi.actionResent;
      case 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED':
      case 'ACCESS_KEY_RENEWAL_REMINDER_SENT':
        return supportUi.actionRenewal;
      case 'ACCESS_KEY_SUPPORT_MESSAGE_TRIGGERED':
      case 'ACCESS_KEY_SUPPORT_MESSAGE_SENT':
        return supportUi.actionSupport;
      case 'ACCESS_KEY_PROBLEM_REPORTED':
        return supportUi.actionProblem;
      default:
        return action;
    }
  };

  const submitSupportMessage = () => {
    const message = supportMessage.trim();
    if (!message) {
      toast({ title: supportUi.errorTitle, description: supportUi.supportRequired, variant: 'destructive' });
      return;
    }

    sendSupportMutation.mutate({
      id: keyId,
      message,
    });
  };

  const submitProblemReport = () => {
    const summary = problemSummary.trim();
    if (!summary) {
      toast({ title: supportUi.errorTitle, description: supportUi.reportRequired, variant: 'destructive' });
      return;
    }

    reportProblemMutation.mutate({
      id: keyId,
      severity: problemSeverity,
      summary,
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {supportUi.title}
          </CardTitle>
          <CardDescription>{supportUi.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!telegramDeliveryEnabled ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-700 dark:text-amber-300">
              {supportUi.disabledHint}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Button
              variant="outline"
              className="h-auto justify-start whitespace-normal px-4 py-3 text-left"
              disabled={!telegramDeliveryEnabled || resendAccessMutation.isPending}
              onClick={() => resendAccessMutation.mutate({ id: keyId })}
            >
              {resendAccessMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="mr-2 h-4 w-4" />
              )}
              {supportUi.resend}
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start whitespace-normal px-4 py-3 text-left"
              disabled={!telegramDeliveryEnabled || sendRenewalMutation.isPending}
              onClick={() => sendRenewalMutation.mutate({ id: keyId })}
            >
              {sendRenewalMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {supportUi.renewal}
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start whitespace-normal px-4 py-3 text-left"
              disabled={!telegramDeliveryEnabled}
              onClick={() => setSupportDialogOpen(true)}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {supportUi.support}
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start whitespace-normal px-4 py-3 text-left"
              onClick={() => setReportDialogOpen(true)}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {supportUi.report}
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">{supportUi.recentActivity}</p>
              {supportActivity.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {supportActivity.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{activityLabel(entry.action)}</p>
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(entry.createdAt)}</span>
                      </div>
                      {entry.details && typeof entry.details.message === 'string' ? (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{entry.details.message}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{supportUi.none}</p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">{supportUi.openIncidents}</p>
              {openIncidents.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {openIncidents.map((incident) => (
                    <div key={incident.id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{incident.title}</p>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="rounded-full px-2 py-0.5 capitalize">
                              {incident.severity}
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-2 py-0.5 capitalize">
                              {incident.status.toLowerCase()}
                            </Badge>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(incident.openedAt)}</span>
                      </div>
                      {incident.assignedUserEmail ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {supportUi.assignedTo}: {incident.assignedUserEmail}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{supportUi.none}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
            <DialogTitle>{supportUi.supportDialogTitle}</DialogTitle>
            <DialogDescription>{supportUi.supportDialogDesc}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{supportUi.supportMacrosTitle}</DialogSectionTitle>
                <DialogSectionDescription>{supportUi.supportMacrosDesc}</DialogSectionDescription>
              </DialogSectionHeader>
              <div className="flex flex-wrap gap-2">
                {supportReplyMacros.map((macro) => (
                  <Button
                    key={macro.code}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSupportMessage(macro.message)}
                  >
                    {macro.label}
                  </Button>
                ))}
              </div>
            </DialogSection>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{supportUi.supportMessageTitle}</DialogSectionTitle>
                <DialogSectionDescription>{supportUi.supportMessageDesc}</DialogSectionDescription>
              </DialogSectionHeader>
              <Textarea
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                placeholder={supportUi.supportPlaceholder}
                className="min-h-[160px]"
              />
            </DialogSection>
          </DialogBody>
          <DialogFooter className="ops-modal-sticky-footer">
            <Button variant="outline" onClick={() => setSupportDialogOpen(false)}>
              {supportUi.cancel}
            </Button>
            <Button
              onClick={submitSupportMessage}
              disabled={sendSupportMutation.isPending}
            >
              {sendSupportMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="mr-2 h-4 w-4" />
              )}
              {supportUi.send}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
            <DialogTitle>{supportUi.reportDialogTitle}</DialogTitle>
            <DialogDescription>{supportUi.reportDialogDesc}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>Incident details</DialogSectionTitle>
                <DialogSectionDescription>
                  Capture the severity and a short summary so the incident queue can triage it quickly.
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{supportUi.severity}</Label>
                  <Select
                    value={problemSeverity}
                    onValueChange={(value) => setProblemSeverity(value as 'critical' | 'warning' | 'info')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">{supportUi.severityInfo}</SelectItem>
                      <SelectItem value="warning">{supportUi.severityWarning}</SelectItem>
                      <SelectItem value="critical">{supportUi.severityCritical}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={problemSummary}
                  onChange={(event) => setProblemSummary(event.target.value)}
                  placeholder={supportUi.reportPlaceholder}
                  className="min-h-[160px]"
                />
              </div>
            </DialogSection>
          </DialogBody>
          <DialogFooter className="ops-modal-sticky-footer">
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
              {supportUi.cancel}
            </Button>
            <Button
              onClick={submitProblemReport}
              disabled={reportProblemMutation.isPending}
            >
              {reportProblemMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="mr-2 h-4 w-4" />
              )}
              {supportUi.createIncident}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * KeyDetailPage Component
 *
 * The main page component that fetches and displays all information about
 * a specific access key. It provides a comprehensive overview with action
 * buttons for common management tasks.
 */
export default function KeyDetailPage() {
  const { t, locale } = useLocale();
  const params = useParams();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const keyId = params.id as string;

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'delivery' | 'activity' | 'support'>('overview');
  const [replacementServerId, setReplacementServerId] = useState('none');
  const [notifyOnReplacement, setNotifyOnReplacement] = useState(true);
  const [rotationEnabledDraft, setRotationEnabledDraft] = useState(false);
  const [rotationIntervalDraft, setRotationIntervalDraft] = useState<'NEVER' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('NEVER');
  const { data: currentUser } = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // Fetch key details
  const { data: key, isLoading, refetch } = trpc.keys.getById.useQuery(
    { id: keyId },
    { enabled: !!keyId }
  );

  const { data: activitySnapshot } = trpc.keys.getActivitySnapshot.useQuery(
    { id: keyId },
    {
      enabled: !!keyId,
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
    },
  );
  const { data: healthDiagnostics } = trpc.keys.getHealthDiagnostics.useQuery(
    { id: keyId },
    {
      enabled: !!keyId,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  );
  const isAdmin = currentUser?.role === 'ADMIN';
  const { data: assignableServers } = trpc.servers.list.useQuery(
    { includeInactive: false },
    {
      enabled: Boolean(keyId && isAdmin),
      staleTime: 30_000,
    },
  );

  // Fetch QR code
  const { data: qrData, isLoading: qrLoading } = trpc.keys.generateQRCode.useQuery(
    { id: keyId },
    { enabled: !!keyId }
  );

  // Delete mutation
  const deleteMutation = trpc.keys.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Key deleted',
        description: 'The access key has been deleted.',
      });
      router.push('/dashboard/keys');
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const replaceServerMutation = trpc.keys.replaceServer.useMutation({
    onSuccess: async (result) => {
      toast({
        title: isMyanmar ? 'ဆာဗာကို ပြောင်းပြီးပါပြီ' : 'Server replaced',
        description: `${result.keyName} moved to ${result.targetServerName}. ${result.remainingChanges} change${result.remainingChanges === 1 ? '' : 's'} remaining.`,
      });
      setReplacementServerId('none');
      await refetch();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ဆာဗာ ပြောင်းလဲမှု မအောင်မြင်ပါ' : 'Server replacement failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const updateRotationMutation = trpc.keys.updateRotationSettings.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Rotation policy updated',
        description: 'The auto-rotation schedule has been saved for this access key.',
      });
      await refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to save rotation policy',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const rotateNowMutation = trpc.keys.rotateNow.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Access key rotated',
        description: 'The ss:// credential was replaced. The subscription link stays the same.',
      });
      await refetch();
    },
    onError: (error) => {
      toast({
        title: 'Rotation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const sendBandwidthAlertMutation = trpc.keys.sendBandwidthAlert.useMutation({
    onSuccess: async (result) => {
      toast({
        title: result.level === 'DISABLED' ? 'Limit notice sent' : `${result.level}% alert sent`,
        description: result.level === 'DISABLED'
          ? 'The manual limit-reached notice was delivered.'
          : `The manual ${result.level}% quota alert was delivered.`,
      });
      await refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to send bandwidth alert',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const resetBandwidthAlertStateMutation = trpc.keys.resetBandwidthAlertState.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Alert history reset',
        description: 'Quota alert flags were cleared for this key.',
      });
      await refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to reset alert history',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const telegramDeliveryEnabled = Boolean(key?.telegramDeliveryEnabled);
  const rotationEnabled = Boolean((key as any)?.rotationEnabled);
  const rotationInterval =
    ((key as any)?.rotationInterval as 'NEVER' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY') || 'NEVER';

  useEffect(() => {
    setReplacementServerId('none');
    setNotifyOnReplacement(telegramDeliveryEnabled);
  }, [key?.id, telegramDeliveryEnabled]);

  useEffect(() => {
    setRotationEnabledDraft(rotationEnabled);
    setRotationIntervalDraft(rotationInterval);
  }, [key?.id, rotationEnabled, rotationInterval]);

  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (keyId) {
      deleteMutation.mutate({ id: keyId });
      setDeleteDialogOpen(false);
    }
  };

  const renewMutation = trpc.keys.renew.useMutation({
    onSuccess: async (result) => {
      const renewedExpiryLabel = result.expiresAt
        ? formatDateTime(result.expiresAt)
        : (isMyanmar ? 'မသတ်မှတ်ထား' : 'Not set');
      toast({
        title: isMyanmar ? 'Renew လုပ်ပြီးပါပြီ' : 'Key renewed',
        description: isMyanmar
          ? `${result.name} ကို ${renewedExpiryLabel} အထိ သက်တမ်းတိုးပြီးပါပြီ။`
          : `${result.name} now expires on ${renewedExpiryLabel}.`,
      });
      setRenewDialogOpen(false);
      await Promise.all([
        refetch(),
        utils.keys.getById.invalidate({ id: keyId }),
        utils.keys.list.invalidate(),
        utils.keys.stats.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'Renew မအောင်မြင်ပါ' : 'Renewal failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-48 animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-muted rounded-xl animate-pulse" />
            <div className="h-48 bg-muted rounded-xl animate-pulse" />
          </div>
          <div className="h-96 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!key) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Key className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">{isMyanmar ? 'သော့ မတွေ့ပါ' : 'Key not found'}</h3>
          <p className="text-muted-foreground mb-6">
            {isMyanmar ? 'တောင်းဆိုထားသော အသုံးပြုခွင့်သော့ကို မတွေ့ပါ။' : 'The requested access key could not be found.'}
          </p>
          <Button asChild>
            <Link href="/dashboard/keys">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {isMyanmar ? 'သော့များသို့ ပြန်မည်' : 'Back to Keys'}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = key.status as keyof typeof statusConfig;
  const statusInfo = statusConfig[status] || statusConfig.ACTIVE;
  const StatusIcon = statusInfo.icon;
  const keyRecord = key as any;
  const decoratedAccessUrl = decorateOutlineAccessUrl(key.accessUrl, key.name) || key.accessUrl || '';
  const subscriptionApiUrl = key.publicSlug
    ? buildShortClientUrl(key.publicSlug, {
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      })
    : key.subscriptionToken
      ? buildSubscriptionApiUrl(key.subscriptionToken, {
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        })
      : '';
  const subscriptionProbeUrl = key.publicSlug
    ? (typeof window !== 'undefined'
        ? `${window.location.origin}${getPublicBasePath()}/c/${key.publicSlug}`
        : '')
    : key.subscriptionToken
      ? (typeof window !== 'undefined'
          ? `${window.location.origin}${getPublicBasePath()}/api/subscription/${key.subscriptionToken}`
          : '')
      : '';

  const usagePercent = key.dataLimitBytes
    ? Number((key.usedBytes * BigInt(100)) / key.dataLimitBytes)
    : 0;
  const quotaAlertState = key.dataLimitBytes
    ? getQuotaAlertState({
        usagePercent,
        thresholds: keyRecord.quotaAlertThresholds,
        sentThresholds: keyRecord.quotaAlertsSent,
      })
    : null;
  const manualBandwidthLevel = quotaAlertState?.recommendedLevel ?? null;
  const bandwidthThresholdLabel = quotaAlertState?.thresholds.length
    ? quotaAlertState.thresholds.map((threshold) => `${threshold}%`).join(', ')
    : 'None';
  const estimatedDevices = activitySnapshot?.estimatedDevices ?? Number((key as any).estimatedDevices || 0);
  const activeSessions =
    activitySnapshot?.activeSessions ??
    (keyRecord.sessions?.filter((session: { isActive: boolean }) => session.isActive).length || 0);
  const lastTrafficAt = activitySnapshot?.lastTrafficAt
    ? new Date(activitySnapshot.lastTrafficAt)
    : key.lastTrafficAt
      ? new Date(key.lastTrafficAt)
      : null;
  const lastMeaningfulUsageAt = activitySnapshot?.lastUsedAt
    ? new Date(activitySnapshot.lastUsedAt)
    : (key as any).lastUsedAt
      ? new Date((key as any).lastUsedAt)
      : null;
  const recentTrafficDeltaBytes = activitySnapshot?.recentTrafficDeltaBytes
    ? BigInt(activitySnapshot.recentTrafficDeltaBytes)
    : BigInt(0);
  const isOnline = activitySnapshot?.isTrafficActive ?? Boolean(
    lastTrafficAt &&
      Date.now() - lastTrafficAt.getTime() <= TRAFFIC_ACTIVE_WINDOW_MS,
  );
  const qrDownloadFilename = buildDownloadFilename(key.name, 'qr', 'png');
  const configDownloadFilename = buildDownloadFilename(key.name, 'client-config', 'txt');
  const availableReplacementServers = (assignableServers || []).filter((server) => server.id !== key.serverId);
  const serverChangeCount = keyRecord.serverChangeCount ?? 0;
  const serverChangeLimit = keyRecord.serverChangeLimit ?? 3;
  const remainingServerChanges = Math.max(0, serverChangeLimit - serverChangeCount);
  const detailTabCopy: Record<'overview' | 'delivery' | 'activity' | 'support', string> = {
    overview: 'Connection basics, quota, expiry, and contact details for this access key.',
    delivery: 'Share links, client delivery, and distribution controls for handing the key to the customer cleanly.',
    activity: 'Live usage, rotation policy, health, and server operations for keeping the key stable.',
    support: 'Billing history and support workflow context tied to this access key.',
  };

  const handleDownloadQr = () => {
    if (!qrData?.qrCode) {
      toast({
        title: 'QR unavailable',
        description: 'The QR image is not ready yet.',
        variant: 'destructive',
      });
      return;
    }

    downloadDataUrl(qrData.qrCode, qrDownloadFilename);
    toast({
      title: 'QR downloaded',
      description: `${qrDownloadFilename} has been saved.`,
    });
  };

  const handleDownloadConfig = () => {
    if (!decoratedAccessUrl) {
      toast({
        title: 'Config unavailable',
        description: 'The client config is not ready yet.',
        variant: 'destructive',
      });
      return;
    }

    downloadTextFile(`${decoratedAccessUrl}\n`, configDownloadFilename);
    toast({
      title: 'Config downloaded',
      description: `${configDownloadFilename} has been saved.`,
    });
  };

  const isDynamicChildKey = Boolean((key as any).dynamicKeyId);
  const currentRotationInterval = ((key as any).rotationInterval as 'NEVER' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY') || 'NEVER';
  const hasRotationChanges =
    rotationEnabledDraft !== Boolean((key as any).rotationEnabled) ||
    rotationIntervalDraft !== currentRotationInterval;

  return (
    <div className="space-y-6" data-testid="access-key-detail-page">
      <DetailHero data-testid="access-key-detail-hero">
        <DetailHeroGrid>
          <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="ghost" size="icon" asChild className="rounded-full">
                    <Link href="/dashboard/keys">
                      <ArrowLeft className="w-5 h-5" />
                    </Link>
                  </Button>
                  <span className="ops-pill border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-200">
                    <Key className="h-3.5 w-3.5" />
                    Access Key
                  </span>
                  <Badge className={cn('border rounded-full px-3 py-1', statusInfo.color)}>
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {statusInfo.label}
                  </Badge>
                  {keyRecord.server ? (
                    <ServerLifecycleBadge mode={(keyRecord.server as { lifecycleMode?: string | null }).lifecycleMode} />
                  ) : null}
                  {isOnline ? (
                    <Badge variant="outline" className="rounded-full border-emerald-500/30 text-emerald-500">
                      <Wifi className="mr-1 h-3 w-3" />
                      {t('keys.status.online')}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-muted-foreground/30 text-muted-foreground">
                      <WifiOff className="mr-1 h-3 w-3" />
                      {t('keys.status.no_recent_traffic')}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{key.name}</h1>
                  <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                    {isMyanmar
                      ? `${formatRelativeTime(key.createdAt)} တွင် ဖန်တီးခဲ့သည်${keyRecord.server ? ` · ${keyRecord.server.name}` : ''}`
                      : `Created ${formatRelativeTime(key.createdAt)}${keyRecord.server ? ` on ${keyRecord.server.name}` : ''}`}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:flex-wrap xl:justify-end">
                <Button className="h-11 rounded-full px-5" onClick={() => setRenewDialogOpen(true)}>
                  <Calendar className="mr-2 h-4 w-4" />
                  {isMyanmar ? 'Renew လုပ်မည်' : 'Renew'}
                </Button>
                <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setEditDialogOpen(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {isMyanmar ? 'ပြင်ဆင်မည်' : 'Edit'}
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-full px-5">
                  <Link href={keyRecord.server ? `/dashboard/servers/${keyRecord.server.id}` : '/dashboard/servers'}>
                    <Server className="mr-2 h-4 w-4" />
                    {isMyanmar ? 'ဆာဗာ ကြည့်မည်' : 'View Server'}
                  </Link>
                </Button>
                <Button
                  variant="destructive"
                  className="h-11 rounded-full px-5"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {isMyanmar ? 'ဖျက်မည်' : 'Delete'}
                </Button>
              </div>
            </div>

            <DetailMetricGrid>
              <DetailKpiTile
                label={isMyanmar ? 'စုစုပေါင်း အသုံးပြုမှု' : 'Total Usage'}
                value={formatBytes(key.usedBytes)}
                meta={key.dataLimitBytes ? (isMyanmar ? `${formatBytes(key.dataLimitBytes)} ထဲမှ` : `of ${formatBytes(key.dataLimitBytes)}`) : (isMyanmar ? 'ကန့်သတ်ချက် မရှိပါ' : 'Unlimited quota')}
              />
              <DetailKpiTile
                label={isMyanmar ? 'စက်များ' : 'Devices'}
                value={estimatedDevices}
                meta={isMyanmar ? `လက်ရှိ session ${activeSessions} ခု` : `${activeSessions} active session${activeSessions === 1 ? '' : 's'}`}
              />
              <DetailKpiTile
                label={isMyanmar ? 'သက်တမ်းကုန်' : 'Expires'}
                value={key.expiresAt ? formatRelativeTime(key.expiresAt) : (isMyanmar ? 'မကုန်ဆုံးပါ' : 'Never')}
                meta={key.expirationType.replace(/_/g, ' ')}
              />
              <DetailKpiTile
                label={isMyanmar ? 'နောက်ဆုံး မြင်တွေ့မှု' : 'Last Seen'}
                value={lastMeaningfulUsageAt ? formatRelativeTime(lastMeaningfulUsageAt) : (isMyanmar ? 'မရှိသေးပါ' : 'Never')}
                meta={isMyanmar ? `Outline ID ${key.outlineKeyId}` : `Outline ID ${key.outlineKeyId}`}
              />
            </DetailMetricGrid>
          </div>

          <DetailHeroAside
            title={isMyanmar ? 'သော့ အကျဉ်းချုပ်' : 'Key summary'}
            description={isMyanmar ? 'အသုံးပြုမှု၊ ပို့ဆောင်မှု သို့မဟုတ် အကူအညီ လုပ်ဆောင်ချက်များ ပြုလုပ်စဉ် ဖောက်သည်ချိတ်ဆက်မှု၊ ကန့်သတ်ချက်နှင့် ဆာဗာချိတ်ဆက်မှုကို အမြဲ မြင်နိုင်စေရန် ပြထားသည်။' : 'Keep customer delivery, quota, and server linkage visible while you move through usage, delivery, or support actions.'}
          >
            <DetailMiniTileGrid>
              <DetailMiniTile
                label={isMyanmar ? 'ဖောက်သည် ချိတ်ဆက်မှု' : 'Customer link'}
                value={key.email || key.telegramId || (isMyanmar ? 'မချိတ်ထားပါ' : 'Not linked')}
                valueClassName="break-words"
              />
              <DetailMiniTile
                label={isMyanmar ? 'ဆာဗာ လမ်းကြောင်း' : 'Server route'}
                value={keyRecord.server?.name || (isMyanmar ? 'ဆာဗာ မချိတ်ထားသေးပါ' : 'Unassigned server')}
                meta={(keyRecord.server as { country?: string | null })?.country || (isMyanmar ? 'ဆာဗာ နိုင်ငံ မရှိပါ' : 'No server country')}
              />
              <DetailMiniTile
                label={isMyanmar ? 'ပို့ဆောင်မှု အခြေအနေ' : 'Delivery state'}
                value={keyRecord.sharePageEnabled === false ? (isMyanmar ? 'မျှဝေစာမျက်နှာ ပိတ်ထားသည်' : 'Share page off') : (isMyanmar ? 'မျှဝေစာမျက်နှာ ဖွင့်ထားသည်' : 'Share page on')}
                meta={`${keyRecord.clientLinkEnabled === false ? (isMyanmar ? 'ကလိုင်းယင့် လင့်ခ် ပိတ်ထားသည်' : 'Client link off') : (isMyanmar ? 'ကလိုင်းယင့် လင့်ခ် ဖွင့်ထားသည်' : 'Client link on')} • ${keyRecord.telegramDeliveryEnabled === false ? (isMyanmar ? 'Telegram ပို့ဆောင်မှု ပိတ်ထားသည်' : 'Telegram off') : (isMyanmar ? 'Telegram ပို့ဆောင်မှု ဖွင့်ထားသည်' : 'Telegram on')}`}
              />
              <DetailMiniTile
                label={isMyanmar ? 'ကန့်သတ်ချက် စောင့်ကြည့်မှု' : 'Quota watch'}
                value={key.dataLimitBytes ? (isMyanmar ? `အသုံးပြုမှု ${usagePercent.toFixed(0)}%` : `${usagePercent.toFixed(0)}% used`) : (isMyanmar ? 'ကန့်သတ်ချက် မရှိပါ' : 'Unlimited quota')}
                meta={key.dataLimitBytes ? (isMyanmar ? `အသိပေးချက် ${bandwidthThresholdLabel}` : `Alerts ${bandwidthThresholdLabel}`) : (isMyanmar ? 'ကန့်သတ်ချက် အသိပေးချက် မသတ်မှတ်ထားပါ' : 'No quota alerts applied')}
              />
            </DetailMiniTileGrid>

            {key.notes ? (
              <DetailNoteBlock>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'မှတ်စု' : 'Notes'}</p>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-foreground">{key.notes}</p>
              </DetailNoteBlock>
            ) : null}
          </DetailHeroAside>
        </DetailHeroGrid>
      </DetailHero>

      <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as 'overview' | 'delivery' | 'activity' | 'support')} className="space-y-4">
        <div className="ops-panel space-y-3 p-3 sm:p-4">
          <div className="space-y-1">
            <p className="ops-section-heading">{isMyanmar ? 'အသုံးပြုခွင့်သော့ လုပ်ငန်းခွင်' : 'Access key workspace'}</p>
            <p className="text-sm text-muted-foreground">{detailTabCopy[detailTab]}</p>
          </div>
          <TabsList className={cn(
            'grid h-auto gap-2 rounded-[1.2rem] border border-border/60 bg-background/45 p-1 dark:bg-white/[0.03]',
            isAdmin ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3',
          )}>
            <TabsTrigger value="overview" className="rounded-[0.95rem] px-3 py-2 text-sm">{isMyanmar ? 'အနှစ်ချုပ်' : 'Overview'}</TabsTrigger>
            <TabsTrigger value="delivery" className="rounded-[0.95rem] px-3 py-2 text-sm">{isMyanmar ? 'ပို့ဆောင်မှု' : 'Delivery'}</TabsTrigger>
            <TabsTrigger value="activity" className="rounded-[0.95rem] px-3 py-2 text-sm">{isMyanmar ? 'လှုပ်ရှားမှု' : 'Activity'}</TabsTrigger>
            {isAdmin ? (
              <TabsTrigger value="support" className="rounded-[0.95rem] px-3 py-2 text-sm">{isMyanmar ? 'အကူအညီ' : 'Support'}</TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <div className="ops-showcase-grid">
          <div className="ops-detail-stack self-start">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <div className="ops-section-grid">
                <Card className="ops-detail-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-primary" />
                      {isMyanmar ? 'ဆာဗာ နှင့် အသုံးပြုခွင့်' : 'Server & Access'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {keyRecord.server && (
                      <div className="ops-row-card">
                        <div className="flex items-center gap-3">
                          {keyRecord.server.countryCode ? (
                            <span className="text-xl">{getCountryFlag(keyRecord.server.countryCode)}</span>
                          ) : null}
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{keyRecord.server.name}</p>
                              <ServerLifecycleBadge mode={(keyRecord.server as { lifecycleMode?: string | null }).lifecycleMode} />
                            </div>
                            {keyRecord.server.location ? (
                              <p className="text-sm text-muted-foreground">{keyRecord.server.location}</p>
                            ) : null}
                          </div>
                        </div>
                        <Link href={`/dashboard/servers/${keyRecord.server.id}`}>
                          <Button variant="ghost" size="sm" className="rounded-full">
                            {isMyanmar ? 'ဆာဗာ ကြည့်မည်' : 'View Server'}
                          </Button>
                        </Link>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">{isMyanmar ? 'အသုံးပြုခွင့် လင့်ခ်' : 'Access URL'}</Label>
                      {key.maxDevices && key.boundDeviceInstallsOnly ? (
                        <p className="text-xs text-amber-500">{ACCESS_KEY_RAW_COPY_WARNING}</p>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-2xl border border-border/60 bg-background/55 p-3 font-mono text-sm break-all dark:bg-white/[0.03]">
                          {decoratedAccessUrl}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(
                            decoratedAccessUrl,
                            isMyanmar ? 'ကူးယူပြီးပါပြီ!' : 'Copied!',
                            isMyanmar ? 'အသုံးပြုခွင့် လင့်ခ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Access URL copied to clipboard.'
                          )}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'ပို့တ်' : 'Port'}</p>
                        <p className="font-mono">{key.port}</p>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'လျှို့ဝှက်စနစ်' : 'Encryption'}</p>
                        <p className="font-mono">{key.method}</p>
                      </div>
                      {key.prefix ? (
                        <div className="ops-inline-stat sm:col-span-2">
                          <p className="text-sm text-muted-foreground">{isMyanmar ? 'ရှေ့ဆက်စာ (ဖုံးကွယ်မှု)' : 'Prefix (Obfuscation)'}</p>
                          <p className="font-mono">{key.prefix}</p>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card className="ops-detail-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      {isMyanmar ? 'သက်တမ်း' : 'Expiration'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'အမျိုးအစား' : 'Type'}</p>
                        <p className="font-medium">{key.expirationType.replace(/_/g, ' ')}</p>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'သက်တမ်းကုန်ချိန်' : 'Expires'}</p>
                        <p className="font-medium">{key.expiresAt ? formatDateTime(key.expiresAt) : (isMyanmar ? 'မကုန်ဆုံးပါ' : 'Never')}</p>
                      </div>
                      {key.firstUsedAt ? (
                        <div className="ops-inline-stat">
                          <p className="text-sm text-muted-foreground">{isMyanmar ? 'ပထမအသုံးပြုချိန်' : 'First Used'}</p>
                          <p className="font-medium">{formatDateTime(key.firstUsedAt)}</p>
                        </div>
                      ) : null}
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး ပြင်ဆင်ချိန်' : 'Updated'}</p>
                        <p className="font-medium">{formatDateTime(key.updatedAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="ops-detail-card">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      {isMyanmar ? 'ဒေတာ အသုံးပြုမှု' : 'Traffic Usage'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <div className="ops-inline-stat">
                        <p className="text-3xl font-bold">{formatBytes(key.usedBytes)}</p>
                        <p className="text-sm text-muted-foreground">
                          {isMyanmar ? `${key.dataLimitBytes ? formatBytes(key.dataLimitBytes) : 'အကန့်အသတ်မရှိ'} ထဲမှ` : `of ${key.dataLimitBytes ? formatBytes(key.dataLimitBytes) : 'unlimited'}`}
                        </p>
                      </div>
                      {key.dataLimitBytes ? (
                        <p className="text-2xl font-semibold text-muted-foreground sm:self-center sm:justify-self-end">
                          {usagePercent.toFixed(1)}%
                        </p>
                      ) : null}
                    </div>

                    {key.dataLimitBytes ? (
                      <Progress
                        value={usagePercent}
                        className={cn(
                          'h-3',
                          usagePercent > 90 && '[&>div]:bg-red-500',
                          usagePercent > 70 && usagePercent <= 90 && '[&>div]:bg-yellow-500',
                        )}
                      />
                    ) : null}

                    {key.dataLimitBytes ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {(key as any).autoDisableOnLimit ? (
                          <Badge variant="outline" className="text-xs">
                            {isMyanmar ? 'ကန့်သတ်ချက်ရောက်လျှင် အလိုအလျောက် ပိတ်မည်' : 'Auto-disable on limit'}
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="text-xs">
                          {isMyanmar ? 'ကိုယ်တိုင် အသိပေးချက်' : 'Manual alerts'} · {bandwidthThresholdLabel}
                        </Badge>
                        {(key as any).bandwidthAlertAt80 ? (
                          <Badge variant="outline" className="border-yellow-500 text-xs text-yellow-600">
                            {isMyanmar ? '80% အသိပေးချက် ပို့ပြီး' : '80% alert sent'}
                          </Badge>
                        ) : null}
                        {(key as any).bandwidthAlertAt90 ? (
                          <Badge variant="outline" className="border-red-500 text-xs text-red-600">
                            {isMyanmar ? '90% အသိပေးချက် ပို့ပြီး' : '90% alert sent'}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}

                    {key.dataLimitBytes ? (
                      <div className="rounded-[1rem] border border-border/60 bg-background/45 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{isMyanmar ? 'အသုံးပြုမှုပမာဏ အသိပေးချက်များကို ကိုယ်တိုင်သာ ပို့မည်' : 'Bandwidth alerts are manual-only'}</p>
                            <p className="text-muted-foreground">
                              {isMyanmar ? 'ကန့်သတ်ချက် အသိပေးချက်များကို အလိုအလျောက် မပို့ပါ။ အသုံးပြုမှုကို ဤနေရာတွင် စစ်ဆေးပြီး Telegram အသိပေးချက်ကို ကိုယ်တိုင် ပို့နိုင်သည်။' : 'No quota warning is sent automatically. Review usage here and trigger Telegram notices yourself.'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {manualBandwidthLevel === 'DISABLED'
                                ? isMyanmar ? 'ဤသော့သည် ၁၀၀% သို့မဟုတ် ထို့ထက်ကျော်နေပါသည်။ ကန့်သတ်ချက်ပြည့် အသိပေးချက်ကို ကိုယ်တိုင် ပို့နိုင်သည်။' : 'This key is at or above 100%. You can send a limit-reached notice manually.'
                                : manualBandwidthLevel
                                  ? quotaAlertState?.pendingThresholds.length
                                    ? isMyanmar ? `${manualBandwidthLevel}% အသိပေးချက်ကို ယခုပို့ရန် အဆင်သင့်ဖြစ်နေသည်။` : `Ready to send the ${manualBandwidthLevel}% alert now.`
                                    : isMyanmar ? `${manualBandwidthLevel}% အသိပေးချက်ကို ယခင်က ပို့ထားပြီးဖြစ်သည်။ ကိုယ်တိုင် ပြန်ပို့နိုင်သည်။` : `The ${manualBandwidthLevel}% alert was already sent. You can resend it manually.`
                                  : quotaAlertState?.nextThreshold
                                    ? isMyanmar ? `နောက်သတ်မှတ်ချက်: ${quotaAlertState.nextThreshold}%` : `Next threshold: ${quotaAlertState.nextThreshold}%`
                                    : isMyanmar ? 'သတ်မှတ်ကန့်သတ်ချက် မရောက်သေးပါ။' : 'No threshold reached yet.'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() => sendBandwidthAlertMutation.mutate({ id: key.id })}
                              disabled={!manualBandwidthLevel || sendBandwidthAlertMutation.isPending}
                            >
                              {sendBandwidthAlertMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              {manualBandwidthLevel === 'DISABLED'
                                ? isMyanmar ? 'ကန့်သတ်ချက်ပြည့် အသိပေးချက် ပို့မည်' : 'Send limit notice'
                                : manualBandwidthLevel
                                  ? isMyanmar ? `${manualBandwidthLevel}% အသိပေးချက် ပို့မည်` : `Send ${manualBandwidthLevel}% alert`
                                  : isMyanmar ? 'သတ်မှတ်ကန့်သတ်ချက် မရောက်သေးပါ' : 'Threshold not reached'}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => resetBandwidthAlertStateMutation.mutate({ id: key.id })}
                              disabled={
                                resetBandwidthAlertStateMutation.isPending ||
                                !quotaAlertState?.sentThresholds.length
                              }
                            >
                              {resetBandwidthAlertStateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              {isMyanmar ? 'အသိပေးချက် မှတ်တမ်းကို ပြန်စမည်' : 'Reset alert history'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {(key as any).dataLimitResetStrategy && (key as any).dataLimitResetStrategy !== 'NEVER' ? (
                      <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4" />
                        <span>
                          {isMyanmar ? 'ပြန်လည်စတင်ချိန်' : 'Resets'} {(key as any).dataLimitResetStrategy.toLowerCase()}
                          {(key as any).lastDataLimitReset
                            ? isMyanmar
                              ? ` (${formatRelativeTime((key as any).lastDataLimitReset)} တွင် နောက်ဆုံး ပြန်စတင်သည်)`
                              : ` (Last reset: ${formatRelativeTime((key as any).lastDataLimitReset)})`
                            : ''}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <p className="mb-2 text-sm font-medium">{isMyanmar ? 'တိုက်ရိုက် လှုပ်ရှားမှု' : 'Live Activity'}</p>
                    {keyRecord.server ? (
                      <TrafficGraph serverId={keyRecord.server.id} outlineKeyId={key.outlineKeyId} />
                    ) : null}
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <TrafficHistoryChart accessKeyId={key.id} />
                  </div>
                </CardContent>
              </Card>

              <Card className="ops-detail-card">
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="ops-inline-stat flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{key.email || '-'}</p>
                      </div>
                    </div>
                    <div className="ops-inline-stat flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Telegram</p>
                        <p className="font-medium">{key.telegramId || '-'}</p>
                      </div>
                    </div>
                    <div className="ops-inline-stat flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Notes</p>
                        <p className="font-medium">{key.notes || '-'}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="delivery" className="mt-0 space-y-4">
              <Card className="ops-detail-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-primary" />
                    {locale === 'my' ? 'ပို့ဆောင်မှုနှင့် မျှဝေခြင်း လင့်များ' : 'Delivery & Share Links'}
                  </CardTitle>
                  <CardDescription>
                    {locale === 'my'
                      ? 'စာမျက်နှာတစ်လျှောက် ရှာဖွေရန်မလိုဘဲ subscription endpoint၊ short link များနှင့် share page controls များကို ဤနေရာမှ အသုံးပြုပါ။'
                      : 'Use the subscription endpoint, short links, and share page controls without hunting across the page.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">{locale === 'my' ? 'စာရင်းသွင်းလင့်ခ်' : 'Subscription URL'}</Label>
                    <p className="text-xs text-muted-foreground">
                      {locale === 'my'
                        ? 'ဤလင့်ခ်ကို အသုံးပြုသူနှင့် မျှဝေပါ။ Client များက နောက်ဆုံး config ကို အလိုအလျောက် ရယူနိုင်သည်။'
                        : 'Share this URL with the user. Clients can fetch the latest config automatically.'}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-2xl border border-border/60 bg-background/55 p-3 font-mono text-sm break-all dark:bg-white/[0.03]">
                        {subscriptionApiUrl || (locale === 'my' ? 'စာရင်းသွင်း တိုကင်ကို တင်နေသည်...' : 'Loading subscription token...')}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (subscriptionApiUrl) {
                            copyToClipboard(
                              subscriptionApiUrl,
                              locale === 'my' ? 'ကူးယူပြီးပါပြီ!' : 'Copied!',
                              locale === 'my' ? 'စာရင်းသွင်းလင့်ခ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Subscription URL copied to clipboard.',
                            );
                          }
                        }}
                        disabled={!subscriptionApiUrl}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
                    <div className="ops-inline-stat">
                      <p className="text-sm text-muted-foreground">{locale === 'my' ? 'အတို ကလိုင်းယင့်လင့်ခ်' : 'Short client link'}</p>
                      <p className="font-mono text-xs break-all">
                        {key.publicSlug
                          ? buildShortClientUrl(key.publicSlug, {
                              origin: typeof window !== 'undefined' ? window.location.origin : undefined,
                            })
                          : locale === 'my'
                            ? 'အများသုံး အမည်တိုကို ဖွင့်ပြီးနောက် ရရှိနိုင်ပါသည်'
                            : 'Available after enabling public slug'}
                      </p>
                    </div>
                    <div className="ops-inline-stat">
                      <p className="text-sm text-muted-foreground">{locale === 'my' ? 'မျှဝေစာမျက်နှာ' : 'Share page'}</p>
                      <p className="font-mono text-xs break-all">
                        {key.publicSlug
                          ? buildSharePageUrl(key.publicSlug, {
                              origin: typeof window !== 'undefined' ? window.location.origin : undefined,
                            })
                          : locale === 'my'
                            ? 'အများသုံး အမည်တိုကို ဖွင့်ပြီးနောက် ရရှိနိုင်ပါသည်'
                            : 'Available after enabling public slug'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ClientEndpointTestCard
                endpointUrl={subscriptionApiUrl}
                probeUrl={subscriptionProbeUrl}
                title={locale === 'my' ? 'ကလိုင်းယင့်လင့်ခ် စမ်းသပ်မှု' : 'Client URL Test'}
                description={locale === 'my' ? 'အသုံးပြုနေသော Outline ကလိုင်းယင့်လိပ်စာကို စမ်းသပ်ပြီး စာရင်းသွင်းဒေတာ မှန်ကန်စွာ ရရှိကြောင်း အတည်ပြုပါ။' : 'Probe the live Outline client endpoint and confirm the subscription payload resolves cleanly.'}
              />

              <SubscriptionShareCard
                keyId={key.id}
                subscriptionToken={key.subscriptionToken}
                publicSlug={key.publicSlug}
                slugHistory={(key as any).slugHistory ?? []}
                keyName={key.name}
                currentTheme={(key as any).subscriptionTheme}
                currentCoverImage={(key as any).coverImage}
                currentCoverImageType={(key as any).coverImageType}
                currentContactLinks={(key as any).contactLinks ? JSON.parse((key as any).contactLinks) : null}
                currentWelcomeMessage={(key as any).subscriptionWelcomeMessage}
                currentSharePageEnabled={(key as any).sharePageEnabled ?? true}
                currentClientLinkEnabled={(key as any).clientLinkEnabled ?? true}
                currentTelegramDeliveryEnabled={(key as any).telegramDeliveryEnabled ?? true}
                onThemeChange={() => refetch()}
              />

              {isAdmin ? (
                <AccessDistributionSecurityCard
                  keyId={key.id}
                  keyName={key.name}
                  hasPassword={Boolean((key as any).sharePagePasswordHash)}
                  accessExpiresAt={(key as any).sharePageAccessExpiresAt ?? null}
                  distributionLinks={(key as any).distributionLinks ?? []}
                  auditTrail={(key as any).auditTrail ?? []}
                  onUpdated={() => refetch()}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="activity" className="mt-0 space-y-4">
              {isAdmin ? (
                <Card className="ops-detail-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Auto-Rotation
                    </CardTitle>
                    <CardDescription>
                      Rotate the underlying ss:// credential on a schedule without changing the subscription link your customer already uses.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isDynamicChildKey ? (
                      <div className="rounded-[1.05rem] border border-border/60 bg-background/45 px-4 py-3 text-sm text-muted-foreground dark:bg-white/[0.03]">
                        This key belongs to a dynamic key, so its rotation policy is controlled from the parent dynamic-key workspace.
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between rounded-[1.05rem] border border-border/60 bg-background/45 px-4 py-3 dark:bg-white/[0.03]">
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium">Enable scheduled rotation</p>
                            <p className="text-xs text-muted-foreground">
                              Scheduled rotation waits if the key had recent traffic in the last 20 minutes, then tries again on the next cycle.
                            </p>
                          </div>
                          <Switch
                            checked={rotationEnabledDraft}
                            onCheckedChange={setRotationEnabledDraft}
                            disabled={updateRotationMutation.isPending}
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Rotation interval</Label>
                            <Select
                              value={rotationIntervalDraft}
                              onValueChange={(value) =>
                                setRotationIntervalDraft(value as 'NEVER' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY')
                              }
                              disabled={!rotationEnabledDraft}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DAILY">Daily</SelectItem>
                                <SelectItem value="WEEKLY">Weekly</SelectItem>
                                <SelectItem value="BIWEEKLY">Every 2 weeks</SelectItem>
                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                                <SelectItem value="NEVER">Disabled</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Rotation health</Label>
                            <div className="rounded-[1.05rem] border border-border/60 bg-background/45 px-4 py-3 text-sm dark:bg-white/[0.03]">
                              <p className="font-medium">
                                {(key as any).rotationEnabled ? ((key as any).nextRotationAt ? formatRelativeTime((key as any).nextRotationAt) : 'Waiting for the next scheduler run') : 'Disabled'}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Next scheduled rotation
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="ops-inline-stat">
                            <p className="text-sm text-muted-foreground">Last rotated</p>
                            <p className="font-medium">
                              {(key as any).lastRotatedAt ? formatRelativeTime((key as any).lastRotatedAt) : 'Never'}
                            </p>
                          </div>
                          <div className="ops-inline-stat">
                            <p className="text-sm text-muted-foreground">Rotations</p>
                            <p className="font-medium">{(key as any).rotationCount ?? 0}</p>
                          </div>
                          <div className="ops-inline-stat">
                            <p className="text-sm text-muted-foreground">Subscription link</p>
                            <p className="font-medium">Stable</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() =>
                              updateRotationMutation.mutate({
                                id: key.id,
                                rotationEnabled: rotationEnabledDraft && rotationIntervalDraft !== 'NEVER',
                                rotationInterval: rotationIntervalDraft,
                              })
                            }
                            disabled={updateRotationMutation.isPending || !hasRotationChanges}
                          >
                            {updateRotationMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Shield className="mr-2 h-4 w-4" />
                            )}
                            Save rotation policy
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => rotateNowMutation.mutate({ id: key.id })}
                            disabled={rotateNowMutation.isPending || !(key as any).rotationEnabled}
                          >
                            {rotateNowMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCw className="mr-2 h-4 w-4" />
                            )}
                            Rotate now
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {isAdmin ? (
                <Card className="ops-detail-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RotateCw className="h-5 w-5 text-primary" />
                      {isMyanmar ? 'ဆာဗာ ပြောင်းလဲမှု' : 'Server Replacement'}
                    </CardTitle>
                    <CardDescription>
                      Move this key to another server while keeping its usage and expiry unchanged.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">Current server</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {keyRecord.server?.name || 'Unassigned'}
                            {keyRecord.server?.countryCode ? ` (${keyRecord.server.countryCode})` : ''}
                          </p>
                          <ServerLifecycleBadge mode={(keyRecord.server as { lifecycleMode?: string | null } | null)?.lifecycleMode} />
                        </div>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">Changes used</p>
                        <p className="font-medium">
                          {serverChangeCount} / {serverChangeLimit}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {remainingServerChanges} change{remainingServerChanges === 1 ? '' : 's'} remaining
                        </p>
                      </div>
                    </div>

                    {keyRecord.lastServerChangeAt ? (
                      <div className="rounded-[1.05rem] border border-border/60 bg-background/45 px-4 py-3 text-sm text-muted-foreground dark:bg-white/[0.03]">
                        {isMyanmar ? `နောက်ဆုံး ပြောင်းရွှေ့ခဲ့သည် ${formatRelativeTime(keyRecord.lastServerChangeAt)}` : `Last moved ${formatRelativeTime(keyRecord.lastServerChangeAt)}`}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label>Replace to server</Label>
                      <Select
                        value={replacementServerId}
                        onValueChange={setReplacementServerId}
                        disabled={remainingServerChanges <= 0 || replaceServerMutation.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a target server" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Choose a target server</SelectItem>
                          {availableReplacementServers.map((server) => (
                            <SelectItem
                              key={server.id}
                              value={server.id}
                              disabled={server.lifecycleMode === 'MAINTENANCE'}
                            >
                              <div className="flex items-center gap-2">
                                <span>
                                  {server.name}
                                  {server.countryCode ? ` (${server.countryCode})` : ''}
                                </span>
                                <ServerLifecycleBadge mode={server.lifecycleMode} />
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        The key stays on the same expiry date and keeps its existing usage.
                      </p>
                      {replacementServerId !== 'none' ? (
                        <p className="text-xs text-muted-foreground">
                          {getServerLifecycleMeta(
                            availableReplacementServers.find((server) => server.id === replacementServerId)?.lifecycleMode,
                          ).assignmentHint}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between rounded-[1.05rem] border border-border/60 bg-background/45 px-4 py-3 dark:bg-white/[0.03]">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Notify user in Telegram</p>
                        <p className="text-xs text-muted-foreground">
                          Resend the updated share page after the replacement is complete.
                        </p>
                      </div>
                      <Switch
                        checked={notifyOnReplacement}
                        onCheckedChange={setNotifyOnReplacement}
                        disabled={replaceServerMutation.isPending || !key.telegramDeliveryEnabled}
                      />
                    </div>

                    <Button
                      className="w-full"
                      disabled={
                        replacementServerId === 'none' ||
                        remainingServerChanges <= 0 ||
                        replaceServerMutation.isPending
                      }
                      onClick={() =>
                        replaceServerMutation.mutate({
                          id: key.id,
                          targetServerId: replacementServerId,
                          notifyUser: notifyOnReplacement,
                        })
                      }
                    >
                      {replaceServerMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="mr-2 h-4 w-4" />
                      )}
                      {isMyanmar ? 'ရွေးထားသော ဆာဗာသို့ ပြောင်းမည်' : 'Replace on selected server'}
                    </Button>

                    {remainingServerChanges <= 0 ? (
                      <div className="rounded-[1.05rem] border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                        This key has reached the 3-change limit. The user must buy a new key or contact admin.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              <div className="ops-section-grid">
                <Card className="ops-detail-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      {isMyanmar ? 'သော့ အခြေအနေ' : 'Key Health'}
                    </CardTitle>
                    <CardDescription>
                      Recent share, client, and delivery activity for this key.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="ops-row-card">
                      <div>
                        <p className="text-sm text-muted-foreground">Usage state</p>
                        <p className="mt-1 text-sm font-medium">
                          {healthDiagnostics?.isActivelyUsed ? (isMyanmar ? 'မကြာသေးခင်က အသုံးပြုထားသည်' : 'Recently active') : (isMyanmar ? 'မလှုပ်ရှားသေးပါ' : 'Idle')}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-full',
                          healthDiagnostics?.isActivelyUsed
                            ? 'border-emerald-500/30 text-emerald-500'
                            : 'border-muted-foreground/30 text-muted-foreground',
                        )}
                      >
                        {healthDiagnostics?.isActivelyUsed ? 'In use' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး ကလိုင်းယင့် ရယူချိန်' : 'Last client fetch'}</p>
                        <p className="font-medium">
                          {healthDiagnostics?.lastClientFetchAt ? formatRelativeTime(healthDiagnostics.lastClientFetchAt) : 'Never'}
                        </p>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး QR scan' : 'Last QR scan'}</p>
                        <p className="font-medium">
                          {healthDiagnostics?.lastQrScanAt ? formatRelativeTime(healthDiagnostics.lastQrScanAt) : 'Never'}
                        </p>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး မျှဝေစာမျက်နှာ ဝင်ကြည့်မှု' : 'Last share page visit'}</p>
                        <p className="font-medium">
                          {healthDiagnostics?.lastSharePageVisitAt ? formatRelativeTime(healthDiagnostics.lastSharePageVisitAt) : 'Never'}
                        </p>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး Telegram ပို့မှု' : 'Last Telegram send'}</p>
                        <p className="font-medium">
                          {healthDiagnostics?.lastTelegramSendAt ? formatRelativeTime(healthDiagnostics.lastTelegramSendAt) : 'Never'}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-3 dark:border-cyan-400/16">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'နောက်ဆုံးတွေ့ရသည့် စက်' : 'Last seen device'}</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">IP</span>
                          <span className="font-mono">{healthDiagnostics?.lastSeenIp || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Country</span>
                          <span>
                            {healthDiagnostics?.lastSeenCountryCode
                              ? `${getCountryFlag(healthDiagnostics.lastSeenCountryCode)} ${healthDiagnostics.lastSeenCountryCode}`
                              : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Platform</span>
                          <span>{healthDiagnostics?.lastSeenPlatform || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{isMyanmar ? 'လက်ရှိ session များ' : 'Active sessions'}</span>
                          <span>{healthDiagnostics?.activeSessionCount ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="ops-detail-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      {t('keys.activity.title')}
                    </CardTitle>
                    <CardDescription>{t('keys.activity.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="ops-row-card">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('keys.activity.state')}</p>
                        <p className="mt-1 text-sm font-medium">
                          {isOnline ? t('keys.status.online') : t('keys.status.no_recent_traffic')}
                        </p>
                      </div>
                      {isOnline ? (
                        <Badge variant="outline" className="rounded-full border-emerald-500/30 text-emerald-500">
                          <Wifi className="mr-1 h-3 w-3" />
                          {t('keys.status.online')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full border-muted-foreground/30 text-muted-foreground">
                          <WifiOff className="mr-1 h-3 w-3" />
                          {t('keys.status.no_recent_traffic')}
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{t('keys.activity.last_traffic')}</p>
                        <p className="font-medium">{lastTrafficAt ? formatRelativeTime(lastTrafficAt) : t('keys.activity.none')}</p>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{t('keys.activity.last_meaningful_usage')}</p>
                        <p className="font-medium">
                          {lastMeaningfulUsageAt ? formatRelativeTime(lastMeaningfulUsageAt) : t('keys.activity.none')}
                        </p>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{t('keys.activity.active_sessions')}</p>
                        <p className="font-medium">{activeSessions}</p>
                      </div>
                      <div className="ops-inline-stat">
                        <p className="text-sm text-muted-foreground">{t('keys.activity.estimated_devices')}</p>
                        <p className="font-medium">{estimatedDevices}</p>
                      </div>
                    </div>

                    <div className="ops-row-card">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('keys.activity.recent_delta')}</p>
                        <p className="mt-1 text-sm font-medium">
                          {recentTrafficDeltaBytes > BigInt(0)
                            ? `+${formatBytes(recentTrafficDeltaBytes)}`
                            : t('keys.activity.no_recent_delta')}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t('keys.activity.window_label')} {activitySnapshot?.activityWindowSeconds ?? Math.round(TRAFFIC_ACTIVE_WINDOW_MS / 1000)}s
                      </span>
                    </div>

                    {isAdmin ? (
                      <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-3 dark:border-cyan-400/16">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {t('keys.activity.admin_debug')}
                        </p>
                        <div className="mt-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t('keys.activity.debug_outline_id')}</span>
                            <span className="font-mono">{activitySnapshot?.outlineKeyId ?? key.outlineKeyId}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t('keys.activity.debug_peak_devices')}</span>
                            <span>{activitySnapshot?.peakDevices ?? (key as any).peakDevices ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t('keys.activity.debug_window')}</span>
                            <span>{activitySnapshot?.activityWindowSeconds ?? Math.round(TRAFFIC_ACTIVE_WINDOW_MS / 1000)}s</span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <ConnectionSessionsCard keyId={key.id} />
            </TabsContent>

            {isAdmin ? (
              <TabsContent value="support" className="mt-0 space-y-4">
                <TelegramBillingHistoryCard
                  title={isMyanmar ? 'ငွေပေးချေမှု မှတ်တမ်း' : 'Billing History'}
                  description={
                    isMyanmar
                      ? 'ဤ key နှင့် သက်ဆိုင်သော Telegram order, renewal နှင့် billing history ကို ကြည့်ရှုပါ။'
                      : 'Review Telegram orders, renewals, and billing events related to this key.'
                  }
                  orders={(key as any).billingHistory ?? []}
                  emptyLabel={
                    isMyanmar
                      ? 'ဤ key အတွက် Telegram billing history မရှိသေးပါ။'
                      : 'No Telegram billing history for this key yet.'
                  }
                />
                <SupportWorkflowCard
                  keyId={key.id}
                  keyName={key.name}
                  telegramDeliveryEnabled={(key as any).telegramDeliveryEnabled ?? true}
                  supportActivity={(key as any).supportActivity ?? []}
                  openIncidents={(key as any).openIncidents ?? []}
                  onUpdated={() => refetch()}
                />
              </TabsContent>
            ) : null}
          </div>

          <div className="ops-detail-rail">
            <Card className="ops-detail-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  {isMyanmar ? 'QR ကုဒ်' : 'QR Code'}
                </CardTitle>
                <CardDescription>
                  {isMyanmar ? 'ချိတ်ဆက်ရန် Shadowsocks ကလိုင်းယင့်ဖြင့် စကင်လုပ်ပါ' : 'Scan with a Shadowsocks client to connect'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                {qrLoading ? (
                  <div className="h-[200px] w-[200px] animate-pulse rounded-[1.25rem] border border-border/60 bg-background/45 dark:bg-white/[0.03]" />
                ) : qrData?.qrCode ? (
                  <QRCodeWithLogo
                    dataUrl={qrData.qrCode}
                    size={200}
                    className="rounded-[1.1rem] bg-white p-2"
                  />
                ) : (
                  <div className="ops-chart-empty h-[200px] w-[200px]">
                    <p className="text-sm text-muted-foreground">{isMyanmar ? 'မဖန်တီးနိုင်ပါ' : 'Failed to generate'}</p>
                  </div>
                )}

                <div className="ops-mobile-action-bar mt-4 grid w-full grid-cols-1 gap-2 md:grid-cols-2">
                  {key.maxDevices && key.boundDeviceInstallsOnly ? (
                    <p className="md:col-span-2 text-xs text-amber-500">{ACCESS_KEY_RAW_COPY_WARNING}</p>
                  ) : null}
                  <Button
                    variant="outline"
                    className="h-auto w-full justify-start px-4 py-3 text-left"
                    onClick={() => copyToClipboard(
                      decoratedAccessUrl,
                      isMyanmar ? 'ကူးယူပြီးပါပြီ!' : 'Copied!',
                      isMyanmar ? 'အသုံးပြုခွင့် URL ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Access URL copied to clipboard.'
                    )}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {key.maxDevices && key.boundDeviceInstallsOnly
                      ? isMyanmar ? 'မူရင်း URL ကို ကူးမည်' : 'Copy raw URL'
                      : isMyanmar ? 'URL ကို ကူးမည်' : 'Copy URL'}
                  </Button>
                  <Button variant="outline" className="h-auto w-full justify-start px-4 py-3 text-left" onClick={handleDownloadQr}>
                    <QrCode className="mr-2 h-4 w-4" />
                    {isMyanmar ? 'QR ကို ဒေါင်းလုဒ်လုပ်မည်' : 'Download QR'}
                  </Button>
                  <Button variant="outline" className="h-auto w-full justify-start px-4 py-3 text-left md:col-span-2" onClick={handleDownloadConfig}>
                    <Download className="mr-2 h-4 w-4" />
                    {isMyanmar ? 'ဆက်တင်ကို ဒေါင်းလုဒ်လုပ်မည်' : 'Download Config'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="ops-detail-card">
              <CardHeader>
                <CardTitle>{isMyanmar ? 'အမြန် အကျဉ်းချုပ်' : 'Snapshot'}</CardTitle>
                <CardDescription>
                  {isMyanmar ? 'အလုပ်လုပ်နေစဉ် အမြဲမြင်နိုင်စေရန် အဓိက identifier များနှင့် ခွဲဝေသတ်မှတ်မှု အသေးစိတ်များကို ပြထားသည်။' : 'Core identifiers and assignment details that should always stay visible while you work.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'Outline သော့ ID' : 'Outline Key ID'}</p>
                  <p className="mt-2 break-all font-mono text-xs text-foreground">{key.outlineKeyId}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အများသုံး အတိုအမည်' : 'Public slug'}</p>
                  <p className="mt-2 break-all font-mono text-xs text-foreground">{key.publicSlug || '-'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဖန်တီးချိန်' : 'Created'}</p>
                  <p className="mt-2 text-sm font-medium">{formatDateTime(key.createdAt)}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး ပြင်ဆင်ချိန်' : 'Updated'}</p>
                  <p className="mt-2 text-sm font-medium">{formatDateTime(key.updatedAt)}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဆာဗာ' : 'Server'}</p>
                  <p className="mt-2 text-sm font-medium">{keyRecord.server?.name || (isMyanmar ? 'မချိတ်ထားပါ' : 'Unassigned')}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ကန့်သတ်ချက် မူဝါဒ' : 'Quota policy'}</p>
                  <p className="mt-2 text-sm font-medium">{key.dataLimitBytes ? (isMyanmar ? 'ကန့်သတ်ထားသည်' : 'Limited') : (isMyanmar ? 'အကန့်အသတ်မရှိ' : 'Unlimited')}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>

      {key && (
        <RenewKeyDialog
          open={renewDialogOpen}
          onOpenChange={setRenewDialogOpen}
          keyData={{
            id: key.id,
            name: key.name,
            status: key.status,
            expiresAt: key.expiresAt,
            dataLimitBytes: key.dataLimitBytes,
            usedBytes: key.usedBytes,
          }}
          isPending={renewMutation.isPending}
          onConfirm={({ months, addDataLimitGB }) => {
            renewMutation.mutate({
              id: key.id,
              months,
              addDataLimitGB,
            });
          }}
        />
      )}

      {/* Edit dialog */}
      {key && (
        <EditKeyDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          keyData={{
            id: key.id,
            name: key.name,
            email: key.email,
            telegramId: key.telegramId,
            notes: key.notes,
            dataLimitBytes: key.dataLimitBytes,
            dataLimitResetStrategy: (key as any).dataLimitResetStrategy,
            durationDays: (key as any).durationDays,
            expiresAt: key.expiresAt,
            expirationType: (key as any).expirationType,
            autoDisableOnLimit: (key as any).autoDisableOnLimit ?? true,
            autoDisableOnExpire: (key as any).autoDisableOnExpire ?? true,
            autoArchiveAfterDays: (key as any).autoArchiveAfterDays ?? 0,
            quotaAlertThresholds: (key as any).quotaAlertThresholds ?? '80,90',
            maxDevices: (key as any).maxDevices ?? null,
            boundDeviceInstallsOnly: (key as any).boundDeviceInstallsOnly ?? Boolean((key as any).maxDevices),
            autoRenewPolicy: (key as any).autoRenewPolicy ?? 'NONE',
            autoRenewDurationDays: (key as any).autoRenewDurationDays ?? null,
          }}
          onSuccess={() => refetch()}
        />
      )}

      {key && (
        <DeleteKeyDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          keyName={key.name}
          onConfirm={confirmDelete}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

/**
 * TrafficGraph Component
 * Displays real-time bandwidth usage for a specific key
 */
function TrafficGraph({
  serverId,
  outlineKeyId
}: {
  serverId: string;
  outlineKeyId: string;
}) {
  const [data, setData] = useState<{ time: number; bytes: number }[]>([]);

  // Poll for live stats
  const { data: stats } = trpc.servers.getLiveStats.useQuery(
    { id: serverId },
    {
      refetchInterval: 2000,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (stats) {
      const now = Date.now();
      const bytes = stats.keyStats?.[outlineKeyId] || 0;

      setData(prev => {
        // Keep last 60 points (approx 2 minutes at 2s interval)
        const newData = [...prev, { time: now, bytes }];
        if (newData.length > 60) newData.shift();
        return newData;
      });
    }
  }, [stats, outlineKeyId]);

  if (data.length < 2) {
    return (
      <div className="ops-chart-empty h-[180px] text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Initializing graph...
      </div>
    );
  }

  return (
    <div className="ops-chart-shell mt-4">
      <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorBytes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 10" vertical={false} stroke="rgba(125, 211, 252, 0.16)" />
          <XAxis
            dataKey="time"
            hide
            domain={['dataMin', 'dataMax']}
          />
          <YAxis
            hide
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              borderRadius: '0.5rem',
            }}
            labelFormatter={() => ''}
            formatter={(value: number) => [formatBytes(value) + '/s', 'Speed']}
          />
          <Area
            type="monotone"
            dataKey="bytes"
            stroke="#22d3ee"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorBytes)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-between px-1 text-xs text-muted-foreground">
        <span>2 mins ago</span>
        <span>Reserved Bandwidth: {formatBytes(data[data.length - 1]?.bytes || 0)}/s</span>
        <span>Live</span>
      </div>
    </div>
  );
}

/**
 * ConnectionSessionsCard Component
 * Displays estimated device count and recent connection sessions
 */
function ConnectionSessionsCard({ keyId }: { keyId: string }) {
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { locale } = useLocale();
  const { data, isLoading } = trpc.keys.getConnectionSessions.useQuery(
    { keyId, limit: 10 },
    { refetchInterval: 30000 } // Refresh every 30 seconds
  );
  const refreshDeviceLimitState = async () => {
    await Promise.all([
      utils.keys.getConnectionSessions.invalidate({ keyId, limit: 10 }),
      utils.keys.getById.invalidate({ id: keyId }),
      utils.keys.getActivitySnapshot.invalidate({ id: keyId }),
      utils.keys.list.invalidate(),
      utils.keys.stats.invalidate(),
    ]);
  };
  const clearWarningMutation = trpc.keys.clearDeviceLimitWarning.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Warning cleared',
        description: 'The device-limit warning was cleared for this key.',
      });
      await refreshDeviceLimitState();
    },
    onError: (error) => {
      toast({
        title: 'Unable to clear warning',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const suppressMutation = trpc.keys.setDeviceLimitSuppression.useMutation({
    onSuccess: async (_result, variables) => {
      toast({
        title: variables.hours ? 'Enforcement suppressed' : 'Enforcement resumed',
        description: variables.hours
          ? `Device-limit enforcement is paused for ${variables.hours} hour${variables.hours === 1 ? '' : 's'}.`
          : 'Device-limit enforcement is active again.',
      });
      await refreshDeviceLimitState();
    },
    onError: (error) => {
      toast({
        title: 'Unable to update suppression',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const toggleStatusMutation = trpc.keys.toggleStatus.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Key re-enabled',
        description: 'The access key is active again and the device-limit state was reset.',
      });
      await refreshDeviceLimitState();
    },
    onError: (error) => {
      toast({
        title: 'Unable to re-enable key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return `${hours}h ${mins}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };
  const disableEta = data?.deviceLimitDisableAt ? formatRelativeTime(data.deviceLimitDisableAt) : null;
  const suppressionEta = data?.deviceLimitSuppressedUntil ? formatRelativeTime(data.deviceLimitSuppressedUntil) : null;
  const isSuppressed = data?.deviceLimitEnforcementStage === 'SUPPRESSED';
  const isAutoDisabled = Boolean(data?.deviceLimitAutoDisabledAt);
  const hasWarningState = data?.deviceLimitEnforcementStage === 'WARNED' || data?.deviceLimitEnforcementStage === 'PENDING_DISABLE';
  const deviceEvidence = data?.subscriberDevices ?? [];
  const isMutating = clearWarningMutation.isPending || suppressMutation.isPending || toggleStatusMutation.isPending;

  if (isLoading) {
    return (
      <Card className="ops-detail-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            {locale === 'my' ? 'ချိတ်ဆက်မှုများ' : 'Connections'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 rounded-[1.2rem] border border-border/60 bg-background/45 animate-pulse dark:bg-white/[0.03]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="ops-detail-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          {locale === 'my' ? 'ချိတ်ဆက်မှုများ' : 'Connections'}
        </CardTitle>
        <CardDescription>
          {locale === 'my' ? 'အသုံးပြုမှု လှုပ်ရှားမှုပုံစံအရ ခန့်မှန်းထားသော စက်အသုံးပြုမှု' : 'Estimated device usage based on traffic patterns'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="ops-inline-stat text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              {(data?.activeCount || 0) > 0 ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-2xl font-bold">{data?.estimatedDevices || 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">{locale === 'my' ? 'လက်ရှိ အသုံးပြုနေသော စက်များ' : 'Active Devices'}</p>
          </div>
          <div className="ops-inline-stat text-center">
            <div className="text-2xl font-bold">{data?.peakDevices || 0}</div>
            <p className="text-xs text-muted-foreground">{locale === 'my' ? 'အများဆုံး စက်အရေအတွက်' : 'Peak Devices'}</p>
          </div>
        </div>

        {data?.maxDevices ? (
          <div
            className={cn(
              'rounded-xl border px-4 py-3 text-sm',
              isAutoDisabled
                ? 'border-red-500/30 bg-red-500/10'
                : data.deviceLimitOverLimit
                ? 'border-violet-500/30 bg-violet-500/10'
                : 'border-border/60 bg-background/45 dark:bg-white/[0.03]',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{locale === 'my' ? 'ခန့်မှန်း စက်ကန့်သတ်ချက်' : 'Soft device limit'}</p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'my'
                    ? `ခန့်မှန်းထားသော စက်အရေအတွက်: ${data.deviceLimitObservedDevices ?? data.estimatedDevices ?? 0} / ${data.maxDevices}`
                    : `Estimated devices: ${data.deviceLimitObservedDevices ?? data.estimatedDevices ?? 0} / ${data.maxDevices}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'my'
                    ? `Install gating: ${data.boundDeviceInstallsOnly ? 'Share page / client URL only' : 'Raw config ကို အသုံးပြုခွင့်ရှိသေးသည်'}`
                    : `Install gating: ${data.boundDeviceInstallsOnly ? 'Share page / client URL only' : 'Raw config still allowed'}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'my'
                    ? 'မျှဝေခြင်းတားဆီးမှု ပိုမိုကောင်းစေရန်၊ ပြန်လည်အသုံးပြုနိုင်သော standard access key အစား dynamic key ဖြင့် ပို့ဆောင်ပါ။'
                    : 'For stronger anti-sharing, deliver this user through a dynamic key instead of a reusable standard access key.'}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'border',
                  isAutoDisabled
                    ? 'border-red-500/40 text-red-300'
                    : data.deviceLimitOverLimit
                      ? 'border-violet-500/40 text-violet-300'
                      : isSuppressed
                        ? 'border-sky-500/40 text-sky-300'
                        : 'border-border/60 text-muted-foreground',
                )}
              >
                {isAutoDisabled
                  ? 'Auto-disabled'
                  : data.deviceLimitEnforcementStage === 'PENDING_DISABLE'
                  ? 'Disable pending'
                  : isSuppressed
                    ? 'Suppressed'
                  : data.deviceLimitOverLimit
                    ? 'Over limit'
                    : 'Within limit'}
              </Badge>
            </div>
            {isAutoDisabled ? (
              <p className="mt-2 text-xs text-red-100/90">
                This key was auto-disabled after the device estimate stayed above the configured limit. Re-enable it after you review the
                recent device evidence below.
              </p>
            ) : isSuppressed ? (
              <p className="mt-2 text-xs text-sky-100/90">
                Enforcement is paused for this key{suppressionEta ? ` (${suppressionEta})` : ''}. The estimated device count still updates,
                but warnings and auto-disable are temporarily skipped.
              </p>
            ) : data.deviceLimitOverLimit ? (
              <p className="mt-2 text-xs text-violet-100/90">
                This key is over the configured device limit. If the estimate stays over the limit, it will disable automatically
                {disableEta ? ` (${disableEta}).` : '.'}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Device counts are estimated from recent traffic plus share/subscription activity.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {hasWarningState ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={isMutating}
                  onClick={() => clearWarningMutation.mutate({ id: keyId })}
                >
                  Clear warning
                </Button>
              ) : null}
              {isSuppressed ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={isMutating}
                  onClick={() => suppressMutation.mutate({ id: keyId, hours: null })}
                >
                  Resume enforcement
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={isMutating}
                    onClick={() => suppressMutation.mutate({ id: keyId, hours: 4 })}
                  >
                    Suppress 4h
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={isMutating}
                    onClick={() => suppressMutation.mutate({ id: keyId, hours: 24 })}
                  >
                    Suppress 24h
                  </Button>
                </>
              )}
              {isAutoDisabled ? (
                <Button
                  size="sm"
                  className="h-8"
                  disabled={isMutating}
                  onClick={() => toggleStatusMutation.mutate({ id: keyId })}
                >
                  Re-enable key
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Recent Sessions */}
        {data?.sessions && data.sessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent Sessions</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.sessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg text-sm",
                    session.isActive ? "bg-green-500/10" : "bg-background/45 dark:bg-white/[0.03]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        session.isActive ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
                      )}
                    />
                    <span className="text-muted-foreground">
                      {formatRelativeTime(session.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatDuration(session.durationMinutes)}
                    </span>
                    <span className="font-mono">
                      {formatBytes(BigInt(session.bytesUsed))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {deviceEvidence.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Recent Device Evidence</p>
                <p className="text-xs text-muted-foreground">Estimated from share/subscription activity in the last 30 minutes.</p>
              </div>
              <Badge variant="outline" className="border-border/60 text-muted-foreground">
                {deviceEvidence.length} seen
              </Badge>
            </div>
            <div className="space-y-2">
              {deviceEvidence.slice(0, 8).map((device, index) => (
                <div
                  key={`${device.ip || 'unknown'}-${index}`}
                  className="rounded-lg border border-border/60 bg-background/45 px-3 py-2 text-sm dark:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{device.ip || 'Unknown IP'}</span>
                        <Badge variant="outline" className="border-border/60 text-[10px] text-muted-foreground">
                          {device.countryCode ? `${getCountryFlag(device.countryCode)} ${device.countryCode}` : 'Unknown country'}
                        </Badge>
                      </div>
                      {device.userAgent ? (
                        <p className="mt-1 line-clamp-2 break-all text-[11px] text-muted-foreground">{device.userAgent}</p>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {device.lastSeenAt ? formatRelativeTime(device.lastSeenAt) : 'Never'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Platform: {device.platform || 'Unknown platform'}</span>
                    <span>Last seen: {device.lastSeenAt ? formatDateTime(device.lastSeenAt) : 'Never'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!data?.sessions || data.sessions.length === 0) && deviceEvidence.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No connection sessions recorded yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
