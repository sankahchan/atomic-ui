'use client';

/**
 * User Portal Dashboard
 * 
 * Displays the authenticated user's assigned access keys.
 * Allows users to view connection details, usage stats, and download configs.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import {
    Wifi,
    WifiOff,
    Download,
    Copy,
    QrCode,
    Smartphone,
    Globe,
    Clock,
    ShieldCheck,
    Server as ServerIcon,
    AlertTriangle,
    Key,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import QRCode from 'react-qr-code';

export default function PortalPage() {
    const { t } = useLocale();
    const { toast } = useToast();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    // Fetch user's keys
    const { data, isLoading } = trpc.keys.list.useQuery({
        page: 1,
        pageSize: 50,
    });

    // Fetch user's dynamic keys
    const { data: dynamicKeysData, isLoading: isLoadingDAKs } = trpc.dynamicKeys.list.useQuery({
        page: 1,
        pageSize: 50,
    });

    // Fetch client IP for "My Device" detection
    const { data: ipData, isLoading: isLoadingIp } = trpc.system.getMyIp.useQuery();
    const myIp = ipData?.ip;

    const keys = data?.items || [];
    const dynamicKeys = dynamicKeysData?.items || [];

    // Simple detection: Check if user IP matches any access key's server IP
    // Note: detailed matching would require resolving hostnames if they are domains
    const connectedKey = keys.find(k => k.accessUrl && myIp && k.accessUrl.includes(myIp));

    const handleCopyAccessKey = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: 'Copied to clipboard',
            description: 'URL has been copied.',
        });
    };

    if (isLoading || isLoadingDAKs || isLoadingIp) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-64 bg-muted rounded-xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
                    My Access Keys
                </h1>
                <p className="text-muted-foreground mt-2">
                    Manage your VPN connections and monitor usage.
                </p>
            </div>

            {/* My Device Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-3 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-background border-indigo-500/20">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className={connectedKey ? "w-5 h-5 text-green-500" : "w-5 h-5 text-muted-foreground"} />
                            <CardTitle className="text-lg">My Device</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-background/50 rounded-full border">
                                    <Smartphone className="w-6 h-6 text-indigo-500" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Current IP Address</p>
                                    <p className="text-xl font-bold font-mono tracking-tight">{myIp || 'Unknown'}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 bg-background/50 px-4 py-2 rounded-lg border">
                                {connectedKey ? (
                                    <>
                                        <div className="relative">
                                            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                                            <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping opacity-75" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-green-600">Protected</p>
                                            <p className="text-xs text-muted-foreground">Connected to {connectedKey.server.name}</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-3 h-3 bg-amber-500 rounded-full" />
                                        <div>
                                            <p className="text-xs font-semibold text-amber-600">Unprotected</p>
                                            <p className="text-xs text-muted-foreground">Not connected to VPN</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Dynamic Keys Section */}
            {dynamicKeys.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Wifi className="w-5 h-5 text-indigo-500" />
                        Dynamic Subscriptions
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {dynamicKeys.map((dak) => (
                            <Card key={dak.id} className="group overflow-hidden border-muted/50 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10">
                                <CardHeader className="bg-muted/30 pb-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                                                <Wifi className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{dak.name}</CardTitle>
                                                <CardDescription className="mt-1">
                                                    Dynamic Subscription
                                                </CardDescription>
                                            </div>
                                        </div>
                                        <Badge
                                            variant={dak.status === 'ACTIVE' ? 'default' : 'secondary'}
                                            className={dak.status === 'ACTIVE' ? 'bg-green-500/15 text-green-500 hover:bg-green-500/25' : ''}
                                        >
                                            {dak.status}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-6 space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Data Usage</span>
                                            <span className="font-medium">
                                                {formatBytes(Number(dak.usedBytes))} / {dak.dataLimitBytes ? formatBytes(Number(dak.dataLimitBytes)) : '∞'}
                                            </span>
                                        </div>
                                        {dak.dataLimitBytes && (
                                            <Progress
                                                value={Number(dak.usedBytes) / Number(dak.dataLimitBytes) * 100}
                                                className="bg-indigo-500/20"
                                                indicatorClassName="bg-indigo-500"
                                            />
                                        )}
                                    </div>

                                    {/* Subscription URL */}
                                    <div className="pt-2">
                                        <div className="relative">
                                            <input
                                                readOnly
                                                value={`${window.location.origin}/api/sub/${dak.dynamicUrl}`}
                                                className="w-full text-xs font-mono bg-muted p-3 pr-10 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="absolute right-1 top-1 h-7 w-7"
                                                onClick={() => handleCopyAccessKey(`${window.location.origin}/api/sub/${dak.dynamicUrl}`)}
                                            >
                                                <Copy className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">
                                            Use this URL in your VPN client to auto-configure access.
                                        </p>
                                    </div>
                                </CardContent>
                                <CardFooter className="bg-muted/10 pt-4">
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => window.open(`/api/sub/${dak.dynamicUrl}`, '_blank')}
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Open Subscription
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Static Keys Section */}
            {keys.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Key className="w-5 h-5 text-blue-500" />
                        Access Keys
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {keys.map((key) => (
                            <Card key={key.id} className="group overflow-hidden border-muted/50 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10">
                                <CardHeader className="bg-muted/30 pb-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                                <Globe className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{key.name}</CardTitle>
                                                <CardDescription className="flex items-center gap-1.5 mt-1">
                                                    <ServerIcon className="h-3 w-3" />
                                                    {key.server.name}
                                                    {key.server.countryCode && (
                                                        <span className="text-xs px-1.5 py-0.5 bg-background rounded border ml-1">
                                                            {key.server.countryCode}
                                                        </span>
                                                    )}
                                                </CardDescription>
                                            </div>
                                        </div>
                                        <Badge
                                            variant={key.status === 'ACTIVE' ? 'default' : 'secondary'}
                                            className={key.status === 'ACTIVE' ? 'bg-green-500/15 text-green-500 hover:bg-green-500/25' : ''}
                                        >
                                            {key.status}
                                        </Badge>
                                    </div>
                                </CardHeader>

                                <CardContent className="pt-6 space-y-6">
                                    {/* Usage Stats */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Data Usage</span>
                                            <span className="font-medium">
                                                {formatBytes(Number(key.usedBytes))} / {key.dataLimitBytes ? formatBytes(Number(key.dataLimitBytes)) : '∞'}
                                            </span>
                                        </div>
                                        <Progress
                                            value={key.usagePercent}
                                            className={key.usagePercent > 90 ? 'bg-red-500/20' : 'bg-blue-500/20'}
                                            indicatorClassName={key.usagePercent > 90 ? 'bg-red-500' : 'bg-blue-500'}
                                        />
                                        {key.isTrafficWarning && (
                                            <div className="flex items-center gap-1.5 text-xs text-amber-500">
                                                <AlertTriangle className="h-3 w-3" />
                                                <span>Approaching data limit</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Expiry Info */}
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-2.5 rounded-lg">
                                        <Clock className="h-4 w-4" />
                                        <span>
                                            {key.expirationType === 'NEVER'
                                                ? 'No expiration'
                                                : key.expiresAt
                                                    ? `Expires: ${new Date(key.expiresAt).toLocaleDateString()}`
                                                    : 'Expires after first use'}
                                        </span>
                                    </div>
                                </CardContent>

                                <CardFooter className="pt-2 gap-2">
                                    <Button
                                        className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                                        onClick={() => key.accessUrl && setSelectedKey(key.accessUrl)}
                                        disabled={!key.accessUrl}
                                    >
                                        <Smartphone className="w-4 h-4 mr-2" />
                                        Connect
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => key.accessUrl && handleCopyAccessKey(key.accessUrl)}
                                        disabled={!key.accessUrl}
                                        title="Copy Access Key"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {keys.length === 0 && dynamicKeys.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                        <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">No Access Keys Found</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mt-2">
                            You don&apos;t have any access keys assigned yet. Please contact the administrator.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Connection Details Modal */}
            <Dialog open={!!selectedKey} onOpenChange={(open) => !open && setSelectedKey(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Connect to VPN</DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col items-center space-y-6 py-4">
                        {/* QR Code */}
                        <div className="p-4 bg-white rounded-xl shadow-sm border">
                            {selectedKey && (
                                <QRCode value={selectedKey} size={200} />
                            )}
                        </div>

                        <div className="text-center space-y-2">
                            <h3 className="font-medium">Scan with Outline App</h3>
                            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                Open the Outline app on your device and scan this QR code, or copy the access key below.
                            </p>
                        </div>

                        {/* Copy Key */}
                        <div className="w-full space-y-2">
                            <div className="relative">
                                <input
                                    readOnly
                                    value={selectedKey || ''}
                                    className="w-full text-xs font-mono bg-muted p-3 pr-10 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="absolute right-1 top-1 h-7 w-7"
                                    onClick={() => selectedKey && handleCopyAccessKey(selectedKey)}
                                >
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>

                        {/* Download Links */}
                        <div className="flex gap-4 text-xs text-muted-foreground pt-2">
                            <a href="https://getoutline.org/get-started/" target="_blank" className="hover:text-primary transition-colors flex items-center gap-1">
                                Download Outline <Globe className="h-3 w-3" />
                            </a>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
