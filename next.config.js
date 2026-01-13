/** @type {import('next').NextConfig} */
const nextConfig = {
  // Note: 'standalone' output removed - causes server action issues in production
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
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

