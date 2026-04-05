'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { withBasePath } from '@/lib/base-path';
import { trpc } from '@/lib/trpc';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';

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

function getMacroLabel(macro: 'WORKING' | 'NEED_DETAILS' | 'ESCALATE' | 'HANDLED') {
  switch (macro) {
    case 'WORKING':
      return 'Working on it';
    case 'NEED_DETAILS':
      return 'Need details';
    case 'ESCALATE':
      return 'Escalate';
    case 'HANDLED':
    default:
      return 'Handled';
  }
}

export default function SupportThreadDetailPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = Array.isArray(params?.threadId) ? params.threadId[0] : params?.threadId || '';
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [selectedAdminId, setSelectedAdminId] = useState<string>('unassigned');
  const [replyMessage, setReplyMessage] = useState('');

  const detailQuery = trpc.users.getSupportThreadDetail.useQuery(
    { threadId },
    { enabled: threadId.length > 0 },
  );

  const claimMutation = trpc.users.claimSupportThread.useMutation({
    onSuccess: async () => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: 'Support thread claimed' });
    },
    onError: (error) => {
      toast({ title: 'Claim failed', description: error.message, variant: 'destructive' });
    },
  });

  const unclaimMutation = trpc.users.unclaimSupportThread.useMutation({
    onSuccess: async () => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: 'Support thread unclaimed' });
    },
    onError: (error) => {
      toast({ title: 'Unclaim failed', description: error.message, variant: 'destructive' });
    },
  });

  const assignMutation = trpc.users.assignSupportThread.useMutation({
    onSuccess: async () => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: 'Support thread assignment updated' });
    },
    onError: (error) => {
      toast({ title: 'Assign failed', description: error.message, variant: 'destructive' });
    },
  });

  const replyMutation = trpc.users.replyToSupportThread.useMutation({
    onSuccess: async () => {
      setReplyMessage('');
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: 'Reply sent to customer' });
    },
    onError: (error) => {
      toast({ title: 'Reply failed', description: error.message, variant: 'destructive' });
    },
  });

  const macroMutation = trpc.users.applySupportThreadMacro.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: `${getMacroLabel(variables.macro)} sent` });
    },
    onError: (error) => {
      toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (detailQuery.data?.thread.assignedAdminUserId) {
      setSelectedAdminId(detailQuery.data.thread.assignedAdminUserId);
      return;
    }
    setSelectedAdminId('unassigned');
  }, [detailQuery.data?.thread.assignedAdminUserId]);

  const isBusy =
    claimMutation.isPending
    || unclaimMutation.isPending
    || assignMutation.isPending
    || replyMutation.isPending
    || macroMutation.isPending;

  if (detailQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!detailQuery.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href={withBasePath('/dashboard/users')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to users
          </Link>
        </Button>
        <Card className="ops-detail-card">
          <CardHeader>
            <CardTitle>Support thread not found</CardTitle>
            <CardDescription>The support thread may have been deleted or you do not have permission to open it.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { thread, assignableAdmins } = detailQuery.data;
  const customerHref = thread.customer
    ? withBasePath(`/dashboard/users/${thread.customer.id}`)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={withBasePath('/dashboard/support')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Support center
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={customerHref || withBasePath('/dashboard/users')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {customerHref ? 'Back to CRM' : 'Back to users'}
              </Link>
            </Button>
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
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{thread.threadCode}</h1>
            <p className="text-sm text-muted-foreground">
              Telegram support thread with ownership, SLA, reply history, and escalation controls.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {thread.customer ? (
            <Button asChild variant="outline">
              <Link href={customerHref || '#'}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open customer CRM
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <Card className="ops-detail-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Thread history
            </CardTitle>
            <CardDescription>Full reply history, including attachment previews and latest thread context.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {thread.replies.length === 0 ? (
              <div className="rounded-[1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                No replies yet.
              </div>
            ) : (
              thread.replies.map((reply) => {
                const isAdmin = reply.senderType === 'ADMIN';
                return (
                  <div
                    key={reply.id}
                    className={`rounded-[1rem] border p-4 ${
                      isAdmin
                        ? 'border-sky-500/20 bg-sky-500/10'
                        : 'border-border/60 bg-background/40 dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={isAdmin ? 'secondary' : 'outline'}>
                            {isAdmin ? 'Admin' : 'Customer'}
                          </Badge>
                          {reply.senderName ? (
                            <span className="text-sm font-medium">{reply.senderName}</span>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">{formatDateTime(reply.createdAt)}</p>
                      </div>
                      {reply.mediaUrl ? (
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={reply.mediaUrl} target="_blank">
                              <Paperclip className="mr-2 h-4 w-4" />
                              Open attachment
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`${reply.mediaUrl}?download=1`} target="_blank">
                              Download
                            </Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{reply.message}</p>
                    {reply.mediaKind ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {reply.mediaKind === 'IMAGE' ? 'Image attachment' : 'File attachment'}
                        {reply.mediaFilename ? ` • ${reply.mediaFilename}` : ''}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Thread status
              </CardTitle>
              <CardDescription>Ownership, SLA, related context, and direct thread controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Assigned</p>
                  <p className="mt-2 text-sm font-medium">{thread.assignedAdminName || 'Unassigned'}</p>
                </div>
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">SLA</p>
                  <p className="mt-2 text-sm font-medium">
                    {thread.firstResponseDueAt ? formatDateTime(thread.firstResponseDueAt) : 'Open'}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Created</p>
                  <p className="mt-2 text-sm font-medium">{formatRelativeTime(thread.createdAt)}</p>
                </div>
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last update</p>
                  <p className="mt-2 text-sm font-medium">{formatRelativeTime(thread.updatedAt)}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Related context</p>
                <p>{thread.customer?.email || thread.telegramUsername || thread.telegramUserId}</p>
                {thread.relatedOrderCode ? <p>Order: {thread.relatedOrderCode}</p> : null}
                {thread.relatedKeyName ? <p>Key: {thread.relatedKeyName}</p> : null}
                {thread.relatedServerName ? <p>Server: {thread.relatedServerName}</p> : null}
              </div>

              <div className="space-y-3">
                <Label>Assigned admin</Label>
                <Select
                  value={selectedAdminId}
                  onValueChange={(value) => setSelectedAdminId(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select admin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignableAdmins.map((admin) => (
                      <SelectItem key={admin.id} value={admin.id}>
                        {admin.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={isBusy}
                  onClick={() =>
                    assignMutation.mutate({
                      threadId,
                      assignedAdminUserId: selectedAdminId === 'unassigned' ? null : selectedAdminId,
                    })
                  }
                >
                  {assignMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                  Save assignment
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => claimMutation.mutate({ threadId })}
                >
                  Claim to me
                </Button>
                <Button
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => unclaimMutation.mutate({ threadId })}
                >
                  Unclaim
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-primary" />
                Quick workflows
              </CardTitle>
              <CardDescription>Use macros for common support moves, or send a manual customer reply.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {(['WORKING', 'NEED_DETAILS', 'ESCALATE', 'HANDLED'] as const).map((macro) => (
                  <Button
                    key={macro}
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => macroMutation.mutate({ threadId, macro })}
                  >
                    {getMacroLabel(macro)}
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                <Label htmlFor="support-reply">Manual reply</Label>
                <Textarea
                  id="support-reply"
                  placeholder="Write the reply that should be sent back to the customer."
                  value={replyMessage}
                  onChange={(event) => setReplyMessage(event.target.value)}
                  rows={6}
                />
                <Button
                  disabled={isBusy || replyMessage.trim().length === 0}
                  onClick={() => replyMutation.mutate({ threadId, message: replyMessage })}
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send reply
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
