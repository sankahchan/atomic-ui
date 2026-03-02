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
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SegmentedUsageBarCompact } from '@/components/ui/segmented-usage-bar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { cn, formatBytes, formatRelativeTime, formatDateTime, getCountryFlag } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import { useKeyActivity } from '@/hooks/use-key-activity';
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
  Calendar,
  FileText,
  Archive,
  List as ListIcon,
  Tag,
  User,
  LinkIcon as LinkCopy,
  Pencil,
  ArrowRightLeft,
} from 'lucide-react';
import { MobileCardView } from '@/components/mobile-card-view';
import { TrafficSparkline } from '@/components/ui/traffic-chart';
import { ServerGroupList } from '@/components/keys/server-group-list';
import { copyToClipboard } from '@/lib/clipboard';
import { QRCodeWithLogo } from '@/components/qr-code-with-logo';
import { usePersistedFilters } from '@/hooks/use-persisted-filters';

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
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<{
    serverId: string;
    name: string;
    email: string;
    telegramId: string;
    notes: string;
    dataLimitGB: string;
    dataLimitResetStrategy: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER';
    expirationType: 'NEVER' | 'FIXED_DATE' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE';
    durationDays: string;
    method: string;
    userId: string;
    templateId: string;
  }>({
    serverId: '',
    name: '',
    email: '',
    telegramId: '',
    notes: '',
    dataLimitGB: '',
    dataLimitResetStrategy: 'NEVER',
    expirationType: 'NEVER',
    durationDays: '',
    method: 'chacha20-ietf-poly1305',
    userId: 'unassigned', // Use 'unassigned' to represent null/undefined in Select
    templateId: 'none',
  });

  // Fetch templates
  const { data: templates } = trpc.templates.list.useQuery();

  // Fetch servers for selection
  const { data: servers } = trpc.servers.list.useQuery();
  // Fetch users for assignment
  const { data: users } = trpc.users.list.useQuery();
  const { t } = useLocale();

  // Create key mutation
  const createMutation = trpc.keys.create.useMutation({
    onSuccess: () => {
      toast({
        title: 'Access key created',
        description: 'The new access key has been created successfully.',
      });
      onSuccess();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: 'Failed to create key',
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
      serverId: '',
      name: '',
      email: '',
      telegramId: '',
      notes: '',
      dataLimitGB: '',
      dataLimitResetStrategy: 'NEVER',
      expirationType: 'NEVER',
      durationDays: '',
      method: 'chacha20-ietf-poly1305',
      userId: 'unassigned',
      templateId: 'none',
    });
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

  const applyTemplate = (template: any) => {
    setFormData(prev => ({
      ...prev,
      namePrefix: template.namePrefix || prev.name, // We'll handle prefix logic in render or submission if needed, but for now just storing it might be tricky. Actually, if it's a prefix, we might want to auto-generate a name.
      // Let's just update the fields that map directly
      dataLimitGB: template.dataLimitGB ? (Number(template.dataLimitBytes) / (1024 * 1024 * 1024)).toString() : '',
      dataLimitResetStrategy: template.dataLimitResetStrategy as any,
      expirationType: template.expirationType as any,
      durationDays: template.durationDays?.toString() || '',
      method: template.method,
      notes: template.notes || '',
      serverId: template.serverId || prev.serverId,
    }));

    // Auto-generate name if prefix exists
    if (template.namePrefix) {
      // Simple random suffix for now, user can edit
      const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      setFormData(prev => ({ ...prev, name: `${template.namePrefix}${randomSuffix}` }));
    }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.serverId || !formData.name) {
      toast({
        title: 'Validation error',
        description: 'Please select a server and enter a name.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      serverId: formData.serverId,
      name: formData.name,
      email: formData.email || undefined,
      telegramId: formData.telegramId || undefined,
      notes: formData.notes || undefined,
      dataLimitGB: formData.dataLimitGB ? parseFloat(formData.dataLimitGB) : undefined,
      dataLimitResetStrategy: formData.dataLimitResetStrategy,
      expirationType: formData.expirationType,
      durationDays: formData.durationDays ? parseInt(formData.durationDays) : undefined,
      method: formData.method as 'chacha20-ietf-poly1305' | 'aes-128-gcm' | 'aes-192-gcm' | 'aes-256-gcm',
      userId: formData.userId !== 'unassigned' ? formData.userId : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            {t('keys.dialog.create.title')}
          </DialogTitle>
          <DialogDescription>
            {t('keys.dialog.create.desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Apply Template</Label>
            <Select
              value={formData.templateId}
              onValueChange={handleTemplateChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {templates?.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-border pt-4"></div>

          {/* Server selection */}
          <div className="space-y-2">
            <Label>{t('keys.form.server')} *</Label>
            <Select
              value={formData.serverId}
              onValueChange={(value) => setFormData({ ...formData, serverId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a server" />
              </SelectTrigger>
              <SelectContent>
                {servers?.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.countryCode && getCountryFlag(server.countryCode)}{' '}
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Key name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('keys.form.name')} *</Label>
            <Input
              id="name"
              placeholder="e.g., John's Phone"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* User Assignment */}
          <div className="space-y-2">
            <Label>Assign to User (Optional)</Label>
            <Select
              value={formData.userId}
              onValueChange={(value) => setFormData({ ...formData, userId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned (Admin only)</SelectItem>
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
              <Label htmlFor="email">{t('keys.form.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegramId">{t('keys.form.telegram')}</Label>
              <Input
                id="telegramId"
                placeholder="@username or ID"
                value={formData.telegramId}
                onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
              />
            </div>
          </div>

          {/* Data limit */}
          <div className="space-y-2">
            <Label htmlFor="dataLimit">{t('keys.form.data_limit')}</Label>
            <Input
              id="dataLimit"
              type="number"
              placeholder="Leave empty for unlimited"
              value={formData.dataLimitGB}
              onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
              min="0"
              step="0.5"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for unlimited data usage.
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
                <SelectItem value="DURATION_FROM_CREATION">Duration from creation</SelectItem>
                <SelectItem value="START_ON_FIRST_USE">Start on first use</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Duration days (conditional) */}
          {(formData.expirationType === 'DURATION_FROM_CREATION' ||
            formData.expirationType === 'START_ON_FIRST_USE') && (
              <div className="space-y-2">
                <Label htmlFor="durationDays">Duration (days)</Label>
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

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t('keys.form.notes')}</Label>
            <Input
              id="notes"
              placeholder="Optional notes about this key"
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
              {t('keys.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
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
  const { t } = useLocale();

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
      await copyToClipboard(keyData.accessUrl);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Code: {keyName}</DialogTitle>
          <DialogDescription>
            Scan this code with a Shadowsocks client to connect.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          {isLoading ? (
            <div className="w-[200px] h-[200px] bg-muted rounded-lg animate-pulse" />
          ) : data?.qrCode ? (
            <QRCodeWithLogo
              dataUrl={data.qrCode}
              size={200}
            />
          ) : (
            <div className="w-[200px] h-[200px] bg-muted rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground text-sm">Failed to load</p>
            </div>
          )}

          {keyData?.accessUrl && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={handleCopyUrl}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Access URL
            </Button>
          )}
        </div>
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
  const { t } = useLocale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('keys.delete_title') || 'Delete Access Key'}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{keyName}&quot;?
            <br />
            {t('keys.confirm_delete_desc') || 'This action cannot be undone. The key will be permanently removed from the server.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('keys.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('keys.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/**
 * BulkExtendDialog Component
 *
 * A dialog for extending the expiration of multiple keys.
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
            {t('keys.cancel')}
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
            {t('keys.cancel')}
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
    });
  }, [keyData]);

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
 * KeyRow Component
 *
 * Displays a single access key in the table with its metrics and actions.
 */
function KeyRow({
  accessKey,
  onDelete,
  onShowQR,
  onToggleStatus,
  isSelected,
  onSelect,
  isTogglingStatus,
  isOnline,
  onCopyAccessUrl,
  onCopySubscriptionUrl,
  onEdit,
  sparklineData,
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
    lastUsedAt?: Date | null;
    tags?: string | null;
    server?: {
      id: string;
      name: string;
      countryCode: string | null;
    };
    createdAt: Date;
  };
  onDelete: () => void;
  onShowQR: () => void;
  onToggleStatus: () => void;
  isSelected: boolean;
  onSelect: () => void;
  isTogglingStatus: boolean;
  isOnline: boolean;
  onCopyAccessUrl: () => void;
  onCopySubscriptionUrl: () => void;
  onEdit: () => void;
  sparklineData?: { date: string; bytes: number }[];
}) {
  const { t } = useLocale();
  const config = statusConfig[accessKey.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
  const StatusIcon = config.icon;

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
              href={`/dashboard/keys/${accessKey.id}`}
              className="font-medium hover:text-primary transition-colors"
            >
              {accessKey.name}
            </Link>
            {accessKey.email && (
              <p className="text-xs text-muted-foreground">{accessKey.email}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Last seen: {accessKey.lastUsedAt ? formatRelativeTime(accessKey.lastUsedAt) : 'Never'}
            </p>
            {accessKey.tags && (
              <div className="flex flex-wrap gap-1 mt-1">
                {accessKey.tags.split(',').filter(Boolean).map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                    {tag.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Server */}
      <td className="px-4 py-3">
        {accessKey.server && (
          <Link
            href={`/dashboard/servers/${accessKey.server.id}`}
            className="flex items-center gap-1.5 hover:text-primary transition-colors"
          >
            {accessKey.server.countryCode && (
              <span>{getCountryFlag(accessKey.server.countryCode)}</span>
            )}
            <span className="text-sm">{accessKey.server.name}</span>
          </Link>
        )}
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
          valueBytes={Number(accessKey.usedBytes)}
          limitBytes={accessKey.dataLimitBytes ? Number(accessKey.dataLimitBytes) : undefined}
          className="min-w-[140px]"
        />
      </td>

      {/* 7-Day Traffic Sparkline */}
      <td className="px-2 py-3 hidden xl:table-cell">
        <div className="w-[100px] h-[32px]">
          {sparklineData && sparklineData.length > 0 ? (
            <TrafficSparkline data={sparklineData} height={32} id={accessKey.id} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground/40">
              No data
            </div>
          )}
        </div>
      </td>

      {/* Devices */}
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">
            {accessKey.estimatedDevices || 0}
          </span>
        </div>
      </td>

      {/* Expiration */}
      <td className="px-4 py-3">
        {accessKey.expiresAt ? (
          <div className={cn(
            'text-sm',
            accessKey.isExpiringSoon && 'text-orange-500'
          )}>
            {accessKey.daysRemaining != null && accessKey.daysRemaining > 0 ? (
              <span>{accessKey.daysRemaining}d remaining</span>
            ) : accessKey.daysRemaining === 0 ? (
              <span>Expires today</span>
            ) : (
              <span className="text-red-500">Expired</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Never</span>
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
            title="Show QR Code"
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
            title={accessKey.status === 'DISABLED' ? 'Enable key' : 'Disable key'}
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
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShowQR}>
                <QrCode className="w-4 h-4 mr-2" />
                Show QR Code
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onCopyAccessUrl}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Access URL
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopySubscriptionUrl}>
                <Share2 className="w-4 h-4 mr-2" />
                Copy Subscription URL
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Key
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

export default function KeysPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [serverFilter, setServerFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
  } | null>(null);
  const syncAllRef = useRef<ReturnType<typeof trpc.servers.syncAll.useMutation> | null>(null);
  const { t } = useLocale();
  const router = useRouter();

  const { filters, setQuickFilter, setTagFilter, setOwnerFilter, clearFilters: clearPersistedFilters } = usePersistedFilters('access-keys');

  const pageSize = 20;

  // Render function for mobile card view
  const renderKeyCard = (key: any) => {
    const config = statusConfig[key.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
    const StatusIcon = config.icon;

    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <OnlineIndicator isOnline={checkIsOnline(key.id, key.status)} />
            <div>
              <Link href={`/dashboard/keys/${key.id}`} className="font-medium hover:underline">
                {key.name}
              </Link>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {key.server && (
                  <>
                    {key.server.countryCode && <span>{getCountryFlag(key.server.countryCode)}</span>}
                    <span>{key.server.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Badge className={cn('border', config.color)}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {t(config.labelKey)}
          </Badge>
        </div>

        <div className="space-y-1">
          <SegmentedUsageBarCompact
            valueBytes={Number(key.usedBytes)}
            limitBytes={key.dataLimitBytes ? Number(key.dataLimitBytes) : undefined}
          />
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-muted-foreground">Devices</span>
          <span className="flex items-center gap-1">
            <Smartphone className="w-3 h-3" />
            {key.estimatedDevices || 0}
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="text-xs text-muted-foreground">
            {key.expiresAt ? (
              <span className={cn(key.isExpiringSoon && 'text-red-500')}>
                {t('keys.expires_in')} {formatRelativeTime(key.expiresAt)}
              </span>
            ) : (
              <span>{t('keys.never_expires')}</span>
            )}
          </div>

          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQrDialogKey({ id: key.id, name: key.name })}>
              <QrCode className="w-4 h-4" />
            </Button>
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
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToggleStatus(key.id)}>
                  <Power className="w-4 h-4 mr-2" />
                  {key.status === 'DISABLED' ? 'Enable' : 'Disable'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(key.id, key.name)} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  };

  // Auto-refresh hook with localStorage persistence and tab visibility handling
  const autoRefresh = useAutoRefresh({
    onRefresh: useCallback(() => {
      if (syncAllRef.current && !syncAllRef.current.isPending) {
        syncAllRef.current.mutate();
      }
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
    expiring7d: filters.quickFilters.expiring7d || undefined,
    overQuota: filters.quickFilters.overQuota || undefined,
    inactive30d: filters.quickFilters.inactive30d || undefined,
    tag: filters.tagFilter || undefined,
    owner: filters.ownerFilter || undefined,
  });

  // Fetch servers for filter
  const { data: servers } = trpc.servers.list.useQuery();

  // Fetch key stats with polling when auto-refresh is active
  const { data: stats, refetch: refetchStats } = trpc.keys.stats.useQuery(undefined, {
    refetchInterval: autoRefresh.isActive ? autoRefresh.interval * 1000 : false,
  });

  // Fetch live metrics directly from Outline servers - always poll every 3 seconds
  // This provides real-time online detection independent of auto-sync setting
  const { data: liveMetrics, refetch: refetchOnline } = trpc.keys.getLiveMetrics.useQuery(undefined, {
    refetchInterval: 3000, // Always poll for responsive online detection
    refetchIntervalInBackground: false, // Pause when tab is hidden to save resources
  });

  // Fetch 7-day sparkline data for visible keys
  const keyIdsForSparklines = useMemo(
    () => data?.items?.map((k) => k.id) ?? [],
    [data?.items],
  );
  const { data: sparklineMap } = trpc.keys.getSparklines.useQuery(
    { keyIds: keyIdsForSparklines },
    { enabled: keyIdsForSparklines.length > 0, staleTime: 60_000 },
  );

  // Track online status via activity hook (delta-based)
  const { onlineCount, isOnline } = useKeyActivity(liveMetrics);

  // Helper to check if a key is online (disabled keys are never online)
  const checkIsOnline = (keyId: string, status?: string) => {
    if (status === 'DISABLED') return false;
    return isOnline(keyId);
  };

  // Sync all servers mutation
  const syncAllMutation = trpc.servers.syncAll.useMutation({
    onSuccess: () => {
      // Refresh keys list, stats, and online users after sync
      refetch();
      refetchStats();
      refetchOnline();
    },
  });

  // Store mutation in ref for auto-refresh callback
  syncAllRef.current = syncAllMutation;

  // Auto-open create dialog if query param present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      setCreateDialogOpen(true);
    }
  }, []);

  // Note: Auto-sync is now handled by the useAutoRefresh hook above

  // Delete mutation
  const deleteMutation = trpc.keys.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Key deleted',
        description: 'The access key has been deleted.',
      });
      refetch();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = trpc.keys.toggleStatus.useMutation({
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
  const bulkDeleteMutation = trpc.keys.bulkDelete.useMutation({
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkExtendDialogOpen, setBulkExtendDialogOpen] = useState(false);
  const [bulkTagsDialogOpen, setBulkTagsDialogOpen] = useState(false);
  const [bulkTagsMode, setBulkTagsMode] = useState<'add' | 'remove'>('add');
  const [bulkProgressDialogOpen, setBulkProgressDialogOpen] = useState(false);
  const [bulkProgressTitle, setBulkProgressTitle] = useState('');
  const [bulkProgressResults, setBulkProgressResults] = useState<{ success: number; failed: number; errors?: { id: string; name: string; error: string }[] } | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<{ id: string; name: string } | null>(null);

  // Bulk extend mutation
  const bulkExtendMutation = trpc.keys.bulkExtend.useMutation({
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
  const bulkToggleStatusMutation = trpc.keys.bulkToggleStatus.useMutation({
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
  const bulkAddTagsMutation = trpc.keys.bulkAddTags.useMutation({
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
  const bulkRemoveTagsMutation = trpc.keys.bulkRemoveTags.useMutation({
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
        title: 'Archive failed',
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  // Bulk move state
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkMoveTargetServerId, setBulkMoveTargetServerId] = useState('');

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
        title: 'Move failed',
        description: error.message,
        variant: 'destructive',
      });
      setBulkProgressDialogOpen(false);
    },
  });

  const handleBulkMove = () => {
    if (selectedKeys.size === 0 || !bulkMoveTargetServerId) return;
    setBulkProgressTitle('Moving Keys');
    setBulkProgressResults(null);
    setBulkProgressDialogOpen(true);
    setBulkMoveDialogOpen(false);
    bulkMoveMutation.mutate({
      ids: Array.from(selectedKeys),
      targetServerId: bulkMoveTargetServerId,
    });
  };

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

  const handleBulkArchive = () => {
    if (selectedKeys.size === 0) return;
    if (confirm(`Are you sure you want to archive ${selectedKeys.size} key(s)?\n\nArchived keys will be removed from the server but kept in records for 3 months.`)) {
      setBulkProgressTitle('Archiving Keys');
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

      const response = await fetch(`/api/export-keys?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');

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
        title: 'Export complete',
        description: `Keys exported as ${format.toUpperCase()}.`,
      });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Failed to export keys.',
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

  const hasActiveFilters = searchQuery || statusFilter || serverFilter;
  const isBulkBusy =
    bulkDeleteMutation.isPending ||
    bulkExtendMutation.isPending ||
    bulkToggleStatusMutation.isPending ||
    bulkAddTagsMutation.isPending ||
    bulkRemoveTagsMutation.isPending ||
    bulkArchiveMutation.isPending ||
    bulkMoveMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('keys.title')}</h1>
          <p className="text-muted-foreground">
            {t('keys.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link href="/dashboard/templates">
            <Button variant="outline" size="sm" className="h-8">
              <FileText className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('nav.templates') || 'Templates'}</span>
            </Button>
          </Link>
          <Link href="/dashboard/archived">
            <Button variant="outline" size="sm" className="h-8">
              <Archive className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('nav.archived') || 'Archived'}</span>
            </Button>
          </Link>
          <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="h-8">
            <Plus className="w-4 h-4 mr-2" />
            {t('keys.create')}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('keys.total')}</p>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <p className="text-sm text-green-500">{t('keys.active')}</p>
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
                <p className="text-sm text-green-500">{t('keys.online')}</p>
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
              <Clock className="w-4 h-4 text-blue-500" />
              <p className="text-sm text-blue-500">{t('keys.pending')}</p>
            </div>
            <p className="text-2xl font-bold">{stats.pending}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <p className="text-sm text-orange-500">{t('keys.depleted')}</p>
            </div>
            <p className="text-2xl font-bold">{stats.depleted}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-red-500">{t('keys.expired')}</p>
            </div>
            <p className="text-2xl font-bold">{stats.expired}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-primary" />
              <p className="text-sm text-muted-foreground">{t('keys.total_usage')}</p>
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
            placeholder={t('keys.search_placeholder')}
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
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('keys.server_filter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('keys.server_filter')}</SelectItem>
            {servers?.map((server) => (
              <SelectItem key={server.id} value={server.id}>
                {server.countryCode && getCountryFlag(server.countryCode)}{' '}
                {server.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
          >
            <X className="w-4 h-4 mr-1" />
            {t('keys.clear_filters')}
          </Button>
        )}

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!!exportingFormat}>
              {exportingFormat ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}...` : t('keys.export')}
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

        <div className="ml-auto flex items-center gap-2">
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
              title="Group by Server"
            >
              <ListIcon className="w-4 h-4" />
            </Button>
          </div>

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
            {syncAllMutation.isPending ? 'Syncing...' : t('keys.sync')}
          </Button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedKeys.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
          <span className="text-sm font-medium">
            {selectedKeys.size} {t('keys.selected_count')}
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
                  {bulkToggleStatusMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Power className="w-4 h-4 mr-2" />
                  )}
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
              disabled={isBulkBusy}
            >
              {bulkExtendMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
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
                  {bulkAddTagsMutation.isPending || bulkRemoveTagsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Tag className="w-4 h-4 mr-2" />
                  )}
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

            {/* Move to Server */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkMoveDialogOpen(true)}
              disabled={isBulkBusy}
            >
              {bulkMoveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRightLeft className="w-4 h-4 mr-2" />
              )}
              Move
            </Button>

            {/* Archive */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkArchive}
              disabled={bulkArchiveMutation.isPending}
            >
              {bulkArchiveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Archive className="w-4 h-4 mr-2" />
              )}
              {bulkArchiveMutation.isPending ? 'Archiving...' : 'Archive'}
            </Button>

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
              {t('keys.delete_selected')}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedKeys(new Set())}
            className="ml-auto"
            disabled={isBulkBusy}
          >
            {t('keys.clear_selection')}
          </Button>
        </div>
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
          onDelete={(key) => handleDelete(key.id, key.name)}
          onCopy={(key) => {
            if (key.accessUrl) {
              copyToClipboard(key.accessUrl);
            } else {
              toast({ title: 'Error', description: 'No access URL available', variant: 'destructive' });
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
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {key.server.countryCode && <span>{getCountryFlag(key.server.countryCode)}</span>}
                              <span className="truncate">{key.server.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge className={cn('border shrink-0', config.color)}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {t(config.labelKey)}
                      </Badge>
                    </div>

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
                        {key.estimatedDevices || 0} devices
                      </span>
                      <span className={cn('text-muted-foreground', key.isExpiringSoon && 'text-red-500')}>
                        {key.expiresAt ? formatRelativeTime(key.expiresAt) : 'Never'}
                      </span>
                    </div>

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
                            const url = `${window.location.origin}/sub/${key.subscriptionToken}`;
                            copyToClipboard(url);
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
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingKey(key)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(key.id)}>
                            <Power className="w-4 h-4 mr-2" />
                            {key.status === 'DISABLED' ? 'Enable' : 'Disable'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(key.id, key.name)} className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
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
                {hasActiveFilters ? t('keys.empty.no_match') : t('keys.empty.no_keys')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Keys table (List View) - show on desktop always when list mode, and on mobile when list mode */}
      <Card className={cn('mb-6', viewMode === 'list' ? 'hidden md:block' : 'hidden')}>
        <div className="overflow-x-auto">
          <table className="w-full">

            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-3 w-10">
                  <button
                    onClick={handleSelectAll}
                    className="p-1 hover:bg-muted rounded"
                    title={selectedKeys.size === (data?.items?.length || 0) ? 'Deselect all' : 'Select all'}
                  >
                    {data?.items && selectedKeys.size === data.items.length && data.items.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('keys.table.name')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('keys.table.server')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('keys.table.status')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('keys.table.usage')}</th>
                <th className="text-left px-2 py-3 text-sm font-medium text-muted-foreground hidden xl:table-cell">7-Day</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Devices</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('keys.table.expires')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('keys.table.actions')}</th>
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
              ) : data?.items && data.items.length > 0 ? (
                data.items.map((key) => (
                  <KeyRow
                    key={key.id}
                    accessKey={key}
                    onDelete={() => handleDelete(key.id, key.name)}
                    onShowQR={() => setQrDialogKey({ id: key.id, name: key.name })}
                    onToggleStatus={() => handleToggleStatus(key.id)}
                    isSelected={selectedKeys.has(key.id)}
                    onSelect={() => handleSelectKey(key.id)}
                    isTogglingStatus={togglingKeyId === key.id}
                    isOnline={checkIsOnline(key.id, key.status)}
                    sparklineData={sparklineMap?.[key.id]}
                    onCopyAccessUrl={() => {
                      if (key.accessUrl) {
                        copyToClipboard(key.accessUrl, 'Copied', 'Access URL copied to clipboard');
                      } else {
                        toast({ title: 'Error', description: 'No access URL available', variant: 'destructive' });
                      }
                    }}
                    onCopySubscriptionUrl={() => {
                      if (key.subscriptionToken) {
                        const url = `${window.location.origin}/sub/${key.subscriptionToken}`;
                        copyToClipboard(url, 'Copied', 'Subscription URL copied to clipboard');
                      } else {
                        toast({ title: 'Error', description: 'No subscription URL available', variant: 'destructive' });
                      }
                    }}
                    onEdit={() => setEditingKey(key)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Key className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">
                      {hasActiveFilters
                        ? t('keys.empty.no_match')
                        : t('keys.empty.no_keys')}
                    </p>
                    {!hasActiveFilters && (
                      <Button
                        className="mt-4"
                        onClick={() => setCreateDialogOpen(true)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('keys.empty.create_first')}
                      </Button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

      {/* Dialogs */}
      <CreateKeyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => refetch()}
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

      <BulkExtendDialog
        open={bulkExtendDialogOpen}
        onOpenChange={setBulkExtendDialogOpen}
        count={selectedKeys.size}
        onConfirm={handleBulkExtend}
        isPending={bulkExtendMutation.isPending}
      />

      <BulkTagsDialog
        open={bulkTagsDialogOpen}
        onOpenChange={setBulkTagsDialogOpen}
        count={selectedKeys.size}
        mode={bulkTagsMode}
        onConfirm={handleBulkTags}
        isPending={bulkAddTagsMutation.isPending || bulkRemoveTagsMutation.isPending}
      />

      <BulkProgressDialog
        open={bulkProgressDialogOpen}
        onOpenChange={setBulkProgressDialogOpen}
        title={bulkProgressTitle}
        results={bulkProgressResults}
        isPending={bulkToggleStatusMutation.isPending || bulkArchiveMutation.isPending || bulkMoveMutation.isPending}
      />

      {/* Bulk Move Dialog */}
      <Dialog open={bulkMoveDialogOpen} onOpenChange={setBulkMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Keys to Server</DialogTitle>
            <DialogDescription>
              Move {selectedKeys.size} selected key{selectedKeys.size !== 1 ? 's' : ''} to a different server.
              Keys will be recreated on the target server and removed from the current one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Target Server</Label>
            <Select value={bulkMoveTargetServerId} onValueChange={setBulkMoveTargetServerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select target server..." />
              </SelectTrigger>
              <SelectContent>
                {(servers ?? []).map((s: { id: string; name: string; location?: string | null }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{s.location ? ` (${s.location})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMoveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkMove} disabled={!bulkMoveTargetServerId}>
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Move {selectedKeys.size} Key{selectedKeys.size !== 1 ? 's' : ''}
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
