'use client';

/**
 * TRPC Provider Component
 * 
 * This component wraps the application with the necessary providers for tRPC
 * and React Query to work properly. It creates and manages the tRPC client
 * and query client instances, ensuring they persist across renders.
 * 
 * The providers are set up as a client component because React Query requires
 * client-side JavaScript to manage its cache and subscriptions.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { trpc, getTRPCClientConfig } from '@/lib/trpc';

/**
 * Props for the TRPCProvider component.
 * Children represents the wrapped React component tree.
 */
interface TRPCProviderProps {
  children: React.ReactNode;
}

/**
 * TRPCProvider wraps the application with tRPC and React Query providers.
 * 
 * This component initializes the query client and tRPC client with the
 * appropriate configuration. The clients are created using useState to
 * ensure they're only created once and persist across re-renders.
 * 
 * The query client is configured with sensible defaults for stale time,
 * retry behavior, and refetch policies that work well for admin dashboards.
 */
export function TRPCProvider({ children }: TRPCProviderProps) {
  // Create the query client with custom defaults
  // Using useState ensures the client is created once and reused
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Keep data fresh a little longer to avoid repetitive refetches between page clicks
            staleTime: 60 * 1000,
            
            // Keep unused data in cache longer for snappier back/forward navigation
            gcTime: 10 * 60 * 1000,
            
            // Retry once for transient errors, but don't retry auth/forbidden failures.
            retry: (failureCount, error) => {
              const maybeData = (error as { data?: { code?: string } } | undefined)?.data;
              const code = maybeData?.code;
              if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return false;
              return failureCount < 1;
            },
            
            // Don't refetch on window focus for admin UI
            // Prevents jarring updates while working
            refetchOnWindowFocus: false,
            
            // Don't refetch on reconnect automatically
            // Let the user trigger refreshes explicitly
            refetchOnReconnect: false,
          },
          mutations: {
            // Show error toasts for failed mutations
            // The actual toast logic is handled in components
            retry: 1,
          },
        },
      })
  );

  // Create the tRPC client with our configuration
  // This connects to the API routes at /api/trpc
  const [trpcClient] = useState(() => trpc.createClient(getTRPCClientConfig()));

  return (
    // First, wrap with the tRPC provider which adds tRPC-specific context
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      {/* Then wrap with React Query provider for caching and state management */}
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
