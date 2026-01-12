'use client';

/**
 * Separator Component
 * 
 * This component renders a visual divider that can be used to separate content
 * both horizontally and vertically. It's built on Radix UI's Separator primitive,
 * which handles accessibility concerns by rendering the appropriate semantic
 * element and ARIA attributes.
 * 
 * The separator is purely decorative (aria-orientation is set appropriately),
 * so screen readers will not announce it, but it provides important visual
 * structure for sighted users.
 * 
 * Usage Examples:
 * 
 * Horizontal separator (default):
 * <Separator />
 * 
 * Vertical separator:
 * <Separator orientation="vertical" />
 * 
 * With custom styling:
 * <Separator className="my-8 bg-primary/20" />
 */

import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

/**
 * Separator Component
 * 
 * A simple but essential UI component for creating visual breaks in content.
 * The default orientation is horizontal, rendering as a thin horizontal line
 * that spans the width of its container. When vertical, it creates a thin
 * vertical line that can be used to separate inline or flex items.
 * 
 * Props:
 * - orientation: "horizontal" | "vertical" - defaults to "horizontal"
 * - decorative: boolean - if true, element is hidden from assistive technology
 * - className: string - additional CSS classes for customization
 */
const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  (
    { className, orientation = 'horizontal', decorative = true, ...props },
    ref
  ) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        // Shrink-0 ensures the separator maintains its size in flex containers
        'shrink-0 bg-border',
        // Apply different dimensions based on orientation
        // Horizontal: full width, thin height
        // Vertical: thin width, full height
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
