import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button Variants
 * 
 * Defines all possible button styles using class-variance-authority.
 * This allows type-safe variant props and consistent styling across the app.
 */
const buttonVariants = cva(
  // Base styles applied to all buttons
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary action button with atomic cyan
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        // Destructive actions like delete
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Bordered button for secondary actions
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        // Subtle background button
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // Minimal button with no background
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        // Text-only button that looks like a link
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

/**
 * Button Props Interface
 * 
 * Extends standard button props with variant options and asChild support.
 * When asChild is true, the button renders its child as the root element,
 * useful for wrapping links or other components with button styling.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * Button Component
 * 
 * A versatile button component with multiple variants and sizes.
 * Supports the asChild pattern for rendering as different elements.
 * 
 * @example
 * // Primary button
 * <Button>Click me</Button>
 * 
 * @example
 * // Destructive button
 * <Button variant="destructive">Delete</Button>
 * 
 * @example
 * // As a link
 * <Button asChild>
 *   <Link href="/dashboard">Go to Dashboard</Link>
 * </Button>
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
