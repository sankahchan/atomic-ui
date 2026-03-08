'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import { adminToolNavItems } from './dashboard-nav';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

interface MoreMenuProps {
  open: boolean;
  onClose: () => void;
}

/**
 * MoreMenu
 * A full-height tools sheet for mobile dashboard navigation.
 */
export function MoreMenu({ open, onClose }: MoreMenuProps) {
  const pathname = usePathname();
  const { t } = useLocale();
  const normalizedPathname =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || '/'
      : pathname;
 
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
        className="fixed inset-x-0 top-14 bottom-[calc(var(--bottom-bar-height)+var(--safe-area-bottom))] z-50 lg:hidden glass rounded-t-3xl px-5 pb-6 pt-5 animate-in slide-in-from-bottom-6 duration-200 overflow-y-auto"
        style={{
          paddingBottom: 'calc(var(--safe-area-bottom) + 1.5rem)',
        }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t('nav.tools')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('tools.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {adminToolNavItems.map((item) => {
            const active = normalizedPathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-4 rounded-2xl border p-4 transition-colors',
                  active
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/60 text-foreground hover:bg-muted/70'
                )}
              >
                <div className={cn(
                  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl',
                  active ? 'bg-primary/15' : 'bg-muted'
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(item.labelKey)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(item.descriptionKey)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
