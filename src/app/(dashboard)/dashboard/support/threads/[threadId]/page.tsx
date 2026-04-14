'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  BookmarkPlus,
  Clock3,
  ExternalLink,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  ShieldAlert,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DetailHero,
  DetailHeroAside,
  DetailHeroGrid,
  DetailKpiTile,
  DetailMetricGrid,
  DetailMiniTile,
  DetailMiniTileGrid,
  DetailNoteBlock,
} from '@/components/ui/detail-workspace';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { withBasePath } from '@/lib/base-path';
import { trpc } from '@/lib/trpc';
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils';

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

function getTemplateActionLabel(action: 'WORKING' | 'NEED_DETAILS' | 'ESCALATE' | 'HANDLED' | null | undefined) {
  switch (action) {
    case 'WORKING':
      return 'Working';
    case 'NEED_DETAILS':
      return 'Need details';
    case 'ESCALATE':
      return 'Escalate';
    case 'HANDLED':
      return 'Handled';
    default:
      return 'Reply';
  }
}

export default function SupportThreadDetailPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = Array.isArray(params?.threadId) ? params.threadId[0] : params?.threadId || '';
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [selectedAdminId, setSelectedAdminId] = useState<string>('unassigned');
  const [replyMessage, setReplyMessage] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateStatusAction, setTemplateStatusAction] = useState<'NONE' | 'WORKING' | 'NEED_DETAILS' | 'ESCALATE' | 'HANDLED'>('NONE');

  const detailQuery = trpc.users.getSupportThreadDetail.useQuery(
    { threadId },
    { enabled: threadId.length > 0 },
  );
  const templateLocale = detailQuery.data?.thread.locale === 'my' ? 'my' : 'en';
  const templateCategory =
    detailQuery.data?.thread.issueCategory === 'ORDER'
    || detailQuery.data?.thread.issueCategory === 'KEY'
    || detailQuery.data?.thread.issueCategory === 'SERVER'
    || detailQuery.data?.thread.issueCategory === 'BILLING'
      ? detailQuery.data.thread.issueCategory
      : 'GENERAL';
  const templatesQuery = trpc.users.listSupportReplyTemplates.useQuery(
    {
      category: templateCategory,
      locale: templateLocale,
    },
    {
      enabled: threadId.length > 0 && Boolean(detailQuery.data?.thread),
    },
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

  const applyTemplateMutation = trpc.users.applySupportReplyTemplate.useMutation({
    onSuccess: async () => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: 'Template sent to customer' });
    },
    onError: (error) => {
      toast({ title: 'Template failed', description: error.message, variant: 'destructive' });
    },
  });

  const saveTemplateMutation = trpc.users.saveSupportReplyTemplate.useMutation({
    onSuccess: async () => {
      setTemplateTitle('');
      setTemplateStatusAction('NONE');
      await utils.users.listSupportReplyTemplates.invalidate({
        category: templateCategory,
        locale: templateLocale,
      });
      toast({ title: 'Support reply template saved' });
    },
    onError: (error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTemplateMutation = trpc.users.deleteSupportReplyTemplate.useMutation({
    onSuccess: async () => {
      await utils.users.listSupportReplyTemplates.invalidate({
        category: templateCategory,
        locale: templateLocale,
      });
      toast({ title: 'Support reply template deleted' });
    },
    onError: (error) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
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
    || macroMutation.isPending
    || applyTemplateMutation.isPending
    || saveTemplateMutation.isPending
    || deleteTemplateMutation.isPending;

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
  const latestReply = thread.replies[thread.replies.length - 1] || null;
  const adminReplyCount = thread.replies.filter((reply) => reply.senderType === 'ADMIN').length;
  const customerReplyCount = thread.replies.length - adminReplyCount;
  const participantLabel = thread.customer?.email || thread.telegramUsername || thread.telegramUserId || 'Telegram user';
  const contextItems = [
    thread.relatedOrderCode ? `Order ${thread.relatedOrderCode}` : null,
    thread.relatedKeyName ? `Key ${thread.relatedKeyName}` : null,
    thread.relatedServerName ? `Server ${thread.relatedServerName}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6" data-testid="support-thread-detail-page">
      <DetailHero data-testid="support-thread-detail-hero">
        <DetailHeroGrid>
          <div className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link href={withBasePath('/dashboard/support')}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Support center
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link href={customerHref || withBasePath('/dashboard/users')}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      {customerHref ? 'Back to CRM' : 'Back to users'}
                    </Link>
                  </Button>
                  <Badge variant="outline" className={cn('rounded-full', getThreadStateBadgeClass(thread.status, thread.waitingOn))}>
                    {getThreadStateLabel(thread.status, thread.waitingOn)}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">{thread.issueLabel}</Badge>
                  {thread.isOverdue ? (
                    <Badge variant="outline" className="rounded-full border-red-500/30 bg-red-500/10 text-red-100">
                      Overdue
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{thread.threadCode}</h1>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                    Telegram support thread with ownership, SLA, saved replies, and attachment-aware history in one workspace.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <DetailKpiTile
                    label="Replies"
                    value={thread.replies.length}
                    meta={`${adminReplyCount} admin • ${customerReplyCount} customer`}
                    valueClassName="text-3xl tracking-tight"
                  />
                  <DetailKpiTile
                    label="Waiting on"
                    value={(thread.waitingOn || '').toUpperCase() === 'USER' ? 'Customer' : 'Admin'}
                    meta={thread.firstResponseDueAt ? `SLA ${formatDateTime(thread.firstResponseDueAt)}` : 'No SLA deadline set'}
                    valueClassName="tracking-tight"
                  />
                  <DetailKpiTile
                    label="Last update"
                    value={formatRelativeTime(thread.updatedAt)}
                    meta={`Created ${formatRelativeTime(thread.createdAt)}`}
                    valueClassName="tracking-tight"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {thread.customer ? (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={customerHref || '#'}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open customer CRM
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <DetailHeroAside
            title="Thread summary"
            description="Keep ownership, customer identity, and latest context visible while replying."
          >
            <DetailMiniTileGrid>
              <DetailMiniTile label="Customer" value={participantLabel} valueClassName="break-words" />
              <DetailMiniTile label="Assigned admin" value={thread.assignedAdminName || 'Unassigned'} />
              <DetailMiniTile label="Thread opened" value={formatDateTime(thread.createdAt)} />
              <DetailMiniTile
                label="Latest reply"
                value={latestReply ? formatRelativeTime(latestReply.createdAt) : 'No replies yet'}
              />
            </DetailMiniTileGrid>

            <DetailNoteBlock>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Linked context</p>
              {contextItems.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {contextItems.map((item) => (
                    <span key={item} className="ops-pill">
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No order, key, or server context was attached to this thread.</p>
              )}
            </DetailNoteBlock>

            {latestReply ? (
              <DetailNoteBlock>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Latest preview</p>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-foreground">{latestReply.message}</p>
              </DetailNoteBlock>
            ) : null}
          </DetailHeroAside>
        </DetailHeroGrid>
      </DetailHero>

      <div className="ops-showcase-grid">
        <div className="ops-detail-stack">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Thread history
              </CardTitle>
              <CardDescription>Full reply history, including attachment previews and latest thread context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="ops-panel space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ops-pill">{thread.issueLabel}</span>
                  <span className="ops-pill">{getThreadStateLabel(thread.status, thread.waitingOn)}</span>
                  <span className="ops-pill">{thread.locale === 'my' ? 'Burmese' : 'English'}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Thread code</p>
                    <p className="mt-2 text-sm font-medium">{thread.threadCode}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Last update</p>
                    <p className="mt-2 text-sm font-medium">{formatDateTime(thread.updatedAt)}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">SLA target</p>
                    <p className="mt-2 text-sm font-medium">
                      {thread.firstResponseDueAt ? formatDateTime(thread.firstResponseDueAt) : 'Open'}
                    </p>
                  </div>
                </div>
              </div>

              {thread.replies.length === 0 ? (
                <div className="rounded-[1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  No replies yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {thread.replies.map((reply) => {
                    const isAdmin = reply.senderType === 'ADMIN';
                    return (
                      <div
                        key={reply.id}
                        className={cn('flex', isAdmin ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'w-full max-w-[58rem] rounded-[1.35rem] border p-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]',
                            isAdmin
                              ? 'border-sky-500/20 bg-sky-500/10'
                              : 'border-border/60 bg-background/45 dark:bg-white/[0.03]',
                          )}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={isAdmin ? 'secondary' : 'outline'} className="rounded-full">
                                  {isAdmin ? 'Admin' : 'Customer'}
                                </Badge>
                                {reply.senderName ? (
                                  <span className="text-sm font-medium">{reply.senderName}</span>
                                ) : null}
                                {reply.mediaUrl ? (
                                  <Badge variant="outline" className="rounded-full">
                                    {reply.mediaKind === 'IMAGE' ? 'Attachment image' : 'Attachment file'}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-sm text-muted-foreground">{formatDateTime(reply.createdAt)}</p>
                            </div>
                            {reply.mediaUrl ? (
                              <div className="flex flex-wrap gap-2">
                                <Button asChild size="sm" variant="outline" className="rounded-full">
                                  <Link href={reply.mediaUrl} target="_blank">
                                    <Paperclip className="mr-2 h-4 w-4" />
                                    Open attachment
                                  </Link>
                                </Button>
                                <Button asChild size="sm" variant="outline" className="rounded-full">
                                  <Link href={`${reply.mediaUrl}?download=1`} target="_blank">
                                    Download
                                  </Link>
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{reply.message}</p>
                          {reply.mediaKind ? (
                            <p className="mt-3 text-xs text-muted-foreground">
                              {reply.mediaKind === 'IMAGE' ? 'Image attachment' : 'File attachment'}
                              {reply.mediaFilename ? ` • ${reply.mediaFilename}` : ''}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        <div className="ops-detail-rail">
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
                <div className="ops-mini-tile">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Assigned</p>
                  <p className="mt-2 text-sm font-medium">{thread.assignedAdminName || 'Unassigned'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">SLA</p>
                  <p className="mt-2 text-sm font-medium">
                    {thread.firstResponseDueAt ? formatDateTime(thread.firstResponseDueAt) : 'Open'}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Created</p>
                  <p className="mt-2 text-sm font-medium">{formatRelativeTime(thread.createdAt)}</p>
                </div>
                <div className="ops-mini-tile">
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

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => claimMutation.mutate({ threadId })}
                  data-testid="support-claim"
                  className="rounded-full"
                >
                  Claim to me
                </Button>
                <Button
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => unclaimMutation.mutate({ threadId })}
                  className="rounded-full"
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
                    className="h-auto justify-start rounded-[1rem] px-4 py-3 text-left"
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
                  data-testid="support-send-reply"
                  className="rounded-full"
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send reply
                </Button>
              </div>

              <div className="space-y-3 rounded-[1rem] border border-border/60 bg-background/50 p-4 dark:bg-white/[0.025]">
                <div>
                  <p className="text-sm font-semibold">Saved replies</p>
                  <p className="text-sm text-muted-foreground">
                    Category-aware replies you can load into the editor or send directly.
                  </p>
                </div>

                {templatesQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading templates…
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {(templatesQuery.data || []).map((template) => (
                      <div
                        key={template.id}
                        className="ops-support-card"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{template.title}</p>
                              <Badge variant="outline">{getTemplateActionLabel(template.statusAction)}</Badge>
                              {template.isDefault ? (
                                <Badge variant="secondary">Default</Badge>
                              ) : (
                                <Badge variant="outline">Custom</Badge>
                              )}
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">{template.message}</p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              className="rounded-full"
                              onClick={() => {
                                setReplyMessage(template.message);
                                setTemplateTitle(template.title);
                                setTemplateStatusAction(template.statusAction || 'NONE');
                              }}
                            >
                              Load
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isBusy}
                              className="rounded-full"
                              onClick={() => applyTemplateMutation.mutate({ threadId, templateId: template.id })}
                            >
                              Send now
                            </Button>
                            {!template.isDefault ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                disabled={isBusy}
                                onClick={() => deleteTemplateMutation.mutate({ templateId: template.id })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 rounded-[0.9rem] border border-dashed border-border/60 p-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="support-template-title">Save current reply as template</Label>
                    <Input
                      id="support-template-title"
                      placeholder="Example: Need clearer payment proof"
                      value={templateTitle}
                      onChange={(event) => setTemplateTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Template action</Label>
                    <Select value={templateStatusAction} onValueChange={(value) => setTemplateStatusAction(value as typeof templateStatusAction)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Reply" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Reply only</SelectItem>
                        <SelectItem value="WORKING">Working on it</SelectItem>
                        <SelectItem value="NEED_DETAILS">Need details</SelectItem>
                        <SelectItem value="ESCALATE">Escalate</SelectItem>
                        <SelectItem value="HANDLED">Handled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={isBusy || templateTitle.trim().length < 2 || replyMessage.trim().length < 5}
                      onClick={() =>
                        saveTemplateMutation.mutate({
                          title: templateTitle.trim(),
                          category: templateCategory,
                          locale: templateLocale,
                          message: replyMessage.trim(),
                          statusAction: templateStatusAction === 'NONE' ? null : templateStatusAction,
                        })
                      }
                    >
                      <BookmarkPlus className="mr-2 h-4 w-4" />
                      Save template
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
