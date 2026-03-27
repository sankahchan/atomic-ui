'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import {
    ShieldCheck, Plus, Trash2, Power, Globe, AlertTriangle,
    Lock, Unlock, CheckCircle, XCircle, AlertCircle, Server,
    RefreshCw, Shield, Clock, ExternalLink, Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { BackButton } from '@/components/ui/back-button';

function CreateRuleDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        type: 'BLOCK',
        targetType: 'IP',
        targetValue: '',
        description: '',
    });

    const createMutation = trpc.security.createRule.useMutation({
        onSuccess: () => {
            toast({ title: 'Rule created', description: 'Security rule has been added.' });
            setFormData({ type: 'BLOCK', targetType: 'IP', targetValue: '', description: '' });
            onSuccess();
            onOpenChange(false);
        },
        onError: (err) => toast({ title: 'Failed to create', description: err.message, variant: 'destructive' }),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(formData as Parameters<typeof createMutation.mutate>[0]);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Security Rule</DialogTitle>
                    <DialogDescription>
                        Control access to the dashboard by IP, CIDR, or Country.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Action</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(val) => setFormData({ ...formData, type: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BLOCK">Block (Deny)</SelectItem>
                                    <SelectItem value="ALLOW">Allow (Whitelist)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Target Type</Label>
                            <Select
                                value={formData.targetType}
                                onValueChange={(val) => setFormData({ ...formData, targetType: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="IP">IP Address</SelectItem>
                                    <SelectItem value="CIDR">CIDR Range</SelectItem>
                                    <SelectItem value="COUNTRY">Country Code</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>
                            {formData.targetType === 'IP' ? 'IP Address' :
                                formData.targetType === 'CIDR' ? 'CIDR Range (e.g. 10.0.0.0/24)' :
                                    'Country Code (2-letter ISO, e.g. US, CN)'}
                        </Label>
                        <Input
                            value={formData.targetValue}
                            onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                            placeholder={
                                formData.targetType === 'IP' ? '192.168.1.1' :
                                    formData.targetType === 'CIDR' ? '10.0.0.0/24' :
                                        'US'
                            }
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="e.g. Block suspicious subnet"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending && 'Adding...'}
                            {!createMutation.isPending && 'Add Rule'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function SecurityScoreRing({ score }: { score: number }) {
    const getColor = (s: number) => {
        if (s >= 80) return 'text-green-500';
        if (s >= 60) return 'text-yellow-500';
        if (s >= 40) return 'text-orange-500';
        return 'text-red-500';
    };

    const strokeColor = getColor(score);
    const circumference = 2 * Math.PI * 45;
    const progress = (score / 100) * circumference;

    return (
        <div className="relative w-32 h-32">
            <svg className="w-full h-full transform -rotate-90">
                <circle
                    cx="64"
                    cy="64"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted/30"
                />
                <circle
                    cx="64"
                    cy="64"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - progress}
                    strokeLinecap="round"
                    className={strokeColor}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${strokeColor}`}>{score}</span>
                <span className="text-xs text-muted-foreground">/100</span>
            </div>
        </div>
    );
}

function DashboardSecurityCard() {
    const { data: dashboardStatus, isLoading } = trpc.security.getDashboardSecurityStatus.useQuery();

    if (isLoading) {
        return (
            <Card className="ops-detail-card">
                <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Dashboard Security
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="animate-pulse space-y-4">
                        <div className="h-32 rounded-[1.35rem] bg-muted/60" />
                        <div className="h-4 w-3/4 rounded bg-muted/60" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!dashboardStatus) {
        return (
            <Card className="ops-detail-card">
                <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Dashboard Security
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Security probe has not run yet.</p>
                        <p className="text-sm">Start the security worker to enable monitoring.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="ops-detail-card">
            <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Dashboard Security
                </CardTitle>
                <CardDescription>
                    Security assessment of this management panel
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-0 pb-0">
                <div className="flex items-center gap-6">
                    <SecurityScoreRing score={dashboardStatus.securityScore} />
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-2">
                            {dashboardStatus.scheme === 'https' ? (
                                <Lock className="h-4 w-4 text-green-500" />
                            ) : (
                                <Unlock className="h-4 w-4 text-red-500" />
                            )}
                            <span className="text-sm">
                                {dashboardStatus.scheme?.toUpperCase() || 'Unknown'} connection
                            </span>
                            {dashboardStatus.tlsVersion && (
                                <Badge variant="outline" className="text-xs">{dashboardStatus.tlsVersion}</Badge>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <SecurityCheckItem
                                label="HSTS"
                                enabled={dashboardStatus.hasHsts}
                                description="HTTP Strict Transport Security"
                            />
                            <SecurityCheckItem
                                label="CSP"
                                enabled={dashboardStatus.hasCsp}
                                description="Content Security Policy"
                            />
                            <SecurityCheckItem
                                label="Secure Cookies"
                                enabled={dashboardStatus.hasSecureCookies}
                                description="Cookies with Secure flag"
                            />
                            <SecurityCheckItem
                                label="HttpOnly Cookies"
                                enabled={dashboardStatus.hasHttpOnlyCookies}
                                description="Cookies with HttpOnly flag"
                            />
                            <SecurityCheckItem
                                label="SameSite Cookies"
                                enabled={dashboardStatus.hasSameSiteCookies}
                                description="Cookies with SameSite attribute"
                            />
                            <SecurityCheckItem
                                label="X-Frame-Options"
                                enabled={dashboardStatus.hasXFrameOptions}
                                description="Clickjacking protection"
                            />
                        </div>
                    </div>
                </div>

                {dashboardStatus.lastCheckedAt && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last checked {formatDistanceToNow(new Date(dashboardStatus.lastCheckedAt), { addSuffix: true })}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function SecurityCheckItem({ label, enabled, description }: { label: string; enabled: boolean; description: string }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                        {enabled ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span className={enabled ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{description}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

function ServerSecurityCard() {
    const { data: serverProbes, isLoading } = trpc.security.getServerSecurityProbes.useQuery();

    if (isLoading) {
        return (
            <Card className="ops-detail-card">
                <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        Server Certificates
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="animate-pulse space-y-3">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-[1.2rem] bg-muted/60" />)}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="ops-detail-card">
            <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Server Certificates
                </CardTitle>
                <CardDescription>
                    TLS certificate status for managed Outline servers
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
                {!serverProbes || serverProbes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No server security probes available.</p>
                        <p className="text-sm">Start the security worker to monitor server certificates.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {serverProbes.map((probe) => (
                            <div
                                key={probe.id}
                                className="ops-row-card flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${
                                        probe.result === 'OK' ? 'bg-green-500/20 text-green-500' :
                                        probe.result === 'CERT_EXPIRING' ? 'bg-yellow-500/20 text-yellow-500' :
                                        'bg-red-500/20 text-red-500'
                                    }`}>
                                        {probe.scheme === 'https' ? (
                                            <Lock className="h-4 w-4" />
                                        ) : (
                                            <Unlock className="h-4 w-4" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-medium">{probe.server?.name || 'Unknown Server'}</div>
                                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                                            {probe.tlsVersion && <span>{probe.tlsVersion}</span>}
                                            {probe.certSubject && <span>- {probe.certSubject}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {probe.certDaysLeft !== null && probe.certDaysLeft !== undefined && (
                                        <div className="text-right">
                                            <div className={`text-sm font-medium ${
                                                probe.certDaysLeft < 0 ? 'text-red-500' :
                                                probe.certDaysLeft < 14 ? 'text-yellow-500' :
                                                'text-green-500'
                                            }`}>
                                                {probe.certDaysLeft < 0 ? 'Expired' : `${probe.certDaysLeft} days`}
                                            </div>
                                            <div className="text-xs text-muted-foreground">until expiry</div>
                                        </div>
                                    )}
                                    <Badge variant={
                                        probe.result === 'OK' ? 'default' :
                                        probe.result === 'CERT_EXPIRING' ? 'secondary' :
                                        'destructive'
                                    }>
                                        {probe.result.replace('_', ' ')}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function SecuritySummaryCards() {
    const { data: summary, isLoading } = trpc.security.getSecuritySummary.useQuery();

    if (isLoading || !summary) {
        return null;
    }

    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="ops-kpi-tile">
                <CardHeader className="px-0 pb-2 pt-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Security Score</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${
                            summary.dashboardSecurityScore >= 80 ? 'text-green-500' :
                            summary.dashboardSecurityScore >= 60 ? 'text-yellow-500' :
                            'text-red-500'
                        }`}>
                            {summary.dashboardSecurityScore}
                        </span>
                        <span className="text-muted-foreground">/100</span>
                    </div>
                    <Progress value={summary.dashboardSecurityScore} className="mt-2 h-1.5" />
                </CardContent>
            </Card>

            <Card className="ops-kpi-tile">
                <CardHeader className="px-0 pb-2 pt-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Server Status</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="text-2xl font-bold">
                        {summary.healthyServers}/{summary.serverCount}
                    </div>
                    <p className="text-xs text-muted-foreground">servers healthy</p>
                </CardContent>
            </Card>

            <Card className="ops-kpi-tile">
                <CardHeader className="px-0 pb-2 pt-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Certificate Warnings</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className={`text-2xl font-bold ${summary.expiringCerts > 0 ? 'text-yellow-500' : ''}`}>
                        {summary.expiringCerts}
                    </div>
                    <p className="text-xs text-muted-foreground">expiring soon (&lt;14 days)</p>
                </CardContent>
            </Card>

            <Card className="ops-kpi-tile">
                <CardHeader className="px-0 pb-2 pt-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Issues</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className={`text-2xl font-bold ${(summary.expiredCerts + summary.tlsErrors + summary.connectionErrors) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {summary.expiredCerts + summary.tlsErrors + summary.connectionErrors}
                    </div>
                    <p className="text-xs text-muted-foreground">errors detected</p>
                </CardContent>
            </Card>
        </div>
    );
}

function LoginProtectionCard() {
    const { toast } = useToast();
    const { data: overview, isLoading, refetch } = trpc.security.getAdminLoginAbuseOverview.useQuery();
    const saveMutation = trpc.security.updateAdminLoginProtectionConfig.useMutation({
        onSuccess: async () => {
            toast({ title: 'Login protection updated', description: 'The admin login abuse policy has been saved.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to save login protection', description: error.message, variant: 'destructive' });
        },
    });
    const unbanMutation = trpc.security.unbanAdminLoginIp.useMutation({
        onSuccess: async () => {
            toast({ title: 'IP restriction cleared', description: 'The IP has been released from the admin login ban list.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to unban IP', description: error.message, variant: 'destructive' });
        },
    });

    const [form, setForm] = useState({
        enabled: true,
        softLockThreshold: 5,
        softLockWindowMinutes: 10,
        softLockDurationMinutes: 15,
        banThreshold: 8,
        banWindowMinutes: 10,
        banDurationMinutes: 720,
        telegramAlertEnabled: true,
        alertOnRepeatedOffender: true,
        repeatedOffenderThreshold: 12,
        alertOnUnban: true,
        fail2banLogEnabled: true,
        trustedIpRanges: '',
    });

    useEffect(() => {
        if (!overview?.config) {
            return;
        }

        setForm({
            enabled: overview.config.enabled,
            softLockThreshold: overview.config.softLockThreshold,
            softLockWindowMinutes: overview.config.softLockWindowMinutes,
            softLockDurationMinutes: overview.config.softLockDurationMinutes,
            banThreshold: overview.config.banThreshold,
            banWindowMinutes: overview.config.banWindowMinutes,
            banDurationMinutes: overview.config.banDurationMinutes,
            telegramAlertEnabled: overview.config.telegramAlertEnabled,
            alertOnRepeatedOffender: overview.config.alertOnRepeatedOffender,
            repeatedOffenderThreshold: overview.config.repeatedOffenderThreshold,
            alertOnUnban: overview.config.alertOnUnban,
            fail2banLogEnabled: overview.config.fail2banLogEnabled,
            trustedIpRanges: (overview.config.trustedIpRanges || []).join('\n'),
        });
    }, [overview]);

    if (isLoading || !overview) {
        return (
            <Card className="ops-panel">
                <CardHeader className="px-0 pt-0">
                    <CardTitle>Admin login abuse protection</CardTitle>
                    <CardDescription>
                        Loading current thresholds, trusted IPs, and recent failed login activity.
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="space-y-3">
                        {[1, 2, 3].map((index) => (
                            <div key={index} className="h-20 rounded-[1.25rem] bg-muted/60 animate-pulse" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Failed last hour</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className="text-2xl font-bold">{overview.summary.failuresLastHour}</div>
                        <p className="text-xs text-muted-foreground">failed admin login attempts</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Failed last 24h</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className="text-2xl font-bold">{overview.summary.failuresLastDay}</div>
                        <p className="text-xs text-muted-foreground">recent login failures</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active restrictions</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className="text-2xl font-bold">{overview.summary.activeRestrictions}</div>
                        <p className="text-xs text-muted-foreground">IPs currently locked or banned</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active bans</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${overview.summary.activeBans > 0 ? 'text-red-500' : ''}`}>
                            {overview.summary.activeBans}
                        </div>
                        <p className="text-xs text-muted-foreground">harder blocks now in effect</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="ops-panel">
                <CardHeader className="px-0 pt-0">
                    <CardTitle>Policy</CardTitle>
                    <CardDescription>
                        Automatic lock and ban thresholds for repeated failed admin logins. Telegram alerts use the configured admin chat IDs.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 px-0 pb-0">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="ops-detail-card flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">Enable login abuse protection</p>
                                <p className="text-sm text-muted-foreground">Create temporary locks and bans from repeated failed logins.</p>
                            </div>
                            <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">Telegram admin alerts</p>
                                <p className="text-sm text-muted-foreground">Send the source IP and attempted email to the configured Telegram admin chats.</p>
                            </div>
                            <Switch checked={form.telegramAlertEnabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, telegramAlertEnabled: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">Alert on repeated offenders</p>
                                <p className="text-sm text-muted-foreground">Send an extra Telegram alert when the same IP keeps failing logins over a full-day window.</p>
                            </div>
                            <Switch checked={form.alertOnRepeatedOffender} onCheckedChange={(checked) => setForm((current) => ({ ...current, alertOnRepeatedOffender: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">Alert on unban</p>
                                <p className="text-sm text-muted-foreground">Notify Telegram admins when a ban or lock is manually cleared from the panel.</p>
                            </div>
                            <Switch checked={form.alertOnUnban} onCheckedChange={(checked) => setForm((current) => ({ ...current, alertOnUnban: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4 md:col-span-2">
                            <div>
                                <p className="font-medium">Write fail2ban auth log</p>
                                <p className="text-sm text-muted-foreground">Mirror failed admin logins to the dedicated fail2ban file so the server can hard-ban the IP too.</p>
                            </div>
                            <Switch checked={form.fail2banLogEnabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, fail2banLogEnabled: checked }))} />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Soft lock threshold</Label>
                            <Input type="number" min={1} value={form.softLockThreshold} onChange={(event) => setForm((current) => ({ ...current, softLockThreshold: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">Wrong-password attempts before a temporary app lock starts.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Soft lock window (minutes)</Label>
                            <Input type="number" min={1} value={form.softLockWindowMinutes} onChange={(event) => setForm((current) => ({ ...current, softLockWindowMinutes: Number(event.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Soft lock duration (minutes)</Label>
                            <Input type="number" min={1} value={form.softLockDurationMinutes} onChange={(event) => setForm((current) => ({ ...current, softLockDurationMinutes: Number(event.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Ban threshold</Label>
                            <Input type="number" min={1} value={form.banThreshold} onChange={(event) => setForm((current) => ({ ...current, banThreshold: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">When reached, the IP is fully denied by the app and also logged for fail2ban.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Ban window (minutes)</Label>
                            <Input type="number" min={1} value={form.banWindowMinutes} onChange={(event) => setForm((current) => ({ ...current, banWindowMinutes: Number(event.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Ban duration (minutes)</Label>
                            <Input type="number" min={1} value={form.banDurationMinutes} onChange={(event) => setForm((current) => ({ ...current, banDurationMinutes: Number(event.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2 md:col-span-3">
                            <Label>Repeated offender threshold (24h)</Label>
                            <Input type="number" min={1} value={form.repeatedOffenderThreshold} onChange={(event) => setForm((current) => ({ ...current, repeatedOffenderThreshold: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">Telegram sends an extra offender alert when the same IP reaches this many failed admin logins in the last 24 hours.</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Trusted IPs or CIDRs</Label>
                        <Textarea
                            value={form.trustedIpRanges}
                            onChange={(event) => setForm((current) => ({ ...current, trustedIpRanges: event.target.value }))}
                            placeholder={'203.0.113.10\n198.51.100.0/24'}
                            className="min-h-[110px]"
                        />
                        <p className="text-xs text-muted-foreground">These addresses are exempt from automatic login bans. Use one IP or CIDR per line.</p>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            onClick={() => saveMutation.mutate({
                                ...form,
                                trustedIpRanges: form.trustedIpRanges
                                    .split(/[\n,]/)
                                    .map((value) => value.trim())
                                    .filter(Boolean),
                            })}
                            disabled={saveMutation.isPending}
                        >
                            {saveMutation.isPending ? 'Saving…' : 'Save protection policy'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Card className="ops-panel">
                    <CardHeader className="px-0 pt-0">
                        <CardTitle>Recent failed admin logins</CardTitle>
                        <CardDescription>
                            Most recent bad-password attempts recorded by the app.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        {overview.recentFailures.length === 0 ? (
                            <div className="ops-chart-empty py-8 text-muted-foreground">No recent failed admin login attempts.</div>
                        ) : (
                            <div className="space-y-3">
                                {overview.recentFailures.map((failure) => (
                                    <div key={failure.id} className="ops-row-card flex items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{failure.ip || 'Unknown IP'}</span>
                                                {failure.countryCode && <Badge variant="outline">{failure.countryCode}</Badge>}
                                            </div>
                                            <p className="text-sm text-muted-foreground">{failure.email || 'Unknown email'}</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(new Date(failure.createdAt), { addSuffix: true })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>Top offender IPs</CardTitle>
                            <CardDescription>
                                Highest failure counts over the last 24 hours.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {overview.topOffenders.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">No offender IPs recorded yet.</div>
                            ) : (
                                <div className="space-y-3">
                                    {overview.topOffenders.map((offender) => (
                                        <div key={offender.ip} className="ops-row-card flex items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="font-medium">{offender.ip}</p>
                                                <p className="text-xs text-muted-foreground">{offender.email || 'Unknown email'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">{offender.count}</p>
                                                <p className="text-xs text-muted-foreground">attempts</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>Active restrictions</CardTitle>
                            <CardDescription>
                                IPs currently locked or banned by the app.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {overview.activeRestrictions.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">No active login bans or locks.</div>
                            ) : (
                                <div className="space-y-3">
                                    {overview.activeRestrictions.map((restriction) => (
                                        <div key={restriction.id} className="ops-row-card space-y-3">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{restriction.ip}</span>
                                                        <Badge variant={restriction.restrictionType === 'BAN' ? 'destructive' : 'secondary'}>
                                                            {restriction.restrictionType}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">{restriction.attemptedEmail || 'Unknown email'}</p>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => unbanMutation.mutate({ ip: restriction.ip })}
                                                    disabled={unbanMutation.isPending}
                                                >
                                                    <Unlock className="mr-2 h-4 w-4" />
                                                    Unban
                                                </Button>
                                            </div>
                                            <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                                                <span>Failures: {restriction.failureCount}</span>
                                                <span>Last hit: {formatDistanceToNow(new Date(restriction.lastFailedAt), { addSuffix: true })}</span>
                                                <span>Expires: {formatDistanceToNow(new Date(restriction.expiresAt), { addSuffix: true })}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function SecurityPage() {
    const { toast } = useToast();
    const [createOpen, setCreateOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('status');
    const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
    const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

    const { data: rules, isLoading, refetch } = trpc.security.listRules.useQuery();

    const toggleMutation = trpc.security.toggleRule.useMutation({
        onSuccess: () => {
            setTogglingRuleId(null);
            refetch();
        },
        onError: (err) => {
            setTogglingRuleId(null);
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        },
    });

    const deleteMutation = trpc.security.deleteRule.useMutation({
        onSuccess: () => {
            toast({ title: 'Rule deleted' });
            setDeletingRuleId(null);
            refetch();
        },
        onError: (err) => {
            setDeletingRuleId(null);
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        },
    });

    const triggerProbeMutation = trpc.security.triggerSecurityProbe.useMutation({
        onSuccess: () => {
            toast({ title: 'Probe triggered', description: 'Security check initiated.' });
        },
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    return (
        <div className="space-y-6">
            <section className="ops-showcase">
                <div className="ops-showcase-grid">
                    <div className="space-y-5 self-start">
                        <Badge
                            variant="outline"
                            className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
                        >
                            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                            Security Command Center
                        </Badge>

                        <div className="space-y-3">
                            <div className="text-sm text-muted-foreground">
                                <BackButton href="/dashboard" label="Dashboard" />
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                                Security & access control
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                                Monitor dashboard and server security posture, trigger fresh probes, and control dashboard access with IP, CIDR, and country rules.
                            </p>
                        </div>

                        <SecuritySummaryCards />
                    </div>

                    <div className="ops-detail-rail">
                        <div className="ops-panel space-y-3">
                            <div className="space-y-1">
                                <p className="ops-section-heading">Security controls</p>
                                <h2 className="text-xl font-semibold">Command rail</h2>
                                <p className="text-sm text-muted-foreground">
                                    Trigger a new probe or jump straight into the rule tab when you need to tighten panel access.
                                </p>
                            </div>

                            <Button className="h-11 w-full rounded-full" onClick={() => triggerProbeMutation.mutate()} disabled={triggerProbeMutation.isPending}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${triggerProbeMutation.isPending ? 'animate-spin' : ''}`} />
                                {triggerProbeMutation.isPending ? 'Running probe…' : 'Run security probe'}
                            </Button>

                            <Button variant="outline" className="h-11 w-full rounded-full" onClick={() => setActiveTab('rules')}>
                                <Lock className="mr-2 h-4 w-4" />
                                Open access rules
                            </Button>
                        </div>

                        <div className="ops-panel space-y-3">
                            <div className="space-y-1">
                                <p className="ops-section-heading">Probe note</p>
                                <h2 className="text-xl font-semibold">Worker status</h2>
                            </div>
                            <div className="ops-detail-card space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    Security probes run automatically via the security worker process. Use the probe action when you need a fresh certificate or header check immediately.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="ops-command-bar h-auto w-full justify-start gap-2 rounded-[1.5rem] border-0 bg-transparent p-0 md:w-fit">
                    <TabsTrigger value="status">Security Status</TabsTrigger>
                    <TabsTrigger value="rules">Access Rules</TabsTrigger>
                    <TabsTrigger value="login">Login Protection</TabsTrigger>
                </TabsList>

                <TabsContent value="status" className="space-y-6 mt-6">
                    <div className="grid gap-6 lg:grid-cols-2">
                        <DashboardSecurityCard />
                        <ServerSecurityCard />
                    </div>

                    <Card className="ops-panel border-blue-500/20 bg-blue-500/10 dark:border-cyan-400/14 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_24%),linear-gradient(180deg,rgba(4,11,23,0.95),rgba(5,12,25,0.84))]">
                        <CardHeader className="px-0 pb-2 pt-0">
                            <CardTitle className="text-lg text-blue-500 flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                Security Worker
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            <p className="text-sm text-blue-400">
                                Security probes run automatically via the security worker process.
                                See the worker setup documentation for deployment instructions.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="rules" className="space-y-6 mt-6">
                    <div className="ops-table-toolbar">
                        <div className="flex items-center gap-2">
                            <div className="ops-table-meta">
                                {rules?.length ?? 0} configured rules
                            </div>
                        </div>
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Rule
                        </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="ops-panel bg-red-500/10 border-red-500/20 dark:border-red-500/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.16),transparent_24%),linear-gradient(180deg,rgba(4,11,23,0.95),rgba(5,12,25,0.84))]">
                            <CardHeader className="px-0 pb-2 pt-0">
                                <CardTitle className="text-lg text-red-500 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    Warning
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-0 pb-0">
                                <p className="text-sm text-red-400">
                                    Be careful when adding blocking rules. Ensure you do not block your own IP address. Localhost is always allowed.
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>Active Rules</CardTitle>
                            <CardDescription>
                                Rules are evaluated in order: Allowed Localhost - Block Rules - Allow Rules.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {isLoading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-[1.2rem] bg-muted/60 animate-pulse" />)}
                                </div>
                            ) : rules?.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">
                                    No security rules defined. All traffic is allowed.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {rules?.map((rule) => (
                                        <div key={rule.id} className="ops-row-card flex items-center justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2 rounded-full ${rule.type === 'BLOCK' ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                                                    {rule.type === 'BLOCK' ? <ShieldCheck className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold">{rule.targetValue}</span>
                                                        <Badge variant="outline">{rule.targetType}</Badge>
                                                        <Badge variant={rule.type === 'BLOCK' ? 'destructive' : 'default'}>{rule.type}</Badge>
                                                        {!rule.isActive && <Badge variant="secondary">DISABLED</Badge>}
                                                    </div>
                                                    {rule.description && (
                                                        <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        setTogglingRuleId(rule.id);
                                                        toggleMutation.mutate({ id: rule.id });
                                                    }}
                                                    disabled={toggleMutation.isPending && togglingRuleId === rule.id}
                                                    title={rule.isActive ? "Disable Rule" : "Enable Rule"}
                                                >
                                                    {toggleMutation.isPending && togglingRuleId === rule.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                                    ) : (
                                                        <Power className={`w-4 h-4 ${rule.isActive ? 'text-green-500' : 'text-muted-foreground'}`} />
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive"
                                                    disabled={deleteMutation.isPending && deletingRuleId === rule.id}
                                                    onClick={() => {
                                                        if (confirm('Delete this rule?')) {
                                                            setDeletingRuleId(rule.id);
                                                            deleteMutation.mutate({ id: rule.id });
                                                        }
                                                    }}
                                                >
                                                    {deleteMutation.isPending && deletingRuleId === rule.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="login" className="space-y-6 mt-6">
                    <LoginProtectionCard />
                </TabsContent>
            </Tabs>

            <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} />
        </div>
    );
}
