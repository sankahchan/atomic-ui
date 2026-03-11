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
        className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-md lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-3 top-16 bottom-[calc(var(--bottom-bar-height)+var(--safe-area-bottom)+0.75rem)] z-50 overflow-y-auto rounded-[2rem] border border-cyan-400/14 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.1),transparent_25%),linear-gradient(180deg,rgba(3,10,22,0.96),rgba(2,8,18,0.98))] px-5 pb-6 pt-5 text-slate-100 shadow-[0_28px_80px_rgba(1,6,20,0.48),0_0_28px_rgba(34,211,238,0.06)] animate-in slide-in-from-bottom-6 duration-200 lg:hidden"
        style={{
          paddingBottom: 'calc(var(--safe-area-bottom) + 1.5rem)',
        }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t('nav.tools')}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {t('tools.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-cyan-400/14 bg-white/[0.02] p-2 text-slate-300 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {adminToolNavItems.map((item) => {
            const active = normalizedPathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-4 rounded-[1.6rem] border p-4 transition-colors',
                  active
                    ? 'border-cyan-400/26 bg-cyan-400/10 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_0_24px_rgba(34,211,238,0.08)]'
                    : 'border-cyan-400/10 bg-white/[0.03] text-white hover:border-cyan-400/18 hover:bg-white/[0.05]'
                )}
              >
                <div className={cn(
                  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl',
                  active ? 'border border-cyan-300/20 bg-cyan-400/12 text-cyan-200' : 'bg-white/6 text-slate-300'
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(item.labelKey)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {t(item.descriptionKey)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
