/** @type {import('next').NextConfig} */
const nextConfig = {
  // External packages for server components (required for Prisma)
  experimental: {
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


