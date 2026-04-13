'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  Loader2,
  MessageSquare,
  Paperclip,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { withBasePath } from '@/lib/base-path';
import { trpc } from '@/lib/trpc';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';

type SupportStatusFilter = 'ALL' | 'ACTIVE' | 'WAITING_ADMIN' | 'WAITING_USER' | 'ESCALATED' | 'HANDLED' | 'OVERDUE';
type SupportAssignmentFilter = 'ALL' | 'UNASSIGNED' | 'MINE' | 'ASSIGNED';
type SupportIssueFilter = 'ALL' | 'ORDER' | 'KEY' | 'SERVER' | 'BILLING' | 'GENERAL';

function getThreadStateLabel(status: string, waitingOn: string) {
  if (status === 'HANDLED') {
    return 'Handled';
  }
  if (status === 'ESCALATED') {
    return 'Escalated';
  }
  return (waitingOn || '').toUpperCase() === 'USER' ? 'Waiting for customer' : 'Waiting for admin';
}

function getThreadStateBadgeClass(status: string, waitingOn: string) {
  if (status === 'HANDLED') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
  if (status === 'ESCALATED') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }
  return (waitingOn || '').toUpperCase() === 'USER'
    ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
    : 'border-red-500/30 bg-red-500/10 text-red-100';
}

function getLatestReplyPreview(reply: {
  message: string;
  mediaKind: string | null;
  senderType: string;
} | null) {
  if (!reply) {
    return 'No replies yet.';
  }

  const prefix = reply.senderType === 'ADMIN' ? 'Admin' : 'Customer';
  const message = reply.message.trim();
  if (message) {
    const preview = message.length > 180 ? `${message.slice(0, 177)}...` : message;
    return `${prefix}: ${preview}`;
  }
  if (reply.mediaKind === 'IMAGE') {
    return `${prefix}: image attachment`;
  }
  if (reply.mediaKind) {
    return `${prefix}: file attachment`;
  }
  return `${prefix}: update sent`;
}

function getLatestReplyAttachmentLabel(reply: {
  mediaKind: string | null;
  mediaFilename?: string | null;
} | null) {
  if (!reply?.mediaKind) {
    return null;
  }

  if (reply.mediaKind === 'IMAGE') {
    return reply.mediaFilename?.trim() || 'Image attachment';
  }

  return reply.mediaFilename?.trim() || 'File attachment';
}

function SupportStatCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-500/25 bg-red-500/10'
      : tone === 'warning'
        ? 'border-amber-500/25 bg-amber-500/10'
        : '';

  return (
    <div className={`ops-kpi-tile ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

function formatDurationLabel(minutes: number | null) {
  if (minutes == null) {
    return 'No data yet';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export default function SupportCenterPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<SupportStatusFilter>('ACTIVE');
  const [assignmentFilter, setAssignmentFilter] = useState<SupportAssignmentFilter>('ALL');
  const [issueFilter, setIssueFilter] = useState<SupportIssueFilter>('ALL');
  const [analyticsWindowDays, setAnalyticsWindowDays] = useState(30);
  const [search, setSearch] = useState('');

  const currentUserQuery = trpc.auth.me.useQuery();
  const threadsQuery = trpc.users.listSupportThreads.useQuery({
    status: statusFilter,
    assignment: assignmentFilter,
    issueCategory: issueFilter,
    query: search.trim() || undefined,
    limit: 60,
  });
  const analyticsQuery = trpc.users.supportThreadAnalytics.useQuery({
    days: analyticsWindowDays,
  });

  const claimMutation = trpc.users.claimSupportThread.useMutation({
    onSuccess: async () => {
      await Promise.all([threadsQuery.refetch(), analyticsQuery.refetch()]);
      toast({ title: 'Support thread claimed' });
    },
    onError: (error) => {
      toast({ title: 'Claim failed', description: error.message, variant: 'destructive' });
    },
  });

  const unclaimMutation = trpc.users.unclaimSupportThread.useMutation({
    onSuccess: async () => {
      await Promise.all([threadsQuery.refetch(), analyticsQuery.refetch()]);
      toast({ title: 'Support thread unclaimed' });
    },
    onError: (error) => {
      toast({ title: 'Unclaim failed', description: error.message, variant: 'destructive' });
    },
  });

  const currentUserId = currentUserQuery.data?.id ?? null;
  const isBusy = claimMutation.isPending || unclaimMutation.isPending;
  const threads = threadsQuery.data?.threads || [];

  const boardCards = [
    {
      id: 'unassigned',
      title: 'Unassigned',
      helper: 'Claimable threads with no owner.',
      value: threadsQuery.data?.summary.unassigned || 0,
      isActive: assignmentFilter === 'UNASSIGNED' && statusFilter === 'ACTIVE',
      onClick: () => {
        setAssignmentFilter('UNASSIGNED');
        setStatusFilter('ACTIVE');
      },
    },
    {
      id: 'mine',
      title: 'Mine',
      helper: 'Your currently assigned queue.',
      value: threadsQuery.data?.summary.mine || 0,
      isActive: assignmentFilter === 'MINE' && statusFilter === 'ACTIVE',
      onClick: () => {
        setAssignmentFilter('MINE');
        setStatusFilter('ACTIVE');
      },
    },
    {
      id: 'waiting-admin',
      title: 'Waiting for admin',
      helper: 'Threads blocked on operator action.',
      value: threadsQuery.data?.summary.waitingAdmin || 0,
      isActive: statusFilter === 'WAITING_ADMIN',
      onClick: () => {
        setAssignmentFilter('ALL');
        setStatusFilter('WAITING_ADMIN');
      },
    },
    {
      id: 'waiting-user',
      title: 'Waiting for customer',
      helper: 'Threads awaiting customer follow-up.',
      value: threadsQuery.data?.summary.waitingUser || 0,
      isActive: statusFilter === 'WAITING_USER',
      onClick: () => {
        setAssignmentFilter('ALL');
        setStatusFilter('WAITING_USER');
      },
    },
    {
      id: 'overdue',
      title: 'Overdue',
      helper: 'First-response SLA has already slipped.',
      value: threadsQuery.data?.summary.overdue || 0,
      isActive: statusFilter === 'OVERDUE',
      onClick: () => {
        setAssignmentFilter('ALL');
        setStatusFilter('OVERDUE');
      },
    },
  ];

  const emptyStateLabel = useMemo(() => {
    if (threadsQuery.isLoading) {
      return 'Loading support threads...';
    }
    if (search.trim()) {
      return 'No support threads matched that search.';
    }
    return 'No support threads matched the current filters.';
  }, [search, threadsQuery.isLoading]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Support center</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Support threads</h1>
            <p className="text-sm text-muted-foreground">
              One place for Telegram support ownership, SLA follow-up, and customer thread navigation.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={withBasePath('/dashboard/users')}>
              <Users className="mr-2 h-4 w-4" />
              Open CRM
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SupportStatCard
          label="Open threads"
          value={threadsQuery.data?.summary.open || 0}
          helper="Currently open or escalated"
        />
        <SupportStatCard
          label="Waiting for admin"
          value={threadsQuery.data?.summary.waitingAdmin || 0}
          helper="Needs operator action"
          tone="warning"
        />
        <SupportStatCard
          label="Waiting for customer"
          value={threadsQuery.data?.summary.waitingUser || 0}
          helper="Awaiting customer reply"
        />
        <SupportStatCard
          label="Overdue"
          value={threadsQuery.data?.summary.overdue || 0}
          helper="First response SLA missed"
          tone="danger"
        />
        <SupportStatCard
          label="Unassigned"
          value={threadsQuery.data?.summary.unassigned || 0}
          helper="No owner yet"
        />
        <SupportStatCard
          label="Assigned to me"
          value={threadsQuery.data?.summary.mine || 0}
          helper="Your active support load"
        />
      </div>

      <Card className="ops-detail-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Assignment board
          </CardTitle>
          <CardDescription>Jump straight into the queue slice you need to work next.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {boardCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={card.onClick}
              className={[
                'rounded-[1rem] border p-4 text-left transition-all',
                card.isActive
                  ? 'border-primary/40 bg-primary/10 shadow-[0_14px_32px_rgba(14,165,233,0.12)]'
                  : 'border-border/60 bg-background/40 hover:border-primary/20 hover:bg-background/70',
              ].join(' ')}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{card.title}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{card.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{card.helper}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="ops-detail-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Filters
          </CardTitle>
          <CardDescription>Search by code, customer, order, key, server, or thread subject.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code, email, order, key, server..."
          />
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SupportStatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Thread state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="WAITING_ADMIN">Waiting for admin</SelectItem>
              <SelectItem value="WAITING_USER">Waiting for customer</SelectItem>
              <SelectItem value="ESCALATED">Escalated</SelectItem>
              <SelectItem value="OVERDUE">Overdue</SelectItem>
              <SelectItem value="HANDLED">Handled</SelectItem>
              <SelectItem value="ALL">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assignmentFilter} onValueChange={(value) => setAssignmentFilter(value as SupportAssignmentFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All assignments</SelectItem>
              <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
              <SelectItem value="MINE">Assigned to me</SelectItem>
              <SelectItem value="ASSIGNED">Assigned to someone</SelectItem>
            </SelectContent>
          </Select>
          <Select value={issueFilter} onValueChange={(value) => setIssueFilter(value as SupportIssueFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Issue category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              <SelectItem value="ORDER">Order / payment</SelectItem>
              <SelectItem value="KEY">Key / usage</SelectItem>
              <SelectItem value="SERVER">Server / route issue</SelectItem>
              <SelectItem value="BILLING">Billing / refund</SelectItem>
              <SelectItem value="GENERAL">General help</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="ops-detail-card">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Support analytics
            </CardTitle>
            <CardDescription>Response speed, handled time, overdue rate, and workload split.</CardDescription>
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={String(analyticsWindowDays)}
              onValueChange={(value) => setAnalyticsWindowDays(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Analytics window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {analyticsQuery.isLoading ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : analyticsQuery.data ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SupportStatCard
                  label="First response"
                  value={formatDurationLabel(analyticsQuery.data.summary.firstResponseMinutes)}
                  helper={`Average in the last ${analyticsQuery.data.timeframeDays} days`}
                />
                <SupportStatCard
                  label="Handled time"
                  value={formatDurationLabel(analyticsQuery.data.summary.handledMinutes)}
                  helper="Average time from thread open to handled"
                />
                <SupportStatCard
                  label="Overdue rate"
                  value={`${analyticsQuery.data.summary.overdueRate}%`}
                  helper={`${analyticsQuery.data.summary.overdue} overdue of ${analyticsQuery.data.summary.total} threads`}
                  tone={analyticsQuery.data.summary.overdueRate >= 20 ? 'danger' : analyticsQuery.data.summary.overdueRate >= 10 ? 'warning' : 'default'}
                />
                <SupportStatCard
                  label="Handled"
                  value={analyticsQuery.data.summary.handled}
                  helper={`${analyticsQuery.data.summary.open} still open in the same window`}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                  <div className="mb-4">
                    <p className="text-sm font-semibold">By admin</p>
                    <p className="text-sm text-muted-foreground">Ownership load, response speed, and overdue rate.</p>
                  </div>
                  <div className="space-y-3">
                    {analyticsQuery.data.byAdmin.map((bucket) => (
                      <div key={bucket.key} className="rounded-[0.9rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{bucket.label}</p>
                          <Badge variant="outline">{bucket.total} threads</Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                          <p>Open: {bucket.open}</p>
                          <p>Handled: {bucket.handled}</p>
                          <p>First reply: {formatDurationLabel(bucket.firstResponseMinutes)}</p>
                          <p>Overdue: {bucket.overdueRate}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                  <div className="mb-4">
                    <p className="text-sm font-semibold">By category</p>
                    <p className="text-sm text-muted-foreground">See which issue types are driving response time.</p>
                  </div>
                  <div className="space-y-3">
                    {analyticsQuery.data.byCategory.map((bucket) => (
                      <div key={bucket.key} className="rounded-[0.9rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{bucket.label}</p>
                          <Badge variant="outline">{bucket.total} threads</Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                          <p>Open: {bucket.open}</p>
                          <p>Handled: {bucket.handled}</p>
                          <p>Handled time: {formatDurationLabel(bucket.handledMinutes)}</p>
                          <p>Overdue: {bucket.overdueRate}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="ops-detail-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Thread queue
          </CardTitle>
          <CardDescription>
            Open the full thread, claim ownership, or jump straight into the linked customer CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {threadsQuery.isLoading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : threads.length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              {emptyStateLabel}
            </div>
          ) : (
            threads.map((thread) => {
              const isMine = Boolean(currentUserId && thread.assignedAdminUserId === currentUserId);
              const customerLabel = thread.customer?.email || thread.telegramUsername || thread.threadCode;
              const latestPreview = getLatestReplyPreview(thread.latestReply);
              const threadHref = withBasePath(`/dashboard/support/threads/${thread.id}`);
              const customerHref = thread.customer ? withBasePath(`/dashboard/users/${thread.customer.id}`) : null;

              return (
                <div key={thread.id} className="rounded-[1.1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold">{thread.threadCode}</p>
                        <Badge variant="outline" className={getThreadStateBadgeClass(thread.status, thread.waitingOn)}>
                          {getThreadStateLabel(thread.status, thread.waitingOn)}
                        </Badge>
                        <Badge variant="outline">{thread.issueLabel}</Badge>
                        {thread.isOverdue ? (
                          <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-100">
                            Overdue
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium">{customerLabel}</p>
                      {thread.subject ? (
                        <p className="text-sm text-muted-foreground">{thread.subject}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={threadHref}>
                          Open thread
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      {customerHref ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={customerHref}>Open CRM</Link>
                        </Button>
                      ) : null}
                      {thread.assignedAdminUserId ? (
                        isMine ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => unclaimMutation.mutate({ threadId: thread.id })}
                          >
                            Unclaim
                          </Button>
                        ) : null
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => claimMutation.mutate({ threadId: thread.id })}
                        >
                          Claim
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
                    <div className="space-y-2 rounded-[0.95rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Latest reply</p>
                      <p className="text-sm leading-6 text-foreground">{latestPreview}</p>
                      {thread.latestReply?.mediaUrl ? (
                        <div className="rounded-[0.85rem] border border-border/60 bg-background/70 p-2 dark:bg-white/[0.03]">
                          {thread.latestReply.mediaKind === 'IMAGE' ? (
                            <a
                              href={thread.latestReply.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-[0.7rem]"
                            >
                              <img
                                src={thread.latestReply.mediaUrl}
                                alt={getLatestReplyAttachmentLabel(thread.latestReply) || 'Support attachment'}
                                className="h-32 w-full rounded-[0.7rem] object-cover"
                              />
                            </a>
                          ) : (
                            <a
                              href={thread.latestReply.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-[0.7rem] px-2 py-2 text-sm text-foreground transition hover:bg-background/80"
                            >
                              <Paperclip className="h-4 w-4 text-primary" />
                              <span className="truncate">{getLatestReplyAttachmentLabel(thread.latestReply)}</span>
                            </a>
                          )}
                        </div>
                      ) : null}
                      {thread.latestReply ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDateTime(thread.latestReply.createdAt)}</span>
                          {thread.latestReply.mediaKind ? (
                            <Badge variant="outline" className="text-[10px]">
                              {thread.latestReply.mediaKind === 'IMAGE' ? 'Image attached' : 'File attached'}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div className="rounded-[0.95rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <UserCheck className="h-3.5 w-3.5" />
                          Owner
                        </p>
                        <p className="mt-2 text-sm font-medium">{thread.assignedAdminName || 'Unassigned'}</p>
                      </div>
                      <div className="rounded-[0.95rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5" />
                          SLA
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {thread.firstResponseDueAt ? formatDateTime(thread.firstResponseDueAt) : 'Handled / no SLA'}
                        </p>
                      </div>
                      <div className="rounded-[0.95rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Related
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {thread.relatedOrderCode || thread.relatedKeyName || thread.relatedServerName || 'General help'}
                        </p>
                      </div>
                      <div className="rounded-[0.95rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Age
                        </p>
                        <p className="mt-2 text-sm font-medium">{formatRelativeTime(thread.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
