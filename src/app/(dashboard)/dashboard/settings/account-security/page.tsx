'use client';

/**
 * Account Security Settings Page
 *
 * Manage two-factor authentication settings:
 * - Enable/disable TOTP (authenticator app)
 * - Manage recovery codes
 * - Register/manage WebAuthn passkeys
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CodePromptDialog } from '@/components/ui/code-prompt-dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SurfaceSkeleton } from '@/components/ui/surface-skeleton';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import {
    Shield, Smartphone, Key, QrCode, Copy, CheckCircle, AlertTriangle,
    Trash2, Edit, Loader2, RefreshCw, ArrowLeft, Plus
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

function TotpSetupDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (recoveryCodes: string[]) => void;
}) {
    const { toast } = useToast();
    const [step, setStep] = useState<'qr' | 'verify'>('qr');
    const [verificationCode, setVerificationCode] = useState('');

    const initMutation = trpc.security.initTotpSetup.useMutation({
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    const verifyMutation = trpc.security.verifyTotpSetup.useMutation({
        onSuccess: (data) => {
            toast({ title: '2FA Enabled', description: 'Two-factor authentication has been enabled.' });
            onSuccess(data.recoveryCodes);
            onOpenChange(false);
            setStep('qr');
            setVerificationCode('');
        },
        onError: (err) => toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' }),
    });

    const handleOpen = (isOpen: boolean) => {
        if (isOpen && !initMutation.data) {
            initMutation.mutate();
        }
        onOpenChange(isOpen);
    };

    const handleVerify = () => {
        if (verificationCode.length !== 6) {
            toast({ title: 'Invalid Code', description: 'Please enter a 6-digit code.', variant: 'destructive' });
            return;
        }
        verifyMutation.mutate({ code: verificationCode });
    };

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5" />
                        Set Up Two-Factor Authentication
                    </DialogTitle>
                    <DialogDescription>
                        Use an authenticator app to generate verification codes.
                    </DialogDescription>
                </DialogHeader>

                {initMutation.isPending && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                )}

                {initMutation.data && step === 'qr' && (
                    <div className="space-y-4">
                        <div className="flex justify-center">
                            <div className="bg-white p-4 rounded-lg">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={initMutation.data.qrCode}
                                    alt="QR Code"
                                    width={200}
                                    height={200}
                                />
                            </div>
                        </div>

                        <div className="text-center text-sm text-muted-foreground">
                            Scan this QR code with your authenticator app
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Or enter this code manually:</Label>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                                    {initMutation.data.secret}
                                </code>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => {
                                        copyToClipboard(initMutation.data!.secret, 'Copied', 'Secret copied to clipboard.');
                                    }}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button onClick={() => setStep('verify')}>
                                Continue
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {initMutation.data && step === 'verify' && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="verification-code">Enter the 6-digit code from your app</Label>
                            <Input
                                id="verification-code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                placeholder="000000"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                className="text-center text-2xl tracking-widest font-mono"
                                autoFocus
                            />
                        </div>

                        <DialogFooter className="flex-col sm:flex-row gap-2">
                            <Button variant="outline" onClick={() => setStep('qr')}>
                                Back
                            </Button>
                            <Button
                                onClick={handleVerify}
                                disabled={verifyMutation.isPending || verificationCode.length !== 6}
                            >
                                {verifyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Verify and Enable
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function RecoveryCodesDialog({
    open,
    onOpenChange,
    codes,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    codes: string[];
}) {
    const { toast } = useToast();
    const [copied, setCopied] = useState(false);

    const handleCopyAll = async () => {
        const success = await copyToClipboard(codes.join('\n'), 'Copied', 'Recovery codes copied to clipboard.');
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5" />
                        Save Your Recovery Codes
                    </DialogTitle>
                    <DialogDescription>
                        Store these codes in a safe place. You can use them to access your account if you lose your authenticator.
                    </DialogDescription>
                </DialogHeader>

                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Important</AlertTitle>
                    <AlertDescription>
                        These codes will only be shown once. Make sure to save them now.
                    </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-sm">
                    {codes.map((code, i) => (
                        <div key={i} className="px-2 py-1 text-center">
                            {code}
                        </div>
                    ))}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleCopyAll}>
                        {copied ? <CheckCircle className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                        {copied ? 'Copied!' : 'Copy All'}
                    </Button>
                    <Button onClick={() => onOpenChange(false)}>
                        I have saved my codes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DisableTotpDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const [code, setCode] = useState('');

    const disableMutation = trpc.security.disableTotp.useMutation({
        onSuccess: () => {
            toast({ title: '2FA Disabled', description: 'Two-factor authentication has been disabled.' });
            onSuccess();
            onOpenChange(false);
            setCode('');
        },
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
                    <DialogDescription>
                        Enter your current authenticator code to disable 2FA.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="disable-code">Verification Code</Label>
                        <Input
                            id="disable-code"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            placeholder="000000"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            className="text-center text-xl tracking-widest font-mono"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={() => disableMutation.mutate({ code })}
                        disabled={disableMutation.isPending || code.length !== 6}
                    >
                        {disableMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Disable 2FA
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function WebAuthnSection() {
    const { toast } = useToast();
    const utils = trpc.useUtils();
    const [deletingCredentialId, setDeletingCredentialId] = useState<string | null>(null);
    const [credentialToDelete, setCredentialToDelete] = useState<{ id: string; name: string } | null>(null);

    const { data: status, refetch } = trpc.security.get2FAStatus.useQuery();

    const generateRegOptionsMutation = trpc.security.generateWebAuthnRegistrationOptions.useMutation();
    const verifyRegMutation = trpc.security.verifyWebAuthnRegistration.useMutation({
        onSuccess: () => {
            toast({ title: 'Passkey Added', description: 'Your passkey has been registered.' });
            refetch();
        },
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    const deleteCredMutation = trpc.security.deleteWebAuthnCredential.useMutation({
        onSuccess: () => {
            toast({ title: 'Passkey Removed' });
            setDeletingCredentialId(null);
            refetch();
        },
        onError: (err) => {
            setDeletingCredentialId(null);
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        },
    });

    const handleRegisterPasskey = async () => {
        try {
            const options = await generateRegOptionsMutation.mutateAsync();

            const credential = await startRegistration({ optionsJSON: options });

            await verifyRegMutation.mutateAsync({
                response: credential,
                name: 'Security Key',
            });
        } catch (err) {
            if (err instanceof Error && err.name !== 'NotAllowedError') {
                toast({ title: 'Registration Failed', description: err.message, variant: 'destructive' });
            }
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    Passkeys (WebAuthn)
                </CardTitle>
                <CardDescription>
                    Use biometrics, security keys, or your device&apos;s built-in authenticator.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {status?.webAuthnCredentials && status.webAuthnCredentials.length > 0 ? (
                    <div className="space-y-2">
                        {status.webAuthnCredentials.map((cred) => (
                            <div
                                key={cred.id}
                                className="flex items-center justify-between p-3 border rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <Key className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                        <p className="font-medium">{cred.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Added {new Date(cred.createdAt).toLocaleDateString()}
                                            {cred.lastUsedAt && ` - Last used ${new Date(cred.lastUsedAt).toLocaleDateString()}`}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setCredentialToDelete({ id: cred.id, name: cred.name })}
                                    disabled={deleteCredMutation.isPending && deletingCredentialId === cred.id}
                                >
                                    {deleteCredMutation.isPending && deletingCredentialId === cred.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                                    ) : (
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    )}
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No passkeys registered. Add a passkey for passwordless sign-in.
                    </p>
                )}

                <Button
                    variant="outline"
                    onClick={handleRegisterPasskey}
                    disabled={generateRegOptionsMutation.isPending || verifyRegMutation.isPending}
                >
                    {generateRegOptionsMutation.isPending || verifyRegMutation.isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Adding Passkey...
                        </>
                    ) : (
                        <>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Passkey
                        </>
                    )}
                </Button>
            </CardContent>

            <ConfirmationDialog
                open={!!credentialToDelete}
                onOpenChange={(open) => {
                    if (!open) {
                        setCredentialToDelete(null);
                    }
                }}
                title="Remove passkey"
                description={
                    credentialToDelete
                        ? `Remove "${credentialToDelete.name}" from this account?`
                        : ''
                }
                confirmLabel="Remove passkey"
                destructive
                loading={deleteCredMutation.isPending}
                onConfirm={() => {
                    if (!credentialToDelete) return;
                    setDeletingCredentialId(credentialToDelete.id);
                    deleteCredMutation.mutate({ credentialId: credentialToDelete.id });
                }}
            />
        </Card>
    );
}

export default function AccountSecurityPage() {
    const { toast } = useToast();

    const [setupDialogOpen, setSetupDialogOpen] = useState(false);
    const [recoveryCodesDialogOpen, setRecoveryCodesDialogOpen] = useState(false);
    const [disableDialogOpen, setDisableDialogOpen] = useState(false);
    const [recoveryPromptOpen, setRecoveryPromptOpen] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

    const { data: status, isLoading, refetch } = trpc.security.get2FAStatus.useQuery();

    const regenerateCodesMutation = trpc.security.regenerateRecoveryCodes.useMutation({
        onSuccess: (data) => {
            setRecoveryCodes(data.recoveryCodes);
            setRecoveryCodesDialogOpen(true);
            refetch();
        },
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    const handleSetupSuccess = (codes: string[]) => {
        setRecoveryCodes(codes);
        setRecoveryCodesDialogOpen(true);
        refetch();
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <SurfaceSkeleton className="min-h-[240px]" lines={4} />
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <SurfaceSkeleton className="min-h-[260px]" lines={5} />
                    <SurfaceSkeleton className="min-h-[260px]" lines={5} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="ops-showcase">
                <div className="ops-showcase-grid">
                    <div className="space-y-5 self-start">
                        <div className="flex flex-wrap items-center gap-3">
                            <Button variant="ghost" size="icon" asChild className="h-10 w-10 rounded-full border border-border/60">
                                <Link href="/dashboard/settings">
                                    <ArrowLeft className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Badge
                                variant="outline"
                                className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
                            >
                                <Shield className="mr-2 h-3.5 w-3.5" />
                                Account Security
                            </Badge>
                        </div>

                        <div className="space-y-3">
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                                Security controls
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                                Protect dashboard access with authenticator codes, recovery workflows, and hardware-backed passkeys.
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="ops-kpi-tile">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Authenticator</p>
                                <p className="mt-3 text-3xl font-semibold tracking-tight">{status?.totpEnabled ? 'On' : 'Off'}</p>
                                <p className="mt-2 text-sm text-muted-foreground">App-based verification for every login.</p>
                            </div>
                            <div className="ops-kpi-tile">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recovery codes</p>
                                <p className="mt-3 text-3xl font-semibold tracking-tight">{status?.recoveryCodesRemaining ?? 0}</p>
                                <p className="mt-2 text-sm text-muted-foreground">Fallback access codes still available.</p>
                            </div>
                            <div className="ops-kpi-tile">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Passkeys</p>
                                <p className="mt-3 text-3xl font-semibold tracking-tight">{status?.webAuthnCredentials?.length ?? 0}</p>
                                <p className="mt-2 text-sm text-muted-foreground">Hardware or biometric sign-in methods.</p>
                            </div>
                        </div>
                    </div>

                    <div className="ops-detail-rail">
                        <Card className={status?.has2FA ? 'ops-panel border-emerald-500/25 bg-emerald-500/10' : 'ops-panel border-amber-500/25 bg-amber-500/10'}>
                            <CardContent className="px-0 py-0">
                                <div className="flex items-start gap-4">
                                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${status?.has2FA ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                        {status?.has2FA ? (
                                            <CheckCircle className="h-6 w-6" />
                                        ) : (
                                            <AlertTriangle className="h-6 w-6" />
                                        )}
                                    </span>
                                    <div className="space-y-2">
                                        <p className="ops-section-heading">Protection status</p>
                                        <h2 className="text-xl font-semibold">
                                            {status?.has2FA ? 'Protected' : 'Needs attention'}
                                        </h2>
                                        <p className="text-sm leading-6 text-muted-foreground">
                                            {status?.has2FA
                                                ? 'Two-factor authentication is enabled for this account.'
                                                : 'Add at least one second factor to improve dashboard security.'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="ops-panel">
                            <CardContent className="space-y-3 px-0 py-0">
                                <div className="space-y-1">
                                    <p className="ops-section-heading">Quick actions</p>
                                    <h2 className="text-xl font-semibold">Command rail</h2>
                                </div>
                                {status?.totpEnabled ? (
                                    <Button variant="outline" className="w-full rounded-full" onClick={() => setDisableDialogOpen(true)}>
                                        Disable authenticator
                                    </Button>
                                ) : (
                                    <Button className="w-full rounded-full" onClick={() => setSetupDialogOpen(true)}>
                                        <QrCode className="mr-2 h-4 w-4" />
                                        Set up authenticator
                                    </Button>
                                )}
                                <Button variant="secondary" className="w-full rounded-full" onClick={() => setRecoveryPromptOpen(true)} disabled={!status?.totpEnabled}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Regenerate recovery codes
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <Card className="ops-panel">
                <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5" />
                        Authenticator App
                    </CardTitle>
                    <CardDescription>
                        Use an authenticator app like Google Authenticator, Authy, or 1Password to generate verification codes.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 px-0 pb-0">
                    {status?.totpEnabled ? (
                        <>
                            <div className="flex items-center gap-3 rounded-[1.25rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                    Authenticator app is configured
                                </span>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="ops-mini-tile">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recovery codes</p>
                                    <p className="mt-2 text-sm font-medium">{status.recoveryCodesRemaining} remaining</p>
                                </div>
                                <div className="ops-mini-tile">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mode</p>
                                    <p className="mt-2 text-sm font-medium">Code verification required</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setDisableDialogOpen(true)}
                                >
                                    Disable Authenticator
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-muted-foreground">
                                This account is currently protected only by password-based login.
                            </div>
                            <Button onClick={() => setSetupDialogOpen(true)}>
                            <QrCode className="h-4 w-4 mr-2" />
                            Set Up Authenticator App
                        </Button>
                        </div>
                    )}
                </CardContent>
                </Card>

                <div className="space-y-6">
                {status?.totpEnabled && (
                <Card className="ops-panel">
                    <CardHeader className="px-0 pt-0">
                        <CardTitle className="flex items-center gap-2">
                            <Key className="h-5 w-5" />
                            Recovery Codes
                        </CardTitle>
                        <CardDescription>
                            Recovery codes can be used to access your account if you lose access to your authenticator app.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 px-0 pb-0">
                        <div className="flex items-center gap-3 rounded-[1.25rem] border border-border/60 bg-background/55 p-4">
                            <Badge variant={status.recoveryCodesRemaining > 3 ? 'default' : 'destructive'}>
                                {status.recoveryCodesRemaining} remaining
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                                {status.recoveryCodesRemaining === 0
                                    ? 'No recovery codes left! Generate new ones.'
                                    : status.recoveryCodesRemaining <= 3
                                    ? 'Running low on recovery codes.'
                                    : 'Recovery codes available.'}
                            </span>
                        </div>

                        <Button
                            variant="outline"
                            onClick={() => setRecoveryPromptOpen(true)}
                            disabled={regenerateCodesMutation.isPending}
                        >
                            {regenerateCodesMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Regenerate Recovery Codes
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* WebAuthn Section */}
            <WebAuthnSection />
                </div>
            </div>

            {/* Dialogs */}
            <TotpSetupDialog
                open={setupDialogOpen}
                onOpenChange={setSetupDialogOpen}
                onSuccess={handleSetupSuccess}
            />

            <RecoveryCodesDialog
                open={recoveryCodesDialogOpen}
                onOpenChange={setRecoveryCodesDialogOpen}
                codes={recoveryCodes}
            />

            <DisableTotpDialog
                open={disableDialogOpen}
                onOpenChange={setDisableDialogOpen}
                onSuccess={() => refetch()}
            />

            <CodePromptDialog
                open={recoveryPromptOpen}
                onOpenChange={setRecoveryPromptOpen}
                title="Regenerate recovery codes"
                description="Enter your current authenticator code to generate a fresh set of recovery codes."
                confirmLabel="Generate new codes"
                loading={regenerateCodesMutation.isPending}
                onSubmit={(code) => regenerateCodesMutation.mutate({ code })}
            />
        </div>
    );
}
