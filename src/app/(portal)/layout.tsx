'use client';

/**
 * Portal Layout
 * 
 * A simplified layout for the user portal.
 * Features a clean top navigation bar without a sidebar.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Atom, LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { LanguageSelector } from '@/components/ui/language-selector';
import { Loader2 } from 'lucide-react';
import { GradientMeshBackground } from '@/components/layout/gradient-mesh-bg';

function PortalHeader({
    user,
    onLogout,
}: {
    user: { email: string; role: string } | null;
    onLogout: () => void;
}) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <header className="sticky top-0 z-40 px-4 pt-4 md:px-6 lg:px-8 lg:pt-6">
            <div className="ops-topbar mx-auto flex h-auto max-w-[1680px] items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-5">
                {/* Logo */}
                <Link href="/portal" className="flex min-w-0 items-center gap-3">
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-[1.3rem] border border-white/50 bg-white/55 shadow-[0_12px_28px_rgba(148,163,184,0.18)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_16px_34px_rgba(0,0,0,0.28)]">
                        <Atom className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <span className="block truncate text-base font-bold text-foreground">
                            Atomic-UI Portal
                        </span>
                        <span className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                            Frosted access
                        </span>
                    </div>
                </Link>

                {/* Right side controls */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {mounted && (
                        <div className="flex items-center gap-1">
                            <LanguageSelector />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                                className="ops-icon-button-shell h-10 w-10"
                            >
                                {theme === 'dark' ? (
                                    <Sun className="h-5 w-5" />
                                ) : (
                                    <Moon className="h-5 w-5" />
                                )}
                            </Button>
                        </div>
                    )}

                    {user && (
                        <div className="flex items-center gap-3">
                            <div className="hidden rounded-full border border-white/45 bg-white/45 px-3 py-2 text-sm shadow-[0_12px_26px_rgba(148,163,184,0.16)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_16px_32px_rgba(0,0,0,0.24)] sm:block">
                                <p className="font-medium leading-none">{user.email}</p>
                                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">client</p>
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onLogout}
                                className="ops-icon-button-shell h-10 w-10 text-muted-foreground hover:text-foreground"
                                title="Logout"
                            >
                                <LogOut className="h-5 w-5" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

export default function PortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { toast } = useToast();
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        router.prefetch('/portal');
        router.prefetch('/login');
        router.prefetch('/dashboard');
    }, [router]);

    const { data: user, isLoading, isError, error } = trpc.auth.me.useQuery(undefined, {
        retry: 1,
        retryDelay: 500,
    });

    const logoutMutation = trpc.auth.logout.useMutation({
        onSuccess: () => {
            toast({
                title: 'Logged out',
                description: 'You have been successfully logged out.',
            });
            router.push('/login');
            router.refresh(); // Refresh to update middleware state
        },
    });

    useEffect(() => {
        if (isError && error) {
            console.error('Portal auth error:', error);
            setHasError(true);
        }
    }, [isError, error]);

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
                <GradientMeshBackground />
                <div className="relative z-10 flex items-center gap-3 rounded-full border border-white/45 bg-white/55 px-5 py-3 text-sm font-medium shadow-[0_20px_42px_rgba(148,163,184,0.22)] backdrop-blur-[24px] dark:border-white/10 dark:bg-white/[0.05] dark:shadow-[0_26px_52px_rgba(0,0,0,0.34)]">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Loading portal
                </div>
            </div>
        );
    }

    if (hasError) {
        return (
            <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-background px-4">
                <GradientMeshBackground />
                <div className="ops-empty-state relative z-10 max-w-md">
                    <p className="text-destructive">Failed to load user session.</p>
                    <Button onClick={() => router.refresh()}>Retry</Button>
                </div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="relative min-h-screen overflow-hidden bg-background">
            <GradientMeshBackground />
            <PortalHeader user={user} onLogout={() => logoutMutation.mutate()} />
            <main className="relative z-10 px-4 pb-12 pt-6 md:px-6 lg:px-8">
                <div className="ops-page">
                    {children}
                </div>
            </main>
        </div>
    );
}
