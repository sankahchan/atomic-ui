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
        'fixed inset-y-0 left-0 z-50 flex flex-col glass-sidebar',
        'transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo and brand */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-[var(--glass-border)]">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <Atom className="w-6 h-6 text-primary" />
          </div>
          {!isCollapsed && (
            <span className="text-lg font-bold text-gradient-atomic">
              Atomic-UI
            </span>
          )}
        </Link>

        {/* Desktop collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="hidden lg:flex"
        >
          <ChevronLeft className={cn(
            'h-4 w-4 transition-transform',
            isCollapsed && 'rotate-180'
          )} />
        </Button>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {primaryDashboardNavItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                    'transition-all duration-200',
                    isActive
                      ? 'bg-primary/15 text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--glass-bg)]'
                  )}
                  title={isCollapsed ? t(item.labelKey) : undefined}
                >
                  <item.icon className={cn(
                    'w-5 h-5 flex-shrink-0',
                    isActive && 'text-primary'
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
        <div className="p-4 border-t border-[var(--glass-border)]">
          <p className="text-xs text-muted-foreground text-center">
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
    <header className="sticky top-0 z-40 h-14 lg:h-16 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))]">
      <div className="flex items-center justify-between h-full px-4">
        {/* Left side: Logo on mobile */}
        <div className="flex items-center gap-3 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Atom className="w-5 h-5 text-primary" />
            <span className="text-base font-bold text-gradient-atomic">
              Atomic-UI
            </span>
          </Link>
        </div>

        {/* Left side: tools button on desktop */}
        <div className="hidden lg:flex items-center">
          <Button variant="outline" size="sm" asChild className="glass border-[var(--glass-border)]">
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
            className="h-9 w-9 lg:hidden"
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
                className="h-9 w-9"
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
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{user.email}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-primary/20 text-primary font-medium">
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
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
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
        'lg:ml-64',
        sidebarCollapsed && 'lg:ml-16'
      )}>
        {/* Header */}
        <Header
          user={user}
          onLogout={handleLogout}
          onOpenTools={() => setMobileToolsOpen(true)}
        />

        {/* Page content — extra bottom padding on mobile for tab bar */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-24 lg:pb-8">
          {children}
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
