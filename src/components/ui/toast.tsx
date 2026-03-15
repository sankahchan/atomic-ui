'use client';

import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toast Component System
 * 
 * A notification toast system built on Radix UI's Toast primitive.
 * Toasts are temporary messages that appear to inform users about
 * the result of actions or important events.
 */

const ToastProvider = ToastPrimitives.Provider;

/**
 * ToastViewport Component
 * 
 * The container where toasts are rendered. Fixed to the bottom-right
 * corner of the screen with proper spacing and stacking.
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-3 p-3 sm:top-auto sm:flex-col',
      'sm:bottom-0 sm:right-0 sm:w-[400px] sm:max-w-[calc(100vw-1.5rem)] sm:p-4',
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

/**
 * Toast Variants
 */
const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-start justify-between gap-4 overflow-hidden rounded-[1.4rem] border px-5 py-4 pr-12 shadow-lg backdrop-blur-xl [-webkit-backdrop-filter:blur(20px)] transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
  {
    variants: {
      variant: {
        default:
          'border-white/16 bg-white/85 text-slate-900 shadow-[0_18px_38px_rgba(15,23,42,0.14)] dark:border-cyan-400/18 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_22%),linear-gradient(180deg,rgba(6,14,28,0.96),rgba(4,10,22,0.9))] dark:text-slate-100 dark:shadow-[0_26px_60px_rgba(1,6,20,0.5),0_0_24px_rgba(34,211,238,0.08)]',
        destructive:
          'destructive group border-rose-500/30 bg-rose-500/14 text-rose-900 dark:border-rose-500/28 dark:bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.18),transparent_24%),linear-gradient(180deg,rgba(45,10,20,0.96),rgba(28,7,15,0.9))] dark:text-rose-50 dark:shadow-[0_24px_50px_rgba(40,5,15,0.45)]',
        success:
          'border-emerald-500/26 bg-emerald-500/12 text-emerald-900 dark:border-emerald-400/24 dark:bg-[radial-gradient(circle_at_top_right,rgba(74,222,128,0.16),transparent_24%),linear-gradient(180deg,rgba(8,28,20,0.96),rgba(6,18,14,0.88))] dark:text-emerald-50 dark:shadow-[0_24px_50px_rgba(3,18,11,0.42)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/**
 * Toast Component
 */
const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

/**
 * ToastAction Component
 * 
 * An optional action button within a toast.
 */
const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3.5 text-sm font-medium ring-offset-background transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border-white/18 bg-white/12 text-inherit hover:bg-white/18 dark:border-cyan-400/16 dark:bg-white/[0.04] dark:hover:border-cyan-400/24 dark:hover:bg-cyan-400/10 group-[.destructive]:border-rose-400/22 group-[.destructive]:hover:bg-rose-500/14 group-[.destructive]:focus:ring-rose-400',
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

/**
 * ToastClose Component
 * 
 * Close button for the toast.
 */
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/14 bg-white/8 text-foreground/60 opacity-90 transition-all hover:border-white/24 hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 dark:border-cyan-400/14 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-cyan-400/24 dark:hover:text-cyan-100 group-[.destructive]:border-rose-400/20 group-[.destructive]:text-rose-200 group-[.destructive]:hover:text-rose-50 group-[.destructive]:focus:ring-rose-400',
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

/**
 * ToastTitle Component
 */
const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('text-sm font-semibold tracking-[0.01em]', className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

/**
 * ToastDescription Component
 */
const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm leading-6 text-slate-600 dark:text-slate-300/86', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
