'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import {
    Plus,
    Search,
    RefreshCw,
    Globe,
    Cloud,
} from 'lucide-react';
import { ServerCard } from './server-card';
import { AddServerDialog } from './add-server-dialog';

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
    const router = useRouter();

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
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
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
                    >
                        <RefreshCw className={cn('w-4 h-4 mr-2', (isLoading || syncMutation.isPending || deleteMutation.isPending) && 'animate-spin')} />
                        {t('servers.refresh')}
                    </Button>
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
        </div>
    );
}
