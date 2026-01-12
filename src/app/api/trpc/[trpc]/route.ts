/**
 * tRPC API Route Handler
 * 
 * This file sets up the Next.js API route that handles all tRPC requests.
 * The route is located at /api/trpc/[trpc] which catches all tRPC procedure
 * calls and routes them to the appropriate handler.
 * 
 * The fetch adapter handles the HTTP request/response cycle, parsing the
 * request body, calling the appropriate procedure, and serializing the
 * response. It also handles batched requests where multiple procedures
 * are called in a single HTTP request.
 */

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers';
import { createContext } from '@/server/trpc';

/**
 * Handler function for tRPC requests.
 * 
 * This function is called for both GET and POST requests to /api/trpc/*.
 * GET requests are used for queries, while POST requests are used for
 * mutations and batched requests.
 * 
 * The handler:
 * 1. Parses the incoming request
 * 2. Creates a fresh context for the request
 * 3. Routes to the appropriate procedure
 * 4. Serializes and returns the response
 */
const handler = (req: Request) =>
  fetchRequestHandler({
    // The endpoint path that tRPC is mounted at
    endpoint: '/api/trpc',
    
    // The incoming request object
    req,
    
    // The root router containing all procedures
    router: appRouter,
    
    // Context factory called for each request
    // This provides the user session and other request-scoped data
    createContext,
    
    // Error handler for logging and debugging
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`
            );
          }
        : undefined,
  });

// Export the handler for both GET and POST methods
// Next.js App Router uses named exports for HTTP methods
export { handler as GET, handler as POST };
