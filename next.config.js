/** @type {import('next').NextConfig} */

// Get optional base path from environment (for security - like 3x-ui)
// Example: PANEL_PATH=/secret123 makes panel accessible at http://ip:port/secret123/
const panelPath = process.env.PANEL_PATH || '';

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

  // External packages for server components (required for Prisma and native modules)
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'systeminformation'],
  experimental: {
    instrumentationHook: true,
  },
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
};

module.exports = nextConfig;



