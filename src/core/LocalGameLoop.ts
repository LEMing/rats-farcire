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
  COMBO_TIMEOUT,
  COMBO_SCORE_MULTIPLIER,
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
import { debug } from '../utils/debug';

// ============================================================================
// Local Game Loop (Singleplayer)
// ============================================================================

export class LocalGameLoop {
  private mapData: MapData;
  private entities: EntityManager;
  private ui: UIManager;
  private ai: EnemyAI;
  private renderer: Renderer;
  private eventBus: EventBus;

  private player: PlayerState | null = null;
  private enemies: Map<string, EnemyState> = new Map();
  private projectiles: Map<string, ProjectileState> = new Map();
  private pickups: Map<string, PickupState> = new Map();

  // Extracted systems
  private waveManager!: WaveManager;
  private objectiveSystem!: ObjectiveSystem;

  // Spatial partitioning for O(1) collision lookups
  private enemySpatialHash = new SpatialHash<SpatialEntity>(4);

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

    // Update combo timer
    if (this.player.comboTimer > 0) {
      this.player.comboTimer -= dt;
      if (this.player.comboTimer <= 0) {
        this.player.comboCount = 0;
      }
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

    // Rotation (aim direction)
    this.player.rotation = Math.atan2(input.aimX, input.aimY);

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
        const knockbackDir = normalize({
          x: enemy.position.x - this.player.position.x,
          y: enemy.position.z - this.player.position.z,
        });
        enemy.knockbackVelocity = {
          x: knockbackDir.x * 10,
          y: knockbackDir.y * 10,
        };

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
  }

  private updateProjectiles(dt: number): void {
    const dtSeconds = dt / 1000;
    const toRemove = this.projectilesToRemove;
    toRemove.length = 0; // Clear without allocation

    for (const [id, proj] of this.projectiles) {
      // Move projectile
      proj.position.x += proj.velocity.x * dtSeconds;
      proj.position.z += proj.velocity.y * dtSeconds;

      // Check lifetime
      if (this.gameTime - proj.createdAt > proj.lifetime) {
        toRemove.push(id);
        continue;
      }

      // Check wall collision
      if (!isWalkable(this.mapData, proj.position.x, proj.position.z)) {
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
          const knockbackDir = normalize({
            x: enemy.position.x - proj.position.x,
            y: enemy.position.z - proj.position.z,
          });
          const knockbackForce = 4;
          enemy.knockbackVelocity = {
            x: knockbackDir.x * knockbackForce,
            y: knockbackDir.y * knockbackForce,
          };

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
  }

  private killEnemy(enemyId: string): void {
    const enemy = this.enemies.get(enemyId);
    if (!enemy || !this.player) return;

    enemy.state = 'dead';
    const config = ENEMY_CONFIGS[enemy.enemyType];

    // Remove from spatial hash immediately (dead enemies don't collide)
    this.enemySpatialHash.remove(enemyId);

    // Combo system
    this.player.comboCount++;
    this.player.comboTimer = COMBO_TIMEOUT;
    this.player.maxCombo = Math.max(this.player.maxCombo, this.player.comboCount);

    // Score with combo multiplier
    const comboMultiplier = 1 + (this.player.comboCount - 1) * COMBO_SCORE_MULTIPLIER;
    const finalScore = Math.floor(config.score * comboMultiplier);
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

    // Fade out enemy over time (longer for better visual)
    this.entities.fadeOutEnemy(enemyId, 500);

    // Remove after fade
    setTimeout(() => {
      this.enemies.delete(enemyId);
      this.entities.removeEntity(enemyId);
    }, 600);
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
        } else if (pickup.pickupType === 'ammo') {
          this.player.ammo += pickup.value;
        } else if (pickup.pickupType === 'powerup' && pickup.powerUpType) {
          // Apply power-up
          const expiryTime = this.gameTime + pickup.value;
          this.player.powerUps[pickup.powerUpType] = expiryTime;

          // Show power-up notification
          const config = POWERUP_CONFIGS[pickup.powerUpType];
          this.ui.showPowerUpNotification(config.name, config.color);
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
      const enemyPos = { x: enemy.position.x, y: enemy.position.z };
      const dist = distance(enemyPos, playerPos);

      // Apply knockback
      if (enemy.knockbackVelocity && (enemy.knockbackVelocity.x !== 0 || enemy.knockbackVelocity.y !== 0)) {
        let kbX = enemy.position.x + enemy.knockbackVelocity.x * dtSeconds;
        let kbZ = enemy.position.z + enemy.knockbackVelocity.y * dtSeconds;

        // Wall collision for knockback (use buffer for visibility)
        if (!isWalkableWithRadius(this.mapData, kbX, enemy.position.z, WALL_COLLISION_BUFFER)) {
          kbX = enemy.position.x;
          enemy.knockbackVelocity.x = 0;
        }
        if (!isWalkableWithRadius(this.mapData, enemy.position.x, kbZ, WALL_COLLISION_BUFFER)) {
          kbZ = enemy.position.z;
          enemy.knockbackVelocity.y = 0;
        }

        enemy.position.x = kbX;
        enemy.position.z = kbZ;

        // Decay knockback
        enemy.knockbackVelocity.x *= 0.85;
        enemy.knockbackVelocity.y *= 0.85;

        // Zero out small values
        if (Math.abs(enemy.knockbackVelocity.x) < 0.1) enemy.knockbackVelocity.x = 0;
        if (Math.abs(enemy.knockbackVelocity.y) < 0.1) enemy.knockbackVelocity.y = 0;
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

      // Update spatial hash with new position
      this.enemySpatialHash.update({
        id: enemy.id,
        x: enemy.position.x,
        z: enemy.position.z,
        radius: config.hitboxRadius,
      });

      // Face movement direction (or player when attacking)
      if (dist < config.attackRange * 1.5) {
        // Close to player - face them for attack
        enemy.rotation = angleBetween(enemyPos, playerPos);
      } else if (Math.abs(moveDir.x) > 0.01 || Math.abs(moveDir.y) > 0.01) {
        // Face movement direction
        enemy.rotation = Math.atan2(moveDir.x, moveDir.y);
      }

      // Attack if in range
      if (dist < config.attackRange) {
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
}
