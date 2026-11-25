'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { withBasePath } from '@/lib/base-path';

export default function MagicLinkPage() {
  const router = useRouter();
  const [message, setMessage] = React.useState('Opening your key…');

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = window.location.hash.replace(/^#/, '').trim();
      if (!token) {
        setMessage('This link is missing its access token.');
        return;
      }

      try {
        const response = await fetch(withBasePath('/api/magic-link/consume'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = (await response.json()) as {
          token?: string;
          keyId?: string;
          kind?: string;
          error?: string;
        };
        if (!response.ok || !body.token || !body.keyId || !body.kind) {
          throw new Error(body.error || 'Could not open this link.');
        }

        window.sessionStorage.setItem('atomic-magic-session', body.token);
        window.sessionStorage.setItem('atomic-magic-key-id', body.keyId);
        window.sessionStorage.setItem('atomic-magic-key-kind', body.kind);
        window.sessionStorage.setItem(
          'atomic-magic-locale',
          navigator.language.toLowerCase().startsWith('my') ? 'my' : 'en',
        );
        window.history.replaceState(null, '', withBasePath('/magic-link'));
        if (!cancelled) router.replace(withBasePath('/webapp?magic=1'));
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not open this link.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-[1.5rem] border border-border/60 bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Self-service access</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
