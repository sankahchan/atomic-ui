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
    <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(var(--safe-area-bottom)+0.75rem)] pt-2 lg:hidden">
      <div className="glass-bottom-bar mx-auto h-[var(--bottom-bar-height)] max-w-md rounded-[2.1rem] border border-white/10 px-2 shadow-[0_18px_50px_rgba(2,6,23,0.28)] dark:border-cyan-400/15 dark:shadow-[0_20px_56px_rgba(1,6,20,0.45),0_0_24px_rgba(34,211,238,0.06)]">
        <div className="grid h-full grid-cols-5 gap-1.5">
          {primaryDashboardNavItems.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'group flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1.45rem] px-1 py-2 text-[10px] transition-all duration-200',
                  active
                    ? 'text-white dark:text-cyan-100'
                    : 'ops-interactive-surface border-transparent text-slate-300 dark:text-slate-400'
                )}
              >
                <div
                  className={cn(
                    'flex h-9 min-w-[2.75rem] items-center justify-center rounded-[1.1rem] px-2 transition-all duration-200',
                    active
                      ? 'bg-cyan-400/18 text-cyan-200 shadow-[0_12px_24px_rgba(6,182,212,0.18)] dark:border dark:border-cyan-300/20 dark:bg-[linear-gradient(180deg,rgba(34,211,238,0.18),rgba(34,211,238,0.1))] dark:shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_10px_22px_rgba(34,211,238,0.16)]'
                      : 'bg-transparent text-inherit group-hover:bg-cyan-400/[0.06] dark:group-hover:border-cyan-400/12 dark:group-hover:bg-cyan-400/[0.07]',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={cn(
                    'line-clamp-1 leading-none transition-opacity',
                    active ? 'opacity-100' : 'opacity-80'
                  )}
                >
                  {t(tab.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
