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
import { EntityFactory } from './EntityFactory';

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
  private factory: EntityFactory;
  private entities: Map<string, EntityVisual> = new Map();
  public localPlayerId: string | null = null;

  // Afterimage system for dash
  private afterimages: { mesh: THREE.Group; lifetime: number }[] = [];

  // Enemy state tracking for speech bubble animation
  private enemyStates: Map<string, EnemyState> = new Map();

  // Damage visual state tracking
  private enemyDamageStates: Map<string, {
    flashTime: number;       // Time remaining for white flash
    staggerOffset: { x: number; z: number };  // Current shake offset
    staggerTime: number;     // Time remaining for shake
    lastHealth: number;      // Track health for showing damage
  }> = new Map();

  // Player recoil state
  private playerRecoil = {
    offset: 0,      // Current backward offset
    tilt: 0,        // Current tilt angle
    recovery: 0.15, // How fast recoil recovers
  };

  // Reusable muzzle flash light (avoid creating new lights every shot)
  private muzzleFlashLight: THREE.PointLight | null = null;
  private muzzleFlashIntensity = 0;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.factory = new EntityFactory(renderer);
  }

  setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  // ============================================================================
  // Entity Creation (delegated to EntityFactory)
  // ============================================================================

  createPlayer(state: PlayerState): void {
    const group = this.factory.createPlayer(state);

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createEnemy(state: EnemyState): void {
    const group = this.factory.createEnemy(state);

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createProjectile(state: ProjectileState): void {
    const group = this.factory.createProjectile(state);

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createPickup(state: PickupState): void {
    const group = this.factory.createPickup(state);

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

    // Update carrying indicator visibility
    const entity = this.entities.get(state.id);
    if (entity) {
      const indicator = entity.mesh.getObjectByName('carryIndicator');
      if (indicator) {
        indicator.visible = state.carryingCellId !== null;

        // Animate the indicator (rotate and bob)
        if (indicator.visible) {
          const time = performance.now() * 0.001;
          const miniCore = indicator.getObjectByName('miniCore');
          const miniGlow = indicator.getObjectByName('miniGlow');
          if (miniCore && miniGlow) {
            miniCore.rotation.y = time * 2;
            miniGlow.rotation.y = -time * 1.5;
            indicator.position.y = 1.8 + Math.sin(time * 3) * 0.1;
          }
        }
      }
    }
  }

  updateEnemy(state: EnemyState): void {
    this.updateEntityState(state.id, state.position, state.rotation);
  }

  updateProjectile(state: ProjectileState): void {
    this.updateEntityState(state.id, state.position, state.rotation);
    // Laser shader handles the visual trail effect
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
    this.enemyDamageStates.delete(id);
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

  // Trigger damage visual effects on enemy
  damageEnemy(id: string, health: number, maxHealth: number): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    // Initialize or update damage state
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

    // Immediate white flash on all materials
    entity.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name !== 'speechBubble' && child.name !== 'healthBar') {
        const mat = child.material as THREE.MeshLambertMaterial;
        if (mat.emissive) {
          mat.emissive.setRGB(1, 1, 1);
        }
      }
    });

    // Update health bar visibility and scale
    const healthBar = entity.mesh.getObjectByName('healthBar');
    if (healthBar) {
      const healthPercent = Math.max(0, health / maxHealth);

      // Show health bar when damaged
      const bg = healthBar.getObjectByName('healthBarBg') as THREE.Mesh;
      const fg = healthBar.getObjectByName('healthBarFg') as THREE.Mesh;

      if (bg && fg) {
        // Fade in health bar
        (bg.material as THREE.MeshBasicMaterial).opacity = 0.8;
        (fg.material as THREE.MeshBasicMaterial).opacity = 0.9;

        // Scale foreground to show health remaining
        fg.scale.x = healthPercent;
        fg.position.x = -(1 - healthPercent) * 0.4; // Offset to left

        // Color gradient: green -> yellow -> red
        const fgMat = fg.material as THREE.MeshBasicMaterial;
        if (healthPercent > 0.5) {
          fgMat.color.setRGB(1 - (healthPercent - 0.5) * 2, 1, 0);
        } else {
          fgMat.color.setRGB(1, healthPercent * 2, 0);
        }
      }
    }
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

      // Player updates: muzzle flash fade and recoil
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

        // Fade muzzle flash light
        if (this.muzzleFlashLight && this.muzzleFlashIntensity > 0.01) {
          this.muzzleFlashIntensity *= 0.7;
          this.muzzleFlashLight.intensity = this.muzzleFlashIntensity;
        }

        // Apply recoil animation - use scale pulse instead of position offset
        if (this.playerRecoil.offset > 0.01 || this.playerRecoil.tilt > 0.01) {
          // Squash and stretch effect for recoil
          const recoilScale = 1 - this.playerRecoil.offset * 0.3;
          const stretchScale = 1 + this.playerRecoil.offset * 0.15;

          // Apply squash (compress in Z, stretch in Y)
          entity.mesh.scale.set(stretchScale, stretchScale, recoilScale);

          // Apply tilt (pitch back slightly)
          entity.mesh.rotation.x = -this.playerRecoil.tilt;

          // Recover from recoil
          this.playerRecoil.offset *= (1 - this.playerRecoil.recovery);
          this.playerRecoil.tilt *= (1 - this.playerRecoil.recovery);
        } else {
          // Reset scale and rotation when recoil is done
          entity.mesh.scale.set(1, 1, 1);
          entity.mesh.rotation.x = 0;
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

        // Damage flash and stagger effects
        const damageState = this.enemyDamageStates.get(id);
        const enemyState = this.enemyStates.get(id);

        if (damageState) {
          const dt = 16; // Approximate frame time in ms

          // Update flash timer
          if (damageState.flashTime > 0) {
            damageState.flashTime -= dt;
            const flashIntensity = damageState.flashTime / 150;

            // Flash from white to red to normal
            entity.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh &&
                  !child.name.includes('healthBar') &&
                  child.name !== 'speechBubble') {
                const mat = child.material as THREE.MeshLambertMaterial;
                if (mat.emissive) {
                  // White -> red fade
                  mat.emissive.setRGB(flashIntensity, flashIntensity * 0.3, flashIntensity * 0.3);
                }
              }
            });
          } else if (enemyState?.state === 'attacking') {
            // Attack telegraph - red glow when attacking
            entity.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh &&
                  !child.name.includes('healthBar') &&
                  child.name !== 'speechBubble') {
                const mat = child.material as THREE.MeshLambertMaterial;
                if (mat.emissive) {
                  const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
                  mat.emissive.setRGB(pulse * 0.5, 0, 0);
                }
              }
            });
          } else {
            // Reset emissive
            entity.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh &&
                  !child.name.includes('healthBar') &&
                  child.name !== 'speechBubble') {
                const mat = child.material as THREE.MeshLambertMaterial;
                if (mat.emissive) {
                  mat.emissive.setRGB(0, 0, 0);
                }
              }
            });
          }

          // Update stagger shake
          if (damageState.staggerTime > 0) {
            damageState.staggerTime -= dt;
            // Random shake that decays
            const shakeIntensity = (damageState.staggerTime / 200) * 0.15;
            damageState.staggerOffset.x = (Math.random() - 0.5) * shakeIntensity;
            damageState.staggerOffset.z = (Math.random() - 0.5) * shakeIntensity;
          } else {
            // Reset shake offset
            damageState.staggerOffset.x = 0;
            damageState.staggerOffset.z = 0;
          }

          // Apply stagger offset to model (not to tracked position)
          // This is purely visual shake
          entity.mesh.children.forEach(child => {
            if (child.name !== 'healthBar' && child.name !== 'speechBubble') {
              child.position.x = damageState.staggerOffset.x;
              child.position.z = damageState.staggerOffset.z;
            }
          });
        } else if (enemyState?.state === 'attacking') {
          // Attack telegraph - red glow when attacking (no damage state yet)
          entity.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh &&
                !child.name.includes('healthBar') &&
                child.name !== 'speechBubble') {
              const mat = child.material as THREE.MeshLambertMaterial;
              if (mat.emissive) {
                const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
                mat.emissive.setRGB(pulse * 0.5, 0, 0);
              }
            }
          });
        }

        // Health bar billboard - face camera
        const healthBar = entity.mesh.getObjectByName('healthBar');
        if (healthBar) {
          healthBar.quaternion.copy(this.renderer.camera.quaternion);
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

    // Trigger recoil animation
    this.playerRecoil.offset = 0.25;
    this.playerRecoil.tilt = 0.08;

    // Reuse single muzzle flash light (no new allocations!)
    if (!this.muzzleFlashLight) {
      this.muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 8);
      this.renderer.addToScene(this.muzzleFlashLight);
    }

    // Position at gun tip
    this.muzzleFlashLight.position.copy(entity.mesh.position);
    this.muzzleFlashLight.position.y += 0.5;
    const forward = new THREE.Vector3(0, 0, 0.8);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), entity.mesh.rotation.y);
    this.muzzleFlashLight.position.add(forward);

    // Reset intensity (will fade in updateVisuals)
    this.muzzleFlashIntensity = 4;
    this.muzzleFlashLight.intensity = this.muzzleFlashIntensity;
  }

  // ============================================================================
  // Afterimage System for Dash
  // ============================================================================

  spawnAfterimage(playerId: string, position: Vec3): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;

    const ghostGroup = this.factory.createAfterimage(position, entity.mesh.rotation.y);

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
