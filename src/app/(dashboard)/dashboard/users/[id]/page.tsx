'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, BadgeDollarSign, Bell, Coins, ExternalLink, KeyRound, Loader2, MessageSquare, RefreshCw, Save, Send, ShieldAlert, Wallet, XCircle } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
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
} from '@/components/ui/detail-workspace';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogSectionDescription,
  DialogSectionHeader,
  DialogSectionTitle,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { resolveRefundReasonPresetLabel } from '@/lib/finance';
import { formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { withBasePath } from '@/lib/base-path';

type FinanceAction = 'VERIFY' | 'REFUND' | 'CREDIT';

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }

  const normalizedCurrency = (currency || 'MMK').trim().toUpperCase();
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  if (normalizedCurrency === 'MMK') {
    return `${formatted} Kyat`;
  }
  if (normalizedCurrency === 'USD') {
    return `$${formatted}`;
  }
  return `${formatted} ${normalizedCurrency}`;
}

function FinanceStatusBadge({ status }: { status: string }) {
  const className =
    status === 'REFUNDED'
      ? 'border-red-500/30 bg-red-500/10 text-red-300'
      : status === 'CREDITED'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
        : status === 'VERIFIED'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-border/60 bg-background/50 text-foreground';

  return (
    <Badge variant="outline" className={className}>
      {status}
    </Badge>
  );
}

function CouponLifecycleBadge({
  status,
}: {
  status:
    | 'ISSUED'
    | 'REDEEMED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'ELIGIBLE'
    | 'ACTIVE_COUPON'
    | 'PAUSED'
    | 'COOLDOWN'
    | 'RECENT_REFUND'
    | 'SUPPORT_HEAVY'
    | 'MANUAL_BLOCK'
    | 'MANUAL_ALLOW'
    | 'CONVERTED'
    | 'DISABLED'
    | 'LIMIT_REACHED';
}) {
  const labelMap: Record<string, string> = {
    ISSUED: 'Active',
    REDEEMED: 'Redeemed',
    EXPIRED: 'Expired',
    CANCELLED: 'Revoked',
    ELIGIBLE: 'Eligible',
    ACTIVE_COUPON: 'Active coupon',
    MANUAL_BLOCK: 'Suppressed',
    MANUAL_ALLOW: 'Force allow',
    PAUSED: 'Paused',
    COOLDOWN: 'Cooling down',
    RECENT_REFUND: 'Recent refund',
    SUPPORT_HEAVY: 'Support-heavy',
    CONVERTED: 'Converted',
    DISABLED: 'Disabled',
    LIMIT_REACHED: 'Limit reached',
  };
  const className =
    status === 'ISSUED' || status === 'ACTIVE_COUPON' || status === 'ELIGIBLE'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : status === 'REDEEMED' || status === 'CONVERTED'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
        : status === 'PAUSED' || status === 'COOLDOWN'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
          : status === 'RECENT_REFUND' || status === 'SUPPORT_HEAVY'
            ? 'border-orange-500/30 bg-orange-500/10 text-orange-100'
            : status === 'MANUAL_ALLOW'
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
              : status === 'EXPIRED' || status === 'LIMIT_REACHED'
                ? 'border-zinc-500/30 bg-zinc-500/10 text-zinc-200'
                : status === 'DISABLED'
                ? 'border-border/60 bg-background/50 text-muted-foreground'
                : 'border-red-500/30 bg-red-500/10 text-red-200';

  return (
    <Badge variant="outline" className={className}>
      {labelMap[status] || status}
    </Badge>
  );
}

type FinanceTimelineEvent = {
  id: string;
  at: Date;
  title: string;
  detail: string;
  tone: 'default' | 'positive' | 'warning' | 'danger';
  orderCode?: string;
  href?: string;
};

type SupportTimelineEvent = {
  id: string;
  at: Date;
  title: string;
  detail: string;
  tone: 'default' | 'warning' | 'danger' | 'positive';
  href?: string;
};

type CommunicationThreadEvent = {
  id: string;
  at: Date;
  title: string;
  detail: string;
  tone: 'default' | 'warning' | 'danger' | 'positive';
  category:
    | 'announcement'
    | 'message'
    | 'support_thread'
    | 'support_note'
    | 'receipt'
    | 'refund'
    | 'key_notice';
  customerFacing: boolean;
  href?: string;
  meta?: string;
};

function getSupportThreadCategoryLabel(category: string, isMyanmar = false) {
  switch ((category || '').trim().toUpperCase()) {
    case 'ORDER':
      return isMyanmar ? 'အော်ဒါ / ငွေပေးချေမှု' : 'Order / payment';
    case 'KEY':
      return isMyanmar ? 'သော့ / အသုံးပြုမှု' : 'Key / usage';
    case 'SERVER':
      return isMyanmar ? 'ဆာဗာ / လမ်းကြောင်း ပြဿနာ' : 'Server / route issue';
    case 'BILLING':
      return isMyanmar ? 'ငွေတောင်းခံမှု / ငွေပြန်အမ်း' : 'Billing / refund';
    default:
      return isMyanmar ? 'အထွေထွေ အကူအညီ' : 'General help';
  }
}

function getSupportThreadStateLabel(status: string, waitingOn: string, isMyanmar = false) {
  if (status === 'HANDLED') {
    return isMyanmar ? 'ကိုင်တွယ်ပြီး' : 'Handled';
  }
  if (status === 'ESCALATED') {
    return isMyanmar ? 'ဒက်ရှ်ဘုတ်သို့ တင်ပို့ထားသည်' : 'Escalated to panel';
  }
  if ((waitingOn || '').toUpperCase() === 'USER') {
    return isMyanmar ? 'ဖောက်သည်ကို စောင့်နေသည်' : 'Waiting for customer';
  }
  return isMyanmar ? 'စီမံခန့်ခွဲသူကို စောင့်နေသည်' : 'Waiting for admin';
}

function getServerChangeRequestStatusLabel(status: string, isMyanmar = false) {
  switch ((status || '').trim().toUpperCase()) {
    case 'PENDING':
    case 'PENDING_REVIEW':
      return isMyanmar ? 'စောင့်ဆိုင်းနေ' : 'Pending review';
    case 'APPROVED':
      return isMyanmar ? 'အတည်ပြုပြီး' : 'Approved';
    case 'REJECTED':
      return isMyanmar ? 'ပယ်ချပြီး' : 'Rejected';
    case 'COMPLETED':
      return isMyanmar ? 'ပြီးဆုံးပြီး' : 'Completed';
    default:
      return status;
  }
}

function getPremiumSupportRequestTypeLabel(requestType: string, isMyanmar = false) {
  switch ((requestType || '').trim().toUpperCase()) {
    case 'REGION_CHANGE':
      return isMyanmar ? 'ဒေသ ပြောင်းရန်' : 'Region change';
    case 'ROUTE_ISSUE':
      return isMyanmar ? 'လမ်းကြောင်း ပြဿနာ' : 'Route issue';
    default:
      return requestType;
  }
}

function getPremiumSupportRequestStatusLabel(status: string, isMyanmar = false) {
  switch ((status || '').trim().toUpperCase()) {
    case 'PENDING':
    case 'PENDING_REVIEW':
      return isMyanmar ? 'စောင့်ဆိုင်းနေ' : 'Pending review';
    case 'APPROVED':
      return isMyanmar ? 'အတည်ပြုပြီး' : 'Approved';
    case 'HANDLED':
      return isMyanmar ? 'ကိုင်တွယ်ပြီး' : 'Handled';
    case 'DISMISSED':
      return isMyanmar ? 'ပယ်ဖျက်ပြီး' : 'Dismissed';
    default:
      return status;
  }
}

function getCrmTemplateCategoryLabel(category: string, isMyanmar = false) {
  switch (category) {
    case 'Support':
      return isMyanmar ? 'အကူအညီ' : 'Support';
    case 'Payments':
      return isMyanmar ? 'ငွေပေးချေမှု' : 'Payments';
    case 'Outage':
      return isMyanmar ? 'ပြတ်တောက်မှု' : 'Outage';
    case 'Billing':
      return isMyanmar ? 'ငွေကြေး' : 'Billing';
    case 'Retention':
      return isMyanmar ? 'ဆက်လက်အသုံးပြုမှု' : 'Retention';
    case 'Promo':
      return isMyanmar ? 'ပရိုမိုးရှင်း' : 'Promo';
    default:
      return category;
  }
}

function getCrmTemplateLabel(label: string, isMyanmar = false) {
  switch (label) {
    case 'Support follow-up':
      return isMyanmar ? 'အကူအညီ နောက်ဆက်တွဲ' : 'Support follow-up';
    case 'Need screenshot':
      return isMyanmar ? 'စကရင်ရှော့ လိုအပ်သည်' : 'Need screenshot';
    case 'Server issue':
      return isMyanmar ? 'ဆာဗာ ပြဿနာ' : 'Server issue';
    case 'Resolved':
      return isMyanmar ? 'ပြေလည်ပြီး' : 'Resolved';
    case 'Receipt follow-up':
      return isMyanmar ? 'ပြေစာ နောက်ဆက်တွဲ' : 'Receipt follow-up';
    case 'Renewal reminder':
      return isMyanmar ? 'သက်တမ်းတိုး သတိပေးချက်' : 'Renewal reminder';
    case 'Promo follow-up':
      return isMyanmar ? 'ပရိုမိုးရှင်း နောက်ဆက်တွဲ' : 'Promo follow-up';
    default:
      return label;
  }
}

function getCrmTemplateBody(label: string, fallbackBody: string, isMyanmar = false) {
  if (!isMyanmar) {
    return fallbackBody;
  }

  switch (label) {
    case 'Support follow-up':
      return 'မင်္ဂလာပါ။ သင့်စာကို ရရှိထားပြီး ပြဿနာကို စစ်ဆေးနေပါသည်။ ရှိပါက သော့အမည် သို့မဟုတ် အော်ဒါကုဒ်ကို ပေးပို့ပါ။';
    case 'Need screenshot':
      return 'ငွေပေးချေမှု စကရင်ရှော့ကို ပိုမိုရှင်းလင်းစွာ ထပ်ပို့ပေးပါ။ ငွေပမာဏ၊ အကောင့်အမည်နှင့် ငွေလွှဲချိန် ပါဝင်ရပါမည်။';
    case 'Server issue':
      return 'ဆာဗာအခြေအနေ မမှန်ကြောင်း နားလည်ပါသည်။ ယခု စစ်ဆေးနေပါသည်။ ခဏစောင့်ပေးပါ၊ မကြာမီ ထပ်မံအသိပေးပါမည်။';
    case 'Resolved':
      return 'သင့်ပြဿနာကို ပြေလည်အောင် လုပ်ဆောင်ပြီးပါပြီ။ ထပ်မံ စမ်းသုံးကြည့်ပြီး ပြဿနာ ဆက်ရှိပါက ပြန်ပြောပါ။';
    case 'Receipt follow-up':
      return 'ပြေစာကို ထပ်မံ ပို့ထားပြီးပါပြီ။ Telegram တွင် မတွေ့သေးပါက ပြန်ပြောပါ၊ ကိုယ်တိုင် ထပ်ပို့ပေးပါမည်။';
    case 'Renewal reminder':
      return 'သင့်သော့၏ သက်တမ်းကုန်ချိန် နီးလာပါသည်။ အနှောင့်အယှက် မဖြစ်စေရန် ကြိုတင် သက်တမ်းတိုးပါ။ /renew ကို အသုံးပြုနိုင်သလို admin ကိုလည်း ဆက်သွယ်နိုင်ပါသည်။';
    case 'Promo follow-up':
      return 'သင့်အကောင့်အတွက် ပရိုမိုးရှင်းအသစ် ရရှိနိုင်ပါသည်။ သင့်တော်သော အစီအစဉ်ကို ရွေးရာတွင် အကူအညီလိုပါက ဒီနေရာတွင် ပြန်စာပို့ပါ။';
    default:
      return fallbackBody;
  }
}

function getSupportThreadTone(status: string, waitingOn: string): SupportTimelineEvent['tone'] {
  if (status === 'HANDLED') {
    return 'positive';
  }
  if (status === 'ESCALATED') {
    return 'warning';
  }
  return (waitingOn || '').toUpperCase() === 'USER' ? 'default' : 'warning';
}

const CRM_DIRECT_MESSAGE_TEMPLATES = [
  {
    category: 'Support',
    label: 'Support follow-up',
    body: 'Hello. We received your message and we are checking the issue now. Please send your key name or order code if you have it.',
  },
  {
    category: 'Payments',
    label: 'Need screenshot',
    body: 'Please send a clearer screenshot of the payment, including the amount, account name, and transaction time.',
  },
  {
    category: 'Outage',
    label: 'Server issue',
    body: 'We understand the server is not working properly for you. We are checking it now. Please wait a little while, and we will update you again soon.',
  },
  {
    category: 'Support',
    label: 'Resolved',
    body: 'Your issue should be resolved now. Please try again and let us know if the problem still continues.',
  },
  {
    category: 'Billing',
    label: 'Receipt follow-up',
    body: 'We sent your receipt again. If you still cannot find it in Telegram, please let us know and we will resend it manually.',
  },
  {
    category: 'Retention',
    label: 'Renewal reminder',
    body: 'Your key is getting close to expiry. Please renew early to avoid interruption. You can use /renew or contact admin for help.',
  },
  {
    category: 'Promo',
    label: 'Promo follow-up',
    body: 'A new offer is available for your account. If you want help choosing the right plan, reply here and we will guide you.',
  },
] as const;

export default function UserLedgerPage() {
  const params = useParams();
  const userId = params.id as string;
  const { toast } = useToast();
  const { locale } = useLocale();
  const isMyanmar = locale === 'my';
  const utils = trpc.useUtils();
  const [financeDialog, setFinanceDialog] = useState<{
    orderId: string;
    orderCode: string;
    action: FinanceAction;
    defaultAmount: number | null;
    currency: string | null;
  } | null>(null);
  const [financeAmount, setFinanceAmount] = useState('');
  const [financeNote, setFinanceNote] = useState('');
  const [crmDirectMessageTitle, setCrmDirectMessageTitle] = useState('');
  const [crmDirectMessage, setCrmDirectMessage] = useState('');
  const [crmIncludeSupportButton, setCrmIncludeSupportButton] = useState(true);
  const [crmDirectMessageCardStyle, setCrmDirectMessageCardStyle] = useState<'DEFAULT' | 'PROMO' | 'PREMIUM' | 'OPERATIONS'>('DEFAULT');
  const [crmDirectMessageMediaKind, setCrmDirectMessageMediaKind] = useState<'NONE' | 'IMAGE' | 'FILE'>('NONE');
  const [crmDirectMessageMediaUrl, setCrmDirectMessageMediaUrl] = useState('');
  const [crmSupportNote, setCrmSupportNote] = useState('');
  const [crmOutageServerName, setCrmOutageServerName] = useState('');
  const [crmOutageMessage, setCrmOutageMessage] = useState('');
  const [crmShareTarget, setCrmShareTarget] = useState('');
  const [crmReceiptOrderId, setCrmReceiptOrderId] = useState('');
  const [crmAnnouncementId, setCrmAnnouncementId] = useState('');
  const [crmMarketingTags, setCrmMarketingTags] = useState('');
  const [crmTemplateMode, setCrmTemplateMode] = useState<'replace' | 'append'>('replace');
  const [communicationFilter, setCommunicationFilter] = useState<
    'ALL' | 'CUSTOMER' | 'INTERNAL' | CommunicationThreadEvent['category']
  >('ALL');
  const [communicationSearch, setCommunicationSearch] = useState('');

  const ledgerQuery = trpc.users.getLedger.useQuery(
    { id: userId },
    { enabled: !!userId },
  );

  const reconcileMutation = trpc.users.reconcileTelegramOrder.useMutation({
    onSuccess: () => {
      toast({
        title: locale === 'my' ? 'ငွေကြေး လုပ်ဆောင်ချက်ကို သိမ်းပြီးပါပြီ' : 'Finance action saved',
        description: locale === 'my' ? 'အော်ဒါ၏ ငွေကြေး အခြေအနေကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The order finance state was updated.',
      });
      setFinanceDialog(null);
      setFinanceAmount('');
      setFinanceNote('');
      utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'ငွေကြေး လုပ်ဆောင်ချက် မအောင်မြင်ပါ' : 'Finance action failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const reviewRefundRequestMutation = trpc.users.reviewRefundRequest.useMutation({
    onSuccess: async () => {
      toast({
        title: locale === 'my' ? 'ပြန်အမ်းငွေ တောင်းဆိုမှုကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Refund request updated',
        description: locale === 'my'
          ? 'ပြန်အမ်းငွေ တောင်းဆိုမှု ဆိုင်ရာ ဆုံးဖြတ်ချက်ကို အသုံးပြုသူထံ အသိပေးပြီးပါပြီ။'
          : 'The customer was notified about the refund request decision.',
      });
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'ပြန်အမ်းငွေ စစ်ဆေးမှု မအောင်မြင်ပါ' : 'Refund review failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateNotificationPreferencesMutation = trpc.users.updateNotificationPreferences.useMutation({
    onSuccess: async () => {
      toast({
        title: locale === 'my' ? 'အသိပေးချက် သတ်မှတ်ချက်များကို သိမ်းပြီးပါပြီ' : 'Notification preferences saved',
        description: locale === 'my' ? 'ဖောက်သည်၏ အသိပေးချက် ဆက်တင်များကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'The customer notification settings were updated.',
      });
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'သတ်မှတ်ချက် အပ်ဒိတ်လုပ်မှု မအောင်မြင်ပါ' : 'Preference update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sendDirectTelegramMessageMutation = trpc.users.sendDirectTelegramMessage.useMutation({
    onSuccess: async () => {
      toast({
        title: locale === 'my' ? 'Telegram စာကို ပို့ပြီးပါပြီ' : 'Telegram message sent',
        description: locale === 'my' ? 'ဖောက်သည်ထံ တိုက်ရိုက်စာကို ပို့ပြီးပါပြီ။' : 'The direct customer message was delivered.',
      });
      setCrmDirectMessageTitle('');
      setCrmDirectMessage('');
      setCrmDirectMessageCardStyle('DEFAULT');
      setCrmDirectMessageMediaKind('NONE');
      setCrmDirectMessageMediaUrl('');
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'Telegram စာ မပို့နိုင်ပါ' : 'Telegram message failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMarketingTagsMutation = trpc.users.updateMarketingTags.useMutation({
    onSuccess: async (result) => {
      toast({
        title: locale === 'my' ? 'ဖောက်သည် အမှတ်အသားများကို သိမ်းပြီးပါပြီ' : 'Customer tags saved',
        description: locale === 'my' ? 'ဤဖောက်သည်အတွက် ပရိုမိုးရှင်း အမှတ်အသားများနှင့် အုပ်စုခွဲမှုများကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Promotion tags/segments were updated for this customer.',
      });
      setCrmMarketingTags(result.marketingTags || '');
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'ဖောက်သည် အမှတ်အသား အပ်ဒိတ်လုပ်မှု မအောင်မြင်ပါ' : 'Customer tags failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updatePromoEligibilityOverrideMutation = trpc.users.updatePromoEligibilityOverride.useMutation({
    onSuccess: async () => {
      toast({
        title: locale === 'my' ? 'ပရိုမိုးရှင်း အစားထိုးသတ်မှတ်ချက်ကို သိမ်းပြီးပါပြီ' : 'Promo override saved',
        description: locale === 'my' ? 'ဖောက်သည်၏ ပရိုမိုးရှင်း အကျုံးဝင်မှုကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။' : 'Customer promo eligibility was updated.',
      });
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'ပရိုမိုးရှင်း အစားထိုးသတ်မှတ်ချက် မအောင်မြင်ပါ' : 'Promo override failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resendTelegramOrderReceiptMutation = trpc.users.resendTelegramOrderReceipt.useMutation({
    onSuccess: () => {
      toast({
        title: locale === 'my' ? 'ပြေစာကို ပြန်ပို့ပြီးပါပြီ' : 'Receipt resent',
        description: locale === 'my' ? 'Telegram ပြေစာကို ထပ်မံ ပို့ပြီးပါပြီ။' : 'The Telegram receipt was sent again.',
      });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'ပြေစာ ပြန်ပို့မှု မအောင်မြင်ပါ' : 'Receipt resend failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resendCustomerSharePageMutation = trpc.users.resendCustomerSharePage.useMutation({
    onSuccess: () => {
      toast({
        title: locale === 'my' ? 'မျှဝေစာမျက်နှာကို ထပ်ပို့ပြီးပါပြီ' : 'Share page resent',
        description: locale === 'my'
          ? 'အသုံးပြုသူထံ Telegram မှ share page ကို ထပ်မံပို့ပြီးပါပြီ။'
          : 'The customer received the share page again in Telegram.',
      });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'မျှဝေစာမျက်နှာကို ထပ်ပို့မရပါ' : 'Share resend failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sendCustomerOutageUpdateMutation = trpc.users.sendCustomerOutageUpdate.useMutation({
    onSuccess: async () => {
      toast({
        title: locale === 'my' ? 'ပြတ်တောက်မှု အသိပေးချက်ကို ပို့ပြီးပါပြီ' : 'Outage update sent',
        description: locale === 'my' ? 'ဖောက်သည်သည် Telegram မှ ပြတ်တောက်မှု အသိပေးချက်ကို ရရှိပြီးပါပြီ။' : 'The customer received the outage update in Telegram.',
      });
      setCrmOutageMessage('');
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'ပြတ်တောက်မှု အသိပေးချက် မပို့နိုင်ပါ' : 'Outage update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const addSupportNoteMutation = trpc.users.addSupportNote.useMutation({
    onSuccess: async () => {
      toast({
        title: locale === 'my' ? 'အတွင်းသုံး အကူအညီ မှတ်စုကို သိမ်းပြီးပါပြီ' : 'Support note added',
        description: locale === 'my' ? 'အတွင်းသုံး အကူအညီ မှတ်စုကို သိမ်းပြီးပါပြီ။' : 'The internal support note was saved.',
      });
      setCrmSupportNote('');
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'အကူအညီ မှတ်စု သိမ်းဆည်းမှု မအောင်မြင်ပါ' : 'Support note failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateCouponStatusMutation = trpc.users.updateCouponStatus.useMutation({
    onSuccess: async (result) => {
      toast({
        title: result.status === 'CANCELLED'
          ? (locale === 'my' ? 'ကူပွန်ကို ရုပ်သိမ်းပြီးပါပြီ' : 'Coupon revoked')
          : (locale === 'my' ? 'ကူပွန် သက်တမ်းကုန်ပြီးပါပြီ' : 'Coupon expired'),
        description: locale === 'my'
          ? `${result.couponCode} ကို ဤဖောက်သည်အတွက် မသုံးနိုင်တော့ပါ။`
          : `${result.couponCode} is no longer available to this customer.`,
      });
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'ကူပွန် အပ်ဒိတ်လုပ်မှု မအောင်မြင်ပါ' : 'Coupon update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resendAnnouncementToCustomerMutation = trpc.users.resendAnnouncementToCustomer.useMutation({
    onSuccess: async () => {
      toast({
        title: locale === 'my' ? 'ကြေညာချက်ကို ထပ်ပို့ပြီးပါပြီ' : 'Announcement resent',
        description: locale === 'my' ? 'ရွေးထားသော ကြေညာချက်ကို ဤဖောက်သည်ထံသာ ထပ်မံ ပို့ပြီးပါပြီ။' : 'The selected announcement was sent again to this customer only.',
      });
      await utils.users.getLedger.invalidate({ id: userId });
    },
    onError: (error) => {
      toast({
        title: locale === 'my' ? 'ကြေညာချက် ပြန်ပို့မှု မအောင်မြင်ပါ' : 'Announcement resend failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const revenueSummary = useMemo(() => {
    const summary = ledgerQuery.data?.summary;
    if (!summary || summary.revenueByCurrency.length === 0) {
      return locale === 'my' ? 'ငွေပေးချေပြီးသော အော်ဒါ မရှိသေးပါ။' : 'No paid orders yet';
    }

    return summary.revenueByCurrency
      .map((entry) => formatMoney(entry.amount, entry.currency))
      .join(' • ');
  }, [ledgerQuery.data, locale]);

  const refundedSummary = useMemo(() => {
    const summary = ledgerQuery.data?.summary;
    if (!summary || summary.refundedByCurrency.length === 0) {
      return locale === 'my' ? 'ပြန်အမ်းငွေ မရှိသေးပါ။' : 'No refunds yet';
    }

    return summary.refundedByCurrency
      .map((entry) => formatMoney(entry.amount, entry.currency))
      .join(' • ');
  }, [ledgerQuery.data, locale]);

  useEffect(() => {
    if (!ledgerQuery.data) {
      return;
    }

    if (!crmShareTarget) {
      const firstAccessKey = ledgerQuery.data.accessKeys[0];
      const firstDynamicKey = ledgerQuery.data.dynamicKeys[0];
      if (firstAccessKey) {
        setCrmShareTarget(`ACCESS_KEY:${firstAccessKey.id}`);
      } else if (firstDynamicKey) {
        setCrmShareTarget(`DYNAMIC_KEY:${firstDynamicKey.id}`);
      }
    }

    if (!crmReceiptOrderId) {
      const firstReceiptOrder = ledgerQuery.data.telegramOrders.find((order) => order.status === 'FULFILLED');
      if (firstReceiptOrder) {
        setCrmReceiptOrderId(firstReceiptOrder.id);
      }
    }

    if (!crmAnnouncementId) {
      const firstAnnouncement = ledgerQuery.data.customerNotifications.announcements[0];
      if (firstAnnouncement) {
        setCrmAnnouncementId(firstAnnouncement.announcement.id);
      }
    }

    if (!crmOutageServerName) {
      const firstServerName = ledgerQuery.data.accessKeys[0]?.server?.name;
      if (firstServerName) {
        setCrmOutageServerName(firstServerName);
      }
    }
  }, [ledgerQuery.data, crmAnnouncementId, crmOutageServerName, crmReceiptOrderId, crmShareTarget]);

  const financeTimeline = useMemo<FinanceTimelineEvent[]>(() => {
    if (!ledgerQuery.data) {
      return [];
    }

    const events: FinanceTimelineEvent[] = [];

    for (const order of ledgerQuery.data.telegramOrders) {
      const orderHref = withBasePath(
        `/dashboard/notifications?orderCode=${encodeURIComponent(order.orderCode)}`,
      );
      const orderAmountLabel = formatMoney(order.priceAmount, order.priceCurrency);
      const planLabel = order.planName || order.planCode || 'Unknown plan';

      events.push({
        id: `${order.id}:created`,
        at: new Date(order.createdAt),
        title: 'Order created',
        detail: `${order.orderCode} • ${planLabel} • ${orderAmountLabel}`,
        tone: 'default',
        orderCode: order.orderCode,
        href: orderHref,
      });

      if (order.status === 'FULFILLED' && order.reviewedAt) {
        events.push({
          id: `${order.id}:fulfilled`,
          at: new Date(order.reviewedAt),
          title: order.kind === 'TRIAL' ? 'Trial delivered' : 'Receipt delivered',
          detail: `${order.orderCode} • ${order.kind === 'TRIAL' ? 'Free trial access sent' : `Paid access delivered for ${planLabel}`}`,
          tone: 'positive',
          orderCode: order.orderCode,
          href: orderHref,
        });
      }

      if (order.refundRequestedAt) {
        events.push({
          id: `${order.id}:refund-requested`,
          at: new Date(order.refundRequestedAt),
          title: isMyanmar ? 'Refund တောင်းခံထားသည်' : 'Refund requested',
          detail: `${order.orderCode}${order.refundRequestMessage ? ` • ${order.refundRequestMessage}` : ''}`,
          tone: 'warning',
          orderCode: order.orderCode,
          href: orderHref,
        });
      }

      if (order.refundRequestReviewedAt && order.refundRequestStatus) {
        events.push({
          id: `${order.id}:refund-reviewed`,
          at: new Date(order.refundRequestReviewedAt),
          title:
            order.refundRequestStatus === 'APPROVED'
              ? (isMyanmar ? 'Refund အတည်ပြုပြီး' : 'Refund approved')
              : (isMyanmar ? 'Refund ငြင်းဆိုပြီး' : 'Refund declined'),
          detail: [
            order.orderCode,
            order.refundReviewReasonCode
              ? resolveRefundReasonPresetLabel(order.refundReviewReasonCode) || order.refundReviewReasonCode
              : null,
            order.refundRequestCustomerMessage || null,
          ]
            .filter(Boolean)
            .join(' • '),
          tone: order.refundRequestStatus === 'APPROVED' ? 'positive' : 'danger',
          orderCode: order.orderCode,
          href: orderHref,
        });
      }

      for (const action of order.financeActions) {
        const actionAmount = formatMoney(action.amount, action.currency || order.priceCurrency);
        events.push({
          id: `${action.id}:finance-action`,
          at: new Date(action.createdAt),
          title:
            action.actionType === 'VERIFY'
              ? (isMyanmar ? 'ငွေပေးချေမှု အတည်ပြုပြီး' : 'Payment verified')
              : action.actionType === 'REFUND'
                ? (isMyanmar ? 'Refund မှတ်တမ်းတင်ပြီး' : 'Refund recorded')
                : (isMyanmar ? 'Credit အသုံးချပြီး' : 'Credit applied'),
          detail: [
            order.orderCode,
            actionAmount !== '—' ? actionAmount : null,
            action.createdBy?.email || null,
            action.note || null,
          ]
            .filter(Boolean)
            .join(' • '),
          tone:
            action.actionType === 'VERIFY'
              ? 'positive'
              : action.actionType === 'REFUND'
                ? 'danger'
                : 'warning',
          orderCode: order.orderCode,
          href: orderHref,
        });
      }
    }

    return events
      .sort((left, right) => right.at.getTime() - left.at.getTime())
      .slice(0, 24);
  }, [isMyanmar, ledgerQuery.data]);

  const supportTimeline = useMemo<SupportTimelineEvent[]>(() => {
    if (!ledgerQuery.data) {
      return [];
    }

    const events: SupportTimelineEvent[] = [];

    for (const request of ledgerQuery.data.serverChangeRequests) {
      events.push({
        id: `server-change:${request.id}`,
        at: new Date(request.createdAt),
        title: isMyanmar ? 'ဆာဗာ ပြောင်းလဲရန် တောင်းဆိုမှု' : 'Server change request',
        detail: `${request.requestCode} • ${request.currentServerName} → ${request.requestedServerName} • ${getServerChangeRequestStatusLabel(request.status, isMyanmar)}`,
        tone: request.status === 'REJECTED' ? 'danger' : request.status === 'APPROVED' ? 'positive' : 'warning',
      });
    }

    for (const request of ledgerQuery.data.premiumSupportRequests) {
      events.push({
        id: `premium-support:${request.id}`,
        at: new Date(request.createdAt),
        title: isMyanmar ? 'ပရီမီယံ အကူအညီ တောင်းဆိုမှု' : 'Premium support request',
        detail: `${request.requestCode} • ${getPremiumSupportRequestTypeLabel(request.requestType, isMyanmar)} • ${getPremiumSupportRequestStatusLabel(request.status, isMyanmar)}${request.followUpPending ? ` • ${isMyanmar ? 'နောက်ဆက်တွဲကို စောင့်နေသည်' : 'waiting for follow-up'}` : ''}`,
        tone: request.status === 'DISMISSED' ? 'danger' : request.status === 'HANDLED' ? 'positive' : 'warning',
      });
    }

    for (const alert of ledgerQuery.data.premiumRoutingAlerts) {
      const metadata = (alert.metadata || {}) as Record<string, unknown>;
      const currentRegionCode =
        typeof metadata.currentRegionCode === 'string' ? metadata.currentRegionCode : null;
      const currentStatus =
        typeof metadata.currentStatus === 'string' ? metadata.currentStatus : null;
      const fallbackRegions = Array.isArray(metadata.suggestedFallbackRegions)
        ? metadata.suggestedFallbackRegions.filter((value): value is string => typeof value === 'string')
        : [];
      const fallbackRegionCode =
        typeof metadata.fallbackRegionCode === 'string' ? metadata.fallbackRegionCode : null;
      const healthyPreferredRegions = Array.isArray(metadata.healthyPreferredRegions)
        ? metadata.healthyPreferredRegions.filter((value): value is string => typeof value === 'string')
        : [];
      const recoveryMinutes =
        typeof metadata.recoveryMinutes === 'number' ? metadata.recoveryMinutes : null;

      events.push({
        id: `premium-routing:${alert.id}`,
        at: new Date(alert.createdAt),
        title:
          alert.eventType === 'AUTO_FALLBACK_PIN_APPLIED'
            ? (isMyanmar ? 'ပရီမီယံ အစားထိုးလမ်းကြောင်းကို ပင်ထားပြီး' : 'Premium fallback pinned')
            : alert.eventType === 'PREFERRED_REGION_RECOVERED'
              ? (isMyanmar ? 'ပရီမီယံ ဒေသ ပြန်ကောင်းလာပြီး' : 'Premium region recovered')
              : (isMyanmar ? 'ပရီမီယံ ဒေသ အရည်အသွေးကျဆင်း' : 'Premium region degraded'),
        detail: [
          alert.dynamicAccessKeyName,
          currentRegionCode ? `${currentRegionCode}${currentStatus ? ` • ${currentStatus}` : ''}` : null,
          fallbackRegionCode ? `${isMyanmar ? 'အစားထိုး လမ်းကြောင်း' : 'fallback'} ${fallbackRegionCode}` : null,
          fallbackRegions.length > 0 ? `${isMyanmar ? 'အစားထိုး လမ်းကြောင်းများ' : 'fallback'} ${fallbackRegions.join(', ')}` : null,
          healthyPreferredRegions.length > 0 ? `${isMyanmar ? 'ပြန်လည် ကောင်းမွန်လာသော ဒေသများ' : 'recovered'} ${healthyPreferredRegions.join(', ')}` : null,
          recoveryMinutes ? `${Math.round(recoveryMinutes)} ${isMyanmar ? 'မိနစ်' : 'min'}` : null,
        ]
          .filter(Boolean)
          .join(' • '),
        tone:
          alert.eventType === 'PREFERRED_REGION_RECOVERED'
            ? 'positive'
            : alert.severity === 'CRITICAL'
              ? 'danger'
              : 'warning',
        href: withBasePath(`/dashboard/dynamic-keys/${alert.dynamicAccessKeyId}`),
      });
    }

    for (const delivery of ledgerQuery.data.customerNotifications.announcements) {
      events.push({
        id: `announcement:${delivery.id}`,
        at: new Date(delivery.sentAt || delivery.createdAt),
        title: delivery.isPinned
          ? (isMyanmar ? 'ပင်ထားသော ကြေညာချက်ကို ပို့ပြီး' : 'Pinned announcement delivered')
          : (isMyanmar ? 'ကြေညာချက်ကို ပို့ပြီး' : 'Announcement delivered'),
        detail: `${delivery.announcement.title} • ${delivery.status}${delivery.readAt ? ` • ${isMyanmar ? 'ဖတ်ပြီး' : 'read'}` : ` • ${isMyanmar ? 'မဖတ်ရသေး' : 'unread'}`}`,
        tone: delivery.isPinned ? 'warning' : 'default',
      });
    }

    for (const log of ledgerQuery.data.customerNotifications.keyNotices) {
      events.push({
        id: `notice:${log.id}`,
        at: new Date(log.sentAt),
        title: log.event,
        detail: `${log.accessKeyName || (isMyanmar ? 'မချိတ်ထားသော သော့' : 'Unlinked key')} • ${log.status}`,
        tone: log.status === 'FAILED' ? 'danger' : 'default',
      });
    }

    for (const thread of ledgerQuery.data.supportThreads) {
      const latestReply = thread.replies[thread.replies.length - 1];
      const stateLabel = getSupportThreadStateLabel(thread.status, thread.waitingOn, isMyanmar);
      const threadHref = withBasePath(`/dashboard/support/threads/${thread.id}`);

      events.push({
        id: `support-thread:${thread.id}`,
        at: new Date(thread.updatedAt || thread.createdAt),
        title: isMyanmar ? 'Telegram အကူအညီ စကားပြောခန်း' : 'Telegram support thread',
        detail: [
          thread.threadCode,
          getSupportThreadCategoryLabel(thread.issueCategory, isMyanmar),
          stateLabel,
          latestReply
            ? `${latestReply.senderType === 'ADMIN'
              ? (isMyanmar ? 'စီမံခန့်ခွဲသူ' : 'Admin')
              : (isMyanmar ? 'ဖောက်သည်' : 'Customer')}: ${latestReply.message}`
            : thread.subject || null,
        ]
          .filter(Boolean)
          .join(' • '),
        tone: getSupportThreadTone(thread.status, thread.waitingOn),
        href: threadHref,
      });
    }

    for (const note of ledgerQuery.data.supportNotes) {
      events.push({
        id: `support-note:${note.id}`,
        at: new Date(note.createdAt),
        title: note.kind === 'OUTAGE_UPDATE'
          ? (isMyanmar ? 'ပြတ်တောက်မှု အသိပေးချက် ပို့ပြီး' : 'Outage update sent')
          : note.kind === 'DIRECT_MESSAGE'
            ? (isMyanmar ? 'Telegram တိုက်ရိုက်စာ ပို့ပြီး' : 'Direct Telegram message')
            : (isMyanmar ? 'အတွင်းသုံး အကူအညီ မှတ်စု' : 'Internal support note'),
        detail: `${note.note}${note.createdBy?.email ? ` • ${note.createdBy.email}` : ''}`,
        tone: note.kind === 'OUTAGE_UPDATE' ? 'warning' : 'default',
      });
    }

    return events
      .sort((left, right) => right.at.getTime() - left.at.getTime())
      .slice(0, 24);
  }, [isMyanmar, ledgerQuery.data]);

  const communicationHistory = useMemo<CommunicationThreadEvent[]>(() => {
    if (!ledgerQuery.data) {
      return [];
    }

    const events: CommunicationThreadEvent[] = [];

    for (const delivery of ledgerQuery.data.customerNotifications.announcements) {
      events.push({
        id: `announcement-delivery:${delivery.id}`,
        at: new Date(delivery.sentAt || delivery.createdAt),
        title: delivery.announcement.title,
        detail: delivery.announcement.message,
        tone: delivery.isPinned ? 'warning' : 'default',
        category: 'announcement',
        customerFacing: true,
        meta: [
          isMyanmar ? 'ကြေညာချက်' : 'Announcement',
          delivery.announcement.type,
          delivery.readAt ? `${isMyanmar ? 'ဖတ်ပြီး' : 'Read'} ${formatRelativeTime(delivery.readAt)}` : (isMyanmar ? 'မဖတ်ရသေး' : 'Unread'),
          `${delivery.openCount || 0} ${isMyanmar ? 'ကြိမ် ဖွင့်ထား' : 'opens'}`,
          `${delivery.clickCount || 0} ${isMyanmar ? 'ကြိမ် နှိပ်ထား' : 'clicks'}`,
        ].join(' • '),
      });
    }

    for (const log of ledgerQuery.data.customerNotifications.keyNotices) {
      events.push({
        id: `key-notice:${log.id}`,
        at: new Date(log.sentAt),
        title: log.event,
        detail: log.message,
        tone: log.status === 'FAILED' ? 'danger' : 'warning',
        category: 'key_notice',
        customerFacing: true,
        meta: [log.accessKeyName || (isMyanmar ? 'မချိတ်ထားသော သော့' : 'Unlinked key'), log.status].join(' • '),
      });
    }

    for (const thread of ledgerQuery.data.supportThreads) {
      const latestReply = thread.replies[thread.replies.length - 1];
      const stateLabel = getSupportThreadStateLabel(thread.status, thread.waitingOn);
      const threadHref = withBasePath(`/dashboard/support/threads/${thread.id}`);

      events.push({
        id: `support-thread-thread:${thread.id}`,
        at: new Date(thread.updatedAt || thread.createdAt),
        title: isMyanmar ? `အကူအညီ စကားပြောခန်း ${thread.threadCode}` : `Support thread ${thread.threadCode}`,
        detail: latestReply?.message || thread.subject || (isMyanmar ? 'စကားပြောခန်းကို ဖန်တီးခဲ့သည်' : 'Thread created'),
        tone: getSupportThreadTone(thread.status, thread.waitingOn),
        category: 'support_thread',
        customerFacing: true,
        href: threadHref,
        meta: [
          getSupportThreadCategoryLabel(thread.issueCategory, isMyanmar),
          stateLabel,
          thread.assignedAdminName ? `${isMyanmar ? 'တာဝန်ပေးထားသူ' : 'Assigned'} ${thread.assignedAdminName}` : null,
          latestReply
            ? `${latestReply.senderType === 'ADMIN'
              ? (isMyanmar ? 'နောက်ဆုံး စီမံခန့်ခွဲသူ တုံ့ပြန်ချက်' : 'Latest admin reply')
              : (isMyanmar ? 'နောက်ဆုံး ဖောက်သည် တုံ့ပြန်ချက်' : 'Latest customer reply')} ${formatRelativeTime(latestReply.createdAt)}`
            : null,
        ]
          .filter(Boolean)
          .join(' • ') || undefined,
      });
    }

    for (const order of ledgerQuery.data.telegramOrders) {
      const orderHref = withBasePath(
        `/dashboard/notifications?orderCode=${encodeURIComponent(order.orderCode)}`,
      );
      if (order.status === 'FULFILLED' && order.reviewedAt) {
        events.push({
          id: `order-receipt:${order.id}`,
          at: new Date(order.reviewedAt),
          title: order.kind === 'TRIAL'
              ? (isMyanmar ? 'အခမဲ့စမ်းသုံးခွင့် ပို့ပြီး' : 'Trial delivery')
            : (isMyanmar ? 'ပြေစာ ပို့ပြီး' : 'Receipt delivered'),
          detail: `${order.orderCode} • ${order.planName || order.planCode || (isMyanmar ? 'အော်ဒါ ပြီးဆုံးပြီး' : 'Order fulfilled')}`,
          tone: 'positive',
          category: 'receipt',
          customerFacing: true,
          href: orderHref,
          meta: order.couponCode ? `${isMyanmar ? 'ကူပွန်' : 'Coupon'} ${order.couponCode}` : undefined,
        });
      }
      if (order.refundRequestReviewedAt && order.refundRequestStatus) {
        events.push({
          id: `refund-decision:${order.id}`,
          at: new Date(order.refundRequestReviewedAt),
          title:
            order.refundRequestStatus === 'APPROVED'
              ? (isMyanmar ? 'ငွေပြန်အမ်း ဆုံးဖြတ်ချက် ပို့ပြီး' : 'Refund decision sent')
              : (isMyanmar ? 'ငွေပြန်အမ်း ငြင်းဆိုချက် ပို့ပြီး' : 'Refund decline sent'),
          detail: `${order.orderCode}${order.refundRequestCustomerMessage ? ` • ${order.refundRequestCustomerMessage}` : ''}`,
          tone: order.refundRequestStatus === 'APPROVED' ? 'positive' : 'danger',
          category: 'refund',
          customerFacing: true,
          href: orderHref,
          meta: order.refundReviewReasonCode
            ? resolveRefundReasonPresetLabel(order.refundReviewReasonCode) || order.refundReviewReasonCode
            : undefined,
        });
      }
    }

    for (const note of ledgerQuery.data.supportNotes) {
      events.push({
        id: `support-note-thread:${note.id}`,
        at: new Date(note.createdAt),
        title:
          note.kind === 'DIRECT_MESSAGE'
            ? (isMyanmar ? 'Telegram တိုက်ရိုက်စာ' : 'Direct Telegram message')
            : note.kind === 'OUTAGE_UPDATE'
              ? (isMyanmar ? 'ပြတ်တောက်မှု အသိပေးချက်' : 'Outage update')
            : note.kind === 'RECEIPT_RESENT'
                ? (isMyanmar ? 'ပြေစာကို ထပ်ပို့ခဲ့သည်' : 'Receipt resent')
            : note.kind === 'SHARE_PAGE_RESENT'
                  ? (isMyanmar ? 'မျှဝေစာမျက်နှာကို ထပ်ပို့ခဲ့သည်' : 'Share page resent')
                  : note.kind === 'ANNOUNCEMENT_RESEND'
                    ? (isMyanmar ? 'ကြေညာချက်ကို ထပ်ပို့ခဲ့သည်' : 'Announcement resent')
                    : (isMyanmar ? 'အတွင်းသုံး အကူအညီ မှတ်စု' : 'Internal support note'),
        detail: note.note,
        tone:
          note.kind === 'OUTAGE_UPDATE'
            ? 'warning'
            : note.kind === 'INTERNAL'
              ? 'default'
              : 'positive',
        category:
          note.kind === 'DIRECT_MESSAGE'
            ? 'message'
            : note.kind === 'INTERNAL'
              ? 'support_note'
              : note.kind === 'RECEIPT_RESENT'
                ? 'receipt'
                : note.kind === 'SHARE_PAGE_RESENT'
                  ? 'key_notice'
                  : note.kind === 'ANNOUNCEMENT_RESEND'
                    ? 'announcement'
                    : 'message',
        customerFacing: note.kind !== 'INTERNAL',
        href: note.telegramMediaUrl || undefined,
        meta: [
          note.createdBy?.email ? `${isMyanmar ? 'ရေးသားသူ' : 'By'} ${note.createdBy.email}` : null,
          note.telegramMessageTitle ? `${isMyanmar ? 'ခေါင်းစဉ်' : 'Title'} ${note.telegramMessageTitle}` : null,
          note.telegramCardStyle
            ? `${isMyanmar ? 'ကတ်ပုံစံ' : 'Card'} ${note.telegramCardStyle.toLowerCase()}`
            : null,
          note.telegramMediaKind
            ? `${isMyanmar ? 'မီဒီယာ' : 'Media'} ${note.telegramMediaKind.toLowerCase()}`
            : null,
        ]
          .filter(Boolean)
          .join(' • ') || undefined,
      });
    }

    return events
      .sort((left, right) => right.at.getTime() - left.at.getTime())
      .slice(0, 40);
  }, [isMyanmar, ledgerQuery.data]);

  const promotionAttributionSummary = useMemo(() => {
    if (!ledgerQuery.data) {
      return {
        attributedOrders: 0,
        couponOrders: 0,
        announcementOrders: 0,
      };
    }

    const attributedOrders = ledgerQuery.data.telegramOrders.filter(
      (order) => Boolean(order.promotionAttribution) || Boolean(order.couponCode),
    );
    return {
      attributedOrders: attributedOrders.length,
      couponOrders: attributedOrders.filter((order) => Boolean(order.couponCode)).length,
      announcementOrders: attributedOrders.filter((order) => Boolean(order.promotionAttribution)).length,
    };
  }, [ledgerQuery.data]);

  const filteredCommunicationHistory = useMemo(() => {
    const search = communicationSearch.trim().toLowerCase();
    return communicationHistory.filter((event) => {
      const filterMatch =
        communicationFilter === 'ALL'
          ? true
          : communicationFilter === 'CUSTOMER'
            ? event.customerFacing
            : communicationFilter === 'INTERNAL'
              ? !event.customerFacing
              : event.category === communicationFilter;
      if (!filterMatch) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [event.title, event.detail, event.meta, event.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [communicationFilter, communicationHistory, communicationSearch]);

  useEffect(() => {
    if (!ledgerQuery.data) {
      return;
    }

    setCrmMarketingTags(ledgerQuery.data.marketingTags || '');
  }, [ledgerQuery.data]);

  if (ledgerQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-52 animate-pulse rounded-full bg-muted" />
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-[1.5rem] bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!ledgerQuery.data) {
    return (
      <div className="space-y-4">
        <BackButton href="/dashboard/users" label={isMyanmar ? 'အသုံးပြုသူများထံ ပြန်မည်' : 'Back to users'} />
        <Card>
          <CardHeader>
            <CardTitle>{isMyanmar ? 'ဖောက်သည်ကို မတွေ့ပါ' : 'Customer not found'}</CardTitle>
            <CardDescription>
              {isMyanmar ? 'ဤအသုံးပြုသူ၏ ledger ကို မဖွင့်နိုင်ပါ။' : 'This user ledger could not be loaded.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { user, telegramProfile, summary, accessKeys, dynamicKeys, telegramOrders, couponHistory, couponEligibility, serverChangeRequests, premiumSupportRequests, premiumRoutingAlerts, customerNotifications, supportNotes, supportThreads, financePermissions, crmPermissions } =
    ledgerQuery.data;
  const announcementDeliveries = [...customerNotifications.announcements].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }
    if (Boolean(left.readAt) !== Boolean(right.readAt)) {
      return left.readAt ? 1 : -1;
    }
    return new Date(right.sentAt || right.createdAt).getTime() - new Date(left.sentAt || left.createdAt).getTime();
  });
  type SupportNoteItem = (typeof supportNotes)[number];
  type SupportThreadItem = (typeof supportThreads)[number];
  type KeyNoticeItem = (typeof customerNotifications.keyNotices)[number];
  type ServerChangeRequestItem = (typeof serverChangeRequests)[number];
  type PremiumSupportRequestItem = (typeof premiumSupportRequests)[number];
  type PremiumRoutingAlertItem = (typeof premiumRoutingAlerts)[number];
  type AccessKeyItem = (typeof accessKeys)[number];
  type DynamicKeyItem = (typeof dynamicKeys)[number];
  type CouponHistoryItem = (typeof couponHistory)[number];
  type CouponEligibilityItem = (typeof couponEligibility)[number];
  const openSupportThreadCount = supportThreads.filter((thread) => thread.status !== 'HANDLED').length;
  const waitingOnCustomerCount = supportThreads.filter(
    (thread) => thread.status !== 'HANDLED' && (thread.waitingOn || '').toUpperCase() === 'USER',
  ).length;
  const unreadAnnouncementCount = announcementDeliveries.filter((delivery) => !delivery.readAt).length;
  const pinnedAnnouncementCount = announcementDeliveries.filter((delivery) => delivery.isPinned).length;
  const directIdentityLabel = telegramProfile?.username
    ? `@${telegramProfile.username}`
    : telegramProfile?.telegramChatId || user.telegramChatId || (isMyanmar ? 'မချိတ်ထားပါ' : 'Not linked');
  const latestDeliveredOrder = telegramOrders
    .filter((order) => order.status === 'FULFILLED' && order.reviewedAt)
    .sort((left, right) => new Date(right.reviewedAt || right.createdAt).getTime() - new Date(left.reviewedAt || left.createdAt).getTime())[0] || null;

  return (
    <div className="space-y-6" data-testid="customer-crm-detail-page">
      <DetailHero data-testid="customer-crm-detail-hero">
        <DetailHeroGrid>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BackButton href="/dashboard/users" label={isMyanmar ? 'နောက်သို့' : 'Back'} />
                <Badge
                  variant="outline"
                  className="ops-pill border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
                >
                  <Wallet className="mr-2 h-3.5 w-3.5" />
                {isMyanmar ? 'ဖောက်သည် စီမံခန့်ခွဲမှု' : 'Customer CRM'}
                </Badge>
              </div>

              <Button variant="outline" className="rounded-full" onClick={() => ledgerQuery.refetch()} disabled={ledgerQuery.isFetching}>
                {ledgerQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {isMyanmar ? 'ပြန်လည်ဖွင့်မည်' : 'Refresh'}
              </Button>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{user.email}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
                {isMyanmar
                  ? 'ဤဖောက်သည်၏ သော့များ၊ Telegram အော်ဒါများ၊ ငွေပြန်အမ်းမှုများ၊ ပြေစာများ၊ ကြေညာချက်များ၊ အကူအညီ တောင်းဆိုမှုများနှင့် ဆာဗာပြောင်းလဲမှု မှတ်တမ်းကို တစ်နေရာတည်းမှ စီမံနိုင်သည်။'
                  : 'Review keys, Telegram orders, refunds, receipts, announcements, support requests, and server-change history for this customer from one place.'}
              </p>
            </div>

            <DetailMetricGrid>
              <DetailKpiTile
                label={isMyanmar ? 'လက်ရှိအသုံးပြုနေသော သော့များ' : 'Active keys'}
                value={summary.activeAccessKeys + summary.activeDynamicKeys}
                meta={
                  isMyanmar
                    ? `${summary.activeAccessKeys} သာမန် • ${summary.activeDynamicKeys} ပရီမီယံ အလှုပ်ရှားသော သော့`
                    : `${summary.activeAccessKeys} standard • ${summary.activeDynamicKeys} premium dynamic`
                }
                valueClassName="text-3xl tracking-tight"
              />
              <DetailKpiTile
                label={isMyanmar ? 'ငွေပေးချေပြီး ဝယ်ယူမှုများ' : 'Paid purchases'}
                value={summary.fulfilledPaidOrders}
                meta={
                  isMyanmar
                    ? 'ငွေပေးချေပြီး အပြီးသတ် ဝယ်ယူမှု ၃ ခုကျော်ပြီးမှ ငွေပြန်အမ်းမှုကို ဖွင့်နိုင်သည်။'
                    : 'Refund unlocks after more than 3 fulfilled paid purchases.'
                }
                valueClassName="text-3xl tracking-tight"
              />
              <DetailKpiTile
                label={isMyanmar ? 'စုစုပေါင်း ဝင်ငွေ' : 'Gross revenue'}
                value={revenueSummary}
                meta={
                  isMyanmar
                    ? 'ဤဖောက်သည်၏ အပြီးသတ် Telegram order စုစုပေါင်းတန်ဖိုး'
                    : 'Total fulfilled Telegram order value for this customer.'
                }
                valueClassName="tracking-tight"
              />
              <DetailKpiTile
                label={isMyanmar ? 'ယခု ငွေပြန်အမ်းပေးနိုင်သည့် အရေအတွက်' : 'Refundable now'}
                value={summary.refundEligibleCount}
                meta={
                  isMyanmar
                    ? `အသုံးပြုမှု 5 GB ကျော်သွားပါက ငွေပြန်အမ်းမှုကို အလိုအလျောက် ပိတ်မည်။ ငွေပြန်ထားပြီး: ${refundedSummary}`
                    : `Refund closes automatically above 5 GB usage. Refunded: ${refundedSummary}`
                }
                valueClassName="text-3xl tracking-tight"
              />
            </DetailMetricGrid>
            {!financePermissions.canManage ? (
              <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {isMyanmar
                  ? 'ဤစာရင်းကို ကြည့်နိုင်သော်လည်း ငွေကြေးခွင့်ပြုချက်ရှိသော စီမံခန့်ခွဲသူများသာ အော်ဒါများကို အတည်ပြု၊ ငွေပြန်အမ်း သို့မဟုတ် ခရက်ဒစ် ထည့်နိုင်သည်။'
                  : 'You can view the ledger, but only finance-authorized admins can verify, refund, or credit orders.'}
              </div>
            ) : null}
          </div>

          <DetailHeroAside
            title={isMyanmar ? 'ဖောက်သည် အခြေအနေ' : 'Customer state'}
            description={
              isMyanmar
                ? 'ဖောက်သည် စီမံလုပ်ဆောင်မှုများကို ဆက်လုပ်နေစဉ် ဖောက်သည်၏ ဆက်သွယ်ရေးလမ်းကြောင်း၊ အကူအညီ ဝန်အားနှင့် နောက်ဆုံးပို့ဆောင်မှုအခြေအနေကို မြင်နိုင်အောင် ထားပါ။'
                : 'Keep the customer’s contact channel, support load, and recent delivery status visible while you work through CRM actions.'
            }
          >
            <DetailMiniTileGrid>
              <DetailMiniTile
                label={isMyanmar ? 'Telegram အထောက်အထား' : 'Telegram identity'}
                value={directIdentityLabel}
                meta={
                  telegramProfile?.locale
                    ? isMyanmar
                    ? `အသုံးပြုနေသော ဘာသာစကား ${telegramProfile.locale}`
                      : `Locale ${telegramProfile.locale}`
                    : isMyanmar
                      ? 'အသုံးပြုနေသော ဘာသာစကား မသတ်မှတ်ရသေးပါ'
                      : 'Locale not set'
                }
              />
              <DetailMiniTile
                label={isMyanmar ? 'အကူအညီ ဝန်အား' : 'Support load'}
                value={
                  isMyanmar
                    ? `ဖွင့်ထားသော စကားပြောခန်း ${openSupportThreadCount} ခု`
                    : `${openSupportThreadCount} open thread${openSupportThreadCount === 1 ? '' : 's'}`
                }
                meta={
                  isMyanmar
                    ? `ဖောက်သည်ထံမှ စောင့်နေ ${waitingOnCustomerCount} ခု • ပရီမီယံ အကူအညီ တောင်းဆိုမှု ${premiumSupportRequests.length} ခု`
                    : `${waitingOnCustomerCount} waiting for customer • ${premiumSupportRequests.length} premium support request${premiumSupportRequests.length === 1 ? '' : 's'}`
                }
              />
              <DetailMiniTile
                label={isMyanmar ? 'စာဝင်ပုံး ပို့ဆောင်မှု' : 'Inbox delivery'}
                value={
                  isMyanmar
                    ? `မဖတ်ရသေးသော ကြေညာချက် ${unreadAnnouncementCount} ခု`
                    : `${unreadAnnouncementCount} unread announcement${unreadAnnouncementCount === 1 ? '' : 's'}`
                }
                meta={
                  isMyanmar
                    ? `ပင်ထားသည် ${pinnedAnnouncementCount} ခု • ဖွင့်ကြည့်မှု ${customerNotifications.summary.openCount} ကြိမ် • နှိပ်မှု ${customerNotifications.summary.clickCount} ကြိမ်`
                    : `${pinnedAnnouncementCount} pinned • ${customerNotifications.summary.openCount} opens • ${customerNotifications.summary.clickCount} clicks`
                }
              />
              <DetailMiniTile
                label={isMyanmar ? 'နောက်ဆုံး ပို့ဆောင်မှုပြီးသော အော်ဒါ' : 'Latest fulfillment'}
                value={latestDeliveredOrder ? latestDeliveredOrder.orderCode : isMyanmar ? 'ပို့ဆောင်မှုပြီးသော အော်ဒါ မရှိသေးပါ' : 'No fulfilled order'}
                meta={
                  latestDeliveredOrder?.reviewedAt
                    ? formatRelativeTime(latestDeliveredOrder.reviewedAt)
                    : isMyanmar
                      ? 'ပြေစာ မပို့ရသေးပါ'
                      : 'No receipt delivered yet'
                }
              />
            </DetailMiniTileGrid>
          </DetailHeroAside>
        </DetailHeroGrid>
      </DetailHero>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="space-y-6">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BadgeDollarSign className="h-5 w-5 text-primary" />
                {isMyanmar ? 'ငွေပေးချေမှုနှင့် စာရင်းညှိနှိုင်းမှု' : 'Billing and reconciliation'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'ဝယ်ယူမှုအရေအတွက်နှင့် အသုံးပြုမှု မူဝါဒက ခွင့်ပြုမှသာ ငွေပေးချေမှု စစ်ဆေးခြင်း၊ ခရက်ဒစ် ထည့်ခြင်းနှင့် ပြန်အမ်းငွေ လုပ်ဆောင်ခြင်းများကို ဆောင်ရွက်ပါ။'
                  : 'Verify payments, apply credits, and issue refunds only when the purchase-count and usage policy allows it.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {telegramOrders.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  {isMyanmar ? 'ဤဖောက်သည်နှင့် ချိတ်ထားသော Telegram အော်ဒါ မရှိသေးပါ။' : 'No Telegram orders are linked to this customer yet.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {telegramOrders.map((order) => {
                    const latestFinanceAction = order.financeActions[0] || null;
                    const orderHref = withBasePath(
                      `/dashboard/notifications?orderCode=${encodeURIComponent(order.orderCode)}`,
                    );
                    const receiptHtmlUrl = withBasePath(
                      `/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=receipt&format=html`,
                    );
                    const receiptPdfUrl = withBasePath(
                      `/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=receipt&format=pdf`,
                    );
                    const refundHtmlUrl = withBasePath(
                      `/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=refund&format=html`,
                    );
                    const refundPdfUrl = withBasePath(
                      `/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=refund&format=pdf`,
                    );

                    return (
                      <div
                        key={order.id}
                        className="rounded-[1.2rem] border border-border/60 bg-background/45 p-4 dark:bg-white/[0.03]"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{order.orderCode}</p>
                              <Badge variant="secondary">{order.kind}</Badge>
                              <Badge variant="outline">{order.status}</Badge>
                              <FinanceStatusBadge status={order.financeStatus} />
                              {order.refundEligible ? (
                                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                                  {isMyanmar ? 'ပြန်အမ်းငွေ ခွင့်ပြုသည်' : 'Refund eligible'}
                                </Badge>
                              ) : null}
                              {order.refundRequestStatus ? (
                                <Badge variant="outline">
                                  {isMyanmar ? 'ပြန်အမ်းငွေ တောင်းဆိုမှု' : 'Refund request'}: {order.refundRequestStatus}
                                </Badge>
                              ) : null}
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p>
                                  <span className="font-medium text-foreground">{isMyanmar ? 'အစီအစဉ်:' : 'Plan:'}</span>{' '}
                                  {order.planName || order.planCode || '—'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">{isMyanmar ? 'ငွေပမာဏ:' : 'Amount:'}</span>{' '}
                                  {formatMoney(order.priceAmount, order.priceCurrency)}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">{isMyanmar ? 'ပို့ဆောင်ပြီးသော သော့ အသုံးပြုမှု:' : 'Usage on delivered key:'}</span>{' '}
                                  {formatBytes(BigInt(order.usedBytes || '0'))}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">{isMyanmar ? 'ဤ Telegram အသုံးပြုသူ၏ ငွေပေးပြီးသော ဝယ်ယူမှုများ:' : 'Paid purchases for this Telegram user:'}</span>{' '}
                                  {order.fulfilledPaidPurchaseCount}
                                </p>
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p>
                                  <span className="font-medium text-foreground">{isMyanmar ? 'ဖန်တီးချိန်:' : 'Created:'}</span>{' '}
                                  {formatDateTime(order.createdAt)}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">{isMyanmar ? 'စစ်ဆေးချိန်:' : 'Reviewed:'}</span>{' '}
                                  {order.reviewedAt ? formatDateTime(order.reviewedAt) : '—'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">{isMyanmar ? 'စစ်ဆေးသူ:' : 'Reviewer:'}</span>{' '}
                                  {order.reviewedBy?.email || '—'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">{isMyanmar ? 'ငွေကြေးပိုင်း အပ်ဒိတ်:' : 'Finance updated:'}</span>{' '}
                                  {order.financeUpdatedAt ? formatRelativeTime(order.financeUpdatedAt) : isMyanmar ? 'မရှိသေးပါ' : 'Never'}
                                </p>
                              </div>
                            </div>

                            {!order.refundEligible && order.refundBlockedReason ? (
                              <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                                <span className="font-medium">{isMyanmar ? 'ပြန်အမ်းငွေ ပိတ်ထားသည်:' : 'Refund blocked:'}</span> {order.refundBlockedReason}
                              </div>
                            ) : null}

                            {order.refundRequestStatus === 'PENDING' ? (
                              <div className="rounded-[1rem] border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
                                <span className="font-medium">{isMyanmar ? 'ပြန်အမ်းငွေ တောင်းဆိုထားသည်:' : 'Refund requested:'}</span>{' '}
                                {order.refundRequestedAt ? formatDateTime(order.refundRequestedAt) : isMyanmar ? 'စစ်ဆေးနေဆဲ' : 'Pending review'}
                                {order.refundRequestMessage ? ` • ${order.refundRequestMessage}` : ''}
                              </div>
                            ) : null}

                            {order.refundRequestStatus && order.refundRequestStatus !== 'PENDING' ? (
                              <div className="rounded-[1rem] border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground dark:bg-white/[0.03]">
                                <span className="font-medium text-foreground">{isMyanmar ? 'ပြန်အမ်းငွေ စစ်ဆေးမှု:' : 'Refund review:'}</span>{' '}
                                {order.refundRequestStatus}
                                {order.refundRequestReviewedAt ? ` • ${formatDateTime(order.refundRequestReviewedAt)}` : ''}
                                {order.refundReviewReasonCode
                                  ? ` • ${resolveRefundReasonPresetLabel(order.refundReviewReasonCode) || order.refundReviewReasonCode}`
                                  : ''}
                                {order.refundRequestCustomerMessage ? ` • ${order.refundRequestCustomerMessage}` : ''}
                              </div>
                            ) : null}

                            {latestFinanceAction ? (
                              <div className="rounded-[1rem] border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground dark:bg-white/[0.03]">
                                <span className="font-medium text-foreground">{isMyanmar ? 'နောက်ဆုံး ငွေကြေးပိုင်း လုပ်ဆောင်ချက်:' : 'Latest finance action:'}</span>{' '}
                                {latestFinanceAction.actionType} •{' '}
                                {latestFinanceAction.createdBy?.email || (isMyanmar ? 'မသိရသော စစ်ဆေးသူ' : 'Unknown reviewer')} •{' '}
                                {formatRelativeTime(latestFinanceAction.createdAt)}
                                {latestFinanceAction.note ? ` • ${latestFinanceAction.note}` : ''}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-col gap-2 lg:w-[220px]">
                            <Button asChild variant="outline" size="sm">
                              <Link href={orderHref}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {isMyanmar ? 'အော်ဒါ စာမျက်နှာ ဖွင့်မည်' : 'Open order'}
                              </Link>
                            </Button>
                            {order.status === 'FULFILLED' ? (
                              <>
                                <Button asChild variant="outline" size="sm">
                                  <Link href={receiptHtmlUrl} target="_blank">
                                    {isMyanmar ? 'ငွေလက်ခံပြေစာကို ကြည့်မည်' : 'Printable receipt'}
                                  </Link>
                                </Button>
                                <Button asChild variant="outline" size="sm">
                                  <Link href={receiptPdfUrl} target="_blank">
                                    {isMyanmar ? 'ပြေစာ PDF ကို ဒေါင်းလုဒ်လုပ်မည်' : 'Download receipt PDF'}
                                  </Link>
                                </Button>
                              </>
                            ) : null}
                            {order.financeStatus === 'REFUNDED' || order.refundRequestStatus === 'APPROVED' ? (
                              <>
                                <Button asChild variant="outline" size="sm">
                                  <Link href={refundHtmlUrl} target="_blank">
                                    {isMyanmar ? 'ငွေပြန်အမ်းစာရွက်ကို ကြည့်မည်' : 'Printable refund'}
                                  </Link>
                                </Button>
                                <Button asChild variant="outline" size="sm">
                                  <Link href={refundPdfUrl} target="_blank">
                                    {isMyanmar ? 'ငွေပြန်အမ်း PDF ကို ဒေါင်းလုဒ်လုပ်မည်' : 'Download refund PDF'}
                                  </Link>
                                </Button>
                              </>
                            ) : null}
                            {order.financeStatus === 'OPEN' ? (
                              <Button
                                size="sm"
                                disabled={!financePermissions.canManage}
                                onClick={() =>
                                  setFinanceDialog({
                                    orderId: order.id,
                                    orderCode: order.orderCode,
                                    action: 'VERIFY',
                                    defaultAmount: order.priceAmount,
                                    currency: order.priceCurrency,
                                  })
                                }
                              >
                                {isMyanmar ? 'ငွေပေးချေမှုကို စစ်မည်' : 'Verify payment'}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!financePermissions.canManage}
                              onClick={() =>
                                setFinanceDialog({
                                  orderId: order.id,
                                  orderCode: order.orderCode,
                                  action: 'CREDIT',
                                  defaultAmount: order.priceAmount,
                                  currency: order.priceCurrency,
                                })
                              }
                            >
                              {isMyanmar ? 'ခရက်ဒစ် ထည့်မည်' : 'Apply credit'}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!financePermissions.canManage || !order.refundEligible}
                              onClick={() =>
                                setFinanceDialog({
                                  orderId: order.id,
                                  orderCode: order.orderCode,
                                  action: 'REFUND',
                                  defaultAmount: order.priceAmount,
                                  currency: order.priceCurrency,
                                })
                              }
                            >
                              {isMyanmar ? 'ပြန်အမ်းငွေ လုပ်မည်' : 'Refund'}
                            </Button>
                            {order.refundRequestStatus === 'PENDING' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={!financePermissions.canManage || reviewRefundRequestMutation.isPending}
                                  onClick={() =>
                                    reviewRefundRequestMutation.mutate({
                                      orderId: order.id,
                                      action: 'APPROVE',
                                      reasonPresetCode: 'approved_policy_eligible',
                                    })
                                  }
                                >
                                  {isMyanmar ? 'တောင်းဆိုမှုကို အတည်ပြုမည်' : 'Approve request'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!financePermissions.canManage || reviewRefundRequestMutation.isPending}
                                  onClick={() =>
                                    reviewRefundRequestMutation.mutate({
                                      orderId: order.id,
                                      action: 'REJECT',
                                      reasonPresetCode: 'reject_manual_review',
                                    })
                                  }
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  {isMyanmar ? 'တောင်းဆိုမှုကို ငြင်းမည်' : 'Decline request'}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                {isMyanmar ? 'ပရိုမိုးရှင်းနှင့် ကူပွန်များ' : 'Promotions and coupons'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'ဤဖောက်သည်အတွက် ကူပွန်မှတ်တမ်း၊ ကိုယ်တိုင် စီမံသည့် ကူပွန်ထိန်းချုပ်မှုများနှင့် နောက်ဆုံး ပရိုမိုးရှင်း attribution ကို ပြပါသည်။'
                  : 'Coupon history, manual coupon controls, and the latest promo attribution for this customer.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ချိတ်ဆက်ထားသော အော်ဒါများ' : 'Attributed orders'}</p>
                  <p className="mt-2 text-2xl font-semibold">{promotionAttributionSummary.attributedOrders}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'ကူပွန် သို့မဟုတ် ပရိုမိုးရှင်း ထိတွေ့ချိတ်ဆက်မှု ပါသော အော်ဒါများ။' : 'Orders with coupon or promo-touch attribution.'}</p>
                </div>
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ကူပွန်သုံး အော်ဒါများ' : 'Coupon orders'}</p>
                  <p className="mt-2 text-2xl font-semibold">{promotionAttributionSummary.couponOrders}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'အသုံးပြုထားသော ကူပွန်ကုဒ် ပါသည့် အော်ဒါများ။' : 'Orders that carried an applied coupon code.'}</p>
                </div>
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ပရိုမိုးရှင်း ထိတွေ့မှုများ' : 'Promo touchpoints'}</p>
                  <p className="mt-2 text-2xl font-semibold">{promotionAttributionSummary.announcementOrders}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'မကြာသေးမီက ပရိုမိုးရှင်း ကြေညာချက်နှင့် ကိုက်ညီသော အော်ဒါများ။' : 'Orders matched to a recent promo announcement.'}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'ကမ်ပိန်း ရရှိနိုင်မှု' : 'Campaign eligibility'}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {couponEligibility.map((campaign: CouponEligibilityItem) => (
                    <div
                      key={campaign.campaignType}
                      className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{campaign.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {isMyanmar ? 'ကျန်ရှိသေးသော အသုံးပြုခွင့်' : 'Remaining eligibility'} {campaign.remainingUses}/{campaign.maxUsesPerUser}
                            {campaign.cooldownUntil
                              ? isMyanmar
                                ? ` • စောင့်ဆိုင်းကာလ ပြီးဆုံးချိန် ${formatDateTime(campaign.cooldownUntil)}`
                                : ` • cooldown until ${formatDateTime(campaign.cooldownUntil)}`
                              : ''}
                          </p>
                        </div>
                        <CouponLifecycleBadge
                          status={
                            campaign.overrideMode === 'FORCE_ALLOW'
                              ? 'MANUAL_ALLOW'
                              : campaign.blockedReason
                              ? campaign.blockedReason
                              : campaign.eligibleNow
                                ? 'ELIGIBLE'
                                : 'LIMIT_REACHED'
                          }
                        />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        <div className="rounded-xl border border-border/50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {isMyanmar ? 'အသုံးပြုနိုင်ဆဲ' : 'Active'}
                          </p>
                          <p className="mt-2 text-lg font-semibold">{campaign.activeCoupons}</p>
                        </div>
                        <div className="rounded-xl border border-border/50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {isMyanmar ? 'အသုံးပြုပြီး' : 'Redeemed'}
                          </p>
                          <p className="mt-2 text-lg font-semibold">{campaign.redeemedCoupons}</p>
                        </div>
                        <div className="rounded-xl border border-border/50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {isMyanmar ? 'သက်တမ်းကုန်' : 'Expired'}
                          </p>
                          <p className="mt-2 text-lg font-semibold">{campaign.expiredCoupons}</p>
                        </div>
                        <div className="rounded-xl border border-border/50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {isMyanmar ? 'ရုပ်သိမ်း' : 'Revoked'}
                          </p>
                          <p className="mt-2 text-lg font-semibold">{campaign.revokedCoupons}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {!campaign.enabled
                          ? isMyanmar
                            ? 'ဤကမ်ပိန်းကို Telegram အရောင်းဆက်တင်များတွင် ပိတ်ထားသည်။'
                            : 'This campaign is disabled in Telegram sales settings.'
                          : campaign.paused
                            ? isMyanmar
                              ? 'ဤကမ်ပိန်းကို ယာယီရပ်ထားပြီး ကူပွန်အသစ် မထုတ်ပေးပါ။'
                              : 'This campaign is paused and will not issue new coupons.'
                            : campaign.blockedReason === 'MANUAL_BLOCK'
                              ? isMyanmar
                                ? 'ဤဖောက်သည်အတွက် ဤကမ်ပိန်းကို ကိုယ်တိုင် တားဆီးထားသည်။'
                                : 'This campaign is manually suppressed for this customer.'
                              : campaign.blockedReason === 'ACTIVE_COUPON'
                                ? isMyanmar
                                  ? 'ဤဖောက်သည်တွင် ဤကမ်ပိန်းအတွက် အသုံးပြုနိုင်ဆဲ ကူပွန် ရှိပြီးဖြစ်သည်။'
                                  : 'This customer already has an active coupon for this campaign.'
                                : campaign.overrideMode === 'FORCE_ALLOW'
                                  ? isMyanmar
                                    ? 'ပုံမှန် ပရိုမိုးရှင်း စည်းမျဉ်းများက တားဆီးသော်လည်း ဤဖောက်သည်ကို ဤကမ်ပိန်း ရရှိရန် ကိုယ်တိုင် ခွင့်ပြုထားသည်။'
                                    : 'This customer is manually allowed to receive this campaign even when automatic promo rules would normally block it.'
                                  : campaign.blockedReason === 'CONVERTED'
                                    ? isMyanmar
                                      ? 'ဤဖောက်သည်သည် ဝယ်ယူပြီးဖြစ်သဖြင့် ဤကမ်ပိန်းကို အလိုအလျောက် ရပ်ထားသည်။'
                                      : 'This customer already converted, so this campaign stops automatically.'
                                    : campaign.blockedReason === 'COOLDOWN'
                                      ? isMyanmar
                                        ? 'ဤဖောက်သည်သည် ပရိုမိုးရှင်း စောင့်ဆိုင်းကာလအတွင်း ရှိနေသည်။'
                                        : 'This customer is inside the promo cool-down window.'
                                      : campaign.blockedReason === 'RECENT_REFUND'
                                        ? isMyanmar
                                          ? 'မကြာသေးမီက ပြန်အမ်းငွေ လုပ်ဆောင်မှုကြောင့် ဤဖောက်သည်အတွက် ပရိုမိုးရှင်း အသစ်များကို တားဆီးထားသည်။'
                                          : 'Recent refund activity blocks new promos for this customer.'
                                        : campaign.blockedReason === 'SUPPORT_HEAVY'
                                          ? isMyanmar
                                            ? 'မကြာသေးမီက အကူအညီ တောင်းဆိုမှုများ များနေသောကြောင့် ဤဖောက်သည်အတွက် ပရိုမိုးရှင်း အသစ်များကို တားဆီးထားသည်။'
                                            : 'Recent support volume blocks new promos for this customer.'
                                          : campaign.blockedReason === 'LIMIT_REACHED'
                                            ? isMyanmar
                                              ? 'ဤဖောက်သည်သည် ဤကမ်ပိန်းအတွက် ကူပွန် အများဆုံး အသုံးပြုခွင့်ကို ပြည့်သွားပြီ။'
                                              : 'This customer already used the maximum number of coupons for this campaign.'
                                            : isMyanmar
                                              ? 'ကိုက်ညီသော ကမ်ပိန်း အုပ်စုထဲ ဝင်ပါက ဤဖောက်သည်သည် ဤပရိုမိုးရှင်းကို ရနိုင်သည်။'
                                              : 'This customer can receive this promo if they enter the matching campaign segment.'}
                      </p>
                      {campaign.overrideMode ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {isMyanmar ? 'ကိုယ်တိုင် သတ်မှတ်ချက်:' : 'Manual override:'} {campaign.overrideMode === 'FORCE_ALLOW' ? (isMyanmar ? 'အတင်းအကျပ် ခွင့်ပြု' : 'Force allow') : (isMyanmar ? 'တားဆီး' : 'Suppress')}
                          {campaign.overrideUpdatedByEmail ? isMyanmar ? ` • ${campaign.overrideUpdatedByEmail} က ပြင်ဆင်သည်` : ` by ${campaign.overrideUpdatedByEmail}` : ''}
                          {campaign.overrideUpdatedAt ? ` • ${formatRelativeTime(campaign.overrideUpdatedAt)}` : ''}
                          {campaign.overrideNote ? ` • ${campaign.overrideNote}` : ''}
                        </p>
                      ) : null}
                      {crmPermissions.canManagePromoOverrides ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={campaign.overrideMode === 'FORCE_ALLOW' ? 'default' : 'outline'}
                            disabled={updatePromoEligibilityOverrideMutation.isPending}
                            onClick={() =>
                              updatePromoEligibilityOverrideMutation.mutate({
                                userId,
                                campaignType: campaign.campaignType,
                                mode: 'FORCE_ALLOW',
                              })
                            }
                          >
                            {isMyanmar ? 'အတင်းအကျပ် ခွင့်ပြု' : 'Force allow'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={campaign.overrideMode === 'FORCE_BLOCK' ? 'destructive' : 'outline'}
                            disabled={updatePromoEligibilityOverrideMutation.isPending}
                            onClick={() =>
                              updatePromoEligibilityOverrideMutation.mutate({
                                userId,
                                campaignType: campaign.campaignType,
                                mode: 'FORCE_BLOCK',
                              })
                            }
                          >
                            {isMyanmar ? 'တားဆီး' : 'Suppress'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={updatePromoEligibilityOverrideMutation.isPending || !campaign.overrideMode}
                            onClick={() =>
                              updatePromoEligibilityOverrideMutation.mutate({
                                userId,
                                campaignType: campaign.campaignType,
                                mode: 'DEFAULT',
                              })
                            }
                          >
                            {isMyanmar ? 'မူရင်း စည်းမျဉ်းသို့ ပြန်မည်' : 'Use rules'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'ကူပွန် မှတ်တမ်း' : 'Coupon history'}</p>
                {couponHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'ဤဖောက်သည်အတွက် ကူပွန်မှတ်တမ်း မရှိသေးပါ။' : 'No coupon history for this customer yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {couponHistory.map((coupon: CouponHistoryItem) => (
                      <div key={coupon.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{coupon.couponCode}</p>
                              <Badge variant="outline">{coupon.campaignType}</Badge>
                              <CouponLifecycleBadge status={coupon.status as 'ISSUED' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED'} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {coupon.couponDiscountLabel || formatMoney(coupon.couponDiscountAmount, coupon.currency)} • {isMyanmar ? 'တစ်ဦးချင်း ကန့်သတ်ချက်' : 'per-user limit'} {coupon.maxUsesPerUser} • {isMyanmar ? 'ဝယ်ယူပြီးနောက် ရပ်မည်' : 'stop after conversion'} {coupon.stopAfterConversion ? (isMyanmar ? 'ဟုတ်သည်' : 'yes') : (isMyanmar ? 'မဟုတ်ပါ' : 'no')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isMyanmar ? 'ထုတ်ပေးချိန်' : 'Issued'} {formatRelativeTime(coupon.issuedAt)}
                              {coupon.expiresAt ? isMyanmar ? ` • သက်တမ်းကုန်ချိန် ${formatRelativeTime(coupon.expiresAt)}` : ` • expires ${formatRelativeTime(coupon.expiresAt)}` : ''}
                              {coupon.redeemedOrderCode ? isMyanmar ? ` • ${coupon.redeemedOrderCode} တွင် အသုံးပြုခဲ့သည်` : ` • redeemed on ${coupon.redeemedOrderCode}` : ''}
                            </p>
                            {coupon.statusUpdatedReason ? (
                              <p className="text-xs text-muted-foreground">{isMyanmar ? 'အကြောင်းရင်း' : 'Reason'}: {coupon.statusUpdatedReason}</p>
                            ) : null}
                          </div>
                          {coupon.status === 'ISSUED' ? (
                            <div className="flex flex-col gap-2 md:w-[180px]">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!crmPermissions.canManageCoupons || updateCouponStatusMutation.isPending}
                                onClick={() =>
                                  updateCouponStatusMutation.mutate({
                                    couponId: coupon.id,
                                    action: 'EXPIRE',
                                    reason: 'Expired from CRM',
                                  })
                                }
                              >
                                {isMyanmar ? 'ကူပွန် သက်တမ်းကုန်စေမည်' : 'Expire coupon'}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={!crmPermissions.canManageCoupons || updateCouponStatusMutation.isPending}
                                onClick={() =>
                                  updateCouponStatusMutation.mutate({
                                    couponId: coupon.id,
                                    action: 'REVOKE',
                                    reason: 'Revoked from CRM',
                                  })
                                }
                              >
                                {isMyanmar ? 'ကူပွန် ရုပ်သိမ်းမည်' : 'Revoke coupon'}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'အော်ဒါအလိုက် ပရိုမိုးရှင်း ချိတ်ဆက်မှု' : 'Promotion attribution by order'}</p>
                {telegramOrders.filter((order) => order.promotionAttribution || order.couponCode).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'ပရိုမိုးရှင်းနှင့် ချိတ်ထားသော အော်ဒါ မရှိသေးပါ။' : 'No attributed orders yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {telegramOrders
                      .filter((order) => order.promotionAttribution || order.couponCode)
                      .slice(0, 8)
                      .map((order) => (
                        <div key={`promo-order:${order.id}`} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{order.orderCode}</p>
                            <Badge variant="outline">{order.status}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {order.planName || order.planCode || 'Order'} • {formatMoney(order.priceAmount, order.priceCurrency)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {order.couponCode ? <Badge variant="secondary">{isMyanmar ? 'ကူပွန်' : 'Coupon'}: {order.couponCode}</Badge> : null}
                            {order.promotionAttribution?.templateName ? (
                              <Badge variant="secondary">{isMyanmar ? 'တမ်းပလိတ်' : 'Template'}: {order.promotionAttribution.templateName}</Badge>
                            ) : null}
                            {order.promotionAttribution?.targetSegment ? (
                              <Badge variant="secondary">{isMyanmar ? 'အုပ်စု' : 'Segment'}: {order.promotionAttribution.targetSegment}</Badge>
                            ) : null}
                          </div>
                          {order.promotionAttribution ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {isMyanmar
                                ? `“${order.promotionAttribution.announcementTitle}” မှ စတင်ခဲ့သည် • ${order.promotionAttribution.audience} • ပို့ပြီး ${order.promotionAttribution.minutesFromSend} မိနစ်အကြာ`
                                : `Triggered by “${order.promotionAttribution.announcementTitle}” • ${order.promotionAttribution.audience} • ${order.promotionAttribution.minutesFromSend} min after send`}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {isMyanmar
                                ? 'ကူပွန် ချိတ်ဆက်မှုသာ တွေ့ရသည်။ မကြာသေးမီ ပို့ထားသည့် ပရိုမိုးရှင်း ကြေညာချက်တွင် ကိုက်ညီသည့် အရာမတွေ့ပါ။'
                                : 'Coupon attribution only. No matching promo announcement was found in the recent send window.'}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                {isMyanmar ? 'ဆက်သွယ်မှု မှတ်တမ်း အချည်' : 'Communication thread'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'အကူအညီ မှတ်စုများ၊ Telegram အကူအညီ စကားပြောခန်းများ၊ တိုက်ရိုက်စာများ၊ ကြေညာချက်များ၊ ပြေစာများ၊ ငွေပြန်အမ်း ဆုံးဖြတ်ချက်များနှင့် သော့ အသိပေးချက်များကို အချိန်လိုင်း တစ်ခုတည်းတွင် စုစည်းထားသည်။'
                  : 'One thread for support notes, Telegram support threads, direct messages, announcements, receipts, refund decisions, and key notices.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_220px]">
                <Input
                  value={communicationSearch}
                  onChange={(event) => setCommunicationSearch(event.target.value)}
                  placeholder={isMyanmar ? 'စာများ၊ ကြေညာချက်များ၊ ပြေစာများ၊ မှတ်စုများ သို့မဟုတ် နောက်ခံအချက်အလက်ကို ရှာမည်…' : 'Search messages, announcements, receipts, notes, or meta…'}
                />
                <Select
                  value={communicationFilter}
                  onValueChange={(value) =>
                    setCommunicationFilter(
                      value as 'ALL' | 'CUSTOMER' | 'INTERNAL' | CommunicationThreadEvent['category'],
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{isMyanmar ? 'လုပ်ဆောင်ချက် အားလုံး' : 'All activity'}</SelectItem>
                    <SelectItem value="CUSTOMER">{isMyanmar ? 'ဖောက်သည်မြင်ရ' : 'Customer-facing'}</SelectItem>
                    <SelectItem value="INTERNAL">{isMyanmar ? 'အတွင်းသုံးသာ' : 'Internal only'}</SelectItem>
                    <SelectItem value="announcement">{isMyanmar ? 'ကြေညာချက်များ' : 'Announcements'}</SelectItem>
                    <SelectItem value="message">{isMyanmar ? 'တိုက်ရိုက်စာများ' : 'Direct messages'}</SelectItem>
                    <SelectItem value="support_thread">{isMyanmar ? 'အကူအညီ စကားပြောခန်းများ' : 'Support threads'}</SelectItem>
                    <SelectItem value="receipt">{isMyanmar ? 'ပြေစာများ' : 'Receipts'}</SelectItem>
                    <SelectItem value="refund">{isMyanmar ? 'ပြန်အမ်းငွေ ဆုံးဖြတ်ချက်များ' : 'Refund decisions'}</SelectItem>
                    <SelectItem value="key_notice">{isMyanmar ? 'သော့ အသိပေးချက်များ' : 'Key notices'}</SelectItem>
                    <SelectItem value="support_note">{isMyanmar ? 'အကူအညီ မှတ်စုများ' : 'Support notes'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{isMyanmar ? `ပြသနေသည် ${filteredCommunicationHistory.length}` : `Showing ${filteredCommunicationHistory.length}`}</Badge>
                <Badge variant="secondary">
                  {communicationFilter === 'ALL'
                    ? (isMyanmar ? 'အမျိုးအစား အားလုံး' : 'All categories')
                    : communicationFilter === 'CUSTOMER'
                      ? (isMyanmar ? 'ဖောက်သည်မြင်ရ' : 'Customer-facing')
                      : communicationFilter === 'INTERNAL'
                        ? (isMyanmar ? 'အတွင်းသုံးသာ' : 'Internal only')
                        : communicationFilter.replace('_', ' ')}
                </Badge>
                {communicationSearch.trim() ? <Badge variant="outline">{isMyanmar ? 'ရှာဖွေချက်' : 'Search'}: {communicationSearch.trim()}</Badge> : null}
              </div>

              {filteredCommunicationHistory.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  {isMyanmar ? 'လက်ရှိ filter များနှင့် ကိုက်ညီသော ဖောက်သည် ဆက်သွယ်မှု မရှိပါ။' : 'No customer communication matches the current filters.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCommunicationHistory.map((event) => {
                    const toneClass =
                      event.tone === 'positive'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                        : event.tone === 'warning'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
                          : event.tone === 'danger'
                            ? 'border-red-500/20 bg-red-500/10 text-red-100'
                            : 'border-border/60 bg-background/40 text-muted-foreground dark:bg-white/[0.03]';

                    return (
                      <div key={event.id} className={`rounded-[1rem] border px-4 py-3 ${toneClass}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">{event.title}</p>
                              <Badge variant="outline">
                                {event.category === 'announcement'
                                  ? isMyanmar ? 'ကြေညာချက်' : 'Announcement'
                                  : event.category === 'message'
                                    ? isMyanmar ? 'တိုက်ရိုက် စာပို့ခြင်း' : 'Direct message'
                                    : event.category === 'support_thread'
                                      ? isMyanmar ? 'အကူအညီ စကားပြောခန်း' : 'Support thread'
                                    : event.category === 'receipt'
                                      ? isMyanmar ? 'ပြေစာ' : 'Receipt'
                                      : event.category === 'refund'
                                        ? isMyanmar ? 'ပြန်အမ်းငွေ' : 'Refund'
                                        : event.category === 'key_notice'
                                          ? isMyanmar ? 'သော့ အသိပေးချက်' : 'Key notice'
                                          : isMyanmar ? 'အကူအညီ မှတ်စု' : 'Support note'}
                              </Badge>
                              <Badge variant={event.customerFacing ? 'secondary' : 'outline'}>
                                {event.customerFacing ? (isMyanmar ? 'ဖောက်သည်မြင်ရ' : 'Customer-facing') : (isMyanmar ? 'အတွင်းသုံး' : 'Internal')}
                              </Badge>
                            </div>
                            <p className="whitespace-pre-wrap text-sm">{event.detail}</p>
                            {event.meta ? <p className="text-xs text-muted-foreground">{event.meta}</p> : null}
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                            {event.href ? (
                              event.href.startsWith('http') ? (
                                <Button asChild size="sm" variant="outline">
                                  <a href={event.href} target="_blank" rel="noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    {isMyanmar ? 'ဖွင့်မည်' : 'Open'}
                                  </a>
                                </Button>
                              ) : (
                                <Button asChild size="sm" variant="outline">
                                  <Link href={event.href}>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    {isMyanmar ? 'ဖွင့်မည်' : 'Open'}
                                  </Link>
                                </Button>
                              )
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                {isMyanmar ? 'သော့ စာရင်း' : 'Key inventory'}
              </CardTitle>
              <CardDescription>
                {isMyanmar ? 'ဤဖောက်သည်နှင့် လက်ရှိချိတ်ထားသော ရိုးရိုးနှင့် ပရီမီယံ သော့များကို ကြည့်ရှုပါ။' : 'Standard and premium keys currently linked to this customer.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium">{isMyanmar ? 'ရိုးရိုး သော့များ' : 'Standard keys'}</p>
                {accessKeys.length === 0 ? (
                  <p className="rounded-[1rem] border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                    {isMyanmar ? 'ရိုးရိုး သော့ မချိတ်ထားသေးပါ။' : 'No standard keys assigned.'}
                  </p>
                ) : (
                  accessKeys.map((key: AccessKeyItem) => (
                    <div key={key.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{key.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {key.server.name} • {key.status}
                          </p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/keys/${key.id}`}>{isMyanmar ? 'ဖွင့်မည်' : 'Open'}</Link>
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                        <p>{isMyanmar ? 'အသုံးပြုမှု:' : 'Usage:'} {formatBytes(BigInt(key.usedBytes))}{key.dataLimitBytes ? ` / ${formatBytes(BigInt(key.dataLimitBytes))}` : ''}</p>
                        <p>{isMyanmar ? 'သက်တမ်းကုန်:' : 'Expiry:'} {key.expiresAt ? formatDateTime(key.expiresAt) : isMyanmar ? 'မကုန်ဆုံးပါ' : 'Never'}</p>
                        <p>{isMyanmar ? 'နောက်ဆုံး အသုံးပြုမှု:' : 'Last traffic:'} {key.lastTrafficAt ? formatRelativeTime(key.lastTrafficAt) : isMyanmar ? 'လတ်တလော အသုံးပြုမှု မရှိပါ' : 'No recent traffic'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">{isMyanmar ? 'ပရီမီယံ အလှုပ်ရှားသော သော့များ' : 'Premium dynamic keys'}</p>
                {dynamicKeys.length === 0 ? (
                  <p className="rounded-[1rem] border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                    {isMyanmar ? 'ပရီမီယံ အလှုပ်ရှားသော သော့ မချိတ်ထားသေးပါ။' : 'No premium dynamic keys assigned.'}
                  </p>
                ) : (
                  dynamicKeys.map((key: DynamicKeyItem) => (
                    <div key={key.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{key.name}</p>
                          <p className="text-sm text-muted-foreground">{key.status}</p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/dynamic-keys/${key.id}`}>{isMyanmar ? 'ဖွင့်မည်' : 'Open'}</Link>
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                        <p>{isMyanmar ? 'အသုံးပြုမှု:' : 'Usage:'} {formatBytes(BigInt(key.usedBytes))}{key.dataLimitBytes ? ` / ${formatBytes(BigInt(key.dataLimitBytes))}` : ''}</p>
                        <p>{isMyanmar ? 'သက်တမ်းကုန်:' : 'Expiry:'} {key.expiresAt ? formatDateTime(key.expiresAt) : isMyanmar ? 'မကုန်ဆုံးပါ' : 'Never'}</p>
                        <p>{isMyanmar ? 'နောက်ဆုံး အသုံးပြုမှု:' : 'Last traffic:'} {key.lastTrafficAt ? formatRelativeTime(key.lastTrafficAt) : isMyanmar ? 'လတ်တလော အသုံးပြုမှု မရှိပါ' : 'No recent traffic'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                {isMyanmar ? 'ငွေကြေးပိုင်း အချိန်လိုင်း' : 'Finance timeline'}
              </CardTitle>
              <CardDescription>
                {isMyanmar ? 'ဤဖောက်သည်အတွက် ငွေပေးချေမှု၊ ပြေစာ၊ ပြန်အမ်းတောင်းဆိုမှု၊ ဆုံးဖြတ်ချက်နှင့် ငွေကြေးပိုင်း လုပ်ဆောင်ချက်များကို လိုက်ကြည့်ပါ။' : 'Follow payments, receipts, refund requests, decisions, credits, and finance actions for this customer.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {financeTimeline.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  {isMyanmar ? 'ဤဖောက်သည်အတွက် ငွေကြေးပိုင်း ဖြစ်ရပ်များ မမှတ်တမ်းတင်ရသေးပါ။' : 'No finance events have been recorded for this customer yet.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {financeTimeline.map((event) => {
                    const toneClass =
                      event.tone === 'positive'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                        : event.tone === 'warning'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
                          : event.tone === 'danger'
                            ? 'border-red-500/20 bg-red-500/10 text-red-100'
                            : 'border-border/60 bg-background/40 text-muted-foreground dark:bg-white/[0.03]';

                    return (
                      <div key={event.id} className={`rounded-[1rem] border px-4 py-3 ${toneClass}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">{event.title}</p>
                              {event.orderCode ? <Badge variant="outline">{event.orderCode}</Badge> : null}
                            </div>
                            <p className="text-sm">{event.detail}</p>
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                            {event.href ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={event.href}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {isMyanmar ? 'အော်ဒါ ဖွင့်မည်' : 'Open order'}
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                {isMyanmar ? 'ဖောက်သည် အကျဉ်းချုပ်' : 'Customer snapshot'}
              </CardTitle>
              <CardDescription>{isMyanmar ? 'ဤအသုံးပြုသူအတွက် ငွေကြေးပိုင်းနှင့် အကူအညီဆိုင်ရာ အချက်အလက် အကျဉ်းချုပ်ကို ပြထားသည်။' : 'Quick billing and support context for this user.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-muted-foreground">{isMyanmar ? 'အကောင့် အခန်းကဏ္ဍ' : 'Account role'}</p>
                <p className="mt-1 font-medium">{user.role}</p>
              </div>
              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-muted-foreground">{isMyanmar ? 'တယ်လီဂရမ် စကားပြောခန်း' : 'Telegram chat'}</p>
                <p className="mt-1 font-medium">{telegramProfile?.telegramChatId || user.telegramChatId || (isMyanmar ? 'မချိတ်ထားပါ' : 'Not linked')}</p>
              </div>
              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-muted-foreground">{isMyanmar ? 'တယ်လီဂရမ် ပရိုဖိုင်' : 'Telegram profile'}</p>
                <p className="mt-1 font-medium">
                  {telegramProfile?.username ? `@${telegramProfile.username}` : isMyanmar ? 'အသုံးပြုသူအမည် မရှိပါ' : 'No username'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isMyanmar ? 'ဘာသာစကား:' : 'Locale:'} {telegramProfile?.locale || (isMyanmar ? 'မသတ်မှတ်ရသေးပါ' : 'Not set')}
                </p>
              </div>
              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                <p className="text-muted-foreground">{isMyanmar ? 'စတင်ဝင်ရောက်ချိန်' : 'Joined'}</p>
                <p className="mt-1 font-medium">{formatDateTime(user.createdAt)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                {isMyanmar ? 'ဖောက်သည် စီမံလုပ်ဆောင်ချက် စင်တာ' : 'CRM action center'}
              </CardTitle>
              <CardDescription>
                {isMyanmar ? 'Telegram တိုက်ရိုက်စာ ပို့ခြင်း၊ ပို့ဆောင်ရေးပစ္စည်းများကို ထပ်ပို့ခြင်းနှင့် အတွင်းသုံး အကူအညီ မှတ်စုများကို တစ်နေရာတည်းတွင် စီမံပါ။' : 'Send direct Telegram updates, resend delivery assets, and keep internal support notes from one place.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{isMyanmar ? 'Telegram တိုက်ရိုက်စာ' : 'Direct Telegram message'}</p>
                    <p className="text-xs text-muted-foreground">{isMyanmar ? 'ဤဖောက်သည်ထံ အကူအညီ သို့မဟုတ် ဝန်ဆောင်မှု စာတစ်စောင်ကို တိုက်ရိုက် ပို့ပါ။' : 'Send a one-off support or service message to this customer.'}</p>
                  </div>
                  <Switch
                    checked={crmIncludeSupportButton}
                    onCheckedChange={setCrmIncludeSupportButton}
                    disabled={!crmPermissions.canMessageCustomer}
                  />
                </div>
                <Textarea
                  className="mt-3 min-h-[110px]"
                  value={crmDirectMessage}
                  onChange={(event) => setCrmDirectMessage(event.target.value)}
                  placeholder={isMyanmar ? 'ဤဖောက်သည်အတွက် Telegram စာကို ရေးပါ…' : 'Write a direct Telegram message for this customer…'}
                  disabled={!crmPermissions.canMessageCustomer}
                />
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'စာ ခေါင်းစဉ်' : 'Message title'}</Label>
                    <Input
                      value={crmDirectMessageTitle}
                      onChange={(event) => setCrmDirectMessageTitle(event.target.value)}
                      placeholder={isMyanmar ? 'ရွေးချယ်နိုင်သော ခေါင်းစဉ်' : 'Optional headline'}
                      disabled={!crmPermissions.canMessageCustomer}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'ကတ် ပုံစံ' : 'Card style'}</Label>
                    <Select
                      value={crmDirectMessageCardStyle}
                      onValueChange={(value) =>
                        setCrmDirectMessageCardStyle(value as 'DEFAULT' | 'PROMO' | 'PREMIUM' | 'OPERATIONS')
                      }
                    >
                      <SelectTrigger disabled={!crmPermissions.canMessageCustomer}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEFAULT">{isMyanmar ? 'မူလ ကတ်' : 'Default card'}</SelectItem>
                        <SelectItem value="PROMO">{isMyanmar ? 'ပရိုမိုးရှင်း ကတ်' : 'Promo card'}</SelectItem>
                        <SelectItem value="PREMIUM">{isMyanmar ? 'ပရီမီယံ ကတ်' : 'Premium card'}</SelectItem>
                        <SelectItem value="OPERATIONS">{isMyanmar ? 'လုပ်ဆောင်ချက် ကတ်' : 'Operations card'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'မီဒီယာ ပံ့ပိုးမှု' : 'Media support'}</Label>
                    <Select
                      value={crmDirectMessageMediaKind}
                      onValueChange={(value) =>
                        setCrmDirectMessageMediaKind(value as 'NONE' | 'IMAGE' | 'FILE')
                      }
                    >
                      <SelectTrigger disabled={!crmPermissions.canMessageCustomer}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">{isMyanmar ? 'စာသားသာ' : 'Text only'}</SelectItem>
                        <SelectItem value="IMAGE">{isMyanmar ? 'ပုံ / ခေါင်းစီးပုံ' : 'Image / banner'}</SelectItem>
                        <SelectItem value="FILE">{isMyanmar ? 'ဖိုင် ပူးတွဲချက်' : 'File attachment'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{crmDirectMessageMediaKind === 'FILE' ? (isMyanmar ? 'ဖိုင် လင့်ခ်' : 'File URL') : (isMyanmar ? 'ပုံ လင့်ခ်' : 'Image URL')}</Label>
                    <Input
                      value={crmDirectMessageMediaUrl}
                      onChange={(event) => setCrmDirectMessageMediaUrl(event.target.value)}
                      placeholder={
                        crmDirectMessageMediaKind === 'FILE'
                          ? 'https://example.com/receipt.pdf'
                          : 'https://example.com/banner.jpg'
                      }
                      disabled={!crmPermissions.canMessageCustomer || crmDirectMessageMediaKind === 'NONE'}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isMyanmar
                        ? 'ဖောက်သည်တစ်ဦးချင်းစီထံ ပို့သော စာများတွင် Telegram ကြေညာချက်ကတ်၏ ပုံစံကို ပြန်လည်အသုံးပြုပါသည်။'
                        : 'Reuses the Telegram announcement card styling for one-user messages.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'တမ်းပလိတ် ထည့်သွင်းနည်း' : 'Template apply mode'}</Label>
                    <Select
                      value={crmTemplateMode}
                      onValueChange={(value) => setCrmTemplateMode(value as 'replace' | 'append')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="replace">{isMyanmar ? 'စာကို အစားထိုးမည်' : 'Replace message'}</SelectItem>
                        <SelectItem value="append">{isMyanmar ? 'စာ၏အဆုံးတွင် ထပ်ထည့်မည်' : 'Append to message'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-xl border border-border/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">{isMyanmar ? 'တိုက်ရိုက်ပို့ တမ်းပလိတ်များ' : 'Direct-send templates'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {CRM_DIRECT_MESSAGE_TEMPLATES.map((template) => (
                    <Button
                      key={`${template.category}-${template.label}`}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!crmPermissions.canMessageCustomer}
                      onClick={() =>
                        setCrmDirectMessage((prev) =>
                          crmTemplateMode === 'append' && prev.trim().length > 0
                            ? `${prev.trim()}\n\n${getCrmTemplateBody(template.label, template.body, isMyanmar)}`
                            : getCrmTemplateBody(template.label, template.body, isMyanmar),
                        )
                      }
                    >
                      {getCrmTemplateCategoryLabel(template.category, isMyanmar)} · {getCrmTemplateLabel(template.label, isMyanmar)}
                    </Button>
                  ))}
                    </div>
                  </div>
                </div>
                <Button
                  className="mt-3 w-full"
                  disabled={
                    !crmPermissions.canMessageCustomer ||
                    sendDirectTelegramMessageMutation.isPending ||
                    crmDirectMessage.trim().length < 3 ||
                    (crmDirectMessageMediaKind !== 'NONE' && crmDirectMessageMediaUrl.trim().length < 8)
                  }
                  onClick={() =>
                    sendDirectTelegramMessageMutation.mutate({
                      userId,
                      title: crmDirectMessageTitle.trim() || undefined,
                      message: crmDirectMessage.trim(),
                      includeSupportButton: crmIncludeSupportButton,
                      cardStyle: crmDirectMessageCardStyle,
                      mediaKind: crmDirectMessageMediaKind,
                      mediaUrl:
                        crmDirectMessageMediaKind === 'NONE'
                          ? undefined
                          : crmDirectMessageMediaUrl.trim() || undefined,
                    })
                  }
                >
                  {sendDirectTelegramMessageMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {isMyanmar ? 'တိုက်ရိုက်စာ ပို့မည်' : 'Send direct message'}
                </Button>
              </div>

              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                <p className="text-sm font-medium">{isMyanmar ? 'ပို့ဆောင်မှု လုပ်ဆောင်ချက်များ' : 'Delivery actions'}</p>
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'ပြေစာကို ထပ်ပို့မည်' : 'Resend receipt'}</Label>
                    <Select value={crmReceiptOrderId} onValueChange={setCrmReceiptOrderId}>
                      <SelectTrigger>
                        <SelectValue placeholder={isMyanmar ? 'ပြီးစီးထားသော အော်ဒါကို ရွေးပါ' : 'Choose a fulfilled order'} />
                      </SelectTrigger>
                      <SelectContent>
                        {telegramOrders.filter((order) => order.status === 'FULFILLED').map((order) => (
                          <SelectItem key={order.id} value={order.id}>
                            {order.orderCode} • {order.planName || order.planCode || 'Order'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!crmPermissions.canMessageCustomer || resendTelegramOrderReceiptMutation.isPending || !crmReceiptOrderId}
                      onClick={() => resendTelegramOrderReceiptMutation.mutate({ orderId: crmReceiptOrderId })}
                    >
                      {resendTelegramOrderReceiptMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {isMyanmar ? 'Telegram တွင် ပြေစာကို ထပ်ပို့မည်' : 'Resend receipt in Telegram'}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'မျှဝေစာမျက်နှာကို ထပ်ပို့မည်' : 'Resend share page'}</Label>
                    <Select value={crmShareTarget} onValueChange={setCrmShareTarget}>
                      <SelectTrigger>
                        <SelectValue placeholder={isMyanmar ? 'သော့တစ်ခုကို ရွေးပါ' : 'Choose a key'} />
                      </SelectTrigger>
                      <SelectContent>
                        {accessKeys.map((key: AccessKeyItem) => (
                          <SelectItem key={`ACCESS_KEY:${key.id}`} value={`ACCESS_KEY:${key.id}`}>
                            {isMyanmar ? 'ပုံမှန် •' : 'Standard •'} {key.name}
                          </SelectItem>
                        ))}
                        {dynamicKeys.map((key: DynamicKeyItem) => (
                          <SelectItem key={`DYNAMIC_KEY:${key.id}`} value={`DYNAMIC_KEY:${key.id}`}>
                            {isMyanmar ? 'ပရီမီယံ •' : 'Premium •'} {key.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!crmPermissions.canMessageCustomer || resendCustomerSharePageMutation.isPending || !crmShareTarget}
                      onClick={() => {
                        const [keyType, keyId] = crmShareTarget.split(':');
                        if (!keyType || !keyId) {
                          return;
                        }
                        resendCustomerSharePageMutation.mutate({
                          keyType: keyType as 'ACCESS_KEY' | 'DYNAMIC_KEY',
                          keyId,
                        });
                      }}
                    >
                      {resendCustomerSharePageMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-2 h-4 w-4" />
                      )}
                      {isMyanmar ? 'မျှဝေစာမျက်နှာကို ထပ်ပို့မည်' : 'Resend share page'}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'ဤအသုံးပြုသူထံ ကြေညာချက်ကို ထပ်ပို့မည်' : 'Resend announcement to this user'}</Label>
                    <Select value={crmAnnouncementId} onValueChange={setCrmAnnouncementId}>
                      <SelectTrigger>
                        <SelectValue placeholder={isMyanmar ? 'မကြာသေးမီ ကြေညာချက်ကို ရွေးပါ' : 'Choose a recent announcement'} />
                      </SelectTrigger>
                      <SelectContent>
                        {announcementDeliveries.map((delivery) => (
                          <SelectItem key={delivery.id} value={delivery.announcement.id}>
                            {delivery.announcement.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={
                        !crmPermissions.canResendAnnouncements ||
                        resendAnnouncementToCustomerMutation.isPending ||
                        !crmAnnouncementId
                      }
                      onClick={() =>
                        resendAnnouncementToCustomerMutation.mutate({
                          userId,
                          announcementId: crmAnnouncementId,
                        })
                      }
                    >
                      {resendAnnouncementToCustomerMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="mr-2 h-4 w-4" />
                      )}
                      {isMyanmar ? 'ကြေညာချက်ကို ထပ်ပို့မည်' : 'Resend announcement'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                <p className="text-sm font-medium">{isMyanmar ? 'ပြတ်တောက်မှု အသိပေးချက်' : 'Outage update'}</p>
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'ဆာဗာ သို့မဟုတ် ဝန်ဆောင်မှု အမည်' : 'Server or service name'}</Label>
                    <Input
                      value={crmOutageServerName}
                      onChange={(event) => setCrmOutageServerName(event.target.value)}
                      placeholder={isMyanmar ? 'SG, US, ပရီမီယံအုပ်စု, ဝန်ဆောင်မှု အပ်ဒိတ်…' : 'SG, US, Premium pool, Service update…'}
                      disabled={!crmPermissions.canSendOutageUpdate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isMyanmar ? 'ပြတ်တောက်မှု သို့မဟုတ် ထိန်းသိမ်းမှု စာ' : 'Outage or maintenance message'}</Label>
                    <Textarea
                      className="min-h-[100px]"
                      value={crmOutageMessage}
                      onChange={(event) => setCrmOutageMessage(event.target.value)}
                      placeholder={isMyanmar ? 'ဆာဗာ ပြဿနာကို စစ်ဆေးနေပါသည်။ ပြန်လည်ပြုပြင်မှု ပြီးဆုံးသည်အထိ ၂ မှ ၃ နာရီခန့် စောင့်ပေးပါ…' : 'We are checking a server issue for you. Please wait 2 to 3 hours while we complete recovery…'}
                      disabled={!crmPermissions.canSendOutageUpdate}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={
                      !crmPermissions.canSendOutageUpdate ||
                      sendCustomerOutageUpdateMutation.isPending ||
                      crmOutageServerName.trim().length < 1 ||
                      crmOutageMessage.trim().length < 5
                    }
                    onClick={() =>
                      sendCustomerOutageUpdateMutation.mutate({
                        userId,
                        noticeType: 'ISSUE',
                        serverName: crmOutageServerName.trim(),
                        message: crmOutageMessage.trim(),
                      })
                    }
                  >
                    {sendCustomerOutageUpdateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="mr-2 h-4 w-4" />
                    )}
                    {isMyanmar ? 'ပြတ်တောက်မှု အသိပေးချက် ပို့မည်' : 'Send outage update'}
                  </Button>
                </div>
              </div>

              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                <p className="text-sm font-medium">{isMyanmar ? 'အတွင်းသုံး အကူအညီ မှတ်စု' : 'Internal support note'}</p>
                <Textarea
                  className="mt-3 min-h-[100px]"
                  value={crmSupportNote}
                  onChange={(event) => setCrmSupportNote(event.target.value)}
                  placeholder={isMyanmar ? 'နောက်ပိုင်း အကူအညီအတွက် အတွင်းသုံး မှတ်စုကို ရေးပါ…' : 'Write an internal note for future support context…'}
                  disabled={!crmPermissions.canAddSupportNote}
                />
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={!crmPermissions.canAddSupportNote || addSupportNoteMutation.isPending || crmSupportNote.trim().length < 3}
                  onClick={() =>
                    addSupportNoteMutation.mutate({
                      userId,
                      note: crmSupportNote.trim(),
                    })
                  }
                >
                  {addSupportNoteMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {isMyanmar ? 'အကူအညီ မှတ်စုကို သိမ်းမည်' : 'Save support note'}
                </Button>
                {supportNotes.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {supportNotes.slice(0, 5).map((note: SupportNoteItem) => (
                      <div key={note.id} className="rounded-xl border border-border/50 p-3 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{note.kind}</span>
                          <span>{formatRelativeTime(note.createdAt)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap">{note.note}</p>
                        {(note.telegramMessageTitle || note.telegramMediaKind || note.telegramMediaUrl) ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {[
                              note.telegramMessageTitle ? (isMyanmar ? `ခေါင်းစဉ် - ${note.telegramMessageTitle}` : `Title ${note.telegramMessageTitle}`) : null,
                              note.telegramCardStyle ? (isMyanmar ? `ကတ်ပုံစံ - ${note.telegramCardStyle.toLowerCase()}` : `${note.telegramCardStyle.toLowerCase()} card`) : null,
                              note.telegramMediaKind ? (isMyanmar ? `မီဒီယာ - ${note.telegramMediaKind.toLowerCase()}` : `Media ${note.telegramMediaKind.toLowerCase()}`) : null,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                            {note.telegramMediaUrl ? (
                              <>
                                {' • '}
                                <a
                                  href={note.telegramMediaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline underline-offset-4"
                                >
                                  {isMyanmar ? 'မီဒီယာ ဖွင့်မည်' : 'Open media'}
                                </a>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {note.createdBy?.email ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">{isMyanmar ? 'ရေးသားသူ' : 'By'} {note.createdBy.email}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                {isMyanmar ? 'ဖောက်သည်ထံ ပို့ထားသော အသိပေးချက်များ' : 'Customer notifications'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'ဤဖောက်သည်အတွက် ကြေညာချက် ပို့ထားမှုများ၊ ပြေစာများနှင့် သော့/ပြတ်တောက်မှု ဆိုင်ရာ နောက်ဆုံးအသိပေးချက်များကို ပြထားသည်။'
                  : 'Announcement deliveries, receipts, and recent key or outage-related notices for this customer.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {isMyanmar ? 'ပို့ဆောင်မှု အချက်အလက်' : 'Delivery analytics'}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {customerNotifications.summary.totalAnnouncements}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isMyanmar
                      ? `${customerNotifications.summary.readCount} ခု ဖတ်ပြီး • ${customerNotifications.summary.unreadCount} ခု မဖတ်ရသေး`
                      : `${customerNotifications.summary.readCount} read • ${customerNotifications.summary.unreadCount} unread`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isMyanmar
                      ? `${customerNotifications.summary.openCount} ခု ဖွင့်ထား • ${customerNotifications.summary.clickCount} ခု နှိပ်ထား`
                      : `${customerNotifications.summary.openCount} opens • ${customerNotifications.summary.clickCount} clicks`}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {isMyanmar ? 'ထိတွေ့မှု' : 'Engagement'}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {Math.round(customerNotifications.summary.readRate * 100)}%
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isMyanmar
                      ? `ဖတ်ရှုနှုန်း • ${Math.round(customerNotifications.summary.clickRate * 100)}% နှိပ်နှုန်း`
                      : `Read rate • ${Math.round(customerNotifications.summary.clickRate * 100)}% click rate`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isMyanmar
                      ? `ပင်ထားသော အသိပေးချက် ${customerNotifications.summary.pinnedCount} ခု ပို့ထားသည်`
                      : `${customerNotifications.summary.pinnedCount} pinned notices delivered`}
                  </p>
                </div>
              </div>

              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{isMyanmar ? 'ဖောက်သည် ပရိုမိုးရှင်း အမှတ်အသားများ' : 'Customer promotion tags'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                    {isMyanmar ? (
                      <>
                          ကော်မာဖြင့် ခွဲထားသော <code>vip</code>, <code>warm_lead</code>, <code>renewal_focus</code> ကဲ့သို့သော အမှတ်အသားများကို အသုံးပြုပါ။ ဤအမှတ်အသားများကို Telegram ကြေညာချက် ပစ်မှတ်သတ်မှတ်မှုတွင် အသုံးပြုပါမည်။
                      </>
                      ) : (
                        <>
                          Use comma-separated tags like <code>vip</code>, <code>warm_lead</code>, or <code>renewal_focus</code>. These tags appear in Telegram announcement targeting.
                        </>
                      )}
                    </p>
                  </div>
                  {!crmPermissions.canManageCustomerTags ? (
                    <Badge variant="outline">{isMyanmar ? 'ပိုင်ရှင်/စီမံခန့်ခွဲသူသာ' : 'Owner/Admin only'}</Badge>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-col gap-3 md:flex-row">
                  <Input
                    value={crmMarketingTags}
                    onChange={(event) => setCrmMarketingTags(event.target.value)}
                    placeholder={isMyanmar ? 'vip, warm_lead, renewal_focus' : 'vip, warm_lead, renewal_focus'}
                    disabled={!crmPermissions.canManageCustomerTags}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={
                      !crmPermissions.canManageCustomerTags ||
                      updateMarketingTagsMutation.isPending
                    }
                    onClick={() =>
                      updateMarketingTagsMutation.mutate({
                        userId,
                        marketingTags: crmMarketingTags,
                      })
                    }
                  >
                    {updateMarketingTagsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {isMyanmar ? 'အမှတ်အသားများကို သိမ်းမည်' : 'Save tags'}
                  </Button>
                </div>
              </div>

              <div className="rounded-[1rem] border border-border/60 bg-background/40 p-4 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{isMyanmar ? 'အသိပေးချက် စိတ်ကြိုက်သတ်မှတ်မှုများ' : 'Notification preferences'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isMyanmar
                        ? 'ဤဖောက်သည် Telegram တွင် ဘာများ လက်ခံမည်ကို စီမံပါ။ အသုံးပြုသူကလည်း /notifications မှ ပြောင်းနိုင်သည်။'
                        : 'Control what this customer receives in Telegram. Users can also change these via /notifications.'}
                    </p>
                  </div>
                  {!telegramProfile ? (
                    <Badge variant="outline">{isMyanmar ? 'တယ်လီဂရမ် ပရိုဖိုင် လိုအပ်သည်' : 'Telegram profile required'}</Badge>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3">
                  {[
                    {
                      key: 'allowPromoAnnouncements' as const,
                      label: isMyanmar ? 'ပရိုမိုးရှင်းနှင့် လျှော့ဈေးများ' : 'Promotions and discounts',
                      description: isMyanmar ? 'ပရိုမိုးရှင်း အများပြည်သူပို့စာများနှင့် လျှော့ဈေး အစီအစဉ် ကမ်းလှမ်းချက်များ။' : 'Promo broadcasts and discounted-plan offers.',
                      checked: telegramProfile?.allowPromoAnnouncements ?? true,
                    },
                    {
                      key: 'allowMaintenanceNotices' as const,
                      label: isMyanmar ? 'ထိန်းသိမ်းမှုနှင့် ဆာဗာ အပ်ဒိတ်များ' : 'Maintenance and server updates',
                      description: isMyanmar ? 'ထိန်းသိမ်းမှု၊ ပြတ်တောက်မှု နှင့် ဆာဗာအသစ် အသိပေးချက်များ။' : 'Maintenance, downtime, and new-server notices.',
                      checked: telegramProfile?.allowMaintenanceNotices ?? true,
                    },
                    {
                      key: 'allowReceiptNotifications' as const,
                      label: isMyanmar ? 'ပြေစာနှင့် ငွေပြန်အမ်း အတည်ပြုချက်များ' : 'Receipts and refund confirmations',
                      description: isMyanmar ? 'ပြေစာ၊ ငွေပြန်အမ်းမှုနှင့် ငွေကြေးအတည်ပြုချက် စာများ။' : 'Receipt, refund, and finance confirmation messages.',
                      checked: telegramProfile?.allowReceiptNotifications ?? true,
                    },
                    {
                      key: 'allowSupportUpdates' as const,
                      label: isMyanmar ? 'အကူအညီ အပ်ဒိတ်များ' : 'Support updates',
                      description: isMyanmar ? 'တိုက်ရိုက် အကူအညီ နောက်ဆက်တွဲများနှင့် အခြေအနေ အသိပေးချက်များ။' : 'Direct support follow-up and status notices.',
                      checked: telegramProfile?.allowSupportUpdates ?? true,
                    },
                  ].map((preference) => (
                    <div key={preference.key} className="flex items-center justify-between gap-3 rounded-[0.9rem] border border-border/60 bg-background/50 px-3 py-2 dark:bg-white/[0.02]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{preference.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{preference.description}</p>
                      </div>
                      <Switch
                        checked={preference.checked}
                        disabled={!telegramProfile || updateNotificationPreferencesMutation.isPending}
                        onCheckedChange={(checked) => {
                          if (!telegramProfile) {
                            return;
                          }

                          updateNotificationPreferencesMutation.mutate({
                            userId,
                            allowPromoAnnouncements:
                              preference.key === 'allowPromoAnnouncements'
                                ? checked
                                : telegramProfile.allowPromoAnnouncements,
                            allowMaintenanceNotices:
                              preference.key === 'allowMaintenanceNotices'
                                ? checked
                                : telegramProfile.allowMaintenanceNotices,
                            allowReceiptNotifications:
                              preference.key === 'allowReceiptNotifications'
                                ? checked
                                : telegramProfile.allowReceiptNotifications,
                            allowSupportUpdates:
                              preference.key === 'allowSupportUpdates'
                                ? checked
                                : telegramProfile.allowSupportUpdates,
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'Telegram ကြေညာချက်များ' : 'Telegram announcements'}</p>
                {announcementDeliveries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'ကြေညာချက် ပို့ထားမှု မှတ်တမ်း မရှိသေးပါ။' : 'No announcement deliveries recorded yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {announcementDeliveries.map((delivery) => (
                      <div key={delivery.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{delivery.announcement.title}</p>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{delivery.status}</Badge>
                            {delivery.isPinned ? <Badge variant="secondary">{isMyanmar ? 'ပင်ထားသည်' : 'Pinned'}</Badge> : null}
                            {!delivery.readAt ? <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-200">{isMyanmar ? 'မဖတ်ရသေး' : 'Unread'}</Badge> : null}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {delivery.announcement.type} • {formatRelativeTime(delivery.sentAt || delivery.createdAt)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{delivery.announcement.message}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {isMyanmar
                            ? `ဖွင့်ထားမှု: ${delivery.openCount || 0} • နှိပ်ထားမှု: ${delivery.clickCount || 0}${delivery.readAt ? ` • ${formatRelativeTime(delivery.readAt)} တွင် ဖတ်ထားသည်` : ' • မဖွင့်ရသေးပါ'}`
                            : `Opens: ${delivery.openCount || 0} • Clicks: ${delivery.clickCount || 0}${delivery.readAt ? ` • Read ${formatRelativeTime(delivery.readAt)}` : ' • Not opened yet'}`}
                        </p>
                        {(delivery.announcement.targetTag || delivery.announcement.targetServerName || delivery.announcement.targetCountryCode) ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {delivery.announcement.targetTag ? (
                              <Badge variant="secondary">{isMyanmar ? 'အမှတ်အသား' : 'Tag'}: {delivery.announcement.targetTag}</Badge>
                            ) : null}
                            {delivery.announcement.targetServerName ? (
                              <Badge variant="secondary">{isMyanmar ? 'ဆာဗာ' : 'Server'}: {delivery.announcement.targetServerName}</Badge>
                            ) : null}
                            {delivery.announcement.targetCountryCode ? (
                              <Badge variant="secondary">{isMyanmar ? 'ဒေသ' : 'Region'}: {delivery.announcement.targetCountryCode}</Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'ပရီမီယံ လမ်းကြောင်း ပြောင်းလဲမှု အချိန်လိုင်း' : 'Premium routing lifecycle'}</p>
                {premiumRoutingAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'ပရီမီယံ လမ်းကြောင်း ပြောင်းလဲမှု မှတ်တမ်း မရှိသေးပါ။' : 'No premium routing events recorded yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {premiumRoutingAlerts.map((alert: PremiumRoutingAlertItem) => {
                      const metadata = (alert.metadata || {}) as Record<string, unknown>;
                      const fallbackRegions = Array.isArray(metadata.suggestedFallbackRegions)
                        ? metadata.suggestedFallbackRegions.filter((value): value is string => typeof value === 'string')
                        : [];
                      const fallbackRegionCode =
                        typeof metadata.fallbackRegionCode === 'string' ? metadata.fallbackRegionCode : null;
                      const healthyPreferredRegions = Array.isArray(metadata.healthyPreferredRegions)
                        ? metadata.healthyPreferredRegions.filter((value): value is string => typeof value === 'string')
                        : [];

                      return (
                        <div key={alert.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">
                              {alert.dynamicAccessKeyName}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {alert.eventType === 'AUTO_FALLBACK_PIN_APPLIED'
                                  ? (isMyanmar ? 'အစားထိုး လမ်းကြောင်း' : 'Fallback')
                                  : alert.eventType === 'PREFERRED_REGION_RECOVERED'
                                    ? (isMyanmar ? 'ပြန်ကောင်းလာသည်' : 'Recovered')
                                    : (isMyanmar ? 'အခြေအနေ ကျဆင်း' : 'Degraded')}
                              </span>
                            </p>
                            <Badge
                              variant="outline"
                              className={
                                alert.eventType === 'PREFERRED_REGION_RECOVERED'
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                  : alert.severity === 'CRITICAL'
                                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              }
                            >
                              {alert.severity}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(alert.createdAt)}</p>
                          <p className="mt-2 text-sm text-muted-foreground">{alert.reason}</p>
                          {fallbackRegions.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {fallbackRegions.map((regionCode) => (
                                <Badge key={`${alert.id}:${regionCode}`} variant="secondary">
                                  {isMyanmar ? 'အစားထိုး လမ်းကြောင်း' : 'Fallback'}: {regionCode}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          {fallbackRegionCode ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="secondary">{isMyanmar ? 'ပင်ထားသော အစားထိုး လမ်းကြောင်း' : 'Pinned fallback'}: {fallbackRegionCode}</Badge>
                            </div>
                          ) : null}
                          {healthyPreferredRegions.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {healthyPreferredRegions.map((regionCode) => (
                                <Badge key={`${alert.id}:recovered:${regionCode}`} variant="secondary">
                                  {isMyanmar ? 'ပြန်ကောင်းလာသည်' : 'Recovered'}: {regionCode}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          <Button asChild size="sm" variant="outline" className="mt-3">
                            <Link href={withBasePath(`/dashboard/dynamic-keys/${alert.dynamicAccessKeyId}`)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              {isMyanmar ? 'ပရီမီယံ သော့ကို ဖွင့်မည်' : 'Open premium key'}
                            </Link>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'သော့နှင့် ပြတ်တောက်မှု အသိပေးချက်များ' : 'Key and outage notices'}</p>
                {customerNotifications.keyNotices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'သော့ အသိပေးချက် မှတ်တမ်း မရှိသေးပါ။' : 'No key notification logs recorded yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {customerNotifications.keyNotices.map((log: KeyNoticeItem) => (
                      <div key={log.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{log.event}</p>
                          <Badge variant="outline">{log.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {log.accessKeyName || (isMyanmar ? 'မချိတ်ထားသော သော့' : 'Unlinked key')} • {formatRelativeTime(log.sentAt)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{log.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                {isMyanmar ? 'အကူအညီ အချိန်လိုင်း' : 'Support timeline'}
              </CardTitle>
              <CardDescription>
                {isMyanmar
                  ? 'အကူအညီ စကားပြောခန်းများ၊ အသိပေးချက်များ၊ ပရီမီယံ တောင်းဆိုမှုများ၊ ပြတ်တောက်မှုဆိုင်ရာ ဆက်သွယ်မှုများနှင့် ဆာဗာပြောင်းလဲမှု မှတ်တမ်းများကို အချိန်လိုက် တစ်နေရာတည်းတွင် ပြထားသည်။'
                  : 'One chronological feed for support threads, notices, premium requests, outage-related contact, and server-change history.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {supportTimeline.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                  {isMyanmar ? 'ဤဖောက်သည်အတွက် အကူအညီ မှတ်တမ်း မရှိသေးပါ။' : 'No support events have been recorded for this customer yet.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {supportTimeline.map((event) => {
                    const toneClass =
                      event.tone === 'positive'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                        : event.tone === 'warning'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
                          : event.tone === 'danger'
                            ? 'border-red-500/20 bg-red-500/10 text-red-100'
                            : 'border-border/60 bg-background/40 text-muted-foreground dark:bg-white/[0.03]';

                    return (
                      <div key={event.id} className={`rounded-[1rem] border px-4 py-3 ${toneClass}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{event.title}</p>
                            <p className="text-sm">{event.detail}</p>
                          </div>
                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                            {event.href ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={event.href}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {isMyanmar ? 'ဖွင့်မည်' : 'Open'}
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="ops-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                {isMyanmar ? 'အကူအညီ လှုပ်ရှားမှု' : 'Support activity'}
              </CardTitle>
              <CardDescription>{isMyanmar ? 'ဤဖောက်သည်နှင့် ဆက်စပ်သော Telegram အကူအညီ စကားပြောခန်းများ၊ ဆာဗာပြောင်းလဲမှု တောင်းဆိုမှုများနှင့် ပရီမီယံ အကူအညီ တောင်းဆိုမှုများ၏ နောက်ဆုံးလှုပ်ရှားမှု။' : 'Recent Telegram support threads, server-change requests, and premium support requests linked to this customer.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'Telegram အကူအညီ စကားပြောခန်းများ' : 'Telegram support threads'}</p>
                {supportThreads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'Telegram အကူအညီ စကားပြောခန်း မရှိသေးပါ။' : 'No Telegram support threads yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {supportThreads.map((thread: SupportThreadItem) => {
                      const latestReply = thread.replies[thread.replies.length - 1];
                      const stateLabel = getSupportThreadStateLabel(thread.status, thread.waitingOn, isMyanmar);

                      return (
                        <div key={thread.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{thread.threadCode}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{stateLabel}</Badge>
                              <Button asChild size="sm" variant="outline">
                                <Link href={withBasePath(`/dashboard/support/threads/${thread.id}`)}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {isMyanmar ? 'ဖွင့်မည်' : 'Open'}
                                </Link>
                              </Button>
                            </div>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {getSupportThreadCategoryLabel(thread.issueCategory, isMyanmar)}
                            {thread.assignedAdminName ? ` • ${thread.assignedAdminName}` : ''}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatRelativeTime(thread.updatedAt || thread.createdAt)}
                            {thread.firstResponseDueAt ? ` • SLA ${formatDateTime(thread.firstResponseDueAt)}` : ''}
                          </p>
                          {latestReply ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {latestReply.senderType === 'ADMIN' ? (isMyanmar ? 'စီမံခန့်ခွဲသူ' : 'Admin') : isMyanmar ? 'ဖောက်သည်' : 'Customer'}: {latestReply.message}
                            </p>
                          ) : null}
                          {thread.relatedOrderCode || thread.relatedKeyName || thread.relatedServerName ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {thread.relatedOrderCode ? <Badge variant="secondary">{isMyanmar ? 'အော်ဒါ' : 'Order'}: {thread.relatedOrderCode}</Badge> : null}
                              {thread.relatedKeyName ? <Badge variant="secondary">{isMyanmar ? 'သော့' : 'Key'}: {thread.relatedKeyName}</Badge> : null}
                              {thread.relatedServerName ? <Badge variant="secondary">{isMyanmar ? 'ဆာဗာ' : 'Server'}: {thread.relatedServerName}</Badge> : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'ဆာဗာ ပြောင်းလဲရန် တောင်းဆိုမှုများ' : 'Server change requests'}</p>
                {serverChangeRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'ဆာဗာ ပြောင်းလဲရန် တောင်းဆိုမှု မရှိသေးပါ။' : 'No server change requests yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {serverChangeRequests.map((request: ServerChangeRequestItem) => (
                      <div key={request.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{request.requestCode}</p>
                          <Badge variant="outline">{getServerChangeRequestStatusLabel(request.status, isMyanmar)}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {request.currentServerName} → {request.requestedServerName}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">{formatRelativeTime(request.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{isMyanmar ? 'ပရီမီယံ အကူအညီ တောင်းဆိုမှုများ' : 'Premium support requests'}</p>
                {premiumSupportRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'ပရီမီယံ အကူအညီ တောင်းဆိုမှု မရှိသေးပါ။' : 'No premium support requests yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {premiumSupportRequests.map((request: PremiumSupportRequestItem) => (
                      <div key={request.id} className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-sm dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{request.requestCode}</p>
                          <Badge variant="outline">{getPremiumSupportRequestStatusLabel(request.status, isMyanmar)}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{getPremiumSupportRequestTypeLabel(request.requestType, isMyanmar)}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatRelativeTime(request.createdAt)}
                          {request.followUpPending ? isMyanmar ? ' • ဖောက်သည်၏ ပြန်လည်တုံ့ပြန်မှုကို စောင့်နေသည်' : ' • waiting for customer follow-up' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!financeDialog} onOpenChange={(open) => (!open ? setFinanceDialog(null) : undefined)}>
        <DialogContent className="max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
            <DialogTitle>
              {financeDialog?.action === 'VERIFY'
                ? isMyanmar ? 'ငွေပေးချေမှု စစ်ဆေးမည်' : 'Verify payment'
                : financeDialog?.action === 'REFUND'
                  ? isMyanmar ? 'ပြန်အမ်းငွေ လုပ်မည်' : 'Refund order'
                  : isMyanmar ? 'ခရက်ဒစ် ထည့်မည်' : 'Apply credit'}
            </DialogTitle>
            <DialogDescription>
              {financeDialog
                ? isMyanmar
                  ? `အော်ဒါ ${financeDialog.orderCode} အတွက် ငွေကြေးဆိုင်ရာ အခြေအနေကို အပ်ဒိတ်လုပ်ပါ။`
                  : `Update the finance state for order ${financeDialog.orderCode}.`
                : isMyanmar
                  ? 'ဤအော်ဒါအတွက် ငွေကြေးဆိုင်ရာ အခြေအနေကို အပ်ဒိတ်လုပ်ပါ။'
                  : 'Update the finance state for this order.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <DialogSection>
              <DialogSectionHeader>
                <DialogSectionTitle>{isMyanmar ? 'ငွေကြေး ပြင်ဆင်မှု' : 'Finance adjustment'}</DialogSectionTitle>
                <DialogSectionDescription>
                  {isMyanmar
                    ? 'ဤအော်ဒါအတွက် ငွေပမာဏနှင့် အတွင်းမှတ်စုကို ငွေကြေး အချိန်လိုင်းတွင် မှတ်တမ်းတင်ပါ။'
                    : 'Record the amount and internal note that should follow this order into the finance timeline.'}
                </DialogSectionDescription>
              </DialogSectionHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="finance-amount">
                    {isMyanmar ? 'ငွေပမာဏ' : 'Amount'} {financeDialog?.currency ? `(${financeDialog.currency})` : ''}
                  </Label>
                  <Input
                    id="finance-amount"
                    type="number"
                    min="0"
                    placeholder={financeDialog?.defaultAmount?.toString() || (isMyanmar ? 'မဖြည့်လည်း ရသည်' : 'Optional')}
                    value={financeAmount}
                    onChange={(event) => setFinanceAmount(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finance-note">{isMyanmar ? 'မှတ်စု' : 'Note'}</Label>
                  <Textarea
                    id="finance-note"
                    rows={4}
                    placeholder={isMyanmar ? 'အတွင်းပိုင်း စာရင်းညှိနှိုင်းမှု မှတ်စု' : 'Internal reconciliation note'}
                    value={financeNote}
                    onChange={(event) => setFinanceNote(event.target.value)}
                  />
                </div>
                {financeDialog?.action === 'REFUND' ? (
                  <div className="ops-modal-note border-amber-500/20 bg-amber-500/10 text-amber-100">
                    {isMyanmar
                      ? 'ငွေပြန်အမ်းမှုကို ငွေပေးချေပြီး ဝယ်ယူမှု ၃ ခုကျော်ပြီး အသုံးပြုမှု 5 GB အောက် သို့မဟုတ် တူညီနေချိန်မှသာ ခွင့်ပြုပါသည်။'
                      : 'Refunds are only allowed after more than 3 paid purchases and while usage stays at or below 5 GB.'}
                  </div>
                ) : null}
              </div>
            </DialogSection>
          </DialogBody>

          <DialogFooter className="ops-modal-sticky-footer">
            <Button variant="outline" onClick={() => setFinanceDialog(null)}>
              {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
            </Button>
            <Button
              variant={financeDialog?.action === 'REFUND' ? 'destructive' : 'default'}
              onClick={() => {
                if (!financeDialog) {
                  return;
                }

                reconcileMutation.mutate({
                  orderId: financeDialog.orderId,
                  action: financeDialog.action,
                  note: financeNote.trim() || undefined,
                  amount:
                    financeAmount.trim().length > 0 && Number.isFinite(Number(financeAmount))
                      ? Number(financeAmount)
                      : undefined,
                });
              }}
              disabled={reconcileMutation.isPending || !financePermissions.canManage}
            >
              {reconcileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isMyanmar ? 'သိမ်းမည်' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
