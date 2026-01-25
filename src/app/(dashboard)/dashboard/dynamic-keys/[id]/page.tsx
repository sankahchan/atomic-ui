'use client';

/**
 * Dynamic Access Key Detail Page
 *
 * This page provides a comprehensive view of a single Dynamic Access Key,
 * including its configuration, attached keys, usage statistics, and
 * management controls.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag } from '@/lib/utils';
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
} from 'lucide-react';
import { themeList, getTheme } from '@/lib/subscription-themes';
import { TrafficHistoryChart } from '@/components/charts/TrafficHistoryChart';

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
 * DAK Type configuration
 */
const DAK_TYPES = {
  SELF_MANAGED: {
    labelKey: 'dynamic_keys.type.self_managed',
    description: 'Automatically creates and rotates keys across servers',
    icon: Shuffle,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  MANUAL: {
    labelKey: 'dynamic_keys.type.manual',
    description: 'Manually attach and detach keys as needed',
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
  });

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
  dynamicUrl,
  currentTheme,
  currentCoverImage,
  currentCoverImageType,
  currentContactLinks,
  onUpdate,
}: {
  dakId: string;
  dynamicUrl: string | null;
  currentTheme: string | null;
  currentCoverImage: string | null;
  currentCoverImageType: string | null;
  currentContactLinks: ContactLink[] | null;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [selectedTheme, setSelectedTheme] = useState(currentTheme || 'glassPurple');
  const [coverImageUrl, setCoverImageUrl] = useState(
    currentCoverImageType === 'url' ? currentCoverImage || '' : ''
  );
  const [contacts, setContacts] = useState<ContactLink[]>(currentContactLinks || []);
  const [newContactType, setNewContactType] = useState<string>('telegram');
  const [newContactValue, setNewContactValue] = useState('');

  const updateMutation = trpc.dynamicKeys.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'Updated',
        description: 'Share page settings have been updated.',
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
        title: 'Error',
        description: 'Please enter a contact value.',
        variant: 'destructive',
      });
      return;
    }
    if (contacts.length >= 3) {
      toast({
        title: 'Limit reached',
        description: 'Maximum 3 contacts allowed.',
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

  const getSubscriptionPageUrl = () => {
    if (typeof window === 'undefined' || !dynamicUrl) return '';
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    return `${window.location.origin}${basePath}/sub/${dynamicUrl}`;
  };

  const copySubscriptionPageUrl = async () => {
    const url = getSubscriptionPageUrl();
    await navigator.clipboard.writeText(url);
    toast({
      title: 'Copied!',
      description: 'Subscription page URL copied to clipboard.',
    });
  };

  const theme = getTheme(selectedTheme);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-primary" />
          Share Page
        </CardTitle>
        <CardDescription>
          Share a beautiful subscription page with your user
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Theme Selector */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Page Theme
          </Label>
          <Select value={selectedTheme} onValueChange={handleThemeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select theme" />
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
            Background Image (Optional)
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
                'Save'
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use image as full-page background theme. Overrides color theme when set.
          </p>
        </div>

        {/* Contact Links */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Contact Links ({contacts.length}/3)
          </Label>

          {/* Existing contacts */}
          {contacts.length > 0 && (
            <div className="space-y-2">
              {contacts.map((contact, index) => {
                const contactType = CONTACT_TYPES.find(t => t.value === contact.type);
                return (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <span>{contactType?.icon}</span>
                    <span className="text-sm font-medium">{contactType?.label}</span>
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
                <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>Preview</p>
                <p className="text-xs" style={{ color: theme.textMuted }}>Image Background</p>
              </div>
            </div>
          </div>
        </div>

        {/* Preview & Copy Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              const url = getSubscriptionPageUrl();
              if (url) window.open(url, '_blank');
            }}
            disabled={!dynamicUrl}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button
            className="flex-1"
            onClick={copySubscriptionPageUrl}
            disabled={!dynamicUrl}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Link
          </Button>
        </div>

        {/* URL Display */}
        {dynamicUrl && (
          <div className="p-2 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Subscription Page URL:</p>
            <code className="text-xs break-all select-all">
              {getSubscriptionPageUrl()}
            </code>
          </div>
        )}
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

  // Generate ssconf:// URL for Outline client
  const getSsconfUrl = () => {
    if (typeof window === 'undefined' || !dak?.dynamicUrl) return '';
    // ssconf:// protocol tells Outline to fetch config from this URL
    // We need to encode the https URL and use ssconf:// prefix
    const httpsUrl = `${window.location.origin}/api/sub/${dak.dynamicUrl}`;
    return `ssconf://${httpsUrl.replace('https://', '').replace('http://', '')}`;
  };

  // Generate QR code when data loads
  useEffect(() => {
    if (dak?.dynamicUrl && typeof window !== 'undefined') {
      // Use ssconf:// URL for QR code (Outline client compatible)
      const httpsUrl = `${window.location.origin}/api/sub/${dak.dynamicUrl}`;
      const ssconfUrl = `ssconf://${httpsUrl.replace('https://', '').replace('http://', '')}`;
      QRCode.toDataURL(ssconfUrl, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then((qr) => setQrCode(qr))
        .catch((err) => console.error('Failed to generate QR code:', err));
    }
  }, [dak?.dynamicUrl]);

  const handleCopyUrl = () => {
    if (dak?.dynamicUrl) {
      // Copy ssconf:// URL for Outline client
      const ssconfUrl = getSsconfUrl();
      navigator.clipboard.writeText(ssconfUrl);
      toast({
        title: t('dynamic_keys.msg.copied'),
        description: 'Dynamic access key URL copied. Paste in Outline client.',
      });
    }
  };

  const handleCopyToken = () => {
    if (dak?.dynamicUrl) {
      navigator.clipboard.writeText(dak.dynamicUrl);
      toast({
        title: t('dynamic_keys.msg.copied'),
        description: 'Subscription token copied to clipboard.',
      });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/dynamic-keys">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{dak.name}</h1>
              <Badge variant={dak.status === 'ACTIVE' ? 'default' : 'secondary'}>
                {dak.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {t('dynamic_keys.detail.created')} {formatRelativeTime(dak.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('dynamic_keys.detail.refresh')}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            {t('dynamic_keys.detail.delete')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Type & Subscription Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TypeIcon className={cn('w-5 h-5', typeConfig.color)} />
                {t(typeConfig.labelKey)}
              </CardTitle>
              <CardDescription>{typeConfig.description}</CardDescription>
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
                      <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-xs break-all">
                        {getSsconfUrl()}
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
                      <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-xs break-all">
                        {typeof window !== 'undefined' ? `${window.location.origin}/api/sub/${dak.dynamicUrl}` : ''}
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                {t('dynamic_keys.detail.traffic_usage')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">{formatBytes(dak.usedBytes)}</p>
                    <p className="text-sm text-muted-foreground">
                      of {dak.dataLimitBytes ? formatBytes(dak.dataLimitBytes) : 'unlimited'}
                    </p>
                  </div>
                  {dak.dataLimitBytes && (
                    <p className="text-2xl font-semibold text-muted-foreground">
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
              <div className="pt-4 border-t border-border/50">
                <p className="text-sm font-medium mb-2">Live Activity</p>
                <AggregatedTrafficGraph accessKeys={dak.accessKeys} />
              </div>

              {/* Historical Chart - show for first attached key if available */}
              {dak.accessKeys.length > 0 && (
                <div className="pt-4 border-t border-border/50">
                  <TrafficHistoryChart accessKeyId={dak.accessKeys[0].id} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attached Keys */}
          <Card>
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
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded-lg">
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
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('dynamic_keys.detail.no_keys')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - QR Code & Details */}
        <div className="space-y-6">
          <Card>
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
                  className="rounded-lg bg-white p-2"
                  unoptimized
                />
              ) : (
                <div className="w-[200px] h-[200px] bg-muted rounded-lg flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="flex gap-2 mt-4 w-full">
                <Button variant="outline" className="flex-1" onClick={handleCopyUrl}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy URL
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
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
                <span className="text-muted-foreground">{t('dynamic_keys.detail.created')}</span>
                <span>{formatDateTime(dak.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('dynamic_keys.detail.updated')}</span>
                <span>{formatDateTime(dak.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Connection Sessions */}
          <DAKConnectionSessionsCard dakId={dak.id} />

          {/* Share Page Settings */}
          <SubscriptionShareCard
            dakId={dak.id}
            dynamicUrl={dak.dynamicUrl}
            currentTheme={dak.subscriptionTheme}
            currentCoverImage={dak.coverImage}
            currentCoverImageType={dak.coverImageType}
            currentContactLinks={dak.contactLinks}
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
      <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded-lg">
        <p className="text-sm">No attached keys to monitor</p>
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded-lg">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Initializing graph...
      </div>
    );
  }

  return (
    <div className="h-[200px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorBytesDAK" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
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
      <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
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
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
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
          <div className="text-center p-3 bg-muted/50 rounded-lg">
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
                    session.isActive ? 'bg-green-500/10' : 'bg-muted/50'
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
