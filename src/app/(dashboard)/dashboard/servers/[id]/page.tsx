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

import { useState } from 'react';
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
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag, COUNTRY_OPTIONS } from '@/lib/utils';
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
  Clock,
  Loader2,
  Globe,
  Shield,
  Wifi,
  BarChart3,
  ExternalLink,
  Copy,
  QrCode,
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
        title: 'Server updated',
        description: 'The server has been updated successfully.',
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
          <DialogTitle>Edit Server</DialogTitle>
          <DialogDescription>
            Update server metadata and organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Server Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g., AWS Singapore"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
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
              <Label>Tags</Label>
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
              Set as default server for new keys
            </Label>
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
 * ServerDetailPage Component
 * 
 * The main server detail page showing comprehensive server information.
 */
export default function ServerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const serverId = params.id as string;

  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Fetch server details
  const { data: server, isLoading, refetch } = trpc.servers.getById.useQuery(
    { id: serverId },
    { enabled: !!serverId }
  );

  // Sync mutation
  const syncMutation = trpc.servers.sync.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Server synced',
        description: `Found ${result.keysFound} keys. Created ${result.keysCreated}, removed ${result.keysRemoved}.`,
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Sync failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = trpc.servers.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Server deleted',
        description: 'The server has been removed from Atomic-UI.',
      });
      router.push('/dashboard/servers');
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDelete = () => {
    if (confirm(`Are you sure you want to remove "${server?.name}" from Atomic-UI?\n\nNote: This will NOT delete keys from the actual Outline server.`)) {
      deleteMutation.mutate({ id: serverId });
    }
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
        <h2 className="text-xl font-semibold mb-2">Server not found</h2>
        <p className="text-muted-foreground mb-6">
          The requested server could not be found.
        </p>
        <Button asChild>
          <Link href="/dashboard/servers">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Servers
          </Link>
        </Button>
      </div>
    );
  }

  const healthStatus = server.healthCheck?.lastStatus || 'UNKNOWN';
  const statusConfig = {
    UP: { color: 'text-green-500', bg: 'bg-green-500', icon: CheckCircle2, label: 'Online' },
    DOWN: { color: 'text-red-500', bg: 'bg-red-500', icon: XCircle, label: 'Offline' },
    SLOW: { color: 'text-yellow-500', bg: 'bg-yellow-500', icon: AlertTriangle, label: 'Slow' },
    UNKNOWN: { color: 'text-gray-500', bg: 'bg-gray-500', icon: Activity, label: 'Unknown' },
  };
  const status = statusConfig[healthStatus as keyof typeof statusConfig] || statusConfig.UNKNOWN;
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/servers">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {server.countryCode && (
              <span className="text-3xl">{getCountryFlag(server.countryCode)}</span>
            )}
            <div>
              <h1 className="text-2xl font-bold">{server.name}</h1>
              {server.location && (
                <p className="text-muted-foreground">{server.location}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate({ id: serverId })}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', syncMutation.isPending && 'animate-spin')} />
            Sync
          </Button>
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Tags */}
      {server.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {server.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              style={{ borderColor: tag.color, color: tag.color }}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', `${status.bg}/20`)}>
              <StatusIcon className={cn('w-5 h-5', status.color)} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-semibold">{status.label}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Access Keys</p>
              <p className="text-lg font-semibold">{server.accessKeys?.length || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Wifi className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Latency</p>
              <p className="text-lg font-semibold">
                {server.healthCheck?.lastLatencyMs
                  ? `${server.healthCheck.lastLatencyMs}ms`
                  : '-'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <BarChart3 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Uptime</p>
              <p className="text-lg font-semibold">
                {server.healthCheck?.uptimePercent
                  ? `${server.healthCheck.uptimePercent.toFixed(1)}%`
                  : '-'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Server Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Server ID</p>
                <p className="font-mono text-sm">{server.outlineServerId || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="font-mono text-sm">{server.outlineVersion || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Port for New Keys</p>
                <p className="font-mono text-sm">{server.portForNewAccessKeys || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hostname</p>
                <p className="font-mono text-sm">{server.hostnameForAccessKeys || '-'}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-2">API URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono truncate">
                  {server.apiUrl}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    navigator.clipboard.writeText(server.apiUrl);
                    toast({ title: 'Copied!', description: 'API URL copied to clipboard.' });
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Last Synced</p>
              <p className="text-sm">
                {server.lastSyncAt
                  ? formatRelativeTime(server.lastSyncAt)
                  : 'Never'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Health Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Health Status
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
              <p className={cn('text-xl font-semibold', status.color)}>{status.label}</p>
              {server.healthCheck?.lastCheckedAt && (
                <p className="text-sm text-muted-foreground">
                  Last checked {formatRelativeTime(server.healthCheck.lastCheckedAt)}
                </p>
              )}
            </div>

            {server.healthCheck && (
              <div className="space-y-3 pt-4 border-t border-border">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Uptime</span>
                    <span>{server.healthCheck.uptimePercent.toFixed(1)}%</span>
                  </div>
                  <Progress value={server.healthCheck.uptimePercent} className="h-2" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Checks</span>
                  <span>{server.healthCheck.totalChecks}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Successful</span>
                  <span className="text-green-500">{server.healthCheck.successfulChecks}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Failed</span>
                  <span className="text-red-500">{server.healthCheck.failedChecks}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Access Keys Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                Access Keys
              </CardTitle>
              <CardDescription>
                {server.accessKeys?.length || 0} key(s) on this server
              </CardDescription>
            </div>
            <Button asChild>
              <Link href={`/dashboard/keys?server=${serverId}`}>
                View All Keys
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
                      {formatBytes(key.usedBytes)} used
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
                  And {server.accessKeys.length - 5} more...
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No access keys on this server yet.</p>
              <Button className="mt-4" asChild>
                <Link href={`/dashboard/keys?server=${serverId}`}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Key
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
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions that affect this server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div>
              <p className="font-medium">Remove Server</p>
              <p className="text-sm text-muted-foreground">
                Remove this server from Atomic-UI. Keys on the Outline server will not be deleted.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Trash2 className="w-4 h-4 mr-2" />
              Remove
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
