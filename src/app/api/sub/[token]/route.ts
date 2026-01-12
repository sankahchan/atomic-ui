/**
 * Subscription Endpoint
 * 
 * This API route provides subscription links for VPN clients. Users can share
 * their subscription token with VPN applications, which will then fetch the
 * current access key configuration from this endpoint.
 * 
 * The endpoint supports multiple output formats to work with different VPN
 * clients and subscription managers.
 * 
 * URL Format: /api/sub/[token]
 * 
 * Query Parameters:
 * - format: Output format (default: "plain")
 *   - plain: Raw ss:// URL
 *   - base64: Base64-encoded ss:// URL
 *   - clash: Clash proxy configuration
 *   - sip008: SIP008 JSON format
 *   - qr: QR code image
 * 
 * Headers:
 * - User-Agent: Used to auto-detect client type
 * 
 * Response:
 * - 200: Subscription content in requested format
 * - 404: Token not found or key inactive
 * - 410: Key has expired or been revoked
 */

import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import QRCode from 'qrcode';

/**
 * Supported subscription output formats.
 * Each format is tailored for specific VPN clients and use cases.
 */
type SubscriptionFormat = 'plain' | 'base64' | 'clash' | 'sip008' | 'qr';

/**
 * GET Handler
 * 
 * Fetches the access key associated with the subscription token and returns
 * it in the requested format. The handler performs validation to ensure the
 * key is still active and within its usage limits.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'plain') as SubscriptionFormat;

    // Find the access key by subscription token
    const accessKey = await prisma.accessKey.findUnique({
      where: { subscriptionToken: token },
      include: {
        server: true,
      },
    });

    // Return 404 if token not found
    if (!accessKey) {
      return new NextResponse('Subscription not found', { status: 404 });
    }

    // Check if the key is still active
    if (accessKey.status === 'DISABLED') {
      return new NextResponse('Subscription has been disabled', { status: 410 });
    }

    if (accessKey.status === 'EXPIRED') {
      return new NextResponse('Subscription has expired', { status: 410 });
    }

    if (accessKey.status === 'DEPLETED') {
      return new NextResponse('Data limit exceeded', { status: 410 });
    }

    // Check if the key is still within its expiration date
    if (accessKey.expiresAt && accessKey.expiresAt < new Date()) {
      // Update status to expired
      await prisma.accessKey.update({
        where: { id: accessKey.id },
        data: { status: 'EXPIRED' },
      });
      return new NextResponse('Subscription has expired', { status: 410 });
    }

    // Handle START_ON_FIRST_USE keys - activate them on first access
    if (accessKey.status === 'PENDING' && accessKey.expirationType === 'START_ON_FIRST_USE') {
      const durationMs = (accessKey.durationDays || 30) * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + durationMs);
      
      await prisma.accessKey.update({
        where: { id: accessKey.id },
        data: {
          status: 'ACTIVE',
          firstUsedAt: new Date(),
          expiresAt,
        },
      });
    }

    // Get the access URL from the key
    const accessUrl = accessKey.accessUrl;
    
    if (!accessUrl) {
      return new NextResponse('Access URL not available', { status: 500 });
    }

    // Generate response based on format
    switch (format) {
      case 'plain':
        return new NextResponse(accessUrl, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `inline; filename="${accessKey.name}.txt"`,
          },
        });

      case 'base64':
        const base64Url = Buffer.from(accessUrl).toString('base64');
        return new NextResponse(base64Url, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `inline; filename="${accessKey.name}.txt"`,
          },
        });

      case 'clash':
        const clashConfig = generateClashConfig(accessKey, accessUrl);
        return new NextResponse(clashConfig, {
          headers: {
            'Content-Type': 'text/yaml; charset=utf-8',
            'Content-Disposition': `attachment; filename="${accessKey.name}.yaml"`,
          },
        });

      case 'sip008':
        const sip008Config = generateSIP008Config(accessKey, accessUrl);
        return new NextResponse(JSON.stringify(sip008Config, null, 2), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${accessKey.name}.json"`,
          },
        });

      case 'qr':
        const qrCode = await QRCode.toBuffer(accessUrl, {
          type: 'png',
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        return new NextResponse(new Uint8Array(qrCode), {
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `inline; filename="${accessKey.name}.png"`,
          },
        });

      default:
        return new NextResponse(accessUrl, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
    }
  } catch (error) {
    console.error('Subscription error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

/**
 * Generate Clash proxy configuration from access URL.
 * 
 * Clash is a popular cross-platform proxy client that supports various
 * protocols including Shadowsocks. This function generates a minimal
 * configuration file that can be imported directly into Clash.
 */
function generateClashConfig(
  accessKey: { name: string; server: { name: string } },
  accessUrl: string
): string {
  // Parse the ss:// URL to extract connection details
  const parsed = parseSSUrl(accessUrl);
  
  if (!parsed) {
    return `# Error: Could not parse access URL`;
  }

  const config = {
    port: 7890,
    'socks-port': 7891,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    proxies: [
      {
        name: accessKey.name,
        type: 'ss',
        server: parsed.server,
        port: parsed.port,
        cipher: parsed.method,
        password: parsed.password,
        udp: true,
      },
    ],
    'proxy-groups': [
      {
        name: 'Proxy',
        type: 'select',
        proxies: [accessKey.name],
      },
    ],
    rules: [
      'GEOIP,CN,DIRECT',
      'MATCH,Proxy',
    ],
  };

  // Convert to YAML manually for consistent formatting
  return `# Clash Configuration for ${accessKey.name}
# Server: ${accessKey.server.name}
# Generated by Atomic-UI

port: ${config.port}
socks-port: ${config['socks-port']}
allow-lan: ${config['allow-lan']}
mode: ${config.mode}
log-level: ${config['log-level']}

proxies:
  - name: "${accessKey.name}"
    type: ss
    server: ${parsed.server}
    port: ${parsed.port}
    cipher: ${parsed.method}
    password: "${parsed.password}"
    udp: true

proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - "${accessKey.name}"

rules:
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
`;
}

/**
 * Generate SIP008 configuration.
 * 
 * SIP008 is a standardized JSON format for Shadowsocks server configurations.
 * It's supported by many Shadowsocks clients including Shadowsocks-Windows,
 * Shadowsocks-Android, and various subscription managers.
 */
function generateSIP008Config(
  accessKey: { name: string; server: { name: string } },
  accessUrl: string
): object {
  const parsed = parseSSUrl(accessUrl);
  
  if (!parsed) {
    return { error: 'Could not parse access URL' };
  }

  return {
    version: 1,
    servers: [
      {
        id: accessKey.name,
        remarks: `${accessKey.name} (${accessKey.server.name})`,
        server: parsed.server,
        server_port: parsed.port,
        password: parsed.password,
        method: parsed.method,
        plugin: '',
        plugin_opts: '',
      },
    ],
    bytes_used: 0,
    bytes_remaining: 0,
  };
}

/**
 * Parse a Shadowsocks URL (ss://) into its components.
 * 
 * SS URL format: ss://BASE64(method:password)@server:port#tag
 * 
 * This parser handles both the standard and alternative URL formats
 * used by various Shadowsocks implementations.
 */
function parseSSUrl(url: string): {
  method: string;
  password: string;
  server: string;
  port: number;
  tag?: string;
} | null {
  try {
    // Remove the ss:// prefix
    const withoutPrefix = url.replace(/^ss:\/\//, '');
    
    // Split by @ to separate credentials from server
    const atIndex = withoutPrefix.lastIndexOf('@');
    
    if (atIndex === -1) {
      // Try alternative format where everything is base64 encoded
      const hashIndex = withoutPrefix.indexOf('#');
      const encoded = hashIndex > -1 ? withoutPrefix.slice(0, hashIndex) : withoutPrefix;
      const tag = hashIndex > -1 ? decodeURIComponent(withoutPrefix.slice(hashIndex + 1)) : undefined;
      
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const [methodPassword, serverPort] = decoded.split('@');
      
      if (!methodPassword || !serverPort) return null;
      
      const [method, password] = methodPassword.split(':');
      const [server, portStr] = serverPort.split(':');
      
      return {
        method,
        password,
        server,
        port: parseInt(portStr),
        tag,
      };
    }
    
    // Standard format: BASE64(method:password)@server:port#tag
    const credentialsEncoded = withoutPrefix.slice(0, atIndex);
    const serverPart = withoutPrefix.slice(atIndex + 1);
    
    // Decode credentials
    const credentials = Buffer.from(credentialsEncoded, 'base64').toString('utf-8');
    const [method, password] = credentials.split(':');
    
    // Parse server and port
    const hashIndex = serverPart.indexOf('#');
    const serverPortPart = hashIndex > -1 ? serverPart.slice(0, hashIndex) : serverPart;
    const tag = hashIndex > -1 ? decodeURIComponent(serverPart.slice(hashIndex + 1)) : undefined;
    
    const colonIndex = serverPortPart.lastIndexOf(':');
    const server = serverPortPart.slice(0, colonIndex);
    const port = parseInt(serverPortPart.slice(colonIndex + 1));
    
    return { method, password, server, port, tag };
  } catch (error) {
    console.error('Error parsing SS URL:', error);
    return null;
  }
}
