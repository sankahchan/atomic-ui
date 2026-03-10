'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollText, AlertTriangle, ServerCrash, Users, KeyRound, Flame, BellRing, CheckCircle2 } from 'lucide-react';
import { cn, formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

function WorkflowBadge({ status }: { status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' }) {
  const styles =
    status === 'RESOLVED'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
      : status === 'ACKNOWLEDGED'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300';

  return (
    <Badge variant="outline" className={styles}>
      {status.toLowerCase()}
    </Badge>
  );
}

export default function IncidentCenterPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('unassigned');

  const overviewQuery = trpc.incidents.overview.useQuery({ lookbackDays: 14 });
  const assigneesQuery = trpc.incidents.assignees.useQuery();
  const detailQuery = trpc.incidents.detail.useQuery(
    { incidentId: selectedIncidentId ?? '', lookbackDays: 30 },
    { enabled: !!selectedIncidentId },
  );

  useEffect(() => {
    if (!selectedIncidentId && overviewQuery.data?.openIncidents?.[0]?.id) {
      setSelectedIncidentId(overviewQuery.data.openIncidents[0].id);
    }
  }, [overviewQuery.data, selectedIncidentId]);

  useEffect(() => {
    if (detailQuery.data?.incident.assignedUserId) {
      setSelectedAssigneeId(detailQuery.data.incident.assignedUserId);
    } else if (detailQuery.data) {
      setSelectedAssigneeId('unassigned');
    }
  }, [detailQuery.data]);

  const refetchAll = async () => {
    await Promise.all([
      overviewQuery.refetch(),
      selectedIncidentId ? detailQuery.refetch() : Promise.resolve(),
      assigneesQuery.refetch(),
    ]);
  };

  const acknowledgeMutation = trpc.incidents.acknowledge.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Incident acknowledged',
        description: 'The incident workflow status has been updated.',
      });
      setNoteInput('');
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: 'Acknowledge failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const assignMutation = trpc.incidents.assign.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Incident assignment updated',
        description: 'Ownership has been updated.',
      });
      setNoteInput('');
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: 'Assignment failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const addNoteMutation = trpc.incidents.addNote.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Note added',
        description: 'The note is now part of the incident timeline.',
      });
      setNoteInput('');
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: 'Note failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resolveMutation = trpc.incidents.resolve.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Incident resolved',
        description: 'The incident has been closed.',
      });
      setNoteInput('');
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: 'Resolve failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const severityMutation = trpc.incidents.updateSeverity.useMutation({
    onSuccess: async () => {
      toast({
        title: 'Severity updated',
        description: 'Incident severity has been updated.',
      });
      await refetchAll();
    },
    onError: (error) => {
      toast({
        title: 'Severity update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

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
                  Track live server incidents, assign owners, add notes, and preserve a real resolution history.
                </CardDescription>
              </div>
            </div>

            <Button variant="outline" className="rounded-full" onClick={() => void refetchAll()}>
              Refresh
            </Button>
          </CardHeader>

          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Acknowledged</p>
                <p className="mt-3 text-3xl font-semibold">{overviewQuery.data?.summary.acknowledgedOpen ?? 0}</p>
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
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Alert history</CardTitle>
              <CardDescription>Latest notification events driving incident awareness.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/notifications">Open notifications</Link>
            </Button>
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
                  onClick={() => setSelectedIncidentId(incident.id)}
                  className={cn(
                    'w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors',
                    selectedIncidentId === incident.id
                      ? 'border-primary/40 bg-primary/8'
                      : 'border-border/70 bg-background/65 hover:border-primary/25',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={incident.severity} />
                        <WorkflowBadge status={incident.workflowStatus} />
                      </div>
                      <p className="font-semibold">{incident.serverName}</p>
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
                    {incident.assignedUserEmail ? <span>Assigned: {incident.assignedUserEmail}</span> : null}
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
            <CardTitle className="text-xl">Incident workflow and impact</CardTitle>
            <CardDescription>
              {selectedDetail
                ? `Manage status, assignments, notes, and notification history for ${selectedDetail.server?.name ?? selectedDetail.incident.title}.`
                : 'Select an open incident to inspect keys, users, notifications, and the resolution timeline.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedDetail ? (
              <div className="rounded-[1.5rem] border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                Choose an incident from the left column to inspect and manage it.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Workflow</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={selectedDetail.incident.severity} />
                        <WorkflowBadge status={selectedDetail.incident.status} />
                        {selectedDetail.incident.assignedUserEmail ? (
                          <Badge variant="outline">Assigned to {selectedDetail.incident.assignedUserEmail}</Badge>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Severity</p>
                        <Select
                          value={selectedDetail.incident.severity}
                          onValueChange={(value) =>
                            severityMutation.mutate({
                              incidentId: selectedDetail.incident.id,
                              severity: value as 'critical' | 'warning' | 'info',
                            })
                          }
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">critical</SelectItem>
                            <SelectItem value="warning">warning</SelectItem>
                            <SelectItem value="info">info</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Assign owner</p>
                        <div className="flex gap-2">
                          <Select value={selectedAssigneeId} onValueChange={setSelectedAssigneeId}>
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="Select assignee" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {(assigneesQuery.data ?? []).map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            className="rounded-xl"
                            onClick={() =>
                              assignMutation.mutate({
                                incidentId: selectedDetail.incident.id,
                                assigneeUserId: selectedAssigneeId === 'unassigned' ? null : selectedAssigneeId,
                                note: noteInput.trim() || undefined,
                              })
                            }
                            disabled={assignMutation.isPending}
                          >
                            Assign
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() =>
                            acknowledgeMutation.mutate({
                              incidentId: selectedDetail.incident.id,
                              note: noteInput.trim() || undefined,
                            })
                          }
                          disabled={acknowledgeMutation.isPending || selectedDetail.incident.status === 'ACKNOWLEDGED'}
                        >
                          Acknowledge
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() =>
                            addNoteMutation.mutate({
                              incidentId: selectedDetail.incident.id,
                              note: noteInput.trim(),
                            })
                          }
                          disabled={addNoteMutation.isPending || !noteInput.trim()}
                        >
                          Add note
                        </Button>
                        <Button
                          className="rounded-xl"
                          onClick={() =>
                            resolveMutation.mutate({
                              incidentId: selectedDetail.incident.id,
                              note: noteInput.trim() || undefined,
                            })
                          }
                          disabled={resolveMutation.isPending || selectedDetail.incident.status === 'RESOLVED'}
                        >
                          Resolve
                        </Button>
                      </div>
                      <Textarea
                        value={noteInput}
                        onChange={(event) => setNoteInput(event.target.value)}
                        placeholder="Add assignment context, acknowledgement note, or resolution notes…"
                        className="min-h-[120px] rounded-2xl"
                      />
                    </CardContent>
                  </Card>

                  <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">At-a-glance impact</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="rounded-2xl border border-border/60 px-3 py-3">
                        <p className="font-medium">{selectedDetail.incident.title}</p>
                        <p className="mt-1 text-muted-foreground">{selectedDetail.incident.summary}</p>
                      </div>
                      {selectedDetail.server ? (
                        <div className="rounded-2xl border border-border/60 px-3 py-3">
                          <p className="font-medium">{selectedDetail.server.name}</p>
                          <p className="mt-1 text-muted-foreground">
                            {selectedDetail.server.status} •{' '}
                            {selectedDetail.server.latencyMs != null ? `${selectedDetail.server.latencyMs} ms` : 'No latency'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Last checked {selectedDetail.server.lastCheckedAt ? formatDateTime(selectedDetail.server.lastCheckedAt) : 'Never'}
                          </p>
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-border/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Affected keys</p>
                          <p className="mt-2 text-2xl font-semibold">{selectedDetail.incident.affectedKeyCount}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Affected users</p>
                          <p className="mt-2 text-2xl font-semibold">{selectedDetail.incident.affectedUserCount}</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/60 px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Notes</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {selectedDetail.incident.notes || 'No operator notes yet.'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

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
                  <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                    <div>
                      <CardTitle className="text-base">Notification links</CardTitle>
                      <CardDescription>Recent delivery history connected to this incident.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/dashboard/notifications">Open delivery history</Link>
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedDetail.notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No notification deliveries were linked to this incident yet.</p>
                    ) : (
                      selectedDetail.notifications.slice(0, 8).map((entry) => (
                        <div key={entry.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/60 px-3 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <BellRing className="h-4 w-4 text-primary" />
                              <p className="font-medium">{entry.event.replace(/_/g, ' ')}</p>
                              <Badge variant="outline">{entry.status}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{entry.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.channelName ? `${entry.channelName} (${entry.channelType})` : 'System log'}
                            </p>
                            {entry.error ? <p className="text-xs text-red-500">{entry.error}</p> : null}
                          </div>
                          <p className="whitespace-nowrap text-xs text-muted-foreground">{formatRelativeTime(entry.sentAt)}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-[1.5rem] border border-border/70 bg-background/65">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Resolution timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedDetail.timeline.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No timeline entries were found for this incident yet.</p>
                    ) : (
                      selectedDetail.timeline.slice(0, 16).map((entry) => (
                        <div key={entry.id} className="flex gap-3 rounded-2xl border border-border/60 px-3 py-3">
                          <div className="mt-0.5">
                            {entry.category === 'alert' ? (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            ) : entry.category === 'audit' ? (
                              <ScrollText className="h-4 w-4 text-sky-500" />
                            ) : entry.category === 'state' ? (
                              <ServerCrash className="h-4 w-4 text-rose-500" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{entry.title}</p>
                              <SeverityBadge severity={entry.severity} />
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                            {entry.actorEmail ? (
                              <p className="mt-1 text-xs text-muted-foreground">Actor: {entry.actorEmail}</p>
                            ) : null}
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
