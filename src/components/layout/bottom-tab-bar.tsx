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
    <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(var(--safe-area-bottom)+0.85rem)] pt-2 lg:hidden">
      <div className="glass-bottom-bar ops-mobile-dock mx-auto max-w-[26rem]">
        <div className="flex h-full items-end justify-between gap-1.5">
          {primaryDashboardNavItems.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'ops-mobile-dock-item',
                  active ? 'flex-[1.18]' : 'flex-1',
                  active && 'ops-mobile-dock-item-active'
                )}
              >
                <div className={cn('ops-mobile-dock-pill', active && 'ops-mobile-dock-pill-active')}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className={cn('ops-mobile-dock-label', active && 'ops-mobile-dock-label-active')}>
                  {t(tab.mobileLabelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
