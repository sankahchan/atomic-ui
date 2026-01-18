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
import { cn, formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';
import QRCode from 'qrcode';
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
} from 'lucide-react';

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
    </div>
  );
}
