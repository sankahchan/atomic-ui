'use client';

/**
 * Two-Factor Authentication Verification Page
 *
 * This page is shown after successful password login when 2FA is enabled.
 * Users can verify via:
 * - TOTP code from authenticator app
 * - Recovery code
 * - WebAuthn passkey (coming soon)
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Loader2, Shield, KeyRound, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

function Verify2FAContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const tempToken = searchParams.get('token');
  const totpEnabled = searchParams.get('totp') === 'true';
  const webAuthnEnabled = searchParams.get('webauthn') === 'true';

  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [activeTab, setActiveTab] = useState<'totp' | 'recovery'>(totpEnabled ? 'totp' : 'recovery');

  useEffect(() => {
    router.prefetch('/dashboard');
    router.prefetch('/portal');
    router.prefetch('/login');
  }, [router]);

  // Redirect if no temp token
  useEffect(() => {
    if (!tempToken) {
      router.push('/login');
    }
  }, [tempToken, router]);

  // 2FA verification mutation
  const verify2FAMutation = trpc.auth.verify2FA.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Welcome back!',
        description: 'Two-factor authentication successful.',
      });

      if (data.role === 'ADMIN') {
        router.push('/dashboard');
      } else {
        router.push('/portal');
      }
      router.refresh();
    },
    onError: (error) => {
      toast({
        title: 'Verification failed',
        description: error.message || 'Invalid code. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!totpCode.trim() || totpCode.length !== 6) {
      toast({
        title: 'Validation error',
        description: 'Please enter a 6-digit code.',
        variant: 'destructive',
      });
      return;
    }

    if (!tempToken) return;

    verify2FAMutation.mutate({
      tempToken,
      totpCode,
    });
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recoveryCode.trim()) {
      toast({
        title: 'Validation error',
        description: 'Please enter a recovery code.',
        variant: 'destructive',
      });
      return;
    }

    if (!tempToken) return;

    verify2FAMutation.mutate({
      tempToken,
      recoveryCode,
    });
  };

  const handleBackToLogin = () => {
    router.push('/login');
  };

  if (!tempToken) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#dce9f5] dark:bg-[#101828] transition-colors duration-500" />

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Back button */}
      <Button
        variant="ghost"
        onClick={handleBackToLogin}
        className="absolute top-4 left-4 z-20"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Login
      </Button>

      {/* 2FA Card */}
      <Card
        className={cn(
          'w-full max-w-md mx-4 relative z-10',
          'bg-white/90 dark:bg-[#1e2a3b]/95',
          'backdrop-blur-xl',
          'border border-gray-200/50 dark:border-gray-700/50',
          'rounded-2xl shadow-xl'
        )}
      >
        <CardHeader className="space-y-4 text-center pt-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Shield className="h-8 w-8 text-blue-500" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-gray-800 dark:text-white">
              Two-Factor Authentication
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400 mt-2">
              Enter your verification code to continue
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pb-8">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'totp' | 'recovery')}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="totp" disabled={!totpEnabled}>
                <KeyRound className="h-4 w-4 mr-2" />
                Authenticator
              </TabsTrigger>
              <TabsTrigger value="recovery">
                <Shield className="h-4 w-4 mr-2" />
                Recovery Code
              </TabsTrigger>
            </TabsList>

            <TabsContent value="totp">
              <form onSubmit={handleTotpSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="totp-code"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Authenticator Code
                  </Label>
                  <Input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    disabled={verify2FAMutation.isPending}
                    className={cn(
                      'text-center text-2xl tracking-[0.5em] font-mono h-14',
                      'bg-gray-50/80 dark:bg-white/5',
                      'border-gray-200 dark:border-gray-600',
                      'focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20'
                    )}
                    autoComplete="one-time-code"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>

                <Button
                  type="submit"
                  className={cn(
                    'w-full h-12 rounded-[30px]',
                    'bg-blue-500 hover:bg-blue-600',
                    'text-white font-medium',
                    'shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40',
                    'transition-all duration-200'
                  )}
                  disabled={verify2FAMutation.isPending || totpCode.length !== 6}
                >
                  {verify2FAMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify'
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="recovery">
              <form onSubmit={handleRecoverySubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="recovery-code"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Recovery Code
                  </Label>
                  <Input
                    id="recovery-code"
                    type="text"
                    placeholder="XXXX-XXXX"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                    disabled={verify2FAMutation.isPending}
                    className={cn(
                      'text-center text-lg tracking-widest font-mono h-14',
                      'bg-gray-50/80 dark:bg-white/5',
                      'border-gray-200 dark:border-gray-600',
                      'focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20'
                    )}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                    Enter one of your recovery codes. Each code can only be used once.
                  </p>
                </div>

                <Button
                  type="submit"
                  className={cn(
                    'w-full h-12 rounded-[30px]',
                    'bg-blue-500 hover:bg-blue-600',
                    'text-white font-medium',
                    'shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40',
                    'transition-all duration-200'
                  )}
                  disabled={verify2FAMutation.isPending || !recoveryCode.trim()}
                >
                  {verify2FAMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Use Recovery Code'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Verify2FAPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#dce9f5] dark:bg-[#101828]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    }>
      <Verify2FAContent />
    </Suspense>
  );
}
