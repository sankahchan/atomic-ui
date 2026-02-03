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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
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
                                        navigator.clipboard.writeText(initMutation.data!.secret);
                                        toast({ title: 'Copied', description: 'Secret copied to clipboard.' });
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

    const handleCopyAll = () => {
        navigator.clipboard.writeText(codes.join('\n'));
        setCopied(true);
        toast({ title: 'Copied', description: 'Recovery codes copied to clipboard.' });
        setTimeout(() => setCopied(false), 2000);
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
                                    onClick={() => {
                                        if (confirm('Remove this passkey?')) {
                                            setDeletingCredentialId(cred.id);
                                            deleteCredMutation.mutate({ credentialId: cred.id });
                                        }
                                    }}
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
        </Card>
    );
}

export default function AccountSecurityPage() {
    const { toast } = useToast();

    const [setupDialogOpen, setSetupDialogOpen] = useState(false);
    const [recoveryCodesDialogOpen, setRecoveryCodesDialogOpen] = useState(false);
    const [disableDialogOpen, setDisableDialogOpen] = useState(false);
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
            <div className="space-y-6 animate-pulse">
                <div className="h-8 bg-muted rounded w-48" />
                <div className="h-64 bg-muted rounded" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/dashboard/settings">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Shield className="h-7 w-7 text-primary" />
                        Account Security
                    </h1>
                    <p className="text-muted-foreground">
                        Manage two-factor authentication and account security settings
                    </p>
                </div>
            </div>

            {/* 2FA Status Overview */}
            <Card className={status?.has2FA ? 'border-green-500/50 bg-green-500/5' : 'border-yellow-500/50 bg-yellow-500/5'}>
                <CardContent className="flex items-center gap-4 py-4">
                    {status?.has2FA ? (
                        <>
                            <div className="p-3 rounded-full bg-green-500/20">
                                <CheckCircle className="h-6 w-6 text-green-500" />
                            </div>
                            <div>
                                <p className="font-semibold text-green-700 dark:text-green-400">
                                    Two-factor authentication is enabled
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Your account is protected with additional security
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="p-3 rounded-full bg-yellow-500/20">
                                <AlertTriangle className="h-6 w-6 text-yellow-500" />
                            </div>
                            <div>
                                <p className="font-semibold text-yellow-700 dark:text-yellow-400">
                                    Two-factor authentication is not enabled
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Enable 2FA to add an extra layer of security to your account
                                </p>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* TOTP Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5" />
                        Authenticator App
                    </CardTitle>
                    <CardDescription>
                        Use an authenticator app like Google Authenticator, Authy, or 1Password to generate verification codes.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {status?.totpEnabled ? (
                        <>
                            <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                    Authenticator app is configured
                                </span>
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
                        <Button onClick={() => setSetupDialogOpen(true)}>
                            <QrCode className="h-4 w-4 mr-2" />
                            Set Up Authenticator App
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* Recovery Codes Section */}
            {status?.totpEnabled && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Key className="h-5 w-5" />
                            Recovery Codes
                        </CardTitle>
                        <CardDescription>
                            Recovery codes can be used to access your account if you lose access to your authenticator app.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
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
                            onClick={() => {
                                const code = prompt('Enter your authenticator code to regenerate recovery codes:');
                                if (code && code.length === 6) {
                                    regenerateCodesMutation.mutate({ code });
                                }
                            }}
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
        </div>
    );
}
