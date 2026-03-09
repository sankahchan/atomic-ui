'use client';

import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollText, AlertTriangle, ServerCrash, Users, KeyRound, Flame } from 'lucide-react';
import { cn, formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const styles =
    severity === 'critical'
      ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
      : severity === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
        : 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300';

  return (
    <Badge variant="outline" className={styles}>
      {severity}
    </Badge>
  );
}

export default function IncidentCenterPage() {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  const overviewQuery = trpc.incidents.overview.useQuery({ lookbackDays: 14 });
  const detailQuery = trpc.incidents.detail.useQuery(
    { serverId: selectedServerId ?? '', lookbackDays: 30 },
    { enabled: !!selectedServerId },
  );

  useEffect(() => {
    if (!selectedServerId && overviewQuery.data?.openIncidents?.[0]?.serverId) {
      setSelectedServerId(overviewQuery.data.openIncidents[0].serverId);
    }
  }, [overviewQuery.data, selectedServerId]);

  const selectedDetail = detailQuery.data;
  const alertHistory = useMemo(() => overviewQuery.data?.alertHistory ?? [], [overviewQuery.data]);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <Card className="overflow-hidden rounded-[2rem] border border-border/70 bg-background/75 shadow-[0_18px_60px_rgba(15,23,42,0.07)]">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="w-fit rounded-full border-primary/25 bg-primary/10 px-3 py-1 text-primary">
                <Flame className="mr-2 h-3.5 w-3.5" />
                Incident Center
              </Badge>
              <div>
                <CardTitle className="text-3xl font-semibold tracking-tight">Operational incidents</CardTitle>
                <CardDescription className="mt-2 max-w-2xl text-base">
                  Review live server incidents, alert history, affected keys and users, and the recent resolution timeline.
                </CardDescription>
              </div>
            </div>

            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                void overviewQuery.refetch();
                if (selectedServerId) {
                  void detailQuery.refetch();
                }
              }}
            >
              Refresh
            </Button>
          </CardHeader>

          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Open</p>
                <p className="mt-3 text-3xl font-semibold">{overviewQuery.data?.summary.openIncidents ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Critical</p>
                <p className="mt-3 text-3xl font-semibold">{overviewQuery.data?.summary.criticalOpen ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Affected keys</p>
                <p className="mt-3 text-3xl font-semibold">{overviewQuery.data?.summary.affectedKeys ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Recent alerts</p>
                <p className="mt-3 text-3xl font-semibold">{overviewQuery.data?.summary.recentAlerts ?? 0}</p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-xl">Alert history</CardTitle>
            <CardDescription>Latest delivery and incident notifications across the panel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertHistory.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                No recent alerts were recorded in the selected lookback window.
              </div>
            ) : (
              alertHistory.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[1.35rem] border border-border/70 bg-background/65 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={entry.severity} />
                        <p className="font-medium">{entry.event.replace(/_/g, ' ')}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.message}</p>
                    </div>
                    <p className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(entry.sentAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-xl">Open incidents</CardTitle>
            <CardDescription>Current slow or down servers and the scope of impact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overviewQuery.data?.openIncidents.length ? (
              overviewQuery.data.openIncidents.map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => setSelectedServerId(incident.serverId)}
                  className={cn(
                    'w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors',
                    selectedServerId === incident.serverId
                      ? 'border-primary/40 bg-primary/8'
                      : 'border-border/70 bg-background/65 hover:border-primary/25',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={incident.severity} />
                        <p className="font-semibold">{incident.serverName}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{incident.summary}</p>
                    </div>
                    <p className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(incident.startedAt)}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="h-3.5 w-3.5" />
                      {incident.affectedKeyCount} key(s)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {incident.affectedUserCount} user(s)
                    </span>
                    {incident.latencyMs != null ? <span>{incident.latencyMs} ms</span> : null}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-8 text-center">
                <p className="text-base font-medium text-emerald-600 dark:text-emerald-300">No open incidents</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  All monitored servers are currently operating without an active incident.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-xl">Affected inventory and resolution timeline</CardTitle>
            <CardDescription>
              {selectedDetail
                ? `Detailed incident context for ${selectedDetail.server.name}.`
                : 'Select an open incident to inspect keys, users, and the response timeline.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedDetail ? (
              <div className="rounded-[1.5rem] border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                Choose an incident from the left column to inspect the impact and timeline.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Affected keys</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedDetail.affectedKeys.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No keys are currently attached to this server.</p>
                      ) : (
                        selectedDetail.affectedKeys.slice(0, 8).map((key) => (
                          <div key={key.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 px-3 py-3">
                            <div>
                              <p className="font-medium">{key.name}</p>
                              <p className="text-xs text-muted-foreground">{key.status}</p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <p>{formatBytes(BigInt(key.usedBytes))}</p>
                              <p>{key.expiresAt ? formatDateTime(key.expiresAt) : 'No expiry'}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Affected users</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedDetail.affectedUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No user ownership is attached to this server’s keys.</p>
                      ) : (
                        selectedDetail.affectedUsers.map((user) => (
                          <div key={`${user.type}-${user.label}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 px-3 py-3">
                            <p className="font-medium">{user.label}</p>
                            <Badge variant="outline">{user.type}</Badge>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Resolution timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedDetail.timeline.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No timeline entries were found for this server yet.</p>
                    ) : (
                      selectedDetail.timeline.slice(0, 12).map((entry) => (
                        <div key={entry.id} className="flex gap-3 rounded-2xl border border-border/60 px-3 py-3">
                          <div className="mt-0.5">
                            {entry.category === 'alert' ? (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            ) : entry.category === 'audit' ? (
                              <ScrollText className="h-4 w-4 text-sky-500" />
                            ) : (
                              <ServerCrash className="h-4 w-4 text-rose-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{entry.title}</p>
                              <SeverityBadge severity={entry.severity} />
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                          </div>
                          <p className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatRelativeTime(entry.timestamp)}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
