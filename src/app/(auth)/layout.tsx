import { GradientMeshBackground } from '@/components/layout/gradient-mesh-bg';

/**
 * Authentication Layout
 * 
 * This is the layout wrapper for authentication-related pages like login,
 * register, and password reset. Unlike the dashboard layout, this doesn't
 * include the sidebar navigation since these pages should be accessible
 * without authentication.
 * 
 * The layout provides a minimal, clean structure that puts the focus on
 * the authentication form while maintaining the Atomic-UI visual identity.
 */

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <GradientMeshBackground />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
