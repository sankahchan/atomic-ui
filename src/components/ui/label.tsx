'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Label Variants
 * 
 * While labels typically have a single style, using CVA allows for
 * easy extension if different label styles are needed in the future.
 */
const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
);

/**
 * Label Component
 * 
 * An accessible label component built on Radix UI's Label primitive.
 * Properly associates with form controls using the htmlFor prop and
 * handles the disabled state of peer elements.
 * 
 * @example
 * // Basic usage with input
 * <Label htmlFor="email">Email address</Label>
 * <Input id="email" type="email" />
 * 
 * @example
 * // With disabled input (label will also appear disabled)
 * <Label htmlFor="name">Name</Label>
 * <Input id="name" disabled className="peer" />
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
