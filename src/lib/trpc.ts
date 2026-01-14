/**
 * tRPC Client Configuration
 * 
 * This module configures the tRPC client for use in React components.
 * It uses @trpc/react-query for seamless integration with TanStack Query,
 * providing features like caching, optimistic updates, and invalidation.
 * 
 * The client is configured with superjson transformer to handle complex
 * types like Date and BigInt across the network boundary.
 */

import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@/server/routers';

/**
 * Create the tRPC React client.
 * 
 * This exports the tRPC hooks (useQuery, useMutation, etc.) that are
 * fully typed based on the AppRouter. TypeScript will provide
 * autocompletion for all available procedures and their inputs/outputs.
 * 
 * Usage example:
 *   const { data } = trpc.servers.list.useQuery();
 *   const mutation = trpc.keys.create.useMutation();
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Get the base URL for API requests.
 * 
 * In the browser, we use a relative path that works with Next.js routing.
 * On the server (SSR), we need the full URL including the host.
 */
function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Browser: use configured path from environment or relative if not set
    // Note: client-side env must be prefixed with NEXT_PUBLIC_
    return process.env.NEXT_PUBLIC_PANEL_PATH || '';
  }

  // Server: use localhost with the port from environment
  const port = process.env.PORT ?? 3000;
  // Include PANEL_PATH if configured (for server-side calls)
  const panelPath = process.env.PANEL_PATH || '';
  return `http://localhost:${port}${panelPath}`;
}

/**
 * Create tRPC client links.
 * 
 * Links define how requests are handled. We use httpBatchLink which
 * batches multiple requests made in the same tick into a single HTTP
 * request, improving performance.
 * 
 * The transformer (superjson) ensures proper serialization of complex
 * types like Date, BigInt, Map, and Set.
 */
export function getTRPCClientConfig() {
  return {
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        // The transformer handles serialization of complex types (Date, BigInt, etc.)
        // In tRPC v11, the transformer is specified per-link rather than globally
        transformer: superjson,
        // Include credentials for authentication cookies
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: 'include',
          });
        },
      }),
    ],
  };
}
