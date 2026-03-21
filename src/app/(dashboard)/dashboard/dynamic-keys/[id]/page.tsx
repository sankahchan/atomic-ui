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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { normalizePublicSlug } from '@/lib/public-slug';
import {
  buildDynamicOutlineUrl,
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
  Wifi,
  WifiOff,
  RotateCw,
  MessageSquare,
  Eye,
} from 'lucide-react';
import { themeList, getTheme } from '@/lib/subscription-themes';
import { TrafficHistoryChart } from '@/components/charts/TrafficHistoryChart';
import { ClientEndpointTestCard } from '@/components/subscription/client-endpoint-test-card';
import {
  DynamicRoutingPreferencesEditor,
  type DynamicRoutingPreferenceMode,
} from '@/components/dynamic-keys/dynamic-routing-preferences-editor';

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
    durationDays: number | null;
    expiresAt: Date | null;
    loadBalancerAlgorithm: string;
    preferredServerIds: string[];
    preferredCountryCodes: string[];
    preferredRegionMode: DynamicRoutingPreferenceMode;
  };
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: dakData.name,
    email: dakData.email || '',
    telegramId: dakData.telegramId || '',
    notes: dakData.notes || '',
    dataLimitGB: dakData.dataLimitBytes
      ? (Number(dakData.dataLimitBytes) / (1024 * 1024 * 1024)).toString()
      : '',
    durationDays: dakData.durationDays?.toString() || '',
    expiresAt: dakData.expiresAt ? new Date(dakData.expiresAt).toISOString().split('T')[0] : '',
    loadBalancerAlgorithm: dakData.loadBalancerAlgorithm || 'IP_HASH',
    preferredServerIds: dakData.preferredServerIds || [],
    preferredCountryCodes: dakData.preferredCountryCodes || [],
    preferredRegionMode: dakData.preferredRegionMode || 'PREFER',
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
      durationDays: dakData.durationDays?.toString() || '',
      expiresAt: dakData.expiresAt ? new Date(dakData.expiresAt).toISOString().split('T')[0] : '',
      loadBalancerAlgorithm: dakData.loadBalancerAlgorithm || 'IP_HASH',
      preferredServerIds: dakData.preferredServerIds || [],
      preferredCountryCodes: dakData.preferredCountryCodes || [],
      preferredRegionMode: dakData.preferredRegionMode || 'PREFER',
    });
  }, [dakData]);

  const updateMutation = trpc.dynamicKeys.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'Dynamic Key updated',
        description: 'The dynamic access key has been updated successfully.',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Validation error',
        description: 'Please enter a name.',
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
      durationDays: formData.durationDays ? parseInt(formData.durationDays) : undefined,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined,
      loadBalancerAlgorithm: formData.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD',
      preferredServerIds: formData.preferredServerIds,
      preferredCountryCodes: formData.preferredCountryCodes,
      preferredRegionMode: formData.preferredRegionMode,
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Dynamic Key</DialogTitle>
          <DialogDescription>
            Update the dynamic key configuration.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editName">Name</Label>
            <Input
              id="editName"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editEmail">Email</Label>
            <Input
              id="editEmail"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editTelegram">Telegram ID</Label>
            <Input
              id="editTelegram"
              value={formData.telegramId}
              onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editDataLimit">Data Limit (GB)</Label>
            <Input
              id="editDataLimit"
              type="number"
              placeholder="Leave empty for unlimited"
              value={formData.dataLimitGB}
              onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
              min="0"
              step="0.5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editDuration">Duration (Days)</Label>
            <Input
              id="editDuration"
              type="number"
              placeholder="e.g., 30, 45, 60"
              value={formData.durationDays}
              onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
              min="1"
            />
            <p className="text-xs text-muted-foreground">
              Set the validity period in days. This will recalculate the expiration date.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editExpiration">Expiration Date</Label>
            <Input
              id="editExpiration"
              type="date"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Or set a specific expiration date directly.
            </p>
          </div>

          {/* Load Balancer Algorithm */}
          <div className="space-y-2">
            <Label>Load Balancer Algorithm</Label>
            <Select
              value={formData.loadBalancerAlgorithm}
              onValueChange={(value) => setFormData({ ...formData, loadBalancerAlgorithm: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select algorithm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IP_HASH">IP Hash (Consistent)</SelectItem>
                <SelectItem value="RANDOM">Random</SelectItem>
                <SelectItem value="ROUND_ROBIN">Round Robin</SelectItem>
                <SelectItem value="LEAST_LOAD">Least Load (Smart)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.loadBalancerAlgorithm === 'LEAST_LOAD'
                ? 'Routes to the server with lowest load based on key count and bandwidth.'
                : formData.loadBalancerAlgorithm === 'IP_HASH'
                ? 'Same client IP always connects to the same server.'
                : formData.loadBalancerAlgorithm === 'ROUND_ROBIN'
                ? 'Cycles through servers sequentially.'
                : 'Randomly selects a server.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Preferred Routing Order</Label>
            <DynamicRoutingPreferencesEditor
              preferredRegionMode={formData.preferredRegionMode}
              preferredServerIds={formData.preferredServerIds}
              preferredCountryCodes={formData.preferredCountryCodes}
              compact
              onChange={(next) =>
                setFormData((current) => ({
                  ...current,
                  preferredRegionMode: next.preferredRegionMode,
                  preferredServerIds: next.preferredServerIds,
                  preferredCountryCodes: next.preferredCountryCodes,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editNotes">Notes</Label>
            <Input
              id="editNotes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
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
    title: isMyanmar ? 'မျှဝေရန် စာမျက်နှာ' : 'Share Page',
    description: isMyanmar ? 'အသုံးပြုသူထံသို့ လှပသော subscription စာမျက်နှာကို မျှဝေပါ' : 'Share a beautiful subscription page with your user',
    enabled: isMyanmar ? 'Share Page ကို ဖွင့်ထားမည်' : 'Share Page Enabled',
    enabledDesc: isMyanmar ? 'Dynamic key သို့မဟုတ် client URL မပိတ်ဘဲ public share page ကိုသာ ပိတ်နိုင်သည်။' : 'Disable the public share page without disabling the dynamic key or client URLs.',
    theme: isMyanmar ? 'စာမျက်နှာ Theme' : 'Page Theme',
    selectTheme: isMyanmar ? 'Theme ကို ရွေးပါ' : 'Select theme',
    backgroundImage: isMyanmar ? 'နောက်ခံပုံ (ရွေးချယ်နိုင်သည်)' : 'Background Image (Optional)',
    backgroundImageHelp: isMyanmar ? 'ပုံထည့်ပါက အပြည့်စုံ နောက်ခံပုံစံအဖြစ် အသုံးပြုမည်။ Theme အရောင်ကို အစားထိုးနိုင်သည်။' : 'Use image as full-page background theme. Overrides color theme when set.',
    contactLinks: isMyanmar ? 'ဆက်သွယ်ရန် Link များ' : 'Contact Links',
    contactPlaceholder: isMyanmar ? 'Link သို့မဟုတ် ID ထည့်ပါ' : 'Enter link or ID',
    welcomeOverride: isMyanmar ? 'ကြိုဆိုစာ Override' : 'Welcome Message Override',
    welcomePlaceholder: isMyanmar ? 'ဤ dynamic key ၏ share page အပေါ်ဘက်တွင် ပြသမည့် စာသား။ မဖြည့်ပါက global message ကို အသုံးပြုမည်။' : "Shown near the top of this key's share page. Leave empty to use the global message.",
    welcomeHelp: isMyanmar ? 'ဤ dynamic key အတွက်သာ global subscription page welcome message ကို အစားထိုးမည်။' : 'This overrides the global subscription page welcome message for this dynamic key only.',
    preview: isMyanmar ? 'အကြိုကြည့်မည်' : 'Preview',
    previewImage: isMyanmar ? 'ပုံနောက်ခံကို ဖွင့်ထားသည်' : 'Image Background',
    previewColorOnly: isMyanmar ? 'အရောင် Theme သာ' : 'Color theme only',
    previewCustomWelcome: isMyanmar ? 'ကိုယ်ပိုင်ကြိုဆိုစာကို အသုံးပြုနေသည်' : 'Custom welcome message enabled',
    previewGlobalWelcome: isMyanmar ? 'Global ကြိုဆိုစာကို အသုံးပြုနေသည်' : 'Using global welcome message',
    previewContacts: isMyanmar ? 'ဆက်သွယ်ရန် shortcut များ' : 'Contact shortcuts',
    previewAddToOutline: isMyanmar ? 'Outline ထဲသို့ ထည့်မည်' : 'Add to Outline',
    shortSlug: isMyanmar ? 'Short Link Slug' : 'Short Link Slug',
    slugPlaceholder: isMyanmar ? 'my-dynamic-key' : 'my-dynamic-key',
    slugHelp: isMyanmar ? 'Short share page URL နှင့် Outline client URL အတွက် အသုံးပြုသည်။' : 'Used for the short share page and short Outline client URL.',
    regenerateShortSlug: isMyanmar ? 'Short slug ကို ပြန်ဖန်တီးမည်' : 'Regenerate short slug',
    copyLink: isMyanmar ? 'Link ကို ကူးယူမည်' : 'Copy Link',
    copyClientUrl: isMyanmar ? 'Client URL ကို ကူးယူမည်' : 'Copy Client URL',
    connectTelegram: isMyanmar ? 'Telegram ချိတ်ဆက်မည်' : 'Connect Telegram',
    sendTelegram: isMyanmar ? 'Telegram ဖြင့် ပို့မည်' : 'Send via Telegram',
    regenerateLink: isMyanmar ? 'Link ကို ပြန်ဖန်တီးမည်' : 'Regenerate Link',
    sharePageUrl: isMyanmar ? 'Share Page URL:' : 'Share Page URL:',
    clientUrl: isMyanmar ? 'Client URL:' : 'Client URL:',
    sharePageDisabled: isMyanmar ? 'Share page ကို ပိတ်ထားသည်' : 'Share page disabled',
    regenerateLinkHint: isMyanmar ? 'Link ကို ပြန်ဖန်တီးပါက legacy token URL ကိုသာ လဲမည်။ Short slug link များသည် slug ကို မပြောင်းမချင်း သို့မဟုတ် share page ကို မပိတ်မချင်း ဆက်လက် အလုပ်လုပ်နေမည်။' : 'Regenerating the link rotates the legacy token URL only. Your short slug links stay active until you change the slug or disable the share page.',
    pageViews: isMyanmar ? 'စာမျက်နှာကြည့်ရှုမှု' : 'Page Views',
    copyClicks: isMyanmar ? 'Copy အကြိမ်ရေ' : 'Copy Clicks',
    telegramSends: isMyanmar ? 'Telegram ပို့ထားမှု' : 'Telegram Sends',
    lastViewed: isMyanmar ? 'နောက်ဆုံးကြည့်ရှုချိန်' : 'Last Viewed',
    never: isMyanmar ? 'မရှိသေးပါ' : 'Never',
    save: isMyanmar ? 'သိမ်းမည်' : 'Save',
    updatedTitle: isMyanmar ? 'အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Updated',
    updateFailed: isMyanmar ? 'အပ်ဒိတ် မအောင်မြင်ပါ' : 'Update failed',
    updatedDesc: isMyanmar ? 'Share page ဆက်တင်များကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Share page settings have been updated.',
    shortRegeneratedTitle: isMyanmar ? 'Short link ကို ပြန်ဖန်တီးပြီးပါပြီ' : 'Short link regenerated',
    shortRegeneratedDesc: isMyanmar ? 'Short URL အသစ်များကို မျှဝေရန် အသင့်ဖြစ်နေပါပြီ။' : 'The new short URLs are ready to share.',
    welcomeUpdatedTitle: isMyanmar ? 'ကြိုဆိုစာကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Welcome message updated',
    welcomeUpdatedDesc: isMyanmar ? 'Share page ကြိုဆိုစာကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The share page welcome message has been updated.',
    shareSentTitle: isMyanmar ? 'Share page ကို ပို့ပြီးပါပြီ' : 'Share page sent',
    shareSentDesc: isMyanmar ? 'Dynamic key ကို Telegram မှတစ်ဆင့် ပို့ပြီးပါပြီ။' : 'The dynamic key has been sent through Telegram.',
    copied: isMyanmar ? 'ကူးယူပြီးပါပြီ!' : 'Copied!',
    copiedConnectLink: isMyanmar ? 'Telegram connect link ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'Telegram connect link copied to clipboard.',
    copiedShareUrl: isMyanmar ? 'Subscription page URL ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'Subscription page URL copied to clipboard.',
    copiedClientUrl: isMyanmar ? 'Client URL ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'Client URL copied to clipboard.',
    copiedLegacyShareUrl: isMyanmar ? 'Legacy share page link အသစ်ကို ကူးယူပြီးပါပြီ။ Short slug link များသည် မပြောင်းလဲပါ။' : 'New legacy share page link copied. Short slug links are unchanged.',
    copiedNewShareUrl: isMyanmar ? 'Share page link အသစ်ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'New share page link copied to clipboard.',
    connectFailed: isMyanmar ? 'Connect link ဖန်တီးမှု မအောင်မြင်ပါ' : 'Connect link failed',
    telegramFailed: isMyanmar ? 'Telegram ပို့မှု မအောင်မြင်ပါ' : 'Telegram send failed',
    missingSlug: isMyanmar ? 'Slug မပြည့်စုံပါ' : 'Missing slug',
    missingSlugDesc: isMyanmar ? 'သိမ်းမီ အနည်းဆုံး တရားဝင် စာလုံး ၃ လုံး ထည့်ပါ။' : 'Enter at least 3 valid characters before saving.',
    errorTitle: isMyanmar ? 'အမှား' : 'Error',
    contactRequired: isMyanmar ? 'ဆက်သွယ်ရန် တန်ဖိုးတစ်ခု ထည့်ပါ။' : 'Please enter a contact value.',
    limitReached: isMyanmar ? 'အများဆုံး အရေအတွက် ပြည့်သွားပါပြီ' : 'Limit reached',
    limitDesc: isMyanmar ? 'ဆက်သွယ်ရန် ၃ ခုအထိသာ ထည့်နိုင်ပါသည်။' : 'Maximum 3 contacts allowed.',
    shareTokenRegeneratedTitle: isMyanmar ? 'Share token ကို ပြန်ဖန်တီးပြီးပါပြီ' : 'Share token regenerated',
    shareTokenRegeneratedDescShort: isMyanmar ? 'Legacy token link ကို လဲပြီးပါပြီ။ Short slug link များသည် မပြောင်းလဲပါ။' : 'The legacy token link was rotated. Your short slug links stay the same.',
    shareTokenRegeneratedDescLegacy: isMyanmar ? 'Dynamic share link ကို ပြန်ဖန်တီးပြီးပါပြီ။' : 'The dynamic share link has been rotated.',
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
  lastRotatedAt,
  nextRotationAt,
  rotationCount,
  onUpdate,
}: {
  dakId: string;
  rotationEnabled: boolean;
  rotationInterval: string;
  lastRotatedAt: Date | null;
  nextRotationAt: Date | null;
  rotationCount: number;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(rotationEnabled);
  const [interval, setInterval] = useState(rotationInterval);

  const updateMutation = trpc.dynamicKeys.updateRotation.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Rotation settings updated',
        description: enabled
          ? `Keys will rotate ${interval.toLowerCase()}. Next rotation: ${data.nextRotationAt ? formatRelativeTime(data.nextRotationAt) : 'N/A'}`
          : 'Key rotation has been disabled.',
      });
      onUpdate();
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rotateMutation = trpc.dynamicKeys.rotateNow.useMutation({
    onSuccess: () => {
      toast({
        title: 'Keys rotated',
        description: 'All attached keys have been rotated successfully.',
      });
      onUpdate();
    },
    onError: (error) => {
      toast({
        title: 'Rotation failed',
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
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RotateCw className="w-4 h-4 text-primary" />
          Key Auto-Rotation
        </CardTitle>
        <CardDescription className="text-xs">
          Periodically replace underlying keys while keeping the subscription URL stable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">Enable Rotation</Label>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Interval Selector */}
        {enabled && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Rotation Interval</Label>
            <Select
              value={interval}
              onValueChange={setInterval}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Daily</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="BIWEEKLY">Every 2 Weeks</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Save Button */}
        {(enabled !== rotationEnabled || interval !== rotationInterval) && (
          <Button
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Save Settings
          </Button>
        )}

        {/* Stats */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total Rotations</span>
            <span className="font-medium">{rotationCount}</span>
          </div>
          {lastRotatedAt && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Last Rotated</span>
              <span>{formatRelativeTime(lastRotatedAt)}</span>
            </div>
          )}
          {nextRotationAt && enabled && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Next Rotation</span>
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
  lastSharePageViewAt: string | null;
  lastSharePageCopyAt: string | null;
  lastSharePageOpenAppAt: string | null;
};

function DynamicRoutingDiagnosticsCard({
  data,
  isLoading,
  onRefresh,
  isRefreshing,
}: {
  data?: DynamicRoutingDiagnostics;
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  if (isLoading && !data) {
    return (
      <Card className="ops-detail-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />
            Routing Diagnostics
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
              Routing Diagnostics
            </CardTitle>
            <CardDescription>
              See how this dynamic key will route requests and which backend handled traffic most recently.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="ops-row-card">
          <div>
            <p className="text-sm text-muted-foreground">Selection algorithm</p>
            <p className="mt-1 text-sm font-medium">{data?.algorithmLabel || 'Unknown'}</p>
          </div>
          <Badge variant={data?.algorithm === 'LEAST_LOAD' ? 'default' : 'secondary'}>
            {data?.algorithmLabel || 'Unknown'}
          </Badge>
        </div>

        {data?.algorithmHint ? (
          <p className="text-sm text-muted-foreground">{data.algorithmHint}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">Active backends</p>
            <p className="font-medium">{data?.attachedActiveKeys ?? 0}</p>
          </div>
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">Viewer IP</p>
            <p className="font-mono text-sm">{data?.viewerIp || 'Unavailable'}</p>
          </div>
        </div>

        {data ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">Preference mode</p>
              <p className="font-medium">{data.preferredRegionMode === 'ONLY' ? 'Only matching' : 'Prefer matching'}</p>
            </div>
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">Preferred servers</p>
              <p className="font-medium">{data.preferredServerIds.length || 0}</p>
            </div>
            <div className="ops-inline-stat">
              <p className="text-xs text-muted-foreground">Preferred regions</p>
              <p className="font-medium">{data.preferredCountryCodes.length || 0}</p>
            </div>
          </div>
        ) : null}

        {data?.preferredServerIds?.length || data?.preferredCountryCodes?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Preferred servers
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {data.preferredServers.length
                  ? data.preferredServers
                      .map((server) => `${getCountryFlag(server.countryCode || '')} ${server.name}`.trim())
                      .join(' -> ')
                  : 'No explicit server order configured.'}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Preferred regions
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {data.preferredCountryCodes.length
                  ? data.preferredCountryCodes.join(' -> ')
                  : 'No region order configured.'}
              </p>
            </div>
          </div>
        ) : null}

        {data?.currentSelection ? (
          <div className="rounded-[1.2rem] border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Current selection
            </p>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {getCountryFlag(data.currentSelection.serverCountry || '')} {data.currentSelection.serverName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.currentSelection.keyName
                    ? `${data.currentSelection.keyName}`
                    : data.currentSelection.mode === 'SELF_MANAGED_CANDIDATE'
                      ? 'Server candidate for the next on-demand key'
                      : 'No backend key selected'}
                </p>
              </div>
              <Badge variant="outline">
                {data.currentSelection.mode === 'SELF_MANAGED_CANDIDATE' ? 'Candidate' : 'Live'}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{data.currentSelection.reason}</p>
            {data.currentSelection.lastTrafficAt ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Last traffic {formatRelativeTime(new Date(data.currentSelection.lastTrafficAt))}
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
              Last backend with traffic
            </p>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {getCountryFlag(data.lastResolvedBackend.serverCountry || '')} {data.lastResolvedBackend.serverName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{data.lastResolvedBackend.keyName}</p>
              </div>
              {data.lastResolvedBackend.isActive ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">
                  <Wifi className="mr-1 h-3 w-3" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                  <WifiOff className="mr-1 h-3 w-3" />
                  Idle
                </Badge>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">Last seen</p>
                <p className="font-medium">{formatRelativeTime(new Date(data.lastResolvedBackend.lastSeenAt))}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">Usage on backend</p>
                <p className="font-medium">{formatBytes(BigInt(data.lastResolvedBackend.bytesUsed))}</p>
              </div>
            </div>
          </div>
        ) : null}

        {data?.recentBackendSwitches?.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent backend switches</p>
            <div className="space-y-2">
              {data.recentBackendSwitches.map((event) => (
                <div key={`${event.fromKeyId}-${event.toKeyId}-${event.switchedAt}`} className="ops-row-card">
                  <div>
                    <p className="text-sm font-medium">
                      {event.fromServerName} to {event.toServerName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.fromKeyName} to {event.toKeyName}
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

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">Last share-page view</p>
            <p className="font-medium">
              {data?.lastSharePageViewAt ? formatRelativeTime(new Date(data.lastSharePageViewAt)) : 'Never'}
            </p>
          </div>
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">Last copy</p>
            <p className="font-medium">
              {data?.lastSharePageCopyAt ? formatRelativeTime(new Date(data.lastSharePageCopyAt)) : 'Never'}
            </p>
          </div>
          <div className="ops-inline-stat">
            <p className="text-xs text-muted-foreground">Last app open</p>
            <p className="font-medium">
              {data?.lastSharePageOpenAppAt ? formatRelativeTime(new Date(data.lastSharePageOpenAppAt)) : 'Never'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * DynamicKeyDetailPage Component
 */
export default function DynamicKeyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLocale();
  const { toast } = useToast();
  const dakId = params.id as string;

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
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
            The requested dynamic access key could not be found.
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
  const attachedActiveKeys = dak.accessKeys.filter((key) => key.status === 'ACTIVE').length;
  const serverCoverage = new Set(dak.accessKeys.map((key) => key.server?.id).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <section className="xl:hidden ops-hero">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link href="/dashboard/dynamic-keys">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <span className="ops-pill border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-200">
              <KeyRound className="h-3.5 w-3.5" />
              Dynamic Key
            </span>
            <Badge variant={dak.status === 'ACTIVE' ? 'default' : 'secondary'} className="rounded-full px-3 py-1">
              {dak.status}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {t(typeConfig.labelKey)}
            </Badge>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{dak.name}</h1>
            <p className="text-sm text-muted-foreground">
              {t(typeConfig.descriptionKey)}. {t('dynamic_keys.detail.created')} {formatRelativeTime(dak.createdAt)}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('dynamic_keys.detail.attached_keys')}
              </p>
              <p className="mt-3 text-2xl font-semibold">{dak.accessKeys.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {attachedActiveKeys} active attached keys
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Server Coverage
              </p>
              <p className="mt-3 text-2xl font-semibold">{serverCoverage}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Distinct servers serving this subscription
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('dynamic_keys.detail.traffic_usage')}
              </p>
              <p className="mt-3 text-2xl font-semibold">{formatBytes(dak.usedBytes)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {dak.dataLimitBytes ? `of ${formatBytes(dak.dataLimitBytes)}` : 'Unlimited quota'}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Rotation
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {dak.rotationEnabled ? dak.rotationInterval : 'Off'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {dak.nextRotationAt ? `Next ${formatRelativeTime(dak.nextRotationAt)}` : 'No scheduled rotation'}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setEditDialogOpen(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('dynamic_keys.detail.refresh')}
            </Button>
            <Button
              variant="destructive"
              className="h-11 rounded-full px-5"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {t('dynamic_keys.detail.delete')}
            </Button>
          </div>
        </div>
      </section>

      <section className="hidden xl:block ops-hero">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" size="icon" asChild className="rounded-full">
                  <Link href="/dashboard/dynamic-keys">
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                </Button>
                <span className="ops-pill border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-200">
                  <KeyRound className="h-3.5 w-3.5" />
                  Dynamic Key
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

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setEditDialogOpen(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('dynamic_keys.detail.refresh')}
              </Button>
              <Button
                variant="destructive"
                className="h-11 rounded-full px-5"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                {t('dynamic_keys.detail.delete')}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('dynamic_keys.detail.attached_keys')}
              </p>
              <p className="mt-3 text-2xl font-semibold">{dak.accessKeys.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {attachedActiveKeys} active attached keys
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Server Coverage
              </p>
              <p className="mt-3 text-2xl font-semibold">{serverCoverage}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Distinct servers serving this subscription
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('dynamic_keys.detail.traffic_usage')}
              </p>
              <p className="mt-3 text-2xl font-semibold">{formatBytes(dak.usedBytes)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {dak.dataLimitBytes ? `of ${formatBytes(dak.dataLimitBytes)}` : 'Unlimited quota'}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Rotation
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {dak.rotationEnabled ? dak.rotationInterval : 'Off'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {dak.nextRotationAt ? `Next ${formatRelativeTime(dak.nextRotationAt)}` : 'No scheduled rotation'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="ops-showcase-grid">
        {/* Main content */}
        <div className="ops-detail-stack self-start">
          {/* Type & Subscription Info */}
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TypeIcon className={cn('w-5 h-5', typeConfig.color)} />
                {t(typeConfig.labelKey)}
              </CardTitle>
              <CardDescription>{t(typeConfig.descriptionKey)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Subscription URL for Outline Client */}
              {dak.dynamicUrl && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Outline Client URL (ssconf://)
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-2xl border border-border/60 bg-background/55 p-3 font-mono text-xs break-all dark:bg-white/[0.03]">
                        {ssconfUrl}
                      </div>
                      <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Copy this URL and paste it in Outline client to connect. The client will automatically fetch the latest server configuration.
                    </p>
                  </div>

                  {/* API Endpoint */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">API Endpoint</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-2xl border border-border/60 bg-background/55 p-3 font-mono text-xs break-all dark:bg-white/[0.03]">
                        {subscriptionApiUrl}
                      </div>
                      <Button variant="outline" size="icon" onClick={handleCopyToken}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Traffic Usage */}
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                {t('dynamic_keys.detail.traffic_usage')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="ops-inline-stat">
                    <p className="text-3xl font-bold">{formatBytes(dak.usedBytes)}</p>
                    <p className="text-sm text-muted-foreground">
                      of {dak.dataLimitBytes ? formatBytes(dak.dataLimitBytes) : 'unlimited'}
                    </p>
                  </div>
                  {dak.dataLimitBytes && (
                    <p className="text-2xl font-semibold text-muted-foreground sm:self-center sm:justify-self-end">
                      {usagePercent.toFixed(1)}%
                    </p>
                  )}
                </div>

                {dak.dataLimitBytes && (
                  <Progress
                    value={usagePercent}
                    className={cn(
                      'h-3',
                      usagePercent > 90 && '[&>div]:bg-red-500',
                      usagePercent > 70 && usagePercent <= 90 && '[&>div]:bg-yellow-500'
                    )}
                  />
                )}
              </div>

              {/* Real-time Graph */}
              <div className="border-t border-border/50 pt-4">
                <p className="text-sm font-medium mb-2">Live Activity</p>
                <AggregatedTrafficGraph accessKeys={dak.accessKeys} />
              </div>

              {/* Historical Chart - show for first attached key if available */}
              {dak.accessKeys.length > 0 && (
                <div className="border-t border-border/50 pt-4">
                  <TrafficHistoryChart accessKeyId={dak.accessKeys[0].id} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attached Keys */}
          <Card className="ops-detail-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-primary" />
                  {t('dynamic_keys.detail.attached_keys')} ({dak.accessKeys.length})
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => setAttachDialogOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Attach Key
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
                          <Key className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {key.server?.name || 'Unknown Server'}
                          </p>
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
                        {dak.type === 'MANUAL' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleDetachKey(key.id)}
                            disabled={detachKeyMutation.isPending}
                          >
                            Detach
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
            <div className="ops-chart-empty py-8 text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('dynamic_keys.detail.no_keys')}</p>
            </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - QR Code & Details */}
        <div className="ops-detail-rail">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" />
                {t('dynamic_keys.detail.qr_code')}
              </CardTitle>
              <CardDescription>
                {t('dynamic_keys.detail.scan_qr')}
              </CardDescription>
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
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="ops-mobile-action-bar mt-4 w-full md:grid-cols-1">
                <Button variant="outline" className="w-full" onClick={handleCopyUrl}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy URL
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle>{t('dynamic_keys.detail.details')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('dynamic_keys.table.type')}</span>
                <span className="font-medium">{t(typeConfig.labelKey)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('dynamic_keys.detail.attached_keys')}</span>
                <span className="font-medium">{dak.accessKeys.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('dynamic_keys.table.status')}</span>
                <span className="font-medium">{dak.status}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Load Balancer</span>
                <Badge variant={dak.loadBalancerAlgorithm === 'LEAST_LOAD' ? 'default' : 'secondary'} className="text-xs">
                  {dak.loadBalancerAlgorithm === 'IP_HASH' ? 'IP Hash'
                    : dak.loadBalancerAlgorithm === 'ROUND_ROBIN' ? 'Round Robin'
                    : dak.loadBalancerAlgorithm === 'LEAST_LOAD' ? '⚡ Least Load'
                    : dak.loadBalancerAlgorithm === 'RANDOM' ? 'Random'
                    : dak.loadBalancerAlgorithm}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('dynamic_keys.detail.created')}</span>
                <span>{formatDateTime(dak.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('dynamic_keys.detail.updated')}</span>
                <span>{formatDateTime(dak.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          <ClientEndpointTestCard
            endpointUrl={subscriptionApiUrl}
            probeUrl={subscriptionProbeUrl}
            title="Client URL Test"
            description="Probe the live Outline client endpoint and verify the current dynamic subscription payload."
          />

          <DynamicRoutingDiagnosticsCard
            data={routingDiagnosticsQuery.data}
            isLoading={routingDiagnosticsQuery.isLoading}
            onRefresh={() => {
              void routingDiagnosticsQuery.refetch();
            }}
            isRefreshing={routingDiagnosticsQuery.isFetching}
          />

          {/* Server Load Distribution */}
          <ServerLoadCard />

          {/* Key Auto-Rotation */}
          <KeyRotationCard
            dakId={dak.id}
            rotationEnabled={dak.rotationEnabled}
            rotationInterval={dak.rotationInterval}
            lastRotatedAt={dak.lastRotatedAt ?? null}
            nextRotationAt={dak.nextRotationAt ?? null}
            rotationCount={dak.rotationCount}
            onUpdate={() => refetch()}
          />

          {/* Connection Sessions */}
          <DAKConnectionSessionsCard dakId={dak.id} />

          {/* Share Page Settings */}
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
        </div>
      </div>

      {/* Attach Key Dialog */}
      <Dialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Attach Access Key
            </DialogTitle>
            <DialogDescription>
              Select an access key to attach to this dynamic key. Only active keys that are not already attached to another dynamic key are shown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Access Key</Label>
              <Select
                value={selectedKeyId}
                onValueChange={setSelectedKeyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a key to attach..." />
                </SelectTrigger>
                <SelectContent>
                  {availableKeys?.items && availableKeys.items.length > 0 ? (
                    availableKeys.items.map((key) => (
                      <SelectItem key={key.id} value={key.id}>
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4" />
                          <span>{key.name}</span>
                          <span className="text-muted-foreground text-xs">
                            ({key.server?.name || 'Unknown Server'})
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No available keys
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {(!availableKeys?.items || availableKeys.items.length === 0) && (
                <p className="text-sm text-muted-foreground">
                  No unattached access keys available. Create a new key first or detach one from another dynamic key.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAttachDialogOpen(false);
                setSelectedKeyId('');
              }}
            >
              Cancel
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
            durationDays: dak.durationDays ?? null,
            expiresAt: dak.expiresAt ?? null,
            loadBalancerAlgorithm: dak.loadBalancerAlgorithm ?? 'IP_HASH',
            preferredServerIds: dak.preferredServerIds ?? [],
            preferredCountryCodes: dak.preferredCountryCodes ?? [],
            preferredRegionMode: dak.preferredRegionMode ?? 'PREFER',
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
  const { t } = useLocale();
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
            <p className="text-xs text-muted-foreground">Active Devices</p>
          </div>
          <div className="ops-inline-stat text-center">
            <div className="text-2xl font-bold">{data?.peakDevices || 0}</div>
            <p className="text-xs text-muted-foreground">Peak Devices</p>
          </div>
        </div>

        {/* Recent Sessions */}
        {data?.sessions && data.sessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent Sessions</p>
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
      </CardContent>
    </Card>
  );
}
