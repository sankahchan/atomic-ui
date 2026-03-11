'use client';

import Link from 'next/link';
import { ChevronRight, LayoutGrid, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { useLocale } from '@/hooks/use-locale';
import { adminToolNavItems } from '@/components/layout/dashboard-nav';

export default function ToolsPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-5">
            <BackButton href="/dashboard" label={t('nav.dashboard')} />
            <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
              <LayoutGrid className="h-3.5 w-3.5" />
              {t('nav.tools')}
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {t('tools.title')}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t('tools.subtitle')}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:max-w-3xl">
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.incidents')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('tools.incidents.desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.reports')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('tools.reports.desc')}</p>
              </div>
              <div className="ops-support-card">
                <p className="text-sm font-semibold">{t('nav.onboarding')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('tools.onboarding.desc')}</p>
              </div>
            </div>
          </div>

          <div className="ops-panel space-y-3">
            <div className="space-y-1">
              <p className="ops-section-heading">{t('nav.settings')}</p>
              <h2 className="text-xl font-semibold">{t('nav.settings')}</h2>
              <p className="text-sm text-muted-foreground">{t('settings.hub.subtitle')}</p>
            </div>
            <Button variant="outline" asChild className="h-11 w-full rounded-full border-border/70 bg-background/70 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.88),rgba(5,12,24,0.78))]">
              <Link href="/dashboard/settings">{t('nav.settings')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="ops-card-grid">
        {adminToolNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href} className="block">
              <Card className="ops-panel h-full p-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 dark:hover:border-cyan-300/22">
                <CardContent className="flex h-full flex-col gap-6 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-cyan-400/10 dark:text-cyan-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">{t(item.labelKey)}</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {t(item.descriptionKey)}
                    </p>
                  </div>

                  <div className="mt-auto">
                    <div className="ops-action-tile justify-center text-sm font-medium">
                      <span>{t('tools.open')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
