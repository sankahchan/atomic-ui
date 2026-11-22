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

/**
 * Radix portals attach to document.body by default, which puts them outside
 * `.plop-dashboard` and drops every scoped skin rule. Sharing the provider's
 * inner host lets portaled surfaces inherit PlopUI tokens and the live theme.
 */
const PlopPortalContainerContext = React.createContext<HTMLElement | null>(null);

export function usePlopPortalContainer() {
  return React.useContext(PlopPortalContainerContext);
}

export function PlopShellProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [portalContainer, setPortalContainer] = React.useState<HTMLDivElement | null>(null);

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
    <PlopPortalContainerContext.Provider value={portalContainer}>
      <PlopProvider
        surface="poster"
        theme={plopTheme}
        toaster={false}
        className="plop-dashboard min-h-screen"
      >
        <div ref={setPortalContainer} className="plop-portal-host min-h-screen">
          {children}
        </div>
      </PlopProvider>
    </PlopPortalContainerContext.Provider>
  );
}
