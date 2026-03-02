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
} from 'lucide-react';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    PENDING: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    DISABLED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    EXPIRED: 'bg-red-500/15 text-red-400 border-red-500/30',
    DEPLETED: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  };
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', variants[status] || '')}>
      {status}
    </Badge>
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
            Migration Complete
          </DialogTitle>
          <DialogDescription>
            {result.migrated} of {result.total} keys migrated successfully
            {result.failed > 0 && ` (${result.failed} failed)`}
          </DialogDescription>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="bg-emerald-500/10 border-emerald-500/30">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-emerald-500">{result.migrated}</div>
              <div className="text-xs text-muted-foreground">Migrated</div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-500">{result.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/30">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-500">{result.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
        </div>

        {/* Per-key results */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.results.map((r) => (
                <TableRow key={r.keyId}>
                  <TableCell className="font-medium">{r.keyName}</TableCell>
                  <TableCell>
                    {r.success ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Success
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                        <XCircle className="w-3 h-3 mr-1" /> Failed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.success
                      ? `New Outline ID: ${r.newOutlineKeyId}`
                      : r.error}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function MigrationPage() {
  const { toast } = useToast();

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
    { enabled: step === 'preview' && !!sourceServerId && !!targetServerId },
  );

  const migrateMutation = trpc.servers.migrateKeys.useMutation({
    onSuccess: (data) => {
      setMigrationResult(data);
      setStep('done');
      setShowResultsDialog(true);

      if (data.failed === 0) {
        toast({ title: 'Migration complete', description: `${data.migrated} keys migrated successfully.` });
      } else {
        toast({ title: 'Migration finished with errors', description: `${data.migrated} migrated, ${data.failed} failed.`, variant: 'destructive' });
      }
    },
    onError: (error) => {
      setStep('preview');
      toast({ title: 'Migration failed', description: error.message, variant: 'destructive' });
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

  // ── Handlers ──
  function handleLoadPreview() {
    if (!sourceServerId || !targetServerId) {
      toast({ title: 'Please select both servers', variant: 'destructive' });
      return;
    }
    if (sourceServerId === targetServerId) {
      toast({ title: 'Source and target must be different', variant: 'destructive' });
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

  function handleStartMigration() {
    if (selectedKeyIds.size === 0) {
      toast({ title: 'Please select at least one key', variant: 'destructive' });
      return;
    }

    setStep('migrating');
    migrateMutation.mutate({
      sourceServerId,
      targetServerId,
      keyIds: Array.from(selectedKeyIds),
      deleteFromSource,
    });
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-primary" />
            Server Migration
          </h1>
          <p className="text-muted-foreground mt-1">
            Migrate access keys between Outline servers
          </p>
        </div>

        {step !== 'select' && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Start Over
          </Button>
        )}
      </div>

      {/* Step 1: Server Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            1. Select Servers
          </CardTitle>
          <CardDescription>
            Choose the source server to move keys from and the target server to move them to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-end">
            {/* Source server */}
            <div className="space-y-2">
              <Label>Source Server</Label>
              <Select
                value={sourceServerId}
                onValueChange={(v) => {
                  setSourceServerId(v);
                  if (step !== 'select') setStep('select');
                }}
                disabled={step === 'migrating'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source server..." />
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
                          {s.metrics.activeKeys} keys
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
            <div className="space-y-2">
              <Label>Target Server</Label>
              <Select
                value={targetServerId}
                onValueChange={(v) => {
                  setTargetServerId(v);
                  if (step !== 'select') setStep('select');
                }}
                disabled={step === 'migrating'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target server..." />
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
                          {s.metrics.activeKeys} keys
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Options row */}
          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Checkbox
                id="deleteFromSource"
                checked={deleteFromSource}
                onCheckedChange={(v) => setDeleteFromSource(!!v)}
                disabled={step === 'migrating'}
              />
              <Label htmlFor="deleteFromSource" className="text-sm cursor-pointer">
                Delete old keys from source server after migration
              </Label>
            </div>

            <div className="ml-auto">
              <Button
                onClick={handleLoadPreview}
                disabled={!sourceServerId || !targetServerId || step === 'migrating'}
              >
                Load Keys
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Key Selection Preview */}
      {(step === 'preview' || step === 'migrating' || step === 'done') && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="w-5 h-5 text-primary" />
                  2. Select Keys to Migrate
                </CardTitle>
                <CardDescription>
                  {previewQuery.isLoading ? (
                    'Loading keys...'
                  ) : (
                    <>
                      {previewKeys.length} eligible key{previewKeys.length !== 1 ? 's' : ''} found
                      {selectedKeyIds.size > 0 && ` \u00b7 ${selectedKeyIds.size} selected`}
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
          <CardContent>
            {previewQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading keys...</span>
              </div>
            ) : previewKeys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Key className="w-10 h-10 mb-2 opacity-30" />
                <p>No eligible keys found on the source server.</p>
                <p className="text-xs mt-1">Only ACTIVE and PENDING keys can be migrated.</p>
              </div>
            ) : (
              <>
                {/* Key table */}
                <div className="rounded-lg border border-border overflow-hidden">
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
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Data Limit</TableHead>
                        <TableHead>Dynamic Key</TableHead>
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
                              <StatusBadge status={key.status} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatBytes(BigInt(key.usedBytes))}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {key.dataLimitBytes
                                ? formatBytes(BigInt(key.dataLimitBytes))
                                : <span className="text-xs text-muted-foreground/50">None</span>}
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
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-muted-foreground">
                        Migrating {selectedKeyIds.size} key{selectedKeyIds.size !== 1 ? 's' : ''}...
                      </span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>
                )}

                {/* Action buttons */}
                {step === 'preview' && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                    <p className="text-sm text-muted-foreground">
                      {selectedKeyIds.size} of {previewKeys.length} keys selected
                    </p>
                    <Button
                      onClick={handleStartMigration}
                      disabled={selectedKeyIds.size === 0}
                      className="gap-2"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      Migrate {selectedKeyIds.size} Key{selectedKeyIds.size !== 1 ? 's' : ''}
                    </Button>
                  </div>
                )}

                {/* Done state */}
                {step === 'done' && migrationResult && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>
                        Migration complete: {migrationResult.migrated} migrated
                        {migrationResult.failed > 0 && `, ${migrationResult.failed} failed`}
                      </span>
                    </div>
                    <Button variant="outline" onClick={() => setShowResultsDialog(true)}>
                      View Details
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
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-base">How Server Migration Works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>For each selected key, the migration tool will:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Create a new access key on the target Outline server</li>
              <li>Copy the data limit and settings</li>
              <li>Update the database record to point to the new server</li>
              {deleteFromSource && (
                <li>Delete the old key from the source Outline server</li>
              )}
            </ol>
            <p className="mt-3">
              <AlertTriangle className="w-4 h-4 inline mr-1 text-amber-500" />
              Keys attached to Dynamic Access Keys will maintain their association.
              The subscription URL will automatically serve keys from the new server.
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
