'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogSection,
    DialogSectionDescription,
    DialogSectionHeader,
    DialogSectionTitle,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { cn, getCountryFlag, COUNTRY_OPTIONS } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { useLocale } from '@/hooks/use-locale';
import {
    Server,
    RefreshCw,
    Loader2,
} from 'lucide-react';

/**
 * AddServerDialog Component
 * 
 * A modal dialog for adding new Outline servers to Atomic-UI. Users can either
 * paste the full JSON configuration from Outline Manager or manually enter
 * the API URL and certificate fingerprint.
 */
export function AddServerDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const { t } = useLocale();
    const [name, setName] = useState('');
    const [apiUrl, setApiUrl] = useState('');
    const [certSha256, setCertSha256] = useState('');
    const [configJson, setConfigJson] = useState('');
    const [location, setLocation] = useState('');
    const [countryCode, setCountryCode] = useState('');
    const [inputMode, setInputMode] = useState<'json' | 'manual'>('json');
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle');
    const [connectionTime, setConnectionTime] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Track connection time while loading
    useEffect(() => {
        if (connectionStatus === 'connecting') {
            setConnectionTime(0);
            timerRef.current = setInterval(() => {
                setConnectionTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [connectionStatus]);

    // Parse config mutation for extracting API URL and cert from JSON
    const parseConfigMutation = trpc.servers.parseConfig.useMutation({
        onSuccess: (data: { apiUrl: string; certSha256: string }) => {
            setApiUrl(data.apiUrl);
            setCertSha256(data.certSha256);
            toast({
                title: t('servers.toast.parsed'),
                description: t('servers.toast.parsed_desc'),
            });
        },
        onError: (error: { message: string }) => {
            toast({
                title: 'Parse failed',
                description: error.message,
                variant: 'destructive',
            });
        },
    });

    // Create server mutation
    const createMutation = trpc.servers.create.useMutation({
        onSuccess: () => {
            setConnectionStatus('success');
            toast({
                title: t('servers.toast.added'),
                description: t('servers.toast.added_desc'),
            });
            onSuccess();
            onOpenChange(false);
            resetForm();
        },
        onError: (error) => {
            setConnectionStatus('error');
            let errorMessage = error.message;
            if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                errorMessage = 'Connection timed out. Please check that the server is reachable and the API URL is correct.';
            } else if (error.message.includes('ECONNREFUSED')) {
                errorMessage = 'Connection refused. The server may be down or the port is blocked.';
            } else if (error.message.includes('certificate') || error.message.includes('cert')) {
                errorMessage = 'Certificate verification failed. Please check the Certificate SHA256 value.';
            }
            toast({
                title: 'Failed to add server',
                description: errorMessage,
                variant: 'destructive',
            });
        },
    });

    const resetForm = () => {
        setName('');
        setApiUrl('');
        setCertSha256('');
        setConfigJson('');
        setLocation('');
        setCountryCode('');
        setConnectionStatus('idle');
        setConnectionTime(0);
    };

    const handleCancel = () => {
        // Note: tRPC mutations can't be cancelled, but we can close the dialog
        setConnectionStatus('idle');
        onOpenChange(false);
        resetForm();
    };

    const handleParseConfig = () => {
        if (configJson.trim()) {
            parseConfigMutation.mutate({ config: configJson });
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !apiUrl || !certSha256) {
            toast({
                title: 'Validation error',
                description: 'Please fill in all required fields.',
                variant: 'destructive',
            });
            return;
        }

        setConnectionStatus('connecting');
        createMutation.mutate({
            name,
            apiUrl,
            apiCertSha256: certSha256,
            location: location || undefined,
            countryCode: countryCode || undefined,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto p-0 sm:max-w-[min(760px,calc(100vw-2rem))]">
                <DialogHeader className="space-y-2 border-b ops-modal-divider px-6 pb-5 pt-6">
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-primary" />
                        {t('servers.dialog.add.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('servers.dialog.add.desc')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <DialogBody>
                        <DialogSection>
                            <DialogSectionHeader>
                                <DialogSectionTitle>Input mode</DialogSectionTitle>
                                <DialogSectionDescription>
                                    Paste the full Outline install output, or enter the API details manually if you already have them.
                                </DialogSectionDescription>
                            </DialogSectionHeader>

                            <div className="flex gap-2 rounded-xl bg-muted p-1">
                                <button
                                    type="button"
                                    className={cn(
                                        'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                        inputMode === 'json'
                                            ? 'bg-background shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    onClick={() => setInputMode('json')}
                                >
                                    {t('servers.dialog.paste_config')}
                                </button>
                                <button
                                    type="button"
                                    className={cn(
                                        'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                        inputMode === 'manual'
                                            ? 'bg-background shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    onClick={() => setInputMode('manual')}
                                >
                                    {t('servers.dialog.manual_entry')}
                                </button>
                            </div>

                            {inputMode === 'json' && (
                                <div className="space-y-3 rounded-[1.1rem] border border-border/60 bg-muted/35 p-4">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-[11px] font-bold text-primary">1</span>
                                        <p className="text-sm font-medium">{t('servers.dialog.install_step1') || 'Log into your server and run this command.'}</p>
                                    </div>

                                    <div className="relative">
                                        <div className="rounded-xl bg-slate-950 p-3 pr-12 font-mono text-xs text-slate-50 break-all">
                                            sudo bash -c &quot;$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-apps/master/server_manager/install_scripts/install_server.sh)&quot;
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-1 top-1 h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
                                            onClick={() => {
                                                copyToClipboard(
                                                    'sudo bash -c "$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-apps/master/server_manager/install_scripts/install_server.sh)"',
                                                    'Copied',
                                                    'Command copied to clipboard'
                                                );
                                            }}
                                        >
                                            <RefreshCw className="hidden h-4 w-4" />
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                className="h-4 w-4"
                                            >
                                                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                            </svg>
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-[11px] font-bold text-primary">2</span>
                                        <p className="text-sm font-medium">{t('servers.dialog.install_step2') || 'Paste the install output here.'}</p>
                                    </div>
                                </div>
                            )}
                        </DialogSection>

                        {inputMode === 'json' && (
                            <DialogSection>
                                <DialogSectionHeader>
                                    <DialogSectionTitle>Server install output</DialogSectionTitle>
                                    <DialogSectionDescription>
                                        Paste the JSON or full install output. Atomic-UI will extract the API URL and fingerprint for you.
                                    </DialogSectionDescription>
                                </DialogSectionHeader>
                                <div className="space-y-3">
                                    <Label>{t('servers.dialog.config_label')}</Label>
                                    <textarea
                                        className="min-h-28 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder='{"apiUrl":"https://...","certSha256":"..."}'
                                        value={configJson}
                                        onChange={(e) => setConfigJson(e.target.value)}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleParseConfig}
                                        disabled={parseConfigMutation.isPending || !configJson.trim()}
                                    >
                                        {parseConfigMutation.isPending && (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        )}
                                        {t('servers.dialog.parse')}
                                    </Button>
                                </div>
                            </DialogSection>
                        )}

                        <DialogSection>
                            <DialogSectionHeader>
                                <DialogSectionTitle>Server record</DialogSectionTitle>
                                <DialogSectionDescription>
                                    Save the server name, API secret, and location details that will show up throughout the admin panel.
                                </DialogSectionDescription>
                            </DialogSectionHeader>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="name">{t('servers.dialog.name')}</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g., Singapore VPS"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="apiUrl">{t('servers.dialog.api_url')}</Label>
                                    <Input
                                        id="apiUrl"
                                        placeholder="https://your-server:port/secret"
                                        value={apiUrl}
                                        onChange={(e) => setApiUrl(e.target.value)}
                                        disabled={inputMode === 'json' && !!apiUrl}
                                    />
                                </div>

                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="certSha256">{t('servers.dialog.cert')}</Label>
                                    <Input
                                        id="certSha256"
                                        placeholder="64-character hex string"
                                        value={certSha256}
                                        onChange={(e) => setCertSha256(e.target.value)}
                                        disabled={inputMode === 'json' && !!certSha256}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="location">{t('servers.dialog.location')}</Label>
                                    <Input
                                        id="location"
                                        placeholder="e.g., AWS Singapore"
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('servers.dialog.country')}</Label>
                                    <Select value={countryCode} onValueChange={setCountryCode}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select country" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {COUNTRY_OPTIONS.map((country) => (
                                                <SelectItem key={country.code} value={country.code}>
                                                    {getCountryFlag(country.code)} {country.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </DialogSection>

                        {connectionStatus === 'connecting' && (
                            <DialogSection>
                                <div className="ops-modal-note border-blue-500/20 bg-blue-500/10">
                                    <div className="flex items-center gap-3">
                                        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-blue-500">Connecting to server...</p>
                                            <p className="text-xs text-muted-foreground">
                                                {connectionTime < 10
                                                    ? 'Validating connection and importing server info...'
                                                    : connectionTime < 20
                                                        ? 'Still connecting. This may take a moment.'
                                                        : 'Taking longer than expected. Check that the server is reachable and the secret is correct.'}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">Time elapsed: {connectionTime}s</p>
                                        </div>
                                    </div>
                                </div>
                            </DialogSection>
                        )}
                    </DialogBody>

                    <DialogFooter className="ops-modal-sticky-footer">
                        {connectionStatus === 'connecting' ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancel}
                            >
                                Cancel
                            </Button>
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                >
                                    {t('servers.dialog.cancel')}
                                </Button>
                                <Button type="submit" disabled={createMutation.isPending}>
                                    {createMutation.isPending && (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    )}
                                    {t('servers.dialog.submit')}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
