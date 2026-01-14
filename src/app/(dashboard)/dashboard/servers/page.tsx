'use client';

/**
 * Servers Page
 * 
 * This page displays all configured Outline VPN servers with their status,
 * key counts, and health information. It provides actions to add new servers,
 * sync data, and manage existing servers.
 * 
 * The page uses a card-based layout that works well on both desktop and mobile,
 * with each server showing its key metrics at a glance. Clicking a server card
 * navigates to its detail page for more in-depth management.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { cn, getCountryFlag, COUNTRY_OPTIONS } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import {
  Plus,
  Server,
  Search,
  RefreshCw,
  MoreVertical,
  Trash2,
  Edit,
  Key,
  Activity,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Globe,
  ArrowUpDown,
  Zap,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';

/**
 * AddServerDialog Component
 * 
 * A modal dialog for adding new Outline servers to Atomic-UI. Users can either
 * paste the full JSON configuration from Outline Manager or manually enter
 * the API URL and certificate fingerprint.
 */
function AddServerDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [certSha256, setCertSha256] = useState('');
  const [configJson, setConfigJson] = useState('');
  const [location, setLocation] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [inputMode, setInputMode] = useState<'json' | 'manual'>('json');

  // Parse config mutation for extracting API URL and cert from JSON
  const parseConfigMutation = trpc.servers.parseConfig.useMutation({
    onSuccess: (data: { apiUrl: string; certSha256: string }) => {
      setApiUrl(data.apiUrl);
      setCertSha256(data.certSha256);
      toast({
        title: t('servers.toast.parsed'),
        description: t('servers.toast.parsed_desc'),
      });
    },
    onError: (error: { message: string }) => {
      toast({
        title: 'Parse failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Create server mutation
  const createMutation = trpc.servers.create.useMutation({
    onSuccess: () => {
      toast({
        title: t('servers.toast.added'),
        description: t('servers.toast.added_desc'),
      });
      onSuccess();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: 'Failed to add server',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setName('');
    setApiUrl('');
    setCertSha256('');
    setConfigJson('');
    setLocation('');
    setCountryCode('');
  };

  const handleParseConfig = () => {
    if (configJson.trim()) {
      parseConfigMutation.mutate({ config: configJson });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !apiUrl || !certSha256) {
      toast({
        title: 'Validation error',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      name,
      apiUrl,
      apiCertSha256: certSha256,
      location: location || undefined,
      countryCode: countryCode || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            {t('servers.dialog.add.title')}
          </DialogTitle>
          <DialogDescription>
            {t('servers.dialog.add.desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Input mode toggle */}
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              type="button"
              className={cn(
                'flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                inputMode === 'json'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setInputMode('json')}
            >
              {t('servers.dialog.paste_config')}
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                inputMode === 'manual'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setInputMode('manual')}
            >
              {t('servers.dialog.manual_entry')}
            </button>
          </div>

          {/* JSON config input */}
          {inputMode === 'json' && (
            <div className="space-y-2">
              <Label>{t('servers.dialog.config_label')}</Label>
              <textarea
                className="w-full h-24 px-3 py-2 text-sm bg-background border rounded-lg resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder='{"apiUrl":"https://...","certSha256":"..."}'
                value={configJson}
                onChange={(e) => setConfigJson(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleParseConfig}
                disabled={parseConfigMutation.isPending || !configJson.trim()}
              >
                {parseConfigMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {t('servers.dialog.parse')}
              </Button>
            </div>
          )}

          {/* Server name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('servers.dialog.name')}</Label>
            <Input
              id="name"
              placeholder="e.g., Singapore VPS"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* API URL */}
          <div className="space-y-2">
            <Label htmlFor="apiUrl">{t('servers.dialog.api_url')}</Label>
            <Input
              id="apiUrl"
              placeholder="https://your-server:port/secret"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              disabled={inputMode === 'json' && !!apiUrl}
            />
          </div>

          {/* Certificate SHA256 */}
          <div className="space-y-2">
            <Label htmlFor="certSha256">{t('servers.dialog.cert')}</Label>
            <Input
              id="certSha256"
              placeholder="64-character hex string"
              value={certSha256}
              onChange={(e) => setCertSha256(e.target.value)}
              disabled={inputMode === 'json' && !!certSha256}
            />
          </div>

          {/* Location and Country */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">{t('servers.dialog.location')}</Label>
              <Input
                id="location"
                placeholder="e.g., AWS Singapore"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('servers.dialog.country')}</Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {getCountryFlag(country.code)} {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('servers.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {t('servers.dialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ServerCard Component
 *
 * Displays a single server with its status, metrics, and quick actions.
 * The card is clickable and navigates to the server's detail page.
 */
function ServerCard({
  server,
  onSync,
  onDelete,
  isSyncing,
}: {
  server: {
    id: string;
    name: string;
    location: string | null;
    countryCode: string | null;
    isActive: boolean;
    lastSyncAt: Date | null;
    outlineVersion: string | null;
    _count?: { accessKeys: number };
    tags: Array<{ id: string; name: string; color: string }>;
    healthCheck: {
      lastStatus: string;
      lastLatencyMs: number | null;
      uptimePercent: number;
    } | null;
    metrics?: {
      totalBandwidth: bigint;
      activeKeys: number;
      totalKeys: number;
    };
  };
  onSync: () => void;
  onDelete: () => void;
  isSyncing?: boolean;
}) {
  const { t } = useLocale();
  const status = server.healthCheck?.lastStatus || 'UNKNOWN';

  const statusConfig = {
    UP: { color: 'text-green-500', bg: 'bg-green-500', icon: CheckCircle2, labelKey: 'servers.status.online' },
    DOWN: { color: 'text-red-500', bg: 'bg-red-500', icon: XCircle, labelKey: 'servers.status.offline' },
    SLOW: { color: 'text-yellow-500', bg: 'bg-yellow-500', icon: AlertTriangle, labelKey: 'servers.status.slow' },
    UNKNOWN: { color: 'text-gray-500', bg: 'bg-gray-500', icon: Activity, labelKey: 'servers.status.unknown' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.UNKNOWN;

  return (
    <Card className={cn(
      'group hover:border-primary/30 transition-all duration-200',
      !server.isActive && 'opacity-60'
    )}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {server.countryCode && (
              <span className="text-2xl">{getCountryFlag(server.countryCode)}</span>
            )}
            <div>
              <Link
                href={`/dashboard/servers/${server.id}`}
                className="font-semibold hover:text-primary transition-colors"
              >
                {server.name}
              </Link>
              {server.location && (
                <p className="text-sm text-muted-foreground">{server.location}</p>
              )}
            </div>
          </div>

          {/* Status indicator */}
          <div className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
            `${config.bg}/20 ${config.color}`
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', config.bg)} />
            {t(config.labelKey)}
          </div>
        </div>

        {/* Bandwidth metric - prominent display */}
        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpDown className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">{t('servers.total_bandwidth')}</span>
          </div>
          <p className="text-2xl font-bold">
            {server.metrics?.totalBandwidth
              ? formatBytes(server.metrics.totalBandwidth)
              : '0 B'}
          </p>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Key className="w-3 h-3 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold">{server.metrics?.totalKeys || 0}</p>
            <p className="text-xs text-muted-foreground">{t('servers.total_keys')}</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="w-3 h-3 text-green-500" />
            </div>
            <p className="text-lg font-semibold text-green-500">{server.metrics?.activeKeys || 0}</p>
            <p className="text-xs text-muted-foreground">{t('servers.active')}</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Activity className="w-3 h-3 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold">
              {server.healthCheck?.lastLatencyMs
                ? `${server.healthCheck.lastLatencyMs}ms`
                : '-'}
            </p>
            <p className="text-xs text-muted-foreground">{t('servers.latency')}</p>
          </div>
        </div>

        {/* Tags */}
        {server.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {server.tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                style={{ borderColor: tag.color, color: tag.color }}
                className="text-xs"
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="text-xs text-muted-foreground">
            {server.outlineVersion && `v${server.outlineVersion}`}
            {server.healthCheck?.uptimePercent !== undefined && (
              <span className="ml-2">
                {t('servers.uptime')}: {server.healthCheck.uptimePercent.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={isSyncing}
              title={t('servers.actions.sync')}
            >
              <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
            </Button>
            <Link href={`/dashboard/servers/${server.id}`}>
              <Button variant="ghost" size="sm" title={t('servers.actions.view')}>
                <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
              title={t('servers.actions.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ServersPage Component
 * 
 * The main servers listing page that shows all configured servers
 * with their status and provides management actions.
 */
export default function ServersPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [syncingServerId, setSyncingServerId] = useState<string | null>(null);

  // Fetch servers list
  const { data: servers, isLoading, refetch } = trpc.servers.list.useQuery({
    includeInactive: true,
  });

  // Sync server mutation
  const syncMutation = trpc.servers.sync.useMutation({
    onSuccess: (result) => {
      toast({
        title: t('servers.toast.synced'),
        description: `Found ${result.keysFound} keys. Created ${result.keysCreated}, removed ${result.keysRemoved}.`,
      });
      refetch();
      setSyncingServerId(null);
    },
    onError: (error) => {
      toast({
        title: 'Sync failed',
        description: error.message,
        variant: 'destructive',
      });
      setSyncingServerId(null);
    },
  });

  // Delete server mutation
  const deleteMutation = trpc.servers.delete.useMutation({
    onSuccess: () => {
      toast({
        title: t('servers.toast.deleted'),
        description: t('servers.toast.deleted_desc'),
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

  // Filter servers by search query
  const filteredServers = servers?.filter((server) =>
    server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    server.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSync = (serverId: string) => {
    setSyncingServerId(serverId);
    syncMutation.mutate({ id: serverId });
  };

  const handleDelete = (serverId: string, serverName: string) => {
    if (confirm(`${t('servers.confirm_delete')} "${serverName}"?\n\n${t('servers.confirm_delete_desc')}`)) {
      deleteMutation.mutate({ id: serverId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('servers.title')}</h1>
          <p className="text-muted-foreground">
            {t('servers.subtitle')}
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('servers.add')}
        </Button>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('servers.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
          {t('servers.refresh')}
        </Button>
      </div>

      {/* Server grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-52 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredServers && filteredServers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onSync={() => handleSync(server.id)}
              onDelete={() => handleDelete(server.id, server.name)}
              isSyncing={syncingServerId === server.id && syncMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Globe className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('servers.empty.title')}</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              {searchQuery
                ? t('servers.empty.no_match')
                : t('servers.empty.start')}
            </p>
            {!searchQuery && (
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('servers.empty.add_first')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add server dialog */}
      <AddServerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
