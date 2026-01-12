'use client';

/**
 * useToast Hook
 * 
 * This hook provides a simple API for showing toast notifications throughout
 * the application. It manages a global toast state using React's useReducer
 * and provides functions to add, update, and dismiss toasts.
 * 
 * The implementation uses a reducer pattern to handle all toast state changes
 * predictably, making debugging easier and preventing race conditions.
 */

import * as React from 'react';
import type { ToastActionElement, ToastProps } from '@/components/ui/toast';

// Maximum number of toasts that can be shown at once
// Additional toasts will replace older ones
const TOAST_LIMIT = 1;

// Time in milliseconds before a toast auto-dismisses
// Toasts with actions stay visible longer to give users time to interact
const TOAST_REMOVE_DELAY = 5000;

/**
 * Toast data structure extending the base ToastProps with additional fields
 * for managing the toast lifecycle and content.
 */
type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

/**
 * Action types for the toast reducer.
 * Each action represents a specific state change in the toast system.
 */
const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const;

// Counter for generating unique toast IDs
let count = 0;

/**
 * Generates a unique ID for each toast.
 * Uses a simple incrementing counter which is sufficient for client-side use.
 */
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

// Type definitions for reducer actions
type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType['ADD_TOAST'];
      toast: ToasterToast;
    }
  | {
      type: ActionType['UPDATE_TOAST'];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType['DISMISS_TOAST'];
      toastId?: ToasterToast['id'];
    }
  | {
      type: ActionType['REMOVE_TOAST'];
      toastId?: ToasterToast['id'];
    };

/**
 * State shape for the toast system.
 * Contains an array of all active toasts.
 */
interface State {
  toasts: ToasterToast[];
}

// Map to track toast removal timeouts
// This allows us to cancel pending removals if needed
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Adds a toast to the removal queue.
 * After TOAST_REMOVE_DELAY, the toast will be removed from the DOM.
 * 
 * This two-step process (dismiss then remove) allows for exit animations
 * to play before the toast is actually removed from the DOM.
 */
const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: 'REMOVE_TOAST',
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

/**
 * Reducer function that handles all toast state changes.
 * 
 * Actions:
 * - ADD_TOAST: Adds a new toast, respecting TOAST_LIMIT
 * - UPDATE_TOAST: Updates an existing toast's properties
 * - DISMISS_TOAST: Marks a toast for dismissal (triggers exit animation)
 * - REMOVE_TOAST: Removes a toast from the DOM entirely
 */
export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        // Add new toast at the beginning, limit total count
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case 'DISMISS_TOAST': {
      const { toastId } = action;

      // Schedule removal for dismissed toast(s)
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        // Dismiss all toasts
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

// Global state and listeners for cross-component communication
const listeners: Array<(state: State) => void> = [];

// In-memory state that persists across hook calls
let memoryState: State = { toasts: [] };

/**
 * Dispatches an action to update the toast state.
 * Also notifies all listeners of the state change.
 */
function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

// Type for the toast function parameter
type Toast = Omit<ToasterToast, 'id'>;

/**
 * Creates a new toast notification.
 * 
 * Returns an object with:
 * - id: The unique identifier for this toast
 * - dismiss: Function to manually dismiss this specific toast
 * - update: Function to update this toast's properties
 */
function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });

  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

/**
 * useToast Hook
 * 
 * Provides access to the toast system from any component. Returns the current
 * toast state and functions to create and dismiss toasts.
 * 
 * Usage:
 * 
 * ```tsx
 * function MyComponent() {
 *   const { toast } = useToast();
 *   
 *   const handleClick = () => {
 *     toast({
 *       title: "Success!",
 *       description: "Your changes have been saved.",
 *     });
 *   };
 *   
 *   return <button onClick={handleClick}>Save</button>;
 * }
 * ```
 */
function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    // Subscribe to state changes
    listeners.push(setState);
    
    // Cleanup: unsubscribe when component unmounts
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}

export { useToast, toast };
