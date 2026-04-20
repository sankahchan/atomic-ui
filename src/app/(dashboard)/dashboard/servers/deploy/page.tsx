'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SurfaceSkeleton } from '@/components/ui/surface-skeleton';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Copy,
  Globe2,
  KeyRound,
  Loader2,
  MapPin,
  Rocket,
  Server,
  ShieldCheck,
  Cpu,
  TerminalSquare,
} from 'lucide-react';

type DeployStep = 1 | 2 | 3 | 4;
type RegionOption = {
  slug: string;
  name: string;
  sizes: string[];
};
type SizeOption = {
  slug: string;
  memory: number;
  vcpus: number;
  disk: number;
  priceMonthly: number;
  description: string;
};

export default function DeployServerPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<DeployStep>(1);
  const [token, setToken] = useState('');

  const [name, setName] = useState('atomic-node-1');
  const [region, setRegion] = useState('');
  const [size, setSize] = useState('');

  const [deploying, setDeploying] = useState(false);
  const [dropletId, setDropletId] = useState<number | null>(null);
  const [dropletIp, setDropletIp] = useState<string | null>(null);

  const configQuery = trpc.provision.checkConfig.useQuery(undefined, {
    retry: false,
  });

  const regionsQuery = trpc.provision.listRegions.useQuery(undefined, {
    enabled: step === 2,
  });

  const sizesQuery = trpc.provision.listSizes.useQuery(undefined, {
    enabled: step === 2,
  });

  const { data: dropletData } = trpc.provision.getDroplet.useQuery(
    { id: dropletId! },
    {
      enabled: !!dropletId && !dropletIp,
      refetchInterval: 3000,
    }
  );

  useEffect(() => {
    if (
      configQuery.data?.hasToken &&
      !configQuery.data.needsTokenMigration &&
      !configQuery.data.tokenError &&
      step === 1
    ) {
      setStep(2);
    }
  }, [configQuery.data, step]);

  useEffect(() => {
    if (dropletData?.ip) {
      setDropletIp(dropletData.ip);
      setDeploying(false);
      setStep(4);
    }
  }, [dropletData]);

  const tokenMutation = trpc.provision.setToken.useMutation({
    onSuccess: () => {
      configQuery.refetch();
      setStep(2);
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deployMutation = trpc.provision.createDroplet.useMutation({
    onSuccess: (data) => {
      setDropletId(data.id);
    },
    onError: (err) => {
      setDeploying(false);
      toast({ title: 'Deployment failed', description: err.message, variant: 'destructive' });
      setStep(2);
    },
  });

  const regionOptions = useMemo(() => (regionsQuery.data ?? []) as RegionOption[], [regionsQuery.data]);
  const allSizeOptions = useMemo(() => (sizesQuery.data ?? []) as SizeOption[], [sizesQuery.data]);

  const selectedRegion = useMemo(
    () => regionOptions.find((item) => item.slug === region) ?? null,
    [regionOptions, region]
  );
  const sizeOptions = useMemo(
    () => allSizeOptions.filter((item) => item.vcpus === 1).slice(0, 10),
    [allSizeOptions]
  );
  const selectedSize = useMemo(
    () => sizeOptions.find((item) => item.slug === size) ?? null,
    [sizeOptions, size]
  );
  const tokenStatusLabel = configQuery.data?.tokenError
    ? 'Invalid'
    : configQuery.data?.needsTokenMigration
      ? 'Needs resave'
      : configQuery.data?.hasToken
        ? 'Configured'
        : 'Required';

  const handleSaveToken = () => {
    if (!token) return;
    tokenMutation.mutate({ token });
  };

  const handleDeploy = () => {
    if (!name || !region || !size) return;
    setDeploying(true);
    setStep(3);
    deployMutation.mutate({ name, region, size });
  };

  const handleCopy = (text: string) => {
    copyToClipboard(text, 'Copied', 'Command copied to clipboard');
  };

  const installCommand = dropletIp
    ? `ssh root@${dropletIp} "bash -c \\"\\$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh)\\""`
    : '';

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="ops-showcase-grid">
          <div className="space-y-5 self-start">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" size="icon" asChild className="h-10 w-10 rounded-full border border-border/60">
                <Link href="/dashboard/servers">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <Badge
                variant="outline"
                className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
              >
                <Rocket className="mr-2 h-3.5 w-3.5" />
                Server provisioning
              </Badge>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                Deploy a new server
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Provision a new Outline node on DigitalOcean, prepare Docker automatically, and finish the Outline install from one guided flow.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Provider</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">DO</p>
                <p className="mt-2 text-sm text-muted-foreground">DigitalOcean automation endpoint.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{step}/4</p>
                <p className="mt-2 text-sm text-muted-foreground">Connect, configure, provision, and finish.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Region</p>
                <p className="mt-3 text-xl font-semibold tracking-tight">{selectedRegion?.name ?? 'Pending'}</p>
                <p className="mt-2 text-sm text-muted-foreground">Choose where the node should be created.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Size</p>
                <p className="mt-3 text-xl font-semibold tracking-tight">
                  {selectedSize ? `$${selectedSize.priceMonthly}/mo` : 'Pending'}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">Single-vCPU droplets are recommended for small installs.</p>
              </div>
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Command rail</p>
                <h2 className="text-xl font-semibold">Provisioning status</h2>
                <p className="text-sm text-muted-foreground">
                  Track readiness, selected capacity, and final SSH access details without leaving this flow.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">API token</p>
                  <p className="mt-2 text-sm font-medium">{tokenStatusLabel}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Droplet state</p>
                  <p className="mt-2 text-sm font-medium">
                    {dropletIp ? 'Ready' : deploying ? 'Provisioning' : step >= 2 ? 'Configuring' : 'Waiting'}
                  </p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Location</p>
                  <p className="mt-2 text-sm font-medium">{selectedRegion?.slug ?? 'Unselected'}</p>
                </div>
                <div className="ops-mini-tile">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Public IP</p>
                  <p className="mt-2 text-sm font-medium">{dropletIp ?? 'Pending'}</p>
                </div>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Workflow guide</p>
                <h2 className="text-xl font-semibold">Expected path</h2>
              </div>

              <div className="ops-detail-card space-y-3">
                {[
                  { label: 'Connect provider', icon: KeyRound, active: step >= 1 },
                  { label: 'Choose region + size', icon: Globe2, active: step >= 2 },
                  { label: 'Provision droplet', icon: Server, active: step >= 3 },
                  { label: 'Finish Outline install', icon: ShieldCheck, active: step >= 4 },
                ].map((item, index) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/50 px-3 py-3 dark:bg-[rgba(6,13,25,0.58)]">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${item.active ? 'bg-primary/12 text-primary dark:bg-cyan-400/12 dark:text-cyan-200' : 'bg-muted text-muted-foreground dark:bg-white/5'}`}>
                        <item.icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">Step {index + 1}</p>
                      </div>
                    </div>
                    <span className={`h-2.5 w-2.5 rounded-full ${item.active ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.65)]' : 'bg-border'}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card className="ops-panel">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-wrap items-center gap-3">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className={`inline-flex min-w-[120px] items-center gap-3 rounded-full border px-4 py-2 text-sm ${
                  step === item
                    ? 'border-primary/35 bg-primary/10 text-primary dark:border-cyan-400/24 dark:bg-cyan-400/12 dark:text-cyan-200'
                    : 'border-border/60 bg-background/60 text-muted-foreground dark:bg-[rgba(5,12,24,0.7)]'
                }`}
              >
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${step >= item ? 'bg-primary text-primary-foreground dark:bg-cyan-400 dark:text-slate-950' : 'bg-muted dark:bg-white/10'}`}>
                  {item}
                </span>
                <span>{item === 1 ? 'Connect' : item === 2 ? 'Configure' : item === 3 ? 'Provision' : 'Finish'}</span>
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {step === 1 ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="ops-detail-card space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="do-token">DigitalOcean Personal Access Token</Label>
                  <Input
                    id="do-token"
                    type="password"
                    placeholder="dop_v1_..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Generate a token with read/write access from DigitalOcean API settings. It is encrypted before storage so future deploys can skip this step.
                  </p>
                  {configQuery.data?.needsTokenMigration ? (
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-300">
                      The saved token came from an older plaintext format. Re-enter it once to encrypt it at rest.
                    </p>
                  ) : null}
                  {configQuery.data?.tokenError ? (
                    <p className="text-sm font-medium text-destructive">{configQuery.data.tokenError}</p>
                  ) : null}
                </div>
                <Button
                  onClick={handleSaveToken}
                  disabled={!token || tokenMutation.isPending}
                  className="rounded-full"
                >
                  {tokenMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Save token and continue
                </Button>
              </div>

              <div className="ops-detail-card space-y-3">
                <p className="ops-section-heading">Provider note</p>
                <h3 className="text-lg font-semibold">Before you start</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="inline-flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-primary" />
                    Only DigitalOcean provisioning is automated in this flow.
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Docker is installed by cloud-init before Outline setup.
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-primary" />
                    You still finish Outline via SSH using the generated install command.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                {(regionsQuery.isLoading || sizesQuery.isLoading) ? (
                  <SurfaceSkeleton className="min-h-[240px]" lines={5} />
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="ops-detail-card space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="deploy-name">Server name</Label>
                        <Input id="deploy-name" value={name} onChange={(e) => setName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="deploy-region">Region</Label>
                        <Select value={region} onValueChange={setRegion}>
                          <SelectTrigger id="deploy-region">
                            <SelectValue placeholder="Select a region" />
                          </SelectTrigger>
                          <SelectContent>
                            {regionOptions.map((item) => (
                              <SelectItem key={item.slug} value={item.slug}>
                                {item.name} ({item.slug})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="ops-detail-card space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="deploy-size">Droplet size</Label>
                        <Select value={size} onValueChange={setSize}>
                          <SelectTrigger id="deploy-size">
                            <SelectValue placeholder="Select a size" />
                          </SelectTrigger>
                          <SelectContent>
                            {sizeOptions.map((item) => (
                              <SelectItem key={item.slug} value={item.slug}>
                                {item.description} ({item.memory}MB / ${item.priceMonthly}/mo)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="ops-mini-tile">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">vCPU</p>
                          <p className="mt-2 text-sm font-medium">{selectedSize?.vcpus ?? '—'}</p>
                        </div>
                        <div className="ops-mini-tile">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Memory</p>
                          <p className="mt-2 text-sm font-medium">{selectedSize ? `${selectedSize.memory}MB` : '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="ops-mobile-action-bar sm:grid-cols-[1fr_auto]">
                  <div className="text-sm text-muted-foreground">
                    Recommended for small installs: 1 vCPU droplets with a region near your users.
                  </div>
                  <Button
                    onClick={handleDeploy}
                    disabled={!name || !region || !size}
                    className="rounded-full"
                  >
                    Deploy droplet
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="ops-detail-card space-y-4">
                <div className="space-y-1">
                  <p className="ops-section-heading">Selection summary</p>
                  <h3 className="text-lg font-semibold">Current config</h3>
                </div>
                <div className="grid gap-3">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hostname</p>
                    <p className="mt-2 text-sm font-medium">{name || 'Pending'}</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Region</p>
                    <p className="mt-2 text-sm font-medium">{selectedRegion?.name ?? 'Pending'}</p>
                    {selectedRegion ? <p className="mt-1 text-xs text-muted-foreground">{selectedRegion.slug}</p> : null}
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Droplet size</p>
                    <p className="mt-2 text-sm font-medium">{selectedSize?.description ?? 'Pending'}</p>
                    {selectedSize ? <p className="mt-1 text-xs text-muted-foreground">${selectedSize.priceMonthly}/month</p> : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="ops-detail-card min-h-[280px] space-y-6">
              <div className="flex justify-center">
                <span className="relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200">
                  <Loader2 className="h-9 w-9 animate-spin" />
                  <Rocket className="absolute h-5 w-5" />
                </span>
              </div>
              <div className="space-y-2 text-center">
                <h3 className="text-2xl font-semibold">Provisioning droplet</h3>
                <p className="mx-auto max-w-lg text-sm leading-7 text-muted-foreground">
                  Allocating the server, assigning a public IP, and installing Docker. This usually finishes in 30 to 60 seconds.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="ops-mini-tile text-center">
                  <MapPin className="mx-auto h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-medium">{selectedRegion?.slug ?? 'Waiting'}</p>
                </div>
                <div className="ops-mini-tile text-center">
                  <Cpu className="mx-auto h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-medium">{selectedSize?.slug ?? 'Waiting'}</p>
                </div>
                <div className="ops-mini-tile text-center">
                  <Server className="mx-auto h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-medium">{dropletId ? `#${dropletId}` : 'Requesting ID'}</p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="ops-detail-card space-y-5">
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-semibold">Droplet is ready</h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Your server is provisioned at <span className="font-medium text-foreground">{dropletIp}</span>. The last step is to run the Outline installer over SSH.
                    </p>
                  </div>
                </div>

                <div className="ops-detail-card space-y-3 bg-background/55 dark:bg-[rgba(4,11,23,0.78)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="ops-section-heading">Install command</p>
                      <p className="text-sm text-muted-foreground">Run this on your machine to finish Outline setup.</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => handleCopy(installCommand)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <code className="block overflow-x-auto rounded-[1.2rem] border border-border/60 bg-black/80 px-4 py-4 text-xs leading-6 text-white">
                    {installCommand}
                  </code>
                </div>

                <div className="ops-mobile-action-bar sm:grid-cols-[1fr_auto]">
                  <p className="text-sm text-muted-foreground">
                    After installation, copy the generated <code>apiUrl</code> and add it from the servers page.
                  </p>
                  <Button asChild className="rounded-full">
                    <Link href="/dashboard/servers">Return to servers</Link>
                  </Button>
                </div>
              </div>

              <div className="ops-detail-card space-y-4">
                <div className="space-y-1">
                  <p className="ops-section-heading">Finish checklist</p>
                  <h3 className="text-lg font-semibold">After SSH install</h3>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Run the installer command above.
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Copy the generated access key management URL.
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Add the server from the inventory page.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
