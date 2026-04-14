'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/hooks/use-locale';
import { adminToolNavItems, settingsShortcutItems } from './dashboard-nav';

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

  const sections = [
    {
      title: 'Operations',
      description: 'Support, jobs, reports, audit, migration, and the rest of the operator tools.',
      items: adminToolNavItems,
    },
    {
      title: t('nav.settings'),
      description: 'Security, user management, and notification controls.',
      items: settingsShortcutItems,
    },
  ] as const;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-3 top-16 bottom-[calc(var(--bottom-bar-height)+var(--safe-area-bottom)+0.75rem)] z-50 overflow-y-auto px-5 pb-6 pt-5 text-slate-100 animate-in slide-in-from-bottom-6 duration-200 ops-mobile-sheet lg:inset-x-auto lg:bottom-6 lg:right-6 lg:top-24 lg:w-[28rem] lg:rounded-[2rem] lg:px-6 lg:pb-6 lg:pt-6"
        style={{
          paddingBottom: 'calc(var(--safe-area-bottom) + 1.5rem)',
        }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t('nav.tools')}</h2>
            <p className="mt-1 text-sm text-slate-400">
              Secondary pages, settings shortcuts, and operator workflows.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ops-icon-button-shell h-10 w-10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {section.title}
                </p>
                <p className="text-xs leading-5 text-slate-400">
                  {section.description}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {section.items.map((item) => {
                  const active = normalizedPathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'ops-interactive-surface flex items-center gap-4 rounded-[1.6rem] border p-4 transition-colors',
                        active
                          ? 'border-cyan-400/26 bg-cyan-400/10 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_0_24px_rgba(34,211,238,0.08)]'
                          : 'text-white hover:border-cyan-400/18 hover:bg-white/[0.05]'
                      )}
                    >
                      <div className={cn(
                        'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border transition-colors',
                        active
                          ? 'border-cyan-300/20 bg-cyan-400/12 text-cyan-200'
                          : 'border-white/8 bg-white/6 text-slate-300'
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
            </section>
          ))}
        </div>

        <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-slate-200">
              <Settings className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Need the full workspace hub?</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Open the tools page for a broader overview, grouped cards, and the settings hub.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/tools"
            onClick={onClose}
            className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-cyan-400/24 hover:bg-cyan-400/10"
          >
            Open tools hub
          </Link>
        </div>
      </div>
    </>
  );
}
