'use client';

/**
 * Servers Page
 * 
 * This page acts as the central hub for server management and monitoring.
 * It combines the functionality of listing/managing servers with detailed
 * health monitoring into a unified tabbed interface.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/hooks/use-locale';
import { ServerList } from '@/components/servers/server-list';
import { ServerHealthMonitor } from '@/components/servers/server-health-monitor';
import { Activity, Server, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ServersPage() {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState<'overview' | 'health'>('overview');

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_320px]">
          <div className="space-y-5">
            <span className="ops-pill border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
              <Server className="h-3.5 w-3.5" />
              {t('servers.hero_label')}
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                {t('servers.title')}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t('servers.subtitle')}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={cn(
                  'ops-support-card text-left',
                  activeTab === 'overview'
                    ? 'border-cyan-500/30 bg-cyan-500/10 dark:border-cyan-300/28 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_24%),linear-gradient(180deg,rgba(5,13,28,0.94),rgba(4,10,22,0.82))]'
                    : ''
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t('servers.hero_overview_title')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('servers.hero_overview_desc')}</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('health')}
                className={cn(
                  'ops-support-card text-left',
                  activeTab === 'health'
                    ? 'border-emerald-500/30 bg-emerald-500/10 dark:border-emerald-300/26 dark:bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_24%),linear-gradient(180deg,rgba(5,13,28,0.94),rgba(4,10,22,0.82))]'
                    : ''
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t('servers.hero_health_title')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('servers.hero_health_desc')}</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="ops-support-card">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
                  <Server className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t('servers.hero_overview_title')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('servers.hero_overview_desc')}</p>
                </div>
              </div>
            </div>

            <div className="ops-support-card">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t('servers.hero_health_title')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('servers.hero_health_desc')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'overview' | 'health')} className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-[1.6rem] border border-border/60 bg-background/55 p-1.5 dark:border-cyan-400/14 dark:bg-[linear-gradient(180deg,rgba(4,11,24,0.9),rgba(5,12,24,0.76))] dark:shadow-[0_16px_38px_rgba(1,6,20,0.34)]">
          <TabsTrigger value="overview" className="min-w-0 rounded-[1.25rem] px-3 py-3 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:shadow-[0_0_28px_rgba(34,211,238,0.18)] sm:text-sm">
            <span className="inline-flex items-center gap-2">
              <Server className="h-4 w-4" />
              {t('servers.tab_overview')}
            </span>
          </TabsTrigger>
          <TabsTrigger value="health" className="min-w-0 rounded-[1.25rem] px-3 py-3 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:shadow-[0_0_28px_rgba(34,211,238,0.18)] sm:text-sm">
            <span className="inline-flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {t('servers.tab_health')}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <ServerList />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <ServerHealthMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
