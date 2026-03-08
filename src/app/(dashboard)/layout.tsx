'use client';

/**
 * Dashboard Layout
 *
 * Main layout for all authenticated pages in Atomic-UI.
 * Features a glassmorphism design with:
 * - Collapsible glass sidebar (desktop)
 * - Bottom tab bar navigation (mobile)
 * - Animated gradient mesh background
 * - Glass-styled header
 */

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  LogOut,
  ChevronLeft,
  Atom,
  Moon,
  Sun,
  User,
  LayoutGrid,
} from 'lucide-react';

import { useTheme } from 'next-themes';
import { LanguageSelector } from '@/components/ui/language-selector';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { NotificationBell } from '@/components/notification-bell';
import { BottomTabBar } from '@/components/layout/bottom-tab-bar';
import { GradientMeshBackground } from '@/components/layout/gradient-mesh-bg';
import { MoreMenu } from '@/components/layout/more-menu';
import { useLocale } from '@/hooks/use-locale';
import {
  adminToolNavItems,
  primaryDashboardNavItems,
  settingsShortcutItems,
} from '@/components/layout/dashboard-nav';

/**
 * Navigation items for route prefetching.
 */
const navItems = [
  ...primaryDashboardNavItems,
  ...adminToolNavItems,
  ...settingsShortcutItems,
  { href: '/dashboard/tools' },
];

/**
 * Sidebar Component (Desktop only)
 *
 * Glass-styled collapsible sidebar with navigation links.
 */
function Sidebar({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col px-3 py-4 text-slate-100 glass-sidebar',
        'transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-20' : 'w-72'
      )}
    >
      {/* Logo and brand */}
      <div className="flex items-center justify-between rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4 shadow-[0_18px_40px_rgba(2,6,23,0.18)]">
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
            <Atom className="w-6 h-6 text-cyan-300" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <span className="block truncate text-lg font-bold text-white">
                Atomic-UI
              </span>
              <span className="block text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Control Center
              </span>
            </div>
          )}
        </Link>

        {/* Desktop collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="hidden rounded-2xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white lg:flex"
        >
          <ChevronLeft className={cn(
            'h-4 w-4 transition-transform',
            isCollapsed && 'rotate-180'
          )} />
        </Button>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto px-2 py-5">
        <ul className="space-y-1.5">
          {primaryDashboardNavItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'ops-sidebar-item',
                    isCollapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-gradient-to-r from-cyan-400/20 to-sky-400/10 text-cyan-200 shadow-[0_16px_30px_rgba(6,182,212,0.14)]'
                      : 'text-slate-300 hover:bg-white/6 hover:text-white'
                  )}
                  title={isCollapsed ? t(item.labelKey) : undefined}
                >
                  <item.icon className={cn(
                    'w-5 h-5 flex-shrink-0',
                    isActive ? 'text-cyan-300' : 'text-slate-400'
                  )} />
                  {!isCollapsed && (
                    <span className="text-sm font-medium">{t(item.labelKey)}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sidebar footer */}
      {!isCollapsed && (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 shadow-[0_16px_40px_rgba(2,6,23,0.16)]">
          <p className="text-center text-xs text-slate-400">
            v1.0.0 • sankahchan
          </p>
        </div>
      )}
    </aside>
  );
}

/**
 * Header Component
 *
 * Glass-styled header with theme toggle, notifications, and user actions.
 * No hamburger menu on mobile — bottom tab bar handles navigation instead.
 */
function Header({
  user,
  onLogout,
  onOpenTools,
}: {
  user: { email: string; role: string } | null;
  onLogout: () => void;
  onOpenTools: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 md:px-6 lg:px-8 lg:pt-6">
      <div className="ops-topbar">
        {/* Left side: Logo on mobile */}
        <div className="flex items-center gap-3 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 shadow-sm">
            <Atom className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Atomic-UI</span>
          </Link>
        </div>

        {/* Left side: tools button on desktop */}
        <div className="hidden lg:flex items-center">
          <Button variant="outline" size="sm" asChild className="rounded-full border-border/70 bg-background/65 px-4 shadow-sm">
            <Link href="/dashboard/tools">
              <LayoutGrid className="h-4 w-4 mr-2" />
              {t('nav.tools')}
            </Link>
          </Button>
        </div>

        {/* Right side: Theme toggle, user menu, logout */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenTools}
            title={t('nav.tools')}
            className="h-10 w-10 rounded-full border border-border/70 bg-background/70 shadow-sm lg:hidden"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>

          {mounted && (
            <>
              <LanguageSelector />
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                className="h-10 w-10 rounded-full border border-border/70 bg-background/70 shadow-sm"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </>
          )}

          {/* User info - desktop only */}
          {user && (
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 shadow-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{user.email}</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                {user.role}
              </span>
            </div>
          )}

          {/* Logout button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            title="Logout"
            className="h-10 w-10 rounded-full border border-border/70 bg-background/70 text-muted-foreground shadow-sm hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * DashboardLayout Component
 *
 * Main layout wrapper with glassmorphism design.
 * Desktop: Glass sidebar + header + content
 * Mobile: Header + content + bottom tab bar
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Warm route chunks for faster dashboard navigation.
  useEffect(() => {
    for (const item of navItems) {
      router.prefetch(item.href);
    }
    router.prefetch('/portal');
  }, [router]);

  // Fetch current user with error handling
  const { data: user, isLoading, isError, error } = trpc.auth.me.useQuery(undefined, {
    retry: 1,
    retryDelay: 500,
  });

  // Handle tRPC errors
  useEffect(() => {
    if (isError && error) {
      console.error('Dashboard auth error:', error);
      setHasError(true);
    }
  }, [isError, error]);

  // Logout mutation
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast({
        title: 'Logged out',
        description: 'You have been successfully logged out.',
      });
      router.push('/login');
      router.refresh();
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Handle logout
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <GradientMeshBackground />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <Atom className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
          <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-3000 fill-mode-forwards opacity-0" style={{ animationDelay: '3s' }}>
            <Button variant="ghost" size="sm" onClick={() => {
              document.cookie = 'atomic-session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              router.replace('/login');
              router.refresh();
            }}>
              Taking too long? Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (hasError || isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <GradientMeshBackground />
        <div className="flex flex-col items-center gap-4 text-center p-8 relative z-10">
          <Atom className="h-12 w-12 text-red-500" />
          <h2 className="text-xl font-semibold text-foreground">Connection Error</h2>
          <p className="text-muted-foreground max-w-md">
            Unable to connect to the server. Please check your connection and try again.
          </p>
          <Button
            onClick={() => router.refresh()}
            className="mt-4"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Don't render dashboard if not authenticated
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background overflow-x-hidden">
      {/* Animated gradient mesh background */}
      <GradientMeshBackground />

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main content area */}
      <div className={cn(
        'relative flex flex-col min-h-screen transition-all duration-300',
        'lg:ml-72',
        sidebarCollapsed && 'lg:ml-20'
      )}>
        {/* Header */}
        <Header
          user={user}
          onLogout={handleLogout}
          onOpenTools={() => setMobileToolsOpen(true)}
        />

        {/* Page content — extra bottom padding on mobile for tab bar */}
        <main className="flex-1 px-4 pb-24 pt-4 md:px-6 lg:px-8 lg:pb-10 lg:pt-6">
          <div className="ops-page">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <BottomTabBar />

      {/* Mobile tools sheet */}
      <MoreMenu
        open={mobileToolsOpen}
        onClose={() => setMobileToolsOpen(false)}
      />

      {/* Scroll to top button */}
      <ScrollToTop />
    </div>
  );
}
