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
import { formatDateTime } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function StepBadge({ status }: { status: 'complete' | 'attention' | 'warning' | 'pending' }) {
  const styles =
    status === 'complete'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
      : status === 'attention'
        ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
        : status === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
          : 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300';

  return (
    <Badge variant="outline" className={styles}>
      {status}
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
  const { toast } = useToast();
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
        title: 'Server sync started',
        description: 'The latest server inventory has been synced.',
      });
      void statusQuery.refetch();
      void postInstallChecksQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Sync failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createFirstServerMutation = trpc.onboarding.createFirstServer.useMutation({
    onSuccess: async (result) => {
      toast({
        title: 'Server connected',
        description: `${result.name} is now available in the panel.`,
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
        title: 'Server connection failed',
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
        title: 'Import preview failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const applyImportMutation = trpc.onboarding.applyImport.useMutation({
    onSuccess: async (result) => {
      toast({
        title: 'Import applied',
        description: `${result.usersCreated} user(s) created and ${result.keysUpdated} key(s) updated.`,
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
        title: 'Import failed',
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
        <div className="ops-showcase-grid">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <Rocket className="mr-2 h-3.5 w-3.5" />
              Onboarding & Migration Wizard
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                Launch checklist
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Connect the first server, import existing users and keys, and run post-install checks before you allow production traffic through the panel.
              </p>
            </div>

            <div className="ops-detail-card space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="ops-section-heading">Readiness</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {statusQuery.data?.summary.completedSteps ?? 0}/{statusQuery.data?.summary.totalSteps ?? 0}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Complete the guided steps below, then verify environment and backup readiness before cutover.
                  </p>
                </div>
                {statusQuery.data?.summary.readyForLaunch ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  >
                    Ready for launch
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                  >
                    Still in setup
                  </Badge>
                )}
              </div>
              <Progress value={progress} className="h-2.5" />
            </div>

            <div className="ops-metric-strip">
              <WizardStatCard
                label="Active servers"
                value={statusQuery.data?.summary.activeServers ?? 0}
                helper="Connected infrastructure nodes"
                tone="cyan"
              />
              <WizardStatCard
                label="Healthy servers"
                value={statusQuery.data?.summary.onlineServers ?? 0}
                helper="Nodes currently reachable"
                tone="emerald"
              />
              <WizardStatCard
                label="Imported keys"
                value={statusQuery.data?.summary.accessKeyCount ?? 0}
                helper="Keys discovered in inventory"
                tone="violet"
              />
              <WizardStatCard
                label="Users"
                value={statusQuery.data?.summary.userCount ?? 0}
                helper="Accounts ready for migration"
                tone="amber"
              />
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Quick actions</p>
                <h2 className="text-xl font-semibold">Launch controls</h2>
                <p className="text-sm text-muted-foreground">
                  Finish common first-run tasks without leaving the wizard.
                </p>
              </div>

              <Button className="h-12 w-full rounded-full" asChild>
                <Link href="/dashboard/servers/deploy">
                  <Server className="mr-2 h-4 w-4" />
                  Deploy first server
                </Link>
              </Button>

              <div className="space-y-2">
                <Link href="/dashboard/migration" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <ArrowRightLeft className="h-4 w-4 text-primary" />
                    Open migration tools
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Link href="/dashboard/incidents" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <LifeBuoy className="h-4 w-4 text-primary" />
                    Review incident center
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <button
                  type="button"
                  className="ops-action-tile w-full text-left"
                  onClick={() => syncAllMutation.mutate()}
                  disabled={syncAllMutation.isPending}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <RefreshCw className={`h-4 w-4 text-primary ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
                    Sync all connected servers
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {syncAllMutation.isPending ? 'Running...' : 'Run'}
                  </span>
                </button>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Launch gate</p>
                <h2 className="text-xl font-semibold">Validation summary</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Blocking issues
                  </p>
                  <p className="text-2xl font-semibold tracking-tight">{validationErrors.length}</p>
                  <p className="text-sm text-muted-foreground">Env or runtime issues that still prevent launch.</p>
                </div>
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Warnings
                  </p>
                  <p className="text-2xl font-semibold tracking-tight">{validationWarnings.length}</p>
                  <p className="text-sm text-muted-foreground">Non-blocking items that still need review.</p>
                </div>
                <div className="ops-detail-card space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Checks passed
                  </p>
                  <p className="text-2xl font-semibold tracking-tight">
                    {passedChecks}/{postInstallChecks.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Post-install checks that are already green.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ops-section-grid">
        <div className="ops-panel space-y-5">
          <div className="space-y-1">
            <p className="ops-section-heading">First server</p>
            <h2 className="text-2xl font-semibold tracking-tight">Connect the first server</h2>
            <p className="text-sm text-muted-foreground">
              Paste the full Outline Manager output or fall back to the API URL and certificate fingerprint manually.
            </p>
          </div>

          <div className="ops-detail-card space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Server name</Label>
                <Input
                  value={serverForm.name}
                  onChange={(event) => setServerForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={serverForm.location}
                  onChange={(event) => setServerForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Singapore"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Outline Manager config output</Label>
              <Textarea
                className="min-h-[170px]"
                value={serverForm.configText}
                onChange={(event) => setServerForm((current) => ({ ...current, configText: event.target.value }))}
                placeholder='Paste the JSON block that contains "apiUrl" and "certSha256"...'
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-2">
                <Label>API URL (manual fallback)</Label>
                <Input
                  value={serverForm.apiUrl}
                  onChange={(event) => setServerForm((current) => ({ ...current, apiUrl: event.target.value }))}
                  placeholder="https://x.x.x.x:port/xxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <Label>Country code</Label>
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
              <Label>Certificate SHA-256 (manual fallback)</Label>
              <Input
                value={serverForm.apiCertSha256}
                onChange={(event) =>
                  setServerForm((current) => ({ ...current, apiCertSha256: event.target.value }))
                }
                placeholder="64-character SHA-256 fingerprint"
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
                Connect server
              </Button>
            </div>
          </div>
        </div>

        <div className="ops-panel space-y-5">
          <div className="space-y-1">
            <p className="ops-section-heading">Import preview</p>
            <h2 className="text-2xl font-semibold tracking-tight">Import existing users and keys</h2>
            <p className="text-sm text-muted-foreground">
              Paste JSON or CSV exported from another panel. Users are created, and keys are matched against current inventory before apply.
            </p>
          </div>

          <div className="ops-detail-card space-y-4">
            <div className="space-y-2">
              <Label>Import content</Label>
              <Textarea
                className="min-h-[230px]"
                value={importContent}
                onChange={(event) => setImportContent(event.target.value)}
                placeholder='JSON example: {"users":[{"email":"client@example.com"}],"keys":[{"name":"Key 1","server":"Singapore"}]}'
              />
            </div>

            <div className="space-y-2">
              <Label>Default password for imported users without one</Label>
              <Input
                value={defaultPassword}
                onChange={(event) => setDefaultPassword(event.target.value)}
                placeholder="Leave blank to auto-generate per user"
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
                Preview import
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
                Apply import
              </Button>
            </div>

            {importPreview ? (
              <div className="space-y-3 rounded-[1.4rem] border border-border/70 bg-background/65 p-4 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.9),rgba(4,10,22,0.8))]">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Users to create
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.usersToCreate}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Existing users
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.usersExisting}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Keys matched
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.keysMatched}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Keys unmatched
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.keysUnmatched}</p>
                  </div>
                </div>

                {importPreview.warnings.length ? (
                  <Alert className="border-amber-500/30 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Preview warnings</AlertTitle>
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
            <p className="ops-section-heading">Guided steps</p>
            <h2 className="text-2xl font-semibold tracking-tight">Follow the launch order</h2>
            <p className="text-sm text-muted-foreground">
              Move through the setup path in sequence to reduce surprises during cutover.
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
                      <StepBadge status={step.status} />
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
                <p className="ops-section-heading">Post-install checks</p>
                <h2 className="text-2xl font-semibold tracking-tight">Fresh VPS verification</h2>
                <p className="text-sm text-muted-foreground">
                  Use these checks as the final release gate before public traffic is allowed.
                </p>
              </div>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => void postInstallChecksQuery.refetch()}>
                Refresh
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="ops-detail-card space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pass</p>
                <p className="text-2xl font-semibold tracking-tight">{passedChecks}</p>
              </div>
              <div className="ops-detail-card space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Warn</p>
                <p className="text-2xl font-semibold tracking-tight">{warnedChecks}</p>
              </div>
              <div className="ops-detail-card space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fail</p>
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
              <p className="ops-section-heading">Environment validation</p>
              <h2 className="text-2xl font-semibold tracking-tight">Production readiness</h2>
            </div>

            {validationErrors.length ? (
              <Alert variant="destructive" className="border-red-500/25 bg-red-500/10">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Blocking issues</AlertTitle>
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
                <AlertTitle>Blocking checks passed</AlertTitle>
                <AlertDescription>No blocking production environment issues were detected.</AlertDescription>
              </Alert>
            )}

            {validationWarnings.length ? (
              <Alert className="border-amber-500/25 bg-amber-500/10">
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Warnings to review</AlertTitle>
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
              <p className="ops-section-heading">Backup gate</p>
              <h2 className="text-2xl font-semibold tracking-tight">Latest backup verification</h2>
              <p className="text-sm text-muted-foreground">
                Use this as a final cutover gate before you move live traffic.
              </p>
            </div>

            {statusQuery.data?.latestBackupVerification ? (
              <div className="ops-row-card flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{statusQuery.data.latestBackupVerification.filename}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Verified {formatDateTime(statusQuery.data.latestBackupVerification.verifiedAt)}
                  </p>
                </div>
                <StepBadge
                  status={statusQuery.data.latestBackupVerification.restoreReady ? 'complete' : 'warning'}
                />
              </div>
            ) : (
              <div className="ops-row-card border-dashed text-sm text-muted-foreground">
                No backup verification record was found yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
