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
    Eye, Star, BellOff, ListFilter, Ban, User, UserX
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { BackButton } from '@/components/ui/back-button';
import { useLocale } from '@/hooks/use-locale';

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
    const { locale } = useLocale();
    const [formData, setFormData] = useState({
        type: 'BLOCK',
        targetType: 'IP',
        targetValue: '',
        description: '',
    });

    const createMutation = trpc.security.createRule.useMutation({
        onSuccess: () => {
            toast({
                title: locale === 'my' ? 'စည်းမျဉ်းကို ဖန်တီးပြီးပါပြီ' : 'Rule created',
                description: locale === 'my' ? 'လုံခြုံရေး စည်းမျဉ်းအသစ်ကို ထည့်ပြီးပါပြီ။' : 'Security rule has been added.',
            });
            setFormData({ type: 'BLOCK', targetType: 'IP', targetValue: '', description: '' });
            onSuccess();
            onOpenChange(false);
        },
        onError: (err) =>
            toast({
                title: locale === 'my' ? 'စည်းမျဉ်းကို မဖန်တီးနိုင်ပါ' : 'Failed to create',
                description: err.message,
                variant: 'destructive',
            }),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(formData as Parameters<typeof createMutation.mutate>[0]);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{locale === 'my' ? 'လုံခြုံရေး စည်းမျဉ်း ထည့်မည်' : 'Add Security Rule'}</DialogTitle>
                    <DialogDescription>
                        {locale === 'my'
                            ? 'IP၊ CIDR သို့မဟုတ် နိုင်ငံအလိုက် dashboard ဝင်ခွင့်ကို ထိန်းချုပ်ပါ။'
                            : 'Control access to the dashboard by IP, CIDR, or Country.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{locale === 'my' ? 'လုပ်ဆောင်ချက်' : 'Action'}</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(val) => setFormData({ ...formData, type: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BLOCK">{locale === 'my' ? 'ပိတ်မည် (ငြင်းပယ်)' : 'Block (Deny)'}</SelectItem>
                                    <SelectItem value="ALLOW">{locale === 'my' ? 'ခွင့်ပြုမည် (စာရင်းဖြူ)' : 'Allow (Whitelist)'}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>{locale === 'my' ? 'ဦးတည်အမျိုးအစား' : 'Target Type'}</Label>
                            <Select
                                value={formData.targetType}
                                onValueChange={(val) => setFormData({ ...formData, targetType: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="IP">{locale === 'my' ? 'IP လိပ်စာ' : 'IP Address'}</SelectItem>
                                    <SelectItem value="CIDR">{locale === 'my' ? 'CIDR အကွာအဝေး' : 'CIDR Range'}</SelectItem>
                                    <SelectItem value="COUNTRY">{locale === 'my' ? 'နိုင်ငံကုဒ်' : 'Country Code'}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>
                            {formData.targetType === 'IP'
                                ? (locale === 'my' ? 'IP လိပ်စာ' : 'IP Address')
                                : formData.targetType === 'CIDR'
                                    ? (locale === 'my' ? 'CIDR အကွာအဝေး (ဥပမာ 10.0.0.0/24)' : 'CIDR Range (e.g. 10.0.0.0/24)')
                                    : (locale === 'my' ? 'နိုင်ငံကုဒ် (၂ လုံး ISO, ဥပမာ US, CN)' : 'Country Code (2-letter ISO, e.g. US, CN)')}
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
                        <Label>{locale === 'my' ? 'ဖော်ပြချက်' : 'Description'}</Label>
                        <Input
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder={locale === 'my' ? 'ဥပမာ - သံသယရှိ subnet ကို ပိတ်မည်' : 'e.g. Block suspicious subnet'}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{locale === 'my' ? 'မလုပ်တော့ပါ' : 'Cancel'}</Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending && (locale === 'my' ? 'ထည့်သွင်းနေသည်...' : 'Adding...')}
                            {!createMutation.isPending && (locale === 'my' ? 'စည်းမျဉ်း ထည့်မည်' : 'Add Rule')}
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
    const { locale } = useLocale();
    const isMyanmar = locale === 'my';
    const { data: dashboardStatus, isLoading } = trpc.security.getDashboardSecurityStatus.useQuery();

    if (isLoading) {
        return (
            <Card className="ops-detail-card">
                <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        {isMyanmar ? 'ဒက်ရှ်ဘုတ် လုံခြုံရေး' : 'Dashboard Security'}
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
                        {isMyanmar ? 'ဒက်ရှ်ဘုတ် လုံခြုံရေး' : 'Dashboard Security'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>{isMyanmar ? 'လုံခြုံရေး စစ်ဆေးမှု မစတင်ရသေးပါ။' : 'Security probe has not run yet.'}</p>
                        <p className="text-sm">{isMyanmar ? 'စောင့်ကြည့်မှုကို ဖွင့်ရန် လုံခြုံရေး ဝန်ဆောင်မှုကို စတင်ပါ။' : 'Start the security worker to enable monitoring.'}</p>
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
                    {isMyanmar ? 'ဒက်ရှ်ဘုတ် လုံခြုံရေး' : 'Dashboard Security'}
                </CardTitle>
                <CardDescription>
                    {isMyanmar ? 'ဤစီမံခန့်ခွဲမှု မျက်နှာပြင်၏ လုံခြုံရေးအကဲဖြတ်ချက်' : 'Security assessment of this management panel'}
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
                                {dashboardStatus.scheme?.toUpperCase() || (isMyanmar ? 'မသိ' : 'Unknown')} {isMyanmar ? 'ချိတ်ဆက်မှု' : 'connection'}
                            </span>
                            {dashboardStatus.tlsVersion && (
                                <Badge variant="outline" className="text-xs">{dashboardStatus.tlsVersion}</Badge>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <SecurityCheckItem
                                label="HSTS"
                                enabled={dashboardStatus.hasHsts}
                                description={isMyanmar ? 'HTTP Strict Transport Security ကာကွယ်မှု' : 'HTTP Strict Transport Security'}
                            />
                            <SecurityCheckItem
                                label="CSP"
                                enabled={dashboardStatus.hasCsp}
                                description={isMyanmar ? 'Content Security Policy ကာကွယ်မှု' : 'Content Security Policy'}
                            />
                            <SecurityCheckItem
                                label="Secure Cookies"
                                enabled={dashboardStatus.hasSecureCookies}
                                description={isMyanmar ? 'Secure flag ပါသော ကွတ်ကီးများ' : 'Cookies with Secure flag'}
                            />
                            <SecurityCheckItem
                                label="HttpOnly Cookies"
                                enabled={dashboardStatus.hasHttpOnlyCookies}
                                description={isMyanmar ? 'HttpOnly flag ပါသော ကွတ်ကီးများ' : 'Cookies with HttpOnly flag'}
                            />
                            <SecurityCheckItem
                                label="SameSite Cookies"
                                enabled={dashboardStatus.hasSameSiteCookies}
                                description={isMyanmar ? 'SameSite attribute ပါသော ကွတ်ကီးများ' : 'Cookies with SameSite attribute'}
                            />
                            <SecurityCheckItem
                                label="X-Frame-Options"
                                enabled={dashboardStatus.hasXFrameOptions}
                                description={isMyanmar ? 'Clickjacking ကာကွယ်မှု' : 'Clickjacking protection'}
                            />
                        </div>
                    </div>
                </div>

                {dashboardStatus.lastCheckedAt && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {isMyanmar ? 'နောက်ဆုံး စစ်ဆေးခဲ့ချိန် ' : 'Last checked '}
                        {formatRelativeTime(dashboardStatus.lastCheckedAt, isMyanmar)}
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
    const { locale } = useLocale();
    const isMyanmar = locale === 'my';
    const { data: serverProbes, isLoading } = trpc.security.getServerSecurityProbes.useQuery();

    if (isLoading) {
        return (
            <Card className="ops-detail-card">
                <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        {isMyanmar ? 'ဆာဗာ လက်မှတ်များ' : 'Server Certificates'}
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
                    {isMyanmar ? 'ဆာဗာ လက်မှတ်များ' : 'Server Certificates'}
                </CardTitle>
                <CardDescription>
                    {isMyanmar ? 'စီမံထားသော Outline ဆာဗာများအတွက် TLS certificate အခြေအနေ' : 'TLS certificate status for managed Outline servers'}
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
                {!serverProbes || serverProbes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>{isMyanmar ? 'ဆာဗာ လုံခြုံရေး probe မရှိသေးပါ။' : 'No server security probes available.'}</p>
                        <p className="text-sm">{isMyanmar ? 'ဆာဗာ certificate များကို စောင့်ကြည့်ရန် security worker ကို စတင်ပါ။' : 'Start the security worker to monitor server certificates.'}</p>
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
                                        <div className="font-medium">{probe.server?.name || (isMyanmar ? 'မသိသော ဆာဗာ' : 'Unknown Server')}</div>
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
                                                {probe.certDaysLeft < 0 ? (isMyanmar ? 'သက်တမ်းကုန်' : 'Expired') : isMyanmar ? `${probe.certDaysLeft} ရက်` : `${probe.certDaysLeft} days`}
                                            </div>
                                            <div className="text-xs text-muted-foreground">{isMyanmar ? 'သက်တမ်းကုန်ရန် ကျန်' : 'until expiry'}</div>
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
    const { locale } = useLocale();
    const isMyanmar = locale === 'my';
    const { data: summary, isLoading } = trpc.security.getSecuritySummary.useQuery();

    if (isLoading || !summary) {
        return null;
    }

    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="ops-kpi-tile">
                <CardHeader className="px-0 pb-2 pt-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'လုံခြုံရေး အမှတ်' : 'Security Score'}</CardTitle>
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
                    <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'ဆာဗာ အခြေအနေ' : 'Server Status'}</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="text-2xl font-bold">
                        {summary.healthyServers}/{summary.serverCount}
                    </div>
                    <p className="text-xs text-muted-foreground">{isMyanmar ? 'အခြေအနေကောင်းသော ဆာဗာများ' : 'servers healthy'}</p>
                </CardContent>
            </Card>

            <Card className="ops-kpi-tile">
                <CardHeader className="px-0 pb-2 pt-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'လက်မှတ် သတိပေးချက်များ' : 'Certificate Warnings'}</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className={`text-2xl font-bold ${summary.expiringCerts > 0 ? 'text-yellow-500' : ''}`}>
                        {summary.expiringCerts}
                    </div>
                    <p className="text-xs text-muted-foreground">{isMyanmar ? 'မကြာမီ သက်တမ်းကုန်မည် (&lt;14 ရက်)' : 'expiring soon (&lt;14 days)'}</p>
                </CardContent>
            </Card>

            <Card className="ops-kpi-tile">
                <CardHeader className="px-0 pb-2 pt-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'ပြဿနာများ' : 'Issues'}</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className={`text-2xl font-bold ${(summary.expiredCerts + summary.tlsErrors + summary.connectionErrors) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {summary.expiredCerts + summary.tlsErrors + summary.connectionErrors}
                    </div>
                    <p className="text-xs text-muted-foreground">{isMyanmar ? 'တွေ့ရှိထားသော အမှားများ' : 'errors detected'}</p>
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

function getIncidentSeverityLabel(severity: string, isMyanmar: boolean) {
    switch (severity) {
        case 'LOW':
            return isMyanmar ? 'နိမ့်' : 'Low';
        case 'MEDIUM':
            return isMyanmar ? 'အလယ်အလတ်' : 'Medium';
        case 'HIGH':
            return isMyanmar ? 'မြင့်' : 'High';
        case 'CRITICAL':
            return isMyanmar ? 'အရေးပေါ်' : 'Critical';
        case 'ALL':
            return isMyanmar ? 'အားလုံး' : 'All';
        default:
            return severity;
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

function getIncidentStatusLabel(status: string, isMyanmar: boolean) {
    switch (status) {
        case 'ACTIVE':
            return isMyanmar ? 'အသက်ဝင်' : 'Active';
        case 'CONTAINED':
            return isMyanmar ? 'ထိန်းထားပြီး' : 'Contained';
        case 'RESOLVED':
            return isMyanmar ? 'ဖြေရှင်းပြီး' : 'Resolved';
        case 'ALL':
            return isMyanmar ? 'အားလုံး' : 'All';
        default:
            return status;
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

function getWorkflowStatusLabel(status: string, isMyanmar: boolean) {
    switch (status) {
        case 'OPEN':
            return isMyanmar ? 'ဖွင့်ထားသည်' : 'Open';
        case 'ACKNOWLEDGED':
            return isMyanmar ? 'လက်ခံစစ်ဆေးနေသည်' : 'Acknowledged';
        case 'RESOLVED':
            return isMyanmar ? 'ဖြေရှင်းပြီး' : 'Resolved';
        case 'ALL':
            return isMyanmar ? 'အားလုံး' : 'All';
        default:
            return status;
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

function getRiskLevelLabel(level: string, isMyanmar: boolean) {
    switch (level) {
        case 'LOW':
            return isMyanmar ? 'နိမ့်' : 'Low';
        case 'ELEVATED':
            return isMyanmar ? 'မြင့်တက်' : 'Elevated';
        case 'HIGH':
            return isMyanmar ? 'မြင့်' : 'High';
        case 'CRITICAL':
            return isMyanmar ? 'အရေးပေါ်' : 'Critical';
        case 'ALL':
            return isMyanmar ? 'အားလုံး' : 'All';
        default:
            return level;
    }
}

const riskLevels = ['LOW', 'ELEVATED', 'HIGH', 'CRITICAL'] as const;
const incidentStatuses = ['ALL', 'ACTIVE', 'CONTAINED', 'RESOLVED'] as const;
const workflowStatuses = ['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
const incidentSeverities = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const INCIDENT_ASSIGNEE_UNASSIGNED_VALUE = '__UNASSIGNED__';
type IncidentFilters = {
    search: string;
    status: (typeof incidentStatuses)[number];
    workflowStatus: (typeof workflowStatuses)[number];
    severity: (typeof incidentSeverities)[number];
    country: string;
    assignee: string;
    reputation: (typeof riskLevels)[number] | 'ALL';
    timeWindowHours: number | null;
};

const defaultIncidentFilters: IncidentFilters = {
    search: '',
    status: 'ALL' as const,
    workflowStatus: 'ALL' as const,
    severity: 'ALL' as const,
    country: 'ALL',
    assignee: 'ALL',
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

    const assignee = params.get('assignee');
    if (assignee) {
        next.assignee = assignee;
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
function getAlertRuleLabels(isMyanmar: boolean): Record<string, { title: string; description: string }> {
    return {
        threshold: {
            title: isMyanmar ? 'သတ်မှတ်အရေအတွက် ရောက်ရှိသည်' : 'Threshold reached',
            description: isMyanmar ? 'ယာယီလော့ခ် မစတင်မီ ကြိုတင်သတိပေးချက်။' : 'Early warning before the soft lock policy starts firing.',
        },
        lock: {
            title: isMyanmar ? 'ယာယီလော့ခ် ချထားသည်' : 'Lock applied',
            description: isMyanmar ? 'အကြိမ်ကြိမ် ဝင်ရောက်မှု မအောင်မြင်ပြီးနောက် အက်ပ်အဆင့် ယာယီလော့ခ် ချထားသည်။' : 'Temporary app-layer lock after repeated failed logins.',
        },
        ban: {
            title: isMyanmar ? 'ပိတ်ပင်မှု ချထားသည်' : 'Ban applied',
            description: isMyanmar ? 'ပိတ်ပင်မှု သတ်မှတ်အရေအတွက် ကျော်သွားပြီးနောက် ပိုမိုပြင်းထန်သော ကန့်သတ်ချက် ချထားသည်။' : 'Harder restriction after the ban threshold is crossed.',
        },
        repeatedOffender: {
            title: isMyanmar ? 'ထပ်တလဲလဲ ကြိုးစားနေသူ' : 'Repeated offender',
            description: isMyanmar ? 'နေ့စဉ်ကာလအတွင်း ထပ်ခါတလဲလဲ ကြိုးစားနေသည့် IP အတွက် သတိပေးချက်။' : 'Longer-running noisy IP that keeps retrying over the daily window.',
        },
        unban: {
            title: isMyanmar ? 'ပိတ်ပင်မှု ဖြုတ်ထားသည်' : 'Unban',
            description: isMyanmar ? 'အက်ပ် သို့မဟုတ် fail2ban ကန့်သတ်ချက်ကို ကိုယ်တိုင် ဖြုတ်ပေးခြင်း။' : 'Manual release of an app or fail2ban restriction.',
        },
        fail2banUnavailable: {
            title: isMyanmar ? 'fail2ban မရနိုင်ပါ' : 'fail2ban unavailable',
            description: isMyanmar ? 'ဆာဗာဘက်ပိတ်ပင်မှု မရနိုင်သဖြင့် အက်ပ်အဆင့် ကာကွယ်မှုသာ ကျန်ရှိသည်။' : 'Server-side jail is unavailable and only app-level protection remains.',
        },
        newDevice: {
            title: isMyanmar ? 'စက်အသစ်မှ ဝင်ရောက်မှု' : 'New device sign-in',
            description: isMyanmar ? 'ယခင်က မတွေ့ဖူးသော စက်လက်မှတ်မှ အက်မင် ဝင်ရောက်သည့်အခါ သတိပေးမည်။' : 'Alert when an admin signs in from a device fingerprint not seen before.',
        },
        newCountry: {
            title: isMyanmar ? 'နိုင်ငံအသစ်မှ ဝင်ရောက်မှု' : 'New country sign-in',
            description: isMyanmar ? 'အကောင့်အတွက် ယခင်က မတွေ့ဖူးသော နိုင်ငံမှ အက်မင် ဝင်ရောက်သည့်အခါ သတိပေးမည်။' : 'Alert when an admin signs in from a country not seen before for that account.',
        },
    };
}

function getRuleTypeLabel(type: string, isMyanmar: boolean) {
    switch (type) {
        case 'BLOCK':
            return isMyanmar ? 'ပိတ်မည်' : 'Block';
        case 'ALLOW':
            return isMyanmar ? 'ခွင့်ပြုမည်' : 'Allow';
        default:
            return type;
    }
}

function getRuleTargetTypeLabel(targetType: string, isMyanmar: boolean) {
    switch (targetType) {
        case 'IP':
            return isMyanmar ? 'IP လိပ်စာ' : 'IP';
        case 'CIDR':
            return isMyanmar ? 'CIDR အပိုင်း' : 'CIDR';
        case 'COUNTRY':
            return isMyanmar ? 'နိုင်ငံ' : 'Country';
        default:
            return targetType;
    }
}

function getProbeResultLabel(result: string, isMyanmar: boolean) {
    switch (result) {
        case 'OK':
            return isMyanmar ? 'ပုံမှန်' : 'OK';
        case 'CERT_EXPIRING':
            return isMyanmar ? 'လက်မှတ် သက်တမ်းကုန်မီ' : 'Cert expiring';
        case 'CERT_EXPIRED':
            return isMyanmar ? 'လက်မှတ် သက်တမ်းကုန်' : 'Cert expired';
        case 'TLS_ERROR':
            return isMyanmar ? 'TLS အမှား' : 'TLS error';
        case 'CONNECTION_ERROR':
            return isMyanmar ? 'ချိတ်ဆက်မှု အမှား' : 'Connection error';
        default:
            return result.replaceAll('_', ' ');
    }
}

function getRestrictionTypeLabel(type: string, isMyanmar: boolean) {
    switch (type) {
        case 'SOFT_LOCK':
            return isMyanmar ? 'ယာယီလော့ခ်' : 'Soft lock';
        case 'BAN':
            return isMyanmar ? 'ပိတ်ပင်မှု' : 'Ban';
        case 'ALLOWLIST':
            return isMyanmar ? 'ခွင့်ပြုစာရင်း' : 'Allowlist';
        default:
            return type;
    }
}

function getSuppressionScopeLabel(scopeType: string, isMyanmar: boolean) {
    switch (scopeType) {
        case 'INCIDENT':
            return isMyanmar ? 'အဖြစ်အပျက်' : 'Incident';
        case 'IP':
            return isMyanmar ? 'IP လိပ်စာ' : 'IP';
        default:
            return scopeType;
    }
}

function formatRelativeTime(value: Date | string, isMyanmar: boolean) {
    const date = value instanceof Date ? value : new Date(value);
    if (!isMyanmar) {
        return formatDistanceToNow(date, { addSuffix: true });
    }

    const diffMs = date.getTime() - Date.now();
    const future = diffMs > 0;
    const absMs = Math.abs(diffMs);
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;

    if (absMs < minuteMs) {
        return future ? 'မကြာမီ' : 'မကြာသေးမီက';
    }

    const formatUnit = (count: number, unit: string) =>
        future ? `${count} ${unit}အတွင်း` : `${count} ${unit}ခန့်က`;

    if (absMs < hourMs) {
        return formatUnit(Math.round(absMs / minuteMs), 'မိနစ် ');
    }

    if (absMs < dayMs) {
        return formatUnit(Math.round(absMs / hourMs), 'နာရီ ');
    }

    return formatUnit(Math.round(absMs / dayMs), 'ရက် ');
}

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
    const { locale } = useLocale();
    const isMyanmar = locale === 'my';
    const { toast } = useToast();
    const { data: overview, isLoading, refetch } = trpc.security.getAdminLoginAbuseOverview.useQuery();
    const exportMutation = trpc.security.exportAdminLoginIncidents.useMutation({
        onSuccess: (result) => {
            downloadTextFile(result.content, result.filename, result.type);
            toast({
                title: isMyanmar ? 'ဖြစ်ရပ် export ဖိုင်ကို ဒေါင်းလုဒ်ပြီးပါပြီ' : 'Incident export downloaded',
                description: result.filename,
            });
        },
        onError: (error) => {
            toast({
                title: isMyanmar ? 'ဖြစ်ရပ် export မဒေါင်းလုဒ်နိုင်ပါ' : 'Failed to export incidents',
                description: error.message,
                variant: 'destructive',
            });
        },
    });
    const saveMutation = trpc.security.updateAdminLoginProtectionConfig.useMutation({
        onSuccess: async () => {
            toast({
                title: isMyanmar ? 'ဝင်ရောက်မှု ကာကွယ်ရေးကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Login protection updated',
                description: isMyanmar ? 'အက်မင်ဝင်ရောက်မှု ကာကွယ်ရေး မူဝါဒကို သိမ်းပြီးပါပြီ။' : 'The admin login abuse policy has been saved.',
            });
            await refetch();
        },
        onError: (error) => {
            toast({
                title: isMyanmar ? 'ဝင်ရောက်မှု ကာကွယ်ရေးကို မသိမ်းနိုင်ပါ' : 'Failed to save login protection',
                description: error.message,
                variant: 'destructive',
            });
        },
    });
    const unbanMutation = trpc.security.unbanAdminLoginIp.useMutation({
        onSuccess: async () => {
            toast({
                title: isMyanmar ? 'IP ကန့်သတ်ချက်ကို ဖြုတ်ပြီးပါပြီ' : 'IP restriction cleared',
                description: isMyanmar ? 'ဤ IP ကို အက်မင်ဝင်ရောက်မှု ပိတ်ပင်စာရင်းမှ ဖြုတ်လိုက်ပါပြီ။' : 'The IP has been released from the admin login ban list.',
            });
            await refetch();
        },
        onError: (error) => {
            toast({
                title: isMyanmar ? 'IP ပိတ်ပင်မှုကို မဖြုတ်နိုင်ပါ' : 'Failed to unban IP',
                description: error.message,
                variant: 'destructive',
            });
        },
    });
    const acknowledgeMutation = trpc.security.acknowledgeAdminLoginIncident.useMutation({
        onSuccess: async () => {
            toast({
                title: isMyanmar ? 'အဖြစ်အပျက်ကို လက်ခံစစ်ဆေးနေပါပြီ' : 'Incident acknowledged',
                description: isMyanmar ? 'ဤအဖြစ်အပျက်ကို ယခု စစ်ဆေးနေသည်ဟု မှတ်သားလိုက်ပါပြီ။' : 'The incident is now marked as being handled.',
            });
            await refetch();
        },
        onError: (error) => {
            toast({
                title: isMyanmar ? 'အဖြစ်အပျက်ကို မလက်ခံနိုင်ပါ' : 'Failed to acknowledge incident',
                description: error.message,
                variant: 'destructive',
            });
        },
    });
    const resolveMutation = trpc.security.resolveAdminLoginIncident.useMutation({
        onSuccess: async () => {
            toast({
                title: isMyanmar ? 'အဖြစ်အပျက်ကို ဖြေရှင်းပြီးပါပြီ' : 'Incident resolved',
                description: isMyanmar ? 'ဤအဖြစ်အပျက်ကို ဖြေရှင်းပြီးဟု မှတ်သားလိုက်ပါပြီ။' : 'The incident has been marked as resolved.',
            });
            await refetch();
        },
        onError: (error) => {
            toast({
                title: isMyanmar ? 'အဖြစ်အပျက်ကို မဖြေရှင်းနိုင်ပါ' : 'Failed to resolve incident',
                description: error.message,
                variant: 'destructive',
            });
        },
    });
    const noteMutation = trpc.security.addAdminLoginIncidentNote.useMutation({
        onSuccess: async () => {
            toast({
                title: isMyanmar ? 'မှတ်ချက်ကို ထည့်ပြီးပါပြီ' : 'Note added',
                description: isMyanmar ? 'အဖြစ်အပျက် မှတ်ချက်ကို သိမ်းပြီးပါပြီ။' : 'The incident note has been saved.',
            });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'မှတ်ချက်ကို မသိမ်းနိုင်ပါ' : 'Failed to save note', description: error.message, variant: 'destructive' });
        },
    });
    const blockMutation = trpc.security.blockAdminLoginIp.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'အမြဲတမ်း ပိတ်ဆို့ စည်းကမ်း ထည့်ပြီးပါပြီ' : 'Permanent block added', description: isMyanmar ? 'ဤ IP တွင် အမြဲတမ်း ပိတ်ဆို့ စည်းကမ်းကို အသက်ဝင်အဖြစ် ထည့်ပြီးပါပြီ။' : 'The IP now has an active permanent block rule.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'IP ကို ပိတ်ဆို့မရပါ' : 'Failed to block IP', description: error.message, variant: 'destructive' });
        },
    });
    const allowlistMutation = trpc.security.allowlistAdminLoginIp.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'IP ကို Allowlist ထဲထည့်ပြီးပါပြီ' : 'IP allowlisted', description: isMyanmar ? 'ဤ IP ကို allowlist ထဲသို့ ထည့်ပြီး အသက်ဝင်နေသော ပိတ်ပင်မှုများကို ဖယ်ရှားလိုက်ပါပြီ။' : 'The IP has been added to the allowlist and active bans were cleared.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'IP ကို Allowlist ထဲမထည့်နိုင်ပါ' : 'Failed to allowlist IP', description: error.message, variant: 'destructive' });
        },
    });
    const promoteMutation = trpc.security.promoteAdminLoginIpToPermanentRule.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'အမြဲတမ်း စည်းကမ်း ဖန်တီးပြီးပါပြီ' : 'Permanent rule created', description: isMyanmar ? 'ဤ IP ကို အမြဲတမ်း ပိတ်ဆို့ စည်းကမ်းအဖြစ် မြှင့်တင်လိုက်ပါပြီ။' : 'The IP was promoted to a permanent block rule.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'IP ကို မြှင့်တင်မရပါ' : 'Failed to promote IP', description: error.message, variant: 'destructive' });
        },
    });
    const digestMutation = trpc.security.runAdminLoginIncidentDigestNow.useMutation({
        onSuccess: (result) => {
            toast({
                title: isMyanmar ? 'ဖြစ်ရပ် အနှစ်ချုပ်ကို ပို့ပြီးပါပြီ' : 'Incident digest sent',
                description: isMyanmar ? `စီမံခန့်ခွဲသူ စကားပြောခန်း ${result.adminChats} ခုသို့ ဖြစ်ရပ် ${result.incidentCount} ခုအတွက် ပို့ပြီးပါပြီ။` : `Delivered to ${result.adminChats} admin chat(s) for ${result.incidentCount} incident(s).`,
            });
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'အနှစ်ချုပ်ကို မပို့နိုင်ပါ' : 'Failed to send digest', description: error.message, variant: 'destructive' });
        },
    });
    const saveViewMutation = trpc.security.saveAdminLoginSavedView.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'သိမ်းထားသော မြင်ကွင်းကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Saved view updated', description: isMyanmar ? 'လုံခြုံရေး မြင်ကွင်း filter များကို သိမ်းပြီးပါပြီ။' : 'The security view filters are saved.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'မြင်ကွင်းကို မသိမ်းနိုင်ပါ' : 'Failed to save view', description: error.message, variant: 'destructive' });
        },
    });
    const deleteViewMutation = trpc.security.deleteAdminLoginSavedView.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'သိမ်းထားသော မြင်ကွင်းကို ဖယ်ရှားပြီးပါပြီ' : 'Saved view removed', description: isMyanmar ? 'သိမ်းထားသော filter မြင်ကွင်းကို ဖျက်လိုက်ပါပြီ။' : 'The saved filter view has been deleted.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'မြင်ကွင်းကို ဖျက်မရပါ' : 'Failed to delete view', description: error.message, variant: 'destructive' });
        },
    });
    const suppressMutation = trpc.security.suppressAdminLoginAlerts.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'သတိပေးချက်များကို တိတ်ထားပြီးပါပြီ' : 'Alerts muted', description: isMyanmar ? 'ရွေးထားသော အကျုံးဝင်မှုအတွက် လုံခြုံရေး သတိပေးချက်များကို ယာယီ ပိတ်ထားပါပြီ။' : 'Security alerts were suppressed for the selected scope.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'သတိပေးချက်များကို တိတ်မထားနိုင်ပါ' : 'Failed to mute alerts', description: error.message, variant: 'destructive' });
        },
    });
    const unsuppressMutation = trpc.security.removeAdminLoginAlertSuppression.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'သတိပေးချက် တိတ်ထားမှုကို ဖယ်ရှားပြီးပါပြီ' : 'Alert mute removed', description: isMyanmar ? 'ရွေးထားသော အကျုံးဝင်မှုအတွက် သတိပေးချက်များကို ပြန်လည် အသက်ဝင်စေပါပြီ။' : 'Alerts are active again for the selected scope.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'တိတ်ထားမှုကို ဖယ်ရှားမရပါ' : 'Failed to remove mute', description: error.message, variant: 'destructive' });
        },
    });
    const bulkIncidentMutation = trpc.security.bulkUpdateAdminLoginIncidents.useMutation({
        onSuccess: async (result) => {
            toast({ title: isMyanmar ? 'အစုလိုက် ဖြစ်ရပ် လုပ်ဆောင်ချက် ပြီးပါပြီ' : 'Bulk incident action complete', description: isMyanmar ? `ဖြစ်ရပ် ${result.processed} ခုကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။` : `${result.processed} incidents updated.` });
            setSelectedIncidentIds([]);
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'အစုလိုက် ဖြစ်ရပ် လုပ်ဆောင်ချက် မအောင်မြင်ပါ' : 'Bulk incident action failed', description: error.message, variant: 'destructive' });
        },
    });
    const assignIncidentMutation = trpc.security.assignAdminLoginIncident.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'ဖြစ်ရပ် တာဝန်ခွဲဝေမှုကို အပ်ဒိတ်လုပ်ပြီးပါပြီ' : 'Incident assignment updated', description: isMyanmar ? 'လုပ်ဆောင်သူ တာဝန်ခွဲဝေမှုကို သိမ်းထားပါပြီ။' : 'The operator assignment has been saved.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'တာဝန်ခွဲဝေမှုကို အပ်ဒိတ်မလုပ်နိုင်ပါ' : 'Failed to update assignment', description: error.message, variant: 'destructive' });
        },
    });
    const bulkIpMutation = trpc.security.bulkUpdateAdminLoginIps.useMutation({
        onSuccess: async (result) => {
            toast({ title: isMyanmar ? 'အစုလိုက် IP လုပ်ဆောင်ချက် ပြီးပါပြီ' : 'Bulk IP action complete', description: isMyanmar ? `IP မှတ်တမ်း ${result.processed} ခုကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။` : `${result.processed} IP entries updated.` });
            setSelectedIps([]);
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'အစုလိုက် IP လုပ်ဆောင်ချက် မအောင်မြင်ပါ' : 'Bulk IP action failed', description: error.message, variant: 'destructive' });
        },
    });
    const approveLoginApprovalMutation = trpc.security.approveAdminLoginApproval.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'ဝင်ရောက်ခွင့်ကို အတည်ပြုပြီးပါပြီ' : 'Login approved', description: isMyanmar ? 'စောင့်ဆိုင်းနေသော admin ဝင်ရောက်မှုကို ယခု ပြီးစီးနိုင်ပါပြီ။' : 'The pending admin sign-in can now complete.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'ဝင်ရောက်မှုကို အတည်မပြုနိုင်ပါ' : 'Failed to approve sign-in', description: error.message, variant: 'destructive' });
        },
    });
    const rejectLoginApprovalMutation = trpc.security.rejectAdminLoginApproval.useMutation({
        onSuccess: async () => {
            toast({ title: isMyanmar ? 'ဝင်ရောက်မှုကို ပယ်ချပြီးပါပြီ' : 'Login rejected', description: isMyanmar ? 'စောင့်ဆိုင်းနေသော admin ဝင်ရောက်မှုကို ပယ်ချလိုက်ပါပြီ။' : 'The pending admin sign-in was rejected.' });
            await refetch();
        },
        onError: (error) => {
            toast({ title: isMyanmar ? 'ဝင်ရောက်မှုကို ပယ်ချမရပါ' : 'Failed to reject sign-in', description: error.message, variant: 'destructive' });
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
        unusualLoginApprovalEnabled: boolean;
        unusualLoginApprovalRequireFor: 'NEW_DEVICE' | 'NEW_COUNTRY' | 'EITHER' | 'BOTH';
        unusualLoginApprovalDurationMinutes: number;
        incidentDigestEnabled: boolean;
        incidentDigestHour: number;
        incidentDigestMinute: number;
        incidentDigestLookbackHours: number;
        alertRules: Record<
            'threshold' | 'lock' | 'ban' | 'repeatedOffender' | 'unban' | 'fail2banUnavailable' | 'newDevice' | 'newCountry',
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
        unusualLoginApprovalEnabled: false,
        unusualLoginApprovalRequireFor: 'EITHER' as 'NEW_DEVICE' | 'NEW_COUNTRY' | 'EITHER' | 'BOTH',
        unusualLoginApprovalDurationMinutes: 30,
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
            newDevice: { enabled: true, cooldownMinutes: 720, minimumReputationLevel: 'LOW' as const },
            newCountry: { enabled: true, cooldownMinutes: 1440, minimumReputationLevel: 'LOW' as const },
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
            unusualLoginApprovalEnabled: overview.config.unusualLoginApprovalEnabled,
            unusualLoginApprovalRequireFor: overview.config.unusualLoginApprovalRequireFor,
            unusualLoginApprovalDurationMinutes: overview.config.unusualLoginApprovalDurationMinutes,
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
        setOrDelete('assignee', incidentFilters.assignee === 'ALL' ? null : incidentFilters.assignee);
        setOrDelete('reputation', incidentFilters.reputation);
        setOrDelete('hours', incidentFilters.timeWindowHours === null ? 'all' : String(incidentFilters.timeWindowHours));
        setOrDelete('view', activeSavedViewId === 'all' ? null : activeSavedViewId);

        window.history.replaceState({}, '', url.toString());
    }, [activeSavedViewId, filtersBootstrapped, incidentFilters]);

    const activeIncidentCount = overview?.securityIncidents.filter((incident) => incident.status === 'ACTIVE').length ?? 0;
    const highRiskIpCount =
        overview?.ipReputation.filter((entry) => entry.level === 'HIGH' || entry.level === 'CRITICAL').length ?? 0;
    const newDeviceCount = overview?.summary.newDeviceLoginsLastDay ?? 0;
    const newCountryCount = overview?.summary.newCountryLoginsLastDay ?? 0;
    const pendingApprovalCount = overview?.summary.pendingApprovals ?? 0;
    const recentAdminLogins = useMemo(
        () => (overview?.recentAdminLogins ?? []).filter(Boolean),
        [overview?.recentAdminLogins],
    );
    const currentOperatorEmail = overview?.currentOperatorEmail?.trim().toLowerCase() || '';

    const requestNote = (title: string) => {
        const value = window.prompt(title, '');
        if (value == null) {
            return null;
        }

        return value.trim();
    };

    const handleIncidentAcknowledge = (incidentId: string) => {
        const note = requestNote(isMyanmar ? 'အဖြစ်အပျက် မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional incident note');
        if (note === null) return;
        acknowledgeMutation.mutate({ incidentId, note: note || undefined });
    };

    const handleIncidentResolve = (incidentId: string) => {
        const note = requestNote(isMyanmar ? 'ဖြေရှင်းမှု မှတ်ချက်' : 'Resolution note');
        if (note === null) return;
        resolveMutation.mutate({ incidentId, note: note || undefined });
    };

    const handleIncidentNote = (incidentId: string) => {
        const note = requestNote(isMyanmar ? 'အဖြစ်အပျက် မှတ်ချက် ထည့်ပါ' : 'Add an incident note');
        if (!note) return;
        noteMutation.mutate({ incidentId, note });
    };

    const requestAssignee = () => {
        const value = window.prompt(
            isMyanmar ? 'ဤအဖြစ်အပျက်ကို မည်သည့် အက်မင်အီးမေးလ်ထံ တာဝန်ပေးမည်နည်း။' : 'Assign incident to which admin email?',
            currentOperatorEmail || '',
        );
        if (value == null) {
            return null;
        }

        const normalized = value.trim().toLowerCase();
        if (!normalized) {
            toast({
                title: isMyanmar ? 'တာဝန်ပေးရန် လိုအပ်ပါသည်' : 'Assignment required',
                description: isMyanmar ? 'ဤအဖြစ်အပျက်ကို တာဝန်ပေးရန် အက်မင်အီးမေးလ်တစ်ခု ထည့်ပါ။' : 'Enter an admin email to assign the incident.',
                variant: 'destructive',
            });
            return null;
        }

        return normalized;
    };

    const handleAssignIncident = (incidentId: string, assignedToEmail?: string | null) => {
        const note = requestNote(
            assignedToEmail
                ? (isMyanmar ? 'တာဝန်ပေးမှု မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional assignment note')
                : (isMyanmar ? 'တာဝန်ဖြုတ်မှု မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional unassign note'),
        );
        if (note === null) return;

        assignIncidentMutation.mutate({
            incidentId,
            assignedToEmail: assignedToEmail ?? null,
            note: note || undefined,
        });
    };

    const handleBlockIp = (ip: string, promote = false) => {
        const note = requestNote(
            promote
                ? (isMyanmar ? 'မြှင့်တင်မှု မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional promotion note')
                : (isMyanmar ? 'ပိတ်ဆို့မှု မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional block note'),
        );
        if (note === null) return;
        if (promote) {
            promoteMutation.mutate({ ip, note: note || undefined });
            return;
        }

        blockMutation.mutate({ ip, note: note || undefined });
    };

    const handleAllowlistIp = (ip: string) => {
        const note = requestNote(isMyanmar ? 'ခွင့်ပြုစာရင်း မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional allowlist note');
        if (note === null) return;
        allowlistMutation.mutate({ ip, note: note || undefined });
    };

    const handleApproveLoginApproval = (approvalId: string) => {
        approveLoginApprovalMutation.mutate({ approvalId });
    };

    const handleRejectLoginApproval = (approvalId: string) => {
        const note = requestNote(isMyanmar ? 'ပယ်ချရသည့် အကြောင်း (မဖြစ်မနေမဟုတ်)' : 'Optional rejection reason');
        if (note === null) return;
        rejectLoginApprovalMutation.mutate({ approvalId, note: note || undefined });
    };

    const handleSaveCurrentView = () => {
        if (!overview) {
            return;
        }
        const name = window.prompt(isMyanmar ? 'သိမ်းထားမည့် မြင်ကွင်း အမည်' : 'Saved view name', activeSavedViewId !== 'all'
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
        if (!window.confirm(isMyanmar ? 'ဤသိမ်းထားသော မြင်ကွင်းကို ဖျက်မည်လား။' : 'Delete this saved view?')) {
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
            toast({
                title: isMyanmar ? 'မူလ မြင်ကွင်းကို ဖြုတ်ပြီးပါပြီ' : 'Default view cleared',
                description: isMyanmar ? 'Security စာမျက်နှာကို မူလ စစ်ထုတ်မှုများဖြင့် ဖွင့်ပါမည်။' : 'The security page will open with standard filters.',
            });
            return;
        }
        window.localStorage.setItem(SECURITY_DEFAULT_SAVED_VIEW_STORAGE_KEY, viewId);
        setDefaultSavedViewId(viewId);
        toast({
            title: isMyanmar ? 'မူလ မြင်ကွင်းကို သိမ်းပြီးပါပြီ' : 'Default view saved',
            description: isMyanmar ? 'Security စာမျက်နှာ ဖွင့်သည့်အခါ ဤမြင်ကွင်းကို အလိုအလျောက် အသုံးပြုမည်။' : 'This view will be applied when the security page opens.',
        });
    };

    const requestSuppressionInput = (title: string) => {
        const hours = window.prompt(title, '24');
        if (hours == null) {
            return null;
        }
        const parsed = Number(hours);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toast({
                title: isMyanmar ? 'ကြာချိန် မမှန်ကန်ပါ' : 'Invalid duration',
                description: isMyanmar ? 'သုညထက်ကြီးသော နာရီအရေအတွက်ကို ထည့်ပါ။' : 'Enter a positive number of hours.',
                variant: 'destructive',
            });
            return null;
        }
        const reason = window.prompt(isMyanmar ? 'အသိပေးချက် တိတ်ထားရသည့် အကြောင်း (မဖြစ်မနေမဟုတ်)' : 'Optional mute reason', '') ?? '';
        return {
            durationMinutes: Math.round(parsed * 60),
            reason: reason.trim() || undefined,
        };
    };

    const handleMuteScope = (scopeType: 'IP' | 'INCIDENT', scopeValue: string, label: string) => {
        const payload = requestSuppressionInput(
            isMyanmar ? `${label} အသိပေးချက်များကို ဘယ်နှနာရီကြာ တိတ်ထားမည်နည်း။` : `Mute ${label} alerts for how many hours?`,
        );
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
        action: 'ACKNOWLEDGE' | 'RESOLVE' | 'MUTE' | 'UNMUTE' | 'ASSIGN' | 'UNASSIGN',
    ) => {
        if (selectedIncidentIds.length === 0) {
            return;
        }
        const note =
            action === 'MUTE' || action === 'ASSIGN' || action === 'UNASSIGN'
                ? undefined
                : requestNote(
                    action === 'ACKNOWLEDGE'
                        ? (isMyanmar ? 'အစုလိုက် လက်ခံစစ်ဆေးမှု မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional note for bulk acknowledge')
                        : (isMyanmar ? 'အစုလိုက် ဖြေရှင်းမှု မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional note for bulk resolve'),
                );
        if (note === null) {
            return;
        }
        const suppression =
            action === 'MUTE'
                ? requestSuppressionInput(isMyanmar ? 'ရွေးထားသော အဖြစ်အပျက် အသိပေးချက်များကို ဘယ်နှနာရီကြာ တိတ်ထားမည်နည်း။' : 'Mute selected incident alerts for how many hours?')
                : null;
        if (action === 'MUTE' && !suppression) {
            return;
        }
        const assignedToEmail = action === 'ASSIGN' ? requestAssignee() : undefined;
        if (action === 'ASSIGN' && !assignedToEmail) {
            return;
        }

        bulkIncidentMutation.mutate({
            incidentIds: selectedIncidentIds,
            action,
            note: note || undefined,
            durationMinutes: suppression?.durationMinutes,
            assignedToEmail: assignedToEmail || undefined,
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
                        ? (isMyanmar ? 'အစုလိုက် ပိတ်ဆို့မှု မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional note for bulk block')
                        : action === 'ALLOWLIST'
                            ? (isMyanmar ? 'အစုလိုက် ခွင့်ပြုစာရင်း မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional note for bulk allowlist')
                            : (isMyanmar ? 'အစုလိုက် မြှင့်တင်မှု မှတ်ချက် (မဖြစ်မနေမဟုတ်)' : 'Optional note for bulk promote'),
                );
        if (note === null) {
            return;
        }
        const suppression =
            action === 'MUTE'
                ? requestSuppressionInput(isMyanmar ? 'ရွေးထားသော IP အသိပေးချက်များကို ဘယ်နှနာရီကြာ တိတ်ထားမည်နည်း။' : 'Mute selected IP alerts for how many hours?')
                : null;
        if (action === 'MUTE' && !suppression) {
            return;
        }
        if (action === 'UNBAN' && !window.confirm(isMyanmar ? `IP ${selectedIps.length} ခု၏ ပိတ်ပင်မှုကို ဖြုတ်မည်လား။` : `Unban ${selectedIps.length} IPs?`)) {
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
            if (incidentFilters.assignee !== 'ALL') {
                if (incidentFilters.assignee === INCIDENT_ASSIGNEE_UNASSIGNED_VALUE) {
                    if (incident.assignedToEmail) {
                        return false;
                    }
                } else if ((incident.assignedToEmail || '').toLowerCase() !== incidentFilters.assignee.toLowerCase()) {
                    return false;
                }
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
                incident.assignedToEmail || '',
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
            if (
                incidentFilters.status !== 'ALL' ||
                incidentFilters.workflowStatus !== 'ALL' ||
                incidentFilters.severity !== 'ALL' ||
                incidentFilters.assignee !== 'ALL'
            ) {
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
    const availableAssignees = useMemo(() => {
        if (!overview) {
            return [] as string[];
        }
        const values = new Set<string>();
        for (const incident of overview.securityIncidents) {
            if (incident.assignedToEmail) {
                values.add(incident.assignedToEmail);
            }
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
                    <CardTitle>{isMyanmar ? 'Admin login အလွဲသုံးစား ကာကွယ်မှု' : 'Admin login abuse protection'}</CardTitle>
                    <CardDescription>
                        {isMyanmar
                            ? 'လက်ရှိ သတ်မှတ်ကန့်သတ်ချက်များ၊ ယုံကြည်ရသော IP များနှင့် မကြာသေးမီ login မအောင်မြင်မှုများကို တင်နေသည်။'
                            : 'Loading current thresholds, trusted IPs, and recent failed login activity.'}
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
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး ၁ နာရီ' : 'Failed last hour'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className="text-2xl font-bold">{overview.summary.failuresLastHour}</div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'admin login မအောင်မြင်မှုများ' : 'failed admin login attempts'}</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး ၂၄ နာရီ' : 'Failed last 24h'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className="text-2xl font-bold">{overview.summary.failuresLastDay}</div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'မကြာသေးမီ login မအောင်မြင်မှုများ' : 'recent login failures'}</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'အသက်ဝင်ကန့်သတ်မှုများ' : 'Active restrictions'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className="text-2xl font-bold">{overview.summary.activeRestrictions}</div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'လက်ရှိ lock သို့မဟုတ် ban ထားသော IP များ' : 'IPs currently locked or banned'}</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'အသက်ဝင် ban များ' : 'Active bans'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${overview.summary.activeBans > 0 ? 'text-red-500' : ''}`}>
                            {overview.summary.activeBans}
                        </div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'ပြင်းထန်သော ပိတ်ဆို့မှုများ လက်ရှိအသက်ဝင်နေသည်' : 'harder blocks now in effect'}</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'fail2ban ကာကွယ်ရေးအုပ်စု' : 'fail2ban jail'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${overview.fail2banStatus.available ? '' : 'text-yellow-500'}`}>
                            {overview.fail2banStatus.available ? overview.fail2banStatus.currentlyBanned : 'N/A'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {overview.fail2banStatus.available
                                ? isMyanmar
                                    ? `${overview.fail2banStatus.jail} တွင် လက်ရှိ ban ထားသည်`
                                    : `${overview.fail2banStatus.jail} currently banned`
                                : isMyanmar
                                    ? 'fail2ban အခြေအနေ မရနိုင်ပါ'
                                    : 'fail2ban status unavailable'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'အသက်ဝင် ဖြစ်ရပ်များ' : 'Active incidents'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${activeIncidentCount > 0 ? 'text-orange-500' : ''}`}>
                            {activeIncidentCount}
                        </div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'ဆက်လက်စောင့်ကြည့်သင့်သည့် အလွဲသုံးစား လှိုင်းများ' : 'ongoing abuse bursts still worth watching'}</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'အန္တရာယ်မြင့် IP များ' : 'High-risk IPs'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${highRiskIpCount > 0 ? 'text-red-500' : ''}`}>
                            {highRiskIpCount}
                        </div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'reputation score ၅၀ နှင့်အထက်ရှိသော IP များ' : 'reputation score 50 or higher'}</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'စက်အသစ်များ (၂၄ နာရီ)' : 'New devices (24h)'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${newDeviceCount > 0 ? 'text-sky-500' : ''}`}>
                            {newDeviceCount}
                        </div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'မသိသေးသော စက်များမှ admin ဝင်ရောက်မှုများ' : 'admin sign-ins from unfamiliar devices'}</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'နိုင်ငံအသစ်များ (၂၄ နာရီ)' : 'New countries (24h)'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${newCountryCount > 0 ? 'text-violet-500' : ''}`}>
                            {newCountryCount}
                        </div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'နိုင်ငံအသစ်များမှ admin ဝင်ရောက်မှုများ' : 'admin sign-ins from new geographies'}</p>
                    </CardContent>
                </Card>
                <Card className="ops-kpi-tile">
                    <CardHeader className="px-0 pb-2 pt-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{isMyanmar ? 'စောင့်ဆိုင်းနေသော အတည်ပြုမှုများ' : 'Pending approvals'}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <div className={`text-2xl font-bold ${pendingApprovalCount > 0 ? 'text-amber-500' : ''}`}>
                            {pendingApprovalCount}
                        </div>
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'ပုံမှန်မဟုတ်သော admin ဝင်ရောက်မှုများကို စစ်ဆေးရန် စောင့်နေသည်' : 'unusual admin sign-ins waiting for review'}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="ops-panel">
                <CardHeader className="px-0 pt-0">
                    <CardTitle>{isMyanmar ? 'ကာကွယ်ရေး မူဝါဒ' : 'Policy'}</CardTitle>
                    <CardDescription>
                        {isMyanmar
                            ? 'admin ဝင်ရောက်မှု မအောင်မြင်ခြင်းများ ထပ်ခါတလဲလဲ ဖြစ်လာပါက အလိုအလျောက် lock နှင့် ban သတ်မှတ်ချက်များကို ဤနေရာတွင် စီမံပါ။ Telegram အသိပေးချက်များသည် သတ်မှတ်ထားသော admin chat ID များကို အသုံးပြုပါသည်။'
                            : 'Automatic lock and ban thresholds for repeated failed admin logins. Telegram alerts use the configured admin chat IDs.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 px-0 pb-0">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="ops-detail-card flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">{isMyanmar ? 'login abuse protection ကို ဖွင့်မည်' : 'Enable login abuse protection'}</p>
                                <p className="text-sm text-muted-foreground">{isMyanmar ? 'ဝင်ရောက်မှု မအောင်မြင်ခြင်းများ ထပ်ခါတလဲလဲ ဖြစ်လာပါက ယာယီ lock နှင့် ban များ ဖန်တီးပါ။' : 'Create temporary locks and bans from repeated failed logins.'}</p>
                            </div>
                            <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">{isMyanmar ? 'Telegram admin အသိပေးချက်များ' : 'Telegram admin alerts'}</p>
                                <p className="text-sm text-muted-foreground">{isMyanmar ? 'ကြိုးစားခဲ့သော email နှင့် source IP ကို သတ်မှတ်ထားသော Telegram admin chat များသို့ ပို့ပါ။' : 'Send the source IP and attempted email to the configured Telegram admin chats.'}</p>
                            </div>
                            <Switch checked={form.telegramAlertEnabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, telegramAlertEnabled: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">{isMyanmar ? 'ထပ်ခါတလဲလဲ ပြုလုပ်သူများကို သတိပေးမည်' : 'Alert on repeated offenders'}</p>
                                <p className="text-sm text-muted-foreground">{isMyanmar ? 'တစ်နေ့တာအတွင်း တူညီသော IP မှ login မအောင်မြင်မှုများ ဆက်တိုက်ဖြစ်လျှင် Telegram အသိပေးချက် ထပ်မံပို့ပါ။' : 'Send an extra Telegram alert when the same IP keeps failing logins over a full-day window.'}</p>
                            </div>
                            <Switch checked={form.alertOnRepeatedOffender} onCheckedChange={(checked) => setForm((current) => ({ ...current, alertOnRepeatedOffender: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">{isMyanmar ? 'ပိတ်ပင်မှု ဖြုတ်သည့်အခါ အသိပေးမည်' : 'Alert on unban'}</p>
                                <p className="text-sm text-muted-foreground">{isMyanmar ? 'panel မှ ban သို့မဟုတ် lock ကို manual ဖြုတ်လိုက်သည့်အခါ Telegram admin များကို အသိပေးပါ။' : 'Notify Telegram admins when a ban or lock is manually cleared from the panel.'}</p>
                            </div>
                            <Switch checked={form.alertOnUnban} onCheckedChange={(checked) => setForm((current) => ({ ...current, alertOnUnban: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4 md:col-span-2">
                            <div>
                                <p className="font-medium">{isMyanmar ? 'fail2ban auth log ရေးမည်' : 'Write fail2ban auth log'}</p>
                                <p className="text-sm text-muted-foreground">{isMyanmar ? 'မအောင်မြင်သော admin login များကို fail2ban ဖိုင်ထဲသို့ mirror လုပ်ပေးပြီး ဆာဗာဘက်မှ IP ကို hard-ban ပြုလုပ်နိုင်စေပါသည်။' : 'Mirror failed admin logins to the dedicated fail2ban file so the server can hard-ban the IP too.'}</p>
                            </div>
                            <Switch checked={form.fail2banLogEnabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, fail2banLogEnabled: checked }))} />
                        </div>
                        <div className="ops-detail-card flex items-center justify-between gap-4 md:col-span-2">
                            <div>
                                <p className="font-medium">{isMyanmar ? 'ပုံမှန်မဟုတ်သော admin ဝင်ရောက်မှုကို အတည်ပြုချက်လိုအပ်မည်' : 'Require approval for unusual admin sign-ins'}</p>
                                <p className="text-sm text-muted-foreground">{isMyanmar ? 'စက်အသစ် သို့မဟုတ် နိုင်ငံအသစ်မှ admin login များကို အခြား admin တစ်ဦး အတည်ပြုမချင်း စောင့်ထားပါ။' : 'Hold new device or new country admin logins until another admin approves them.'}</p>
                            </div>
                            <Switch
                                checked={form.unusualLoginApprovalEnabled}
                                onCheckedChange={(checked) => setForm((current) => ({ ...current, unusualLoginApprovalEnabled: checked }))}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'ယာယီ lock စတင်မည့် အကြိမ်အရေအတွက်' : 'Soft lock threshold'}</Label>
                            <Input type="number" min={1} value={form.softLockThreshold} onChange={(event) => setForm((current) => ({ ...current, softLockThreshold: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">{isMyanmar ? 'စကားဝှက်မှားယွင်းမှု အကြိမ်အရေအတွက် သတ်မှတ်ချက်ပြည့်လျှင် ယာယီ app lock စတင်မည်။' : 'Wrong-password attempts before a temporary app lock starts.'}</p>
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'ယာယီ lock ကြည့်ကာလ (မိနစ်)' : 'Soft lock window (minutes)'}</Label>
                            <Input type="number" min={1} value={form.softLockWindowMinutes} onChange={(event) => setForm((current) => ({ ...current, softLockWindowMinutes: Number(event.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'ယာယီ lock ကြာချိန် (မိနစ်)' : 'Soft lock duration (minutes)'}</Label>
                            <Input type="number" min={1} value={form.softLockDurationMinutes} onChange={(event) => setForm((current) => ({ ...current, softLockDurationMinutes: Number(event.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'ban စတင်မည့် အကြိမ်အရေအတွက်' : 'Ban threshold'}</Label>
                            <Input type="number" min={1} value={form.banThreshold} onChange={(event) => setForm((current) => ({ ...current, banThreshold: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">{isMyanmar ? 'ဤအရေအတွက် ပြည့်လျှင် app မှ IP ကို အပြည့်အဝပိတ်မည်ဖြစ်ပြီး fail2ban အတွက်လည်း log ရေးမည်။' : 'When reached, the IP is fully denied by the app and also logged for fail2ban.'}</p>
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'ban ကြည့်ကာလ (မိနစ်)' : 'Ban window (minutes)'}</Label>
                            <Input type="number" min={1} value={form.banWindowMinutes} onChange={(event) => setForm((current) => ({ ...current, banWindowMinutes: Number(event.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'ban ကြာချိန် (မိနစ်)' : 'Ban duration (minutes)'}</Label>
                            <Input type="number" min={1} value={form.banDurationMinutes} onChange={(event) => setForm((current) => ({ ...current, banDurationMinutes: Number(event.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2 md:col-span-3">
                            <Label>{isMyanmar ? 'ထပ်ခါတလဲလဲ ကျူးလွန်သူ သတ်မှတ်ချက် (၂၄ နာရီ)' : 'Repeated offender threshold (24h)'}</Label>
                            <Input type="number" min={1} value={form.repeatedOffenderThreshold} onChange={(event) => setForm((current) => ({ ...current, repeatedOffenderThreshold: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး ၂၄ နာရီအတွင်း တူညီသော IP မှ admin login မအောင်မြင်မှု အရေအတွက် ဤတန်ဖိုးရောက်လျှင် Telegram အသိပေးချက် ထပ်ပို့ပါမည်။' : 'Telegram sends an extra offender alert when the same IP reaches this many failed admin logins in the last 24 hours.'}</p>
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'ထပ်ခါတလဲလဲ ban ကြည့်ကာလ (ရက်)' : 'Repeat-ban lookback (days)'}</Label>
                            <Input type="number" min={1} value={form.repeatedBanLookbackDays} onChange={(event) => setForm((current) => ({ ...current, repeatedBanLookbackDays: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">{isMyanmar ? 'ဤကာလအတွင်း တူညီသော IP ကို ထပ်မံ ban လုပ်ရပါက ban ကြာချိန်ကို တိုးမြှင့်မည်။' : 'If the same IP is banned again inside this window, the ban duration escalates.'}</p>
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'တိုးမြှင့်ထားသော ban ကြာချိန် (မိနစ်)' : 'Escalated ban duration (minutes)'}</Label>
                            <Input type="number" min={1} value={form.repeatedBanDurationMinutes} onChange={(event) => setForm((current) => ({ ...current, repeatedBanDurationMinutes: Number(event.target.value) || 1 }))} />
                            <p className="text-xs text-muted-foreground">{isMyanmar ? 'production မူလတန်ဖိုးမှာ ၂၈၈၀ မိနစ် (၄၈ နာရီ) ဖြစ်သည်။' : 'Default production value is 2880 minutes (48 hours).'}</p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'အန္တရာယ်ရှိ IP များအတွက် challenge mode' : 'Challenge mode for risky IPs'}</Label>
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
                                    <SelectItem value="OFF">{isMyanmar ? 'ပိတ်ထားသည်' : 'Off'}</SelectItem>
                                    <SelectItem value="REQUIRE_2FA">{isMyanmar ? 'အကောင့်က ထောက်ပံ့လျှင် 2FA တောင်းမည်' : 'Require 2FA if the account supports it'}</SelectItem>
                                    <SelectItem value="BLOCK">{isMyanmar ? 'စကားဝှက်စစ်ပြီးနောက် အန္တရာယ်ရှိ IP များကို ပိတ်မည်' : 'Block risky IPs after password verification'}</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {isMyanmar ? 'စကားဝှက်အဆင့်ပြီးနောက် risk reputation အပေါ်မူတည်၍ အတားအဆီး ထပ်တိုးပါ။' : 'Use risk reputation to add an extra hurdle after the password step.'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'challenge စတင်မည့် reputation အနိမ့်ဆုံး' : 'Challenge minimum reputation'}</Label>
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
                                {isMyanmar ? 'ဤ reputation အဆင့် သို့မဟုတ် ထိုထက်မြင့်သော IP များသာ challenge mode ကို ဖြစ်စေမည်။' : 'Only IPs at or above this reputation level will trigger the challenge mode.'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'အတည်ပြုချက် စတင်မည့် အခြေအနေ' : 'Approval trigger'}</Label>
                            <Select
                                value={form.unusualLoginApprovalRequireFor}
                                onValueChange={(value) =>
                                    setForm((current) => ({
                                        ...current,
                                        unusualLoginApprovalRequireFor: value as 'NEW_DEVICE' | 'NEW_COUNTRY' | 'EITHER' | 'BOTH',
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="NEW_DEVICE">{isMyanmar ? 'စက်အသစ်သာ' : 'New device only'}</SelectItem>
                                    <SelectItem value="NEW_COUNTRY">{isMyanmar ? 'နိုင်ငံအသစ်သာ' : 'New country only'}</SelectItem>
                                    <SelectItem value="EITHER">{isMyanmar ? 'စက်အသစ် သို့မဟုတ် နိုင်ငံအသစ်' : 'New device or new country'}</SelectItem>
                                    <SelectItem value="BOTH">{isMyanmar ? 'အချက်ပြနှစ်ခုလုံး လိုအပ်' : 'Require both signals'}</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {isMyanmar ? 'မည်သည့် ပုံမှန်မဟုတ်သော ဝင်ရောက်မှုပုံစံတွင် manual admin အတည်ပြုချက်လိုအပ်မည်ကို ရွေးပါ။' : 'Choose which unusual sign-in pattern should require a manual admin approval.'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>{isMyanmar ? 'အတည်ပြုရန် စောင့်နိုင်သော ကာလ (မိနစ်)' : 'Approval window (minutes)'}</Label>
                            <Input
                                type="number"
                                min={5}
                                max={1440}
                                value={form.unusualLoginApprovalDurationMinutes}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        unusualLoginApprovalDurationMinutes: Math.min(1440, Math.max(5, Number(event.target.value) || 5)),
                                    }))
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                {isMyanmar ? 'ပုံမှန်မဟုတ်သော ဝင်ရောက်မှုတစ်ခုသည် pending queue တွင် သက်တမ်းမကုန်မီ ဘယ်လောက်ကြာ စောင့်နိုင်မည်ကို သတ်မှတ်ပါ။' : 'How long an unusual sign-in can wait in the pending queue before it expires.'}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <Label>{isMyanmar ? 'Telegram အသိပေးချက် စည်းမျဉ်းများ' : 'Telegram alert rules'}</Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {isMyanmar ? 'မည်သည့် လုံခြုံရေးဖြစ်ရပ်များကို Telegram သို့ ပို့မည်နှင့် အသိပေးချက် အကြိမ်ရေကို ဤနေရာတွင် ချိန်ညှိပါ။' : 'Fine-tune which security events send Telegram alerts and how noisy they’re allowed to be.'}
                            </p>
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                            {Object.entries(form.alertRules).map(([eventKey, rule]) => {
                                const meta = getAlertRuleLabels(isMyanmar)[eventKey] || { title: eventKey, description: eventKey };
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
                                                <Label>{isMyanmar ? 'အအေးချိန်ကာလ (မိနစ်)' : 'Cooldown (minutes)'}</Label>
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
                                                <Label>{isMyanmar ? 'ယုံကြည်ရမှု အနိမ့်ဆုံး' : 'Minimum reputation'}</Label>
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
                                    <p className="font-medium">{isMyanmar ? 'နေ့စဉ် ဖြစ်ရပ်အနှစ်ချုပ်' : 'Daily incident digest'}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {isMyanmar ? 'လက်ရှိ ဖြစ်ရပ်များနှင့် အန္တရာယ်မြင့် IP များ ပါဝင်သော နေ့စဉ်လုံခြုံရေးအနှစ်ချုပ်ကို Telegram စီမံခန့်ခွဲသူ စကားပြောခန်းများသို့ ပို့ပါ။' : 'Send a daily security summary to Telegram admin chats with current incidents and high-risk IPs.'}
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
                                    <Label>{isMyanmar ? 'အနှစ်ချုပ်ပို့မည့် နာရီ' : 'Digest hour'}</Label>
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
                                    <Label>{isMyanmar ? 'အနှစ်ချုပ်ပို့မည့် မိနစ်' : 'Digest minute'}</Label>
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
                                    <Label>{isMyanmar ? 'ပြန်ကြည့်မည့် နာရီအရေအတွက်' : 'Lookback hours'}</Label>
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
                                <p className="font-medium">{isMyanmar ? 'ချက်ချင်း အနှစ်ချုပ်' : 'Instant digest'}</p>
                                <p className="text-sm text-muted-foreground">
                                    {isMyanmar ? 'အချိန်ဇယားအနှစ်ချုပ်ကို မစောင့်ဘဲ လက်ရှိလုံခြုံရေးဖြစ်ရပ် အနှစ်ချုပ်ကို Telegram သို့ ချက်ချင်းပို့ပါ။' : 'Push the current security incident summary to Telegram immediately without waiting for the scheduled digest.'}
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
                                {isMyanmar ? 'လုံခြုံရေး အနှစ်ချုပ်ကို ယခုပို့မည်' : 'Send security digest now'}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{isMyanmar ? 'ယုံကြည်ရသော IP သို့မဟုတ် CIDR များ' : 'Trusted IPs or CIDRs'}</Label>
                        <Textarea
                            value={form.trustedIpRanges}
                            onChange={(event) => setForm((current) => ({ ...current, trustedIpRanges: event.target.value }))}
                            placeholder={'203.0.113.10\n198.51.100.0/24'}
                            className="min-h-[110px]"
                        />
                        <p className="text-xs text-muted-foreground">{isMyanmar ? 'ဤလိပ်စာများကို auto login ban မှ ချန်လှပ်ထားပါသည်။ တစ်ကြောင်းလျှင် IP တစ်ခု သို့မဟုတ် CIDR တစ်ခုစီ ထည့်ပါ။' : 'These addresses are exempt from automatic login bans. Use one IP or CIDR per line.'}</p>
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
                            {saveMutation.isPending ? (isMyanmar ? 'သိမ်းနေသည်…' : 'Saving…') : (isMyanmar ? 'ကာကွယ်ရေး မူဝါဒကို သိမ်းမည်' : 'Save protection policy')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-6">
                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>{isMyanmar ? 'စောင့်ဆိုင်းနေသော ပုံမှန်မဟုတ်သည့် ဝင်ရောက်မှုများ' : 'Pending unusual sign-ins'}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? 'စက်အသစ် သို့မဟုတ် နိုင်ငံအသစ်မှ admin login များကို အခြား admin တစ်ဦး အတည်ပြုမချင်း ဤနေရာတွင် စောင့်ထားမည်။' : 'Admin logins from new devices or countries can wait here until another admin approves them.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {overview.pendingApprovals.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">{isMyanmar ? 'စောင့်ဆိုင်းနေသော admin ဝင်ရောက်မှုများ မရှိပါ။' : 'No admin sign-ins are waiting for approval.'}</div>
                            ) : (
                                <div className="space-y-3">
                                    {overview.pendingApprovals.map((approval) => (
                                        <div key={approval.id} className="ops-row-card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-medium">{approval.email}</p>
                                                    <Badge variant={approval.status === 'PENDING' ? 'secondary' : 'outline'}>
                                                    {getWorkflowStatusLabel(approval.status, isMyanmar)}
                                                    </Badge>
                                                    {approval.newDevice ? <Badge variant="outline">{isMyanmar ? 'စက်အသစ်' : 'New device'}</Badge> : null}
                                                    {approval.newCountry ? <Badge variant="outline">{isMyanmar ? 'နိုင်ငံအသစ်' : 'New country'}</Badge> : null}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {approval.ip}
                                                    {approval.countryCode ? ` • ${approval.countryCode}` : ''}
                                                    {approval.host ? ` • ${approval.host}` : ''}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {approval.deviceLabel}
                                                    {approval.method ? ` • ${approval.method}` : approval.via2FA ? ' • 2FA' : isMyanmar ? ' • စကားဝှက်သာ' : ' • password only'}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {isMyanmar
                                                        ? `တောင်းဆိုချိန် ${formatRelativeTime(approval.createdAt, isMyanmar)} • ${approval.remainingMinutes} မိနစ်ခန့်အတွင်း သက်တမ်းကုန်မည်`
                                                        : `Requested ${formatRelativeTime(approval.createdAt, isMyanmar)} • expires in about ${approval.remainingMinutes} min`}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    className="rounded-full"
                                                    onClick={() => handleRejectLoginApproval(approval.id)}
                                                    disabled={rejectLoginApprovalMutation.isPending || approval.status !== 'PENDING'}
                                                >
                                                    {isMyanmar ? 'ငြင်းမည်' : 'Reject'}
                                                </Button>
                                                <Button
                                                    className="rounded-full"
                                                    onClick={() => handleApproveLoginApproval(approval.id)}
                                                    disabled={approveLoginApprovalMutation.isPending || approval.status !== 'PENDING'}
                                                >
                                                    {isMyanmar ? 'အတည်ပြုမည်' : 'Approve'}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>{isMyanmar ? 'မကြာသေးခင်က မအောင်မြင်သော admin ဝင်ရောက်မှုများ' : 'Recent failed admin logins'}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? 'app မှ မှတ်တမ်းတင်ထားသော နောက်ဆုံး bad-password ကြိုးစားမှုများ။' : 'Most recent bad-password attempts recorded by the app.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {overview.recentFailures.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">{isMyanmar ? 'မကြာသေးခင်က မအောင်မြင်သော admin login ကြိုးစားမှု မရှိပါ။' : 'No recent failed admin login attempts.'}</div>
                            ) : (
                                <div className="space-y-3">
                                    {overview.recentFailures.map((failure) => (
                                        <div key={failure.id} className="ops-row-card flex items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{failure.ip || (isMyanmar ? 'မသိရသည့် IP' : 'Unknown IP')}</span>
                                                    {failure.countryCode && <Badge variant="outline">{failure.countryCode}</Badge>}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{failure.email || (isMyanmar ? 'မသိရသည့် email' : 'Unknown email')}</p>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {formatRelativeTime(failure.createdAt, isMyanmar)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>{isMyanmar ? 'မကြာသေးခင်က admin ဝင်ရောက်မှုများ' : 'Recent admin sign-ins'}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? 'စက်ပစ္စည်းနှင့် နိုင်ငံပြောင်းလဲမှုကို ပြန်လည်သုံးသပ်နိုင်ရန် အောင်မြင်သော admin ဝင်ရောက်မှုများကို ပြပါသည်။' : 'Successful admin logins with device and country-change review.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {recentAdminLogins.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">{isMyanmar ? 'မကြာသေးခင်က အောင်မြင်သော admin ဝင်ရောက်မှု မှတ်တမ်း မရှိသေးပါ။' : 'No recent successful admin sign-ins recorded yet.'}</div>
                            ) : (
                                <div className="space-y-3">
                                    {recentAdminLogins.map((login) => (
                                        <div key={login.id} className="ops-row-card flex flex-wrap items-start justify-between gap-4">
                                            <div className="min-w-0 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium">{login.email || (isMyanmar ? 'မသိရသည့် admin' : 'Unknown admin')}</span>
                                                    {login.countryCode && <Badge variant="outline">{login.countryCode}</Badge>}
                                                    {login.newDevice && <Badge className="bg-sky-500/10 text-sky-600 dark:text-sky-300">{isMyanmar ? 'စက်ပစ္စည်းအသစ်' : 'New device'}</Badge>}
                                                    {login.newCountry && <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-300">{isMyanmar ? 'နိုင်ငံအသစ်' : 'New country'}</Badge>}
                                                    {login.via2FA && <Badge variant="secondary">2FA</Badge>}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                                    <span>{login.ip || (isMyanmar ? 'မသိရသည့် IP' : 'Unknown IP')}</span>
                                                    <span>•</span>
                                                    <span>{login.deviceLabel || (isMyanmar ? 'မသိရသည့် စက်ပစ္စည်း' : 'Unknown device')}</span>
                                                    {login.host && (
                                                        <>
                                                            <span>•</span>
                                                            <span>{login.host}</span>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    {login.browser && <span>{login.browser}</span>}
                                                    {login.os && (
                                                        <>
                                                            <span>•</span>
                                                            <span>{login.os}</span>
                                                        </>
                                                    )}
                                                    {login.path && (
                                                        <>
                                                            <span>•</span>
                                                            <span>{login.path}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {formatRelativeTime(login.createdAt, isMyanmar)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>{isMyanmar ? 'server fail2ban အခြေအနေ' : 'Server fail2ban status'}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? 'abusive admin login IP များကို hard-ban လုပ်သည့် server-side auth jail ၏ လက်ရှိအခြေအနေကို ပြပါသည်။' : 'Live jail state from the server-side auth jail that hard-bans abusive admin login IPs.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-0 pb-0">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="ops-detail-card">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'jail' : 'Jail'}</p>
                                    <p className="mt-2 font-semibold">{overview.fail2banStatus.jail}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {overview.fail2banStatus.available
                                            ? (isMyanmar ? 'fail2ban နှင့် ချိတ်ဆက်ထားသည်' : 'Connected to fail2ban')
                                            : overview.fail2banStatus.error || (isMyanmar ? 'မရရှိနိုင်ပါ' : 'Unavailable')}
                                    </p>
                                </div>
                                <div className="ops-detail-card">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ယခု ပိတ်ပင်ထားသည်' : 'Currently banned'}</p>
                                    <p className="mt-2 text-2xl font-semibold">{overview.fail2banStatus.currentlyBanned}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {isMyanmar ? `စုစုပေါင်း ban ${overview.fail2banStatus.totalBanned} ကြိမ် မှတ်တမ်းတင်ထားသည်` : `${overview.fail2banStatus.totalBanned} total bans recorded`}
                                    </p>
                                </div>
                                <div className="ops-detail-card">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ယခု မအောင်မြင်မှု' : 'Currently failed'}</p>
                                    <p className="mt-2 text-2xl font-semibold">{overview.fail2banStatus.currentlyFailed}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {isMyanmar ? `jail မှ တွေ့ရှိထားသော စုစုပေါင်း မအောင်မြင်မှု ${overview.fail2banStatus.totalFailed} ကြိမ်` : `${overview.fail2banStatus.totalFailed} total failed hits seen by the jail`}
                                    </p>
                                </div>
                                <div className="ops-detail-card">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ပိတ်ပင်ထားသော IP စာရင်း' : 'Banned IP list'}</p>
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
                                                        {isMyanmar ? 'ပိတ်ပင်မှု ဖြုတ်မည်' : 'Unban'}
                                                    </Button>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">{isMyanmar ? 'fail2ban ဖြင့် ယခု ပိတ်ပင်ထားသော IP မရှိပါ။' : 'No IPs currently banned by fail2ban.'}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>{isMyanmar ? 'အများဆုံး ကြိုးစားနေသော IP များ' : 'Top offender IPs'}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? 'နောက်ဆုံး ၂၄ နာရီအတွင်း မအောင်မြင်မှု အများဆုံး IP များ။' : 'Highest failure counts over the last 24 hours.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {overview.topOffenders.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">{isMyanmar ? 'offender IP မှတ်တမ်း မရှိသေးပါ။' : 'No offender IPs recorded yet.'}</div>
                            ) : (
                                <div className="space-y-3">
                                    {overview.topOffenders.map((offender) => (
                                        <div key={offender.ip} className="ops-row-card flex items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="font-medium">{offender.ip}</p>
                                                <p className="text-xs text-muted-foreground">{offender.email || (isMyanmar ? 'မသိရသည့် email' : 'Unknown email')}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">{offender.count}</p>
                                                <p className="text-xs text-muted-foreground">{isMyanmar ? 'ကြိုးစားမှုများ' : 'attempts'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>{isMyanmar ? 'အသက်ဝင် ကန့်သတ်ချက်များ' : 'Active restrictions'}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? 'app မှ ယခု lock သို့မဟုတ် ban လုပ်ထားသော IP များ။' : 'IPs currently locked or banned by the app.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {overview.activeRestrictions.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">{isMyanmar ? 'အသက်ဝင် login ban သို့မဟုတ် lock မရှိပါ။' : 'No active login bans or locks.'}</div>
                            ) : (
                                <div className="space-y-3">
                                    {overview.activeRestrictions.map((restriction) => (
                                        <div key={restriction.id} className="ops-row-card space-y-3">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{restriction.ip}</span>
                                                        <Badge variant={restriction.restrictionType === 'BAN' ? 'destructive' : 'secondary'}>
                                                            {getRestrictionTypeLabel(restriction.restrictionType, isMyanmar)}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">{restriction.attemptedEmail || (isMyanmar ? 'မသိရသည့် email' : 'Unknown email')}</p>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => unbanMutation.mutate({ ip: restriction.ip })}
                                                    disabled={unbanMutation.isPending}
                                                >
                                                    <Unlock className="mr-2 h-4 w-4" />
                                                    {isMyanmar ? 'ပြန်ဖွင့်မည်' : 'Unban'}
                                                </Button>
                                            </div>
                                            <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                                                <span>{isMyanmar ? `မအောင်မြင်မှုများ: ${restriction.failureCount}` : `Failures: ${restriction.failureCount}`}</span>
                                                <span>{isMyanmar ? `နောက်ဆုံးတွေ့ရှိချိန်: ${formatRelativeTime(restriction.lastFailedAt, isMyanmar)}` : `Last hit: ${formatRelativeTime(restriction.lastFailedAt, isMyanmar)}`}</span>
                                                <span>{isMyanmar ? `သက်တမ်းကုန်မည့်အချိန်: ${formatRelativeTime(restriction.expiresAt, isMyanmar)}` : `Expires: ${formatRelativeTime(restriction.expiresAt, isMyanmar)}`}</span>
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
                                <CardTitle>{isMyanmar ? 'အဖြစ်အပျက် အချိန်လိုင်း' : 'Incident timeline'}</CardTitle>
                                <CardDescription>
                                    {isMyanmar ? 'မအောင်မြင်သော admin login များကို အစုလိုက် ပြသပြီး အဘယ်အရာ တိုးလာသည်၊ ထိန်းထားနိုင်သည်၊ မည်သည့်အရာ ဆက်လက် active ဖြစ်နေသည်ကို ကြည့်နိုင်သည်။' : 'Grouped bursts of failed admin logins so you can see what escalated, what was contained, and what is still active.'}
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
                                    {isMyanmar ? 'CSV ထုတ်မည်' : 'Export CSV'}
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
                                    {isMyanmar ? 'JSON ထုတ်မည်' : 'Export JSON'}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 px-0 pb-0">
                        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                            <div className="ops-detail-card space-y-3">
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>{isMyanmar ? 'ရှာဖွေမှု' : 'Search'}</Label>
                                        <Input
                                            value={incidentFilters.search}
                                            onChange={(event) =>
                                                setIncidentFilters((current) => ({ ...current, search: event.target.value }))
                                            }
                                            placeholder={isMyanmar ? 'IP လိပ်စာ၊ အီးမေးလ်၊ host၊ ASN...' : 'IP, email, host, ASN...'}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{isMyanmar ? 'အခြေအနေ' : 'Status'}</Label>
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
                                        <Label>{isMyanmar ? 'လုပ်ငန်းစဉ်' : 'Workflow'}</Label>
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
                                        <Label>{isMyanmar ? 'ပြင်းထန်မှု' : 'Severity'}</Label>
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
                                        <Label>{isMyanmar ? 'နိုင်ငံ' : 'Country'}</Label>
                                        <Select
                                            value={incidentFilters.country}
                                            onValueChange={(value) =>
                                                setIncidentFilters((current) => ({ ...current, country: value }))
                                            }
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">{isMyanmar ? 'အားလုံး' : 'ALL'}</SelectItem>
                                                {availableCountries.map((country) => (
                                                    <SelectItem key={country} value={country}>{country}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{isMyanmar ? 'တာဝန်ခံ' : 'Assignee'}</Label>
                                        <Select
                                            value={incidentFilters.assignee}
                                            onValueChange={(value) =>
                                                setIncidentFilters((current) => ({ ...current, assignee: value }))
                                            }
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">{isMyanmar ? 'အားလုံး' : 'ALL'}</SelectItem>
                                                {currentOperatorEmail && (
                                                    <SelectItem value={currentOperatorEmail}>{isMyanmar ? 'ကျွန်ုပ်ထံ သတ်မှတ်ထားသည်' : 'Assigned to me'}</SelectItem>
                                                )}
                                                <SelectItem value={INCIDENT_ASSIGNEE_UNASSIGNED_VALUE}>{isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned'}</SelectItem>
                                                {availableAssignees
                                                    .filter((email) => email !== currentOperatorEmail)
                                                    .map((email) => (
                                                        <SelectItem key={email} value={email}>{email}</SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{isMyanmar ? 'ဂုဏ်သတင်း' : 'Reputation'}</Label>
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
                                                <SelectItem value="ALL">{isMyanmar ? 'အားလုံး' : 'ALL'}</SelectItem>
                                                {riskLevels.map((level) => (
                                                    <SelectItem key={level} value={level}>{level}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{isMyanmar ? 'အချိန်အပိုင်း' : 'Time window'}</Label>
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
                                                <SelectItem value="1">{isMyanmar ? 'နောက်ဆုံး ၁ နာရီ' : 'Last 1 hour'}</SelectItem>
                                                <SelectItem value="6">{isMyanmar ? 'နောက်ဆုံး ၆ နာရီ' : 'Last 6 hours'}</SelectItem>
                                                <SelectItem value="24">{isMyanmar ? 'နောက်ဆုံး ၂၄ နာရီ' : 'Last 24 hours'}</SelectItem>
                                                <SelectItem value="72">{isMyanmar ? 'နောက်ဆုံး ၇၂ နာရီ' : 'Last 72 hours'}</SelectItem>
                                                <SelectItem value="168">{isMyanmar ? 'နောက်ဆုံး ၇ ရက်' : 'Last 7 days'}</SelectItem>
                                                <SelectItem value="all">{isMyanmar ? 'ရနိုင်သမျှ အားလုံး' : 'All available'}</SelectItem>
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
                                        {isMyanmar ? 'လက်ရှိ view ကို သိမ်းမည်' : 'Save current view'}
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
                                        {isMyanmar ? 'စစ်ထုတ်မှုများကို ပြန်သတ်မှတ်မည်' : 'Reset filters'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                        disabled={!currentOperatorEmail}
                                        onClick={() => {
                                            setActiveSavedViewId('all');
                                            setIncidentFilters({
                                                ...defaultIncidentFilters,
                                                status: 'ACTIVE',
                                                workflowStatus: 'ALL',
                                                assignee: currentOperatorEmail || 'ALL',
                                                timeWindowHours: 168,
                                            });
                                        }}
                                    >
                                        <ListFilter className="mr-2 h-4 w-4" />
                                        {isMyanmar ? 'ကျွန်ုပ်၏ active အလုပ်' : 'My active work'}
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
                                        {isMyanmar ? 'အန္တရာယ်မြင့် အပတ်' : 'High-risk week'}
                                    </Button>
                                </div>
                            </div>
                            <div className="ops-detail-card space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-medium">{isMyanmar ? 'သိမ်းထားသော မြင်ကွင်းများ' : 'Saved views'}</p>
                                        <p className="text-sm text-muted-foreground">
                                        {isMyanmar ? 'ဖြစ်ရပ်နှင့် reputation စစ်ထုတ်မှုများကို ပြန်လည်အသုံးပြုပါ။' : 'Reuse common incident and reputation filters.'}
                                        </p>
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
                                        {isMyanmar ? 'ဖြစ်ရပ်အားလုံး' : 'All incidents'}
                                    </Button>
                                    <Button
                                        variant={defaultSavedViewId === 'all' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className="w-full justify-start rounded-full"
                                        onClick={() => handleSetDefaultSavedView('all')}
                                    >
                                        <Star className="mr-2 h-4 w-4" />
                                        {defaultSavedViewId === 'all'
                                            ? (isMyanmar ? 'မူလ မြင်ကွင်း' : 'Default view')
                                            : (isMyanmar ? 'လက်ရှိ မြင်ကွင်းကို မူလအဖြစ် သတ်မှတ်မည်' : 'Set current default')}
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
                                    <p className="font-medium">{isMyanmar ? 'အသိပေးချက် တိတ်ဆိတ်ထားမှုများ' : 'Alert suppressions'}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {isMyanmar ? 'ကတ်တစ်ခုချင်း မဖွင့်ဘဲ အသိပေးချက် ပိတ်ထားသော ဖြစ်ရပ်များနှင့် IP များကို စစ်ဆေးပါ။' : 'Review muted incidents and IPs without opening each card.'}
                                    </p>
                                </div>
                                <Badge variant="outline">{overview.activeAlertSuppressions.length}</Badge>
                            </div>
                            {overview.activeAlertSuppressions.length === 0 ? (
                                <div className="rounded-[1rem] border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                                    {isMyanmar ? 'အသက်ဝင် တိတ်ဆိတ်ထားမှု မရှိပါ။' : 'No active suppressions.'}
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
                                                            <Badge variant="outline">{getSuppressionScopeLabel(suppression.scopeType, isMyanmar)}</Badge>
                                                            <span className="text-sm font-medium break-all">{suppression.scopeValue}</span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            {(suppression.reason || (isMyanmar ? 'အကြောင်းပြချက် မဖော်ပြထားပါ' : 'No reason provided'))}
                                                            {' · '}
                                                            {isMyanmar ? 'သက်တမ်းကုန်ရန်' : 'expires'} {formatRelativeTime(suppression.expiresAt, isMyanmar)}
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
                                                                {isMyanmar ? 'ကြည့်မည်' : 'View'}
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
                                                            {isMyanmar ? 'အသိပေးချက် ပိတ်ခြင်း ဖြုတ်မည်' : 'Unmute'}
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
                                                <p className="font-medium">
                                                    {isMyanmar ? `ဖြစ်ရပ် ${selectedIncidentIds.length} ခု ရွေးထားသည်` : `${selectedIncidentIds.length} incidents selected`}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {isMyanmar ? 'ရွေးထားသော ဖြစ်ရပ်အားလုံးတွင် လုပ်ငန်းစဉ် သို့မဟုတ် အသိပေးချက် ပိတ်ခြင်းလုပ်ဆောင်ချက်ကို တူညီစွာ အသုံးချပါ။' : 'Apply the same workflow or mute action to all selected incidents.'}
                                                </p>
                                    </div>
                                    <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSelectedIncidentIds([])}>
                                        {isMyanmar ? 'ရွေးချယ်မှု ဖြုတ်မည်' : 'Clear selection'}
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('ACKNOWLEDGE')}>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        {isMyanmar ? 'အတည်ပြုမည်' : 'Acknowledge'}
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('RESOLVE')}>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        {isMyanmar ? 'ဖြေရှင်းမည်' : 'Resolve'}
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('MUTE')}>
                                        <BellOff className="mr-2 h-4 w-4" />
                                        {isMyanmar ? 'အသိပေးချက် ပိတ်မည်' : 'Mute'}
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('UNMUTE')}>
                                        <Unlock className="mr-2 h-4 w-4" />
                                        {isMyanmar ? 'အသိပေးချက် ပိတ်ခြင်း ဖြုတ်မည်' : 'Unmute'}
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('ASSIGN')}>
                                        <User className="mr-2 h-4 w-4" />
                                        {isMyanmar ? 'တာဝန်ပေးမည်' : 'Assign'}
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIncidentAction('UNASSIGN')}>
                                        <UserX className="mr-2 h-4 w-4" />
                                        {isMyanmar ? 'တာဝန်ဖြုတ်မည်' : 'Unassign'}
                                    </Button>
                                </div>
                            </div>
                        )}
                        {filteredIncidents.length === 0 ? (
                            <div className="ops-chart-empty py-8 text-muted-foreground">
                                {overview.securityIncidents.length === 0
                                    ? (isMyanmar ? 'admin login abuse ဖြစ်ရပ်များ မမှတ်တမ်းတင်ရသေးပါ။' : 'No login abuse incidents recorded yet.')
                                    : (isMyanmar ? 'လက်ရှိ စစ်ထုတ်မှုများနှင့် ကိုက်ညီသော ဖြစ်ရပ် မရှိပါ။' : 'No incidents match the current filters.')}
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
                                        <span className="text-muted-foreground">{isMyanmar ? 'မြင်ရသမျှ ဖြစ်ရပ်အားလုံးကို ရွေးမည်' : 'Select all visible incidents'}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {isMyanmar ? `${selectedIncidentIds.length} ခု ရွေးထားသည်` : `${selectedIncidentIds.length} selected`}
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
                                                        {getIncidentSeverityLabel(incident.severity, isMyanmar)}
                                                    </Badge>
                                                    <Badge variant="outline" className={incidentStatusClasses(incident.status)}>
                                                        {getIncidentStatusLabel(incident.status, isMyanmar)}
                                                    </Badge>
                                                    <Badge variant="outline" className={workflowStatusClasses(incident.workflowStatus)}>
                                                        {getWorkflowStatusLabel(incident.workflowStatus, isMyanmar)}
                                                    </Badge>
                                                    {incident.activeRestrictionType && (
                                                        <Badge variant="outline">{getRestrictionTypeLabel(incident.activeRestrictionType, isMyanmar)}</Badge>
                                                    )}
                                                    {incident.assignedToEmail && (
                                                        <Badge variant="outline" className="gap-1">
                                                            <User className="h-3 w-3" />
                                                            {incident.assignedToEmail}
                                                        </Badge>
                                                    )}
                                                    {incident.alertSuppression && (
                                                        <Badge variant="outline">
                                                            {isMyanmar ? `${incident.alertSuppression.remainingMinutes} မိနစ် အသိပေးချက် ပိတ်ထားသည်` : `Muted for ${incident.alertSuppression.remainingMinutes} min`}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{incident.summary}</p>
                                                </div>
                                            </div>
                                            <div className="text-right text-xs text-muted-foreground">
                                                <p>{isMyanmar ? 'စတင်ချိန် ' : 'Started '}{formatRelativeTime(incident.startedAt, isMyanmar)}</p>
                                                <p>{isMyanmar ? 'နောက်ဆုံးတွေ့ရှိချိန် ' : 'Last seen '}{formatRelativeTime(incident.endedAt, isMyanmar)}</p>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="mt-2 rounded-full"
                                                    onClick={() => setIncidentDetailId(incident.id)}
                                                >
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    {isMyanmar ? 'အသေးစိတ်' : 'Details'}
                                                </Button>
                                            </div>
                                        </div>
                                        {(incident.notesPreview || incident.assignedToEmail || incident.enrichment.reverseDns.length > 0 || incident.enrichment.asn || incident.enrichment.isp || incident.enrichment.organization) && (
                                            <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
                                                <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                    <p className="font-medium text-foreground">{isMyanmar ? 'လုပ်ငန်းစဉ်' : 'Workflow'}</p>
                                                    <p className="mt-1">
                                                        {incident.workflowStatus === 'ACKNOWLEDGED' && incident.acknowledgedAt
                                                            ? isMyanmar
                                                                ? `${formatRelativeTime(incident.acknowledgedAt, isMyanmar)} တွင် အတည်ပြုပြီး${incident.acknowledgedByEmail ? ` ${incident.acknowledgedByEmail} မှ` : ''}`
                                                                : `Acknowledged ${formatRelativeTime(incident.acknowledgedAt, isMyanmar)}${incident.acknowledgedByEmail ? ` by ${incident.acknowledgedByEmail}` : ''}`
                                                            : incident.workflowStatus === 'RESOLVED' && incident.resolvedAt
                                                                ? isMyanmar
                                                                    ? `${formatRelativeTime(incident.resolvedAt, isMyanmar)} တွင် ဖြေရှင်းပြီး${incident.resolvedByEmail ? ` ${incident.resolvedByEmail} မှ` : ''}`
                                                                    : `Resolved ${formatRelativeTime(incident.resolvedAt, isMyanmar)}${incident.resolvedByEmail ? ` by ${incident.resolvedByEmail}` : ''}`
                                                                : (isMyanmar ? 'ဖွင့်ထားသော အဖြစ်အပျက်' : 'Open incident')}
                                                    </p>
                                                    {incident.assignedToEmail && (
                                                        <p className="mt-2 text-muted-foreground">
                                                            {isMyanmar ? `${incident.assignedToEmail} ထံ တာဝန်ပေးထားသည်` : `Assigned to ${incident.assignedToEmail}`}
                                                            {incident.assignedAt
                                                                ? ` ${formatRelativeTime(incident.assignedAt, isMyanmar)}`
                                                                : ''}
                                                            {incident.assignedByEmail ? (isMyanmar ? ` ${incident.assignedByEmail} မှ` : ` by ${incident.assignedByEmail}`) : ''}
                                                        </p>
                                                    )}
                                                    {incident.notesPreview && (
                                                        <p className="mt-2 break-words text-muted-foreground">{incident.notesPreview}</p>
                                                    )}
                                                </div>
                                                <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                    <p className="font-medium text-foreground">{isMyanmar ? 'ကွန်ရက် အချက်အလက် ဖြည့်စွက်မှု' : 'Network enrichment'}</p>
                                                    <div className="mt-1 space-y-1">
                                                        <p>
                                                            {incident.enrichment.asn || incident.enrichment.organization || incident.enrichment.isp
                                                                ? [incident.enrichment.asn, incident.enrichment.organization, incident.enrichment.isp].filter(Boolean).join(' · ')
                                                                : (isMyanmar ? 'ASN / ISP အချက်အလက် မရှိပါ' : 'No ASN / ISP data')}
                                                        </p>
                                                        <p className="break-all">
                                                            {incident.enrichment.reverseDns.length > 0
                                                                ? incident.enrichment.reverseDns.join(', ')
                                                                : (isMyanmar ? 'reverse DNS မရှိပါ' : 'No reverse DNS')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">{isMyanmar ? 'ကြိုးစားမှုများ' : 'Attempts'}</p>
                                                <p className="mt-1">
                                                    {isMyanmar
                                                        ? `${incident.failureCount} ကြိမ် မအောင်မြင် · ${incident.lockCount} ကြိမ် lock · ${incident.banCount} ကြိမ် ban`
                                                        : `${incident.failureCount} failures · ${incident.lockCount} locks · ${incident.banCount} bans`}
                                                </p>
                                            </div>
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">{isMyanmar ? 'ကြိုးစားထားသော အီးမေးလ်များ' : 'Attempted emails'}</p>
                                                <p className="mt-1 break-all">
                                                    {incident.attemptedEmails.length > 0 ? incident.attemptedEmails.join(', ') : (isMyanmar ? 'မသိ' : 'Unknown')}
                                                </p>
                                            </div>
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">{isMyanmar ? 'Host / လမ်းကြောင်း' : 'Host / path'}</p>
                                                <p className="mt-1 break-all">
                                                    {(incident.hosts[0] || (isMyanmar ? 'မသိသော host' : 'unknown host'))}{incident.paths[0] ? ` · ${incident.paths[0]}` : ''}
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
                                                    {isMyanmar ? 'အတည်ပြုမည်' : 'Acknowledge'}
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
                                                    {isMyanmar ? 'ဖြေရှင်းမည်' : 'Resolve'}
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
                                                {isMyanmar ? 'မှတ်စု ထည့်မည်' : 'Add note'}
                                            </Button>
                                            {incident.assignedToEmail ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full"
                                                    disabled={assignIncidentMutation.isPending}
                                                    onClick={() => handleAssignIncident(incident.id, null)}
                                                >
                                                    <UserX className="mr-2 h-4 w-4" />
                                                    {isMyanmar ? 'တာဝန်ဖြုတ်မည်' : 'Unassign'}
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full"
                                                    disabled={assignIncidentMutation.isPending}
                                                    onClick={() => {
                                                        const assignedToEmail = requestAssignee();
                                                        if (!assignedToEmail) return;
                                                        handleAssignIncident(incident.id, assignedToEmail);
                                                    }}
                                                >
                                                    <User className="mr-2 h-4 w-4" />
                                                    {isMyanmar ? 'တာဝန်ပေးမည်' : 'Assign'}
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={blockMutation.isPending}
                                                onClick={() => handleBlockIp(incident.ip)}
                                            >
                                                <Lock className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'IP ပိတ်မည်' : 'Block IP'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={allowlistMutation.isPending}
                                                onClick={() => handleAllowlistIp(incident.ip)}
                                            >
                                                <Shield className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'IP ခွင့်ပြုစာရင်းသို့ ထည့်မည်' : 'Allowlist IP'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={promoteMutation.isPending}
                                                onClick={() => handleBlockIp(incident.ip, true)}
                                            >
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'အမြဲတမ်း rule အဖြစ် မြှင့်မည်' : 'Promote permanent rule'}
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
                                                    {isMyanmar ? 'အသိပေးချက် ပိတ်ခြင်း ဖြုတ်မည်' : 'Unmute alerts'}
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
                                                        {isMyanmar ? 'ဖြစ်ရပ် အသိပေးချက်များကို ပိတ်မည်' : 'Mute incident alerts'}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-full"
                                                        disabled={suppressMutation.isPending}
                                                        onClick={() => handleMuteScope('IP', incident.ip, 'IP')}
                                                    >
                                                        <AlertTriangle className="mr-2 h-4 w-4" />
                                                        {isMyanmar ? 'IP အသိပေးချက်များကို ပိတ်မည်' : 'Mute IP alerts'}
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
                        <CardTitle>{isMyanmar ? 'IP အန္တရာယ် အဆင့်သတ်မှတ်ချက်' : 'IP reputation'}</CardTitle>
                        <CardDescription>
                            {isMyanmar
                                ? 'မကြာသေးခင်က မအောင်မြင်မှုများ၊ enforcement actions နှင့် ထပ်ခါတလဲလဲဖြစ်သော အပြုအမူအပေါ် အခြေခံသည့် IP တစ်ခုချင်း၏ အန္တရာယ်ရမှတ်။'
                                : 'Rolling risk score per IP based on recent failures, enforcement actions, and repeat-offender behavior.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        {filteredReputation.length === 0 ? (
                            <div className="ops-chart-empty py-8 text-muted-foreground">
                                {overview.ipReputation.length === 0
                                    ? (isMyanmar ? 'အန္တရာယ်ရှိသော IP အဆင့်သတ်မှတ်ချက် ဒေတာ မရှိသေးပါ။' : 'No abusive IP reputation data yet.')
                                    : (isMyanmar ? 'လက်ရှိ စစ်ထုတ်မှုများနှင့် ကိုက်ညီသော IP အဆင့်သတ်မှတ်ချက် မှတ်တမ်း မရှိပါ။' : 'No IP reputation entries match the current filters.')}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {selectedIps.length > 0 && (
                                    <div className="ops-detail-card space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium">{isMyanmar ? `IP ${selectedIps.length} ခု ရွေးထားသည်` : `${selectedIps.length} IPs selected`}</p>
                                                <p className="text-sm text-muted-foreground">{isMyanmar ? 'ရွေးထားသော IP အားလုံးတွင် response နှင့် အသိပေးချက် ပိတ်ခြင်း action များကို တစ်ပြိုင်နက် လုပ်ဆောင်ပါ။' : 'Run response and mute actions across all selected IPs.'}</p>
                                            </div>
                                            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSelectedIps([])}>
                                                {isMyanmar ? 'ရွေးချယ်မှု ဖြုတ်မည်' : 'Clear selection'}
                                            </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('BLOCK')}>
                                                <Lock className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'ပိတ်မည်' : 'Block'}
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('ALLOWLIST')}>
                                                <Shield className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'ခွင့်ပြုစာရင်း' : 'Allowlist'}
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('PROMOTE')}>
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'မြှင့်မည်' : 'Promote'}
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('MUTE')}>
                                                <BellOff className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'အသိပေးချက် ပိတ်မည်' : 'Mute'}
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('UNMUTE')}>
                                                <Unlock className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'အသိပေးချက် ပိတ်ခြင်း ဖြုတ်မည်' : 'Unmute'}
                                            </Button>
                                            <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleBulkIpAction('UNBAN')}>
                                                <Ban className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'ပိတ်ပင်မှု ဖြုတ်မည်' : 'Unban'}
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
                                        <span className="text-muted-foreground">{isMyanmar ? 'မြင်ရသမျှ IP အားလုံးကို ရွေးမည်' : 'Select all visible IPs'}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{isMyanmar ? `${selectedIps.length} ခု ရွေးထားသည်` : `${selectedIps.length} selected`}</span>
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
                                                    {entry.currentlyBanned && <Badge variant="destructive">{isMyanmar ? 'ယခု ပိတ်ပင်ထားသည်' : 'Banned now'}</Badge>}
                                                    {!entry.currentlyBanned && entry.currentlyRestricted && <Badge variant="secondary">{isMyanmar ? 'ယခု ကန့်သတ်ထားသည်' : 'Restricted now'}</Badge>}
                                                    {entry.alertSuppression && (
                                                        <Badge variant="outline">{isMyanmar ? `${entry.alertSuppression.remainingMinutes} မိနစ် အသိပေးချက် ပိတ်ထားသည်` : `Muted for ${entry.alertSuppression.remainingMinutes} min`}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground break-all">{entry.topEmail || (isMyanmar ? 'မသိရသည့် email' : 'Unknown email')}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-semibold">{entry.score}</p>
                                                <p className="text-xs text-muted-foreground">{isMyanmar ? 'အန္တရာယ်ရမှတ်' : 'risk score'}</p>
                                            </div>
                                        </div>
                                        <Progress value={entry.score} className="h-2" />
                                        <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">{isMyanmar ? 'မကြာသေးခင်က ဖိအား' : 'Recent pressure'}</p>
                                                <p className="mt-1">
                                                    {isMyanmar
                                                        ? `၂၄ နာရီအတွင်း ${entry.failures24h} · ၇ ရက်အတွင်း ${entry.failures7d} · ၃၀ ရက်အတွင်း ${entry.failures30d}`
                                                        : `${entry.failures24h} in 24h · ${entry.failures7d} in 7d · ${entry.failures30d} in 30d`}
                                                </p>
                                            </div>
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">{isMyanmar ? 'အရေးယူမှု မှတ်တမ်း' : 'Enforcement history'}</p>
                                                <p className="mt-1">
                                                    {isMyanmar
                                                        ? `ban ${entry.bans7d} ကြိမ် · lock ${entry.locks7d} ကြိမ် · incident ${entry.incidents7d} ခု`
                                                        : `${entry.bans7d} bans · ${entry.locks7d} locks · ${entry.incidents7d} incidents`}
                                                </p>
                                            </div>
                                        </div>
                                        {(entry.enrichment.reverseDns.length > 0 || entry.enrichment.asn || entry.enrichment.isp || entry.enrichment.organization) && (
                                            <div className="rounded-[0.95rem] border border-border/50 bg-background/65 px-3 py-2 text-xs text-muted-foreground dark:bg-white/[0.02]">
                                                <p className="font-medium text-foreground">{isMyanmar ? 'ကွန်ရက် အချက်အလက် ဖြည့်စွက်မှု' : 'Network enrichment'}</p>
                                                <p className="mt-1">
                                                    {[entry.enrichment.asn, entry.enrichment.organization, entry.enrichment.isp].filter(Boolean).join(' · ') || (isMyanmar ? 'ASN / ISP အချက်အလက် မရှိပါ' : 'No ASN / ISP data')}
                                                </p>
                                                <p className="mt-1 break-all">
                                                    {entry.enrichment.reverseDns.length > 0 ? entry.enrichment.reverseDns.join(', ') : (isMyanmar ? 'reverse DNS မရှိပါ' : 'No reverse DNS')}
                                                </p>
                                            </div>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            {isMyanmar ? 'နောက်ဆုံးတွေ့ရှိချိန် ' : 'Last seen '}{formatRelativeTime(entry.lastSeenAt, isMyanmar)}
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
                                                {isMyanmar ? 'IP ပိတ်မည်' : 'Block IP'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={allowlistMutation.isPending}
                                                onClick={() => handleAllowlistIp(entry.ip)}
                                            >
                                                <Shield className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'IP ခွင့်ပြုစာရင်းသို့ ထည့်မည်' : 'Allowlist IP'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={promoteMutation.isPending}
                                                onClick={() => handleBlockIp(entry.ip, true)}
                                            >
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'အမြဲတမ်း rule အဖြစ် မြှင့်မည်' : 'Promote permanent rule'}
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
                                                    {isMyanmar ? 'အသိပေးချက် ပိတ်ခြင်း ဖြုတ်မည်' : 'Unmute alerts'}
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
                                                    {isMyanmar ? 'IP အသိပေးချက်များကို အသိပေးချက် ပိတ်မည်' : 'Mute IP alerts'}
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
                    <CardTitle>{isMyanmar ? 'ယုံကြည်ရမှတ် မှတ်တမ်း' : 'Reputation history'}</CardTitle>
                    <CardDescription>
                        {isMyanmar ? 'နောက်ဆုံး ၁၄ ရက်အတွင်း failed login, အန္တရာယ်မြင့် IP activity နှင့် နေ့စဉ် reputation အမြင့်ဆုံး အခြေအနေကို ပြသသည်။' : 'Fourteen-day pressure trend showing failed logins, high-risk IP activity, and daily peak reputation.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 px-0 pb-0">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="ops-detail-card">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'မအောင်မြင်မှုများ (၁၄ ရက်)' : 'Failures (14d)'}</p>
                            <p className="mt-2 text-2xl font-semibold">
                                {overview.reputationHistory.reduce((total, point) => total + point.failures, 0)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'နောက်ဆုံး ၁၄ ရက်အတွင်း မှတ်တမ်းတင်ထားသော admin login မအောင်မြင်မှုအားလုံး' : 'all failed admin login attempts recorded in the last 14 days'}</p>
                        </div>
                        <div className="ops-detail-card">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'အန္တရာယ်မြင့် IP များ (အမြင့်ဆုံးနေ့)' : 'High-risk IPs (peak day)'}</p>
                            <p className="mt-2 text-2xl font-semibold">
                                {Math.max(...overview.reputationHistory.map((point) => point.highRiskIps), 0)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'လက်ရှိ window အတွင်း တစ်နေ့လျှင် အမြင့်ဆုံး အန္တရာယ်မြင့် IP အရေအတွက်' : 'maximum daily count of high-risk IPs in the current window'}</p>
                        </div>
                        <div className="ops-detail-card">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'အမြင့်ဆုံး reputation' : 'Peak reputation'}</p>
                            <p className="mt-2 text-2xl font-semibold">
                                {Math.max(...overview.reputationHistory.map((point) => point.peakScore), 0)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{isMyanmar ? 'လက်ရှိ ၁၄ ရက် window အတွင်း single IP တစ်ခု၏ အမြင့်ဆုံး တစ်နေ့စာ score' : 'highest single-IP daily score inside the current 14-day window'}</p>
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                        <div className="ops-detail-card space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-medium">{isMyanmar ? 'နေ့စဉ် login မအောင်မြင်မှု' : 'Failed logins by day'}</p>
                                    <p className="text-sm text-muted-foreground">{isMyanmar ? 'bar အမြင့်ကို နောက်ဆုံး နှစ်ပတ်အတွင်း တစ်နေ့လျှင် အများဆုံး မအောင်မြင်မှုအရေအတွက်အလိုက် တိုင်းတာထားသည်။' : 'Bars scale to the highest daily failure count in the last two weeks.'}</p>
                                </div>
                                <Badge variant="outline">
                                    {isMyanmar ? 'အများဆုံး' : 'Max'} {Math.max(...overview.reputationHistory.map((point) => point.failures), 0)}
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
                            <p className="font-medium">{isMyanmar ? 'နေ့စဉ် အန္တရာယ်အသေးစိတ်' : 'Daily risk detail'}</p>
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
                                            {isMyanmar
                                                ? `${point.failures} မအောင်မြင်မှု · ${point.highRiskIps} အန္တရာယ်မြင့် IP · ${point.uniqueIps} သီးခြား IP`
                                                : `${point.failures} failures · ${point.highRiskIps} high-risk IPs · ${point.uniqueIps} unique IPs`}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {isMyanmar
                                                ? `${point.bans} ban · ${point.locks} lock · ${point.repeatedAlerts} ထပ်ခါတလဲလဲ အသိပေးချက်`
                                                : `${point.bans} bans · ${point.locks} locks · ${point.repeatedAlerts} repeat alerts`}
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
                        <DialogTitle>{isMyanmar ? 'ဖြစ်ရပ် အသေးစိတ်' : 'Incident detail'}</DialogTitle>
                        <DialogDescription>
                            {isMyanmar ? 'ဤ login-abuse အဖြစ်အပျက်အတွက် လုပ်ငန်းစဉ်၊ စစ်ဆေးမှုဖြစ်ရပ်များနှင့် ဖိနှိပ်ထားမှု အချက်အလက်အပြည့်အစုံကို ပြသည်။' : 'Full workflow, audit events, and suppression context for this login-abuse incident.'}
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
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'အဖြစ်အပျက်' : 'Incident'}</p>
                                    <p className="mt-2 text-lg font-semibold">{incidentDetailQuery.data.incident.ip}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{incidentDetailQuery.data.incident.summary}</p>
                                </div>
                                <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-3 dark:bg-white/[0.02]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'လုပ်ငန်းစဉ်' : 'Workflow'}</p>
                                    <p className="mt-2 text-lg font-semibold">{incidentDetailQuery.data.incident.workflowStatus}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {incidentDetailQuery.data.incident.alertSuppression
                                            ? (isMyanmar
                                                ? `${incidentDetailQuery.data.incident.alertSuppression.remainingMinutes} မိနစ်ကြာ အသိပေးချက် ပိတ်ထားသည်`
                                                : `Muted for ${incidentDetailQuery.data.incident.alertSuppression.remainingMinutes} min`)
                                                : (isMyanmar ? 'အသိပေးချက်များ အသက်ဝင်နေသည်' : 'Alerts active')}
                                    </p>
                                    {incidentDetailQuery.data.incident.assignedToEmail && (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {isMyanmar
                                                ? `${incidentDetailQuery.data.incident.assignedToEmail} ထံ တာဝန်ပေးထားသည်`
                                                : `Assigned to ${incidentDetailQuery.data.incident.assignedToEmail}`}
                                            {incidentDetailQuery.data.incident.assignedAt
                                                ? ` ${formatRelativeTime(incidentDetailQuery.data.incident.assignedAt, isMyanmar)}`
                                                : ''}
                                            {incidentDetailQuery.data.incident.assignedByEmail
                                                ? (isMyanmar
                                                    ? ` ${incidentDetailQuery.data.incident.assignedByEmail} မှ`
                                                    : ` by ${incidentDetailQuery.data.incident.assignedByEmail}`)
                                                : ''}
                                        </p>
                                    )}
                                </div>
                                <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-3 dark:bg-white/[0.02]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isMyanmar ? 'ယုံကြည်ရမှတ်' : 'Reputation'}</p>
                                    <p className="mt-2 text-lg font-semibold">{incidentDetailQuery.data.reputation?.level || (isMyanmar ? 'မသိ' : 'Unknown')}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {isMyanmar ? 'အမှတ်' : 'Score'} {incidentDetailQuery.data.reputation?.score ?? 0}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                                <div className="space-y-4">
                                    <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-4 dark:bg-white/[0.02]">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium">{isMyanmar ? 'တာဝန်ခံမှု' : 'Ownership'}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {isMyanmar ? 'ဤအဖြစ်အပျက်အတွက် လက်ရှိ operator ကို သတ်မှတ်ပါ သို့မဟုတ် ဖြုတ်ပါ။' : 'Assign or clear the current operator for this incident.'}
                                                </p>
                                            </div>
                                            <Badge variant="outline">
                                                {incidentDetailQuery.data.incident.assignedToEmail || (isMyanmar ? 'မသတ်မှတ်ရသေး' : 'Unassigned')}
                                            </Badge>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full"
                                                disabled={assignIncidentMutation.isPending}
                                                onClick={() => {
                                                    const assignedToEmail = requestAssignee();
                                                    if (!assignedToEmail) return;
                                                    handleAssignIncident(incidentDetailQuery.data!.incident.id, assignedToEmail);
                                                }}
                                            >
                                                <User className="mr-2 h-4 w-4" />
                                                {isMyanmar ? 'သတ်မှတ်မည်' : 'Assign'}
                                            </Button>
                                            {incidentDetailQuery.data.incident.assignedToEmail && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full"
                                                    disabled={assignIncidentMutation.isPending}
                                                    onClick={() => handleAssignIncident(incidentDetailQuery.data!.incident.id, null)}
                                                >
                                                    <UserX className="mr-2 h-4 w-4" />
                                                    {isMyanmar ? 'ဖြုတ်မည်' : 'Unassign'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-4 dark:bg-white/[0.02]">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium">{isMyanmar ? 'မှတ်စု အချိန်လိုင်း' : 'Notes timeline'}</p>
                                            <Badge variant="outline">{incidentDetailQuery.data.noteEntries.length}</Badge>
                                        </div>
                                        {incidentDetailQuery.data.noteEntries.length === 0 ? (
                                            <p className="mt-3 text-sm text-muted-foreground">{isMyanmar ? 'ဤအဖြစ်အပျက်အတွက် လုပ်ငန်းစဉ် မှတ်စုများ မရှိသေးပါ။' : 'No workflow notes recorded for this incident.'}</p>
                                        ) : (
                                            <div className="mt-3 space-y-3">
                                                {incidentDetailQuery.data.noteEntries.map((entry, index) => (
                                                    <div key={`${entry.raw}-${index}`} className="rounded-[0.9rem] border border-border/40 bg-background/70 px-3 py-3 text-sm dark:bg-white/[0.02]">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="font-medium">{entry.actorEmail || (isMyanmar ? 'မသိသော လုပ်ဆောင်သူ' : 'Unknown actor')}</span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {entry.timestamp ? formatRelativeTime(entry.timestamp, isMyanmar) : (isMyanmar ? 'မသိသော အချိန်' : 'unknown time')}
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
                                            <p className="font-medium">{isMyanmar ? 'ကန့်သတ်ချက်များနှင့် အချက်အလက်ဖြည့်တင်းမှု' : 'Restrictions and enrichment'}</p>
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
                                                    : (isMyanmar ? 'ASN သို့မဟုတ် ISP enrichment မရှိပါ' : 'No ASN or ISP enrichment')}
                                            </p>
                                            <p className="break-all">
                                                {incidentDetailQuery.data.reputation?.enrichment.reverseDns?.length
                                                    ? incidentDetailQuery.data.reputation.enrichment.reverseDns.join(', ')
                                                    : (isMyanmar ? 'reverse DNS မရှိပါ' : 'No reverse DNS')}
                                            </p>
                                            {incidentDetailQuery.data.relatedRestrictions.map((restriction) => (
                                                <div key={restriction.id} className="rounded-[0.9rem] border border-border/40 bg-background/70 px-3 py-3 dark:bg-white/[0.02]">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="font-medium text-foreground">{getRestrictionTypeLabel(restriction.restrictionType, isMyanmar)}</span>
                                                        <span className="text-xs">{formatRelativeTime(restriction.expiresAt, isMyanmar)}</span>
                                                    </div>
                                                    <p className="mt-1 text-xs">{isMyanmar ? 'ကြိုးစားထားသော အီးမေးလ်:' : 'Attempted email:'} {restriction.attemptedEmail || (isMyanmar ? 'မသိ' : 'Unknown')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-[1rem] border border-border/50 bg-background/65 px-4 py-4 dark:bg-white/[0.02]">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-medium">{isMyanmar ? 'ဖြစ်ရပ် အချိန်လိုင်း' : 'Event timeline'}</p>
                                        <Badge variant="outline">{incidentDetailQuery.data.events.length}</Badge>
                                    </div>
                                    <div className="mt-3 space-y-3">
                                        {incidentDetailQuery.data.events.map((event) => (
                                            <div key={event.id} className="rounded-[0.9rem] border border-border/40 bg-background/70 px-3 py-3 text-sm dark:bg-white/[0.02]">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="space-y-1">
                                                        <p className="font-medium">{event.label}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {formatRelativeTime(event.createdAt, isMyanmar)}
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline">{event.action}</Badge>
                                                </div>
                                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                                    {event.email && <p>{isMyanmar ? 'အီးမေးလ်' : 'Email'}: {event.email}</p>}
                                                    {event.host && <p className="break-all">{isMyanmar ? 'ဟို့စ်' : 'Host'}: {event.host}</p>}
                                                    {event.path && <p className="break-all">{isMyanmar ? 'လမ်းကြောင်း' : 'Path'}: {event.path}</p>}
                                                    {event.restrictionType && <p>{isMyanmar ? 'ကန့်သတ်ချက်' : 'Restriction'}: {event.restrictionType}</p>}
                                                    {event.details && <p className="whitespace-pre-wrap break-all">{isMyanmar ? 'အသေးစိတ်' : 'Detail'}: {event.details}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIncidentDetailId(null)}>{isMyanmar ? 'ပိတ်မည်' : 'Close'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function SecurityPage() {
    const { locale, t } = useLocale();
    const { toast } = useToast();
    const isMyanmar = locale === 'my';
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
            toast({
                title: isMyanmar ? 'အမှားဖြစ်ပွားသည်' : 'Error',
                description: err.message,
                variant: 'destructive',
            });
        },
    });

    const deleteMutation = trpc.security.deleteRule.useMutation({
        onSuccess: () => {
            toast({ title: isMyanmar ? 'စည်းမျဉ်းကို ဖျက်ပြီးပါပြီ' : 'Rule deleted' });
            setDeletingRuleId(null);
            refetch();
        },
        onError: (err) => {
            setDeletingRuleId(null);
            toast({
                title: isMyanmar ? 'အမှားဖြစ်ပွားသည်' : 'Error',
                description: err.message,
                variant: 'destructive',
            });
        },
    });

    const triggerProbeMutation = trpc.security.triggerSecurityProbe.useMutation({
        onSuccess: () => {
            toast({
                title: isMyanmar ? 'စမ်းသပ်စစ်ဆေးမှုကို စတင်ပြီးပါပြီ' : 'Probe triggered',
                description: isMyanmar ? 'လုံခြုံရေး စစ်ဆေးမှုကို စတင်ထားပါသည်။' : 'Security check initiated.',
            });
        },
        onError: (err) => toast({
            title: isMyanmar ? 'အမှားဖြစ်ပွားသည်' : 'Error',
            description: err.message,
            variant: 'destructive',
        }),
    });

    return (
        <div className="space-y-6">
            <section className="ops-showcase">
                <div className="grid gap-5">
                    <div className="space-y-5 self-start">
                        <Badge
                            variant="outline"
                            className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
                        >
                            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                            {isMyanmar ? 'လုံခြုံရေး ထိန်းချုပ်ရေးဌာန' : 'Security Command Center'}
                        </Badge>

                        <div className="space-y-3">
                            <div className="text-sm text-muted-foreground">
                                <BackButton href="/dashboard" label={isMyanmar ? 'အချက်အချာ' : 'Dashboard'} />
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                                {isMyanmar ? 'လုံခြုံရေးနှင့် ဝင်ရောက်ခွင့် ထိန်းချုပ်မှု' : 'Security & access control'}
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                                {isMyanmar
                                    ? 'စီမံခန့်ခွဲမှု မျက်နှာပြင်နှင့် ဆာဗာ လုံခြုံရေးအခြေအနေကို စောင့်ကြည့်ပါ၊ စစ်ဆေးမှု အသစ်များ ပြုလုပ်ပါ၊ IP၊ CIDR နှင့် နိုင်ငံစည်းကမ်းများဖြင့် ဝင်ရောက်ခွင့်ကို ထိန်းချုပ်ပါ။'
                                    : 'Monitor dashboard and server security posture, trigger fresh probes, and control dashboard access with IP, CIDR, and country rules.'}
                            </p>
                        </div>

                        <SecuritySummaryCards />
                    </div>

                    <div className="ops-detail-rail">
                        <div className="ops-panel space-y-3">
                            <div className="space-y-1">
                                <p className="ops-section-heading">{isMyanmar ? 'လုံခြုံရေး ထိန်းချုပ်မှုများ' : 'Security controls'}</p>
                                <h2 className="text-xl font-semibold">{t('dashboard.command_rail')}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {isMyanmar
                                        ? 'ဝင်ရောက်ခွင့်ကို ပိုမိုတင်းကျပ်ရန် လိုအပ်သည့်အခါ စစ်ဆေးမှု အသစ်ပြုလုပ်ပါ သို့မဟုတ် စည်းမျဉ်းတပ်ဗ်သို့ တိုက်ရိုက်သွားပါ။'
                                        : 'Trigger a new probe or jump straight into the rule tab when you need to tighten panel access.'}
                                </p>
                            </div>

                            <Button className="h-11 w-full rounded-full" onClick={() => triggerProbeMutation.mutate()} disabled={triggerProbeMutation.isPending}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${triggerProbeMutation.isPending ? 'animate-spin' : ''}`} />
                                {triggerProbeMutation.isPending ? (isMyanmar ? 'စစ်ဆေးမှု လုပ်ဆောင်နေသည်…' : 'Running probe…') : (isMyanmar ? 'လုံခြုံရေး စစ်ဆေးမှု စတင်မည်' : 'Run security probe')}
                            </Button>

                            <Button variant="outline" className="h-11 w-full rounded-full" onClick={() => setActiveTab('rules')}>
                                <Lock className="mr-2 h-4 w-4" />
                                {isMyanmar ? 'ဝင်ရောက်ခွင့် စည်းကမ်းများကို ဖွင့်မည်' : 'Open access rules'}
                            </Button>
                        </div>

                        <div className="ops-panel space-y-3">
                            <div className="space-y-1">
                                <p className="ops-section-heading">{isMyanmar ? 'စစ်ဆေးမှု မှတ်ချက်' : 'Probe note'}</p>
                                <h2 className="text-xl font-semibold">{isMyanmar ? 'ဝန်ဆောင်မှု အခြေအနေ' : 'Worker status'}</h2>
                            </div>
                            <div className="ops-detail-card space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    {isMyanmar
                                        ? 'လုံခြုံရေး စစ်ဆေးမှုများကို လုံခြုံရေး ဝန်ဆောင်မှု လုပ်ငန်းစဉ်က အလိုအလျောက် လုပ်ဆောင်ပါသည်။ လက်မှတ် သို့မဟုတ် header စစ်ဆေးမှု အသစ်ချက်ချင်းလိုအပ်ပါက စစ်ဆေးမှု ခလုတ်ကို အသုံးပြုပါ။'
                                        : 'Security probes run automatically via the security worker process. Use the probe action when you need a fresh certificate or header check immediately.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="ops-command-bar h-auto w-full justify-start gap-2 rounded-[1.5rem] border-0 bg-transparent p-0 md:w-fit">
                    <TabsTrigger value="status">{isMyanmar ? 'လုံခြုံရေး အခြေအနေ' : 'Security Status'}</TabsTrigger>
                    <TabsTrigger value="rules">{isMyanmar ? 'ဝင်ရောက်ခွင့် စည်းကမ်းများ' : 'Access Rules'}</TabsTrigger>
                    <TabsTrigger value="login">{isMyanmar ? 'ဝင်ရောက်မှု ကာကွယ်ရေး' : 'Login Protection'}</TabsTrigger>
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
                                {isMyanmar ? 'လုံခြုံရေး ဝန်ဆောင်မှု လုပ်ငန်းစဉ်' : 'Security Worker'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            <p className="text-sm text-blue-400">
                                {isMyanmar
                                        ? 'လုံခြုံရေး စစ်ဆေးမှုများကို လုံခြုံရေး ဝန်ဆောင်မှု လုပ်ငန်းစဉ်က အလိုအလျောက် လုပ်ဆောင်ပါသည်။ တပ်ဆင်အသုံးပြုမှုအတွက် ဝန်ဆောင်မှု စီစဉ်လမ်းညွှန်ကို ကြည့်ပါ။'
                                    : 'Security probes run automatically via the security worker process. See the worker setup documentation for deployment instructions.'}
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="rules" className="space-y-6 mt-6">
                    <div className="ops-table-toolbar">
                        <div className="flex items-center gap-2">
                            <div className="ops-table-meta">
                                    {rules?.length ?? 0} {isMyanmar ? 'ခု သတ်မှတ်ထားသော စည်းမျဉ်းများ' : 'configured rules'}
                            </div>
                        </div>
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            {isMyanmar ? 'စည်းကမ်း ထည့်မည်' : 'Add Rule'}
                        </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="ops-panel bg-red-500/10 border-red-500/20 dark:border-red-500/20 dark:bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.16),transparent_24%),linear-gradient(180deg,rgba(4,11,23,0.95),rgba(5,12,25,0.84))]">
                            <CardHeader className="px-0 pb-2 pt-0">
                                <CardTitle className="text-lg text-red-500 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    {isMyanmar ? 'သတိပေးချက်' : 'Warning'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-0 pb-0">
                                <p className="text-sm text-red-400">
                                    {isMyanmar
                                      ? 'ပိတ်ဆို့ရေး စည်းမျဉ်းများ ထည့်သွင်းရာတွင် သတိထားပါ။ မိမိ၏ IP ကို မတော်တဆ မပိတ်မိစေရန် သေချာစစ်ပါ။ localhost ကို အမြဲခွင့်ပြုထားသည်။'
                                      : 'Be careful when adding blocking rules. Ensure you do not block your own IP address. Localhost is always allowed.'}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="ops-panel">
                        <CardHeader className="px-0 pt-0">
                            <CardTitle>{isMyanmar ? 'အသက်ဝင် စည်းကမ်းများ' : 'Active Rules'}</CardTitle>
                            <CardDescription>
                                {isMyanmar ? 'စည်းကမ်းများကို အစဉ်လိုက် စစ်ဆေးသည် - localhost ခွင့်ပြုချက်၊ ပိတ်ဆို့ရေး စည်းကမ်းများ၊ ခွင့်ပြုရေး စည်းကမ်းများ။' : 'Rules are evaluated in order: Allowed Localhost - Block Rules - Allow Rules.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            {isLoading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-[1.2rem] bg-muted/60 animate-pulse" />)}
                                </div>
                            ) : rules?.length === 0 ? (
                                <div className="ops-chart-empty py-8 text-muted-foreground">
                                    {isMyanmar ? 'လုံခြုံရေး စည်းမျဉ်းများ မသတ်မှတ်ရသေးပါ။ ဝင်လာသည့် ဆက်သွယ်မှုအားလုံးကို ခွင့်ပြုထားသည်။' : 'No security rules defined. All traffic is allowed.'}
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
                                                        <Badge variant="outline">{getRuleTargetTypeLabel(rule.targetType, isMyanmar)}</Badge>
                                                        <Badge variant={rule.type === 'BLOCK' ? 'destructive' : 'default'}>{getRuleTypeLabel(rule.type, isMyanmar)}</Badge>
                                                        {!rule.isActive && <Badge variant="secondary">{isMyanmar ? 'ပိတ်ထားသည်' : 'DISABLED'}</Badge>}
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
                                                    title={rule.isActive ? (isMyanmar ? 'စည်းမျဉ်းကို ပိတ်မည်' : 'Disable Rule') : (isMyanmar ? 'စည်းမျဉ်းကို ဖွင့်မည်' : 'Enable Rule')}
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
                                                        if (confirm(isMyanmar ? 'ဤစည်းမျဉ်းကို ဖျက်မလား?' : 'Delete this rule?')) {
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
