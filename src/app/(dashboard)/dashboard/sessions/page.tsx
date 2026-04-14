'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
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
  ShieldCheck,
  Users,
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
      <section className="ops-showcase">
        <div className="grid gap-5">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <Smartphone className="mr-2 h-3.5 w-3.5" />
              Device Sessions
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                Connection sessions
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Review active device sessions, identify stale connections, and terminate them when they no longer reflect real client activity.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active sessions</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{summaryLoading ? '…' : summary?.activeCount ?? 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Active within the last {summary?.staleThresholdMinutes ?? 5} minutes.
                </p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Stale sessions</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{summaryLoading ? '…' : summary?.staleCount ?? 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">Marked active, but older than the timeout.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active keys</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{summaryLoading ? '…' : summary?.activeKeys ?? 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">Keys with at least one live connection session.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active owners</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{summaryLoading ? '…' : summary?.activeUsers ?? 0}</p>
                <p className="mt-2 text-sm text-muted-foreground">Distinct users behind active sessions.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active traffic</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {summaryLoading ? '…' : formatBytes(BigInt(summary?.totalActiveBytes ?? '0'))}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">Bytes accumulated by current sessions.</p>
              </div>
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Session controls</p>
                <h2 className="text-xl font-semibold">Command rail</h2>
                <p className="text-sm text-muted-foreground">
                  Clear stale devices, inspect active key inventory, or drill into server state while you review the session stream.
                </p>
              </div>

              <Button
                className="h-11 w-full rounded-full"
                onClick={() => terminateStaleMutation.mutate()}
                disabled={terminateStaleMutation.isPending}
              >
                {terminateStaleMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldAlert className="mr-2 h-4 w-4" />
                )}
                Close stale sessions
              </Button>

              <div className="space-y-2">
                <Link href="/dashboard/keys" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Wifi className="h-4 w-4 text-primary" />
                    Open access keys
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Link href="/dashboard/servers" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-primary" />
                    Review servers
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Live status</p>
                <h2 className="text-xl font-semibold">Session pulse</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Timeout</p>
                  <p className="text-2xl font-semibold tracking-tight">{summary?.staleThresholdMinutes ?? 5}m</p>
                  <p className="text-sm text-muted-foreground">Threshold before a session is marked stale.</p>
                </div>
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current page</p>
                  <p className="text-2xl font-semibold tracking-tight">{data?.page ?? 1}/{data?.totalPages ?? 1}</p>
                  <p className="text-sm text-muted-foreground">{data?.total ?? 0} sessions across the current filter set.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card className="ops-panel">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Smartphone className="w-5 h-5 text-primary" />
                Device sessions
              </CardTitle>
              <CardDescription>
                Filter by status or search by key, owner, or server name.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="ops-filter-bar grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
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

          <div className="ops-table-toolbar">
            <div className="flex flex-wrap items-center gap-2">
              <div className="ops-table-meta">{data?.total ?? 0} sessions</div>
              <div className="ops-table-meta">Page {data?.page ?? 1} / {data?.totalPages ?? 1}</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{isFetching ? 'Refreshing…' : 'Live session stream'}</span>
            </div>
          </div>

          <div className="space-y-3 lg:hidden">
            {isLoading ? (
              <div className="ops-chart-empty py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="ops-chart-empty border-dashed p-8 text-center text-sm text-muted-foreground">
                No sessions match the current filters.
              </div>
            ) : (
              sessions.map((session) => {
                const sessionStatus = getSessionStatus(session);
                return (
                  <div key={session.id} className="ops-mobile-card space-y-3">
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
                      <div className="ops-mobile-action-bar flex justify-end">
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

          <div className="ops-data-shell hidden lg:block">
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

          <div className="ops-table-toolbar">
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
