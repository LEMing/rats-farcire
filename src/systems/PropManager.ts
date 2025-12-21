/**
 * PropManager - Manages physics-enabled props (crates, barrels, debris)
 *
 * Handles:
 * - Spawning props with physics bodies
 * - Syncing physics positions to visual meshes
 * - Collision detection (entities can't walk through props)
 * - Explosion forces on props
 * - Projectile impulses on props
 */

import * as THREE from 'three/webgpu';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { Vec3 } from '@shared/types';

// ============================================================================
// Types
// ============================================================================

export type PropType = 'crate' | 'barrel' | 'crateStack' | 'smallDebris';

export interface PropState {
  id: string;
  type: PropType;
  position: Vec3;
  rotation: { x: number; y: number; z: number; w: number };
  mesh: THREE.Group;
  isDestroyed: boolean;
}

export interface PropConfig {
  crate: { width: number; height: number; depth: number; mass: number };
  barrel: { radius: number; height: number; mass: number };
  crateStack: { width: number; height: number; depth: number; mass: number };
  smallDebris: { size: number; mass: number };
}

const DEFAULT_CONFIG: PropConfig = {
  crate: { width: 0.8, height: 0.8, depth: 0.8, mass: 15 },
  barrel: { radius: 0.35, height: 0.9, mass: 20 },
  crateStack: { width: 1.0, height: 1.5, depth: 1.0, mass: 40 },
  smallDebris: { size: 0.15, mass: 3 },
};

// ============================================================================
// PropManager
// ============================================================================

export class PropManager {
  private props: Map<string, PropState> = new Map();
  private physics: PhysicsManager | null = null;
  private nextPropId = 0;
  private config: PropConfig;

  constructor(config: Partial<PropConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the physics manager for physics-enabled props
   */
  setPhysicsManager(physics: PhysicsManager): void {
    this.physics = physics;

    console.log(`[PropManager] setPhysicsManager called, props in map: ${this.props.size}`);

    // Create physics bodies for existing props
    let attempted = 0;
    let created = 0;
    for (const prop of this.props.values()) {
      if (!prop.isDestroyed) {
        attempted++;
        if (this.createPhysicsBody(prop)) {
          created++;
        }
      }
    }
    console.log(`[PropManager] Physics connected - attempted: ${attempted}, created: ${created} bodies`);
  }

  /**
   * Spawn a crate prop
   */
  spawnCrate(x: number, z: number, mesh: THREE.Group): PropState {
    const id = `prop-crate-${this.nextPropId++}`;
    const config = this.config.crate;

    const prop: PropState = {
      id,
      type: 'crate',
      position: { x, y: config.height / 2, z },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      mesh,
      isDestroyed: false,
    };

    this.props.set(id, prop);
    mesh.userData.propId = id;

    if (this.physics) {
      this.physics.createBoxBody(
        id,
        x,
        config.height / 2,
        z,
        config.width,
        config.height,
        config.depth,
        config.mass
      );
    }

    return prop;
  }

  /**
   * Spawn a barrel prop (wooden, not explosive)
   */
  spawnBarrelProp(x: number, z: number, mesh: THREE.Group, tipped: boolean = false): PropState {
    const id = `prop-barrel-${this.nextPropId++}`;
    const config = this.config.barrel;

    const y = tipped ? config.radius : config.height / 2;

    const prop: PropState = {
      id,
      type: 'barrel',
      position: { x, y, z },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      mesh,
      isDestroyed: false,
    };

    this.props.set(id, prop);
    mesh.userData.propId = id;

    if (this.physics) {
      this.physics.createCylinderBody(
        id,
        x,
        y,
        z,
        config.radius,
        config.height,
        config.mass,
        tipped
      );
    }

    return prop;
  }

  /**
   * Spawn a crate stack prop
   */
  spawnCrateStack(x: number, z: number, mesh: THREE.Group): PropState {
    const id = `prop-stack-${this.nextPropId++}`;
    const config = this.config.crateStack;

    const prop: PropState = {
      id,
      type: 'crateStack',
      position: { x, y: config.height / 2, z },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      mesh,
      isDestroyed: false,
    };

    this.props.set(id, prop);
    mesh.userData.propId = id;

    if (this.physics) {
      this.physics.createBoxBody(
        id,
        x,
        config.height / 2,
        z,
        config.width,
        config.height,
        config.depth,
        config.mass
      );
    }

    return prop;
  }

  /**
   * Create physics body for existing prop
   */
  private createPhysicsBody(prop: PropState): boolean {
    if (!this.physics) {
      console.log(`[PropManager] createPhysicsBody FAILED - no physics for ${prop.id}`);
      return false;
    }

    console.log(`[PropManager] Creating body for ${prop.id} at (${prop.position.x.toFixed(1)}, ${prop.position.z.toFixed(1)})`);

    switch (prop.type) {
      case 'crate': {
        const config = this.config.crate;
        this.physics.createBoxBody(
          prop.id,
          prop.position.x,
          prop.position.y,
          prop.position.z,
          config.width,
          config.height,
          config.depth,
          config.mass
        );
        break;
      }
      case 'barrel': {
        const config = this.config.barrel;
        this.physics.createCylinderBody(
          prop.id,
          prop.position.x,
          prop.position.y,
          prop.position.z,
          config.radius,
          config.height,
          config.mass,
          false
        );
        break;
      }
      case 'crateStack': {
        const config = this.config.crateStack;
        this.physics.createBoxBody(
          prop.id,
          prop.position.x,
          prop.position.y,
          prop.position.z,
          config.width,
          config.height,
          config.depth,
          config.mass
        );
        break;
      }
    }

    // Verify body was created
    const hasBody = this.physics.hasBody(prop.id);
    if (!hasBody) {
      console.log(`[PropManager] WARNING: Body NOT created for ${prop.id}!`);
    }
    return hasBody;
  }

  /**
   * Sync all prop positions from physics simulation
   */
  syncFromPhysics(): void {
    if (!this.physics) return;

    for (const prop of this.props.values()) {
      if (prop.isDestroyed) continue;

      const pos = this.physics.getPosition(prop.id);
      const rot = this.physics.getRotation(prop.id);

      if (pos) {
        prop.position.x = pos.x;
        prop.position.y = pos.y;
        prop.position.z = pos.z;

        prop.mesh.position.set(pos.x, pos.y, pos.z);
      }

      if (rot) {
        prop.rotation = rot;
        prop.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      }
    }
  }

  /**
   * Apply impulse to a prop (e.g., from projectile hit)
   */
  applyImpulse(propId: string, impulse: Vec3): void {
    if (!this.physics) return;
    this.physics.applyImpulse(propId, impulse);
  }

  /**
   * Check if a position collides with any prop
   */
  checkCollision(x: number, z: number, radius: number): PropState | null {
    for (const prop of this.props.values()) {
      if (prop.isDestroyed) continue;

      const dx = x - prop.position.x;
      const dz = z - prop.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Simple radius check (approximation)
      let propRadius = 0.5;
      if (prop.type === 'barrel') propRadius = this.config.barrel.radius;
      else if (prop.type === 'crate') propRadius = this.config.crate.width / 2;
      else if (prop.type === 'crateStack') propRadius = this.config.crateStack.width / 2;

      if (dist < radius + propRadius) {
        return prop;
      }
    }
    return null;
  }

  private resolveLogCounter = 0;

  /**
   * Resolve collision - push entity out of prop and return corrected position
   * Also applies impulse to the prop
   */
  resolveCollision(
    entityX: number,
    entityZ: number,
    entityRadius: number,
    pushForce: number = 5
  ): { x: number; z: number; collided: boolean } {
    let correctedX = entityX;
    let correctedZ = entityZ;
    let collided = false;

    // One-time debug log
    if (this.resolveLogCounter === 0) {
      console.log(`[PropManager] resolveCollision first call - props: ${this.props.size}, physics: ${!!this.physics}`);
    }
    this.resolveLogCounter++;

    for (const prop of this.props.values()) {
      if (prop.isDestroyed) continue;

      const dx = correctedX - prop.position.x;
      const dz = correctedZ - prop.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Get prop radius
      let propRadius = 0.5;
      if (prop.type === 'barrel') propRadius = this.config.barrel.radius;
      else if (prop.type === 'crate') propRadius = this.config.crate.width / 2;
      else if (prop.type === 'crateStack') propRadius = this.config.crateStack.width / 2;

      const minDist = entityRadius + propRadius;

      if (dist < minDist && dist > 0.001) {
        collided = true;

        // Push entity out
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        // Debug log collision (throttled)
        if (this.resolveLogCounter % 30 === 0) {
          console.log(`[PropManager] COLLISION with ${prop.id} - overlap: ${overlap.toFixed(3)}`);
        }

        // Move entity out of prop
        correctedX += nx * overlap;
        correctedZ += nz * overlap;

        // Push the prop in opposite direction
        if (this.physics) {
          // Much stronger impulse - base force + overlap bonus
          const baseImpulse = pushForce * 50; // Strong base push
          const overlapBonus = overlap * pushForce * 100; // Extra for deep overlap
          const totalStrength = baseImpulse + overlapBonus;
          const hasBody = this.physics.hasBody(prop.id);

          // Debug log (throttled)
          if (this.resolveLogCounter % 30 === 0) {
            console.log(`[PropManager] Applying impulse to ${prop.id} - hasBody: ${hasBody}, strength: ${totalStrength.toFixed(1)}`);
          }

          if (hasBody) {
            this.physics.applyImpulse(prop.id, {
              x: -nx * totalStrength,
              y: 2, // Small upward to help overcome friction
              z: -nz * totalStrength,
            });
          }
        } else {
          if (this.resolveLogCounter % 30 === 0) {
            console.log(`[PropManager] NO PHYSICS - can't apply impulse to ${prop.id}`);
          }
        }
      }
    }

    return { x: correctedX, z: correctedZ, collided };
  }

  private debugLogCounter = 0;
  private hasLoggedOnce = false;

  /**
   * Push props when an entity moves near them (simulates collision)
   * Call this for player and enemies each frame
   */
  pushPropsFromEntity(
    entityX: number,
    entityZ: number,
    entityRadius: number,
    pushForce: number = 5
  ): void {
    // One-time debug log
    if (!this.hasLoggedOnce) {
      this.hasLoggedOnce = true;
      console.log(`[PropManager] First pushPropsFromEntity call - physics: ${!!this.physics}, props: ${this.props.size}`);
      if (this.props.size > 0) {
        const firstProp = this.props.values().next().value;
        console.log(`[PropManager] Sample prop:`, firstProp?.id, firstProp?.position);
      }
    }

    if (!this.physics) {
      if (this.debugLogCounter++ % 600 === 0) {
        console.log(`[PropManager] pushPropsFromEntity: No physics! Props: ${this.props.size}`);
      }
      return;
    }

    this.debugLogCounter++;

    for (const prop of this.props.values()) {
      if (prop.isDestroyed) continue;

      const dx = prop.position.x - entityX;
      const dz = prop.position.z - entityZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Get prop radius
      let propRadius = 0.5;
      if (prop.type === 'barrel') propRadius = this.config.barrel.radius;
      else if (prop.type === 'crate') propRadius = this.config.crate.width / 2;
      else if (prop.type === 'crateStack') propRadius = this.config.crateStack.width / 2;

      const collisionDist = entityRadius + propRadius + 0.1; // Small buffer

      // Check if overlapping
      if (dist < collisionDist && dist > 0.01) {
        // Normalize direction from entity to prop
        const nx = dx / dist;
        const nz = dz / dist;

        // Push strength based on overlap depth
        const overlap = collisionDist - dist;
        const strength = overlap * pushForce;

        // Debug: Log collision
        if (this.debugLogCounter % 60 === 0) {
          console.log(`[PropManager] Collision! prop=${prop.id} dist=${dist.toFixed(2)} colDist=${collisionDist.toFixed(2)} strength=${strength.toFixed(2)}`);
        }

        // Apply impulse outward from entity
        this.physics.applyImpulse(prop.id, {
          x: nx * strength,
          y: 0.1, // Tiny upward
          z: nz * strength,
        });
      }
    }
  }

  /**
   * Get prop by ID
   */
  getProp(id: string): PropState | undefined {
    return this.props.get(id);
  }

  /**
   * Get all props
   */
  getProps(): Map<string, PropState> {
    return this.props;
  }

  /**
   * Get prop count
   */
  getPropCount(): number {
    return this.props.size;
  }

  /**
   * Remove a prop
   */
  removeProp(id: string): void {
    const prop = this.props.get(id);
    if (!prop) return;

    if (this.physics) {
      this.physics.removeBody(id);
    }

    prop.isDestroyed = true;
    this.props.delete(id);
  }

  /**
   * Clear all props
   */
  clear(): void {
    if (this.physics) {
      for (const prop of this.props.values()) {
        this.physics.removeBody(prop.id);
      }
    }
    this.props.clear();
    this.nextPropId = 0;
  }
}
