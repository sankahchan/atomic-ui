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
import { keepPreviousData } from '@tanstack/react-query';
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
  Sparkles,
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

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
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
    serverId: 'auto',
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
  const { t } = useLocale();

  // Create key mutation
  const createMutation = trpc.keys.create.useMutation({
    onSuccess: () => {
      toast({
        title: t('keys.toast.created'),
        description: t('keys.toast.created_desc'),
      });
      onSuccess();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
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
        title: t('keys.toast.validation'),
        description: t('keys.toast.validation_create_desc'),
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      serverId: formData.serverId === 'auto' ? undefined : formData.serverId,
      assignmentMode: formData.serverId === 'auto' ? 'AUTO' : 'MANUAL',
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
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
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

          <div className="border-t border-border pt-4"></div>

          {/* Server selection */}
          <div className="space-y-2">
            <Label>{t('keys.form.server')} *</Label>
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
                  <SelectItem key={server.id} value={server.id}>
                    {server.countryCode && getCountryFlag(server.countryCode)}{' '}
                    {server.name}
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
                <SelectItem value="DURATION_FROM_CREATION">{t('keys.form.expiration.duration_from_creation')}</SelectItem>
                <SelectItem value="START_ON_FIRST_USE">{t('keys.form.expiration.start_on_first_use')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
      await copyToClipboard(keyData.accessUrl, t('keys.toast.copied'), t('keys.toast.copy_access_url'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('keys.actions.show_qr')}: {keyName}</DialogTitle>
          <DialogDescription>
            {t('keys.dialog.qr_desc')}
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
              <p className="text-muted-foreground text-sm">{t('keys.dialog.qr_failed')}</p>
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
              {t('keys.actions.copy_access_url')}
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
          <DialogTitle>{t('keys.delete_title')}</DialogTitle>
          <DialogDescription>
            {t('keys.confirm_delete')} &quot;{keyName}&quot;?
            <br />
            {t('keys.confirm_delete_desc')}
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
  const selectedLabel = count === 1 ? t('keys.bulk.selected_singular') : t('keys.bulk.selected_plural');

  const quickOptions = [7, 14, 30, 60, 90];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {t('keys.bulk.extend_title')}
          </DialogTitle>
          <DialogDescription>
            {fillTemplate(
              t(count === 1 ? 'keys.bulk.extend_desc_single' : 'keys.bulk.extend_desc'),
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
              {t('keys.bulk.custom')}
            </Button>
          </div>

          {useCustom && (
            <div className="space-y-2">
              <Label htmlFor="customDays">{t('keys.bulk.custom_days')}</Label>
              <Input
                id="customDays"
                type="number"
                min="1"
                placeholder={t('keys.bulk.custom_days_placeholder')}
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
            {fillTemplate(t('keys.bulk.extend_confirm'), {
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            {mode === 'add' ? t('keys.bulk.tags_add_title') : t('keys.bulk.tags_remove_title')}
          </DialogTitle>
          <DialogDescription>
            {fillTemplate(
              t(mode === 'add' ? 'keys.bulk.tags_add_desc' : 'keys.bulk.tags_remove_desc'),
              { count, items: selectedLabel },
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
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
            {mode === 'add' ? t('keys.bulk.add_tags') : t('keys.bulk.remove_tags')}
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
              <p className="text-sm text-muted-foreground">{t('keys.bulk.progress.processing')}</p>
            </div>
          ) : results ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-2xl font-bold text-green-500">{results.success}</p>
                  <p className="text-sm text-green-500">{t('keys.bulk.progress.successful')}</p>
                </div>
                <div className="flex-1 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-2xl font-bold text-red-500">{results.failed}</p>
                  <p className="text-sm text-red-500">{t('keys.bulk.progress.failed')}</p>
                </div>
              </div>

              {results.errors && results.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('keys.bulk.progress.errors')}</p>
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
  };
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { t } = useLocale();
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
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('keys.dialog.edit_title')}</DialogTitle>
          <DialogDescription>
            {t('keys.dialog.edit_desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="space-y-2">
            <Label htmlFor="editTelegram">{t('keys.form.telegram')}</Label>
            <Input
              id="editTelegram"
              value={formData.telegramId}
              onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
            />
          </div>

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

          {formData.dataLimitGB && (
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

          <div className="space-y-2">
            <Label htmlFor="editNotes">{t('keys.form.notes')}</Label>
            <Input
              id="editNotes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('keys.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('keys.dialog.save')}
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
    lastTrafficAt?: Date | null;
    recentTrafficDeltaBytes?: bigint;
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
  const showTrafficState = accessKey.status === 'ACTIVE';

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
            {accessKey.tags && (
              <div className="flex flex-wrap gap-1 mt-1">
                {accessKey.tags.split(',').filter(Boolean).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground dark:bg-white/[0.03]"
                  >
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

export default function KeysPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [serverFilter, setServerFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
  } | null>(null);
  const syncAllRef = useRef<ReturnType<typeof trpc.servers.syncAll.useMutation> | null>(null);
  const { t } = useLocale();
  const router = useRouter();
  const getItemLabel = useCallback(
    (count: number) => t(count === 1 ? 'keys.bulk.item_singular' : 'keys.bulk.item_plural'),
    [t],
  );
  const getSelectedLabel = useCallback(
    (count: number) => t(count === 1 ? 'keys.bulk.selected_singular' : 'keys.bulk.selected_plural'),
    [t],
  );

  const { filters, setQuickFilter, setTagFilter, setOwnerFilter, clearFilters: clearPersistedFilters } = usePersistedFilters('access-keys');

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
    const tags = typeof key.tags === 'string'
      ? key.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)
      : [];

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
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                {key.server && (
                  <>
                    {key.server.countryCode && <span>{getCountryFlag(key.server.countryCode)}</span>}
                    <span className="truncate">{key.server.name}</span>
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
            </div>
          </div>
          <div className="ml-3 flex flex-col items-end gap-2">
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
          </div>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag: string) => (
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
              {key.estimatedDevices || 0}
            </p>
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
  }, {
    placeholderData: keepPreviousData,
  });

  // Fetch servers for filter
  const { data: servers } = trpc.servers.list.useQuery();

  // Fetch key stats with polling when auto-refresh is active
  const { data: stats, refetch: refetchStats } = trpc.keys.stats.useQuery(undefined, {
    refetchInterval: autoRefresh.isActive ? autoRefresh.interval * 1000 : false,
  });

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
  const { data: sparklineMap } = trpc.keys.getSparklines.useQuery(
    { keyIds: keyIdsForSparklines },
    { enabled: keyIdsForSparklines.length > 0, staleTime: 60_000 },
  );

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
        title: t('keys.toast.extension_complete'),
        description: fillTemplate(
          t(result.success === 1 ? 'keys.toast.extension_complete_desc_single' : 'keys.toast.extension_complete_desc'),
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
        title: t('keys.toast.extension_failed'),
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
    filters.quickFilters.expiring7d ||
    filters.quickFilters.overQuota ||
    filters.quickFilters.inactive30d ||
    filters.tagFilter ||
    filters.ownerFilter,
  );
  const hasActiveFilters = Boolean(searchQuery || statusFilter || serverFilter);
  const hasAnyFilters = hasActiveFilters || hasPersistedFilters;
  const isBulkBusy =
    bulkDeleteMutation.isPending ||
    bulkExtendMutation.isPending ||
    bulkToggleStatusMutation.isPending ||
    bulkAddTagsMutation.isPending ||
    bulkRemoveTagsMutation.isPending ||
    bulkArchiveMutation.isPending ||
    bulkMoveMutation.isPending;
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
              <Key className="h-3.5 w-3.5" />
              {t('keys.title')}
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">{t('keys.title')}</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t('keys.subtitle')}
              </p>
            </div>

            <div className="hidden sm:grid gap-3 lg:grid-cols-3 xl:max-w-3xl">
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('dashboard.key_operations_title')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('dashboard.key_operations_desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.templates') || 'Templates'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('dashboard.review_inventory_desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.archived') || 'Archived'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('keys.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="hidden xl:block">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{t('dashboard.key_operations_title')}</p>
                <h2 className="text-xl font-semibold">{t('dashboard.key_operations_title')}</h2>
                <p className="text-sm text-muted-foreground">{t('dashboard.key_operations_desc')}</p>
              </div>
              <Button onClick={() => setCreateDialogOpen(true)} className="h-11 w-full justify-center rounded-full">
                <Plus className="w-4 h-4 mr-2" />
                {t('keys.create')}
              </Button>
              <Button variant="outline" className="h-11 w-full justify-center rounded-full border-border/70 bg-background/70 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]" asChild>
                <Link href="/dashboard/templates">
                  <FileText className="w-4 h-4 mr-2" />
                  {t('nav.templates') || 'Templates'}
                </Link>
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
            {t('keys.create')}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 w-full justify-center rounded-full" asChild>
              <Link href="/dashboard/templates">
                <FileText className="w-4 h-4 mr-2" />
                {t('nav.templates') || 'Templates'}
              </Link>
            </Button>
            <Button variant="outline" className="h-11 w-full justify-center rounded-full" asChild>
              <Link href="/dashboard/archived">
                <Archive className="w-4 h-4 mr-2" />
                {t('nav.archived') || 'Archived'}
              </Link>
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-background/50 dark:border-cyan-400/12 dark:bg-[linear-gradient(180deg,rgba(7,15,29,0.88),rgba(6,13,26,0.76))]">
                  <Key className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t('keys.total')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.total}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-green-500/20 bg-green-500/10">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-sm font-medium text-green-500">{t('keys.active')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.active}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10">
                  <Clock className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-blue-500">{t('keys.pending')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.pending}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </div>
                <p className="text-sm font-medium text-orange-500">{t('keys.depleted')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.depleted}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
                  <XCircle className="h-4 w-4 text-red-500" />
                </div>
                <p className="text-sm font-medium text-red-500">{t('keys.expired')}</p>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stats.expired}</p>
            </div>
            <div className="ops-kpi-tile">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                  <HardDrive className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t('keys.total_usage')}</p>
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
          <div className="flex flex-1 items-center justify-center rounded-[1rem] border border-border/60 bg-background/55 p-0.5 dark:bg-white/[0.02]">
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
              title={t('keys.view.group_by_server')}
            >
              <ListIcon className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            className="h-10 flex-1 rounded-[1rem]"
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
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={clearAllFilters}>
                <X className="w-3 h-3 mr-1" />
                {t('keys.clear_filters')}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Quick Filter Pills */}
      <div className="ops-table-meta hidden md:flex">
        <span className="mr-1 text-sm text-muted-foreground">{t('keys.quick_filters.label')}:</span>
        <div className="mr-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100">
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
          className={cn('h-8 rounded-full text-xs', filters.quickFilters.online && 'bg-green-600 hover:bg-green-700')}
          onClick={() => setQuickFilter('online', !filters.quickFilters.online)}
        >
          <Wifi className="w-3 h-3 mr-1" />
          {t('keys.quick_filters.online')}
        </Button>
        <Button
          variant={filters.quickFilters.expiring7d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full text-xs', filters.quickFilters.expiring7d && 'bg-orange-600 hover:bg-orange-700')}
          onClick={() => setQuickFilter('expiring7d', !filters.quickFilters.expiring7d)}
        >
          <Clock className="w-3 h-3 mr-1" />
          {t('keys.quick_filters.expiring7d')}
        </Button>
        <Button
          variant={filters.quickFilters.overQuota ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full text-xs', filters.quickFilters.overQuota && 'bg-red-600 hover:bg-red-700')}
          onClick={() => setQuickFilter('overQuota', !filters.quickFilters.overQuota)}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          {t('keys.quick_filters.over_quota')}
        </Button>
        <Button
          variant={filters.quickFilters.inactive30d ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 rounded-full text-xs', filters.quickFilters.inactive30d && 'bg-gray-600 hover:bg-gray-700')}
          onClick={() => setQuickFilter('inactive30d', !filters.quickFilters.inactive30d)}
        >
          <EyeOff className="w-3 h-3 mr-1" />
          {t('keys.quick_filters.inactive30d')}
        </Button>
        
        {/* Tag filter */}
        <div className="ml-2 flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-2.5 py-1.5 dark:bg-white/[0.02]">
          <Tag className="w-3 h-3 text-muted-foreground" />
          <Input
            placeholder={t('keys.quick_filters.tag_placeholder')}
            value={filters.tagFilter || ''}
            onChange={(e) => setTagFilter(e.target.value || undefined)}
            className="h-auto w-28 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        
        {/* Owner filter */}
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-2.5 py-1.5 dark:bg-white/[0.02]">
          <User className="w-3 h-3 text-muted-foreground" />
          <Input
            placeholder={t('keys.quick_filters.owner_placeholder')}
            value={filters.ownerFilter || ''}
            onChange={(e) => setOwnerFilter(e.target.value || undefined)}
            className="h-auto w-28 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
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
      <div className="ops-table-toolbar hidden md:flex">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
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

        <Select
          value={statusFilter || 'all'}
          onValueChange={(value) => {
            setStatusFilter(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-11 w-[148px] rounded-[1.15rem] border-border/70 bg-background/70 dark:border-cyan-400/12 dark:bg-[rgba(4,10,20,0.72)]">
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
          <SelectTrigger className="h-11 w-[190px] rounded-[1.15rem] border-border/70 bg-background/70 dark:border-cyan-400/12 dark:bg-[rgba(4,10,20,0.72)]">
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

        <div className="ml-auto flex items-center gap-2">
          {/* View mode toggle - visible on all screens */}
          <div className="flex items-center rounded-[1rem] border border-border/60 bg-background/55 p-0.5 dark:bg-white/[0.02]">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 rounded-[0.85rem] px-2.5"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 rounded-[0.85rem] px-2.5"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'group' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-10 rounded-[0.85rem] px-2.5"
              onClick={() => setViewMode('group')}
              title={t('keys.view.group_by_server')}
            >
              <ListIcon className="w-4 h-4" />
            </Button>
          </div>

          {/* Auto-sync selector */}
          <div className="flex items-center gap-1 rounded-[1rem] border border-border/60 bg-background/55 px-2.5 py-1.5 dark:bg-white/[0.02]">
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', syncAllMutation.isPending && 'animate-spin')} />
            <Select
              value={autoRefresh.interval.toString()}
              onValueChange={(value) => autoRefresh.setInterval(parseInt(value))}
            >
              <SelectTrigger className="h-9 w-[84px] rounded-[0.9rem] border-0 bg-transparent shadow-none focus:ring-0">
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
                        {server.countryCode && getCountryFlag(server.countryCode)} {server.name}
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
                  variant={filters.quickFilters.expiring7d ? 'default' : 'outline'}
                  size="sm"
                  className={cn(filters.quickFilters.expiring7d && 'bg-orange-600 hover:bg-orange-700')}
                  onClick={() => setQuickFilter('expiring7d', !filters.quickFilters.expiring7d)}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  {t('keys.quick_filters.expiring7d')}
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

      {/* Bulk actions bar */}
      {selectedKeys.size > 0 && (
        <div className="ops-mobile-action-bar sticky bottom-4 z-20 border-primary/20 bg-primary/6 shadow-[0_18px_36px_rgba(1,6,20,0.34)]">
          <span className="text-sm font-medium">
            {selectedKeys.size} {t('keys.selected_count')}
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
                  {t('keys.bulk.enable_disable')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleBulkToggleStatus(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                  {t('keys.bulk.enable_all')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkToggleStatus(false)}>
                  <XCircle className="w-4 h-4 mr-2 text-orange-500" />
                  {t('keys.bulk.disable_all')}
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
              {t('keys.bulk.extend_expiry')}
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
                  {t('keys.bulk.tags')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => {
                  setBulkTagsMode('add');
                  setBulkTagsDialogOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('keys.bulk.add_tags')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setBulkTagsMode('remove');
                  setBulkTagsDialogOpen(true);
                }}>
                  <X className="w-4 h-4 mr-2" />
                  {t('keys.bulk.remove_tags')}
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
              {t('keys.bulk.move')}
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
              {bulkArchiveMutation.isPending ? t('keys.bulk.archiving') : t('keys.bulk.archive')}
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
            className="w-full rounded-full sm:ml-auto sm:w-auto"
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
                        {key.estimatedDevices || 0} {t('keys.devices_count')}
                      </span>
                      <span className={cn('text-muted-foreground', key.isExpiringSoon && 'text-red-500')}>
                        {key.expiresAt ? formatRelativeTime(key.expiresAt) : t('keys.never_expires')}
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
                {hasActiveFilters ? t('keys.empty.no_match') : t('keys.empty.no_keys')}
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
                        const url = `${window.location.origin}/sub/${key.subscriptionToken}`;
                        copyToClipboard(url, t('keys.toast.copied'), t('keys.toast.copy_subscription_url'));
                      } else {
                        toast({ title: t('keys.toast.error'), description: t('keys.toast.no_subscription_url'), variant: 'destructive' });
                      }
                    }}
                    onEdit={() => setEditingKey(key)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-10">
                    <div className="ops-chart-empty">
                      <Key className="mb-3 h-10 w-10 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        {hasActiveFilters
                          ? t('keys.empty.no_match')
                          : t('keys.empty.no_keys')}
                      </p>
                      {!hasActiveFilters && (
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
        {data && data.totalPages > 1 && (
          <div className="ops-table-toolbar rounded-none border-x-0 border-b-0 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {t('keys.pagination.showing')} {(page - 1) * pageSize + 1} {t('keys.pagination.to')}{' '}
              {Math.min(page * pageSize, data.total)} {t('keys.pagination.of')} {data.total}
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
                {t('keys.pagination.page')} {page} {t('keys.pagination.of_pages')} {data.totalPages}
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
          <div className="space-y-3 py-2">
            <Label>{t('keys.bulk.move_target_server')}</Label>
            <Select value={bulkMoveTargetServerId} onValueChange={setBulkMoveTargetServerId}>
              <SelectTrigger>
                <SelectValue placeholder={t('keys.bulk.move_target_placeholder')} />
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
