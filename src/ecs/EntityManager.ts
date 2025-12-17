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
import { COLORS, POWERUP_CONFIGS } from '@shared/constants';
import { BlurredEmblemMaterial } from '../rendering/BlurredEmblemMaterial';

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

  // Afterimage system for dash
  private afterimages: { mesh: THREE.Group; lifetime: number }[] = [];

  // Projectile trail system
  private projectileTrails: Map<string, THREE.Vector3[]> = new Map();
  private trailLines: Map<string, THREE.Line> = new Map();

  // Enemy state tracking for speech bubble animation
  private enemyStates: Map<string, EnemyState> = new Map();

  // Shared speech bubble geometry/material
  private bubbleGeometry!: THREE.PlaneGeometry;
  private bubbleMaterial!: THREE.MeshBasicMaterial;
  private emblemGeometry!: THREE.PlaneGeometry;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.initSpeechBubbleAssets();
  }

  private initSpeechBubbleAssets(): void {
    // Shared geometry for all speech bubbles
    this.bubbleGeometry = new THREE.PlaneGeometry(0.7, 0.5);
    this.bubbleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.emblemGeometry = new THREE.PlaneGeometry(0.3, 0.3);
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

    // Muzzle flash (initially invisible)
    const flashGeom = new THREE.PlaneGeometry(0.5, 0.5);
    const flashMat = new THREE.MeshBasicMaterial({
      color: COLORS.muzzleFlash,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const flash = new THREE.Mesh(flashGeom, flashMat);
    flash.name = 'muzzleFlash';
    flash.position.set(0, 0.1, 0.7);
    group.add(flash);

    // Targeting laser
    const laserPoints = [
      new THREE.Vector3(0, 0.1, 0.5),
      new THREE.Vector3(0, 0.1, 15), // 15 units range
    ];
    const laserGeom = new THREE.BufferGeometry().setFromPoints(laserPoints);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.6,
    });
    const laser = new THREE.Line(laserGeom, laserMat);
    laser.name = 'targetingLaser';
    group.add(laser);

    // Laser dot at end
    const dotGeom = new THREE.CircleGeometry(0.15, 8);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8,
    });
    const dot = new THREE.Mesh(dotGeom, dotMat);
    dot.name = 'laserDot';
    dot.position.set(0, 0.05, 15);
    dot.rotation.x = -Math.PI / 2;
    group.add(dot);

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

    // Speech bubble with cult symbol (thought bubble effect)
    const bubbleGroup = new THREE.Group();
    bubbleGroup.name = 'speechBubble';

    // White bubble background
    const bubble = new THREE.Mesh(
      this.bubbleGeometry,
      this.bubbleMaterial.clone() // Clone so each can have independent color
    );
    bubbleGroup.add(bubble);

    // Blurred meatball emblem inside
    const bubbleEmblemMat = BlurredEmblemMaterial.create();
    const bubbleEmblem = new THREE.Mesh(this.emblemGeometry, bubbleEmblemMat);
    bubbleEmblem.position.z = 0.01;
    bubbleGroup.add(bubbleEmblem);

    // Small tail/pointer
    const tailGeom = new THREE.ConeGeometry(0.1, 0.15, 3);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const tail = new THREE.Mesh(tailGeom, tailMat);
    tail.position.set(0, -0.3, 0);
    tail.rotation.z = Math.PI;
    bubbleGroup.add(tail);

    bubbleGroup.position.set(0, 1.4, 0);
    bubbleGroup.userData.pulseTime = Math.random() * Math.PI * 2;
    bubbleGroup.userData.baseScale = 0.6;
    group.add(bubbleGroup);

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = state.rotation;
    group.userData.entityType = 'enemy';
    group.userData.enemyId = state.id;

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

    // Initialize projectile trail
    this.projectileTrails.set(state.id, [new THREE.Vector3(state.position.x, state.position.y, state.position.z)]);

    // Create trail line
    const trailGeom = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xffee88,
      transparent: true,
      opacity: 0.6,
    });
    const trailLine = new THREE.Line(trailGeom, trailMat);
    trailLine.frustumCulled = false;
    this.renderer.addToScene(trailLine);
    this.trailLines.set(state.id, trailLine);
  }

  createPickup(state: PickupState): void {
    const group = new THREE.Group();

    const geom = this.renderer.getGeometry('pickup')!;
    let mat: THREE.Material;
    let glowColor: number | null = null;

    if (state.pickupType === 'powerup' && state.powerUpType) {
      // Power-up pickup with special color and glow
      const config = POWERUP_CONFIGS[state.powerUpType];
      mat = new THREE.MeshLambertMaterial({
        color: config.color,
        emissive: config.color,
        emissiveIntensity: 0.3,
      });
      glowColor = config.color;
    } else if (state.pickupType === 'health') {
      mat = this.renderer.getMaterial('health')!;
    } else {
      mat = this.renderer.getMaterial('ammo')!;
    }

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    group.add(mesh);

    // Add glow effect for power-ups
    if (glowColor !== null) {
      const glowGeom = new THREE.SphereGeometry(0.6, 8, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.3,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.name = 'powerupGlow';
      group.add(glow);
    }

    group.position.set(state.position.x, state.position.y, state.position.z);

    // Store pickup animation data and entity type
    group.userData.pickupAnimation = { baseY: state.position.y, time: 0 };
    group.userData.entityType = 'pickup';
    group.userData.isPowerUp = state.pickupType === 'powerup';

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

    // Update projectile trail
    const trail = this.projectileTrails.get(state.id);
    const trailLine = this.trailLines.get(state.id);
    if (trail && trailLine) {
      // Add current position to trail
      trail.push(new THREE.Vector3(state.position.x, state.position.y, state.position.z));

      // Keep trail limited to last 8 positions
      if (trail.length > 8) {
        trail.shift();
      }

      // Update trail geometry
      trailLine.geometry.setFromPoints(trail);
    }
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
    // Also clean up enemy state tracking
    this.enemyStates.delete(id);

    // Clean up projectile trail
    const trailLine = this.trailLines.get(id);
    if (trailLine) {
      this.renderer.removeFromScene(trailLine);
      trailLine.geometry.dispose();
      (trailLine.material as THREE.Material).dispose();
      this.trailLines.delete(id);
    }
    this.projectileTrails.delete(id);
  }

  // Fade out an enemy over time (death animation)
  fadeOutEnemy(id: string, duration: number): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    const startTime = performance.now();

    const fade = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Fade opacity and sink into ground
      entity.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.Material;
          if ('opacity' in mat) {
            mat.transparent = true;
            (mat as THREE.MeshBasicMaterial).opacity = 1 - progress;
          }
        }
      });

      // Sink and rotate
      entity.mesh.position.y -= 0.02;
      entity.mesh.rotation.x += 0.02;
      entity.mesh.scale.setScalar(1 - progress * 0.3);

      if (progress < 1) {
        requestAnimationFrame(fade);
      }
    };

    requestAnimationFrame(fade);
  }

  // ============================================================================
  // Interpolation & Visual Updates
  // ============================================================================

  updateVisuals(alpha: number): void {
    for (const [id, entity] of this.entities) {
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

        // Pulsing glow for power-ups
        if (entity.mesh.userData.isPowerUp) {
          const glow = entity.mesh.getObjectByName('powerupGlow') as THREE.Mesh;
          if (glow) {
            const pulse = Math.sin(anim.time * 2) * 0.15 + 0.35;
            (glow.material as THREE.MeshBasicMaterial).opacity = pulse;
            glow.scale.setScalar(1 + Math.sin(anim.time * 1.5) * 0.15);
          }
        }
      }

      // Muzzle flash fade
      if (entity.mesh.userData.entityType === 'player') {
        const flash = entity.mesh.getObjectByName('muzzleFlash') as THREE.Mesh;
        if (flash) {
          const mat = flash.material as THREE.MeshBasicMaterial;
          if (mat.opacity > 0.01) {
            mat.opacity *= 0.7;
          }
          // Billboard flash to camera
          flash.quaternion.copy(this.renderer.camera.quaternion);
        }
      }

      // Speech bubble animation for enemies
      if (entity.mesh.userData.entityType === 'enemy') {
        const bubbleGroup = entity.mesh.getObjectByName('speechBubble');
        if (bubbleGroup) {
          // Get enemy state for behavior-based animation
          const enemyState = this.enemyStates.get(id);
          const state = enemyState?.state ?? 'idle';

          // Update pulse time
          bubbleGroup.userData.pulseTime += 0.08;
          const t = bubbleGroup.userData.pulseTime;

          // State-based animation
          let baseScale = 0.6;
          let pulseSpeed = 1;
          let pulseAmount = 0.08;
          let bubbleColor = 0xffffff;

          if (state === 'chasing') {
            baseScale = 0.8;
            pulseSpeed = 2;
            pulseAmount = 0.1;
          } else if (state === 'attacking') {
            baseScale = 1.0;
            pulseSpeed = 4;
            pulseAmount = 0.15;
            bubbleColor = 0xffcccc; // Reddish when attacking
          }

          // Apply scale with pulse
          const scale = baseScale + Math.sin(t * pulseSpeed) * pulseAmount;
          bubbleGroup.scale.setScalar(scale);

          // Update bubble color
          const bubble = bubbleGroup.children[0] as THREE.Mesh;
          if (bubble) {
            (bubble.material as THREE.MeshBasicMaterial).color.setHex(bubbleColor);
          }

          // Billboard - face camera
          bubbleGroup.quaternion.copy(this.renderer.camera.quaternion);
        }

        // Attack telegraph - red glow when attacking
        const enemyState = this.enemyStates.get(id);
        if (enemyState?.state === 'attacking') {
          // Pulse the enemy red when attacking
          entity.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.name !== 'speechBubble') {
              const mat = child.material as THREE.MeshLambertMaterial;
              if (mat.emissive) {
                const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
                mat.emissive.setRGB(pulse * 0.5, 0, 0);
              }
            }
          });
        } else {
          // Reset emissive when not attacking
          entity.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.name !== 'speechBubble') {
              const mat = child.material as THREE.MeshLambertMaterial;
              if (mat.emissive) {
                mat.emissive.setRGB(0, 0, 0);
              }
            }
          });
        }
      }
    }

    // Update afterimages
    this.updateAfterimages();
  }

  // Update enemy state for speech bubble animation
  updateEnemyState(state: EnemyState): void {
    this.enemyStates.set(state.id, state);
  }

  // ============================================================================
  // Muzzle Flash
  // ============================================================================

  triggerMuzzleFlash(playerId: string): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;

    const flash = entity.mesh.getObjectByName('muzzleFlash') as THREE.Mesh;
    if (flash) {
      const mat = flash.material as THREE.MeshBasicMaterial;
      mat.opacity = 1;
      flash.scale.setScalar(0.8 + Math.random() * 0.4);
      flash.rotation.z = Math.random() * Math.PI * 2;
    }

    // Create temporary point light for muzzle flash
    const light = new THREE.PointLight(0xffaa44, 2, 8);
    light.position.copy(entity.mesh.position);
    light.position.y += 0.5;

    // Offset in firing direction
    const forward = new THREE.Vector3(0, 0, 0.8);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), entity.mesh.rotation.y);
    light.position.add(forward);

    this.renderer.addToScene(light);

    // Fade out light quickly
    let intensity = 2;
    const fadeLight = () => {
      intensity *= 0.7;
      light.intensity = intensity;
      if (intensity > 0.05) {
        requestAnimationFrame(fadeLight);
      } else {
        this.renderer.removeFromScene(light);
        light.dispose();
      }
    };
    requestAnimationFrame(fadeLight);
  }

  // ============================================================================
  // Afterimage System for Dash
  // ============================================================================

  spawnAfterimage(playerId: string, position: Vec3): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;

    // Create a simple ghost mesh
    const ghostGroup = new THREE.Group();

    // Clone simplified player shape
    const bodyGeom = this.renderer.getGeometry('playerBody')!;
    const bodyMat = new THREE.MeshBasicMaterial({
      color: COLORS.dashTrail,
      transparent: true,
      opacity: 0.5,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    ghostGroup.add(body);

    ghostGroup.position.set(position.x, position.y, position.z);
    ghostGroup.rotation.y = entity.mesh.rotation.y;

    this.renderer.addToScene(ghostGroup);
    this.afterimages.push({ mesh: ghostGroup, lifetime: 0.2 });
  }

  private updateAfterimages(): void {
    const dt = 0.016; // Approximate frame time

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const ai = this.afterimages[i];
      ai.lifetime -= dt;

      if (ai.lifetime <= 0) {
        this.renderer.removeFromScene(ai.mesh);
        this.afterimages.splice(i, 1);
        continue;
      }

      // Fade out
      ai.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshBasicMaterial;
          mat.opacity = (ai.lifetime / 0.2) * 0.5;
        }
      });
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
