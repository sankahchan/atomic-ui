'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BackButton } from '@/components/ui/back-button';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { trpc } from '@/lib/trpc';
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import {
  Clock3,
  Loader2,
  Power,
  Search,
  ShieldAlert,
  Smartphone,
  Wifi,
  WifiOff,
} from 'lucide-react';

type SessionStatusFilter = 'ALL' | 'ACTIVE' | 'STALE' | 'ENDED';

function getSessionStatus(session: {
  isActive: boolean;
  stale: boolean;
  endedReason: string | null;
}) {
  if (session.isActive && session.stale) {
    return {
      label: 'Stale',
      className: 'border-amber-500/40 text-amber-500',
    };
  }

  if (session.isActive) {
    return {
      label: 'Active',
      className: 'border-emerald-500/40 text-emerald-500',
    };
  }

  return {
    label: session.endedReason === 'ADMIN_TERMINATED' ? 'Terminated' : 'Ended',
    className: 'border-muted-foreground/30 text-muted-foreground',
  };
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return `${hours}h ${remainingMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function SessionsPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SessionStatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    setPage(1);
  }, [status, deferredSearch]);

  const { data: summary, isLoading: summaryLoading } = trpc.sessions.summary.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const { data, isLoading, isFetching } = trpc.sessions.list.useQuery(
    {
      page,
      pageSize: 20,
      status,
      search: deferredSearch || undefined,
    },
    {
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );

  const terminateMutation = trpc.sessions.terminate.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Session closed',
        description: 'The connection session has been terminated.',
      });
      await Promise.all([
        utils.sessions.summary.invalidate(),
        utils.sessions.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: 'Failed to close session',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const terminateStaleMutation = trpc.sessions.terminateStale.useMutation({
    onSuccess: async (result) => {
      toast({
        title: 'Stale sessions cleaned up',
        description: result.closedCount > 0
          ? `Closed ${result.closedCount} stale sessions.`
          : 'No stale sessions were found.',
      });
      await Promise.all([
        utils.sessions.summary.invalidate(),
        utils.sessions.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: 'Failed to clean up stale sessions',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sessions = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackButton href="/dashboard" label={t('nav.dashboard')} />
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Review active device sessions, identify stale connections, and terminate them when needed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Sessions</CardDescription>
            <CardTitle className="text-2xl">{summaryLoading ? '...' : summary?.activeCount ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Sessions active within the last {summary?.staleThresholdMinutes ?? 5} minutes.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stale Sessions</CardDescription>
            <CardTitle className="text-2xl">{summaryLoading ? '...' : summary?.staleCount ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Marked active, but older than the inactivity timeout.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Keys</CardDescription>
            <CardTitle className="text-2xl">{summaryLoading ? '...' : summary?.activeKeys ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Keys with at least one live connection session.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Owners</CardDescription>
            <CardTitle className="text-2xl">{summaryLoading ? '...' : summary?.activeUsers ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Distinct assigned users represented by active sessions.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Traffic</CardDescription>
            <CardTitle className="text-2xl">
              {summaryLoading ? '...' : formatBytes(BigInt(summary?.totalActiveBytes ?? '0'))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Total bytes accumulated by currently active sessions.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                Device Sessions
              </CardTitle>
              <CardDescription>
                Filter by status or search by key, owner, or server name.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => terminateStaleMutation.mutate()}
                disabled={terminateStaleMutation.isPending}
              >
                {terminateStaleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShieldAlert className="w-4 h-4 mr-2" />
                )}
                Close Stale
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <Label htmlFor="session-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="session-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search key, owner, or server"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as SessionStatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All sessions</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="STALE">Stale</SelectItem>
                  <SelectItem value="ENDED">Ended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{data?.total ?? 0} sessions</span>
            <span>Page {data?.page ?? 1} / {data?.totalPages ?? 1}</span>
          </div>

          <div className="space-y-3 lg:hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No sessions match the current filters.
              </div>
            ) : (
              sessions.map((session) => {
                const sessionStatus = getSessionStatus(session);
                return (
                  <div key={session.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{session.accessKeyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.serverCountryCode ? `${getCountryFlag(session.serverCountryCode)} ` : ''}
                          {session.serverName}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn(sessionStatus.className)}>
                        {sessionStatus.label}
                      </Badge>
                    </div>
                    <div className="grid gap-1 text-sm">
                      <p><span className="text-muted-foreground">Owner:</span> {session.userEmail ?? session.accessKeyEmail ?? '-'}</p>
                      <p><span className="text-muted-foreground">Started:</span> {formatDateTime(session.startedAt)}</p>
                      <p><span className="text-muted-foreground">Last active:</span> {formatRelativeTime(session.lastActiveAt)}</p>
                      <p><span className="text-muted-foreground">Duration:</span> {formatDuration(session.durationMinutes)}</p>
                      <p><span className="text-muted-foreground">Traffic:</span> {formatBytes(BigInt(session.bytesUsed))}</p>
                      <p><span className="text-muted-foreground">Ended reason:</span> {session.endedReason ?? '-'}</p>
                    </div>
                    {session.isActive ? (
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => terminateMutation.mutate({ id: session.id })}
                          disabled={terminateMutation.isPending}
                        >
                          {terminateMutation.isPending && terminateMutation.variables?.id === session.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4 mr-2" />
                          )}
                          Terminate
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Traffic</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      No sessions match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((session) => {
                    const sessionStatus = getSessionStatus(session);
                    return (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{session.accessKeyName}</p>
                            <p className="text-xs text-muted-foreground">{session.accessKeyEmail ?? '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>{session.userEmail ?? '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {session.serverCountryCode ? <span>{getCountryFlag(session.serverCountryCode)}</span> : null}
                            <span>{session.serverName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(sessionStatus.className)}>
                            {sessionStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{formatDateTime(session.startedAt)}</p>
                            <p className="text-xs text-muted-foreground">{formatRelativeTime(session.startedAt)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            {session.isActive ? (
                              session.stale ? <Clock3 className="w-4 h-4 text-amber-500" /> : <Wifi className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <WifiOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span>{formatRelativeTime(session.lastActiveAt)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDuration(session.durationMinutes)}</TableCell>
                        <TableCell>{formatBytes(BigInt(session.bytesUsed))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{session.endedReason ?? '-'}</TableCell>
                        <TableCell className="text-right">
                          {session.isActive ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => terminateMutation.mutate({ id: session.id })}
                              disabled={terminateMutation.isPending}
                            >
                              {terminateMutation.isPending && terminateMutation.variables?.id === session.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Power className="w-4 h-4 mr-2" />
                              )}
                              Terminate
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Closed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= (data?.totalPages ?? 1) || isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
