/**
 * Debug utility for conditional logging
 *
 * Usage:
 *   import { debug } from '@/utils/debug';
 *   debug.log('message');      // Only logs when DEBUG is true
 *   debug.warn('warning');     // Only logs when DEBUG is true
 *   debug.error('error');      // Always logs (errors are important)
 *
 * Enable debug mode:
 *   - Set localStorage.setItem('debug', 'true') in browser console
 *   - Or add ?debug=true to URL
 */

const isDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Check URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('debug') === 'true') return true;

  // Check localStorage
  try {
    return localStorage.getItem('debug') === 'true';
  } catch {
    return false;
  }
};

// Cache the result to avoid repeated checks
let debugEnabled: boolean | null = null;

const getDebugEnabled = (): boolean => {
  if (debugEnabled === null) {
    debugEnabled = isDebugEnabled();
  }
  return debugEnabled;
};

export const debug = {
  log: (...args: unknown[]): void => {
    if (getDebugEnabled()) {
      console.log(...args);
    }
  },

  warn: (...args: unknown[]): void => {
    if (getDebugEnabled()) {
      console.warn(...args);
    }
  },

  error: (...args: unknown[]): void => {
    // Errors always log - they're important
    console.error(...args);
  },

  // Force enable/disable debug mode at runtime
  enable: (): void => {
    debugEnabled = true;
    try {
      localStorage.setItem('debug', 'true');
    } catch {
      // Ignore storage errors
    }
  },

  disable: (): void => {
    debugEnabled = false;
    try {
      localStorage.removeItem('debug');
    } catch {
      // Ignore storage errors
    }
  },

  isEnabled: (): boolean => getDebugEnabled(),
};

// Expose to window for easy access in browser console
if (typeof window !== 'undefined') {
  (window as unknown as { debug: typeof debug }).debug = debug;
}
