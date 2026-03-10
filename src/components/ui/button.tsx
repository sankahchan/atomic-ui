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
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary action button with atomic cyan
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-[linear-gradient(135deg,rgba(6,182,212,0.98),rgba(34,211,238,0.88))] dark:text-slate-950 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_16px_34px_rgba(6,182,212,0.28),0_0_36px_rgba(34,211,238,0.14)] dark:hover:brightness-110',
        // Destructive actions like delete
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:shadow-[0_0_0_1px_rgba(251,113,133,0.14),0_14px_30px_rgba(190,24,93,0.22)]',
        // Bordered button for secondary actions
        outline:
          'bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] border-[var(--glass-border)] hover:bg-[var(--glass-bg-medium)] hover:text-accent-foreground dark:border-[rgba(34,211,238,0.16)] dark:bg-[linear-gradient(180deg,rgba(6,14,28,0.9),rgba(5,12,24,0.8))] dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(125,211,252,0.05)] dark:hover:border-[rgba(34,211,238,0.28)] dark:hover:bg-[linear-gradient(180deg,rgba(8,18,34,0.94),rgba(6,14,28,0.86))] dark:hover:shadow-[0_0_28px_rgba(34,211,238,0.08),inset_0_1px_0_rgba(125,211,252,0.06)]',
        // Subtle background button
        secondary:
          'bg-[var(--glass-bg-medium)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] text-secondary-foreground hover:bg-[var(--glass-bg)] dark:bg-[linear-gradient(180deg,rgba(8,17,31,0.92),rgba(6,13,26,0.8))] dark:text-slate-100 dark:hover:bg-[linear-gradient(180deg,rgba(9,19,35,0.94),rgba(7,15,29,0.86))]',
        // Minimal button with no background
        ghost:
          'hover:bg-[var(--glass-bg-light)] hover:text-accent-foreground dark:text-slate-300 dark:hover:bg-[rgba(34,211,238,0.08)] dark:hover:text-cyan-100',
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
