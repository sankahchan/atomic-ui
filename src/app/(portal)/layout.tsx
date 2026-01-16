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
import { Atom, LogOut, Moon, Sun, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { LanguageSelector } from '@/components/ui/language-selector';
import { Loader2 } from 'lucide-react';

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
        <header className="sticky top-0 z-40 h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl">
            <div className="container h-full mx-auto px-4 flex items-center justify-between">
                {/* Logo */}
                <Link href="/portal" className="flex items-center gap-3">
                    <div className="relative w-8 h-8 flex items-center justify-center">
                        <Atom className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-lg font-bold text-gradient-atomic">
                        Atomic-UI
                    </span>
                </Link>

                {/* Right side controls */}
                <div className="flex items-center gap-4">
                    {mounted && (
                        <div className="flex items-center gap-1">
                            <LanguageSelector />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
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
                        <div className="flex items-center gap-4">
                            <div className="hidden sm:block text-sm text-right">
                                <p className="font-medium leading-none">{user.email}</p>
                                <p className="text-xs text-muted-foreground mt-1">client</p>
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onLogout}
                                className="text-muted-foreground hover:text-foreground"
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
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (hasError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <p className="text-destructive">Failed to load user session.</p>
                <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-background">
            <PortalHeader user={user} onLogout={() => logoutMutation.mutate()} />
            <main className="container mx-auto px-4 py-8">
                {children}
            </main>
        </div>
    );
}
