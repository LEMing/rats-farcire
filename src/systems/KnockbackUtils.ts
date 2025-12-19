import type { Vec2 } from '@shared/types';
import { normalize } from '@shared/utils';

/**
 * Configuration for knockback behavior
 */
export const KNOCKBACK_CONFIG = {
  /** Velocity decay rate per frame (0-1, lower = faster decay) */
  decayRate: 0.85,
  /** Velocity threshold below which knockback is zeroed */
  zeroThreshold: 0.1,
};

/**
 * State required for knockback processing
 */
export interface KnockbackState {
  position: Vec2;
  velocity: Vec2;
}

/**
 * Calculate knockback velocity from a source position pushing a target away.
 * Pure function for testability.
 *
 * @param sourcePos - Position of the knockback source (projectile, explosion, etc.)
 * @param targetPos - Position of the entity being knocked back
 * @param force - Knockback force multiplier
 * @returns Knockback velocity vector
 */
export function calculateKnockback(
  sourcePos: Vec2,
  targetPos: Vec2,
  force: number
): Vec2 {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;

  // Handle same position (no direction)
  if (dx === 0 && dy === 0) {
    return { x: 0, y: 0 };
  }

  const dir = normalize({ x: dx, y: dy });
  return {
    x: dir.x * force,
    y: dir.y * force,
  };
}

/**
 * Wall collision checker function type.
 * Returns true if the position is walkable.
 */
export type WallChecker = (x: number, z: number) => boolean;

/**
 * Process knockback for one frame: move entity, check walls, decay velocity.
 * Pure function for testability.
 *
 * @param state - Current position and velocity
 * @param dt - Delta time in seconds
 * @param isWalkable - Function to check if position is walkable
 * @returns New state after knockback processing
 */
export function processKnockback(
  state: KnockbackState,
  dt: number,
  isWalkable: WallChecker
): KnockbackState {
  const { position, velocity } = state;

  // Skip if no velocity
  if (velocity.x === 0 && velocity.y === 0) {
    return { position: { ...position }, velocity: { x: 0, y: 0 } };
  }

  // Calculate new position
  let newX = position.x + velocity.x * dt;
  let newY = position.y + velocity.y * dt;
  let newVelX = velocity.x;
  let newVelY = velocity.y;

  // Wall collision X
  if (!isWalkable(newX, position.y)) {
    newX = position.x;
    newVelX = 0;
  }

  // Wall collision Y
  if (!isWalkable(position.x, newY)) {
    newY = position.y;
    newVelY = 0;
  }

  // Decay velocity
  newVelX *= KNOCKBACK_CONFIG.decayRate;
  newVelY *= KNOCKBACK_CONFIG.decayRate;

  // Zero out small values
  if (Math.abs(newVelX) < KNOCKBACK_CONFIG.zeroThreshold) newVelX = 0;
  if (Math.abs(newVelY) < KNOCKBACK_CONFIG.zeroThreshold) newVelY = 0;

  return {
    position: { x: newX, y: newY },
    velocity: { x: newVelX, y: newVelY },
  };
}
