'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ADMIN_SCOPE_VALUES,
  getAdminScopeLabel,
  hasFinanceConfigureScope,
  hasFinanceManageScope,
  isOwnerLikeAdmin,
  normalizeAdminScope,
} from '@/lib/admin-scope';
import { withBasePath } from '@/lib/base-path';
import { trpc } from '@/lib/trpc';
import { getRefundReasonPreset, listRefundReasonPresets, resolveRefundReasonPresetLabel, type RefundReviewAction } from '@/lib/finance';
import { formatBytes, formatDateTime, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MobileCardView } from '@/components/mobile-card-view';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ExternalLink, Key, Loader2, Plus, RefreshCw, Search, Send, Shield, Trash2, User, Users, Wallet } from 'lucide-react';

type RoleFilter = 'ALL' | 'ADMIN' | 'CLIENT';
type RefundQueueFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
type RefundQueueAssignmentFilter = 'ALL' | 'UNCLAIMED' | 'MINE' | 'CLAIMED';
type RefundQueueSort = 'REQUESTED_DESC' | 'REQUESTED_ASC' | 'AMOUNT_DESC';
type AdminScopeValue = (typeof ADMIN_SCOPE_VALUES)[number];

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

function UserStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="ops-kpi-tile">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function UsersPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string } | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [financeDialogOpen, setFinanceDialogOpen] = useState(false);
  const [refundQueueStatus, setRefundQueueStatus] = useState<RefundQueueFilter>('PENDING');
  const [refundQueueAssignment, setRefundQueueAssignment] = useState<RefundQueueAssignmentFilter>('ALL');
  const [refundQueueSort, setRefundQueueSort] = useState<RefundQueueSort>('REQUESTED_DESC');
  const [refundQueueSearch, setRefundQueueSearch] = useState('');
  const [financeOwnerEmails, setFinanceOwnerEmails] = useState('');
  const [financeOperatorEmails, setFinanceOperatorEmails] = useState('');
  const [financeDigestEnabled, setFinanceDigestEnabled] = useState(false);
  const [financeDigestHour, setFinanceDigestHour] = useState('21');
  const [financeDigestMinute, setFinanceDigestMinute] = useState('0');
  const [refundReviewDialog, setRefundReviewDialog] = useState<{
    orderId: string;
    orderCode: string;
    action: RefundReviewAction;
  } | null>(null);
  const [quickActionsUser, setQuickActionsUser] = useState<{ id: string; email: string } | null>(null);
  const [quickActionMessage, setQuickActionMessage] = useState('');
  const [quickActionIncludeSupportButton, setQuickActionIncludeSupportButton] = useState(true);
  const [quickActionReceiptOrderId, setQuickActionReceiptOrderId] = useState('');
  const [quickActionShareTarget, setQuickActionShareTarget] = useState('');
  const [refundReasonPresetCode, setRefundReasonPresetCode] = useState('');
  const [refundReviewNote, setRefundReviewNote] = useState('');
  const [refundReviewCustomerMessage, setRefundReviewCustomerMessage] = useState('');

  const { data: users, refetch, isLoading } = trpc.users.list.useQuery();
  const currentUserQuery = trpc.auth.me.useQuery();
  const financeControlsQuery = trpc.users.getFinanceControls.useQuery();
  const refundQueueQuery = trpc.users.getRefundQueue.useQuery({
    status: refundQueueStatus,
    assignment: refundQueueAssignment,
    sort: refundQueueSort,
    query: refundQueueSearch.trim() || undefined,
    limit: 24,
  });
  const userList = useMemo(() => users ?? [], [users]);
  const quickActionLedgerQuery = trpc.users.getLedger.useQuery(
    { id: quickActionsUser?.id || '' },
    {
      enabled: Boolean(quickActionsUser?.id),
    },
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return userList.filter((user) => {
      const matchesQuery = !query || (user.email || '').toLowerCase().includes(query);
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [roleFilter, search, userList]);

  const adminCount = userList.filter((user) => user.role === 'ADMIN').length;
  const ownerCount = userList.filter(
    (user) =>
      user.role === 'ADMIN' &&
      normalizeAdminScope(user.adminScope) === 'OWNER',
  ).length;
  const clientCount = userList.filter((user) => user.role === 'CLIENT').length;
  const assignedKeyCount = userList.reduce(
    (total, user) => total + ((user as { _count?: { accessKeys?: number } })._count?.accessKeys || 0),
    0
  );
  const adminUsers = useMemo(
    () => userList.filter((user) => user.role === 'ADMIN'),
    [userList],
  );
  const currentReviewerId = currentUserQuery.data?.id ?? null;
  const canManageFinance = hasFinanceManageScope(currentUserQuery.data?.adminScope);
  const canConfigureFinance = hasFinanceConfigureScope(currentUserQuery.data?.adminScope);
  const canManageUserScopes = isOwnerLikeAdmin(currentUserQuery.data?.adminScope);
  const refundQueue = refundQueueQuery.data?.orders || [];
  const refundQueueSummary = refundQueueQuery.data?.summary;
  const refundReasonPresets = useMemo(
    () => listRefundReasonPresets(refundReviewDialog?.action),
    [refundReviewDialog?.action],
  );
  const quickRefundMacros = useMemo(
    () =>
      [
        getRefundReasonPreset('approved_policy_eligible'),
        getRefundReasonPreset('reject_usage_over_5gb'),
        getRefundReasonPreset('reject_purchase_count'),
      ].filter((preset): preset is NonNullable<ReturnType<typeof getRefundReasonPreset>> => Boolean(preset)),
    [],
  );
  const quickActionLedger = quickActionLedgerQuery.data;
  const quickActionAccessKeys = quickActionLedger?.accessKeys || [];
  const quickActionDynamicKeys = quickActionLedger?.dynamicKeys || [];
  const quickActionTelegramOrders = quickActionLedger?.telegramOrders || [];
  const quickActionCouponEligibility = quickActionLedger?.couponEligibility || [];
  const quickActionCouponHistory = quickActionLedger?.couponHistory || [];

  const createMutation = trpc.users.createClient.useMutation({
    onSuccess: () => {
      toast({
        title: 'User created',
        description: 'Client user has been successfully created.',
      });
      setIsCreateOpen(false);
      setNewUserEmail('');
      setNewUserPassword('');
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'User deleted',
        description: 'User has been removed.',
      });
      setDeletingUserId(null);
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setDeletingUserId(null);
    },
  });

  const updateFinanceControlsMutation = trpc.users.updateFinanceControls.useMutation({
    onSuccess: async () => {
      await financeControlsQuery.refetch();
      toast({
        title: 'Finance controls updated',
        description: 'Finance permissions and digest settings were saved.',
      });
      setFinanceDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Finance controls failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runFinanceDigestMutation = trpc.users.runFinanceDigestNow.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.skipped ? 'Finance digest skipped' : 'Finance digest sent',
        description: result.skipped
          ? `Reason: ${result.reason || 'n/a'}`
          : `Delivered to ${result.adminChats ?? 0} admin chat(s).`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Finance digest failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const reviewRefundRequestMutation = trpc.users.reviewRefundRequest.useMutation({
    onSuccess: async () => {
      await refundQueueQuery.refetch();
      toast({
        title: 'Refund request updated',
        description: 'The customer refund request status was updated.',
      });
      setRefundReviewDialog(null);
      setRefundReasonPresetCode('');
      setRefundReviewNote('');
      setRefundReviewCustomerMessage('');
    },
    onError: (error) => {
      toast({
        title: 'Refund review failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const claimRefundRequestMutation = trpc.users.claimRefundRequest.useMutation({
    onSuccess: async (_result, variables) => {
      await refundQueueQuery.refetch();
      toast({
        title: variables.claimed ? 'Refund request claimed' : 'Refund request released',
      });
    },
    onError: (error) => {
      toast({
        title: 'Refund assignment failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const assignRefundReviewerMutation = trpc.users.assignRefundReviewer.useMutation({
    onSuccess: async () => {
      await refundQueueQuery.refetch();
      toast({
        title: 'Refund reviewer updated',
      });
    },
    onError: (error) => {
      toast({
        title: 'Refund reassignment failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const sendDirectTelegramMessageMutation = trpc.users.sendDirectTelegramMessage.useMutation({
    onSuccess: async () => {
      await quickActionLedgerQuery.refetch();
      toast({
        title: 'Telegram message sent',
        description: 'The direct customer message was delivered.',
      });
      setQuickActionMessage('');
    },
    onError: (error) => {
      toast({
        title: 'Telegram message failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const resendTelegramOrderReceiptMutation = trpc.users.resendTelegramOrderReceipt.useMutation({
    onSuccess: async () => {
      await quickActionLedgerQuery.refetch();
      toast({
        title: 'Receipt resent',
        description: 'The Telegram receipt was sent again.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Receipt resend failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const resendCustomerSharePageMutation = trpc.users.resendCustomerSharePage.useMutation({
    onSuccess: async () => {
      await quickActionLedgerQuery.refetch();
      toast({
        title: 'Share page resent',
        description: 'The customer received the share page again in Telegram.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Share resend failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const updatePromoEligibilityOverrideMutation = trpc.users.updatePromoEligibilityOverride.useMutation({
    onSuccess: async () => {
      await quickActionLedgerQuery.refetch();
      toast({
        title: 'Promo override saved',
        description: 'Customer promo eligibility was updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Promo override failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const updateCouponStatusMutation = trpc.users.updateCouponStatus.useMutation({
    onSuccess: async (result) => {
      await quickActionLedgerQuery.refetch();
      toast({
        title: result.status === 'CANCELLED' ? 'Coupon revoked' : 'Coupon expired',
        description: `${result.couponCode} is no longer available to this customer.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Coupon update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateAdminScopeMutation = trpc.users.updateAdminScope.useMutation({
    onSuccess: async (updated) => {
      await refetch();
      toast({
        title: 'Admin scope updated',
        description: `${updated.email} is now ${getAdminScopeLabel(updated.adminScope)}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Admin scope update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    const controls = financeControlsQuery.data;
    if (!controls) {
      return;
    }
    setFinanceOwnerEmails((controls.ownerEmails || []).join(', '));
    setFinanceOperatorEmails((controls.operatorEmails || []).join(', '));
    setFinanceDigestEnabled(Boolean(controls.dailyFinanceDigestEnabled));
    setFinanceDigestHour(String(controls.dailyFinanceDigestHour ?? 21));
    setFinanceDigestMinute(String(controls.dailyFinanceDigestMinute ?? 0));
  }, [financeControlsQuery.data]);

  const handleCreate = () => {
    if (!newUserEmail || !newUserPassword) return;
    createMutation.mutate({
      email: newUserEmail,
      password: newUserPassword,
    });
  };

  const handleDelete = (id: string, email: string) => {
    setUserToDelete({ id, email });
  };

  const openRefundReviewDialog = (
    orderId: string,
    orderCode: string,
    action: RefundReviewAction,
  ) => {
    const defaultPreset =
      action === 'APPROVE' ? 'approved_policy_eligible' : 'reject_manual_review';
    const preset = getRefundReasonPreset(defaultPreset);
    setRefundReviewDialog({ orderId, orderCode, action });
    setRefundReasonPresetCode(defaultPreset);
    setRefundReviewNote(preset?.adminNote || '');
    setRefundReviewCustomerMessage(preset?.customerMessage || '');
  };

  const applyRefundPreset = (code: string) => {
    setRefundReasonPresetCode(code);
    const preset = getRefundReasonPreset(code);
    if (preset) {
      setRefundReviewNote(preset.adminNote);
      setRefundReviewCustomerMessage(preset.customerMessage);
    }
  };

  const isRefundClaimedByCurrentUser = (order: (typeof refundQueue)[number]) =>
    Boolean(order.refundAssignedReviewerUserId && currentReviewerId && order.refundAssignedReviewerUserId === currentReviewerId);

  const isRefundClaimedByOtherUser = (order: (typeof refundQueue)[number]) =>
    Boolean(order.refundAssignedReviewerUserId && (!currentReviewerId || order.refundAssignedReviewerUserId !== currentReviewerId));

  const runRefundMacro = (order: (typeof refundQueue)[number], presetCode: string) => {
    const preset = getRefundReasonPreset(presetCode);
    if (!preset) {
      return;
    }

    reviewRefundRequestMutation.mutate({
      orderId: order.id,
      action: preset.action,
      reasonPresetCode: preset.code,
      note: preset.adminNote,
      customerMessage: preset.customerMessage,
    });
  };

  const formatRefundMacroLabel = (presetCode: string) => {
    switch (presetCode) {
      case 'approved_policy_eligible':
        return 'Quick approve';
      case 'reject_usage_over_5gb':
        return 'Reject > 5 GB';
      case 'reject_purchase_count':
        return 'Reject < 4 paid';
      default:
        return getRefundReasonPreset(presetCode)?.label || presetCode;
    }
  };

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <Users className="mr-2 h-3.5 w-3.5" />
              User Directory
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                User management
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Manage administrative access, provision portal users, and keep client accounts aligned with active keys.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <UserStatCard
                label="Total users"
                value={userList.length}
                helper="Admin and client accounts in the panel."
              />
              <UserStatCard
                label="Admins"
                value={adminCount}
                helper={`${ownerCount} owner-level admin${ownerCount === 1 ? '' : 's'} configured.`}
              />
              <UserStatCard
                label="Clients"
                value={clientCount}
                helper="Portal-only accounts for end users."
              />
              <UserStatCard
                label="Assigned keys"
                value={assignedKeyCount}
                helper="Access keys currently mapped to users."
              />
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">User controls</p>
                <h2 className="text-xl font-semibold">Command rail</h2>
                <p className="text-sm text-muted-foreground">
                  Add a new portal user, then jump into sessions or security settings without leaving the directory.
                </p>
              </div>

              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="h-11 w-full rounded-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add user
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create client user</DialogTitle>
                    <DialogDescription>
                      Create a portal-only user for subscriptions, usage visibility, and key delivery.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-user-email">Email</Label>
                      <Input
                        id="new-user-email"
                        placeholder="user@example.com"
                        type="email"
                        value={newUserEmail}
                        onChange={(event) => setNewUserEmail(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-user-password">Password</Label>
                      <Input
                        id="new-user-password"
                        placeholder="Enter a temporary password"
                        type="password"
                        value={newUserPassword}
                        onChange={(event) => setNewUserPassword(event.target.value)}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={createMutation.isPending || !newUserEmail || !newUserPassword}
                    >
                      {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create user
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="space-y-2">
                <Link href="/dashboard/sessions" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <User className="h-4 w-4 text-primary" />
                    Review sessions
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Link href="/dashboard/security" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Shield className="h-4 w-4 text-primary" />
                    Open security
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Link href="/dashboard/analytics" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4 text-primary" />
                    Revenue overview
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Dialog open={financeDialogOpen} onOpenChange={setFinanceDialogOpen}>
                  <DialogTrigger asChild>
                    <button type="button" className="ops-action-tile text-left">
                      <span className="inline-flex items-center gap-2 text-sm font-medium">
                        <Wallet className="h-4 w-4 text-primary" />
                        Finance controls
                      </span>
                      <span className="text-xs text-muted-foreground">Manage</span>
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Finance controls</DialogTitle>
                      <DialogDescription>
                        Limit who can refund or credit Telegram orders, and control the daily finance digest.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="finance-owner-emails">Legacy owner email allowlist</Label>
                        <Input
                          id="finance-owner-emails"
                          placeholder="owner@example.com, second-owner@example.com"
                          value={financeOwnerEmails}
                          onChange={(event) => setFinanceOwnerEmails(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Prefer assigning the `Owner` admin scope below. Leave blank to avoid legacy email overrides.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="finance-operator-emails">Legacy finance operator allowlist</Label>
                        <Input
                          id="finance-operator-emails"
                          placeholder="finance@example.com, reviewer@example.com"
                          value={financeOperatorEmails}
                          onChange={(event) => setFinanceOperatorEmails(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Prefer assigning the `Finance` admin scope below. These emails remain as a compatibility fallback.
                        </p>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-border/50 p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Daily finance digest</p>
                          <p className="text-xs text-muted-foreground">
                            Send revenue, refund, credit, and pending refund-request summaries to admin chats.
                          </p>
                        </div>
                        <Select value={financeDigestEnabled ? 'enabled' : 'disabled'} onValueChange={(value) => setFinanceDigestEnabled(value === 'enabled')}>
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enabled">Enabled</SelectItem>
                            <SelectItem value="disabled">Disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="finance-digest-hour">Digest hour</Label>
                          <Input
                            id="finance-digest-hour"
                            inputMode="numeric"
                            value={financeDigestHour}
                            onChange={(event) => setFinanceDigestHour(event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="finance-digest-minute">Digest minute</Label>
                          <Input
                            id="finance-digest-minute"
                            inputMode="numeric"
                            value={financeDigestMinute}
                            onChange={(event) => setFinanceDigestMinute(event.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => runFinanceDigestMutation.mutate()}
                        disabled={!canManageFinance || runFinanceDigestMutation.isPending}
                      >
                        {runFinanceDigestMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Send digest now
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setFinanceDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() =>
                            updateFinanceControlsMutation.mutate({
                              ownerEmails: financeOwnerEmails
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean),
                              operatorEmails: financeOperatorEmails
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean),
                              dailyFinanceDigestEnabled: financeDigestEnabled,
                              dailyFinanceDigestHour: Math.min(23, Math.max(0, Number(financeDigestHour) || 0)),
                              dailyFinanceDigestMinute: Math.min(59, Math.max(0, Number(financeDigestMinute) || 0)),
                            })
                          }
                          disabled={!canConfigureFinance || updateFinanceControlsMutation.isPending}
                        >
                          {updateFinanceControlsMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Save finance controls
                        </Button>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Access note</p>
                <h2 className="text-xl font-semibold">Account policy</h2>
              </div>
              <div className="ops-detail-card space-y-2">
                <p className="text-sm text-muted-foreground">
                  Admins can manage the full control center. Client users only access their subscription and key delivery portal.
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Role split</p>
                    <p className="mt-2 text-sm font-medium">{adminCount} admin / {clientCount} client</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Key coverage</p>
                    <p className="mt-2 text-sm font-medium">{assignedKeyCount} assigned access keys</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card className="ops-panel">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Wallet className="h-5 w-5 text-primary" />
                Refund review queue
              </CardTitle>
              <CardDescription>
                Review pending refund requests, apply presets, and open the linked customer ledger when more context is needed.
              </CardDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending</p>
                <p className="mt-2 text-lg font-semibold">{refundQueueSummary?.pending || 0}</p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Approved</p>
                <p className="mt-2 text-lg font-semibold">{refundQueueSummary?.approved || 0}</p>
              </div>
              <div className="ops-mini-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Rejected</p>
                <p className="mt-2 text-lg font-semibold">{refundQueueSummary?.rejected || 0}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="ops-filter-bar grid gap-3 md:grid-cols-[220px_220px_220px_minmax(220px,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="refund-status-filter">Refund status</Label>
              <Select value={refundQueueStatus} onValueChange={(value) => setRefundQueueStatus(value as RefundQueueFilter)}>
                <SelectTrigger id="refund-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending review</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="ALL">All refund requests</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-assignment-filter">Reviewer ownership</Label>
              <Select
                value={refundQueueAssignment}
                onValueChange={(value) => setRefundQueueAssignment(value as RefundQueueAssignmentFilter)}
              >
                <SelectTrigger id="refund-assignment-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All assignments</SelectItem>
                  <SelectItem value="UNCLAIMED">Unclaimed</SelectItem>
                  <SelectItem value="MINE">Claimed by me</SelectItem>
                  <SelectItem value="CLAIMED">Claimed by any reviewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-sort-filter">Queue order</Label>
              <Select value={refundQueueSort} onValueChange={(value) => setRefundQueueSort(value as RefundQueueSort)}>
                <SelectTrigger id="refund-sort-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REQUESTED_DESC">Newest first</SelectItem>
                  <SelectItem value="REQUESTED_ASC">Oldest first</SelectItem>
                  <SelectItem value="AMOUNT_DESC">Highest value first</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-search-filter">Search</Label>
              <Input
                id="refund-search-filter"
                value={refundQueueSearch}
                onChange={(event) => setRefundQueueSearch(event.target.value)}
                placeholder="Order code, email, Telegram, plan..."
              />
            </div>
            <div className="ops-table-meta">
              {refundQueue.length} refund request{refundQueue.length === 1 ? '' : 's'}
            </div>
          </div>

          {refundQueueQuery.isLoading ? (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
              Loading refund queue...
            </div>
          ) : refundQueue.length === 0 ? (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
              No refund requests match the current filter.
            </div>
          ) : (
            <div className="space-y-3">
              {refundQueue.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[1.2rem] border border-border/60 bg-background/45 p-4 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{order.orderCode}</p>
                        <Badge variant="outline">{order.refundRequestStatus}</Badge>
                        <Badge variant="secondary">{order.kind}</Badge>
                        <Badge variant="outline">{order.financeStatus}</Badge>
                        {order.refundAssignedReviewerEmail ? (
                          <Badge variant={isRefundClaimedByCurrentUser(order) ? 'default' : 'outline'}>
                            {isRefundClaimedByCurrentUser(order)
                              ? `Claimed by you`
                              : `Claimed by ${order.refundAssignedReviewerEmail}`}
                          </Badge>
                        ) : null}
                        {order.refundReviewReasonCode ? (
                          <Badge variant="outline">
                            {resolveRefundReasonPresetLabel(order.refundReviewReasonCode) || order.refundReviewReasonCode}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">Customer:</span>{' '}
                            {order.requestedEmail || order.telegramUsername || order.telegramUserId}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Plan:</span>{' '}
                            {order.planName || order.planCode || '—'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Amount:</span>{' '}
                            {formatMoney(order.priceAmount, order.priceCurrency)}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Key usage:</span>{' '}
                            {formatBytes(BigInt(order.usedBytes || '0'))}
                          </p>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">Requested:</span>{' '}
                            {order.refundRequestedAt ? formatDateTime(order.refundRequestedAt) : '—'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Paid purchases:</span>{' '}
                            {order.fulfilledPaidPurchaseCount}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Reviewed:</span>{' '}
                            {order.refundRequestReviewedAt ? formatDateTime(order.refundRequestReviewedAt) : '—'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Claimed:</span>{' '}
                            {order.refundAssignedAt ? formatDateTime(order.refundAssignedAt) : '—'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Reviewer:</span>{' '}
                            {order.refundRequestReviewerEmail || '—'}
                          </p>
                        </div>
                      </div>

                      {order.refundBlockedReason ? (
                        <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                          <span className="font-medium">Policy note:</span> {order.refundBlockedReason}
                        </div>
                      ) : null}

                      {order.refundRequestCustomerMessage ? (
                        <div className="rounded-[1rem] border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground dark:bg-white/[0.03]">
                          <span className="font-medium text-foreground">Customer-facing message:</span>{' '}
                          {order.refundRequestCustomerMessage}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 lg:w-[220px]">
                      {order.customerLedgerId ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/users/${order.customerLedgerId}`}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open CRM
                          </Link>
                        </Button>
                      ) : null}
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={withBasePath(`/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=receipt&format=pdf`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Receipt PDF
                        </a>
                      </Button>
                      {order.refundRequestStatus === 'APPROVED' || order.financeStatus === 'REFUNDED' ? (
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={withBasePath(`/api/finance/receipt?orderCode=${encodeURIComponent(order.orderCode)}&type=refund&format=pdf`)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Refund PDF
                          </a>
                        </Button>
                      ) : null}
                      {order.refundRequestStatus === 'PENDING' ? (
                        <>
                          <div className="grid gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Quick macros
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {quickRefundMacros.map((preset) => (
                                <Button
                                  key={preset.code}
                                  size="sm"
                                  variant={preset.action === 'APPROVE' ? 'secondary' : 'outline'}
                                  disabled={
                                    !canManageFinance ||
                                    isRefundClaimedByOtherUser(order) ||
                                    reviewRefundRequestMutation.isPending
                                  }
                                  onClick={() => runRefundMacro(order, preset.code)}
                                >
                                  {formatRefundMacroLabel(preset.code)}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div className="grid gap-2">
                            {!order.refundAssignedReviewerUserId ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={!canManageFinance || claimRefundRequestMutation.isPending}
                                onClick={() => claimRefundRequestMutation.mutate({ orderId: order.id, claimed: true })}
                              >
                                Claim refund
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  !canManageFinance ||
                                  claimRefundRequestMutation.isPending ||
                                  isRefundClaimedByOtherUser(order)
                                }
                                onClick={() => claimRefundRequestMutation.mutate({ orderId: order.id, claimed: false })}
                              >
                                Release claim
                              </Button>
                            )}

                            <Select
                              value={order.refundAssignedReviewerUserId || 'unassigned'}
                              onValueChange={(value) =>
                                assignRefundReviewerMutation.mutate({
                                  orderId: order.id,
                                  reviewerUserId: value === 'unassigned' ? null : value,
                                })
                              }
                              disabled={!canManageFinance || assignRefundReviewerMutation.isPending}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Assign reviewer" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {adminUsers.map((admin) => (
                                  <SelectItem key={admin.id} value={admin.id}>
                                    {admin.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            variant={isRefundClaimedByOtherUser(order) ? 'outline' : 'default'}
                            disabled={!canManageFinance || isRefundClaimedByOtherUser(order)}
                            onClick={() => openRefundReviewDialog(order.id, order.orderCode, 'APPROVE')}
                          >
                            Approve request
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canManageFinance || isRefundClaimedByOtherUser(order)}
                            onClick={() => openRefundReviewDialog(order.id, order.orderCode, 'REJECT')}
                          >
                            Decline request
                          </Button>
                          {isRefundClaimedByOtherUser(order) ? (
                            <div className="rounded-[1rem] border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground dark:bg-white/[0.03]">
                              This refund request is currently owned by {order.refundAssignedReviewerEmail || 'another admin'}.
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="rounded-[1rem] border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground dark:bg-white/[0.03]">
                          Updated {order.refundRequestReviewedAt ? formatRelativeTime(order.refundRequestReviewedAt) : 'recently'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="ops-panel">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-5 w-5 text-primary" />
            User inventory
          </CardTitle>
          <CardDescription>
            Search by email or focus on one role to manage access and assigned keys faster.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="ops-filter-bar grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="user-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="user-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search users by email"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-role-filter">Role</Label>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
                <SelectTrigger id="user-role-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ops-table-meta">{filteredUsers.length} users</div>
          </div>

          <div className="hidden md:block">
            <div className="ops-data-shell">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Admin scope</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Assigned keys</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        Loading users...
                      </TableCell>
                    </TableRow>
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        {userList.length === 0 ? 'No users found.' : 'No users match the current filters.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => {
                      const assignedKeys = (user as { _count?: { accessKeys?: number } })._count?.accessKeys || 0;
                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-cyan-400/10 dark:text-cyan-200">
                                <User className="h-4 w-4" />
                              </span>
                              <div>
                                <p className="font-medium">{user.email}</p>
                                <p className="text-xs text-muted-foreground">
                                  {user.role === 'ADMIN' ? 'Dashboard access' : 'Portal-only access'}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.role === 'ADMIN' ? (
                              <Select
                                value={normalizeAdminScope(user.adminScope) || 'ADMIN'}
                                onValueChange={(value) =>
                                  updateAdminScopeMutation.mutate({
                                    userId: user.id,
                                    adminScope: value as AdminScopeValue,
                                  })
                                }
                                disabled={!canManageUserScopes || updateAdminScopeMutation.isPending}
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ADMIN_SCOPE_VALUES.map((scope) => (
                                    <SelectItem key={scope} value={scope}>
                                      {getAdminScopeLabel(scope)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Key className="h-3.5 w-3.5 text-muted-foreground" />
                              {assignedKeys}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/dashboard/users/${user.id}`}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Open CRM
                                </Link>
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  setQuickActionsUser({
                                    id: user.id,
                                    email: user.email || 'Unknown',
                                  })
                                }
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Quick actions
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDelete(user.id, user.email || 'Unknown')}
                                disabled={user.role === 'ADMIN' || (deleteMutation.isPending && deletingUserId === user.id)}
                                title={user.role === 'ADMIN' ? 'Cannot delete admin' : 'Delete user'}
                              >
                                {deleteMutation.isPending && deletingUserId === user.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <MobileCardView
            data={filteredUsers}
            emptyMessage={userList.length === 0 ? 'No users found.' : 'No users match the current filters.'}
            keyExtractor={(user) => user.id}
            renderCard={(user) => {
              const assignedKeys = (user as { _count?: { accessKeys?: number } })._count?.accessKeys || 0;
              const deleting = deleteMutation.isPending && deletingUserId === user.id;

              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-cyan-400/10 dark:text-cyan-200">
                          <User className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-medium">{user.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.role === 'ADMIN' ? 'Dashboard access' : 'Portal-only access'}
                          </p>
                        </div>
                      </div>
                      <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(user.id, user.email || 'Unknown')}
                      disabled={user.role === 'ADMIN' || deleting}
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Created</p>
                      <p className="mt-2 text-sm font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assigned keys</p>
                      <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium">
                        <Key className="h-3.5 w-3.5 text-muted-foreground" />
                        {assignedKeys}
                      </p>
                    </div>
                  </div>

                  {user.role === 'ADMIN' ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin scope</p>
                      <Select
                        value={normalizeAdminScope(user.adminScope) || 'ADMIN'}
                        onValueChange={(value) =>
                          updateAdminScopeMutation.mutate({
                            userId: user.id,
                            adminScope: value as AdminScopeValue,
                          })
                        }
                        disabled={!canManageUserScopes || updateAdminScopeMutation.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ADMIN_SCOPE_VALUES.map((scope) => (
                            <SelectItem key={scope} value={scope}>
                              {getAdminScopeLabel(scope)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button asChild variant="outline" className="w-full rounded-full">
                      <Link href={`/dashboard/users/${user.id}`}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open CRM
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full rounded-full"
                      onClick={() =>
                        setQuickActionsUser({
                          id: user.id,
                          email: user.email || 'Unknown',
                        })
                      }
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Quick actions
                    </Button>
                  </div>
                </div>
              );
            }}
          />
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(quickActionsUser)}
        onOpenChange={(open) => {
          if (!open) {
            setQuickActionsUser(null);
            setQuickActionMessage('');
            setQuickActionReceiptOrderId('');
            setQuickActionShareTarget('');
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Customer quick actions</DialogTitle>
            <DialogDescription>
              {quickActionsUser?.email || 'Selected customer'} without leaving the user list.
            </DialogDescription>
          </DialogHeader>
          {quickActionLedgerQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading customer shortcuts…
            </div>
          ) : quickActionLedger ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Telegram</p>
                  <p className="mt-2 text-lg font-semibold">
                    {quickActionLedger.telegramProfile?.telegramChatId || quickActionLedger.user.telegramChatId || 'Not linked'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {quickActionLedger.telegramProfile?.username ? `@${quickActionLedger.telegramProfile.username}` : 'No username'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fulfilled orders</p>
                  <p className="mt-2 text-lg font-semibold">
                    {quickActionTelegramOrders.filter((order) => order.status === 'FULFILLED').length}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Ready for receipt resend</p>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active keys</p>
                  <p className="mt-2 text-lg font-semibold">
                    {quickActionAccessKeys.length + quickActionDynamicKeys.length}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Share page resend available</p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Direct Telegram message</p>
                      <p className="text-xs text-muted-foreground">Send a short customer update from the directory.</p>
                    </div>
                    <Switch
                      checked={quickActionIncludeSupportButton}
                      onCheckedChange={setQuickActionIncludeSupportButton}
                    />
                  </div>
                  <Textarea
                    className="mt-3 min-h-[120px]"
                    value={quickActionMessage}
                    onChange={(event) => setQuickActionMessage(event.target.value)}
                    placeholder="Write a direct Telegram message…"
                    disabled={!quickActionLedger.crmPermissions.canMessageCustomer}
                  />
                  <Button
                    className="mt-3 w-full"
                    disabled={
                      !quickActionLedger.crmPermissions.canMessageCustomer ||
                      sendDirectTelegramMessageMutation.isPending ||
                      quickActionMessage.trim().length < 3
                    }
                    onClick={() =>
                      sendDirectTelegramMessageMutation.mutate({
                        userId: quickActionLedger.user.id,
                        message: quickActionMessage.trim(),
                        includeSupportButton: quickActionIncludeSupportButton,
                      })
                    }
                  >
                    {sendDirectTelegramMessageMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send message
                  </Button>
                </div>

                <div className="rounded-xl border border-border/60 p-4">
                  <p className="text-sm font-medium">Delivery shortcuts</p>
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <Label>Resend receipt</Label>
                      <Select value={quickActionReceiptOrderId} onValueChange={setQuickActionReceiptOrderId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a fulfilled order" />
                        </SelectTrigger>
                        <SelectContent>
                          {quickActionTelegramOrders
                            .filter((order) => order.status === 'FULFILLED')
                            .map((order) => (
                              <SelectItem key={order.id} value={order.id}>
                                {order.orderCode} • {order.planName || order.planCode || 'Order'}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={
                          !quickActionLedger.crmPermissions.canMessageCustomer ||
                          resendTelegramOrderReceiptMutation.isPending ||
                          !quickActionReceiptOrderId
                        }
                        onClick={() =>
                          resendTelegramOrderReceiptMutation.mutate({
                            orderId: quickActionReceiptOrderId,
                          })
                        }
                      >
                        {resendTelegramOrderReceiptMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Resend receipt
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Resend share page</Label>
                      <Select value={quickActionShareTarget} onValueChange={setQuickActionShareTarget}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a key" />
                        </SelectTrigger>
                        <SelectContent>
                          {quickActionAccessKeys.map((key) => (
                            <SelectItem key={`ACCESS_KEY:${key.id}`} value={`ACCESS_KEY:${key.id}`}>
                              Standard • {key.name}
                            </SelectItem>
                          ))}
                          {quickActionDynamicKeys.map((key) => (
                            <SelectItem key={`DYNAMIC_KEY:${key.id}`} value={`DYNAMIC_KEY:${key.id}`}>
                              Premium • {key.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={
                          !quickActionLedger.crmPermissions.canMessageCustomer ||
                          resendCustomerSharePageMutation.isPending ||
                          !quickActionShareTarget
                        }
                        onClick={() => {
                          const [keyType, keyId] = quickActionShareTarget.split(':');
                          if (!keyType || !keyId) return;
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
                        Resend share page
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Promo overrides</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {quickActionCouponEligibility.map((campaign) => (
                    <div key={campaign.campaignType} className="rounded-xl border border-border/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{campaign.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Remaining {campaign.remainingUses}/{campaign.maxUsesPerUser}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {campaign.overrideMode === 'FORCE_ALLOW'
                            ? 'Force allow'
                            : campaign.overrideMode === 'FORCE_BLOCK'
                              ? 'Suppressed'
                              : campaign.eligibleNow
                                ? 'Eligible'
                                : campaign.blockedReason || 'Blocked'}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={campaign.overrideMode === 'FORCE_ALLOW' ? 'default' : 'outline'}
                          disabled={
                            !quickActionLedger.crmPermissions.canManagePromoOverrides ||
                            updatePromoEligibilityOverrideMutation.isPending
                          }
                          onClick={() =>
                            updatePromoEligibilityOverrideMutation.mutate({
                              userId: quickActionLedger.user.id,
                              campaignType: campaign.campaignType,
                              mode: 'FORCE_ALLOW',
                            })
                          }
                        >
                          Force allow
                        </Button>
                        <Button
                          size="sm"
                          variant={campaign.overrideMode === 'FORCE_BLOCK' ? 'destructive' : 'outline'}
                          disabled={
                            !quickActionLedger.crmPermissions.canManagePromoOverrides ||
                            updatePromoEligibilityOverrideMutation.isPending
                          }
                          onClick={() =>
                            updatePromoEligibilityOverrideMutation.mutate({
                              userId: quickActionLedger.user.id,
                              campaignType: campaign.campaignType,
                              mode: 'FORCE_BLOCK',
                            })
                          }
                        >
                          Suppress
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={
                            !quickActionLedger.crmPermissions.canManagePromoOverrides ||
                            updatePromoEligibilityOverrideMutation.isPending ||
                            !campaign.overrideMode
                          }
                          onClick={() =>
                            updatePromoEligibilityOverrideMutation.mutate({
                              userId: quickActionLedger.user.id,
                              campaignType: campaign.campaignType,
                              mode: 'DEFAULT',
                            })
                          }
                        >
                          Use rules
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {quickActionCouponHistory.some((coupon) => coupon.status === 'ISSUED') ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Coupon actions</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {quickActionCouponHistory
                      .filter((coupon) => coupon.status === 'ISSUED')
                      .slice(0, 4)
                      .map((coupon) => (
                        <div key={coupon.id} className="rounded-xl border border-border/60 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{coupon.couponCode}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {coupon.campaignType} • {coupon.couponDiscountLabel || formatMoney(coupon.couponDiscountAmount, coupon.currency)}
                              </p>
                            </div>
                            <Badge variant="outline">{coupon.status}</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                !quickActionLedger.crmPermissions.canManageCoupons ||
                                updateCouponStatusMutation.isPending
                              }
                              onClick={() =>
                                updateCouponStatusMutation.mutate({
                                  couponId: coupon.id,
                                  action: 'EXPIRE',
                                  reason: 'Expired from user list quick actions',
                                })
                              }
                            >
                              Expire
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={
                                !quickActionLedger.crmPermissions.canManageCoupons ||
                                updateCouponStatusMutation.isPending
                              }
                              onClick={() =>
                                updateCouponStatusMutation.mutate({
                                  couponId: coupon.id,
                                  action: 'REVOKE',
                                  reason: 'Revoked from user list quick actions',
                                })
                              }
                            >
                              Revoke
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
              Customer quick actions are not available for this account yet.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickActionsUser(null)}>
              Close
            </Button>
            {quickActionsUser ? (
              <Button asChild>
                <Link href={`/dashboard/users/${quickActionsUser.id}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open CRM
                </Link>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!userToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
          }
        }}
        title="Delete user"
        description={userToDelete ? `Are you sure you want to delete user ${userToDelete.email}?` : ''}
        confirmLabel="Delete user"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!userToDelete) return;
          setDeletingUserId(userToDelete.id);
          deleteMutation.mutate({ id: userToDelete.id });
        }}
      />

      <Dialog
        open={!!refundReviewDialog}
        onOpenChange={(open) => {
          if (!open) {
            setRefundReviewDialog(null);
            setRefundReasonPresetCode('');
            setRefundReviewNote('');
            setRefundReviewCustomerMessage('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {refundReviewDialog?.action === 'APPROVE' ? 'Approve refund request' : 'Reject refund request'}
            </DialogTitle>
            <DialogDescription>
              Review {refundReviewDialog?.orderCode || 'this order'} with a preset, then adjust the admin note or customer message before sending the decision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Quick macros</Label>
              <div className="flex flex-wrap gap-2">
                {refundReasonPresets.map((preset) => (
                  <Button
                    key={preset.code}
                    type="button"
                    size="sm"
                    variant={refundReasonPresetCode === preset.code ? 'default' : 'outline'}
                    onClick={() => applyRefundPreset(preset.code)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reason-preset">Reason preset</Label>
              <Select value={refundReasonPresetCode} onValueChange={applyRefundPreset}>
                <SelectTrigger id="refund-reason-preset">
                  <SelectValue placeholder="Choose a preset" />
                </SelectTrigger>
                <SelectContent>
                  {refundReasonPresets.map((preset) => (
                    <SelectItem key={preset.code} value={preset.code}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-review-note">Admin note</Label>
              <Textarea
                id="refund-review-note"
                value={refundReviewNote}
                onChange={(event) => setRefundReviewNote(event.target.value)}
                placeholder="Internal finance note"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-customer-message">Customer message</Label>
              <Textarea
                id="refund-customer-message"
                value={refundReviewCustomerMessage}
                onChange={(event) => setRefundReviewCustomerMessage(event.target.value)}
                placeholder="Message sent to the customer in Telegram"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={refundReviewDialog?.action === 'APPROVE' ? 'default' : 'destructive'}
              disabled={!refundReviewDialog || reviewRefundRequestMutation.isPending}
              onClick={() => {
                if (!refundReviewDialog) {
                  return;
                }
                reviewRefundRequestMutation.mutate({
                  orderId: refundReviewDialog.orderId,
                  action: refundReviewDialog.action,
                  reasonPresetCode: refundReasonPresetCode || null,
                  note: refundReviewNote || null,
                  customerMessage: refundReviewCustomerMessage || null,
                });
              }}
            >
              {reviewRefundRequestMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {refundReviewDialog?.action === 'APPROVE' ? 'Approve refund' : 'Reject refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
