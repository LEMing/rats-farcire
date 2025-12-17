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
  SHOOT_COOLDOWN,
  PROJECTILE_SPEED,
  PROJECTILE_DAMAGE,
  PROJECTILE_LIFETIME,
  PROJECTILE_HITBOX_RADIUS,
  ENEMY_CONFIGS,
  TILE_SIZE,
  getWaveConfig,
  getEnemySpeedMultiplier,
  WAVE_START_DELAY,
  HEALTH_PACK_VALUE,
  AMMO_PACK_VALUE,
  PICKUP_SPAWN_CHANCE,
  DASH_SPEED,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_IFRAMES,
  COMBO_TIMEOUT,
  COMBO_SCORE_MULTIPLIER,
  SHOTGUN_PELLETS,
  SHOTGUN_SPREAD,
  POWERUP_DURATION,
  POWERUP_DROP_CHANCE,
  POWERUP_CONFIGS,
} from '@shared/constants';
import type { PowerUpType } from '@shared/types';
import {
  generateId,
  normalize,
  distance,
  circleCollision,
  angleBetween,
  weightedRandom,
  randomChoice,
} from '@shared/utils';
import { EntityManager } from '../ecs/EntityManager';
import { UIManager } from '../ui/UIManager';
import { EnemyAI } from '../ai/EnemyAI';
import { Renderer } from '../rendering/Renderer';

// ============================================================================
// Local Game Loop (Singleplayer)
// ============================================================================

export class LocalGameLoop {
  private mapData: MapData;
  private entities: EntityManager;
  private ui: UIManager;
  private ai: EnemyAI;
  private renderer: Renderer;

  private player: PlayerState | null = null;
  private enemies: Map<string, EnemyState> = new Map();
  private projectiles: Map<string, ProjectileState> = new Map();
  private pickups: Map<string, PickupState> = new Map();

  private wave = 0;
  private waveEnemiesRemaining = 0;
  private waveEnemiesSpawned = 0;
  private waveEnemyCount = 0;
  private waveActive = false;
  private spawnTimer = 0;
  private currentSpawnDelay = 800;
  private waveStartTimer = 0;

  private gameTime = 0;

  // Hitstop callback
  public onHitstop: (() => void) | null = null;

  // Player death callback
  public onPlayerDeath: ((score: number, wave: number, maxCombo: number) => void) | null = null;

  // Track last afterimage spawn time for dash
  private lastAfterimageTime = 0;

  constructor(mapData: MapData, entities: EntityManager, ui: UIManager, renderer: Renderer) {
    this.mapData = mapData;
    this.entities = entities;
    this.ui = ui;
    this.renderer = renderer;
    this.ai = new EnemyAI(mapData);
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
    };

    this.entities.setLocalPlayerId(playerId);
    this.entities.createPlayer(this.player);

    // Start first wave after delay
    this.waveStartTimer = WAVE_START_DELAY;
  }

  update(input: InputState, dt: number): void {
    if (!this.player || this.player.isDead) return;

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

    // Update enemies
    this.updateEnemies(dt);

    // Update projectiles
    this.updateProjectiles(dt);

    // Update pickups collision
    this.updatePickups();

    // Wave management
    this.updateWaves(dt);

    // Update UI
    this.ui.update({
      wave: this.wave,
      enemiesLeft: this.waveEnemiesRemaining,
      score: this.player.score,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      ammo: this.player.ammo,
      combo: this.player.comboCount,
      comboTimer: this.player.comboTimer,
      powerUps: this.player.powerUps,
      gameTime: this.gameTime,
    });
  }

  private updatePlayer(input: InputState, dt: number): void {
    if (!this.player) return;

    const dtSeconds = dt / 1000;

    // Update dash cooldown
    if (this.player.dashCooldown > 0) {
      this.player.dashCooldown -= dt;
    }

    // Start dash
    if (input.dash && this.player.dashCooldown <= 0 && !this.player.isDashing) {
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
      // Normal movement
      const moveDir = normalize({ x: input.moveX, y: input.moveY });
      newVelX = moveDir.x * PLAYER_SPEED;
      newVelZ = moveDir.y * PLAYER_SPEED;
    }

    // Calculate new position
    newX = this.player.position.x + newVelX * dtSeconds;
    newZ = this.player.position.z + newVelZ * dtSeconds;

    // Collision with walls
    if (!this.isWalkable(newX, this.player.position.z)) {
      newX = this.player.position.x;
    }
    if (!this.isWalkable(this.player.position.x, newZ)) {
      newZ = this.player.position.z;
    }

    this.player.position.x = newX;
    this.player.position.z = newZ;
    this.player.velocity = { x: newVelX, y: newVelZ };

    // Rotation (aim direction)
    this.player.rotation = Math.atan2(input.aimX, input.aimY);

    // Shooting (not while dashing)
    if (input.shooting && this.player.ammo > 0 && !this.player.isDashing) {
      const timeSinceLastShot = this.gameTime - this.player.lastShootTime;
      // Rapid fire power-up reduces cooldown
      const hasRapidFire = this.player.powerUps.rapidFire && this.player.powerUps.rapidFire > this.gameTime;
      const cooldown = hasRapidFire ? SHOOT_COOLDOWN / POWERUP_CONFIGS.rapidFire.fireRateMultiplier : SHOOT_COOLDOWN;
      if (timeSinceLastShot >= cooldown) {
        this.shoot();
        this.player.lastShootTime = this.gameTime;
      }
    }

    // Update entity manager
    this.entities.updatePlayer(this.player);
  }

  private shoot(): void {
    if (!this.player || this.player.ammo <= 0) return;

    this.player.ammo--;

    // Trigger muzzle flash
    this.entities.triggerMuzzleFlash(this.player.id);

    // Screen shake for shotgun kick
    this.renderer.addScreenShake(0.15);

    const baseAngle = this.player.rotation;

    // Spread shot power-up doubles pellets
    const hasSpreadShot = this.player.powerUps.spreadShot && this.player.powerUps.spreadShot > this.gameTime;
    const pelletCount = hasSpreadShot ? SHOTGUN_PELLETS * POWERUP_CONFIGS.spreadShot.pelletMultiplier : SHOTGUN_PELLETS;
    const spreadAngle = hasSpreadShot ? SHOTGUN_SPREAD * 1.5 : SHOTGUN_SPREAD; // Wider spread with more pellets

    // Fire multiple pellets with spread (shotgun)
    for (let i = 0; i < pelletCount; i++) {
      // Spread angle: distribute evenly across spread range with some randomness
      const spreadOffset = (i / (pelletCount - 1) - 0.5) * spreadAngle;
      const randomOffset = (Math.random() - 0.5) * 0.08; // Small random variation
      const angle = baseAngle + spreadOffset + randomOffset;

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
          x: direction.x * PROJECTILE_SPEED,
          y: direction.y * PROJECTILE_SPEED,
        },
        ownerId: this.player.id,
        damage: PROJECTILE_DAMAGE,
        lifetime: PROJECTILE_LIFETIME,
        createdAt: this.gameTime,
      };

      this.projectiles.set(projectile.id, projectile);
      this.entities.createProjectile(projectile);
    }
  }

  private updateProjectiles(dt: number): void {
    const dtSeconds = dt / 1000;
    const toRemove: string[] = [];

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
      if (!this.isWalkable(proj.position.x, proj.position.z)) {
        toRemove.push(id);
        continue;
      }

      // Check enemy collision
      for (const [enemyId, enemy] of this.enemies) {
        if (enemy.state === 'dead') continue;

        const config = ENEMY_CONFIGS[enemy.enemyType];
        if (
          circleCollision(
            { x: proj.position.x, y: proj.position.z },
            PROJECTILE_HITBOX_RADIUS,
            { x: enemy.position.x, y: enemy.position.z },
            config.hitboxRadius
          )
        ) {
          // Damage enemy
          enemy.health -= proj.damage;

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

          // Small blood burst on hit
          this.renderer.spawnBloodBurst(enemy.position, enemy.enemyType, 3);

          // Trigger hitstop
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

    // Combo system
    this.player.comboCount++;
    this.player.comboTimer = COMBO_TIMEOUT;
    this.player.maxCombo = Math.max(this.player.maxCombo, this.player.comboCount);

    // Score with combo multiplier
    const comboMultiplier = 1 + (this.player.comboCount - 1) * COMBO_SCORE_MULTIPLIER;
    const finalScore = Math.floor(config.score * comboMultiplier);
    this.player.score += finalScore;
    this.waveEnemiesRemaining--;

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

    // Spawn drops (power-up takes priority over regular pickup)
    if (Math.random() < POWERUP_DROP_CHANCE) {
      this.spawnPowerUp(enemy.position);
    } else if (Math.random() < PICKUP_SPAWN_CHANCE) {
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

  private updatePickups(): void {
    if (!this.player) return;

    const toRemove: string[] = [];

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
        }
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.pickups.delete(id);
      this.entities.removeEntity(id);
    }
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

        // Wall collision for knockback
        if (!this.isWalkable(kbX, enemy.position.z)) {
          kbX = enemy.position.x;
          enemy.knockbackVelocity.x = 0;
        }
        if (!this.isWalkable(enemy.position.x, kbZ)) {
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
        Array.from(this.enemies.values())
      );

      // Move enemy (speed scales with wave)
      const speed = config.speed * getEnemySpeedMultiplier(this.wave);
      let newX = enemy.position.x + moveDir.x * speed * dtSeconds;
      let newZ = enemy.position.z + moveDir.y * speed * dtSeconds;

      // Collision with walls
      if (!this.isWalkable(newX, enemy.position.z)) {
        newX = enemy.position.x;
      }
      if (!this.isWalkable(enemy.position.x, newZ)) {
        newZ = enemy.position.z;
      }

      enemy.position.x = newX;
      enemy.position.z = newZ;

      // Face player
      enemy.rotation = angleBetween(enemyPos, playerPos);

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
          }

          if (this.player.health <= 0 && !this.player.isDead) {
            this.player.isDead = true;
            this.player.health = 0;
            // Death effects
            this.renderer.addScreenShake(1.5);
            // Blood burst for player
            this.renderer.spawnBloodBurst(this.player.position, 'tank', 30);
            this.renderer.spawnBloodDecal(this.player.position.x, this.player.position.z, 2);
            // Trigger death callback
            if (this.onPlayerDeath) {
              this.onPlayerDeath(this.player.score, this.wave, this.player.maxCombo);
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

  private updateWaves(dt: number): void {
    // Wave start delay
    if (this.waveStartTimer > 0) {
      this.waveStartTimer -= dt;
      if (this.waveStartTimer <= 0) {
        this.startNextWave();
      }
      return;
    }

    if (!this.waveActive) return;

    // Spawn enemies
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.waveEnemiesSpawned < this.waveEnemyCount) {
      this.spawnEnemy();
      this.spawnTimer = this.currentSpawnDelay;
    }

    // Check wave complete
    if (this.waveEnemiesRemaining <= 0 && this.waveEnemiesSpawned >= this.waveEnemyCount) {
      this.waveActive = false;
      this.waveStartTimer = WAVE_START_DELAY;
    }
  }

  private startNextWave(): void {
    this.wave++;
    const config = getWaveConfig(this.wave);

    this.waveEnemyCount = config.enemyCount;
    this.waveEnemiesRemaining = config.enemyCount;
    this.waveEnemiesSpawned = 0;
    this.currentSpawnDelay = config.spawnDelay;
    this.spawnTimer = 0;
    this.waveActive = true;

    console.log(`Wave ${this.wave} started! Enemies: ${config.enemyCount}`);
  }

  private spawnEnemy(): void {
    if (this.mapData.enemySpawnPoints.length === 0) return;

    const config = getWaveConfig(this.wave);
    const enemyType = weightedRandom(
      config.types.map((t) => ({ item: t.type, weight: t.weight }))
    );

    const spawnPoint = randomChoice(this.mapData.enemySpawnPoints);
    const enemyConfig = ENEMY_CONFIGS[enemyType];

    const enemy: EnemyState = {
      id: generateId(),
      type: 'enemy',
      position: {
        x: spawnPoint.x * TILE_SIZE,
        y: 0.5,
        z: spawnPoint.y * TILE_SIZE,
      },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      health: enemyConfig.health,
      maxHealth: enemyConfig.health,
      enemyType,
      targetId: this.player?.id ?? null,
      state: 'idle',
      knockbackVelocity: { x: 0, y: 0 },
    };

    this.enemies.set(enemy.id, enemy);
    this.entities.createEnemy(enemy);
    this.waveEnemiesSpawned++;
  }

  private isWalkable(worldX: number, worldZ: number): boolean {
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldZ / TILE_SIZE);

    if (
      tileX < 0 ||
      tileX >= this.mapData.width ||
      tileY < 0 ||
      tileY >= this.mapData.height
    ) {
      return false;
    }

    return this.mapData.tiles[tileY][tileX].walkable;
  }
}
