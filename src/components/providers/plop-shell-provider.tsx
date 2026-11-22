'use client';

/**
 * PlopUI shell provider
 *
 * Scopes PlopUI's surfaces and feedback settings to the dashboard without
 * touching the authentication pages. Theme state stays owned by next-themes;
 * this component only mirrors it into PlopProvider.
 */

import * as React from 'react';
import { useTheme } from 'next-themes';
import { PlopProvider } from '@plop-ui/react';

export function PlopShellProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Keep the first client render identical to the server render. next-themes
  // resolves after mount, so the explicit Plop theme is only applied afterwards.
  const plopTheme =
    mounted && resolvedTheme === 'dark'
      ? 'dark'
      : mounted && resolvedTheme === 'light'
        ? 'light'
        : undefined;

  return (
    <PlopProvider
      surface="poster"
      theme={plopTheme}
      toaster={false}
      className="plop-dashboard min-h-screen"
    >
      {children}
    </PlopProvider>
  );
}
