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
  'inline-flex items-center justify-center whitespace-nowrap rounded-[1.1rem] text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary action button with atomic cyan
        default:
          'bg-[linear-gradient(135deg,rgba(115,198,255,0.98),rgba(132,146,255,0.92))] text-slate-950 shadow-[0_18px_36px_rgba(122,161,255,0.24),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-105 dark:bg-[linear-gradient(135deg,rgba(115,198,255,0.94),rgba(132,146,255,0.88))] dark:text-slate-950 dark:shadow-[0_20px_40px_rgba(82,128,255,0.26),0_0_24px_rgba(120,180,255,0.12),inset_0_1px_0_rgba(255,255,255,0.24)]',
        // Destructive actions like delete
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_16px_30px_rgba(239,68,68,0.16)] hover:bg-destructive/92 dark:shadow-[0_18px_34px_rgba(190,24,93,0.24),inset_0_1px_0_rgba(255,255,255,0.12)]',
        // Bordered button for secondary actions
        outline:
          'border border-white/55 bg-white/52 text-foreground shadow-[0_14px_30px_rgba(148,163,184,0.14),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-[24px] [-webkit-backdrop-filter:blur(24px)] hover:bg-white/68 hover:text-accent-foreground dark:border-[rgba(214,227,255,0.14)] dark:bg-[linear-gradient(180deg,rgba(14,20,34,0.62),rgba(10,16,28,0.38))] dark:text-slate-100 dark:shadow-[0_18px_36px_rgba(0,3,12,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-[rgba(214,227,255,0.22)] dark:hover:bg-[linear-gradient(180deg,rgba(16,23,38,0.7),rgba(10,16,28,0.46))]',
        // Subtle background button
        secondary:
          'border border-white/45 bg-white/44 text-secondary-foreground shadow-[0_14px_28px_rgba(148,163,184,0.12),inset_0_1px_0_rgba(255,255,255,0.48)] backdrop-blur-[22px] [-webkit-backdrop-filter:blur(22px)] hover:bg-white/58 dark:border-[rgba(214,227,255,0.12)] dark:bg-[linear-gradient(180deg,rgba(18,25,40,0.56),rgba(12,18,31,0.34))] dark:text-slate-100 dark:shadow-[0_18px_34px_rgba(0,3,12,0.24),inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:bg-[linear-gradient(180deg,rgba(22,30,47,0.64),rgba(12,18,31,0.4))]',
        // Minimal button with no background
        ghost:
          'hover:bg-white/34 hover:text-accent-foreground dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-cyan-100',
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
