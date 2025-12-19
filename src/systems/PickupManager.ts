/**
 * PickupManager - Handles pickup spawning and collection
 *
 * Single Responsibility: Pickup creation, collision detection, effect application
 * Does NOT handle: Rendering, audio (uses callbacks)
 */

import type { PickupState, PlayerState, Vec3, WeaponType, PowerUpType } from '@shared/types';
import {
  HEALTH_PACK_VALUE,
  AMMO_PACK_VALUE,
  POWERUP_DURATION,
  WEAPON_SLOT_ORDER,
  WEAPON_CONFIGS,
  POWERUP_CONFIGS,
  PLAYER_HITBOX_RADIUS,
} from '@shared/constants';
import { generateId, circleCollision } from '@shared/utils';

// ============================================================================
// Types
// ============================================================================

export interface PickupCollectionResult {
  /** Pickup IDs that were collected */
  collected: string[];
  /** Notifications to display */
  notifications: Array<{ message: string; color: number }>;
}

export interface PickupManagerCallbacks {
  /** Called when a pickup is spawned */
  onPickupSpawned?: (pickup: PickupState) => void;
  /** Called when a pickup is collected */
  onPickupCollected?: (pickupType: string) => void;
}

// ============================================================================
// PickupManager
// ============================================================================

export class PickupManager {
  private callbacks: PickupManagerCallbacks;

  constructor(callbacks: PickupManagerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Spawn a health or ammo pickup at position
   */
  spawnPickup(position: Vec3): PickupState {
    const isHealth = Math.random() < 0.5;
    const pickup: PickupState = {
      id: generateId(),
      type: 'pickup',
      position: { ...position },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      pickupType: isHealth ? 'health' : 'ammo',
      value: isHealth ? HEALTH_PACK_VALUE : AMMO_PACK_VALUE,
    };

    this.callbacks.onPickupSpawned?.(pickup);
    return pickup;
  }

  /**
   * Spawn a random power-up at position
   */
  spawnPowerUp(position: Vec3): PickupState {
    const powerUpTypes: PowerUpType[] = ['rapidFire', 'spreadShot', 'vampire', 'shield'];
    const randomType = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];

    const pickup: PickupState = {
      id: generateId(),
      type: 'pickup',
      position: { ...position },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      pickupType: 'powerup',
      value: POWERUP_DURATION,
      powerUpType: randomType,
    };

    this.callbacks.onPickupSpawned?.(pickup);
    return pickup;
  }

  /**
   * Spawn a weapon pickup at position
   * Returns null if player has all weapons
   */
  spawnWeaponPickup(position: Vec3, unlockedWeapons: WeaponType[]): PickupState | null {
    // Get weapons the player doesn't have yet
    const unownedWeapons = WEAPON_SLOT_ORDER.filter(
      (w) => !unlockedWeapons.includes(w)
    );

    // If player has all weapons, don't spawn
    if (unownedWeapons.length === 0) return null;

    // Pick a random unowned weapon
    const randomWeapon = unownedWeapons[Math.floor(Math.random() * unownedWeapons.length)];

    const pickup: PickupState = {
      id: generateId(),
      type: 'pickup',
      position: { ...position },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      pickupType: 'weapon',
      value: 0,
      weaponType: randomWeapon,
    };

    this.callbacks.onPickupSpawned?.(pickup);
    return pickup;
  }

  /**
   * Check for pickup collisions and apply effects
   * Returns IDs of collected pickups and notifications to show
   */
  checkCollisions(
    player: PlayerState,
    pickups: Map<string, PickupState>,
    gameTime: number
  ): PickupCollectionResult {
    const collected: string[] = [];
    const notifications: Array<{ message: string; color: number }> = [];
    const playerPos = { x: player.position.x, y: player.position.z };

    for (const [id, pickup] of pickups) {
      const pickupPos = { x: pickup.position.x, y: pickup.position.z };

      if (circleCollision(playerPos, PLAYER_HITBOX_RADIUS, pickupPos, 0.5)) {
        this.applyPickup(pickup, player, gameTime, notifications);
        collected.push(id);
        this.callbacks.onPickupCollected?.(pickup.pickupType);
      }
    }

    return { collected, notifications };
  }

  /**
   * Apply pickup effect to player
   */
  private applyPickup(
    pickup: PickupState,
    player: PlayerState,
    gameTime: number,
    notifications: Array<{ message: string; color: number }>
  ): void {
    switch (pickup.pickupType) {
      case 'health':
        player.health = Math.min(player.maxHealth, player.health + pickup.value);
        break;

      case 'ammo':
        player.ammo += pickup.value;
        break;

      case 'powerup':
        if (pickup.powerUpType) {
          const expiryTime = gameTime + pickup.value;
          player.powerUps[pickup.powerUpType] = expiryTime;
          const config = POWERUP_CONFIGS[pickup.powerUpType];
          notifications.push({ message: config.name, color: config.color });
        }
        break;

      case 'weapon':
        if (pickup.weaponType) {
          if (!player.unlockedWeapons.includes(pickup.weaponType)) {
            player.unlockedWeapons.push(pickup.weaponType);
            player.currentWeapon = pickup.weaponType;
            const config = WEAPON_CONFIGS[pickup.weaponType];
            notifications.push({ message: `NEW: ${config.name}`, color: config.color });
          } else {
            // Already have weapon, give ammo instead
            player.ammo += 25;
            notifications.push({ message: '+25 ENERGY', color: 0xffff00 });
          }
        }
        break;
    }
  }

  /**
   * Create a pickup with specific type (for testing/deterministic spawning)
   */
  createPickup(
    position: Vec3,
    pickupType: 'health' | 'ammo' | 'powerup' | 'weapon',
    options: {
      value?: number;
      powerUpType?: PowerUpType;
      weaponType?: WeaponType;
    } = {}
  ): PickupState {
    const pickup: PickupState = {
      id: generateId(),
      type: 'pickup',
      position: { ...position },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      pickupType,
      value: options.value ?? 0,
      powerUpType: options.powerUpType,
      weaponType: options.weaponType,
    };

    this.callbacks.onPickupSpawned?.(pickup);
    return pickup;
  }
}
