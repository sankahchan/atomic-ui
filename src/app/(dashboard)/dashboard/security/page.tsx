'use client';

import { useState } from 'react';
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
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import {
    ShieldCheck, Plus, Trash2, Power, Globe, AlertTriangle,
    Lock, Unlock, CheckCircle, XCircle, AlertCircle, Server,
    RefreshCw, Shield, Clock, ExternalLink
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Dashboard Security
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="animate-pulse space-y-4">
                        <div className="h-32 bg-muted rounded" />
                        <div className="h-4 bg-muted rounded w-3/4" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!dashboardStatus) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Dashboard Security
                    </CardTitle>
                </CardHeader>
                <CardContent>
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
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Dashboard Security
                </CardTitle>
                <CardDescription>
                    Security assessment of this management panel
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        Server Certificates
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="animate-pulse space-y-3">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded" />)}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Server Certificates
                </CardTitle>
                <CardDescription>
                    TLS certificate status for managed Outline servers
                </CardDescription>
            </CardHeader>
            <CardContent>
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
                                className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
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
        <div className="grid gap-4 md:grid-cols-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Security Score</CardTitle>
                </CardHeader>
                <CardContent>
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

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Server Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                        {summary.healthyServers}/{summary.serverCount}
                    </div>
                    <p className="text-xs text-muted-foreground">servers healthy</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Certificate Warnings</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${summary.expiringCerts > 0 ? 'text-yellow-500' : ''}`}>
                        {summary.expiringCerts}
                    </div>
                    <p className="text-xs text-muted-foreground">expiring soon (&lt;14 days)</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Issues</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${(summary.expiredCerts + summary.tlsErrors + summary.connectionErrors) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {summary.expiredCerts + summary.tlsErrors + summary.connectionErrors}
                    </div>
                    <p className="text-xs text-muted-foreground">errors detected</p>
                </CardContent>
            </Card>
        </div>
    );
}

export default function SecurityPage() {
    const { toast } = useToast();
    const [createOpen, setCreateOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('status');

    const { data: rules, isLoading, refetch } = trpc.security.listRules.useQuery();

    const toggleMutation = trpc.security.toggleRule.useMutation({
        onSuccess: () => refetch(),
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    const deleteMutation = trpc.security.deleteRule.useMutation({
        onSuccess: () => {
            toast({ title: 'Rule deleted' });
            refetch();
        },
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    const triggerProbeMutation = trpc.security.triggerSecurityProbe.useMutation({
        onSuccess: () => {
            toast({ title: 'Probe triggered', description: 'Security check initiated.' });
        },
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                        Security & Access Control
                    </h1>
                    <p className="text-muted-foreground">
                        Monitor security status and manage access rules
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => triggerProbeMutation.mutate()} disabled={triggerProbeMutation.isPending}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${triggerProbeMutation.isPending ? 'animate-spin' : ''}`} />
                        Run Probe
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="status">Security Status</TabsTrigger>
                    <TabsTrigger value="rules">Access Rules</TabsTrigger>
                </TabsList>

                <TabsContent value="status" className="space-y-6 mt-6">
                    <SecuritySummaryCards />

                    <div className="grid gap-6 lg:grid-cols-2">
                        <DashboardSecurityCard />
                        <ServerSecurityCard />
                    </div>

                    <Card className="bg-blue-500/10 border-blue-500/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg text-blue-500 flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                Security Worker
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-blue-400">
                                Security probes run automatically via the security worker process.
                                See the worker setup documentation for deployment instructions.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="rules" className="space-y-6 mt-6">
                    <div className="flex justify-end">
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Rule
                        </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="bg-red-500/10 border-red-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg text-red-500 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    Warning
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-red-400">
                                    Be careful when adding blocking rules. Ensure you do not block your own IP address. Localhost is always allowed.
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Active Rules</CardTitle>
                            <CardDescription>
                                Rules are evaluated in order: Allowed Localhost - Block Rules - Allow Rules.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
                                </div>
                            ) : rules?.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No security rules defined. All traffic is allowed.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {rules?.map((rule) => (
                                        <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
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
                                                    onClick={() => toggleMutation.mutate({ id: rule.id })}
                                                    title={rule.isActive ? "Disable Rule" : "Enable Rule"}
                                                >
                                                    <Power className={`w-4 h-4 ${rule.isActive ? 'text-green-500' : 'text-muted-foreground'}`} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive"
                                                    onClick={() => {
                                                        if (confirm('Delete this rule?')) deleteMutation.mutate({ id: rule.id });
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} />
        </div>
    );
}
