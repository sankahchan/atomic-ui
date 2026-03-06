'use client';

/**
 * Gradient Mesh Background
 * Animated floating gradient blobs that create a subtle glassmorphism backdrop.
 */
export function GradientMeshBackground() {
  return (
    <div className="bg-mesh" aria-hidden="true">
      <div
        className="absolute w-[40%] h-[40%] top-1/2 left-1/3 rounded-full"
        style={{
          background: 'var(--mesh-color-3)',
          filter: 'blur(80px)',
          animation: 'mesh-float 25s ease-in-out infinite',
          animationDelay: '-5s',
        }}
      />
    </div>
  );
}
