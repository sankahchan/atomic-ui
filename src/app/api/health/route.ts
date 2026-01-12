/**
 * Health Check API Endpoint
 * 
 * This endpoint provides a simple health check for the Atomic-UI application
 * itself. It's used by Docker, load balancers, and monitoring systems to
 * verify that the application is running correctly.
 * 
 * The endpoint performs a basic database connectivity check and returns
 * appropriate status codes based on the application's health.
 * 
 * Response Codes:
 * - 200: Application is healthy
 * - 503: Application is unhealthy (e.g., database unavailable)
 */

import { NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';

/**
 * GET /api/health
 * 
 * Performs a health check on the application. This includes verifying
 * database connectivity by executing a simple query. The response includes
 * the current timestamp and application version for debugging purposes.
 */
export async function GET() {
  try {
    // Verify database connectivity with a simple query.
    // This checks that Prisma can connect and the database is responsive.
    // We use a settings table query since it's a lightweight operation.
    await prisma.settings.findFirst();

    // Return a successful health check response with relevant metadata.
    // The timestamp helps operators verify that they're getting fresh responses
    // rather than cached data from intermediate proxies.
    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'connected',
      },
      { status: 200 }
    );
  } catch (error) {
    // If the database check fails, the application is unhealthy.
    // Log the error for debugging but don't expose internal details
    // in the response for security reasons.
    console.error('Health check failed:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'disconnected',
        error: 'Database connectivity issue',
      },
      { status: 503 }
    );
  }
}
