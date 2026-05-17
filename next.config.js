/** @type {import('next').NextConfig} */

// Get optional base path from environment (for security - like 3x-ui)
// Example: PANEL_PATH=/secret123 makes panel accessible at http://ip:port/secret123/
const panelPath = process.env.PANEL_PATH || '';

function withPanelPath(path) {
  if (!panelPath) {
    return path;
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${panelPath}${normalized}`;
}

const nextConfig = {
  // Enable standalone output for Docker deployment
  // This creates a minimal .next/standalone folder with all dependencies
  output: 'standalone',

  // Base path for the panel (used for security - random URL path)
  // Leave empty for root access, or set PANEL_PATH=/yourpath
  basePath: panelPath,

  // Expose the base path to the client for generating correct subscription URLs
  env: {
    NEXT_PUBLIC_BASE_PATH: panelPath,
  },

  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },

  // External packages for server components (required for Prisma and native modules)
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'systeminformation'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Disable x-powered-by header for security
  poweredByHeader: false,
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  async redirects() {
    if (!panelPath) {
      return [];
    }

    return [
      {
        source: '/',
        destination: withPanelPath('/login'),
        permanent: false,
        basePath: false,
      },
      {
        source: '/login',
        destination: withPanelPath('/login'),
        permanent: false,
        basePath: false,
      },
      {
        source: '/verify-2fa',
        destination: withPanelPath('/verify-2fa'),
        permanent: false,
        basePath: false,
      },
      {
        source: '/dashboard/:path*',
        destination: withPanelPath('/dashboard/:path*'),
        permanent: false,
        basePath: false,
      },
      {
        source: '/portal/:path*',
        destination: withPanelPath('/portal/:path*'),
        permanent: false,
        basePath: false,
      },
      {
        source: '/sub/:path*',
        destination: withPanelPath('/sub/:path*'),
        permanent: false,
        basePath: false,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline' https:",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
              "connect-src 'self' https: wss: ws:",
              "media-src 'self' data: blob: https:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
