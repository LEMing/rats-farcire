import type { MapData, Vec3, EnemyState, EnemyType, WeaponType } from '@shared/types';
import { TILE_SIZE } from '@shared/constants';

// ============================================================================
// DeathEffectsSystem - Handles enemy death visual effects
// Single Responsibility: Spawn blood, gibs, and visual effects on death
// ============================================================================

/**
 * Callbacks for death effect events
 */
export interface DeathEffectsCallbacks {
  // Blood effects
  spawnBloodBurst: (position: Vec3, enemyType: EnemyType, count: number) => void;
  spawnBloodDecal: (x: number, z: number, size: number) => void;
  spawnGibs: (position: Vec3, count: number) => void;
  spawnWallSplatter: (x: number, z: number, y: number, face: 'north' | 'south' | 'east' | 'west', size: number) => void;

  // UI feedback
  triggerKillFlash: () => void;
  registerKill: () => void;
  spawnScorePopup: (x: number, y: number, score: number, combo: number) => void;

  // Screen effects
  addScreenShake: (intensity: number) => void;

  // Entity effects
  markEntityBloody: (entityId: string, x: number, z: number) => void;
  fadeOutEnemy: (enemyId: string, duration: number) => void;

  // Coordinate conversion
  worldToScreen: (worldPos: Vec3) => { x: number; y: number };
}

/**
 * Player state subset needed for death effects
 */
export interface DeathEffectsPlayerState {
  id: string;
  position: Vec3;
}

// Cleanup timing constants
const ENEMY_FADE_DURATION = 500; // ms - visual fade out

export class DeathEffectsSystem {
  private mapData: MapData;
  private callbacks: DeathEffectsCallbacks;

  constructor(mapData: MapData, callbacks: DeathEffectsCallbacks) {
    this.mapData = mapData;
    this.callbacks = callbacks;
  }

  /**
   * Handle enemy death - spawn all visual effects
   * Returns the screen shake intensity to apply
   */
  handleEnemyDeath(
    enemy: EnemyState,
    player: DeathEffectsPlayerState,
    score: number,
    combo: number,
    weaponType?: WeaponType
  ): number {
    // === VISUAL FEEDBACK ===

    // Kill flash effect
    this.callbacks.triggerKillFlash();

    // Register kill for kill rating system (DOUBLE KILL, MASSACRE, etc.)
    this.callbacks.registerKill();

    // Mark player as bloody (will leave blood footprints)
    this.callbacks.markEntityBloody(player.id, player.position.x, player.position.z);

    // Score popup at enemy position
    const screenPos = this.callbacks.worldToScreen(enemy.position);
    this.callbacks.spawnScorePopup(screenPos.x, screenPos.y, score, combo);

    // === WEAPON-SPECIFIC DEATH EFFECTS ===
    this.spawnWeaponDeathEffect(enemy, player, weaponType);

    // Screen shake (bigger for tanks and explosive weapons)
    let shakeIntensity = enemy.enemyType === 'tank' ? 0.8 : 0.4;
    if (weaponType === 'shotgun') shakeIntensity *= 1.5;
    if (weaponType === 'rocket') shakeIntensity *= 2.0;

    // Fade out enemy over time
    this.callbacks.fadeOutEnemy(enemy.id, ENEMY_FADE_DURATION);

    return shakeIntensity;
  }

  /**
   * Spawn weapon-specific death effects for visceral feedback
   */
  private spawnWeaponDeathEffect(
    enemy: EnemyState,
    player: DeathEffectsPlayerState,
    weaponType?: WeaponType
  ): void {
    const isTank = enemy.enemyType === 'tank';
    const baseParticles = isTank ? 35 : 20;
    const baseDecalSize = isTank ? 1.8 : 1.2;

    switch (weaponType) {
      case 'shotgun':
        // EXPLOSIVE - massive blood burst, many gibs, wide splatter
        this.callbacks.spawnBloodBurst(enemy.position, enemy.enemyType, baseParticles * 2);
        this.callbacks.spawnGibs(enemy.position, isTank ? 10 : 6);
        // Spread decals in a wide cone
        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 0.5 + Math.random() * 2;
          this.callbacks.spawnBloodDecal(
            enemy.position.x + Math.cos(angle) * dist,
            enemy.position.z + Math.sin(angle) * dist,
            0.6 + Math.random() * 0.8
          );
        }
        this.callbacks.spawnBloodDecal(enemy.position.x, enemy.position.z, baseDecalSize * 1.5);
        break;

      case 'rifle': {
        // PRECISION - clean kill, focused blood spray, single large decal
        this.callbacks.spawnBloodBurst(enemy.position, enemy.enemyType, baseParticles);
        // Directional blood spray (behind enemy)
        const dirX = enemy.position.x - player.position.x;
        const dirZ = enemy.position.z - player.position.z;
        const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
        for (let i = 0; i < 3; i++) {
          const spread = (Math.random() - 0.5) * 0.5;
          this.callbacks.spawnBloodDecal(
            enemy.position.x + (dirX / len + spread) * (1 + i * 0.5),
            enemy.position.z + (dirZ / len + spread) * (1 + i * 0.5),
            0.4 + Math.random() * 0.4
          );
        }
        this.callbacks.spawnBloodDecal(enemy.position.x, enemy.position.z, baseDecalSize);
        break;
      }

      case 'machinegun':
        // BRUTAL - multiple small blood bursts (like riddled with bullets)
        // Note: Using synchronous approach to avoid setTimeout complexity
        for (let i = 0; i < 3; i++) {
          const offset = { x: (Math.random() - 0.5) * 0.5, z: (Math.random() - 0.5) * 0.5 };
          this.callbacks.spawnBloodBurst(
            { x: enemy.position.x + offset.x, y: enemy.position.y, z: enemy.position.z + offset.z },
            enemy.enemyType,
            Math.floor(baseParticles / 3)
          );
        }
        // Multiple small decals
        for (let i = 0; i < 4; i++) {
          this.callbacks.spawnBloodDecal(
            enemy.position.x + (Math.random() - 0.5) * 1.5,
            enemy.position.z + (Math.random() - 0.5) * 1.5,
            0.3 + Math.random() * 0.4
          );
        }
        break;

      case 'rocket':
        // VAPORIZED - huge explosion, massive blood cloud, body chunks everywhere
        this.callbacks.spawnBloodBurst(enemy.position, enemy.enemyType, baseParticles * 3);
        this.callbacks.spawnGibs(enemy.position, isTank ? 15 : 8);
        // Large central crater of blood
        this.callbacks.spawnBloodDecal(enemy.position.x, enemy.position.z, baseDecalSize * 2);
        // Ring of smaller splats
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const dist = 1.5 + Math.random();
          this.callbacks.spawnBloodDecal(
            enemy.position.x + Math.cos(angle) * dist,
            enemy.position.z + Math.sin(angle) * dist,
            0.4 + Math.random() * 0.3
          );
        }
        break;

      case 'pistol':
      default:
        // Standard death - moderate blood
        this.callbacks.spawnBloodBurst(enemy.position, enemy.enemyType, baseParticles);
        this.callbacks.spawnBloodDecal(enemy.position.x, enemy.position.z, baseDecalSize);
        // Extra smaller splats
        for (let i = 0; i < 2; i++) {
          this.callbacks.spawnBloodDecal(
            enemy.position.x + (Math.random() - 0.5) * 2,
            enemy.position.z + (Math.random() - 0.5) * 2,
            0.5 + Math.random() * 0.5
          );
        }
        break;
    }

    // Spawn wall blood splatters if enemy died near a wall
    this.spawnWallBloodSplatters(enemy.position, baseDecalSize);
  }

  /**
   * Check for nearby walls and spawn blood splatters on them
   */
  private spawnWallBloodSplatters(position: Vec3, intensity: number): void {
    // Convert world position to tile coordinates
    const tileX = Math.floor(position.x / TILE_SIZE);
    const tileZ = Math.floor(position.z / TILE_SIZE);

    // Check adjacent tiles for walls and spawn splatters
    const wallCheckDistance = 1.5; // How close to wall for splatter
    const directions: Array<{ dx: number; dz: number; face: 'north' | 'south' | 'east' | 'west' }> = [
      { dx: 0, dz: -1, face: 'south' },  // Wall to north, face south
      { dx: 0, dz: 1, face: 'north' },   // Wall to south, face north
      { dx: 1, dz: 0, face: 'west' },    // Wall to east, face west
      { dx: -1, dz: 0, face: 'east' },   // Wall to west, face east
    ];

    for (const dir of directions) {
      const checkX = tileX + dir.dx;
      const checkZ = tileZ + dir.dz;

      // Bounds check
      if (checkX < 0 || checkX >= this.mapData.width || checkZ < 0 || checkZ >= this.mapData.height) {
        continue;
      }

      const tile = this.mapData.tiles[checkZ]?.[checkX];
      if (!tile || tile.type !== 'wall') continue;

      // Calculate wall position (center of wall tile edge)
      const wallWorldX = checkX * TILE_SIZE + TILE_SIZE / 2;
      const wallWorldZ = checkZ * TILE_SIZE + TILE_SIZE / 2;

      // Check distance to wall
      const dx = position.x - wallWorldX;
      const dz = position.z - wallWorldZ;
      const distToWall = Math.sqrt(dx * dx + dz * dz);

      if (distToWall > wallCheckDistance * TILE_SIZE) continue;

      // Spawn 2-4 splatters on this wall face
      const splatterCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < splatterCount; i++) {
        // Position on the wall face
        let splatterX = wallWorldX;
        let splatterZ = wallWorldZ;

        // Adjust to be on the correct face of the wall
        if (dir.face === 'south') splatterZ += TILE_SIZE / 2 + 0.01;
        if (dir.face === 'north') splatterZ -= TILE_SIZE / 2 - 0.01;
        if (dir.face === 'west') splatterX += TILE_SIZE / 2 + 0.01;
        if (dir.face === 'east') splatterX -= TILE_SIZE / 2 - 0.01;

        // Random height on wall
        const splatterY = 0.3 + Math.random() * 1.5;

        this.callbacks.spawnWallSplatter(
          splatterX,
          splatterZ,
          splatterY,
          dir.face,
          0.6 + Math.random() * 0.6 * intensity
        );
      }
    }
  }
}
