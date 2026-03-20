'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { cn, getCountryFlag } from '@/lib/utils';
import { ChevronDown, ChevronUp, Globe, Loader2, Plus, Server, X } from 'lucide-react';

export type DynamicRoutingPreferenceMode = 'PREFER' | 'ONLY';

export function DynamicRoutingPreferencesEditor({
  preferredRegionMode,
  preferredServerIds,
  preferredCountryCodes,
  onChange,
  compact = false,
}: {
  preferredRegionMode: DynamicRoutingPreferenceMode;
  preferredServerIds: string[];
  preferredCountryCodes: string[];
  onChange: (next: {
    preferredRegionMode: DynamicRoutingPreferenceMode;
    preferredServerIds: string[];
    preferredCountryCodes: string[];
  }) => void;
  compact?: boolean;
}) {
  const { data: servers, isLoading } = trpc.servers.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const [pendingServerId, setPendingServerId] = useState('');
  const [pendingCountryCode, setPendingCountryCode] = useState('');

  const serverOptions = useMemo(() => servers ?? [], [servers]);
  const availableCountries = useMemo(() => {
    const map = new Map<string, number>();
    for (const server of serverOptions) {
      if (!server.countryCode) {
        continue;
      }
      const code = server.countryCode.toUpperCase();
      map.set(code, (map.get(code) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => left.code.localeCompare(right.code));
  }, [serverOptions]);

  const selectedServers = preferredServerIds
    .map((id) => serverOptions.find((server) => server.id === id))
    .filter((server): server is NonNullable<typeof serverOptions[number]> => Boolean(server));

  const update = (partial: Partial<{
    preferredRegionMode: DynamicRoutingPreferenceMode;
    preferredServerIds: string[];
    preferredCountryCodes: string[];
  }>) => {
    onChange({
      preferredRegionMode,
      preferredServerIds,
      preferredCountryCodes,
      ...partial,
    });
  };

  const addServer = () => {
    if (!pendingServerId || preferredServerIds.includes(pendingServerId)) {
      return;
    }
    update({ preferredServerIds: [...preferredServerIds, pendingServerId] });
    setPendingServerId('');
  };

  const moveServer = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= preferredServerIds.length) {
      return;
    }
    const next = [...preferredServerIds];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    update({ preferredServerIds: next });
  };

  const removeServer = (serverId: string) => {
    update({ preferredServerIds: preferredServerIds.filter((id) => id !== serverId) });
  };

  const addCountry = () => {
    if (!pendingCountryCode || preferredCountryCodes.includes(pendingCountryCode)) {
      return;
    }
    update({ preferredCountryCodes: [...preferredCountryCodes, pendingCountryCode] });
    setPendingCountryCode('');
  };

  const moveCountry = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= preferredCountryCodes.length) {
      return;
    }
    const next = [...preferredCountryCodes];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    update({ preferredCountryCodes: next });
  };

  const removeCountry = (countryCode: string) => {
    update({ preferredCountryCodes: preferredCountryCodes.filter((code) => code !== countryCode) });
  };

  const helperText = preferredRegionMode === 'ONLY'
    ? 'Only matching servers and regions will be used. If nothing matches, the client fetch will fail.'
    : 'Preferred items are tried first. If none match, routing falls back to the remaining pool.';

  return (
    <div className="space-y-4 rounded-[1.2rem] border border-border/60 bg-muted/20 p-4 dark:bg-white/[0.02]">
      <div className="space-y-2">
        <Label>Routing Preference Mode</Label>
        <Select
          value={preferredRegionMode}
          onValueChange={(value: DynamicRoutingPreferenceMode) =>
            update({ preferredRegionMode: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PREFER">Prefer matching regions/servers</SelectItem>
            <SelectItem value="ONLY">Only use matching regions/servers</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{helperText}</p>
      </div>

      <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2')}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <Label className="text-sm">Preferred Server Order</Label>
          </div>
          {selectedServers.length > 0 ? (
            <div className="space-y-2">
              {selectedServers.map((server, index) => (
                <div key={server.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 dark:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {getCountryFlag(server.countryCode || '')} {server.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {server.countryCode ? `${server.countryCode.toUpperCase()} priority ${index + 1}` : `Priority ${index + 1}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveServer(index, -1)} disabled={index === 0}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveServer(index, 1)} disabled={index === selectedServers.length - 1}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeServer(server.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground dark:border-cyan-400/16">
              No preferred servers yet.
            </div>
          )}

          <div className="flex gap-2">
            <Select value={pendingServerId} onValueChange={setPendingServerId} disabled={isLoading}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={isLoading ? 'Loading servers...' : 'Add a preferred server'} />
              </SelectTrigger>
              <SelectContent>
                {serverOptions
                  .filter((server) => !preferredServerIds.includes(server.id))
                  .map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      {getCountryFlag(server.countryCode || '')} {server.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={addServer} disabled={!pendingServerId || isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <Label className="text-sm">Preferred Region Order</Label>
          </div>
          {preferredCountryCodes.length > 0 ? (
            <div className="space-y-2">
              {preferredCountryCodes.map((countryCode, index) => (
                <div key={countryCode} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 dark:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {getCountryFlag(countryCode)} {countryCode}
                    </p>
                    <p className="text-xs text-muted-foreground">Priority {index + 1}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveCountry(index, -1)} disabled={index === 0}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveCountry(index, 1)} disabled={index === preferredCountryCodes.length - 1}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCountry(countryCode)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground dark:border-cyan-400/16">
              No preferred regions yet.
            </div>
          )}

          <div className="flex gap-2">
            <Select value={pendingCountryCode} onValueChange={setPendingCountryCode} disabled={isLoading}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={isLoading ? 'Loading regions...' : 'Add a preferred region'} />
              </SelectTrigger>
              <SelectContent>
                {availableCountries
                  .filter((country) => !preferredCountryCodes.includes(country.code))
                  .map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {getCountryFlag(country.code)} {country.code} ({country.count} server{country.count === 1 ? '' : 's'})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={addCountry} disabled={!pendingCountryCode || isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
