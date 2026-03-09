'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { cn, getCountryFlag } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Plus,
    Search,
    RefreshCw,
    Globe,
    Cloud,
    Download,
    Upload,
    Loader2,
    ArrowRightLeft,
    Sparkles,
    AlertTriangle,
} from 'lucide-react';
import { ServerCard } from './server-card';
import { AddServerDialog } from './add-server-dialog';

function formatTemplate(template: string, values: Record<string, string | number>) {
    return Object.entries(values).reduce(
        (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
        template,
    );
}

/**
 * ServerList Component
 * 
 * The main servers listing view that shows all configured servers
 * with their status and provides management actions.
 */
export function ServerList() {
    const { toast } = useToast();
    const { t } = useLocale();
    const [searchQuery, setSearchQuery] = useState('');
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [syncingServerId, setSyncingServerId] = useState<string | null>(null);
    const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [importJson, setImportJson] = useState('');
    const router = useRouter();

    // Fetch servers list
    const { data: servers, isLoading, refetch } = trpc.servers.list.useQuery({
        includeInactive: true,
    });
    const rebalancePlanQuery = trpc.servers.rebalancePlan.useQuery({
        maxMoves: 4,
    });
    const smartAssignmentQuery = trpc.servers.recommendAssignmentTarget.useQuery();

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
            setDeletingServerId(null);
        },
        onError: (error) => {
            toast({
                title: 'Delete failed',
                description: error.message,
                variant: 'destructive',
            });
            setDeletingServerId(null);
        },
    });

    // Export servers query (lazy — only fetch when user triggers)
    const exportQuery = trpc.servers.exportServers.useQuery(undefined, { enabled: false });

    // Import servers mutation
    const importMutation = trpc.servers.importServers.useMutation({
        onSuccess: (result) => {
            const parts: string[] = [];
            if (result.imported > 0) parts.push(`${result.imported} imported`);
            if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
            if (result.failed > 0) parts.push(`${result.failed} failed`);
            toast({
                title: 'Import complete',
                description: parts.join(', ') + (result.errors.length > 0 ? `\n${result.errors[0]}` : ''),
                variant: result.failed > 0 ? 'destructive' : 'default',
            });
            setImportDialogOpen(false);
            setImportJson('');
            refetch();
        },
        onError: (error) => {
            toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
        },
    });

    const applyRebalanceMutation = trpc.servers.applyRebalance.useMutation({
        onSuccess: (result) => {
            toast({
                title: t('servers.rebalance.applied_title'),
                description: formatTemplate(t('servers.rebalance.applied_desc'), {
                    migrated: result.migrated,
                    failed: result.failed,
                }),
            });
            void refetch();
            void rebalancePlanQuery.refetch();
            void smartAssignmentQuery.refetch();
        },
        onError: (error) => {
            toast({
                title: t('servers.rebalance.apply_failed'),
                description: error.message,
                variant: 'destructive',
            });
        },
    });

    const handleExport = async () => {
        try {
            const result = await exportQuery.refetch();
            if (result.data) {
                const json = JSON.stringify(result.data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `servers-export-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast({ title: 'Export complete', description: `${result.data.serverCount} servers exported.` });
            }
        } catch {
            toast({ title: 'Export failed', variant: 'destructive' });
        }
    };

    const handleImport = () => {
        try {
            const parsed = JSON.parse(importJson);
            const serversData = parsed.servers || parsed;
            if (!Array.isArray(serversData)) {
                toast({ title: 'Invalid format', description: 'Expected a JSON array of servers or an export file.', variant: 'destructive' });
                return;
            }
            importMutation.mutate({ servers: serversData });
        } catch {
            toast({ title: 'Invalid JSON', description: 'Please paste valid JSON.', variant: 'destructive' });
        }
    };

    // Filter servers by search query
    const filteredServers = servers?.filter((server) =>
        server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        server.location?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    useEffect(() => {
        router.prefetch('/dashboard/servers/deploy');
        servers?.slice(0, 8).forEach((server) => {
            router.prefetch(`/dashboard/servers/${server.id}`);
        });
    }, [router, servers]);

    const handleSync = (serverId: string) => {
        setSyncingServerId(serverId);
        syncMutation.mutate({ id: serverId });
    };

    const handleDelete = (serverId: string, serverName: string) => {
        if (confirm(`${t('servers.confirm_delete')} "${serverName}"?\n\n${t('servers.confirm_delete_desc')}`)) {
            setDeletingServerId(serverId);
            deleteMutation.mutate({ id: serverId });
        }
    };

    return (
        <div className="space-y-6">
            {/* Search and filters */}
            <div className="ops-panel space-y-4 md:hidden">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="ops-section-heading">{t('servers.tab_overview')}</p>
                        <h2 className="mt-2 text-xl font-semibold">{t('servers.title')}</h2>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
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
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-2xl"
                        onClick={() => refetch()}
                        disabled={isLoading || syncMutation.isPending || deleteMutation.isPending}
                        aria-label={t('servers.refresh')}
                    >
                        <RefreshCw className={cn('w-4 h-4', (isLoading || syncMutation.isPending || deleteMutation.isPending) && 'animate-spin')} />
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="w-full justify-center rounded-2xl" onClick={handleExport} disabled={exportQuery.isFetching}>
                        {exportQuery.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Export
                    </Button>
                    <Button variant="outline" className="w-full justify-center rounded-2xl" onClick={() => setImportDialogOpen(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        Import
                    </Button>
                    <Button asChild variant="secondary" className="w-full justify-center rounded-2xl">
                        <Link href="/dashboard/servers/deploy">
                            <Cloud className="mr-2 h-4 w-4" />
                            Deploy New
                        </Link>
                    </Button>
                    <Button onClick={() => setAddDialogOpen(true)} className="w-full justify-center rounded-2xl">
                        <Plus className="w-4 h-4 mr-2" />
                        {t('servers.add')}
                    </Button>
                </div>
            </div>

            <div className="ops-panel hidden md:flex md:flex-col lg:flex-row gap-4 justify-between">
                <div className="flex items-center gap-4 flex-1">
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
                        disabled={isLoading || syncMutation.isPending || deleteMutation.isPending}
                        className="rounded-2xl"
                    >
                        <RefreshCw className={cn('w-4 h-4 mr-2', (isLoading || syncMutation.isPending || deleteMutation.isPending) && 'animate-spin')} />
                        {t('servers.refresh')}
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={exportQuery.isFetching} className="rounded-2xl">
                        {exportQuery.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)} className="rounded-2xl">
                        <Upload className="w-4 h-4 mr-2" />
                        Import
                    </Button>
                    <Button asChild variant="secondary" className="rounded-2xl">
                        <Link href="/dashboard/servers/deploy">
                            <Cloud className="mr-2 h-4 w-4" />
                            Deploy New
                        </Link>
                    </Button>
                    <Button onClick={() => setAddDialogOpen(true)} className="rounded-2xl">
                        <Plus className="w-4 h-4 mr-2" />
                        {t('servers.add')}
                    </Button>
                </div>
            </div>

            {servers && servers.length > 1 && (
                <div className="ops-panel space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                            <p className="ops-section-heading">{t('servers.rebalance.heading')}</p>
                            <div>
                                <h3 className="text-lg font-semibold">{t('servers.rebalance.title')}</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {t('servers.rebalance.desc')}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="rounded-full border border-border/60 px-3 py-1">
                                {formatTemplate(t('servers.rebalance.overloaded_badge'), {
                                    count: rebalancePlanQuery.data?.summary.overloadedServers ?? 0,
                                })}
                            </Badge>
                            <Button
                                variant="outline"
                                className="rounded-2xl"
                                onClick={() => {
                                    void rebalancePlanQuery.refetch();
                                    void smartAssignmentQuery.refetch();
                                }}
                                disabled={rebalancePlanQuery.isFetching || smartAssignmentQuery.isFetching}
                            >
                                <RefreshCw className={cn('mr-2 h-4 w-4', (rebalancePlanQuery.isFetching || smartAssignmentQuery.isFetching) && 'animate-spin')} />
                                {t('servers.rebalance.refresh')}
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
                        <div className="rounded-[1.5rem] border border-cyan-500/15 bg-cyan-500/5 p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-semibold">{t('servers.rebalance.smart_assignment_title')}</p>
                                    <p className="text-xs leading-6 text-muted-foreground">
                                        {t('servers.rebalance.smart_assignment_desc')}
                                    </p>
                                    {smartAssignmentQuery.isLoading ? (
                                        <p className="text-sm text-muted-foreground">{t('servers.rebalance.loading')}</p>
                                    ) : smartAssignmentQuery.data ? (
                                        <>
                                            <p className="text-base font-semibold text-foreground">
                                                {smartAssignmentQuery.data.countryCode && `${getCountryFlag(smartAssignmentQuery.data.countryCode)} `}
                                                {smartAssignmentQuery.data.serverName}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatTemplate(t('servers.rebalance.smart_assignment_meta'), {
                                                    score: smartAssignmentQuery.data.loadScore,
                                                    active: smartAssignmentQuery.data.activeKeyCount,
                                                })}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-amber-600 dark:text-amber-300">
                                            {t('servers.rebalance.smart_assignment_empty')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {rebalancePlanQuery.isLoading ? (
                                <div className="rounded-[1.5rem] border border-border/60 bg-background/50 p-4 text-sm text-muted-foreground">
                                    {t('servers.rebalance.loading')}
                                </div>
                            ) : rebalancePlanQuery.data?.recommendations.length ? (
                                rebalancePlanQuery.data.recommendations.map((recommendation) => {
                                    const recommendationId = `${recommendation.sourceServerId}:${recommendation.targetServerId}`;

                                    return (
                                        <div key={recommendationId} className="rounded-[1.5rem] border border-border/60 bg-background/50 p-4">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                <div className="min-w-0 space-y-2">
                                                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                                                        <span>
                                                            {recommendation.sourceServerCountryCode && `${getCountryFlag(recommendation.sourceServerCountryCode)} `}
                                                            {recommendation.sourceServerName}
                                                        </span>
                                                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                                                        <span>
                                                            {recommendation.targetServerCountryCode && `${getCountryFlag(recommendation.targetServerCountryCode)} `}
                                                            {recommendation.targetServerName}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs leading-6 text-muted-foreground">
                                                        {formatTemplate(t('servers.rebalance.recommendation_meta'), {
                                                            count: recommendation.keyCount,
                                                            sourceScore: recommendation.sourceLoadScore,
                                                            targetScore: recommendation.targetLoadScore,
                                                        })}
                                                    </p>
                                                    <p className="text-sm text-foreground/90">{recommendation.reason}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatTemplate(t('servers.rebalance.recommendation_keys'), {
                                                            keys: recommendation.keyNames.join(', '),
                                                        })}
                                                    </p>
                                                </div>

                                                <Button
                                                    className="rounded-2xl"
                                                    onClick={() => applyRebalanceMutation.mutate({
                                                        sourceServerId: recommendation.sourceServerId,
                                                        targetServerId: recommendation.targetServerId,
                                                        keyIds: recommendation.keyIds,
                                                    })}
                                                    disabled={applyRebalanceMutation.isPending}
                                                >
                                                    {applyRebalanceMutation.isPending ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <ArrowRightLeft className="mr-2 h-4 w-4" />
                                                    )}
                                                    {t('servers.rebalance.apply')}
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="rounded-[1.5rem] border border-emerald-500/15 bg-emerald-500/5 p-4">
                                    <p className="text-sm font-semibold text-foreground">{t('servers.rebalance.empty_title')}</p>
                                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                                        {t('servers.rebalance.empty_desc')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Server grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-56 rounded-[1.75rem] bg-muted animate-pulse" />
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
                            isDeleting={deletingServerId === server.id && deleteMutation.isPending}
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

            {/* Import dialog */}
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Import Servers</DialogTitle>
                        <DialogDescription>
                            Paste a JSON export file to import servers. Servers with duplicate API URLs will be skipped.
                            Connectivity will be validated before importing.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Label>JSON Data</Label>
                        <textarea
                            className="w-full min-h-[200px] p-3 rounded-lg border border-border bg-background text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder={'Paste exported JSON here...\n\n{\n  "servers": [\n    { "name": "...", "apiUrl": "...", "apiCertSha256": "..." }\n  ]\n}'}
                            value={importJson}
                            onChange={(e) => setImportJson(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleImport} disabled={!importJson.trim() || importMutation.isPending}>
                            {importMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            {importMutation.isPending ? 'Importing...' : 'Import'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
