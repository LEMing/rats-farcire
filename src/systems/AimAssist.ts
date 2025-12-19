import type { Vec2, Vec3 } from '@shared/types';

/**
 * Configuration for aim assist behavior
 */
export interface AimAssistConfig {
  /** Maximum distance to assist (world units) */
  range: number;
  /** Cone angle in radians (±half from aim direction) */
  coneAngle: number;
  /** How much to pull toward enemy (0-1) */
  strength: number;
}

/**
 * Default aim assist configuration
 */
export const DEFAULT_AIM_ASSIST_CONFIG: AimAssistConfig = {
  range: 15,
  coneAngle: Math.PI / 6, // 30 degrees
  strength: 0.15,
};

/**
 * Entity position for aim assist calculation
 */
interface AimTarget {
  position: Vec3;
  isDead: boolean;
}

/**
 * Apply aim assist - subtly pull aim toward nearby enemies within a cone.
 * Pure function for testability.
 *
 * @param playerPos - Player position in world space (x, z)
 * @param aim - Current normalized aim direction (x, y where y is Z in world)
 * @param enemies - Array of potential targets with position and dead state
 * @param config - Aim assist configuration
 * @returns Adjusted normalized aim direction
 */
export function applyAimAssist(
  playerPos: { x: number; z: number },
  aim: Vec2,
  enemies: AimTarget[],
  config: AimAssistConfig = DEFAULT_AIM_ASSIST_CONFIG
): Vec2 {
  // Handle zero aim vector
  const aimLen = Math.sqrt(aim.x * aim.x + aim.y * aim.y);
  if (aimLen === 0) {
    return { x: 0, y: 0 };
  }

  // Normalize aim for consistent calculations
  const normalizedAimX = aim.x / aimLen;
  const normalizedAimY = aim.y / aimLen;
  const aimAngle = Math.atan2(normalizedAimX, normalizedAimY);

  let bestTarget: { x: number; y: number } | null = null;
  let bestScore = Infinity;

  for (const enemy of enemies) {
    if (enemy.isDead) continue;

    const enemyPos = { x: enemy.position.x, y: enemy.position.z };

    // Distance check
    const dx = enemyPos.x - playerPos.x;
    const dy = enemyPos.y - playerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > config.range || dist === 0) continue;

    // Direction to enemy
    const toEnemyX = dx / dist;
    const toEnemyY = dy / dist;
    const enemyAngle = Math.atan2(toEnemyX, toEnemyY);

    // Angle difference (wrapped to -PI to PI)
    let angleDiff = enemyAngle - aimAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Skip if outside cone
    if (Math.abs(angleDiff) > config.coneAngle) continue;

    // Score: prioritize enemies closer to aim direction, then by distance
    const angleScore = Math.abs(angleDiff) / config.coneAngle; // 0-1
    const distScore = dist / config.range; // 0-1
    const score = angleScore * 0.7 + distScore * 0.3;

    if (score < bestScore) {
      bestScore = score;
      bestTarget = { x: toEnemyX, y: toEnemyY };
    }
  }

  // If no valid target, return original aim
  if (!bestTarget) {
    return { x: normalizedAimX, y: normalizedAimY };
  }

  // Smoothly blend toward target
  const newAimX = normalizedAimX + (bestTarget.x - normalizedAimX) * config.strength;
  const newAimY = normalizedAimY + (bestTarget.y - normalizedAimY) * config.strength;

  // Normalize result
  const newLen = Math.sqrt(newAimX * newAimX + newAimY * newAimY);
  if (newLen === 0) {
    return { x: normalizedAimX, y: normalizedAimY };
  }

  return { x: newAimX / newLen, y: newAimY / newLen };
}
