
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Server, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function DeployServerPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [token, setToken] = useState('');

    // Deployment Config
    const [name, setName] = useState('atomic-node-1');
    const [region, setRegion] = useState('');
    const [size, setSize] = useState('');

    // Deployment Status
    const [deploying, setDeploying] = useState(false);
    const [dropletId, setDropletId] = useState<number | null>(null);
    const [dropletIp, setDropletIp] = useState<string | null>(null);

    // Queries
    const configQuery = trpc.provision.checkConfig.useQuery(undefined, {
        retry: false,
    });

    const regionsQuery = trpc.provision.listRegions.useQuery(undefined, {
        enabled: step === 2,
    });

    const sizesQuery = trpc.provision.listSizes.useQuery(undefined, {
        enabled: step === 2,
    });

    // Polling for IP
    const { data: dropletData } = trpc.provision.getDroplet.useQuery(
        { id: dropletId! },
        {
            enabled: !!dropletId && !dropletIp,
            refetchInterval: 3000,
        }
    );

    useEffect(() => {
        if (configQuery.data?.hasToken && step === 1) {
            setStep(2); // Skip token step if configured
        }
    }, [configQuery.data, step]);

    useEffect(() => {
        if (dropletData?.ip) {
            setDropletIp(dropletData.ip);
            setDeploying(false);
            setStep(4); // Success!
        }
    }, [dropletData]);

    // Mutations
    const tokenMutation = trpc.provision.setToken.useMutation({
        onSuccess: () => {
            configQuery.refetch();
            setStep(2);
        },
        onError: (err) => {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
    });

    const deployMutation = trpc.provision.createDroplet.useMutation({
        onSuccess: (data) => {
            setDropletId(data.id);
            // Wait for IP... stays in step 3
        },
        onError: (err) => {
            setDeploying(false);
            toast({ title: 'Deployment Failed', description: err.message, variant: 'destructive' });
        }
    });

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
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied', description: 'Command copied to clipboard' });
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/dashboard/servers">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Deploy New Server</h1>
                    <p className="text-muted-foreground">Provision a new Outline server on DigitalOcean.</p>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="flex justify-between items-center px-8 py-4 bg-muted/30 rounded-lg">
                {[1, 2, 3, 4].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-2">
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2",
                            step >= s ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-muted-foreground/30",
                            step === 3 && s === 3 && "animate-pulse"
                        )}>
                            {s}
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">
                            {s === 1 ? 'Connect' : s === 2 ? 'Configure' : s === 3 ? 'Deploying' : 'Finish'}
                        </span>
                    </div>
                ))}
            </div>

            {/* Step 1: Token */}
            {step === 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle>DigitalOcean Configuration</CardTitle>
                        <CardDescription>Enter your Personal Access Token to enable deployment.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Personal Access Token</Label>
                            <Input
                                type="password"
                                placeholder="dop_v1_..."
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Generate one in your DigitalOcean account API settings (Read/Write access required).
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSaveToken} disabled={!token || tokenMutation.isPending}>
                            {tokenMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save & Continue
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {/* Step 2: Configure */}
            {step === 2 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Server Configuration</CardTitle>
                        <CardDescription>Choose your server location and size.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label>Server Name</Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Region</Label>
                                <Select value={region} onValueChange={setRegion}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a region" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {regionsQuery.data?.map((r: any) => (
                                            <SelectItem key={r.slug} value={r.slug}>{r.name} ({r.slug})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Size</Label>
                                <Select value={size} onValueChange={setSize}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a size" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sizesQuery.data?.filter((s: any) => s.vcpus === 1).slice(0, 10).map((s: any) => ( // Filter for basic droplets
                                            <SelectItem key={s.slug} value={s.slug}>
                                                {s.description} ({s.memory}MB / ${s.priceMonthly}/mo)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleDeploy} disabled={!name || !region || !size}>
                            Deploy Server <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {/* Step 3: Deploying */}
            {step === 3 && (
                <Card className="border-blue-500/20 shadow-lg shadow-blue-500/10">
                    <CardContent className="flex flex-col items-center justify-center py-16 space-y-6">
                        <div className="relative">
                            <Loader2 className="w-16 h-16 text-primary animate-spin" />
                            <Server className="w-8 h-8 text-primary absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-semibold">Provisioning Droplet...</h3>
                            <p className="text-muted-foreground">
                                Allocating IP address and installing Docker.<br />
                                This usually takes about 30-60 seconds.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 4: Success */}
            {step === 4 && (
                <Card className="border-green-500/20 shadow-lg shadow-green-500/10">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-8 h-8 text-green-500" />
                            <div>
                                <CardTitle>Deployment Successful!</CardTitle>
                                <CardDescription>Your server is running at <span className="font-mono text-foreground font-medium">{dropletIp}</span></CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="bg-muted p-4 rounded-lg space-y-3">
                            <p className="font-medium text-sm">Final Step: Install Outline</p>
                            <p className="text-sm text-muted-foreground">
                                Connect to your server via SSH and run the installation script.
                                Docker is already installed.
                            </p>
                            <div className="relative">
                                <div className="bg-black/80 text-white font-mono text-xs p-3 rounded border border-border/20 pr-10">
                                    ssh root@{dropletIp} "bash -c \"\$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh)\""
                                </div>
                                <Button size="icon" variant="ghost" className="absolute top-0 right-0 h-full text-white hover:text-white/80" onClick={() => handleCopy(`ssh root@${dropletIp} "bash -c \\"\\$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh)\\""`)}>
                                    <ArrowRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground italic">
                            After running the command, copy the "apiUrl" output and add it via the <Link href="/dashboard/servers" className="underline text-primary">Servers Page</Link>.
                        </p>
                    </CardContent>
                    <CardFooter>
                        <Button asChild className="w-full">
                            <Link href="/dashboard/servers">Go to Servers List</Link>
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}
