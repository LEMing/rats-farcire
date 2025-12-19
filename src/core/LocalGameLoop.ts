import type {
  MapData,
  InputState,
  PlayerState,
  EnemyState,
  ProjectileState,
  PickupState,
  Vec2,
  Vec3,
} from '@shared/types';
import {
  PLAYER_SPEED,
  PLAYER_MAX_HEALTH,
  PLAYER_START_AMMO,
  PLAYER_HITBOX_RADIUS,
  WALL_COLLISION_BUFFER,
  PROJECTILE_HITBOX_RADIUS,
  ENEMY_CONFIGS,
  TILE_SIZE,
  getEnemySpeedMultiplier,
  HEALTH_PACK_VALUE,
  AMMO_PACK_VALUE,
  PICKUP_SPAWN_CHANCE,
  DASH_SPEED,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_IFRAMES,
  POWERUP_DURATION,
  POWERUP_DROP_CHANCE,
  POWERUP_CONFIGS,
  CELL_CARRY_SPEED_MULTIPLIER,
  MINI_HORDE_SIZE,
  // Weapon system
  WEAPON_CONFIGS,
  WEAPON_SLOT_ORDER,
  THERMOBARIC_COOLDOWN,
  THERMOBARIC_DAMAGE,
  THERMOBARIC_RADIUS,
} from '@shared/constants';
import { WaveManager, SpawnRequest } from '../systems/WaveManager';
import { ObjectiveSystem } from '../systems/ObjectiveSystem';
import { SpatialHash, SpatialEntity } from '../systems/SpatialHash';
import type { PowerUpType } from '@shared/types';
import {
  generateId,
  normalize,
  distance,
  circleCollision,
  angleBetween,
  isWalkable,
  isWalkableWithRadius,
} from '@shared/utils';
import { EntityManager } from '../ecs/EntityManager';
import { UIManager } from '../ui/UIManager';
import { EnemyAI } from '../ai/EnemyAI';
import { Renderer } from '../rendering/Renderer';
import { EventBus, getEventBus } from './EventBus';
import { getAudioManager } from '../audio/AudioManager';
import { Settings } from '../settings/Settings';
import { debug } from '../utils/debug';
import { applyAimAssist, DEFAULT_AIM_ASSIST_CONFIG } from '../systems/AimAssist';
import { calculateKnockback, processKnockback } from '../systems/KnockbackUtils';
import { calculateScore, updateComboState } from '../systems/ScoreUtils';
import { CleanupQueue } from '../systems/CleanupQueue';

// ============================================================================
// Local Game Loop (Singleplayer)
// ============================================================================

// Cleanup timing constants
const ENEMY_FADE_DURATION = 500; // ms - visual fade out
const ENEMY_REMOVE_DELAY = 600; // ms - remove after fade completes

export class LocalGameLoop {
  private mapData: MapData;
  private entities: EntityManager;
  private ui: UIManager;
  private ai: EnemyAI;
  private renderer: Renderer;
  private eventBus: EventBus;
  private settings: Settings;

  private player: PlayerState | null = null;
  private enemies: Map<string, EnemyState> = new Map();
  private projectiles: Map<string, ProjectileState> = new Map();
  private pickups: Map<string, PickupState> = new Map();

  // Extracted systems
  private waveManager!: WaveManager;
  private objectiveSystem!: ObjectiveSystem;

  // Spatial partitioning for O(1) collision lookups
  private enemySpatialHash = new SpatialHash<SpatialEntity>(4);

  // Cleanup queue for delayed entity removal (replaces setTimeout)
  private cleanupQueue = new CleanupQueue();

  private gameTime = 0;

  // Hitstop callback
  public onHitstop: (() => void) | null = null;

  // Player death callback
  public onPlayerDeath: ((score: number, wave: number, maxCombo: number) => void) | null = null;

  // Game win callback
  public onGameWin: ((score: number, wave: number, maxCombo: number) => void) | null = null;

  // Cell delivery callback (for UI feedback)
  public onCellDelivered: ((cellNumber: number, totalCells: number) => void) | null = null;

  // Track last afterimage spawn time for dash
  private lastAfterimageTime = 0;

  // Reusable arrays to avoid per-frame allocations
  private readonly projectilesToRemove: string[] = [];
  private readonly pickupsToRemove: string[] = [];

  constructor(mapData: MapData, entities: EntityManager, ui: UIManager, renderer: Renderer) {
    this.mapData = mapData;
    this.entities = entities;
    this.ui = ui;
    this.renderer = renderer;
    this.ai = new EnemyAI(mapData);
    this.eventBus = getEventBus();
    this.settings = Settings.getInstance();

    // Initialize wave manager with callbacks
    this.waveManager = new WaveManager(mapData, {
      onSpawnEnemy: (request) => this.handleSpawnEnemy(request),
      onWaveStart: (wave, count) => {
        debug.log(`Wave ${wave} started! Enemies: ${count}`);
        this.eventBus.emit('waveStarted', { waveNumber: wave, enemyCount: count });
      },
      onWaveComplete: (wave) => {
        debug.log(`Wave ${wave} complete!`);
        this.eventBus.emit('waveCompleted', { waveNumber: wave });
      },
    });

    // Initialize objective system with callbacks
    this.objectiveSystem = new ObjectiveSystem(mapData, {
      onCellPickup: (cellId) => this.handleCellPickup(cellId),
      onCellDrop: (cellId, position) => this.handleCellDrop(cellId, position),
      onCellDelivered: (cellNumber, totalCells) => this.handleCellDelivered(cellNumber, totalCells),
      onObjectiveComplete: () => this.handleObjectiveComplete(),
    });
  }

  spawnLocalPlayer(position: Vec2): void {
    const playerId = generateId();

    this.player = {
      id: playerId,
      type: 'player',
      position: { x: position.x * TILE_SIZE, y: 0.5, z: position.y * TILE_SIZE },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      health: PLAYER_MAX_HEALTH,
      maxHealth: PLAYER_MAX_HEALTH,
      ammo: PLAYER_START_AMMO,
      score: 0,
      isDead: false,
      lastShootTime: 0,
      // Weapon system
      currentWeapon: 'shotgun',
      unlockedWeapons: ['pistol', 'shotgun'],
      // Thermobaric charge
      thermobaricCooldown: 0,
      // Dash ability
      dashCooldown: 0,
      isDashing: false,
      dashDirection: { x: 0, y: 0 },
      dashStartTime: 0,
      // Combo system
      comboCount: 0,
      comboTimer: 0,
      maxCombo: 0,
      // Power-ups
      powerUps: {},
      // Power Cell carrying
      carryingCellId: null,
    };

    this.entities.setLocalPlayerId(playerId);
    this.entities.createPlayer(this.player);

    // Spawn some initial weapon pickups nearby
    this.spawnInitialWeapons();

    // Start wave system
    this.waveManager.start();

    // Emit game started event (triggers gameplay music)
    this.eventBus.emit('gameStarted', {});
  }

  private spawnInitialWeapons(): void {
    if (!this.player) return;

    // Spawn 2 weapon pickups within 3-5 tiles of player
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 2; // 3-5 tiles away
      const spawnPos = {
        x: this.player.position.x + Math.cos(angle) * dist * TILE_SIZE,
        y: 0.5,
        z: this.player.position.z + Math.sin(angle) * dist * TILE_SIZE,
      };
      this.spawnWeaponPickup(spawnPos);
    }
  }

  update(input: InputState, dt: number): void {
    const objectiveState = this.objectiveSystem.getState();
    if (!this.player || this.player.isDead || objectiveState.isComplete) return;

    this.gameTime += dt;

    // Update combo timer - use extracted utility
    if (this.player.comboTimer > 0) {
      const comboState = updateComboState(
        { comboCount: this.player.comboCount, comboTimer: this.player.comboTimer, maxCombo: this.player.maxCombo },
        'tick',
        dt
      );
      this.player.comboCount = comboState.comboCount;
      this.player.comboTimer = comboState.comboTimer;
    }

    // Update player
    this.updatePlayer(input, dt);

    // Update objective system (power cells, delivery)
    const playerPos = { x: this.player.position.x, y: this.player.position.z };
    this.objectiveSystem.update(playerPos, input.interact, dt);

    // Sync carrying state to player (for speed modifier)
    this.player.carryingCellId = this.objectiveSystem.getCarriedCellId();

    // Update enemies
    this.updateEnemies(dt);

    // Update projectiles
    this.updateProjectiles(dt);

    // Update pickups collision
    this.updatePickups();

    // Wave management (delegated to WaveManager)
    this.waveManager.update(dt);

    // Process delayed cleanup tasks (enemy removal, etc.)
    this.cleanupQueue.update(dt);

    // Update wall opacity (fade walls near entities for visibility)
    this.updateWallOcclusion(dt);

    // Update UI
    const waveState = this.waveManager.getState();
    this.ui.update({
      wave: waveState.waveNumber,
      enemiesLeft: waveState.enemiesRemaining,
      score: this.player.score,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      ammo: this.player.ammo,
      combo: this.player.comboCount,
      comboTimer: this.player.comboTimer,
      powerUps: this.player.powerUps,
      gameTime: this.gameTime,
      // Objective info
      cellsDelivered: objectiveState.cellsDelivered,
      cellsRequired: objectiveState.cellsRequired,
      carryingCell: objectiveState.isCarryingCell,
      // Weapon system
      currentWeapon: this.player.currentWeapon,
      unlockedWeapons: this.player.unlockedWeapons,
      thermobaricCooldown: this.player.thermobaricCooldown,
      // Minimap data
      minimapData: {
        playerPos: {
          x: this.player.position.x / TILE_SIZE,
          z: this.player.position.z / TILE_SIZE,
        },
        playerRotation: this.player.rotation,
        enemies: Array.from(this.enemies.values())
          .filter(e => e.state !== 'dead')
          .map(e => ({
            x: e.position.x / TILE_SIZE,
            z: e.position.z / TILE_SIZE,
            type: e.enemyType,
          })),
        cells: Array.from(this.objectiveSystem.getPowerCells().values()).map(c => ({
          x: c.position.x / TILE_SIZE,
          z: c.position.z / TILE_SIZE,
          collected: c.collected,
          delivered: c.delivered,
        })),
        tardisPos: this.mapData.tardisPosition,
      },
    });
  }

  private updatePlayer(input: InputState, dt: number): void {
    if (!this.player) return;

    const dtSeconds = dt / 1000;

    // Update dash cooldown
    if (this.player.dashCooldown > 0) {
      this.player.dashCooldown -= dt;
    }

    // Start dash (cannot dash while carrying a cell)
    if (input.dash && this.player.dashCooldown <= 0 && !this.player.isDashing && !this.player.carryingCellId) {
      this.player.isDashing = true;
      this.player.dashStartTime = this.gameTime;
      this.player.dashCooldown = DASH_COOLDOWN;

      // Dash direction: input direction or facing direction
      const moveDir = normalize({ x: input.moveX, y: input.moveY });
      if (moveDir.x !== 0 || moveDir.y !== 0) {
        this.player.dashDirection = moveDir;
      } else {
        this.player.dashDirection = {
          x: Math.sin(this.player.rotation),
          y: Math.cos(this.player.rotation),
        };
      }

      // Spawn initial afterimage
      this.entities.spawnAfterimage(this.player.id, this.player.position);
      this.lastAfterimageTime = this.gameTime;

      // Play dash sound
      getAudioManager()?.playDash();
    }

    // Calculate movement
    let newVelX: number;
    let newVelZ: number;
    let newX: number;
    let newZ: number;

    if (this.player.isDashing) {
      const dashElapsed = this.gameTime - this.player.dashStartTime;

      if (dashElapsed < DASH_DURATION) {
        // Dash movement
        newVelX = this.player.dashDirection.x * DASH_SPEED;
        newVelZ = this.player.dashDirection.y * DASH_SPEED;

        // Spawn afterimage every 30ms
        if (this.gameTime - this.lastAfterimageTime > 30) {
          this.entities.spawnAfterimage(this.player.id, this.player.position);
          this.lastAfterimageTime = this.gameTime;
        }
      } else {
        // Dash ended
        this.player.isDashing = false;
        const moveDir = normalize({ x: input.moveX, y: input.moveY });
        newVelX = moveDir.x * PLAYER_SPEED;
        newVelZ = moveDir.y * PLAYER_SPEED;
      }
    } else {
      // Normal movement (slower when carrying a cell)
      const moveDir = normalize({ x: input.moveX, y: input.moveY });
      const speedMultiplier = this.player.carryingCellId ? CELL_CARRY_SPEED_MULTIPLIER : 1;
      newVelX = moveDir.x * PLAYER_SPEED * speedMultiplier;
      newVelZ = moveDir.y * PLAYER_SPEED * speedMultiplier;
    }

    // Calculate new position
    newX = this.player.position.x + newVelX * dtSeconds;
    newZ = this.player.position.z + newVelZ * dtSeconds;

    // Collision with walls (use buffer larger than hitbox for visibility)
    if (!isWalkableWithRadius(this.mapData, newX, this.player.position.z, WALL_COLLISION_BUFFER)) {
      newX = this.player.position.x;
    }
    if (!isWalkableWithRadius(this.mapData, this.player.position.x, newZ, WALL_COLLISION_BUFFER)) {
      newZ = this.player.position.z;
    }

    this.player.position.x = newX;
    this.player.position.z = newZ;
    this.player.velocity = { x: newVelX, y: newVelZ };

    // Rotation (aim direction) with optional aim assist
    let aimX = input.aimX;
    let aimY = input.aimY;

    if (this.settings.aimAssist) {
      const adjusted = this.getAimAssistAdjustment(aimX, aimY);
      aimX = adjusted.x;
      aimY = adjusted.y;
    }

    this.player.rotation = Math.atan2(aimX, aimY);

    // Weapon switching (1-5 keys)
    if (input.weaponSlot !== null) {
      this.switchWeapon(input.weaponSlot);
    }

    // Thermobaric charge (F key) - panic button
    if (input.thermobaric && this.player.thermobaricCooldown <= 0) {
      this.useThermobaricCharge();
    }

    // Update thermobaric cooldown
    if (this.player.thermobaricCooldown > 0) {
      this.player.thermobaricCooldown -= dt;
    }

    // Get current weapon config
    const weaponConfig = WEAPON_CONFIGS[this.player.currentWeapon];

    // Shooting (not while dashing)
    if (input.shooting && this.player.ammo >= weaponConfig.energy && !this.player.isDashing) {
      const timeSinceLastShot = this.gameTime - this.player.lastShootTime;
      // Rapid fire power-up reduces cooldown
      const hasRapidFire = this.player.powerUps.rapidFire && this.player.powerUps.rapidFire > this.gameTime;
      const cooldown = hasRapidFire ? weaponConfig.cooldown / POWERUP_CONFIGS.rapidFire.fireRateMultiplier : weaponConfig.cooldown;
      if (timeSinceLastShot >= cooldown) {
        this.shoot();
        this.player.lastShootTime = this.gameTime;
      }
    }

    // Update entity manager
    this.entities.updatePlayer(this.player);
  }

  private shoot(): void {
    if (!this.player) return;

    const weaponConfig = WEAPON_CONFIGS[this.player.currentWeapon];

    // Check ammo (energy cost)
    if (this.player.ammo < weaponConfig.energy) return;
    this.player.ammo -= weaponConfig.energy;

    // Trigger muzzle flash
    this.entities.triggerMuzzleFlash(this.player.id);

    // Play weapon fire sound
    getAudioManager()?.playWeaponFire(this.player.currentWeapon, this.player.position);

    // Screen shake based on weapon power
    const shakeIntensity = this.player.currentWeapon === 'rocket' ? 0.3 :
                           this.player.currentWeapon === 'shotgun' ? 0.2 :
                           this.player.currentWeapon === 'rifle' ? 0.15 : 0.08;
    this.renderer.addScreenShake(shakeIntensity);
    this.eventBus.emit('screenShake', { intensity: shakeIntensity });

    const baseAngle = this.player.rotation;

    // Spread shot power-up doubles pellets
    const hasSpreadShot = this.player.powerUps.spreadShot && this.player.powerUps.spreadShot > this.gameTime;
    const pelletCount = hasSpreadShot ? weaponConfig.pellets * POWERUP_CONFIGS.spreadShot.pelletMultiplier : weaponConfig.pellets;
    const spreadAngle = hasSpreadShot ? weaponConfig.spread * 1.5 : weaponConfig.spread;

    // Fire projectiles
    for (let i = 0; i < pelletCount; i++) {
      // Calculate spread for multi-pellet weapons
      let angle = baseAngle;
      if (pelletCount > 1) {
        const spreadOffset = (i / (pelletCount - 1) - 0.5) * spreadAngle;
        const randomOffset = (Math.random() - 0.5) * 0.08;
        angle = baseAngle + spreadOffset + randomOffset;
      } else if (weaponConfig.spread > 0) {
        // Single pellet with spread (like machine gun)
        angle = baseAngle + (Math.random() - 0.5) * weaponConfig.spread;
      }

      const direction = {
        x: Math.sin(angle),
        y: Math.cos(angle),
      };

      const projectile: ProjectileState = {
        id: generateId(),
        type: 'projectile',
        position: {
          x: this.player.position.x + direction.x * 0.5,
          y: 0.5,
          z: this.player.position.z + direction.y * 0.5,
        },
        rotation: angle,
        velocity: {
          x: direction.x * weaponConfig.speed,
          y: direction.y * weaponConfig.speed,
        },
        ownerId: this.player.id,
        damage: weaponConfig.damage,
        lifetime: weaponConfig.lifetime,
        createdAt: this.gameTime,
        weaponType: this.player.currentWeapon,
      };

      this.projectiles.set(projectile.id, projectile);
      this.entities.createProjectile(projectile);
    }
  }

  private switchWeapon(slot: number): void {
    if (!this.player) return;

    const weaponType = WEAPON_SLOT_ORDER[slot - 1];
    if (!weaponType) return;

    // Check if weapon is unlocked
    if (this.player.unlockedWeapons.includes(weaponType)) {
      if (this.player.currentWeapon !== weaponType) {
        this.player.currentWeapon = weaponType;
        // Show weapon switch notification
        const config = WEAPON_CONFIGS[weaponType];
        this.ui.showPowerUpNotification(config.name, config.color);
      }
    }
  }

  private useThermobaricCharge(): void {
    if (!this.player) return;

    // Set cooldown
    this.player.thermobaricCooldown = THERMOBARIC_COOLDOWN;

    // Visual effect - expanding fire ring
    this.renderer.addScreenShake(0.5);

    // Damage all enemies in radius
    for (const [enemyId, enemy] of this.enemies) {
      if (enemy.state === 'dead') continue;

      const dist = distance(
        { x: this.player.position.x, y: this.player.position.z },
        { x: enemy.position.x, y: enemy.position.z }
      );

      if (dist <= THERMOBARIC_RADIUS) {
        // Full damage at center, less at edges
        const damageFalloff = 1 - (dist / THERMOBARIC_RADIUS) * 0.5;
        const damage = Math.floor(THERMOBARIC_DAMAGE * damageFalloff);
        enemy.health -= damage;

        // Spawn damage number
        const screenPos = this.renderer.worldToScreen(enemy.position);
        this.ui.spawnDamageNumber(screenPos.x, screenPos.y, damage, true);

        // Strong knockback
        const knockbackVel = calculateKnockback(
          { x: this.player.position.x, y: this.player.position.z },
          { x: enemy.position.x, y: enemy.position.z },
          10
        );
        enemy.knockbackVelocity = knockbackVel;

        // Check if killed
        if (enemy.health <= 0) {
          this.killEnemy(enemyId);
        } else {
          this.entities.damageEnemy(enemyId, enemy.health, ENEMY_CONFIGS[enemy.enemyType].health);
        }
      }
    }

    // Create fire ring particle effect
    this.renderer.createThermobaricEffect(this.player.position, THERMOBARIC_RADIUS);

    // Play explosion sound
    getAudioManager()?.playThermobaric(this.player.position);
  }

  private updateProjectiles(dt: number): void {
    const dtSeconds = dt / 1000;
    const toRemove = this.projectilesToRemove;
    toRemove.length = 0; // Clear without allocation
    const rocketExplosions: { x: number; y: number; z: number }[] = [];

    for (const [id, proj] of this.projectiles) {
      // Rocket homing behavior - steer towards nearest enemy
      if (proj.weaponType === 'rocket') {
        let nearestEnemy: EnemyState | null = null;
        let nearestDist = Infinity;

        for (const [, enemy] of this.enemies) {
          if (enemy.state === 'dead') continue;
          const dist = distance(
            { x: proj.position.x, y: proj.position.z },
            { x: enemy.position.x, y: enemy.position.z }
          );
          if (dist < nearestDist && dist < 20) {
            nearestDist = dist;
            nearestEnemy = enemy;
          }
        }

        if (nearestEnemy) {
          // Calculate direction to target
          const toTarget = normalize({
            x: nearestEnemy.position.x - proj.position.x,
            y: nearestEnemy.position.z - proj.position.z,
          });

          // Current velocity direction
          const currentSpeed = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
          const currentDir = normalize({ x: proj.velocity.x, y: proj.velocity.y });

          // Smoothly steer towards target (homing strength)
          const homingStrength = 0.08;
          const newDirX = currentDir.x + (toTarget.x - currentDir.x) * homingStrength;
          const newDirY = currentDir.y + (toTarget.y - currentDir.y) * homingStrength;
          const newDir = normalize({ x: newDirX, y: newDirY });

          proj.velocity.x = newDir.x * currentSpeed;
          proj.velocity.y = newDir.y * currentSpeed;
          proj.rotation = Math.atan2(newDir.x, newDir.y);
        }
      }

      // Move projectile
      proj.position.x += proj.velocity.x * dtSeconds;
      proj.position.z += proj.velocity.y * dtSeconds;

      // Check lifetime
      if (this.gameTime - proj.createdAt > proj.lifetime) {
        if (proj.weaponType === 'rocket') {
          rocketExplosions.push({ ...proj.position });
        }
        toRemove.push(id);
        continue;
      }

      // Check wall collision
      if (!isWalkable(this.mapData, proj.position.x, proj.position.z)) {
        if (proj.weaponType === 'rocket') {
          rocketExplosions.push({ ...proj.position });
        }
        toRemove.push(id);
        continue;
      }

      // Check enemy collision using spatial hash (O(1) instead of O(n))
      const nearbyEnemies = this.enemySpatialHash.getNearby(
        proj.position.x,
        proj.position.z,
        PROJECTILE_HITBOX_RADIUS + 2 // Add buffer for largest enemy hitbox
      );

      for (const spatialEnemy of nearbyEnemies) {
        const enemy = this.enemies.get(spatialEnemy.id);
        if (!enemy || enemy.state === 'dead') continue;

        const config = ENEMY_CONFIGS[enemy.enemyType];
        if (
          circleCollision(
            { x: proj.position.x, y: proj.position.z },
            PROJECTILE_HITBOX_RADIUS,
            { x: enemy.position.x, y: enemy.position.z },
            config.hitboxRadius
          )
        ) {
          const enemyId = enemy.id;
          // Damage enemy
          enemy.health -= proj.damage;

          // Trigger damage visual effects (flash, shake, health bar)
          this.entities.damageEnemy(enemyId, enemy.health, config.health);

          // Apply knockback
          const knockbackVel = calculateKnockback(
            { x: proj.position.x, y: proj.position.z },
            { x: enemy.position.x, y: enemy.position.z },
            4
          );
          enemy.knockbackVelocity = knockbackVel;

          // Spawn damage number
          const screenPos = this.renderer.worldToScreen(enemy.position);
          // Add random offset so multiple pellet hits don't stack
          const offsetX = (Math.random() - 0.5) * 40;
          const offsetY = (Math.random() - 0.5) * 30;
          this.ui.spawnDamageNumber(
            screenPos.x + offsetX,
            screenPos.y + offsetY,
            proj.damage,
            false,
            0
          );

          // Blood burst on hit (minimal particles to avoid lag)
          this.renderer.spawnBloodBurst(enemy.position, enemy.enemyType, 2);
          this.eventBus.emit('bloodBurst', {
            position: { ...enemy.position },
            enemyType: enemy.enemyType,
            intensity: 2,
          });

          // Emit enemy hit event
          this.eventBus.emit('enemyHit', {
            position: { ...enemy.position },
            enemyType: enemy.enemyType,
            damage: proj.damage,
          });

          // Trigger hitstop
          this.eventBus.emit('hitStop', { duration: 8 });
          if (this.onHitstop) {
            this.onHitstop();
          }

          if (enemy.health <= 0) {
            this.killEnemy(enemyId);
          }

          // Rocket explodes on hit
          if (proj.weaponType === 'rocket') {
            rocketExplosions.push({ ...proj.position });
          }

          toRemove.push(id);
          break;
        }
      }

      this.entities.updateProjectile(proj);
    }

    // Remove dead projectiles
    for (const id of toRemove) {
      this.projectiles.delete(id);
      this.entities.removeEntity(id);
    }

    // Process rocket explosions - visual effect + area damage
    for (const explosionPos of rocketExplosions) {
      // Visual explosion
      this.renderer.createRocketExplosion(explosionPos);

      // Play explosion sound
      getAudioManager()?.playPositional('rocket_explode', explosionPos);

      // Area damage to nearby enemies
      const explosionRadius = 3;
      for (const [enemyId, enemy] of this.enemies) {
        if (enemy.state === 'dead') continue;

        const dist = distance(
          { x: explosionPos.x, y: explosionPos.z },
          { x: enemy.position.x, y: enemy.position.z }
        );

        if (dist <= explosionRadius) {
          // Damage falls off with distance
          const damageFalloff = 1 - (dist / explosionRadius) * 0.6;
          const damage = Math.floor(40 * damageFalloff);
          enemy.health -= damage;

          // Knockback from explosion
          const explosionKnockback = calculateKnockback(
            { x: explosionPos.x, y: explosionPos.z },
            { x: enemy.position.x, y: enemy.position.z },
            6
          );
          enemy.knockbackVelocity = explosionKnockback;

          // Damage number
          const screenPos = this.renderer.worldToScreen(enemy.position);
          this.ui.spawnDamageNumber(screenPos.x, screenPos.y, damage, true, 0);

          // Kill if dead
          if (enemy.health <= 0) {
            this.killEnemy(enemyId);
          } else {
            const config = ENEMY_CONFIGS[enemy.enemyType];
            this.entities.damageEnemy(enemyId, enemy.health, config.health);
          }
        }
      }
    }
  }

  private killEnemy(enemyId: string): void {
    const enemy = this.enemies.get(enemyId);
    if (!enemy || !this.player) return;

    enemy.state = 'dead';
    const config = ENEMY_CONFIGS[enemy.enemyType];

    // Remove from spatial hash immediately (dead enemies don't collide)
    this.enemySpatialHash.remove(enemyId);

    // Combo system - use extracted utility
    const comboState = updateComboState(
      { comboCount: this.player.comboCount, comboTimer: this.player.comboTimer, maxCombo: this.player.maxCombo },
      'kill'
    );
    this.player.comboCount = comboState.comboCount;
    this.player.comboTimer = comboState.comboTimer;
    this.player.maxCombo = comboState.maxCombo;

    // Score with combo multiplier - use extracted utility
    const finalScore = calculateScore(config.score, this.player.comboCount);
    this.player.score += finalScore;
    this.waveManager.onEnemyKilled();

    // Vampire power-up: heal on kill
    if (this.player.powerUps.vampire && this.player.powerUps.vampire > this.gameTime) {
      const healAmount = POWERUP_CONFIGS.vampire.healPerKill;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + healAmount);
      // Show heal number
      const screenPos = this.renderer.worldToScreen(this.player.position);
      this.ui.spawnHealNumber(screenPos.x, screenPos.y, healAmount);
    }

    // === VISUAL FEEDBACK ===

    // Kill flash effect
    this.ui.triggerKillFlash();

    // Score popup at enemy position
    const screenPos = this.renderer.worldToScreen(enemy.position);
    this.ui.spawnScorePopup(screenPos.x, screenPos.y, finalScore, this.player.comboCount);

    // Blood burst particles (more on death than on hit)
    const particleCount = enemy.enemyType === 'tank' ? 35 : 20;
    this.renderer.spawnBloodBurst(enemy.position, enemy.enemyType, particleCount);
    this.eventBus.emit('bloodBurst', {
      position: { ...enemy.position },
      enemyType: enemy.enemyType,
      intensity: particleCount,
    });

    // Multiple blood decals around death position
    this.renderer.spawnBloodDecal(
      enemy.position.x,
      enemy.position.z,
      enemy.enemyType === 'tank' ? 1.8 : 1.2
    );
    // Extra smaller splats
    for (let i = 0; i < 2; i++) {
      this.renderer.spawnBloodDecal(
        enemy.position.x + (Math.random() - 0.5) * 2,
        enemy.position.z + (Math.random() - 0.5) * 2,
        0.5 + Math.random() * 0.5
      );
    }

    // Screen shake (bigger for tanks)
    const shakeIntensity = enemy.enemyType === 'tank' ? 0.8 : 0.4;
    this.renderer.addScreenShake(shakeIntensity);
    this.eventBus.emit('screenShake', { intensity: shakeIntensity });

    // Emit enemy killed event
    this.eventBus.emit('enemyKilled', {
      position: { ...enemy.position },
      enemyType: enemy.enemyType,
      score: finalScore,
    });

    // Spawn drops (weapon > power-up > regular pickup)
    const roll = Math.random();
    if (roll < 0.30 && this.player && this.player.unlockedWeapons.length < WEAPON_SLOT_ORDER.length) {
      // 30% chance for weapon if player doesn't have all weapons
      this.spawnWeaponPickup(enemy.position);
    } else if (roll < 0.30 + POWERUP_DROP_CHANCE) {
      this.spawnPowerUp(enemy.position);
    } else if (roll < 0.30 + POWERUP_DROP_CHANCE + PICKUP_SPAWN_CHANCE) {
      this.spawnPickup(enemy.position);
    }

    // Fade out enemy over time
    this.entities.fadeOutEnemy(enemyId, ENEMY_FADE_DURATION);

    // Schedule cleanup (game-loop safe, replaces setTimeout)
    this.cleanupQueue.schedule(`enemy-${enemyId}`, ENEMY_REMOVE_DELAY, () => {
      this.enemies.delete(enemyId);
      this.entities.removeEntity(enemyId);
    });
  }

  private spawnPickup(position: Vec3): void {
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

    this.pickups.set(pickup.id, pickup);
    this.entities.createPickup(pickup);
  }

  private spawnPowerUp(position: Vec3): void {
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

    this.pickups.set(pickup.id, pickup);
    this.entities.createPickup(pickup);
  }

  private spawnWeaponPickup(position: Vec3): void {
    if (!this.player) return;

    // Get weapons the player doesn't have yet
    const unownedWeapons = WEAPON_SLOT_ORDER.filter(
      (w) => !this.player!.unlockedWeapons.includes(w)
    );

    // If player has all weapons, don't spawn
    if (unownedWeapons.length === 0) return;

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

    this.pickups.set(pickup.id, pickup);
    this.entities.createPickup(pickup);
  }

  private updatePickups(): void {
    if (!this.player) return;

    const toRemove = this.pickupsToRemove;
    toRemove.length = 0;

    for (const [id, pickup] of this.pickups) {
      if (
        circleCollision(
          { x: this.player.position.x, y: this.player.position.z },
          PLAYER_HITBOX_RADIUS,
          { x: pickup.position.x, y: pickup.position.z },
          0.5
        )
      ) {
        if (pickup.pickupType === 'health') {
          this.player.health = Math.min(
            this.player.maxHealth,
            this.player.health + pickup.value
          );
          getAudioManager()?.playPickup('health');
        } else if (pickup.pickupType === 'ammo') {
          this.player.ammo += pickup.value;
          getAudioManager()?.playPickup('ammo');
        } else if (pickup.pickupType === 'powerup' && pickup.powerUpType) {
          // Apply power-up
          const expiryTime = this.gameTime + pickup.value;
          this.player.powerUps[pickup.powerUpType] = expiryTime;

          // Show power-up notification
          const config = POWERUP_CONFIGS[pickup.powerUpType];
          this.ui.showPowerUpNotification(config.name, config.color);
          getAudioManager()?.playPickup('powerup');
        } else if (pickup.pickupType === 'weapon' && pickup.weaponType) {
          // Unlock weapon if not already owned
          if (!this.player.unlockedWeapons.includes(pickup.weaponType)) {
            this.player.unlockedWeapons.push(pickup.weaponType);
            // Auto-switch to new weapon
            this.player.currentWeapon = pickup.weaponType;
            // Show notification
            const config = WEAPON_CONFIGS[pickup.weaponType];
            this.ui.showPowerUpNotification(`NEW: ${config.name}`, config.color);
          } else {
            // Already have weapon, give ammo instead
            this.player.ammo += 25;
            this.ui.showPowerUpNotification('+25 ENERGY', 0xffff00);
          }
          getAudioManager()?.playPickup('weapon');
        }
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.pickups.delete(id);
      this.entities.removeEntity(id);
    }
  }

  // ============================================================================
  // Objective System Callbacks
  // ============================================================================

  private handleCellPickup(cellId: string): void {
    // Hide cell from renderer
    this.renderer.removePowerCell(cellId);

    // Emit event
    this.eventBus.emit('cellPickedUp', {
      cellId,
      position: this.player ? { ...this.player.position } : { x: 0, y: 0, z: 0 },
    });

    // Visual feedback
    this.ui.showNotification('POWER CELL ACQUIRED!', 0xffaa00);
  }

  private handleCellDrop(cellId: string, position: Vec3): void {
    // Re-create cell visual at drop position
    this.renderer.addPowerCellAt(cellId, position.x, position.z);

    // Emit event
    this.eventBus.emit('cellDropped', { cellId, position: { ...position } });

    // Visual feedback
    this.ui.showNotification('CELL DROPPED!', 0xff8800);
  }

  private handleCellDelivered(cellNumber: number, totalCells: number): void {
    if (!this.player) return;

    // Update TARDIS power level
    this.renderer.setTardisPowerLevel(cellNumber);

    // Emit event
    this.eventBus.emit('cellDelivered', { cellNumber, totalCells });

    // Visual feedback
    this.ui.showNotification(`POWER INCREASING! (${cellNumber}/${totalCells})`, 0xffaa00);

    // Callback for UI
    if (this.onCellDelivered) {
      this.onCellDelivered(cellNumber, totalCells);
    }

    // Score bonus for delivery
    this.player.score += 500;

    // Screen shake
    this.renderer.addScreenShake(0.6);
    this.eventBus.emit('screenShake', { intensity: 0.6 });

    // Spawn mini-horde as penalty/challenge
    this.waveManager.addBonusEnemies(MINI_HORDE_SIZE);
  }

  private handleObjectiveComplete(): void {
    if (!this.player) return;

    // Emit event
    this.eventBus.emit('objectiveComplete', {});

    // Visual feedback
    this.ui.showNotification('STRATEGIC RETREAT!', 0x00ff00);
    this.renderer.addScreenShake(1.0);
    this.eventBus.emit('screenShake', { intensity: 1.0 });

    // Emit game over event (won)
    this.eventBus.emit('gameOver', {
      won: true,
      score: this.player.score,
      wave: this.waveManager.getWaveNumber(),
    });

    // Trigger win callback after a short delay for effect
    setTimeout(() => {
      if (this.onGameWin && this.player) {
        this.onGameWin(this.player.score, this.waveManager.getWaveNumber(), this.player.maxCombo);
      }
    }, 1500);
  }

  private updateEnemies(dt: number): void {
    if (!this.player) return;

    const dtSeconds = dt / 1000;
    const playerPos = { x: this.player.position.x, y: this.player.position.z };

    for (const [, enemy] of this.enemies) {
      if (enemy.state === 'dead') continue;

      const config = ENEMY_CONFIGS[enemy.enemyType];

      // Apply knockback using extracted utility
      if (enemy.knockbackVelocity && (enemy.knockbackVelocity.x !== 0 || enemy.knockbackVelocity.y !== 0)) {
        const wallChecker = (x: number, z: number) =>
          isWalkableWithRadius(this.mapData, x, z, WALL_COLLISION_BUFFER);

        const kbResult = processKnockback(
          { position: { x: enemy.position.x, y: enemy.position.z }, velocity: enemy.knockbackVelocity },
          dtSeconds,
          wallChecker
        );

        enemy.position.x = kbResult.position.x;
        enemy.position.z = kbResult.position.y;
        enemy.knockbackVelocity = kbResult.velocity;
      }

      // Get AI movement direction
      const moveDir = this.ai.getMovementDirection(
        enemy,
        this.player.position,
        this.enemies.values()
      );

      // Move enemy (speed scales with wave)
      const speed = config.speed * getEnemySpeedMultiplier(this.waveManager.getWaveNumber());
      let newX = enemy.position.x + moveDir.x * speed * dtSeconds;
      let newZ = enemy.position.z + moveDir.y * speed * dtSeconds;

      // Collision with walls (use buffer for visibility)
      if (!isWalkableWithRadius(this.mapData, newX, enemy.position.z, WALL_COLLISION_BUFFER)) {
        newX = enemy.position.x;
      }
      if (!isWalkableWithRadius(this.mapData, enemy.position.x, newZ, WALL_COLLISION_BUFFER)) {
        newZ = enemy.position.z;
      }

      enemy.position.x = newX;
      enemy.position.z = newZ;

      // Separation from player - prevent enemies from physically overlapping player
      // Use just hitbox radii (no extra buffer) so enemies can get within attack range
      const minSeparation = PLAYER_HITBOX_RADIUS + config.hitboxRadius;
      const toPlayer = {
        x: this.player.position.x - enemy.position.x,
        y: this.player.position.z - enemy.position.z,
      };
      const distToPlayer = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.y * toPlayer.y);

      if (distToPlayer < minSeparation && distToPlayer > 0.01) {
        // Push enemy away from player
        const overlap = minSeparation - distToPlayer;
        const pushX = -(toPlayer.x / distToPlayer) * overlap;
        const pushZ = -(toPlayer.y / distToPlayer) * overlap;

        // Apply push with wall collision check
        let pushedX = enemy.position.x + pushX;
        let pushedZ = enemy.position.z + pushZ;

        if (!isWalkableWithRadius(this.mapData, pushedX, enemy.position.z, WALL_COLLISION_BUFFER)) {
          pushedX = enemy.position.x;
        }
        if (!isWalkableWithRadius(this.mapData, enemy.position.x, pushedZ, WALL_COLLISION_BUFFER)) {
          pushedZ = enemy.position.z;
        }

        enemy.position.x = pushedX;
        enemy.position.z = pushedZ;
      }

      // Update spatial hash with new position
      this.enemySpatialHash.update({
        id: enemy.id,
        x: enemy.position.x,
        z: enemy.position.z,
        radius: config.hitboxRadius,
      });

      // Recalculate distance after all position updates (movement + separation)
      const finalEnemyPos = { x: enemy.position.x, y: enemy.position.z };
      const finalDist = distance(finalEnemyPos, playerPos);

      // Face movement direction (or player when attacking)
      if (finalDist < config.attackRange * 1.5) {
        // Close to player - face them for attack
        enemy.rotation = angleBetween(finalEnemyPos, playerPos);
      } else if (Math.abs(moveDir.x) > 0.01 || Math.abs(moveDir.y) > 0.01) {
        // Face movement direction
        enemy.rotation = Math.atan2(moveDir.x, moveDir.y);
      }

      // Attack if in range (use minSeparation as effective attack range since enemies can't get closer)
      const effectiveAttackRange = Math.max(config.attackRange, minSeparation + 0.1);
      if (finalDist < effectiveAttackRange) {
        enemy.state = 'attacking';
        // Simple melee attack (damage player) - skip if player is dashing with iframes
        if (!this.player.isDashing || !DASH_IFRAMES) {
          // Shield power-up reduces damage
          const hasShield = this.player.powerUps.shield && this.player.powerUps.shield > this.gameTime;
          const damageMultiplier = hasShield ? POWERUP_CONFIGS.shield.damageReduction : 1;
          const damage = config.damage * dtSeconds * damageMultiplier;
          this.player.health -= damage;

          // Trigger damage vignette (less intense with shield)
          if (damage > 0.5) {
            this.ui.triggerDamageVignette(hasShield ? 0.2 : 0.4);

            // Emit player hit event
            this.eventBus.emit('playerHit', {
              position: { ...this.player.position },
              damage,
              health: this.player.health,
            });
          }

          if (this.player.health <= 0 && !this.player.isDead) {
            this.player.isDead = true;
            this.player.health = 0;
            // Death effects
            this.renderer.addScreenShake(1.5);
            this.eventBus.emit('screenShake', { intensity: 1.5 });
            // Blood burst for player
            this.renderer.spawnBloodBurst(this.player.position, 'tank', 30);
            this.renderer.spawnBloodDecal(this.player.position.x, this.player.position.z, 2);

            // Emit player died event
            this.eventBus.emit('playerDied', { position: { ...this.player.position } });

            // Emit game over event (lost)
            this.eventBus.emit('gameOver', {
              won: false,
              score: this.player.score,
              wave: this.waveManager.getWaveNumber(),
            });

            // Trigger death callback
            if (this.onPlayerDeath) {
              this.onPlayerDeath(this.player.score, this.waveManager.getWaveNumber(), this.player.maxCombo);
            }
          }
        }
      } else {
        enemy.state = 'chasing';
      }

      // Update enemy state for speech bubble animation
      this.entities.updateEnemyState(enemy);
      this.entities.updateEnemy(enemy);
    }
  }

  // ============================================================================
  // Wave System Handlers (callback from WaveManager)
  // ============================================================================

  private handleSpawnEnemy(request: SpawnRequest): void {
    const enemyConfig = ENEMY_CONFIGS[request.enemyType];

    const enemy: EnemyState = {
      id: generateId(),
      type: 'enemy',
      position: {
        x: request.spawnPoint.x * TILE_SIZE,
        y: 0.5,
        z: request.spawnPoint.y * TILE_SIZE,
      },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      health: enemyConfig.health,
      maxHealth: enemyConfig.health,
      enemyType: request.enemyType,
      targetId: this.player?.id ?? null,
      state: 'idle',
      knockbackVelocity: { x: 0, y: 0 },
    };

    this.enemies.set(enemy.id, enemy);
    this.entities.createEnemy(enemy);

    // Add to spatial hash for efficient collision detection
    this.enemySpatialHash.insert({
      id: enemy.id,
      x: enemy.position.x,
      z: enemy.position.z,
      radius: enemyConfig.hitboxRadius,
    });
  }

  // ============================================================================
  // Wall Occlusion
  // ============================================================================

  /**
   * Update wall opacity to keep entities visible behind walls.
   * Walls near entities fade smoothly for better visibility.
   */
  private updateWallOcclusion(dt: number): void {
    const entityPositions: Array<{ x: number; z: number }> = [];

    // Add player position
    if (this.player && !this.player.isDead) {
      entityPositions.push({ x: this.player.position.x, z: this.player.position.z });
    }

    // Add enemy positions
    for (const enemy of this.enemies.values()) {
      entityPositions.push({ x: enemy.position.x, z: enemy.position.z });
    }

    // Update wall opacity in renderer (dt in seconds)
    this.renderer.updateWallOcclusion(entityPositions, dt / 1000);
  }

  /**
   * Apply aim assist using extracted utility function
   */
  private getAimAssistAdjustment(aimX: number, aimY: number): { x: number; y: number } {
    if (!this.player) return { x: aimX, y: aimY };

    const playerPos = { x: this.player.position.x, z: this.player.position.z };
    const aim = { x: aimX, y: aimY };

    // Convert enemies map to array of aim targets
    const targets = Array.from(this.enemies.values()).map(enemy => ({
      position: enemy.position,
      isDead: enemy.state === 'dead',
    }));

    return applyAimAssist(playerPos, aim, targets, DEFAULT_AIM_ASSIST_CONFIG);
  }
}
