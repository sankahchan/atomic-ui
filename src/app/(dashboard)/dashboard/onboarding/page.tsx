'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck,
  ArrowRightLeft,
  LifeBuoy,
  Upload,
  Wand2,
  Users,
  KeyRound,
  ListChecks,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { formatDateTime } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function StepBadge({
  status,
  isMyanmar,
}: {
  status: 'complete' | 'attention' | 'warning' | 'pending';
  isMyanmar: boolean;
}) {
  const styles =
    status === 'complete'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
      : status === 'attention'
        ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
        : status === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
          : 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300';

  const label =
    status === 'complete'
      ? isMyanmar ? 'ပြီးမြောက်ပြီး' : 'complete'
      : status === 'attention'
        ? isMyanmar ? 'အရေးကြီး' : 'attention'
        : status === 'warning'
          ? isMyanmar ? 'သတိပေးချက်' : 'warning'
          : isMyanmar ? 'စောင့်ဆိုင်းနေ' : 'pending';

  return (
    <Badge variant="outline" className={styles}>
      {label}
    </Badge>
  );
}

function WizardStatCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string | number;
  helper: string;
  tone: 'cyan' | 'emerald' | 'violet' | 'amber';
}) {
  const toneClass = {
    cyan:
      'dark:border-cyan-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
    emerald:
      'dark:border-emerald-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
    violet:
      'dark:border-violet-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.18),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
    amber:
      'dark:border-amber-400/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_55%),linear-gradient(180deg,rgba(5,12,24,0.9),rgba(4,10,22,0.8))]',
  }[tone];

  return (
    <div
      className={`ops-stat-pod dark:shadow-[0_18px_42px_rgba(1,6,20,0.4),inset_0_1px_0_rgba(125,211,252,0.05)] ${toneClass}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function OnboardingPage() {
  const { locale, t } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';
  const utils = trpc.useUtils();
  const [serverForm, setServerForm] = useState({
    name: 'atomic-node-1',
    configText: '',
    apiUrl: '',
    apiCertSha256: '',
    location: '',
    countryCode: '',
  });
  const [importContent, setImportContent] = useState('');
  const [defaultPassword, setDefaultPassword] = useState('');
  const [importPreview, setImportPreview] = useState<{
    users: Array<{ email: string; role: string; exists: boolean; passwordProvided: boolean }>;
    keys: Array<{ name: string; matched: boolean; matchedServerName: string | null }>;
    warnings: string[];
    summary: {
      usersToCreate: number;
      usersExisting: number;
      keysMatched: number;
      keysUnmatched: number;
    };
  } | null>(null);

  const statusQuery = trpc.onboarding.status.useQuery();
  const postInstallChecksQuery = trpc.onboarding.postInstallChecks.useQuery();

  const syncAllMutation = trpc.servers.syncAll.useMutation({
    onSuccess: () => {
      toast({
        title: isMyanmar ? 'ဆာဗာညှိနှိုင်းမှု စတင်ပြီးပါပြီ' : 'Server sync started',
        description: isMyanmar ? 'နောက်ဆုံး ဆာဗာစာရင်းကို ပြန်လည်ညှိနှိုင်းနေပါသည်။' : 'The latest server inventory has been synced.',
      });
      void statusQuery.refetch();
      void postInstallChecksQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ဆာဗာညှိနှိုင်းမှု မအောင်မြင်ပါ' : 'Sync failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createFirstServerMutation = trpc.onboarding.createFirstServer.useMutation({
    onSuccess: async (result) => {
      toast({
        title: isMyanmar ? 'ဆာဗာကို ချိတ်ဆက်ပြီးပါပြီ' : 'Server connected',
        description: isMyanmar ? `${result.name} ကို panel ထဲတွင် အသုံးပြုနိုင်ပါပြီ။` : `${result.name} is now available in the panel.`,
      });
      setServerForm((current) => ({
        ...current,
        configText: '',
        apiUrl: '',
        apiCertSha256: '',
      }));
      await Promise.all([
        statusQuery.refetch(),
        postInstallChecksQuery.refetch(),
        utils.servers.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'ဆာဗာ ချိတ်ဆက်မှု မအောင်မြင်ပါ' : 'Server connection failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const previewImportMutation = trpc.onboarding.previewImport.useMutation({
    onSuccess: (result) => {
      setImportPreview(result);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'တင်သွင်းမှု ကြိုကြည့်ခြင်း မအောင်မြင်ပါ' : 'Import preview failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const applyImportMutation = trpc.onboarding.applyImport.useMutation({
    onSuccess: async (result) => {
      toast({
        title: isMyanmar ? 'တင်သွင်းမှုကို အတည်ပြုပြီးပါပြီ' : 'Import applied',
        description: isMyanmar
          ? `အသုံးပြုသူ ${result.usersCreated} ယောက်ကို ဖန်တီးပြီး သော့ ${result.keysUpdated} ခုကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။`
          : `${result.usersCreated} user(s) created and ${result.keysUpdated} key(s) updated.`,
      });
      await Promise.all([
        statusQuery.refetch(),
        postInstallChecksQuery.refetch(),
        utils.keys.list.invalidate(),
        utils.users.list.invalidate(),
      ]);
      setImportPreview(null);
    },
    onError: (error) => {
      toast({
        title: isMyanmar ? 'တင်သွင်းမှု မအောင်မြင်ပါ' : 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const progress =
    statusQuery.data?.summary.totalSteps
      ? (statusQuery.data.summary.completedSteps / statusQuery.data.summary.totalSteps) * 100
      : 0;

  const validationErrors = statusQuery.data?.validation.errors ?? [];
  const validationWarnings = statusQuery.data?.validation.warnings ?? [];
  const postInstallChecks = postInstallChecksQuery.data?.checks ?? [];
  const passedChecks = postInstallChecks.filter((check) => check.status === 'pass').length;
  const warnedChecks = postInstallChecks.filter((check) => check.status === 'warn').length;
  const failedChecks = postInstallChecks.filter((check) => check.status === 'fail').length;

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <Rocket className="mr-2 h-3.5 w-3.5" />
              {isMyanmar ? 'စတင်တပ်ဆင်မှု နှင့် ရွှေ့ပြောင်းလမ်းညွှန်' : 'Onboarding & Migration Wizard'}
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {isMyanmar ? 'စတင်လွှင့်တင်ရန် စစ်ဆေးစာရင်း' : 'Launch checklist'}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {isMyanmar ? 'ပထမဆုံး ဆာဗာကို ချိတ်ဆက်ပါ၊ ရှိပြီးသား အသုံးပြုသူများနှင့် သော့များကို တင်သွင်းပါ၊ ထို့နောက် panel မှ ထုတ်လုပ်ရေး လမ်းကြောင်းကို ဖွင့်မီ တပ်ဆင်ပြီးနောက် စစ်ဆေးချက်များကို လုပ်ဆောင်ပါ။' : 'Connect the first server, import existing users and keys, and run post-install checks before you allow production traffic through the panel.'}
              </p>
            </div>

            <div className="ops-detail-card space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="ops-section-heading">{isMyanmar ? 'အဆင်သင့် အခြေအနေ' : 'Readiness'}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {statusQuery.data?.summary.completedSteps ?? 0}/{statusQuery.data?.summary.totalSteps ?? 0}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isMyanmar
                      ? 'အောက်ပါ လမ်းညွှန်အဆင့်များကို ပြီးအောင်လုပ်ပြီးနောက် production သို့ မပြောင်းမီ ပတ်ဝန်းကျင်နှင့် backup အဆင်သင့်ဖြစ်မှုကို စစ်ဆေးပါ။'
                      : 'Complete the guided steps below, then verify environment and backup readiness before cutover.'}
                  </p>
                </div>
                {statusQuery.data?.summary.readyForLaunch ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  >
                    {isMyanmar ? 'စတင်လွှင့်တင်ရန် အဆင်သင့်' : 'Ready for launch'}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                  >
                    {isMyanmar ? 'တပ်ဆင်ဆဲ' : 'Still in setup'}
                  </Badge>
                )}
              </div>
              <Progress value={progress} className="h-2.5" />
            </div>

            <div className="ops-metric-strip">
              <WizardStatCard
                label={isMyanmar ? 'အသက်ဝင် ဆာဗာများ' : 'Active servers'}
                value={statusQuery.data?.summary.activeServers ?? 0}
                helper={isMyanmar ? 'ချိတ်ဆက်ထားသော အခြေခံဆာဗာ node များ' : 'Connected infrastructure nodes'}
                tone="cyan"
              />
              <WizardStatCard
                label={isMyanmar ? 'ကောင်းမွန်သော ဆာဗာများ' : 'Healthy servers'}
                value={statusQuery.data?.summary.onlineServers ?? 0}
                helper={isMyanmar ? 'လက်ရှိချိတ်ဆက်နိုင်သော ဆာဗာများ' : 'Nodes currently reachable'}
                tone="emerald"
              />
              <WizardStatCard
                label={isMyanmar ? 'တင်သွင်းထားသော သော့များ' : 'Imported keys'}
                value={statusQuery.data?.summary.accessKeyCount ?? 0}
                helper={isMyanmar ? 'စာရင်းအတွင်း တွေ့ရှိထားသော သော့များ' : 'Keys discovered in inventory'}
                tone="violet"
              />
              <WizardStatCard
                label={isMyanmar ? 'အသုံးပြုသူများ' : 'Users'}
                value={statusQuery.data?.summary.userCount ?? 0}
                helper={isMyanmar ? 'ရွှေ့ပြောင်းရန် အဆင်သင့်ဖြစ်သော အကောင့်များ' : 'Accounts ready for migration'}
                tone="amber"
              />
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'အမြန်လုပ်ဆောင်ချက်များ' : 'Quick actions'}</p>
                <h2 className="text-xl font-semibold">{isMyanmar ? 'စတင်ထိန်းချုပ်မှုများ' : 'Launch controls'}</h2>
                <p className="text-sm text-muted-foreground">
                  {isMyanmar ? 'လမ်းညွှန်မှ မထွက်ဘဲ ပထမအကြိမ် လုပ်ဆောင်ရမည့် အလုပ်များကို ပြီးအောင်လုပ်ပါ။' : 'Finish common first-run tasks without leaving the wizard.'}
                </p>
              </div>

              <Button className="h-12 w-full rounded-full" asChild>
                <Link href="/dashboard/servers/deploy">
                  <Server className="mr-2 h-4 w-4" />
                  {isMyanmar ? 'ပထမဆုံး ဆာဗာကို တပ်ဆင်မည်' : 'Deploy first server'}
                </Link>
              </Button>

              <div className="space-y-2">
                <Link href="/dashboard/migration" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <ArrowRightLeft className="h-4 w-4 text-primary" />
                    {isMyanmar ? 'ရွှေ့ပြောင်းကိရိယာများကို ဖွင့်မည်' : 'Open migration tools'}
                  </span>
                  <span className="text-xs text-muted-foreground">{isMyanmar ? 'ဖွင့်မည်' : t('dashboard.open')}</span>
                </Link>
                <Link href="/dashboard/incidents" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <LifeBuoy className="h-4 w-4 text-primary" />
                    {isMyanmar ? 'အဖြစ်အပျက် စင်တာကို ပြန်လည်စစ်ဆေးမည်' : 'Review incident center'}
                  </span>
                  <span className="text-xs text-muted-foreground">{isMyanmar ? 'ဖွင့်မည်' : t('dashboard.open')}</span>
                </Link>
                <button
                  type="button"
                  className="ops-action-tile w-full text-left"
                  onClick={() => syncAllMutation.mutate()}
                  disabled={syncAllMutation.isPending}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <RefreshCw className={`h-4 w-4 text-primary ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
                    {isMyanmar ? 'ချိတ်ဆက်ထားသော ဆာဗာအားလုံးကို ပြန်လည်ညှိနှိုင်းမည်' : 'Sync all connected servers'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {syncAllMutation.isPending ? (isMyanmar ? 'လုပ်ဆောင်နေသည်...' : 'Running...') : (isMyanmar ? 'လုပ်ဆောင်မည်' : 'Run')}
                  </span>
                </button>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'စတင်မှု အတည်ပြုချက်' : 'Launch gate'}</p>
                <h2 className="text-xl font-semibold">{isMyanmar ? 'စစ်ဆေးမှု အနှစ်ချုပ်' : 'Validation summary'}</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {isMyanmar ? 'တားဆီးနေသော ပြဿနာများ' : 'Blocking issues'}
                  </p>
                  <p className="text-2xl font-semibold tracking-tight">{validationErrors.length}</p>
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'စတင်မှုကို တားဆီးနေဆဲ ပတ်ဝန်းကျင် သို့မဟုတ် လုပ်ဆောင်ချိန် ပြဿနာများ။' : 'Env or runtime issues that still prevent launch.'}</p>
                </div>
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {isMyanmar ? 'သတိပေးချက်များ' : 'Warnings'}
                  </p>
                  <p className="text-2xl font-semibold tracking-tight">{validationWarnings.length}</p>
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'တားဆီးခြင်းမရှိသော်လည်း စစ်ဆေးရန် လိုသေးသော အချက်များ။' : 'Non-blocking items that still need review.'}</p>
                </div>
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {isMyanmar ? 'အောင်မြင်သော စစ်ဆေးချက်များ' : 'Checks passed'}
                  </p>
                  <p className="text-2xl font-semibold tracking-tight">
                    {passedChecks}/{postInstallChecks.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">{isMyanmar ? 'တပ်ဆင်ပြီးနောက် အောင်မြင်ပြီးသား စစ်ဆေးချက်များ။' : 'Post-install checks that are already green.'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ops-section-grid">
        <div className="ops-panel space-y-5">
          <div className="space-y-1">
            <p className="ops-section-heading">{isMyanmar ? 'ပထမဆုံး ဆာဗာ' : 'First server'}</p>
            <h2 className="text-2xl font-semibold tracking-tight">{isMyanmar ? 'ပထမဆုံး ဆာဗာကို ချိတ်ဆက်မည်' : 'Connect the first server'}</h2>
            <p className="text-sm text-muted-foreground">
              {isMyanmar ? 'Outline Manager ၏ အထွက်အပြည့်ကို ကူးထည့်ပါ၊ သို့မဟုတ် API URL နှင့် လက်မှတ် လက်ဗွေကို လက်ဖြင့် ထည့်သွင်းပါ။' : 'Paste the full Outline Manager output or fall back to the API URL and certificate fingerprint manually.'}
            </p>
          </div>

          <div className="ops-detail-card space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{isMyanmar ? 'ဆာဗာ အမည်' : 'Server name'}</Label>
                <Input
                  value={serverForm.name}
                  onChange={(event) => setServerForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'တည်နေရာ' : 'Location'}</Label>
                <Input
                  value={serverForm.location}
                  onChange={(event) => setServerForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder={isMyanmar ? 'စင်ကာပူ' : 'Singapore'}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isMyanmar ? 'Outline Manager သတ်မှတ်ချက် အထွက်ဖိုင်' : 'Outline Manager config output'}</Label>
              <Textarea
                className="min-h-[170px]"
                value={serverForm.configText}
                onChange={(event) => setServerForm((current) => ({ ...current, configText: event.target.value }))}
                placeholder={isMyanmar ? '"apiUrl" နှင့် "certSha256" ပါဝင်သော JSON အချက်အလက်ကို ကူးထည့်ပါ…' : 'Paste the JSON block that contains "apiUrl" and "certSha256"...'}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-2">
                <Label>{isMyanmar ? 'API URL (လက်ဖြင့် ထည့်သွင်းရန် အရန်နည်းလမ်း)' : 'API URL (manual fallback)'}</Label>
                <Input
                  value={serverForm.apiUrl}
                  onChange={(event) => setServerForm((current) => ({ ...current, apiUrl: event.target.value }))}
                  placeholder="https://x.x.x.x:port/xxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'နိုင်ငံကုဒ်' : 'Country code'}</Label>
                <Input
                  value={serverForm.countryCode}
                  onChange={(event) =>
                    setServerForm((current) => ({
                      ...current,
                      countryCode: event.target.value.toUpperCase().slice(0, 2),
                    }))
                  }
                  placeholder="SG"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isMyanmar ? 'Certificate SHA-256 (လက်ဖြင့် ထည့်သွင်းရန် အရန်နည်းလမ်း)' : 'Certificate SHA-256 (manual fallback)'}</Label>
              <Input
                value={serverForm.apiCertSha256}
                onChange={(event) =>
                  setServerForm((current) => ({ ...current, apiCertSha256: event.target.value }))
                }
                placeholder={isMyanmar ? 'အက္ခရာ ၆၄ လုံးပါ SHA-256 လက်ဗွေရာ' : '64-character SHA-256 fingerprint'}
              />
            </div>

            <div className="ops-mobile-action-bar flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                className="h-11 rounded-full sm:min-w-[180px]"
                onClick={() => createFirstServerMutation.mutate(serverForm)}
                disabled={createFirstServerMutation.isPending || !serverForm.name.trim()}
              >
                {createFirstServerMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Server className="mr-2 h-4 w-4" />
                )}
                {isMyanmar ? 'ဆာဗာကို ချိတ်ဆက်မည်' : 'Connect server'}
              </Button>
            </div>
          </div>
        </div>

        <div className="ops-panel space-y-5">
          <div className="space-y-1">
            <p className="ops-section-heading">{isMyanmar ? 'တင်သွင်းမှု အကြိုကြည့်ခြင်း' : 'Import preview'}</p>
            <h2 className="text-2xl font-semibold tracking-tight">{isMyanmar ? 'ရှိပြီးသား အသုံးပြုသူများနှင့် သော့များကို တင်သွင်းမည်' : 'Import existing users and keys'}</h2>
            <p className="text-sm text-muted-foreground">
              {isMyanmar
                ? 'အခြား စီမံခန့်ခွဲမှု မျက်နှာပြင်မှ ထုတ်ထားသော JSON သို့မဟုတ် CSV ကို ကူးထည့်ပါ။ အတည်မပြုမီ အသုံးပြုသူများကို ဖန်တီးပြီး သော့များကို လက်ရှိ စာရင်းနှင့် ကိုက်ညီအောင် စစ်ဆေးမည်။'
                : 'Paste JSON or CSV exported from another panel. Users are created, and keys are matched against current inventory before apply.'}
            </p>
          </div>

          <div className="ops-detail-card space-y-4">
            <div className="space-y-2">
              <Label>{isMyanmar ? 'တင်သွင်းမည့် အကြောင်းအရာ' : 'Import content'}</Label>
              <Textarea
                className="min-h-[230px]"
                value={importContent}
                onChange={(event) => setImportContent(event.target.value)}
                placeholder={isMyanmar ? 'JSON ဥပမာ - {"users":[{"email":"client@example.com"}],"keys":[{"name":"Key 1","server":"Singapore"}]}' : 'JSON example: {"users":[{"email":"client@example.com"}],"keys":[{"name":"Key 1","server":"Singapore"}]}'}
              />
            </div>

            <div className="space-y-2">
              <Label>{isMyanmar ? 'စကားဝှက် မပါသော တင်သွင်းအသုံးပြုသူများအတွက် မူလစကားဝှက်' : 'Default password for imported users without one'}</Label>
              <Input
                value={defaultPassword}
                onChange={(event) => setDefaultPassword(event.target.value)}
                placeholder={isMyanmar ? 'အသုံးပြုသူ တစ်ဦးချင်းစီအလိုက် အလိုအလျောက် ဖန်တီးပေးရန် အလွတ်ထားပါ' : 'Leave blank to auto-generate per user'}
              />
            </div>

            <div className="ops-mobile-action-bar flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 rounded-full sm:flex-1"
                onClick={() => previewImportMutation.mutate({ content: importContent })}
                disabled={previewImportMutation.isPending || !importContent.trim()}
              >
                {previewImportMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                {isMyanmar ? 'တင်သွင်းမှုကို ကြိုကြည့်မည်' : 'Preview import'}
              </Button>
              <Button
                className="h-11 rounded-full sm:flex-1"
                onClick={() =>
                  applyImportMutation.mutate({
                    content: importContent,
                    defaultPassword: defaultPassword || undefined,
                  })
                }
                disabled={applyImportMutation.isPending || !importContent.trim()}
              >
                {applyImportMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {isMyanmar ? 'တင်သွင်းမှုကို အတည်ပြုမည်' : 'Apply import'}
              </Button>
            </div>

            {importPreview ? (
              <div className="space-y-3 rounded-[1.4rem] border border-border/70 bg-background/65 p-4 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.9),rgba(4,10,22,0.8))]">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'ဖန်တီးမည့် အသုံးပြုသူများ' : 'Users to create'}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.usersToCreate}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'ရှိပြီးသား အသုံးပြုသူများ' : 'Existing users'}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.usersExisting}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'ကိုက်ညီသော သော့များ' : 'Keys matched'}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.keysMatched}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isMyanmar ? 'မကိုက်ညီသော သော့များ' : 'Keys unmatched'}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.keysUnmatched}</p>
                  </div>
                </div>

                {importPreview.warnings.length ? (
                  <Alert className="border-amber-500/30 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{isMyanmar ? 'အကြိုကြည့် သတိပေးချက်များ' : 'Preview warnings'}</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {importPreview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="ops-panel space-y-5">
          <div className="space-y-1">
            <p className="ops-section-heading">{isMyanmar ? 'လမ်းညွှန် အဆင့်များ' : 'Guided steps'}</p>
            <h2 className="text-2xl font-semibold tracking-tight">{isMyanmar ? 'စတင်လွှင့်တင်မည့် အစဉ်လိုက်ကို လိုက်နာပါ' : 'Follow the launch order'}</h2>
            <p className="text-sm text-muted-foreground">
              {isMyanmar
                ? 'ထုတ်လုပ်မှု စနစ်သို့ ပြောင်းချိန်တွင် အံ့အားသင့်စရာ မဖြစ်စေရန် စတင်ပြင်ဆင်မှု လမ်းကြောင်းကို အစဉ်လိုက် လိုက်လုပ်ပါ။'
                : 'Move through the setup path in sequence to reduce surprises during cutover.'}
            </p>
          </div>

          <div className="space-y-3">
            {statusQuery.data?.steps.map((step, index) => (
              <div key={step.id} className="ops-detail-card space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/70 text-sm font-semibold dark:border-cyan-400/16 dark:bg-cyan-400/8">
                        {index + 1}
                      </div>
                      <StepBadge status={step.status} isMyanmar={isMyanmar} />
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{step.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                      <p className="mt-3 text-sm font-medium">{step.summary}</p>
                    </div>
                  </div>
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link href={step.href}>{step.actionLabel}</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="ops-panel space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'တပ်ဆင်ပြီးနောက် စစ်ဆေးချက်များ' : 'Post-install checks'}</p>
                <h2 className="text-2xl font-semibold tracking-tight">{isMyanmar ? 'VPS အသစ် စစ်ဆေးအတည်ပြုခြင်း' : 'Fresh VPS verification'}</h2>
                <p className="text-sm text-muted-foreground">
                  {isMyanmar ? 'အများသုံး အသုံးပြုမှုကို ခွင့်မပြုမီ နောက်ဆုံး ထုတ်လွှင့်ခွင့် စစ်ဆေးချက်အဖြစ် ဤစစ်ဆေးချက်များကို အသုံးပြုပါ။' : 'Use these checks as the final release gate before public traffic is allowed.'}
                </p>
              </div>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => void postInstallChecksQuery.refetch()}>
                {isMyanmar ? 'ပြန်လည်စစ်မည်' : 'Refresh'}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="ops-detail-card space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အောင်မြင်' : 'Pass'}</p>
                <p className="text-2xl font-semibold tracking-tight">{passedChecks}</p>
              </div>
              <div className="ops-detail-card space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'သတိပြုရန်' : 'Warn'}</p>
                <p className="text-2xl font-semibold tracking-tight">{warnedChecks}</p>
              </div>
              <div className="ops-detail-card space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'မအောင်မြင်' : 'Fail'}</p>
                <p className="text-2xl font-semibold tracking-tight">{failedChecks}</p>
              </div>
            </div>

            <div className="space-y-3">
              {postInstallChecks.map((check) => (
                <div key={check.id} className="ops-row-card space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{check.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{check.summary}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        check.status === 'pass'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                          : check.status === 'warn'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                            : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
                      }
                    >
                      {check.status}
                    </Badge>
                  </div>
                  {check.details.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {check.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="ops-panel space-y-4">
            <div className="space-y-1">
              <p className="ops-section-heading">{isMyanmar ? 'ပတ်ဝန်းကျင် စစ်ဆေးမှု' : 'Environment validation'}</p>
              <h2 className="text-2xl font-semibold tracking-tight">{isMyanmar ? 'ထုတ်လုပ်မှု အဆင်သင့်အခြေအနေ' : 'Production readiness'}</h2>
            </div>

            {validationErrors.length ? (
              <Alert variant="destructive" className="border-red-500/25 bg-red-500/10">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{isMyanmar ? 'တားဆီးနေသော ပြဿနာများ' : 'Blocking issues'}</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {validationErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-emerald-500/25 bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>{isMyanmar ? 'တားဆီးချက် စစ်ဆေးမှုများ အောင်မြင်သည်' : 'Blocking checks passed'}</AlertTitle>
                <AlertDescription>{isMyanmar ? 'ထုတ်လုပ်မှု ပတ်ဝန်းကျင်ကို တားဆီးမည့် ပြဿနာများ မတွေ့ရှိရပါ။' : 'No blocking production environment issues were detected.'}</AlertDescription>
              </Alert>
            )}

            {validationWarnings.length ? (
              <Alert className="border-amber-500/25 bg-amber-500/10">
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>{isMyanmar ? 'ပြန်လည်စစ်ဆေးရန် သတိပေးချက်များ' : 'Warnings to review'}</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {validationWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="ops-panel space-y-4">
            <div className="space-y-1">
              <p className="ops-section-heading">{isMyanmar ? 'အရန်သိမ်း အတည်ပြု စစ်ဆေးချက်' : 'Backup gate'}</p>
              <h2 className="text-2xl font-semibold tracking-tight">{isMyanmar ? 'နောက်ဆုံး အရန်သိမ်း အတည်ပြုချက်' : 'Latest backup verification'}</h2>
              <p className="text-sm text-muted-foreground">
                {isMyanmar ? 'အများသုံး အသုံးပြုမှုသို့ မပြောင်းမီ နောက်ဆုံး အတည်ပြု အဆင့်အဖြစ် ဤအချက်ကို အသုံးပြုပါ။' : 'Use this as a final cutover gate before you move live traffic.'}
              </p>
            </div>

            {statusQuery.data?.latestBackupVerification ? (
              <div className="ops-row-card flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{statusQuery.data.latestBackupVerification.filename}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isMyanmar ? 'အတည်ပြုပြီးချိန်' : 'Verified'} {formatDateTime(statusQuery.data.latestBackupVerification.verifiedAt)}
                  </p>
                </div>
                <StepBadge
                  status={statusQuery.data.latestBackupVerification.restoreReady ? 'complete' : 'warning'}
                  isMyanmar={isMyanmar}
                />
              </div>
            ) : (
              <div className="ops-row-card border-dashed text-sm text-muted-foreground">
                {isMyanmar ? 'အရန်သိမ်း အတည်ပြု မှတ်တမ်း မတွေ့ရှိရသေးပါ။' : 'No backup verification record was found yet.'}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
