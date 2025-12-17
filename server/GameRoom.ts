import { WebSocket } from 'ws';
import type {
  MapData,
  InputState,
  PlayerState,
  EnemyState,
  ProjectileState,
  PickupState,
  ServerMessage,
  Vec2,
  EnemyType,
} from '../shared/types';
import {
  TICK_RATE,
  TICK_INTERVAL,
  MAP_WIDTH,
  MAP_HEIGHT,
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
} from '../shared/constants';
import {
  generateId,
  normalize,
  distance,
  circleCollision,
  angleBetween,
  serializeGameState,
  weightedRandom,
} from '../shared/utils';
import { ServerMapGenerator } from './ServerMapGenerator';

// ============================================================================
// Game Room - Server-side game state and logic
// ============================================================================

interface Player {
  ws: WebSocket;
  name: string;
  state: PlayerState;
  input: InputState;
}

export class GameRoom {
  public id: string;
  public mapData: MapData;

  private players: Map<string, Player> = new Map();
  private enemies: Map<string, EnemyState> = new Map();
  private projectiles: Map<string, ProjectileState> = new Map();
  private pickups: Map<string, PickupState> = new Map();

  private tick = 0;
  private running = false;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  private wave = 0;
  private waveEnemiesRemaining = 0;
  private waveEnemiesSpawned = 0;
  private waveEnemyCount = 0;
  private waveActive = false;
  private spawnTimer = 0;
  private currentSpawnDelay = 2000;
  private waveStartDelay = 5000;
  private waveStartTimer = 0;

  constructor(id: string) {
    this.id = id;

    // Generate map
    const generator = new ServerMapGenerator(MAP_WIDTH, MAP_HEIGHT, Date.now());
    this.mapData = generator.generate();
  }

  get playerCount(): number {
    return this.players.size;
  }

  start(): void {
    this.running = true;
    this.tickInterval = setInterval(() => this.update(), TICK_INTERVAL);
    this.waveStartTimer = this.waveStartDelay;
  }

  stop(): void {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  addPlayer(id: string, name: string, ws: WebSocket): PlayerState {
    const spawnPoint =
      this.mapData.spawnPoints[this.players.size % this.mapData.spawnPoints.length];

    const state: PlayerState = {
      id,
      type: 'player',
      position: {
        x: spawnPoint.x * TILE_SIZE,
        y: 0.5,
        z: spawnPoint.y * TILE_SIZE,
      },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      health: PLAYER_MAX_HEALTH,
      maxHealth: PLAYER_MAX_HEALTH,
      ammo: PLAYER_START_AMMO,
      score: 0,
      isDead: false,
      lastShootTime: 0,
    };

    this.players.set(id, {
      ws,
      name,
      state,
      input: {
        moveX: 0,
        moveY: 0,
        aimX: 0,
        aimY: 1,
        shooting: false,
        reload: false,
        interact: false,
        sequence: 0,
      },
    });

    return state;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  handleInput(playerId: string, input: InputState): void {
    const player = this.players.get(playerId);
    if (player) {
      player.input = input;
    }
  }

  private update(): void {
    if (!this.running) return;

    this.tick++;
    const dt = TICK_INTERVAL;

    // Update players
    for (const [, player] of this.players) {
      if (!player.state.isDead) {
        this.updatePlayer(player, dt);
      }
    }

    // Update enemies
    this.updateEnemies(dt);

    // Update projectiles
    this.updateProjectiles(dt);

    // Update pickups
    this.updatePickups();

    // Wave management
    this.updateWaves(dt);

    // Broadcast state to all players
    this.broadcastState();
  }

  private updatePlayer(player: Player, dt: number): void {
    const { state, input } = player;
    const dtSeconds = dt / 1000;

    // Movement
    const moveDir = normalize({ x: input.moveX, y: input.moveY });
    const newVelX = moveDir.x * PLAYER_SPEED;
    const newVelZ = moveDir.y * PLAYER_SPEED;

    let newX = state.position.x + newVelX * dtSeconds;
    let newZ = state.position.z + newVelZ * dtSeconds;

    // Collision with walls
    if (!this.isWalkable(newX, state.position.z)) {
      newX = state.position.x;
    }
    if (!this.isWalkable(state.position.x, newZ)) {
      newZ = state.position.z;
    }

    state.position.x = newX;
    state.position.z = newZ;
    state.velocity = { x: newVelX, y: newVelZ };

    // Rotation
    state.rotation = Math.atan2(input.aimX, input.aimY);

    // Shooting
    if (input.shooting && state.ammo > 0) {
      const timeSinceLastShot = this.tick * TICK_INTERVAL - state.lastShootTime;
      if (timeSinceLastShot >= SHOOT_COOLDOWN) {
        this.playerShoot(player);
        state.lastShootTime = this.tick * TICK_INTERVAL;
      }
    }
  }

  private playerShoot(player: Player): void {
    const { state } = player;
    if (state.ammo <= 0) return;

    state.ammo--;

    const direction = {
      x: Math.sin(state.rotation),
      y: Math.cos(state.rotation),
    };

    const projectile: ProjectileState = {
      id: generateId(),
      type: 'projectile',
      position: {
        x: state.position.x + direction.x * 0.5,
        y: 0.5,
        z: state.position.z + direction.y * 0.5,
      },
      rotation: state.rotation,
      velocity: {
        x: direction.x * PROJECTILE_SPEED,
        y: direction.y * PROJECTILE_SPEED,
      },
      ownerId: state.id,
      damage: PROJECTILE_DAMAGE,
      lifetime: PROJECTILE_LIFETIME,
      createdAt: this.tick * TICK_INTERVAL,
    };

    this.projectiles.set(projectile.id, projectile);
  }

  private updateProjectiles(dt: number): void {
    const dtSeconds = dt / 1000;
    const currentTime = this.tick * TICK_INTERVAL;
    const toRemove: string[] = [];

    for (const [id, proj] of this.projectiles) {
      // Move
      proj.position.x += proj.velocity.x * dtSeconds;
      proj.position.z += proj.velocity.y * dtSeconds;

      // Lifetime check
      if (currentTime - proj.createdAt > proj.lifetime) {
        toRemove.push(id);
        continue;
      }

      // Wall collision
      if (!this.isWalkable(proj.position.x, proj.position.z)) {
        toRemove.push(id);
        continue;
      }

      // Enemy collision
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
          enemy.health -= proj.damage;

          // Notify damage
          this.broadcast({
            type: 'damage',
            payload: { entityId: enemyId, damage: proj.damage, sourceId: proj.ownerId },
          });

          if (enemy.health <= 0) {
            this.killEnemy(enemyId, proj.ownerId);
          }

          toRemove.push(id);
          break;
        }
      }
    }

    for (const id of toRemove) {
      this.projectiles.delete(id);
    }
  }

  private killEnemy(enemyId: string, killerId: string): void {
    const enemy = this.enemies.get(enemyId);
    if (!enemy) return;

    enemy.state = 'dead';
    const config = ENEMY_CONFIGS[enemy.enemyType];

    // Award score to killer
    const killer = this.players.get(killerId);
    if (killer) {
      killer.state.score += config.score;
    }

    this.waveEnemiesRemaining--;

    // Notify death
    this.broadcast({
      type: 'death',
      payload: { entityId: enemyId, killedBy: killerId },
    });

    // Maybe spawn pickup
    if (Math.random() < PICKUP_SPAWN_CHANCE) {
      this.spawnPickup(enemy.position);
    }

    // Remove after delay
    setTimeout(() => {
      this.enemies.delete(enemyId);
    }, 200);
  }

  private spawnPickup(position: { x: number; y: number; z: number }): void {
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
  }

  private updatePickups(): void {
    const toRemove: string[] = [];

    for (const [id, pickup] of this.pickups) {
      for (const [, player] of this.players) {
        if (player.state.isDead) continue;

        if (
          circleCollision(
            { x: player.state.position.x, y: player.state.position.z },
            PLAYER_HITBOX_RADIUS,
            { x: pickup.position.x, y: pickup.position.z },
            0.5
          )
        ) {
          if (pickup.pickupType === 'health') {
            player.state.health = Math.min(
              player.state.maxHealth,
              player.state.health + pickup.value
            );
          } else {
            player.state.ammo += pickup.value;
          }
          toRemove.push(id);
          break;
        }
      }
    }

    for (const id of toRemove) {
      this.pickups.delete(id);
    }
  }

  private updateEnemies(dt: number): void {
    const dtSeconds = dt / 1000;

    // Find closest player for targeting
    const activePlayers = Array.from(this.players.values()).filter(
      (p) => !p.state.isDead
    );

    for (const [, enemy] of this.enemies) {
      if (enemy.state === 'dead') continue;

      // Find closest player
      let closestPlayer: Player | null = null;
      let closestDist = Infinity;

      for (const player of activePlayers) {
        const dist = distance(
          { x: enemy.position.x, y: enemy.position.z },
          { x: player.state.position.x, y: player.state.position.z }
        );
        if (dist < closestDist) {
          closestDist = dist;
          closestPlayer = player;
        }
      }

      if (!closestPlayer) continue;

      const config = ENEMY_CONFIGS[enemy.enemyType];
      const targetPos = closestPlayer.state.position;

      // Simple chase AI
      const toTarget = normalize({
        x: targetPos.x - enemy.position.x,
        y: targetPos.z - enemy.position.z,
      });

      // Separation from other enemies
      let sepX = 0;
      let sepY = 0;
      for (const [, other] of this.enemies) {
        if (other.id === enemy.id || other.state === 'dead') continue;

        const dist = distance(
          { x: enemy.position.x, y: enemy.position.z },
          { x: other.position.x, y: other.position.z }
        );

        if (dist < config.hitboxRadius * 3 && dist > 0) {
          sepX += (enemy.position.x - other.position.x) / dist;
          sepY += (enemy.position.z - other.position.z) / dist;
        }
      }

      // Combine movement
      const moveX = toTarget.x + sepX * 0.3;
      const moveY = toTarget.y + sepY * 0.3;
      const moveNorm = normalize({ x: moveX, y: moveY });

      let newX = enemy.position.x + moveNorm.x * config.speed * dtSeconds;
      let newZ = enemy.position.z + moveNorm.y * config.speed * dtSeconds;

      // Collision
      if (!this.isWalkable(newX, enemy.position.z)) {
        newX = enemy.position.x;
      }
      if (!this.isWalkable(enemy.position.x, newZ)) {
        newZ = enemy.position.z;
      }

      enemy.position.x = newX;
      enemy.position.z = newZ;
      enemy.rotation = angleBetween(
        { x: enemy.position.x, y: enemy.position.z },
        { x: targetPos.x, y: targetPos.z }
      );

      // Attack
      if (closestDist < config.attackRange) {
        enemy.state = 'attacking';
        closestPlayer.state.health -= config.damage * dtSeconds;

        if (closestPlayer.state.health <= 0) {
          closestPlayer.state.health = 0;
          closestPlayer.state.isDead = true;
        }
      } else {
        enemy.state = 'chasing';
      }
    }
  }

  private updateWaves(dt: number): void {
    // Wait for wave start
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
    if (
      this.waveEnemiesRemaining <= 0 &&
      this.waveEnemiesSpawned >= this.waveEnemyCount
    ) {
      this.waveActive = false;

      this.broadcast({
        type: 'waveComplete',
        payload: { wave: this.wave },
      });

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

    this.broadcast({
      type: 'waveStart',
      payload: { wave: this.wave, enemyCount: config.enemyCount },
    });

    console.log(`Room ${this.id}: Wave ${this.wave} started`);
  }

  private spawnEnemy(): void {
    if (this.mapData.enemySpawnPoints.length === 0) return;

    const config = getWaveConfig(this.wave);
    const enemyType = weightedRandom(
      config.types.map((t) => ({ item: t.type as EnemyType, weight: t.weight }))
    );

    const spawnIdx = Math.floor(
      Math.random() * this.mapData.enemySpawnPoints.length
    );
    const spawnPoint = this.mapData.enemySpawnPoints[spawnIdx];
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
      targetId: null,
      state: 'idle',
    };

    this.enemies.set(enemy.id, enemy);
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

  private broadcastState(): void {
    const state = {
      tick: this.tick,
      timestamp: Date.now(),
      players: new Map(
        Array.from(this.players.entries()).map(([id, p]) => [id, p.state])
      ),
      enemies: this.enemies,
      projectiles: this.projectiles,
      pickups: this.pickups,
      wave: this.wave,
      waveEnemiesRemaining: this.waveEnemiesRemaining,
      waveActive: this.waveActive,
      gameOver: false,
    };

    const serialized = serializeGameState(state);

    this.broadcast({
      type: 'state',
      payload: serialized,
    });
  }

  broadcast(message: ServerMessage, excludeId?: string): void {
    const data = JSON.stringify(message);

    for (const [id, player] of this.players) {
      if (excludeId && id === excludeId) continue;

      if (player.ws.readyState === 1) {
        // WebSocket.OPEN
        player.ws.send(data);
      }
    }
  }
}
