/**
 * LastStandSystem - Handles the "Last Stand" mechanic
 *
 * When player would die, they get one chance per life:
 * - 5 seconds of invincibility
 * - Cannot move, can only shoot
 * - Unlimited ammo
 * - Kill 5 enemies to survive with 25 HP
 * - Fail = death
 */

import type { PlayerState } from '@shared/types';

// ============================================================================
// Types
// ============================================================================

export interface LastStandState {
  /** Whether Last Stand is currently active */
  isActive: boolean;
  /** Whether Last Stand has been used this life */
  wasUsed: boolean;
  /** Kills during Last Stand */
  kills: number;
  /** Time when Last Stand started (game time) */
  startTime: number;
  /** Time remaining in Last Stand */
  timeRemaining: number;
}

export interface LastStandCallbacks {
  /** Called when Last Stand triggers */
  onLastStandStart?: () => void;
  /** Called when a kill is registered during Last Stand */
  onLastStandKill?: (kills: number, required: number) => void;
  /** Called when Last Stand succeeds (player survives) */
  onLastStandSuccess?: () => void;
  /** Called when Last Stand fails (player dies) */
  onLastStandFail?: () => void;
}

export interface LastStandConfig {
  /** Duration of Last Stand in ms */
  duration: number;
  /** Kills required to survive */
  killsRequired: number;
  /** Health restored on success */
  healthRestored: number;
}

const DEFAULT_CONFIG: LastStandConfig = {
  duration: 5000,
  killsRequired: 3,
  healthRestored: 25,
};

// ============================================================================
// LastStandSystem
// ============================================================================

export class LastStandSystem {
  private state: LastStandState = {
    isActive: false,
    wasUsed: false,
    kills: 0,
    startTime: 0,
    timeRemaining: 0,
  };

  private config: LastStandConfig;
  private callbacks: LastStandCallbacks;

  constructor(config: Partial<LastStandConfig> = {}, callbacks: LastStandCallbacks = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Try to trigger Last Stand when player would die
   * Returns true if Last Stand was activated
   */
  tryTrigger(gameTime: number): boolean {
    // Can only use Last Stand once per life
    if (this.state.wasUsed) {
      return false;
    }

    // Activate Last Stand
    this.state.isActive = true;
    this.state.wasUsed = true;
    this.state.kills = 0;
    this.state.startTime = gameTime;
    this.state.timeRemaining = this.config.duration;

    this.callbacks.onLastStandStart?.();
    return true;
  }

  /**
   * Update Last Stand timer
   * Returns: 'active' | 'success' | 'fail' | 'inactive'
   */
  update(gameTime: number, _dt: number): 'active' | 'success' | 'fail' | 'inactive' {
    if (!this.state.isActive) {
      return 'inactive';
    }

    // Update time remaining
    this.state.timeRemaining = Math.max(
      0,
      this.config.duration - (gameTime - this.state.startTime)
    );

    // Check success condition
    if (this.state.kills >= this.config.killsRequired) {
      this.state.isActive = false;
      this.callbacks.onLastStandSuccess?.();
      return 'success';
    }

    // Check timeout
    if (this.state.timeRemaining <= 0) {
      this.state.isActive = false;
      this.callbacks.onLastStandFail?.();
      return 'fail';
    }

    return 'active';
  }

  /**
   * Register a kill during Last Stand
   */
  registerKill(): void {
    if (!this.state.isActive) return;

    this.state.kills++;
    this.callbacks.onLastStandKill?.(this.state.kills, this.config.killsRequired);
  }

  /**
   * Apply Last Stand effects to player during active state
   * - Freeze movement
   * - Grant invincibility (handled by caller checking isActive)
   * - Unlimited ammo (handled by caller)
   */
  applyEffects(player: PlayerState): void {
    if (!this.state.isActive) return;

    // Freeze player movement
    player.velocity = { x: 0, y: 0 };

    // Prevent dashing
    player.isDashing = false;
  }

  /**
   * Apply success effects to player
   */
  applySuccessEffects(player: PlayerState): void {
    player.health = this.config.healthRestored;
  }

  /**
   * Check if Last Stand is currently active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Check if Last Stand has been used this life
   */
  wasUsed(): boolean {
    return this.state.wasUsed;
  }

  /**
   * Get current state (for UI)
   */
  getState(): Readonly<LastStandState> {
    return this.state;
  }

  /**
   * Get config (for UI)
   */
  getConfig(): Readonly<LastStandConfig> {
    return this.config;
  }

  /**
   * Reset Last Stand for new life/game
   */
  reset(): void {
    this.state = {
      isActive: false,
      wasUsed: false,
      kills: 0,
      startTime: 0,
      timeRemaining: 0,
    };
  }
}
