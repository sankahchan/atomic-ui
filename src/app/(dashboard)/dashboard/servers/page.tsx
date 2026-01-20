'use client';

/**
 * Servers Page
 * 
 * This page acts as the central hub for server management and monitoring.
 * It combines the functionality of listing/managing servers with detailed
 * health monitoring into a unified tabbed interface.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/hooks/use-locale';
import { ServerList } from '@/components/servers/server-list';
import { ServerHealthMonitor } from '@/components/servers/server-health-monitor';

export default function ServersPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('servers.title')}</h1>
          <p className="text-muted-foreground">
            {t('servers.subtitle')}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="health">Health & Monitoring</TabsTrigger>
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
