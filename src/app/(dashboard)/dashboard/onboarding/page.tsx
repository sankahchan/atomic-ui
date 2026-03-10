'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, RefreshCw, Rocket, Server, ShieldCheck, ArrowRightLeft, LifeBuoy, Upload, Wand2 } from 'lucide-react';
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
      await Promise.all([statusQuery.refetch(), postInstallChecksQuery.refetch(), utils.servers.list.invalidate()]);
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

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader className="space-y-4">
            <Badge variant="outline" className="w-fit rounded-full border-primary/25 bg-primary/10 px-3 py-1 text-primary">
              <Rocket className="mr-2 h-3.5 w-3.5" />
              Onboarding & Migration Wizard
            </Badge>
            <div>
              <CardTitle className="text-3xl font-semibold tracking-tight">Launch checklist</CardTitle>
              <CardDescription className="mt-2 max-w-2xl text-base">
                Connect the first server, import existing users and keys, and run post-install checks before you put the panel into production use.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-[1.75rem] border border-border/70 bg-background/65 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Readiness</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {statusQuery.data?.summary.completedSteps ?? 0}/{statusQuery.data?.summary.totalSteps ?? 0}
                  </p>
                </div>
                {statusQuery.data?.summary.readyForLaunch ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                    Ready for launch
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300">
                    Still in setup
                  </Badge>
                )}
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-[1.4rem] border border-border/70 bg-background/65">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Active servers</p>
                  <p className="mt-3 text-3xl font-semibold">{statusQuery.data?.summary.activeServers ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.4rem] border border-border/70 bg-background/65">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Healthy servers</p>
                  <p className="mt-3 text-3xl font-semibold">{statusQuery.data?.summary.onlineServers ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.4rem] border border-border/70 bg-background/65">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Imported keys</p>
                  <p className="mt-3 text-3xl font-semibold">{statusQuery.data?.summary.accessKeyCount ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.4rem] border border-border/70 bg-background/65">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Users</p>
                  <p className="mt-3 text-3xl font-semibold">{statusQuery.data?.summary.userCount ?? 0}</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-xl">Quick actions</CardTitle>
            <CardDescription>Finish the common first-run tasks without leaving the wizard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-between rounded-2xl" asChild>
              <Link href="/dashboard/servers/deploy">
                <span className="inline-flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Deploy first server
                </span>
                <span>Open</span>
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-between rounded-2xl" asChild>
              <Link href="/dashboard/migration">
                <span className="inline-flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" />
                  Open migration tools
                </span>
                <span>Open</span>
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-between rounded-2xl" asChild>
              <Link href="/dashboard/incidents">
                <span className="inline-flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4" />
                  Review incident center
                </span>
                <span>Open</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between rounded-2xl"
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending}
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Sync all connected servers
              </span>
              {syncAllMutation.isPending ? 'Running...' : 'Run'}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Server className="h-5 w-5 text-primary" />
              Add the first server
            </CardTitle>
            <CardDescription>
              Paste the full Outline Manager output or enter the API URL and certificate fingerprint manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                className="min-h-[150px]"
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
                  onChange={(event) => setServerForm((current) => ({ ...current, countryCode: event.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="SG"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Certificate SHA-256 (manual fallback)</Label>
              <Input
                value={serverForm.apiCertSha256}
                onChange={(event) => setServerForm((current) => ({ ...current, apiCertSha256: event.target.value }))}
                placeholder="64-character SHA-256 fingerprint"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => createFirstServerMutation.mutate(serverForm)}
                disabled={createFirstServerMutation.isPending || !serverForm.name.trim()}
              >
                {createFirstServerMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                Connect server
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Upload className="h-5 w-5 text-primary" />
              Import existing users and keys
            </CardTitle>
            <CardDescription>
              Paste JSON or CSV exported from another panel. Users are created, and keys are matched against the current inventory.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Import content</Label>
              <Textarea
                className="min-h-[220px]"
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
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => previewImportMutation.mutate({ content: importContent })}
                disabled={previewImportMutation.isPending || !importContent.trim()}
              >
                {previewImportMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Preview import
              </Button>
              <Button
                onClick={() => applyImportMutation.mutate({ content: importContent, defaultPassword: defaultPassword || undefined })}
                disabled={applyImportMutation.isPending || !importContent.trim()}
              >
                {applyImportMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply import
              </Button>
            </div>
            {importPreview ? (
              <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/65 p-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Users to create</p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.usersToCreate}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Existing users</p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.usersExisting}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Keys matched</p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.keysMatched}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Keys unmatched</p>
                    <p className="mt-2 text-2xl font-semibold">{importPreview.summary.keysUnmatched}</p>
                  </div>
                </div>
                {importPreview.warnings.length ? (
                  <Alert>
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
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[2rem] border border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-xl">Guided steps</CardTitle>
            <CardDescription>Follow the steps in order for a smoother first deployment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusQuery.data?.steps.map((step, index) => (
              <div key={step.id} className="rounded-[1.5rem] border border-border/70 bg-background/65 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background text-sm font-semibold">
                        {index + 1}
                      </div>
                      <StepBadge status={step.status} />
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{step.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                      <p className="mt-3 text-sm font-medium text-foreground">{step.summary}</p>
                    </div>
                  </div>
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link href={step.href}>{step.actionLabel}</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border border-border/70 bg-background/75">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">Post-install checks</CardTitle>
                <CardDescription>Run the same final checks you would use on a fresh VPS before public traffic is allowed.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void postInstallChecksQuery.refetch()}>
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {postInstallChecksQuery.data?.checks.map((check) => (
                <div key={check.id} className="rounded-[1.5rem] border border-border/70 bg-background/65 p-4">
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
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {check.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border border-border/70 bg-background/75">
            <CardHeader>
              <CardTitle className="text-xl">Environment validation</CardTitle>
              <CardDescription>Fresh VPS installs should clear these checks before public traffic is allowed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {statusQuery.data?.validation.errors.length ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Blocking issues</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {statusQuery.data.validation.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Blocking checks passed</AlertTitle>
                  <AlertDescription>No blocking production env issues were detected.</AlertDescription>
                </Alert>
              )}

              {statusQuery.data?.validation.warnings.length ? (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Warnings to review</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {statusQuery.data.validation.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border border-border/70 bg-background/75">
            <CardHeader>
              <CardTitle className="text-xl">Latest backup verification</CardTitle>
              <CardDescription>Use this as a final gate before migration cutover.</CardDescription>
            </CardHeader>
            <CardContent>
              {statusQuery.data?.latestBackupVerification ? (
                <div className="rounded-[1.5rem] border border-border/70 bg-background/65 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{statusQuery.data.latestBackupVerification.filename}</p>
                      <p className="text-sm text-muted-foreground">
                        Verified {formatDateTime(statusQuery.data.latestBackupVerification.verifiedAt)}
                      </p>
                    </div>
                    <StepBadge
                      status={statusQuery.data.latestBackupVerification.restoreReady ? 'complete' : 'warning'}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No backup verification record was found yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
