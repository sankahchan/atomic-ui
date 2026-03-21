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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import { QRCodeWithLogo } from '@/components/qr-code-with-logo';
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import {
  buildSharePageUrl,
  buildShortClientUrl,
  buildShortShareUrl,
  buildSubscriptionApiUrl,
  buildSubscriptionClientUrl,
  getPublicBasePath,
} from '@/lib/subscription-links';
import { normalizePublicSlug } from '@/lib/public-slug';
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
} from 'lucide-react';
import { themeList, getTheme } from '@/lib/subscription-themes';
import { TrafficHistoryChart } from '@/components/charts/TrafficHistoryChart';
import { useLocale } from '@/hooks/use-locale';
import { ClientEndpointTestCard } from '@/components/subscription/client-endpoint-test-card';

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
  };
  onSuccess: () => void;
}) {
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
  });

  const updateMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'Key updated',
        description: 'The access key has been updated successfully.',
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
        description: 'Please enter a key name.',
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
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Access Key</DialogTitle>
          <DialogDescription>
            Update the key configuration. Name changes will sync to Outline.
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

          {formData.dataLimitGB && (
            <>
              <div className="space-y-2">
                <Label>Reset Strategy</Label>
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
                    <SelectItem value="NEVER">Never Reset</SelectItem>
                    <SelectItem value="DAILY">Daily (Every 24h)</SelectItem>
                    <SelectItem value="WEEKLY">Weekly (Every 7 days)</SelectItem>
                    <SelectItem value="MONTHLY">Monthly (Every 30 days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="autoDisable" className="text-sm font-medium">Auto-disable on limit</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically disable key when data limit is reached. Alerts are sent at 80% and 90%.
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
  const { toast } = useToast();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Access Key</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{keyName}&quot;?
            <br />
            This action cannot be undone. The key will be permanently removed from the server.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete
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
  keyName,
  currentTheme,
  currentCoverImage,
  currentCoverImageType,
  currentContactLinks,
  currentWelcomeMessage,
  onThemeChange,
}: {
  keyId: string;
  subscriptionToken: string | null;
  publicSlug: string | null;
  keyName: string;
  currentTheme: string | null;
  currentCoverImage: string | null;
  currentCoverImageType: string | null;
  currentContactLinks: ContactLink[] | null;
  currentWelcomeMessage: string | null;
  onThemeChange: () => void;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const shareUi = {
    title: isMyanmar ? 'မျှဝေရန် စာမျက်နှာ' : 'Share Page',
    description: isMyanmar ? 'အသုံးပြုသူထံသို့ လှပသော subscription စာမျက်နှာကို မျှဝေပါ' : 'Share a beautiful subscription page with your user',
    theme: isMyanmar ? 'စာမျက်နှာ Theme' : 'Page Theme',
    selectTheme: isMyanmar ? 'Theme ကို ရွေးပါ' : 'Select theme',
    shortSlug: isMyanmar ? 'Short Link Slug' : 'Short Link Slug',
    slugPlaceholder: isMyanmar ? 'my-access-key' : 'my-access-key',
    slugHelp: isMyanmar ? 'Short share page URL နှင့် Outline client URL အတွက် အသုံးပြုသည်။' : 'Used for the short share page and short Outline client URL.',
    save: isMyanmar ? 'သိမ်းမည်' : 'Save',
    regenerateShortSlug: isMyanmar ? 'Short slug ကို ပြန်ဖန်တီးမည်' : 'Regenerate short slug',
    backgroundImage: isMyanmar ? 'နောက်ခံပုံ (ရွေးချယ်နိုင်သည်)' : 'Background Image (Optional)',
    backgroundImageHelp: isMyanmar ? 'ပုံထည့်ပါက အပြည့်စုံ နောက်ခံပုံစံအဖြစ် အသုံးပြုမည်။ Theme အရောင်ကို အစားထိုးနိုင်သည်။' : 'Use image as full-page background theme. Overrides color theme when set.',
    contactLinks: isMyanmar ? 'ဆက်သွယ်ရန် Link များ' : 'Contact Links',
    contactPlaceholder: isMyanmar ? 'Link သို့မဟုတ် ID ထည့်ပါ' : 'Enter link or ID',
    welcomeOverride: isMyanmar ? 'ကြိုဆိုစာ Override' : 'Welcome Message Override',
    welcomePlaceholder: isMyanmar ? 'ဤ key ၏ share page အပေါ်ဘက်တွင် ပြသမည့် စာသား။ မဖြည့်ပါက global message ကို အသုံးပြုမည်။' : "Shown near the top of this key's share page. Leave empty to use the global message.",
    welcomeHelp: isMyanmar ? 'ဤ key အတွက်သာ global subscription page welcome message ကို အစားထိုးမည်။' : 'This overrides the global subscription page welcome message for this key only.',
    preview: isMyanmar ? 'အကြိုကြည့်မည်' : 'Preview',
    previewImage: isMyanmar ? 'ပုံနောက်ခံကို ဖွင့်ထားသည်' : 'Image Background',
    previewColorOnly: isMyanmar ? 'အရောင် Theme သာ' : 'Color theme only',
    previewCustomWelcome: isMyanmar ? 'ကိုယ်ပိုင်ကြိုဆိုစာကို အသုံးပြုနေသည်' : 'Custom welcome message enabled',
    previewGlobalWelcome: isMyanmar ? 'Global ကြိုဆိုစာကို အသုံးပြုနေသည်' : 'Using global welcome message',
    previewContacts: isMyanmar ? 'ဆက်သွယ်ရန် shortcut များ' : 'Contact shortcuts',
    previewAddToOutline: isMyanmar ? 'Outline ထဲသို့ ထည့်မည်' : 'Add to Outline',
    copyLink: isMyanmar ? 'Link ကို ကူးယူမည်' : 'Copy Link',
    copyClientUrl: isMyanmar ? 'Client URL ကို ကူးယူမည်' : 'Copy Client URL',
    connectTelegram: isMyanmar ? 'Telegram ချိတ်ဆက်မည်' : 'Connect Telegram',
    sendTelegram: isMyanmar ? 'Telegram ဖြင့် ပို့မည်' : 'Send via Telegram',
    regenerateLink: isMyanmar ? 'Link ကို ပြန်ဖန်တီးမည်' : 'Regenerate Link',
    sharePageUrl: isMyanmar ? 'Share Page URL' : 'Share Page URL',
    clientUrl: isMyanmar ? 'Client URL' : 'Client URL',
    pageViews: isMyanmar ? 'စာမျက်နှာကြည့်ရှုမှု' : 'Page Views',
    copyClicks: isMyanmar ? 'Copy အကြိမ်ရေ' : 'Copy Clicks',
    telegramSends: isMyanmar ? 'Telegram ပို့ထားမှု' : 'Telegram Sends',
    lastViewed: isMyanmar ? 'နောက်ဆုံးကြည့်ရှုချိန်' : 'Last Viewed',
    never: isMyanmar ? 'မရှိသေးပါ' : 'Never',
    copied: isMyanmar ? 'ကူးယူပြီးပါပြီ!' : 'Copied!',
    copiedShareUrl: isMyanmar ? 'Subscription page URL ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'Subscription page URL copied to clipboard.',
    copiedClientUrl: isMyanmar ? 'Client URL ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'Client URL copied to clipboard.',
    copiedConnectLink: isMyanmar ? 'Telegram connect link ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'Telegram connect link copied to clipboard.',
    copiedNewShareUrl: isMyanmar ? 'Share page link အသစ်ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'New share page link copied to clipboard.',
    copiedNewShortLink: isMyanmar ? 'Short share link အသစ်ကို clipboard သို့ ကူးယူပြီးပါပြီ။' : 'New short share link copied to clipboard.',
    updatedTitle: isMyanmar ? 'အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Updated',
    updateFailed: isMyanmar ? 'အပ်ဒိတ် မအောင်မြင်ပါ' : 'Update failed',
    themeUpdated: isMyanmar ? 'Subscription page theme ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The subscription page theme has been updated.',
    shortLinkUpdated: isMyanmar ? 'Short share link ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The short share link has been updated.',
    coverUpdated: isMyanmar ? 'နောက်ခံပုံကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The cover image has been updated.',
    contactsUpdated: isMyanmar ? 'ဆက်သွယ်ရန် link များကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Contact links have been updated.',
    welcomeUpdatedTitle: isMyanmar ? 'ကြိုဆိုစာကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Welcome message updated',
    welcomeUpdatedDesc: isMyanmar ? 'Share page ကြိုဆိုစာကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The share page welcome message has been updated.',
    shareRegeneratedTitle: isMyanmar ? 'Share link ကို ပြန်ဖန်တီးပြီးပါပြီ' : 'Share link regenerated',
    shareRegeneratedDesc: isMyanmar ? 'အဟောင်း shared link သည် မအသုံးပြုနိုင်တော့ပါ။' : 'The old shared link is no longer valid.',
    shortRegeneratedTitle: isMyanmar ? 'Short link ကို ပြန်ဖန်တီးပြီးပါပြီ' : 'Short link regenerated',
    shortRegeneratedDesc: isMyanmar ? 'Short share link အသစ်ကို အသုံးပြုနိုင်ပါပြီ။' : 'The new short share link is ready to use.',
    slugRegenerationFailed: isMyanmar ? 'Slug ပြန်ဖန်တီးမှု မအောင်မြင်ပါ' : 'Slug regeneration failed',
    shareSentTitle: isMyanmar ? 'Share page ကို ပို့ပြီးပါပြီ' : 'Share page sent',
    shareSentDesc: isMyanmar ? 'နောက်ဆုံး share page ကို Telegram မှတစ်ဆင့် ပို့ပြီးပါပြီ။' : 'The latest share page was sent through Telegram.',
    telegramFailed: isMyanmar ? 'Telegram ပို့မှု မအောင်မြင်ပါ' : 'Telegram send failed',
    connectFailed: isMyanmar ? 'Connect link ဖန်တီးမှု မအောင်မြင်ပါ' : 'Connect link failed',
    errorTitle: isMyanmar ? 'အမှား' : 'Error',
    contactRequired: isMyanmar ? 'ဆက်သွယ်ရန် တန်ဖိုးတစ်ခု ထည့်ပါ။' : 'Please enter a contact value.',
    limitReached: isMyanmar ? 'အများဆုံး အရေအတွက် ပြည့်သွားပါပြီ' : 'Limit reached',
    limitDesc: isMyanmar ? 'ဆက်သွယ်ရန် ၃ ခုအထိသာ ထည့်နိုင်ပါသည်။' : 'Maximum 3 contacts allowed.',
    missingSlug: isMyanmar ? 'Slug မပြည့်စုံပါ' : 'Missing slug',
    missingSlugDesc: isMyanmar ? 'သိမ်းမီ အနည်းဆုံး တရားဝင် စာလုံး ၃ လုံး ထည့်ပါ။' : 'Enter at least 3 valid characters before saving.',
    generatingNewToken: isMyanmar ? 'Subscription token အသစ်ကို ဖန်တီးနေသည်...' : 'Generating new subscription token...',
    generatingToken: isMyanmar ? 'Subscription token ကို ဖန်တီးနေသည်...' : 'Generating subscription token...',
  };
  const getContactTypeLabel = (type: ContactLink['type']) =>
    locale === 'my'
      ? ({
          telegram: 'Telegram',
          discord: 'Discord',
          whatsapp: 'WhatsApp',
          phone: 'ဖုန်း',
          email: 'အီးမေးလ်',
          website: 'ဝဘ်ဆိုက်',
          facebook: 'Facebook',
        } as const)[type]
      : CONTACT_TYPES.find((item) => item.value === type)?.label || type;
  const [selectedTheme, setSelectedTheme] = useState(currentTheme || 'dark');
  const [coverImageUrl, setCoverImageUrl] = useState(
    currentCoverImageType === 'url' ? currentCoverImage || '' : ''
  );
  const [slugInput, setSlugInput] = useState(publicSlug || '');
  const [contacts, setContacts] = useState<ContactLink[]>(currentContactLinks || []);
  const [welcomeMessage, setWelcomeMessage] = useState(currentWelcomeMessage || '');
  const [newContactType, setNewContactType] = useState<string>('telegram');
  const [newContactValue, setNewContactValue] = useState('');

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
    updateSlugMutation.mutate({
      id: keyId,
      publicSlug: normalizedSlug,
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
              disabled={updateSlugMutation.isPending}
            >
              {updateSlugMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : shareUi.save}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => regenerateSlugMutation.mutate({ id: keyId })}
              disabled={regenerateSlugMutation.isPending}
              title={shareUi.regenerateShortSlug}
            >
              {regenerateSlugMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {shareUi.slugHelp}
          </p>
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
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <span>{contactType?.icon}</span>
                    <span className="text-sm font-medium">{contactType ? getContactTypeLabel(contact.type) : contact.type}</span>
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="w-full min-w-0 text-xs sm:text-sm"
            disabled={!subscriptionToken && !slugInput.trim()}
            onClick={() => {
              const url = getSubscriptionPageUrl();
              if (url) window.open(url, '_blank');
            }}
          >
            <Eye className="w-4 h-4 mr-2" />
            {shareUi.preview}
          </Button>
          <Button
            className="w-full min-w-0 text-xs sm:text-sm"
            onClick={copySubscriptionPageUrl}
            disabled={!subscriptionToken && !slugInput.trim()}
          >
            <Copy className="w-4 h-4 mr-2" />
            {shareUi.copyLink}
          </Button>
          <Button
            variant="outline"
            className="w-full min-w-0 text-xs sm:text-sm"
            onClick={copyClientUrl}
            disabled={!subscriptionToken && !slugInput.trim()}
          >
            <Link2 className="w-4 h-4 mr-2" />
            {shareUi.copyClientUrl}
          </Button>
          <Button
            variant="outline"
            className="w-full min-w-0 text-xs sm:text-sm"
            onClick={() => connectLinkMutation.mutate({ id: keyId })}
            disabled={connectLinkMutation.isPending}
          >
            {connectLinkMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4 mr-2" />
            )}
            {shareUi.connectTelegram}
          </Button>
          <Button
            className="w-full min-w-0 text-xs sm:text-sm"
            onClick={() => sendSharePageMutation.mutate({ id: keyId, reason: 'RESENT' })}
            disabled={sendSharePageMutation.isPending}
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
            onClick={() => regenerateTokenMutation.mutate({ id: keyId })}
            disabled={regenerateTokenMutation.isPending}
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
            {subscriptionToken || slugInput.trim()
              ? getSubscriptionPageUrl()
              : regenerateTokenMutation.isPending
                ? shareUi.generatingNewToken
                : shareUi.generatingToken}
          </div>
          <div className="text-xs text-muted-foreground break-all p-2 bg-muted rounded">
            <p className="mb-1 font-medium text-foreground">{shareUi.clientUrl}</p>
            {subscriptionToken || slugInput.trim()
              ? getClientUrl()
              : `${shareUi.clientUrl}...`}
          </div>
        </div>

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
 * KeyDetailPage Component
 *
 * The main page component that fetches and displays all information about
 * a specific access key. It provides a comprehensive overview with action
 * buttons for common management tasks.
 */
export default function KeyDetailPage() {
  const { t } = useLocale();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const keyId = params.id as string;

  const [editDialogOpen, setEditDialogOpen] = useState(false);
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (keyId) {
      deleteMutation.mutate({ id: keyId });
      setDeleteDialogOpen(false);
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

  if (!key) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Key className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Key not found</h3>
          <p className="text-muted-foreground mb-6">
            The requested access key could not be found.
          </p>
          <Button asChild>
            <Link href="/dashboard/keys">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Keys
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = key.status as keyof typeof statusConfig;
  const statusInfo = statusConfig[status] || statusConfig.ACTIVE;
  const StatusIcon = statusInfo.icon;
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
  const estimatedDevices = activitySnapshot?.estimatedDevices ?? Number((key as any).estimatedDevices || 0);
  const activeSessions = activitySnapshot?.activeSessions ?? (key.sessions?.filter((session) => session.isActive).length || 0);
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
  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      <section className="xl:hidden ops-hero">
        <div className="space-y-5">
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
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusInfo.label}
            </Badge>
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
            <h1 className="text-3xl font-semibold tracking-tight">{key.name}</h1>
            <p className="text-sm text-muted-foreground">
              Created {formatRelativeTime(key.createdAt)}
              {key.server ? ` on ${key.server.name}` : ''}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Total Usage
              </p>
              <p className="mt-3 text-2xl font-semibold">{formatBytes(key.usedBytes)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {key.dataLimitBytes ? `of ${formatBytes(key.dataLimitBytes)}` : 'Unlimited quota'}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Devices
              </p>
              <p className="mt-3 text-2xl font-semibold">{estimatedDevices}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {activeSessions} active session{activeSessions === 1 ? '' : 's'}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Expires
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {key.expiresAt ? formatRelativeTime(key.expiresAt) : 'Never'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {key.expirationType.replace(/_/g, ' ')}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Last Seen
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {lastMeaningfulUsageAt ? formatRelativeTime(lastMeaningfulUsageAt) : 'Never'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Outline ID {key.outlineKeyId}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setEditDialogOpen(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-full px-5">
              <Link href={key.server ? `/dashboard/servers/${key.server.id}` : '/dashboard/servers'}>
                <Server className="w-4 h-4 mr-2" />
                View Server
              </Link>
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
              Delete
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
                  <Link href="/dashboard/keys">
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                </Button>
                <span className="ops-pill border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-200">
                  <Key className="h-3.5 w-3.5" />
                  Access Key
                </span>
                <Badge className={cn('border rounded-full px-3 py-1', statusInfo.color)}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusInfo.label}
                </Badge>
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
                  Created {formatRelativeTime(key.createdAt)}
                  {key.server ? ` on ${key.server.name}` : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setEditDialogOpen(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-full px-5">
                <Link href={key.server ? `/dashboard/servers/${key.server.id}` : '/dashboard/servers'}>
                  <Server className="w-4 h-4 mr-2" />
                  View Server
                </Link>
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
                Delete
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Total Usage
              </p>
              <p className="mt-3 text-2xl font-semibold">{formatBytes(key.usedBytes)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {key.dataLimitBytes ? `of ${formatBytes(key.dataLimitBytes)}` : 'Unlimited quota'}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Devices
              </p>
              <p className="mt-3 text-2xl font-semibold">{estimatedDevices}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {activeSessions} active session{activeSessions === 1 ? '' : 's'}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Expires
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {key.expiresAt ? formatRelativeTime(key.expiresAt) : 'Never'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {key.expirationType.replace(/_/g, ' ')}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Last Seen
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {lastMeaningfulUsageAt ? formatRelativeTime(lastMeaningfulUsageAt) : 'Never'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Outline ID {key.outlineKeyId}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="ops-showcase-grid">
        {/* Main content */}
        <div className="ops-detail-stack">
          {/* Server & Access Info */}
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                Server & Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Server info */}
              {key.server && (
                <div className="ops-row-card">
                  <div className="flex items-center gap-3">
                    {key.server.countryCode && (
                      <span className="text-xl">{getCountryFlag(key.server.countryCode)}</span>
                    )}
                    <div>
                      <p className="font-medium">{key.server.name}</p>
                      {key.server.location && (
                        <p className="text-sm text-muted-foreground">{key.server.location}</p>
                      )}
                    </div>
                  </div>
                  <Link href={`/dashboard/servers/${key.server.id}`}>
                    <Button variant="ghost" size="sm" className="rounded-full">
                      View Server
                    </Button>
                  </Link>
                </div>
              )}

              {/* Access URL */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Access URL</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-2xl border border-border/60 bg-background/55 p-3 font-mono text-sm break-all dark:bg-white/[0.03]">
                    {decoratedAccessUrl}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(decoratedAccessUrl, 'Copied!', 'Access URL copied to clipboard.')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Subscription URL */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Subscription URL</Label>
                <p className="text-xs text-muted-foreground">
                  Share this URL with the user. Clients can fetch the latest config automatically.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-2xl border border-border/60 bg-background/55 p-3 font-mono text-sm break-all dark:bg-white/[0.03]">
                    {subscriptionApiUrl || 'Loading subscription token...'}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (subscriptionApiUrl) {
                        copyToClipboard(subscriptionApiUrl, 'Copied!', 'Subscription URL copied to clipboard.');
                      }
                    }}
                    disabled={!subscriptionApiUrl}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Technical Details */}
              <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
                <div className="ops-inline-stat">
                  <p className="text-sm text-muted-foreground">Port</p>
                  <p className="font-mono">{key.port}</p>
                </div>
                <div className="ops-inline-stat">
                  <p className="text-sm text-muted-foreground">Encryption</p>
                  <p className="font-mono">{key.method}</p>
                </div>
                {key.prefix && (
                  <div className="ops-inline-stat col-span-2">
                    <p className="text-sm text-muted-foreground">Prefix (Obfuscation)</p>
                    <p className="font-mono">{key.prefix}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Traffic Usage */}
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Traffic Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="ops-inline-stat">
                  <p className="text-3xl font-bold">{formatBytes(key.usedBytes)}</p>
                    <p className="text-sm text-muted-foreground">
                      of {key.dataLimitBytes ? formatBytes(key.dataLimitBytes) : 'unlimited'}
                    </p>
                  </div>
                  {key.dataLimitBytes && (
                    <p className="text-2xl font-semibold text-muted-foreground sm:self-center sm:justify-self-end">
                      {usagePercent.toFixed(1)}%
                    </p>
                  )}
                </div>

                {key.dataLimitBytes && (
                  <Progress
                    value={usagePercent}
                    className={cn(
                      'h-3',
                      usagePercent > 90 && '[&>div]:bg-red-500',
                      usagePercent > 70 && usagePercent <= 90 && '[&>div]:bg-yellow-500'
                    )}
                  />
                )}

                {key.dataLimitBytes && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {(key as any).autoDisableOnLimit && (
                      <Badge variant="outline" className="text-xs">
                        Auto-disable on limit
                      </Badge>
                    )}
                    {(key as any).bandwidthAlertAt80 && (
                      <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
                        80% alert sent
                      </Badge>
                    )}
                    {(key as any).bandwidthAlertAt90 && (
                      <Badge variant="outline" className="text-xs border-red-500 text-red-600">
                        90% alert sent
                      </Badge>
                    )}
                  </div>
                )}

                {(key as any).dataLimitResetStrategy && (key as any).dataLimitResetStrategy !== 'NEVER' && (
                  <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
                    <RefreshCw className="w-4 h-4" />
                    <span>
                      Resets {(key as any).dataLimitResetStrategy.toLowerCase()}
                      {(key as any).lastDataLimitReset && ` (Last reset: ${(key as any).lastDataLimitReset ? formatRelativeTime((key as any).lastDataLimitReset) : 'Never'})`}
                    </span>
                  </div>
                )}
              </div>

              {/* Real-time Graph */}
              <div className="border-t border-border/50 pt-4">
                <p className="text-sm font-medium mb-2">Live Activity</p>
                <TrafficGraph serverId={key.server.id} outlineKeyId={key.outlineKeyId} />
              </div>

              {/* Historical Chart */}
              <div className="border-t border-border/50 pt-4">
                <TrafficHistoryChart accessKeyId={key.id} />
              </div>
            </CardContent>
          </Card>

          {/* Expiration Info */}
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Expiration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="ops-inline-stat">
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{key.expirationType.replace(/_/g, ' ')}</p>
                </div>
                <div className="ops-inline-stat">
                  <p className="text-sm text-muted-foreground">Expires</p>
                  <p className="font-medium">
                    {key.expiresAt ? formatDateTime(key.expiresAt) : 'Never'}
                  </p>
                </div>
                {key.firstUsedAt && (
                  <div className="ops-inline-stat">
                    <p className="text-sm text-muted-foreground">First Used</p>
                    <p className="font-medium">{formatDateTime(key.firstUsedAt)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contact & Notes */}
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="ops-inline-stat flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{key.email || '-'}</p>
                  </div>
                </div>
                <div className="ops-inline-stat flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Telegram</p>
                    <p className="font-medium">{key.telegramId || '-'}</p>
                  </div>
                </div>
                <div className="ops-inline-stat flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="font-medium">{key.notes || '-'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - QR Code */}
        <div className="ops-detail-rail">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" />
                QR Code
              </CardTitle>
              <CardDescription>
                Scan with a Shadowsocks client to connect
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {qrLoading ? (
                <div className="h-[200px] w-[200px] rounded-[1.25rem] border border-border/60 bg-background/45 animate-pulse dark:bg-white/[0.03]" />
              ) : qrData?.qrCode ? (
                <QRCodeWithLogo
                  dataUrl={qrData.qrCode}
                  size={200}
                  className="rounded-[1.1rem] bg-white p-2"
                />
              ) : (
                <div className="ops-chart-empty h-[200px] w-[200px]">
                  <p className="text-sm text-muted-foreground">Failed to generate</p>
                </div>
              )}

              <div className="ops-mobile-action-bar mt-4 w-full md:grid-cols-1">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => copyToClipboard(decoratedAccessUrl, 'Copied!', 'Access URL copied to clipboard.')}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy URL
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outline Key ID</span>
                <span className="font-mono">{key.outlineKeyId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDateTime(key.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDateTime(key.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          <ClientEndpointTestCard
            endpointUrl={subscriptionApiUrl}
            probeUrl={subscriptionProbeUrl}
            title="Client URL Test"
            description="Probe the live Outline client endpoint and confirm the subscription payload resolves cleanly."
          />

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
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
                  <p className="font-medium">
                    {lastTrafficAt ? formatRelativeTime(lastTrafficAt) : t('keys.activity.none')}
                  </p>
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

          {/* Connection Sessions */}
          <ConnectionSessionsCard keyId={key.id} />

          {/* Subscription Page Share */}
          <SubscriptionShareCard
            keyId={key.id}
            subscriptionToken={key.subscriptionToken}
            publicSlug={key.publicSlug}
            keyName={key.name}
            currentTheme={(key as any).subscriptionTheme}
            currentCoverImage={(key as any).coverImage}
            currentCoverImageType={(key as any).coverImageType}
            currentContactLinks={(key as any).contactLinks ? JSON.parse((key as any).contactLinks) : null}
            currentWelcomeMessage={(key as any).subscriptionWelcomeMessage}
            onThemeChange={() => refetch()}
          />
        </div>
      </div>

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
  const { data, isLoading } = trpc.keys.getConnectionSessions.useQuery(
    { keyId, limit: 10 },
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
          Estimated device usage based on traffic patterns
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

        {(!data?.sessions || data.sessions.length === 0) && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No connection sessions recorded yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
