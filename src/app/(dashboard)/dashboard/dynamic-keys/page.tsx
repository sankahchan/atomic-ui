'use client';

/**
 * Dynamic Access Keys Page
 *
 * Dynamic Access Keys (DAK) represent one of the most powerful features of
 * Atomic-UI, borrowed from the x-ui project. Unlike regular access keys that
 * are tied to a specific server and Outline key ID, dynamic keys provide a
 * layer of abstraction that enables several advanced use cases.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Filter,
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

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

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
  telegramId?: string | null;
  notes?: string | null;
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
  durationDays?: number | null;
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
    loadBalancerAlgorithm: 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD';
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
    loadBalancerAlgorithm: 'IP_HASH',
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
      loadBalancerAlgorithm: 'IP_HASH',
    });
  };

  const createMutation = trpc.dynamicKeys.create.useMutation({
    onSuccess: (data) => {
      toast({
        title: t('dynamic_keys.msg.created'),
        description: t('dynamic_keys.msg.created_desc'),
      });
      onSuccess();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.msg.create_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('dynamic_keys.msg.validation'),
        description: t('dynamic_keys.msg.validation_name_desc'),
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
      loadBalancerAlgorithm: formData.loadBalancerAlgorithm,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    {t(config.descriptionKey)}
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
                <SelectValue placeholder={t('dynamic_keys.dialog.encryption_placeholder')} />
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
              {t('dynamic_keys.dialog.encryption_help')}
            </p>
          </div>

          {/* Load Balancer Algorithm */}
          <div className="space-y-2">
            <Label>{t('dynamic_keys.dialog.load_balancer')}</Label>
            <Select
              value={formData.loadBalancerAlgorithm}
              onValueChange={(value) => setFormData({ ...formData, loadBalancerAlgorithm: value as typeof formData.loadBalancerAlgorithm })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('dynamic_keys.dialog.load_balancer_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IP_HASH">{t('dynamic_keys.dialog.load_balancer.ip_hash')}</SelectItem>
                <SelectItem value="RANDOM">{t('dynamic_keys.dialog.load_balancer.random')}</SelectItem>
                <SelectItem value="ROUND_ROBIN">{t('dynamic_keys.dialog.load_balancer.round_robin')}</SelectItem>
                <SelectItem value="LEAST_LOAD">{t('dynamic_keys.dialog.load_balancer.least_load')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.loadBalancerAlgorithm === 'LEAST_LOAD'
                ? t('dynamic_keys.dialog.load_balancer_desc.least_load')
                : formData.loadBalancerAlgorithm === 'IP_HASH'
                ? t('dynamic_keys.dialog.load_balancer_desc.ip_hash')
                : formData.loadBalancerAlgorithm === 'ROUND_ROBIN'
                ? t('dynamic_keys.dialog.load_balancer_desc.round_robin')
                : t('dynamic_keys.dialog.load_balancer_desc.random')}
            </p>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dakEmail">{t('dynamic_keys.dialog.email')}</Label>
              <Input
                id="dakEmail"
                type="email"
                placeholder={t('dynamic_keys.dialog.email_placeholder')}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dakTelegram">{t('dynamic_keys.dialog.telegram')}</Label>
              <Input
                id="dakTelegram"
                placeholder={t('dynamic_keys.dialog.telegram_placeholder')}
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
              placeholder={t('dynamic_keys.dialog.data_limit_placeholder')}
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
              <Label>{t('dynamic_keys.dialog.reset_strategy')}</Label>
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
                  <SelectItem value="NEVER">{t('dynamic_keys.dialog.reset.never')}</SelectItem>
                  <SelectItem value="DAILY">{t('dynamic_keys.dialog.reset.daily')}</SelectItem>
                  <SelectItem value="WEEKLY">{t('dynamic_keys.dialog.reset.weekly')}</SelectItem>
                  <SelectItem value="MONTHLY">{t('dynamic_keys.dialog.reset.monthly')}</SelectItem>
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
                <SelectItem value="DURATION_FROM_CREATION">{t('dynamic_keys.dialog.expiration.duration_from_creation')}</SelectItem>
                <SelectItem value="START_ON_FIRST_USE">{t('dynamic_keys.dialog.expiration.start_on_first_use')}</SelectItem>
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
              placeholder={t('dynamic_keys.dialog.notes_placeholder')}
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
              <p className="text-muted-foreground text-sm">{t('dynamic_keys.dialog.generate_failed')}</p>
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
                {t('dynamic_keys.actions.copy_url')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (dak?.dynamicUrl) {
                    const ssconfUrl = getSsconfUrl(dak.dynamicUrl, dak.name);
                    copyToClipboard(ssconfUrl, t('dynamic_keys.msg.copied'), t('dynamic_keys.msg.ssconf_copied'));
                  }
                }}
              >
                <Link2 className="w-4 h-4 mr-2" />
                ssconf://
              </Button>
            </div>

            <div className="p-2 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">{t('dynamic_keys.detail.subscription_url')}:</p>
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
  const { t } = useLocale();

  if (!isOnline) return null;

  return (
    <span className="relative flex h-2 w-2 mr-2" title={t('dynamic_keys.online_active')}>
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
  const selectedLabel = count === 1 ? t('dynamic_keys.bulk.selected_singular') : t('dynamic_keys.bulk.selected_plural');

  const quickOptions = [7, 14, 30, 60, 90];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {t('dynamic_keys.bulk.extend_title')}
          </DialogTitle>
          <DialogDescription>
            {fillTemplate(
              t(count === 1 ? 'dynamic_keys.bulk.extend_desc_single' : 'dynamic_keys.bulk.extend_desc'),
              { count, items: selectedLabel },
            )}
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
              {t('dynamic_keys.bulk.custom')}
            </Button>
          </div>

          {useCustom && (
            <div className="space-y-2">
              <Label htmlFor="customDays">{t('dynamic_keys.bulk.custom_days')}</Label>
              <Input
                id="customDays"
                type="number"
                min="1"
                placeholder={t('dynamic_keys.bulk.custom_days_placeholder')}
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
            {fillTemplate(t('dynamic_keys.bulk.extend_confirm'), {
              days: useCustom ? (customDays || '0') : days,
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
  const selectedLabel = count === 1 ? t('dynamic_keys.bulk.selected_singular') : t('dynamic_keys.bulk.selected_plural');

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
            {mode === 'add' ? t('dynamic_keys.bulk.tags_add_title') : t('dynamic_keys.bulk.tags_remove_title')}
          </DialogTitle>
          <DialogDescription>
            {fillTemplate(
              t(mode === 'add' ? 'dynamic_keys.bulk.tags_add_desc' : 'dynamic_keys.bulk.tags_remove_desc'),
              { count, items: selectedLabel },
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tags">{t('dynamic_keys.bulk.tags_label')}</Label>
            <Input
              id="tags"
              placeholder={t('dynamic_keys.bulk.tags_placeholder')}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('dynamic_keys.bulk.tags_help')}
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
            {mode === 'add' ? t('dynamic_keys.bulk.add_tags') : t('dynamic_keys.bulk.remove_tags')}
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
  const { t } = useLocale();
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
              <p className="text-sm text-muted-foreground">{t('dynamic_keys.bulk.progress.processing')}</p>
            </div>
          ) : results ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-2xl font-bold text-green-500">{results.success}</p>
                  <p className="text-sm text-green-500">{t('dynamic_keys.bulk.progress.successful')}</p>
                </div>
                <div className="flex-1 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-2xl font-bold text-red-500">{results.failed}</p>
                  <p className="text-sm text-red-500">{t('dynamic_keys.bulk.progress.failed')}</p>
                </div>
              </div>

              {results.errors && results.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('dynamic_keys.bulk.progress.errors')}</p>
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
            {isPending ? t('dynamic_keys.bulk.progress.processing') : t('dynamic_keys.bulk.progress.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * EditDAKDialog Component - Inline edit dialog for dynamic keys
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
  const { t } = useLocale();
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
    });
  }, [dakData]);

  const updateMutation = trpc.dynamicKeys.update.useMutation({
    onSuccess: () => {
      toast({
        title: t('dynamic_keys.msg.updated'),
        description: t('dynamic_keys.msg.updated_desc'),
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.msg.update_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('dynamic_keys.msg.validation'),
        description: t('dynamic_keys.msg.validation_edit_name_desc'),
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
          <DialogTitle>{t('dynamic_keys.dialog.edit_title')}</DialogTitle>
          <DialogDescription>
            {t('dynamic_keys.dialog.edit_desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editName">{t('dynamic_keys.dialog.name')}</Label>
            <Input
              id="editName"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editEmail">{t('dynamic_keys.dialog.email')}</Label>
            <Input
              id="editEmail"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editTelegram">{t('dynamic_keys.dialog.telegram')}</Label>
            <Input
              id="editTelegram"
              value={formData.telegramId}
              onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editDataLimit">{t('dynamic_keys.dialog.data_limit')}</Label>
            <Input
              id="editDataLimit"
              type="number"
              placeholder={t('dynamic_keys.dialog.data_limit_placeholder')}
              value={formData.dataLimitGB}
              onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
              min="0"
              step="0.5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editDuration">{t('dynamic_keys.dialog.duration')}</Label>
            <Input
              id="editDuration"
              type="number"
              placeholder="30"
              value={formData.durationDays}
              onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
              min="1"
            />
            <p className="text-xs text-muted-foreground">
              {t('dynamic_keys.dialog.duration_help')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editExpiration">{t('dynamic_keys.dialog.expiration_date')}</Label>
            <Input
              id="editExpiration"
              type="date"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t('dynamic_keys.dialog.expiration_date_help')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editNotes">{t('dynamic_keys.dialog.notes')}</Label>
            <Input
              id="editNotes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <DialogFooter>
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
 * DAKRow Component - Table row for a dynamic key
 */
function DAKRow({
  dak,
  onCopyUrl,
  onShowQR,
  onDelete,
  onToggleStatus,
  onEdit,
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
  onEdit: () => void;
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
    <tr
      className={cn(
        'border-b border-border/50 transition-colors hover:bg-muted/35 dark:hover:bg-cyan-400/[0.04]',
        isSelected && 'bg-primary/8 dark:bg-cyan-400/[0.07]',
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
              href={`/dashboard/dynamic-keys/${dak.id}`}
              className="font-medium hover:text-primary transition-colors"
            >
              {dak.name}
            </Link>
            {dak.email && (
              <p className="text-xs text-muted-foreground">{dak.email}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('dynamic_keys.last_seen')} {dak.firstUsedAt ? formatRelativeTime(dak.firstUsedAt) : t('dynamic_keys.never_seen')}
            </p>
            {dak.tags && (
              <div className="flex flex-wrap gap-1 mt-1">
                {dak.tags.split(',').filter(Boolean).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-white/[0.03]"
                  >
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
            title={dak.status === 'DISABLED' ? t('dynamic_keys.actions.enable') : t('dynamic_keys.actions.disable')}
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
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                {t('dynamic_keys.actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShowQR}>
                <QrCode className="w-4 h-4 mr-2" />
                {t('dynamic_keys.detail.qr_code')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyUrl}>
                <Copy className="w-4 h-4 mr-2" />
                {t('dynamic_keys.actions.copy_url')}
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [qrDialogDak, setQrDialogDak] = useState<DAKData | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);
  const [editingDAK, setEditingDAK] = useState<{
    id: string;
    name: string;
    email: string | null;
    telegramId: string | null;
    notes: string | null;
    dataLimitBytes: bigint | null;
    durationDays: number | null;
    expiresAt: Date | null;
  } | null>(null);
  const syncAllRef = useRef<ReturnType<typeof trpc.servers.syncAll.useMutation> | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'group'>('list');
  const [exportingFormat, setExportingFormat] = useState<'json' | 'csv' | null>(null);
  const getItemLabel = useCallback(
    (count: number) => t(count === 1 ? 'dynamic_keys.bulk.item_singular' : 'dynamic_keys.bulk.item_plural'),
    [t],
  );
  const getSelectedLabel = useCallback(
    (count: number) => t(count === 1 ? 'dynamic_keys.bulk.selected_singular' : 'dynamic_keys.bulk.selected_plural'),
    [t],
  );

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

  const onlineKeyIds = useMemo(
    () => new Set((liveMetrics ?? []).filter((metric) => metric.isOnline).map((metric) => metric.id)),
    [liveMetrics],
  );
  const onlineCount = onlineKeyIds.size;

  // Helper to check if a DAK is online (disabled keys are never online)
  const checkIsOnline = (dakId: string, status?: string) => {
    if (status === 'DISABLED') return false;
    return onlineKeyIds.has(dakId);
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
        description: t('dynamic_keys.msg.deleted_desc'),
      });
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.msg.delete_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = trpc.dynamicKeys.toggleStatus.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.status === 'DISABLED' ? t('dynamic_keys.msg.status_disabled') : t('dynamic_keys.msg.status_enabled'),
        description: fillTemplate(t('dynamic_keys.msg.status_changed_desc'), {
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
        title: t('dynamic_keys.msg.status_change_failed'),
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
        title: t('dynamic_keys.msg.bulk_delete_complete'),
        description: fillTemplate(
          t(result.success === 1 ? 'dynamic_keys.msg.bulk_delete_complete_desc_single' : 'dynamic_keys.msg.bulk_delete_complete_desc'),
          { success: result.success, failed: result.failed },
        ),
      });
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.msg.bulk_delete_failed'),
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
        title: t('dynamic_keys.msg.extension_complete'),
        description: fillTemplate(
          t(result.success === 1 ? 'dynamic_keys.msg.extension_complete_desc_single' : 'dynamic_keys.msg.extension_complete_desc'),
          { success: result.success },
        ),
      });
      setBulkExtendDialogOpen(false);
      setSelectedKeys(new Set());
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.msg.extension_failed'),
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
        title: t('dynamic_keys.msg.bulk_status_failed'),
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
        title: t('dynamic_keys.msg.tags_added'),
        description: fillTemplate(
          t(result.success === 1 ? 'dynamic_keys.msg.tags_added_desc_single' : 'dynamic_keys.msg.tags_added_desc'),
          { success: result.success },
        ),
      });
      setBulkTagsDialogOpen(false);
      setSelectedKeys(new Set());
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.msg.add_tags_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Bulk remove tags mutation
  const bulkRemoveTagsMutation = trpc.dynamicKeys.bulkRemoveTags.useMutation({
    onSuccess: (result) => {
      toast({
        title: t('dynamic_keys.msg.tags_removed'),
        description: fillTemplate(
          t(result.success === 1 ? 'dynamic_keys.msg.tags_removed_desc_single' : 'dynamic_keys.msg.tags_removed_desc'),
          { success: result.success },
        ),
      });
      setBulkTagsDialogOpen(false);
      setSelectedKeys(new Set());
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('dynamic_keys.msg.remove_tags_failed'),
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
    setBulkProgressTitle(
      enable ? t('dynamic_keys.bulk.progress_title.enabling') : t('dynamic_keys.bulk.progress_title.disabling'),
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

  const dynamicKeys = data?.items || [];

  const handleCopyUrl = (dak: DAKData) => {
    if (dak.dynamicUrl) {
      const url = getSubscriptionUrl(dak.dynamicUrl);
      copyToClipboard(url, t('dynamic_keys.msg.copied'), t('dynamic_keys.msg.copy_url'));
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
    if (confirm(fillTemplate(t('dynamic_keys.bulk.delete_confirm'), {
      count: selectedKeys.size,
      items: getItemLabel(selectedKeys.size),
    }))) {
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
    setExportingFormat(format);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      params.set('format', format);

      const response = await fetch(`/api/export-dynamic-keys?${params.toString()}`);
      if (!response.ok) throw new Error(t('dynamic_keys.msg.export_failed'));

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
        title: t('dynamic_keys.msg.export_complete'),
        description: fillTemplate(t('dynamic_keys.msg.export_complete_desc'), {
          format: format.toUpperCase(),
        }),
      });
    } catch {
      toast({
        title: t('dynamic_keys.msg.export_failed'),
        description: t('dynamic_keys.msg.export_failed'),
        variant: 'destructive',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setTypeFilter('');
    setPage(1);
  };

  const hasPersistedFilters = Boolean(
    filters.quickFilters.online ||
    filters.quickFilters.expiring7d ||
    filters.quickFilters.overQuota ||
    filters.quickFilters.inactive30d ||
    filters.tagFilter ||
    filters.ownerFilter,
  );
  const hasActiveFilters = Boolean(searchQuery || statusFilter || typeFilter);
  const hasAnyFilters = hasActiveFilters || hasPersistedFilters;
  const isBulkBusy =
    bulkDeleteMutation.isPending ||
    bulkExtendMutation.isPending ||
    bulkToggleStatusMutation.isPending ||
    bulkAddTagsMutation.isPending ||
    bulkRemoveTagsMutation.isPending;
  const clearAllFilters = () => {
    clearFilters();
    clearPersistedFilters();
  };

  return (
    <div className="space-y-6">
      <section className="ops-showcase space-y-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-5">
            <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
              <KeyRound className="h-3.5 w-3.5" />
              {t('dynamic_keys.title')}
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">{t('dynamic_keys.title')}</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t('dynamic_keys.desc')}
              </p>
            </div>

            <div className="hidden sm:grid gap-3 lg:grid-cols-3 xl:max-w-3xl">
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('dynamic_keys.title')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('dynamic_keys.desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('dynamic_keys.type.self_managed')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('dynamic_keys.dialog.type.self_managed_desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.archived') || 'Archived'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('dynamic_keys.desc')}</p>
              </div>
            </div>
          </div>

          <div className="hidden xl:block">
            <div className="ops-panel space-y-3">
              <div>
                <p className="ops-section-heading">{t('dynamic_keys.title')}</p>
                <h2 className="mt-2 text-xl font-semibold">{t('dynamic_keys.title')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('dynamic_keys.desc')}</p>
              </div>
              <Button onClick={() => setCreateDialogOpen(true)} className="h-11 w-full justify-center rounded-full">
                <Plus className="w-4 h-4 mr-2" />
                {t('dynamic_keys.create')}
              </Button>
              <Button variant="outline" className="h-11 w-full justify-center rounded-full border-border/70 bg-background/70 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]" asChild>
                <Link href="/dashboard/archived">
                  <Archive className="w-4 h-4 mr-2" />
                  {t('nav.archived') || 'Archived'}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:hidden">
          <Button onClick={() => setCreateDialogOpen(true)} className="h-11 w-full justify-center rounded-full">
            <Plus className="w-4 h-4 mr-2" />
            {t('dynamic_keys.create')}
          </Button>
          <Button variant="outline" className="h-11 w-full justify-center rounded-full" asChild>
            <Link href="/dashboard/archived">
              <Archive className="w-4 h-4 mr-2" />
              {t('nav.archived') || 'Archived'}
            </Link>
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-background/50 dark:border-cyan-400/12 dark:bg-[linear-gradient(180deg,rgba(7,15,29,0.88),rgba(6,13,26,0.76))]">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t('dynamic_keys.total_keys')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.total}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-green-500/20 bg-green-500/10">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-sm font-medium text-green-500">{t('dynamic_keys.active_keys')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.active}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-green-500/20 bg-green-500/10">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-green-500">{t('dynamic_keys.online_users')}</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-3 w-3 text-green-500/50" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('dynamic_keys.online_tooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <p className="mt-4 text-2xl font-semibold">{onlineCount}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10">
                  <Shuffle className="h-4 w-4 text-purple-500" />
                </div>
                <p className="text-sm font-medium text-purple-500">{t('dynamic_keys.type.self_managed')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.selfManaged}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10">
                  <Settings className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-blue-500">{t('dynamic_keys.type.manual')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.manual}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                  <HardDrive className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t('dynamic_keys.total_usage')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{formatBytes(BigInt(stats.totalUsedBytes))}</p>
            </div>
          </div>
        )}
      </section>

      <div className="space-y-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('dynamic_keys.search_placeholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 pl-9 shadow-none dark:bg-[rgba(4,10,20,0.72)]"
            />
          </div>
          <Button
            variant={hasAnyFilters ? 'default' : 'outline'}
            size="sm"
            className="h-11 shrink-0 rounded-[1.15rem] px-4"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {t('dynamic_keys.mobile_filters')}
          </Button>
        </div>

        <div className="ops-table-toolbar md:hidden">
          <div className="flex flex-1 items-center justify-center rounded-[1rem] border border-border/70 bg-background/55 p-0.5 dark:bg-[rgba(4,10,20,0.72)]">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 flex-1 rounded-[0.85rem] px-2"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 flex-1 rounded-[0.85rem] px-2"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'group' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 flex-1 rounded-[0.85rem] px-2"
              onClick={() => setViewMode('group')}
            >
              <ListTree className="w-4 h-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            className="h-10 flex-1 rounded-[1rem]"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', syncAllMutation.isPending && 'animate-spin')} />
            {syncAllMutation.isPending ? t('dynamic_keys.syncing') : t('dynamic_keys.sync_servers')}
          </Button>
        </div>

        {(autoRefresh.isActive || hasAnyFilters) && (
          <div className="ops-table-meta">
            {autoRefresh.isActive ? (
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                {t('dynamic_keys.refresh_interval')}: {autoRefresh.countdown}s
              </span>
            ) : null}
            {hasAnyFilters ? (
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={clearAllFilters}>
                <X className="w-3 h-3 mr-1" />
                {t('keys.clear_filters')}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Quick Filter Pills */}
      <div className="ops-table-meta hidden md:flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">{t('dynamic_keys.quick_filters.label')}:</span>
        <Button
          variant={filters.quickFilters.online ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full text-xs', filters.quickFilters.online && 'bg-green-600 hover:bg-green-700')}
          onClick={() => setQuickFilter('online', !filters.quickFilters.online)}
        >
          <Wifi className="w-3 h-3 mr-1" />
          {t('dynamic_keys.quick_filters.online')}
        </Button>
        <Button
          variant={filters.quickFilters.expiring7d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full text-xs', filters.quickFilters.expiring7d && 'bg-orange-600 hover:bg-orange-700')}
          onClick={() => setQuickFilter('expiring7d', !filters.quickFilters.expiring7d)}
        >
          <Clock className="w-3 h-3 mr-1" />
          {t('dynamic_keys.quick_filters.expiring7d')}
        </Button>
        <Button
          variant={filters.quickFilters.overQuota ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full text-xs', filters.quickFilters.overQuota && 'bg-red-600 hover:bg-red-700')}
          onClick={() => setQuickFilter('overQuota', !filters.quickFilters.overQuota)}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          {t('dynamic_keys.quick_filters.over_quota')}
        </Button>
        <Button
          variant={filters.quickFilters.inactive30d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full text-xs', filters.quickFilters.inactive30d && 'bg-gray-600 hover:bg-gray-700')}
          onClick={() => setQuickFilter('inactive30d', !filters.quickFilters.inactive30d)}
        >
          <EyeOff className="w-3 h-3 mr-1" />
          {t('dynamic_keys.quick_filters.inactive30d')}
        </Button>
        
        {/* Tag filter */}
        <div className="ml-2 flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-1 dark:bg-white/[0.02]">
          <Tag className="w-3 h-3 text-muted-foreground" />
          <Input
            placeholder={t('dynamic_keys.quick_filters.tag_placeholder')}
            value={filters.tagFilter || ''}
            onChange={(e) => setTagFilter(e.target.value || undefined)}
            className="h-6 w-28 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        
        {/* Owner filter */}
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-1 dark:bg-white/[0.02]">
          <User className="w-3 h-3 text-muted-foreground" />
          <Input
            placeholder={t('dynamic_keys.quick_filters.owner_placeholder')}
            value={filters.ownerFilter || ''}
            onChange={(e) => setOwnerFilter(e.target.value || undefined)}
            className="h-6 w-28 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
          />
        </div>

        {(filters.quickFilters.online || filters.quickFilters.expiring7d || filters.quickFilters.overQuota || filters.quickFilters.inactive30d || filters.tagFilter || filters.ownerFilter) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full text-xs"
            onClick={clearPersistedFilters}
          >
            <X className="w-3 h-3 mr-1" />
            {t('keys.clear_filters')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="ops-table-toolbar hidden md:flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('dynamic_keys.search_placeholder')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-[1.15rem] border-border/70 bg-background/70 pl-9 shadow-none dark:bg-[rgba(4,10,20,0.72)]"
          />
        </div>

        <Select
          value={statusFilter || 'all'}
          onValueChange={(value) => {
            setStatusFilter(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-11 w-[140px] rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]">
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
          <SelectTrigger className="h-11 w-[150px] rounded-[1.15rem] border-border/70 bg-background/70 dark:bg-[rgba(4,10,20,0.72)]">
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
            className="rounded-full"
            onClick={clearFilters}
          >
            <X className="w-4 h-4 mr-1" />
            {t('keys.clear_filters')}
          </Button>
        )}

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-11 rounded-[1.15rem] px-4" disabled={!!exportingFormat}>
              {exportingFormat ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {exportingFormat
                ? fillTemplate(t('dynamic_keys.exporting'), { format: exportingFormat.toUpperCase() })
                : t('dynamic_keys.export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('json')} disabled={!!exportingFormat}>
              <FileJson className="w-4 h-4 mr-2" />
              {t('dynamic_keys.export_json')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')} disabled={!!exportingFormat}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              {t('dynamic_keys.export_csv')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {/* Auto-sync selector */}
          <div className="flex items-center gap-1 rounded-[1.05rem] border border-border/60 bg-background/60 px-2 py-1 dark:bg-white/[0.02]">
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', syncAllMutation.isPending && 'animate-spin')} />
            <Select
              value={autoRefresh.interval.toString()}
              onValueChange={(value) => autoRefresh.setInterval(parseInt(value))}
            >
              <SelectTrigger className="h-9 w-[80px] border-0 bg-transparent shadow-none focus:ring-0">
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
            className="h-11 rounded-[1.15rem] px-4"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', syncAllMutation.isPending && 'animate-spin')} />
            {syncAllMutation.isPending ? t('dynamic_keys.syncing') : t('dynamic_keys.sync_servers')}
          </Button>

          {/* View mode toggle - visible on all screens */}
          <div className="flex items-center rounded-[1rem] border border-border/70 bg-background/55 p-0.5 dark:bg-[rgba(4,10,20,0.72)]">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 rounded-[0.85rem] px-2"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 rounded-[0.85rem] px-2"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'group' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 rounded-[0.85rem] px-2"
              onClick={() => setViewMode('group')}
            >
              <ListTree className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('dynamic_keys.mobile_filters')}</DialogTitle>
            <DialogDescription>{t('dynamic_keys.mobile_filters_desc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('dynamic_keys.filter_status')}</Label>
                <Select
                  value={statusFilter || 'all'}
                  onValueChange={(value) => {
                    setStatusFilter(value === 'all' ? '' : value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
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
              </div>

              <div className="space-y-2">
                <Label>{t('dynamic_keys.filter_type')}</Label>
                <Select
                  value={typeFilter || 'all'}
                  onValueChange={(value) => {
                    setTypeFilter(value === 'all' ? '' : value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('dynamic_keys.filter_type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('dynamic_keys.filter_type')}</SelectItem>
                    <SelectItem value="SELF_MANAGED">{t('dynamic_keys.type.self_managed')}</SelectItem>
                    <SelectItem value="MANUAL">{t('dynamic_keys.type.manual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('dynamic_keys.quick_filters.label')}</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filters.quickFilters.online ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.online && 'bg-green-600 hover:bg-green-700')}
                  onClick={() => setQuickFilter('online', !filters.quickFilters.online)}
                >
                  <Wifi className="w-3 h-3 mr-1" />
                  {t('dynamic_keys.quick_filters.online')}
                </Button>
                <Button
                  variant={filters.quickFilters.expiring7d ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.expiring7d && 'bg-orange-600 hover:bg-orange-700')}
                  onClick={() => setQuickFilter('expiring7d', !filters.quickFilters.expiring7d)}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  {t('dynamic_keys.quick_filters.expiring7d')}
                </Button>
                <Button
                  variant={filters.quickFilters.overQuota ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.overQuota && 'bg-red-600 hover:bg-red-700')}
                  onClick={() => setQuickFilter('overQuota', !filters.quickFilters.overQuota)}
                >
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {t('dynamic_keys.quick_filters.over_quota')}
                </Button>
                <Button
                  variant={filters.quickFilters.inactive30d ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.inactive30d && 'bg-gray-600 hover:bg-gray-700')}
                  onClick={() => setQuickFilter('inactive30d', !filters.quickFilters.inactive30d)}
                >
                  <EyeOff className="w-3 h-3 mr-1" />
                  {t('dynamic_keys.quick_filters.inactive30d')}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mobile-dak-tag-filter">{t('dynamic_keys.quick_filters.tag')}</Label>
                <Input
                  id="mobile-dak-tag-filter"
                  placeholder={t('dynamic_keys.quick_filters.tag_placeholder')}
                  value={filters.tagFilter || ''}
                  onChange={(e) => setTagFilter(e.target.value || undefined)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile-dak-owner-filter">{t('dynamic_keys.quick_filters.owner')}</Label>
                <Input
                  id="mobile-dak-owner-filter"
                  placeholder={t('dynamic_keys.quick_filters.owner_placeholder')}
                  value={filters.ownerFilter || ''}
                  onChange={(e) => setOwnerFilter(e.target.value || undefined)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('dynamic_keys.refresh_interval')}</Label>
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
                {t('dynamic_keys.export_json')}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport('csv')}
                disabled={!!exportingFormat}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {t('dynamic_keys.export_csv')}
              </Button>
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 gap-2 border-t bg-background pt-4 sm:gap-0">
            <Button variant="outline" onClick={clearAllFilters}>
              <X className="w-4 h-4 mr-2" />
              {t('keys.clear_filters')}
            </Button>
            <Button onClick={() => setMobileFiltersOpen(false)}>{t('dynamic_keys.dialog.cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk actions bar */}
      {selectedKeys.size > 0 && (
        <div className="ops-mobile-action-bar sticky bottom-4 z-20 flex flex-col gap-3 border-primary/20 bg-primary/6 p-3 shadow-[0_18px_36px_rgba(1,6,20,0.34)] sm:flex-row sm:items-center sm:gap-4">
          <span className="text-sm font-medium">
            {selectedKeys.size} {getSelectedLabel(selectedKeys.size)}
          </span>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {/* Enable/Disable dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkToggleStatusMutation.isPending}
                >
                  {bulkToggleStatusMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Power className="w-4 h-4 mr-2" />
                  )}
                  {t('dynamic_keys.bulk.enable_disable')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleBulkToggleStatus(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                  {t('dynamic_keys.bulk.enable_all')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkToggleStatus(false)}>
                  <XCircle className="w-4 h-4 mr-2 text-orange-500" />
                  {t('dynamic_keys.bulk.disable_all')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Extend Expiry */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkExtendDialogOpen(true)}
              disabled={isBulkBusy}
            >
              {bulkExtendMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
              {t('dynamic_keys.bulk.extend_expiry')}
            </Button>

            {/* Tags dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkAddTagsMutation.isPending || bulkRemoveTagsMutation.isPending}
                >
                  {bulkAddTagsMutation.isPending || bulkRemoveTagsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Tag className="w-4 h-4 mr-2" />
                  )}
                  {t('dynamic_keys.bulk.tags')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => {
                  setBulkTagsMode('add');
                  setBulkTagsDialogOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('dynamic_keys.bulk.add_tags')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setBulkTagsMode('remove');
                  setBulkTagsDialogOpen(true);
                }}>
                  <X className="w-4 h-4 mr-2" />
                  {t('dynamic_keys.bulk.remove_tags')}
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
              {t('dynamic_keys.bulk.delete_selected')}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedKeys(new Set())}
            className="w-full rounded-full sm:ml-auto sm:w-auto"
            disabled={isBulkBusy}
          >
            {t('dynamic_keys.clear_selection')}
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
                              {t('dynamic_keys.last_seen')} {dak.firstUsedAt ? formatRelativeTime(dak.firstUsedAt) : t('dynamic_keys.never_seen')}
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
                          <span>{0 || 0} {t('dynamic_keys.devices_count')}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <SegmentedUsageBarCompact
                          valueBytes={Number(dak.usedBytes)}
                          limitBytes={dak.dataLimitBytes ? Number(dak.dataLimitBytes) : undefined}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{dak.attachedKeysCount} {t('dynamic_keys.mobile.attached_keys').toLowerCase()}</span>
                        <span className={cn('text-muted-foreground', dak.daysRemaining !== null && dak.daysRemaining <= 7 && 'text-red-500')}>
                          {dak.expiresAt
                            ? dak.daysRemaining !== null && dak.daysRemaining >= 0
                              ? `${dak.daysRemaining}${t('dynamic_keys.expires.days_left')}`
                              : t('dynamic_keys.expires.expired')
                            : t('dynamic_keys.expires.never')}
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
                  {t('dynamic_keys.actions.details')}
                </Link>
              </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingDAK({
                              id: dak.id,
                              name: dak.name,
                              email: dak.email ?? null,
                              telegramId: dak.telegramId ?? null,
                              notes: dak.notes ?? null,
                              dataLimitBytes: dak.dataLimitBytes,
                              durationDays: (dak as DAKData).durationDays ?? null,
                              expiresAt: dak.expiresAt ?? null,
                            })}>
                              <Pencil className="w-4 h-4 mr-2" />
                              {t('dynamic_keys.actions.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(dak)}>
                              <Power className="w-4 h-4 mr-2" />
                              {dak.status === 'DISABLED' ? t('dynamic_keys.actions.enable') : t('dynamic_keys.actions.disable')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(dak)} className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t('dynamic_keys.actions.delete')}
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
          onEdit={(key) => setEditingDAK({
            id: key.id,
            name: key.name,
            email: key.email ?? null,
            telegramId: key.telegramId ?? null,
            notes: key.notes ?? null,
            dataLimitBytes: key.dataLimitBytes,
            durationDays: key.durationDays ?? null,
            expiresAt: key.expiresAt ?? null,
          })}
          isProcessingId={togglingKeyId}
        />
      )}

      {/* Mobile Card View for List Mode */}
      {viewMode === 'list' && (
        <MobileCardView
          className="md:hidden mb-6"
          data={dynamicKeys}
          renderCard={(dak) => {
            const online = checkIsOnline(dak.id);
            const typeConfig = DAK_TYPES[dak.type] || DAK_TYPES.MANUAL;
            const statusBadgeConfig = statusConfig[dak.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
            const tags = typeof dak.tags === 'string'
              ? dak.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
              : [];

            return (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2">
                    {online ? <OnlineIndicator isOnline={true} /> : null}
                    <div className="min-w-0">
                      <Link href={`/dashboard/dynamic-keys/${dak.id}`} className="block truncate font-medium hover:underline">
                        {dak.name}
                      </Link>
                      {dak.email ? <p className="truncate text-xs text-muted-foreground">{dak.email}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('dynamic_keys.last_seen')} {dak.firstUsedAt ? formatRelativeTime(dak.firstUsedAt) : t('dynamic_keys.never_seen')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className={cn('border', statusBadgeConfig.color)}>
                      {t(statusBadgeConfig.labelKey)}
                    </Badge>
                    <Badge variant="outline" className={cn('border', typeConfig.bgColor, typeConfig.color)}>
                      <typeConfig.icon className="mr-1 h-3 w-3" />
                      {t(typeConfig.labelKey)}
                    </Badge>
                  </div>
                </div>

                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {tag}
                      </span>
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
                    <span className="text-muted-foreground">{t('dynamic_keys.total_usage')}</span>
                    <span className="font-medium">
                      {formatBytes(BigInt(dak.usedBytes ?? 0))}
                      {dak.dataLimitBytes ? ` / ${formatBytes(BigInt(dak.dataLimitBytes))}` : ''}
                    </span>
                  </div>
                  <SegmentedUsageBarCompact
                    valueBytes={Number(dak.usedBytes)}
                    limitBytes={dak.dataLimitBytes ? Number(dak.dataLimitBytes) : undefined}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="ops-row-card">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('dynamic_keys.mobile.attached_keys')}</p>
                    <p className="mt-1 text-sm font-medium">{dak.attachedKeysCount}</p>
                  </div>
                  <div className="ops-row-card">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('dynamic_keys.mobile.expires')}</p>
                    <p className={cn('mt-1 text-sm font-medium', dak.daysRemaining != null && dak.daysRemaining <= 3 && 'text-orange-500')}>
                      {dak.expiresAt ? formatRelativeTime(dak.expiresAt) : t('dynamic_keys.expires.never')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-t border-border/50 pt-2">
                  <Button asChild variant="outline" size="sm" className="justify-center">
                    <Link href={`/dashboard/dynamic-keys/${dak.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t('dynamic_keys.actions.details')}
                    </Link>
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleCopyUrl(dak)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleShowQR(dak)}>
                    <QrCode className="w-4 h-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingDAK({
                        id: dak.id,
                        name: dak.name,
                        email: dak.email ?? null,
                        telegramId: dak.telegramId ?? null,
                        notes: dak.notes ?? null,
                        dataLimitBytes: dak.dataLimitBytes,
                        durationDays: (dak as DAKData).durationDays ?? null,
                        expiresAt: dak.expiresAt ?? null,
                      })}>
                        <Pencil className="w-4 h-4 mr-2" />
                        {t('dynamic_keys.actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(dak)}>
                        <Power className="w-4 h-4 mr-2" />
                        {dak.status === 'DISABLED' ? t('dynamic_keys.actions.enable') : t('dynamic_keys.actions.disable')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(dak)} className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('dynamic_keys.actions.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          }}
          keyExtractor={(item) => item.id}
        />
      )}


      <Card className={cn('ops-data-shell mb-6 overflow-hidden', viewMode === 'list' ? 'hidden md:block' : 'hidden')}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60 bg-background/55 text-left align-middle backdrop-blur-sm dark:bg-[rgba(4,10,21,0.72)]">
                <th className="px-2 py-3 w-10">
                  <button
                    onClick={handleSelectAll}
                    className="p-1 hover:bg-muted rounded"
                    title={selectedKeys.size === dynamicKeys.length ? t('dynamic_keys.deselect_all') : t('dynamic_keys.select_all')}
                  >
                    {dynamicKeys.length > 0 && selectedKeys.size === dynamicKeys.length ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.name')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.type')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.status')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.usage')}</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <div className="flex items-center justify-center gap-1">
                    <Smartphone className="w-3.5 h-3.5" />
                    {t('dynamic_keys.devices')}
                  </div>
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.attached')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.expires')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dynamic_keys.table.actions')}</th>
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
              ) : dynamicKeys.length > 0 ? (
                dynamicKeys.map((dak) => (
                  <DAKRow
                    key={dak.id}
                    dak={dak}
                    onCopyUrl={() => handleCopyUrl(dak)}
                    onShowQR={() => handleShowQR(dak)}
                    onDelete={() => handleDelete(dak)}
                    onToggleStatus={() => handleToggleStatus(dak)}
                    onEdit={() => setEditingDAK({
                      id: dak.id,
                      name: dak.name,
                      email: dak.email ?? null,
                      telegramId: dak.telegramId ?? null,
                      notes: dak.notes ?? null,
                      dataLimitBytes: dak.dataLimitBytes,
                      durationDays: (dak as DAKData).durationDays ?? null,
                      expiresAt: dak.expiresAt ?? null,
                    })}
                    isSelected={selectedKeys.has(dak.id)}
                    onSelect={() => handleSelectKey(dak.id)}
                    isTogglingStatus={togglingKeyId === dak.id}
                    isOnline={checkIsOnline(dak.id)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-10">
                    <div className="ops-chart-empty">
                      <KeyRound className="mb-3 h-10 w-10 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        {hasActiveFilters
                          ? t('dynamic_keys.empty_title')
                          : t('dynamic_keys.empty_title')}
                      </p>
                      {!hasActiveFilters && (
                        <Button
                          className="mt-4 rounded-full"
                          onClick={() => setCreateDialogOpen(true)}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          {t('dynamic_keys.create_btn')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (kept simplified) */}
        {data && data.totalPages > 1 && (
          <div className="ops-table-toolbar rounded-none border-x-0 border-b-0 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {t('dynamic_keys.pagination.showing')} {(page - 1) * pageSize + 1} {t('dynamic_keys.pagination.to')}{' '}
              {Math.min(page * pageSize, data.total)} {t('dynamic_keys.pagination.of')} {data.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">
                {t('dynamic_keys.pagination.page')} {page} {t('dynamic_keys.pagination.of_pages')} {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
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

      {/* Edit DAK dialog */}
      {editingDAK && (
        <EditDAKDialog
          open={!!editingDAK}
          onOpenChange={(open) => !open && setEditingDAK(null)}
          dakData={editingDAK}
          onSuccess={() => {
            refetch();
            setEditingDAK(null);
          }}
        />
      )}
    </div >
  );
}
