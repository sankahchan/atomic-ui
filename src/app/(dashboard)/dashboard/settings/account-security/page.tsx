'use client';

/**
 * Account Security Settings Page
 *
 * Manage two-factor authentication settings:
 * - Enable/disable TOTP (authenticator app)
 * - Manage recovery codes
 * - Register/manage WebAuthn passkeys
 */

import { useMemo, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import {
    Shield, Smartphone, Key, QrCode, Copy, CheckCircle, AlertTriangle,
    Trash2, Loader2, RefreshCw, ArrowLeft, Plus, Monitor, LogOut, ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { useLocale } from '@/hooks/use-locale';

function TotpSetupDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (recoveryCodes: string[]) => void;
}) {
    const { locale } = useLocale();
    const { toast } = useToast();
    const isMyanmar = locale === 'my';
    const [step, setStep] = useState<'qr' | 'verify'>('qr');
    const [verificationCode, setVerificationCode] = useState('');

    const initMutation = trpc.security.initTotpSetup.useMutation({
        onError: (err) => toast({
            title: isMyanmar ? 'အမှား ဖြစ်ပွားပါသည်' : 'Error',
            description: err.message,
            variant: 'destructive',
        }),
    });

    const verifyMutation = trpc.security.verifyTotpSetup.useMutation({
        onSuccess: (data) => {
            toast({
                title: isMyanmar ? 'နှစ်ဆအတည်ပြုမှုကို ဖွင့်ထားပါပြီ' : '2FA Enabled',
                description: isMyanmar
                    ? 'နှစ်ဆအတည်ပြု လုံခြုံရေးကို ဖွင့်ထားပါပြီ။'
                    : 'Two-factor authentication has been enabled.',
            });
            onSuccess(data.recoveryCodes);
            onOpenChange(false);
            setStep('qr');
            setVerificationCode('');
        },
        onError: (err) => toast({
            title: isMyanmar ? 'အတည်ပြုမှု မအောင်မြင်ပါ' : 'Verification Failed',
            description: err.message,
            variant: 'destructive',
        }),
    });

    const handleOpen = (isOpen: boolean) => {
        if (isOpen && !initMutation.data) {
            initMutation.mutate();
        }
        onOpenChange(isOpen);
    };

    const handleVerify = () => {
        if (verificationCode.length !== 6) {
            toast({
                title: isMyanmar ? 'ကုဒ် မှားနေပါသည်' : 'Invalid Code',
                description: isMyanmar ? 'ဂဏန်း ၆ လုံးပါ ကုဒ်ကို ထည့်ပါ။' : 'Please enter a 6-digit code.',
                variant: 'destructive',
            });
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
                        {isMyanmar ? 'နှစ်ဆအတည်ပြု လုံခြုံရေးကို စတင်မည်' : 'Set Up Two-Factor Authentication'}
                    </DialogTitle>
                    <DialogDescription>
                        {isMyanmar
                            ? 'အတည်ပြုကုဒ်များ ထုတ်ရန် authenticator app တစ်ခုကို အသုံးပြုပါ။'
                            : 'Use an authenticator app to generate verification codes.'}
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
                            {isMyanmar
                                ? 'သင့် authenticator app ဖြင့် ဤ QR code ကို စကင်ဖတ်ပါ'
                                : 'Scan this QR code with your authenticator app'}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">
                                {isMyanmar ? 'သို့မဟုတ် ဤကုဒ်ကို လက်ဖြင့် ထည့်ပါ:' : 'Or enter this code manually:'}
                            </Label>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                                    {initMutation.data.secret}
                                </code>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => {
                                        copyToClipboard(
                                            initMutation.data!.secret,
                                            isMyanmar ? 'ကူးယူပြီးပါပြီ' : 'Copied',
                                            isMyanmar ? 'လျှို့ဝှက်ကုဒ်ကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Secret copied to clipboard.',
                                        );
                                    }}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button onClick={() => setStep('verify')}>
                                {isMyanmar ? 'ဆက်လုပ်မည်' : 'Continue'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {initMutation.data && step === 'verify' && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="verification-code">
                                {isMyanmar ? 'သင့် အတည်ပြုအက်ပ်မှ ဂဏန်း ၆ လုံးကုဒ်ကို ထည့်ပါ' : 'Enter the 6-digit code from your app'}
                            </Label>
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
                                {isMyanmar ? 'နောက်သို့' : 'Back'}
                            </Button>
                            <Button
                                onClick={handleVerify}
                                disabled={verifyMutation.isPending || verificationCode.length !== 6}
                            >
                                {verifyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {isMyanmar ? 'အတည်ပြုပြီး ဖွင့်မည်' : 'Verify and Enable'}
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
    const { locale } = useLocale();
    const { toast } = useToast();
    const isMyanmar = locale === 'my';
    const [copied, setCopied] = useState(false);

    const handleCopyAll = async () => {
        const success = await copyToClipboard(
            codes.join('\n'),
            isMyanmar ? 'ကူးယူပြီးပါပြီ' : 'Copied',
            isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များကို ကူးယူရေးဘုတ်သို့ ကူးယူပြီးပါပြီ။' : 'Recovery codes copied to clipboard.',
        );
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
                        {isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များကို သိမ်းထားပါ' : 'Save Your Recovery Codes'}
                    </DialogTitle>
                    <DialogDescription>
                        {isMyanmar
                            ? 'ဤကုဒ်များကို လုံခြုံသောနေရာတွင် သိမ်းထားပါ။ Authenticator မရရှိတော့ပါက အကောင့်ဝင်ရန် အသုံးပြုနိုင်သည်။'
                            : 'Store these codes in a safe place. You can use them to access your account if you lose your authenticator.'}
                    </DialogDescription>
                </DialogHeader>

                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{isMyanmar ? 'အရေးကြီးသည်' : 'Important'}</AlertTitle>
                    <AlertDescription>
                        {isMyanmar
                            ? 'ဤကုဒ်များကို တစ်ကြိမ်သာ ပြသမည်ဖြစ်သည်။ ယခုပဲ သိမ်းထားပါ။'
                            : 'These codes will only be shown once. Make sure to save them now.'}
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
                        {copied
                            ? (isMyanmar ? 'ကူးယူပြီးပါပြီ!' : 'Copied!')
                            : (isMyanmar ? 'အားလုံး ကူးယူမည်' : 'Copy All')}
                    </Button>
                    <Button onClick={() => onOpenChange(false)}>
                        {isMyanmar ? 'ကုဒ်များကို သိမ်းပြီးပါပြီ' : 'I have saved my codes'}
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
    const { locale } = useLocale();
    const { toast } = useToast();
    const isMyanmar = locale === 'my';
    const [code, setCode] = useState('');

    const disableMutation = trpc.security.disableTotp.useMutation({
        onSuccess: () => {
            toast({
                title: isMyanmar ? 'နှစ်ဆအတည်ပြုမှုကို ပိတ်လိုက်ပါပြီ' : '2FA Disabled',
                description: isMyanmar
                    ? 'နှစ်ဆအတည်ပြု လုံခြုံရေးကို ပိတ်လိုက်ပါပြီ။'
                    : 'Two-factor authentication has been disabled.',
            });
            onSuccess();
            onOpenChange(false);
            setCode('');
        },
        onError: (err) => toast({
            title: isMyanmar ? 'အမှား ဖြစ်ပွားပါသည်' : 'Error',
            description: err.message,
            variant: 'destructive',
        }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isMyanmar ? 'နှစ်ဆအတည်ပြုမှုကို ပိတ်မည်' : 'Disable Two-Factor Authentication'}</DialogTitle>
                    <DialogDescription>
                        {isMyanmar
                            ? 'နှစ်ဆအတည်ပြုစနစ်ကို ပိတ်ရန် လက်ရှိ အတည်ပြုအက်ပ်ကုဒ်ကို ထည့်ပါ။'
                            : 'Enter your current authenticator code to disable 2FA.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="disable-code">{isMyanmar ? 'အတည်ပြုကုဒ်' : 'Verification Code'}</Label>
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
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {isMyanmar ? 'မလုပ်တော့ပါ' : 'Cancel'}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => disableMutation.mutate({ code })}
                        disabled={disableMutation.isPending || code.length !== 6}
                    >
                        {disableMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isMyanmar ? 'နှစ်ဆအတည်ပြုစနစ်ကို ပိတ်မည်' : 'Disable 2FA'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function WebAuthnSection() {
    const { locale } = useLocale();
    const { toast } = useToast();
    const isMyanmar = locale === 'my';
    const [deletingCredentialId, setDeletingCredentialId] = useState<string | null>(null);
    const [credentialToDelete, setCredentialToDelete] = useState<{ id: string; name: string } | null>(null);

    const { data: status, refetch } = trpc.security.get2FAStatus.useQuery();

    const generateRegOptionsMutation = trpc.security.generateWebAuthnRegistrationOptions.useMutation();
    const verifyRegMutation = trpc.security.verifyWebAuthnRegistration.useMutation({
        onSuccess: () => {
            toast({
                title: isMyanmar ? 'ဝင်ရောက်သော့ ထည့်ပြီးပါပြီ' : 'Passkey Added',
                description: isMyanmar ? 'သင့် ဝင်ရောက်သော့ကို မှတ်ပုံတင်ပြီးပါပြီ။' : 'Your passkey has been registered.',
            });
            refetch();
        },
        onError: (err) => toast({
            title: isMyanmar ? 'အမှား ဖြစ်ပွားပါသည်' : 'Error',
            description: err.message,
            variant: 'destructive',
        }),
    });

    const deleteCredMutation = trpc.security.deleteWebAuthnCredential.useMutation({
        onSuccess: () => {
            toast({ title: isMyanmar ? 'ဝင်ရောက်သော့ ဖယ်ရှားပြီးပါပြီ' : 'Passkey Removed' });
            setDeletingCredentialId(null);
            refetch();
        },
        onError: (err) => {
            setDeletingCredentialId(null);
            toast({
                title: isMyanmar ? 'အမှား ဖြစ်ပွားပါသည်' : 'Error',
                description: err.message,
                variant: 'destructive',
            });
        },
    });

    const handleRegisterPasskey = async () => {
        try {
            const options = await generateRegOptionsMutation.mutateAsync();

            const credential = await startRegistration({ optionsJSON: options });

            await verifyRegMutation.mutateAsync({
                response: credential,
                name: isMyanmar ? 'လုံခြုံရေး သော့' : 'Security Key',
            });
        } catch (err) {
            if (err instanceof Error && err.name !== 'NotAllowedError') {
                toast({
                    title: isMyanmar ? 'မှတ်ပုံတင်မှု မအောင်မြင်ပါ' : 'Registration Failed',
                    description: err.message,
                    variant: 'destructive',
                });
            }
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    {isMyanmar ? 'ဝင်ရောက်သော့များ' : 'Passkeys (WebAuthn)'}
                </CardTitle>
                <CardDescription>
                    {isMyanmar
                        ? 'Biometric, လုံခြုံရေးသော့ သို့မဟုတ် စက်တွင်း authenticator ကို အသုံးပြုပါ။'
                        : 'Use biometrics, security keys, or your device&apos;s built-in authenticator.'}
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
                            {isMyanmar ? 'ထည့်သွင်းခဲ့သော နေ့ ' : 'Added '}{new Date(cred.createdAt).toLocaleDateString()}
                                            {cred.lastUsedAt && (isMyanmar
                                                ? ` • နောက်ဆုံး အသုံးပြုချိန် ${new Date(cred.lastUsedAt).toLocaleDateString()}`
                                                : ` - Last used ${new Date(cred.lastUsedAt).toLocaleDateString()}`)}
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
                        {isMyanmar
                            ? 'ဝင်ရောက်သော့ မမှတ်ပုံတင်ရသေးပါ။ စကားဝှက်မလိုဘဲ ဝင်နိုင်ရန် ဝင်ရောက်သော့တစ်ခု ထည့်ပါ။'
                            : 'No passkeys registered. Add a passkey for passwordless sign-in.'}
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
                            {isMyanmar ? 'ဝင်ရောက်သော့ ထည့်နေသည်…' : 'Adding Passkey...'}
                        </>
                    ) : (
                        <>
                            <Plus className="h-4 w-4 mr-2" />
                            {isMyanmar ? 'ဝင်ရောက်သော့ ထည့်မည်' : 'Add Passkey'}
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
                title={isMyanmar ? 'ဝင်ရောက်သော့ ဖယ်ရှားမည်' : 'Remove passkey'}
                description={
                    credentialToDelete
                        ? (isMyanmar
                            ? `ဤအကောင့်မှ "${credentialToDelete.name}" ဝင်ရောက်သော့ကို ဖယ်ရှားမလား။`
                            : `Remove "${credentialToDelete.name}" from this account?`)
                        : ''
                }
                confirmLabel={isMyanmar ? 'ဝင်ရောက်သော့ကို ဖယ်ရှားမည်' : 'Remove passkey'}
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
    const router = useRouter();
    const { locale, t } = useLocale();
    const { toast } = useToast();
    const isMyanmar = locale === 'my';

    const [setupDialogOpen, setSetupDialogOpen] = useState(false);
    const [recoveryCodesDialogOpen, setRecoveryCodesDialogOpen] = useState(false);
    const [disableDialogOpen, setDisableDialogOpen] = useState(false);
    const [recoveryPromptOpen, setRecoveryPromptOpen] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

    const { data: status, isLoading, refetch } = trpc.security.get2FAStatus.useQuery();
    const sessionsQuery = trpc.security.listAccountSessions.useQuery();

    const updateAdminPolicyMutation = trpc.security.updateAdmin2FAPolicy.useMutation({
        onSuccess: () => {
            toast({
                title: isMyanmar ? 'စီမံခန့်ခွဲသူ မူဝါဒကို သိမ်းပြီးပါပြီ' : 'Admin policy updated',
                description: isMyanmar
                    ? 'စီမံခန့်ခွဲသူများအတွက် နှစ်ဆအတည်ပြု လိုအပ်ချက်ကို သိမ်းပြီးပါပြီ။'
                    : 'Admin two-factor authentication requirements have been saved.',
            });
            refetch();
        },
        onError: (err) => toast({
            title: isMyanmar ? 'အမှား ဖြစ်ပွားပါသည်' : 'Error',
            description: err.message,
            variant: 'destructive',
        }),
    });

    const revokeSessionMutation = trpc.security.revokeAccountSession.useMutation({
        onSuccess: (data) => {
            sessionsQuery.refetch();
            toast({
                title: data.revokedCurrent
                    ? (isMyanmar ? 'လက်ရှိ ချိတ်ဆက်ဝင်ရောက်မှုကို ပိတ်လိုက်ပါပြီ' : 'Session revoked')
                    : (isMyanmar ? 'ချိတ်ဆက်ဝင်ရောက်မှုကို ဖယ်ရှားလိုက်ပါပြီ' : 'Session removed'),
                description: data.revokedCurrent
                    ? (isMyanmar ? 'လက်ရှိ ချိတ်ဆက်ဝင်ရောက်မှုကို ပိတ်လိုက်ပါပြီ။ ပြန်လည် ဝင်ရောက်ပါ။' : 'The current session was revoked. Please sign in again.')
                    : (isMyanmar ? 'ရွေးထားသော ချိတ်ဆက်ဝင်ရောက်မှုကို ပိတ်လိုက်ပါပြီ။' : 'The selected session has been revoked.'),
            });

            if (data.revokedCurrent) {
                router.push('/login?reason=session_revoked');
            }
        },
        onError: (err) => toast({
            title: isMyanmar ? 'အမှား ဖြစ်ပွားပါသည်' : 'Error',
            description: err.message,
            variant: 'destructive',
        }),
    });

    const revokeOtherSessionsMutation = trpc.security.revokeOtherAccountSessions.useMutation({
        onSuccess: (data) => {
            sessionsQuery.refetch();
            toast({
                title: isMyanmar ? 'အခြား ချိတ်ဆက်ဝင်ရောက်မှုများကို ပိတ်လိုက်ပါပြီ' : 'Other sessions revoked',
                description: data.revokedCount > 0
                    ? (isMyanmar
                        ? `အခြား session ${data.revokedCount} ခုကို ဖယ်ရှားလိုက်ပါပြီ။`
                        : `${data.revokedCount} session${data.revokedCount === 1 ? '' : 's'} removed.`)
                    : (isMyanmar ? 'အခြား အသက်ဝင်နေသော ချိတ်ဆက်ဝင်ရောက်မှု မတွေ့ပါ။' : 'No other active sessions were found.'),
            });
        },
        onError: (err) => toast({
            title: isMyanmar ? 'အမှား ဖြစ်ပွားပါသည်' : 'Error',
            description: err.message,
            variant: 'destructive',
        }),
    });

    const regenerateCodesMutation = trpc.security.regenerateRecoveryCodes.useMutation({
        onSuccess: (data) => {
            setRecoveryCodes(data.recoveryCodes);
            setRecoveryCodesDialogOpen(true);
            refetch();
        },
        onError: (err) => toast({
            title: isMyanmar ? 'အမှား ဖြစ်ပွားပါသည်' : 'Error',
            description: err.message,
            variant: 'destructive',
        }),
    });

    const handleSetupSuccess = (codes: string[]) => {
        setRecoveryCodes(codes);
        setRecoveryCodesDialogOpen(true);
        refetch();
    };

    const adminPolicy = status?.adminPolicy ?? null;
    const currentSession = useMemo(
        () => sessionsQuery.data?.find((session) => session.isCurrent) ?? null,
        [sessionsQuery.data],
    );

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
                <div className="grid gap-5">
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
                                {isMyanmar ? 'အကောင့်လုံခြုံရေး' : 'Account Security'}
                            </Badge>
                        </div>

                        <div className="space-y-3">
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                                {isMyanmar ? 'လုံခြုံရေး ထိန်းချုပ်မှုများ' : 'Security controls'}
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                                {isMyanmar
                                    ? 'အတည်ပြုကုဒ်များ၊ အရန်ဝင်ရောက်ရေး လုပ်ငန်းစဉ်များနှင့် hardware-backed ဝင်ရောက်သော့များဖြင့် dashboard ဝင်ရောက်ခွင့်ကို ကာကွယ်ပါ။'
                                    : 'Protect dashboard access with authenticator codes, recovery workflows, and hardware-backed passkeys.'}
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="ops-kpi-tile">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Authenticator</p>
                                <p className="mt-3 text-3xl font-semibold tracking-tight">{status?.totpEnabled ? (isMyanmar ? 'ဖွင့်ထား' : 'On') : (isMyanmar ? 'ပိတ်ထား' : 'Off')}</p>
                                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'ဝင်ရောက်မှုတိုင်းအတွက် အက်ပ်အခြေပြု အတည်ပြုမှု။' : 'App-based verification for every login.'}</p>
                            </div>
                            <div className="ops-kpi-tile">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များ' : 'Recovery codes'}</p>
                                <p className="mt-3 text-3xl font-semibold tracking-tight">{status?.recoveryCodesRemaining ?? 0}</p>
                                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များ ရရှိနိုင်သေးသည်။' : 'Fallback access codes still available.'}</p>
                            </div>
                            <div className="ops-kpi-tile">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Passkeys</p>
                                <p className="mt-3 text-3xl font-semibold tracking-tight">{status?.webAuthnCredentials?.length ?? 0}</p>
                                <p className="mt-2 text-sm text-muted-foreground">{isMyanmar ? 'ဟာ့ဒ်ဝဲ သို့မဟုတ် ဇီဝအချက်အလက် အခြေပြု ဝင်ရောက်နည်းလမ်းများ။' : 'Hardware or biometric sign-in methods.'}</p>
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
                                        <p className="ops-section-heading">{isMyanmar ? 'ကာကွယ်မှု အခြေအနေ' : 'Protection status'}</p>
                                        <h2 className="text-xl font-semibold">
                                            {status?.has2FA ? (isMyanmar ? 'ကာကွယ်ထားသည်' : 'Protected') : (isMyanmar ? 'ဂရုစိုက်ရန် လိုအပ်' : 'Needs attention')}
                                        </h2>
                                        <p className="text-sm leading-6 text-muted-foreground">
                                            {status?.has2FA
                                                ? isMyanmar
                                                    ? 'ဤအကောင့်အတွက် two-factor authentication ကို ဖွင့်ထားပါသည်။'
                                                    : 'Two-factor authentication is enabled for this account.'
                                                : isMyanmar
                                                    ? 'Dashboard လုံခြုံရေးကောင်းစေရန် ဒုတိယ factor အနည်းဆုံးတစ်ခု ထည့်ပါ။'
                                                    : 'Add at least one second factor to improve dashboard security.'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {status?.currentUserRole === 'ADMIN' && adminPolicy && (
                            <Card className="ops-panel">
                                <CardContent className="space-y-4 px-0 py-0">
                                    <div className="space-y-1">
                                        <p className="ops-section-heading">{isMyanmar ? 'စီမံခန့်ခွဲသူ မူဝါဒ' : 'Admin policy'}</p>
                                        <h2 className="text-xl font-semibold">{isMyanmar ? 'စီမံခန့်ခွဲသူများအတွက် နှစ်ဆအတည်ပြုစနစ် လိုအပ်သည်' : 'Require 2FA for admins'}</h2>
                                        <p className="text-sm leading-6 text-muted-foreground">
                                            {isMyanmar
                                                ? 'Administrator တိုင်း sign in မလုပ်ခင် second factor အနည်းဆုံးတစ်ခု ရှိရမည်ဟု သတ်မှတ်ပါ။'
                                                : 'Enforce at least one second factor for every administrator before they can sign in.'}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between rounded-[1.25rem] border border-border/60 bg-background/55 p-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">{isMyanmar ? 'စီမံခန့်ခွဲသူများအတွက် မဖြစ်မနေ နှစ်ဆအတည်ပြုစနစ်' : 'Mandatory admin 2FA'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {isMyanmar
                                                    ? `စီမံခန့်ခွဲသူ အကောင့် ${adminPolicy.adminCount} ခုအနက် ${adminPolicy.protectedAdminCount} ခုကို ကာကွယ်ထားပါသည်`
                                                    : `${adminPolicy.protectedAdminCount} of ${adminPolicy.adminCount} admin accounts protected`}
                                            </p>
                                        </div>
                                        <Switch
                                            checked={adminPolicy.required}
                                            disabled={updateAdminPolicyMutation.isPending || (!adminPolicy.required && !adminPolicy.canEnable)}
                                            onCheckedChange={(checked) => updateAdminPolicyMutation.mutate({ required: checked })}
                                        />
                                    </div>

                                    {!adminPolicy.canEnable && !adminPolicy.required && (
                                        <div className="rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-muted-foreground">
                                            {isMyanmar
                                                ? 'စီမံခန့်ခွဲသူတိုင်းတွင် ဒုတိယအတည်ပြုနည်းလမ်း အနည်းဆုံး တစ်ခု မရှိမချင်း ဤစနစ်ကို မဖွင့်နိုင်ပါ။ မကာကွယ်ရသေးသော အကောင့်များ:'
                                                : 'Enablement is blocked until every admin has at least one second factor. Missing coverage:'}
                                            <ul className="mt-2 space-y-1">
                                                {adminPolicy.unprotectedAdmins.map((admin) => (
                                                    <li key={admin.id} className="font-medium text-foreground/85">
                                                        {admin.email}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        <Card className="ops-panel">
                            <CardContent className="space-y-3 px-0 py-0">
                                <div className="space-y-1">
                                    <p className="ops-section-heading">{isMyanmar ? 'အမြန် လုပ်ဆောင်ချက်များ' : 'Quick actions'}</p>
                                    <h2 className="text-xl font-semibold">{t('dashboard.command_rail')}</h2>
                                </div>
                                {status?.totpEnabled ? (
                                    <Button variant="outline" className="w-full rounded-full" onClick={() => setDisableDialogOpen(true)}>
                                    {isMyanmar ? 'အတည်ပြုအက်ပ်ကို ပိတ်မည်' : 'Disable authenticator'}
                                    </Button>
                                ) : (
                                    <Button className="w-full rounded-full" onClick={() => setSetupDialogOpen(true)}>
                                        <QrCode className="mr-2 h-4 w-4" />
                                        {isMyanmar ? 'အတည်ပြုအက်ပ်ကို စတင်ပြင်ဆင်မည်' : 'Set up authenticator'}
                                    </Button>
                                )}
                                <Button variant="secondary" className="w-full rounded-full" onClick={() => setRecoveryPromptOpen(true)} disabled={!status?.totpEnabled}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    {isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များ ပြန်ထုတ်မည်' : 'Regenerate recovery codes'}
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
                            {isMyanmar ? 'အတည်ပြုကိရိယာ အက်ပ်' : 'Authenticator App'}
                        </CardTitle>
                        <CardDescription>
                        {isMyanmar
                            ? 'Google Authenticator၊ Authy သို့မဟုတ် 1Password ကဲ့သို့သော အတည်ပြုကိရိယာ အက်ပ်များကို သုံး၍ အတည်ပြုကုဒ်များ ထုတ်ယူပါ။'
                            : 'Use an authenticator app like Google Authenticator, Authy, or 1Password to generate verification codes.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 px-0 pb-0">
                    {status?.totpEnabled ? (
                        <>
                                <div className="flex items-center gap-3 rounded-[1.25rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                    {isMyanmar ? 'အတည်ပြုကိရိယာ အက်ပ်ကို ပြင်ဆင်ပြီးပါပြီ' : 'Authenticator app is configured'}
                                </span>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="ops-mini-tile">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များ' : 'Recovery codes'}</p>
                                    <p className="mt-2 text-sm font-medium">{isMyanmar ? `${status.recoveryCodesRemaining} ခု ကျန်ရှိသည်` : `${status.recoveryCodesRemaining} remaining`}</p>
                                </div>
                                <div className="ops-mini-tile">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isMyanmar ? 'အသုံးပြုပုံစံ' : 'Mode'}</p>
                                    <p className="mt-2 text-sm font-medium">{isMyanmar ? 'ကုဒ်ဖြင့် အတည်ပြုရမည်' : 'Code verification required'}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setDisableDialogOpen(true)}
                                >
                                    {isMyanmar ? 'အတည်ပြုကိရိယာကို ပိတ်မည်' : 'Disable Authenticator'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-muted-foreground">
                                {isMyanmar ? 'ဤအကောင့်ကို ယခုအချိန်တွင် စကားဝှက်ဖြင့်သာ ကာကွယ်ထားပါသည်။' : 'This account is currently protected only by password-based login.'}
                            </div>
                            <Button onClick={() => setSetupDialogOpen(true)}>
                            <QrCode className="h-4 w-4 mr-2" />
                            {isMyanmar ? 'အတည်ပြုအက်ပ်ကို ပြင်ဆင်မည်' : 'Set Up Authenticator App'}
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
                            {isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များ' : 'Recovery Codes'}
                        </CardTitle>
                            <CardDescription>
                            {isMyanmar
                                ? 'အတည်ပြုကိရိယာ အက်ပ်ကို မသုံးနိုင်တော့ပါက ဤအရန်ဝင်ရောက်ရေးကုဒ်များဖြင့် အကောင့်ထဲသို့ ဝင်ရောက်နိုင်ပါသည်။'
                                : 'Recovery codes can be used to access your account if you lose access to your authenticator app.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 px-0 pb-0">
                        <div className="flex items-center gap-3 rounded-[1.25rem] border border-border/60 bg-background/55 p-4">
                            <Badge variant={status.recoveryCodesRemaining > 3 ? 'default' : 'destructive'}>
                                {isMyanmar ? `${status.recoveryCodesRemaining} ခု ကျန်ရှိ` : `${status.recoveryCodesRemaining} remaining`}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                                {status.recoveryCodesRemaining === 0
                                    ? (isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ် မကျန်တော့ပါ။ အသစ်ပြန်ထုတ်ပါ။' : 'No recovery codes left! Generate new ones.')
                                    : status.recoveryCodesRemaining <= 3
                                    ? (isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ် အရေအတွက် နည်းနေပါပြီ။' : 'Running low on recovery codes.')
                                    : (isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များ အသုံးပြုနိုင်သေးပါသည်။' : 'Recovery codes available.')}
                            </span>
                        </div>

                        <Button
                            variant="outline"
                            onClick={() => setRecoveryPromptOpen(true)}
                            disabled={regenerateCodesMutation.isPending}
                        >
                            {regenerateCodesMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များ ပြန်ထုတ်မည်' : 'Regenerate Recovery Codes'}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* WebAuthn Section */}
            <WebAuthnSection />
                </div>
            </div>

            <Card className="ops-panel">
                <CardHeader className="px-0 pt-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Monitor className="h-5 w-5" />
                                {isMyanmar ? 'အသက်ဝင်နေသော ချိတ်ဆက်ဝင်ရောက်မှုများ' : 'Active Sessions'}
                            </CardTitle>
                            <CardDescription>
                                {isMyanmar
                                    ? 'ဤအကောင့် ဝင်ရောက်ထားသည့် နေရာများကို စစ်ဆေးပြီး မယုံကြည်တော့သော ချိတ်ဆက်ဝင်ရောက်မှုများကို ပိတ်ပါ။'
                                    : 'Review where this account is signed in and revoke sessions you no longer trust.'}
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => revokeOtherSessionsMutation.mutate()}
                            disabled={revokeOtherSessionsMutation.isPending || !sessionsQuery.data?.some((session) => !session.isCurrent)}
                        >
                            {revokeOtherSessionsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <LogOut className="mr-2 h-4 w-4" />
                            {isMyanmar ? 'အခြား ချိတ်ဆက်ဝင်ရောက်မှုများကို ပိတ်မည်' : 'Revoke Other Sessions'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 px-0 pb-0">
                    {currentSession && (
                        <div className="rounded-[1.25rem] border border-primary/20 bg-primary/10 p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                                    <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                                    {isMyanmar ? 'လက်ရှိ ချိတ်ဆက်ဝင်ရောက်မှု' : 'Current Session'}
                                </Badge>
                                <span className="text-sm font-medium">{currentSession.label}</span>
                                <span className="text-sm text-muted-foreground">{currentSession.ip ?? (isMyanmar ? 'IP မသိရပါ' : 'IP unavailable')}</span>
                            </div>
                        </div>
                    )}

                    {sessionsQuery.isLoading ? (
                        <SurfaceSkeleton className="min-h-[180px]" lines={4} />
                    ) : sessionsQuery.data && sessionsQuery.data.length > 0 ? (
                        <div className="space-y-3">
                            {sessionsQuery.data.map((session) => (
                                <div
                                    key={session.id}
                                    className="flex flex-col gap-4 rounded-[1.25rem] border border-border/60 bg-background/55 p-4 lg:flex-row lg:items-center lg:justify-between"
                                >
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium">{session.label}</p>
                                            {session.isCurrent && <Badge>{isMyanmar ? 'လက်ရှိ' : 'Current'}</Badge>}
                                            <Badge variant="outline">{session.os}</Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            <p>{session.ip ?? (isMyanmar ? 'IP မသိရပါ' : 'IP unavailable')}</p>
                                            <p>{isMyanmar ? 'စတင်ချိန်' : 'Created'} {new Date(session.createdAt).toLocaleString()}</p>
                                            <p>{isMyanmar ? 'သက်တမ်းကုန်ချိန်' : 'Expires'} {new Date(session.expiresAt).toLocaleString()}</p>
                                            {session.userAgent && (
                                                <p className="truncate max-w-[48rem]">{session.userAgent}</p>
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        variant={session.isCurrent ? 'destructive' : 'outline'}
                                        onClick={() => revokeSessionMutation.mutate({ sessionId: session.id })}
                                        disabled={revokeSessionMutation.isPending}
                                    >
                                        {revokeSessionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {isMyanmar ? 'ချိတ်ဆက်ဝင်ရောက်မှုကို ပိတ်မည်' : 'Revoke Session'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[1.25rem] border border-border/60 bg-background/55 p-6 text-sm text-muted-foreground">
                            {isMyanmar ? 'ဤအကောင့်အတွက် အသက်ဝင်နေသော ချိတ်ဆက်ဝင်ရောက်မှု မတွေ့ပါ။' : 'No active sessions found for this account.'}
                        </div>
                    )}
                </CardContent>
            </Card>

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
                title={isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ်များ ပြန်ထုတ်မည်' : 'Regenerate recovery codes'}
                description={isMyanmar ? 'အရန်ဝင်ရောက်ရေးကုဒ် အသစ်တစ်စုံ ထုတ်ရန် လက်ရှိ အတည်ပြုကိရိယာ ကုဒ်ကို ထည့်ပါ။' : 'Enter your current authenticator code to generate a fresh set of recovery codes.'}
                confirmLabel={isMyanmar ? 'ကုဒ်အသစ်များ ထုတ်မည်' : 'Generate new codes'}
                loading={regenerateCodesMutation.isPending}
                onSubmit={(code) => regenerateCodesMutation.mutate({ code })}
            />
        </div>
    );
}
