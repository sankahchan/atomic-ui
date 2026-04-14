'use client';

/**
 * Gradient Mesh Background
 * Animated floating gradient blobs that create a subtle glassmorphism backdrop.
 */
export function GradientMeshBackground() {
  return (
    <div className="bg-mesh" aria-hidden="true">
      <div
        className="absolute left-[6%] top-[8%] h-[24rem] w-[24rem] rounded-full opacity-90"
        style={{
          background: 'var(--mesh-color-1)',
          filter: 'blur(92px)',
          animation: 'mesh-float 24s ease-in-out infinite',
          animationDelay: '-4s',
        }}
      />
      <div
        className="absolute bottom-[10%] right-[8%] h-[22rem] w-[22rem] rounded-full opacity-80"
        style={{
          background: 'var(--mesh-color-2)',
          filter: 'blur(96px)',
          animation: 'mesh-float 28s ease-in-out infinite',
          animationDelay: '-10s',
        }}
      />
      <div
        className="absolute left-1/2 top-[18%] h-[18rem] w-[18rem] -translate-x-1/2 rounded-full opacity-75"
        style={{
          background: 'var(--mesh-color-3)',
          filter: 'blur(88px)',
          animation: 'mesh-float 30s ease-in-out infinite',
          animationDelay: '-12s',
        }}
      />
      <div className="absolute inset-x-[18%] top-[-10%] h-[18rem] rounded-full bg-white/30 blur-3xl dark:bg-white/[0.05]" />
    </div>
  );
}
