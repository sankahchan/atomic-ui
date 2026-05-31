/**
 * Outline VPN Server API Client
 *
 * This module provides a comprehensive interface to interact with Outline VPN servers
 * through their Management API. It handles all CRUD operations for access keys,
 * server metrics, and configuration management.
 *
 * The Outline API uses a self-signed certificate, so we need to handle HTTPS
 * connections with custom certificate validation.
 */

import https from 'https';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import type { TLSSocket } from 'tls';
import { isIP } from 'node:net';
import { isPlaywrightSmokeEnv } from './playwright-smoke';

export function isBlockedIpAddress(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  const family = isIP(normalizedHostname);

  if (family === 4) {
    const parts = normalizedHostname.split('.');
    const firstOctet = Number.parseInt(parts[0] ?? '', 10);
    const secondOctet = Number.parseInt(parts[1] ?? '', 10);

    return (
      normalizedHostname === '0.0.0.0' ||
      firstOctet === 127 ||
      firstOctet === 10 ||
      (firstOctet === 169 && secondOctet === 254) ||
      (firstOctet === 192 && secondOctet === 168) ||
      (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31)
    );
  }

  if (family === 6) {
    if (normalizedHostname.startsWith('::ffff:')) {
      return isBlockedIpAddress(normalizedHostname.slice('::ffff:'.length));
    }

    return (
      normalizedHostname === '::' ||
      normalizedHostname === '::1' ||
      normalizedHostname.startsWith('fe80:') ||
      normalizedHostname.startsWith('fc') ||
      normalizedHostname.startsWith('fd')
    );
  }

  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, '');

  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname === 'localhost.localdomain' ||
    normalizedHostname.endsWith('.localdomain') ||
    normalizedHostname.endsWith('.local')
  ) {
    return true;
  }

  if (isBlockedIpAddress(normalizedHostname)) {
    return true;
  }

  return false;
}

async function resolvePublicAddresses(hostname: string): Promise<LookupAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  const blockedAddress = addresses.find((address) => isBlockedIpAddress(address.address));

  if (blockedAddress) {
    throw new OutlineApiError(
      `Outline API hostname resolves to a blocked address: ${blockedAddress.address}`,
      0,
    );
  }

  return addresses;
}

// Type definitions for Outline API responses
export interface OutlineServer {
  name: string;
  serverId: string;
  metricsEnabled: boolean;
  createdTimestampMs: number;
  version: string;
  portForNewAccessKeys: number;
  hostnameForAccessKeys: string;
  accessKeyDataLimit?: {
    bytes: number;
  };
}

export interface OutlineAccessKey {
  id: string;
  name: string;
  password: string;
  port: number;
  method: string;
  accessUrl: string;
  dataLimit?: {
    bytes: number;
  };
}

export interface OutlineMetrics {
  bytesTransferredByUserId: {
    [keyId: string]: number;
  };
}

export interface OutlineDataLimit {
  bytes: number;
}

export function normalizeCertificateFingerprint(value: string | null | undefined) {
  return (value || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

export function matchesCertificateFingerprint(
  actualFingerprint: string | null | undefined,
  expectedFingerprint: string | null | undefined,
) {
  const actual = normalizeCertificateFingerprint(actualFingerprint);
  const expected = normalizeCertificateFingerprint(expectedFingerprint);
  return actual.length > 0 && expected.length > 0 && actual === expected;
}

// Error class for Outline API errors
export class OutlineApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'OutlineApiError';
  }
}

/**
 * Outline API Client class
 * 
 * This client manages all interactions with a single Outline VPN server.
 * Each server requires its own client instance with the appropriate API URL
 * and certificate fingerprint.
 */
export class OutlineClient {
  private apiUrl: string;
  private certSha256: string;
  private httpsAgent: https.Agent;

  constructor(apiUrl: string, certSha256: string) {
    // Remove trailing slash from API URL for consistency
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.certSha256 = certSha256;

    // Disable TLS session caching so repeated self-signed manager calls keep
    // returning the peer certificate fingerprint on every handshake.
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      maxCachedSessions: 0,
    });
  }

  /**
   * Make an HTTP request to the Outline API using Node.js https module
   * This properly handles self-signed certificates
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`);
    const allowPrivateOutlineTargets = isPlaywrightSmokeEnv();

    if (!allowPrivateOutlineTargets && isBlockedHostname(url.hostname)) {
      throw new OutlineApiError(
        `Outline API hostname is not allowed: ${url.hostname}`,
        0,
      );
    }

    const resolvedAddresses = allowPrivateOutlineTargets
      ? null
      : await resolvePublicAddresses(url.hostname);

    return new Promise((resolve, reject) => {
      const requestBody = body ? JSON.stringify(body) : undefined;
      const pinnedLookup: NonNullable<https.RequestOptions['lookup']> | undefined = resolvedAddresses
        ? (
            _hostname: string,
            lookupOptions: LookupOptions,
            callback: (
              err: NodeJS.ErrnoException | null,
              address: string | LookupAddress[],
              family?: number,
            ) => void,
          ) => {
            const requestedFamily = lookupOptions.family ?? 0;
            const matches = requestedFamily
              ? resolvedAddresses.filter((address) => address.family === requestedFamily)
              : resolvedAddresses;

            if (matches.length === 0) {
              callback(
                new Error('Outline API hostname did not resolve to a compatible address family'),
                '',
                4,
              );
              return;
            }

            if (lookupOptions.all) {
              callback(null, matches);
              return;
            }

            const [match] = matches;
            callback(null, match.address, match.family);
          }
        : undefined;

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        agent: this.httpsAgent,
        ...(pinnedLookup ? { lookup: pinnedLookup } : {}),
        headers: {
          'Content-Type': 'application/json',
          ...(requestBody ? { 'Content-Length': Buffer.byteLength(requestBody) } : {}),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // Handle empty responses (204 No Content)
          if (res.statusCode === 204) {
            resolve(undefined as T);
            return;
          }

          // Handle error responses
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new OutlineApiError(
              `Outline API error: ${res.statusMessage}`,
              res.statusCode,
              data
            ));
            return;
          }

          // Parse JSON response
          if (!data) {
            resolve(undefined as T);
            return;
          }

          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new OutlineApiError('Failed to parse response', 0, data));
          }
        });
      });

      req.on('socket', (socket) => {
        const tlsSocket = socket as TLSSocket;
        tlsSocket.once('secureConnect', () => {
          const peerCertificate = tlsSocket.getPeerCertificate();
          const actualFingerprint =
            peerCertificate && typeof peerCertificate.fingerprint256 === 'string'
              ? peerCertificate.fingerprint256
              : null;

          if (!matchesCertificateFingerprint(actualFingerprint, this.certSha256)) {
            req.destroy(
              new OutlineApiError(
                'Outline server certificate fingerprint mismatch',
                0,
                {
                  expectedFingerprint: this.certSha256,
                  actualFingerprint,
                },
              ),
            );
          }
        });
      });

      req.on('error', (error) => {
        reject(new OutlineApiError(
          `Failed to connect to Outline server: ${error.message}`,
          0
        ));
      });

      // Set timeout
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new OutlineApiError('Connection timeout', 0));
      });

      if (requestBody) {
        req.write(requestBody);
      }

      req.end();
    });
  }

  // ============================================
  // Server Information
  // ============================================

  /**
   * Get server information
   * Returns details about the Outline server including version and hostname
   */
  async getServerInfo(): Promise<OutlineServer> {
    return this.request<OutlineServer>('GET', '/server');
  }

  /**
   * Rename the server
   */
  async renameServer(name: string): Promise<void> {
    await this.request('PUT', '/name', { name });
  }

  /**
   * Set the hostname for access keys
   * This is the hostname clients will connect to
   */
  async setHostname(hostname: string): Promise<void> {
    await this.request('PUT', '/server/hostname-for-access-keys', { hostname });
  }

  /**
   * Set the default port for new access keys
   */
  async setPortForNewKeys(port: number): Promise<void> {
    await this.request('PUT', '/server/port-for-new-access-keys', { port });
  }

  /**
   * Set the default data limit for all access keys
   */
  async setDefaultDataLimit(bytes: number): Promise<void> {
    await this.request('PUT', '/server/access-key-data-limit', {
      limit: { bytes }
    });
  }

  /**
   * Remove the default data limit
   */
  async removeDefaultDataLimit(): Promise<void> {
    await this.request('DELETE', '/server/access-key-data-limit');
  }

  // ============================================
  // Access Key Management
  // ============================================

  /**
   * List all access keys on the server
   */
  async listAccessKeys(): Promise<OutlineAccessKey[]> {
    const response = await this.request<{ accessKeys: OutlineAccessKey[] }>(
      'GET',
      '/access-keys'
    );
    return response.accessKeys;
  }

  /**
   * Get a specific access key by ID
   */
  async getAccessKey(keyId: string): Promise<OutlineAccessKey> {
    return this.request<OutlineAccessKey>('GET', `/access-keys/${keyId}`);
  }

  /**
   * Create a new access key
   * Optionally specify an ID, name, port, and method
   */
  async createAccessKey(options?: {
    id?: string;
    name?: string;
    port?: number;
    method?: string;
    password?: string;
    limit?: { bytes: number };
  }): Promise<OutlineAccessKey> {
    // The Outline API supports creating keys with specific IDs
    if (options?.id) {
      return this.request<OutlineAccessKey>('PUT', `/access-keys/${options.id}`, {
        name: options.name,
        port: options.port,
        method: options.method,
        password: options.password,
        limit: options.limit,
      });
    }

    return this.request<OutlineAccessKey>('POST', '/access-keys', options);
  }

  /**
   * Delete an access key
   */
  async deleteAccessKey(keyId: string): Promise<void> {
    await this.request('DELETE', `/access-keys/${keyId}`);
  }

  /**
   * Rename an access key
   */
  async renameAccessKey(keyId: string, name: string): Promise<void> {
    await this.request('PUT', `/access-keys/${keyId}/name`, { name });
  }

  /**
   * Set a data limit for an access key
   * The limit is in bytes
   */
  async setAccessKeyDataLimit(keyId: string, bytes: number): Promise<void> {
    await this.request('PUT', `/access-keys/${keyId}/data-limit`, {
      limit: { bytes },
    });
  }

  /**
   * Remove the data limit for an access key
   */
  async removeAccessKeyDataLimit(keyId: string): Promise<void> {
    await this.request('DELETE', `/access-keys/${keyId}/data-limit`);
  }

  // ============================================
  // Metrics
  // ============================================

  /**
   * Check if metrics are enabled on the server
   */
  async getMetricsEnabled(): Promise<boolean> {
    const response = await this.request<{ metricsEnabled: boolean }>(
      'GET',
      '/metrics/enabled'
    );
    return response.metricsEnabled;
  }

  /**
   * Enable or disable metrics collection
   */
  async setMetricsEnabled(enabled: boolean): Promise<void> {
    await this.request('PUT', '/metrics/enabled', { metricsEnabled: enabled });
  }

  /**
   * Get transfer metrics for all access keys
   * Returns bytes transferred per key ID
   */
  async getMetrics(): Promise<OutlineMetrics> {
    return this.request<OutlineMetrics>('GET', '/metrics/transfer');
  }

  /**
   * Get data usage for all access keys
   * Returns a map of Key ID -> Bytes Used
   */
  async getDataUsage(): Promise<{ bytesByAccessKey: Record<string, number> }> {
    const metrics = await this.getMetrics();
    return {
      bytesByAccessKey: metrics.bytesTransferredByUserId,
    };
  }

  // ============================================
  // Health Check
  // ============================================

  /**
   * Check if the server is reachable and healthy
   * Returns latency in milliseconds if healthy, or throws an error
   */
  async healthCheck(): Promise<number> {
    const startTime = Date.now();

    try {
      await this.getServerInfo();
      return Date.now() - startTime;
    } catch (error) {
      throw new OutlineApiError(
        'Server health check failed',
        0,
        error
      );
    }
  }

  /**
   * Test the connection to the server
   * Returns true if successful, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getServerInfo();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create an Outline client from server configuration
 */
export function createOutlineClient(apiUrl: string, certSha256: string): OutlineClient {
  return new OutlineClient(apiUrl, certSha256);
}

/**
 * Parse an Outline Manager installation output to extract API URL and cert
 * The format is typically:
 * {"apiUrl":"https://x.x.x.x:xxxx/xxxxxxxx","certSha256":"XXXX..."}
 */
export function parseOutlineConfig(config: string): { apiUrl: string; certSha256: string } | null {
  try {
    const parsed = JSON.parse(config);
    if (parsed.apiUrl && parsed.certSha256) {
      return {
        apiUrl: parsed.apiUrl,
        certSha256: parsed.certSha256,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Format bytes to human-readable string
 * Examples: 1.5 GB, 256 MB, 1.2 TB
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

/**
 * Parse a human-readable size string to bytes
 * Examples: "1.5 GB" -> 1610612736, "256 MB" -> 268435456
 */
export function parseBytes(sizeStr: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return Math.floor(value * units[unit]);
}
