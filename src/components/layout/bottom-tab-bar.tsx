'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import { primaryDashboardNavItems } from './dashboard-nav';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * BottomTabBar
 * Mobile bottom navigation bar with glassmorphism styling.
 * Only visible on mobile/tablet (lg:hidden).
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const { t } = useLocale();
  const normalizedPathname =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || '/'
      : pathname;

  const isActive = (tab: (typeof primaryDashboardNavItems)[number]) => {
    if (tab.href === '/dashboard') {
      return normalizedPathname === tab.href;
    }
    return normalizedPathname.startsWith(tab.href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden glass-bottom-bar h-[var(--bottom-bar-height)] border-t border-[var(--glass-border)]">
      <div className="grid h-full grid-cols-5 px-2">
        {primaryDashboardNavItems.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition-all duration-200',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-10 items-center justify-center rounded-xl transition-colors',
                  active ? 'bg-primary/15 shadow-sm' : 'bg-transparent',
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className="line-clamp-1 text-[10px] leading-none">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
