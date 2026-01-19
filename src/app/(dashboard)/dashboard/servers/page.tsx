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
import { Progress } from '@/components/ui/progress';
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
  Cloud,
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

          {/* Installation Instructions */}
          {inputMode === 'json' && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">1</span>
                  <p className="text-sm font-medium">{t('servers.dialog.install_step1') || 'Log into your server, and run this command.'}</p>
                </div>
              </div>

              <div className="relative group">
                <div className="p-3 bg-slate-950 rounded-md font-mono text-xs text-slate-50 break-all pr-12">
                  sudo bash -c &quot;$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-apps/master/server_manager/install_scripts/install_server.sh)&quot;
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 text-slate-400 hover:text-white hover:bg-slate-800 h-8 w-8"
                  onClick={() => {
                    navigator.clipboard.writeText('sudo bash -c "$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-apps/master/server_manager/install_scripts/install_server.sh)"');
                    toast({ description: 'Command copied to clipboard' });
                  }}
                >
                  <RefreshCw className="w-4 h-4 rotate-0 scale-100 transition-all dark:rotate-0 dark:scale-100 hidden" />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                  >
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">2</span>
                <p className="text-sm font-medium">{t('servers.dialog.install_step2') || 'Paste your installation output here.'}</p>
              </div>
            </div>
          )}

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
    apiUrl: string;
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

  // Heuristic to check if server is local (localhost or 127.0.0.1)
  // In a real multi-server setup, we might need a dedicated flag in the DB
  const isLocal = server.apiUrl.includes('localhost') || server.apiUrl.includes('127.0.0.1');

  return (
    <Card className={cn(
      'group hover:border-primary/30 transition-all duration-200 flex flex-col',
      !server.isActive && 'opacity-60'
    )}>
      <CardContent className="p-5 flex-1">
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
              <Zap className="w-3 h-3 text-emerald-500" />
            </div>
            {/* Live Stats Component - Online connections */}
            <ServerLiveStats serverId={server.id} defaultActive={server.metrics?.activeKeys || 0} />
            <p className="text-xs text-muted-foreground">{t('servers.active')}</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Key className="w-3 h-3 text-primary" />
            </div>
            {/* Total active keys count from DB */}
            <p className="text-lg font-semibold text-primary">
              {server.metrics?.activeKeys || 0}
            </p>
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

        {/* System Stats (Local Server Only) */}
        {isLocal && (
          <ServerSystemStats />
        )}

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
      </CardContent>

      {/* Footer Actions */}
      <div className="px-5 py-3 border-t border-border/50 bg-muted/10">
        <div className="flex items-center justify-between">
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
      </div>
    </Card>
  );
}

/**
 * ServerSystemStats Component
 * Fetches and displays real-time system stats (CPU, RAM, Disk)
 */
function ServerSystemStats() {
  // Poll every 5 seconds
  const { data: stats, isLoading } = trpc.system.getStats.useQuery(undefined, {
    refetchInterval: 5000,
  });

  if (isLoading || !stats) return null;

  // Helper for color coding usage
  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 75) return 'bg-yellow-500';
    return 'bg-primary';
  };

  return (
    <div className="mb-4 space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">CPU ({stats.cpu.cores} cores)</span>
          <span className="font-medium">{stats.cpu.percent}%</span>
        </div>
        <Progress value={stats.cpu.percent} className="h-1.5" indicatorClassName={getUsageColor(stats.cpu.percent)} />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">RAM ({formatBytes(stats.memory.total)})</span>
          <span className="font-medium">{stats.memory.percent}%</span>
        </div>
        <Progress value={stats.memory.percent} className="h-1.5" indicatorClassName={getUsageColor(stats.memory.percent)} />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Disk ({formatBytes(stats.disk.total)})</span>
          <span className="font-medium">{stats.disk.percent}%</span>
        </div>
        <Progress value={stats.disk.percent} className="h-1.5" indicatorClassName={getUsageColor(stats.disk.percent)} />
      </div>

      <div className="pt-1 flex justify-between items-center text-xs text-muted-foreground border-t border-border/50 mt-2">
        <span>System Uptime:</span>
        <span className="font-mono">{new Date(stats.os.uptime * 1000).toISOString().substr(11, 8)}</span>
      </div>
    </div>
  );
}

/**
 * ServerLiveStats Component
 * Display live active connections by measuring traffic delta
 */
function ServerLiveStats({ serverId, defaultActive }: { serverId: string, defaultActive: number }) {
  // Poll every 10 seconds to avoid overwhelming the server
  const { data: stats } = trpc.servers.getLiveStats.useQuery({ id: serverId }, {
    refetchInterval: 10000,
    placeholderData: { activeConnections: defaultActive, bandwidthBps: 0 } as any,
  });

  return (
    <span className="text-lg font-semibold text-emerald-500 block min-w-[20px]">
      {stats ? stats.activeConnections : defaultActive}
    </span>
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
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/dashboard/servers/deploy">
              <Cloud className="mr-2 h-4 w-4" />
              Deploy New
            </Link>
          </Button>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('servers.add')}
          </Button>
        </div>
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
