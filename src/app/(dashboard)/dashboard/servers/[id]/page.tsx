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

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
  CartesianGrid as RechartsCartesianGrid,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogSectionDescription,
  DialogSectionHeader,
  DialogSectionTitle,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { hasOutageManageScope } from '@/lib/admin-scope';
import { cn, formatBytes, formatRelativeTime, getCountryFlag, COUNTRY_OPTIONS } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { ServerLifecycleBadge } from '@/components/servers/server-lifecycle-badge';
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
  Gauge,
  ArrowRightLeft,
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
      <DialogContent className="max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
          <DialogTitle>{t('server_details.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('server_details.edit.desc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>Server identity</DialogSectionTitle>
                <DialogSectionDescription>
                  Update the name, location, and display tags used across routing, health, and reporting views.
                </DialogSectionDescription>
              </DialogSectionHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('server_details.edit.name')}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </div>
            </DialogSection>

            {tags && tags.length > 0 && (
              <DialogSection>
                <DialogSectionHeader>
                  <DialogSectionTitle>{t('server_details.edit.tags')}</DialogSectionTitle>
                  <DialogSectionDescription>
                    Highlight which routing or reporting groups this server should appear in.
                  </DialogSectionDescription>
                </DialogSectionHeader>
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
                        'rounded-full px-3 py-1 text-sm font-medium transition-all',
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
              </DialogSection>
            )}

            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>Default routing behavior</DialogSectionTitle>
                <DialogSectionDescription>
                  Mark this server as a default target when new items need a preferred home.
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/55 px-4 py-3 dark:bg-white/[0.03]">
                <div className="space-y-0.5">
                  <Label htmlFor="isDefault" className="text-sm font-medium">
                    {t('server_details.edit.default')}
                  </Label>
                </div>
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-gray-300"
                />
              </div>
            </DialogSection>
          </DialogBody>

          <DialogFooter className="ops-modal-sticky-footer">
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
  const [detailTab, setDetailTab] = useState<'health' | 'lifecycle' | 'outage' | 'history'>('health');
  const [lifecycleMode, setLifecycleMode] = useState('ACTIVE');
  const [allowManualAssignmentsWhenDraining, setAllowManualAssignmentsWhenDraining] = useState(false);
  const [lifecycleNote, setLifecycleNote] = useState('');
  const [outageTargetServerId, setOutageTargetServerId] = useState('none');
  const [outageGraceHours, setOutageGraceHours] = useState('3');
  const [outageNotifyUsers, setOutageNotifyUsers] = useState(true);
  const [outageFollowUpMessage, setOutageFollowUpMessage] = useState(
    'We are still working on the replacement. Please wait a little longer while we prepare the new server.',
  );
  const [manualNoticeType, setManualNoticeType] = useState<'ISSUE' | 'DOWNTIME' | 'MAINTENANCE'>('ISSUE');
  const [manualNoticeMessage, setManualNoticeMessage] = useState(
    'We found an issue on this server. Please wait while we stabilize the route. We will update you again if a replacement is needed.',
  );
  const [latencyThresholdMs, setLatencyThresholdMs] = useState('500');
  const [slowAutoDrainEnabled, setSlowAutoDrainEnabled] = useState(true);
  const [slowAutoDrainThreshold, setSlowAutoDrainThreshold] = useState('3');
  const [slowAutoMigrateEnabled, setSlowAutoMigrateEnabled] = useState(false);
  const [slowAutoMigrateThreshold, setSlowAutoMigrateThreshold] = useState('6');
  const [slowAutoMigrateGraceHours, setSlowAutoMigrateGraceHours] = useState('2');
  const [slowUserNotifyEnabled, setSlowUserNotifyEnabled] = useState(true);
  const [slowUserNotifyThreshold, setSlowUserNotifyThreshold] = useState('3');
  const [slowUserNotifyCooldownMins, setSlowUserNotifyCooldownMins] = useState('180');
  const currentUserQuery = trpc.auth.me.useQuery();
  const canManageOutages = hasOutageManageScope(currentUserQuery.data?.adminScope);

  // Fetch server details
  const { data: server, isLoading, refetch } = trpc.servers.getById.useQuery(
    { id: serverId },
    { enabled: !!serverId }
  );
  const { data: allServers } = trpc.servers.list.useQuery(
    { includeInactive: true },
    { enabled: !!serverId },
  );
  const outagePreviewQuery = trpc.servers.migrationPreview.useQuery(
    {
      sourceServerId: serverId,
      targetServerId: outageTargetServerId,
    },
    {
      enabled: !!serverId && outageTargetServerId !== 'none',
    },
  );
  const outageHistoryQuery = trpc.servers.outageHistory.useQuery(
    { serverId, limit: 6 },
    { enabled: !!serverId },
  );
  const healthDiagnosticsQuery = trpc.servers.healthDiagnostics.useQuery(
    { id: serverId, limit: 36 },
    { enabled: !!serverId },
  );
  const loadStatsQuery = trpc.servers.getLoadStats.useQuery(undefined, {
    enabled: !!serverId,
  });
  const recommendedAssignmentTargetQuery = trpc.servers.recommendAssignmentTarget.useQuery(
    undefined,
    { enabled: !!serverId },
  );
  const recommendedFallbackTargetQuery = trpc.servers.recommendFallbackTarget.useQuery(
    { sourceServerId: serverId },
    { enabled: !!serverId },
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
  const outageReplaceMutation = trpc.servers.outageReplace.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Outage replacement completed',
        description:
          result.failed > 0
            ? `${result.migrated} keys moved, ${result.failed} still need attention.`
            : `${result.migrated} keys moved to ${result.targetServer.name}.`,
      });
      refetch();
      outageHistoryQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Outage replacement failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const outageFollowUpMutation = trpc.servers.sendOutageFollowUp.useMutation({
    onSuccess: (result, variables) => {
      toast({
        title: variables.markRecovered ? 'Recovery update sent' : 'Outage follow-up sent',
        description: `Telegram update sent to ${result.sentToTelegramUsers} affected user(s).`,
      });
      refetch();
      outageHistoryQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to send outage update',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const manualNoticeMutation = trpc.servers.sendTelegramIssueNotice.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Telegram issue notice sent',
        description: `Sent the update to ${result.sentCount} user(s).`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to send Telegram notice',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const slowPolicyMutation = trpc.servers.updateSlowPolicy.useMutation({
    onSuccess: () => {
      toast({
        title: 'Slow policy updated',
        description: 'Per-server degradation safeguards were saved.',
      });
      refetch();
      healthDiagnosticsQuery.refetch();
      recommendedFallbackTargetQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to update slow policy',
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
    setAllowManualAssignmentsWhenDraining(server.allowManualAssignmentsWhenDraining ?? false);
    setLifecycleNote(server.lifecycleNote || '');
    setLatencyThresholdMs(String(server.healthCheck?.latencyThresholdMs ?? 500));
    setSlowAutoDrainEnabled(server.healthCheck?.slowAutoDrainEnabled ?? true);
    setSlowAutoDrainThreshold(String(server.healthCheck?.slowAutoDrainThreshold ?? 3));
    setSlowAutoMigrateEnabled(server.healthCheck?.slowAutoMigrateEnabled ?? false);
    setSlowAutoMigrateThreshold(String(server.healthCheck?.slowAutoMigrateThreshold ?? 6));
    setSlowAutoMigrateGraceHours(String(server.healthCheck?.slowAutoMigrateGraceHours ?? 2));
    setSlowUserNotifyEnabled(server.healthCheck?.slowUserNotifyEnabled ?? true);
    setSlowUserNotifyThreshold(String(server.healthCheck?.slowUserNotifyThreshold ?? 3));
    setSlowUserNotifyCooldownMins(String(server.healthCheck?.slowUserNotifyCooldownMins ?? 180));
  }, [server]);

  const loadStatsByServerId = useMemo(() => {
    return new Map((loadStatsQuery.data || []).map((item) => [item.serverId, item]));
  }, [loadStatsQuery.data]);

  const availableOutageTargets = useMemo(() => {
    return (allServers || [])
      .filter(
        (candidate) =>
          candidate.id !== serverId &&
          candidate.isActive &&
          (candidate.lifecycleMode || 'ACTIVE') === 'ACTIVE',
      )
      .sort((left, right) => {
        const leftLoad = loadStatsByServerId.get(left.id);
        const rightLoad = loadStatsByServerId.get(right.id);
        if ((leftLoad?.isAssignable ?? false) !== (rightLoad?.isAssignable ?? false)) {
          return leftLoad?.isAssignable ? -1 : 1;
        }
        if ((leftLoad?.loadScore ?? Number.MAX_SAFE_INTEGER) !== (rightLoad?.loadScore ?? Number.MAX_SAFE_INTEGER)) {
          return (leftLoad?.loadScore ?? Number.MAX_SAFE_INTEGER) - (rightLoad?.loadScore ?? Number.MAX_SAFE_INTEGER);
        }
        return left.name.localeCompare(right.name);
      });
  }, [allServers, loadStatsByServerId, serverId]);

  useEffect(() => {
    if (outageTargetServerId !== 'none') {
      return;
    }

    const recommended = recommendedFallbackTargetQuery.data?.selected || recommendedAssignmentTargetQuery.data;
    if (!recommended?.serverId) {
      return;
    }

    if (availableOutageTargets.some((candidate) => candidate.id === recommended.serverId)) {
      setOutageTargetServerId(recommended.serverId);
    }
  }, [availableOutageTargets, outageTargetServerId, recommendedAssignmentTargetQuery.data, recommendedFallbackTargetQuery.data]);

  const currentOutageState = (server?.outageState as any) || null;
  const healthDiagnostics = healthDiagnosticsQuery.data;
  const latencyTrend = useMemo(
    () =>
      (healthDiagnostics?.metrics || []).map((row: any) => ({
        label: new Date(row.recordedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        latencyMs: row.latencyMs,
        status: row.healthStatus || 'UNKNOWN',
      })),
    [healthDiagnostics],
  );
  const activeOutageIncident = currentOutageState?.incidentId
    ? outageHistoryQuery.data?.find((incident: any) => incident.id === currentOutageState.incidentId) || null
    : null;
  const activeOutageTotal = activeOutageIncident?.initialAffectedKeyCount ?? currentOutageState?.initialAffectedKeyCount ?? 0;
  const activeOutageMigrated = activeOutageIncident?.migratedKeyCount ?? currentOutageState?.migratedKeyCount ?? 0;
  const activeOutageFailed = activeOutageIncident?.failedKeyCount ?? currentOutageState?.failedKeyCount ?? 0;
  const recommendedFallbackTarget = recommendedFallbackTargetQuery.data?.selected || healthDiagnostics?.current?.fallbackTarget || null;
  const activeOutageProgress = activeOutageTotal > 0 ? Math.round((activeOutageMigrated / activeOutageTotal) * 100) : 0;
  const currentServerLoad = loadStatsByServerId.get(serverId);
  const recommendedAssignmentTarget = recommendedAssignmentTargetQuery.data || null;

  const handleDelete = () => {
    if (confirm(`${t('server_details.danger.confirm')} "${server?.name}" from Atomic-UI?\n\n${t('server_details.danger.confirm_desc')}`)) {
      deleteMutation.mutate({ id: serverId });
    }
  };

  const handleSaveLifecycle = () => {
    lifecycleMutation.mutate({
      id: serverId,
      lifecycleMode: lifecycleMode as 'ACTIVE' | 'DRAINING' | 'MAINTENANCE',
      allowManualAssignmentsWhenDraining: lifecycleMode === 'DRAINING',
      lifecycleNote: lifecycleNote.trim() || undefined,
    });
  };

  const handleSaveSlowPolicy = () => {
    slowPolicyMutation.mutate({
      serverId,
      latencyThresholdMs: Number(latencyThresholdMs) || 500,
      slowAutoDrainEnabled,
      slowAutoDrainThreshold: Number(slowAutoDrainThreshold) || 3,
      slowAutoMigrateEnabled,
      slowAutoMigrateThreshold: Number(slowAutoMigrateThreshold) || 6,
      slowAutoMigrateGraceHours: Number(slowAutoMigrateGraceHours) || 2,
      slowUserNotifyEnabled,
      slowUserNotifyThreshold: Number(slowUserNotifyThreshold) || 3,
      slowUserNotifyCooldownMins: Number(slowUserNotifyCooldownMins) || 180,
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
      <section className="xl:hidden ops-hero">
        <div className="space-y-5">
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
            <Badge variant="outline" className={cn('rounded-full px-3 py-1', status.color)}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {t(status.labelKey)}
            </Badge>
            <ServerLifecycleBadge mode={server.lifecycleMode} showActive className="rounded-full px-3 py-1" />
          </div>

          <div className="flex items-start gap-4">
            {server.countryCode ? (
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.35rem] border border-cyan-500/20 bg-cyan-500/10 text-3xl">
                {getCountryFlag(server.countryCode)}
              </div>
            ) : null}
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">{server.name}</h1>
              <p className="text-sm text-muted-foreground">
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

          <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="grid gap-2 sm:grid-cols-3">
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
            <Button asChild className="h-11 rounded-full px-5 sm:col-span-1">
              <Link href={`/dashboard/keys?server=${serverId}`}>
                <Key className="w-4 h-4 mr-2" />
                {t('server_details.keys.view_all')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="hidden xl:block ops-hero">
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
                <ServerLifecycleBadge mode={server.lifecycleMode} showActive className="rounded-full px-3 py-1" />
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

      <div className="ops-panel space-y-3 p-3 sm:p-4">
        <div className="space-y-1">
          <p className="ops-section-heading">Server workspace</p>
          <p className="text-sm text-muted-foreground">
            {{
              health: 'Health and diagnostics for current latency, uptime, and smart fallback behavior.',
              lifecycle: 'Assignment controls, routing policy, current keys, and destructive server actions.',
              outage: 'Replacement workflows, migration progress, and user-facing outage notifications.',
              history: 'Past outages, follow-ups, and recovery history for this server.',
            }[detailTab]}
          </p>
        </div>
        <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as 'health' | 'lifecycle' | 'outage' | 'history')}>
          <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-[1.2rem] border border-border/60 bg-background/45 p-1 sm:grid-cols-4 dark:bg-white/[0.03]">
            <TabsTrigger value="health" className="rounded-[0.95rem] px-3 py-2 text-sm">Health</TabsTrigger>
            <TabsTrigger value="lifecycle" className="rounded-[0.95rem] px-3 py-2 text-sm">Lifecycle</TabsTrigger>
            <TabsTrigger value="outage" className="rounded-[0.95rem] px-3 py-2 text-sm">Outage</TabsTrigger>
            <TabsTrigger value="history" className="rounded-[0.95rem] px-3 py-2 text-sm">History</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {detailTab === 'health' ? (
      <div className="ops-showcase-grid">
        {/* Server Info */}
        <Card className="ops-detail-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {t('server_details.info.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="ops-inline-stat">
                <p className="text-sm text-muted-foreground">{t('server_details.info.id')}</p>
                <p className="font-mono text-sm">{server.outlineServerId || '-'}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-sm text-muted-foreground">{t('server_details.info.version')}</p>
                <p className="font-mono text-sm">{server.outlineVersion || '-'}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-sm text-muted-foreground">{t('server_details.info.port')}</p>
                <p className="font-mono text-sm">{server.portForNewAccessKeys || '-'}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-sm text-muted-foreground">{t('server_details.info.hostname')}</p>
                <p className="font-mono text-sm">{server.hostnameForAccessKeys || '-'}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-2">{t('server_details.info.api_url')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-2xl border border-border/60 bg-background/55 px-3 py-3 text-xs font-mono truncate dark:bg-white/[0.03]">
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

            <div className="ops-inline-stat">
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
        <div className="ops-detail-rail">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                {t('server_details.health.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center py-4">
                <div className={cn(
                  'flex h-24 w-24 items-center justify-center rounded-full border',
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
                <div className="space-y-3 border-t border-border/60 pt-4">
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

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-primary" />
                Latency diagnostics
              </CardTitle>
              <CardDescription>
                Compare live latency against the slow threshold, see repeated-slow behavior, and confirm whether auto-drain or Telegram user notices have triggered.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {healthDiagnosticsQuery.isLoading ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  Loading latency diagnostics…
                </div>
              ) : healthDiagnostics ? (
                <>
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current reason</p>
                      <p className="mt-1 text-sm font-medium">{healthDiagnostics.current.reason}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Slow streak</p>
                      <p className="mt-1 text-xl font-semibold">{healthDiagnostics.current.slowConsecutiveCount}</p>
                      <p className="text-xs text-muted-foreground">
                        Auto-drain at {healthDiagnostics.current.autoDrainThreshold} consecutive slow checks
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Auto-drain</p>
                      <p className="mt-1 text-sm font-medium">
                        {healthDiagnostics.current.autoDrainEnabled
                          ? healthDiagnostics.current.autoDrainActive
                            ? 'Active now'
                            : 'Armed'
                          : 'Disabled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {healthDiagnostics.current.autoDrainEnabled
                          ? `Threshold ${healthDiagnostics.current.autoDrainThreshold} slow checks`
                          : 'No automatic drain'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Auto-migrate</p>
                      <p className="mt-1 text-sm font-medium">
                        {healthDiagnostics.current.autoMigrateEnabled
                          ? `After ${healthDiagnostics.current.autoMigrateThreshold} slow checks`
                          : 'Disabled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Wait window {healthDiagnostics.current.autoMigrateGraceHours} hour(s)
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">User notice</p>
                      <p className="mt-1 text-sm font-medium">
                        {healthDiagnostics.current.slowUserAlertSentAt
                          ? `Sent ${formatRelativeTime(healthDiagnostics.current.slowUserAlertSentAt)}`
                          : healthDiagnostics.current.userNotifyEnabled
                            ? `After ${healthDiagnostics.current.userNotifyThreshold} slow checks`
                            : 'Disabled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cooldown {healthDiagnostics.current.userNotifyCooldownMins} min
                      </p>
                    </div>
                  </div>

                  {healthDiagnostics.current.fallbackTarget ? (
                    <div className="rounded-[1rem] border border-cyan-500/15 bg-cyan-500/5 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">
                            Smart fallback: {healthDiagnostics.current.fallbackTarget.serverName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {healthDiagnostics.current.fallbackTarget.healthStatus || 'UNKNOWN'} health
                            {typeof healthDiagnostics.current.fallbackTarget.healthLatencyMs === 'number'
                              ? ` · ${healthDiagnostics.current.fallbackTarget.healthLatencyMs}ms`
                              : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">load {healthDiagnostics.current.fallbackTarget.loadScore}</Badge>
                          {healthDiagnostics.current.fallbackTarget.sameCountry ? (
                            <Badge variant="outline">same region</Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {healthDiagnostics.current.status === 'SLOW' ? (
                    <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      <span className="font-medium">Slow-server reason:</span> {healthDiagnostics.current.reason}
                    </div>
                  ) : null}

                  <div className="rounded-[1.1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Threshold {healthDiagnostics.current.thresholdMs}ms</Badge>
                      <Badge variant="outline">UP {healthDiagnostics.statusBreakdown.up}</Badge>
                      <Badge variant="outline">SLOW {healthDiagnostics.statusBreakdown.slow}</Badge>
                      <Badge variant="outline">DOWN {healthDiagnostics.statusBreakdown.down}</Badge>
                    </div>
                    {latencyTrend.length > 0 ? (
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart data={latencyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <RechartsCartesianGrid strokeDasharray="3 10" stroke="rgba(125, 211, 252, 0.1)" vertical={false} />
                            <RechartsXAxis
                              dataKey="label"
                              stroke="rgba(186, 230, 253, 0.58)"
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                              tickMargin={8}
                            />
                            <RechartsYAxis
                              stroke="rgba(186, 230, 253, 0.44)"
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => `${Math.round(value)}ms`}
                              width={52}
                            />
                            <RechartsTooltip
                              content={({ active, payload, label }) =>
                                active && payload && payload.length ? (
                                  <div className="rounded-xl border border-cyan-400/18 bg-[rgba(5,12,26,0.94)] p-3 text-xs text-white shadow-[0_18px_36px_rgba(1,6,20,0.55)]">
                                    <p className="font-semibold text-cyan-100">{label}</p>
                                    <p className="mt-2">Latency: {payload[0]?.value ? `${payload[0].value}ms` : 'n/a'}</p>
                                    <p>Status: {payload[0]?.payload?.status || 'UNKNOWN'}</p>
                                  </div>
                                ) : null
                              }
                            />
                            <ReferenceLine
                              y={healthDiagnostics.current.thresholdMs}
                              stroke="rgba(251,191,36,0.9)"
                              strokeDasharray="6 6"
                            />
                            <RechartsLine
                              type="monotone"
                              dataKey="latencyMs"
                              name="Latency"
                              stroke="rgba(56,189,248,0.95)"
                              strokeWidth={2.5}
                              dot={false}
                              connectNulls={false}
                            />
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="rounded-[1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                        No latency history yet. New health metrics will appear after a few scheduled checks.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  No health diagnostics available for this server yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      ) : null}

      {detailTab === 'lifecycle' ? (
      <div className="space-y-6">
          <Card className="ops-detail-card">
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

              <div className="rounded-[1.2rem] border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground dark:bg-white/[0.03]">
                <p>`Active` accepts new keys and migrations.</p>
                <p>`Draining` keeps existing keys, blocks auto-placement, and still allows explicit admin key creation.</p>
                <p>`Maintenance` blocks all new assignments while the server is being worked on.</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    mode: 'ACTIVE',
                    title: 'Active',
                    desc: 'Normal placement and migrations allowed.',
                    onSelect: () => {
                      setLifecycleMode('ACTIVE');
                      setAllowManualAssignmentsWhenDraining(false);
                    },
                  },
                  {
                    mode: 'DRAINING',
                    title: 'Draining',
                    desc: 'Auto-placement stops, but admins can still create keys manually.',
                    onSelect: () => {
                      setLifecycleMode('DRAINING');
                      setAllowManualAssignmentsWhenDraining(true);
                    },
                  },
                  {
                    mode: 'MAINTENANCE',
                    title: 'Maintenance',
                    desc: 'Stops assignments and enables planned-maintenance outage handling.',
                    onSelect: () => {
                      setLifecycleMode('MAINTENANCE');
                      setAllowManualAssignmentsWhenDraining(false);
                    },
                  },
                ].map((option) => (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={option.onSelect}
                    className={cn(
                      'rounded-[1rem] border p-3 text-left transition-colors',
                      (
                        option.mode === 'DRAINING'
                          ? lifecycleMode === 'DRAINING'
                          : lifecycleMode === option.mode
                      )
                        ? 'border-cyan-500/40 bg-cyan-500/10'
                        : 'border-border/50 bg-background/30 hover:bg-background/45',
                    )}
                  >
                    <p className="text-sm font-medium">{option.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{option.desc}</p>
                  </button>
                ))}
              </div>

              <div className="rounded-[1.1rem] border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground dark:bg-white/[0.03]">
                <p className="font-medium text-foreground">Current new-key policy</p>
                {lifecycleMode === 'ACTIVE' ? (
                  <p className="mt-1">Automatic and manual key creation are allowed.</p>
                ) : lifecycleMode === 'DRAINING' ? (
                  <p className="mt-1">Automatic placement is blocked. Manual admin-selected key creation is still allowed.</p>
                ) : (
                  <p className="mt-1">All new-key creation is blocked during maintenance.</p>
                )}
              </div>

              {server.lifecycleChangedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last changed {formatRelativeTime(server.lifecycleChangedAt)}
                </p>
              ) : null}

              {!canManageOutages ? (
                <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  Only Owner/Admin scoped accounts can change lifecycle and outage controls.
                </div>
              ) : null}

              <Button onClick={handleSaveLifecycle} disabled={!canManageOutages || lifecycleMutation.isPending}>
                {lifecycleMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Mode
              </Button>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-amber-500" />
                Slow health policy
              </CardTitle>
              <CardDescription>
                Set the per-server threshold for slow health, then decide when to drain, notify users, or auto-migrate keys to the best fallback target.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="latencyThresholdMs">Latency threshold (ms)</Label>
                  <Input
                    id="latencyThresholdMs"
                    type="number"
                    min={50}
                    max={5000}
                    value={latencyThresholdMs}
                    onChange={(event) => setLatencyThresholdMs(event.target.value)}
                  />
                </div>
                <div className="rounded-[1.1rem] border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground dark:bg-white/[0.03]">
                  <p className="font-medium text-foreground">Current fallback</p>
                  <p className="mt-1">
                    {recommendedFallbackTarget
                      ? `${recommendedFallbackTarget.serverName} · load ${recommendedFallbackTarget.loadScore}`
                      : 'No healthy fallback target is available right now.'}
                  </p>
                  {recommendedFallbackTarget?.reasons?.length ? (
                    <p className="mt-2 text-xs">
                      {recommendedFallbackTarget.reasons[0]}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <label className="rounded-[1rem] border border-border/60 bg-background/35 p-3 text-sm dark:bg-white/[0.03]">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={slowAutoDrainEnabled}
                      onChange={(event) => setSlowAutoDrainEnabled(event.target.checked)}
                      className="mt-1 rounded border-gray-300"
                    />
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">Auto-drain</p>
                      <p className="text-muted-foreground">
                        Stop new assignments when this server stays slow.
                      </p>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={slowAutoDrainThreshold}
                        onChange={(event) => setSlowAutoDrainThreshold(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Consecutive slow checks before drain.</p>
                    </div>
                  </div>
                </label>

                <label className="rounded-[1rem] border border-border/60 bg-background/35 p-3 text-sm dark:bg-white/[0.03]">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={slowAutoMigrateEnabled}
                      onChange={(event) => setSlowAutoMigrateEnabled(event.target.checked)}
                      className="mt-1 rounded border-gray-300"
                    />
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">Auto-migrate</p>
                      <p className="text-muted-foreground">
                        Move affected keys to the smart fallback target after sustained slow health.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          type="number"
                          min={1}
                          max={48}
                          value={slowAutoMigrateThreshold}
                          onChange={(event) => setSlowAutoMigrateThreshold(event.target.value)}
                        />
                        <Input
                          type="number"
                          min={1}
                          max={12}
                          value={slowAutoMigrateGraceHours}
                          onChange={(event) => setSlowAutoMigrateGraceHours(event.target.value)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Threshold checks, then user wait window in hours.</p>
                    </div>
                  </div>
                </label>

                <label className="rounded-[1rem] border border-border/60 bg-background/35 p-3 text-sm dark:bg-white/[0.03]">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={slowUserNotifyEnabled}
                      onChange={(event) => setSlowUserNotifyEnabled(event.target.checked)}
                      className="mt-1 rounded border-gray-300"
                    />
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">User notice</p>
                      <p className="text-muted-foreground">
                        Tell affected Telegram users to wait while the route is stabilized.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          value={slowUserNotifyThreshold}
                          onChange={(event) => setSlowUserNotifyThreshold(event.target.value)}
                        />
                        <Input
                          type="number"
                          min={15}
                          max={1440}
                          value={slowUserNotifyCooldownMins}
                          onChange={(event) => setSlowUserNotifyCooldownMins(event.target.value)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Threshold checks, then cooldown in minutes.</p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="rounded-[1.1rem] border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground dark:bg-white/[0.03]">
                <p>`Auto-drain` changes the server to `DRAINING` so new assignments stop.</p>
                <p>`Auto-migrate` uses the smart fallback target and preserves user expiry and usage.</p>
                <p>`User notice` sends a Telegram heads-up only after the configured slow streak.</p>
              </div>

              <Button onClick={handleSaveSlowPolicy} disabled={!canManageOutages || slowPolicyMutation.isPending}>
                {slowPolicyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Slow Policy
              </Button>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-emerald-500" />
                Capacity-aware routing
              </CardTitle>
              <CardDescription>
                Automatic key placement avoids draining, maintenance, and full servers. This shows the current preferred target.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1.1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Current server pressure
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {currentServerLoad?.loadScore ?? '—'}
                  {typeof currentServerLoad?.loadScore === 'number' ? ' load score' : ''}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentServerLoad
                    ? currentServerLoad.capacityPercent !== null
                      ? `${currentServerLoad.capacityPercent}% capacity · ${currentServerLoad.activeKeyCount} active keys`
                      : `${currentServerLoad.activeKeyCount} active keys · no max-key cap`
                    : 'Load data unavailable'}
                </p>
              </div>

              <div className="rounded-[1.1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Preferred new-key target
                </p>
                {recommendedAssignmentTarget ? (
                  <>
                    <p className="mt-1 text-lg font-semibold">{recommendedAssignmentTarget.serverName}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        load {recommendedAssignmentTarget.loadScore}
                      </Badge>
                      {recommendedAssignmentTarget.capacityPercent !== null ? (
                        <Badge variant="outline">
                          {recommendedAssignmentTarget.capacityPercent}% capacity
                        </Badge>
                      ) : (
                        <Badge variant="outline">No max-key cap</Badge>
                      )}
                      {recommendedAssignmentTarget.availableSlots !== null ? (
                        <Badge variant="outline">
                          {recommendedAssignmentTarget.availableSlots} slots free
                        </Badge>
                      ) : null}
                    </div>
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {recommendedAssignmentTarget.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No assignable target is currently available.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
      </div>
      ) : null}

      {detailTab === 'outage' ? (
      <div className="space-y-6">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Outage replacement
              </CardTitle>
              <CardDescription>
                Quarantine this server and move all active or pending keys to a healthy replacement server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Replacement server</Label>
                <Select value={outageTargetServerId} onValueChange={setOutageTargetServerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a healthy target server" />
                  </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a server</SelectItem>
                      {availableOutageTargets.map((candidate) => {
                        const candidateLoad = loadStatsByServerId.get(candidate.id);
                        return (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.name}
                            {candidate.location ? ` · ${candidate.location}` : ''}
                            {candidateLoad?.capacityPercent != null
                              ? ` · ${candidateLoad.capacityPercent}%`
                              : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                </Select>
                {outageTargetServerId !== 'none' && loadStatsByServerId.get(outageTargetServerId) ? (
                  <p className="text-xs text-muted-foreground">
                    Target load {loadStatsByServerId.get(outageTargetServerId)?.loadScore}
                    {loadStatsByServerId.get(outageTargetServerId)?.capacityPercent != null
                      ? ` · ${loadStatsByServerId.get(outageTargetServerId)?.capacityPercent}% capacity`
                      : ' · no max-key cap'}
                    {loadStatsByServerId.get(outageTargetServerId)?.availableSlots != null
                      ? ` · ${loadStatsByServerId.get(outageTargetServerId)?.availableSlots} free slots`
                      : ''}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>User wait notice</Label>
                  <Select value={outageGraceHours} onValueChange={setOutageGraceHours}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="3">3 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-[1.1rem] border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground dark:bg-white/[0.03]">
                  <p className="font-medium text-foreground">Policy</p>
                  <p className="mt-1">
                    Admin outage replacements preserve expiry and usage, and do not consume the user’s 3-change limit.
                  </p>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-[1rem] border border-border/60 bg-background/35 p-3 text-sm dark:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={outageNotifyUsers}
                  onChange={(event) => setOutageNotifyUsers(event.target.checked)}
                  className="mt-1 rounded border-gray-300"
                />
                <span className="text-muted-foreground">
                  Send Telegram recovery messages after the migration completes. Delayed outage warnings will still go out if the server stays down during the grace window.
                </span>
              </label>

              <div className="rounded-[1.1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                <p className="font-medium text-foreground">Affected keys</p>
                <p className="mt-1 text-muted-foreground">
                  {outageTargetServerId === 'none'
                    ? 'Choose a target server to preview how many keys will move.'
                    : outagePreviewQuery.isLoading
                      ? 'Loading outage preview...'
                      : outagePreviewQuery.data
                        ? `${outagePreviewQuery.data.totalKeys} active or pending key(s) will move from ${outagePreviewQuery.data.sourceServer.name} to ${outagePreviewQuery.data.targetServer.name}.`
                        : 'No preview available yet.'}
                </p>
                {outagePreviewQuery.data ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Telegram users
                      </p>
                      <p className="mt-1 text-xl font-semibold">{outagePreviewQuery.data.affectedTelegramUsers}</p>
                      <p className="text-xs text-muted-foreground">
                        {outagePreviewQuery.data.telegramEligibleKeys} key(s) can receive outage updates.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Sample keys
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {outagePreviewQuery.data.sampleKeyNames.length > 0
                          ? outagePreviewQuery.data.sampleKeyNames.join(', ')
                          : 'No active keys on this server.'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Linked premium requests
                      </p>
                      <p className="mt-1 text-xl font-semibold">{outagePreviewQuery.data.linkedPremiumRequestCount}</p>
                      <p className="text-xs text-muted-foreground">
                        Premium route issues or region requests tied to this server.
                      </p>
                    </div>
                  </div>
                ) : null}
                {outagePreviewQuery.data?.linkedPremiumRequests?.length ? (
                  <div className="mt-3 rounded-xl border border-border/40 bg-background/35 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Premium requests that will be linked to this outage
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {outagePreviewQuery.data.linkedPremiumRequests.map((request) => (
                        <Badge key={request.id} variant="outline">
                          {request.requestCode} · {request.dynamicAccessKeyName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <Button
                variant="destructive"
                disabled={
                  !canManageOutages ||
                  outageTargetServerId === 'none' ||
                  outageReplaceMutation.isPending ||
                  outagePreviewQuery.isLoading
                }
                onClick={() =>
                  outageReplaceMutation.mutate({
                    sourceServerId: serverId,
                    targetServerId: outageTargetServerId,
                    gracePeriodHours: Number(outageGraceHours),
                    notifyUsers: outageNotifyUsers,
                  })
                }
              >
                {outageReplaceMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                )}
                Quarantine and replace all affected keys
              </Button>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-cyan-500" />
                Migration progress
              </CardTitle>
              <CardDescription>
                Track how many keys were affected, moved, and still need attention for the current outage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentOutageState && activeOutageIncident ? (
                <>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Affected</p>
                      <p className="mt-1 text-xl font-semibold">{activeOutageTotal}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Migrated</p>
                      <p className="mt-1 text-xl font-semibold">{activeOutageMigrated}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Needs attention</p>
                      <p className="mt-1 text-xl font-semibold">{activeOutageFailed}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recovery notifications</p>
                      <p className="mt-1 text-xl font-semibold">
                        {activeOutageIncident.recoveryNotificationCount ?? currentOutageState.recoveryNotificationCount ?? 0}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Migration completion</span>
                      <span>{activeOutageProgress}%</span>
                    </div>
                    <Progress value={activeOutageProgress} className="h-2" />
                  </div>
                  <div className="rounded-[1.1rem] border border-border/60 bg-background/35 p-4 text-sm text-muted-foreground dark:bg-white/[0.03]">
                    <p>
                      Target server:{' '}
                      <span className="font-medium text-foreground">
                        {activeOutageIncident.migrationTargetServerName || currentOutageState.migrationTargetServerName || 'Not selected yet'}
                      </span>
                    </p>
                    <p className="mt-1">
                      {currentOutageState.migrationTriggeredAt
                        ? `Started ${formatRelativeTime(currentOutageState.migrationTriggeredAt)}`
                        : 'Migration has not started yet.'}
                      {currentOutageState.migrationCompletedAt
                        ? ` · completed ${formatRelativeTime(currentOutageState.migrationCompletedAt)}`
                        : ''}
                    </p>
                    {currentOutageState.lastError ? (
                      <p className="mt-2 text-red-500">{currentOutageState.lastError}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground dark:bg-white/[0.03]">
                  No active migration is running for this server right now.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-500" />
                Outage updates
              </CardTitle>
              <CardDescription>
                Send a Telegram follow-up to affected users while the outage is active, or close the outage early if the server recovers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {server.outageState && !server.outageState.recoveredAt ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Started
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {formatRelativeTime(server.outageState.startedAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(server.outageState.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        User alert
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {server.outageState.userAlertSentAt
                          ? `Sent ${formatRelativeTime(server.outageState.userAlertSentAt)}`
                          : `Scheduled ${formatRelativeTime(server.outageState.userAlertScheduledFor)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Grace window: {server.outageState.gracePeriodHours} hour(s)
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Current incident
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {activeOutageIncident?.incidentCode || 'Open outage'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activeOutageIncident?.premiumSupportRequests?.length || 0} linked premium request(s)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="outageFollowUpMessage">Telegram follow-up</Label>
                    <Textarea
                      id="outageFollowUpMessage"
                      rows={4}
                      value={outageFollowUpMessage}
                      onChange={(event) => setOutageFollowUpMessage(event.target.value)}
                      placeholder="We are still working on the replacement. Please wait a little longer."
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      disabled={!canManageOutages}
                      onClick={() =>
                        setOutageFollowUpMessage(
                          'We are still working on the replacement. Please wait a little longer while we prepare the new server.',
                        )
                      }
                    >
                      Still working
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      disabled={!canManageOutages}
                      onClick={() =>
                        setOutageFollowUpMessage(
                          'The server recovered earlier than expected. Please try using your key again now.',
                        )
                      }
                    >
                      Resolved early
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canManageOutages || outageFollowUpMutation.isPending || outageFollowUpMessage.trim().length < 10}
                      onClick={() =>
                        outageFollowUpMutation.mutate({
                          serverId,
                          message: outageFollowUpMessage,
                          markRecovered: false,
                        })
                      }
                    >
                      {outageFollowUpMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Send follow-up
                    </Button>
                    <Button
                      type="button"
                      className="rounded-full"
                      disabled={!canManageOutages || outageFollowUpMutation.isPending || outageFollowUpMessage.trim().length < 10}
                      onClick={() =>
                        outageFollowUpMutation.mutate({
                          serverId,
                          message: outageFollowUpMessage,
                          markRecovered: true,
                        })
                      }
                    >
                      {outageFollowUpMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Send resolution update
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground dark:bg-white/[0.03]">
                  There is no active outage on this server right now.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-primary" />
                Manual Telegram notice
              </CardTitle>
              <CardDescription>
                Send a direct downtime or issue update to all Telegram-linked users on this server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Notice type</Label>
                <Select
                  value={manualNoticeType}
                  onValueChange={(value) =>
                    setManualNoticeType(value as 'ISSUE' | 'DOWNTIME' | 'MAINTENANCE')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ISSUE">Issue</SelectItem>
                    <SelectItem value="DOWNTIME">Downtime</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manualNoticeMessage">Message</Label>
                <Textarea
                  id="manualNoticeMessage"
                  rows={4}
                  value={manualNoticeMessage}
                  onChange={(event) => setManualNoticeMessage(event.target.value)}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                The Telegram bot will include the configured support button automatically if a support link is available.
              </p>

              <Button
                type="button"
                disabled={!canManageOutages || manualNoticeMutation.isPending || manualNoticeMessage.trim().length < 10}
                onClick={() =>
                  manualNoticeMutation.mutate({
                    serverId,
                    noticeType: manualNoticeType,
                    message: manualNoticeMessage,
                  })
                }
              >
                {manualNoticeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Send Telegram notice
              </Button>
            </CardContent>
          </Card>
      </div>
      ) : null}

      {detailTab === 'history' ? (
      <div className="space-y-6">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle>Outage history</CardTitle>
              <CardDescription>
                Review past outages, replacement targets, follow-ups, and linked premium support requests for this server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {outageHistoryQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading outage history…
                </div>
              ) : !outageHistoryQuery.data || outageHistoryQuery.data.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground dark:bg-white/[0.03]">
                  No outage history for this server yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {outageHistoryQuery.data.map((incident: any) => (
                    <div key={incident.id} className="rounded-[1.1rem] border border-border/60 bg-background/35 p-4 dark:bg-white/[0.03]">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{incident.incidentCode}</p>
                        <Badge variant="outline">{incident.status}</Badge>
                        <Badge variant="secondary">{incident.cause === 'MANUAL_OUTAGE' ? 'Manual outage' : 'Health outage'}</Badge>
                        {incident.migrationTargetServerName ? (
                          <Badge variant="outline">Target: {incident.migrationTargetServerName}</Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Started</p>
                          <p className="mt-1 text-sm font-medium">{formatRelativeTime(incident.startedAt)}</p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Affected keys</p>
                          <p className="mt-1 text-sm font-medium">{incident.initialAffectedKeyCount || incident.affectedKeyCount}</p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Telegram users</p>
                          <p className="mt-1 text-sm font-medium">{incident.affectedTelegramUsers}</p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recovered</p>
                          <p className="mt-1 text-sm font-medium">
                            {incident.recoveredAt ? formatRelativeTime(incident.recoveredAt) : 'Still open'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Migrated</p>
                          <p className="mt-1 text-sm font-medium">{incident.migratedKeyCount || 0}</p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Needs attention</p>
                          <p className="mt-1 text-sm font-medium">{incident.failedKeyCount || 0}</p>
                        </div>
                        <div className="rounded-xl border border-border/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recovery notifications</p>
                          <p className="mt-1 text-sm font-medium">{incident.recoveryNotificationCount || 0}</p>
                        </div>
                      </div>
                      {(incident.initialAffectedKeyCount || incident.affectedKeyCount) > 0 ? (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Migration progress</span>
                            <span>
                              {Math.round(((incident.migratedKeyCount || 0) / (incident.initialAffectedKeyCount || incident.affectedKeyCount || 1)) * 100)}%
                            </span>
                          </div>
                          <Progress
                            value={Math.round(((incident.migratedKeyCount || 0) / (incident.initialAffectedKeyCount || incident.affectedKeyCount || 1)) * 100)}
                            className="h-2"
                          />
                        </div>
                      ) : null}
                      {incident.premiumSupportRequests.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {incident.premiumSupportRequests.slice(0, 5).map((request: any) => (
                            <Badge key={request.id} variant="outline">
                              {request.requestCode} · {request.dynamicAccessKey.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {incident.updates.length ? (
                        <div className="mt-3 space-y-2">
                          {incident.updates.slice(-4).map((update: any) => (
                            <div key={update.id} className="rounded-xl border border-border/40 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">{update.title}</p>
                                <span className="text-xs text-muted-foreground">{formatRelativeTime(update.createdAt)}</span>
                              </div>
                              {update.message ? (
                                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{update.message}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
      </div>
      ) : null}

      {/* Access Keys Section */}
      {detailTab === 'lifecycle' ? (
      <Card className="ops-detail-card">
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
                  className="ops-row-card"
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
            <div className="ops-chart-empty py-8 text-muted-foreground">
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
      ) : null}

      {/* Danger Zone */}
      {detailTab === 'lifecycle' ? (
      <Card className="ops-detail-card border-destructive/40">
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
          <div className="flex items-center justify-between rounded-[1.2rem] border border-destructive/30 bg-destructive/5 p-4">
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
      ) : null}

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
