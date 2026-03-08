'use client';

import Link from 'next/link';
import { ChevronRight, Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { useLocale } from '@/hooks/use-locale';
import { adminToolNavItems } from '@/components/layout/dashboard-nav';

export default function ToolsPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackButton href="/dashboard" label={t('nav.dashboard')} />
        <h1 className="text-2xl font-bold">{t('tools.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('tools.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {adminToolNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href} className="block">
              <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t(item.labelKey)}</CardTitle>
                    <CardDescription className="mt-1 text-sm">
                      {t(item.descriptionKey)}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium text-foreground">
                    {t('tools.open')}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-primary" />
            {t('nav.settings')}
          </CardTitle>
          <CardDescription>
            {t('settings.hub.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/dashboard/settings">{t('nav.settings')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
