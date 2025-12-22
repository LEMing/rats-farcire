/**
 * PhysicsManager - Core Rapier3D world management
 *
 * Handles physics simulation for:
 * - Barrels (pushable, fly from explosions)
 * - Enemies (knockback)
 * - Player (push objects)
 * - Ragdolls (dead enemies)
 * - Debris (explosion particles)
 */

import RAPIER from '@dimforge/rapier3d-compat';
import {
  PHYSICS_CONSTANTS,
  COLLISION_GROUPS,
  COLLISION_MASKS,
  BODY_CONFIGS,
  EXPLOSION_FORCES,
  type PhysicsBody,
  type Ragdoll,
  type DebrisPiece,
} from './types';

export class PhysicsManager {
  private world: RAPIER.World | null = null;
  private bodies: Map<string, PhysicsBody> = new Map();
  private ragdolls: Map<string, Ragdoll> = new Map();
  private debris: Map<string, DebrisPiece> = new Map();
  private initialized = false;

  /**
   * Initialize the physics world. Must be called before any other methods.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await RAPIER.init();
    this.world = new RAPIER.World(PHYSICS_CONSTANTS.GRAVITY);
    this.initialized = true;

    // Create ground plane
    this.createGround();
  }

  /**
   * Create ground plane collider
   */
  private createGround(): void {
    if (!this.world) return;

    const groundDesc = RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
      .setTranslation(0, -0.1, 0)
      .setCollisionGroups(
        (COLLISION_GROUPS.GROUND << 16) | COLLISION_MASKS.GROUND
      )
      .setFriction(0.8)
      .setRestitution(0.1);

    this.world.createCollider(groundDesc);
  }

  /**
   * Step the physics simulation
   */
  step(): void {
    this.world?.step();
  }

  /**
   * Check if physics is ready
   */
  isReady(): boolean {
    return this.initialized && this.world !== null;
  }

  /**
   * Get the Rapier world (for advanced usage)
   */
  getWorld(): RAPIER.World | null {
    return this.world;
  }

  // ============================================================================
  // Static Body Creation (Walls)
  // ============================================================================

  /**
   * Create a static wall collider
   */
  createWallBody(
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number = BODY_CONFIGS.WALL.height
  ): void {
    if (!this.world) return;

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      x,
      height / 2,
      z
    );
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      width / 2,
      height / 2,
      depth / 2
    )
      .setCollisionGroups((COLLISION_GROUPS.WALL << 16) | COLLISION_MASKS.WALL)
      .setFriction(BODY_CONFIGS.WALL.friction)
      .setRestitution(BODY_CONFIGS.WALL.restitution);

    this.world.createCollider(colliderDesc, body);
  }

  // ============================================================================
  // Dynamic Body Creation
  // ============================================================================

  /**
   * Create a barrel physics body (cylinder)
   */
  createBarrelBody(id: string, x: number, y: number, z: number): void {
    if (!this.world || this.bodies.has(id)) return;

    const config = BODY_CONFIGS.BARREL;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + config.height / 2, z)
      .setLinearDamping(config.linearDamping)
      .setAngularDamping(config.angularDamping);

    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cylinder(
      config.height / 2,
      config.radius
    )
      .setCollisionGroups(
        (COLLISION_GROUPS.BARREL << 16) | COLLISION_MASKS.BARREL
      )
      .setFriction(config.friction)
      .setRestitution(config.restitution)
      .setMass(config.mass);

    const collider = this.world.createCollider(colliderDesc, body);

    this.bodies.set(id, {
      id,
      rigidBody: body,
      collider,
      entityType: 'barrel',
    });
  }

  /**
   * Create a generic box physics body (for props like crates)
   */
  createBoxBody(
    id: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    mass: number
  ): void {
    if (!this.world || this.bodies.has(id)) return;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(2.0)   // Higher damping for quick settling
      .setAngularDamping(1.5);

    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
      .setCollisionGroups((COLLISION_GROUPS.BARREL << 16) | COLLISION_MASKS.BARREL)
      .setFriction(0.8)  // Higher friction
      .setRestitution(0.1) // Less bouncy
      .setMass(mass);

    const collider = this.world.createCollider(colliderDesc, body);

    this.bodies.set(id, {
      id,
      rigidBody: body,
      collider,
      entityType: 'barrel', // Treated same as barrels for physics
    });
  }

  /**
   * Create a generic cylinder physics body (for props like wooden barrels)
   */
  createCylinderBody(
    id: string,
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    mass: number,
    tipped: boolean = false
  ): void {
    if (!this.world || this.bodies.has(id)) return;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(2.0)   // Higher damping for quick settling
      .setAngularDamping(1.5);

    // If tipped, rotate 90 degrees
    if (tipped) {
      bodyDesc.setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) });
    }

    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cylinder(height / 2, radius)
      .setCollisionGroups((COLLISION_GROUPS.BARREL << 16) | COLLISION_MASKS.BARREL)
      .setFriction(0.8)  // Higher friction
      .setRestitution(0.15) // Less bouncy
      .setMass(mass);

    const collider = this.world.createCollider(colliderDesc, body);

    this.bodies.set(id, {
      id,
      rigidBody: body,
      collider,
      entityType: 'barrel', // Treated same as barrels for physics
    });
  }

  /**
   * Create an enemy physics body (capsule)
   */
  createEnemyBody(
    id: string,
    x: number,
    y: number,
    z: number,
    radiusMultiplier: number = 1
  ): void {
    if (!this.world || this.bodies.has(id)) return;

    const config = BODY_CONFIGS.ENEMY;
    const radius = config.radius * radiusMultiplier;

    // Use kinematic body for enemies - we control their movement
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased()
      .setTranslation(x, y + config.height / 2, z)
      .setLinearDamping(config.linearDamping);

    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(config.height / 2, radius)
      .setCollisionGroups(
        (COLLISION_GROUPS.ENEMY << 16) | COLLISION_MASKS.ENEMY
      )
      .setFriction(config.friction)
      .setRestitution(config.restitution);

    const collider = this.world.createCollider(colliderDesc, body);

    this.bodies.set(id, {
      id,
      rigidBody: body,
      collider,
      entityType: 'enemy',
    });
  }

  /**
   * Create a player physics body (capsule)
   */
  createPlayerBody(id: string, x: number, y: number, z: number): void {
    if (!this.world || this.bodies.has(id)) return;

    const config = BODY_CONFIGS.PLAYER;

    // Use kinematic body for player - we control their movement directly
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased()
      .setTranslation(x, y + config.height / 2, z)
      .setLinearDamping(config.linearDamping);

    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(
      config.height / 2,
      config.radius
    )
      .setCollisionGroups(
        (COLLISION_GROUPS.PLAYER << 16) | COLLISION_MASKS.PLAYER
      )
      .setFriction(config.friction)
      .setRestitution(config.restitution);

    const collider = this.world.createCollider(colliderDesc, body);

    this.bodies.set(id, {
      id,
      rigidBody: body,
      collider,
      entityType: 'player',
    });
  }

  // ============================================================================
  // Body Manipulation
  // ============================================================================

  /**
   * Check if a body exists
   */
  hasBody(id: string): boolean {
    return this.bodies.has(id);
  }

  /**
   * Get body position
   */
  getPosition(id: string): { x: number; y: number; z: number } | null {
    const body = this.bodies.get(id);
    if (!body) return null;

    const pos = body.rigidBody.translation();
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  /**
   * Get body rotation as quaternion
   */
  getRotation(
    id: string
  ): { x: number; y: number; z: number; w: number } | null {
    const body = this.bodies.get(id);
    if (!body) return null;

    const rot = body.rigidBody.rotation();
    return { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
  }

  /**
   * Set body position (teleport)
   */
  setPosition(id: string, x: number, y: number, z: number): void {
    const body = this.bodies.get(id);
    if (!body) return;

    body.rigidBody.setTranslation({ x, y, z }, true);
  }

  /**
   * Set linear velocity (for kinematic bodies)
   */
  setLinearVelocity(id: string, vx: number, vy: number, vz: number): void {
    const body = this.bodies.get(id);
    if (!body) return;

    body.rigidBody.setLinvel({ x: vx, y: vy, z: vz }, true);
  }

  /**
   * Apply impulse to a body (for dynamic bodies)
   */
  applyImpulse(id: string, impulse: { x: number; y: number; z: number }): void {
    const body = this.bodies.get(id);
    if (!body) return;

    // Only apply to dynamic bodies
    if (body.rigidBody.isDynamic()) {
      body.rigidBody.applyImpulse(impulse, true);
    }
  }

  /**
   * Apply torque impulse (spin)
   */
  applyTorqueImpulse(
    id: string,
    torque: { x: number; y: number; z: number }
  ): void {
    const body = this.bodies.get(id);
    if (!body) return;

    if (body.rigidBody.isDynamic()) {
      body.rigidBody.applyTorqueImpulse(torque, true);
    }
  }

  /**
   * Set collider as sensor (no collision response, for dash)
   */
  setColliderSensor(id: string, isSensor: boolean): void {
    const body = this.bodies.get(id);
    if (!body) return;

    body.collider.setSensor(isSensor);
  }

  /**
   * Remove a body
   */
  removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (!body || !this.world) return;

    this.world.removeRigidBody(body.rigidBody);
    this.bodies.delete(id);
  }

  // ============================================================================
  // Explosion Forces
  // ============================================================================

  /**
   * Apply explosion force to all nearby dynamic bodies
   */
  applyExplosionForce(
    explosionPos: { x: number; y: number; z: number },
    radius: number,
    force: number,
    excludeIds: Set<string> = new Set()
  ): void {
    if (!this.world) return;

    for (const [id, body] of this.bodies) {
      if (excludeIds.has(id)) continue;
      if (!body.rigidBody.isDynamic()) continue;

      const pos = body.rigidBody.translation();
      const dx = pos.x - explosionPos.x;
      const dy = pos.y - explosionPos.y;
      const dz = pos.z - explosionPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < radius && dist > 0.1) {
        const falloff = 1 - dist / radius;
        const strength = falloff * force;

        // Normalize direction
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        // Apply upward + outward impulse
        body.rigidBody.applyImpulse(
          {
            x: nx * strength,
            y: strength * EXPLOSION_FORCES.UPWARD_MULTIPLIER + Math.abs(ny) * strength,
            z: nz * strength,
          },
          true
        );

        // Apply random spin
        body.rigidBody.applyTorqueImpulse(
          {
            x: (Math.random() - 0.5) * strength * EXPLOSION_FORCES.TORQUE_MULTIPLIER,
            y: (Math.random() - 0.5) * strength * EXPLOSION_FORCES.TORQUE_MULTIPLIER,
            z: (Math.random() - 0.5) * strength * EXPLOSION_FORCES.TORQUE_MULTIPLIER,
          },
          true
        );
      }
    }
  }

  /**
   * Apply barrel explosion forces
   */
  applyBarrelExplosion(
    explosionPos: { x: number; y: number; z: number },
    radius: number,
    excludeBarrelId?: string
  ): void {
    const excludeIds = excludeBarrelId ? new Set([excludeBarrelId]) : new Set<string>();
    this.applyExplosionForce(
      explosionPos,
      radius,
      EXPLOSION_FORCES.BARREL,
      excludeIds
    );
  }

  /**
   * Apply thermobaric explosion forces
   */
  applyThermobaricExplosion(
    explosionPos: { x: number; y: number; z: number },
    radius: number
  ): void {
    this.applyExplosionForce(explosionPos, radius, EXPLOSION_FORCES.THERMOBARIC);
  }

  /**
   * Apply rocket explosion forces
   */
  applyRocketExplosion(
    explosionPos: { x: number; y: number; z: number },
    radius: number
  ): void {
    this.applyExplosionForce(explosionPos, radius, EXPLOSION_FORCES.ROCKET);
  }

  // ============================================================================
  // Debris System
  // ============================================================================

  /**
   * Spawn debris from an explosion
   */
  spawnDebris(
    position: { x: number; y: number; z: number },
    count: number,
    force: number
  ): string[] {
    if (!this.world) return [];

    const ids: string[] = [];
    const config = BODY_CONFIGS.DEBRIS;

    for (let i = 0; i < count; i++) {
      // Limit debris count
      if (this.debris.size >= PHYSICS_CONSTANTS.MAX_DEBRIS) {
        // Remove oldest
        const oldestId = this.debris.keys().next().value;
        if (oldestId) this.removeDebris(oldestId);
      }

      const id = `debris-${Date.now()}-${i}`;
      const size =
        config.minSize + Math.random() * (config.maxSize - config.minSize);

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          position.x + (Math.random() - 0.5) * 0.5,
          position.y + Math.random() * 0.5,
          position.z + (Math.random() - 0.5) * 0.5
        )
        .setLinearDamping(config.linearDamping)
        .setAngularDamping(config.angularDamping);

      const body = this.world.createRigidBody(bodyDesc);

      const colliderDesc = RAPIER.ColliderDesc.cuboid(size, size, size)
        .setCollisionGroups(
          (COLLISION_GROUPS.DEBRIS << 16) | COLLISION_MASKS.DEBRIS
        )
        .setFriction(config.friction)
        .setRestitution(config.restitution)
        .setMass(config.mass);

      const collider = this.world.createCollider(colliderDesc, body);

      // Apply random outward + upward impulse
      const angle = Math.random() * Math.PI * 2;
      const upward = 0.5 + Math.random() * 0.5;
      body.applyImpulse(
        {
          x: Math.cos(angle) * force * (0.5 + Math.random() * 0.5),
          y: force * upward,
          z: Math.sin(angle) * force * (0.5 + Math.random() * 0.5),
        },
        true
      );

      // Random spin
      body.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * force * 0.1,
          y: (Math.random() - 0.5) * force * 0.1,
          z: (Math.random() - 0.5) * force * 0.1,
        },
        true
      );

      this.debris.set(id, {
        id,
        body,
        collider,
        mesh: null, // Mesh created by renderer
        createdAt: Date.now(),
        lifetime: PHYSICS_CONSTANTS.DEBRIS_LIFETIME,
      });

      ids.push(id);
    }

    return ids;
  }

  /**
   * Get debris position and rotation for rendering
   */
  getDebrisTransform(
    id: string
  ): { pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number; w: number } } | null {
    const debris = this.debris.get(id);
    if (!debris) return null;

    const pos = debris.body.translation();
    const rot = debris.body.rotation();

    return {
      pos: { x: pos.x, y: pos.y, z: pos.z },
      rot: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
    };
  }

  /**
   * Remove debris
   */
  removeDebris(id: string): void {
    const debris = this.debris.get(id);
    if (!debris || !this.world) return;

    this.world.removeRigidBody(debris.body);
    this.debris.delete(id);
  }

  /**
   * Update debris (remove expired)
   */
  updateDebris(gameTime: number): string[] {
    const removed: string[] = [];

    for (const [id, debris] of this.debris) {
      if (gameTime - debris.createdAt > debris.lifetime) {
        this.removeDebris(id);
        removed.push(id);
      }
    }

    return removed;
  }

  /**
   * Get all debris IDs
   */
  getDebrisIds(): string[] {
    return Array.from(this.debris.keys());
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up all physics resources
   */
  dispose(): void {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.bodies.clear();
    this.ragdolls.clear();
    this.debris.clear();
    this.initialized = false;
  }

  /**
   * Get all body IDs of a specific type
   */
  getBodiesOfType(
    entityType: 'player' | 'enemy' | 'barrel'
  ): string[] {
    const ids: string[] = [];
    for (const [id, body] of this.bodies) {
      if (body.entityType === entityType) {
        ids.push(id);
      }
    }
    return ids;
  }
}
