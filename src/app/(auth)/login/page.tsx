'use client';

/**
 * Login Page (X-UI Styled)
 *
 * Combines Atomic-UI features with X-UI visual design:
 * - Animated atomic logo (kept from original)
 * - Animated wave background (from x-ui)
 * - Light/Dark theme toggle
 * - Language selector with flag icons
 * - Rounded inputs with icon prefixes
 * - Card hover effect
 * - Responsive design
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/hooks/use-locale';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageSelector } from '@/components/ui/language-selector';
import { Loader2, Eye, EyeOff, User, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * AtomicLogo Component
 *
 * Animated atomic symbol with orbiting electrons.
 * This serves as the brand identity for the application.
 */
function AtomicLogo() {
  return (
    <div className="relative w-24 h-24 mx-auto mb-6">
      {/* Central nucleus */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-5 h-5 bg-blue-500 dark:bg-blue-400 rounded-full animate-pulse shadow-lg shadow-blue-500/50" />
      </div>

      {/* Orbiting electrons - three orbital rings */}
      <div className="absolute inset-0 animate-spin-slow">
        <div className="absolute inset-0 border-2 border-blue-400/40 dark:border-blue-300/30 rounded-full" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 dark:bg-blue-400 rounded-full shadow-md shadow-blue-500/50" />
      </div>

      <div
        className="absolute inset-0 animate-spin-slow"
        style={{ animationDirection: 'reverse', animationDuration: '4s' }}
      >
        <div className="absolute inset-2 border-2 border-blue-300/30 dark:border-blue-400/20 rounded-full rotate-45" />
        <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-400/80 dark:bg-blue-300/70 rounded-full" />
      </div>

      <div className="absolute inset-0 animate-spin-slow" style={{ animationDuration: '5s' }}>
        <div className="absolute inset-4 border-2 border-blue-200/20 dark:border-blue-400/10 rounded-full -rotate-45" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2.5 h-2.5 bg-blue-300/60 dark:bg-blue-200/50 rounded-full" />
      </div>
    </div>
  );
}

/**
 * WaveBackground Component
 *
 * Animated wave layers inspired by x-ui design.
 * Creates a dynamic, visually appealing background.
 */
function WaveBackground() {
  return (
    <>
      {/* Base gradient background - light blue for light mode, dark blue for dark mode */}
      <div className="absolute inset-0 bg-[#dce9f5] dark:bg-[#101828] transition-colors duration-500" />

      {/* Wave layer 1 - slowest, largest */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-[200%] h-[200%] -top-1/2 -left-1/2 rounded-[40%] opacity-80"
          style={{
            background:
              'linear-gradient(180deg, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.04) 100%)',
            animation: 'wave-rotate 25s linear infinite',
          }}
        />
      </div>

      {/* Wave layer 2 - medium speed, reversed */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-[200%] h-[200%] -top-1/2 -left-1/2 rounded-[45%] opacity-70"
          style={{
            background:
              'linear-gradient(180deg, rgba(147, 197, 253, 0.1) 0%, rgba(147, 197, 253, 0.02) 100%)',
            animation: 'wave-rotate 20s linear infinite reverse',
          }}
        />
      </div>

      {/* Wave layer 3 - fastest, smallest opacity */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-[200%] h-[200%] -top-1/2 -left-1/2 rounded-[42%] opacity-50"
          style={{
            background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.08) 0%, transparent 100%)',
            animation: 'wave-rotate 18s linear infinite',
          }}
        />
      </div>
    </>
  );
}

/**
 * LoginPage Component
 *
 * Main login page with x-ui styling.
 */
export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t, mounted } = useLocale();

  // Form state management
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Login mutation using tRPC
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast({
        title: mounted ? t('login.welcome') : 'Welcome back!',
        description: mounted ? t('login.success') : 'You have been successfully logged in.',
      });
      router.push('/dashboard');
      router.refresh();
    },
    onError: (error) => {
      toast({
        title: mounted ? t('login.failed') : 'Login failed',
        description: error.message || (mounted ? t('login.invalid') : 'Invalid email or password.'),
        variant: 'destructive',
      });
    },
  });

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast({
        title: mounted ? t('login.validation_error') : 'Validation error',
        description: mounted ? t('login.enter_both') : 'Please enter both email and password.',
        variant: 'destructive',
      });
      return;
    }

    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated wave background */}
      <WaveBackground />

      {/* Top-right controls: Theme toggle and Language selector */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSelector />
      </div>

      {/* Login card with X-UI styling */}
      <Card
        className={cn(
          'w-full max-w-md mx-4 relative z-10',
          'bg-white/90 dark:bg-[#1e2a3b]/95',
          'backdrop-blur-xl',
          'border border-gray-200/50 dark:border-gray-700/50',
          'rounded-2xl shadow-xl',
          'transition-all duration-300 ease-out',
          'hover:shadow-2xl hover:shadow-blue-500/10',
          'hover:-translate-y-1'
        )}
      >
        <CardHeader className="space-y-4 text-center pt-8">
          {/* Animated atomic logo */}
          <AtomicLogo />

          {/* App title */}
          <div>
            <CardTitle className="text-3xl font-bold text-gray-800 dark:text-white">
              {mounted ? t('login.title') : 'Atomic-UI'}
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400 mt-2">
              {mounted ? t('login.subtitle') : 'Outline VPN Management Panel'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email field with icon prefix */}
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {mounted ? t('login.username') : 'Username or Email'}
              </Label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <Input
                  id="email"
                  type="text"
                  placeholder={mounted ? t('login.username.placeholder') : 'Enter your email or username'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loginMutation.isPending}
                  className={cn(
                    'rounded-[30px] pl-12 pr-4 h-12',
                    'bg-gray-50/80 dark:bg-white/5',
                    'border-gray-200 dark:border-gray-600',
                    'focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20',
                    'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                    'transition-all duration-200'
                  )}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password field with icon prefix and visibility toggle */}
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {mounted ? t('login.password') : 'Password'}
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mounted ? t('login.password.placeholder') : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loginMutation.isPending}
                  className={cn(
                    'rounded-[30px] pl-12 pr-12 h-12',
                    'bg-gray-50/80 dark:bg-white/5',
                    'border-gray-200 dark:border-gray-600',
                    'focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20',
                    'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                    'transition-all duration-200'
                  )}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={cn(
                    'absolute right-4 top-1/2 -translate-y-1/2',
                    'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                    'transition-colors duration-150'
                  )}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              className={cn(
                'w-full h-12 mt-6 rounded-[30px]',
                'bg-blue-500 hover:bg-blue-600',
                'text-white font-medium',
                'shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40',
                'transition-all duration-200'
              )}
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {mounted ? t('login.signing_in') : 'Signing in...'}
                </>
              ) : (
                <>{mounted ? t('login.submit') : 'Sign in'}</>
              )}
            </Button>
          </form>

          {/* Footer text */}
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
            {mounted ? t('login.default_credentials') : 'Default credentials: admin / admin123'}
          </p>
        </CardContent>
      </Card>

      {/* Version badge */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-400 dark:text-gray-600 z-10">
        Atomic-UI v1.0.0
      </div>
    </div>
  );
}
