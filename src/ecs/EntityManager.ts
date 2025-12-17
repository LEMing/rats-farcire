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
import { COLORS } from '@shared/constants';

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
    group.userData.entityType = 'player';

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
    group.userData.entityType = 'enemy';

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
    group.userData.entityType = 'projectile';

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

    // Store pickup animation data and entity type
    group.userData.pickupAnimation = { baseY: state.position.y, time: 0 };
    group.userData.entityType = 'pickup';

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
    // Collect all current server entity IDs by type
    const serverPlayerIds = new Set(state.players.map(([id]) => id));
    const serverEnemyIds = new Set(state.enemies.map(([id]) => id));
    const serverProjectileIds = new Set(state.projectiles.map(([id]) => id));
    const serverPickupIds = new Set(state.pickups.map(([id]) => id));

    // Sync players
    for (const [id, playerState] of state.players) {
      if (!this.entities.has(id)) {
        this.createPlayer(playerState);
      } else {
        this.updatePlayer(playerState);
      }
    }

    // Sync enemies
    for (const [id, enemyState] of state.enemies) {
      if (!this.entities.has(id)) {
        this.createEnemy(enemyState);
      } else {
        this.updateEnemy(enemyState);
      }
    }

    // Sync projectiles
    for (const [id, projState] of state.projectiles) {
      if (!this.entities.has(id)) {
        this.createProjectile(projState);
      } else {
        this.updateProjectile(projState);
      }
    }

    // Sync pickups
    for (const [id, pickupState] of state.pickups) {
      if (!this.entities.has(id)) {
        this.createPickup(pickupState);
      }
    }

    // Remove entities that no longer exist on server
    const toRemove: string[] = [];
    for (const [id, entity] of this.entities) {
      const type = entity.mesh.userData.entityType;
      let shouldRemove = false;

      switch (type) {
        case 'player':
          shouldRemove = !serverPlayerIds.has(id);
          break;
        case 'enemy':
          shouldRemove = !serverEnemyIds.has(id);
          break;
        case 'projectile':
          shouldRemove = !serverProjectileIds.has(id);
          break;
        case 'pickup':
          shouldRemove = !serverPickupIds.has(id);
          break;
      }

      if (shouldRemove) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeEntity(id);
    }
  }
}
