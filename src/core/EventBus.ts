/**
 * EventBus - Simple pub/sub system for decoupling game systems
 *
 * This allows game logic (LocalGameLoop) to emit events without
 * directly depending on rendering, audio, or other presentation concerns.
 */

import type { Vec3 } from '../../shared/types';
import { debug } from '../utils/debug';

// Define all game events and their payloads
export interface GameEvents {
  // Combat events
  enemyHit: { position: Vec3; enemyType: string; damage: number };
  enemyKilled: { position: Vec3; enemyType: string; score: number };
  playerHit: { position: Vec3; damage: number; health: number };
  playerDied: { position: Vec3 };
  projectileFired: { position: Vec3; direction: Vec3; isPlayer: boolean };

  // Effect events
  screenShake: { intensity: number };
  bloodBurst: { position: Vec3; enemyType: string; intensity: number };
  hitStop: { duration: number };

  // Objective events
  cellPickedUp: { cellId: string; position: Vec3 };
  cellDropped: { cellId: string; position: Vec3 };
  cellDelivered: { cellNumber: number; totalCells: number };
  objectiveComplete: Record<string, never>;

  // Wave events
  waveStarted: { waveNumber: number; enemyCount: number };
  waveCompleted: { waveNumber: number };

  // UI events
  showNotification: { message: string; type?: 'info' | 'warning' | 'success' };
  showDamageNumber: { position: Vec3; damage: number; isCritical?: boolean };
  showScorePopup: { position: Vec3; score: number };

  // Game state events
  gameStarted: Record<string, never>;
  gamePaused: Record<string, never>;
  gameResumed: Record<string, never>;
  gameOver: { won: boolean; score: number; wave: number };
}

// Type for event names
export type GameEventName = keyof GameEvents;

// Type for event handlers
export type EventHandler<T extends GameEventName> = (payload: GameEvents[T]) => void;

// Internal subscription type
interface Subscription<T extends GameEventName> {
  handler: EventHandler<T>;
  once: boolean;
}

/**
 * Type-safe event bus for game events
 */
export class EventBus {
  private listeners: Map<GameEventName, Subscription<GameEventName>[]> = new Map();

  /**
   * Subscribe to an event
   * @param event - The event name to subscribe to
   * @param handler - The callback function to invoke when the event is emitted
   * @returns An unsubscribe function
   */
  on<T extends GameEventName>(event: T, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const subscription: Subscription<T> = { handler, once: false };
    this.listeners.get(event)!.push(subscription as Subscription<GameEventName>);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event for a single invocation
   * @param event - The event name to subscribe to
   * @param handler - The callback function to invoke once
   * @returns An unsubscribe function
   */
  once<T extends GameEventName>(event: T, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const subscription: Subscription<T> = { handler, once: true };
    this.listeners.get(event)!.push(subscription as Subscription<GameEventName>);

    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from an event
   * @param event - The event name to unsubscribe from
   * @param handler - The handler to remove
   */
  off<T extends GameEventName>(event: T, handler: EventHandler<T>): void {
    const subscriptions = this.listeners.get(event);
    if (!subscriptions) return;

    const index = subscriptions.findIndex((sub) => sub.handler === handler);
    if (index !== -1) {
      subscriptions.splice(index, 1);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param event - The event name to emit
   * @param payload - The event payload
   */
  emit<T extends GameEventName>(event: T, payload: GameEvents[T]): void {
    const subscriptions = this.listeners.get(event);
    if (!subscriptions) return;

    // Create a copy to avoid issues if handlers modify the subscription list
    const subs = [...subscriptions];

    for (const sub of subs) {
      try {
        (sub.handler as EventHandler<T>)(payload);
      } catch (error) {
        debug.error(`Error in event handler for "${event}":`, error);
      }

      // Remove one-time subscriptions
      if (sub.once) {
        this.off(event, sub.handler as EventHandler<T>);
      }
    }
  }

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   * @param event - Optional event name to clear
   */
  clear(event?: GameEventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   * @param event - The event name
   * @returns The number of listeners
   */
  listenerCount(event: GameEventName): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

// Singleton instance for global access
let globalEventBus: EventBus | null = null;

/**
 * Get or create the global event bus instance
 */
export function getEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/**
 * Reset the global event bus (useful for testing)
 */
export function resetEventBus(): void {
  if (globalEventBus) {
    globalEventBus.clear();
  }
  globalEventBus = null;
}
