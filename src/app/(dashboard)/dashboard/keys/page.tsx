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

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { cn, formatBytes, formatRelativeTime, formatDateTime, getCountryFlag } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import {
  Plus,
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
} from 'lucide-react';
import { MobileCardView } from '@/components/mobile-card-view';

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
    expirationType: 'NEVER' | 'FIXED_DATE' | 'DURATION_FROM_CREATION' | 'START_ON_FIRST_USE';
    durationDays: string;
    method: string;
  }>({
    serverId: '',
    name: '',
    email: '',
    telegramId: '',
    notes: '',
    dataLimitGB: '',
    expirationType: 'NEVER',
    durationDays: '',
    method: 'chacha20-ietf-poly1305',
  });

  // Fetch servers for selection
  const { data: servers } = trpc.servers.list.useQuery();
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

  const resetForm = () => {
    setFormData({
      serverId: '',
      name: '',
      email: '',
      telegramId: '',
      notes: '',
      dataLimitGB: '',
      expirationType: 'NEVER',
      durationDays: '',
      method: 'chacha20-ietf-poly1305',
    });
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
            <Key className="w-5 h-5 text-primary" />
            {t('keys.dialog.create.title')}
          </DialogTitle>
          <DialogDescription>
            {t('keys.dialog.create.desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
      await navigator.clipboard.writeText(keyData.accessUrl);
      toast({
        title: t('keys.toast.copied'),
        description: t('keys.toast.copied_desc'),
      });
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
            <Image
              src={data.qrCode}
              alt="QR Code"
              width={200}
              height={200}
              className="rounded-lg"
              unoptimized
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
          <div>
            <Link
              href={`/dashboard/keys/${accessKey.id}`}
              className="font-medium hover:text-primary transition-colors"
            >
              {accessKey.name}
            </Link>
            {accessKey.email && (
              <p className="text-xs text-muted-foreground">{accessKey.email}</p>
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
        <div className="space-y-1 min-w-[120px]">
          <div className="flex items-center justify-between text-xs">
            <span>{formatBytes(accessKey.usedBytes)}</span>
            <span className="text-muted-foreground">
              {accessKey.dataLimitBytes
                ? formatBytes(accessKey.dataLimitBytes)
                : '∞'}
            </span>
          </div>
          {accessKey.dataLimitBytes && (
            <Progress
              value={accessKey.usagePercent || 0}
              className={cn(
                'h-1.5',
                accessKey.isTrafficWarning && '[&>div]:bg-orange-500'
              )}
            />
          )}
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
              <DropdownMenuItem onClick={onShowQR}>
                <QrCode className="w-4 h-4 mr-2" />
                Show QR Code
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
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const { t } = useLocale();

  const pageSize = 20;

  // Render function for mobile card view
  const renderKeyCard = (key: any) => {
    const config = statusConfig[key.status as keyof typeof statusConfig] || statusConfig.ACTIVE;
    const StatusIcon = config.icon;

    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <OnlineIndicator isOnline={onlineKeyIds.has(key.id)} />
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
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('keys.table.usage')}</span>
            <span>{formatBytes(key.usedBytes)} / {key.dataLimitBytes ? formatBytes(key.dataLimitBytes) : '∞'}</span>
          </div>
          {key.dataLimitBytes && (
            <Progress
              value={key.usagePercent || 0}
              className={cn('h-1.5', key.isTrafficWarning && '[&>div]:bg-orange-500')}
            />
          )}
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

  // Fetch keys
  const { data, isLoading, refetch } = trpc.keys.list.useQuery({
    serverId: serverFilter || undefined,
    status: (statusFilter || undefined) as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED' | 'PENDING' | undefined,
    search: searchQuery || undefined,
    page,
    pageSize,
  });

  // Fetch servers for filter
  const { data: servers } = trpc.servers.list.useQuery();

  // Fetch key stats
  const { data: stats } = trpc.keys.stats.useQuery();

  // Fetch online users
  const { data: onlineData, refetch: refetchOnline } = trpc.keys.getOnlineUsers.useQuery(undefined, {
    refetchInterval: autoRefreshInterval > 0 ? autoRefreshInterval * 1000 : false,
  });

  // Set of online key IDs for quick lookup
  const onlineKeyIds = new Set(onlineData?.onlineKeyIds || []);

  // Sync all servers mutation
  const syncAllMutation = trpc.servers.syncAll.useMutation({
    onSuccess: () => {
      // Refresh keys list and online users after sync
      refetch();
      refetchOnline();
    },
  });

  // Store mutation in ref to avoid infinite effect loop
  const syncAllRef = useRef(syncAllMutation);
  syncAllRef.current = syncAllMutation;

  // Auto-sync effect - syncs with Outline servers and refreshes data
  useEffect(() => {
    // Clear existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (autoRefreshInterval > 0) {
      // Set countdown to interval
      setCountdown(autoRefreshInterval);

      // Countdown timer (updates every second)
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            return autoRefreshInterval;
          }
          return prev - 1;
        });
      }, 1000);

      // Sync timer - syncs with Outline servers then refreshes
      intervalRef.current = setInterval(() => {
        syncAllRef.current.mutate();
      }, autoRefreshInterval * 1000);
    } else {
      setCountdown(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [autoRefreshInterval]);

  // Delete mutation
  const deleteMutation = trpc.keys.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Key deleted',
        description: 'The access key has been deleted.',
      });
      refetch();
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
    },
    onError: (error) => {
      toast({
        title: 'Bulk delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (keyId: string, keyName: string) => {
    if (confirm(`${t('keys.confirm_delete')} "${keyName}"?`)) {
      deleteMutation.mutate({ id: keyId });
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
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setServerFilter('');
    setPage(1);
  };

  const hasActiveFilters = searchQuery || statusFilter || serverFilter;

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
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('keys.create')}
        </Button>
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
              <p className="text-sm text-green-500">{t('keys.online')}</p>
            </div>
            <p className="text-2xl font-bold">{onlineData?.onlineCount || 0}</p>
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
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              {t('keys.export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('json')}>
              <FileJson className="w-4 h-4 mr-2" />
              {t('keys.export_json')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              {t('keys.export_csv')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {/* Auto-sync selector */}
          <div className="flex items-center gap-1">
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', syncAllMutation.isPending && 'animate-spin')} />
            <Select
              value={autoRefreshInterval.toString()}
              onValueChange={(value) => setAutoRefreshInterval(parseInt(value))}
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
            {autoRefreshInterval > 0 && (
              <span className="text-xs text-muted-foreground min-w-[24px]">
                {countdown}s
              </span>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', syncAllMutation.isPending && 'animate-spin')} />
            {t('keys.sync')}
          </Button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedKeys.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">
            {selectedKeys.size} {t('keys.selected_count')}
          </span>
          <div className="flex items-center gap-2">
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
          >
            {t('keys.clear_selection')}
          </Button>
        </div>
      )}

      {/* Mobile Card View */}
      {isLoading ? (
        <div className="md:hidden space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-32 bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <MobileCardView
          data={data?.items || []}
          renderCard={renderKeyCard}
          keyExtractor={(item) => item.id}
          className="md:hidden"
        />
      )}

      {/* Keys table */}
      <Card className="hidden md:block mb-6">
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
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('keys.table.expires')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('keys.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
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
                    isOnline={onlineKeyIds.has(key.id)}
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
    </div>
  );
}
