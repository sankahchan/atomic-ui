'use client';

/**
 * Server Detail Page
 * 
 * This page provides a comprehensive view of a single Outline VPN server,
 * including its configuration, health status, access keys, and management
 * actions. It serves as the central hub for all server-related operations.
 * 
 * The page is organized into sections:
 * - Overview: Basic server info and quick stats
 * - Health: Latency, uptime, and recent health checks
 * - Access Keys: List of keys on this server
 * - Actions: Sync, edit, and danger zone operations
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { cn, formatBytes, formatRelativeTime, getCountryFlag, COUNTRY_OPTIONS } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import {
  Server,
  Key,
  Activity,
  RefreshCw,
  Edit2,
  Trash2,
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Globe,
  Shield,
  Wifi,
  BarChart3,
  ExternalLink,
  Copy,
} from 'lucide-react';

/**
 * EditServerDialog Component
 * 
 * A modal dialog for editing server metadata like name, location, and tags.
 */
function EditServerDialog({
  open,
  onOpenChange,
  server,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: {
    id: string;
    name: string;
    location: string | null;
    countryCode: string | null;
    isDefault: boolean;
    tags: Array<{ id: string; name: string; color: string }>;
  };
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { t } = useLocale();
  const [name, setName] = useState(server.name);
  const [location, setLocation] = useState(server.location || '');
  const [countryCode, setCountryCode] = useState(server.countryCode || '');
  const [isDefault, setIsDefault] = useState(server.isDefault);
  const [selectedTags, setSelectedTags] = useState<string[]>(server.tags.map(t => t.id));

  // Fetch available tags
  const { data: tags } = trpc.tags.list.useQuery();

  // Update mutation
  const updateMutation = trpc.servers.update.useMutation({
    onSuccess: () => {
      toast({
        title: t('server_details.toast.updated'),
        description: t('server_details.toast.updated_desc'),
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: t('server_details.toast.update_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      id: server.id,
      name,
      location: location || undefined,
      countryCode: countryCode || undefined,
      isDefault,
      tagIds: selectedTags,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('server_details.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('server_details.edit.desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('server_details.edit.name')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">{t('server_details.edit.location')}</Label>
              <Input
                id="location"
                placeholder={t('server_details.edit.location_placeholder')}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('server_details.edit.country')}</Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger>
                  <SelectValue placeholder={t('server_details.edit.country_select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('server_details.edit.none')}</SelectItem>
                  {COUNTRY_OPTIONS.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {getCountryFlag(country.code)} {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tags && tags.length > 0 && (
            <div className="space-y-2">
              <Label>{t('server_details.edit.tags')}</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      setSelectedTags((prev) =>
                        prev.includes(tag.id)
                          ? prev.filter((id) => id !== tag.id)
                          : [...prev, tag.id]
                      );
                    }}
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-medium transition-all',
                      selectedTags.includes(tag.id)
                        ? 'text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                    style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color } : {}}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="isDefault" className="font-normal">
              {t('server_details.edit.default')}
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('server_details.edit.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('server_details.edit.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ServerDetailPage Component
 * 
 * The main server detail page showing comprehensive server information.
 */
export default function ServerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { t } = useLocale();
  const serverId = params.id as string;

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [lifecycleMode, setLifecycleMode] = useState('ACTIVE');
  const [lifecycleNote, setLifecycleNote] = useState('');

  // Fetch server details
  const { data: server, isLoading, refetch } = trpc.servers.getById.useQuery(
    { id: serverId },
    { enabled: !!serverId }
  );

  // Sync mutation
  const syncMutation = trpc.servers.sync.useMutation({
    onSuccess: (result) => {
      toast({
        title: t('server_details.toast.synced'),
        description: `Found ${result.keysFound} keys. Created ${result.keysCreated}, removed ${result.keysRemoved}.`,
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('server_details.toast.sync_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = trpc.servers.delete.useMutation({
    onSuccess: () => {
      toast({
        title: t('server_details.toast.deleted'),
        description: 'The server has been removed from Atomic-UI.',
      });
      router.push('/dashboard/servers');
    },
    onError: (error) => {
      toast({
        title: t('server_details.toast.delete_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const lifecycleMutation = trpc.servers.setLifecycleMode.useMutation({
    onSuccess: () => {
      toast({
        title: 'Server mode updated',
        description: 'Assignment safeguards were updated for this server.',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to update server mode',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!server) {
      return;
    }

    setLifecycleMode(server.lifecycleMode || 'ACTIVE');
    setLifecycleNote(server.lifecycleNote || '');
  }, [server]);

  const handleDelete = () => {
    if (confirm(`${t('server_details.danger.confirm')} "${server?.name}" from Atomic-UI?\n\n${t('server_details.danger.confirm_desc')}`)) {
      deleteMutation.mutate({ id: serverId });
    }
  };

  const handleSaveLifecycle = () => {
    lifecycleMutation.mutate({
      id: serverId,
      lifecycleMode: lifecycleMode as 'ACTIVE' | 'DRAINING' | 'MAINTENANCE',
      lifecycleNote: lifecycleNote.trim() || undefined,
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  // Not found
  if (!server) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Server className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('server_details.not_found')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('server_details.not_found_desc')}
        </p>
        <Button asChild>
          <Link href="/dashboard/servers">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('server_details.back')}
          </Link>
        </Button>
      </div>
    );
  }

  const healthStatus = server.healthCheck?.lastStatus || 'UNKNOWN';
  const activeKeyCount = server.accessKeys?.filter((key) => key.status === 'ACTIVE').length || 0;
  const expiringSoonCount = server.accessKeys?.filter((key) => {
    if (!key.expiresAt) return false;
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return key.expiresAt >= now && key.expiresAt <= inSevenDays;
  }).length || 0;
  const statusConfig = {
    UP: { color: 'text-green-500', bg: 'bg-green-500', icon: CheckCircle2, labelKey: 'health.status.UP' },
    DOWN: { color: 'text-red-500', bg: 'bg-red-500', icon: XCircle, labelKey: 'health.status.DOWN' },
    SLOW: { color: 'text-yellow-500', bg: 'bg-yellow-500', icon: AlertTriangle, labelKey: 'health.status.SLOW' },
    UNKNOWN: { color: 'text-gray-500', bg: 'bg-gray-500', icon: Activity, labelKey: 'health.status.UNKNOWN' },
  };
  const status = statusConfig[healthStatus as keyof typeof statusConfig] || statusConfig.UNKNOWN;
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6">
      <section className="ops-hero">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" size="icon" asChild className="rounded-full">
                  <Link href="/dashboard/servers">
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                </Button>
                <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
                  <Server className="h-3.5 w-3.5" />
                  Server Detail
                </span>
                {server.lifecycleMode && server.lifecycleMode !== 'ACTIVE' ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full px-3 py-1',
                      server.lifecycleMode === 'DRAINING' && 'border-amber-500/30 text-amber-500',
                      server.lifecycleMode === 'MAINTENANCE' && 'border-sky-500/30 text-sky-500',
                    )}
                  >
                    {server.lifecycleMode}
                  </Badge>
                ) : null}
              </div>

              <div className="flex items-start gap-4">
                {server.countryCode ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-cyan-500/20 bg-cyan-500/10 text-3xl">
                    {getCountryFlag(server.countryCode)}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{server.name}</h1>
                  <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                    {server.location || 'Managed Outline server'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {server.tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="rounded-full"
                        style={{ borderColor: tag.color, color: tag.color }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                variant="outline"
                className="h-11 rounded-full px-5"
                onClick={() => syncMutation.mutate({ id: serverId })}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className={cn('w-4 h-4 mr-2', syncMutation.isPending && 'animate-spin')} />
                {t('server_details.sync')}
              </Button>
              <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setEditDialogOpen(true)}>
                <Edit2 className="w-4 h-4 mr-2" />
                {t('server_details.edit')}
              </Button>
              <Button asChild className="h-11 rounded-full px-5">
                <Link href={`/dashboard/keys?server=${serverId}`}>
                  <Key className="w-4 h-4 mr-2" />
                  {t('server_details.keys.view_all')}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('health.explanation.title')}
              </p>
              <p className="mt-3 text-2xl font-semibold">{t(status.labelKey)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {server.healthCheck?.lastCheckedAt ? `Checked ${formatRelativeTime(server.healthCheck.lastCheckedAt)}` : 'No recent probe'}
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Active Keys
              </p>
              <p className="mt-3 text-2xl font-semibold">{activeKeyCount}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {server.accessKeys?.length || 0} total assigned
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('health.metrics.latency')}
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {server.healthCheck?.lastLatencyMs ? `${server.healthCheck.lastLatencyMs}ms` : '-'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {expiringSoonCount} keys expiring within 7 days
              </p>
            </div>
            <div className="ops-kpi-tile">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('health.metrics.uptime')}
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {server.healthCheck?.uptimePercent ? `${server.healthCheck.uptimePercent.toFixed(1)}%` : '-'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {server.lastSyncAt ? `Synced ${formatRelativeTime(server.lastSyncAt)}` : 'Sync pending'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {t('server_details.info.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('server_details.info.id')}</p>
                <p className="font-mono text-sm">{server.outlineServerId || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('server_details.info.version')}</p>
                <p className="font-mono text-sm">{server.outlineVersion || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('server_details.info.port')}</p>
                <p className="font-mono text-sm">{server.portForNewAccessKeys || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('server_details.info.hostname')}</p>
                <p className="font-mono text-sm">{server.hostnameForAccessKeys || '-'}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-2">{t('server_details.info.api_url')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono truncate">
                  {server.apiUrl}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    copyToClipboard(server.apiUrl, t('settings.toast.copied'), t('server_details.info.api_url') + ' copied.');
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">{t('server_details.info.last_synced')}</p>
              <p className="text-sm">
                {server.lastSyncAt
                  ? formatRelativeTime(server.lastSyncAt)
                  : t('health.metrics.never')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Health Card */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                {t('server_details.health.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center py-4">
                <div className={cn(
                  'w-24 h-24 rounded-full flex items-center justify-center',
                  `${status.bg}/20`
                )}>
                  <StatusIcon className={cn('w-12 h-12', status.color)} />
                </div>
              </div>

              <div className="text-center">
                <p className={cn('text-xl font-semibold', status.color)}>{t(status.labelKey)}</p>
                {server.healthCheck?.lastCheckedAt && (
                  <p className="text-sm text-muted-foreground">
                    {t('server_details.health.last_checked')} {formatRelativeTime(server.healthCheck.lastCheckedAt)}
                  </p>
                )}
              </div>

              {server.healthCheck && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{t('server_details.health.uptime')}</span>
                      <span>{server.healthCheck.uptimePercent.toFixed(1)}%</span>
                    </div>
                    <Progress value={server.healthCheck.uptimePercent} className="h-2" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('server_details.health.total_checks')}</span>
                    <span>{server.healthCheck.totalChecks}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('server_details.health.successful')}</span>
                    <span className="text-green-500">{server.healthCheck.successfulChecks}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('server_details.health.failed')}</span>
                    <span className="text-red-500">{server.healthCheck.failedChecks}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment Mode</CardTitle>
              <CardDescription>
                Control whether this server accepts new keys and migrations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={lifecycleMode} onValueChange={setLifecycleMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="DRAINING">Draining</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lifecycleNote">Operator Note</Label>
                <Input
                  id="lifecycleNote"
                  placeholder="Optional note shown to admins"
                  value={lifecycleNote}
                  onChange={(e) => setLifecycleNote(e.target.value)}
                />
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                <p>`Active` accepts new keys and migrations.</p>
                <p>`Draining` keeps existing keys but blocks new assignments.</p>
                <p>`Maintenance` blocks new assignments while the server is being worked on.</p>
              </div>

              {server.lifecycleChangedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last changed {formatRelativeTime(server.lifecycleChangedAt)}
                </p>
              ) : null}

              <Button onClick={handleSaveLifecycle} disabled={lifecycleMutation.isPending}>
                {lifecycleMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Mode
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Access Keys Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                {t('server_details.keys.title')}
              </CardTitle>
              <CardDescription>
                {server.accessKeys?.length || 0} {t('server_details.keys.subtitle')}
              </CardDescription>
            </div>
            <Button asChild>
              <Link href={`/dashboard/keys?server=${serverId}`}>
                {t('server_details.keys.view_all')}
                <ExternalLink className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {server.accessKeys && server.accessKeys.length > 0 ? (
            <div className="space-y-2">
              {server.accessKeys.slice(0, 5).map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div>
                    <Link
                      href={`/dashboard/keys/${key.id}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {key.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(key.usedBytes)} {t('server_details.keys.used')}
                      {key.dataLimitBytes && ` / ${formatBytes(key.dataLimitBytes)}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn(
                    key.status === 'ACTIVE' && 'border-green-500 text-green-500',
                    key.status === 'EXPIRED' && 'border-red-500 text-red-500',
                    key.status === 'DEPLETED' && 'border-orange-500 text-orange-500',
                  )}>
                    {key.status}
                  </Badge>
                </div>
              ))}
              {server.accessKeys.length > 5 && (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  And {server.accessKeys.length - 5} {t('server_details.keys.more')}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('server_details.keys.empty')}</p>
              <Button className="mt-4" asChild>
                <Link href={`/dashboard/keys?server=${serverId}`}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('server_details.keys.create')}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Shield className="w-5 h-5" />
            {t('server_details.danger.title')}
          </CardTitle>
          <CardDescription>
            {t('server_details.danger.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div>
              <p className="font-medium">{t('server_details.danger.remove_title')}</p>
              <p className="text-sm text-muted-foreground">
                {t('server_details.danger.remove_desc')}
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Trash2 className="w-4 h-4 mr-2" />
              {t('server_details.danger.remove_btn')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {server && (
        <EditServerDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          server={server}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
