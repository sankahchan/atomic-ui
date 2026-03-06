'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Server, Key, KeyRound, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import { MoreMenu } from './more-menu';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const tabs = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { key: 'servers', href: '/servers', icon: Server, labelKey: 'nav.servers' },
  { key: 'keys', href: '/keys', icon: Key, labelKey: 'nav.keys' },
  { key: 'dynamic-keys', href: '/dynamic-keys', icon: KeyRound, labelKey: 'nav.dynamic_keys' },
] as const;

/**
 * BottomTabBar
 * Mobile bottom navigation bar with glassmorphism styling.
 * Only visible on mobile/tablet (lg:hidden).
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const { t } = useLocale();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (tab: (typeof tabs)[number]) => {
    const fullHref = `${basePath}${tab.href}`;
    if (tab.key === 'dashboard') {
      return pathname === fullHref;
    }
    return pathname.startsWith(fullHref);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden glass-bottom-bar h-[var(--bottom-bar-height)]">
        <div className="flex items-center justify-around h-full px-2">
          {tabs.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={`${basePath}${tab.href}`}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 py-1',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <div className="relative flex flex-col items-center">
                  {active && (
                    <div className="absolute -top-1 w-1 h-1 rounded-full bg-primary" />
                  )}
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px]">{t(tab.labelKey)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-1',
              moreOpen ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px]">{t('nav.more') || 'More'}</span>
          </button>
        </div>
      </nav>

      <MoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
