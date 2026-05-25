'use client';

/**
 * Dynamic Access Key Detail Page
 *
 * This page provides a comprehensive view of a single Dynamic Access Key,
 * including its configuration, attached keys, usage statistics, and
 * management controls.
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { buildDownloadFilename, downloadDataUrl, downloadTextFile } from '@/lib/download';
import { normalizePublicSlug } from '@/lib/public-slug';
import { getQuotaAlertState } from '@/lib/access-key-policies';
import {
  buildDynamicOutlineUrl,
  buildDynamicDistributionLinkUrl,
  buildDynamicShortClientUrl,
  buildDynamicShortShareUrl,
  buildDynamicSharePageUrl,
  buildDynamicSubscriptionApiUrl,
  getPublicBasePath,
} from '@/lib/subscription-links';
import QRCode from 'qrcode';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  KeyRound,
  Copy,
  QrCode,
  Edit,
  Trash2,
  Activity,
  Clock,
  Link2,
  Shuffle,
  Settings,
  CheckCircle2,
  XCircle,
  Key,
  Server,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  Palette,
  Image as ImageIcon,
  Phone,
  X,
  Smartphone,
  AlertTriangle,
  Wifi,
  WifiOff,
  RotateCw,
  MessageSquare,
  Eye,
  Download,
  Pin,
  PinOff,
  ArrowRightLeft,
  FlaskConical,
} from 'lucide-react';
import { themeList, getTheme, subscriptionThemeIds } from '@/lib/subscription-themes';
import { TrafficHistoryChart } from '@/components/charts/TrafficHistoryChart';
import { ClientEndpointTestCard } from '@/components/subscription/client-endpoint-test-card';
import { TelegramBillingHistoryCard } from '@/components/telegram/telegram-billing-history-card';
import {
  DynamicRoutingPreferencesEditor,
  type DynamicRoutingPreferenceMode,
} from '@/components/dynamic-keys/dynamic-routing-preferences-editor';
import {
  DYNAMIC_ROUTING_ALERT_RULE_DEFINITIONS,
  DynamicRoutingAlertRulesEditor,
  parseDynamicRoutingAlertRules,
} from '@/components/dynamic-keys/dynamic-routing-alert-rules-editor';

// Contact type options for subscription page
const CONTACT_TYPES = [
  { value: 'telegram', icon: '📱' },
  { value: 'discord', icon: '🎮' },
  { value: 'whatsapp', icon: '💬' },
  { value: 'phone', icon: '📞' },
  { value: 'email', icon: '📧' },
  { value: 'website', icon: '🌐' },
  { value: 'facebook', icon: '👤' },
] as const;

interface ContactLink {
  type: typeof CONTACT_TYPES[number]['value'];
  value: string;
}

/**
 * DAK Type configuration
 */
const DAK_TYPES = {
  SELF_MANAGED: {
    labelKey: 'dynamic_keys.type.self_managed',
    descriptionKey: 'dynamic_keys.dialog.type.self_managed_desc',
    icon: Shuffle,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  MANUAL: {
    labelKey: 'dynamic_keys.type.manual',
    descriptionKey: 'dynamic_keys.dialog.type.manual_desc',
    icon: Settings,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
};

/**
 * EditDAKDialog Component
 * 
 * A dialog for editing Dynamic Key properties such as name, data limit,
 * duration, and expiration date.
 */
function EditDAKDialog({
  open,
  onOpenChange,
  dakData,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dakData: {
    id: string;
    name: string;
    email: string | null;
    telegramId: string | null;
    notes: string | null;
    dataLimitBytes: bigint | null;
    maxDevices: number | null;
    boundDeviceInstallsOnly: boolean | null;
    durationDays: number | null;
    expiresAt: Date | null;
    loadBalancerAlgorithm: string;
    serverTagIds: string[];
    preferredServerIds: string[];
    preferredCountryCodes: string[];
    preferredRegionMode: DynamicRoutingPreferenceMode;
    preferredServerWeights: Record<string, number>;
    preferredCountryWeights: Record<string, number>;
    sessionStickinessMode: 'NONE' | 'DRAIN';
    drainGraceMinutes: number;
    rotationTriggerMode: 'SCHEDULED' | 'USAGE' | 'HEALTH' | 'COMBINED';
    rotationUsageThresholdPercent: number;
    rotateOnHealthFailure: boolean;
    autoClearStalePins: boolean;
    autoFallbackToPrefer: boolean;
    autoSkipUnhealthy: boolean;
    routingAlertRules: string | null;
  };
  onSuccess: () => void;
}) {
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: dakData.name,
    email: dakData.email || '',
    telegramId: dakData.telegramId || '',
    notes: dakData.notes || '',
    dataLimitGB: dakData.dataLimitBytes
      ? (Number(dakData.dataLimitBytes) / (1024 * 1024 * 1024)).toString()
      : '',
    maxDevices: dakData.maxDevices?.toString() || '',
    boundDeviceInstallsOnly: dakData.boundDeviceInstallsOnly ?? Boolean(dakData.maxDevices),
    durationDays: dakData.durationDays?.toString() || '',
    expiresAt: dakData.expiresAt ? new Date(dakData.expiresAt).toISOString().split('T')[0] : '',
    loadBalancerAlgorithm: dakData.loadBalancerAlgorithm || 'IP_HASH',
    serverTagIds: dakData.serverTagIds || [],
    preferredServerIds: dakData.preferredServerIds || [],
    preferredCountryCodes: dakData.preferredCountryCodes || [],
    preferredRegionMode: dakData.preferredRegionMode || 'PREFER',
    preferredServerWeights: dakData.preferredServerWeights || {},
    preferredCountryWeights: dakData.preferredCountryWeights || {},
    sessionStickinessMode: dakData.sessionStickinessMode || 'DRAIN',
    drainGraceMinutes: dakData.drainGraceMinutes || 20,
    rotationTriggerMode: dakData.rotationTriggerMode || 'SCHEDULED',
    rotationUsageThresholdPercent: dakData.rotationUsageThresholdPercent || 85,
    rotateOnHealthFailure: dakData.rotateOnHealthFailure ?? false,
    autoClearStalePins: dakData.autoClearStalePins ?? true,
    autoFallbackToPrefer: dakData.autoFallbackToPrefer ?? false,
    autoSkipUnhealthy: dakData.autoSkipUnhealthy ?? false,
    routingAlertRules: dakData.routingAlertRules || '',
  });

  useEffect(() => {
    setFormData({
      name: dakData.name,
      email: dakData.email || '',
      telegramId: dakData.telegramId || '',
      notes: dakData.notes || '',
      dataLimitGB: dakData.dataLimitBytes
        ? (Number(dakData.dataLimitBytes) / (1024 * 1024 * 1024)).toString()
        : '',
      maxDevices: dakData.maxDevices?.toString() || '',
      boundDeviceInstallsOnly: dakData.boundDeviceInstallsOnly ?? Boolean(dakData.maxDevices),
      durationDays: dakData.durationDays?.toString() || '',
      expiresAt: dakData.expiresAt ? new Date(dakData.expiresAt).toISOString().split('T')[0] : '',
      loadBalancerAlgorithm: dakData.loadBalancerAlgorithm || 'IP_HASH',
      serverTagIds: dakData.serverTagIds || [],
      preferredServerIds: dakData.preferredServerIds || [],
      preferredCountryCodes: dakData.preferredCountryCodes || [],
      preferredRegionMode: dakData.preferredRegionMode || 'PREFER',
      preferredServerWeights: dakData.preferredServerWeights || {},
      preferredCountryWeights: dakData.preferredCountryWeights || {},
      sessionStickinessMode: dakData.sessionStickinessMode || 'DRAIN',
      drainGraceMinutes: dakData.drainGraceMinutes || 20,
      rotationTriggerMode: dakData.rotationTriggerMode || 'SCHEDULED',
      rotationUsageThresholdPercent: dakData.rotationUsageThresholdPercent || 85,
      rotateOnHealthFailure: dakData.rotateOnHealthFailure ?? false,
      autoClearStalePins: dakData.autoClearStalePins ?? true,
      autoFallbackToPrefer: dakData.autoFallbackToPrefer ?? false,
      autoSkipUnhealthy: dakData.autoSkipUnhealthy ?? false,
      routingAlertRules: dakData.routingAlertRules || '',
    });
  }, [dakData]);

  const updateMutation = trpc.dynamicKeys.update.useMutation({
    onSuccess: () => {
      toast({
        title: t('dynamic_keys.toast.updated_title'),
        description: t('dynamic_keys.toast.updated_desc'),
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.toast.update_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('dynamic_keys.toast.validation_error'),
        description: t('dynamic_keys.toast.name_required'),
        variant: 'destructive',
      });
      return;
    }

    updateMutation.mutate({
      id: dakData.id,
      name: formData.name.trim(),
      email: formData.email || undefined,
      telegramId: formData.telegramId || undefined,
      notes: formData.notes || undefined,
      dataLimitGB: formData.dataLimitGB ? parseFloat(formData.dataLimitGB) : undefined,
      maxDevices: formData.maxDevices ? parseInt(formData.maxDevices, 10) : null,
      boundDeviceInstallsOnly: formData.maxDevices ? formData.boundDeviceInstallsOnly : false,
      durationDays: formData.durationDays ? parseInt(formData.durationDays) : undefined,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined,
      loadBalancerAlgorithm: formData.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD',
      serverTagIds: formData.serverTagIds,
      preferredServerIds: formData.preferredServerIds,
      preferredCountryCodes: formData.preferredCountryCodes,
      preferredRegionMode: formData.preferredRegionMode,
      preferredServerWeights: formData.preferredServerWeights,
      preferredCountryWeights: formData.preferredCountryWeights,
      sessionStickinessMode: formData.sessionStickinessMode,
      drainGraceMinutes: formData.drainGraceMinutes,
      rotationTriggerMode: formData.rotationTriggerMode,
      rotationUsageThresholdPercent: formData.rotationUsageThresholdPercent,
      rotateOnHealthFailure: formData.rotateOnHealthFailure,
      autoClearStalePins: formData.autoClearStalePins,
      autoFallbackToPrefer: formData.autoFallbackToPrefer,
      autoSkipUnhealthy: formData.autoSkipUnhealthy,
      routingAlertRules: formData.routingAlertRules || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto p-0 sm:max-w-[min(820px,calc(100vw-2rem))]">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{t('dynamic_keys.dialog.edit_title')}</DialogTitle>
          <DialogDescription>
            {t('dynamic_keys.dialog.edit_desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'အမှတ်အသားနှင့် အသုံးပြုခွင့် ပြတင်းပေါက်' : 'Identity and access window'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar
                    ? 'ဤလမ်းကြောင်းသတ်မှတ်ချက်အတွက် ဖောက်သည်မြင်ရမည့် အချက်အလက်များ၊ ဒေတာကန့်သတ်ချက်နှင့် သက်တမ်းဆက်တင်များကို ကိုက်ညီအောင် ထိန်းထားပါ။'
                    : 'Keep the customer-facing details, quota, and expiry settings aligned for this routing profile.'}
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

                <div className="space-y-2">
                  <Label htmlFor="editDataLimit">{isMyanmar ? 'ဒေတာကန့်သတ်ချက် (GB)' : 'Data limit (GB)'}</Label>
                  <Input
                    id="editDataLimit"
                    type="number"
                    placeholder={isMyanmar ? 'မကန့်သတ်လိုပါက ဗလာထားပါ' : 'Leave empty for unlimited'}
                    value={formData.dataLimitGB}
                    onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
                    min="0"
                    step="0.5"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editMaxDevices">{isMyanmar ? 'စီမံထားသော စက်အရေအတွက် ကန့်သတ်ချက် (ခန့်မှန်း)' : 'Managed device limit (estimated)'}</Label>
                  <Input
                    id="editMaxDevices"
                    type="number"
                    min="1"
                    max="20"
                    placeholder={isMyanmar ? 'ကန့်သတ်ချက် မရှိစေရန် ဗလာထားပါ' : 'Leave blank for no limit'}
                    value={formData.maxDevices}
                    onChange={(e) => setFormData({ ...formData, maxDevices: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar
                      ? 'ပိုမိုခိုင်မာသော မျှဝေမှုပိတ်ဆို့မှုအတွက် အကြံပြုပါသည်။ ဖောက်သည်များသည် ပြန်လည်အသုံးပြုနိုင်သော raw ss:// secret တစ်ခုကို မရဘဲ စီမံထားသော မျှဝေစာမျက်နှာ သို့မဟုတ် Outline client URL ပေါ်တွင်သာ ရှိနေမည်ဖြစ်သည်။'
                      : 'Recommended for stronger anti-sharing. Customers stay on the managed share page or Outline client URL instead of receiving one reusable raw ss:// secret.'}
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/55 px-4 py-3 sm:col-span-2 dark:bg-white/[0.03]">
                  <div className="space-y-0.5">
                    <Label htmlFor="editBoundDeviceInstallsOnly" className="text-sm font-medium">
                      {isMyanmar ? 'စီမံထားသော ထည့်သွင်းလမ်းကြောင်းကိုသာ ထိန်းမည်' : 'Keep managed install flow only'}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {isMyanmar
                        ? 'စက်ကန့်သတ်ချက် သတ်မှတ်ထားသည့်အခါ ဖောက်သည်မြင်ရမည့် ထည့်သွင်းမျက်နှာပြင်များတွင် ပြန်သုံးနိုင်သော raw config ကို ဖျောက်ထားပြီး ထည့်သွင်းမှုများကို မျှဝေစာမျက်နှာ သို့မဟုတ် Outline client URL နှင့်သာ ချိတ်ဆက်ထားစေပါမည်။'
                        : 'Hide the reusable raw config from customer-facing install screens and keep installs tied to the share page or Outline client URL when a device limit is set.'}
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

                <div className="space-y-2">
                  <Label htmlFor="editDuration">{locale === 'my' ? 'သက်တမ်း (ရက်)' : 'Duration (days)'}</Label>
                  <Input
                    id="editDuration"
                    type="number"
                    placeholder={locale === 'my' ? 'ဥပမာ 30၊ 45၊ 60' : 'e.g., 30, 45, 60'}
                    value={formData.durationDays}
                    onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {locale === 'my'
                      ? 'ဤနေရာတွင် သတ်မှတ်ထားသော ရက်အရေအတွက်အတိုင်း သက်တမ်းကုန်ရက်ကို ပြန်တွက်မည်။'
                      : 'Recalculates the expiration date from the duration you set here.'}
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="editExpiration">{locale === 'my' ? 'သက်တမ်းကုန်ရက်' : 'Expiration date'}</Label>
                  <Input
                    id="editExpiration"
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  />
                </div>
              </div>
            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{locale === 'my' ? 'လမ်းကြောင်းဆိုင်ရာ မူဝါဒ' : 'Routing strategy'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {locale === 'my'
                    ? 'Traffic ကို ဘယ်လိုခွဲမည်၊ မည်သည့် region သို့မဟုတ် server များကို အရင်ဦးစားပေးမည်ကို သတ်မှတ်ပါ။'
                    : 'Choose how traffic is distributed and which regions or servers should be preferred first.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{locale === 'my' ? 'ဝန်ခွဲစနစ် အယ်လဂိုရီသမ်' : 'Load balancer algorithm'}</Label>
                  <Select
                    value={formData.loadBalancerAlgorithm}
                    onValueChange={(value) => setFormData({ ...formData, loadBalancerAlgorithm: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={locale === 'my' ? 'အယ်လဂိုရီသမ်ကို ရွေးပါ' : 'Select algorithm'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IP_HASH">{locale === 'my' ? 'IP Hash (တည်ငြိမ်)' : 'IP Hash (consistent)'}</SelectItem>
                      <SelectItem value="RANDOM">{locale === 'my' ? 'ကျပန်း' : 'Random'}</SelectItem>
                      <SelectItem value="ROUND_ROBIN">{locale === 'my' ? 'အလှည့်ကျ' : 'Round robin'}</SelectItem>
                      <SelectItem value="LEAST_LOAD">{locale === 'my' ? 'ဝန်အနည်းဆုံး (စမတ်)' : 'Least load (smart)'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.loadBalancerAlgorithm === 'LEAST_LOAD'
                      ? (locale === 'my'
                        ? 'လက်ရှိ ဝန်အနည်းဆုံးရှိသော server သို့ ပို့ဆောင်မည်။'
                        : 'Routes to the server with the lowest current load.')
                      : formData.loadBalancerAlgorithm === 'IP_HASH'
                        ? (locale === 'my'
                          ? 'ဖြစ်နိုင်လျှင် client IP တစ်ခုကို backend တစ်ခုတည်းပေါ်တွင် တည်ငြိမ်စွာ ထားမည်။'
                          : 'Keeps the same client IP on the same backend when possible.')
                        : formData.loadBalancerAlgorithm === 'ROUND_ROBIN'
                          ? (locale === 'my'
                            ? 'backend များကို အစဉ်လိုက် အလှည့်ကျ အသုံးပြုမည်။'
                            : 'Cycles through backends in sequence.')
                          : (locale === 'my'
                            ? 'backend တစ်ခုကို ကျပန်းရွေးချယ်မည်။'
                            : 'Chooses a backend randomly.')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{locale === 'my' ? 'ဦးစားပေး လမ်းကြောင်းအစီအစဉ်' : 'Preferred routing order'}</Label>
                  <DynamicRoutingPreferencesEditor
                    preferredRegionMode={formData.preferredRegionMode}
                    serverTagIds={formData.serverTagIds}
                    preferredServerIds={formData.preferredServerIds}
                    preferredCountryCodes={formData.preferredCountryCodes}
                    preferredServerWeights={formData.preferredServerWeights}
                    preferredCountryWeights={formData.preferredCountryWeights}
                    sessionStickinessMode={formData.sessionStickinessMode}
                    drainGraceMinutes={formData.drainGraceMinutes}
                    compact
                    onChange={(next) =>
                      setFormData((current) => ({
                        ...current,
                        preferredRegionMode: next.preferredRegionMode,
                        serverTagIds: next.serverTagIds,
                        preferredServerIds: next.preferredServerIds,
                        preferredCountryCodes: next.preferredCountryCodes,
                        preferredServerWeights: next.preferredServerWeights,
                        preferredCountryWeights: next.preferredCountryWeights,
                        sessionStickinessMode: next.sessionStickinessMode,
                        drainGraceMinutes: next.drainGraceMinutes,
                      }))
                    }
                  />
                </div>
              </div>
            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{locale === 'my' ? 'လှည့်ပြောင်းမှုနှင့် အလိုအလျောက် ပြန်လည်သက်သာရေး' : 'Rotation and auto recovery'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {locale === 'my'
                    ? 'backend တစ်ခုမှ ဘယ်အချိန် လှည့်ပြောင်းမည်နှင့် ပြန်လည်သက်သာရေးကို ဘယ်လောက်တက်ကြွစွာ လုပ်မည်ကို ထိန်းချုပ်ပါ။'
                    : 'Control when the profile should rotate away from a backend and how aggressively it should recover.'}
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="space-y-4">
                <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{locale === 'my' ? 'အစပျိုးမုဒ်' : 'Trigger mode'}</Label>
                      <Select
                        value={formData.rotationTriggerMode}
                        onValueChange={(value: typeof formData.rotationTriggerMode) =>
                          setFormData((current) => ({ ...current, rotationTriggerMode: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SCHEDULED">{locale === 'my' ? 'အချိန်ဇယားအတိုင်းသာ' : 'Schedule only'}</SelectItem>
                          <SelectItem value="USAGE">{locale === 'my' ? 'ကန့်သတ်ချက် အဆင့်' : 'Quota threshold'}</SelectItem>
                          <SelectItem value="HEALTH">{locale === 'my' ? 'ကျန်းမာရေး ပြဿနာ' : 'Health issue'}</SelectItem>
                          <SelectItem value="COMBINED">{locale === 'my' ? 'အချိန်ဇယား + ကန့်သတ်ချက် + ကျန်းမာရေး' : 'Schedule + quota + health'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(formData.rotationTriggerMode === 'USAGE' || formData.rotationTriggerMode === 'COMBINED') && (
                      <div className="space-y-2">
                        <Label>{locale === 'my' ? 'အသုံးပြုမှု အဆင့် (%)' : 'Usage threshold (%)'}</Label>
                        <Input
                          type="number"
                          min="50"
                          max="100"
                          value={formData.rotationUsageThresholdPercent}
                          onChange={(event) =>
                            setFormData((current) => ({
                              ...current,
                              rotationUsageThresholdPercent: Math.max(50, Math.min(100, Number(event.target.value) || 85)),
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>

                  {(formData.rotationTriggerMode === 'HEALTH' || formData.rotationTriggerMode === 'COMBINED') && (
                    <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-3">
                      <div>
                              <p className="text-sm font-medium">{locale === 'my' ? 'ကျန်းမာရေး ချို့ယွင်းလျှင် လှည့်ပြောင်းမည်' : 'Rotate on health failure'}</p>
                              <p className="text-xs text-muted-foreground">
                          {locale === 'my'
                            ? 'ဝန်ဆောင်မှုပေးနေသော ဆာဗာ ပျက်စီး သို့မဟုတ် ကျနေပါက နောက်ခံချိတ်ဆက်မှု အသစ်သို့ အတင်းလှည့်ပြောင်းမည်။'
                            : 'Force a fresh backend when a serving server is degraded or down.'}
                              </p>
                            </div>
                      <Switch
                        checked={formData.rotateOnHealthFailure}
                        onCheckedChange={(checked) =>
                          setFormData((current) => ({ ...current, rotateOnHealthFailure: checked === true }))
                        }
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4 rounded-xl border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                  <h4 className="text-sm font-semibold">{t('dynamic_keys.routing.auto_recovery.title')}</h4>
                  <div className="flex items-center justify-between space-x-2">
                    <div className="space-y-0.5">
                      <Label>{t('dynamic_keys.routing.auto_recovery.clear_stale_pins')}</Label>
                      <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.auto_recovery.clear_stale_pins_desc')}</p>
                    </div>
                    <Switch
                      checked={formData.autoClearStalePins}
                      onCheckedChange={(checked) => setFormData({ ...formData, autoClearStalePins: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between space-x-2">
                    <div className="space-y-0.5">
                      <Label>{t('dynamic_keys.routing.auto_recovery.relax_only')}</Label>
                      <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.auto_recovery.relax_only_desc')}</p>
                    </div>
                    <Switch
                      checked={formData.autoFallbackToPrefer}
                      onCheckedChange={(checked) => setFormData({ ...formData, autoFallbackToPrefer: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between space-x-2">
                    <div className="space-y-0.5">
                      <Label>{t('dynamic_keys.routing.auto_recovery.skip_unhealthy')}</Label>
                      <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.auto_recovery.skip_unhealthy_desc')}</p>
                    </div>
                    <Switch
                      checked={formData.autoSkipUnhealthy}
                      onCheckedChange={(checked) => setFormData({ ...formData, autoSkipUnhealthy: checked })}
                    />
                  </div>
                </div>

                <DynamicRoutingAlertRulesEditor
                  value={formData.routingAlertRules}
                  onChange={(nextValue) => setFormData((current) => ({ ...current, routingAlertRules: nextValue }))}
                  compact
                />
              </div>
            </DialogSection>

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{locale === 'my' ? 'မှတ်စုများ' : 'Notes'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {locale === 'my'
                    ? 'support၊ migration သို့မဟုတ် routing ဆိုင်ရာ ဆုံးဖြတ်ချက်များအတွက် အတွင်းရေးမှတ်စုထားပါ။'
                    : 'Keep an internal note for support, migration, or routing decisions.'}
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="space-y-2">
                <Label htmlFor="editNotes">{locale === 'my' ? 'မှတ်စု' : 'Notes'}</Label>
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
              {t('dynamic_keys.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('dynamic_keys.dialog.save_changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * SubscriptionShareCard Component
 *
 * Card for sharing the subscription page with theme selection, cover image, and contact links.
 */
function SubscriptionShareCard({
  dakId,
  keyName,
  dynamicUrl,
  publicSlug,
  currentTheme,
  currentCoverImage,
  currentCoverImageType,
  currentContactLinks,
  currentWelcomeMessage,
  currentSharePageEnabled,
  onUpdate,
}: {
  dakId: string;
  keyName: string;
  dynamicUrl: string | null;
  publicSlug: string | null;
  currentTheme: string | null;
  currentCoverImage: string | null;
  currentCoverImageType: string | null;
  currentContactLinks: ContactLink[] | null;
  currentWelcomeMessage: string | null;
  currentSharePageEnabled: boolean;
  onUpdate: () => void;
}) {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const shareUi = {
    title: isMyanmar ? 'မျှဝေစာမျက်နှာ' : 'Share Page',
    description: isMyanmar ? 'အသုံးပြုသူထံသို့ စာရင်းသွင်းမှု စာမျက်နှာကို လှပစွာ မျှဝေပါ။' : 'Share a beautiful subscription page with your user',
    enabled: isMyanmar ? 'မျှဝေစာမျက်နှာကို ဖွင့်ထားမည်' : 'Share Page Enabled',
    enabledDesc: isMyanmar ? 'ပြောင်းလဲနိုင်သောသော့ သို့မဟုတ် ကလိုင်းယင့်ချိတ်ဆက်လင့်ခ်ကို မပိတ်ဘဲ အများမြင် မျှဝေစာမျက်နှာကိုသာ ပိတ်နိုင်သည်။' : 'Disable the public share page without disabling the dynamic key or client URLs.',
    theme: isMyanmar ? 'စာမျက်နှာ အပြင်အဆင်' : 'Page Theme',
    selectTheme: isMyanmar ? 'အပြင်အဆင်ကို ရွေးပါ' : 'Select theme',
    backgroundImage: isMyanmar ? 'နောက်ခံပုံ (ရွေးချယ်နိုင်သည်)' : 'Background Image (Optional)',
    backgroundImageHelp: isMyanmar ? 'ပုံထည့်ပါက စာမျက်နှာအပြည့် နောက်ခံပုံအဖြစ် အသုံးပြုမည်။ သတ်မှတ်ထားသော အပြင်အဆင်အရောင်ကို အစားထိုးနိုင်သည်။' : 'Use image as full-page background theme. Overrides color theme when set.',
    contactLinks: isMyanmar ? 'ဆက်သွယ်ရန် လင့်ခ်များ' : 'Contact Links',
    contactPlaceholder: isMyanmar ? 'လင့်ခ် သို့မဟုတ် ID ကို ထည့်ပါ' : 'Enter link or ID',
    welcomeOverride: isMyanmar ? 'ကြိုဆိုစာ အစားထိုးသတ်မှတ်ချက်' : 'Welcome Message Override',
    welcomePlaceholder: isMyanmar ? 'ဤပြောင်းလဲသတ်မှတ်သော့၏ မျှဝေစာမျက်နှာ အပေါ်ဘက်တွင် ပြသမည့် စာသားဖြစ်သည်။ မဖြည့်ပါက မူလ ကြိုဆိုစာကို အသုံးပြုမည်။' : "Shown near the top of this key's share page. Leave empty to use the global message.",
    welcomeHelp: isMyanmar ? 'ဤပြောင်းလဲသတ်မှတ်သော့အတွက်သာ မူလ စာရင်းသွင်းမှု စာမျက်နှာ ကြိုဆိုစာကို အစားထိုးမည်။' : 'This overrides the global subscription page welcome message for this dynamic key only.',
    preview: isMyanmar ? 'အစမ်းကြည့်မည်' : 'Preview',
    previewImage: isMyanmar ? 'ပုံနောက်ခံကို ဖွင့်ထားသည်' : 'Image Background',
    previewColorOnly: isMyanmar ? 'အရောင်အပြင်အဆင်သာ' : 'Color theme only',
    previewCustomWelcome: isMyanmar ? 'ကိုယ်ပိုင်ကြိုဆိုစာကို အသုံးပြုနေသည်' : 'Custom welcome message enabled',
    previewGlobalWelcome: isMyanmar ? 'မူလကြိုဆိုစာကို အသုံးပြုနေသည်' : 'Using global welcome message',
    previewContacts: isMyanmar ? 'ဆက်သွယ်ရန် အမြန်ခလုတ်များ' : 'Contact shortcuts',
    previewAddToOutline: isMyanmar ? 'Outline ထဲသို့ ထည့်မည်' : 'Add to Outline',
    shortSlug: isMyanmar ? 'အတိုလင့်ခ် အမည်တို' : 'Short Link Slug',
    slugPlaceholder: isMyanmar ? 'my-dynamic-key' : 'my-dynamic-key',
    slugHelp: isMyanmar ? 'အတို မျှဝေစာမျက်နှာ URL နှင့် Outline ကလိုင်းယင့် လင့်ခ်အတွက် အသုံးပြုသည်။' : 'Used for the short share page and short Outline client URL.',
    regenerateShortSlug: isMyanmar ? 'အတိုလင့်ခ် အမည်တိုကို ပြန်ဖန်တီးမည်' : 'Regenerate short slug',
    copyLink: isMyanmar ? 'လင့်ခ်ကို ကူးယူမည်' : 'Copy Link',
    copyClientUrl: isMyanmar ? 'ကလိုင်းယင့် URL ကို ကူးယူမည်' : 'Copy Client URL',
    connectTelegram: isMyanmar ? 'Telegram နှင့် ချိတ်ဆက်လင့်ခ် ဖန်တီးမည်' : 'Connect Telegram',
    sendTelegram: isMyanmar ? 'Telegram ဖြင့် ပို့မည်' : 'Send via Telegram',
    regenerateLink: isMyanmar ? 'လင့်ခ်ကို ပြန်ဖန်တီးမည်' : 'Regenerate Link',
    sharePageUrl: isMyanmar ? 'မျှဝေစာမျက်နှာ လင့်ခ်:' : 'Share Page URL:',
    clientUrl: isMyanmar ? 'ကလိုင်းယင့် လင့်ခ်:' : 'Client URL:',
    sharePageDisabled: isMyanmar ? 'မျှဝေစာမျက်နှာကို ပိတ်ထားသည်' : 'Share page disabled',
    regenerateLinkHint: isMyanmar ? 'လင့်ခ်ကို ပြန်ဖန်တီးပါက အဟောင်းတိုကင် URL ကိုသာ လဲမည်။ အတိုအမည်လင့်ခ်များသည် အမည်တိုကို မပြောင်းမချင်း သို့မဟုတ် မျှဝေစာမျက်နှာကို မပိတ်မချင်း ဆက်လက် အလုပ်လုပ်နေမည်။' : 'Regenerating the link rotates the legacy token URL only. Your short slug links stay active until you change the slug or disable the share page.',
    pageViews: isMyanmar ? 'စာမျက်နှာကြည့်ရှုမှု' : 'Page Views',
    copyClicks: isMyanmar ? 'ကူးယူခံရသော အကြိမ်ရေ' : 'Copy Clicks',
    telegramSends: isMyanmar ? 'Telegram ပို့ထားမှုများ' : 'Telegram Sends',
    lastViewed: isMyanmar ? 'နောက်ဆုံး ကြည့်ရှုချိန်' : 'Last Viewed',
    never: isMyanmar ? 'မရှိသေးပါ' : 'Never',
    save: isMyanmar ? 'သိမ်းမည်' : 'Save',
    updatedTitle: isMyanmar ? 'အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Updated',
    updateFailed: isMyanmar ? 'အပ်ဒိတ် မအောင်မြင်ပါ' : 'Update failed',
    updatedDesc: isMyanmar ? 'မျှဝေစာမျက်နှာ ဆက်တင်များကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Share page settings have been updated.',
    shortRegeneratedTitle: isMyanmar ? 'အတိုလင့်ခ်ကို ပြန်ဖန်တီးပြီးပါပြီ' : 'Short link regenerated',
    shortRegeneratedDesc: isMyanmar ? 'အတိုလင့်ခ် အသစ်များကို မျှဝေရန် အသင့်ဖြစ်နေပါပြီ။' : 'The new short URLs are ready to share.',
    welcomeUpdatedTitle: isMyanmar ? 'ကြိုဆိုစာကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Welcome message updated',
    welcomeUpdatedDesc: isMyanmar ? 'မျှဝေစာမျက်နှာ ကြိုဆိုစာကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The share page welcome message has been updated.',
    shareSentTitle: isMyanmar ? 'မျှဝေစာမျက်နှာကို ပို့ပြီးပါပြီ' : 'Share page sent',
    shareSentDesc: isMyanmar ? 'ပြောင်းလဲနိုင်သောသော့ကို Telegram မှတစ်ဆင့် ပို့ပြီးပါပြီ။' : 'The dynamic key has been sent through Telegram.',
    copied: isMyanmar ? 'ကူးယူပြီးပါပြီ!' : 'Copied!',
    copiedConnectLink: isMyanmar ? 'Telegram ချိတ်ဆက်လင့်ခ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Telegram connect link copied to clipboard.',
    copiedShareUrl: isMyanmar ? 'မျှဝေစာမျက်နှာ URL ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Subscription page URL copied to clipboard.',
    copiedClientUrl: isMyanmar ? 'ကလိုင်းယင့် URL ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Client URL copied to clipboard.',
    copiedLegacyShareUrl: isMyanmar ? 'အဟောင်း မျှဝေစာမျက်နှာလင့်ခ် အသစ်ကို ကူးယူပြီးပါပြီ။ အတိုအမည်လင့်ခ်များသည် မပြောင်းလဲပါ။' : 'New legacy share page link copied. Short slug links are unchanged.',
    copiedNewShareUrl: isMyanmar ? 'မျှဝေစာမျက်နှာလင့်ခ် အသစ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'New share page link copied to clipboard.',
    connectFailed: isMyanmar ? 'ချိတ်ဆက်လင့်ခ် ဖန်တီးမှု မအောင်မြင်ပါ' : 'Connect link failed',
    telegramFailed: isMyanmar ? 'Telegram ပို့မှု မအောင်မြင်ပါ' : 'Telegram send failed',
    missingSlug: isMyanmar ? 'အမည်တို မပြည့်စုံပါ' : 'Missing slug',
    missingSlugDesc: isMyanmar ? 'သိမ်းမီ အနည်းဆုံး တရားဝင် စာလုံး ၃ လုံး ထည့်ပါ။' : 'Enter at least 3 valid characters before saving.',
    errorTitle: isMyanmar ? 'အမှား' : 'Error',
    contactRequired: isMyanmar ? 'ဆက်သွယ်ရန် တန်ဖိုးတစ်ခု ထည့်ပါ။' : 'Please enter a contact value.',
    limitReached: isMyanmar ? 'အများဆုံး အရေအတွက် ပြည့်သွားပါပြီ' : 'Limit reached',
    limitDesc: isMyanmar ? 'ဆက်သွယ်ရန် ၃ ခုအထိသာ ထည့်နိုင်ပါသည်။' : 'Maximum 3 contacts allowed.',
    shareTokenRegeneratedTitle: isMyanmar ? 'မျှဝေတိုကင်ကို ပြန်ဖန်တီးပြီးပါပြီ' : 'Share token regenerated',
    shareTokenRegeneratedDescShort: isMyanmar ? 'အဟောင်းတိုကင်လင့်ခ်ကို လဲပြီးပါပြီ။ အတိုအမည်လင့်ခ်များသည် မပြောင်းလဲပါ။' : 'The legacy token link was rotated. Your short slug links stay the same.',
    shareTokenRegeneratedDescLegacy: isMyanmar ? 'ပြောင်းလဲသတ်မှတ် မျှဝေလင့်ခ်ကို ပြန်ဖန်တီးပြီးပါပြီ။' : 'The dynamic share link has been rotated.',
  };
  const getContactTypeLabel = (type: ContactLink['type']) => t(`subscription.contact.${type}`);
  const [selectedTheme, setSelectedTheme] = useState(currentTheme || 'glassPurple');
  const [coverImageUrl, setCoverImageUrl] = useState(
    currentCoverImageType === 'url' ? currentCoverImage || '' : ''
  );
  const [slugInput, setSlugInput] = useState(publicSlug || '');
  const [contacts, setContacts] = useState<ContactLink[]>(currentContactLinks || []);
  const [welcomeMessage, setWelcomeMessage] = useState(currentWelcomeMessage || '');
  const [sharePageEnabled, setSharePageEnabled] = useState(currentSharePageEnabled);
  const [newContactType, setNewContactType] = useState<string>('telegram');
  const [newContactValue, setNewContactValue] = useState('');

  const updateMutation = trpc.dynamicKeys.update.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.updatedTitle,
        description: shareUi.updatedDesc,
      });
      onUpdate();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const regenerateSlugMutation = trpc.dynamicKeys.regeneratePublicSlug.useMutation({
    onSuccess: (result) => {
      setSlugInput(result.publicSlug || '');
      toast({
        title: shareUi.shortRegeneratedTitle,
        description: shareUi.shortRegeneratedDesc,
      });
      onUpdate();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateWelcomeMutation = trpc.dynamicKeys.update.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.welcomeUpdatedTitle,
        description: shareUi.welcomeUpdatedDesc,
      });
      onUpdate();
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sendSharePageMutation = trpc.dynamicKeys.sendSharePageViaTelegram.useMutation({
    onSuccess: () => {
      toast({
        title: shareUi.shareSentTitle,
        description: shareUi.shareSentDesc,
      });
      void analyticsQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: shareUi.telegramFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const connectLinkMutation = trpc.dynamicKeys.generateTelegramConnectLink.useMutation({
    onSuccess: async (result) => {
      await copyToClipboard(
        result.url,
        shareUi.copied,
        shareUi.copiedConnectLink,
      );
    },
    onError: (error) => {
      toast({
        title: shareUi.connectFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const analyticsQuery = trpc.dynamicKeys.getSharePageAnalytics.useQuery(
    { id: dakId },
    {
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  );

  const regenerateDynamicUrlMutation = trpc.dynamicKeys.regenerateDynamicUrl.useMutation({
    onSuccess: async (result) => {
      toast({
        title: shareUi.shareTokenRegeneratedTitle,
        description: publicSlug
          ? shareUi.shareTokenRegeneratedDescShort
          : shareUi.shareTokenRegeneratedDescLegacy,
      });
      onUpdate();
      await copyToClipboard(
        result.sharePageUrl,
        shareUi.copied,
        publicSlug
          ? shareUi.copiedLegacyShareUrl
          : shareUi.copiedNewShareUrl,
      );
    },
    onError: (error) => {
      toast({
        title: shareUi.updateFailed,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleThemeChange = (value: string) => {
    setSelectedTheme(value);
    updateMutation.mutate({
      id: dakId,
      subscriptionTheme: value,
    } as any);
  };

  const handleCoverImageSave = () => {
    if (coverImageUrl.trim()) {
      updateMutation.mutate({
        id: dakId,
        coverImage: coverImageUrl.trim(),
        coverImageType: 'url',
      } as any);
    } else {
      updateMutation.mutate({
        id: dakId,
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
    updateMutation.mutate({
      id: dakId,
      contactLinks: JSON.stringify(newContacts),
    } as any);
  };

  const handleRemoveContact = (index: number) => {
    const newContacts = contacts.filter((_, i) => i !== index);
    setContacts(newContacts);
    updateMutation.mutate({
      id: dakId,
      contactLinks: newContacts.length > 0 ? JSON.stringify(newContacts) : null,
    } as any);
  };

  const handleSharePageToggle = (checked: boolean) => {
    setSharePageEnabled(checked);
    updateMutation.mutate({
      id: dakId,
      sharePageEnabled: checked,
    } as any);
  };

  const getSubscriptionPageUrl = () => {
    if (typeof window === 'undefined') return '';
    if (slugInput.trim()) {
      return buildDynamicShortShareUrl(slugInput.trim(), {
        origin: window.location.origin,
        lang: locale,
      });
    }
    if (!dynamicUrl) return '';
    return buildDynamicSharePageUrl(dynamicUrl, {
      origin: window.location.origin,
      lang: locale,
    });
  };

  const getClientUrl = () => {
    if (typeof window === 'undefined') return '';
    if (slugInput.trim()) {
      return buildDynamicOutlineUrl(slugInput.trim(), keyName, {
        origin: window.location.origin,
        shortPath: true,
      });
    }
    if (!dynamicUrl) return '';
    return buildDynamicOutlineUrl(dynamicUrl, keyName, {
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

  const saveSlug = () => {
    const normalizedSlug = normalizePublicSlug(slugInput);
    if (!normalizedSlug || normalizedSlug.length < 3) {
      toast({
        title: shareUi.missingSlug,
        description: shareUi.missingSlugDesc,
        variant: 'destructive',
      });
      return;
    }

    setSlugInput(normalizedSlug);
    updateMutation.mutate({
      id: dakId,
      publicSlug: normalizedSlug,
    } as any);
  };

  const handleWelcomeMessageSave = () => {
    updateWelcomeMutation.mutate({
      id: dakId,
      subscriptionWelcomeMessage: welcomeMessage.trim() || null,
    } as any);
  };

  const theme = getTheme(selectedTheme);

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
        {/* Theme Selector */}
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium">{shareUi.enabled}</Label>
            <p className="text-xs text-muted-foreground">
              {shareUi.enabledDesc}
            </p>
          </div>
          <Switch
            checked={sharePageEnabled}
            onCheckedChange={handleSharePageToggle}
            disabled={updateMutation.isPending}
          />
        </div>

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

        {/* Background Image URL */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            {shareUi.backgroundImage}
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/image.jpg"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCoverImageSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
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
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <span>{contactType?.icon}</span>
                    <span className="text-sm font-medium">{contactType ? getContactTypeLabel(contactType.value) : contact.type}</span>
                    <span className="text-sm text-muted-foreground truncate flex-1">{contact.value}</span>
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
            <div className="flex gap-2">
              <Select value={newContactType} onValueChange={setNewContactType}>
                <SelectTrigger className="w-32">
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
                onClick={handleAddContact}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
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
                <p className="text-sm font-medium" style={{ color: coverImageUrl ? '#ffffff' : theme.textPrimary }}>{shareUi.preview}</p>
                <p className="text-xs" style={{ color: coverImageUrl ? 'rgba(255,255,255,0.7)' : theme.textMuted }}>
                  {coverImageUrl ? shareUi.previewImage : `${theme.name} Theme`}
                </p>
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

        {/* Short link controls */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            {shareUi.shortSlug}
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder={shareUi.slugPlaceholder}
              value={slugInput}
              onChange={(e) => setSlugInput(normalizePublicSlug(e.target.value))}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={saveSlug}
              disabled={updateMutation.isPending || !dynamicUrl}
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : shareUi.save}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => regenerateSlugMutation.mutate({ id: dakId })}
              disabled={regenerateSlugMutation.isPending || !dynamicUrl}
              title={shareUi.regenerateShortSlug}
            >
              {regenerateSlugMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {shareUi.slugHelp}
          </p>
        </div>

        {/* Preview & Copy Buttons */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="w-full min-w-0 text-xs sm:text-sm"
            onClick={() => {
              const url = getSubscriptionPageUrl();
              if (url) window.open(url, '_blank');
            }}
            disabled={!dynamicUrl || !sharePageEnabled}
          >
            <Eye className="w-4 h-4 mr-2" />
            {shareUi.preview}
          </Button>
          <Button
            className="w-full min-w-0 text-xs sm:text-sm"
            onClick={copySubscriptionPageUrl}
            disabled={!dynamicUrl || !sharePageEnabled}
          >
            <Copy className="w-4 h-4 mr-2" />
            {shareUi.copyLink}
          </Button>
          <Button
            variant="outline"
            className="w-full min-w-0 text-xs sm:col-span-2 sm:text-sm"
            onClick={copyClientUrl}
            disabled={!dynamicUrl}
          >
            <Link2 className="w-4 h-4 mr-2" />
            {shareUi.copyClientUrl}
          </Button>
          <Button
            variant="outline"
            className="w-full min-w-0 text-xs sm:text-sm"
            onClick={() => connectLinkMutation.mutate({ id: dakId })}
            disabled={connectLinkMutation.isPending || !dynamicUrl}
          >
            {connectLinkMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4 mr-2" />
            )}
            {shareUi.connectTelegram}
          </Button>
          <Button
            variant="outline"
            className="w-full min-w-0 text-xs sm:text-sm"
            onClick={() => sendSharePageMutation.mutate({ id: dakId, reason: 'RESENT' })}
            disabled={sendSharePageMutation.isPending || !dynamicUrl}
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
            className="w-full min-w-0 text-xs sm:col-span-2 sm:text-sm"
            onClick={() => regenerateDynamicUrlMutation.mutate({ id: dakId })}
            disabled={regenerateDynamicUrlMutation.isPending || !dynamicUrl}
          >
            {regenerateDynamicUrlMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {shareUi.regenerateLink}
          </Button>
        </div>

        {/* URL Display */}
        {dynamicUrl && (
          <div className="space-y-2">
            <div className="p-2 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">{shareUi.sharePageUrl}</p>
              <code className="text-xs break-all select-all">
                {sharePageEnabled ? getSubscriptionPageUrl() : shareUi.sharePageDisabled}
              </code>
            </div>
            <div className="p-2 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">{shareUi.clientUrl}</p>
              <code className="text-xs break-all select-all">
                {getClientUrl()}
              </code>
            </div>
            {publicSlug ? (
              <p className="text-xs text-muted-foreground">
                {shareUi.regenerateLinkHint}
              </p>
            ) : null}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.pageViews}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.pageViews ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{shareUi.copyClicks}</p>
            <p className="mt-2 text-xl font-semibold">{analyticsQuery.data?.counts.copyClicks ?? 0}</p>
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

/**
 * ServerLoadCard Component
 * Shows server load distribution for load balancing visualization
 */
function ServerLoadCard() {
  const { data: loadStats, isLoading } = trpc.servers.getLoadStats.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Server className="w-4 h-4 text-primary" />
            Server Load
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!loadStats || loadStats.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Server className="w-4 h-4 text-primary" />
          Server Load Distribution
        </CardTitle>
        <CardDescription className="text-xs">
          Real-time load across active servers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadStats.map((server) => (
          <div key={server.serverId} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate max-w-[140px]" title={server.serverName}>
                {server.serverName}
              </span>
              <span className="text-muted-foreground">
                {server.activeKeyCount} keys · {server.loadScore}%
              </span>
            </div>
            <Progress
              value={server.loadScore}
              className={cn(
                'h-2',
                server.loadScore >= 80 ? '[&>div]:bg-red-500'
                  : server.loadScore >= 50 ? '[&>div]:bg-yellow-500'
                  : '[&>div]:bg-green-500'
              )}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * KeyRotationCard Component
 * Manages key auto-rotation settings for a Dynamic Access Key
 */
function KeyRotationCard({
  dakId,
  rotationEnabled,
  rotationInterval,
  rotationTriggerMode,
  rotationUsageThresholdPercent,
  rotateOnHealthFailure,
  lastRotatedAt,
  nextRotationAt,
  rotationCount,
  onUpdate,
}: {
  dakId: string;
  rotationEnabled: boolean;
  rotationInterval: string;
  rotationTriggerMode: 'SCHEDULED' | 'USAGE' | 'HEALTH' | 'COMBINED';
  rotationUsageThresholdPercent: number;
  rotateOnHealthFailure: boolean;
  lastRotatedAt: Date | null;
  nextRotationAt: Date | null;
  rotationCount: number;
  onUpdate: () => void;
}) {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(rotationEnabled);
  const [interval, setInterval] = useState(rotationInterval);
  const [triggerMode, setTriggerMode] = useState(rotationTriggerMode);
  const [usageThreshold, setUsageThreshold] = useState(String(rotationUsageThresholdPercent));
  const [rotateOnHealth, setRotateOnHealth] = useState(rotateOnHealthFailure);

  const updateMutation = trpc.dynamicKeys.updateRotation.useMutation({
    onSuccess: (data) => {
      toast({
        title: isMyanmar ? 'လှည့်ပြောင်းမှု ဆက်တင်များကို ပြင်ပြီးပါပြီ' : 'Rotation settings updated',
        description: enabled
          ? isMyanmar
            ? `သော့များကို ${interval.toLowerCase()} အလိုက် အလိုအလျောက် လှည့်ပြောင်းပါမည်။ နောက်တစ်ကြိမ်: ${data.nextRotationAt ? formatRelativeTime(data.nextRotationAt) : 'မသတ်မှတ်ရသေးပါ'}`
            : `Keys will rotate ${interval.toLowerCase()}. Next rotation: ${data.nextRotationAt ? formatRelativeTime(data.nextRotationAt) : 'N/A'}`
          : isMyanmar
            ? 'သော့ အလိုအလျောက် လှည့်ပြောင်းမှုကို ပိတ်ထားပါသည်။'
            : 'Key rotation has been disabled.',
      });
      onUpdate();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'မပြင်ဆင်နိုင်ပါ' : 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rotateMutation = trpc.dynamicKeys.rotateNow.useMutation({
    onSuccess: () => {
      toast({
        title: isMyanmar ? 'သော့များကို လှည့်ပြောင်းပြီးပါပြီ' : 'Keys rotated',
        description: isMyanmar ? 'ချိတ်ဆက်ထားသော သော့အားလုံးကို အောင်မြင်စွာ လှည့်ပြောင်းပြီးပါပြီ။' : 'All attached keys have been rotated successfully.',
      });
      onUpdate();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'လှည့်ပြောင်းမရပါ' : 'Rotation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      id: dakId,
      rotationEnabled: enabled,
      rotationInterval: interval as 'NEVER' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
      rotationTriggerMode: triggerMode,
      rotationUsageThresholdPercent: Math.min(100, Math.max(50, Number(usageThreshold) || 85)),
      rotateOnHealthFailure: rotateOnHealth,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RotateCw className="w-4 h-4 text-primary" />
          {isMyanmar ? 'သော့ အလိုအလျောက် လှည့်ပြောင်းမှု' : 'Key Auto-Rotation'}
        </CardTitle>
        <CardDescription className="text-xs">
          {isMyanmar ? 'စာရင်းသွင်းမှု URL မပြောင်းဘဲ အောက်ခံသော့များကို အချိန်အလိုက် လဲလှယ်ပါ။' : 'Periodically replace underlying keys while keeping the subscription URL stable.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">{isMyanmar ? 'အလိုအလျောက် လှည့်ပြောင်းမှုကို ဖွင့်မည်' : 'Enable Rotation'}</Label>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Interval Selector */}
        {enabled && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{isMyanmar ? 'လှည့်ပြောင်းမှု အကြိမ်ကာလ' : 'Rotation Interval'}</Label>
              <Select
                value={interval}
                onValueChange={setInterval}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">{isMyanmar ? 'နေ့စဉ်' : 'Daily'}</SelectItem>
                  <SelectItem value="WEEKLY">{isMyanmar ? 'အပတ်စဉ်' : 'Weekly'}</SelectItem>
                  <SelectItem value="BIWEEKLY">{isMyanmar ? '၂ ပတ်တစ်ကြိမ်' : 'Every 2 Weeks'}</SelectItem>
                  <SelectItem value="MONTHLY">{isMyanmar ? 'လစဉ်' : 'Monthly'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{isMyanmar ? 'လှည့်ပြောင်းမှု စတင်မည့်အခြေအနေ' : 'Rotation Trigger'}</Label>
              <Select
                value={triggerMode}
                onValueChange={(value) => setTriggerMode(value as typeof triggerMode)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHEDULED">{isMyanmar ? 'အချိန်ဇယားသာ' : 'Schedule only'}</SelectItem>
                  <SelectItem value="USAGE">{isMyanmar ? 'ဒေတာအသုံးပြုမှု ကန့်သတ်ချက်' : 'Quota threshold'}</SelectItem>
                  <SelectItem value="HEALTH">{isMyanmar ? 'ကျန်းမာရေး ပြဿနာ' : 'Health issue'}</SelectItem>
                  <SelectItem value="COMBINED">{isMyanmar ? 'ဇယား + ဒေတာကန့်သတ်ချက် + ကျန်းမာရေး' : 'Schedule + quota + health'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(triggerMode === 'USAGE' || triggerMode === 'COMBINED') && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{isMyanmar ? 'အသုံးပြုမှု သတ်မှတ်ကန့်သတ်ချက် (%)' : 'Usage Threshold (%)'}</Label>
                <Input
                  type="number"
                  min={50}
                  max={100}
                  value={usageThreshold}
                  onChange={(event) => setUsageThreshold(event.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {(triggerMode === 'HEALTH' || triggerMode === 'COMBINED') && (
              <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{isMyanmar ? 'ကျန်းမာရေး ချို့ယွင်းလျှင် လှည့်ပြောင်းမည်' : 'Rotate on health failure'}</p>
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'လက်ရှိ ဆာဗာ နှေးကွေးခြင်း သို့မဟုတ် ကျနေသည့်အခါ နောက်ခံချိတ်ဆက်မှု အသစ်သို့ ပြောင်းပါ။' : 'Trigger a new backend when the current server is slow or down.'}
                  </p>
                </div>
                <Switch checked={rotateOnHealth} onCheckedChange={setRotateOnHealth} />
              </div>
            )}
          </div>
        )}

        {/* Save Button */}
        {(
          enabled !== rotationEnabled ||
          interval !== rotationInterval ||
          triggerMode !== rotationTriggerMode ||
          usageThreshold !== String(rotationUsageThresholdPercent) ||
          rotateOnHealth !== rotateOnHealthFailure
        ) && (
          <Button
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {isMyanmar ? 'ဆက်တင်များကို သိမ်းမည်' : 'Save Settings'}
          </Button>
        )}

        {/* Stats */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{isMyanmar ? 'စုစုပေါင်း လှည့်ပြောင်းမှု' : 'Total Rotations'}</span>
            <span className="font-medium">{rotationCount}</span>
          </div>
          {lastRotatedAt && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး လှည့်ပြောင်းခဲ့သည့် အချိန်' : 'Last Rotated'}</span>
              <span>{formatRelativeTime(lastRotatedAt)}</span>
            </div>
          )}
          {nextRotationAt && enabled && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{isMyanmar ? 'နောက်တစ်ကြိမ် လှည့်ပြောင်းမည့်အချိန်' : 'Next Rotation'}</span>
              <span>{formatRelativeTime(nextRotationAt)}</span>
            </div>
          )}
        </div>

        {/* Manual Rotate Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => rotateMutation.mutate({ id: dakId })}
          disabled={rotateMutation.isPending}
        >
          {rotateMutation.isPending ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <RotateCw className="w-3 h-3 mr-1" />
          )}
          Rotate Now
        </Button>
      </CardContent>
    </Card>
  );
}

type DynamicRoutingDiagnostics = {
  algorithm: 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD';
  algorithmLabel: string;
  algorithmHint: string;
  viewerIp: string | null;
  preferredRegionMode: DynamicRoutingPreferenceMode;
  preferredServerIds: string[];
  preferredServers: Array<{
    id: string;
    name: string;
    countryCode: string | null;
  }>;
  preferredCountryCodes: string[];
  preferredServerWeights: Record<string, number>;
  preferredCountryWeights: Record<string, number>;
  sessionStickinessMode: 'NONE' | 'DRAIN';
  drainGraceMinutes: number;
  attachedActiveKeys: number;
  selectionNote: string | null;
  currentSelection: {
    mode: 'ATTACHED_KEY' | 'SELF_MANAGED_KEY' | 'SELF_MANAGED_CANDIDATE';
    keyId?: string | null;
    keyName?: string | null;
    serverId?: string | null;
    serverName: string;
    serverCountry: string | null;
    reason: string;
    lastTrafficAt?: string | null;
  } | null;
  pinnedAccessKeyId: string | null;
  pinnedServerId: string | null;
  pinnedAt: string | null;
  pinExpiresAt: string | null;
  pinnedBackend: {
    mode: 'ATTACHED_KEY' | 'SELF_MANAGED_SERVER';
    keyId?: string | null;
    keyName?: string | null;
    serverId: string;
    serverName: string;
    serverCountry: string | null;
    pinnedAt: string | null;
    pinExpiresAt: string | null;
  } | null;
  lastResolvedBackend: {
    keyId: string;
    keyName: string;
    serverId: string | null;
    serverName: string;
    serverCountry: string | null;
    lastSeenAt: string;
    lastTrafficAt: string | null;
    isActive: boolean;
    bytesUsed: string;
  } | null;
  recentBackends: Array<{
    keyId: string;
    keyName: string;
    serverId: string | null;
    serverName: string;
    serverCountry: string | null;
    lastSeenAt: string;
    lastTrafficAt: string | null;
    isActive: boolean;
    bytesUsed: string;
  }>;
  recentBackendSwitches: Array<{
    fromKeyId: string;
    fromKeyName: string;
    fromServerName: string;
    toKeyId: string;
    toKeyName: string;
    toServerName: string;
    switchedAt: string;
  }>;
  candidateRanking: Array<{
    keyId?: string;
    keyName?: string;
    serverId: string;
    serverName: string;
    serverCountry: string | null;
    weight: number;
    preferenceScope: 'COUNTRY' | 'SERVER' | 'NONE' | 'UNRESTRICTED' | 'FALLBACK';
    loadScore: number | null;
    effectiveScore: number | null;
    reason: string;
  }>;
  routingTimeline: Array<{
    id: string;
    eventType: string;
    severity: string;
    reason: string;
    fromKeyName: string | null;
    fromServerName: string | null;
    toKeyName: string | null;
    toServerName: string | null;
    createdAt: string;
  }>;
  routingAlerts: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    createdAt: string;
  }>;
  lastResolvedAccessKeyId: string | null;
  lastResolvedServerId: string | null;
  lastResolvedAt: string | null;
  rotationTriggerMode: string;
  rotationUsageThresholdPercent: number;
  rotateOnHealthFailure: boolean;
  autoClearStalePins: boolean;
  autoFallbackToPrefer: boolean;
  autoSkipUnhealthy: boolean;
  routingAlertRules: string | null;
  premiumRegionAutomation: {
    lifecycleState: 'HEALTHY' | 'DEGRADED' | 'FALLBACK' | 'RECOVERED';
    preferredRegions: string[];
    currentRegionCode: string | null;
    currentRegionStatus: string | null;
    healthyPreferredRegions: string[];
    suggestedFallback: {
      mode: 'ATTACHED_KEY' | 'SELF_MANAGED_SERVER';
      accessKeyId: string | null;
      accessKeyName: string | null;
      serverId: string;
      serverName: string;
      serverCountryCode: string | null;
      regionCode: string;
      status: string | null;
      latencyMs: number | null;
    } | null;
    activeAutoFallback: {
      eventId: string;
      appliedAt: string;
      pinExpiresAt: string | null;
      fallbackRegionCode: string | null;
      pinnedServerId: string | null;
      pinnedServerName: string | null;
    } | null;
    latestDegradedAt: string | null;
    latestFallbackAt: string | null;
    latestRecoveredAt: string | null;
    latestRecoveryMinutes: number | null;
  };
  appliedTemplate: {
    id: string;
    name: string;
  } | null;
  lastSharePageViewAt: string | null;
  lastSharePageCopyAt: string | null;
  lastSharePageOpenAppAt: string | null;
};

type DynamicRoutingCandidate = DynamicRoutingDiagnostics['candidateRanking'][number];

type DynamicRoutingSimulationResult = {
  mode: 'ATTACHED_KEY' | 'SELF_MANAGED_SERVER';
  target: DynamicRoutingCandidate;
};

type DynamicRoutingCandidateTestResult = {
  testedAt: string;
  mode: 'MANUAL' | 'SELF_MANAGED';
  candidates: DynamicRoutingCandidate[];
};

type RoutingTimelineFilter = 'ALL' | 'FAILOVER' | 'ALERTS' | 'PINS' | 'ROTATION' | 'TESTS';

const PIN_EXPIRY_OPTIONS = [
  { value: 'never', translationKey: 'dynamic_keys.routing.pin_expiry.option.never', minutes: null },
  { value: '30', translationKey: 'dynamic_keys.routing.pin_expiry.option.30m', minutes: 30 },
  { value: '120', translationKey: 'dynamic_keys.routing.pin_expiry.option.2h', minutes: 120 },
  { value: '480', translationKey: 'dynamic_keys.routing.pin_expiry.option.8h', minutes: 480 },
  { value: '1440', translationKey: 'dynamic_keys.routing.pin_expiry.option.24h', minutes: 1440 },
  { value: '4320', translationKey: 'dynamic_keys.routing.pin_expiry.option.72h', minutes: 4320 },
] as const;

function formatRoutingEventLabel(eventType: string, t: (key: string) => string) {
  switch (eventType) {
    case 'BACKEND_SWITCH':
      return t('dynamic_keys.routing.event.backend_switch');
    case 'NO_MATCH':
      return t('dynamic_keys.routing.event.no_match');
    case 'STICKY_SESSION':
      return t('dynamic_keys.routing.event.sticky_session');
    case 'ROTATION_TRIGGERED':
      return t('dynamic_keys.routing.event.rotation_triggered');
    case 'ROTATION_SKIPPED':
      return t('dynamic_keys.routing.event.rotation_skipped');
    case 'HEALTH_ALERT':
      return t('dynamic_keys.routing.event.health_alert');
    case 'QUOTA_ALERT':
      return t('dynamic_keys.routing.event.quota_alert');
    case 'FLAPPING_ALERT':
      return t('dynamic_keys.routing.event.flapping_alert');
    case 'TEST_RUN':
      return t('dynamic_keys.routing.event.test_run');
    case 'FAILOVER_SIMULATION':
      return t('dynamic_keys.routing.event.failover_simulation');
    case 'PIN_APPLIED':
      return t('dynamic_keys.routing.event.pin_applied');
    case 'PIN_CLEARED':
      return t('dynamic_keys.routing.event.pin_cleared');
    case 'AUTO_FALLBACK_PIN_APPLIED':
      return 'Auto fallback pin applied';
    case 'PREFERRED_REGION_DEGRADED':
      return 'Preferred region degraded';
    case 'PREFERRED_REGION_RECOVERED':
      return 'Preferred region recovered';
    default:
      return eventType.replaceAll('_', ' ');
  }
}

function formatRoutingPreferenceModeLabel(mode: DynamicRoutingPreferenceMode, t: (key: string) => string) {
  return mode === 'ONLY'
    ? t('dynamic_keys.routing.preference_mode.only')
    : t('dynamic_keys.routing.preference_mode.prefer');
}

function formatStickinessModeLabel(mode: 'NONE' | 'DRAIN', t: (key: string) => string) {
  return mode === 'DRAIN'
    ? t('dynamic_keys.routing.stickiness.drain')
    : t('dynamic_keys.routing.stickiness.none');
}

function matchesRoutingTimelineFilter(eventType: string, filter: RoutingTimelineFilter) {
  if (filter === 'ALL') {
    return true;
  }

  if (filter === 'FAILOVER') {
    return [
      'BACKEND_SWITCH',
      'NO_MATCH',
      'HEALTH_ALERT',
      'FLAPPING_ALERT',
      'AUTO_FALLBACK_PIN_APPLIED',
      'PREFERRED_REGION_RECOVERED',
    ].includes(eventType);
  }

  if (filter === 'ALERTS') {
    return ['NO_MATCH', 'HEALTH_ALERT', 'QUOTA_ALERT', 'FLAPPING_ALERT', 'PREFERRED_REGION_DEGRADED'].includes(eventType);
  }

  if (filter === 'PINS') {
    return ['PIN_APPLIED', 'PIN_CLEARED', 'AUTO_FALLBACK_PIN_APPLIED'].includes(eventType);
  }

  if (filter === 'ROTATION') {
    return ['ROTATION_TRIGGERED', 'ROTATION_SKIPPED'].includes(eventType);
  }

  if (filter === 'TESTS') {
    return ['TEST_RUN', 'FAILOVER_SIMULATION'].includes(eventType);
  }

  return true;
}

function DynamicRoutingDiagnosticsCard({
  data,
  isLoading,
  onRefresh,
  isRefreshing,
  onPinCurrent,
  onPinSuggestedFallback,
  onClearPin,
  onSimulateFailover,
  onTestCandidates,
  isPinning,
  isClearingPin,
  isSimulating,
  isTesting,
  canPinCurrent,
  simulationResult,
  candidateTestResult,
  onExportDiagnostics,
  isExporting,
}: {
  data?: DynamicRoutingDiagnostics;
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  isPinning: boolean;
  onPinCurrent: (expiresInMinutes: number | null, operatorNote?: string) => void;
  onPinSuggestedFallback?: () => void;
  onClearPin: () => void;
  onSimulateFailover: () => void;
  onTestCandidates: () => void;
  isClearingPin: boolean;
  isSimulating: boolean;
  isTesting: boolean;
  canPinCurrent: boolean;
  simulationResult?: DynamicRoutingSimulationResult | null;
  candidateTestResult?: DynamicRoutingCandidateTestResult | null;
  onExportDiagnostics?: () => void;
  isExporting?: boolean;
}) {
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const [timelineFilter, setTimelineFilter] = useState<RoutingTimelineFilter>('ALL');
  const [pinExpiryValue, setPinExpiryValue] = useState<string>('never');
  const [operatorNote, setOperatorNote] = useState<string>('');
  const filteredTimeline = useMemo(
    () => (data?.routingTimeline ?? []).filter((event) => matchesRoutingTimelineFilter(event.eventType, timelineFilter)),
    [data?.routingTimeline, timelineFilter],
  );
  const parsedAlertRules = useMemo(
    () => parseDynamicRoutingAlertRules(data?.routingAlertRules),
    [data?.routingAlertRules],
  );

  if (isLoading && !data) {
    return (
      <Card className="ops-detail-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />
            {t('dynamic_keys.routing.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 rounded-[1.2rem] border border-border/60 bg-background/45 animate-pulse dark:bg-white/[0.03]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="ops-detail-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shuffle className="h-5 w-5 text-primary" />
              {t('dynamic_keys.routing.title')}
            </CardTitle>
            <CardDescription>{t('dynamic_keys.routing.description')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t('dynamic_keys.detail.refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="ops-row-card">
          <div>
            <p className="text-sm text-muted-foreground">{t('dynamic_keys.routing.selection_algorithm')}</p>
            <p className="mt-1 text-sm font-medium">{data?.algorithmLabel || t('dynamic_keys.routing.unknown')}</p>
          </div>
          <Badge variant={data?.algorithm === 'LEAST_LOAD' ? 'default' : 'secondary'}>
            {data?.algorithmLabel || t('dynamic_keys.routing.unknown')}
          </Badge>
        </div>

        {data?.algorithmHint ? (
          <p className="text-sm text-muted-foreground">{data.algorithmHint}</p>
        ) : null}

        {data ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Recovery workflow
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="ops-inline-stat">
                  <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.auto_recovery.clear_stale_pins')}</p>
                  <p className="font-medium">{data.autoClearStalePins ? (isMyanmar ? 'ဖွင့်ထားသည်' : 'Enabled') : (isMyanmar ? 'ပိတ်ထားသည်' : 'Disabled')}</p>
                </div>
                <div className="ops-inline-stat">
                  <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.auto_recovery.relax_only')}</p>
                  <p className="font-medium">{data.autoFallbackToPrefer ? (isMyanmar ? 'ဖွင့်ထားသည်' : 'Enabled') : (isMyanmar ? 'ပိတ်ထားသည်' : 'Disabled')}</p>
                </div>
                <div className="ops-inline-stat">
                  <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.auto_recovery.skip_unhealthy')}</p>
                  <p className="font-medium">{data.autoSkipUnhealthy ? (isMyanmar ? 'ဖွင့်ထားသည်' : 'Enabled') : (isMyanmar ? 'ပိတ်ထားသည်' : 'Disabled')}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {isMyanmar ? 'သတိပေးချက် ပို့ဆောင်မှု စည်းမျဉ်းများ' : 'Alert delivery rules'}
              </p>
              <div className="mt-3 space-y-3">
                <div className="ops-inline-stat">
                  <p className="text-xs text-muted-foreground">{isMyanmar ? 'မူလ စောင့်ဆိုင်းချိန်' : 'Default cooldown'}</p>
                  <p className="font-medium">{parsedAlertRules.defaultCooldownMinutes} {isMyanmar ? 'မိနစ်' : 'min'}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DYNAMIC_ROUTING_ALERT_RULE_DEFINITIONS.map((definition) => {
                    const rule = parsedAlertRules.rules[definition.key];
                    const channels = rule.channels.trim()
                      ? rule.channels
                          .split(',')
                          .map((entry) => entry.trim())
                          .filter(Boolean)
                          .join(', ')
                      : isMyanmar ? 'ချန်နယ် အားလုံး' : 'All channels';

                    return (
                      <div
                        key={definition.key}
                        className="rounded-[1rem] border border-border/60 bg-background/70 p-3 dark:bg-white/[0.02]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{definition.label}</p>
                            <p className="text-xs text-muted-foreground">{definition.description}</p>
                          </div>
                          <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                            {rule.enabled ? (isMyanmar ? 'ဖွင့်ထားသည်' : 'Enabled') : (isMyanmar ? 'အသံလျှော့ထားသည်' : 'Muted')}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                          <p>{isMyanmar ? 'စောင့်ဆိုင်းချိန်' : 'Cooldown'}: {rule.cooldownMinutes} {isMyanmar ? 'မိနစ်' : 'min'}</p>
                          <p>{isMyanmar ? 'ချန်နယ်များ' : 'Channels'}: {channels}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {data?.premiumRegionAutomation ? (
          <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isMyanmar ? 'ပရီမီယံ ဒေသ လုပ်ဆောင်မှု စက်ဝန်း' : 'Premium region lifecycle'}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isMyanmar
                    ? 'ပရီမီယံ လမ်းကြောင်းသတ်မှတ်မှုအတွက် အခြေအနေကျဆင်းမှု၊ အစားထိုး လမ်းကြောင်းနှင့် ပြန်ကောင်းလာမှု အခြေအနေများအပြင် လက်ရှိ operator override လမ်းကြောင်းကို ပြထားသည်။'
                    : 'Shows the degraded, fallback, and recovered state for premium routing, plus the current operator override path.'}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  data.premiumRegionAutomation.lifecycleState === 'FALLBACK' && 'border-amber-500/40 text-amber-500',
                  data.premiumRegionAutomation.lifecycleState === 'DEGRADED' && 'border-red-500/40 text-red-500',
                  data.premiumRegionAutomation.lifecycleState === 'RECOVERED' && 'border-emerald-500/40 text-emerald-500',
                )}
              >
                {data.premiumRegionAutomation.lifecycleState}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">{isMyanmar ? 'ဦးစားပေး ဒေသများ' : 'Preferred regions'}</p>
                <p className="font-medium">
                  {data.premiumRegionAutomation.preferredRegions.length
                    ? data.premiumRegionAutomation.preferredRegions.join(', ')
                    : isMyanmar ? 'အလိုအလျောက်' : 'Auto'}
                </p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">{isMyanmar ? 'လက်ရှိ ဒေသ' : 'Current region'}</p>
                <p className="font-medium">
                  {data.premiumRegionAutomation.currentRegionCode
                    ? `${data.premiumRegionAutomation.currentRegionCode}${data.premiumRegionAutomation.currentRegionStatus ? ` • ${data.premiumRegionAutomation.currentRegionStatus}` : ''}`
                    : isMyanmar ? 'မသိရသေးပါ' : 'Unknown'}
                </p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">{isMyanmar ? 'ကျန်းမာသော ဦးစားပေး ဒေသများ' : 'Healthy preferred'}</p>
                <p className="font-medium">
                  {data.premiumRegionAutomation.healthyPreferredRegions.length
                    ? data.premiumRegionAutomation.healthyPreferredRegions.join(', ')
                    : isMyanmar ? 'မရှိသေးပါ' : 'None yet'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-[1rem] border border-border/60 bg-background/70 p-3 dark:bg-white/[0.02]">
                <p className="text-xs font-medium">{isMyanmar ? 'အခြေအနေ ကျဆင်း' : 'Degraded'}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.premiumRegionAutomation.latestDegradedAt
                    ? formatRelativeTime(new Date(data.premiumRegionAutomation.latestDegradedAt))
                    : isMyanmar ? 'မကြာသေးမီက အခြေအနေကျဆင်းမှု မရှိပါ' : 'No recent degradation'}
                </p>
              </div>
              <div className="rounded-[1rem] border border-border/60 bg-background/70 p-3 dark:bg-white/[0.02]">
                <p className="text-xs font-medium">{isMyanmar ? 'အစားထိုး လမ်းကြောင်း' : 'Fallback'}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.premiumRegionAutomation.activeAutoFallback
                    ? `${data.premiumRegionAutomation.activeAutoFallback.fallbackRegionCode || (isMyanmar ? 'အစားထိုး လမ်းကြောင်း' : 'Fallback')} • ${data.premiumRegionAutomation.activeAutoFallback.pinnedServerName || (isMyanmar ? 'ပင်ထားသည်' : 'Pinned')}`
                    : data.premiumRegionAutomation.latestFallbackAt
                      ? isMyanmar
                        ? `${formatRelativeTime(new Date(data.premiumRegionAutomation.latestFallbackAt))} တွင် နောက်ဆုံး အသုံးပြုခဲ့သည်`
                        : `Last applied ${formatRelativeTime(new Date(data.premiumRegionAutomation.latestFallbackAt))}`
                      : isMyanmar ? 'ပင်ထားသော အစားထိုး လမ်းကြောင်း မရှိပါ' : 'No fallback pin'}
                </p>
              </div>
              <div className="rounded-[1rem] border border-border/60 bg-background/70 p-3 dark:bg-white/[0.02]">
                <p className="text-xs font-medium">{isMyanmar ? 'ပြန်ကောင်းလာသည်' : 'Recovered'}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.premiumRegionAutomation.latestRecoveredAt
                    ? `${formatRelativeTime(new Date(data.premiumRegionAutomation.latestRecoveredAt))}${data.premiumRegionAutomation.latestRecoveryMinutes ? ` • ${Math.round(data.premiumRegionAutomation.latestRecoveryMinutes)} min` : ''}`
                    : isMyanmar ? 'ပြန်ကောင်းလာမှု မရှိသေးပါ' : 'No recovery yet'}
                </p>
              </div>
            </div>

            {(data.premiumRegionAutomation.suggestedFallback || data.premiumRegionAutomation.activeAutoFallback) ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="rounded-[1rem] border border-dashed border-border/60 bg-background/70 p-3 dark:bg-white/[0.02]">
                  {data.premiumRegionAutomation.activeAutoFallback ? (
                    <>
                      <p className="text-sm font-medium">
                        {isMyanmar
                          ? `${data.premiumRegionAutomation.activeAutoFallback.pinnedServerName || 'ပင်ထားသော backend'} တွင် ယာယီ အစားထိုး လမ်းကြောင်းကို အသုံးပြုနေသည်။`
                          : `Temporary fallback is active on ${data.premiumRegionAutomation.activeAutoFallback.pinnedServerName || 'the pinned backend'}.`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.premiumRegionAutomation.activeAutoFallback.pinExpiresAt
                          ? isMyanmar
                            ? `အလိုအလျောက် အစားထိုး pin သည် ${formatRelativeTime(new Date(data.premiumRegionAutomation.activeAutoFallback.pinExpiresAt))} တွင် သက်တမ်းကုန်မည်။`
                            : `Auto fallback pin expires ${formatRelativeTime(new Date(data.premiumRegionAutomation.activeAutoFallback.pinExpiresAt))}.`
                          : isMyanmar
                            ? 'ဤပရီမီယံ key ကို ယာယီ အစားထိုး backend သို့ လက်ရှိ ပင်ထားသည်။'
                            : 'This premium key is currently pinned to a temporary fallback backend.'}
                      </p>
                    </>
                  ) : data.premiumRegionAutomation.suggestedFallback ? (
                    <>
                      <p className="text-sm font-medium">
                        {isMyanmar ? 'အကြံပြုထားသော အစားထိုး လမ်းကြောင်း' : 'Suggested fallback'}: {getCountryFlag(data.premiumRegionAutomation.suggestedFallback.serverCountryCode || '')} {data.premiumRegionAutomation.suggestedFallback.serverName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.premiumRegionAutomation.suggestedFallback.regionCode}
                        {data.premiumRegionAutomation.suggestedFallback.status ? ` • ${data.premiumRegionAutomation.suggestedFallback.status}` : ''}
                        {typeof data.premiumRegionAutomation.suggestedFallback.latencyMs === 'number'
                          ? ` • ${data.premiumRegionAutomation.suggestedFallback.latencyMs}ms`
                          : ''}
                      </p>
                    </>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {data.premiumRegionAutomation.suggestedFallback && !data.premiumRegionAutomation.activeAutoFallback && onPinSuggestedFallback ? (
                    <Button variant="outline" onClick={onPinSuggestedFallback} disabled={isPinning}>
                      {isPinning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pin className="mr-2 h-4 w-4" />}
                      {isMyanmar ? 'အစားထိုး လမ်းကြောင်းကို အတည်ပြုမည်' : 'Approve fallback'}
                    </Button>
                  ) : null}
                  {data.premiumRegionAutomation.activeAutoFallback ? (
                    <Button variant="outline" onClick={onClearPin} disabled={isClearingPin}>
                      {isClearingPin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PinOff className="mr-2 h-4 w-4" />}
                      {isMyanmar ? 'ယာယီ အစားထိုးလမ်းကြောင်းကို ဖယ်ရှားမည်' : 'Override / clear fallback'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.active_backends')}</p>
            <p className="font-medium">{data?.attachedActiveKeys ?? 0}</p>
          </div>
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.viewer_ip')}</p>
            <p className="font-mono text-sm">{data?.viewerIp || t('dynamic_keys.routing.unavailable')}</p>
          </div>
        </div>

        {data ? (
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.preference_mode.label')}</p>
              <p className="font-medium">{formatRoutingPreferenceModeLabel(data.preferredRegionMode, t)}</p>
            </div>
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.preferred_servers')}</p>
              <p className="font-medium">{data.preferredServerIds.length || 0}</p>
            </div>
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.preferred_regions')}</p>
              <p className="font-medium">{data.preferredCountryCodes.length || 0}</p>
            </div>
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.stickiness.label')}</p>
              <p className="font-medium">{formatStickinessModeLabel(data.sessionStickinessMode, t)}</p>
            </div>
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.drain_grace')}</p>
              <p className="font-medium">{data.drainGraceMinutes} {t('dynamic_keys.routing.minutes_short')}</p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {data?.routingAlerts && data.routingAlerts.length > 0 && (
            <div className="col-span-2 space-y-3 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                {t('dynamic_keys.routing.active_alerts')}
              </p>
              <div className="space-y-2">
                {data.routingAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-3 text-sm",
                      alert.severity === 'CRITICAL'
                        ? "border-red-500/30 bg-red-500/10"
                        : "border-orange-500/30 bg-orange-500/10"
                    )}
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span>{alert.title}</span>
                      <span className="text-xs opacity-70">
                        {formatRelativeTime(alert.createdAt)}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{alert.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-3 dark:bg-white/[0.03] sm:col-span-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('dynamic_keys.routing.pin_expiry.label')}</p>
                <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.pin_expiry.help')}</p>
              </div>
              <Select value={pinExpiryValue} onValueChange={setPinExpiryValue}>
                <SelectTrigger className="w-full lg:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIN_EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.translationKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-3 dark:bg-white/[0.03] sm:col-span-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('dynamic_keys.routing.operator_note.label') || 'Operator Note'}</p>
              <Input
                placeholder={t('dynamic_keys.routing.operator_note.placeholder') || 'Reason for pinning... (optional)'}
                className="h-10 rounded-xl"
                value={operatorNote}
                onChange={(e) => setOperatorNote(e.target.value)}
              />
            </div>
          </div>
          <Button
            variant="outline"
            className="justify-start truncate"
            onClick={() => {
              const selectedOption = PIN_EXPIRY_OPTIONS.find((option) => option.value === pinExpiryValue);
              onPinCurrent(selectedOption?.minutes ?? null, operatorNote);
              setOperatorNote('');
            }}
            disabled={!canPinCurrent || isPinning}
          >
            {isPinning ? <Loader2 className="mr-2 h-4 w-4 animate-spin flex-shrink-0" /> : <Pin className="mr-2 h-4 w-4 flex-shrink-0" />}
            <span className="truncate">{t('dynamic_keys.routing.action.pin_current')}</span>
          </Button>
          <Button variant="outline" className="justify-start truncate" onClick={onClearPin} disabled={!data?.pinnedBackend || isClearingPin}>
            {isClearingPin ? <Loader2 className="mr-2 h-4 w-4 animate-spin flex-shrink-0" /> : <PinOff className="mr-2 h-4 w-4 flex-shrink-0" />}
            <span className="truncate">{t('dynamic_keys.routing.action.clear_pin')}</span>
          </Button>
          <Button variant="outline" className="justify-start truncate" onClick={onSimulateFailover} disabled={isSimulating}>
            {isSimulating ? <Loader2 className="mr-2 h-4 w-4 animate-spin flex-shrink-0" /> : <ArrowRightLeft className="mr-2 h-4 w-4 flex-shrink-0" />}
            <span className="truncate">{t('dynamic_keys.routing.action.simulate_failover')}</span>
          </Button>
          <Button variant="outline" className="justify-start truncate" onClick={onTestCandidates} disabled={isTesting}>
            {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin flex-shrink-0" /> : <FlaskConical className="mr-2 h-4 w-4 flex-shrink-0" />}
            <span className="truncate">{t('dynamic_keys.routing.action.test_candidates')}</span>
          </Button>
          <Button variant="outline" className="justify-start truncate border-dashed" onClick={onExportDiagnostics} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin flex-shrink-0" /> : <Download className="mr-2 h-4 w-4 flex-shrink-0" />}
            <span className="truncate">{t('dynamic_keys.routing.action.export_diagnostics') || 'Export Diagnostics'}</span>
          </Button>
        </div>

        {data?.pinnedBackend ? (
          <div className="rounded-[1.2rem] border border-primary/20 bg-primary/5 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('dynamic_keys.routing.pinned_backend')}
            </p>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {getCountryFlag(data.pinnedBackend.serverCountry || '')} {data.pinnedBackend.serverName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground break-words">
                  {data.pinnedBackend.keyName || t('dynamic_keys.routing.server_pin_only')}
                </p>
              </div>
              <Badge variant="outline" className="border-primary/30 text-primary">
                {t('dynamic_keys.routing.pin_active')}
              </Badge>
            </div>
            {data.pinnedBackend.pinnedAt ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('dynamic_keys.routing.pinned_at')} {formatRelativeTime(new Date(data.pinnedBackend.pinnedAt))}
              </p>
            ) : null}
            {data.pinnedBackend.pinExpiresAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('dynamic_keys.routing.pin_expires')} {formatRelativeTime(new Date(data.pinnedBackend.pinExpiresAt))}
              </p>
            ) : null}
          </div>
        ) : null}

        {simulationResult ? (
          <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('dynamic_keys.routing.simulation_result')}
            </p>
            <p className="mt-3 text-sm font-medium">
              {getCountryFlag(simulationResult.target.serverCountry || '')} {simulationResult.target.serverName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground break-words">{simulationResult.target.reason}</p>
          </div>
        ) : null}

        {candidateTestResult ? (
          <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('dynamic_keys.routing.test_result')}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {candidateTestResult.candidates.length} {t('dynamic_keys.routing.candidates_checked')}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(new Date(candidateTestResult.testedAt))}
              </span>
            </div>
          </div>
        ) : null}

        {data?.routingAlerts?.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('dynamic_keys.routing.active_alerts')}</p>
            <div className="space-y-2">
              {data.routingAlerts.map((alert) => (
                <div key={alert.id} className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        alert.severity === 'CRITICAL' && 'border-red-500/40 text-red-500',
                        alert.severity === 'WARNING' && 'border-amber-500/40 text-amber-500',
                        alert.severity === 'INFO' && 'border-cyan-500/40 text-cyan-500',
                      )}
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {data?.preferredServerIds?.length || data?.preferredCountryCodes?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('dynamic_keys.routing.preferred_servers')}
              </p>
              <p className="mt-3 text-sm text-muted-foreground break-words">
                {data.preferredServers.length
                  ? data.preferredServers
                      .map((server) => `${getCountryFlag(server.countryCode || '')} ${server.name}`.trim())
                      .join(' -> ')
                  : t('dynamic_keys.routing.no_server_order')}
              </p>
              {Object.keys(data.preferredServerWeights).length ? (
                <p className="mt-3 text-xs text-muted-foreground break-words">
                  {t('dynamic_keys.routing.weights')} {Object.entries(data.preferredServerWeights).map(([serverId, weight]) => `${serverId.slice(0, 6)}=${weight}x`).join(', ')}
                </p>
              ) : null}
            </div>
            <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('dynamic_keys.routing.preferred_regions')}
              </p>
              <p className="mt-3 text-sm text-muted-foreground break-words">
                {data.preferredCountryCodes.length
                  ? data.preferredCountryCodes.join(' -> ')
                  : t('dynamic_keys.routing.no_region_order')}
              </p>
              {Object.keys(data.preferredCountryWeights).length ? (
                <p className="mt-3 text-xs text-muted-foreground break-words">
                  {t('dynamic_keys.routing.weights')} {Object.entries(data.preferredCountryWeights).map(([countryCode, weight]) => `${countryCode}=${weight}x`).join(', ')}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {data ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.applied_template')}</p>
              <p className="font-medium">{data.appliedTemplate?.name || t('dynamic_keys.routing.none')}</p>
            </div>
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.rotation_trigger')}</p>
              <p className="font-medium">{data.rotationTriggerMode}</p>
            </div>
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.rotation_policy')}</p>
              <p className="font-medium">
                {data.rotationTriggerMode === 'USAGE' || data.rotationTriggerMode === 'COMBINED'
                  ? `${data.rotationUsageThresholdPercent}% quota`
                  : data.rotateOnHealthFailure
                    ? t('dynamic_keys.routing.health_aware')
                    : t('dynamic_keys.routing.scheduled')}
              </p>
            </div>
          </div>
        ) : null}

        {data?.currentSelection ? (
          <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('dynamic_keys.routing.current_selection')}
            </p>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {getCountryFlag(data.currentSelection.serverCountry || '')} {data.currentSelection.serverName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground break-words">
                  {data.currentSelection.keyName
                    ? data.currentSelection.keyName
                    : data.currentSelection.mode === 'SELF_MANAGED_CANDIDATE'
                      ? t('dynamic_keys.routing.server_candidate')
                      : t('dynamic_keys.routing.no_backend_selected')}
                </p>
              </div>
              <Badge variant="outline">
                {data.currentSelection.mode === 'SELF_MANAGED_CANDIDATE' ? t('dynamic_keys.routing.candidate') : t('dynamic_keys.routing.live')}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground break-words">{data.currentSelection.reason}</p>
            {data.currentSelection.lastTrafficAt ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('dynamic_keys.routing.last_traffic')} {formatRelativeTime(new Date(data.currentSelection.lastTrafficAt))}
              </p>
            ) : null}
          </div>
        ) : data?.selectionNote ? (
          <div className="rounded-[1.2rem] border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground dark:border-cyan-400/16">
            {data.selectionNote}
          </div>
        ) : null}

        {data?.lastResolvedBackend ? (
          <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('dynamic_keys.routing.last_backend')}
            </p>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {getCountryFlag(data.lastResolvedBackend.serverCountry || '')} {data.lastResolvedBackend.serverName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground break-words">{data.lastResolvedBackend.keyName}</p>
              </div>
              {data.lastResolvedBackend.isActive ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">
                  <Wifi className="mr-1 h-3 w-3" />
                  {t('dynamic_keys.routing.active')}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                  <WifiOff className="mr-1 h-3 w-3" />
                  {t('dynamic_keys.routing.idle')}
                </Badge>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.last_seen')}</p>
                <p className="font-medium">{formatRelativeTime(new Date(data.lastResolvedBackend.lastSeenAt))}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.backend_usage')}</p>
                <p className="font-medium">{formatBytes(BigInt(data.lastResolvedBackend.bytesUsed))}</p>
              </div>
            </div>
          </div>
        ) : null}

        {data?.recentBackendSwitches?.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('dynamic_keys.routing.recent_switches')}</p>
            <div className="space-y-2">
              {data.recentBackendSwitches.map((event) => (
                <div key={`${event.fromKeyId}-${event.toKeyId}-${event.switchedAt}`} className="ops-row-card">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
                      {event.fromServerName} → {event.toServerName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground break-words">
                      {event.fromKeyName} → {event.toKeyName}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(new Date(event.switchedAt))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {data?.candidateRanking?.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('dynamic_keys.routing.candidate_ranking')}</p>
            <div className="space-y-2">
              {data.candidateRanking.slice(0, 5).map((candidate, index) => (
                <div key={`${candidate.serverId}-${candidate.keyId || index}`} className="ops-row-card items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">
                      {index + 1}. {getCountryFlag(candidate.serverCountry || '')} {candidate.serverName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground break-words">
                      {candidate.keyName ? `${candidate.keyName} · ` : ''}
                      {candidate.reason}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{candidate.weight}x {t('dynamic_keys.routing.weight')}</p>
                    <p>{candidate.loadScore !== null ? `${candidate.loadScore}% ${t('dynamic_keys.routing.load')}` : t('dynamic_keys.routing.no_load')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {data?.routingTimeline?.length ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">{t('dynamic_keys.routing.timeline')}</p>
              <div className="w-full sm:w-[220px]">
                <Select value={timelineFilter} onValueChange={(value) => setTimelineFilter(value as RoutingTimelineFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('dynamic_keys.routing.timeline_filter.all')}</SelectItem>
                    <SelectItem value="FAILOVER">{t('dynamic_keys.routing.timeline_filter.failover')}</SelectItem>
                    <SelectItem value="ALERTS">{t('dynamic_keys.routing.timeline_filter.alerts')}</SelectItem>
                    <SelectItem value="PINS">{t('dynamic_keys.routing.timeline_filter.pins')}</SelectItem>
                    <SelectItem value="ROTATION">{t('dynamic_keys.routing.timeline_filter.rotation')}</SelectItem>
                    <SelectItem value="TESTS">{t('dynamic_keys.routing.timeline_filter.tests')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              {filteredTimeline.length ? filteredTimeline.slice(0, 10).map((event) => (
                <div key={event.id} className="ops-row-card items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{formatRoutingEventLabel(event.eventType, t)}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          event.severity === 'CRITICAL' && 'border-red-500/40 text-red-500',
                          event.severity === 'WARNING' && 'border-amber-500/40 text-amber-500',
                          event.severity === 'INFO' && 'border-cyan-500/40 text-cyan-500',
                        )}
                      >
                        {event.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground break-words">{event.reason}</p>
                    {(event.fromServerName || event.toServerName) ? (
                      <p className="mt-1 text-xs text-muted-foreground break-words">
                        {(event.fromServerName || t('dynamic_keys.routing.none'))} → {(event.toServerName || t('dynamic_keys.routing.none'))}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(new Date(event.createdAt))}
                  </span>
                </div>
              )) : (
                <div className="rounded-[1.2rem] border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground dark:border-cyan-400/16">
                  {t('dynamic_keys.routing.timeline_filter.empty')}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.last_share_view')}</p>
            <p className="font-medium">
              {data?.lastSharePageViewAt ? formatRelativeTime(new Date(data.lastSharePageViewAt)) : t('dynamic_keys.routing.never')}
            </p>
          </div>
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.last_copy')}</p>
            <p className="font-medium">
              {data?.lastSharePageCopyAt ? formatRelativeTime(new Date(data.lastSharePageCopyAt)) : t('dynamic_keys.routing.never')}
            </p>
          </div>
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">{t('dynamic_keys.routing.last_app_open')}</p>
            <p className="font-medium">
              {data?.lastSharePageOpenAppAt ? formatRelativeTime(new Date(data.lastSharePageOpenAppAt)) : t('dynamic_keys.routing.never')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DynamicKeyTemplateCard({
  dak,
  onUpdate,
}: {
  dak: {
    id: string;
    name: string;
    type: 'SELF_MANAGED' | 'MANUAL';
    notes: string | null;
    dataLimitBytes: bigint | null;
    maxDevices: number | null;
    boundDeviceInstallsOnly: boolean | null;
    durationDays: number | null;
    method: string | null;
    serverTagIds: string[];
    loadBalancerAlgorithm: 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD';
    preferredServerIds: string[];
    preferredCountryCodes: string[];
    preferredServerWeights: Record<string, number>;
    preferredCountryWeights: Record<string, number>;
    preferredRegionMode: DynamicRoutingPreferenceMode;
    sessionStickinessMode: 'NONE' | 'DRAIN';
    drainGraceMinutes: number;
    rotationEnabled: boolean;
    rotationInterval: string;
    rotationTriggerMode: 'SCHEDULED' | 'USAGE' | 'HEALTH' | 'COMBINED';
    rotationUsageThresholdPercent: number;
    rotateOnHealthFailure: boolean;
    sharePageEnabled: boolean;
    subscriptionTheme: string | null;
    subscriptionWelcomeMessage: string | null;
    appliedTemplateId: string | null;
  };
  onUpdate: () => void;
}) {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState(dak.appliedTemplateId || '__none__');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const templatesQuery = trpc.dynamicKeys.listTemplates.useQuery(undefined, {
    staleTime: 60_000,
  });

  useEffect(() => {
    setSelectedTemplateId(dak.appliedTemplateId || '__none__');
  }, [dak.appliedTemplateId]);

  const applyTemplateMutation = trpc.dynamicKeys.applyTemplate.useMutation({
    onSuccess: () => {
      toast({
        title: isMyanmar ? 'နမူနာပုံစံကို အသုံးချပြီးပါပြီ' : 'Template applied',
        description: isMyanmar
          ? 'ရွေးထားသော template ဖြင့် ပြောင်းလဲနိုင်သောသော့ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။'
          : 'The dynamic key was updated with the selected template.',
      });
      onUpdate();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'နမူနာပုံစံကို အသုံးချမရပါ' : 'Template apply failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createTemplateMutation = trpc.dynamicKeys.createTemplate.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'နမူနာပုံစံကို သိမ်းပြီးပါပြီ' : 'Template saved',
        description: isMyanmar
          ? 'ဤပြောင်းလဲနိုင်သောသော့ကို ယခုအခါ routing template အဖြစ် ပြန်လည်အသုံးပြုနိုင်ပါပြီ။'
          : 'This dynamic key can now be reused as a routing template.',
      });
      setTemplateName('');
      setTemplateDescription('');
      await templatesQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'နမူနာပုံစံကို သိမ်းမရပါ' : 'Template save failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteTemplateMutation = trpc.dynamicKeys.deleteTemplate.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'နမူနာပုံစံကို ဖျက်ပြီးပါပြီ' : 'Template deleted',
        description: isMyanmar
          ? 'သိမ်းထားသော template ကို ဖယ်ရှားပြီးပါပြီ။'
          : 'The saved template has been removed.',
      });
      setSelectedTemplateId('__none__');
      await templatesQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'နမူနာပုံစံကို ဖျက်မရပါ' : 'Template delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const saveCurrentTemplate = () => {
    if (!templateName.trim()) {
      toast({
        title: isMyanmar ? 'နမူနာပုံစံ အမည် လိုအပ်သည်' : 'Template name required',
        description: isMyanmar
          ? 'သိမ်းမီ template အမည်ကို ထည့်ပါ။'
          : 'Enter a template name before saving.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedSubscriptionTheme =
      dak.subscriptionTheme &&
      subscriptionThemeIds.includes(dak.subscriptionTheme as (typeof subscriptionThemeIds)[number])
        ? (dak.subscriptionTheme as (typeof subscriptionThemeIds)[number])
        : undefined;

    createTemplateMutation.mutate({
      name: templateName.trim(),
      description: templateDescription.trim() || undefined,
      type: dak.type,
      notes: dak.notes || undefined,
      dataLimitGB: dak.dataLimitBytes ? Number(dak.dataLimitBytes) / (1024 * 1024 * 1024) : undefined,
      maxDevices: dak.maxDevices ?? undefined,
      boundDeviceInstallsOnly: dak.maxDevices ? (dak.boundDeviceInstallsOnly ?? true) : undefined,
      durationDays: dak.durationDays ?? undefined,
      method: (dak.method as 'chacha20-ietf-poly1305' | 'aes-128-gcm' | 'aes-192-gcm' | 'aes-256-gcm') || 'chacha20-ietf-poly1305',
      serverTagIds: dak.serverTagIds,
      loadBalancerAlgorithm: dak.loadBalancerAlgorithm,
      preferredServerIds: dak.preferredServerIds,
      preferredCountryCodes: dak.preferredCountryCodes,
      preferredServerWeights: dak.preferredServerWeights,
      preferredCountryWeights: dak.preferredCountryWeights,
      preferredRegionMode: dak.preferredRegionMode,
      sessionStickinessMode: dak.sessionStickinessMode,
      drainGraceMinutes: dak.drainGraceMinutes,
      rotationEnabled: dak.rotationEnabled,
      rotationInterval: dak.rotationInterval as 'NEVER' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
      rotationTriggerMode: dak.rotationTriggerMode,
      rotationUsageThresholdPercent: dak.rotationUsageThresholdPercent,
      rotateOnHealthFailure: dak.rotateOnHealthFailure,
      sharePageEnabled: dak.sharePageEnabled,
      subscriptionTheme: normalizedSubscriptionTheme,
      subscriptionWelcomeMessage: dak.subscriptionWelcomeMessage || undefined,
    });
  };

  return (
    <Card className="ops-detail-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          {isMyanmar ? 'လမ်းကြောင်း နမူနာပုံစံများ' : 'Routing Templates'}
        </CardTitle>
        <CardDescription>
          {isMyanmar
            ? 'ဤပြောင်းလဲနိုင်သောသော့ကို ထပ်သုံးနိုင်သော routing policy အဖြစ် သိမ်းဆည်းပါ သို့မဟုတ် ရှိပြီးသား template ကို အသုံးချပါ။'
            : 'Save this dynamic key as a reusable routing policy or apply an existing template.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{isMyanmar ? 'ရှိပြီးသား နမူနာပုံစံကို အသုံးချမည်' : 'Apply existing template'}</Label>
          <div className="flex gap-2">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={isMyanmar ? 'နမူနာပုံစံ တစ်ခုကို ရွေးပါ' : 'Select a template'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{isMyanmar ? 'နမူနာပုံစံ မရွေးပါ' : 'No template'}</SelectItem>
                {(templatesQuery.data ?? []).map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() =>
                applyTemplateMutation.mutate({
                  id: dak.id,
                  templateId: selectedTemplateId === '__none__' ? null : selectedTemplateId,
                })
              }
              disabled={applyTemplateMutation.isPending}
            >
              {applyTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isMyanmar ? 'အသုံးချမည်' : 'Apply')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isMyanmar
              ? 'Template များသည် routing preferences၊ rotation defaults နှင့် share-page defaults များကို တစ်ချက်တည်းဖြင့် အစားထိုးနိုင်သည်။'
              : 'Templates can replace routing preferences, rotation defaults, and share-page defaults in one click.'}
          </p>
        </div>

        {selectedTemplateId !== '__none__' ? (
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive"
            onClick={() => deleteTemplateMutation.mutate({ id: selectedTemplateId })}
            disabled={deleteTemplateMutation.isPending}
        >
          {deleteTemplateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isMyanmar ? 'ရွေးထားသော နမူနာပုံစံကို ဖျက်မည်' : 'Delete selected template'}
        </Button>
      ) : null}

      <div className="space-y-3 rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
        <div className="space-y-1">
            <p className="text-sm font-medium">{isMyanmar ? 'လက်ရှိ သတ်မှတ်ချက်ကို နမူနာပုံစံအဖြစ် သိမ်းမည်' : 'Save current configuration as template'}</p>
            <p className="text-xs text-muted-foreground">
              {isMyanmar
                ? 'နောင်တွင် ပြောင်းလဲနိုင်သောသော့အသစ်များ ဖန်တီးရာ၌ ပြန်လည်အသုံးပြုနိုင်ရန် လက်ရှိ routing weights၊ drain mode နှင့် rotation policy ကို သိမ်းဆည်းပါ။'
                : 'Capture the current routing weights, drain mode, and rotation policy for reuse when creating future dynamic keys.'}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{isMyanmar ? 'နမူနာပုံစံ အမည်' : 'Template name'}</Label>
            <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={isMyanmar ? 'ပရီမီယံ SG failover မူဝါဒ' : 'Premium SG failover policy'} />
          </div>
          <div className="space-y-2">
            <Label>{isMyanmar ? 'ဖော်ပြချက်' : 'Description'}</Label>
            <Textarea
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
              placeholder={isMyanmar ? 'ဤနမူနာပုံစံကို ဘယ်အချိန် အသုံးပြုသင့်သည်ကို ရှင်းပြပါ။' : 'Explain when to use this template.'}
              rows={3}
            />
          </div>
          <Button className="w-full" onClick={saveCurrentTemplate} disabled={createTemplateMutation.isPending}>
            {createTemplateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isMyanmar ? 'နမူနာပုံစံအဖြစ် သိမ်းမည်' : 'Save as template'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * DynamicKeyDetailPage Component
 */

function AccessDistributionCard({
  dakId,
  dakName,
  accessKeys,
}: {
  dakId: string;
  dakName: string;
  accessKeys: any[];
}) {
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { toast } = useToast();
  const [maxUses, setMaxUses] = useState<number | undefined>();
  const [expiresInHours, setExpiresInHours] = useState<number | undefined>();
  
  const utils = trpc.useUtils();
  const { data: links = [], isLoading } = trpc.dynamicKeys.listDistributionLinks.useQuery({ dakId });
  
  const createMutation = trpc.dynamicKeys.createDistributionLink.useMutation({
    onSuccess: () => {
      utils.dynamicKeys.listDistributionLinks.invalidate({ dakId });
      setMaxUses(undefined);
      setExpiresInHours(undefined);
      toast({ title: t('dynamic_keys.distribution.toast.created') });
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.distribution.toast.create_failed'),
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const deleteMutation = trpc.dynamicKeys.deleteDistributionLink.useMutation({
    onSuccess: () => {
      utils.dynamicKeys.listDistributionLinks.invalidate({ dakId });
      toast({ title: t('dynamic_keys.distribution.toast.deleted') });
    },
  });

  const handleCreate = () => {
    createMutation.mutate({ dakId, maxUses, expiresInHours });
  };

  const handleCopyLink = (token: string) => {
    const url = buildDynamicDistributionLinkUrl(token, {
      origin: typeof window !== 'undefined' ? window.location.origin : null,
    });
    copyToClipboard(url, t('dynamic_keys.distribution.toast.copied_title'), t('dynamic_keys.distribution.toast.copied_desc'));
  };

  const handleDownloadBundle = () => {
    const bundle = {
      name: dakName,
      generatedAt: new Date().toISOString(),
      backends: accessKeys.map(k => ({
        name: k.name,
        server: k.server?.name,
        accessUrl: k.accessUrl,
        password: k.password,
        port: k.port,
        method: k.method,
      }))
    };
    downloadTextFile(JSON.stringify(bundle, null, 2), `${dakName}-bundle.json`);
    toast({ title: t('dynamic_keys.distribution.toast.bundle_downloaded') });
  };

  return (
    <Card className="ops-detail-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-primary" />
          {t('dynamic_keys.distribution.title')}
        </CardTitle>
        <CardDescription>{t('dynamic_keys.distribution.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t('dynamic_keys.distribution.create_link')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('dynamic_keys.distribution.max_uses')}</Label>
              <Input
                type="number"
                placeholder={t('dynamic_keys.distribution.unlimited')}
                value={maxUses || ''}
                onChange={(e) => setMaxUses(e.target.value ? parseInt(e.target.value) : undefined)}
                min={1}
                max={100}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('dynamic_keys.distribution.expires_in_hours')}</Label>
              <Input
                type="number"
                placeholder={t('dynamic_keys.distribution.default_24h')}
                value={expiresInHours || ''}
                onChange={(e) => setExpiresInHours(e.target.value ? parseInt(e.target.value) : undefined)}
                min={1}
                max={720}
              />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('dynamic_keys.distribution.generate')}
          </Button>
        </div>

        {links.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t('dynamic_keys.distribution.active_links')}</p>
            <div className="space-y-2">
              {links.map((link) => (
                <div key={link.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 font-mono text-xs max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                    {buildDynamicDistributionLinkUrl(link.token, {
                      origin: typeof window !== 'undefined' ? window.location.origin : null,
                    })}
                  </div>
                  <div className="flex shrink-0 items-center justify-between sm:justify-end gap-2 text-xs text-muted-foreground">
                    <span>
                      {link.maxUses !== null
                        ? `${link.currentUses}/${link.maxUses} ${t('dynamic_keys.distribution.uses')}`
                        : `${link.currentUses} ${t('dynamic_keys.distribution.uses')}`}
                      {link.expiresAt && ` · ${t('dynamic_keys.distribution.expires_prefix')} ${formatRelativeTime(link.expiresAt)}`}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopyLink(link.token)}
                        className="h-7 w-7"
                        title={t('dynamic_keys.distribution.copy_link')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => deleteMutation.mutate({ id: link.id })}
                        disabled={deleteMutation.isPending}
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title={t('dynamic_keys.distribution.delete_link')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-4 space-y-3">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="h-4 w-4" /> {t('dynamic_keys.distribution.power_tools')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t('dynamic_keys.distribution.bundle_desc')}</p>
          </div>
          <Button variant="secondary" onClick={handleDownloadBundle}>
            <Download className="mr-2 h-4 w-4" /> {t('dynamic_keys.distribution.download_bundle')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DynamicKeyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const dakId = params.id as string;
  const isMyanmar = locale === 'my';

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'routing' | 'delivery' | 'history'>('overview');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');

  // Fetch DAK data from API
  const { data: dak, isLoading, refetch } = trpc.dynamicKeys.getById.useQuery(
    { id: dakId },
    { enabled: !!dakId }
  );
  const routingDiagnosticsQuery = trpc.dynamicKeys.getRoutingDiagnostics.useQuery(
    { id: dakId },
    {
      enabled: !!dakId,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  );
  const pinBackendMutation = trpc.dynamicKeys.pinBackend.useMutation({
    onSuccess: async () => {
      toast({
        title: t('dynamic_keys.routing.toast.pinned_title'),
        description: t('dynamic_keys.routing.toast.pinned_desc'),
      });
      await Promise.all([refetch(), routingDiagnosticsQuery.refetch()]);
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.routing.toast.pin_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const clearPinnedBackendMutation = trpc.dynamicKeys.clearPinnedBackend.useMutation({
    onSuccess: async () => {
      toast({
        title: t('dynamic_keys.routing.toast.pin_cleared_title'),
        description: t('dynamic_keys.routing.toast.pin_cleared_desc'),
      });
      await Promise.all([refetch(), routingDiagnosticsQuery.refetch()]);
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.routing.toast.pin_clear_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const simulateFailoverMutation = trpc.dynamicKeys.simulateFailover.useMutation({
    onSuccess: async (result) => {
      toast({
        title: t('dynamic_keys.routing.toast.simulation_title'),
        description: `${t('dynamic_keys.routing.toast.simulation_desc')} ${result.target.serverName}.`,
      });
      await routingDiagnosticsQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.routing.toast.simulation_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const testCandidatesMutation = trpc.dynamicKeys.testCandidates.useMutation({
    onSuccess: async (result) => {
      toast({
        title: t('dynamic_keys.routing.toast.test_title'),
        description: `${result.candidates.length} ${t('dynamic_keys.routing.toast.test_desc')}`,
      });
      await routingDiagnosticsQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.routing.toast.test_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const sendBandwidthAlertMutation = trpc.dynamicKeys.sendBandwidthAlert.useMutation({
    onSuccess: async (result) => {
      toast({
        title: result.level === 'DISABLED' ? 'Limit notice sent' : `${result.level}% alert sent`,
        description: result.level === 'DISABLED'
          ? 'The manual dynamic-key limit notice was delivered.'
          : `The manual ${result.level}% dynamic-key alert was delivered.`,
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
  const resetBandwidthAlertStateMutation = trpc.dynamicKeys.resetBandwidthAlertState.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Alert history reset',
        description: 'Quota alert flags were cleared for this dynamic key.',
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

  // Delete mutation
  const deleteMutation = trpc.dynamicKeys.delete.useMutation({
    onSuccess: () => {
      toast({
        title: t('dynamic_keys.msg.deleted'),
        description: 'The dynamic key has been deleted successfully.',
      });
      router.push('/dashboard/dynamic-keys');
    },
    onError: (error) => {
      toast({
        title: 'Error deleting dynamic key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Detach key mutation
  const detachKeyMutation = trpc.dynamicKeys.detachKey.useMutation({
    onSuccess: () => {
      toast({
        title: t('dynamic_keys.msg.detached'),
        description: 'The access key has been detached from this dynamic key.',
      });
      refetch();
      refetchAvailableKeys();
    },
    onError: (error) => {
      toast({
        title: 'Error detaching key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Attach key mutation
  const attachKeyMutation = trpc.dynamicKeys.attachKey.useMutation({
    onSuccess: () => {
      toast({
        title: 'Key attached',
        description: 'The access key has been attached to this dynamic key.',
      });
      setAttachDialogOpen(false);
      setSelectedKeyId('');
      refetch();
      refetchAvailableKeys();
    },
    onError: (error) => {
      toast({
        title: 'Error attaching key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Fetch available keys (not attached to any DAK)
  const { data: availableKeys, refetch: refetchAvailableKeys } = trpc.keys.list.useQuery({
    status: 'ACTIVE',
    unattachedOnly: true,
    pageSize: 100,
  });

  const ssconfUrl = useMemo(() => {
    if (typeof window === 'undefined' || !dak?.dynamicUrl) return '';
    const identifier = dak.publicSlug || dak.dynamicUrl;
    return buildDynamicOutlineUrl(identifier, dak.name, {
      origin: window.location.origin,
      shortPath: Boolean(dak.publicSlug),
    });
  }, [dak?.dynamicUrl, dak?.name, dak?.publicSlug]);

  const subscriptionApiUrl = useMemo(() => {
    if (typeof window === 'undefined' || !dak?.dynamicUrl) return '';
    if (dak.publicSlug) {
      return buildDynamicShortClientUrl(dak.publicSlug, {
        origin: window.location.origin,
      });
    }
    return buildDynamicSubscriptionApiUrl(dak.dynamicUrl, {
      origin: window.location.origin,
    });
  }, [dak?.dynamicUrl, dak?.publicSlug]);
  const subscriptionProbeUrl = useMemo(() => {
    if (typeof window === 'undefined' || !dak?.dynamicUrl) return '';
    if (dak.publicSlug) {
      return `${window.location.origin}${getPublicBasePath()}/c/${dak.publicSlug}`;
    }

    return `${window.location.origin}${getPublicBasePath()}/api/sub/${dak.dynamicUrl}`;
  }, [dak?.dynamicUrl, dak?.publicSlug]);
  const qrDownloadFilename = buildDownloadFilename(dak?.name, 'qr', 'png');
  const configDownloadFilename = buildDownloadFilename(dak?.name, 'dynamic-config', 'txt');
  const currentBackendConfigFilename = buildDownloadFilename(dak?.name, 'current-backend', 'txt');
  const currentBackendAccessUrl = useMemo(() => {
    if (!dak) {
      return '';
    }

    const selectedKeyId =
      routingDiagnosticsQuery.data?.currentSelection?.keyId
      || routingDiagnosticsQuery.data?.pinnedBackend?.keyId
      || routingDiagnosticsQuery.data?.lastResolvedBackend?.keyId
      || null;

    if (!selectedKeyId) {
      return '';
    }

    return dak.accessKeys.find((key) => key.id === selectedKeyId)?.accessUrl || '';
  }, [dak, routingDiagnosticsQuery.data]);

  // Generate QR code when data loads
  useEffect(() => {
    if (ssconfUrl) {
      QRCode.toDataURL(ssconfUrl, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then((qr) => setQrCode(qr))
        .catch((err) => console.error('Failed to generate QR code:', err));
    }
  }, [ssconfUrl]);

  const handleCopyUrl = () => {
    if (ssconfUrl) {
      copyToClipboard(ssconfUrl, t('dynamic_keys.msg.copied'), 'Dynamic access key URL copied. Paste in Outline client.');
    }
  };

  const handleCopyToken = () => {
    if (subscriptionApiUrl) {
      copyToClipboard(subscriptionApiUrl, t('dynamic_keys.msg.copied'), 'Subscription URL copied to clipboard.');
    }
  };

  const handleDownloadQr = () => {
    if (!qrCode) {
      toast({
        title: 'QR unavailable',
        description: 'The QR image is not ready yet.',
        variant: 'destructive',
      });
      return;
    }

    downloadDataUrl(qrCode, qrDownloadFilename);
    toast({
      title: 'QR downloaded',
      description: `${qrDownloadFilename} has been saved.`,
    });
  };

  const handleDownloadConfig = () => {
    if (!ssconfUrl) {
      toast({
        title: 'Config unavailable',
        description: 'The client config is not ready yet.',
        variant: 'destructive',
      });
      return;
    }

    downloadTextFile(`${ssconfUrl}\n`, configDownloadFilename);
    toast({
      title: 'Config downloaded',
      description: `${configDownloadFilename} has been saved.`,
    });
  };

  const handleDownloadCurrentBackendConfig = () => {
    if (!currentBackendAccessUrl) {
      toast({
        title: t('dynamic_keys.routing.toast.backend_config_unavailable'),
        description: t('dynamic_keys.routing.toast.backend_config_unavailable_desc'),
        variant: 'destructive',
      });
      return;
    }

    downloadTextFile(`${currentBackendAccessUrl}\n`, currentBackendConfigFilename);
    toast({
      title: t('dynamic_keys.routing.toast.backend_config_downloaded'),
      description: `${currentBackendConfigFilename} ${t('dynamic_keys.routing.toast.file_saved')}`,
    });
  };

  const handlePinCurrentBackend = (expiresInMinutes: number | null, operatorNote?: string) => {
    if (!dak || !routingDiagnosticsQuery.data?.currentSelection) {
      toast({
        title: t('dynamic_keys.routing.toast.pin_failed'),
        description: t('dynamic_keys.routing.toast.no_selection'),
        variant: 'destructive',
      });
      return;
    }

    const selection = routingDiagnosticsQuery.data.currentSelection;
    pinBackendMutation.mutate({
      id: dak.id,
      accessKeyId: selection.keyId ?? undefined,
      serverId: selection.serverId ?? undefined,
      expiresInMinutes,
      operatorNote,
    });
  };

  const handlePinSuggestedFallback = () => {
    if (!dak || !routingDiagnosticsQuery.data?.premiumRegionAutomation?.suggestedFallback) {
      toast({
        title: locale === 'my' ? 'အစားထိုး လမ်းကြောင်း မရနိုင်ပါ' : 'Fallback unavailable',
        description: locale === 'my' ? 'ယခုအချိန်တွင် အကြံပြုထားသော ပရီမီယံ အစားထိုး လမ်းကြောင်း မရှိသေးပါ။' : 'No suggested premium fallback is available right now.',
        variant: 'destructive',
      });
      return;
    }

    const fallback = routingDiagnosticsQuery.data.premiumRegionAutomation.suggestedFallback;
    pinBackendMutation.mutate({
      id: dak.id,
      accessKeyId: fallback.accessKeyId ?? undefined,
      serverId: fallback.serverId,
      expiresInMinutes: 8 * 60,
      operatorNote: `Premium fallback approved from panel for ${fallback.regionCode}.`,
    });
  };

  const exportDiagnosticsMutation = trpc.dynamicKeys.exportDiagnostics.useMutation({
    onSuccess: (data: any) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `diagnostics-${dak?.name || 'dak'}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Diagnostics Exported',
        description: 'The diagnostic report has been downloaded to your computer.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Export Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleExportDiagnostics = () => {
    if (!dak) return;
    exportDiagnosticsMutation.mutate({ id: dak.id });
  };

  const handleClearPinnedBackend = () => {
    if (!dak) {
      return;
    }

    clearPinnedBackendMutation.mutate({ id: dak.id });
  };

  const handleSimulateFailover = () => {
    if (!dak) {
      return;
    }

    simulateFailoverMutation.mutate({ id: dak.id });
  };

  const handleTestCandidates = () => {
    if (!dak) {
      return;
    }

    testCandidatesMutation.mutate({ id: dak.id });
  };

  const handleDelete = () => {
    if (dak && confirm(t('dynamic_keys.msg.confirm_delete'))) {
      deleteMutation.mutate({ id: dak.id });
    }
  };

  const handleDetachKey = (keyId: string) => {
    if (dak && confirm(t('dynamic_keys.msg.confirm_detach'))) {
      detachKeyMutation.mutate({ dakId: dak.id, keyId });
    }
  };

  const handleAttachKey = () => {
    if (dak && selectedKeyId) {
      attachKeyMutation.mutate({ dakId: dak.id, keyId: selectedKeyId });
    }
  };

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

  if (!dak) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <KeyRound className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('dynamic_keys.detail.not_found')}</h3>
          <p className="text-muted-foreground mb-6">
            {locale === 'my'
              ? 'တောင်းဆိုထားသော ပြောင်းလဲနိုင်သော အသုံးပြုခွင့်သော့ကို မတွေ့ပါ။'
              : 'The requested dynamic access key could not be found.'}
          </p>
          <Button asChild>
            <Link href="/dashboard/dynamic-keys">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('dynamic_keys.detail.back')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const typeConfig = DAK_TYPES[dak.type];
  const TypeIcon = typeConfig.icon;
  const usagePercent = dak.dataLimitBytes
    ? Number((dak.usedBytes * BigInt(100)) / dak.dataLimitBytes)
    : 0;
  const quotaAlertState = dak.dataLimitBytes
    ? getQuotaAlertState({
        usagePercent,
        thresholds: dak.quotaAlertThresholds,
        sentThresholds: dak.quotaAlertsSent,
      })
    : null;
  const manualBandwidthLevel = quotaAlertState?.recommendedLevel ?? null;
  const bandwidthThresholdLabel = quotaAlertState?.thresholds.length
    ? quotaAlertState.thresholds.map((threshold) => `${threshold}%`).join(', ')
    : locale === 'my'
      ? 'မရှိပါ'
      : 'None';
  const attachedActiveKeys = dak.accessKeys.filter((key) => key.status === 'ACTIVE').length;
  const serverCoverage = new Set(dak.accessKeys.map((key) => key.server?.id).filter(Boolean)).size;
  const detailTabCopy: Record<'overview' | 'routing' | 'delivery' | 'history', string> = {
    overview:
      locale === 'my'
        ? 'ဤပြောင်းလဲနိုင်သော သော့အတွက် စာရင်းသွင်းမှု အခြေခံအချက်များ၊ quota နှင့် ချိတ်ထားသော access key များကို ကြည့်ရှုပါ။'
        : 'Subscription basics, quota, and attached access keys for this dynamic access key.',
    routing:
      locale === 'my'
        ? 'ပရီမီယံပို့ဆောင်မှုအတွက် server health၊ rotation မူဝါဒနှင့် backend diagnostics ကို စောင့်ကြည့်ပါ။'
        : 'Health-aware routing, rotation policy, and backend diagnostics for premium delivery.',
    delivery:
      locale === 'my'
        ? 'ဤစာရင်းသွင်းမှုအတွက် မျှဝေစာမျက်နှာ၊ ကလိုင်းယင့်ပို့ဆောင်မှု၊ template နှင့် access ဖြန့်ချီရေး setting များကို စီမံပါ။'
        : 'Share pages, client delivery, templates, and access distribution settings for this subscription.',
    history:
      locale === 'my'
        ? 'ဤပြောင်းလဲနိုင်သော သော့နှင့် ဆက်စပ်နေသော ချိတ်ဆက်မှု လှုပ်ရှားမှုနှင့် billing history ကို ပြန်လည်ကြည့်ရှုပါ။'
        : 'Connection activity and billing history linked to this dynamic access key.',
  };

  return (
    <div className="space-y-6" data-testid="dynamic-key-detail-page">
      <DetailHero data-testid="dynamic-key-detail-hero">
        <DetailHeroGrid>
          <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="ghost" size="icon" asChild className="rounded-full">
                    <Link href="/dashboard/dynamic-keys">
                      <ArrowLeft className="h-5 w-5" />
                    </Link>
                  </Button>
                  <span className="ops-pill border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-200">
                    <KeyRound className="h-3.5 w-3.5" />
                    {locale === 'my' ? 'ပြောင်းလဲနိုင်သော သော့' : 'Dynamic Key'}
                  </span>
                  <Badge variant={dak.status === 'ACTIVE' ? 'default' : 'secondary'} className="rounded-full px-3 py-1">
                    {dak.status}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {t(typeConfig.labelKey)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{dak.name}</h1>
                  <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                    {t(typeConfig.descriptionKey)}. {t('dynamic_keys.detail.created')} {formatRelativeTime(dak.createdAt)}.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 xl:flex xl:flex-wrap xl:justify-end">
                <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setEditDialogOpen(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {locale === 'my' ? 'ပြင်ဆင်မည်' : 'Edit'}
                </Button>
                <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('dynamic_keys.detail.refresh')}
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
                  {t('dynamic_keys.detail.delete')}
                </Button>
              </div>
            </div>

            <DetailMetricGrid>
              <DetailKpiTile
                label={t('dynamic_keys.detail.attached_keys')}
                value={dak.accessKeys.length}
                meta={isMyanmar ? `အသုံးပြုနေသော ချိတ်ဆက်ထားသည့် သော့ ${attachedActiveKeys} ခု` : `${attachedActiveKeys} active attached keys`}
              />
              <DetailKpiTile
                label={locale === 'my' ? 'ဆာဗာ လွှမ်းခြုံမှု' : 'Server Coverage'}
                value={serverCoverage}
                meta={locale === 'my' ? 'ဤစာရင်းသွင်းမှုကို ဝန်ဆောင်မှုပေးနေသော မတူညီသော ဆာဗာများ' : 'Distinct servers serving this subscription'}
              />
              <DetailKpiTile
                label={t('dynamic_keys.detail.traffic_usage')}
                value={formatBytes(dak.usedBytes)}
                meta={dak.dataLimitBytes ? `${locale === 'my' ? 'စုစုပေါင်း' : 'of'} ${formatBytes(dak.dataLimitBytes)}` : (locale === 'my' ? 'ကန့်သတ်ချက် မရှိပါ' : 'Unlimited quota')}
              />
              <DetailKpiTile
                label={locale === 'my' ? 'လှည့်ပြောင်းမှု' : 'Rotation'}
                value={dak.rotationEnabled ? dak.rotationInterval : (locale === 'my' ? 'ပိတ်ထားသည်' : 'Off')}
                meta={dak.nextRotationAt ? (locale === 'my' ? `နောက်တစ်ကြိမ် ${formatRelativeTime(dak.nextRotationAt)}` : `Next ${formatRelativeTime(dak.nextRotationAt)}`) : (locale === 'my' ? 'အချိန်ဇယားထားသော လှည့်ပြောင်းမှု မရှိပါ' : 'No scheduled rotation')}
              />
            </DetailMetricGrid>
          </div>

          <DetailHeroAside
            title={locale === 'my' ? 'စာရင်းသွင်းမှု အကျဉ်းချုပ်' : 'Subscription summary'}
            description={
              locale === 'my'
                ? 'လမ်းကြောင်းခွဲမှု သို့မဟုတ် ချိတ်ထားသော အသုံးပြုခွင့်သော့များကို ပြင်နေစဉ် လမ်းကြောင်းရွေးချယ်မှု၊ ပို့ဆောင်မှုအခြေအနေနှင့် မျှဝေမှုအမှတ်အသားကို မြင်သာစွာ ထားပါ။'
                : 'Keep route selection, delivery state, and share identity visible while editing routing or attached access keys.'
            }
          >
            <DetailMiniTileGrid>
              <DetailMiniTile
                label={t('dashboard.current_route')}
                value={routingDiagnosticsQuery.data?.currentSelection?.serverName || (locale === 'my' ? 'အလိုအလျောက် ရွေးချယ်နေသည်' : 'Resolving automatically')}
                meta={routingDiagnosticsQuery.data?.currentSelection?.keyName || (locale === 'my' ? 'ချိတ်ထားသော နောက်ခံချိတ်ဆက်မှု မရှိပါ' : 'No pinned backend')}
              />
              <DetailMiniTile
                label={locale === 'my' ? 'မျှဝေမှု အမှတ်အသား' : 'Share identity'}
                value={dak.publicSlug || dak.dynamicUrl || (locale === 'my' ? 'မဖန်တီးရသေးပါ' : 'Not generated')}
                valueClassName="break-all"
              />
              <DetailMiniTile
                label={locale === 'my' ? 'ပို့ဆောင်မှု အခြေအနေ' : 'Delivery state'}
                value={dak.sharePageEnabled === false ? (locale === 'my' ? 'မျှဝေစာမျက်နှာ ပိတ်ထားသည်' : 'Share page off') : (locale === 'my' ? 'မျှဝေစာမျက်နှာ ဖွင့်ထားသည်' : 'Share page on')}
                meta={dak.dynamicUrl ? (locale === 'my' ? 'ကလိုင်းယင့် URL အသင့်ဖြစ်နေသည်' : 'Client URL ready') : (locale === 'my' ? 'ကလိုင်းယင့် URL မရရှိနိုင်ပါ' : 'Client URL unavailable')}
              />
              <DetailMiniTile
                label={locale === 'my' ? 'ကန့်သတ်ချက် စောင့်ကြည့်မှု' : 'Quota watch'}
                value={dak.dataLimitBytes ? `${usagePercent.toFixed(0)}% ${locale === 'my' ? 'အသုံးပြုပြီး' : 'used'}` : (locale === 'my' ? 'ကန့်သတ်ချက် မရှိပါ' : 'Unlimited quota')}
                meta={dak.dataLimitBytes ? `${locale === 'my' ? 'သတိပေးချက်' : 'Alerts'} ${bandwidthThresholdLabel}` : (locale === 'my' ? 'ကန့်သတ်ချက် သတိပေးချက် မသတ်မှတ်ရသေးပါ' : 'No quota alerts applied')}
              />
            </DetailMiniTileGrid>

            {dak.notes ? (
              <DetailNoteBlock>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{locale === 'my' ? 'မှတ်စု' : 'Notes'}</p>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-foreground">{dak.notes}</p>
              </DetailNoteBlock>
            ) : null}
          </DetailHeroAside>
        </DetailHeroGrid>
      </DetailHero>

      <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as 'overview' | 'routing' | 'delivery' | 'history')} className="space-y-4">
        <div className="ops-panel space-y-3 p-3 sm:p-4">
          <div className="space-y-1">
            <p className="ops-section-heading">{locale === 'my' ? 'ပြောင်းလဲနိုင်သောသော့ အလုပ်ခွင်' : 'Dynamic key workspace'}</p>
            <p className="text-sm text-muted-foreground">{detailTabCopy[detailTab]}</p>
          </div>
          <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-[1.2rem] border border-border/60 bg-background/45 p-1 lg:grid-cols-4 dark:bg-white/[0.03]">
            <TabsTrigger value="overview" className="rounded-[0.95rem] px-3 py-2 text-sm">{locale === 'my' ? 'အနှစ်ချုပ်' : 'Overview'}</TabsTrigger>
            <TabsTrigger value="routing" className="rounded-[0.95rem] px-3 py-2 text-sm">{locale === 'my' ? 'လမ်းကြောင်း' : 'Routing'}</TabsTrigger>
            <TabsTrigger value="delivery" className="rounded-[0.95rem] px-3 py-2 text-sm">{locale === 'my' ? 'ပို့ဆောင်မှု' : 'Delivery'}</TabsTrigger>
            <TabsTrigger value="history" className="rounded-[0.95rem] px-3 py-2 text-sm">{locale === 'my' ? 'မှတ်တမ်း' : 'History'}</TabsTrigger>
          </TabsList>
        </div>

        <div className="ops-showcase-grid">
          <div className="ops-detail-stack self-start">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <Card className="ops-detail-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TypeIcon className={cn('h-5 w-5', typeConfig.color)} />
                    {t(typeConfig.labelKey)}
                  </CardTitle>
                  <CardDescription>{t(typeConfig.descriptionKey)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dak.dynamicUrl ? (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">{locale === 'my' ? 'Outline ကလိုင်းယင့် URL (ssconf://)' : 'Outline Client URL (ssconf://)'}</Label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded-2xl border border-border/60 bg-background/55 p-3 font-mono text-xs break-all dark:bg-white/[0.03]">
                            {ssconfUrl}
                          </div>
                          <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {locale === 'my'
                            ? 'ဤ URL ကို ကူးယူပြီး Outline client ထဲသို့ paste လုပ်ကာ ချိတ်ဆက်ပါ။ client သည် နောက်ဆုံး server configuration ကို အလိုအလျောက် ရယူမည်။'
                            : 'Copy this URL and paste it in Outline client to connect. The client will automatically fetch the latest server configuration.'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">{locale === 'my' ? 'API ချိတ်ဆက်လမ်းကြောင်း' : 'API Endpoint'}</Label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded-2xl border border-border/60 bg-background/55 p-3 font-mono text-xs break-all dark:bg-white/[0.03]">
                            {subscriptionApiUrl}
                          </div>
                          <Button variant="outline" size="icon" onClick={handleCopyToken}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
                    <div className="ops-inline-stat">
                      <p className="text-sm text-muted-foreground">{locale === 'my' ? 'အခြေအနေ' : 'Status'}</p>
                      <p className="font-medium">{dak.status}</p>
                    </div>
                    <div className="ops-inline-stat">
                      <p className="text-sm text-muted-foreground">{locale === 'my' ? 'ဝန်ခွဲစနစ်' : 'Load balancer'}</p>
                      <p className="font-medium">{dak.loadBalancerAlgorithm.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="ops-inline-stat">
                      <p className="text-sm text-muted-foreground">{locale === 'my' ? 'ဦးစားပေး မုဒ်' : 'Preferred mode'}</p>
                      <p className="font-medium">{dak.preferredRegionMode.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="ops-inline-stat">
                      <p className="text-sm text-muted-foreground">{locale === 'my' ? 'လှည့်ပြောင်းမှု အစပျိုးမှု' : 'Rotation trigger'}</p>
                      <p className="font-medium">{dak.rotationTriggerMode.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="ops-detail-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    {t('dynamic_keys.detail.traffic_usage')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <div className="ops-inline-stat">
                        <p className="text-3xl font-bold">{formatBytes(dak.usedBytes)}</p>
                        <p className="text-sm text-muted-foreground">
                          {locale === 'my' ? 'စုစုပေါင်း' : 'of'} {dak.dataLimitBytes ? formatBytes(dak.dataLimitBytes) : (locale === 'my' ? 'အကန့်အသတ်မရှိ' : 'unlimited')}
                        </p>
                      </div>
                      {dak.dataLimitBytes ? (
                        <p className="text-2xl font-semibold text-muted-foreground sm:self-center sm:justify-self-end">
                          {usagePercent.toFixed(1)}%
                        </p>
                      ) : null}
                    </div>

                    {dak.dataLimitBytes ? (
                      <Progress
                        value={usagePercent}
                        className={cn(
                          'h-3',
                          usagePercent > 90 && '[&>div]:bg-red-500',
                          usagePercent > 70 && usagePercent <= 90 && '[&>div]:bg-yellow-500',
                        )}
                      />
                    ) : null}

                    {dak.dataLimitBytes ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {dak.autoDisableOnLimit ? (
                            <Badge variant="outline" className="text-xs">
                              {locale === 'my' ? 'ကန့်သတ်ချက်ပြည့်လျှင် အလိုအလျောက်ပိတ်မည်' : 'Auto-disable on limit'}
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="text-xs">
                            {locale === 'my' ? 'လက်ဖြင့်ပို့မည့် သတိပေးချက်များ' : 'Manual alerts'} · {bandwidthThresholdLabel}
                          </Badge>
                          {dak.bandwidthAlertAt80 ? (
                            <Badge variant="outline" className="border-yellow-500 text-xs text-yellow-600">
                              {locale === 'my' ? '80% သတိပေးချက် ပို့ပြီး' : '80% alert sent'}
                            </Badge>
                          ) : null}
                          {dak.bandwidthAlertAt90 ? (
                            <Badge variant="outline" className="border-red-500 text-xs text-red-600">
                              {locale === 'my' ? '90% သတိပေးချက် ပို့ပြီး' : '90% alert sent'}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="rounded-[1rem] border border-border/60 bg-background/45 p-3 text-sm dark:bg-white/[0.03]">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">{isMyanmar ? 'ဒေတာအသုံးပြုမှု သတိပေးချက်များကို လက်ဖြင့်သာ ပို့မည်' : 'Bandwidth alerts are manual-only'}</p>
                              <p className="text-muted-foreground">
                                {isMyanmar ? 'သတ်မှတ်ကန့်သတ်ချက် သတိပေးချက်များကို အလိုအလျောက် မပို့တော့ပါ။ ပို့ချင်သည့်အခါမှ Telegram သတိပေးချက်ကို ကိုယ်တိုင်ပို့ပါ။' : 'Threshold notices are no longer auto-sent. Trigger the Telegram alert only when you want it sent.'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {manualBandwidthLevel === 'DISABLED'
                                  ? isMyanmar
                                    ? 'ဤပြောင်းလဲသတ်မှတ်သော့သည် 100% သို့မဟုတ် ထို့ထက်ကျော်လွန်နေပါသည်။ ကန့်သတ်ချက်ပြည့် သတိပေးချက်ကို ကိုယ်တိုင်ပို့နိုင်ပါသည်။'
                                    : 'This dynamic key is at or above 100%. You can send a limit-reached notice manually.'
                                  : manualBandwidthLevel
                                    ? quotaAlertState?.pendingThresholds.length
                                      ? isMyanmar
                                        ? `${manualBandwidthLevel}% သတိပေးချက်ကို ယခုပို့ရန် အဆင်သင့်ဖြစ်ပါသည်။`
                                        : `Ready to send the ${manualBandwidthLevel}% alert now.`
                                      : isMyanmar
                                        ? `${manualBandwidthLevel}% သတိပေးချက်ကို ပို့ပြီးဖြစ်သည်။ လိုအပ်ပါက ကိုယ်တိုင် ပြန်ပို့နိုင်ပါသည်။`
                                        : `The ${manualBandwidthLevel}% alert was already sent. You can resend it manually.`
                                    : quotaAlertState?.nextThreshold
                                      ? isMyanmar
                                        ? `နောက်ထပ် သတ်မှတ်ကန့်သတ်ချက်: ${quotaAlertState.nextThreshold}%`
                                        : `Next threshold: ${quotaAlertState.nextThreshold}%`
                                      : isMyanmar
                                        ? 'Threshold မရောက်သေးပါ။'
                                        : 'No threshold reached yet.'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() => sendBandwidthAlertMutation.mutate({ id: dak.id })}
                                disabled={!manualBandwidthLevel || sendBandwidthAlertMutation.isPending}
                              >
                                {sendBandwidthAlertMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {manualBandwidthLevel === 'DISABLED'
                                  ? isMyanmar ? 'ကန့်သတ်ချက်ပြည့် သတိပေးချက် ပို့မည်' : 'Send limit notice'
                                  : manualBandwidthLevel
                                    ? isMyanmar ? `${manualBandwidthLevel}% သတိပေးချက်ကို ပို့မည်` : `Send ${manualBandwidthLevel}% alert`
                                    : isMyanmar ? 'သတ်မှတ်ကန့်သတ်ချက် မရောက်သေးပါ' : 'Threshold not reached'}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => resetBandwidthAlertStateMutation.mutate({ id: dak.id })}
                                disabled={
                                  resetBandwidthAlertStateMutation.isPending ||
                                  !quotaAlertState?.sentThresholds.length
                                }
                              >
                                {resetBandwidthAlertStateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {locale === 'my' ? 'သတိပေးချက် မှတ်တမ်းကို ပြန်ရှင်းမည်' : 'Reset alert history'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <p className="mb-2 text-sm font-medium">{locale === 'my' ? 'တိုက်ရိုက် လှုပ်ရှားမှု' : 'Live Activity'}</p>
                    <AggregatedTrafficGraph accessKeys={dak.accessKeys} />
                  </div>

                  {dak.accessKeys.length > 0 ? (
                    <div className="border-t border-border/50 pt-4">
                      <TrafficHistoryChart accessKeyId={dak.accessKeys[0].id} />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="ops-detail-card">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-primary" />
                      {t('dynamic_keys.detail.attached_keys')} ({dak.accessKeys.length})
                    </CardTitle>
                    <Button size="sm" onClick={() => setAttachDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      {locale === 'my' ? 'သော့ကို ချိတ်မည်' : 'Attach Key'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {dak.accessKeys.length > 0 ? (
                    <div className="space-y-3">
                      {dak.accessKeys.map((key) => (
                        <div key={key.id} className="ops-row-card">
                          <div className="flex items-center gap-3">
                            <div className="rounded-[1rem] border border-border/60 bg-background/55 p-2 dark:bg-white/[0.03]">
                              <Key className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{key.name}</p>
                              <p className="text-xs text-muted-foreground">{key.server?.name || (locale === 'my' ? 'မသိသော ဆာဗာ' : 'Unknown Server')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-medium">{formatBytes(key.usedBytes)}</p>
                              <Badge
                                variant={key.status === 'ACTIVE' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {key.status}
                              </Badge>
                            </div>
                            {dak.type === 'MANUAL' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => handleDetachKey(key.id)}
                                disabled={detachKeyMutation.isPending}
                              >
                                {locale === 'my' ? 'ဖြုတ်မည်' : 'Detach'}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ops-chart-empty py-8 text-muted-foreground">
                      <Key className="mx-auto mb-4 h-12 w-12 opacity-50" />
                      <p>{t('dynamic_keys.detail.no_keys')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="routing" className="mt-0 space-y-4">
              <DynamicRoutingDiagnosticsCard
                data={routingDiagnosticsQuery.data}
                isLoading={routingDiagnosticsQuery.isLoading}
                onRefresh={() => {
                  void routingDiagnosticsQuery.refetch();
                }}
                isRefreshing={routingDiagnosticsQuery.isFetching}
                onPinCurrent={handlePinCurrentBackend}
                onPinSuggestedFallback={handlePinSuggestedFallback}
                onClearPin={handleClearPinnedBackend}
                onSimulateFailover={handleSimulateFailover}
                onTestCandidates={handleTestCandidates}
                isPinning={pinBackendMutation.isPending}
                isClearingPin={clearPinnedBackendMutation.isPending}
                isSimulating={simulateFailoverMutation.isPending}
                isTesting={testCandidatesMutation.isPending}
                canPinCurrent={Boolean(routingDiagnosticsQuery.data?.currentSelection?.serverId)}
                simulationResult={simulateFailoverMutation.data}
                candidateTestResult={testCandidatesMutation.data}
                onExportDiagnostics={handleExportDiagnostics}
                isExporting={exportDiagnosticsMutation.isPending}
              />

              <div className="ops-section-grid">
                <ServerLoadCard />
                <KeyRotationCard
                  dakId={dak.id}
                  rotationEnabled={dak.rotationEnabled}
                  rotationInterval={dak.rotationInterval}
                  rotationTriggerMode={dak.rotationTriggerMode as 'SCHEDULED' | 'USAGE' | 'HEALTH' | 'COMBINED'}
                  rotationUsageThresholdPercent={dak.rotationUsageThresholdPercent}
                  rotateOnHealthFailure={dak.rotateOnHealthFailure}
                  lastRotatedAt={dak.lastRotatedAt ?? null}
                  nextRotationAt={dak.nextRotationAt ?? null}
                  rotationCount={dak.rotationCount}
                  onUpdate={() => refetch()}
                />
              </div>

              <Card className="ops-detail-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5 text-primary" />
                    {locale === 'my' ? 'Backend ချိတ်ဆက်အသုံးပြုမှု' : 'Backend Access'}
                  </CardTitle>
                  <CardDescription>
                    {locale === 'my'
                      ? 'routing နှင့် failover အပြုအမူကို စစ်ဆေးနေစဉ် လက်ရှိရွေးထားသော backend config ကို ထုတ်ယူပါ။'
                      : 'Export the currently selected backend config while reviewing routing and failover behavior.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="ops-inline-stat">
                    <p className="text-sm text-muted-foreground">{locale === 'my' ? 'လက်ရှိ backend' : 'Current backend'}</p>
                    <p className="font-medium">
                      {routingDiagnosticsQuery.data?.currentSelection?.serverName || (locale === 'my' ? 'အသုံးပြုနေသော backend မရွေးရသေးပါ' : 'No active backend selected')}
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={handleDownloadCurrentBackendConfig}>
                    <Download className="mr-2 h-4 w-4" />
                    {t('dynamic_keys.routing.action.download_current_backend')}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="delivery" className="mt-0 space-y-4">
              <ClientEndpointTestCard
                endpointUrl={subscriptionApiUrl}
                probeUrl={subscriptionProbeUrl}
                title={locale === 'my' ? 'ကလိုင်းယင့် URL စမ်းသပ်ခြင်း' : 'Client URL Test'}
                description={
                  locale === 'my'
                    ? 'live Outline client endpoint ကို စမ်းသပ်ပြီး လက်ရှိ dynamic subscription payload ကို စစ်ဆေးပါ။'
                    : 'Probe the live Outline client endpoint and verify the current dynamic subscription payload.'
                }
              />

              <AccessDistributionCard dakId={dak.id} dakName={dak.name} accessKeys={dak.accessKeys} />

              <SubscriptionShareCard
                dakId={dak.id}
                keyName={dak.name}
                dynamicUrl={dak.dynamicUrl}
                publicSlug={dak.publicSlug}
                currentTheme={dak.subscriptionTheme}
                currentCoverImage={dak.coverImage}
                currentCoverImageType={dak.coverImageType}
                currentContactLinks={dak.contactLinks}
                currentWelcomeMessage={dak.subscriptionWelcomeMessage ?? null}
                currentSharePageEnabled={dak.sharePageEnabled ?? true}
                onUpdate={() => refetch()}
              />

              <DynamicKeyTemplateCard
                dak={{
                  id: dak.id,
                  name: dak.name,
                  type: dak.type,
                  notes: dak.notes ?? null,
                  dataLimitBytes: dak.dataLimitBytes,
                  maxDevices: dak.maxDevices ?? null,
                  boundDeviceInstallsOnly: dak.boundDeviceInstallsOnly ?? Boolean(dak.maxDevices),
                  durationDays: dak.durationDays ?? null,
                  method: dak.method ?? null,
                  serverTagIds: dak.serverTagIds,
                  loadBalancerAlgorithm: dak.loadBalancerAlgorithm,
                  preferredServerIds: dak.preferredServerIds,
                  preferredCountryCodes: dak.preferredCountryCodes,
                  preferredServerWeights: dak.preferredServerWeights,
                  preferredCountryWeights: dak.preferredCountryWeights,
                  preferredRegionMode: dak.preferredRegionMode,
                  sessionStickinessMode: dak.sessionStickinessMode,
                  drainGraceMinutes: dak.drainGraceMinutes,
                  rotationEnabled: dak.rotationEnabled,
                  rotationInterval: dak.rotationInterval,
                  rotationTriggerMode: dak.rotationTriggerMode as 'SCHEDULED' | 'USAGE' | 'HEALTH' | 'COMBINED',
                  rotationUsageThresholdPercent: dak.rotationUsageThresholdPercent,
                  rotateOnHealthFailure: dak.rotateOnHealthFailure,
                  sharePageEnabled: dak.sharePageEnabled ?? true,
                  subscriptionTheme: dak.subscriptionTheme ?? null,
                  subscriptionWelcomeMessage: dak.subscriptionWelcomeMessage ?? null,
                  appliedTemplateId: dak.appliedTemplateId ?? null,
                }}
                onUpdate={() => refetch()}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0 space-y-4">
              <DAKConnectionSessionsCard dakId={dak.id} />
              <TelegramBillingHistoryCard
                title={isMyanmar ? 'ငွေပေးချေမှု မှတ်တမ်း' : 'Billing History'}
                description={
                  isMyanmar
                    ? 'ဤ premium dynamic key နှင့် သက်ဆိုင်သော Telegram order၊ renewal နှင့် billing history ကို ကြည့်ရှုပါ။'
                    : 'Review Telegram orders, renewals, and billing events related to this premium dynamic key.'
                }
                orders={(dak as any).billingHistory ?? []}
                emptyLabel={
                  isMyanmar
                    ? 'ဤ premium dynamic key အတွက် Telegram billing history မရှိသေးပါ။'
                    : 'No Telegram billing history for this premium dynamic key yet.'
                }
              />
            </TabsContent>
          </div>

          <div className="ops-detail-rail">
            <Card className="ops-detail-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  {t('dynamic_keys.detail.qr_code')}
                </CardTitle>
                <CardDescription>{t('dynamic_keys.detail.scan_qr')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                {qrCode ? (
                  <Image
                    src={qrCode}
                    alt="QR Code"
                    width={200}
                    height={200}
                    className="rounded-[1.1rem] bg-white p-2"
                    unoptimized
                  />
                ) : (
                  <div className="ops-chart-empty h-[200px] w-[200px]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}

                <div className="ops-mobile-action-bar mt-4 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" className="w-full" onClick={handleCopyUrl}>
                    <Copy className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'URL ကို ကူးမည်' : 'Copy URL'}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handleDownloadQr}>
                    <QrCode className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'QR ကို ဒေါင်းလုဒ်လုပ်မည်' : 'Download QR'}
                  </Button>
                  <Button variant="outline" className="w-full sm:col-span-2" onClick={handleDownloadConfig}>
                    <Download className="mr-2 h-4 w-4" />
                    {locale === 'my' ? 'ဆက်တင်ကို ဒေါင်းလုဒ်လုပ်မည်' : 'Download Config'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="ops-detail-card">
              <CardHeader>
                <CardTitle>{locale === 'my' ? 'အမြန်ကြည့်ရှုမှု' : 'Snapshot'}</CardTitle>
                <CardDescription>
                  {locale === 'my'
                    ? 'ပို့ဆောင်မှု သို့မဟုတ် လမ်းကြောင်းဆိုင်ရာ setting များ ပြင်ဆင်နေစဉ် စာရင်းသွင်းမှု အခြေအနေ၊ ဝန်ချိန်ညှိမှုနှင့် လက်ရှိ route ကို အမြဲ မြင်နိုင်စေရန် ပြထားသည်။'
                    : 'Keep subscription status, load balancing, and route context visible while you edit delivery or routing settings.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.type')}</p>
                  <p className="mt-2 text-sm font-medium">{t(typeConfig.labelKey)}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.status')}</p>
                  <p className="mt-2 text-sm font-medium">{dak.status}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.detail.attached_keys')}</p>
                  <p className="mt-2 text-sm font-medium">{dak.accessKeys.length}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{locale === 'my' ? 'ဝန်ခွဲစနစ်' : 'Load Balancer'}</p>
                  <div className="mt-2">
                    <Badge variant={dak.loadBalancerAlgorithm === 'LEAST_LOAD' ? 'default' : 'secondary'} className="text-xs">
                      {dak.loadBalancerAlgorithm === 'IP_HASH'
                        ? locale === 'my' ? 'IP လိပ်စာအလိုက်' : 'IP Hash'
                        : dak.loadBalancerAlgorithm === 'ROUND_ROBIN'
                          ? locale === 'my' ? 'အလှည့်ကျ' : 'Round Robin'
                          : dak.loadBalancerAlgorithm === 'LEAST_LOAD'
                            ? locale === 'my' ? 'ဝန်အနည်းဆုံး' : 'Least Load'
                            : dak.loadBalancerAlgorithm === 'RANDOM'
                              ? locale === 'my' ? 'ကျပန်း' : 'Random'
                              : dak.loadBalancerAlgorithm}
                    </Badge>
                  </div>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dashboard.current_route')}</p>
                  <p className="mt-2 text-sm font-medium">
                    {routingDiagnosticsQuery.data?.currentSelection?.serverName || (locale === 'my' ? 'အလိုအလျောက် ရွေးချယ်နေသည်' : 'Resolving automatically')}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.detail.created')}</p>
                  <p className="mt-2 text-sm font-medium">{formatDateTime(dak.createdAt)}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.detail.updated')}</p>
                  <p className="mt-2 text-sm font-medium">{formatDateTime(dak.updatedAt)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>

      {/* Attach Key Dialog */}
      <Dialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              {isMyanmar ? 'အသုံးပြုခွင့်သော့ကို ချိတ်မည်' : 'Attach Access Key'}
            </DialogTitle>
            <DialogDescription>
              {isMyanmar
                ? 'ဤ dynamic key နှင့် ချိတ်ရန် access key ကို ရွေးပါ။ အခြား dynamic key တစ်ခုနှင့် မချိတ်ထားသေးသော active key များကိုသာ ပြပါမည်။'
                : 'Select an access key to attach to this dynamic key. Only active keys that are not already attached to another dynamic key are shown.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'ချိတ်မည့် အသုံးပြုခွင့်သော့ကို ရွေးပါ' : 'Choose an access key'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar
                    ? 'အခြား dynamic key တစ်ခုနှင့် မချိတ်ထားသေးသော active key များကိုသာ ဤနေရာတွင် ရွေးနိုင်ပါသည်။'
                    : 'Only active keys that are not already attached to another dynamic key can be selected here.'}
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'အသုံးပြုခွင့်သော့ကို ရွေးပါ' : 'Select access key'}</Label>
                <Select
                  value={selectedKeyId}
                  onValueChange={setSelectedKeyId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isMyanmar ? 'ချိတ်မည့် သော့ကို ရွေးပါ...' : 'Choose a key to attach...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableKeys?.items && availableKeys.items.length > 0 ? (
                      availableKeys.items.map((key) => (
                        <SelectItem key={key.id} value={key.id}>
                          <div className="flex items-center gap-2">
                            <Key className="w-4 h-4" />
                            <span>{key.name}</span>
                            <span className="text-muted-foreground text-xs">
                              ({key.server?.name || (isMyanmar ? 'မသိသော ဆာဗာ' : 'Unknown Server')})
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>
                        {isMyanmar ? 'အသုံးပြုနိုင်သော သော့ မရှိပါ' : 'No available keys'}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {(!availableKeys?.items || availableKeys.items.length === 0) && (
                  <div className="ops-modal-note">
                    {isMyanmar
                      ? 'မချိတ်ထားသော access key မရှိပါ။ အရင် key တစ်ခု ဖန်တီးပါ သို့မဟုတ် အခြား dynamic profile မှ key တစ်ခုကို ဖြုတ်ပါ။'
                      : 'No unattached access keys are available. Create one first or detach a key from another dynamic profile.'}
                  </div>
                )}
              </div>
            </DialogSection>
          </DialogBody>

          <DialogFooter className="ops-modal-sticky-footer">
            <Button
              variant="outline"
              onClick={() => {
                setAttachDialogOpen(false);
                setSelectedKeyId('');
              }}
            >
              {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
            </Button>
            <Button
              onClick={handleAttachKey}
              disabled={!selectedKeyId || attachKeyMutation.isPending}
            >
              {attachKeyMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Attach Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {dak && (
        <EditDAKDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          dakData={{
            id: dak.id,
            name: dak.name,
            email: dak.email ?? null,
            telegramId: dak.telegramId ?? null,
            notes: dak.notes ?? null,
            dataLimitBytes: dak.dataLimitBytes,
            maxDevices: dak.maxDevices ?? null,
            boundDeviceInstallsOnly: dak.boundDeviceInstallsOnly ?? Boolean(dak.maxDevices),
            durationDays: dak.durationDays ?? null,
            expiresAt: dak.expiresAt ?? null,
            loadBalancerAlgorithm: dak.loadBalancerAlgorithm ?? 'IP_HASH',
            serverTagIds: dak.serverTagIds ?? [],
            preferredServerIds: dak.preferredServerIds ?? [],
            preferredCountryCodes: dak.preferredCountryCodes ?? [],
            preferredRegionMode: dak.preferredRegionMode ?? 'PREFER',
            preferredServerWeights: dak.preferredServerWeights ?? {},
            preferredCountryWeights: dak.preferredCountryWeights ?? {},
            sessionStickinessMode: dak.sessionStickinessMode ?? 'DRAIN',
            drainGraceMinutes: dak.drainGraceMinutes ?? 20,
            rotationTriggerMode: (dak.rotationTriggerMode as 'SCHEDULED' | 'USAGE' | 'HEALTH' | 'COMBINED') ?? 'SCHEDULED',
            rotationUsageThresholdPercent: dak.rotationUsageThresholdPercent ?? 85,
            rotateOnHealthFailure: dak.rotateOnHealthFailure ?? false,
            autoClearStalePins: dak.autoClearStalePins ?? true,
            autoFallbackToPrefer: dak.autoFallbackToPrefer ?? false,
            autoSkipUnhealthy: dak.autoSkipUnhealthy ?? false,
            routingAlertRules: dak.routingAlertRules ?? null,
          }}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}

/**
 * AggregatedTrafficGraph Component
 * Displays real-time bandwidth usage aggregated from all attached access keys
 */
function AggregatedTrafficGraph({
  accessKeys,
}: {
  accessKeys: Array<{ server: { id: string } | null; outlineKeyId: string }>;
}) {
  const [data, setData] = useState<{ time: number; bytes: number }[]>([]);
  const [currentServer, setCurrentServer] = useState<string | null>(null);

  // Get unique server IDs
  const serverIds = Array.from(
    new Set(accessKeys.map((k) => k.server?.id).filter(Boolean))
  ) as string[];

  // Set initial server if not set
  useEffect(() => {
    if (serverIds.length > 0 && !currentServer) {
      setCurrentServer(serverIds[0]);
    }
  }, [serverIds, currentServer]);

  // Poll for live stats from the first active server (for simplicity)
  const { data: stats } = trpc.servers.getLiveStats.useQuery(
    { id: currentServer! },
    {
      enabled: !!currentServer,
      refetchInterval: 2000,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (stats && currentServer) {
      const now = Date.now();
      // Aggregate bytes from all keys on this server
      const keysOnServer = accessKeys.filter((k) => k.server?.id === currentServer);
      const totalBytes = keysOnServer.reduce((sum, key) => {
        return sum + (stats.keyStats?.[key.outlineKeyId] || 0);
      }, 0);

      setData((prev) => {
        const newData = [...prev, { time: now, bytes: totalBytes }];
        if (newData.length > 60) newData.shift();
        return newData;
      });
    }
  }, [stats, currentServer, accessKeys]);

  if (accessKeys.length === 0) {
    return (
      <div className="ops-chart-empty h-[180px] text-muted-foreground">
        <p className="text-sm">No attached keys to monitor</p>
      </div>
    );
  }

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
            <linearGradient id="colorBytesDAK" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 10" vertical={false} stroke="rgba(125, 211, 252, 0.16)" />
          <XAxis dataKey="time" hide domain={['dataMin', 'dataMax']} />
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              borderRadius: '0.5rem',
            }}
            labelFormatter={() => ''}
            formatter={(value: number) => [formatBytes(value) + '/s', 'Aggregated Speed']}
          />
          <Area
            type="monotone"
            dataKey="bytes"
            stroke="#8b5cf6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorBytesDAK)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-between px-1 text-xs text-muted-foreground">
        <span>2 mins ago</span>
        <span>Aggregated Bandwidth: {formatBytes(data[data.length - 1]?.bytes || 0)}/s</span>
        <span>Live</span>
      </div>
    </div>
  );
}

/**
 * DAKConnectionSessionsCard Component
 * Displays aggregated device count and recent connection sessions from all attached keys
 */
function DAKConnectionSessionsCard({ dakId }: { dakId: string }) {
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const { data, isLoading } = trpc.dynamicKeys.getConnectionSessions.useQuery(
    { dakId, limit: 10 },
    { refetchInterval: 30000 } // Refresh every 30 seconds
  );

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return `${hours}h ${mins}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };

  if (isLoading) {
    return (
      <Card className="ops-detail-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Connections
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
          Connections
        </CardTitle>
        <CardDescription>
          Aggregated device usage across all attached keys
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className={cn('grid grid-cols-1 gap-4', data?.maxDevices ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <div className="ops-inline-stat text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              {(data?.activeCount || 0) > 0 ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-2xl font-bold">{data?.estimatedDevices || 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">{isMyanmar ? 'လက်ရှိ စက်များ' : 'Active Devices'}</p>
          </div>
          <div className="ops-inline-stat text-center">
            <div className="text-2xl font-bold">{data?.peakDevices || 0}</div>
            <p className="text-xs text-muted-foreground">{isMyanmar ? 'အများဆုံး စက်များ' : 'Peak Devices'}</p>
          </div>
          {data?.maxDevices ? (
            <div className="ops-inline-stat text-center">
              <div className="text-2xl font-bold">{data.maxDevices}</div>
              <p className="text-xs text-muted-foreground">{isMyanmar ? 'သတ်မှတ်ထားသော ကန့်သတ်ချက်' : 'Configured Limit'}</p>
            </div>
          ) : null}
        </div>

        {data?.maxDevices ? (
          <div className="rounded-xl border border-border/60 bg-background/45 px-4 py-3 text-sm dark:bg-white/[0.03]">
            <p className="font-medium">{isMyanmar ? 'စီမံထားသော တပ်ဆင်ရေး လမ်းကြောင်း' : 'Managed install flow'}</p>
            <p className="text-xs text-muted-foreground">
              {data.boundDeviceInstallsOnly
                ? (isMyanmar ? 'ကာကွယ်ထားသော တပ်ဆင်မှုများသာ ခွင့်ပြုထားသည်။ ဖောက်သည်များသည် မျှဝေစာမျက်နှာ သို့မဟုတ် Outline ကလိုင်းယင့် URL မှသာ တပ်ဆင်ရမည်။' : 'Protected installs only. Customers must install from the share page or Outline client URL.')
                : (isMyanmar ? 'Raw ဆက်တင်ကို ခွင့်ပြုထားသေးသောကြောင့် ဖောက်သည်များသည် ပြန်လည်အသုံးပြုနိုင်သော ချိတ်ဆက်မှု လျှို့ဝှက်ချက်ကို ကိုယ်တိုင်ကူးယူနိုင်သည်။' : 'Raw config is still allowed, so customers can manually copy reusable connection secrets.')}
            </p>
            <p className="text-xs text-muted-foreground">
              {isMyanmar
                ? 'ပြန်လည်အသုံးပြုနိုင်သော ပုံမှန်သော့ထက် ပိုမိုခိုင်မာသည့် အခြားသူထံ မျှဝေခြင်းကာကွယ်မှု လိုအပ်သည့်အခါ ဤပို့ဆောင်မှု လမ်းကြောင်းကို အကြံပြုပါသည်။'
                : 'This is the recommended delivery path when you need stronger anti-sharing than a reusable standard key can provide.'}
            </p>
          </div>
        ) : null}

        {/* Recent Sessions */}
        {data?.sessions && data.sessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{isMyanmar ? 'နောက်ဆုံး ချိတ်ဆက်ဝင်ရောက်မှုများ' : 'Recent Sessions'}</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.sessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-lg text-sm',
                    session.isActive ? 'bg-green-500/10' : 'bg-background/45 dark:bg-white/[0.03]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        session.isActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{session.keyName}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {session.serverCountry && (
                          <span>{getCountryFlag(session.serverCountry)}</span>
                        )}
                        {session.serverName}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatDuration(session.durationMinutes)}
                    </span>
                    <span className="font-mono">{formatBytes(BigInt(session.bytesUsed))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!data?.sessions || data.sessions.length === 0) && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No connection sessions recorded yet
          </div>
        )}

        {/* Subscriber Devices */}
        {data?.subscriberDevices && data.subscriberDevices.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-sm font-medium">Subscriber Devices</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.subscriberDevices.slice(0, 10).map((device, idx) => (
                <div
                  key={`${device.ip}-${idx}`}
                  className="flex flex-col gap-1 p-2 rounded-lg text-sm bg-background/45 dark:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono">{device.ip}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(device.lastSeenAt)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate" title={device.userAgent}>
                    {device.platform ? (
                      <span className="font-medium text-foreground mr-1">[{device.platform}]</span>
                    ) : null}
                    {device.userAgent || 'Unknown device'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
