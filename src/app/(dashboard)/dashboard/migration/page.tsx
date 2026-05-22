'use client';

/**
 * Server Migration Page
 *
 * Allows admins to migrate access keys between Outline servers.
 * Supports bulk selection with progress tracking and per-key status.
 *
 * Workflow:
 *   1. Select source and target servers
 *   2. Preview eligible keys (optionally filter)
 *   3. Select keys to migrate (or "Select All")
 *   4. Run migration with live progress bar
 *   5. View results summary
 */

import Link from 'next/link';
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { formatBytes, cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowRightLeft,
  Server,
  Key,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  MapPin,
  Wand2,
  CheckSquare,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function StatusBadge({ status, isMyanmar = false }: { status: string; isMyanmar?: boolean }) {
  const variants: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    PENDING: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    DISABLED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    EXPIRED: 'bg-red-500/15 text-red-400 border-red-500/30',
    DEPLETED: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  };
  const labels: Record<string, string> = isMyanmar
    ? {
        ACTIVE: 'အသက်ဝင်',
        PENDING: 'စောင့်ဆိုင်း',
        DISABLED: 'ပိတ်ထား',
        EXPIRED: 'သက်တမ်းကုန်',
        DEPLETED: 'ကုန်ဆုံး',
      }
    : {
        ACTIVE: 'ACTIVE',
        PENDING: 'PENDING',
        DISABLED: 'DISABLED',
        EXPIRED: 'EXPIRED',
        DEPLETED: 'DEPLETED',
      };
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', variants[status] || '')}>
      {labels[status] || status}
    </Badge>
  );
}

function MigrationStatCard({
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

// ─────────────────────────────────────────────
// Migration Results Dialog
// ─────────────────────────────────────────────

interface MigrationKeyResult {
  keyId: string;
  keyName: string;
  success: boolean;
  error?: string;
  newOutlineKeyId?: string;
}

interface MigrationResultData {
  migrated: number;
  failed: number;
  total: number;
  results: MigrationKeyResult[];
}

function MigrationResultsDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: MigrationResultData | null;
}) {
  const { locale } = useLocale();
  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.failed === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : result.migrated === 0 ? (
              <XCircle className="w-5 h-5 text-red-500" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            )}
            {locale === 'my' ? 'ပြောင်းရွှေ့မှု ပြီးဆုံးပါပြီ' : 'Migration Complete'}
          </DialogTitle>
          <DialogDescription>
            {locale === 'my'
              ? `${result.total} ခုအနက် ${result.migrated} ခုကို အောင်မြင်စွာ ပြောင်းရွှေ့ပြီးပါပြီ${result.failed > 0 ? ` (${result.failed} ခု မအောင်မြင်)` : ''}`
              : `${result.migrated} of ${result.total} keys migrated successfully${result.failed > 0 ? ` (${result.failed} failed)` : ''}`}
          </DialogDescription>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="bg-emerald-500/10 border-emerald-500/30">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-emerald-500">{result.migrated}</div>
              <div className="text-xs text-muted-foreground">{locale === 'my' ? 'ပြောင်းရွှေ့ပြီး' : 'Migrated'}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-500">{result.failed}</div>
              <div className="text-xs text-muted-foreground">{locale === 'my' ? 'မအောင်မြင်' : 'Failed'}</div>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/30">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-500">{result.total}</div>
              <div className="text-xs text-muted-foreground">{locale === 'my' ? 'စုစုပေါင်း' : 'Total'}</div>
            </CardContent>
          </Card>
        </div>

        {/* Per-key results */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{locale === 'my' ? 'သော့' : 'Key'}</TableHead>
                <TableHead>{locale === 'my' ? 'အခြေအနေ' : 'Status'}</TableHead>
                <TableHead>{locale === 'my' ? 'အသေးစိတ်' : 'Details'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.results.map((r) => (
                <TableRow key={r.keyId}>
                  <TableCell className="font-medium">{r.keyName}</TableCell>
                  <TableCell>
                    {r.success ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> {locale === 'my' ? 'အောင်မြင်' : 'Success'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                        <XCircle className="w-3 h-3 mr-1" /> {locale === 'my' ? 'မအောင်မြင်' : 'Failed'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.success
                      ? locale === 'my'
                        ? `Outline ID အသစ်: ${r.newOutlineKeyId}`
                        : `New Outline ID: ${r.newOutlineKeyId}`
                      : r.error}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{locale === 'my' ? 'ပိတ်မည်' : 'Close'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function MigrationPage() {
  const { locale, t } = useLocale();
  const { toast } = useToast();
  const isMyanmar = locale === 'my';

  // Step tracking: 'select' | 'preview' | 'migrating' | 'done'
  const [step, setStep] = useState<'select' | 'preview' | 'migrating' | 'done'>('select');

  // Server selection
  const [sourceServerId, setSourceServerId] = useState<string>('');
  const [targetServerId, setTargetServerId] = useState<string>('');
  const [deleteFromSource, setDeleteFromSource] = useState(true);

  // Key selection
  const [selectedKeyIds, setSelectedKeyIds] = useState<Set<string>>(new Set());

  // Results
  const [migrationResult, setMigrationResult] = useState<MigrationResultData | null>(null);
  const [showResultsDialog, setShowResultsDialog] = useState(false);

  // ── Queries ──
  const serversQuery = trpc.servers.list.useQuery({ includeInactive: false });

  const previewQuery = trpc.servers.migrationPreview.useQuery(
    { sourceServerId, targetServerId },
    { enabled: !!sourceServerId && !!targetServerId && sourceServerId !== targetServerId },
  );

  const migrateMutation = trpc.servers.migrateKeys.useMutation({
    onSuccess: (data) => {
      setMigrationResult(data);
      setStep('done');
      setShowResultsDialog(true);

      if (data.failed === 0) {
        toast({
          title: isMyanmar ? 'ပြောင်းရွှေ့မှု ပြီးဆုံးပါပြီ' : 'Migration complete',
          description: isMyanmar ? `${data.migrated} ခုကို အောင်မြင်စွာ ပြောင်းရွှေ့ပြီးပါပြီ။` : `${data.migrated} keys migrated successfully.`,
        });
      } else {
        toast({
          title: isMyanmar ? 'ပြောင်းရွှေ့မှုတွင် အမှားများ ရှိနေသည်' : 'Migration finished with errors',
          description: isMyanmar ? `${data.migrated} ခု အောင်မြင်ပြီး ${data.failed} ခု မအောင်မြင်ပါ။` : `${data.migrated} migrated, ${data.failed} failed.`,
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      setStep('preview');
      toast({ title: isMyanmar ? 'ပြောင်းရွှေ့မှု မအောင်မြင်ပါ' : 'Migration failed', description: error.message, variant: 'destructive' });
    },
  });

  // ── Derived ──
  const servers = serversQuery.data ?? [];

  // Filter out source from target options and vice-versa
  const sourceOptions = servers.filter((s) => s.id !== targetServerId);
  const targetOptions = servers.filter((s) => s.id !== sourceServerId);

  const previewKeys = useMemo(() => previewQuery.data?.keys ?? [], [previewQuery.data?.keys]);
  const allKeyIds = useMemo(() => new Set(previewKeys.map((k) => k.id)), [previewKeys]);

  const allSelected = selectedKeyIds.size > 0 && selectedKeyIds.size === allKeyIds.size;
  const sourceServer = servers.find((server) => server.id === sourceServerId);
  const targetServer = servers.find((server) => server.id === targetServerId);

  // ── Handlers ──
  function handleLoadPreview() {
    if (!sourceServerId || !targetServerId) {
      toast({ title: isMyanmar ? 'ဆာဗာ နှစ်ခုလုံးကို ရွေးပါ' : 'Please select both servers', variant: 'destructive' });
      return;
    }
    if (sourceServerId === targetServerId) {
      toast({ title: isMyanmar ? 'မူလဆာဗာနှင့် ပစ်မှတ်ဆာဗာ မတူရပါ' : 'Source and target must be different', variant: 'destructive' });
      return;
    }
    setSelectedKeyIds(new Set());
    setMigrationResult(null);
    setStep('preview');
  }

  function handleToggleAll() {
    if (allSelected) {
      setSelectedKeyIds(new Set());
    } else {
      setSelectedKeyIds(new Set(allKeyIds));
    }
  }

  function handleToggleKey(keyId: string) {
    setSelectedKeyIds((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  }

  function startMigrationRun(keyIds: string[]) {
    if (keyIds.length === 0) {
      toast({ title: isMyanmar ? 'အနည်းဆုံး သော့တစ်ခုကို ရွေးပါ' : 'Please select at least one key', variant: 'destructive' });
      return;
    }

    setStep('migrating');
    migrateMutation.mutate({
      sourceServerId,
      targetServerId,
      keyIds,
      deleteFromSource,
    });
  }

  function handleStartMigration() {
    startMigrationRun(Array.from(selectedKeyIds));
  }

  function handleMigrateAllNow() {
    const allPreviewIds = previewKeys.map((key) => key.id);
    if (allPreviewIds.length === 0) {
      toast({
        title: isMyanmar ? 'ပြောင်းရွှေ့ရန် သော့ မရှိပါ' : 'No eligible keys found',
        description: isMyanmar
          ? 'ရွေးထားသော မူလဆာဗာတွင် ပြောင်းရွှေ့ရန် အသက်ဝင် သို့မဟုတ် စောင့်ဆိုင်းနေသော သော့ မရှိပါ။'
          : 'The selected source server has no active or pending keys to move.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedKeyIds(new Set(allPreviewIds));
    startMigrationRun(allPreviewIds);
  }

  function handleReset() {
    setStep('select');
    setSourceServerId('');
    setTargetServerId('');
    setSelectedKeyIds(new Set());
    setMigrationResult(null);
  }

  // ── Progress ──
  const progressPercent =
    step === 'migrating' ? 50 : // Indeterminate-ish while running
    step === 'done' && migrationResult ? 100 : 0;

  // ── Render ──
  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
              {isMyanmar ? 'ပြောင်းရွှေ့မှု ထိန်းချုပ်ရေး စင်တာ' : 'Migration Control Center'}
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {isMyanmar ? 'ဆာဗာ ပြောင်းရွှေ့မှု' : 'Server migration'}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {isMyanmar
                  ? 'Outline ဆာဗာများအကြား အသုံးပြုခွင့်သော့များကို ကြိုတင်ကြည့်ရှုနိုင်သော၊ တိကျစွာရွေးချယ်နိုင်သော၊ ရလဒ်ကို တိုက်ရိုက်စောင့်ကြည့်နိုင်သော ပုံစံဖြင့် ပြောင်းရွှေ့ပါ။'
                  : 'Move access keys between Outline servers with a controlled preview, explicit selection, and live migration result tracking.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MigrationStatCard
                label={isMyanmar ? 'ချိတ်ဆက်ထားသော ဆာဗာများ' : 'Connected servers'}
                value={servers.length}
                helper={isMyanmar ? 'မူလနှင့် ပစ်မှတ်ရွေးချယ်ရန် အသင့်ဖြစ်နေသည်။' : 'Available for source and target selection.'}
              />
              <MigrationStatCard
                label={isMyanmar ? 'ပြောင်းရွှေ့နိုင်သော သော့များ' : 'Eligible keys'}
                value={previewKeys.length}
                helper={isMyanmar ? 'ပြောင်းရွှေ့နိုင်သော သော့များကို ကြိုတင်ကြည့်ပါ။' : 'Preview keys that can be moved.'}
              />
              <MigrationStatCard
                label={isMyanmar ? 'ရွေးထားပြီးသော သော့များ' : 'Selected'}
                value={selectedKeyIds.size}
                helper={isMyanmar ? 'လာမည့် ပြောင်းရွှေ့မှုအတွက် ရွေးထားသော သော့များ။' : 'Keys chosen for the next migration run.'}
              />
              <MigrationStatCard
                label={isMyanmar ? 'နောက်ဆုံး ရလဒ်' : 'Latest result'}
                value={migrationResult ? `${migrationResult.migrated}/${migrationResult.total}` : '—'}
                helper={migrationResult
                  ? isMyanmar
                    ? `နောက်ဆုံးတစ်ကြိမ်တွင် ${migrationResult.failed} ခု မအောင်မြင်ပါ။`
                    : `${migrationResult.failed} failed in the last run.`
                  : isMyanmar
                    ? 'ပြောင်းရွှေ့မှု မလုပ်ရသေးပါ။'
                    : 'No migration run yet.'}
              />
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'ပြောင်းရွှေ့မှု ထိန်းချုပ်ချက်များ' : 'Migration controls'}</p>
                <h2 className="text-xl font-semibold">{t('dashboard.command_rail')}</h2>
                <p className="text-sm text-muted-foreground">
                  {isMyanmar
                  ? 'ဤစာမျက်နှာမှ မထွက်ဘဲ အစမှ ပြန်စနိုင်ပြီး၊ ဆာဗာစာရင်းကို စစ်ဆေးနိုင်သလို သော့နှင့် တပ်ဆင်မှု စာမျက်နှာများကိုလည်း တိုက်ရိုက်ဖွင့်နိုင်ပါသည်။'
                    : 'Start over, inspect server inventory, or open the dedicated deploy and key surfaces without leaving migration.'}
                </p>
              </div>

              {step !== 'select' ? (
                <Button variant="outline" className="h-11 w-full rounded-full" onClick={handleReset}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('dashboard.start_over')}
                </Button>
              ) : null}

              <div className="space-y-2">
                <Link href="/dashboard/servers" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Server className="h-4 w-4 text-primary" />
                    {isMyanmar ? 'ဆာဗာစာရင်းကို ဖွင့်မည်' : 'Open server inventory'}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.open')}</span>
                </Link>
                <Link href="/dashboard/keys" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Key className="h-4 w-4 text-primary" />
                    {isMyanmar ? 'အသုံးပြုခွင့်သော့များကို စစ်ဆေးမည်' : 'Review access keys'}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('dashboard.open')}</span>
                </Link>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">{isMyanmar ? 'ပြောင်းရွှေ့လမ်းကြောင်း' : 'Migration path'}</p>
                <h2 className="text-xl font-semibold">{t('dashboard.current_route')}</h2>
              </div>

              <div className="ops-detail-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t('dashboard.source')}</p>
                    <p className="text-sm text-muted-foreground">
                      {sourceServer ? `${sourceServer.name}${sourceServer.location ? ` · ${sourceServer.location}` : ''}` : t('dashboard.not_selected')}
                    </p>
                  </div>
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowRight className="h-4 w-4" />
                  <span>{isMyanmar ? 'သို့' : 'to'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t('dashboard.target')}</p>
                    <p className="text-sm text-muted-foreground">
                      {targetServer ? `${targetServer.name}${targetServer.location ? ` · ${targetServer.location}` : ''}` : t('dashboard.not_selected')}
                    </p>
                  </div>
                  <Server className="h-4 w-4 text-primary" />
                </div>
              </div>

              <div className="ops-detail-card space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('dashboard.workflow')}
                </p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="inline-flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-primary" />
                    {t('dashboard.select_source_target')}
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    {t('dashboard.preview_eligible_keys')}
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-primary" />
                    {t('dashboard.run_migration_and_review')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step 1: Server Selection */}
      <Card className="ops-panel">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-xl flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
            {isMyanmar ? '၁။ ဆာဗာများကို ရွေးချယ်ပါ' : '1. Select Servers'}
            </CardTitle>
            <CardDescription>
              {isMyanmar
              ? 'သော့များကို မည်သည့်ဆာဗာမှ ပြောင်းရွှေ့မည်နှင့် မည်သည့်ဆာဗာသို့ ပို့မည်ကို ရွေးချယ်ပါ။'
              : 'Choose the source server to move keys from and the target server to move them to.'}
            </CardDescription>
          </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-end">
            {/* Source server */}
            <div className="ops-detail-card space-y-2">
              <Label>{isMyanmar ? 'မူလဆာဗာ' : 'Source Server'}</Label>
              <Select
                value={sourceServerId}
                onValueChange={(v) => {
                  setSourceServerId(v);
                  setSelectedKeyIds(new Set());
                  setMigrationResult(null);
                  if (step !== 'select') setStep('select');
                }}
                disabled={step === 'migrating'}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isMyanmar ? 'မူလဆာဗာကို ရွေးချယ်ပါ...' : 'Select source server...'} />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        {s.name}
                        {s.location && (
                          <span className="text-xs text-muted-foreground">({s.location})</span>
                        )}
                        <Badge variant="outline" className="text-xs ml-1">
                          {isMyanmar ? `${s.metrics.activeKeys} ခု` : `${s.metrics.activeKeys} keys`}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center pb-1">
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
            </div>

            {/* Target server */}
            <div className="ops-detail-card space-y-2">
              <Label>{isMyanmar ? 'ပစ်မှတ်ဆာဗာ' : 'Target Server'}</Label>
              <Select
                value={targetServerId}
                onValueChange={(v) => {
                  setTargetServerId(v);
                  setSelectedKeyIds(new Set());
                  setMigrationResult(null);
                  if (step !== 'select') setStep('select');
                }}
                disabled={step === 'migrating'}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isMyanmar ? 'ပစ်မှတ်ဆာဗာကို ရွေးချယ်ပါ...' : 'Select target server...'} />
                </SelectTrigger>
                <SelectContent>
                  {targetOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        {s.name}
                        {s.location && (
                          <span className="text-xs text-muted-foreground">({s.location})</span>
                        )}
                        <Badge variant="outline" className="text-xs ml-1">
                          {isMyanmar ? `${s.metrics.activeKeys} ခု` : `${s.metrics.activeKeys} keys`}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Options row */}
          <div className="ops-mobile-action-bar mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="deleteFromSource"
                checked={deleteFromSource}
                onCheckedChange={(v) => setDeleteFromSource(!!v)}
                disabled={step === 'migrating'}
              />
              <Label htmlFor="deleteFromSource" className="text-sm cursor-pointer">
                {isMyanmar ? 'ပြောင်းရွှေ့ပြီးနောက် မူလဆာဗာမှ သော့ဟောင်းများကို ဖျက်မည်' : 'Delete old keys from source server after migration'}
              </Label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                className="sm:min-w-[160px]"
                onClick={handleLoadPreview}
                disabled={!sourceServerId || !targetServerId || step === 'migrating'}
              >
                {isMyanmar ? 'သော့များကို တင်မည်' : 'Load Keys'}
              </Button>
              <Button
                className="sm:min-w-[220px]"
                onClick={handleMigrateAllNow}
                disabled={
                  !sourceServerId ||
                  !targetServerId ||
                  step === 'migrating' ||
                  previewQuery.isLoading ||
                  previewKeys.length === 0
                }
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                {isMyanmar ? 'အသက်ဝင်နေသော သော့အားလုံးကို ပြောင်းရွှေ့မည်' : 'Migrate all active keys'}
              </Button>
            </div>
          </div>
          {sourceServerId && targetServerId ? (
            <div className="mt-4 rounded-[1.1rem] border border-border/60 bg-background/40 p-4 text-sm dark:bg-white/[0.03]">
              {previewQuery.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isMyanmar ? 'ပြောင်းရွှေ့မှု အကြိုကြည့်ချက်ကို တင်နေသည်…' : 'Loading migration preview…'}
                </div>
              ) : previewQuery.data ? (
                <div className="space-y-1">
                  <p className="font-medium">
                    {isMyanmar
                      ? `${previewQuery.data.sourceServer.name} မှ ${previewQuery.data.targetServer.name} သို့ ပြောင်းရွှေ့နိုင်သော အသက်ဝင် သို့မဟုတ် စောင့်ဆိုင်းနေသော သော့ ${previewQuery.data.totalKeys} ခု ရှိသည်။`
                      : `${previewQuery.data.totalKeys} active or pending key${previewQuery.data.totalKeys === 1 ? '' : 's'} can move from ${previewQuery.data.sourceServer.name} to ${previewQuery.data.targetServer.name}.`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isMyanmar
                        ? 'တစ်ဆင့်တည်း ပြောင်းရွှေ့လိုပါက “အသက်ဝင်နေသော သော့အားလုံးကို ပြောင်းရွှေ့မည်” ကို သုံးပါ။ သီးသန့်ရွေးချယ်လိုပါက အကြိုကြည့်ချက်ကို အရင်တင်ပါ။'
                      : 'Use “Migrate all active keys” for a one-step run, or load the preview to choose specific keys.'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Step 2: Key Selection Preview */}
      {(step === 'preview' || step === 'migrating' || step === 'done') && (
        <Card className="ops-panel">
          <CardHeader className="px-0 pt-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Key className="w-5 h-5 text-primary" />
                  {isMyanmar ? '၂။ ပြောင်းရွှေ့မည့် သော့များကို ရွေးချယ်ပါ' : '2. Select Keys to Migrate'}
                </CardTitle>
                <CardDescription>
                  {previewQuery.isLoading ? (
                    isMyanmar ? 'သော့များ တင်နေသည်...' : 'Loading keys...'
                  ) : (
                    <>
                      {isMyanmar
                        ? `ပြောင်းရွှေ့နိုင်သော သော့ ${previewKeys.length} ခု တွေ့ရှိပါသည်${selectedKeyIds.size > 0 ? ` · ${selectedKeyIds.size} ခု ရွေးထားသည်` : ''}`
                        : `${previewKeys.length} eligible key${previewKeys.length !== 1 ? 's' : ''} found${selectedKeyIds.size > 0 ? ` · ${selectedKeyIds.size} selected` : ''}`}
                    </>
                  )}
                </CardDescription>
              </div>

              {/* Migration path summary */}
              {previewQuery.data && (
                <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {previewQuery.data.sourceServer.name}
                  </div>
                  <ArrowRight className="w-4 h-4" />
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {previewQuery.data.targetServer.name}
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {previewQuery.isLoading ? (
              <div className="ops-chart-empty">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{isMyanmar ? 'သော့များ တင်နေသည်...' : 'Loading keys...'}</span>
              </div>
            ) : previewKeys.length === 0 ? (
                    <div className="ops-chart-empty flex-col py-12 text-muted-foreground">
                <Key className="w-10 h-10 mb-2 opacity-30" />
                  <p>{isMyanmar ? 'မူလဆာဗာတွင် ပြောင်းရွှေ့နိုင်သော သော့များ မရှိပါ။' : 'No eligible keys found on the source server.'}</p>
                <p className="text-xs mt-1">{isMyanmar ? 'အသက်ဝင်နေသော သော့များနှင့် စောင့်ဆိုင်းနေသော သော့များကိုသာ ပြောင်းရွှေ့နိုင်ပါသည်။' : 'Only ACTIVE and PENDING keys can be migrated.'}</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {previewKeys.map((key) => {
                    const isSelected = selectedKeyIds.has(key.id);
                    const keyResult = migrationResult?.results.find((r) => r.keyId === key.id);

                    return (
                      <div
                        key={key.id}
                        className={cn(
                          'ops-mobile-card space-y-3',
                          isSelected && 'ring-1 ring-primary/30',
                          keyResult?.success && 'border-emerald-500/30',
                          keyResult && !keyResult.success && 'border-red-500/30',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{key.name}</p>
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <StatusBadge status={key.status} isMyanmar={isMyanmar} />
                              {key.dynamicKeyName ? <span>{key.dynamicKeyName}</span> : null}
                            </div>
                          </div>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleKey(key.id)}
                            disabled={step === 'migrating'}
                          />
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အသုံးပြုမှု' : 'Usage'}</p>
                            <p className="mt-2 text-lg font-semibold">{formatBytes(BigInt(key.usedBytes))}</p>
                          </div>
                          <div className="ops-mini-tile">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'ဒေတာ ကန့်သတ်ချက်' : 'Data limit'}</p>
                            <p className="mt-2 text-lg font-semibold">
                              {key.dataLimitBytes ? formatBytes(BigInt(key.dataLimitBytes)) : isMyanmar ? 'မရှိ' : 'None'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Key table */}
                <div className="ops-data-shell hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={handleToggleAll}
                            disabled={step === 'migrating'}
                          />
                        </TableHead>
                        <TableHead>{isMyanmar ? 'အမည်' : 'Name'}</TableHead>
                        <TableHead>{isMyanmar ? 'အခြေအနေ' : 'Status'}</TableHead>
                        <TableHead>{isMyanmar ? 'အသုံးပြုမှု' : 'Usage'}</TableHead>
                        <TableHead>{isMyanmar ? 'ဒေတာ ကန့်သတ်ချက်' : 'Data Limit'}</TableHead>
                        <TableHead>{isMyanmar ? 'ပြောင်းလဲသတ်မှတ် သော့' : 'Dynamic Key'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewKeys.map((key) => {
                        const isSelected = selectedKeyIds.has(key.id);
                        // Check migration result for this key
                        const keyResult = migrationResult?.results.find((r) => r.keyId === key.id);

                        return (
                          <TableRow
                            key={key.id}
                            className={cn(
                              'cursor-pointer transition-colors',
                              isSelected && 'bg-primary/5',
                              keyResult?.success && 'bg-emerald-500/5',
                              keyResult && !keyResult.success && 'bg-red-500/5',
                            )}
                            onClick={() => step !== 'migrating' && handleToggleKey(key.id)}
                          >
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleToggleKey(key.id)}
                                disabled={step === 'migrating'}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {key.name}
                                {keyResult?.success && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                {keyResult && !keyResult.success && <XCircle className="w-4 h-4 text-red-500" />}
                              </div>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={key.status} isMyanmar={isMyanmar} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatBytes(BigInt(key.usedBytes))}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {key.dataLimitBytes
                                ? formatBytes(BigInt(key.dataLimitBytes))
                                : <span className="text-xs text-muted-foreground/50">{isMyanmar ? 'မရှိ' : 'None'}</span>}
                            </TableCell>
                            <TableCell>
                              {key.dynamicKeyName ? (
                                <Badge variant="outline" className="text-xs">
                                  {key.dynamicKeyName}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Progress bar during migration */}
                {step === 'migrating' && (
                  <div className="ops-detail-card mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-muted-foreground">
                        {isMyanmar
                          ? `သော့ ${selectedKeyIds.size} ခုကို ပြောင်းရွှေ့နေပါသည်…`
                          : `Migrating ${selectedKeyIds.size} key${selectedKeyIds.size !== 1 ? 's' : ''}...`}
                      </span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>
                )}

                {/* Action buttons */}
                {step === 'preview' && (
                  <div className="ops-mobile-action-bar mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {isMyanmar
                        ? `စုစုပေါင်း ${previewKeys.length} ခုမှ ${selectedKeyIds.size} ခု ရွေးထားသည်`
                        : `${selectedKeyIds.size} of ${previewKeys.length} keys selected`}
                    </p>
                      <Button
                      onClick={handleStartMigration}
                      disabled={selectedKeyIds.size === 0}
                      className="gap-2"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      {isMyanmar
                        ? `သော့ ${selectedKeyIds.size} ခုကို ပြောင်းရွှေ့မည်`
                        : `Migrate ${selectedKeyIds.size} Key${selectedKeyIds.size !== 1 ? 's' : ''}`}
                    </Button>
                  </div>
                )}

                {/* Done state */}
                {step === 'done' && migrationResult && (
                  <div className="ops-mobile-action-bar mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>
                        {isMyanmar
                          ? `ပြောင်းရွှေ့မှု ပြီးစီးပါပြီ - ${migrationResult.migrated} ခု အောင်မြင်${migrationResult.failed > 0 ? `၊ ${migrationResult.failed} ခု မအောင်မြင်` : ''}`
                          : `Migration complete: ${migrationResult.migrated} migrated${migrationResult.failed > 0 ? `, ${migrationResult.failed} failed` : ''}`}
                      </span>
                    </div>
                    <Button variant="outline" onClick={() => setShowResultsDialog(true)}>
                        {isMyanmar ? 'အသေးစိတ် ကြည့်မည်' : 'View Details'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* How It Works card */}
      {step === 'select' && (
        <Card className="ops-panel">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-xl">{isMyanmar ? 'ဆာဗာ ပြောင်းရွှေ့မှု လုပ်ဆောင်ပုံ' : 'How server migration works'}</CardTitle>
          </CardHeader>
          <CardContent className="ops-detail-card px-5 py-5 text-sm text-muted-foreground space-y-2">
            <p>{isMyanmar ? 'ရွေးထားသော သော့တစ်ခုချင်းစီအတွက် ပြောင်းရွှေ့ကိရိယာသည် အောက်ပါအဆင့်များကို လုပ်ဆောင်မည် -' : 'For each selected key, the migration tool will:'}</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>{isMyanmar ? 'ပစ်မှတ် Outline ဆာဗာပေါ်တွင် အသုံးပြုခွင့်သော့ အသစ်တစ်ခုကို ဖန်တီးပါမည်။' : 'Create a new access key on the target Outline server'}</li>
              <li>{isMyanmar ? 'ဒေတာ ကန့်သတ်ချက်နှင့် သတ်မှတ်ချက်များကို ကူးယူပါမည်။' : 'Copy the data limit and settings'}</li>
              <li>{isMyanmar ? 'ဒေတာဘေ့စ် မှတ်တမ်းကို ဆာဗာအသစ်သို့ ညွှန်ပြအောင် ပြင်ဆင်ပါမည်။' : 'Update the database record to point to the new server'}</li>
              {deleteFromSource && (
                <li>{isMyanmar ? 'မူလ Outline ဆာဗာမှ သော့ဟောင်းကို ဖျက်ပါမည်။' : 'Delete the old key from the source Outline server'}</li>
              )}
            </ol>
            <p className="mt-3">
              <AlertTriangle className="w-4 h-4 inline mr-1 text-amber-500" />
              {isMyanmar
                ? 'ပြောင်းလဲသတ်မှတ် အသုံးပြုခွင့်သော့နှင့် ချိတ်ထားသော သော့များသည် မူလ ချိတ်ဆက်မှုကို ဆက်လက် ထိန်းသိမ်းထားမည် ဖြစ်သည်။ စာရင်းသွင်းချိတ်ဆက်လင့်ခ်သည် ဆာဗာအသစ်မှ သော့များကို အလိုအလျောက် ပေးပို့မည်။'
                : 'Keys attached to Dynamic Access Keys will maintain their association. The subscription URL will automatically serve keys from the new server.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results dialog */}
      <MigrationResultsDialog
        open={showResultsDialog}
        onOpenChange={setShowResultsDialog}
        result={migrationResult}
      />
    </div>
  );
}
