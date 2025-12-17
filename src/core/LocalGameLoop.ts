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
  HEALTH_PACK_VALUE,
  AMMO_PACK_VALUE,
  PICKUP_SPAWN_CHANCE,
} from '@shared/constants';
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

// ============================================================================
// Local Game Loop (Singleplayer)
// ============================================================================

export class LocalGameLoop {
  private mapData: MapData;
  private entities: EntityManager;
  private ui: UIManager;
  private ai: EnemyAI;

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
  private currentSpawnDelay = 2000;
  private waveStartDelay = 3000;
  private waveStartTimer = 0;

  private gameTime = 0;

  constructor(mapData: MapData, entities: EntityManager, ui: UIManager) {
    this.mapData = mapData;
    this.entities = entities;
    this.ui = ui;
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
    };

    this.entities.setLocalPlayerId(playerId);
    this.entities.createPlayer(this.player);

    // Start first wave after delay
    this.waveStartTimer = this.waveStartDelay;
  }

  update(input: InputState, dt: number): void {
    if (!this.player || this.player.isDead) return;

    this.gameTime += dt;

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
    });
  }

  private updatePlayer(input: InputState, dt: number): void {
    if (!this.player) return;

    const dtSeconds = dt / 1000;

    // Movement
    const moveDir = normalize({ x: input.moveX, y: input.moveY });
    const newVelX = moveDir.x * PLAYER_SPEED;
    const newVelZ = moveDir.y * PLAYER_SPEED;

    // Calculate new position
    let newX = this.player.position.x + newVelX * dtSeconds;
    let newZ = this.player.position.z + newVelZ * dtSeconds;

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

    // Shooting
    if (input.shooting && this.player.ammo > 0) {
      const timeSinceLastShot = this.gameTime - this.player.lastShootTime;
      if (timeSinceLastShot >= SHOOT_COOLDOWN) {
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

    const direction = {
      x: Math.sin(this.player.rotation),
      y: Math.cos(this.player.rotation),
    };

    const projectile: ProjectileState = {
      id: generateId(),
      type: 'projectile',
      position: {
        x: this.player.position.x + direction.x * 0.5,
        y: 0.5,
        z: this.player.position.z + direction.y * 0.5,
      },
      rotation: this.player.rotation,
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
    this.player.score += config.score;
    this.waveEnemiesRemaining--;

    // Maybe spawn pickup
    if (Math.random() < PICKUP_SPAWN_CHANCE) {
      this.spawnPickup(enemy.position);
    }

    // Remove after brief delay
    setTimeout(() => {
      this.enemies.delete(enemyId);
      this.entities.removeEntity(enemyId);
    }, 200);
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
        } else {
          this.player.ammo += pickup.value;
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

      // Get AI movement direction
      const moveDir = this.ai.getMovementDirection(
        enemy,
        this.player.position,
        Array.from(this.enemies.values())
      );

      // Move enemy
      const speed = config.speed;
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
        // Simple melee attack (damage player)
        this.player.health -= config.damage * dtSeconds;
        if (this.player.health <= 0) {
          this.player.isDead = true;
          this.player.health = 0;
          // Game over handled elsewhere
        }
      } else {
        enemy.state = 'chasing';
      }

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
      this.waveStartTimer = this.waveStartDelay;
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
