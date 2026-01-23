/**
 * Security Probe Background Worker
 *
 * This worker runs as a separate Node.js process (not inside Next.js)
 * and periodically checks TLS/certificate status for all managed servers
 * and the dashboard itself.
 *
 * Features:
 * - DB-based locking to prevent double-runs
 * - TLS/SSL certificate monitoring
 * - Security headers checking
 * - Expiry warnings
 *
 * Run via: npx ts-node src/server/security-worker.ts
 * Or: node dist/server/security-worker.js (after build)
 */

import { PrismaClient } from '@prisma/client';
import * as https from 'https';
import * as http from 'http';
import * as tls from 'tls';
import { URL } from 'url';

// Initialize Prisma
const prisma = new PrismaClient();

// Configuration
const WORKER_ID = `security-worker-${process.pid}-${Date.now()}`;
const PROBE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_ID = 'security-probe-worker';
const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds

// Logging helper
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${WORKER_ID}]`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Acquire the distributed lock
 */
async function acquireLock(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  try {
    await prisma.workerLock.create({
      data: {
        id: LOCK_ID,
        workerId: WORKER_ID,
        lockedAt: now,
        expiresAt,
        heartbeatAt: now,
      },
    });
    log('INFO', 'Lock acquired successfully');
    return true;
  } catch {
    const existingLock = await prisma.workerLock.findUnique({
      where: { id: LOCK_ID },
    });

    if (existingLock) {
      if (existingLock.expiresAt < now) {
        log('INFO', `Found expired lock from ${existingLock.workerId}, taking over`);
        await prisma.workerLock.update({
          where: { id: LOCK_ID },
          data: {
            workerId: WORKER_ID,
            lockedAt: now,
            expiresAt,
            heartbeatAt: now,
          },
        });
        return true;
      }

      log('INFO', `Lock held by ${existingLock.workerId} until ${existingLock.expiresAt.toISOString()}`);
      return false;
    }

    return false;
  }
}

/**
 * Renew the lock (heartbeat)
 */
async function renewLock(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  try {
    const result = await prisma.workerLock.updateMany({
      where: {
        id: LOCK_ID,
        workerId: WORKER_ID,
      },
      data: {
        expiresAt,
        heartbeatAt: now,
      },
    });

    return result.count > 0;
  } catch (error) {
    log('ERROR', 'Failed to renew lock', error);
    return false;
  }
}

/**
 * Release the lock
 */
async function releaseLock(): Promise<void> {
  try {
    await prisma.workerLock.deleteMany({
      where: {
        id: LOCK_ID,
        workerId: WORKER_ID,
      },
    });
    log('INFO', 'Lock released');
  } catch (error) {
    log('ERROR', 'Failed to release lock', error);
  }
}

interface TlsProbeResult {
  scheme: string;
  tlsVersion?: string;
  cipherSuite?: string;
  certSubject?: string;
  certIssuer?: string;
  certExpiry?: Date;
  certDaysLeft?: number;
  result: 'OK' | 'CERT_EXPIRING' | 'CERT_EXPIRED' | 'TLS_ERROR' | 'CONNECTION_ERROR';
  errorMessage?: string;
}

/**
 * Probe TLS/certificate for a URL
 */
async function probeTls(urlString: string): Promise<TlsProbeResult> {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const isHttps = url.protocol === 'https:';
      const scheme = url.protocol.replace(':', '');

      if (!isHttps) {
        // For HTTP URLs, just check connectivity
        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port || 80,
            path: '/',
            method: 'HEAD',
            timeout: CONNECTION_TIMEOUT_MS,
          },
          () => {
            resolve({
              scheme,
              result: 'OK',
            });
          }
        );

        req.on('error', (err) => {
          resolve({
            scheme,
            result: 'CONNECTION_ERROR',
            errorMessage: err.message,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            scheme,
            result: 'CONNECTION_ERROR',
            errorMessage: 'Connection timeout',
          });
        });

        req.end();
        return;
      }

      // For HTTPS, probe TLS
      const options: tls.ConnectionOptions = {
        host: url.hostname,
        port: parseInt(url.port) || 443,
        servername: url.hostname,
        rejectUnauthorized: false, // Accept self-signed for probing
        timeout: CONNECTION_TIMEOUT_MS,
      };

      const socket = tls.connect(options, () => {
        const cert = socket.getPeerCertificate();
        const cipher = socket.getCipher();
        const tlsVersion = socket.getProtocol() || undefined;

        let certExpiry: Date | undefined;
        let certDaysLeft: number | undefined;
        let certSubject: string | undefined;
        let certIssuer: string | undefined;
        let result: TlsProbeResult['result'] = 'OK';

        if (cert && cert.valid_to) {
          certExpiry = new Date(cert.valid_to);
          const now = new Date();
          certDaysLeft = Math.floor((certExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (cert.subject) {
            certSubject = cert.subject.CN || JSON.stringify(cert.subject);
          }
          if (cert.issuer) {
            certIssuer = cert.issuer.CN || cert.issuer.O || JSON.stringify(cert.issuer);
          }

          if (certDaysLeft < 0) {
            result = 'CERT_EXPIRED';
          } else if (certDaysLeft < 14) {
            result = 'CERT_EXPIRING';
          }
        }

        socket.end();

        resolve({
          scheme,
          tlsVersion,
          cipherSuite: cipher?.name,
          certSubject,
          certIssuer,
          certExpiry,
          certDaysLeft,
          result,
        });
      });

      socket.on('error', (err) => {
        resolve({
          scheme,
          result: 'TLS_ERROR',
          errorMessage: err.message,
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          scheme,
          result: 'CONNECTION_ERROR',
          errorMessage: 'Connection timeout',
        });
      });
    } catch (error) {
      resolve({
        scheme: 'unknown',
        result: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

interface SecurityHeadersResult {
  hasHsts: boolean;
  hstsMaxAge?: number;
  hasSecureCookies: boolean;
  hasHttpOnlyCookies: boolean;
  hasSameSiteCookies: boolean;
  hasCsp: boolean;
  cspDirectives?: string;
  hasXFrameOptions: boolean;
  hasXContentTypeOptions: boolean;
}

/**
 * Check security headers for a URL
 */
async function checkSecurityHeaders(urlString: string): Promise<SecurityHeadersResult> {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: '/',
          method: 'HEAD',
          timeout: CONNECTION_TIMEOUT_MS,
          rejectUnauthorized: false,
        },
        (res) => {
          const headers = res.headers;

          // Check HSTS
          const hsts = headers['strict-transport-security'];
          let hasHsts = false;
          let hstsMaxAge: number | undefined;
          if (hsts) {
            hasHsts = true;
            const maxAgeMatch = String(hsts).match(/max-age=(\d+)/);
            if (maxAgeMatch) {
              hstsMaxAge = parseInt(maxAgeMatch[1]);
            }
          }

          // Check cookies
          const setCookie = headers['set-cookie'];
          let hasSecureCookies = false;
          let hasHttpOnlyCookies = false;
          let hasSameSiteCookies = false;
          if (setCookie) {
            const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
            for (const cookie of cookies) {
              if (cookie.toLowerCase().includes('secure')) hasSecureCookies = true;
              if (cookie.toLowerCase().includes('httponly')) hasHttpOnlyCookies = true;
              if (cookie.toLowerCase().includes('samesite')) hasSameSiteCookies = true;
            }
          }

          // Check CSP
          const csp = headers['content-security-policy'];
          const hasCsp = !!csp;
          const cspDirectives = csp ? String(csp) : undefined;

          // Check other headers
          const hasXFrameOptions = !!headers['x-frame-options'];
          const hasXContentTypeOptions = !!headers['x-content-type-options'];

          resolve({
            hasHsts,
            hstsMaxAge,
            hasSecureCookies,
            hasHttpOnlyCookies,
            hasSameSiteCookies,
            hasCsp,
            cspDirectives,
            hasXFrameOptions,
            hasXContentTypeOptions,
          });
        }
      );

      req.on('error', () => {
        resolve({
          hasHsts: false,
          hasSecureCookies: false,
          hasHttpOnlyCookies: false,
          hasSameSiteCookies: false,
          hasCsp: false,
          hasXFrameOptions: false,
          hasXContentTypeOptions: false,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          hasHsts: false,
          hasSecureCookies: false,
          hasHttpOnlyCookies: false,
          hasSameSiteCookies: false,
          hasCsp: false,
          hasXFrameOptions: false,
          hasXContentTypeOptions: false,
        });
      });

      req.end();
    } catch {
      resolve({
        hasHsts: false,
        hasSecureCookies: false,
        hasHttpOnlyCookies: false,
        hasSameSiteCookies: false,
        hasCsp: false,
        hasXFrameOptions: false,
        hasXContentTypeOptions: false,
      });
    }
  });
}

/**
 * Probe a single server
 */
async function probeServer(server: { id: string; name: string; apiUrl: string }): Promise<void> {
  log('INFO', `Probing server: ${server.name}`);

  const tlsResult = await probeTls(server.apiUrl);
  const now = new Date();
  const nextCheck = new Date(now.getTime() + PROBE_INTERVAL_MS);

  await prisma.securityProbe.upsert({
    where: { serverId: server.id },
    update: {
      scheme: tlsResult.scheme,
      tlsVersion: tlsResult.tlsVersion,
      cipherSuite: tlsResult.cipherSuite,
      certSubject: tlsResult.certSubject,
      certIssuer: tlsResult.certIssuer,
      certExpiry: tlsResult.certExpiry,
      certDaysLeft: tlsResult.certDaysLeft,
      result: tlsResult.result,
      errorMessage: tlsResult.errorMessage,
      lastCheckedAt: now,
      nextCheckAt: nextCheck,
      updatedAt: now,
    },
    create: {
      serverId: server.id,
      scheme: tlsResult.scheme,
      tlsVersion: tlsResult.tlsVersion,
      cipherSuite: tlsResult.cipherSuite,
      certSubject: tlsResult.certSubject,
      certIssuer: tlsResult.certIssuer,
      certExpiry: tlsResult.certExpiry,
      certDaysLeft: tlsResult.certDaysLeft,
      result: tlsResult.result,
      errorMessage: tlsResult.errorMessage,
      lastCheckedAt: now,
      nextCheckAt: nextCheck,
    },
  });

  log('INFO', `Server ${server.name}: ${tlsResult.result}${tlsResult.certDaysLeft !== undefined ? `, cert expires in ${tlsResult.certDaysLeft} days` : ''}`);
}

/**
 * Calculate security score (0-100)
 */
function calculateSecurityScore(
  scheme: string,
  headers: SecurityHeadersResult
): number {
  let score = 0;

  // HTTPS: 40 points
  if (scheme === 'https') score += 40;

  // HSTS: 15 points
  if (headers.hasHsts) score += 15;

  // Secure cookies: 15 points
  if (headers.hasSecureCookies && headers.hasHttpOnlyCookies && headers.hasSameSiteCookies) {
    score += 15;
  } else if (headers.hasSecureCookies || headers.hasHttpOnlyCookies) {
    score += 7;
  }

  // CSP: 15 points
  if (headers.hasCsp) score += 15;

  // X-Frame-Options: 8 points
  if (headers.hasXFrameOptions) score += 8;

  // X-Content-Type-Options: 7 points
  if (headers.hasXContentTypeOptions) score += 7;

  return score;
}

/**
 * Probe dashboard security
 */
async function probeDashboard(): Promise<void> {
  // Get dashboard URL from settings or environment
  const dashboardUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000';

  log('INFO', `Probing dashboard: ${dashboardUrl}`);

  const tlsResult = await probeTls(dashboardUrl);
  const headers = await checkSecurityHeaders(dashboardUrl);
  const securityScore = calculateSecurityScore(tlsResult.scheme, headers);
  const now = new Date();

  await prisma.dashboardSecurityProbe.upsert({
    where: { id: 'dashboard-security' },
    update: {
      dashboardUrl,
      scheme: tlsResult.scheme,
      tlsVersion: tlsResult.tlsVersion,
      hasHsts: headers.hasHsts,
      hstsMaxAge: headers.hstsMaxAge,
      hasSecureCookies: headers.hasSecureCookies,
      hasHttpOnlyCookies: headers.hasHttpOnlyCookies,
      hasSameSiteCookies: headers.hasSameSiteCookies,
      hasCsp: headers.hasCsp,
      cspDirectives: headers.cspDirectives,
      hasXFrameOptions: headers.hasXFrameOptions,
      hasXContentTypeOptions: headers.hasXContentTypeOptions,
      result: tlsResult.result,
      errorMessage: tlsResult.errorMessage,
      securityScore,
      lastCheckedAt: now,
      updatedAt: now,
    },
    create: {
      id: 'dashboard-security',
      dashboardUrl,
      scheme: tlsResult.scheme,
      tlsVersion: tlsResult.tlsVersion,
      hasHsts: headers.hasHsts,
      hstsMaxAge: headers.hstsMaxAge,
      hasSecureCookies: headers.hasSecureCookies,
      hasHttpOnlyCookies: headers.hasHttpOnlyCookies,
      hasSameSiteCookies: headers.hasSameSiteCookies,
      hasCsp: headers.hasCsp,
      cspDirectives: headers.cspDirectives,
      hasXFrameOptions: headers.hasXFrameOptions,
      hasXContentTypeOptions: headers.hasXContentTypeOptions,
      result: tlsResult.result,
      errorMessage: tlsResult.errorMessage,
      securityScore,
      lastCheckedAt: now,
    },
  });

  log('INFO', `Dashboard security score: ${securityScore}/100`);
}

/**
 * Main probe cycle
 */
async function runProbes(): Promise<void> {
  log('INFO', 'Starting security probe cycle');

  // Probe dashboard
  await probeDashboard();

  // Probe all active servers
  const servers = await prisma.server.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      apiUrl: true,
    },
  });

  log('INFO', `Found ${servers.length} active servers to probe`);

  for (const server of servers) {
    await probeServer(server);
  }

  log('INFO', 'Security probe cycle complete');
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
  log('INFO', 'Security Probe Worker starting...');

  const hasLock = await acquireLock();
  if (!hasLock) {
    log('INFO', 'Could not acquire lock, another worker is running. Exiting.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Setup heartbeat interval
  const heartbeatInterval = setInterval(async () => {
    const stillHaveLock = await renewLock();
    if (!stillHaveLock) {
      log('ERROR', 'Lost lock! Stopping worker.');
      clearInterval(heartbeatInterval);
      await prisma.$disconnect();
      process.exit(1);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    log('INFO', `Received ${signal}, shutting down gracefully...`);
    clearInterval(heartbeatInterval);
    await releaseLock();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Initial probe
  await runProbes();

  // Schedule periodic probes
  setInterval(async () => {
    try {
      await runProbes();
    } catch (error) {
      log('ERROR', 'Error in probe cycle', error);
    }
  }, PROBE_INTERVAL_MS);

  log('INFO', `Worker started. Probing every ${PROBE_INTERVAL_MS / 1000 / 60} minutes`);
}

// Run the worker
runWorker().catch((error) => {
  log('ERROR', 'Worker crashed', error);
  process.exit(1);
});
