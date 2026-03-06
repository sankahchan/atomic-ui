'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Users,
  FileText,
  ArrowRightLeft,
  Settings,
  Bell,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const items = [
  { href: '/security', icon: ShieldCheck, labelKey: 'nav.security' },
  { href: '/users', icon: Users, labelKey: 'nav.users' },
  { href: '/reports', icon: FileText, labelKey: 'nav.reports' },
  { href: '/migration', icon: ArrowRightLeft, labelKey: 'nav.migration' },
  { href: '/settings', icon: Settings, labelKey: 'nav.settings' },
  { href: '/notifications', icon: Bell, labelKey: 'nav.notifications' },
] as const;

interface MoreMenuProps {
  open: boolean;
  onClose: () => void;
}

/**
 * MoreMenu
 * A slide-up sheet showing additional navigation items.
 * Only visible on mobile/tablet (lg:hidden).
 */
export function MoreMenu({ open, onClose }: MoreMenuProps) {
  const pathname = usePathname();
  const { t } = useLocale();

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden glass rounded-t-3xl p-6 animate-slide-up"
        style={{
          paddingBottom: 'calc(var(--bottom-bar-height) + var(--safe-area-bottom) + 1rem)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">More</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3x2 Grid */}
        <div className="grid grid-cols-3 gap-3">
          {items.map((item) => {
            const fullHref = `${basePath}${item.href}`;
            const active = pathname.startsWith(fullHref);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={fullHref}
                onClick={onClose}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[10px]">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
