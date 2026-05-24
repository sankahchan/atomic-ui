'use client';

/**
 * Settings Page - Redesigned with Collapsible Sections
 *
 * All settings sections are visible on one screen as tappable cards.
 * Tap a section to expand and see its details.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { APP_RELEASE_VERSION } from '@/lib/app-version';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { withBasePath } from '@/lib/base-path';
import { BackButton } from '@/components/ui/back-button';
import { settingsShortcutItems } from '@/components/layout/dashboard-nav';
import { cn } from '@/lib/utils';
import {
  Bell,
  Shield,
  Globe,
  ArrowRightLeft,
  Plus,
  Save,
  Loader2,
  RefreshCw,
  User,
  Key,
  Download,
  Trash2,
  FileText,
  History,
  ScrollText,
  ExternalLink,
  ChevronRight,
  Info,
  Palette,
  Pencil,
  TestTube,
  Upload,
} from 'lucide-react';
import Link from 'next/link';

// Section type for the collapsible cards
type SectionId = 'general' | 'health' | 'balancer' | 'backup' | 'audit' | 'notifications' | 'security' | 'about' | 'subscription' | null;
type RestoreJobStatus = 'SCHEDULED' | 'STOPPING_SERVICE' | 'RESTORING' | 'STARTING_SERVICE' | 'SUCCEEDED' | 'FAILED';

type AuditAlertRule = {
  id: string;
  name: string;
  isActive: boolean;
  actions: string[];
  entities: string[];
  actorIds: string[];
  keywords: string[];
  throttleMinutes: number;
  matchWindowMinutes: number;
  minMatches: number;
  createdAt: string;
  updatedAt: string;
};

type AuditAlertRuleFormState = {
  id?: string;
  name: string;
  isActive: boolean;
  actions: string;
  entities: string;
  actorIds: string;
  keywords: string;
  throttleMinutes: string;
  matchWindowMinutes: string;
  minMatches: string;
};

type ServerBalancerPolicyFormState = {
  scheduledRebalanceEnabled: boolean;
  autoApplySafeMoves: boolean;
  preferredCountryCodes: string;
  preferredCountryMode: 'PREFER' | 'ONLY';
  autoApplySameCountryOnly: boolean;
  maxRecommendationsPerRun: string;
  maxAutoMoveKeysPerRun: string;
  minAutoApplyLoadDelta: string;
};

const AUDIT_ALERT_RULE_MAX_THROTTLE_MINUTES = 24 * 60;
const AUDIT_ALERT_RULE_MAX_MATCH_WINDOW_MINUTES = 24 * 60;
const AUDIT_ALERT_RULE_MAX_MIN_MATCHES = 50;
const ACTIVE_RESTORE_JOB_STATUSES = new Set<RestoreJobStatus>(['SCHEDULED', 'STOPPING_SERVICE', 'RESTORING', 'STARTING_SERVICE']);

function formatRestoreJobStatus(status: RestoreJobStatus, isMyanmar: boolean) {
  switch (status) {
    case 'SCHEDULED':
      return isMyanmar ? 'အစီအစဉ်သတ်မှတ်ပြီး' : 'Scheduled';
    case 'STOPPING_SERVICE':
      return isMyanmar ? 'ဝန်ဆောင်မှု ရပ်နေသည်' : 'Stopping service';
    case 'RESTORING':
      return isMyanmar ? 'အရန်ဖိုင် ပြန်လည်ရယူနေသည်' : 'Restoring backup';
    case 'STARTING_SERVICE':
      return isMyanmar ? 'ဝန်ဆောင်မှု ပြန်စနေသည်' : 'Starting service';
    case 'SUCCEEDED':
      return isMyanmar ? 'အောင်မြင်ပါသည်' : 'Succeeded';
    case 'FAILED':
      return isMyanmar ? 'မအောင်မြင်ပါ' : 'Failed';
    default:
      return status;
  }
}

function getRestoreJobBadgeVariant(status: RestoreJobStatus): 'secondary' | 'warning' | 'success' | 'destructive' {
  switch (status) {
    case 'SUCCEEDED':
      return 'success';
    case 'FAILED':
      return 'destructive';
    case 'SCHEDULED':
    case 'STOPPING_SERVICE':
    case 'RESTORING':
    case 'STARTING_SERVICE':
    default:
      return 'warning';
  }
}

function buildAuditAlertRuleForm(rule?: AuditAlertRule | null): AuditAlertRuleFormState {
  return {
    id: rule?.id,
    name: rule?.name ?? '',
    isActive: rule?.isActive ?? true,
    actions: rule?.actions.join(', ') ?? '',
    entities: rule?.entities.join(', ') ?? '',
    actorIds: rule?.actorIds.join(', ') ?? '',
    keywords: rule?.keywords.join(', ') ?? '',
    throttleMinutes: String(rule?.throttleMinutes ?? 30),
    matchWindowMinutes: String(rule?.matchWindowMinutes ?? 10),
    minMatches: String(rule?.minMatches ?? 1),
  };
}

function splitCommaSeparated(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function buildServerBalancerPolicyForm(value?: unknown): ServerBalancerPolicyFormState {
  const policy = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  return {
    scheduledRebalanceEnabled: policy.scheduledRebalanceEnabled !== false,
    autoApplySafeMoves: policy.autoApplySafeMoves === true,
    preferredCountryCodes: Array.isArray(policy.preferredCountryCodes)
      ? policy.preferredCountryCodes.join(', ')
      : '',
    preferredCountryMode: policy.preferredCountryMode === 'ONLY' ? 'ONLY' : 'PREFER',
    autoApplySameCountryOnly: policy.autoApplySameCountryOnly !== false,
    maxRecommendationsPerRun: String(policy.maxRecommendationsPerRun ?? 3),
    maxAutoMoveKeysPerRun: String(policy.maxAutoMoveKeysPerRun ?? 2),
    minAutoApplyLoadDelta: String(policy.minAutoApplyLoadDelta ?? 18),
  };
}

/**
 * Collapsible Section Card
 */
function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  isOpen,
  onToggle,
  children,
}: {
  id: SectionId;
  icon: React.ElementType;
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(
      'transition-all duration-200 dark:border-cyan-400/14 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_22%),linear-gradient(180deg,rgba(5,12,25,0.94),rgba(4,10,22,0.84))] dark:shadow-[0_24px_60px_rgba(1,6,20,0.38)]',
      isOpen ? 'border-primary/25 shadow-[0_18px_48px_rgba(6,182,212,0.08)] dark:border-cyan-300/24 dark:shadow-[0_26px_62px_rgba(1,6,20,0.5),0_0_28px_rgba(34,211,238,0.08)]' : 'border-border/60'
    )}>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onToggle(isOpen ? null : id)}
        aria-expanded={isOpen}
      >
        <CardHeader className="cursor-pointer select-none py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'rounded-2xl border p-2.5',
                isOpen ? 'border-primary/20 bg-primary/10 dark:border-cyan-300/24 dark:bg-cyan-400/10' : 'border-border/60 bg-muted dark:border-cyan-400/12 dark:bg-white/[0.03]'
              )}>
                <Icon className={cn('w-5 h-5', isOpen ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
              </div>
            </div>
            <ChevronRight className={cn(
              'w-5 h-5 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-90'
            )} />
          </div>
        </CardHeader>
      </button>
      {isOpen && (
        <CardContent className="pt-0 pb-4 animate-in slide-in-from-top-2 duration-200">
          <div className="border-t border-border/60 pt-4">
            {children}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function SettingsShortcutGrid({
  className,
}: {
  className?: string;
}) {
  const { t } = useLocale();

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {settingsShortcutItems.map((item) => {
        const Icon = item.icon;

        return (
          <Link key={item.href} href={item.href} className="block">
            <div className="ops-support-card h-full p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 dark:hover:border-cyan-300/22">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium">{t(item.labelKey)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(item.descriptionKey)}
                </p>
              </div>
              <p className="mt-4 text-xs font-medium text-primary">
                {t('settings.hub.open')}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const isMyanmar = locale === 'my';
  const [openSection, setOpenSection] = useState<SectionId>(null);
  const utils = trpc.useUtils();
  const isBackupSectionOpen = openSection === 'backup';
  const isAuditSectionOpen = openSection === 'audit';
  const isBalancerSectionOpen = openSection === 'balancer';
  const [balancerPolicyForm, setBalancerPolicyForm] = useState<ServerBalancerPolicyFormState>(
    buildServerBalancerPolicyForm(),
  );
  const backupUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingBackup, setIsUploadingBackup] = useState(false);

  // Fetch current settings
  const { data: settings, isLoading, refetch } = trpc.settings.getAll.useQuery();
  const { data: currentUser, isLoading: isCurrentUserLoading } = trpc.auth.me.useQuery();
  const { data: auditRetentionStatus, isLoading: isAuditRetentionLoading } = trpc.audit.retentionStatus.useQuery(undefined, {
    enabled: isAuditSectionOpen,
    refetchOnWindowFocus: false,
  });
  const { data: auditAlertRules, isLoading: isAuditAlertRulesLoading } = trpc.audit.listAlertRules.useQuery(undefined, {
    enabled: isAuditSectionOpen,
    refetchOnWindowFocus: false,
  });
  const { data: balancerPlanPreview, isLoading: isBalancerPlanLoading, refetch: refetchBalancerPlan } = trpc.servers.rebalancePlan.useQuery({
    maxMoves: 3,
  }, {
    enabled: isBalancerSectionOpen,
    refetchOnWindowFocus: false,
  });
  const { data: balancerTargetPreview, isLoading: isBalancerTargetLoading, refetch: refetchBalancerTarget } = trpc.servers.recommendAssignmentTarget.useQuery(undefined, {
    enabled: isBalancerSectionOpen,
    refetchOnWindowFocus: false,
  });

  // Update setting mutation
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast({
        title: t('settings.toast.saved'),
        description: t('settings.toast.saved_desc'),
      });
      refetch();
      if (isBalancerSectionOpen) {
        void refetchBalancerPlan();
        void refetchBalancerTarget();
      }
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.failed_save'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runScheduledRebalanceMutation = trpc.servers.runScheduledRebalance.useMutation({
    onSuccess: (result) => {
      toast({
        title: t('settings.balancer.run_now_done'),
        description: formatTemplate(t('settings.balancer.run_now_done_desc'), {
          recommendations: result.recommendations,
          autoApplied: result.autoApplied,
        }),
      });
      void refetchBalancerPlan();
      void refetchBalancerTarget();
    },
    onError: (error) => {
      toast({
        title: t('settings.balancer.run_now_failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    setBalancerPolicyForm(buildServerBalancerPolicyForm(settings?.serverBalancerPolicy));
  }, [settings?.serverBalancerPolicy]);

  // Password change mutation
  const passwordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast({
        title: t('settings.toast.password_changed'),
        description: t('settings.toast.password_changed_desc'),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error) => {
      toast({
        title: t('settings.toast.failed_save'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Password/Profile change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [auditRetentionDaysInput, setAuditRetentionDaysInput] = useState('180');
  const [auditRuleDialogOpen, setAuditRuleDialogOpen] = useState(false);
  const [auditRuleForm, setAuditRuleForm] = useState<AuditAlertRuleFormState>(buildAuditAlertRuleForm());
  const canManageBackups = currentUser?.role === 'ADMIN' && currentUser.adminScope === 'OWNER';

  useEffect(() => {
    if (currentUser?.email) {
      setUsername(currentUser.email);
    }
  }, [currentUser?.email]);

  useEffect(() => {
    if (auditRetentionStatus) {
      setAuditRetentionDaysInput(String(auditRetentionStatus.retentionDays));
    }
  }, [auditRetentionStatus]);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      toast({
        title: t('settings.toast.password_mismatch'),
        description: t('settings.toast.password_mismatch_desc'),
        variant: 'destructive',
      });
      return;
    }

    if (newPassword && newPassword.length < 6) {
      toast({
        title: t('settings.toast.password_short'),
        description: t('settings.toast.password_short_desc'),
        variant: 'destructive',
      });
      return;
    }

    passwordMutation.mutate({
      currentPassword,
      newPassword: newPassword || undefined,
      newUsername: username !== currentUser?.email ? username : undefined,
    });
  };

  // Backup & Restore
  const { data: backups, isLoading: isBackupsLoading, refetch: refetchBackups } = trpc.backup.list.useQuery(undefined, {
    enabled: isBackupSectionOpen && canManageBackups,
  });
  const {
    data: backupVerificationHistory,
    isLoading: isBackupVerificationHistoryLoading,
    refetch: refetchBackupVerificationHistory,
  } = trpc.backup.verificationHistory.useQuery({ limit: 10 }, {
    enabled: isBackupSectionOpen && canManageBackups,
  });
  const {
    data: restoreJobs,
    isLoading: isRestoreJobsLoading,
    refetch: refetchRestoreJobs,
  } = trpc.backup.restoreJobs.useQuery({ limit: 5 }, {
    enabled: isBackupSectionOpen && canManageBackups,
    refetchInterval: (query) =>
      query.state.data?.some((job) => ACTIVE_RESTORE_JOB_STATUSES.has(job.status as RestoreJobStatus)) ? 3000 : false,
    refetchIntervalInBackground: false,
  });
  const { data: auditLogs, isLoading: isAuditLogsLoading } = trpc.audit.list.useQuery({ pageSize: 10 }, {
    enabled: isAuditSectionOpen,
  });
  const createBackupMutation = trpc.backup.create.useMutation({
    onSuccess: async (result) => {
      toast({
        title: t('settings.backup.create_success'),
        description: result.verification.restoreReady
          ? (isMyanmar ? 'အရန်သိမ်းကို ဖန်တီးပြီး ပြန်လည်တင်နိုင်ကြောင်း အတည်ပြုပြီးပါပြီ။' : 'Backup created and verified successfully.')
          : result.verification.error ?? (isMyanmar ? 'အရန်သိမ်းကို ဖန်တီးပြီးပါပြီ၊ သို့သော် အတည်ပြုစစ်ဆေးမှု မအောင်မြင်ပါ။' : 'Backup created, but verification failed.'),
        variant: result.verification.restoreReady ? 'default' : 'destructive',
      });
      await Promise.all([
        refetchBackups(),
        refetchBackupVerificationHistory(),
      ]);
    },
    onError: (error) => {
      toast({ title: isMyanmar ? 'အမှား' : 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteBackupMutation = trpc.backup.delete.useMutation({
    onSuccess: () => {
      toast({ title: t('settings.backup.delete_success') });
      refetchBackups();
    },
  });
  const verifyBackupMutation = trpc.backup.verify.useMutation({
    onSuccess: async (result) => {
      toast({
        title: result.restoreReady
          ? (isMyanmar ? 'အရန်သိမ်း အတည်ပြုစစ်ဆေးမှု အောင်မြင်ပါသည်' : 'Backup verification passed')
          : (isMyanmar ? 'အရန်သိမ်း အတည်ပြုစစ်ဆေးမှု မအောင်မြင်ပါ' : 'Backup verification failed'),
        description: result.restoreReady
          ? (isMyanmar ? `${result.filename} ကို ပြန်လည်တင်ရန် အသင့်ဖြစ်ပါသည်။` : `${result.filename} is ready to restore.`)
          : result.error ?? (isMyanmar ? 'အရန်သိမ်း အတည်ပြုစစ်ဆေးမှု မအောင်မြင်ပါ။' : 'Backup verification failed.'),
        variant: result.restoreReady ? 'default' : 'destructive',
      });
      await Promise.all([
        refetchBackups(),
        refetchBackupVerificationHistory(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'အရန်သိမ်း အတည်ပြုစစ်ဆေးမှု မအောင်မြင်ပါ' : 'Backup verification failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const restoreBackupMutation = trpc.backup.restore.useMutation({
    onSuccess: async (result) => {
      toast({
        title: isMyanmar ? 'Restore ကို စီစဉ်ထားပြီး' : 'Restore scheduled',
        description: isMyanmar
          ? `${result.filename} ကို restore လုပ်နေစဉ် Atomic-UI သည် စက္ကန့်အနည်းငယ်အတွင်း ပြန်လည်စတင်မည်။ Safety backup: ${result.safetyBackupFilename}။ ပြီးဆုံးပြီးနောက် ပြန်လည်ဝင်ရောက်ရန် လိုနိုင်သည်။`
          : `Atomic-UI will restart in a few seconds while restoring ${result.filename}. Safety backup: ${result.safetyBackupFilename}. You may need to sign in again after it finishes.`,
      });
      await Promise.all([
        refetchBackups(),
        refetchRestoreJobs(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'Restore ကို စတင်မရပါ' : 'Restore failed to start',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const updateAuditRetentionMutation = trpc.audit.updateRetention.useMutation({
    onSuccess: async (result) => {
      toast({
        title: isMyanmar ? 'Audit retention ကို အပ်ဒိတ်လုပ်ပြီး' : 'Audit retention updated',
        description: result.cleanupEnabled
          ? (isMyanmar ? `${result.retentionDays} ရက်ထက်ဟောင်းသော audit log များကို အလိုအလျောက် ရှင်းလင်းမည်။` : `Audit logs older than ${result.retentionDays} days will be cleaned up automatically.`)
          : (isMyanmar ? 'Audit log အလိုအလျောက် ရှင်းလင်းခြင်းကို ပိတ်ထားသည်။' : 'Automatic audit log cleanup is disabled.'),
      });
      await utils.audit.retentionStatus.invalidate();
      await utils.audit.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'Retention ကို အပ်ဒိတ်မလုပ်နိုင်ပါ' : 'Failed to update retention',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const cleanupAuditLogsMutation = trpc.audit.cleanupOld.useMutation({
    onSuccess: async (result) => {
      toast({
        title: isMyanmar ? 'Audit cleanup ပြီးဆုံးပါပြီ' : 'Audit cleanup complete',
        description: result.cleanupEnabled
          ? (isMyanmar ? `${result.retentionDays} ရက်ထက်ဟောင်းသော audit entry ${result.deletedCount} ခုကို ဖယ်ရှားပြီးပါပြီ။` : `Removed ${result.deletedCount} audit entries older than ${result.retentionDays} days.`)
          : (isMyanmar ? 'အလိုအလျောက် cleanup ကို ပိတ်ထားသောကြောင့် audit entry များကို မဖယ်ရှားပါ။' : 'Automatic cleanup is disabled, so no audit entries were removed.'),
      });
      await Promise.all([
        utils.audit.retentionStatus.invalidate(),
        utils.audit.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'Audit cleanup မအောင်မြင်ပါ' : 'Audit cleanup failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const upsertAuditAlertRuleMutation = trpc.audit.upsertAlertRule.useMutation({
    onSuccess: async (rule) => {
      toast({
        title: auditRuleForm.id
          ? (isMyanmar ? 'Audit rule ကို အပ်ဒိတ်လုပ်ပြီး' : 'Audit rule updated')
          : (isMyanmar ? 'Audit rule အသစ် ဖန်တီးပြီး' : 'Audit rule created'),
        description: isMyanmar
          ? `Rule "${rule.name}" သည် ယခု ${rule.isActive ? 'အသုံးပြုနေ' : 'ပိတ်ထား'} ပါသည်။`
          : `Rule "${rule.name}" is now ${rule.isActive ? 'active' : 'disabled'}.`,
      });
      setAuditRuleDialogOpen(false);
      setAuditRuleForm(buildAuditAlertRuleForm());
      await Promise.all([
        utils.audit.listAlertRules.invalidate(),
        utils.audit.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'Audit rule ကို မသိမ်းနိုင်ပါ' : 'Failed to save audit rule',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const deleteAuditAlertRuleMutation = trpc.audit.deleteAlertRule.useMutation({
    onSuccess: async () => {
      toast({
        title: isMyanmar ? 'Audit rule ကို ဖျက်ပြီး' : 'Audit rule deleted',
      });
      await Promise.all([
        utils.audit.listAlertRules.invalidate(),
        utils.audit.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'Audit rule ကို မဖျက်နိုင်ပါ' : 'Failed to delete audit rule',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const testAuditAlertRuleMutation = trpc.audit.testAlertRule.useMutation({
    onSuccess: (result) => {
      toast({
        title: isMyanmar ? 'စစ်ဆေးမှု သတိပေးချက် စမ်းသပ်ချက် ပို့ပြီး' : 'Audit alert test sent',
        description: isMyanmar
          ? `လက်ခံသူပစ်မှတ် ${result.recipients} ခုအတွင်း သတိပေးချက် ${result.delivered} ခု ပို့ပြီးပါပြီ။`
          : `Delivered ${result.delivered} alert(s) across ${result.recipients} recipient target(s).`,
      });
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'စစ်ဆေးမှု သတိပေးချက် စမ်းသပ်ချက် မအောင်မြင်ပါ' : 'Audit alert test failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateBackup = () => {
    createBackupMutation.mutate();
  };

  const handleTriggerBackupUpload = () => {
    backupUploadInputRef.current?.click();
  };

  const handleBackupUploadSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    setIsUploadingBackup(true);

    try {
      const formData = new FormData();
      formData.append('backup', selectedFile);

      const response = await fetch(withBasePath('/api/backup/upload'), {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string' && payload.error.trim().length > 0
            ? payload.error
            : isMyanmar ? 'အရန်သိမ်းဖိုင်တင်ခြင်း မအောင်မြင်ပါ။' : 'Backup upload failed.',
        );
      }

      toast({
        title: t('settings.backup.upload_success'),
        description:
          payload?.verification?.restoreReady
            ? (isMyanmar ? `${payload.filename} ကို အရန်သိမ်းစာရင်းမှ ပြန်လည်တင်ရန် အသင့်ဖြစ်ပါသည်။` : `${payload.filename} is ready to restore from the backup list.`)
            : payload?.verification?.error || (isMyanmar ? `${payload.filename} ကို တင်ပြီးသော်လည်း အတည်ပြုစစ်ဆေးမှု မအောင်မြင်ပါ။` : `${payload.filename} uploaded, but verification failed.`),
        variant: payload?.verification?.restoreReady ? 'default' : 'destructive',
      });
      await Promise.all([
        refetchBackups(),
        refetchBackupVerificationHistory(),
      ]);
    } catch (error) {
      toast({
        title: isMyanmar ? 'အရန်သိမ်းဖိုင်တင်ခြင်း မအောင်မြင်ပါ' : 'Backup upload failed',
        description: error instanceof Error ? error.message : isMyanmar ? 'အရန်သိမ်းဖိုင်တင်ခြင်း မအောင်မြင်ပါ။' : 'Backup upload failed.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingBackup(false);
    }
  };

  const handleRestoreBackup = (filename: string) => {
    if (!confirm(
      isMyanmar
        ? 'လက်ရှိဒေတာကို အစားထိုးရေးသားမည်၊ Atomic-UI ကို ပြန်လည်စတင်မည်၊ restore လုပ်မည့် backup ထဲတွင် session ဟောင်းများပါပါက သင့်ကို sign out လုပ်နိုင်သည်။ အရင် safety backup အသစ် ဖန်တီးမည်။ ဆက်လုပ်မလား?'
        : 'This will overwrite current data, restart Atomic-UI, and may sign you out if the restored backup contains older sessions. A fresh safety backup will be created first. Continue?',
    )) {
      return;
    }

    restoreBackupMutation.mutate({ filename });
  };

  const handleDeleteBackup = (filename: string) => {
    if (confirm(isMyanmar ? 'ဤ backup ကို ဖျက်လိုသည်မှာ သေချာပါသလား?' : 'Are you sure you want to delete this backup?')) {
      deleteBackupMutation.mutate({ filename });
    }
  };

  const handleDownloadBackup = (filename: string) => {
    window.open(withBasePath(`/api/backup/download?filename=${filename}`), '_blank');
  };

  const handleVerifyBackup = (filename: string) => {
    verifyBackupMutation.mutate({ filename });
  };
  const activeRestoreJob = restoreJobs?.find((job) => ACTIVE_RESTORE_JOB_STATUSES.has(job.status as RestoreJobStatus));
  const isRestoreJobRunning = Boolean(activeRestoreJob);
  const isRestorePendingForFilename = (filename: string) =>
    restoreBackupMutation.isPending && restoreBackupMutation.variables?.filename === filename;

  const handleSaveSetting = (key: string, value: unknown) => {
    updateMutation.mutate({ key, value });
  };

  const handleSaveBalancerPolicy = () => {
    const preferredCountryCodes = splitCommaSeparated(balancerPolicyForm.preferredCountryCodes)
      .map((countryCode) => countryCode.toUpperCase());

    const hasInvalidCountryCode = preferredCountryCodes.some((countryCode) => !/^[A-Z]{2}$/.test(countryCode));
    const maxRecommendationsPerRun = Number(balancerPolicyForm.maxRecommendationsPerRun);
    const maxAutoMoveKeysPerRun = Number(balancerPolicyForm.maxAutoMoveKeysPerRun);
    const minAutoApplyLoadDelta = Number(balancerPolicyForm.minAutoApplyLoadDelta);

    if (hasInvalidCountryCode) {
      toast({
        title: t('settings.balancer.invalid_title'),
        description: t('settings.balancer.invalid_country_codes'),
        variant: 'destructive',
      });
      return;
    }

    if (
      !Number.isInteger(maxRecommendationsPerRun) ||
      maxRecommendationsPerRun < 1 ||
      maxRecommendationsPerRun > 10 ||
      !Number.isInteger(maxAutoMoveKeysPerRun) ||
      maxAutoMoveKeysPerRun < 1 ||
      maxAutoMoveKeysPerRun > 5 ||
      !Number.isInteger(minAutoApplyLoadDelta) ||
      minAutoApplyLoadDelta < 5 ||
      minAutoApplyLoadDelta > 50
    ) {
      toast({
        title: t('settings.balancer.invalid_title'),
        description: t('settings.balancer.invalid_numeric_values'),
        variant: 'destructive',
      });
      return;
    }

    handleSaveSetting('serverBalancerPolicy', {
      scheduledRebalanceEnabled: balancerPolicyForm.scheduledRebalanceEnabled,
      autoApplySafeMoves: balancerPolicyForm.autoApplySafeMoves,
      preferredCountryCodes,
      preferredCountryMode: balancerPolicyForm.preferredCountryMode,
      autoApplySameCountryOnly: balancerPolicyForm.autoApplySameCountryOnly,
      maxRecommendationsPerRun,
      maxAutoMoveKeysPerRun,
      minAutoApplyLoadDelta,
    });
  };

  const parsedAuditRetentionDays = Number(auditRetentionDaysInput);
  const isAuditRetentionDaysValid =
    auditRetentionDaysInput.trim() !== '' &&
    Number.isInteger(parsedAuditRetentionDays) &&
    parsedAuditRetentionDays >= 0 &&
    parsedAuditRetentionDays <= 3650;
  const canSaveAuditRetention =
    isAuditRetentionDaysValid &&
    parsedAuditRetentionDays !== auditRetentionStatus?.retentionDays &&
    !updateAuditRetentionMutation.isPending;

  const handleSaveAuditRetention = () => {
    if (!isAuditRetentionDaysValid) {
      toast({
        title: 'Invalid retention value',
        description: 'Enter a whole number between 0 and 3650 days.',
        variant: 'destructive',
      });
      return;
    }

    updateAuditRetentionMutation.mutate({
      retentionDays: parsedAuditRetentionDays,
    });
  };

  const openCreateAuditRuleDialog = () => {
    setAuditRuleForm(buildAuditAlertRuleForm());
    setAuditRuleDialogOpen(true);
  };

  const openEditAuditRuleDialog = (rule: AuditAlertRule) => {
    setAuditRuleForm(buildAuditAlertRuleForm(rule));
    setAuditRuleDialogOpen(true);
  };

  const handleSaveAuditRule = () => {
    const ruleName = auditRuleForm.name.trim();
    const throttleMinutes = Number(auditRuleForm.throttleMinutes);
    const matchWindowMinutes = Number(auditRuleForm.matchWindowMinutes);
    const minMatches = Number(auditRuleForm.minMatches);

    if (!ruleName) {
      toast({
        title: 'Rule name is required',
        description: 'Give the audit alert rule a clear name before saving.',
        variant: 'destructive',
      });
      return;
    }

    if (
      !Number.isInteger(throttleMinutes) ||
      throttleMinutes < 0 ||
      throttleMinutes > AUDIT_ALERT_RULE_MAX_THROTTLE_MINUTES
    ) {
      toast({
        title: 'Invalid throttle value',
        description: `Enter a whole number between 0 and ${AUDIT_ALERT_RULE_MAX_THROTTLE_MINUTES} minutes.`,
        variant: 'destructive',
      });
      return;
    }

    if (
      !Number.isInteger(matchWindowMinutes) ||
      matchWindowMinutes < 1 ||
      matchWindowMinutes > AUDIT_ALERT_RULE_MAX_MATCH_WINDOW_MINUTES
    ) {
      toast({
        title: 'Invalid burst window',
        description: `Enter a whole number between 1 and ${AUDIT_ALERT_RULE_MAX_MATCH_WINDOW_MINUTES} minutes.`,
        variant: 'destructive',
      });
      return;
    }

    if (
      !Number.isInteger(minMatches) ||
      minMatches < 1 ||
      minMatches > AUDIT_ALERT_RULE_MAX_MIN_MATCHES
    ) {
      toast({
        title: 'Invalid threshold',
        description: `Enter a whole number between 1 and ${AUDIT_ALERT_RULE_MAX_MIN_MATCHES}.`,
        variant: 'destructive',
      });
      return;
    }

    upsertAuditAlertRuleMutation.mutate({
      id: auditRuleForm.id,
      name: ruleName,
      isActive: auditRuleForm.isActive,
      actions: splitCommaSeparated(auditRuleForm.actions),
      entities: splitCommaSeparated(auditRuleForm.entities),
      actorIds: splitCommaSeparated(auditRuleForm.actorIds),
      keywords: splitCommaSeparated(auditRuleForm.keywords),
      throttleMinutes,
      matchWindowMinutes,
      minMatches,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <div className="max-w-4xl space-y-5">
            <BackButton href="/dashboard" label={t('nav.dashboard')} />
            <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
              <Globe className="h-3.5 w-3.5" />
              {t('settings.hub.title')}
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">{t('settings.title')}</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t('settings.subtitle')}
              </p>
            </div>

            <div className="hidden sm:grid gap-3 lg:grid-cols-3 xl:max-w-3xl">
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.security')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.hub.security_desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.users')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.hub.users_desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.notifications')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.hub.notifications_desc')}</p>
              </div>
            </div>
          </div>

          <div className="hidden xl:grid gap-3">
            <SettingsShortcutGrid className="grid-cols-1" />
          </div>
        </div>
      </section>

      <SettingsShortcutGrid className="xl:hidden" />

      {/* Collapsible Sections */}
      <div className="space-y-3">
        {/* General Settings */}
        <SectionCard
          id="general"
          icon={Globe}
          title={t('settings.general.title')}
          description={t('settings.general.desc')}
          isOpen={openSection === 'general'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="siteName">{t('settings.general.site_name')}</Label>
                <Input
                  id="siteName"
                  defaultValue={settings?.siteName as string || 'Atomic-UI'}
                  onBlur={(e) => handleSaveSetting('siteName', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.general.site_name_desc')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultTheme">{t('settings.general.theme')}</Label>
                <Select
                  defaultValue={settings?.defaultTheme as string || 'dark'}
                  onValueChange={(value) => handleSaveSetting('defaultTheme', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('settings.general.theme.light')}</SelectItem>
                    <SelectItem value="dark">{t('settings.general.theme.dark')}</SelectItem>
                    <SelectItem value="system">{t('settings.general.theme.system')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('settings.general.theme_desc')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultLanguage">{t('settings.general.language')}</Label>
              <Select
                defaultValue={settings?.defaultLanguage as string || 'en'}
                onValueChange={(value) => handleSaveSetting('defaultLanguage', value)}
              >
                <SelectTrigger className="sm:w-1/2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="my">မြန်မာ (Burmese)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        {/* Subscription Page Customization */}
        <SectionCard
          id="subscription"
          icon={Palette}
          title={t('settings.subscription.title')}
          description={t('settings.subscription.desc')}
          isOpen={openSection === 'subscription'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('settings.subscription.intro')}
            </p>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="rounded-2xl">
                <Palette className="w-4 h-4 mr-2" />
                {t('settings.subscription.open')}
              </Button>
            </Link>
          </div>
        </SectionCard>

        {/* Health Monitoring */}
        <SectionCard
          id="health"
          icon={Shield}
          title={t('settings.health.title')}
          description={t('settings.health.desc')}
          isOpen={openSection === 'health'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="healthCheckInterval">{t('settings.health.interval')}</Label>
                <Input
                  id="healthCheckInterval"
                  type="number"
                  min="1"
                  max="60"
                  defaultValue={settings?.healthCheckIntervalMins as number || 5}
                  onBlur={(e) => handleSaveSetting('healthCheckIntervalMins', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.health.interval_desc')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="keyExpiryWarning">{t('settings.health.expiry')}</Label>
                <Input
                  id="keyExpiryWarning"
                  type="number"
                  min="1"
                  max="30"
                  defaultValue={settings?.keyExpiryWarningDays as number || 3}
                  onBlur={(e) => handleSaveSetting('keyExpiryWarningDays', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.health.expiry_desc')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trafficWarning">{t('settings.health.traffic')}</Label>
              <Input
                id="trafficWarning"
                type="number"
                min="50"
                max="99"
                className="sm:w-1/2"
                defaultValue={settings?.trafficWarningPercent as number || 80}
                onBlur={(e) => handleSaveSetting('trafficWarningPercent', parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.health.traffic_desc')}
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Smart Assignment & Rebalancing */}
        <SectionCard
          id="balancer"
          icon={ArrowRightLeft}
          title={t('settings.balancer.title')}
          description={t('settings.balancer.desc')}
          isOpen={openSection === 'balancer'}
          onToggle={setOpenSection}
        >
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {t('settings.balancer.preview_best_target')}
                </p>
                <p className="mt-3 text-base font-semibold">
                  {isBalancerTargetLoading
                    ? '...'
                    : balancerTargetPreview?.serverName ?? t('settings.balancer.no_target')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isBalancerTargetLoading
                    ? t('settings.balancer.loading')
                    : balancerTargetPreview
                      ? `${balancerTargetPreview.countryCode ?? 'Global'} • score ${balancerTargetPreview.loadScore}`
                      : t('settings.balancer.no_target_desc')}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {t('settings.balancer.preview_recommendations')}
                </p>
                <p className="mt-3 text-base font-semibold">
                  {isBalancerPlanLoading ? '...' : balancerPlanPreview?.summary.recommendedMoves ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('settings.balancer.preview_recommendations_desc')}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {t('settings.balancer.preview_overloaded')}
                </p>
                <p className="mt-3 text-base font-semibold">
                  {isBalancerPlanLoading ? '...' : balancerPlanPreview?.summary.overloadedServers ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('settings.balancer.preview_overloaded_desc')}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/60 p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{t('settings.balancer.scheduled_title')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('settings.balancer.scheduled_desc')}
                    </p>
                  </div>
                  <Switch
                    checked={balancerPolicyForm.scheduledRebalanceEnabled}
                    onCheckedChange={(checked) => setBalancerPolicyForm((current) => ({ ...current, scheduledRebalanceEnabled: checked }))}
                  />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{t('settings.balancer.auto_apply_title')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('settings.balancer.auto_apply_desc')}
                    </p>
                  </div>
                  <Switch
                    checked={balancerPolicyForm.autoApplySafeMoves}
                    onCheckedChange={(checked) => setBalancerPolicyForm((current) => ({ ...current, autoApplySafeMoves: checked }))}
                  />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{t('settings.balancer.same_country_title')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('settings.balancer.same_country_desc')}
                    </p>
                  </div>
                  <Switch
                    checked={balancerPolicyForm.autoApplySameCountryOnly}
                    onCheckedChange={(checked) => setBalancerPolicyForm((current) => ({ ...current, autoApplySameCountryOnly: checked }))}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 p-4 space-y-4">
                <div className="space-y-2">
                  <Label>{t('settings.balancer.region_mode')}</Label>
                  <Select
                    value={balancerPolicyForm.preferredCountryMode}
                    onValueChange={(value: 'PREFER' | 'ONLY') => setBalancerPolicyForm((current) => ({ ...current, preferredCountryMode: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PREFER">{t('settings.balancer.region_mode_prefer')}</SelectItem>
                      <SelectItem value="ONLY">{t('settings.balancer.region_mode_only')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preferredCountries">{t('settings.balancer.preferred_countries')}</Label>
                  <Input
                    id="preferredCountries"
                    value={balancerPolicyForm.preferredCountryCodes}
                    onChange={(e) => setBalancerPolicyForm((current) => ({ ...current, preferredCountryCodes: e.target.value }))}
                    placeholder={t('settings.balancer.preferred_countries_placeholder')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.balancer.preferred_countries_desc')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="maxRecommendationsPerRun">{t('settings.balancer.max_recommendations')}</Label>
                <Input
                  id="maxRecommendationsPerRun"
                  type="number"
                  min="1"
                  max="10"
                  value={balancerPolicyForm.maxRecommendationsPerRun}
                  onChange={(e) => setBalancerPolicyForm((current) => ({ ...current, maxRecommendationsPerRun: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxAutoMoveKeysPerRun">{t('settings.balancer.max_auto_moves')}</Label>
                <Input
                  id="maxAutoMoveKeysPerRun"
                  type="number"
                  min="1"
                  max="5"
                  value={balancerPolicyForm.maxAutoMoveKeysPerRun}
                  onChange={(e) => setBalancerPolicyForm((current) => ({ ...current, maxAutoMoveKeysPerRun: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minAutoApplyLoadDelta">{t('settings.balancer.min_gap')}</Label>
                <Input
                  id="minAutoApplyLoadDelta"
                  type="number"
                  min="5"
                  max="50"
                  value={balancerPolicyForm.minAutoApplyLoadDelta}
                  onChange={(e) => setBalancerPolicyForm((current) => ({ ...current, minAutoApplyLoadDelta: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSaveBalancerPolicy} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                {t('settings.balancer.save')}
              </Button>
              <Button
                variant="outline"
                onClick={() => runScheduledRebalanceMutation.mutate()}
                disabled={runScheduledRebalanceMutation.isPending}
              >
                {runScheduledRebalanceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('settings.balancer.run_now')}
              </Button>
            </div>
          </div>
        </SectionCard>

        {/* Backup & Restore */}
        <SectionCard
          id="backup"
          icon={History}
          title={t('settings.backup.title')}
          description={t('settings.backup.desc')}
          isOpen={openSection === 'backup'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            {isCurrentUserLoading ? (
              <div className="flex items-center justify-center rounded-lg border p-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : !canManageBackups ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Only owner-scoped admins can create, download, delete, or restore full backups.
              </div>
            ) : (
              <>
                <input
                  ref={backupUploadInputRef}
                  type="file"
                  accept=".db,.sqlite,.bak,.dump,.sql,.zip"
                  className="hidden"
                  onChange={handleBackupUploadSelection}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleCreateBackup}
                    disabled={createBackupMutation.isPending || isRestoreJobRunning || isUploadingBackup}
                    size="sm"
                  >
                    {createBackupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <Save className="w-4 h-4 mr-2" />
                    {t('settings.backup.create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTriggerBackupUpload}
                    disabled={isUploadingBackup || createBackupMutation.isPending || isRestoreJobRunning}
                    size="sm"
                  >
                    {isUploadingBackup ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    {t('settings.backup.upload')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload a downloaded <code>.db</code>, <code>.dump</code>, <code>.sql</code>, portable <code>.postgres.zip</code>, or legacy <code>.zip</code> backup to add it back to this restore list.
                </p>

                <div className="space-y-3 md:hidden">
                  {isBackupsLoading ? (
                    <div className="flex items-center justify-center rounded-lg border p-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : backups?.length === 0 ? (
                    <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                      {t('settings.backup.empty')}
                    </div>
                  ) : (
                    backups?.map((backup) => (
                      <div key={backup.filename} className="rounded-lg border p-4 space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-xs break-all">{backup.filename}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {Math.round(backup.size / 1024)} KB
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                backup.latestVerification
                                  ? backup.latestVerification.restoreReady
                                    ? 'default'
                                    : 'destructive'
                                  : 'secondary'
                              }
                            >
                              {backup.latestVerification
                                ? backup.latestVerification.restoreReady
                                  ? 'Verified'
                                  : 'Verification failed'
                                : 'Unverified'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {backup.latestVerification
                                ? `Checked ${new Date(backup.latestVerification.verifiedAt).toLocaleString()}`
                                : 'No verification recorded yet'}
                            </span>
                          </div>
                          {backup.latestVerification?.error ? (
                            <p className="text-xs text-destructive">{backup.latestVerification.error}</p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-center"
                            onClick={() => handleVerifyBackup(backup.filename)}
                            disabled={verifyBackupMutation.isPending || isRestoreJobRunning}
                          >
                            {verifyBackupMutation.isPending && verifyBackupMutation.variables?.filename === backup.filename ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <TestTube className="w-4 h-4 mr-2" />
                            )}
                            Verify
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-center"
                            onClick={() => handleDownloadBackup(backup.filename)}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-center"
                            onClick={() => handleRestoreBackup(backup.filename)}
                            disabled={restoreBackupMutation.isPending || isRestoreJobRunning}
                          >
                            {isRestorePendingForFilename(backup.filename) ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            {t('settings.backup.restore_btn')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-center text-destructive hover:text-destructive"
                            onClick={() => handleDeleteBackup(backup.filename)}
                            disabled={deleteBackupMutation.isPending || isRestoreJobRunning}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="hidden overflow-hidden rounded-lg border md:block">
                  <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
                    <div className="col-span-6">{t('settings.backup.filename')}</div>
                    <div className="col-span-3">{t('settings.backup.size')}</div>
                    <div className="col-span-3 text-right">{t('settings.backup.actions')}</div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {isBackupsLoading ? (
                      <div className="flex items-center justify-center p-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : backups?.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        {t('settings.backup.empty')}
                      </div>
                    ) : (
                      backups?.map((backup) => (
                        <div key={backup.filename} className="grid grid-cols-12 gap-2 p-3 border-t items-center hover:bg-muted/30 text-sm">
                          <div className="col-span-6 min-w-0">
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-mono text-xs truncate">{backup.filename}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge
                                variant={
                                  backup.latestVerification
                                    ? backup.latestVerification.restoreReady
                                      ? 'default'
                                      : 'destructive'
                                    : 'secondary'
                                }
                              >
                                {backup.latestVerification
                                  ? backup.latestVerification.restoreReady
                                    ? 'Verified'
                                    : 'Verification failed'
                                  : 'Unverified'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {backup.latestVerification
                                  ? `Checked ${new Date(backup.latestVerification.verifiedAt).toLocaleString()}`
                                  : 'No verification recorded yet'}
                              </span>
                            </div>
                            {backup.latestVerification?.error ? (
                              <p className="mt-1 text-xs text-destructive">{backup.latestVerification.error}</p>
                            ) : null}
                          </div>
                          <div className="col-span-3 text-xs text-muted-foreground">
                            {Math.round(backup.size / 1024)} KB
                          </div>
                          <div className="col-span-3 flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleVerifyBackup(backup.filename)}
                              disabled={verifyBackupMutation.isPending || isRestoreJobRunning}
                            >
                              {verifyBackupMutation.isPending && verifyBackupMutation.variables?.filename === backup.filename ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <TestTube className="w-3.5 h-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleDownloadBackup(backup.filename)}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleRestoreBackup(backup.filename)}
                              disabled={restoreBackupMutation.isPending || isRestoreJobRunning}
                            >
                              {isRestorePendingForFilename(backup.filename) ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteBackup(backup.filename)}
                              disabled={deleteBackupMutation.isPending || isRestoreJobRunning}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Recent Verification History</h3>
                      <p className="text-sm text-muted-foreground">
                        Daily checks validate the newest backups and every restore now performs a verification pre-check.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchBackupVerificationHistory()}
                      disabled={verifyBackupMutation.isPending}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {isMyanmar ? 'ပြန်လည်ရယူမည်' : 'Refresh'}
                    </Button>
                  </div>

                  {isBackupVerificationHistoryLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : backupVerificationHistory && backupVerificationHistory.length > 0 ? (
                    <div className="space-y-2">
                      {backupVerificationHistory.map((verification) => (
                        <div
                          key={verification.id}
                          className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{verification.filename}</span>
                              <Badge
                                variant={
                                  verification.restoreReady && verification.status === 'SUCCESS'
                                    ? 'default'
                                    : 'destructive'
                                }
                              >
                                {verification.restoreReady && verification.status === 'SUCCESS'
                                  ? isMyanmar
                                    ? 'ပြန်ယူရန် အသင့်ဖြစ်နေသည်'
                                    : 'Restore ready'
                                  : isMyanmar
                                    ? 'မအောင်မြင်ပါ'
                                    : 'Failed'}
                              </Badge>
                              <Badge variant="outline">
                                {verification.triggeredBy || 'manual'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(verification.verifiedAt).toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              SHA-256: {verification.fileHashSha256 ? `${verification.fileHashSha256.slice(0, 12)}...` : 'n/a'}
                            </p>
                            {verification.error ? (
                              <p className="text-xs text-destructive">{verification.error}</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Integrity: {verification.integrityCheck || 'n/a'} | Tables: {verification.tableCount ?? 'n/a'} | Users: {verification.userCount ?? 'n/a'} | Keys: {verification.accessKeyCount ?? 'n/a'}
                              </p>
                            )}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVerifyBackup(verification.filename)}
                            disabled={verifyBackupMutation.isPending || isRestoreJobRunning}
                          >
                            {verifyBackupMutation.isPending && verifyBackupMutation.variables?.filename === verification.filename ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <TestTube className="w-4 h-4 mr-2" />
                            )}
                            {isMyanmar ? 'ထပ်စစ်မည်' : 'Verify Again'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      {isMyanmar ? 'အရန်သိမ်း အတည်ပြု မှတ်တမ်း မရှိသေးပါ။' : 'No backup verification history yet.'}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">{isMyanmar ? 'ပြန်ယူမှု အလုပ် အခြေအနေ' : 'Restore Job Status'}</h3>
                      <p className="text-sm text-muted-foreground">
                        {isMyanmar
                          ? 'Dashboard မှ ပြန်ယူမှုများသည် သီးခြား host job အဖြစ် လည်ပတ်ပြီး ပြီးဆုံးသည့်အခါ app ကို ပြန်လည်စတင်မည်။'
                          : 'Dashboard restores run as a detached host job and restart the app when complete.'}
                      </p>
                    </div>
                    {activeRestoreJob ? (
                      <Badge variant="warning">{isMyanmar ? 'ပြန်ယူနေသည်' : 'Restore in progress'}</Badge>
                    ) : null}
                  </div>

                  {isRestoreJobsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : restoreJobs && restoreJobs.length > 0 ? (
                    <div className="space-y-2">
                      {restoreJobs.map((job) => (
                        <div key={job.jobId} className="rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-xs break-all">{job.backupFilename}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Requested {new Date(job.requestedAt).toLocaleString()}
                                {job.requestedByEmail ? ` by ${job.requestedByEmail}` : ''}
                              </p>
                            </div>
                            <Badge variant={getRestoreJobBadgeVariant(job.status as RestoreJobStatus)}>
                              {formatRestoreJobStatus(job.status as RestoreJobStatus, isMyanmar)}
                            </Badge>
                          </div>
                          {job.safetyBackupFilename ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {isMyanmar ? 'အရန်ကာကွယ်မှု:' : 'Safety backup:'} <span className="font-mono">{job.safetyBackupFilename}</span>
                            </p>
                          ) : null}
                          {job.error ? (
                            <p className="mt-2 text-xs text-destructive">{job.error}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      {isMyanmar ? 'ပြန်ယူမှု အလုပ် မရှိသေးပါ။' : 'No restore jobs yet.'}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </SectionCard>

        <SectionCard
          id="audit"
          icon={ScrollText}
          title="Audit Log"
          description="Recent admin activity across backups, users, reports, and servers"
          isOpen={openSection === 'audit'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            {isAuditRetentionLoading || isAuditAlertRulesLoading || isAuditLogsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4 rounded-lg border p-4">
                <div className="space-y-2">
                  <Label htmlFor="auditRetentionDays">Retention (days)</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="auditRetentionDays"
                      type="number"
                      min="0"
                      max="3650"
                      value={auditRetentionDaysInput}
                      onChange={(e) => setAuditRetentionDaysInput(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveAuditRetention}
                      disabled={!canSaveAuditRetention}
                    >
                      {updateAuditRetentionMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save Retention
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set to `0` to keep audit logs forever. Automatic cleanup runs daily when retention is enabled.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Total Entries</p>
                    <p className="mt-1 text-lg font-semibold">{auditRetentionStatus?.totalEntries ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Eligible for Cleanup</p>
                    <p className="mt-1 text-lg font-semibold">{auditRetentionStatus?.deletableEntries ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Cutoff Date</p>
                    <p className="mt-1 text-sm font-medium">
                      {auditRetentionStatus?.cutoffDate
                        ? new Date(auditRetentionStatus.cutoffDate).toLocaleString()
                        : 'Cleanup disabled'}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Oldest Entry</p>
                    <p className="mt-1 text-sm font-medium">
                      {auditRetentionStatus?.oldestEntryAt
                        ? new Date(auditRetentionStatus.oldestEntryAt).toLocaleString()
                        : 'No audit entries'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cleanupAuditLogsMutation.mutate()}
                    disabled={
                      cleanupAuditLogsMutation.isPending ||
                      !auditRetentionStatus?.cleanupEnabled ||
                      (auditRetentionStatus?.deletableEntries ?? 0) === 0
                    }
                  >
                    {cleanupAuditLogsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Cleanup Old Entries Now
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Use manual cleanup to apply the retention window immediately instead of waiting for the daily scheduler.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">How retention works</p>
                    <p className="text-sm text-muted-foreground">
                      Audit cleanup removes entries older than the configured retention window and records the cleanup itself as a new audit event.
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Automatic cleanup schedule: every day at 03:30 server time.</p>
                  <p>Recommended retention: 90 to 365 days for most admin panels.</p>
                  <p>If you need indefinite history, set retention to `0` and rely on database backups instead.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Alert Rules</h3>
                    <Badge variant="secondary">
                      {auditAlertRules?.filter((rule) => rule.isActive).length ?? 0} active
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Send real-time alerts when a new audit entry matches one of these rules. Delivery uses Telegram admin chats from bot settings and any webhook channels subscribed to `AUDIT_ALERT`.
                  </p>
                </div>

                <Button size="sm" onClick={openCreateAuditRuleDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Rule
                </Button>
              </div>

              {auditAlertRules && auditAlertRules.length > 0 ? (
                <div className="space-y-3">
                  {auditAlertRules.map((rule) => (
                    <div key={rule.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{rule.name}</p>
                            <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                              {rule.isActive ? 'Active' : 'Disabled'}
                            </Badge>
                            <Badge variant="outline">
                              Throttle {rule.throttleMinutes}m
                            </Badge>
                            <Badge variant="outline">
                              Threshold {rule.minMatches} / {rule.matchWindowMinutes}m
                            </Badge>
                          </div>
                          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                            <p>{isMyanmar ? 'လုပ်ဆောင်ချက်များ:' : 'Actions:'} {rule.actions.length > 0 ? rule.actions.join(', ') : isMyanmar ? 'မည်သည့်လုပ်ဆောင်ချက်မဆို' : 'Any action'}</p>
                            <p>{isMyanmar ? 'Entity များ:' : 'Entities:'} {rule.entities.length > 0 ? rule.entities.join(', ') : isMyanmar ? 'မည်သည့် entity မဆို' : 'Any entity'}</p>
                            <p>{isMyanmar ? 'လုပ်ဆောင်သူများ:' : 'Actors:'} {rule.actorIds.length > 0 ? rule.actorIds.join(', ') : isMyanmar ? 'မည်သည့်လုပ်ဆောင်သူမဆို' : 'Any actor'}</p>
                            <p>{isMyanmar ? 'စကားလုံးများ:' : 'Keywords:'} {rule.keywords.length > 0 ? rule.keywords.join(', ') : isMyanmar ? 'စကားလုံး စစ်ထုတ်မှု မရှိပါ' : 'No keyword filter'}</p>
                            <p>{isMyanmar ? 'Burst အချိန်ပြတင်း:' : 'Burst window:'} {rule.matchWindowMinutes} {isMyanmar ? 'မိနစ်' : 'minutes'}</p>
                            <p>{isMyanmar ? 'အနည်းဆုံး ကိုက်ညီရမည့်အရေအတွက်:' : 'Minimum matches:'} {rule.minMatches}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {isMyanmar ? 'နောက်ဆုံး ပြင်ဆင်ချိန်' : 'Updated'} {new Date(rule.updatedAt).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testAuditAlertRuleMutation.mutate({ id: rule.id })}
                            disabled={testAuditAlertRuleMutation.isPending}
                          >
                            {testAuditAlertRuleMutation.isPending && testAuditAlertRuleMutation.variables?.id === rule.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <TestTube className="w-4 h-4 mr-2" />
                            )}
                            {isMyanmar ? 'စမ်းမည်' : 'Test'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEditAuditRuleDialog(rule)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            {isMyanmar ? 'ပြင်မည်' : 'Edit'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete audit alert rule "${rule.name}"?`)) {
                                deleteAuditAlertRuleMutation.mutate({ id: rule.id });
                              }
                            }}
                            disabled={deleteAuditAlertRuleMutation.isPending}
                          >
                            {deleteAuditAlertRuleMutation.isPending && deleteAuditAlertRuleMutation.variables?.id === rule.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 mr-2" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  {isMyanmar
                    ? 'Audit alert rule မရှိသေးပါ။ `BACKUP_RESTORE`၊ `USER_DELETE` သို့မဟုတ် `SERVER_DELETE` ကဲ့သို့သော အန္တရာယ်မြင့် လုပ်ဆောင်ချက်များအတွက် rule တစ်ခု ဖန်တီးပါ။'
                    : 'No audit alert rules yet. Create a rule for high-risk actions like `BACKUP_RESTORE`, `USER_DELETE`, or `SERVER_DELETE`.'}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/audit">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {isMyanmar ? 'Audit log အပြည့်အစုံ ဖွင့်မည်' : 'Open Full Audit Log'}
                </Link>
              </Button>
            </div>

            <div className="space-y-3 md:hidden">
              {auditLogs?.items.length === 0 ? (
                <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                  {isMyanmar ? 'Audit မှတ်တမ်း မရှိသေးပါ။' : 'No audit entries yet.'}
                </div>
              ) : (
                auditLogs?.items.map((log) => (
                  <div key={log.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium break-words">{log.action}</p>
                      <Badge variant="outline">{log.entity}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground">{isMyanmar ? 'လုပ်ဆောင်သူ' : 'Actor'}</p>
                        <p className="break-all">{log.userEmail || log.userId || (isMyanmar ? 'စနစ်' : 'System')}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{isMyanmar ? 'ဦးတည်ရာ' : 'Target'}</p>
                        <p className="break-all font-mono">{log.entityId || '-'}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden overflow-hidden rounded-lg border md:block">
              <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
                <div className="col-span-3">{isMyanmar ? 'အချိန်' : 'Time'}</div>
                <div className="col-span-3">{isMyanmar ? 'လုပ်ဆောင်ချက်' : 'Action'}</div>
                <div className="col-span-2">Entity</div>
                <div className="col-span-2">{isMyanmar ? 'လုပ်ဆောင်သူ' : 'Actor'}</div>
                <div className="col-span-2">{isMyanmar ? 'ဦးတည်ရာ' : 'Target'}</div>
              </div>
              <div className="max-h-[260px] overflow-y-auto">
                {auditLogs?.items.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {isMyanmar ? 'Audit မှတ်တမ်း မရှိသေးပါ။' : 'No audit entries yet.'}
                  </div>
                ) : (
                  auditLogs?.items.map((log) => (
                    <div key={log.id} className="grid grid-cols-12 gap-2 p-3 border-t items-center text-sm hover:bg-muted/30">
                      <div className="col-span-3 text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                      <div className="col-span-3 font-medium break-words">
                        {log.action}
                      </div>
                      <div className="col-span-2 text-xs text-muted-foreground">
                        {log.entity}
                      </div>
                      <div className="col-span-2 text-xs text-muted-foreground break-all">
                        {log.userEmail || log.userId || (isMyanmar ? 'စနစ်' : 'System')}
                      </div>
                      <div className="col-span-2 text-xs font-mono text-muted-foreground break-all">
                        {log.entityId || '-'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            </>
            )}
          </div>
        </SectionCard>

        <Dialog open={auditRuleDialogOpen} onOpenChange={setAuditRuleDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {auditRuleForm.id
                  ? isMyanmar
                    ? 'စစ်ဆေးမှု သတိပေး စည်းမျဉ်းကို ပြင်မည်'
                    : 'Edit Audit Alert Rule'
                  : isMyanmar
                    ? 'စစ်ဆေးမှု သတိပေး စည်းမျဉ်း ဖန်တီးမည်'
                    : 'Create Audit Alert Rule'}
              </DialogTitle>
              <DialogDescription>
                {isMyanmar
                  ? 'လုပ်ဆောင်ချက်၊ entity၊ actor သို့မဟုတ် keyword များအလိုက် audit entries အသစ်များကို ကိုက်ညီစေပြီး သတ်မှတ်ထားသော admin လက်ခံသူများထံ အသိပေးချက် ပို့ပါ။'
                  : 'Match new audit entries by action, entity, actor, or keywords and send notifications to configured admin recipients.'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="auditRuleName">{isMyanmar ? 'စည်းမျဉ်း အမည်' : 'Rule Name'}</Label>
                <Input
                  id="auditRuleName"
                  value={auditRuleForm.name}
                  onChange={(e) => setAuditRuleForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={isMyanmar ? 'ဥပမာ - restore လုပ်ဆောင်ချက်များ' : 'Restore operations'}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{isMyanmar ? 'စည်းမျဉ်း ဖွင့်ထားသည်' : 'Rule Enabled'}</p>
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar
                      ? 'ပိတ်ထားသော စည်းမျဉ်းများကို သိမ်းထားမည်ဖြစ်သော်လည်း အသိပေးချက် မပို့ပါ။'
                      : 'Disabled rules stay saved but do not trigger notifications.'}
                  </p>
                </div>
                <Switch
                  checked={auditRuleForm.isActive}
                  onCheckedChange={(checked) => setAuditRuleForm((prev) => ({ ...prev, isActive: checked }))}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="auditRuleActions">{isMyanmar ? 'လုပ်ဆောင်ချက်များ' : 'Actions'}</Label>
                  <Input
                    id="auditRuleActions"
                    value={auditRuleForm.actions}
                    onChange={(e) => setAuditRuleForm((prev) => ({ ...prev, actions: e.target.value }))}
                    placeholder="USER_DELETE, BACKUP_RESTORE"
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'ကော်မာဖြင့် ခွဲရေးပါ။ မည်သည့်လုပ်ဆောင်ချက်နှင့်မဆို ကိုက်ညီစေရန် ဗလာထားနိုင်သည်။' : 'Comma-separated. Leave blank to match any action.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auditRuleEntities">{isMyanmar ? 'Entity များ' : 'Entities'}</Label>
                  <Input
                    id="auditRuleEntities"
                    value={auditRuleForm.entities}
                    onChange={(e) => setAuditRuleForm((prev) => ({ ...prev, entities: e.target.value }))}
                    placeholder="USER, BACKUP, SERVER"
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'ကော်မာဖြင့် ခွဲရေးပါ။ မည်သည့် entity နှင့်မဆို ကိုက်ညီစေရန် ဗလာထားနိုင်သည်။' : 'Comma-separated. Leave blank to match any entity.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="auditRuleActors">{isMyanmar ? 'Actor User ID များ' : 'Actor User IDs'}</Label>
                  <Input
                    id="auditRuleActors"
                    value={auditRuleForm.actorIds}
                    onChange={(e) => setAuditRuleForm((prev) => ({ ...prev, actorIds: e.target.value }))}
                    placeholder="clx..., cly..."
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'မဖြစ်မနေ မဟုတ်ပါ။ သတ်မှတ်ထားသော actor ID များကိုသာ အသိပေးရန် သုံးနိုင်သည်။' : 'Optional. Limit alerts to specific actor IDs.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auditRuleThrottle">{isMyanmar ? 'Throttle (မိနစ်)' : 'Throttle (minutes)'}</Label>
                  <Input
                    id="auditRuleThrottle"
                    type="number"
                    min="0"
                    max={String(AUDIT_ALERT_RULE_MAX_THROTTLE_MINUTES)}
                    value={auditRuleForm.throttleMinutes}
                    onChange={(e) => setAuditRuleForm((prev) => ({ ...prev, throttleMinutes: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? '`0` သတ်မှတ်ပါက သတ်မှတ်ချက်ရောက်တိုင်း အသိပေးမည်။' : 'Set to `0` to alert every time the threshold is reached.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auditRuleMatchWindow">{isMyanmar ? 'ဆက်တိုက်ဖြစ်မှု အချိန်ကာလ (မိနစ်)' : 'Burst Window (minutes)'}</Label>
                  <Input
                    id="auditRuleMatchWindow"
                    type="number"
                    min="1"
                    max={String(AUDIT_ALERT_RULE_MAX_MATCH_WINDOW_MINUTES)}
                    value={auditRuleForm.matchWindowMinutes}
                    onChange={(e) => setAuditRuleForm((prev) => ({ ...prev, matchWindowMinutes: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'ဤရွေ့လျားအချိန်ကာလအတွင်း ကိုက်ညီသော audit entries များကို သတ်မှတ်ချက်အတွက် ရေတွက်မည်။' : 'Matching audit entries inside this rolling window count toward the threshold.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="auditRuleMinMatches">{isMyanmar ? 'အနည်းဆုံး ကိုက်ညီမှုအရေအတွက်' : 'Minimum Matches'}</Label>
                  <Input
                    id="auditRuleMinMatches"
                    type="number"
                    min="1"
                    max={String(AUDIT_ALERT_RULE_MAX_MIN_MATCHES)}
                    value={auditRuleForm.minMatches}
                    onChange={(e) => setAuditRuleForm((prev) => ({ ...prev, minMatches: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar ? 'ချက်ချင်း အသိပေးရန် `1` သတ်မှတ်ပြီး ဆက်တိုက်ဖြစ်မှု သို့မဟုတ် သတ်မှတ်ချက်စည်းမျဉ်းများအတွက် ပိုမြင့်သောတန်ဖိုး သတ်မှတ်နိုင်သည်။' : 'Set to `1` for immediate alerts, or higher for burst and threshold rules.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auditRuleKeywords">Keywords</Label>
                  <Input
                    id="auditRuleKeywords"
                    value={auditRuleForm.keywords}
                    onChange={(e) => setAuditRuleForm((prev) => ({ ...prev, keywords: e.target.value }))}
                    placeholder="restore, deleted, production"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. Case-insensitive matches across audit action, entity, target, IP, and serialized details.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAuditRuleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveAuditRule} disabled={upsertAuditAlertRuleMutation.isPending}>
                {upsertAuditAlertRuleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Notifications */}
        <SectionCard
          id="notifications"
          icon={Bell}
          title={t('settings.notifications.title')}
          description={t('settings.notifications.desc')}
          isOpen={openSection === 'notifications'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('settings.notifications.info')}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/notifications">
                <Bell className="w-4 h-4 mr-2" />
                {t('settings.notifications.btn')}
              </Link>
            </Button>
          </div>
        </SectionCard>

        {/* Account Security */}
        <SectionCard
          id="security"
          icon={Key}
          title={t('settings.security.title')}
          description={t('settings.security.desc')}
          isOpen={openSection === 'security'}
          onToggle={setOpenSection}
        >
          <div className="space-y-4">
            {currentUser && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <User className="w-6 h-6 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{currentUser.email}</p>
                  <p className="text-xs text-muted-foreground">{currentUser.role}</p>
                </div>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('settings.security.username') || 'Username'}</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                />
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">{t('settings.security.change_password') || 'Change Password'}</p>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">{t('settings.security.current')}</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t('settings.security.current_placeholder')}
                      required
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">{t('settings.security.new')}</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('settings.security.new_placeholder')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">{t('settings.security.confirm')}</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('settings.security.confirm_placeholder')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={passwordMutation.isPending || !currentPassword || (!newPassword && username === currentUser?.email)}
              >
                {passwordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('settings.security.change_btn')}
              </Button>
            </form>
          </div>
        </SectionCard>

        {/* About */}
        <SectionCard
          id="about"
          icon={Info}
          title={t('settings.about.title')}
          description="Version and credits"
          isOpen={openSection === 'about'}
          onToggle={setOpenSection}
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-muted-foreground">{t('settings.about.version')}</span>
              <span className="font-mono">{APP_RELEASE_VERSION}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-muted-foreground">{t('settings.about.author')}</span>
              <a
                href="https://github.com/sankahchan"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                sankahchan
              </a>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-muted-foreground">{t('settings.about.repo')}</span>
              <a
                href="https://github.com/sankahchan/atomic-ui"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">{t('settings.about.license')}</span>
              <span>MIT</span>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
