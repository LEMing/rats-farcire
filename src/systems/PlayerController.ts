/**
 * PlayerController - Handles player input processing and movement
 *
 * Single Responsibility: Process input and update player position/velocity
 * Does NOT handle: weapons, combat, pickups
 */

import type { PlayerState, InputState, MapData, Vec2 } from '@shared/types';
import {
  PLAYER_SPEED,
  DASH_SPEED,
  DASH_DURATION,
  DASH_COOLDOWN,
  CELL_CARRY_SPEED_MULTIPLIER,
  WALL_COLLISION_BUFFER,
} from '@shared/constants';
import { isWalkableWithRadius, normalize } from '@shared/utils';
import { applyAimAssist, AimTarget } from './AimAssist';

// ============================================================================
// Types
// ============================================================================

export interface PlayerControllerCallbacks {
  onDashStart?: (playerId: string, position: { x: number; y: number; z: number }) => void;
  onAfterimage?: (playerId: string, position: { x: number; y: number; z: number }) => void;
  onDashSound?: () => void;
}

export interface PlayerControllerConfig {
  playerSpeed?: number;
  dashSpeed?: number;
  dashDuration?: number;
  dashCooldown?: number;
  afterimageInterval?: number;
  aimAssistEnabled?: boolean;
}

const DEFAULT_CONFIG: Required<PlayerControllerConfig> = {
  playerSpeed: PLAYER_SPEED,
  dashSpeed: DASH_SPEED,
  dashDuration: DASH_DURATION,
  dashCooldown: DASH_COOLDOWN,
  afterimageInterval: 30,
  aimAssistEnabled: false,
};

// ============================================================================
// PlayerController
// ============================================================================

export class PlayerController {
  private mapData: MapData;
  private config: Required<PlayerControllerConfig>;
  private callbacks: PlayerControllerCallbacks;
  private lastAfterimageTime = 0;

  constructor(
    mapData: MapData,
    callbacks: PlayerControllerCallbacks = {},
    config: PlayerControllerConfig = {}
  ) {
    this.mapData = mapData;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set aim assist enabled state
   */
  setAimAssistEnabled(enabled: boolean): void {
    this.config.aimAssistEnabled = enabled;
  }

  /**
   * Process input and update player state
   * Returns true if any movement occurred
   */
  processInput(
    player: PlayerState,
    input: InputState,
    gameTime: number,
    dt: number,
    enemies: AimTarget[] = []
  ): boolean {
    const dtSeconds = dt / 1000;

    // Update dash cooldown
    this.updateDashCooldown(player, dt);

    // Handle dash
    this.handleDash(player, input, gameTime);

    // Calculate and apply movement
    const velocity = this.calculateVelocity(player, input, gameTime);
    const moved = this.applyMovement(player, velocity, dtSeconds);

    // Update rotation
    this.updateRotation(player, input, enemies);

    return moved;
  }

  /**
   * Update dash cooldown
   */
  private updateDashCooldown(player: PlayerState, dt: number): void {
    if (player.dashCooldown > 0) {
      player.dashCooldown -= dt;
    }
  }

  /**
   * Handle dash initiation and execution
   */
  private handleDash(player: PlayerState, input: InputState, gameTime: number): void {
    // Start dash (cannot dash while carrying a cell)
    if (
      input.dash &&
      player.dashCooldown <= 0 &&
      !player.isDashing &&
      !player.carryingCellId
    ) {
      this.startDash(player, input, gameTime);
    }
  }

  /**
   * Start a new dash
   */
  private startDash(player: PlayerState, input: InputState, gameTime: number): void {
    player.isDashing = true;
    player.dashStartTime = gameTime;
    player.dashCooldown = this.config.dashCooldown;

    // Dash direction: input direction or facing direction
    const moveDir = normalize({ x: input.moveX, y: input.moveY });
    if (moveDir.x !== 0 || moveDir.y !== 0) {
      player.dashDirection = moveDir;
    } else {
      player.dashDirection = {
        x: Math.sin(player.rotation),
        y: Math.cos(player.rotation),
      };
    }

    // Spawn initial afterimage
    this.callbacks.onAfterimage?.(player.id, player.position);
    this.lastAfterimageTime = gameTime;

    // Play dash sound
    this.callbacks.onDashSound?.();
  }

  /**
   * Calculate velocity based on current state (dashing or normal movement)
   */
  calculateVelocity(player: PlayerState, input: InputState, gameTime: number): Vec2 {
    if (player.isDashing) {
      return this.calculateDashVelocity(player, input, gameTime);
    } else {
      return this.calculateNormalVelocity(player, input);
    }
  }

  /**
   * Calculate velocity during dash
   */
  private calculateDashVelocity(player: PlayerState, input: InputState, gameTime: number): Vec2 {
    const dashElapsed = gameTime - player.dashStartTime;

    if (dashElapsed < this.config.dashDuration) {
      // Continue dashing
      this.spawnAfterimageIfNeeded(player, gameTime);

      return {
        x: player.dashDirection.x * this.config.dashSpeed,
        y: player.dashDirection.y * this.config.dashSpeed,
      };
    } else {
      // Dash ended
      player.isDashing = false;
      return this.calculateNormalVelocity(player, input);
    }
  }

  /**
   * Spawn afterimage during dash if enough time has passed
   */
  private spawnAfterimageIfNeeded(player: PlayerState, gameTime: number): void {
    if (gameTime - this.lastAfterimageTime > this.config.afterimageInterval) {
      this.callbacks.onAfterimage?.(player.id, player.position);
      this.lastAfterimageTime = gameTime;
    }
  }

  /**
   * Calculate normal movement velocity
   */
  private calculateNormalVelocity(player: PlayerState, input: InputState): Vec2 {
    const moveDir = normalize({ x: input.moveX, y: input.moveY });
    const speedMultiplier = player.carryingCellId ? CELL_CARRY_SPEED_MULTIPLIER : 1;

    return {
      x: moveDir.x * this.config.playerSpeed * speedMultiplier,
      y: moveDir.y * this.config.playerSpeed * speedMultiplier,
    };
  }

  /**
   * Apply velocity to position with wall collision
   * Returns true if position changed
   */
  applyMovement(player: PlayerState, velocity: Vec2, dtSeconds: number): boolean {
    const oldX = player.position.x;
    const oldZ = player.position.z;

    // Calculate new position
    let newX = player.position.x + velocity.x * dtSeconds;
    let newZ = player.position.z + velocity.y * dtSeconds;

    // Collision with walls
    if (!this.isWalkable(newX, player.position.z)) {
      newX = player.position.x;
    }
    if (!this.isWalkable(player.position.x, newZ)) {
      newZ = player.position.z;
    }

    player.position.x = newX;
    player.position.z = newZ;
    player.velocity = { x: velocity.x, y: velocity.y };

    return newX !== oldX || newZ !== oldZ;
  }

  /**
   * Check if position is walkable with collision buffer
   */
  isWalkable(x: number, z: number): boolean {
    return isWalkableWithRadius(this.mapData, x, z, WALL_COLLISION_BUFFER);
  }

  /**
   * Update player rotation based on aim direction
   */
  updateRotation(player: PlayerState, input: InputState, enemies: AimTarget[] = []): void {
    let aimX = input.aimX;
    let aimY = input.aimY;

    if (this.config.aimAssistEnabled && enemies.length > 0) {
      const adjusted = applyAimAssist(
        { x: player.position.x, z: player.position.z },
        { x: aimX, y: aimY },
        enemies
      );
      aimX = adjusted.x;
      aimY = adjusted.y;
    }

    player.rotation = Math.atan2(aimX, aimY);
  }

  /**
   * Check if player can currently dash
   */
  canDash(player: PlayerState): boolean {
    return player.dashCooldown <= 0 && !player.isDashing && !player.carryingCellId;
  }

  /**
   * Get dash cooldown remaining (0-1 ratio)
   */
  getDashCooldownRatio(player: PlayerState): number {
    return Math.max(0, player.dashCooldown / this.config.dashCooldown);
  }
}
