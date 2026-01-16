/** @type {import('next').NextConfig} */

// Get optional base path from environment (for security - like 3x-ui)
// Example: PANEL_PATH=/secret123 makes panel accessible at http://ip:port/secret123/
const panelPath = process.env.PANEL_PATH || '';

const nextConfig = {
  // Base path for the panel (used for security - random URL path)
  // Leave empty for root access, or set PANEL_PATH=/yourpath
  basePath: panelPath,

  // External packages for server components (required for Prisma)
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
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



