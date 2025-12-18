/**
 * Error Handler - Global error handling and recovery for the game
 *
 * Provides:
 * - Global error catching
 * - Error reporting/logging
 * - Graceful degradation
 * - User-friendly error display
 */

import { debug } from './debug';

export interface ErrorInfo {
  message: string;
  stack?: string;
  context?: string;
  recoverable: boolean;
}

type ErrorCallback = (error: ErrorInfo) => void;

class ErrorHandler {
  private errorCallbacks: ErrorCallback[] = [];
  private errorContainer: HTMLElement | null = null;
  private initialized = false;

  /**
   * Initialize global error handling
   */
  init(): void {
    if (this.initialized) return;

    // Create error display container
    this.createErrorContainer();

    // Global error handler
    window.onerror = (message, source, lineno, colno, error) => {
      this.handleError({
        message: String(message),
        stack: error?.stack,
        context: `${source}:${lineno}:${colno}`,
        recoverable: false,
      });
      return true; // Prevent default error handling
    };

    // Unhandled promise rejection handler
    window.onunhandledrejection = (event) => {
      const error = event.reason;
      this.handleError({
        message: error?.message || 'Unhandled promise rejection',
        stack: error?.stack,
        context: 'Promise',
        recoverable: true,
      });
    };

    this.initialized = true;
    debug.log('Error handler initialized');
  }

  /**
   * Subscribe to error events
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) this.errorCallbacks.splice(index, 1);
    };
  }

  /**
   * Handle an error
   */
  handleError(info: ErrorInfo): void {
    // Log error
    debug.error(`[${info.context || 'Unknown'}] ${info.message}`, info.stack);

    // Notify subscribers
    for (const callback of this.errorCallbacks) {
      try {
        callback(info);
      } catch {
        // Don't let error callbacks cause more errors
      }
    }

    // Show error to user if not recoverable
    if (!info.recoverable) {
      this.showError(info);
    }
  }

  /**
   * Wrap a function with error handling
   */
  wrap<T extends (...args: unknown[]) => unknown>(
    fn: T,
    context: string,
    recoverable = true
  ): T {
    return ((...args: unknown[]) => {
      try {
        const result = fn(...args);
        // Handle async functions
        if (result instanceof Promise) {
          return result.catch((error) => {
            this.handleError({
              message: error?.message || 'Unknown error',
              stack: error?.stack,
              context,
              recoverable,
            });
            if (!recoverable) throw error;
          });
        }
        return result;
      } catch (error) {
        this.handleError({
          message: (error as Error)?.message || 'Unknown error',
          stack: (error as Error)?.stack,
          context,
          recoverable,
        });
        if (!recoverable) throw error;
      }
    }) as T;
  }

  /**
   * Try to execute with fallback
   */
  tryWithFallback<T>(
    fn: () => T,
    fallback: T,
    context: string
  ): T {
    try {
      return fn();
    } catch (error) {
      this.handleError({
        message: (error as Error)?.message || 'Unknown error',
        stack: (error as Error)?.stack,
        context,
        recoverable: true,
      });
      return fallback;
    }
  }

  /**
   * Create error display container
   */
  private createErrorContainer(): void {
    this.errorContainer = document.createElement('div');
    this.errorContainer.id = 'error-overlay';
    this.errorContainer.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      color: #ff4444;
      font-family: monospace;
      padding: 40px;
      box-sizing: border-box;
      z-index: 10000;
      overflow: auto;
    `;
    document.body.appendChild(this.errorContainer);
  }

  /**
   * Show error to user
   */
  private showError(info: ErrorInfo): void {
    if (!this.errorContainer) return;

    this.errorContainer.innerHTML = `
      <h1 style="color: #ff6666; margin-bottom: 20px;">Something went wrong</h1>
      <p style="color: #cccccc; margin-bottom: 20px;">${info.message}</p>
      ${info.context ? `<p style="color: #888888; margin-bottom: 20px;">Context: ${info.context}</p>` : ''}
      ${info.stack ? `<pre style="color: #666666; font-size: 12px; white-space: pre-wrap; max-height: 300px; overflow: auto;">${info.stack}</pre>` : ''}
      <button onclick="location.reload()" style="
        margin-top: 20px;
        padding: 10px 20px;
        background: #ff4444;
        color: white;
        border: none;
        cursor: pointer;
        font-size: 16px;
      ">Reload Game</button>
    `;
    this.errorContainer.style.display = 'block';
  }

  /**
   * Hide error overlay
   */
  hideError(): void {
    if (this.errorContainer) {
      this.errorContainer.style.display = 'none';
    }
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();
