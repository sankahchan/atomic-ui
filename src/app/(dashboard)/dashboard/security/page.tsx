'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { downloadTextFile } from '@/lib/download';
import {
    ShieldCheck, Plus, Trash2, Power, Globe, AlertTriangle,
    Lock, Unlock, CheckCircle, XCircle, AlertCircle, Server,
    RefreshCw, Shield, Clock, ExternalLink, Loader2, Download,
    Eye, Star, BellOff, ListFilter, Ban
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

function incidentSeverityClasses(severity: string) {
    switch (severity) {
        case 'CRITICAL':
            return 'border-red-500/40 bg-red-500/10 text-red-500';
        case 'HIGH':
            return 'border-orange-500/40 bg-orange-500/10 text-orange-500';
        case 'MEDIUM':
            return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-500';
        default:
            return 'border-border/60 bg-background/70 text-muted-foreground';
    }
}

function incidentStatusClasses(status: string) {
    switch (status) {
        case 'ACTIVE':
            return 'border-red-500/40 bg-red-500/10 text-red-500';
        case 'CONTAINED':
            return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500';
        default:
            return 'border-border/60 bg-background/70 text-muted-foreground';
    }
}

function workflowStatusClasses(status: string) {
    switch (status) {
        case 'ACKNOWLEDGED':
            return 'border-blue-500/40 bg-blue-500/10 text-blue-500';
        case 'RESOLVED':
            return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500';
        default:
            return 'border-border/60 bg-background/70 text-muted-foreground';
    }
}

function reputationLevelClasses(level: string) {
    switch (level) {
        case 'CRITICAL':
            return 'border-red-500/40 bg-red-500/10 text-red-500';
        case 'HIGH':
            return 'border-orange-500/40 bg-orange-500/10 text-orange-500';
        case 'ELEVATED':
            return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-500';
        default:
            return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500';
    }
}

const riskLevels = ['LOW', 'ELEVATED', 'HIGH', 'CRITICAL'] as const;
const incidentStatuses = ['ALL', 'ACTIVE', 'CONTAINED', 'RESOLVED'] as const;
const workflowStatuses = ['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
const incidentSeverities = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
type IncidentFilters = {
    search: string;
    status: (typeof incidentStatuses)[number];
    workflowStatus: (typeof workflowStatuses)[number];
    severity: (typeof incidentSeverities)[number];
    country: string;
    reputation: (typeof riskLevels)[number] | 'ALL';
    timeWindowHours: number | null;
};

const defaultIncidentFilters: IncidentFilters = {
    search: '',
    status: 'ALL' as const,
    workflowStatus: 'ALL' as const,
    severity: 'ALL' as const,
    country: 'ALL',
    reputation: 'ALL' as const,
    timeWindowHours: 24 as number | null,
};
const SECURITY_DEFAULT_SAVED_VIEW_STORAGE_KEY = 'security.defaultSavedViewId';

function parseIncidentFiltersFromSearch(search: string): { filters: IncidentFilters; viewId: string; hasValues: boolean } {
    const params = new URLSearchParams(search);
    const next: IncidentFilters = { ...defaultIncidentFilters };
    let hasValues = false;

    const searchValue = params.get('search');
    if (searchValue) {
        next.search = searchValue;
        hasValues = true;
    }

    const status = params.get('status');
    if (status && incidentStatuses.includes(status as (typeof incidentStatuses)[number])) {
        next.status = status as (typeof incidentStatuses)[number];
        hasValues = true;
    }

    const workflowStatus = params.get('workflow');
    if (workflowStatus && workflowStatuses.includes(workflowStatus as (typeof workflowStatuses)[number])) {
        next.workflowStatus = workflowStatus as (typeof workflowStatuses)[number];
        hasValues = true;
    }

    const severity = params.get('severity');
    if (severity && incidentSeverities.includes(severity as (typeof incidentSeverities)[number])) {
        next.severity = severity as (typeof incidentSeverities)[number];
        hasValues = true;
    }

    const country = params.get('country');
    if (country) {
        next.country = country;
        hasValues = true;
    }

    const reputation = params.get('reputation');
    if (reputation && (reputation === 'ALL' || riskLevels.includes(reputation as (typeof riskLevels)[number]))) {
        next.reputation = reputation as IncidentFilters['reputation'];
        hasValues = true;
    }

    const timeWindow = params.get('hours');
    if (timeWindow) {
        next.timeWindowHours = timeWindow === 'all' ? null : Number(timeWindow);
        hasValues = true;
    }

    return {
        filters: next,
        viewId: params.get('view') || 'all',
        hasValues,
    };
}
const alertRuleLabels: Record<string, { title: string; description: string }> = {
    threshold: {
        title: 'Threshold reached',
        description: 'Early warning before the soft lock policy starts firing.',
    },
    lock: {
        title: 'Lock applied',
        description: 'Temporary app-layer lock after repeated failed logins.',
    },
    ban: {
        title: 'Ban applied',
        description: 'Harder restriction after the ban threshold is crossed.',
    },
    repeatedOffender: {
        title: 'Repeated offender',
        description: 'Longer-running noisy IP that keeps retrying over the daily window.',
    },
    unban: {
        title: 'Unban',
        description: 'Manual release of an app or fail2ban restriction.',
    },
    fail2banUnavailable: {
        title: 'fail2ban unavailable',
        description: 'Server-side jail is unavailable and only app-level protection remains.',
    },
};

function HistoryBars({
    label,
    value,
    max,
    className,
}: {
    label: string;
    value: number;
    max: number;
    className?: string;
}) {
    const height = max > 0 ? Math.max(8, Math.round((value / max) * 100)) : 8;

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="flex h-28 w-7 items-end rounded-full bg-muted/40 px-1.5 py-1">
                <div
                    className={`w-full rounded-full ${className || 'bg-primary/80'}`}
                    style={{ height: `${height}%` }}
                />
            </div>
            <div className="text-center text-[10px] leading-tight text-muted-foreground">
                <div>{label}</div>
                <div className="font-semibold text-foreground">{value}</div>
            </div>
        </div>
    );
}

function LoginProtectionCard() {
    const { toast } = useToast();
    const { data: overview, isLoading, refetch } = trpc.security.getAdminLoginAbuseOverview.useQuery();
    const exportMutation = trpc.security.exportAdminLoginIncidents.useMutation({
        onSuccess: (result) => {
            downloadTextFile(result.content, result.filename, result.type);
            toast({ title: 'Incident export downloaded', description: result.filename });
        },
        onError: (error) => {
            toast({ title: 'Failed to export incidents', description: error.message, variant: 'destructive' });
        },
    });
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
    const acknowledgeMutation = trpc.security.acknowledgeAdminLoginIncident.useMutation({
        onSuccess: async () => {
            toast({ title: 'Incident acknowledged', description: 'The incident is now marked as being handled.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to acknowledge incident', description: error.message, variant: 'destructive' });
        },
    });
    const resolveMutation = trpc.security.resolveAdminLoginIncident.useMutation({
        onSuccess: async () => {
            toast({ title: 'Incident resolved', description: 'The incident has been marked as resolved.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to resolve incident', description: error.message, variant: 'destructive' });
        },
    });
    const noteMutation = trpc.security.addAdminLoginIncidentNote.useMutation({
        onSuccess: async () => {
            toast({ title: 'Note added', description: 'The incident note has been saved.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to save note', description: error.message, variant: 'destructive' });
        },
    });
    const blockMutation = trpc.security.blockAdminLoginIp.useMutation({
        onSuccess: async () => {
            toast({ title: 'Permanent block added', description: 'The IP now has an active permanent block rule.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to block IP', description: error.message, variant: 'destructive' });
        },
    });
    const allowlistMutation = trpc.security.allowlistAdminLoginIp.useMutation({
        onSuccess: async () => {
            toast({ title: 'IP allowlisted', description: 'The IP has been added to the allowlist and active bans were cleared.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to allowlist IP', description: error.message, variant: 'destructive' });
        },
    });
    const promoteMutation = trpc.security.promoteAdminLoginIpToPermanentRule.useMutation({
        onSuccess: async () => {
            toast({ title: 'Permanent rule created', description: 'The IP was promoted to a permanent block rule.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to promote IP', description: error.message, variant: 'destructive' });
        },
    });
    const digestMutation = trpc.security.runAdminLoginIncidentDigestNow.useMutation({
        onSuccess: (result) => {
            toast({
                title: 'Incident digest sent',
                description: `Delivered to ${result.adminChats} admin chat(s) for ${result.incidentCount} incident(s).`,
            });
        },
        onError: (error) => {
            toast({ title: 'Failed to send digest', description: error.message, variant: 'destructive' });
        },
    });
    const saveViewMutation = trpc.security.saveAdminLoginSavedView.useMutation({
        onSuccess: async () => {
            toast({ title: 'Saved view updated', description: 'The security view filters are saved.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to save view', description: error.message, variant: 'destructive' });
        },
    });
    const deleteViewMutation = trpc.security.deleteAdminLoginSavedView.useMutation({
        onSuccess: async () => {
            toast({ title: 'Saved view removed', description: 'The saved filter view has been deleted.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to delete view', description: error.message, variant: 'destructive' });
        },
    });
    const suppressMutation = trpc.security.suppressAdminLoginAlerts.useMutation({
        onSuccess: async () => {
            toast({ title: 'Alerts muted', description: 'Security alerts were suppressed for the selected scope.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to mute alerts', description: error.message, variant: 'destructive' });
        },
    });
    const unsuppressMutation = trpc.security.removeAdminLoginAlertSuppression.useMutation({
        onSuccess: async () => {
            toast({ title: 'Alert mute removed', description: 'Alerts are active again for the selected scope.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Failed to remove mute', description: error.message, variant: 'destructive' });
        },
    });
    const bulkIncidentMutation = trpc.security.bulkUpdateAdminLoginIncidents.useMutation({
        onSuccess: async (result) => {
            toast({ title: 'Bulk incident action complete', description: `${result.processed} incidents updated.` });
            setSelectedIncidentIds([]);
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Bulk incident action failed', description: error.message, variant: 'destructive' });
        },
    });
    const bulkIpMutation = trpc.security.bulkUpdateAdminLoginIps.useMutation({
        onSuccess: async (result) => {
            toast({ title: 'Bulk IP action complete', description: `${result.processed} IP entries updated.` });
            setSelectedIps([]);
            await refetch();
        },
        onError: (error) => {
            toast({ title: 'Bulk IP action failed', description: error.message, variant: 'destructive' });
        },
    });

    const [form, setForm] = useState<{
        enabled: boolean;
        softLockThreshold: number;
        softLockWindowMinutes: number;
        softLockDurationMinutes: number;
        banThreshold: number;
        banWindowMinutes: number;
        banDurationMinutes: number;
        telegramAlertEnabled: boolean;
        alertOnRepeatedOffender: boolean;
        repeatedOffenderThreshold: number;
        alertOnUnban: boolean;
        fail2banLogEnabled: boolean;
        repeatedBanLookbackDays: number;
        repeatedBanDurationMinutes: number;
        challengeMode: 'OFF' | 'REQUIRE_2FA' | 'BLOCK';
        challengeMinimumReputationLevel: 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
        incidentDigestEnabled: boolean;
        incidentDigestHour: number;
        incidentDigestMinute: number;
        incidentDigestLookbackHours: number;
        alertRules: Record<
            'threshold' | 'lock' | 'ban' | 'repeatedOffender' | 'unban' | 'fail2banUnavailable',
            {
                enabled: boolean;
                cooldownMinutes: number;
                minimumReputationLevel: 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
            }
        >;
        trustedIpRanges: string;
    }>({
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
        repeatedBanLookbackDays: 7,
        repeatedBanDurationMinutes: 2880,
        challengeMode: 'OFF' as 'OFF' | 'REQUIRE_2FA' | 'BLOCK',
        challengeMinimumReputationLevel: 'HIGH' as 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL',
        incidentDigestEnabled: false,
        incidentDigestHour: 9,
        incidentDigestMinute: 30,
        incidentDigestLookbackHours: 24,
        alertRules: {
            threshold: { enabled: true, cooldownMinutes: 30, minimumReputationLevel: 'ELEVATED' as const },
            lock: { enabled: true, cooldownMinutes: 60, minimumReputationLevel: 'ELEVATED' as const },
            ban: { enabled: true, cooldownMinutes: 60, minimumReputationLevel: 'HIGH' as const },
            repeatedOffender: { enabled: true, cooldownMinutes: 360, minimumReputationLevel: 'HIGH' as const },
            unban: { enabled: true, cooldownMinutes: 60, minimumReputationLevel: 'LOW' as const },
            fail2banUnavailable: { enabled: true, cooldownMinutes: 360, minimumReputationLevel: 'LOW' as const },
        },
        trustedIpRanges: '',
    });
    const [incidentFilters, setIncidentFilters] = useState<IncidentFilters>(defaultIncidentFilters);
    const [activeSavedViewId, setActiveSavedViewId] = useState<string>('all');
    const [defaultSavedViewId, setDefaultSavedViewId] = useState<string>('all');
    const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);
    const [selectedIps, setSelectedIps] = useState<string[]>([]);
    const [incidentDetailId, setIncidentDetailId] = useState<string | null>(null);
    const [filtersBootstrapped, setFiltersBootstrapped] = useState(false);
    const incidentDetailQuery = trpc.security.getAdminLoginIncidentDetail.useQuery(
        { incidentId: incidentDetailId || '' },
        { enabled: Boolean(incidentDetailId) },
    );

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
            repeatedBanLookbackDays: overview.config.repeatedBanLookbackDays,
            repeatedBanDurationMinutes: overview.config.repeatedBanDurationMinutes,
            challengeMode: overview.config.challengeMode,
            challengeMinimumReputationLevel: overview.config.challengeMinimumReputationLevel,
            incidentDigestEnabled: overview.config.incidentDigestEnabled,
            incidentDigestHour: overview.config.incidentDigestHour,
            incidentDigestMinute: overview.config.incidentDigestMinute,
            incidentDigestLookbackHours: overview.config.incidentDigestLookbackHours,
            alertRules: overview.config.alertRules,
            trustedIpRanges: (overview.config.trustedIpRanges || []).join('\n'),
        });
    }, [overview]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const stored = window.localStorage.getItem(SECURITY_DEFAULT_SAVED_VIEW_STORAGE_KEY);
        if (stored) {
            setDefaultSavedViewId(stored);
        }
    }, []);

    useEffect(() => {
        if (!overview || filtersBootstrapped || typeof window === 'undefined') {
            return;
        }

        const parsed = parseIncidentFiltersFromSearch(window.location.search);
        if (parsed.hasValues) {
            setIncidentFilters(parsed.filters);
            setActiveSavedViewId(parsed.viewId);
            setFiltersBootstrapped(true);
            return;
        }

        const storedDefault = window.localStorage.getItem(SECURITY_DEFAULT_SAVED_VIEW_STORAGE_KEY) || defaultSavedViewId;
        if (storedDefault !== 'all') {
            const savedView = overview.savedViews.find((view) => view.id === storedDefault);
            if (savedView) {
                setActiveSavedViewId(savedView.id);
                setIncidentFilters(savedView.filters);
            } else {
                window.localStorage.removeItem(SECURITY_DEFAULT_SAVED_VIEW_STORAGE_KEY);
                setDefaultSavedViewId('all');
            }
        }

        setFiltersBootstrapped(true);
    }, [defaultSavedViewId, filtersBootstrapped, overview]);

    useEffect(() => {
        if (!filtersBootstrapped || typeof window === 'undefined') {
            return;
        }

        const url = new URL(window.location.href);
        const params = url.searchParams;

        const setOrDelete = (key: string, value: string | null) => {
            if (!value || value === 'ALL') {
                params.delete(key);
                return;
            }
            params.set(key, value);
        };

        setOrDelete('search', incidentFilters.search.trim() || null);
        setOrDelete('status', incidentFilters.status);
        setOrDelete('workflow', incidentFilters.workflowStatus);
        setOrDelete('severity', incidentFilters.severity);
        setOrDelete('country', incidentFilters.country === 'ALL' ? null : incidentFilters.country);
        setOrDelete('reputation', incidentFilters.reputation);
        setOrDelete('hours', incidentFilters.timeWindowHours === null ? 'all' : String(incidentFilters.timeWindowHours));
        setOrDelete('view', activeSavedViewId === 'all' ? null : activeSavedViewId);

        window.history.replaceState({}, '', url.toString());
    }, [activeSavedViewId, filtersBootstrapped, incidentFilters]);

    const activeIncidentCount = overview?.securityIncidents.filter((incident) => incident.status === 'ACTIVE').length ?? 0;
    const highRiskIpCount =
        overview?.ipReputation.filter((entry) => entry.level === 'HIGH' || entry.level === 'CRITICAL').length ?? 0;

    const requestNote = (title: string) => {
        const value = window.prompt(title, '');
        if (value == null) {
            return null;
        }

        return value.trim();
    };

    const handleIncidentAcknowledge = (incidentId: string) => {
        const note = requestNote('Optional incident note');
        if (note === null) return;
        acknowledgeMutation.mutate({ incidentId, note: note || undefined });
    };

    const handleIncidentResolve = (incidentId: string) => {
        const note = requestNote('Resolution note');
        if (note === null) return;
        resolveMutation.mutate({ incidentId, note: note || undefined });
    };

    const handleIncidentNote = (incidentId: string) => {
        const note = requestNote('Add an incident note');
        if (!note) return;
        noteMutation.mutate({ incidentId, note });
    };

    const handleBlockIp = (ip: string, promote = false) => {
        const note = requestNote(promote ? 'Optional promotion note' : 'Optional block note');
        if (note === null) return;
        if (promote) {
            promoteMutation.mutate({ ip, note: note || undefined });
            return;
        }

        blockMutation.mutate({ ip, note: note || undefined });
    };

    const handleAllowlistIp = (ip: string) => {
        const note = requestNote('Optional allowlist note');
        if (note === null) return;
        allowlistMutation.mutate({ ip, note: note || undefined });
    };

    const handleSaveCurrentView = () => {
        if (!overview) {
            return;
        }
        const name = window.prompt('Saved view name', activeSavedViewId !== 'all'
            ? overview.savedViews.find((view) => view.id === activeSavedViewId)?.name || ''
            : '');
        if (!name?.trim()) {
            return;
        }

        saveViewMutation.mutate({
            id: activeSavedViewId === 'all' ? undefined : activeSavedViewId,
            name: name.trim(),
            filters: incidentFilters,
        });
    };

    const handleApplySavedView = (viewId: string) => {
        if (!overview) {
            return;
        }
        if (viewId === 'all') {
            setActiveSavedViewId('all');
            setIncidentFilters(defaultIncidentFilters);
            return;
        }

        const view = overview.savedViews.find((entry) => entry.id === viewId);
        if (!view) {
            return;
        }

        setActiveSavedViewId(view.id);
        setIncidentFilters(view.filters);
    };

    const handleDeleteSavedView = (viewId: string) => {
        if (!window.confirm('Delete this saved view?')) {
            return;
        }
        deleteViewMutation.mutate({ id: viewId });
        if (activeSavedViewId === viewId) {
            setActiveSavedViewId('all');
            setIncidentFilters(defaultIncidentFilters);
        }
        if (defaultSavedViewId === viewId && typeof window !== 'undefined') {
            window.localStorage.removeItem(SECURITY_DEFAULT_SAVED_VIEW_STORAGE_KEY);
            setDefaultSavedViewId('all');
        }
    };

    const handleSetDefaultSavedView = (viewId: string) => {
        if (typeof window === 'undefined') {
            return;
        }
        if (viewId === 'all') {
            window.localStorage.removeItem(SECURITY_DEFAULT_SAVED_VIEW_STORAGE_KEY);
            setDefaultSavedViewId('all');
            toast({ title: 'Default view cleared', description: 'The security page will open with standard filters.' });
            return;
        }
        window.localStorage.setItem(SECURITY_DEFAULT_SAVED_VIEW_STORAGE_KEY, viewId);
        setDefaultSavedViewId(viewId);
        toast({ title: 'Default view saved', description: 'This view will be applied when the security page opens.' });
    };

    const requestSuppressionInput = (title: string) => {
        const hours = window.prompt(title, '24');
        if (hours == null) {
            return null;
        }
        const parsed = Number(hours);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toast({ title: 'Invalid duration', description: 'Enter a positive number of hours.', variant: 'destructive' });
            return null;
        }
        const reason = window.prompt('Optional mute reason', '') ?? '';
        return {
            durationMinutes: Math.round(parsed * 60),
            reason: reason.trim() || undefined,
        };
    };

    const handleMuteScope = (scopeType: 'IP' | 'INCIDENT', scopeValue: string, label: string) => {
        const payload = requestSuppressionInput(`Mute ${label} alerts for how many hours?`);
        if (!payload) {
            return;
        }

        suppressMutation.mutate({
            scopeType,
            scopeValue,
            durationMinutes: payload.durationMinutes,
            reason: payload.reason,
        });
    };

    const handleUnmuteScope = (scopeType: 'IP' | 'INCIDENT', scopeValue: string) => {
        unsuppressMutation.mutate({ scopeType, scopeValue });
    };

    const toggleIncidentSelection = (incidentId: string, checked: boolean) => {
        setSelectedIncidentIds((current) =>
            checked ? Array.from(new Set([...current, incidentId])) : current.filter((value) => value !== incidentId),
        );
    };

    const toggleIpSelection = (ip: string, checked: boolean) => {
        setSelectedIps((current) =>
            checked ? Array.from(new Set([...current, ip])) : current.filter((value) => value !== ip),
        );
    };

    const handleBulkIncidentAction = (
        action: 'ACKNOWLEDGE' | 'RESOLVE' | 'MUTE' | 'UNMUTE',
    ) => {
        if (selectedIncidentIds.length === 0) {
            return;
        }
        const note =
            action === 'MUTE'
                ? undefined
                : requestNote(
                    action === 'ACKNOWLEDGE'
                        ? 'Optional note for bulk acknowledge'
                        : 'Optional note for bulk resolve',
                );
        if (note === null) {
            return;
        }
        const suppression =
            action === 'MUTE'
                ? requestSuppressionInput('Mute selected incident alerts for how many hours?')
                : null;
        if (action === 'MUTE' && !suppression) {
            return;
        }

        bulkIncidentMutation.mutate({
            incidentIds: selectedIncidentIds,
            action,
            note: note || undefined,
            durationMinutes: suppression?.durationMinutes,
        });
    };

    const handleBulkIpAction = (
        action: 'BLOCK' | 'ALLOWLIST' | 'PROMOTE' | 'MUTE' | 'UNMUTE' | 'UNBAN',
    ) => {
        if (selectedIps.length === 0) {
            return;
        }
        const note =
            action === 'MUTE' || action === 'UNBAN'
                ? undefined
                : requestNote(
                    action === 'BLOCK'
                        ? 'Optional note for bulk block'
                        : action === 'ALLOWLIST'
                            ? 'Optional note for bulk allowlist'
                            : 'Optional note for bulk promote',
                );
        if (note === null) {
            return;
        }
        const suppression =
            action === 'MUTE'
                ? requestSuppressionInput('Mute selected IP alerts for how many hours?')
                : null;
        if (action === 'MUTE' && !suppression) {
            return;
        }
        if (action === 'UNBAN' && !window.confirm(`Unban ${selectedIps.length} IPs?`)) {
            return;
        }

        bulkIpMutation.mutate({
            ips: selectedIps,
            action,
            note: note || undefined,
            durationMinutes: suppression?.durationMinutes,
        });
    };

    const filteredIncidents = useMemo(() => {
        if (!overview) {
            return [];
        }
        const now = Date.now();
        return overview.securityIncidents.filter((incident) => {
            if (incidentFilters.status !== 'ALL' && incident.status !== incidentFilters.status) {
                return false;
            }
            if (incidentFilters.workflowStatus !== 'ALL' && incident.workflowStatus !== incidentFilters.workflowStatus) {
                return false;
            }
            if (incidentFilters.severity !== 'ALL' && incident.severity !== incidentFilters.severity) {
                return false;
            }
            if (incidentFilters.country !== 'ALL' && (incident.countryCode || 'UNKNOWN') !== incidentFilters.country) {
                return false;
            }
            if (incidentFilters.reputation !== 'ALL') {
                const reputation = overview.ipReputation.find((entry) => entry.ip === incident.ip);
                if (!reputation || reputation.level !== incidentFilters.reputation) {
                    return false;
                }
            }
            if (incidentFilters.timeWindowHours) {
                const threshold = now - incidentFilters.timeWindowHours * 60 * 60 * 1000;
                if (incident.endedAt.getTime() < threshold) {
                    return false;
                }
            }

            const searchNeedle = incidentFilters.search.trim().toLowerCase();
            if (!searchNeedle) {
                return true;
            }

            const haystack = [
                incident.ip,
                incident.countryCode || '',
                incident.summary,
                incident.attemptedEmails.join(' '),
                incident.hosts.join(' '),
                incident.paths.join(' '),
                incident.notesPreview || '',
                incident.enrichment.organization || '',
                incident.enrichment.isp || '',
                incident.enrichment.asn || '',
                incident.enrichment.reverseDns.join(' '),
            ].join(' ').toLowerCase();
            return haystack.includes(searchNeedle);
        });
    }, [incidentFilters, overview]);

    const filteredReputation = useMemo(() => {
        if (!overview) {
            return [];
        }
        const incidentIpSet = new Set(filteredIncidents.map((incident) => incident.ip));
        return overview.ipReputation.filter((entry) => {
            if (incidentFilters.reputation !== 'ALL' && entry.level !== incidentFilters.reputation) {
                return false;
            }
            if (incidentFilters.country !== 'ALL' && (entry.countryCode || 'UNKNOWN') !== incidentFilters.country) {
                return false;
            }
            if (incidentFilters.timeWindowHours) {
                const threshold = Date.now() - incidentFilters.timeWindowHours * 60 * 60 * 1000;
                if (entry.lastSeenAt.getTime() < threshold) {
                    return false;
                }
            }
            if (incidentFilters.search.trim()) {
                const needle = incidentFilters.search.trim().toLowerCase();
                const haystack = [
                    entry.ip,
                    entry.countryCode || '',
                    entry.topEmail || '',
                    entry.attemptedEmails.join(' '),
                    entry.enrichment.organization || '',
                    entry.enrichment.isp || '',
                    entry.enrichment.asn || '',
                    entry.enrichment.reverseDns.join(' '),
                ].join(' ').toLowerCase();
                if (!haystack.includes(needle)) {
                    return false;
                }
            }
            if (incidentFilters.status !== 'ALL' || incidentFilters.workflowStatus !== 'ALL' || incidentFilters.severity !== 'ALL') {
                return incidentIpSet.has(entry.ip);
            }
            return true;
        });
    }, [filteredIncidents, incidentFilters, overview]);

    const availableCountries = useMemo(() => {
        if (!overview) {
            return [] as string[];
        }
        const values = new Set<string>();
        for (const incident of overview.securityIncidents) {
            if (incident.countryCode) values.add(incident.countryCode);
        }
        for (const entry of overview.ipReputation) {
            if (entry.countryCode) values.add(entry.countryCode);
        }
        return Array.from(values).sort();
    }, [overview]);
    const allVisibleIncidentsSelected =
        filteredIncidents.length > 0 && filteredIncidents.every((incident) => selectedIncidentIds.includes(incident.id));
    const allVisibleIpsSelected =
        filteredReputation.length > 0 && filteredReputation.every((entry) => selectedIps.includes(entry.ip));

    useEffect(() => {
        const visibleIncidentIds = new Set(filteredIncidents.map((incident) => incident.id));
        setSelectedIncidentIds((current) => current.filter((id) => visibleIncidentIds.has(id)));
    }, [filteredIncidents]);

    useEffect(() => {
        const visibleIps = new Set(filteredReputation.map((entry) => entry.ip));
        setSelectedIps((current) => current.filter((ip) => visibleIps.has(ip)));
    }, [filteredReputation]);

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
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">fail2ban jail</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${overview.fail2banStatus.available ? '' : 'text-yellow-500'}`}>
                            {overview.fail2banStatus.available ? overview.fail2banStatus.currentlyBanned : 'N/A'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {overview.fail2banStatus.available
                                ? `${overview.fail2banStatus.jail} currently banned`
                                : 'fail2ban status unavailable'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active incidents</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${activeIncidentCount > 0 ? 'text-orange-500' : ''}`}>
                            {activeIncidentCount}
                        </div>
                        <p className="text-xs text-muted-foreground">ongoing abuse bursts still worth watching</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">High-risk IPs</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${highRiskIpCount > 0 ? 'text-red-500' : ''}`}>
                            {highRiskIpCount}
                        </div>
                        <p className="text-xs text-muted-foreground">reputation score 50 or higher</p>
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
                        <div className="space-y-2">
                            <Label>Repeat-ban lookback (days)</Label>
                            <Input type="number" min={1} value={form.repeatedBanLookbackDays} onChange={(event) => setForm((current) => ({ ...current, repeatedBanLookbackDays: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">If the same IP is banned again inside this window, the ban duration escalates.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Escalated ban duration (minutes)</Label>
                            <Input type="number" min={1} value={form.repeatedBanDurationMinutes} onChange={(event) => setForm((current) => ({ ...current, repeatedBanDurationMinutes: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">Default production value is 2880 minutes (48 hours).</p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Challenge mode for risky IPs</Label>
                            <Select
                                value={form.challengeMode}
                                onValueChange={(value) =>
                                    setForm((current) => ({
                                        ...current,
                                        challengeMode: value as 'OFF' | 'REQUIRE_2FA' | 'BLOCK',
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="OFF">Off</SelectItem>
                                    <SelectItem value="REQUIRE_2FA">Require 2FA if the account supports it</SelectItem>
                                    <SelectItem value="BLOCK">Block risky IPs after password verification</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Use risk reputation to add an extra hurdle after the password step.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Challenge minimum reputation</Label>
                            <Select
                                value={form.challengeMinimumReputationLevel}
                                onValueChange={(value) =>
                                    setForm((current) => ({
                                        ...current,
                                        challengeMinimumReputationLevel: value as 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL',
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {riskLevels.map((level) => (
                                        <SelectItem key={level} value={level}>{level}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Only IPs at or above this reputation level will trigger the challenge mode.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <Label>Telegram alert rules</Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Fine-tune which security events send Telegram alerts and how noisy they’re allowed to be.
                            </p>
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                            {Object.entries(form.alertRules).map(([eventKey, rule]) => {
                                const meta = alertRuleLabels[eventKey] || { title: eventKey, description: eventKey };
                                return (
                                    <div key={eventKey} className="ops-detail-card space-y-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="font-medium">{meta.title}</p>
                                                <p className="text-sm text-muted-foreground">{meta.description}</p>
                                            </div>
                                            <Switch
                                                checked={rule.enabled}
                                                onCheckedChange={(checked) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        alertRules: {
                                                            ...current.alertRules,
                                                            [eventKey]: { ...current.alertRules[eventKey as keyof typeof current.alertRules], enabled: checked },
                                                        },
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Cooldown (minutes)</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={rule.cooldownMinutes}
                                                    onChange={(event) =>
                                                        setForm((current) => ({
                                                            ...current,
                                                            alertRules: {
                                                                ...current.alertRules,
                                                                [eventKey]: {
                                                                    ...current.alertRules[eventKey as keyof typeof current.alertRules],
                                                                    cooldownMinutes: Number(event.target.value) || 1,
                                                                },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Minimum reputation</Label>
                                                <Select
                                                    value={rule.minimumReputationLevel}
                                                    onValueChange={(value) =>
                                                        setForm((current) => ({
                                                            ...current,
                                                            alertRules: {
                                                                ...current.alertRules,
                                                                [eventKey]: {
                                                                    ...current.alertRules[eventKey as keyof typeof current.alertRules],
                                                                    minimumReputationLevel: value as 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL',
                                                                },
                                                            },
                                                        }))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {riskLevels.map((level) => (
                                                            <SelectItem key={level} value={level}>{level}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
                        <div className="ops-detail-card space-y-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-medium">Daily incident digest</p>
                                    <p className="text-sm text-muted-foreground">
                                        Send a daily security summary to Telegram admin chats with current incidents and high-risk IPs.
                                    </p>
                                </div>
                                <Switch
                                    checked={form.incidentDigestEnabled}
                                    onCheckedChange={(checked) =>
                                        setForm((current) => ({ ...current, incidentDigestEnabled: checked }))
                                    }
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>Digest hour</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={23}
                                        value={form.incidentDigestHour}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                incidentDigestHour: Math.min(23, Math.max(0, Number(event.target.value) || 0)),
                                            }))
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Digest minute</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={59}
                                        value={form.incidentDigestMinute}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                incidentDigestMinute: Math.min(59, Math.max(0, Number(event.target.value) || 0)),
                                            }))
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Lookback hours</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={168}
                                        value={form.incidentDigestLookbackHours}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                incidentDigestLookbackHours: Math.min(168, Math.max(1, Number(event.target.value) || 1)),
                                            }))
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="ops-detail-card space-y-4">
                            <div className="space-y-1">
                                <p className="font-medium">Instant digest</p>
                                <p className="text-sm text-muted-foreground">
                                    Push the current security incident summary to Telegram immediately without waiting for the scheduled digest.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="w-full rounded-full"
                                disabled={digestMutation.isPending}
                                onClick={() => digestMutation.mutate()}
                            >
                                {digestMutation.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                )}
                                Send security digest now
                            </Button>
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
                            <CardTitle>Server fail2ban status</CardTitle>
                            <CardDescription>
                                Live jail state from the server-side auth jail that hard-bans abusive admin login IPs.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-0 pb-0">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="ops-detail-card">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Jail</p>
                                    <p className="mt-2 font-semibold">{overview.fail2banStatus.jail}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {overview.fail2banStatus.available ? 'Connected to fail2ban' : overview.fail2banStatus.error || 'Unavailable'}
                                    </p>
                                </div>
                                <div className="ops-detail-card">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Currently banned</p>
                                    <p className="mt-2 text-2xl font-semibold">{overview.fail2banStatus.currentlyBanned}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {overview.fail2banStatus.totalBanned} total bans recorded
                                    </p>
                                </div>
                                <div className="ops-detail-card">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Currently failed</p>
                                    <p className="mt-2 text-2xl font-semibold">{overview.fail2banStatus.currentlyFailed}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {overview.fail2banStatus.totalFailed} total failed hits seen by the jail
                                    </p>
                                </div>
                                <div className="ops-detail-card">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Banned IP list</p>
                                    <div className="mt-2 space-y-2">
                                        {overview.fail2banStatus.bannedIps.length > 0 ? (
                                            overview.fail2banStatus.bannedIps.slice(0, 8).map((ip) => (
                                                <div key={ip} className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                    <Badge variant="outline">{ip}</Badge>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 rounded-full px-3"
                                                        disabled={unbanMutation.isPending}
                                                        onClick={() => unbanMutation.mutate({ ip })}
                                                    >
                                                        <Unlock className="mr-2 h-3.5 w-3.5" />
                                                        Unban
                                                    </Button>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No IPs currently banned by fail2ban.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

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

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <Card className="ops-panel">
                    <CardHeader className="px-0 pt-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <CardTitle>Incident timeline</CardTitle>
                                <CardDescription>
                                    Grouped bursts of failed admin logins so you can see what escalated, what was contained, and what is still active.
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full"
                                    disabled={exportMutation.isPending}
                                    onClick={() => exportMutation.mutate({ format: 'csv' })}
                                >
                                    {exportMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="mr-2 h-4 w-4" />
                                    )}
                                    Export CSV
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full"
                                    disabled={exportMutation.isPending}
                                    onClick={() => exportMutation.mutate({ format: 'json' })}
                                >
                                    {exportMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="mr-2 h-4 w-4" />
                                    )}
                                    Export JSON
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 px-0 pb-0">
                        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                            <div className="ops-detail-card space-y-3">
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Search</Label>
                                        <Input
                                            value={incidentFilters.search}
                                            onChange={(event) =>
                                                setIncidentFilters((current) => ({ ...current, search: event.target.value }))
                                            }
                                            placeholder="IP, email, host, ASN..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select
                                            value={incidentFilters.status}
                                            onValueChange={(value) =>
                                                setIncidentFilters((current) => ({
                                                    ...current,
                                                    status: value as (typeof incidentStatuses)[number],
                                                }))
                                            }
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {incidentStatuses.map((status) => (
                                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Workflow</Label>
                                        <Select
                                            value={incidentFilters.workflowStatus}
                                            onValueChange={(value) =>
                                                setIncidentFilters((current) => ({
                                                    ...current,
                                                    workflowStatus: value as (typeof workflowStatuses)[number],
                                                }))
                                            }
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {workflowStatuses.map((status) => (
                                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Severity</Label>
                                        <Select
                                            value={incidentFilters.severity}
                                            onValueChange={(value) =>
                                                setIncidentFilters((current) => ({
                                                    ...current,
                                                    severity: value as (typeof incidentSeverities)[number],
                                                }))
                                            }
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {incidentSeverities.map((severity) => (
                                                    <SelectItem key={severity} value={severity}>{severity}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Country</Label>
                                        <Select
                                            value={incidentFilters.country}
                                            onValueChange={(value) =>
                                                setIncidentFilters((current) => ({ ...current, country: value }))
                                            }
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">ALL</SelectItem>
                                                {availableCountries.map((country) => (
                                                    <SelectItem key={country} value={country}>{country}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Reputation</Label>
                                        <Select
                                            value={incidentFilters.reputation}
                                            onValueChange={(value) =>
                                                setIncidentFilters((current) => ({
                                                    ...current,
                                                    reputation: value as (typeof riskLevels)[number] | 'ALL',
                                                }))
                                            }
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">ALL</SelectItem>
                                                {riskLevels.map((level) => (
                                                    <SelectItem key={level} value={level}>{level}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Time window</Label>
                                        <Select
                                            value={incidentFilters.timeWindowHours === null ? 'all' : String(incidentFilters.timeWindowHours)}
                                            onValueChange={(value) =>
                                                setIncidentFilters((current) => ({
                                                    ...current,
                                                    timeWindowHours: value === 'all' ? null : Number(value),
                                                }))
                                            }
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">Last 1 hour</SelectItem>
                                                <SelectItem value="6">Last 6 hours</SelectItem>
                                                <SelectItem value="24">Last 24 hours</SelectItem>
                                                <SelectItem value="72">Last 72 hours</SelectItem>
                                                <SelectItem value="168">Last 7 days</SelectItem>
                                                <SelectItem value="all">All available</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                        disabled={saveViewMutation.isPending}
                                        onClick={handleSaveCurrentView}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Save current view
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => {
                                            setActiveSavedViewId('all');
                                            setIncidentFilters(defaultIncidentFilters);
                                        }}
                                    >
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Reset filters
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => {
                                            setActiveSavedViewId('all');
                                            setIncidentFilters({
                                                ...defaultIncidentFilters,
                                                status: 'ACTIVE',
                                                workflowStatus: 'OPEN',
                                                timeWindowHours: 24,
                                            });
                                        }}
                                    >
                                        <ListFilter className="mr-2 h-4 w-4" />
                                        My active work
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => {
                                            setActiveSavedViewId('all');
                                            setIncidentFilters({
                                                ...defaultIncidentFilters,
                                                reputation: 'HIGH',
                                                timeWindowHours: 168,
                                            });
                                        }}
                                    >
                                        <AlertTriangle className="mr-2 h-4 w-4" />
                                        High-risk week
                                    </Button>
                                </div>
                            </div>
                            <div className="ops-detail-card space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-medium">Saved views</p>
                                        <p className="text-sm text-muted-foreground">Reuse common incident and reputation filters.</p>
                                    </div>
                                    <Badge variant="outline">{overview.savedViews.length}</Badge>
                                </div>
                                <div className="space-y-2">
                                    <Button
                                        variant={activeSavedViewId === 'all' ? 'default' : 'outline'}
                                        size="sm"
                                        className="w-full justify-start rounded-full"
                                        onClick={() => handleApplySavedView('all')}
                                    >
                                        All incidents
                                    </Button>
                                    <Button
                                        variant={defaultSavedViewId === 'all' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className="w-full justify-start rounded-full"
                                        onClick={() => handleSetDefaultSavedView('all')}
                                    >
                                        <Star className="mr-2 h-4 w-4" />
                                        {defaultSavedViewId === 'all' ? 'Default view' : 'Set current default'}
                                    </Button>
                                    {overview.savedViews.map((view) => (
                                        <div key={view.id} className="flex items-center gap-2">
                                            <Button
                                                variant={activeSavedViewId === view.id ? 'default' : 'outline'}
                                                size="sm"
                                                className="flex-1 justify-start rounded-full"
                                                onClick={() => handleApplySavedView(view.id)}
                                            >
                                                {view.name}
                                            </Button>
                                            <Button
                                                variant={defaultSavedViewId === view.id ? 'secondary' : 'ghost'}
                                                size="icon"
                                                className="h-9 w-9 rounded-full"
                                                onClick={() => handleSetDefaultSavedView(view.id)}
                                            >
                                                <Star className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 rounded-full"
                                                disabled={deleteViewMutation.isPending}
                                                onClick={() => handleDeleteSavedView(view.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="ops-detail-card space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-medium">Alert suppressions</p>
                                    <p className="text-sm text-muted-foreground">Review muted incidents and IPs without opening each card.</p>
                                </div>
                                <Badge variant="outline">{overview.activeAlertSuppressions.length}</Badge>
                            </div>
                            {overview.activeAlertSuppressions.length === 0 ? (
                                <div className="rounded-[1rem] border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                                    No active suppressions.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {overview.activeAlertSuppressions.map((suppression) => {
                                        const relatedIncident = suppression.scopeType === 'INCIDENT'
                                            ? overview.securityIncidents.find((entry) => entry.id === suppression.scopeValue)
                                            : null;
                                        return (
                                            <div
                                                key={suppression.id}
                                                className="rounded-[1rem] border border-border/50 bg-background/65 px-3 py-3 dark:bg-white/[0.02]"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="space-y-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge variant="outline">{suppression.scopeType}</Badge>
                                                            <span className="text-sm font-medium break-all">{suppression.scopeValue}</span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            {suppression.reason || 'No reason provided'} · expires {formatDistanceToNow(new Date(suppression.expiresAt), { addSuffix: true })}
                                                        </p>
                                                        {relatedIncident && (
                                                            <p className="text-xs text-muted-foreground">{relatedIncident.summary}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {relatedIncident && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="rounded-full"
                                                                onClick={() => setIncidentDetailId(relatedIncident.id)}
                                                            >
                                                                <Eye className="mr-2 h-4 w-4" />
                                                                View
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="rounded-full"
                                                            disabled={unsuppressMutation.isPending}
                                                            onClick={() => handleUnmuteScope(suppression.scopeType, suppression.scopeValue)}
                                                        >
                                                            <Unlock className="mr-2 h-4 w-4" />
                                                            Unmute
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        {selectedIncidentIds.length > 0 && (
                            <div className="ops-detail-card space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="font-medium">{selectedIncidentIds.length} incidents selected</p>
                                        <p className="text-sm text-muted-foreground">Apply the same workflow or mute action to all selected incidents.</p>
                                    </div>
                                    <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSelectedIncidentIds([])}>
                                        Clear selection
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('ACKNOWLEDGE')}>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Acknowledge
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('RESOLVE')}>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        Resolve
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('MUTE')}>
                                        <BellOff className="mr-2 h-4 w-4" />
                                        Mute
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('UNMUTE')}>
                                        <Unlock className="mr-2 h-4 w-4" />
                                        Unmute
                                    </Button>
                                </div>
                            </div>
                        )}
                        {filteredIncidents.length === 0 ? (
                            <div className="ops-chart-empty py-8 text-muted-foreground">
                                {overview.securityIncidents.length === 0
                                    ? 'No login abuse incidents recorded yet.'
                                    : 'No incidents match the current filters.'}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-border/50 bg-background/60 px-4 py-3 text-sm dark:bg-white/[0.02]">
                                    <div className="flex items-center gap-3">
                                        <Checkbox
                                            checked={allVisibleIncidentsSelected}
                                            onCheckedChange={(checked) =>
                                                setSelectedIncidentIds(
                                                    checked ? filteredIncidents.map((incident) => incident.id) : [],
                                                )
                                            }
                                        />
                                        <span className="text-muted-foreground">Select all visible incidents</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {selectedIncidentIds.length} selected
                                    </span>
                                </div>
                                {filteredIncidents.map((incident) => (
                                    <div key={incident.id} className="ops-row-card space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedIncidentIds.includes(incident.id)}
                                                    onCheckedChange={(checked) => toggleIncidentSelection(incident.id, Boolean(checked))}
                                                    className="mt-1"
                                                />
                                                <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium">{incident.ip}</span>
                                                    {incident.countryCode && <Badge variant="outline">{incident.countryCode}</Badge>}
                                                    <Badge variant="outline" className={incidentSeverityClasses(incident.severity)}>
                                                        {incident.severity}
                                                    </Badge>
                                                    <Badge variant="outline" className={incidentStatusClasses(incident.status)}>
                                                        {incident.status}
                                                    </Badge>
                                                    <Badge variant="outline" className={workflowStatusClasses(incident.workflowStatus)}>
                                                        {incident.workflowStatus}
                                                    </Badge>
                                                    {incident.activeRestrictionType && (
                                                        <Badge variant="outline">{incident.activeRestrictionType}</Badge>
                                                    )}
                                                    {incident.alertSuppression && (
                                                        <Badge variant="outline">Muted for {incident.alertSuppression.remainingMinutes} min</Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{incident.summary}</p>
                                                </div>
                                            </div>
                                            <div className="text-right text-xs text-muted-foreground">
                                                <p>Started {formatDistanceToNow(new Date(incident.startedAt), { addSuffix: true })}</p>
                                                <p>Last seen {formatDistanceToNow(new Date(incident.endedAt), { addSuffix: true })}</p>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="mt-2 rounded-full"
                                                    onClick={() => setIncidentDetailId(incident.id)}
                                                >
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    Details
                                                </Button>
                                            </div>
                                        </div>
                                        {(incident.notesPreview || incident.enrichment.reverseDns.length > 0 || incident.enrichment.asn || incident.enrichment.isp || incident.enrichment.organization) && (
                                            <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
                                                <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                    <p className="font-medium text-foreground">Workflow</p>
                                                    <p className="mt-1">
                                                        {incident.workflowStatus === 'ACKNOWLEDGED' && incident.acknowledgedAt
                                                            ? `Acknowledged ${formatDistanceToNow(new Date(incident.acknowledgedAt), { addSuffix: true })}${incident.acknowledgedByEmail ? ` by ${incident.acknowledgedByEmail}` : ''}`
                                                            : incident.workflowStatus === 'RESOLVED' && incident.resolvedAt
                                                                ? `Resolved ${formatDistanceToNow(new Date(incident.resolvedAt), { addSuffix: true })}${incident.resolvedByEmail ? ` by ${incident.resolvedByEmail}` : ''}`
                                                                : 'Open incident'}
                                                    </p>
                                                    {incident.notesPreview && (
                                                        <p className="mt-2 break-words text-muted-foreground">{incident.notesPreview}</p>
                                                    )}
                                                </div>
                                                <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                    <p className="font-medium text-foreground">Network enrichment</p>
                                                    <div className="mt-1 space-y-1">
                                                        <p>
                                                            {incident.enrichment.asn || incident.enrichment.organization || incident.enrichment.isp
                                                                ? [incident.enrichment.asn, incident.enrichment.organization, incident.enrichment.isp].filter(Boolean).join(' · ')
                                                                : 'No ASN / ISP data'}
                                                        </p>
                                                        <p className="break-all">
                                                            {incident.enrichment.reverseDns.length > 0
                                                                ? incident.enrichment.reverseDns.join(', ')
                                                                : 'No reverse DNS'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">Attempts</p>
                                                <p className="mt-1">
                                                    {incident.failureCount} failures · {incident.lockCount} locks · {incident.banCount} bans
                                                </p>
                                            </div>
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">Attempted emails</p>
                                                <p className="mt-1 break-all">
                                                    {incident.attemptedEmails.length > 0 ? incident.attemptedEmails.join(', ') : 'Unknown'}
                                                </p>
                                            </div>
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">Host / path</p>
                                                <p className="mt-1 break-all">
                                                    {(incident.hosts[0] || 'unknown host')}{incident.paths[0] ? ` · ${incident.paths[0]}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {incident.workflowStatus === 'OPEN' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full"
                                                    disabled={acknowledgeMutation.isPending}
                                                    onClick={() => handleIncidentAcknowledge(incident.id)}
                                                >
                                                    <CheckCircle className="mr-2 h-4 w-4" />
                                                    Acknowledge
                                                </Button>
                                            )}
                                            {incident.workflowStatus !== 'RESOLVED' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full"
                                                    disabled={resolveMutation.isPending}
                                                    onClick={() => handleIncidentResolve(incident.id)}
                                                >
                                                    <ShieldCheck className="mr-2 h-4 w-4" />
                                                    Resolve
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={noteMutation.isPending}
                                                onClick={() => handleIncidentNote(incident.id)}
                                            >
                                                <AlertCircle className="mr-2 h-4 w-4" />
                                                Add note
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={blockMutation.isPending}
                                                onClick={() => handleBlockIp(incident.ip)}
                                            >
                                                <Lock className="mr-2 h-4 w-4" />
                                                Block IP
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={allowlistMutation.isPending}
                                                onClick={() => handleAllowlistIp(incident.ip)}
                                            >
                                                <Shield className="mr-2 h-4 w-4" />
                                                Allowlist IP
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={promoteMutation.isPending}
                                                onClick={() => handleBlockIp(incident.ip, true)}
                                            >
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                Promote permanent rule
                                            </Button>
                                            {incident.alertSuppression ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full"
                                                    disabled={unsuppressMutation.isPending}
                                                    onClick={() =>
                                                        handleUnmuteScope(
                                                            incident.alertSuppression!.scopeType,
                                                            incident.alertSuppression!.scopeValue,
                                                        )
                                                    }
                                                >
                                                    <Unlock className="mr-2 h-4 w-4" />
                                                    Unmute alerts
                                                </Button>
                                            ) : (
                                                <>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-full"
                                                        disabled={suppressMutation.isPending}
                                                        onClick={() => handleMuteScope('INCIDENT', incident.id, 'incident')}
                                                    >
                                                        <AlertTriangle className="mr-2 h-4 w-4" />
                                                        Mute incident alerts
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-full"
                                                        disabled={suppressMutation.isPending}
                                                        onClick={() => handleMuteScope('IP', incident.ip, 'IP')}
                                                    >
                                                        <AlertTriangle className="mr-2 h-4 w-4" />
                                                        Mute IP alerts
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="ops-panel">
                    <CardHeader className="px-0 pt-0">
                        <CardTitle>IP reputation</CardTitle>
                        <CardDescription>
                            Rolling risk score per IP based on recent failures, enforcement actions, and repeat-offender behavior.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        {filteredReputation.length === 0 ? (
                            <div className="ops-chart-empty py-8 text-muted-foreground">
                                {overview.ipReputation.length === 0
                                    ? 'No abusive IP reputation data yet.'
                                    : 'No IP reputation entries match the current filters.'}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {selectedIps.length > 0 && (
                                    <div className="ops-detail-card space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium">{selectedIps.length} IPs selected</p>
                                                <p className="text-sm text-muted-foreground">Run response and mute actions across all selected IPs.</p>
                                            </div>
                                            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSelectedIps([])}>
                                                Clear selection
                                            </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('BLOCK')}>
                                                <Lock className="mr-2 h-4 w-4" />
                                                Block
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('ALLOWLIST')}>
                                                <Shield className="mr-2 h-4 w-4" />
                                                Allowlist
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('PROMOTE')}>
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                Promote
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('MUTE')}>
                                                <BellOff className="mr-2 h-4 w-4" />
                                                Mute
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('UNMUTE')}>
                                                <Unlock className="mr-2 h-4 w-4" />
                                                Unmute
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('UNBAN')}>
                                                <Ban className="mr-2 h-4 w-4" />
                                                Unban
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-border/50 bg-background/60 px-4 py-3 text-sm dark:bg-white/[0.02]">
                                    <div className="flex items-center gap-3">
                                        <Checkbox
                                            checked={allVisibleIpsSelected}
                                            onCheckedChange={(checked) =>
                                                setSelectedIps(checked ? filteredReputation.map((entry) => entry.ip) : [])
                                            }
                                        />
                                        <span className="text-muted-foreground">Select all visible IPs</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{selectedIps.length} selected</span>
                                </div>
                                {filteredReputation.map((entry) => (
                                    <div key={entry.ip} className="ops-row-card space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedIps.includes(entry.ip)}
                                                    onCheckedChange={(checked) => toggleIpSelection(entry.ip, Boolean(checked))}
                                                    className="mt-1"
                                                />
                                                <div className="space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium">{entry.ip}</span>
                                                    {entry.countryCode && <Badge variant="outline">{entry.countryCode}</Badge>}
                                                    <Badge variant="outline" className={reputationLevelClasses(entry.level)}>
                                                        {entry.level}
                                                    </Badge>
                                                    {entry.currentlyBanned && <Badge variant="destructive">Banned now</Badge>}
                                                    {!entry.currentlyBanned && entry.currentlyRestricted && <Badge variant="secondary">Restricted now</Badge>}
                                                    {entry.alertSuppression && (
                                                        <Badge variant="outline">Muted for {entry.alertSuppression.remainingMinutes} min</Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground break-all">{entry.topEmail || 'Unknown email'}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-semibold">{entry.score}</p>
                                                <p className="text-xs text-muted-foreground">risk score</p>
                                            </div>
                                        </div>
                                        <Progress value={entry.score} className="h-2" />
                                        <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">Recent pressure</p>
                                                <p className="mt-1">
                                                    {entry.failures24h} in 24h · {entry.failures7d} in 7d · {entry.failures30d} in 30d
                                                </p>
                                            </div>
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">Enforcement history</p>
                                                <p className="mt-1">
                                                    {entry.bans7d} bans · {entry.locks7d} locks · {entry.incidents7d} incidents
                                                </p>
                                            </div>
                                        </div>
                                        {(entry.enrichment.reverseDns.length > 0 || entry.enrichment.asn || entry.enrichment.isp || entry.enrichment.organization) && (
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 text-xs text-muted-foreground dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">Network enrichment</p>
                                                <p className="mt-1">
                                                    {[entry.enrichment.asn, entry.enrichment.organization, entry.enrichment.isp].filter(Boolean).join(' · ') || 'No ASN / ISP data'}
                                                </p>
                                                <p className="mt-1 break-all">
                                                    {entry.enrichment.reverseDns.length > 0 ? entry.enrichment.reverseDns.join(', ') : 'No reverse DNS'}
                                                </p>
                                            </div>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            Last seen {formatDistanceToNow(new Date(entry.lastSeenAt), { addSuffix: true })}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={blockMutation.isPending}
                                                onClick={() => handleBlockIp(entry.ip)}
                                            >
                                                <Lock className="mr-2 h-4 w-4" />
                                                Block IP
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={allowlistMutation.isPending}
                                                onClick={() => handleAllowlistIp(entry.ip)}
                                            >
                                                <Shield className="mr-2 h-4 w-4" />
                                                Allowlist IP
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={promoteMutation.isPending}
                                                onClick={() => handleBlockIp(entry.ip, true)}
                                            >
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                Promote permanent rule
                                            </Button>
                                            {entry.alertSuppression ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full"
                                                    disabled={unsuppressMutation.isPending}
                                                    onClick={() => handleUnmuteScope('IP', entry.ip)}
                                                >
                                                    <Unlock className="mr-2 h-4 w-4" />
                                                    Unmute alerts
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full"
                                                    disabled={suppressMutation.isPending}
                                                    onClick={() => handleMuteScope('IP', entry.ip, 'IP')}
                                                >
                                                    <AlertTriangle className="mr-2 h-4 w-4" />
                                                    Mute IP alerts
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card className="ops-panel">
                <CardHeader className="px-0 pt-0">
                    <CardTitle>Reputation history</CardTitle>
                    <CardDescription>
                        Fourteen-day pressure trend showing failed logins, high-risk IP activity, and daily peak reputation.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 px-0 pb-0">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="ops-detail-card">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Failures (14d)</p>
                            <p className="mt-2 text-2xl font-semibold">
                                {overview.reputationHistory.reduce((total, point) => total + point.failures, 0)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">all failed admin login attempts recorded in the last 14 days</p>
                        </div>
                        <div className="ops-detail-card">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">High-risk IPs (peak day)</p>
                            <p className="mt-2 text-2xl font-semibold">
                                {Math.max(...overview.reputationHistory.map((point) => point.highRiskIps), 0)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">maximum daily count of high-risk IPs in the current window</p>
                        </div>
                        <div className="ops-detail-card">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Peak reputation</p>
                            <p className="mt-2 text-2xl font-semibold">
                                {Math.max(...overview.reputationHistory.map((point) => point.peakScore), 0)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">highest single-IP daily score inside the current 14-day window</p>
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                        <div className="ops-detail-card space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-medium">Failed logins by day</p>
                                    <p className="text-sm text-muted-foreground">Bars scale to the highest daily failure count in the last two weeks.</p>
                                </div>
                                <Badge variant="outline">
                                    Max {Math.max(...overview.reputationHistory.map((point) => point.failures), 0)}
                                </Badge>
                            </div>
                            <div className="overflow-x-auto">
                                <div className="flex min-w-[760px] items-end justify-between gap-3">
                                    {overview.reputationHistory.map((point) => (
                                        <HistoryBars
                                            key={point.date}
                                            label={point.label}
                                            value={point.failures}
                                            max={Math.max(...overview.reputationHistory.map((entry) => entry.failures), 1)}
                                            className={point.highRiskIps > 0 ? 'bg-orange-500/85' : 'bg-primary/85'}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="ops-detail-card space-y-3">
                            <p className="font-medium">Daily risk detail</p>
                            <div className="space-y-3">
                                {overview.reputationHistory.slice(-5).reverse().map((point) => (
                                    <div
                                        key={point.date}
                                        className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-3 text-sm dark:bg-white/[0.02]"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium">{point.label}</p>
                                            <Badge variant="outline">{point.peakScore}</Badge>
                                        </div>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {point.failures} failures · {point.highRiskIps} high-risk IPs · {point.uniqueIps} unique IPs
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {point.bans} bans · {point.locks} locks · {point.repeatedAlerts} repeat alerts
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={Boolean(incidentDetailId)} onOpenChange={(open) => !open && setIncidentDetailId(null)}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Incident detail</DialogTitle>
                        <DialogDescription>
                            Full workflow, audit events, and suppression context for this login-abuse incident.
                        </DialogDescription>
                    </DialogHeader>
                    {incidentDetailQuery.isLoading || !incidentDetailQuery.data ? (
                        <div className="space-y-3 py-4">
                            {[1, 2, 3].map((index) => (
                                <div key={index} className="h-20 rounded-[1rem] bg-muted/60 animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-3 dark:bg-white/[0.02]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Incident</p>
                                    <p className="mt-2 text-lg font-semibold">{incidentDetailQuery.data.incident.ip}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{incidentDetailQuery.data.incident.summary}</p>
                                </div>
                                <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-3 dark:bg-white/[0.02]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workflow</p>
                                    <p className="mt-2 text-lg font-semibold">{incidentDetailQuery.data.incident.workflowStatus}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {incidentDetailQuery.data.incident.alertSuppression
                                            ? `Muted for ${incidentDetailQuery.data.incident.alertSuppression.remainingMinutes} min`
                                            : 'Alerts active'}
                                    </p>
                                </div>
                                <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-3 dark:bg-white/[0.02]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Reputation</p>
                                    <p className="mt-2 text-lg font-semibold">{incidentDetailQuery.data.reputation?.level || 'Unknown'}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Score {incidentDetailQuery.data.reputation?.score ?? 0}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                                <div className="space-y-4">
                                    <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-4 dark:bg-white/[0.02]">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium">Notes timeline</p>
                                            <Badge variant="outline">{incidentDetailQuery.data.noteEntries.length}</Badge>
                                        </div>
                                        {incidentDetailQuery.data.noteEntries.length === 0 ? (
                                            <p className="mt-3 text-sm text-muted-foreground">No workflow notes recorded for this incident.</p>
                                        ) : (
                                            <div className="mt-3 space-y-3">
                                                {incidentDetailQuery.data.noteEntries.map((entry, index) => (
                                                    <div key={`${entry.raw}-${index}`} className="rounded-[0.9rem] border border-border/40 bg-background/70 px-3 py-3 text-sm dark:bg-white/[0.02]">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="font-medium">{entry.actorEmail || 'Unknown actor'}</span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {entry.timestamp ? formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true }) : 'unknown time'}
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{entry.body}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-4 dark:bg-white/[0.02]">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium">Restrictions and enrichment</p>
                                            <Badge variant="outline">{incidentDetailQuery.data.relatedRestrictions.length}</Badge>
                                        </div>
                                        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                                            <p>
                                                {(incidentDetailQuery.data.reputation?.enrichment.organization || incidentDetailQuery.data.reputation?.enrichment.isp || incidentDetailQuery.data.reputation?.enrichment.asn)
                                                    ? [
                                                        incidentDetailQuery.data.reputation?.enrichment.asn,
                                                        incidentDetailQuery.data.reputation?.enrichment.organization,
                                                        incidentDetailQuery.data.reputation?.enrichment.isp,
                                                    ].filter(Boolean).join(' · ')
                                                    : 'No ASN or ISP enrichment'}
                                            </p>
                                            <p className="break-all">
                                                {incidentDetailQuery.data.reputation?.enrichment.reverseDns?.length
                                                    ? incidentDetailQuery.data.reputation.enrichment.reverseDns.join(', ')
                                                    : 'No reverse DNS'}
                                            </p>
                                            {incidentDetailQuery.data.relatedRestrictions.map((restriction) => (
                                                <div key={restriction.id} className="rounded-[0.9rem] border border-border/40 bg-background/70 px-3 py-3 dark:bg-white/[0.02]">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="font-medium text-foreground">{restriction.restrictionType}</span>
                                                        <span className="text-xs">{formatDistanceToNow(new Date(restriction.expiresAt), { addSuffix: true })}</span>
                                                    </div>
                                                    <p className="mt-1 text-xs">Attempted email: {restriction.attemptedEmail || 'Unknown'}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-4 dark:bg-white/[0.02]">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-medium">Event timeline</p>
                                        <Badge variant="outline">{incidentDetailQuery.data.events.length}</Badge>
                                    </div>
                                    <div className="mt-3 space-y-3">
                                        {incidentDetailQuery.data.events.map((event) => (
                                            <div key={event.id} className="rounded-[0.9rem] border border-border/40 bg-background/70 px-3 py-3 text-sm dark:bg-white/[0.02]">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="space-y-1">
                                                        <p className="font-medium">{event.label}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline">{event.action}</Badge>
                                                </div>
                                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                                    {event.email && <p>Email: {event.email}</p>}
                                                    {event.host && <p className="break-all">Host: {event.host}</p>}
                                                    {event.path && <p className="break-all">Path: {event.path}</p>}
                                                    {event.restrictionType && <p>Restriction: {event.restrictionType}</p>}
                                                    {event.details && <p className="whitespace-pre-wrap break-all">Detail: {event.details}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIncidentDetailId(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
