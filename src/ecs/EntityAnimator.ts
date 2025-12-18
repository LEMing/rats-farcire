import * as THREE from 'three';
import type { EnemyState, Vec3 } from '@shared/types';
import { lerpVec3, lerpAngle } from '@shared/utils';

/**
 * EntityAnimator - Handles all visual animations for game entities
 *
 * Extracted from EntityManager to follow Single Responsibility Principle.
 * This class handles interpolation, damage effects, recoil, and other animations.
 */

export interface EntityVisual {
  mesh: THREE.Group;
  prevState: { position: Vec3; rotation: number };
  currentState: { position: Vec3; rotation: number };
}

export interface DamageState {
  flashTime: number;
  staggerOffset: { x: number; z: number };
  staggerTime: number;
  lastHealth: number;
}

export interface SceneProvider {
  addToScene(object: THREE.Object3D): void;
  removeFromScene(object: THREE.Object3D): void;
  camera: THREE.Camera;
}

// Cached mesh with emissive material for efficient per-frame updates
interface CachedEmissiveMesh {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
}

export class EntityAnimator {
  private sceneProvider: SceneProvider;

  // Enemy state tracking for speech bubble animation
  private enemyStates: Map<string, EnemyState> = new Map();

  // Damage visual state tracking
  private enemyDamageStates: Map<string, DamageState> = new Map();

  // Cached emissive meshes per entity to avoid traverse() every frame
  private entityEmissiveMeshes: Map<string, CachedEmissiveMesh[]> = new Map();

  // Player recoil state
  private playerRecoil = {
    offset: 0,
    tilt: 0,
    recovery: 0.15,
  };

  // Reusable muzzle flash light
  private muzzleFlashLight: THREE.PointLight | null = null;
  private muzzleFlashIntensity = 0;

  // Afterimage system
  private afterimages: { mesh: THREE.Group; lifetime: number }[] = [];

  constructor(sceneProvider: SceneProvider) {
    this.sceneProvider = sceneProvider;
  }

  // ============================================================================
  // State Management
  // ============================================================================

  updateEnemyState(state: EnemyState): void {
    this.enemyStates.set(state.id, state);
  }

  cleanupEntity(id: string): void {
    this.enemyStates.delete(id);
    this.enemyDamageStates.delete(id);
    this.entityEmissiveMeshes.delete(id);
  }

  /**
   * Cache emissive meshes for an entity to avoid traverse() every frame
   */
  private cacheEmissiveMeshes(id: string, entity: EntityVisual): CachedEmissiveMesh[] {
    let cached = this.entityEmissiveMeshes.get(id);
    if (cached) return cached;

    cached = [];
    entity.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh &&
          !child.name.includes('healthBar') &&
          child.name !== 'speechBubble') {
        const mat = child.material as THREE.MeshLambertMaterial;
        if (mat.emissive) {
          cached!.push({ mesh: child, material: mat });
        }
      }
    });
    this.entityEmissiveMeshes.set(id, cached);
    return cached;
  }

  // ============================================================================
  // Damage Effects
  // ============================================================================

  triggerDamageEffects(id: string, entity: EntityVisual, health: number, maxHealth: number): void {
    let damageState = this.enemyDamageStates.get(id);
    if (!damageState) {
      damageState = {
        flashTime: 0,
        staggerOffset: { x: 0, z: 0 },
        staggerTime: 0,
        lastHealth: maxHealth,
      };
      this.enemyDamageStates.set(id, damageState);
    }

    // Trigger flash (150ms)
    damageState.flashTime = 150;

    // Trigger stagger/shake (200ms)
    damageState.staggerTime = 200;

    // Store health
    damageState.lastHealth = health;

    // Immediate white flash on all materials (using cached meshes)
    const emissiveMeshes = this.cacheEmissiveMeshes(id, entity);
    for (const { material } of emissiveMeshes) {
      material.emissive.setRGB(1, 1, 1);
    }

    // Update health bar
    this.updateHealthBar(entity.mesh, health, maxHealth);
  }

  private updateHealthBar(mesh: THREE.Group, health: number, maxHealth: number): void {
    const healthBar = mesh.getObjectByName('healthBar');
    if (!healthBar) return;

    const healthPercent = Math.max(0, health / maxHealth);
    const bg = healthBar.getObjectByName('healthBarBg') as THREE.Mesh;
    const fg = healthBar.getObjectByName('healthBarFg') as THREE.Mesh;

    if (bg && fg) {
      (bg.material as THREE.MeshBasicMaterial).opacity = 0.8;
      (fg.material as THREE.MeshBasicMaterial).opacity = 0.9;

      fg.scale.x = healthPercent;
      fg.position.x = -(1 - healthPercent) * 0.4;

      const fgMat = fg.material as THREE.MeshBasicMaterial;
      if (healthPercent > 0.5) {
        fgMat.color.setRGB(1 - (healthPercent - 0.5) * 2, 1, 0);
      } else {
        fgMat.color.setRGB(1, healthPercent * 2, 0);
      }
    }
  }

  // ============================================================================
  // Death Animation
  // ============================================================================

  fadeOutEnemy(entity: EntityVisual, duration: number): void {
    const startTime = performance.now();

    const fade = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      entity.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.Material;
          if ('opacity' in mat) {
            mat.transparent = true;
            (mat as THREE.MeshBasicMaterial).opacity = 1 - progress;
          }
        }
      });

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
  // Muzzle Flash
  // ============================================================================

  triggerMuzzleFlash(entity: EntityVisual): void {
    const flash = entity.mesh.getObjectByName('muzzleFlash') as THREE.Mesh;
    if (flash) {
      const mat = flash.material as THREE.MeshBasicMaterial;
      mat.opacity = 1;
      flash.scale.setScalar(0.8 + Math.random() * 0.4);
      flash.rotation.z = Math.random() * Math.PI * 2;
    }

    // Trigger recoil
    this.playerRecoil.offset = 0.25;
    this.playerRecoil.tilt = 0.08;

    // Muzzle flash light
    if (!this.muzzleFlashLight) {
      this.muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 8);
      this.sceneProvider.addToScene(this.muzzleFlashLight);
    }

    this.muzzleFlashLight.position.copy(entity.mesh.position);
    this.muzzleFlashLight.position.y += 0.5;
    const forward = new THREE.Vector3(0, 0, 0.8);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), entity.mesh.rotation.y);
    this.muzzleFlashLight.position.add(forward);

    this.muzzleFlashIntensity = 4;
    this.muzzleFlashLight.intensity = this.muzzleFlashIntensity;
  }

  // ============================================================================
  // Afterimage System
  // ============================================================================

  addAfterimage(mesh: THREE.Group): void {
    this.sceneProvider.addToScene(mesh);
    this.afterimages.push({ mesh, lifetime: 0.2 });
  }

  private updateAfterimages(): void {
    const dt = 0.016;

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const ai = this.afterimages[i];
      ai.lifetime -= dt;

      if (ai.lifetime <= 0) {
        this.sceneProvider.removeFromScene(ai.mesh);
        this.afterimages.splice(i, 1);
        continue;
      }

      ai.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshBasicMaterial;
          mat.opacity = (ai.lifetime / 0.2) * 0.5;
        }
      });
    }
  }

  // ============================================================================
  // Main Visual Update Loop
  // ============================================================================

  updateVisuals(entities: Map<string, EntityVisual>, alpha: number): void {
    for (const [id, entity] of entities) {
      // Interpolate position
      const pos = lerpVec3(entity.prevState.position, entity.currentState.position, alpha);
      entity.mesh.position.set(pos.x, pos.y, pos.z);

      // Interpolate rotation
      const rot = lerpAngle(entity.prevState.rotation, entity.currentState.rotation, alpha);
      entity.mesh.rotation.y = rot;

      // Type-specific animations
      const entityType = entity.mesh.userData.entityType;

      if (entity.mesh.userData.pickupAnimation) {
        this.animatePickup(entity);
      }

      if (entityType === 'player') {
        this.animatePlayer(entity);
      }

      if (entityType === 'enemy') {
        this.animateEnemy(id, entity);
      }
    }

    this.updateAfterimages();
  }

  private animatePickup(entity: EntityVisual): void {
    const anim = entity.mesh.userData.pickupAnimation;
    anim.time += 0.05;
    entity.mesh.position.y = anim.baseY + Math.sin(anim.time) * 0.2;
    entity.mesh.rotation.y += 0.02;

    if (entity.mesh.userData.isPowerUp) {
      const glow = entity.mesh.getObjectByName('powerupGlow') as THREE.Mesh;
      if (glow) {
        const pulse = Math.sin(anim.time * 2) * 0.15 + 0.35;
        (glow.material as THREE.MeshBasicMaterial).opacity = pulse;
        glow.scale.setScalar(1 + Math.sin(anim.time * 1.5) * 0.15);
      }
    }
  }

  private animatePlayer(entity: EntityVisual): void {
    // Muzzle flash fade
    const flash = entity.mesh.getObjectByName('muzzleFlash') as THREE.Mesh;
    if (flash) {
      const mat = flash.material as THREE.MeshBasicMaterial;
      if (mat.opacity > 0.01) {
        mat.opacity *= 0.7;
      }
      flash.quaternion.copy(this.sceneProvider.camera.quaternion);
    }

    // Muzzle flash light fade
    if (this.muzzleFlashLight && this.muzzleFlashIntensity > 0.01) {
      this.muzzleFlashIntensity *= 0.7;
      this.muzzleFlashLight.intensity = this.muzzleFlashIntensity;
    }

    // Recoil animation
    if (this.playerRecoil.offset > 0.01 || this.playerRecoil.tilt > 0.01) {
      const recoilScale = 1 - this.playerRecoil.offset * 0.3;
      const stretchScale = 1 + this.playerRecoil.offset * 0.15;

      entity.mesh.scale.set(stretchScale, stretchScale, recoilScale);
      entity.mesh.rotation.x = -this.playerRecoil.tilt;

      this.playerRecoil.offset *= (1 - this.playerRecoil.recovery);
      this.playerRecoil.tilt *= (1 - this.playerRecoil.recovery);
    } else {
      entity.mesh.scale.set(1, 1, 1);
      entity.mesh.rotation.x = 0;
    }
  }

  private animateEnemy(id: string, entity: EntityVisual): void {
    this.animateSpeechBubble(id, entity);
    this.animateDamageEffects(id, entity);
    this.animateHealthBarBillboard(entity);
  }

  private animateSpeechBubble(id: string, entity: EntityVisual): void {
    const bubbleGroup = entity.mesh.getObjectByName('speechBubble');
    if (!bubbleGroup) return;

    const enemyState = this.enemyStates.get(id);
    const state = enemyState?.state ?? 'idle';

    bubbleGroup.userData.pulseTime += 0.08;
    const t = bubbleGroup.userData.pulseTime;

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
      bubbleColor = 0xffcccc;
    }

    const scale = baseScale + Math.sin(t * pulseSpeed) * pulseAmount;
    bubbleGroup.scale.setScalar(scale);

    const bubble = bubbleGroup.children[0] as THREE.Mesh;
    if (bubble) {
      (bubble.material as THREE.MeshBasicMaterial).color.setHex(bubbleColor);
    }

    bubbleGroup.quaternion.copy(this.sceneProvider.camera.quaternion);
  }

  private animateDamageEffects(id: string, entity: EntityVisual): void {
    const damageState = this.enemyDamageStates.get(id);
    const enemyState = this.enemyStates.get(id);
    const dt = 16;

    if (damageState) {
      // Flash effect (using cached meshes for performance)
      if (damageState.flashTime > 0) {
        damageState.flashTime -= dt;
        const flashIntensity = damageState.flashTime / 150;

        const emissiveMeshes = this.cacheEmissiveMeshes(id, entity);
        for (const { material } of emissiveMeshes) {
          material.emissive.setRGB(flashIntensity, flashIntensity * 0.3, flashIntensity * 0.3);
        }
      } else if (enemyState?.state === 'attacking') {
        this.applyAttackGlow(id, entity);
      } else {
        this.resetEmissive(id, entity);
      }

      // Stagger shake
      if (damageState.staggerTime > 0) {
        damageState.staggerTime -= dt;
        const shakeIntensity = (damageState.staggerTime / 200) * 0.15;
        damageState.staggerOffset.x = (Math.random() - 0.5) * shakeIntensity;
        damageState.staggerOffset.z = (Math.random() - 0.5) * shakeIntensity;
      } else {
        damageState.staggerOffset.x = 0;
        damageState.staggerOffset.z = 0;
      }

      // Apply stagger offset
      entity.mesh.children.forEach(child => {
        if (child.name !== 'healthBar' && child.name !== 'speechBubble') {
          child.position.x = damageState.staggerOffset.x;
          child.position.z = damageState.staggerOffset.z;
        }
      });
    } else if (enemyState?.state === 'attacking') {
      this.applyAttackGlow(id, entity);
    }
  }

  private applyAttackGlow(id: string, entity: EntityVisual): void {
    const emissiveMeshes = this.cacheEmissiveMeshes(id, entity);
    const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
    for (const { material } of emissiveMeshes) {
      material.emissive.setRGB(pulse * 0.5, 0, 0);
    }
  }

  private resetEmissive(id: string, entity: EntityVisual): void {
    const emissiveMeshes = this.cacheEmissiveMeshes(id, entity);
    for (const { material } of emissiveMeshes) {
      material.emissive.setRGB(0, 0, 0);
    }
  }

  private animateHealthBarBillboard(entity: EntityVisual): void {
    const healthBar = entity.mesh.getObjectByName('healthBar');
    if (healthBar) {
      healthBar.quaternion.copy(this.sceneProvider.camera.quaternion);
    }
  }
}
