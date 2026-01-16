'use client';

/**
 * Access Key Detail Page
 * 
 * This page provides a comprehensive view of a single access key, including
 * its configuration, usage statistics, QR code for sharing, and management
 * controls. It's the primary interface for administrators to inspect and
 * modify individual keys.
 * 
 * The page displays:
 * - Key metadata (name, email, notes)
 * - Server association and access URL
 * - Traffic usage with visual progress
 * - Expiration status and type
 * - QR code for easy client configuration
 * - Action buttons for common operations
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { cn, formatBytes, formatDateTime, formatRelativeTime, getCountryFlag } from '@/lib/utils';
import {
  ArrowLeft,
  Key,
  Copy,
  QrCode,
  Edit,
  Trash2,
  Server,
  Activity,
  Clock,
  Calendar,
  Mail,
  MessageSquare,
  FileText,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Link2,
  Download,
  Share2,
} from 'lucide-react';
import { TrafficHistoryChart } from '@/components/charts/TrafficHistoryChart';

/**
 * Status badge configuration
 * Provides consistent styling for different key statuses
 */
const statusConfig = {
  ACTIVE: {
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: CheckCircle2,
    label: 'Active'
  },
  DISABLED: {
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: XCircle,
    label: 'Disabled'
  },
  EXPIRED: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: Clock,
    label: 'Expired'
  },
  DEPLETED: {
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: AlertTriangle,
    label: 'Depleted'
  },
  PENDING: {
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: Clock,
    label: 'Pending (Start on First Use)'
  },
};

/**
 * EditKeyDialog Component
 * 
 * A dialog for editing key properties such as name, data limit, and contact
 * information. Changes are synced to the Outline server when applicable.
 */
function EditKeyDialog({
  open,
  onOpenChange,
  keyData,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyData: {
    id: string;
    name: string;
    email: string | null;
    telegramId: string | null;
    notes: string | null;
    dataLimitBytes: bigint | null;
    dataLimitResetStrategy: string | null;
  };
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: keyData.name,
    email: keyData.email || '',
    telegramId: keyData.telegramId || '',
    notes: keyData.notes || '',
    dataLimitGB: keyData.dataLimitBytes
      ? (Number(keyData.dataLimitBytes) / (1024 * 1024 * 1024)).toString()
      : '',
    dataLimitResetStrategy: (keyData.dataLimitResetStrategy as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER') || 'NEVER',
  });

  const updateMutation = trpc.keys.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'Key updated',
        description: 'The access key has been updated successfully.',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Validation error',
        description: 'Please enter a key name.',
        variant: 'destructive',
      });
      return;
    }

    updateMutation.mutate({
      id: keyData.id,
      name: formData.name.trim(),
      email: formData.email || undefined,
      telegramId: formData.telegramId || undefined,
      notes: formData.notes || undefined,
      dataLimitGB: formData.dataLimitGB ? parseFloat(formData.dataLimitGB) : undefined,
      dataLimitResetStrategy: formData.dataLimitResetStrategy,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Access Key</DialogTitle>
          <DialogDescription>
            Update the key configuration. Name changes will sync to Outline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editName">Name</Label>
            <Input
              id="editName"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editEmail">Email</Label>
            <Input
              id="editEmail"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editTelegram">Telegram ID</Label>
            <Input
              id="editTelegram"
              value={formData.telegramId}
              onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editDataLimit">Data Limit (GB)</Label>
            <Input
              id="editDataLimit"
              type="number"
              placeholder="Leave empty for unlimited"
              value={formData.dataLimitGB}
              onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
              min="0"
              step="0.5"
            />
          </div>

          {formData.dataLimitGB && (
            <div className="space-y-2">
              <Label>Reset Strategy</Label>
              <Select
                value={formData.dataLimitResetStrategy}
                onValueChange={(value: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER') =>
                  setFormData({ ...formData, dataLimitResetStrategy: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEVER">Never Reset</SelectItem>
                  <SelectItem value="DAILY">Daily (Every 24h)</SelectItem>
                  <SelectItem value="WEEKLY">Weekly (Every 7 days)</SelectItem>
                  <SelectItem value="MONTHLY">Monthly (Every 30 days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="editNotes">Notes</Label>
            <Input
              id="editNotes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * DeleteKeyDialog Component
 * 
 * A confirmation dialog for deleting an access key.
 */
function DeleteKeyDialog({
  open,
  onOpenChange,
  keyName,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyName: string;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { toast } = useToast();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Access Key</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{keyName}&quot;?
            <br />
            This action cannot be undone. The key will be permanently removed from the server.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * KeyDetailPage Component
 * 
 * The main page component that fetches and displays all information about
 * a specific access key. It provides a comprehensive overview with action
 * buttons for common management tasks.
 */
export default function KeyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const keyId = params.id as string;

  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Fetch key details
  const { data: key, isLoading, refetch } = trpc.keys.getById.useQuery(
    { id: keyId },
    { enabled: !!keyId }
  );

  // Fetch QR code
  const { data: qrData, isLoading: qrLoading } = trpc.keys.generateQRCode.useQuery(
    { id: keyId },
    { enabled: !!keyId }
  );

  // Delete mutation
  const deleteMutation = trpc.keys.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Key deleted',
        description: 'The access key has been deleted.',
      });
      router.push('/dashboard/keys');
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${label} copied to clipboard.`,
    });
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (keyId) {
      deleteMutation.mutate({ id: keyId });
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-48 animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-muted rounded-xl animate-pulse" />
            <div className="h-48 bg-muted rounded-xl animate-pulse" />
          </div>
          <div className="h-96 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!key) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Key className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Key not found</h3>
          <p className="text-muted-foreground mb-6">
            The requested access key could not be found.
          </p>
          <Button asChild>
            <Link href="/dashboard/keys">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Keys
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = key.status as keyof typeof statusConfig;
  const statusInfo = statusConfig[status] || statusConfig.ACTIVE;
  const StatusIcon = statusInfo.icon;

  const usagePercent = key.dataLimitBytes
    ? Number((key.usedBytes * BigInt(100)) / key.dataLimitBytes)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/keys">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{key.name}</h1>
              <Badge className={cn('border', statusInfo.color)}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusInfo.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Created {formatRelativeTime(key.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Server & Access Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                Server & Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Server info */}
              {key.server && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {key.server.countryCode && (
                      <span className="text-xl">{getCountryFlag(key.server.countryCode)}</span>
                    )}
                    <div>
                      <p className="font-medium">{key.server.name}</p>
                      {key.server.location && (
                        <p className="text-sm text-muted-foreground">{key.server.location}</p>
                      )}
                    </div>
                  </div>
                  <Link href={`/dashboard/servers/${key.server.id}`}>
                    <Button variant="ghost" size="sm">
                      View Server
                    </Button>
                  </Link>
                </div>
              )}

              {/* Access URL */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Access URL</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                    {key.accessUrl}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(key.accessUrl || '', 'Access URL')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Subscription URL */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Subscription URL</Label>
                <p className="text-xs text-muted-foreground">
                  Share this URL with the user. Clients can fetch the latest config automatically.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/api/subscription/${key.subscriptionToken}`
                      : `/api/subscription/${key.subscriptionToken}`}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(
                        typeof window !== 'undefined'
                          ? `${window.location.origin}/api/subscription/${key.subscriptionToken}`
                          : `/api/subscription/${key.subscriptionToken}`,
                        'Subscription URL'
                      )
                    }
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Technical Details */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Port</p>
                  <p className="font-mono">{key.port}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Encryption</p>
                  <p className="font-mono">{key.method}</p>
                </div>
                {key.prefix && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Prefix (Obfuscation)</p>
                    <p className="font-mono">{key.prefix}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Traffic Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Traffic Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">{formatBytes(key.usedBytes)}</p>
                    <p className="text-sm text-muted-foreground">
                      of {key.dataLimitBytes ? formatBytes(key.dataLimitBytes) : 'unlimited'}
                    </p>
                  </div>
                  {key.dataLimitBytes && (
                    <p className="text-2xl font-semibold text-muted-foreground">
                      {usagePercent.toFixed(1)}%
                    </p>
                  )}
                </div>

                {key.dataLimitBytes && (
                  <Progress
                    value={usagePercent}
                    className={cn(
                      'h-3',
                      usagePercent > 90 && '[&>div]:bg-red-500',
                      usagePercent > 70 && usagePercent <= 90 && '[&>div]:bg-yellow-500'
                    )}
                  />
                )}

                {(key as any).dataLimitResetStrategy && (key as any).dataLimitResetStrategy !== 'NEVER' && (
                  <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
                    <RefreshCw className="w-4 h-4" />
                    <span>
                      Resets {(key as any).dataLimitResetStrategy.toLowerCase()}
                      {(key as any).lastDataLimitReset && ` (Last reset: ${(key as any).lastDataLimitReset ? formatRelativeTime((key as any).lastDataLimitReset) : 'Never'})`}
                    </span>
                  </div>
                )}
              </div>

              {/* Real-time Graph */}
              <div className="pt-4 border-t border-border/50">
                <p className="text-sm font-medium mb-2">Live Activity</p>
                <TrafficGraph serverId={key.server.id} outlineKeyId={key.outlineKeyId} />
              </div>

              {/* Historical Chart */}
              <div className="pt-4 border-t border-border/50">
                <TrafficHistoryChart accessKeyId={key.id} />
              </div>
            </CardContent>
          </Card>

          {/* Expiration Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Expiration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{key.expirationType.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expires</p>
                  <p className="font-medium">
                    {key.expiresAt ? formatDateTime(key.expiresAt) : 'Never'}
                  </p>
                </div>
                {key.firstUsedAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">First Used</p>
                    <p className="font-medium">{formatDateTime(key.firstUsedAt)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contact & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{key.email || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Telegram</p>
                    <p className="font-medium">{key.telegramId || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="font-medium">{key.notes || '-'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - QR Code */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" />
                QR Code
              </CardTitle>
              <CardDescription>
                Scan with a Shadowsocks client to connect
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {qrLoading ? (
                <div className="w-[200px] h-[200px] bg-muted rounded-lg animate-pulse" />
              ) : qrData?.qrCode ? (
                <Image
                  src={qrData.qrCode}
                  alt="QR Code"
                  width={200}
                  height={200}
                  className="rounded-lg bg-white p-2"
                  unoptimized
                />
              ) : (
                <div className="w-[200px] h-[200px] bg-muted rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Failed to generate</p>
                </div>
              )}

              <div className="flex gap-2 mt-4 w-full">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => copyToClipboard(key.accessUrl || '', 'Access URL')}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy URL
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outline Key ID</span>
                <span className="font-mono">{key.outlineKeyId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDateTime(key.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDateTime(key.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit dialog */}
      {key && (
        <EditKeyDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          keyData={{
            id: key.id,
            name: key.name,
            email: key.email,
            telegramId: key.telegramId,
            notes: key.notes,
            dataLimitBytes: key.dataLimitBytes,
            dataLimitResetStrategy: (key as any).dataLimitResetStrategy,
          }}
          onSuccess={() => refetch()}
        />
      )}

      {key && (
        <DeleteKeyDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          keyName={key.name}
          onConfirm={confirmDelete}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

/**
 * TrafficGraph Component
 * Displays real-time bandwidth usage for a specific key
 */
function TrafficGraph({
  serverId,
  outlineKeyId
}: {
  serverId: string;
  outlineKeyId: string;
}) {
  const [data, setData] = useState<{ time: number; bytes: number }[]>([]);

  // Poll for live stats
  const { data: stats } = trpc.servers.getLiveStats.useQuery(
    { id: serverId },
    {
      refetchInterval: 2000,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (stats) {
      const now = Date.now();
      const bytes = stats.keyStats?.[outlineKeyId] || 0;

      setData(prev => {
        // Keep last 60 points (approx 2 minutes at 2s interval)
        const newData = [...prev, { time: now, bytes }];
        if (newData.length > 60) newData.shift();
        return newData;
      });
    }
  }, [stats, outlineKeyId]);

  if (data.length < 2) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded-lg">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Initializing graph...
      </div>
    );
  }

  return (
    <div className="h-[200px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorBytes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="time"
            hide
            domain={['dataMin', 'dataMax']}
          />
          <YAxis
            hide
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              borderRadius: '0.5rem',
            }}
            labelFormatter={() => ''}
            formatter={(value: number) => [formatBytes(value) + '/s', 'Speed']}
          />
          <Area
            type="monotone"
            dataKey="bytes"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorBytes)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
        <span>2 mins ago</span>
        <span>Reserved Bandwidth: {formatBytes(data[data.length - 1]?.bytes || 0)}/s</span>
        <span>Live</span>
      </div>
    </div>
  );
}
