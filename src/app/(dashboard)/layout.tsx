'use client';

/**
 * Dashboard Layout
 * 
 * This is the main layout for all authenticated pages in Atomic-UI. It provides
 * a consistent structure with a collapsible sidebar for navigation, a header
 * with user actions, and the main content area.
 * 
 * The layout is designed to be responsive, with the sidebar collapsing to a
 * drawer on mobile devices. It also handles authentication state, redirecting
 * unauthenticated users to the login page.
 */

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Server,
  Key,
  KeyRound,
  Activity,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Atom,
  Moon,
  Sun,
  User,
  Archive,
  Globe,
  BarChart3,
  FileText,
  ShieldCheck,
} from 'lucide-react';

import { useTheme } from 'next-themes';
import { LanguageSelector } from '@/components/ui/language-selector';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { NotificationBell } from '@/components/notification-bell';

/**
 * Navigation items configuration
 * Each item represents a section in the sidebar navigation
 */
/**
 * Navigation items for route prefetching.
 * These should match the actual routes in the sidebar.
 */
const navItems = [
  { href: '/dashboard' },
  { href: '/dashboard/servers' },
  { href: '/dashboard/keys' },
  { href: '/dashboard/dynamic-keys' },
  { href: '/dashboard/security' },
  { href: '/dashboard/users' },
  { href: '/dashboard/settings' },
  { href: '/dashboard/notifications' },
  { href: '/dashboard/analytics' },
  { href: '/dashboard/templates' },
  { href: '/dashboard/archived' },
];

import { useLocale } from '@/hooks/use-locale';

/**
 * Sidebar Component
 * 
 * The collapsible sidebar contains the main navigation for the dashboard.
 * It features a logo, navigation links, and a collapse toggle.
 */
function Sidebar({
  isCollapsed,
  onToggle,
  isMobile = false,
  onClose,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLocale();

  const navItems = [
    {
      href: '/dashboard',
      label: t('nav.dashboard'),
      icon: LayoutDashboard,
      description: 'Overview and statistics'
    },
    {
      href: '/dashboard/servers',
      label: t('nav.servers'),
      icon: Server,
      description: 'Manage Outline servers'
    },
    {
      href: '/dashboard/keys',
      label: t('nav.keys'),
      icon: Key,
      description: 'Manage VPN access keys'
    },
    {
      href: '/dashboard/dynamic-keys',
      label: t('nav.dynamic_keys'),
      icon: KeyRound,
      description: 'Dynamic access key pools'
    },
    {
      href: '/dashboard/security',
      label: t('nav.security'),
      icon: ShieldCheck,
      description: 'Firewall and access rules'
    },


    {
      href: '/dashboard/users',
      label: t('nav.users'),
      icon: User,
      description: 'Manage users'
    },
    {
      href: '/dashboard/settings',
      label: t('nav.settings'),
      icon: Settings,
      description: 'Application settings'
    },
  ];

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-border/50',
        'transition-all duration-300 ease-in-out',
        isCollapsed && !isMobile ? 'w-16' : 'w-64',
        isMobile && 'shadow-2xl'
      )}
    >
      {/* Logo and brand */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border/50">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <Atom className="w-6 h-6 text-primary" />
          </div>
          {(!isCollapsed || isMobile) && (
            <span className="text-lg font-bold text-gradient-atomic">
              Atomic-UI
            </span>
          )}
        </Link>

        {/* Mobile close button */}
        {isMobile && onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        )}

        {/* Desktop collapse toggle */}
        {!isMobile && (
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
        )}
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={isMobile ? onClose : undefined}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                    'transition-all duration-150',
                    'hover:bg-muted',
                    isActive && 'bg-primary/10 text-primary',
                    !isActive && 'text-muted-foreground hover:text-foreground'
                  )}
                  title={isCollapsed && !isMobile ? item.label : undefined}
                >
                  <item.icon className={cn(
                    'w-5 h-5 flex-shrink-0',
                    isActive && 'text-primary'
                  )} />
                  {(!isCollapsed || isMobile) && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sidebar footer */}
      {(!isCollapsed || isMobile) && (
        <div className="p-4 border-t border-border/50">
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
 * The top header contains the mobile menu toggle, page title,
 * theme switcher, and user actions.
 */
function Header({
  onMenuClick,
  user,
  onLogout,
}: {
  onMenuClick: () => void;
  user: { email: string; role: string } | null;
  onLogout: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by only showing theme toggle after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between h-full px-4">
        {/* Left side: Menu button (mobile) */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {/* Right side: Theme toggle, user menu, logout */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          {mounted && (
            <div className="flex items-center gap-1">
              <LanguageSelector />
              <NotificationBell />
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

          {/* User info */}
          {user && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{user.email}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
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
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * DashboardLayout Component
 * 
 * The main layout wrapper that combines the sidebar, header, and content area.
 * It handles authentication state and provides a consistent structure for
 * all dashboard pages.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Atom className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
          {/* Fallback logout if stuck in loading */}
          <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-3000 fill-mode-forwards opacity-0" style={{ animationDelay: '3s' }}>
            <Button variant="ghost" size="sm" onClick={() => {
              document.cookie = 'atomic-session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              window.location.href = '/login';
            }}>
              Taking too long? Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if authentication check failed
  if (hasError || isError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center p-8">
          <Atom className="h-12 w-12 text-red-500" />
          <h2 className="text-xl font-semibold text-foreground">Connection Error</h2>
          <p className="text-muted-foreground max-w-md">
            Unable to connect to the server. Please check your connection and try again.
          </p>
          <Button
            onClick={() => window.location.reload()}
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
    <div className="min-h-screen min-h-[100dvh] bg-background overflow-x-hidden bg-diagonal-stripes-light dark:bg-none">
      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <Sidebar
          isCollapsed={false}
          onToggle={() => { }}
          isMobile
          onClose={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main content area */}
      <div className={cn(
        'flex flex-col min-h-screen transition-all duration-300',
        'lg:ml-64',
        sidebarCollapsed && 'lg:ml-16'
      )}>
        {/* Header */}
        <Header
          onMenuClick={() => setMobileMenuOpen(true)}
          user={user}
          onLogout={handleLogout}
        />

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-6 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Scroll to top button for mobile */}
      <ScrollToTop />
    </div>
  );
}
