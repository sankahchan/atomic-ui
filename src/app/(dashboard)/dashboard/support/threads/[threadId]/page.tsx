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
import { useLocale } from '@/hooks/use-locale';
import { useToast } from '@/hooks/use-toast';
import { withBasePath } from '@/lib/base-path';
import { trpc } from '@/lib/trpc';
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils';

function getThreadStateLabel(status: string, waitingOn: string, isMyanmar = false) {
  if (status === 'HANDLED') {
    return isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled';
  }
  if (status === 'ESCALATED') {
    return isMyanmar ? 'တင်ပို့ထားသည်' : 'Escalated';
  }
  return (waitingOn || '').toUpperCase() === 'USER'
    ? isMyanmar
      ? 'ဖောက်သည်ထံမှ စောင့်ဆိုင်းနေသည်'
      : 'Waiting for customer'
    : isMyanmar
      ? 'စီမံခန့်ခွဲသူထံမှ စောင့်ဆိုင်းနေသည်'
      : 'Waiting for admin';
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

function getMacroLabel(macro: 'WORKING' | 'NEED_DETAILS' | 'ESCALATE' | 'HANDLED', isMyanmar = false) {
  switch (macro) {
    case 'WORKING':
      return isMyanmar ? 'စစ်ဆေးနေပါသည်' : 'Working on it';
    case 'NEED_DETAILS':
      return isMyanmar ? 'အသေးစိတ်လိုအပ်သည်' : 'Need details';
    case 'ESCALATE':
      return isMyanmar ? 'ဆက်လက်တင်ပို့မည်' : 'Escalate';
    case 'HANDLED':
    default:
      return isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled';
  }
}

function getTemplateActionLabel(
  action: 'WORKING' | 'NEED_DETAILS' | 'ESCALATE' | 'HANDLED' | null | undefined,
  isMyanmar = false,
) {
  switch (action) {
    case 'WORKING':
      return isMyanmar ? 'စစ်ဆေးနေသည်' : 'Working';
    case 'NEED_DETAILS':
      return isMyanmar ? 'အသေးစိတ်လိုအပ်' : 'Need details';
    case 'ESCALATE':
      return isMyanmar ? 'တင်ပို့' : 'Escalate';
    case 'HANDLED':
      return isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled';
    default:
      return isMyanmar ? 'စာပြန်' : 'Reply';
  }
}

function getSupportIssueLabel(
  category: string | null | undefined,
  isMyanmar = false,
) {
  switch ((category || '').toUpperCase()) {
    case 'ORDER':
      return isMyanmar ? 'အမှာစာ / ငွေပေးချေမှု' : 'Order / payment';
    case 'KEY':
      return isMyanmar ? 'သော့ / အသုံးပြုမှု' : 'Key / usage';
    case 'SERVER':
      return isMyanmar ? 'ဆာဗာ / လမ်းကြောင်း ပြဿနာ' : 'Server / route issue';
    case 'BILLING':
      return isMyanmar ? 'ငွေတောင်းခံမှု / ငွေပြန်အမ်း' : 'Billing / refund';
    case 'GENERAL':
    default:
      return isMyanmar ? 'အထွေထွေ အကူအညီ' : 'General help';
  }
}

function getSupportThreadRecommendedAction(thread: {
  status: string;
  waitingOn: string | null;
  assignedAdminName?: string | null;
  isOverdue?: boolean | null;
}, isMyanmar = false) {
  if (thread.status === 'HANDLED') {
    return {
      label: isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled',
      helper: isMyanmar
        ? 'ဖောက်သည်ထံမှ ထပ်မံတုံ့ပြန်မှု မျှော်လင့်ထားသောအခါမှသာ ဤ thread ကို ဖွင့်ထားပါ။'
        : 'Keep this open only if you expect another customer reply.',
    };
  }

  if (!thread.assignedAdminName) {
    return {
      label: isMyanmar ? 'တာဝန်ခံ သတ်မှတ်ပါ' : 'Assign an owner',
      helper: isMyanmar
        ? 'နောက်ထပ် update မပို့မီ ဤ thread ကို claim လုပ်ပါ သို့မဟုတ် တာဝန်ခံ သတ်မှတ်ပါ။'
        : 'Claim or assign this thread before sending the next update.',
    };
  }

  if (thread.status === 'ESCALATED') {
      return {
        label: isMyanmar ? 'တင်ပို့မှုကို စစ်ဆေးပါ' : 'Review escalation',
        helper: isMyanmar
        ? 'အတားအဆီးကို သတ်မှတ်ပြီး တာဝန်ခံရွေးကာ နောက်ထပ် စီမံခန့်ခွဲသူ စာပြန်ကို ပို့ပါ။'
        : 'Decide the blocker, pick the owner, and send the next admin reply.',
      };
  }

  if ((thread.waitingOn || '').toUpperCase() === 'USER') {
    return {
      label: isMyanmar ? 'ဖောက်သည်ထံမှ စောင့်ဆိုင်းနေသည်' : 'Waiting for customer',
      helper: isMyanmar
        ? 'ဖောက်သည်မှ ထပ်မံတုံ့ပြန်လာသည်အထိ စီမံခန့်ခွဲသူ စာပြန် ထပ်မလိုအပ်ပါ။'
        : 'No admin reply is needed until the customer responds again.',
    };
  }

  if (thread.isOverdue) {
    return {
      label: isMyanmar ? 'ယခုချက်ချင်း စာပြန်ပါ' : 'Reply now',
      helper: isMyanmar
        ? 'ဤ thread သည် နောက်ကျနေပြီး ဖောက်သည်ဘက်သို့ update ပို့ရန် လိုအပ်ပါသည်။'
        : 'This thread is overdue and needs a customer-facing update.',
    };
  }

  return {
    label: isMyanmar ? 'နောက်ထပ် စီမံခန့်ခွဲသူ update ပို့ပါ' : 'Send next admin update',
    helper: isMyanmar
      ? 'စကားဝိုင်းကို ဆက်လက်ရွေ့လျားစေရန် workflow သို့မဟုတ် ကိုယ်တိုင်ရေးသားသော စာပြန်ကို အသုံးပြုပါ။'
      : 'Use a workflow or manual reply to keep the thread moving.',
  };
}

const SUPPORT_MACROS: Array<{
  id: 'WORKING' | 'NEED_DETAILS' | 'ESCALATE' | 'HANDLED';
  helper: string;
}> = [
  {
    id: 'WORKING',
    helper: 'Acknowledge the issue and tell the customer you are checking it.',
  },
  {
    id: 'NEED_DETAILS',
    helper: 'Ask for one missing detail, screenshot, or reproduction step.',
  },
  {
    id: 'ESCALATE',
    helper: 'Mark the thread for deeper review or cross-team follow-up.',
  },
  {
    id: 'HANDLED',
    helper: 'Send the closing update after the issue is resolved.',
  },
];

export default function SupportThreadDetailPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = Array.isArray(params?.threadId) ? params.threadId[0] : params?.threadId || '';
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
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
      toast({ title: isMyanmar ? 'အကူအညီ စကားဝိုင်းကို တာဝန်ယူပြီးပါပြီ' : 'Support thread claimed' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'တာဝန်ယူမှု မအောင်မြင်ပါ' : 'Claim failed', description: error.message, variant: 'destructive' });
    },
  });

  const unclaimMutation = trpc.users.unclaimSupportThread.useMutation({
    onSuccess: async () => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: isMyanmar ? 'အကူအညီ စကားဝိုင်း၏ တာဝန်ယူမှုကို ဖြုတ်ပြီးပါပြီ' : 'Support thread unclaimed' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'တာဝန်ယူမှု ဖြုတ်ခြင်း မအောင်မြင်ပါ' : 'Unclaim failed', description: error.message, variant: 'destructive' });
    },
  });

  const assignMutation = trpc.users.assignSupportThread.useMutation({
    onSuccess: async () => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: isMyanmar ? 'အကူအညီ စကားဝိုင်း တာဝန်ခွဲဝေမှုကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Support thread assignment updated' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'တာဝန်ခွဲဝေမှု မအောင်မြင်ပါ' : 'Assign failed', description: error.message, variant: 'destructive' });
    },
  });

  const replyMutation = trpc.users.replyToSupportThread.useMutation({
    onSuccess: async () => {
      setReplyMessage('');
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: isMyanmar ? 'ဖောက်သည်ထံ စာပြန် ပို့ပြီးပါပြီ' : 'Reply sent to customer' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'စာပြန် ပို့မှု မအောင်မြင်ပါ' : 'Reply failed', description: error.message, variant: 'destructive' });
    },
  });

  const macroMutation = trpc.users.applySupportThreadMacro.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: `${getMacroLabel(variables.macro, isMyanmar)} ${isMyanmar ? 'ပို့ပြီးပါပြီ' : 'sent'}` });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'လုပ်ဆောင်ချက် မအောင်မြင်ပါ' : 'Action failed', description: error.message, variant: 'destructive' });
    },
  });

  const applyTemplateMutation = trpc.users.applySupportReplyTemplate.useMutation({
    onSuccess: async () => {
      await utils.users.getSupportThreadDetail.invalidate({ threadId });
      toast({ title: isMyanmar ? 'တမ်းပလိတ်ကို ဖောက်သည်ထံ ပို့ပြီးပါပြီ' : 'Template sent to customer' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'တမ်းပလိတ် ပို့မှု မအောင်မြင်ပါ' : 'Template failed', description: error.message, variant: 'destructive' });
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
      toast({ title: isMyanmar ? 'စာပြန် တမ်းပလိတ်ကို သိမ်းပြီးပါပြီ' : 'Support reply template saved' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'တမ်းပလိတ် သိမ်းဆည်းမှု မအောင်မြင်ပါ' : 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTemplateMutation = trpc.users.deleteSupportReplyTemplate.useMutation({
    onSuccess: async () => {
      await utils.users.listSupportReplyTemplates.invalidate({
        category: templateCategory,
        locale: templateLocale,
      });
      toast({ title: isMyanmar ? 'စာပြန် တမ်းပလိတ်ကို ဖျက်ပြီးပါပြီ' : 'Support reply template deleted' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'တမ်းပလိတ် ဖျက်မှု မအောင်မြင်ပါ' : 'Delete failed', description: error.message, variant: 'destructive' });
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
            {isMyanmar ? 'အသုံးပြုသူများသို့ ပြန်သွားမည်' : 'Back to users'}
          </Link>
        </Button>
        <Card className="ops-detail-card">
          <CardHeader>
            <CardTitle>{isMyanmar ? 'အကူအညီ စကားဝိုင်းကို မတွေ့ပါ' : 'Support thread not found'}</CardTitle>
            <CardDescription>
              {isMyanmar
                ? 'ဤ support thread ကို ဖျက်ထားနိုင်သည် သို့မဟုတ် ဖွင့်ရန် ခွင့်ပြုချက်မရှိပါ။'
                : 'The support thread may have been deleted or you do not have permission to open it.'}
            </CardDescription>
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
  const participantLabel = thread.customer?.email || thread.telegramUsername || thread.telegramUserId || (isMyanmar ? 'Telegram အသုံးပြုသူ' : 'Telegram user');
  const recommendedAction = getSupportThreadRecommendedAction(thread, isMyanmar);
  const contextItems = [
    thread.relatedOrderCode ? `${isMyanmar ? 'အော်ဒါ' : 'Order'} ${thread.relatedOrderCode}` : null,
    thread.relatedKeyName ? `${isMyanmar ? 'သော့' : 'Key'} ${thread.relatedKeyName}` : null,
    thread.relatedServerName ? `${isMyanmar ? 'ဆာဗာ' : 'Server'} ${thread.relatedServerName}` : null,
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
                      {isMyanmar ? 'အကူအညီ စင်တာ' : 'Support center'}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link href={customerHref || withBasePath('/dashboard/users')}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      {customerHref
                        ? isMyanmar
                          ? 'CRM သို့ ပြန်သွားမည်'
                          : 'Back to CRM'
                        : isMyanmar
                          ? 'အသုံးပြုသူများသို့ ပြန်သွားမည်'
                          : 'Back to users'}
                    </Link>
                  </Button>
                  <Badge variant="outline" className={cn('rounded-full', getThreadStateBadgeClass(thread.status, thread.waitingOn))}>
                    {getThreadStateLabel(thread.status, thread.waitingOn, isMyanmar)}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">{thread.issueLabel}</Badge>
                  {thread.isOverdue ? (
                    <Badge variant="outline" className="rounded-full border-red-500/30 bg-red-500/10 text-red-100">
                      {isMyanmar ? 'နောက်ကျနေသည်' : 'Overdue'}
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{thread.threadCode}</h1>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                    {isMyanmar
                      ? 'ဖောက်သည်၏ နောက်ဆုံးအခြေအနေ၊ တာဝန်ခွဲဝေမှုနှင့် သိမ်းထားသော စာပြန်များကို စာပြန်အလုပ်ခန်း တစ်ခုတည်းတွင် စီမံပါ။'
                      : 'Keep the latest customer context, assignment, and saved replies in one reply workspace.'}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <DetailKpiTile
                    label={isMyanmar ? 'ပြန်စာများ' : 'Replies'}
                    value={thread.replies.length}
                    meta={isMyanmar ? `${adminReplyCount} စီမံခန့်ခွဲသူ • ${customerReplyCount} ဖောက်သည်` : `${adminReplyCount} admin • ${customerReplyCount} customer`}
                    valueClassName="text-3xl tracking-tight"
                  />
                  <DetailKpiTile
                    label={isMyanmar ? 'စောင့်ဆိုင်းနေသည်' : 'Waiting on'}
                    value={(thread.waitingOn || '').toUpperCase() === 'USER' ? (isMyanmar ? 'ဖောက်သည်' : 'Customer') : (isMyanmar ? 'စီမံခန့်ခွဲသူ' : 'Admin')}
                    meta={
                      thread.firstResponseDueAt
                        ? `${isMyanmar ? 'SLA' : 'SLA'} ${formatDateTime(thread.firstResponseDueAt)}`
                        : isMyanmar
                          ? 'SLA သတ်မှတ်ချိန် မရှိသေးပါ'
                          : 'No SLA deadline set'
                    }
                    valueClassName="tracking-tight"
                  />
                  <DetailKpiTile
                    label={isMyanmar ? 'နောက်ဆုံး update' : 'Last update'}
                    value={formatRelativeTime(thread.updatedAt)}
                    meta={`${isMyanmar ? 'ဖန်တီးခဲ့သည်' : 'Created'} ${formatRelativeTime(thread.createdAt)}`}
                    valueClassName="tracking-tight"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {thread.customer ? (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={customerHref || '#'}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {isMyanmar ? 'ဖောက်သည် CRM ကို ဖွင့်မည်' : 'Open customer CRM'}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <DetailHeroAside
            title={isMyanmar ? 'စကားဝိုင်း အကျဉ်းချုပ်' : 'Thread summary'}
            description={
              isMyanmar
                ? 'စာပြန်ပို့နေစဉ် တာဝန်ပိုင်ဆိုင်မှု၊ ဖောက်သည်အချက်အလက်နှင့် နောက်ဆုံး ဆက်စပ်အချက်အလက်ကို တစ်နေရာတည်းတွင် မြင်ရအောင်ထားပါ။'
                : 'Keep ownership, customer identity, and latest context visible while replying.'
            }
          >
            <DetailMiniTileGrid>
              <DetailMiniTile label={isMyanmar ? 'ဖောက်သည်' : 'Customer'} value={participantLabel} valueClassName="break-words" />
              <DetailMiniTile label={isMyanmar ? 'တာဝန်ခံ စီမံခန့်ခွဲသူ' : 'Assigned admin'} value={thread.assignedAdminName || (isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned')} />
              <DetailMiniTile label={isMyanmar ? 'စကားဝိုင်း စဖွင့်ချိန်' : 'Thread opened'} value={formatDateTime(thread.createdAt)} />
              <DetailMiniTile
                label={isMyanmar ? 'နောက်ဆုံး စာပြန်' : 'Latest reply'}
                value={latestReply ? formatRelativeTime(latestReply.createdAt) : (isMyanmar ? 'တုံ့ပြန်ချက် မရှိသေးပါ' : 'No replies yet')}
              />
            </DetailMiniTileGrid>

            <DetailNoteBlock>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဆက်စပ်အချက်အလက်' : 'Linked context'}</p>
              {contextItems.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {contextItems.map((item) => (
                    <span key={item} className="ops-pill">
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {isMyanmar
                    ? 'ဤ thread တွင် အော်ဒါ၊ သော့ သို့မဟုတ် ဆာဗာ context မချိတ်ထားပါ။'
                    : 'No order, key, or server context was attached to this thread.'}
                </p>
              )}
            </DetailNoteBlock>

            {latestReply ? (
              <DetailNoteBlock>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး အကြိုကြည့်' : 'Latest preview'}</p>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-foreground">{latestReply.message}</p>
              </DetailNoteBlock>
            ) : null}

            <DetailNoteBlock>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အကြံပြုလုပ်ဆောင်ချက်' : 'Recommended action'}</p>
              <p className="mt-3 text-sm font-medium text-foreground">{recommendedAction.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{recommendedAction.helper}</p>
            </DetailNoteBlock>
          </DetailHeroAside>
        </DetailHeroGrid>
      </DetailHero>

      <div className="ops-showcase-grid">
        <div className="ops-detail-stack">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                {isMyanmar ? 'စကားဝိုင်းမှတ်တမ်း' : 'Thread history'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'ပူးတွဲအကြိုကြည့်များနှင့် နောက်ဆုံး ဆက်စပ်အချက်အလက်များ ပါဝင်သော စာပြန်မှတ်တမ်း အပြည့်အစုံ။'
                  : 'Full reply history, including attachment previews and latest thread context.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="ops-panel space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ops-pill">{getSupportIssueLabel(thread.issueCategory, isMyanmar)}</span>
                  <span className="ops-pill">{getThreadStateLabel(thread.status, thread.waitingOn, isMyanmar)}</span>
                  <span className="ops-pill">{thread.locale === 'my' ? (isMyanmar ? 'မြန်မာ' : 'Burmese') : isMyanmar ? 'အင်္ဂလိပ်' : 'English'}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'စကားဝိုင်းကုဒ်' : 'Thread code'}</p>
                    <p className="mt-2 text-sm font-medium">{thread.threadCode}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး update' : 'Last update'}</p>
                    <p className="mt-2 text-sm font-medium">{formatDateTime(thread.updatedAt)}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'SLA ရည်မှန်းချိန်' : 'SLA target'}</p>
                    <p className="mt-2 text-sm font-medium">
                      {thread.firstResponseDueAt ? formatDateTime(thread.firstResponseDueAt) : isMyanmar ? 'ဖွင့်ထားသည်' : 'Open'}
                    </p>
                  </div>
                </div>
              </div>

              {thread.replies.length === 0 ? (
                <div className="rounded-[1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  {isMyanmar ? 'တုံ့ပြန်ချက် မရှိသေးပါ။' : 'No replies yet.'}
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
                                {isAdmin ? (isMyanmar ? 'စီမံခန့်ခွဲသူ' : 'Admin') : isMyanmar ? 'ဖောက်သည်' : 'Customer'}
                                </Badge>
                                {reply.senderName ? (
                                  <span className="text-sm font-medium">{reply.senderName}</span>
                                ) : null}
                                {reply.mediaUrl ? (
                                  <Badge variant="outline" className="rounded-full">
                                    {reply.mediaKind === 'IMAGE'
                                      ? isMyanmar
                                        ? 'ပူးတွဲပုံ'
                                        : 'Attachment image'
                                      : isMyanmar
                                        ? 'ပူးတွဲဖိုင်'
                                        : 'Attachment file'}
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
                                    {isMyanmar ? 'ပူးတွဲဖိုင် ဖွင့်မည်' : 'Open attachment'}
                                  </Link>
                                </Button>
                                <Button asChild size="sm" variant="outline" className="rounded-full">
                                  <Link href={`${reply.mediaUrl}?download=1`} target="_blank">
                                    {isMyanmar ? 'ဒေါင်းလုဒ်' : 'Download'}
                                  </Link>
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{reply.message}</p>
                          {reply.mediaKind ? (
                            <p className="mt-3 text-xs text-muted-foreground">
                              {reply.mediaKind === 'IMAGE'
                                ? isMyanmar
                                  ? 'ပုံပူးတွဲဖိုင်'
                                  : 'Image attachment'
                                : isMyanmar
                                  ? 'ဖိုင်ပူးတွဲ'
                                  : 'File attachment'}
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
                {isMyanmar ? 'စကားဝိုင်း အခြေအနေ' : 'Thread status'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'တာဝန်ပိုင်ဆိုင်မှု၊ SLA၊ ဆက်စပ် context နှင့် thread ကို တိုက်ရိုက်ထိန်းချုပ်နိုင်သော လုပ်ဆောင်ချက်များ။'
                  : 'Ownership, SLA, related context, and direct thread controls.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="ops-mini-tile">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'တာဝန်ခံ' : 'Assigned'}</p>
                  <p className="mt-2 text-sm font-medium">{thread.assignedAdminName || (isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned')}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">SLA</p>
                  <p className="mt-2 text-sm font-medium">
                    {thread.firstResponseDueAt ? formatDateTime(thread.firstResponseDueAt) : isMyanmar ? 'ဖွင့်ထားသည်' : 'Open'}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဖန်တီးချိန်' : 'Created'}</p>
                  <p className="mt-2 text-sm font-medium">{formatRelativeTime(thread.createdAt)}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး update' : 'Last update'}</p>
                  <p className="mt-2 text-sm font-medium">{formatRelativeTime(thread.updatedAt)}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဆက်စပ်အချက်အလက်' : 'Related context'}</p>
                <p>{thread.customer?.email || thread.telegramUsername || thread.telegramUserId}</p>
                {thread.relatedOrderCode ? <p>{isMyanmar ? 'အော်ဒါ' : 'Order'}: {thread.relatedOrderCode}</p> : null}
                {thread.relatedKeyName ? <p>{isMyanmar ? 'သော့' : 'Key'}: {thread.relatedKeyName}</p> : null}
                {thread.relatedServerName ? <p>{isMyanmar ? 'ဆာဗာ' : 'Server'}: {thread.relatedServerName}</p> : null}
              </div>

              <div className="space-y-3">
                <Label>{isMyanmar ? 'တာဝန်ခံ စီမံခန့်ခွဲသူ' : 'Assigned admin'}</Label>
                <Select
                  value={selectedAdminId}
                  onValueChange={(value) => setSelectedAdminId(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isMyanmar ? 'စီမံခန့်ခွဲသူကို ရွေးပါ' : 'Select admin'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned'}</SelectItem>
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
                  {isMyanmar ? 'တာဝန်ခွဲဝေမှု သိမ်းမည်' : 'Save assignment'}
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
                  {isMyanmar ? 'ကျွန်ုပ်ထံ တာဝန်ယူမည်' : 'Claim to me'}
                </Button>
                <Button
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => unclaimMutation.mutate({ threadId })}
                  className="rounded-full"
                >
                  {isMyanmar ? 'တာဝန်ယူမှု ဖြုတ်မည်' : 'Unclaim'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-primary" />
                {isMyanmar ? 'အမြန်လုပ်ဆောင်မှုများ' : 'Quick workflows'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'နောက်ထပ် အကူအညီ လုပ်ဆောင်ချက်ကို အမြန်ရွေးပြီး လိုအပ်သည့်အခါမှသာ စိတ်ကြိုက်စာသားဖြင့် ကိုယ်တိုင်ရေးသားသော စာပြန်ကို ပို့ပါ။'
                  : 'Choose the next support move quickly, then send a manual reply only when you need custom wording.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {SUPPORT_MACROS.map((macro) => (
                  <Button
                    key={macro.id}
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => macroMutation.mutate({ threadId, macro: macro.id })}
                    className="h-auto justify-start rounded-[1rem] px-4 py-3 text-left"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{getMacroLabel(macro.id, isMyanmar)}</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {isMyanmar
                          ? macro.id === 'WORKING'
                            ? 'ပြဿနာကို လက်ခံပြီး စစ်ဆေးနေကြောင်း ဖောက်သည်ထံ အသိပေးပါ။'
                            : macro.id === 'NEED_DETAILS'
                              ? 'လိုအပ်နေသော အသေးစိတ်၊ screenshot သို့မဟုတ် ပြန်လည်ဖြစ်ပွားပုံကို တောင်းပါ။'
                              : macro.id === 'ESCALATE'
                                ? 'ပိုမိုနက်ရှိုင်းသော စစ်ဆေးမှု သို့မဟုတ် အခြားအဖွဲ့နှင့် ဆက်လက်ညှိနှိုင်းရန် သတ်မှတ်ပါ။'
                                : 'ပြဿနာ ဖြေရှင်းပြီးနောက် အပြီးသတ် update ကို ပို့ပါ။'
                          : macro.helper}
                      </p>
                    </div>
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                <Label htmlFor="support-reply">{isMyanmar ? 'ကိုယ်တိုင်ရေးသားသော စာပြန်' : 'Manual reply'}</Label>
                <Textarea
                  id="support-reply"
                  placeholder={isMyanmar ? 'ဖောက်သည်ထံ ပြန်ပို့မည့် စာကို ရေးပါ။' : 'Write the reply that should be sent back to the customer.'}
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
                  {isMyanmar ? 'စာပြန် ပို့မည်' : 'Send reply'}
                </Button>
              </div>

              <div className="space-y-3 rounded-[1rem] border border-border/60 bg-background/50 p-4 dark:bg-white/[0.025]">
                <div>
                  <p className="text-sm font-semibold">{isMyanmar ? 'သိမ်းထားသော စာပြန်များ' : 'Saved replies'}</p>
                  <p className="text-sm text-muted-foreground">
                    {isMyanmar
                      ? 'အမျိုးအစားအလိုက် ပြင်ဆင်ထားသော စာပြန်များကို စာရေးနေရာထဲသို့ ထည့်နိုင်ပြီး တိုက်ရိုက်လည်း ပို့နိုင်ပါသည်။'
                      : 'Category-aware replies you can load into the editor or send directly.'}
                  </p>
                </div>

                {templatesQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isMyanmar ? 'တမ်းပလိတ်များ တင်နေသည်…' : 'Loading templates…'}
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
                              <Badge variant="outline">{getTemplateActionLabel(template.statusAction, isMyanmar)}</Badge>
                              {template.isDefault ? (
                                <Badge variant="secondary">{isMyanmar ? 'မူရင်း' : 'Default'}</Badge>
                              ) : (
                                <Badge variant="outline">{isMyanmar ? 'စိတ်ကြိုက်' : 'Custom'}</Badge>
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
                              {isMyanmar ? 'ထည့်မည်' : 'Load'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isBusy}
                              className="rounded-full"
                              onClick={() => applyTemplateMutation.mutate({ threadId, templateId: template.id })}
                            >
                              {isMyanmar ? 'ယခုပို့မည်' : 'Send now'}
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
                    <Label htmlFor="support-template-title">{isMyanmar ? 'လက်ရှိ စာပြန်ကို template အဖြစ် သိမ်းမည်' : 'Save current reply as template'}</Label>
                    <Input
                      id="support-template-title"
                      placeholder={isMyanmar ? 'ဥပမာ - ငွေပေးချေမှု screenshot ကို ပိုရှင်းလင်းစွာ ပို့ပါ' : 'Example: Need clearer payment proof'}
                      value={templateTitle}
                      onChange={(event) => setTemplateTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'တမ်းပလိတ် လုပ်ဆောင်ချက်' : 'Template action'}</Label>
                    <Select value={templateStatusAction} onValueChange={(value) => setTemplateStatusAction(value as typeof templateStatusAction)}>
                      <SelectTrigger>
                        <SelectValue placeholder={isMyanmar ? 'စာပြန် လုပ်ဆောင်ချက်' : 'Reply'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">{isMyanmar ? 'စာပြန် သီးသန့်' : 'Reply only'}</SelectItem>
                        <SelectItem value="WORKING">{getMacroLabel('WORKING', isMyanmar)}</SelectItem>
                        <SelectItem value="NEED_DETAILS">{getMacroLabel('NEED_DETAILS', isMyanmar)}</SelectItem>
                        <SelectItem value="ESCALATE">{getMacroLabel('ESCALATE', isMyanmar)}</SelectItem>
                        <SelectItem value="HANDLED">{getMacroLabel('HANDLED', isMyanmar)}</SelectItem>
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
                      {isMyanmar ? 'တမ်းပလိတ် သိမ်းမည်' : 'Save template'}
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
