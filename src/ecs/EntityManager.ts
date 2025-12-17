import * as THREE from 'three';
import type {
  PlayerState,
  EnemyState,
  ProjectileState,
  PickupState,
  SerializedGameState,
  Vec3,
} from '@shared/types';
import { Renderer } from '../rendering/Renderer';
import { lerpVec3, lerpAngle } from '@shared/utils';
import { COLORS, CLIENT_RENDER_DELAY } from '@shared/constants';

// ============================================================================
// Entity Visual Representation
// ============================================================================

interface EntityVisual {
  mesh: THREE.Group;
  prevState: { position: Vec3; rotation: number };
  currentState: { position: Vec3; rotation: number };
}

// ============================================================================
// Entity Manager - Handles visual representation of game entities
// ============================================================================

export class EntityManager {
  private renderer: Renderer;
  private entities: Map<string, EntityVisual> = new Map();
  public localPlayerId: string | null = null;

  // Snapshot buffer for interpolation (multiplayer)
  private stateBuffer: { timestamp: number; state: SerializedGameState }[] = [];

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  // ============================================================================
  // Entity Creation
  // ============================================================================

  createPlayer(state: PlayerState): void {
    const group = new THREE.Group();

    // Body (cylinder)
    const bodyGeom = this.renderer.getGeometry('playerBody')!;
    const bodyMat = this.renderer.getMaterial('player')!;
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    group.add(body);

    // Direction indicator (small cone for gun)
    const gunGeom = new THREE.ConeGeometry(0.1, 0.4, 4);
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const gun = new THREE.Mesh(gunGeom, gunMat);
    gun.position.set(0, 0, 0.5);
    gun.rotation.x = Math.PI / 2;
    group.add(gun);

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = state.rotation;

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createEnemy(state: EnemyState): void {
    const group = new THREE.Group();

    // Body (cone)
    const bodyGeom = this.renderer.getGeometry('enemyBody')!;
    let bodyMat: THREE.Material;

    switch (state.enemyType) {
      case 'runner':
        bodyMat = this.renderer.getMaterial('enemyRunner')!;
        break;
      case 'tank':
        bodyMat = this.renderer.getMaterial('enemyTank')!;
        break;
      default:
        bodyMat = this.renderer.getMaterial('enemy')!;
    }

    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    body.rotation.x = Math.PI; // Point up
    group.add(body);

    // Blurred emblem on back
    const emblemMat = this.renderer.getMaterial('emblem')!;
    const emblemGeom = new THREE.PlaneGeometry(0.4, 0.4);
    const emblem = new THREE.Mesh(emblemGeom, emblemMat);
    emblem.position.set(0, 0.3, -0.3);
    emblem.rotation.y = Math.PI;
    group.add(emblem);

    // Ears (small cones for rat)
    const earGeom = new THREE.ConeGeometry(0.15, 0.3, 4);
    const earMat = new THREE.MeshLambertMaterial({ color: 0xff8888 });

    const leftEar = new THREE.Mesh(earGeom, earMat);
    leftEar.position.set(-0.25, 0.4, 0);
    leftEar.rotation.z = -0.3;
    group.add(leftEar);

    const rightEar = new THREE.Mesh(earGeom, earMat);
    rightEar.position.set(0.25, 0.4, 0);
    rightEar.rotation.z = 0.3;
    group.add(rightEar);

    // Scale based on type
    if (state.enemyType === 'tank') {
      group.scale.setScalar(1.5);
    } else if (state.enemyType === 'runner') {
      group.scale.setScalar(0.8);
    }

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = state.rotation;

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createProjectile(state: ProjectileState): void {
    const group = new THREE.Group();

    const geom = this.renderer.getGeometry('projectile')!;
    const mat = this.renderer.getMaterial('projectile')!;
    const mesh = new THREE.Mesh(geom, mat);

    // Add glow effect
    const glowGeom = new THREE.SphereGeometry(0.25, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: COLORS.projectile,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    group.add(glow);
    group.add(mesh);

    group.position.set(state.position.x, state.position.y, state.position.z);

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createPickup(state: PickupState): void {
    const group = new THREE.Group();

    const geom = this.renderer.getGeometry('pickup')!;
    const mat =
      state.pickupType === 'health'
        ? this.renderer.getMaterial('health')!
        : this.renderer.getMaterial('ammo')!;

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    group.add(mesh);

    group.position.set(state.position.x, state.position.y, state.position.z);

    // Store pickup animation data
    group.userData.pickupAnimation = { baseY: state.position.y, time: 0 };

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: 0 },
      currentState: { position: { ...state.position }, rotation: 0 },
    });
  }

  // ============================================================================
  // Entity Updates
  // ============================================================================

  updatePlayer(state: PlayerState): void {
    this.updateEntityState(state.id, state.position, state.rotation);
  }

  updateEnemy(state: EnemyState): void {
    this.updateEntityState(state.id, state.position, state.rotation);
  }

  updateProjectile(state: ProjectileState): void {
    this.updateEntityState(state.id, state.position, state.rotation);
  }

  private updateEntityState(id: string, position: Vec3, rotation: number): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    entity.prevState = { ...entity.currentState };
    entity.currentState = { position: { ...position }, rotation };
  }

  removeEntity(id: string): void {
    const entity = this.entities.get(id);
    if (entity) {
      this.renderer.removeFromScene(entity.mesh);
      this.entities.delete(id);
    }
  }

  // ============================================================================
  // Interpolation & Visual Updates
  // ============================================================================

  updateVisuals(alpha: number): void {
    for (const [, entity] of this.entities) {
      // Interpolate position
      const pos = lerpVec3(entity.prevState.position, entity.currentState.position, alpha);
      entity.mesh.position.set(pos.x, pos.y, pos.z);

      // Interpolate rotation
      const rot = lerpAngle(entity.prevState.rotation, entity.currentState.rotation, alpha);
      entity.mesh.rotation.y = rot;

      // Pickup bobbing animation
      if (entity.mesh.userData.pickupAnimation) {
        const anim = entity.mesh.userData.pickupAnimation;
        anim.time += 0.05;
        entity.mesh.position.y = anim.baseY + Math.sin(anim.time) * 0.2;
        entity.mesh.rotation.y += 0.02;
      }
    }
  }

  getLocalPlayerPosition(): Vec3 | null {
    if (!this.localPlayerId) return null;
    const entity = this.entities.get(this.localPlayerId);
    return entity?.currentState.position ?? null;
  }

  // ============================================================================
  // Multiplayer State Synchronization
  // ============================================================================

  applyServerState(state: SerializedGameState): void {
    // Add to buffer for interpolation
    this.stateBuffer.push({ timestamp: state.timestamp, state });

    // Keep buffer limited
    if (this.stateBuffer.length > 32) {
      this.stateBuffer.shift();
    }

    // Get interpolated state
    const renderTime = Date.now() - CLIENT_RENDER_DELAY;
    const interpolated = this.getInterpolatedState(renderTime);
    if (!interpolated) return;

    // Sync players
    const currentPlayerIds = new Set(interpolated.players.map(([id]) => id));
    for (const [id, playerState] of interpolated.players) {
      if (!this.entities.has(id)) {
        this.createPlayer(playerState);
      } else {
        this.updatePlayer(playerState);
      }
    }

    // Remove disconnected players
    for (const [id, entity] of this.entities) {
      if (entity.mesh.userData.entityType === 'player' && !currentPlayerIds.has(id)) {
        this.removeEntity(id);
      }
    }

    // Sync enemies
    const currentEnemyIds = new Set(interpolated.enemies.map(([id]) => id));
    for (const [id, enemyState] of interpolated.enemies) {
      if (!this.entities.has(id)) {
        this.createEnemy(enemyState);
      } else {
        this.updateEnemy(enemyState);
      }
    }

    // Remove dead enemies
    for (const [id] of this.entities) {
      if (id.startsWith('enemy-') && !currentEnemyIds.has(id)) {
        this.removeEntity(id);
      }
    }

    // Sync projectiles
    for (const [id, projState] of interpolated.projectiles) {
      if (!this.entities.has(id)) {
        this.createProjectile(projState);
      } else {
        this.updateProjectile(projState);
      }
    }

    // Sync pickups
    for (const [id, pickupState] of interpolated.pickups) {
      if (!this.entities.has(id)) {
        this.createPickup(pickupState);
      }
    }
  }

  private getInterpolatedState(renderTime: number): SerializedGameState | null {
    if (this.stateBuffer.length < 2) {
      return this.stateBuffer[0]?.state ?? null;
    }

    // Find two states to interpolate between
    let before: (typeof this.stateBuffer)[0] | null = null;
    let after: (typeof this.stateBuffer)[0] | null = null;

    for (let i = 0; i < this.stateBuffer.length - 1; i++) {
      if (
        this.stateBuffer[i].timestamp <= renderTime &&
        this.stateBuffer[i + 1].timestamp >= renderTime
      ) {
        before = this.stateBuffer[i];
        after = this.stateBuffer[i + 1];
        break;
      }
    }

    if (!before || !after) {
      return this.stateBuffer[this.stateBuffer.length - 1].state;
    }

    // For now, just return the "before" state
    // Full interpolation would interpolate each entity position
    return before.state;
  }
}
