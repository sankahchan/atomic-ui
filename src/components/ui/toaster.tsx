'use client';

/**
 * Toaster Component
 * 
 * This component renders toast notifications using Radix UI's Toast primitives.
 * It provides a container for all active toasts and handles their positioning,
 * animations, and automatic dismissal.
 * 
 * The toaster is typically placed at the root layout and receives notifications
 * through the useToast hook which manages the toast state globally.
 */

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';

/**
 * Toaster renders all active toast notifications.
 * 
 * It maps over the toasts array from the useToast hook and renders each
 * toast with its title, description, and action button (if provided).
 * 
 * Toasts are positioned in the bottom-right corner by default and stack
 * vertically when multiple are shown simultaneously.
 */
export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
