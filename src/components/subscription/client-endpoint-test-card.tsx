'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
  WifiOff,
} from 'lucide-react';

type ClientProbeResult = {
  ok: boolean;
  status: number;
  testedAt: string;
  contentType: string | null;
  summary: string;
  server: string | null;
  port: number | null;
  method: string | null;
  prefix: string | null;
  rawPreview: string | null;
};

function summarizeErrorText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'The endpoint returned an empty response.';
  }

  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

export function ClientEndpointTestCard({
  endpointUrl,
  title = 'Client URL Test',
  description = 'Probe the live client endpoint and inspect the returned Outline config.',
}: {
  endpointUrl: string;
  title?: string;
  description?: string;
}) {
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<ClientProbeResult | null>(null);

  const endpointLabel = useMemo(() => {
    if (!endpointUrl) {
      return 'No client endpoint available yet.';
    }

    try {
      const url = new URL(endpointUrl);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return endpointUrl;
    }
  }, [endpointUrl]);

  const runTest = async () => {
    if (!endpointUrl || isTesting) {
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch(endpointUrl, {
        headers: {
          accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        },
        cache: 'no-store',
      });

      const contentType = response.headers.get('content-type');
      const bodyText = await response.text();
      let parsedJson: Record<string, unknown> | null = null;

      if (contentType?.includes('application/json')) {
        try {
          parsedJson = JSON.parse(bodyText) as Record<string, unknown>;
        } catch {
          parsedJson = null;
        }
      }

      const rawPreview = !parsedJson && bodyText
        ? summarizeErrorText(bodyText.startsWith('ss://') ? 'Shadowsocks URL returned as plain text.' : bodyText)
        : null;

      setResult({
        ok: response.ok,
        status: response.status,
        testedAt: new Date().toISOString(),
        contentType,
        summary: response.ok
          ? 'The endpoint responded successfully.'
          : summarizeErrorText(
              typeof parsedJson?.error === 'string' ? parsedJson.error : bodyText,
            ),
        server: typeof parsedJson?.server === 'string' ? parsedJson.server : null,
        port: typeof parsedJson?.server_port === 'number' ? parsedJson.server_port : null,
        method: typeof parsedJson?.method === 'string' ? parsedJson.method : null,
        prefix: typeof parsedJson?.prefix === 'string' ? parsedJson.prefix : null,
        rawPreview,
      });
    } catch (error) {
      setResult({
        ok: false,
        status: 0,
        testedAt: new Date().toISOString(),
        contentType: null,
        summary: error instanceof Error ? error.message : 'Request failed before the endpoint responded.',
        server: null,
        port: null,
        method: null,
        prefix: null,
        rawPreview: null,
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="ops-detail-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[1.1rem] border border-border/60 bg-background/55 px-4 py-3 dark:bg-white/[0.03]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Live endpoint
          </p>
          <p className="mt-2 break-all text-sm font-medium">{endpointLabel}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-10 rounded-full"
            onClick={runTest}
            disabled={!endpointUrl || isTesting}
          >
            {isTesting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Test Client URL
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-full"
            asChild
            disabled={!endpointUrl}
          >
            <a href={endpointUrl || '#'} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Endpoint
            </a>
          </Button>
        </div>

        {result ? (
          <div
            className={cn(
              'space-y-4 rounded-[1.2rem] border px-4 py-4',
              result.ok
                ? 'border-emerald-500/25 bg-emerald-500/5'
                : 'border-red-500/20 bg-red-500/5',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {result.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : result.status === 0 ? (
                  <WifiOff className="h-4 w-4 text-red-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
                <p className="text-sm font-medium">{result.summary}</p>
              </div>
              <Badge variant={result.ok ? 'default' : 'destructive'}>
                {result.status || 'ERR'}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">Server</p>
                <p className="font-medium">{result.server || 'Unknown'}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">Port</p>
                <p className="font-medium">{result.port ?? 'Unknown'}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">Method</p>
                <p className="font-medium">{result.method || 'Unknown'}</p>
              </div>
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">Checked</p>
                <p className="font-medium">{new Date(result.testedAt).toLocaleTimeString()}</p>
              </div>
            </div>

            {result.prefix ? (
              <div className="ops-inline-stat">
                <p className="text-xs text-muted-foreground">Prefix</p>
                <p className="font-medium">{result.prefix}</p>
              </div>
            ) : null}

            {result.rawPreview ? (
              <div className="rounded-[1rem] border border-border/60 bg-background/45 px-3 py-3 text-sm text-muted-foreground dark:bg-white/[0.03]">
                {result.rawPreview}
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          This checks the public client endpoint the same way a VPN client would. It does not require a panel reload.
        </p>
      </CardContent>
    </Card>
  );
}
