import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge Variants
 * 
 * Badges are small visual indicators used to highlight status, counts,
 * or categories. They come in several variants to convey different meanings.
 */
const badgeVariants = cva(
  // Base styles for all badges
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        // Default badge with primary styling
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        // Secondary/muted badge for less emphasis
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // Destructive badge for errors or warnings
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        // Outline badge for subtle indication
        outline: 'text-foreground',
        // Success badge (green)
        success:
          'border-green-500/30 bg-green-500/20 text-green-400',
        // Warning badge (yellow/amber)
        warning:
          'border-yellow-500/30 bg-yellow-500/20 text-yellow-400',
        // Danger badge (red)
        danger:
          'border-red-500/30 bg-red-500/20 text-red-400',
        // Info badge (blue)
        info:
          'border-blue-500/30 bg-blue-500/20 text-blue-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge Component
 * 
 * A small visual indicator for status, counts, or categories.
 * 
 * @example
 * // Status badge
 * <Badge variant="success">Active</Badge>
 * 
 * @example
 * // Count badge
 * <Badge variant="secondary">12</Badge>
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
