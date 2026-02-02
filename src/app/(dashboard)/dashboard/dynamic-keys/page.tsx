'use client';

/**
 * Dynamic Access Keys Page
 *
 * Dynamic Access Keys (DAK) represent one of the most powerful features of
 * Atomic-UI, borrowed from the x-ui project. Unlike regular access keys that
 * are tied to a specific server and Outline key ID, dynamic keys provide a
 * layer of abstraction that enables several advanced use cases.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { trpc } from '@/lib/trpc';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils';
import { SegmentedUsageBarCompact } from '@/components/ui/segmented-usage-bar';
import QRCode from 'qrcode';
import {
  Plus,
  KeyRound,
  Search,
  RefreshCw,
  Trash2,
  Copy,
  QrCode,
  Settings,
  Link2,
  Shuffle,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  HardDrive,
  Power,
  MoreVertical,
  Eye,
  Download,
  FileJson,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Clock,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Share2,
  LayoutGrid,
  HelpCircle,
  LayoutList,
  Archive,
  ListTree,
  Pencil,
} from 'lucide-react';
import { useKeyActivity } from '@/hooks/use-key-activity';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MobileCardView } from '@/components/mobile-card-view';
import { DynamicGroupList } from '@/components/dynamic-keys/dynamic-group-list';
import { copyToClipboard } from '@/lib/clipboard';
import { QRCodeWithLogo } from '@/components/qr-code-with-logo';
import { usePersistedFilters } from '@/hooks/use-persisted-filters';
import { Wifi, EyeOff, Tag, User, Smartphone } from 'lucide-react';

/**
 * Supported encryption methods for Shadowsocks
 */
const ENCRYPTION_METHODS = [
  { value: 'chacha20-ietf-poly1305', label: 'ChaCha20-IETF-Poly1305 (Recommended)' },
  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
  { value: 'aes-192-gcm', label: 'AES-192-GCM' },
  { value: 'aes-256-gcm', label: 'AES-256-GCM' },
] as const;

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
 * Status badge configuration
 */
const statusConfig = {
  ACTIVE: {
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: CheckCircle2,
    labelKey: 'dynamic_keys.status.active',
  },
  DISABLED: {
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: XCircle,
    labelKey: 'dynamic_keys.status.disabled',
  },
  EXPIRED: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: Clock,
    labelKey: 'dynamic_keys.status.expired',
  },
  DEPLETED: {
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: AlertTriangle,
    labelKey: 'dynamic_keys.status.depleted',
  },
  PENDING: {
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: Clock,
    labelKey: 'dynamic_keys.status.pending',
  },
};

/**
 * Auto-sync interval options
 */
const AUTO_SYNC_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

// Type for DAK data from the API
type DAKData = {
  id: string;
  name: string;
  email?: string | null;
  type: 'SELF_MANAGED' | 'MANUAL';
  status: 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED' | 'PENDING';
  dynamicUrl: string | null;
  dataLimitBytes: bigint | null;
  usedBytes: bigint;
  attachedKeysCount: number;
  serverTagIds: string[];
  prefix: string | null;
  method: string | null;
  expiresAt?: Date | null;
  daysRemaining?: number | null;
  createdAt: Date;
  firstUsedAt?: Date | null;
  tags?: string | null;
  owner?: string | null;
  isExpiringSoon?: boolean;
  isTrafficWarning?: boolean;
  usagePercent?: number;
};

/**
 * CreateDAKDialog Component
 */
function CreateDAKDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [formData, setFormData] = useState<{
    name: string;
    type: keyof typeof DAK_TYPES;
    email: string;
    telegramId: string;
    notes: string;
    dataLimitGB: string;
    dataLimitResetStrategy: 'NEVER' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
    expirationType: 'NEVER' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE';
    durationDays: string;
    method: string;
  }>({
    name: '',
    type: 'SELF_MANAGED',
    email: '',
    telegramId: '',
    notes: '',
    dataLimitGB: '',
    dataLimitResetStrategy: 'NEVER',
    expirationType: 'NEVER',
    durationDays: '',
    method: 'chacha20-ietf-poly1305',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'SELF_MANAGED',
      email: '',
      telegramId: '',
      notes: '',
      dataLimitGB: '',
      dataLimitResetStrategy: 'NEVER',
      expirationType: 'NEVER',
      durationDays: '',
      method: 'chacha20-ietf-poly1305',
    });
  };

  const createMutation = trpc.dynamicKeys.create.useMutation({
    onSuccess: (data) => {
      toast({
        title: t('dynamic_keys.msg.created'),
        description: `"${data.name}" has been created successfully.`,
      });
      onSuccess();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: 'Error creating dynamic key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Validation error',
        description: 'Please enter a name for the dynamic key.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      name: formData.name,
      type: formData.type,
      email: formData.email || undefined,
      telegramId: formData.telegramId || undefined,
      notes: formData.notes || undefined,
      dataLimitGB: formData.dataLimitGB ? parseFloat(formData.dataLimitGB) : undefined,
      dataLimitResetStrategy: formData.dataLimitResetStrategy,
      expirationType: formData.expirationType,
      durationDays: formData.durationDays ? parseInt(formData.durationDays) : undefined,
      method: formData.method as 'chacha20-ietf-poly1305' | 'aes-128-gcm' | 'aes-192-gcm' | 'aes-256-gcm',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            {t('dynamic_keys.dialog.create_title')}
          </DialogTitle>
          <DialogDescription>
            {t('dynamic_keys.dialog.create_desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="dakName">{t('dynamic_keys.dialog.name')} *</Label>
            <Input
              id="dakName"
              placeholder={t('dynamic_keys.dialog.name_placeholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* Type selection */}
          <div className="space-y-3">
            <Label>{t('dynamic_keys.dialog.type')} *</Label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(DAK_TYPES).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: key as keyof typeof DAK_TYPES })}
                  className={cn(
                    'p-4 rounded-lg border text-left transition-all',
                    formData.type === key
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <config.icon className={cn('w-5 h-5 mb-2', config.color)} />
                  <p className="font-medium text-sm">{t(config.labelKey)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {config.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Encryption method */}
          <div className="space-y-2">
            <Label>{t('dynamic_keys.dialog.encryption')}</Label>
            <Select
              value={formData.method}
              onValueChange={(value) => setFormData({ ...formData, method: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select encryption method" />
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
              ChaCha20 is recommended for mobile devices. AES-256-GCM is more secure but slower.
            </p>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dakEmail">{t('dynamic_keys.dialog.email')}</Label>
              <Input
                id="dakEmail"
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dakTelegram">{t('dynamic_keys.dialog.telegram')}</Label>
              <Input
                id="dakTelegram"
                placeholder="@username or ID"
                value={formData.telegramId}
                onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
              />
            </div>
          </div>

          {/* Data limit */}
          <div className="space-y-2">
            <Label htmlFor="dakDataLimit">{t('dynamic_keys.dialog.data_limit')}</Label>
            <Input
              id="dakDataLimit"
              type="number"
              placeholder="Leave empty for unlimited"
              value={formData.dataLimitGB}
              onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
              min="0"
              step="0.5"
            />
            <p className="text-xs text-muted-foreground">
              {t('dynamic_keys.dialog.data_limit_help')}
            </p>
          </div>

          {/* Data Limit Reset Strategy */}
          {formData.dataLimitGB && (
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
          )}

          {/* Expiration type */}
          <div className="space-y-2">
            <Label>{t('dynamic_keys.dialog.expiration')}</Label>
            <Select
              value={formData.expirationType}
              onValueChange={(value: 'NEVER' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE') =>
                setFormData({ ...formData, expirationType: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEVER">{t('dynamic_keys.expires.never')}</SelectItem>
                <SelectItem value="DURATION_FROM_CREATION">Duration from creation</SelectItem>
                <SelectItem value="START_ON_FIRST_USE">Start on first use</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Duration days (conditional) */}
          {(formData.expirationType === 'DURATION_FROM_CREATION' ||
            formData.expirationType === 'START_ON_FIRST_USE') && (
              <div className="space-y-2">
                <Label htmlFor="dakDurationDays">{t('dynamic_keys.dialog.duration')}</Label>
                <Input
                  id="dakDurationDays"
                  type="number"
                  placeholder="30"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                  min="1"
                />
              </div>
            )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="dakNotes">{t('dynamic_keys.dialog.notes')}</Label>
            <Input
              id="dakNotes"
              placeholder="Optional notes about this dynamic key"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('dynamic_keys.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('dynamic_keys.dialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * QRCodeDialog Component
 */
// Helper to get the full subscription URL including base path
function getSubscriptionUrl(dynamicUrl: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${window.location.origin}${basePath}/api/sub/${dynamicUrl}`;
}

// Helper to get ssconf:// URL for Outline app
function getSsconfUrl(dynamicUrl: string, name: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `ssconf://${window.location.host}${basePath}/api/sub/${dynamicUrl}#${encodeURIComponent(name)}`;
}

function QRCodeDialog({
  dak,
  open,
  onOpenChange,
}: {
  dak: DAKData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && dak?.dynamicUrl) {
      setIsLoading(true);
      const url = getSubscriptionUrl(dak.dynamicUrl);
      QRCode.toDataURL(url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then((dataUrl) => {
          setQrCode(dataUrl);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    }
  }, [open, dak]);

  const handleCopyUrl = async () => {
    if (dak?.dynamicUrl) {
      const url = getSubscriptionUrl(dak.dynamicUrl);
      await copyToClipboard(url);
    }
  };

  if (!dak) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('dynamic_keys.detail.qr_code')}: {dak.name}</DialogTitle>
          <DialogDescription>
            {t('dynamic_keys.detail.scan_qr')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          {isLoading ? (
            <div className="w-[200px] h-[200px] bg-muted rounded-lg animate-pulse" />
          ) : qrCode ? (
            <QRCodeWithLogo
              dataUrl={qrCode}
              size={200}
            />
          ) : (
            <div className="w-[200px] h-[200px] bg-muted rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground text-sm">Failed to generate</p>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-4 w-full">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCopyUrl}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy URL
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (dak?.dynamicUrl) {
                    const ssconfUrl = getSsconfUrl(dak.dynamicUrl, dak.name);
                    navigator.clipboard.writeText(ssconfUrl);
                    toast({
                      title: t('dynamic_keys.msg.copied'),
                      description: 'ssconf URL copied for Outline app',
                    });
                  }
                }}
              >
                <Link2 className="w-4 h-4 mr-2" />
                ssconf://
              </Button>
            </div>

            <div className="p-2 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Subscription URL:</p>
              <code className="text-xs break-all select-all">
                {dak?.dynamicUrl ? getSubscriptionUrl(dak.dynamicUrl) : ''}
              </code>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Online indicator component with blinking animation
 */
function OnlineIndicator({ isOnline }: { isOnline: boolean }) {
  if (!isOnline) return null;

  return (
    <span className="relative flex h-2 w-2 mr-2" title="Currently active">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
    </span>
  );
}

/**
 * BulkExtendDialog Component
 *
 * A dialog for extending the expiration of multiple dynamic keys.
 */
function BulkExtendDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: (days: number) => void;
  isPending: boolean;
}) {
  const [days, setDays] = useState('30');
  const [customDays, setCustomDays] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const { t } = useLocale();

  const quickOptions = [7, 14, 30, 60, 90];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Extend Expiration
          </DialogTitle>
          <DialogDescription>
            Extend {count} selected key{count > 1 ? 's' : ''}. This will add days to their current expiration date and reactivate them if expired.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {quickOptions.map((d) => (
              <Button
                key={d}
                variant={!useCustom && days === d.toString() ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setDays(d.toString());
                  setUseCustom(false);
                }}
              >
                +{d}d
              </Button>
            ))}
            <Button
              variant={useCustom ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseCustom(true)}
            >
              Custom
            </Button>
          </div>

          {useCustom && (
            <div className="space-y-2">
              <Label htmlFor="customDays">Custom Days</Label>
              <Input
                id="customDays"
                type="number"
                min="1"
                placeholder="Enter number of days"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('dynamic_keys.dialog.cancel')}
          </Button>
          <Button
            onClick={() => onConfirm(parseInt(useCustom ? customDays : days) || 30)}
            disabled={isPending || (useCustom && !customDays)}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Extend +{useCustom ? (customDays || '0') : days} days
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * BulkTagsDialog Component
 *
 * A dialog for adding or removing tags from multiple dynamic keys.
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

  const handleSubmit = () => {
    if (tags.trim()) {
      onConfirm(tags.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            {mode === 'add' ? 'Add Tags' : 'Remove Tags'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? `Add tags to ${count} selected key${count > 1 ? 's' : ''}.`
              : `Remove tags from ${count} selected key${count > 1 ? 's' : ''}.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              placeholder="e.g., premium, vip, trial"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter tags separated by commas. Tags are case-insensitive.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('dynamic_keys.dialog.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !tags.trim()}
            variant={mode === 'remove' ? 'destructive' : 'default'}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === 'add' ? 'Add Tags' : 'Remove Tags'}
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {isPending ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Processing...</p>
            </div>
          ) : results ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-2xl font-bold text-green-500">{results.success}</p>
                  <p className="text-sm text-green-500">Successful</p>
                </div>
                <div className="flex-1 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-2xl font-bold text-red-500">{results.failed}</p>
                  <p className="text-sm text-red-500">Failed</p>
                </div>
              </div>

              {results.errors && results.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Errors:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {results.errors.map((err, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-red-500/10 text-red-400">
                        <span className="font-medium">{err.name || err.id}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} disabled={isPending}>
            {isPending ? 'Processing...' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * DAKRow Component - Table row for a dynamic key
 */
function DAKRow({
  dak,
  onCopyUrl,
  onShowQR,
  onDelete,
  onToggleStatus,
  isSelected,
  onSelect,
  isTogglingStatus,
  isOnline,
}: {
  dak: DAKData;
  onCopyUrl: () => void;
  onShowQR: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  isSelected: boolean;
  onSelect: () => void;
  isTogglingStatus: boolean;
  isOnline: boolean;
}) {
  const { t } = useLocale();
  const typeConfig = DAK_TYPES[dak.type];
  const config = statusConfig[dak.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
  const StatusIcon = config.icon;

  const usagePercent = dak.dataLimitBytes
    ? Number((dak.usedBytes * BigInt(100)) / dak.dataLimitBytes)
    : 0;

  return (
    <tr className={cn('hover:bg-muted/50 transition-colors', isSelected && 'bg-primary/5')}>
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
              href={`/dashboard/dynamic-keys/${dak.id}`}
              className="font-medium hover:text-primary transition-colors"
            >
              {dak.name}
            </Link>
            {dak.email && (
              <p className="text-xs text-muted-foreground">{dak.email}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Last seen: {dak.firstUsedAt ? formatRelativeTime(dak.firstUsedAt) : 'Never'}
            </p>
            {dak.tags && (
              <div className="flex flex-wrap gap-1 mt-1">
                {dak.tags.split(',').filter(Boolean).map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                    {tag.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <typeConfig.icon className={cn('w-4 h-4', typeConfig.color)} />
          <span className="text-sm">{t(typeConfig.labelKey)}</span>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <Badge className={cn('border', config.color)}>
          <StatusIcon className="w-3 h-3 mr-1" />
          {t(config.labelKey)}
        </Badge>
      </td>

      {/* Usage */}
      <td className="px-4 py-3">
        <SegmentedUsageBarCompact
          valueBytes={Number(dak.usedBytes)}
          limitBytes={dak.dataLimitBytes ? Number(dak.dataLimitBytes) : undefined}
          className="min-w-[140px]"
        />
      </td>

      {/* Devices */}
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">
            {0 || 0}
          </span>
        </div>
      </td>

      {/* Attached Keys */}
      <td className="px-4 py-3">
        <span className="text-sm">{dak.attachedKeysCount}</span>
      </td>

      {/* Expiration */}
      <td className="px-4 py-3">
        {dak.expiresAt ? (
          <div className={cn(
            'text-sm',
            dak.daysRemaining != null && dak.daysRemaining <= 3 && 'text-orange-500'
          )}>
            {dak.daysRemaining != null && dak.daysRemaining > 0 ? (
              <span>{dak.daysRemaining}{t('dynamic_keys.expires.days_left')}</span>
            ) : dak.daysRemaining === 0 ? (
              <span>{t('dynamic_keys.expires.today')}</span>
            ) : (
              <span className="text-red-500">{t('dynamic_keys.expires.expired')}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{t('dynamic_keys.expires.never')}</span>
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
            title={t('dynamic_keys.detail.qr_code')}
          >
            <QrCode className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              dak.status === 'DISABLED' ? 'text-green-500 hover:text-green-600' : 'text-orange-500 hover:text-orange-600'
            )}
            onClick={onToggleStatus}
            disabled={isTogglingStatus}
            title={dak.status === 'DISABLED' ? 'Enable key' : 'Disable key'}
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
                <Link href={`/dashboard/dynamic-keys/${dak.id}`} className="cursor-pointer">
                  <Eye className="w-4 h-4 mr-2" />
                  {t('dynamic_keys.detail.details')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/dynamic-keys/${dak.id}`} className="cursor-pointer">
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('common.edit')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShowQR}>
                <QrCode className="w-4 h-4 mr-2" />
                {t('dynamic_keys.detail.qr_code')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyUrl}>
                <Copy className="w-4 h-4 mr-2" />
                Copy URL
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('dynamic_keys.detail.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

/**
 * DynamicKeysPage Component
 */
export default function DynamicKeysPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [qrDialogDak, setQrDialogDak] = useState<DAKData | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);
  const syncAllRef = useRef<ReturnType<typeof trpc.servers.syncAll.useMutation> | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'group'>('list');

  const { filters, setQuickFilter, setTagFilter, setOwnerFilter, clearFilters: clearPersistedFilters } = usePersistedFilters('dynamic-keys');

  const pageSize = 20;

  // Auto-refresh hook with localStorage persistence and tab visibility handling
  const autoRefresh = useAutoRefresh({
    onRefresh: useCallback(() => {
      if (syncAllRef.current && !syncAllRef.current.isPending) {
        syncAllRef.current.mutate();
      }
    }, []),
  });

  // Fetch dynamic keys from API
  const { data, isLoading, refetch } = trpc.dynamicKeys.list.useQuery({
    search: searchQuery || undefined,
    status: (statusFilter || undefined) as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED' | 'PENDING' | undefined,
    type: (typeFilter || undefined) as 'SELF_MANAGED' | 'MANUAL' | undefined,
    page,
    pageSize,
    online: filters.quickFilters.online || undefined,
    expiring7d: filters.quickFilters.expiring7d || undefined,
    overQuota: filters.quickFilters.overQuota || undefined,
    inactive30d: filters.quickFilters.inactive30d || undefined,
    tag: filters.tagFilter || undefined,
    owner: filters.ownerFilter || undefined,
  });

  // Fetch stats with polling when auto-refresh is active
  const { data: stats, refetch: refetchStats } = trpc.dynamicKeys.stats.useQuery(undefined, {
    refetchInterval: autoRefresh.isActive ? autoRefresh.interval * 1000 : false,
  });

  // Fetch live metrics directly from Outline servers - always poll every 3 seconds
  // This provides real-time online detection independent of auto-sync setting
  const { data: liveMetrics, refetch: refetchOnline } = trpc.dynamicKeys.getLiveMetrics.useQuery(undefined, {
    refetchInterval: 3000, // Always poll for responsive online detection
    refetchIntervalInBackground: false, // Pause when tab is hidden to save resources
  });

  // Track online status via activity hook (delta-based)
  const { onlineCount, isOnline } = useKeyActivity(liveMetrics);

  // Helper to check if a DAK is online (disabled keys are never online)
  const checkIsOnline = (dakId: string, status?: string) => {
    if (status === 'DISABLED') return false;
    return isOnline(dakId);
  };

  // Sync all servers mutation
  const syncAllMutation = trpc.servers.syncAll.useMutation({
    onSuccess: () => {
      refetch();
      refetchStats();
      refetchOnline();
    },
  });

  // Store mutation in ref for auto-refresh callback
  syncAllRef.current = syncAllMutation;

  // Note: Auto-sync is now handled by the useAutoRefresh hook above

  // Delete mutation
  const deleteMutation = trpc.dynamicKeys.delete.useMutation({
    onSuccess: () => {
      toast({
        title: t('dynamic_keys.msg.deleted'),
        description: 'The dynamic key has been deleted successfully.',
      });
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: 'Error deleting dynamic key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = trpc.dynamicKeys.toggleStatus.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.status === 'DISABLED' ? 'Key disabled' : 'Key enabled',
        description: `${result.name} is now ${result.status.toLowerCase()}.`,
      });
      refetch();
      refetchStats();
      setTogglingKeyId(null);
    },
    onError: (error) => {
      toast({
        title: 'Status change failed',
        description: error.message,
        variant: 'destructive',
      });
      setTogglingKeyId(null);
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = trpc.dynamicKeys.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Bulk delete complete',
        description: `Deleted ${result.success} keys. ${result.failed} failed.`,
      });
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: 'Bulk delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Bulk extend dialog state
  const [bulkExtendDialogOpen, setBulkExtendDialogOpen] = useState(false);
  const [bulkTagsDialogOpen, setBulkTagsDialogOpen] = useState(false);
  const [bulkTagsMode, setBulkTagsMode] = useState<'add' | 'remove'>('add');
  const [bulkProgressDialogOpen, setBulkProgressDialogOpen] = useState(false);
  const [bulkProgressTitle, setBulkProgressTitle] = useState('');
  const [bulkProgressResults, setBulkProgressResults] = useState<{ success: number; failed: number; errors?: { id: string; name: string; error: string }[] } | null>(null);

  // Bulk extend mutation
  const bulkExtendMutation = trpc.dynamicKeys.bulkExtend.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Extension complete',
        description: `Extended ${result.success} keys.`,
      });
      setBulkExtendDialogOpen(false);
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: 'Extension failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Bulk toggle status mutation
  const bulkToggleStatusMutation = trpc.dynamicKeys.bulkToggleStatus.useMutation({
    onSuccess: (result) => {
      setBulkProgressResults(result);
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: 'Bulk status change failed',
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  // Bulk add tags mutation
  const bulkAddTagsMutation = trpc.dynamicKeys.bulkAddTags.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Tags added',
        description: `Added tags to ${result.success} keys.`,
      });
      setBulkTagsDialogOpen(false);
      setSelectedKeys(new Set());
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to add tags',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Bulk remove tags mutation
  const bulkRemoveTagsMutation = trpc.dynamicKeys.bulkRemoveTags.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Tags removed',
        description: `Removed tags from ${result.success} keys.`,
      });
      setBulkTagsDialogOpen(false);
      setSelectedKeys(new Set());
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to remove tags',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleBulkExtend = (days: number) => {
    if (selectedKeys.size === 0) return;
    bulkExtendMutation.mutate({
      ids: Array.from(selectedKeys),
      days,
    });
  };

  const handleBulkToggleStatus = (enable: boolean) => {
    if (selectedKeys.size === 0) return;
    setBulkProgressTitle(enable ? 'Enabling Keys' : 'Disabling Keys');
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

  const dynamicKeys = data?.items || [];

  const handleCopyUrl = (dak: DAKData) => {
    if (dak.dynamicUrl) {
      const url = getSubscriptionUrl(dak.dynamicUrl);
      copyToClipboard(url);
    }
  };

  const handleShowQR = (dak: DAKData) => {
    setQrDialogDak(dak);
  };

  const handleDelete = (dak: DAKData) => {
    if (confirm(t('dynamic_keys.msg.confirm_delete'))) {
      deleteMutation.mutate({ id: dak.id });
    }
  };

  const handleToggleStatus = (dak: DAKData) => {
    setTogglingKeyId(dak.id);
    toggleStatusMutation.mutate({ id: dak.id });
  };

  const handleBulkDelete = () => {
    if (selectedKeys.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedKeys.size} keys?\n\nThis will also detach all associated access keys.`)) {
      bulkDeleteMutation.mutate({ ids: Array.from(selectedKeys) });
    }
  };

  const handleSelectAll = () => {
    if (selectedKeys.size === dynamicKeys.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(dynamicKeys.map((k) => k.id)));
    }
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
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      params.set('format', format);

      const response = await fetch(`/api/export-dynamic-keys?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dynamic-keys-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Export complete',
        description: `Dynamic keys exported as ${format.toUpperCase()}.`,
      });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Failed to export dynamic keys.',
        variant: 'destructive',
      });
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setTypeFilter('');
    setPage(1);
  };

  const hasActiveFilters = searchQuery || statusFilter || typeFilter;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('dynamic_keys.title')}</h1>
          <p className="text-muted-foreground">
            {t('dynamic_keys.desc')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link href="/dashboard/archived">
            <Button variant="outline" size="sm" className="h-8">
              <Archive className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('nav.archived') || 'Archived'}</span>
            </Button>
          </Link>
          <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="h-8">
            <Plus className="w-4 h-4 mr-2" />
            {t('dynamic_keys.create')}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('dynamic_keys.total_keys')}</p>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <p className="text-sm text-green-500">{t('dynamic_keys.active_keys')}</p>
            </div>
            <p className="text-2xl font-bold">{stats.active}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <div className="flex items-center gap-1">
                <p className="text-sm text-green-500">{t('dynamic_keys.online_users')}</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-3 h-3 text-green-500/50" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Users active within the last 30 seconds</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <p className="text-2xl font-bold">{onlineCount}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Shuffle className="w-4 h-4 text-purple-500" />
              <p className="text-sm text-purple-500">{t('dynamic_keys.type.self_managed')}</p>
            </div>
            <p className="text-2xl font-bold">{stats.selfManaged}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-500" />
              <p className="text-sm text-blue-500">{t('dynamic_keys.type.manual')}</p>
            </div>
            <p className="text-2xl font-bold">{stats.manual}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-primary" />
              <p className="text-sm text-muted-foreground">{t('dynamic_keys.total_usage')}</p>
            </div>
            <p className="text-2xl font-bold">{formatBytes(BigInt(stats.totalUsedBytes))}</p>
          </Card>
        </div>
      )}

      {/* Quick Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Quick filters:</span>
        <Button
          variant={filters.quickFilters.online ? 'default' : 'outline'}
          size="sm"
          className={cn('h-7 text-xs', filters.quickFilters.online && 'bg-green-600 hover:bg-green-700')}
          onClick={() => setQuickFilter('online', !filters.quickFilters.online)}
        >
          <Wifi className="w-3 h-3 mr-1" />
          Online
        </Button>
        <Button
          variant={filters.quickFilters.expiring7d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-7 text-xs', filters.quickFilters.expiring7d && 'bg-orange-600 hover:bg-orange-700')}
          onClick={() => setQuickFilter('expiring7d', !filters.quickFilters.expiring7d)}
        >
          <Clock className="w-3 h-3 mr-1" />
          Expiring &lt; 7d
        </Button>
        <Button
          variant={filters.quickFilters.overQuota ? 'default' : 'outline'}
          size="sm"
          className={cn('h-7 text-xs', filters.quickFilters.overQuota && 'bg-red-600 hover:bg-red-700')}
          onClick={() => setQuickFilter('overQuota', !filters.quickFilters.overQuota)}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          Over 80% Quota
        </Button>
        <Button
          variant={filters.quickFilters.inactive30d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-7 text-xs', filters.quickFilters.inactive30d && 'bg-gray-600 hover:bg-gray-700')}
          onClick={() => setQuickFilter('inactive30d', !filters.quickFilters.inactive30d)}
        >
          <EyeOff className="w-3 h-3 mr-1" />
          Inactive 30d
        </Button>
        
        {/* Tag filter */}
        <div className="flex items-center gap-1 ml-2">
          <Tag className="w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Filter by tag"
            value={filters.tagFilter || ''}
            onChange={(e) => setTagFilter(e.target.value || undefined)}
            className="h-7 w-28 text-xs"
          />
        </div>
        
        {/* Owner filter */}
        <div className="flex items-center gap-1">
          <User className="w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Filter by owner"
            value={filters.ownerFilter || ''}
            onChange={(e) => setOwnerFilter(e.target.value || undefined)}
            className="h-7 w-28 text-xs"
          />
        </div>

        {(filters.quickFilters.online || filters.quickFilters.expiring7d || filters.quickFilters.overQuota || filters.quickFilters.inactive30d || filters.tagFilter || filters.ownerFilter) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={clearPersistedFilters}
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('dynamic_keys.search_placeholder')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter || 'all'}
          onValueChange={(value) => {
            setStatusFilter(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('dynamic_keys.filter_status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('dynamic_keys.filter_status')}</SelectItem>
            <SelectItem value="ACTIVE">{t('dynamic_keys.status.active')}</SelectItem>
            <SelectItem value="PENDING">{t('dynamic_keys.status.pending')}</SelectItem>
            <SelectItem value="DEPLETED">{t('dynamic_keys.status.depleted')}</SelectItem>
            <SelectItem value="EXPIRED">{t('dynamic_keys.status.expired')}</SelectItem>
            <SelectItem value="DISABLED">{t('dynamic_keys.status.disabled')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={typeFilter || 'all'}
          onValueChange={(value) => {
            setTypeFilter(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t('dynamic_keys.filter_type')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('dynamic_keys.filter_type')}</SelectItem>
            <SelectItem value="SELF_MANAGED">{t('dynamic_keys.type.self_managed')}</SelectItem>
            <SelectItem value="MANUAL">{t('dynamic_keys.type.manual')}</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('json')}>
              <FileJson className="w-4 h-4 mr-2" />
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export as CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {/* Auto-sync selector */}
          <div className="flex items-center gap-1">
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', syncAllMutation.isPending && 'animate-spin')} />
            <Select
              value={autoRefresh.interval.toString()}
              onValueChange={(value) => autoRefresh.setInterval(parseInt(value))}
            >
              <SelectTrigger className="w-[80px] h-9">
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
              <span className="text-xs text-muted-foreground min-w-[24px]">
                {autoRefresh.countdown}s
              </span>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', syncAllMutation.isPending && 'animate-spin')} />
            {t('dynamic_keys.sync_servers')}
          </Button>

          {/* View mode toggle - visible on all screens */}
          <div className="flex items-center border rounded-lg p-0.5 bg-muted/50">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'group' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setViewMode('group')}
            >
              <ListTree className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedKeys.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
          <span className="text-sm font-medium">
            {selectedKeys.size} key{selectedKeys.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Enable/Disable dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkToggleStatusMutation.isPending}
                >
                  <Power className="w-4 h-4 mr-2" />
                  Enable/Disable
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleBulkToggleStatus(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                  Enable All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkToggleStatus(false)}>
                  <XCircle className="w-4 h-4 mr-2 text-orange-500" />
                  Disable All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Extend Expiry */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkExtendDialogOpen(true)}
            >
              <Clock className="w-4 h-4 mr-2" />
              Extend Expiry
            </Button>

            {/* Tags dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkAddTagsMutation.isPending || bulkRemoveTagsMutation.isPending}
                >
                  <Tag className="w-4 h-4 mr-2" />
                  Tags
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => {
                  setBulkTagsMode('add');
                  setBulkTagsDialogOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Tags
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setBulkTagsMode('remove');
                  setBulkTagsDialogOpen(true);
                }}>
                  <X className="w-4 h-4 mr-2" />
                  Remove Tags
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Delete */}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Selected
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedKeys(new Set())}
            className="ml-auto"
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Grid/Card View - show when viewMode is 'grid' */}
      {viewMode === 'grid' && (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="h-48 bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dynamicKeys.map((dak) => {
              const typeConfig = DAK_TYPES[dak.type];
              const config = statusConfig[dak.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
              const StatusIcon = config.icon;
              const isOnline = checkIsOnline(dak.id);
              const usagePercent = dak.dataLimitBytes
                ? Number((dak.usedBytes * BigInt(100)) / dak.dataLimitBytes)
                : 0;

              return (
                <Card key={dak.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {isOnline && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                          )}
                          <div>
                            <Link href={`/dashboard/dynamic-keys/${dak.id}`} className="font-medium hover:underline">
                              {dak.name}
                            </Link>
                            {dak.email && (
                              <p className="text-xs text-muted-foreground">{dak.email}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Last seen: {dak.firstUsedAt ? formatRelativeTime(dak.firstUsedAt) : 'Never'}
                            </p>
                            {dak.tags && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {dak.tags.split(',').filter(Boolean).map((tag) => (
                                  <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                                    {tag.trim()}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge className={cn('border', config.color)}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {t(config.labelKey)}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <typeConfig.icon className={cn('w-4 h-4', typeConfig.color)} />
                          <span className="text-sm">{t(typeConfig.labelKey)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>{0 || 0} devices</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <SegmentedUsageBarCompact
                          valueBytes={Number(dak.usedBytes)}
                          limitBytes={dak.dataLimitBytes ? Number(dak.dataLimitBytes) : undefined}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{dak.attachedKeysCount} keys attached</span>
                        <span className={cn('text-muted-foreground', dak.daysRemaining !== null && dak.daysRemaining <= 7 && 'text-red-500')}>
                          {dak.expiresAt
                            ? dak.daysRemaining !== null && dak.daysRemaining >= 0
                              ? `${dak.daysRemaining}d left`
                              : 'Expired'
                            : 'Never'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleShowQR(dak)}>
                            <QrCode className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyUrl(dak)}>
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
                              <Link href={`/dashboard/dynamic-keys/${dak.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                {t('dynamic_keys.detail.details')}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(dak)}>
                              <Power className="w-4 h-4 mr-2" />
                              {dak.status === 'DISABLED' ? 'Enable' : 'Disable'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(dak)} className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t('dynamic_keys.detail.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Group View */}
      {viewMode === 'group' && (
        <DynamicGroupList
          keys={dynamicKeys}
          onToggleStatus={(key) => handleToggleStatus(key)}
          onDelete={(key) => handleDelete(key)}
          onCopyUrl={(key) => handleCopyUrl(key)}
          onShowQR={(key) => handleShowQR(key)}
          isProcessingId={togglingKeyId}
        />
      )}

      {/* Mobile Card View for List Mode */}
      {viewMode === 'list' && (
        <MobileCardView
          className="md:hidden mb-6"
          data={dynamicKeys}
          renderCard={(dak) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {checkIsOnline(dak.id) && <OnlineIndicator isOnline={true} />}
                  <div>
                    <Link href={`/dashboard/dynamic-keys/${dak.id}`} className="font-medium hover:underline">
                      {dak.name}
                    </Link>
                    {dak.email && <p className="text-xs text-muted-foreground">{dak.email}</p>}
                    <p className="text-xs text-muted-foreground">
                      Last seen: {dak.firstUsedAt ? formatRelativeTime(dak.firstUsedAt) : 'Never'}
                    </p>
                    {dak.tags && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dak.tags.split(',').filter(Boolean).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Badge className={cn('border', (statusConfig[dak.status as keyof typeof statusConfig] || statusConfig.ACTIVE).color)}>
                  {dak.status}
                </Badge>
              </div>

              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <div className={cn('text-xs flex items-center gap-1', (DAK_TYPES[dak.type] || DAK_TYPES.MANUAL).color)}>
                    {(() => { const Icon = (DAK_TYPES[dak.type] || DAK_TYPES.MANUAL).icon; return <Icon className="w-3 h-3" />; })()}
                    {t((DAK_TYPES[dak.type] || DAK_TYPES.MANUAL).labelKey)}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Smartphone className="w-3 h-3" />
                  <span>{0 || 0}</span>
                </div>
              </div>

              <div className="space-y-1">
                <SegmentedUsageBarCompact
                  valueBytes={Number(dak.usedBytes)}
                  limitBytes={dak.dataLimitBytes ? Number(dak.dataLimitBytes) : undefined}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                <Button variant="ghost" size="sm" onClick={() => handleCopyUrl(dak)}><Copy className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => handleShowQR(dak)}><QrCode className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(dak)}><Power className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(dak)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
          keyExtractor={(item) => item.id}
        />
      )}


      <Card className={cn('mb-6', viewMode === 'list' ? 'hidden md:block' : 'hidden')}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-3 w-10">
                  <button
                    onClick={handleSelectAll}
                    className="p-1 hover:bg-muted rounded"
                    title={selectedKeys.size === dynamicKeys.length ? 'Deselect all' : 'Select all'}
                  >
                    {dynamicKeys.length > 0 && selectedKeys.size === dynamicKeys.length ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dynamic_keys.table.name')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dynamic_keys.table.type')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dynamic_keys.table.status')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dynamic_keys.table.usage')}</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-1">
                    <Smartphone className="w-3.5 h-3.5" />
                    Devices
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dynamic_keys.table.attached')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dynamic_keys.table.expires')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dynamic_keys.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3">
                      <div className="h-12 bg-muted rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : dynamicKeys.length > 0 ? (
                dynamicKeys.map((dak) => (
                  <DAKRow
                    key={dak.id}
                    dak={dak}
                    onCopyUrl={() => handleCopyUrl(dak)}
                    onShowQR={() => handleShowQR(dak)}
                    onDelete={() => handleDelete(dak)}
                    onToggleStatus={() => handleToggleStatus(dak)}
                    isSelected={selectedKeys.has(dak.id)}
                    onSelect={() => handleSelectKey(dak.id)}
                    isTogglingStatus={togglingKeyId === dak.id}
                    isOnline={checkIsOnline(dak.id)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <KeyRound className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">
                      {hasActiveFilters
                        ? t('dynamic_keys.empty_title')
                        : t('dynamic_keys.empty_title')}
                    </p>
                    {!hasActiveFilters && (
                      <Button
                        className="mt-4"
                        onClick={() => setCreateDialogOpen(true)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('dynamic_keys.create_btn')}
                      </Button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (kept simplified) */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1} to{' '}
              {Math.min(page * pageSize, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">
                Page {page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create dialog */}
      <CreateDAKDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => refetch()}
      />

      {/* QR Code dialog */}
      <QRCodeDialog
        dak={qrDialogDak}
        open={!!qrDialogDak}
        onOpenChange={(open) => !open && setQrDialogDak(null)}
      />

      {/* Bulk Extend dialog */}
      <BulkExtendDialog
        open={bulkExtendDialogOpen}
        onOpenChange={setBulkExtendDialogOpen}
        count={selectedKeys.size}
        onConfirm={handleBulkExtend}
        isPending={bulkExtendMutation.isPending}
      />

      {/* Bulk Tags dialog */}
      <BulkTagsDialog
        open={bulkTagsDialogOpen}
        onOpenChange={setBulkTagsDialogOpen}
        count={selectedKeys.size}
        mode={bulkTagsMode}
        onConfirm={handleBulkTags}
        isPending={bulkAddTagsMutation.isPending || bulkRemoveTagsMutation.isPending}
      />

      {/* Bulk Progress dialog */}
      <BulkProgressDialog
        open={bulkProgressDialogOpen}
        onOpenChange={setBulkProgressDialogOpen}
        title={bulkProgressTitle}
        results={bulkProgressResults}
        isPending={bulkToggleStatusMutation.isPending}
      />
    </div >
  );
}
