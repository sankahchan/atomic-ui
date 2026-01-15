import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { TRPCProvider } from '@/components/providers/trpc-provider';
import { SessionProvider } from '@/components/providers/session-provider';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

/**
 * Application Metadata
 * 
 * This metadata is used for SEO and browser display. The title template
 * allows child pages to set their own titles while maintaining the app name.
 */
export const metadata: Metadata = {
  title: {
    default: 'Atomic-UI | Outline VPN Management',
    template: '%s | Atomic-UI',
  },
  description: 'Advanced Outline VPN management panel with multi-server support, dynamic access keys, health monitoring, and more.',
  keywords: ['VPN', 'Outline', 'Management', 'Panel', 'Admin', 'Dashboard'],
  authors: [{ name: 'sankahchan', url: 'https://github.com/sankahchan' }],
  creator: 'sankahchan',
  icons: {
    icon: '/favicon.ico',
  },
};

/**
 * Viewport Configuration
 * 
 * These settings control how the page is displayed on mobile devices
 * and set the theme color for the browser UI.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
};

/**
 * Root Layout Component
 * 
 * This is the top-level layout that wraps all pages in the application.
 * It sets up the HTML structure, applies fonts, and wraps children with
 * the necessary providers for theming, state management, and API access.
 * 
 * The layout hierarchy is:
 * 1. HTML with language and font classes
 * 2. ThemeProvider for dark/light mode
 * 3. TRPCProvider for API access and caching
 * 4. Toaster for notifications
 * 5. Page content (children)
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        {/* ThemeProvider enables dark/light mode switching */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {/* TRPCProvider enables type-safe API calls */}
          <TRPCProvider>
            <SessionProvider>
              {/* Main content area */}
              {children}

              {/* Toast notifications container */}
              <Toaster />
            </SessionProvider>
          </TRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
