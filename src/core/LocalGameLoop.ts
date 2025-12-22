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
  PLAYER_MAX_HEALTH,
  WEAPON_AMMO_CONFIGS,
  PLAYER_HITBOX_RADIUS,
  PROJECTILE_HITBOX_RADIUS,
  ENEMY_CONFIGS,
  TILE_SIZE,
  PICKUP_SPAWN_CHANCE,
  DASH_IFRAMES,
  DASH_DURATION,
  POWERUP_DROP_CHANCE,
  POWERUP_CONFIGS,
  MINI_HORDE_SIZE,
  WEAPON_SLOT_ORDER,
} from '@shared/constants';
import { WaveManager, SpawnRequest } from '../systems/WaveManager';
import { ObjectiveSystem } from '../systems/ObjectiveSystem';
import {
  generateId,
  circleCollision,
} from '@shared/utils';
import { EntityManager } from '../ecs/EntityManager';
import { UIManager } from '../ui/UIManager';
import { Renderer } from '../rendering/Renderer';
import { EventBus, getEventBus } from './EventBus';
import { getAudioManager } from '../audio/AudioManager';
import { Settings } from '../settings/Settings';
import { debug } from '../utils/debug';
import { calculateScore, updateComboState } from '../systems/ScoreUtils';
import { CleanupQueue } from '../systems/CleanupQueue';
import { PlayerController } from '../systems/PlayerController';
import { WeaponSystem } from '../systems/WeaponSystem';
import { EnemyManager } from '../systems/EnemyManager';
import { ProjectileManager } from '../systems/ProjectileManager';
import { PickupManager } from '../systems/PickupManager';
import { LastStandSystem } from '../systems/LastStandSystem';
import { BarrelManager, ExplosionResult } from '../systems/BarrelManager';
import { PropManager } from '../systems/PropManager';
import { DeathEffectsSystem } from '../systems/DeathEffectsSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { PhysicsManager } from '../physics/PhysicsManager';
import { PhysicsColliderBuilder } from '../physics/PhysicsColliderBuilder';

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
  private playerController!: PlayerController;
  private weaponSystem!: WeaponSystem;
  private enemyManager!: EnemyManager;
  private projectileManager!: ProjectileManager;
  private pickupManager!: PickupManager;
  private lastStandSystem!: LastStandSystem;
  private barrelManager!: BarrelManager;
  private propManager!: PropManager;
  private deathEffectsSystem!: DeathEffectsSystem;
  private combatSystem!: CombatSystem;

  // Cleanup queue for delayed entity removal (replaces setTimeout)
  private cleanupQueue = new CleanupQueue();

  // Physics system (optional - initialized async)
  private physics: PhysicsManager | null = null;
  private physicsInitialized = false;

  private gameTime = 0;

  // Hitstop callback
  public onHitstop: (() => void) | null = null;

  // Player death callback
  public onPlayerDeath: ((score: number, wave: number, maxCombo: number) => void) | null = null;

  // Game win callback
  public onGameWin: ((score: number, wave: number, maxCombo: number) => void) | null = null;

  // Cell delivery callback (for UI feedback)
  public onCellDelivered: ((cellNumber: number, totalCells: number) => void) | null = null;

  // Reusable arrays to avoid per-frame allocations
  private readonly projectilesToRemove: string[] = [];

  constructor(mapData: MapData, entities: EntityManager, ui: UIManager, renderer: Renderer) {
    this.mapData = mapData;
    this.entities = entities;
    this.ui = ui;
    this.renderer = renderer;
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

    // Initialize player controller with callbacks
    this.playerController = new PlayerController(mapData, {
      onDashStart: (_playerId, position, direction) => {
        this.renderer.createDashEffect(position, direction, DASH_DURATION);
      },
      onAfterimage: (playerId, position) => this.entities.spawnAfterimage(playerId, position),
      onDashSound: () => getAudioManager()?.playDash(),
    });

    // Initialize weapon system with callbacks
    this.weaponSystem = new WeaponSystem({
      onMuzzleFlash: (playerId) => this.entities.triggerMuzzleFlash(playerId),
      onWeaponFire: (weaponType, position) => getAudioManager()?.playWeaponFire(weaponType, position),
      onWeaponSwitch: (name, color) => this.ui.showPowerUpNotification(name, color),
      onThermobaricFire: (position) => getAudioManager()?.playThermobaric(position),
    });

    // Initialize enemy manager
    this.enemyManager = new EnemyManager(mapData, {
      onEnemySpawned: (enemy) => this.entities.createEnemy(enemy),
      onEnemyMoved: (enemy) => {
        this.entities.updateEnemyState(enemy);
        this.entities.updateEnemy(enemy);
      },
    });

    // Initialize projectile manager
    this.projectileManager = new ProjectileManager(mapData);

    // Initialize pickup manager
    this.pickupManager = new PickupManager({
      onPickupSpawned: (pickup) => this.entities.createPickup(pickup),
      onPickupCollected: (pickupType) => {
        getAudioManager()?.playPickup(pickupType as 'health' | 'ammo' | 'powerup' | 'weapon');
      },
    });

    // Initialize last stand system
    this.lastStandSystem = new LastStandSystem({}, {
      onLastStandStart: () => {
        this.renderer.addScreenShake(1.0);
        this.ui.showLastStand(true);
        getAudioManager()?.playLastStandStart();
      },
      onLastStandKill: (kills, required) => {
        this.ui.updateLastStandKills(kills, required);
      },
      onLastStandSuccess: () => {
        this.ui.showLastStand(false);
        this.ui.showNotification('SURVIVAL PROTOCOL ENGAGED', 0xffd700);
        this.renderer.addScreenShake(0.8);
        getAudioManager()?.playLastStandSuccess();
      },
      onLastStandFail: () => {
        this.ui.showLastStand(false);
      },
    });

    // Initialize barrel manager
    this.barrelManager = new BarrelManager({}, {
      onBarrelExplode: (result) => {
        // Visual effect via renderer
        this.renderer.createThermobaricEffect(result.position, result.radius);
        this.renderer.addScreenShake(0.4);
        getAudioManager()?.playThermobaric(result.position);

        // Spawn physics debris if physics is available
        if (this.physics && this.physicsInitialized) {
          const debrisIds = this.physics.spawnDebris(result.position, 8, 15);
          const mapRenderer = this.renderer.getMapRenderer();
          for (const debrisId of debrisIds) {
            const transform = this.physics.getDebrisTransform(debrisId);
            if (transform) {
              const size = 0.05 + Math.random() * 0.1;
              mapRenderer.spawnDebris(debrisId, transform.pos, size);
            }
          }
        }
      },
    });

    // Initialize prop manager for physics-enabled decorations
    this.propManager = new PropManager();

    // Initialize death effects system
    this.deathEffectsSystem = new DeathEffectsSystem(mapData, {
      spawnBloodBurst: (position, enemyType, count) => {
        this.renderer.spawnBloodBurst(position, enemyType, count);
        this.eventBus.emit('bloodBurst', { position: { ...position }, enemyType, intensity: count });
      },
      spawnBloodDecal: (x, z, size) => this.renderer.spawnBloodDecal(x, z, size),
      spawnGibs: (position, count) => this.renderer.spawnGibs(position, count),
      spawnWallSplatter: (x, z, y, face, size) => this.renderer.spawnWallSplatter(x, z, y, face, size),
      triggerKillFlash: () => this.ui.triggerKillFlash(),
      registerKill: () => this.ui.registerKill(),
      spawnScorePopup: (x, y, score, combo) => this.ui.spawnScorePopup(x, y, score, combo),
      addScreenShake: (intensity) => {
        this.renderer.addScreenShake(intensity);
        this.eventBus.emit('screenShake', { intensity });
      },
      markEntityBloody: (entityId, x, z) => this.renderer.markEntityBloody(entityId, x, z),
      fadeOutEnemy: (enemyId, duration) => this.entities.fadeOutEnemy(enemyId, duration),
      worldToScreen: (worldPos) => this.renderer.worldToScreen(worldPos),
    });

    // Initialize combat system
    this.combatSystem = new CombatSystem({
      onEnemyDamaged: (enemyId, currentHealth, maxHealth) => {
        this.entities.damageEnemy(enemyId, currentHealth, maxHealth);
      },
      onEnemyKilled: (enemyId, weaponType) => {
        this.killEnemy(enemyId, weaponType);
      },
      onPlayerDamaged: (damage, position) => {
        const hasShield = this.player?.powerUps.shield && this.player.powerUps.shield > this.gameTime;
        this.ui.triggerDamageVignette(hasShield ? 0.2 : 0.4);
        this.renderer.triggerDamageEffect(hasShield ? 0.4 : 0.8);
        this.eventBus.emit('playerHit', { position: { ...position }, damage, health: this.player?.health ?? 0 });
      },
      onPlayerKilled: () => {
        this.handlePlayerDeath();
      },
      onScreenShake: (intensity) => {
        this.renderer.addScreenShake(intensity);
      },
      onDamageNumber: (x, y, damage, isCrit, combo) => {
        this.ui.spawnDamageNumber(x, y, damage, isCrit, combo);
      },
      worldToScreen: (worldPos) => this.renderer.worldToScreen(worldPos),
      onHitstop: () => {
        this.eventBus.emit('hitStop', { duration: 8 });
        if (this.onHitstop) this.onHitstop();
      },
    });

    // Start physics initialization (async)
    this.initPhysics();
  }

  /**
   * Initialize physics system (async)
   * Creates Rapier world, builds map colliders, and connects to barrel manager
   */
  private async initPhysics(): Promise<void> {
    try {
      this.physics = new PhysicsManager();
      await this.physics.init();

      // Build static wall colliders from map
      const colliderBuilder = new PhysicsColliderBuilder();
      colliderBuilder.buildFromMap(this.physics, this.mapData);

      // Connect physics to barrel manager
      this.barrelManager.setPhysicsManager(this.physics);

      // IMPORTANT: First register pending props from MapRenderer, THEN connect physics
      // This order matters because props are stored in MapRenderer's pendingProps
      // until PropManager is connected
      this.renderer.getMapRenderer().setPropManager(this.propManager);

      // Now that props are registered, connect physics to create bodies
      this.propManager.setPhysicsManager(this.physics);

      this.physicsInitialized = true;
    } catch (error) {
      console.error('[Physics] Failed to initialize:', error);
      // Game continues without physics
      this.physics = null;
      this.physicsInitialized = false;
    }
  }

  /**
   * Check if physics is ready
   */
  isPhysicsReady(): boolean {
    return this.physicsInitialized && this.physics !== null;
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
      ammo: {
        pistol: WEAPON_AMMO_CONFIGS.pistol.startAmmo,
        shotgun: WEAPON_AMMO_CONFIGS.shotgun.startAmmo,
        machinegun: WEAPON_AMMO_CONFIGS.machinegun.startAmmo,
        rifle: WEAPON_AMMO_CONFIGS.rifle.startAmmo,
        rocket: WEAPON_AMMO_CONFIGS.rocket.startAmmo,
      },
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

    // Reset Last Stand for new life
    this.lastStandSystem.reset();

    // Spawn explosive barrels in rooms
    this.spawnExplosiveBarrels();

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

  private spawnExplosiveBarrels(): void {
    // Clear existing barrels
    this.barrelManager.clear();
    this.renderer.getMapRenderer().clearExplosiveBarrels();

    // Spawn explosive barrels only in storage rooms
    for (const room of this.mapData.rooms) {
      if (room.roomType !== 'storage') continue;

      // Spawn 2-4 explosive barrels per storage room
      const barrelCount = 2 + Math.floor(Math.random() * 3);

      for (let j = 0; j < barrelCount; j++) {
        // Random position within room (with padding from walls)
        const x = room.x + 1 + Math.random() * (room.width - 2);
        const z = room.y + 1 + Math.random() * (room.height - 2);
        const worldX = x * TILE_SIZE;
        const worldZ = z * TILE_SIZE;

        // Spawn barrel in manager and render
        const barrel = this.barrelManager.spawnBarrel({ x: worldX, y: 0.5, z: worldZ });
        this.renderer.getMapRenderer().spawnExplosiveBarrel(barrel.id, worldX, worldZ);
      }
    }
  }

  update(input: InputState, dt: number): void {
    const objectiveState = this.objectiveSystem.getState();
    if (!this.player || this.player.isDead || objectiveState.isComplete) return;

    this.gameTime += dt;
    this.combatSystem.setGameTime(this.gameTime);

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

    // Update Last Stand system
    if (this.lastStandSystem.isActive()) {
      const lastStandResult = this.lastStandSystem.update(this.gameTime, dt);
      this.lastStandSystem.applyEffects(this.player);

      if (lastStandResult === 'success') {
        // Player survived Last Stand
        this.lastStandSystem.applySuccessEffects(this.player);
      } else if (lastStandResult === 'fail') {
        // Last Stand failed - player dies
        this.handlePlayerDeath();
        return;
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

    // Step physics simulation and sync positions
    this.updatePhysics();

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

    // Update low health visual effect (desaturation + pulse)
    const healthPercent = (this.player.health / this.player.maxHealth) * 100;
    this.renderer.setLowHealthIntensity(healthPercent);
  }

  /**
   * Step physics simulation and sync positions
   */
  private updatePhysics(): void {
    if (!this.physics || !this.physicsInitialized) return;

    // Step the physics world
    this.physics.step();

    // Sync barrel positions from physics
    this.barrelManager.syncFromPhysics();

    // Update barrel visuals with physics positions and rotations
    for (const barrel of this.barrelManager.getBarrels().values()) {
      const rotation = this.barrelManager.getBarrelRotation(barrel.id);
      this.renderer.getMapRenderer().updateBarrelTransform(
        barrel.id,
        barrel.position,
        rotation
      );
    }

    // Sync prop positions from physics (crates, decorative barrels, etc.)
    this.propManager.syncFromPhysics();

    // Update debris (remove expired)
    const removedDebris = this.physics.updateDebris(this.gameTime);
    for (const debrisId of removedDebris) {
      this.renderer.getMapRenderer().removeDebris(debrisId);
    }

    // Update debris visuals
    for (const debrisId of this.physics.getDebrisIds()) {
      const transform = this.physics.getDebrisTransform(debrisId);
      if (transform) {
        this.renderer.getMapRenderer().updateDebrisTransform(
          debrisId,
          transform.pos,
          transform.rot
        );
      }
    }
  }

  private updatePlayer(input: InputState, dt: number): void {
    if (!this.player) return;

    // Update aim assist setting
    this.playerController.setAimAssistEnabled(this.settings.aimAssist);

    // Delegate movement, dash, and rotation to PlayerController
    const enemies = Array.from(this.enemies.values()).map((e) => ({
      position: { x: e.position.x, z: e.position.z },
      isDead: e.state === 'dead',
    }));
    this.playerController.processInput(this.player, input, this.gameTime, dt, enemies);

    // Resolve collision with props (player can't walk through crates/barrels)
    // This pushes the player out and applies impulse to props
    if (this.physicsInitialized) {
      const resolved = this.propManager.resolveCollision(
        this.player.position.x,
        this.player.position.z,
        PLAYER_HITBOX_RADIUS,
        8 // Push force on props
      );
      if (resolved.collided) {
        this.player.position.x = resolved.x;
        this.player.position.z = resolved.z;
      }
    }

    // Weapon switching (1-5 keys) - delegate to WeaponSystem
    if (input.weaponSlot !== null) {
      this.weaponSystem.switchWeapon(this.player, input.weaponSlot);
    }

    // Update weapon cooldowns
    this.weaponSystem.updateCooldowns(this.player, dt);

    // Thermobaric charge (F key) - delegate to WeaponSystem
    if (input.thermobaric) {
      const thermoResult = this.weaponSystem.useThermobaric(this.player);
      if (thermoResult) {
        this.applyThermobaricExplosion(thermoResult.position, thermoResult.radius, thermoResult.baseDamage);
      }
    }

    // Shooting - delegate to WeaponSystem
    if (input.shooting) {
      // During Last Stand: unlimited ammo for current weapon
      const isLastStand = this.lastStandSystem.isActive();
      const currentWeapon = this.player.currentWeapon;
      const maxAmmo = WEAPON_AMMO_CONFIGS[currentWeapon].maxAmmo;
      if (isLastStand && this.player.ammo[currentWeapon] < maxAmmo) {
        this.player.ammo[currentWeapon] = maxAmmo;
      }

      const shootResult = this.weaponSystem.shoot(this.player, this.gameTime);
      if (shootResult) {
        // Apply result to player state
        this.weaponSystem.applyShootResult(this.player, shootResult, this.gameTime);

        // During Last Stand: restore ammo after shooting (unlimited)
        if (isLastStand) {
          this.player.ammo[currentWeapon] = maxAmmo;
        }

        // Add projectiles to game
        for (const projectile of shootResult.projectiles) {
          this.projectiles.set(projectile.id, projectile);
          this.entities.createProjectile(projectile);
        }

        // Register gunshot noise for enemy detection system
        this.enemyManager.registerNoise(
          { x: this.player.position.x, y: this.player.position.z },
          'gunshot'
        );

        // Screen shake
        this.renderer.addScreenShake(shootResult.screenShake);
        this.eventBus.emit('screenShake', { intensity: shootResult.screenShake });
      }
    }

    // Update entity manager
    this.entities.updatePlayer(this.player);

    // Update blood footprints trail
    this.renderer.updateEntityBloodTrail(
      this.player.id,
      this.player.position.x,
      this.player.position.z,
      this.player.rotation
    );
  }

  /**
   * Apply thermobaric explosion effects - damage enemies in radius
   */
  private applyThermobaricExplosion(position: Vec3, radius: number, baseDamage: number): void {
    if (!this.player) return;

    // Visual effect - expanding fire ring
    this.renderer.addScreenShake(0.5);

    // Apply physics explosion to barrels and debris
    if (this.physics && this.physicsInitialized) {
      this.physics.applyThermobaricExplosion(position, radius * 2);

      // Spawn physics debris
      const debrisIds = this.physics.spawnDebris(position, 12, 25);
      const mapRenderer = this.renderer.getMapRenderer();
      for (const debrisId of debrisIds) {
        const transform = this.physics.getDebrisTransform(debrisId);
        if (transform) {
          const size = 0.05 + Math.random() * 0.1;
          mapRenderer.spawnDebris(debrisId, transform.pos, size);
        }
      }
    }

    // Delegate damage calculation to CombatSystem
    this.combatSystem.applyThermobaricExplosion(position, radius, baseDamage, this.enemies);

    // Create fire ring particle effect
    this.renderer.createThermobaricEffect(position, radius);
  }

  /**
   * Apply barrel explosion effects - damage enemies and player in radius
   */
  private applyBarrelExplosion(explosion: ExplosionResult): void {
    if (!this.player) return;

    const { position, radius, damage, knockbackForce } = explosion;
    const playerDamage = this.barrelManager.getPlayerDamage();

    // Delegate damage calculation to CombatSystem
    this.combatSystem.applyBarrelExplosion(
      position,
      radius,
      damage,
      knockbackForce,
      playerDamage,
      this.enemies,
      this.player,
      () => !this.lastStandSystem.wasUsed() && !this.lastStandSystem.isActive(),
      () => this.lastStandSystem.tryTrigger(this.gameTime)
    );
  }

  private updateProjectiles(dt: number): void {
    // Update physics (movement, homing, lifetime, wall collision) via ProjectileManager
    const physicsResult = this.projectileManager.updatePhysics(
      this.projectiles,
      this.enemies,
      this.gameTime,
      dt
    );

    const toRemove = this.projectilesToRemove;
    toRemove.length = 0;
    toRemove.push(...physicsResult.toRemove);

    const rocketExplosions = [...physicsResult.rocketExplosions];
    const barrelExplosions: ExplosionResult[] = [];

    // Check barrel collision for projectiles first
    for (const [id, proj] of this.projectiles) {
      if (physicsResult.toRemove.includes(id)) continue;

      const hitBarrel = this.barrelManager.checkProjectileCollision(proj);
      if (hitBarrel) {
        const explosion = this.barrelManager.explodeBarrel(hitBarrel.id, this.gameTime);
        if (explosion) {
          barrelExplosions.push(explosion);
          this.renderer.getMapRenderer().removeExplosiveBarrel(hitBarrel.id);
        }
        toRemove.push(id);
        continue;
      }

      // Check prop collision for projectiles (crates, decorative barrels)
      const hitProp = this.propManager.checkCollision(proj.position.x, proj.position.z, PROJECTILE_HITBOX_RADIUS);
      if (hitProp) {
        // Apply gentle impulse to prop in projectile direction
        const impulseForce = 1 + proj.damage * 0.05; // Subtle push based on damage
        const velMag = Math.sqrt(proj.velocity.x * proj.velocity.x + proj.velocity.y * proj.velocity.y);
        const normX = velMag > 0 ? proj.velocity.x / velMag : 0;
        const normZ = velMag > 0 ? proj.velocity.y / velMag : 0; // velocity.y is Z in 2D
        this.propManager.applyImpulse(hitProp.id, {
          x: normX * impulseForce,
          y: 0.1, // Tiny upward
          z: normZ * impulseForce,
        });
        // Don't remove projectile - let it pass through props
      }
    }

    // Process barrel chain reactions
    const chainExplosions = this.barrelManager.update(this.gameTime);
    for (const explosion of chainExplosions) {
      barrelExplosions.push(explosion);
      this.renderer.getMapRenderer().removeExplosiveBarrel(explosion.barrelId);
    }

    // Apply barrel explosions
    for (const explosion of barrelExplosions) {
      this.applyBarrelExplosion(explosion);
    }

    // Check projectile collisions
    for (const [id, proj] of this.projectiles) {
      // Skip projectiles already marked for removal
      if (physicsResult.toRemove.includes(id)) continue;

      // Check if this is an enemy projectile (hits player)
      // Use the flag on projectile instead of checking if enemy still exists
      const isEnemyProjectile = proj.isEnemyProjectile === true;

      if (isEnemyProjectile && this.player && !this.player.isDead) {
        // Enemy projectile - check collision with player
        if (
          circleCollision(
            { x: proj.position.x, y: proj.position.z },
            PROJECTILE_HITBOX_RADIUS,
            { x: this.player.position.x, y: this.player.position.z },
            PLAYER_HITBOX_RADIUS
          )
        ) {
          // Skip if player is dashing with iframes
          if (!(this.player.isDashing && DASH_IFRAMES)) {
            this.handleEnemyProjectileHit(proj);
          }
          toRemove.push(id);
          continue;
        }
      } else {
        // Player projectile - check enemy collision using spatial hash
        const nearbyEnemies = this.enemyManager.getNearbyEnemies(
          proj.position.x,
          proj.position.z,
          PROJECTILE_HITBOX_RADIUS + 2
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
            this.handleProjectileHit(proj, enemy);

            // Rocket explodes on hit
            const explosionPos = this.projectileManager.markForRemoval(id, this.projectiles);
            if (explosionPos) {
              rocketExplosions.push(explosionPos);
            }

            toRemove.push(id);
            break;
          }
        }
      }

      this.entities.updateProjectile(proj);
    }

    // Remove dead projectiles
    for (const id of toRemove) {
      this.projectiles.delete(id);
      this.entities.removeEntity(id);
    }

    // Process rocket explosions
    for (const explosionPos of rocketExplosions) {
      this.handleRocketExplosion(explosionPos);
    }
  }

  /**
   * Handle projectile hitting an enemy
   */
  private handleProjectileHit(proj: ProjectileState, enemy: EnemyState): void {
    // Delegate damage calculation to CombatSystem
    this.combatSystem.handleProjectileHit(proj, enemy);

    // Blood burst on hit (visual effect not in CombatSystem)
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
  }

  /**
   * Handle enemy projectile hitting the player
   */
  private handleEnemyProjectileHit(proj: ProjectileState): void {
    if (!this.player) return;

    // Delegate damage calculation to CombatSystem
    this.combatSystem.handleEnemyProjectileHit(
      proj,
      this.player,
      () => !this.lastStandSystem.wasUsed() && !this.lastStandSystem.isActive(),
      () => this.lastStandSystem.tryTrigger(this.gameTime)
    );
  }

  /**
   * Handle rocket explosion - visual effect + area damage
   */
  private handleRocketExplosion(explosionPos: Vec3): void {
    // Visual explosion
    this.renderer.createRocketExplosion(explosionPos);

    // Play explosion sound
    getAudioManager()?.playPositional('rocket_explode', explosionPos);

    // Area damage constants
    const explosionRadius = 4;
    const baseDamage = 40;
    const knockbackForce = 30;

    // Apply physics explosion to barrels
    if (this.physics && this.physicsInitialized) {
      this.physics.applyRocketExplosion(explosionPos, explosionRadius * 2);

      // Spawn physics debris
      const debrisIds = this.physics.spawnDebris(explosionPos, 6, 15);
      const mapRenderer = this.renderer.getMapRenderer();
      for (const debrisId of debrisIds) {
        const transform = this.physics.getDebrisTransform(debrisId);
        if (transform) {
          const size = 0.04 + Math.random() * 0.08;
          mapRenderer.spawnDebris(debrisId, transform.pos, size);
        }
      }
    }

    // Delegate damage calculation to CombatSystem
    this.combatSystem.handleRocketExplosion(
      explosionPos,
      explosionRadius,
      baseDamage,
      knockbackForce,
      this.enemies
    );
  }

  private killEnemy(enemyId: string, weaponType?: import('@shared/types').WeaponType): void {
    const enemy = this.enemies.get(enemyId);
    if (!enemy || !this.player) return;

    enemy.state = 'dead';
    const config = ENEMY_CONFIGS[enemy.enemyType];

    // Register kill with Last Stand system
    this.lastStandSystem.registerKill();

    // Remove from spatial hash immediately (dead enemies don't collide)
    this.enemyManager.removeEnemy(enemyId);

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

    // === VISUAL FEEDBACK (delegated to DeathEffectsSystem) ===
    const shakeIntensity = this.deathEffectsSystem.handleEnemyDeath(
      enemy,
      { id: this.player.id, position: this.player.position },
      finalScore,
      this.player.comboCount,
      weaponType
    );
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
    const pickup = this.pickupManager.spawnPickup(position);
    this.pickups.set(pickup.id, pickup);
  }

  private spawnPowerUp(position: Vec3): void {
    const pickup = this.pickupManager.spawnPowerUp(position);
    this.pickups.set(pickup.id, pickup);
  }

  private spawnWeaponPickup(position: Vec3): void {
    if (!this.player) return;
    const pickup = this.pickupManager.spawnWeaponPickup(position, this.player.unlockedWeapons);
    if (pickup) {
      this.pickups.set(pickup.id, pickup);
    }
  }

  private updatePickups(): void {
    if (!this.player) return;

    const result = this.pickupManager.checkCollisions(this.player, this.pickups, this.gameTime);

    // Show notifications
    for (const notification of result.notifications) {
      this.ui.showPowerUpNotification(notification.message, notification.color);
    }

    // Remove collected pickups
    for (const id of result.collected) {
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

    // Delegate movement to EnemyManager
    const result = this.enemyManager.updateEnemies(
      this.enemies,
      this.player.position,
      this.waveManager.getWaveNumber(),
      dt
    );

    // Resolve enemy collision with props (enemies can't walk through crates/barrels)
    if (this.physicsInitialized) {
      for (const enemy of this.enemies.values()) {
        if (enemy.state === 'dead') continue;
        const config = ENEMY_CONFIGS[enemy.enemyType];
        const resolved = this.propManager.resolveCollision(
          enemy.position.x,
          enemy.position.z,
          config.hitboxRadius,
          enemy.enemyType === 'tank' ? 15 : 6 // Tanks push props harder
        );
        if (resolved.collided) {
          enemy.position.x = resolved.x;
          enemy.position.z = resolved.z;
        }
      }
    }

    // Handle enemy projectiles - add to game and register noise
    for (const projectile of result.enemyProjectiles) {
      this.projectiles.set(projectile.id, projectile);
      this.entities.createProjectile(projectile);

      // Register gunshot noise for detection system
      this.enemyManager.registerNoise(
        { x: projectile.position.x, y: projectile.position.z },
        'gunshot'
      );
    }

    // Handle attacking enemies - apply melee damage to player
    for (const enemy of result.attackingEnemies) {
      // Skip if player is dashing with iframes
      if (this.player.isDashing && DASH_IFRAMES) continue;

      // Get damage per second from enemy config
      const baseDamage = this.enemyManager.getEnemyDamage(enemy);

      // Shield power-up reduces damage
      const hasShield = this.player.powerUps.shield && this.player.powerUps.shield > this.gameTime;
      const damageMultiplier = hasShield ? POWERUP_CONFIGS.shield.damageReduction : 1;
      const damage = baseDamage * dtSeconds * damageMultiplier;
      this.player.health -= damage;

      // Trigger damage vignette and chromatic aberration (less intense with shield)
      if (damage > 0.5) {
        this.ui.triggerDamageVignette(hasShield ? 0.2 : 0.4);
        this.renderer.triggerDamageEffect(hasShield ? 0.3 : 0.6);

        // Emit player hit event
        this.eventBus.emit('playerHit', {
          position: { ...this.player.position },
          damage,
          health: this.player.health,
        });
      }

      // Check for player death or Last Stand trigger
      if (this.player.health <= 0 && !this.player.isDead && !this.lastStandSystem.isActive()) {
        // Try to trigger Last Stand
        if (this.lastStandSystem.tryTrigger(this.gameTime)) {
          // Last Stand activated - keep player alive at 1 HP
          this.player.health = 1;
        } else {
          // No Last Stand available - player dies
          this.handlePlayerDeath();
          break;
        }
      }
    }
  }

  /**
   * Handle player death
   */
  private handlePlayerDeath(): void {
    if (!this.player) return;

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

  // ============================================================================
  // Wave System Handlers (callback from WaveManager)
  // ============================================================================

  private handleSpawnEnemy(request: SpawnRequest): void {
    const enemy = this.enemyManager.spawnEnemy({
      enemyType: request.enemyType,
      spawnPoint: request.spawnPoint,
      targetId: this.player?.id ?? null,
    });

    this.enemies.set(enemy.id, enemy);
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
