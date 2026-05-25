'use client';

import Image from 'next/image';
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
import { useLocale } from '@/hooks/use-locale';
import { useToast } from '@/hooks/use-toast';
import { withBasePath } from '@/lib/base-path';
import { trpc } from '@/lib/trpc';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';

type SupportStatusFilter = 'ALL' | 'ACTIVE' | 'WAITING_ADMIN' | 'WAITING_USER' | 'ESCALATED' | 'HANDLED' | 'OVERDUE';
type SupportAssignmentFilter = 'ALL' | 'UNASSIGNED' | 'MINE' | 'ASSIGNED';
type SupportIssueFilter = 'ALL' | 'ORDER' | 'KEY' | 'SERVER' | 'BILLING' | 'GENERAL';

function getThreadStateLabel(status: string, waitingOn: string, isMyanmar = false) {
  if (status === 'HANDLED') {
    return isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled';
  }
  if (status === 'ESCALATED') {
    return isMyanmar ? 'တင်ပြထားသည်' : 'Escalated';
  }
  return (waitingOn || '').toUpperCase() === 'USER'
    ? isMyanmar ? 'အသုံးပြုသူကို စောင့်နေသည်' : 'Waiting for customer'
    : isMyanmar ? 'စီမံခန့်ခွဲသူကို စောင့်နေသည်' : 'Waiting for admin';
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

function getSupportIssueLabel(
  category: SupportIssueFilter | string | null | undefined,
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

function getLatestReplyPreview(reply: {
  message: string;
  mediaKind: string | null;
  senderType: string;
} | null, isMyanmar = false) {
  if (!reply) {
    return isMyanmar ? 'တုံ့ပြန်ချက် မရှိသေးပါ။' : 'No replies yet.';
  }

  const prefix = reply.senderType === 'ADMIN' ? (isMyanmar ? 'စီမံခန့်ခွဲသူ' : 'Admin') : isMyanmar ? 'အသုံးပြုသူ' : 'Customer';
  const message = reply.message.trim();
  if (message) {
    const preview = message.length > 180 ? `${message.slice(0, 177)}...` : message;
    return `${prefix}: ${preview}`;
  }
  if (reply.mediaKind === 'IMAGE') {
    return isMyanmar ? `${prefix}: ပုံဖိုင်တွဲ` : `${prefix}: image attachment`;
  }
  if (reply.mediaKind) {
    return isMyanmar ? `${prefix}: ဖိုင်တွဲ` : `${prefix}: file attachment`;
  }
  return isMyanmar ? `${prefix}: အသစ်ပြန်ပို့ထားသည်` : `${prefix}: update sent`;
}

function getLatestReplyAttachmentLabel(reply: {
  mediaKind: string | null;
  mediaFilename?: string | null;
} | null, isMyanmar = false) {
  if (!reply?.mediaKind) {
    return null;
  }

  if (reply.mediaKind === 'IMAGE') {
    return reply.mediaFilename?.trim() || (isMyanmar ? 'ပုံဖိုင်တွဲ' : 'Image attachment');
  }

  return reply.mediaFilename?.trim() || (isMyanmar ? 'ဖိုင်တွဲ' : 'File attachment');
}

function getSupportThreadContextSummary(thread: {
  relatedOrderCode?: string | null;
  relatedKeyName?: string | null;
  relatedServerName?: string | null;
}, isMyanmar = false) {
  return thread.relatedOrderCode || thread.relatedKeyName || thread.relatedServerName || (isMyanmar ? 'အထွေထွေ အကူအညီ' : 'General help');
}

function getSupportThreadNextAction(thread: {
  status: string;
  waitingOn: string | null;
  assignedAdminName?: string | null;
  isOverdue?: boolean | null;
}, isMyanmar = false) {
  if (thread.status === 'HANDLED') {
    return {
      label: isMyanmar ? 'စကားဝိုင်းကို ဖြေရှင်းပြီးဖြစ်သည်' : 'Thread is handled',
      helper: isMyanmar ? 'အသုံးပြုသူ ပြန်မဖြေမချင်း ထပ်မံလိုက်လံရန် မလိုပါ။' : 'No immediate follow-up is needed unless the customer replies again.',
      tone: 'default' as const,
    };
  }

  if (thread.status === 'ESCALATED') {
    return {
      label: isMyanmar ? 'တင်ပြထားမှုကို စစ်ဆေးမည်' : 'Review the escalation',
      helper: isMyanmar ? 'အတားအဆီးကို အတည်ပြုပြီး တာဝန်ခံသတ်မှတ်ကာ နောက်တုံ့ပြန်ချက်ကို ပို့ပါ။' : 'Confirm the blocker, decide owner, and send the next update.',
      tone: 'warning' as const,
    };
  }

  if (!thread.assignedAdminName) {
    return {
      label: isMyanmar ? 'တာဝန်ခံ တစ်ဦး သတ်မှတ်မည်' : 'Claim an owner',
      helper: isMyanmar ? 'မပြန်ဖြေမီ တာဝန်ယူသူကို သတ်မှတ်ပါ။' : 'Take ownership before replying so the thread stays accountable.',
      tone: 'warning' as const,
    };
  }

  if ((thread.waitingOn || '').toUpperCase() === 'USER') {
    return {
      label: isMyanmar ? 'အသုံးပြုသူ တုံ့ပြန်ချက်ကို စောင့်နေသည်' : 'Waiting for customer reply',
      helper: isMyanmar ? 'အသုံးပြုသူ မပြန်ဖြေမချင်း စီမံခန့်ခွဲရေး လုပ်ဆောင်ချက် မလိုအပ်ပါ။' : 'No admin action is needed until the customer answers.',
      tone: 'default' as const,
    };
  }

  if (thread.isOverdue) {
    return {
      label: isMyanmar ? 'ယခုပင် ပြန်ဖြေပါ' : 'Reply now',
      helper: isMyanmar ? 'ဤစကားဝိုင်းသည် ပထမဆုံးတုံ့ပြန်ချိန် ကတိကို ကျော်လွန်သွားပြီး စီမံခန့်ခွဲရေး တုံ့ပြန်ချက် လိုအပ်သည်။' : 'This thread has missed first-response SLA and needs an admin update.',
      tone: 'danger' as const,
    };
  }

  return {
    label: isMyanmar ? 'နောက် စီမံခန့်ခွဲရေး တုံ့ပြန်ချက် ပို့မည်' : 'Send the next admin update',
    helper: isMyanmar ? 'စကားဝိုင်းကို ဖွင့်ပြီး နောက်ဆုံးတုံ့ပြန်ချက်ကို စစ်ဆေးကာ ပြန်ဖြေပါ သို့မဟုတ် ဖြေရှင်းပါ။' : 'Open the thread, review the latest reply, and respond or resolve it.',
    tone: 'warning' as const,
  };
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

function formatDurationLabel(minutes: number | null, isMyanmar = false) {
  if (minutes == null) {
    return isMyanmar ? 'ဒေတာ မရှိသေးပါ' : 'No data yet';
  }
  if (minutes < 60) {
    return isMyanmar ? `${minutes} မိနစ်` : `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (isMyanmar) {
    return remainingMinutes > 0 ? `${hours} နာရီ ${remainingMinutes} မိနစ်` : `${hours} နာရီ`;
  }
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export default function SupportCenterPage() {
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
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
      toast({ title: isMyanmar ? 'အကူအညီ စကားဝိုင်းကို တာဝန်ယူပြီးပါပြီ' : 'Support thread claimed' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'တာဝန်ယူမှု မအောင်မြင်ပါ' : 'Claim failed', description: error.message, variant: 'destructive' });
    },
  });

  const unclaimMutation = trpc.users.unclaimSupportThread.useMutation({
    onSuccess: async () => {
      await Promise.all([threadsQuery.refetch(), analyticsQuery.refetch()]);
      toast({ title: isMyanmar ? 'အကူအညီ စကားဝိုင်း၏ တာဝန်ယူမှုကို ဖြုတ်ပြီးပါပြီ' : 'Support thread unclaimed' });
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'တာဝန်ယူမှု ဖြုတ်ခြင်း မအောင်မြင်ပါ' : 'Unclaim failed', description: error.message, variant: 'destructive' });
    },
  });

  const currentUserId = currentUserQuery.data?.id ?? null;
  const isBusy = claimMutation.isPending || unclaimMutation.isPending;
  const threads = threadsQuery.data?.threads || [];

  const boardCards = [
    {
      id: 'unassigned',
      title: isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned',
      helper: isMyanmar ? 'တာဝန်ခံ မရှိသေးသော စကားဝိုင်းများ။' : 'Claimable threads with no owner.',
      value: threadsQuery.data?.summary.unassigned || 0,
      isActive: assignmentFilter === 'UNASSIGNED' && statusFilter === 'ACTIVE',
      onClick: () => {
        setAssignmentFilter('UNASSIGNED');
        setStatusFilter('ACTIVE');
      },
    },
    {
      id: 'mine',
      title: isMyanmar ? 'ကျွန်ုပ်၏ အုပ်စု' : 'Mine',
      helper: isMyanmar ? 'သင့်ထံ လက်ရှိ သတ်မှတ်ထားသော စကားဝိုင်းများ။' : 'Your currently assigned queue.',
      value: threadsQuery.data?.summary.mine || 0,
      isActive: assignmentFilter === 'MINE' && statusFilter === 'ACTIVE',
      onClick: () => {
        setAssignmentFilter('MINE');
        setStatusFilter('ACTIVE');
      },
    },
    {
      id: 'waiting-admin',
      title: isMyanmar ? 'စီမံခန့်ခွဲသူကို စောင့်နေသည်' : 'Waiting for admin',
      helper: isMyanmar ? 'စီမံခန့်ခွဲရေး လုပ်ဆောင်ချက်ကို စောင့်နေသော စကားဝိုင်းများ။' : 'Threads blocked on operator action.',
      value: threadsQuery.data?.summary.waitingAdmin || 0,
      isActive: statusFilter === 'WAITING_ADMIN',
      onClick: () => {
        setAssignmentFilter('ALL');
        setStatusFilter('WAITING_ADMIN');
      },
    },
    {
      id: 'waiting-user',
      title: isMyanmar ? 'အသုံးပြုသူကို စောင့်နေသည်' : 'Waiting for customer',
      helper: isMyanmar ? 'အသုံးပြုသူ၏ လိုက်လံတုံ့ပြန်ချက်ကို စောင့်နေသော စကားဝိုင်းများ။' : 'Threads awaiting customer follow-up.',
      value: threadsQuery.data?.summary.waitingUser || 0,
      isActive: statusFilter === 'WAITING_USER',
      onClick: () => {
        setAssignmentFilter('ALL');
        setStatusFilter('WAITING_USER');
      },
    },
    {
      id: 'overdue',
      title: isMyanmar ? 'အချိန်ကျော်နေသည်' : 'Overdue',
      helper: isMyanmar ? 'ပထမဆုံး တုံ့ပြန်ချိန် ကတိကို ကျော်လွန်သွားပါပြီ။' : 'First-response SLA has already slipped.',
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
      return isMyanmar ? 'အကူအညီ စကားဝိုင်းများကို တင်နေသည်...' : 'Loading support threads...';
    }
    if (search.trim()) {
      return isMyanmar ? 'အဆိုပါရှာဖွေမှုနှင့် ကိုက်ညီသော အကူအညီ စကားဝိုင်း မရှိပါ။' : 'No support threads matched that search.';
    }
    return isMyanmar ? 'လက်ရှိ စစ်ထုတ်မှုများနှင့် ကိုက်ညီသော အကူအညီ စကားဝိုင်း မရှိပါ။' : 'No support threads matched the current filters.';
  }, [isMyanmar, search, threadsQuery.isLoading]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{isMyanmar ? 'အကူအညီ ဗဟို' : 'Support center'}</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{isMyanmar ? 'အကူအညီ စကားဝိုင်းများ' : 'Support threads'}</h1>
            <p className="text-sm text-muted-foreground">
              {isMyanmar
                ? 'Telegram အကူအညီ တာဝန်ခွဲဝေမှု၊ SLA လိုက်လံစစ်ဆေးမှုနှင့် အသုံးပြုသူ စကားဝိုင်း လမ်းညွှန်မှုများကို တစ်နေရာတည်းတွင် စီမံပါ။'
                : 'One place for Telegram support ownership, SLA follow-up, and customer thread navigation.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={withBasePath('/dashboard/users')}>
              <Users className="mr-2 h-4 w-4" />
              {isMyanmar ? 'အသုံးပြုသူ စာရင်း ဖွင့်မည်' : 'Open CRM'}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SupportStatCard
          label={isMyanmar ? 'ဖွင့်ထားသော စကားဝိုင်းများ' : 'Open threads'}
          value={threadsQuery.data?.summary.open || 0}
          helper={isMyanmar ? 'လက်ရှိ ဖွင့်ထားသည့် သို့မဟုတ် အဆင့်မြှင့်တင်ထားသော စကားဝိုင်းများ' : 'Currently open or escalated'}
        />
        <SupportStatCard
          label={isMyanmar ? 'စီမံခန့်ခွဲသူကို စောင့်နေသည်' : 'Waiting for admin'}
          value={threadsQuery.data?.summary.waitingAdmin || 0}
          helper={isMyanmar ? 'စီမံခန့်ခွဲရေး လုပ်ဆောင်ချက် လိုအပ်သည်' : 'Needs operator action'}
          tone="warning"
        />
        <SupportStatCard
          label={isMyanmar ? 'အသုံးပြုသူကို စောင့်နေသည်' : 'Waiting for customer'}
          value={threadsQuery.data?.summary.waitingUser || 0}
          helper={isMyanmar ? 'အသုံးပြုသူ၏ တုံ့ပြန်ချက်ကို စောင့်နေသည်' : 'Awaiting customer reply'}
        />
        <SupportStatCard
          label={isMyanmar ? 'အချိန်ကျော်နေသည်' : 'Overdue'}
          value={threadsQuery.data?.summary.overdue || 0}
          helper={isMyanmar ? 'ပထမဆုံး တုံ့ပြန်ချိန် ကတိကို ကျော်လွန်သွားပါပြီ' : 'First response SLA missed'}
          tone="danger"
        />
        <SupportStatCard
          label={isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned'}
          value={threadsQuery.data?.summary.unassigned || 0}
          helper={isMyanmar ? 'တာဝန်ခံ မသတ်မှတ်ရသေးပါ' : 'No owner yet'}
        />
        <SupportStatCard
          label={isMyanmar ? 'ကျွန်ုပ်ထံ သတ်မှတ်ထားသည်' : 'Assigned to me'}
          value={threadsQuery.data?.summary.mine || 0}
          helper={isMyanmar ? 'သင်၏ လက်ရှိ အကူအညီ တာဝန်ပမာဏ' : 'Your active support load'}
        />
      </div>

      <Card className="ops-detail-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {isMyanmar ? 'တာဝန်ခွဲဝေမှု ဘုတ်' : 'Assignment board'}
          </CardTitle>
          <CardDescription>{isMyanmar ? 'နောက်တစ်ဆင့် လုပ်ဆောင်ရမည့် အုပ်စုအပိုင်းသို့ တိုက်ရိုက်ဝင်ပါ။' : 'Jump straight into the queue slice you need to work next.'}</CardDescription>
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
            {isMyanmar ? 'စစ်ထုတ်မှုများ' : 'Filters'}
          </CardTitle>
          <CardDescription>{isMyanmar ? 'ကုဒ်၊ အသုံးပြုသူ၊ အမှာစာ၊ သော့၊ ဆာဗာ သို့မဟုတ် စကားဝိုင်းခေါင်းစဉ်ဖြင့် ရှာဖွေပါ။' : 'Search by code, customer, order, key, server, or thread subject.'}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isMyanmar ? 'ကုဒ်၊ အီးမေးလ်၊ အမှာစာ၊ သော့၊ ဆာဗာကို ရှာဖွေပါ...' : 'Search code, email, order, key, server...'}
          />
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SupportStatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder={isMyanmar ? 'စကားဝိုင်း အခြေအနေ' : 'Thread state'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">{isMyanmar ? 'လုပ်ဆောင်နေသည်' : 'Active'}</SelectItem>
              <SelectItem value="WAITING_ADMIN">{isMyanmar ? 'စီမံခန့်ခွဲသူကို စောင့်နေသည်' : 'Waiting for admin'}</SelectItem>
              <SelectItem value="WAITING_USER">{isMyanmar ? 'အသုံးပြုသူကို စောင့်နေသည်' : 'Waiting for customer'}</SelectItem>
              <SelectItem value="ESCALATED">{isMyanmar ? 'အဆင့်မြှင့်တင်ထားသည်' : 'Escalated'}</SelectItem>
              <SelectItem value="OVERDUE">{isMyanmar ? 'အချိန်ကျော်နေသည်' : 'Overdue'}</SelectItem>
              <SelectItem value="HANDLED">{isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled'}</SelectItem>
              <SelectItem value="ALL">{isMyanmar ? 'အားလုံး' : 'All'}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assignmentFilter} onValueChange={(value) => setAssignmentFilter(value as SupportAssignmentFilter)}>
            <SelectTrigger>
              <SelectValue placeholder={isMyanmar ? 'တာဝန်ခွဲဝေမှု' : 'Assignment'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{isMyanmar ? 'တာဝန်ခွဲဝေမှု အားလုံး' : 'All assignments'}</SelectItem>
              <SelectItem value="UNASSIGNED">{isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned'}</SelectItem>
              <SelectItem value="MINE">{isMyanmar ? 'ကျွန်ုပ်ထံ သတ်မှတ်ထားသည်' : 'Assigned to me'}</SelectItem>
              <SelectItem value="ASSIGNED">{isMyanmar ? 'တစ်စုံတစ်ဦးထံ သတ်မှတ်ထားသည်' : 'Assigned to someone'}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={issueFilter} onValueChange={(value) => setIssueFilter(value as SupportIssueFilter)}>
            <SelectTrigger>
              <SelectValue placeholder={isMyanmar ? 'ပြဿနာ အမျိုးအစား' : 'Issue category'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{isMyanmar ? 'အမျိုးအစား အားလုံး' : 'All categories'}</SelectItem>
              <SelectItem value="ORDER">{isMyanmar ? 'အမှာစာ / ငွေပေးချေမှု' : 'Order / payment'}</SelectItem>
              <SelectItem value="KEY">{isMyanmar ? 'သော့ / အသုံးပြုမှု' : 'Key / usage'}</SelectItem>
              <SelectItem value="SERVER">{isMyanmar ? 'ဆာဗာ / လမ်းကြောင်း ပြဿနာ' : 'Server / route issue'}</SelectItem>
              <SelectItem value="BILLING">{isMyanmar ? 'ငွေတောင်းခံမှု / ငွေပြန်အမ်း' : 'Billing / refund'}</SelectItem>
              <SelectItem value="GENERAL">{isMyanmar ? 'အထွေထွေ အကူအညီ' : 'General help'}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="ops-detail-card">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
            {isMyanmar ? 'အကူအညီ သုံးသပ်ချက်' : 'Support analytics'}
            </CardTitle>
            <CardDescription>{isMyanmar ? 'တုံ့ပြန်မြန်နှုန်း၊ ဖြေရှင်းချိန်၊ အချိန်ကျော်နှုန်းနှင့် တာဝန်ပမာဏ ခွဲဝေမှုကို ကြည့်ပါ။' : 'Response speed, handled time, overdue rate, and workload split.'}</CardDescription>
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={String(analyticsWindowDays)}
              onValueChange={(value) => setAnalyticsWindowDays(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder={isMyanmar ? 'သုံးသပ်မှု အချိန်အပိုင်း' : 'Analytics window'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{isMyanmar ? 'နောက်ဆုံး ၇ ရက်' : 'Last 7 days'}</SelectItem>
                <SelectItem value="30">{isMyanmar ? 'နောက်ဆုံး ၃၀ ရက်' : 'Last 30 days'}</SelectItem>
                <SelectItem value="90">{isMyanmar ? 'နောက်ဆုံး ၉၀ ရက်' : 'Last 90 days'}</SelectItem>
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
                  label={isMyanmar ? 'ပထမဆုံး တုံ့ပြန်ချိန်' : 'First response'}
                  value={formatDurationLabel(analyticsQuery.data.summary.firstResponseMinutes, isMyanmar)}
                  helper={isMyanmar ? `နောက်ဆုံး ${analyticsQuery.data.timeframeDays} ရက်အတွင်း ပျမ်းမျှ` : `Average in the last ${analyticsQuery.data.timeframeDays} days`}
                />
                <SupportStatCard
                  label={isMyanmar ? 'ဖြေရှင်းချိန်' : 'Handled time'}
                  value={formatDurationLabel(analyticsQuery.data.summary.handledMinutes, isMyanmar)}
                  helper={isMyanmar ? 'စကားဝိုင်း ဖွင့်ချိန်မှ ဖြေရှင်းပြီးချိန်အထိ ပျမ်းမျှ' : 'Average time from thread open to handled'}
                />
                <SupportStatCard
                  label={isMyanmar ? 'အချိန်ကျော်နှုန်း' : 'Overdue rate'}
                  value={`${analyticsQuery.data.summary.overdueRate}%`}
                  helper={isMyanmar ? `${analyticsQuery.data.summary.total} ခုအနက် ${analyticsQuery.data.summary.overdue} ခု အချိန်ကျော်` : `${analyticsQuery.data.summary.overdue} overdue of ${analyticsQuery.data.summary.total} threads`}
                  tone={analyticsQuery.data.summary.overdueRate >= 20 ? 'danger' : analyticsQuery.data.summary.overdueRate >= 10 ? 'warning' : 'default'}
                />
                <SupportStatCard
                  label={isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled'}
                  value={analyticsQuery.data.summary.handled}
                  helper={isMyanmar ? `တူညီသော အချိန်အပိုင်းအတွင်း ${analyticsQuery.data.summary.open} ခု ဖွင့်ထားဆဲ` : `${analyticsQuery.data.summary.open} still open in the same window`}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                  <div className="mb-4">
                    <p className="text-sm font-semibold">{isMyanmar ? 'စီမံခန့်ခွဲသူ အလိုက်' : 'By admin'}</p>
                    <p className="text-sm text-muted-foreground">{isMyanmar ? 'တာဝန်ပမာဏ၊ တုံ့ပြန်မြန်နှုန်းနှင့် အချိန်ကျော်နှုန်းကို ပြသသည်။' : 'Ownership load, response speed, and overdue rate.'}</p>
                  </div>
                  <div className="space-y-3">
                    {analyticsQuery.data.byAdmin.map((bucket) => (
                      <div key={bucket.key} className="rounded-[0.9rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{bucket.label}</p>
                          <Badge variant="outline">{bucket.total} {isMyanmar ? 'စကားဝိုင်း' : 'threads'}</Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                          <p>{isMyanmar ? 'ဖွင့်ထားသည်:' : 'Open:'} {bucket.open}</p>
                          <p>{isMyanmar ? 'ဖြေရှင်းပြီး:' : 'Handled:'} {bucket.handled}</p>
                          <p>{isMyanmar ? 'ပထမ တုံ့ပြန်ချက်:' : 'First reply:'} {formatDurationLabel(bucket.firstResponseMinutes, isMyanmar)}</p>
                          <p>{isMyanmar ? 'အချိန်ကျော်:' : 'Overdue:'} {bucket.overdueRate}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                  <div className="mb-4">
                    <p className="text-sm font-semibold">{isMyanmar ? 'အမျိုးအစား အလိုက်' : 'By category'}</p>
                    <p className="text-sm text-muted-foreground">{isMyanmar ? 'မည်သည့် ပြဿနာအမျိုးအစားများက တုံ့ပြန်ချိန်ကို အကျိုးသက်ရောက်စေသည်ကို ကြည့်ပါ။' : 'See which issue types are driving response time.'}</p>
                  </div>
                  <div className="space-y-3">
                    {analyticsQuery.data.byCategory.map((bucket) => (
                      <div key={bucket.key} className="rounded-[0.9rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{bucket.label}</p>
                          <Badge variant="outline">{bucket.total} {isMyanmar ? 'စကားဝိုင်း' : 'threads'}</Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                          <p>{isMyanmar ? 'ဖွင့်ထားသည်:' : 'Open:'} {bucket.open}</p>
                          <p>{isMyanmar ? 'ဖြေရှင်းပြီး:' : 'Handled:'} {bucket.handled}</p>
                          <p>{isMyanmar ? 'ဖြေရှင်းချိန်:' : 'Handled time:'} {formatDurationLabel(bucket.handledMinutes, isMyanmar)}</p>
                          <p>{isMyanmar ? 'အချိန်ကျော်:' : 'Overdue:'} {bucket.overdueRate}%</p>
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
            {isMyanmar ? 'စကားဝိုင်း အစဉ်' : 'Thread queue'}
          </CardTitle>
          <CardDescription>
            {isMyanmar
              ? 'ဖောက်သည်၏ နောက်ဆုံး context ကို ကြည့်ပြီး နောက်လုပ်ဆောင်ရန်ကို အမြန်ဆုံးသိကာ လိုအပ်သည့်အခါမှသာ thread အပြည့်သို့ ဝင်ပါ။'
              : 'Scan the latest customer context, see the next action, and jump into the full thread only when needed.'}
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
              const latestPreview = getLatestReplyPreview(thread.latestReply, isMyanmar);
              const nextAction = getSupportThreadNextAction(thread, isMyanmar);
              const linkedContext = getSupportThreadContextSummary(thread, isMyanmar);
              const threadHref = withBasePath(`/dashboard/support/threads/${thread.id}`);
              const customerHref = thread.customer ? withBasePath(`/dashboard/users/${thread.customer.id}`) : null;

              return (
                <div key={thread.id} className="rounded-[1.1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold">{thread.threadCode}</p>
                        <Badge variant="outline" className={getThreadStateBadgeClass(thread.status, thread.waitingOn)}>
                          {getThreadStateLabel(thread.status, thread.waitingOn, isMyanmar)}
                        </Badge>
                        <Badge variant="outline">{getSupportIssueLabel(thread.issueCategory, isMyanmar)}</Badge>
                        {thread.isOverdue ? (
                          <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-100">
                            {isMyanmar ? 'အချိန်ကျော်နေသည်' : 'Overdue'}
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
                          {isMyanmar ? 'စကားဝိုင်း ဖွင့်မည်' : 'Open thread'}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      {customerHref ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={customerHref}>{isMyanmar ? 'အသုံးပြုသူ စာရင်း ဖွင့်မည်' : 'Open CRM'}</Link>
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
                          {isMyanmar ? 'တာဝန်မှ ဖြုတ်မည်' : 'Unclaim'}
                          </Button>
                        ) : null
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => claimMutation.mutate({ threadId: thread.id })}
                        >
                          {isMyanmar ? 'တာဝန်ယူမည်' : 'Claim'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
                    <div className="space-y-2 rounded-[0.95rem] border border-border/60 bg-background/50 p-3 dark:bg-white/[0.025]">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး တုံ့ပြန်ချက်' : 'Latest reply'}</p>
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
                              <Image
                                src={thread.latestReply.mediaUrl}
                                alt={getLatestReplyAttachmentLabel(thread.latestReply, isMyanmar) || (isMyanmar ? 'အကူအညီ ဖိုင်တွဲ' : 'Support attachment')}
                                width={640}
                                height={256}
                                unoptimized
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
                              <span className="truncate">{getLatestReplyAttachmentLabel(thread.latestReply, isMyanmar)}</span>
                            </a>
                          )}
                        </div>
                      ) : null}
                      {thread.latestReply ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDateTime(thread.latestReply.createdAt)}</span>
                          {thread.latestReply.mediaKind ? (
                            <Badge variant="outline" className="text-[10px]">
                              {thread.latestReply.mediaKind === 'IMAGE' ? (isMyanmar ? 'ပုံဖိုင်တွဲ ပါရှိသည်' : 'Image attached') : (isMyanmar ? 'ဖိုင်တွဲ ပါရှိသည်' : 'File attached')}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className={[
                        'space-y-3 rounded-[0.95rem] border p-3',
                        nextAction.tone === 'danger'
                          ? 'border-red-500/25 bg-red-500/10'
                          : nextAction.tone === 'warning'
                            ? 'border-amber-500/25 bg-amber-500/10'
                            : 'border-border/60 bg-background/50 dark:bg-white/[0.025]',
                      ].join(' ')}
                    >
                      <div>
                        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {isMyanmar ? 'နောက်လုပ်ဆောင်ရန်' : 'Next action'}
                        </p>
                        <p className="mt-2 text-sm font-medium">{nextAction.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{nextAction.helper}</p>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <p>
                          <span className="font-medium text-foreground">{isMyanmar ? 'တာဝန်ခံ:' : 'Owner:'}</span>{' '}
                          {thread.assignedAdminName || (isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned')}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">{isMyanmar ? 'တုံ့ပြန်ကတိချိန်:' : 'SLA:'}</span>{' '}
                          {thread.firstResponseDueAt ? formatDateTime(thread.firstResponseDueAt) : (isMyanmar ? 'ဖြေရှင်းပြီး / ကတိချိန် မရှိ' : 'Handled / no SLA')}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">{isMyanmar ? 'ဆက်စပ်အကြောင်းအရာ:' : 'Context:'}</span> {linkedContext}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">{isMyanmar ? 'ဖွင့်ခဲ့သည့်အချိန်:' : 'Opened:'}</span>{' '}
                          {formatRelativeTime(thread.createdAt)}
                        </p>
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
