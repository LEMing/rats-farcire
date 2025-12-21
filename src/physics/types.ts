/**
 * Physics system types and collision groups for Rapier3D integration
 */

import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';

// Collision group bitmasks
export const COLLISION_GROUPS = {
  GROUND: 0x0001,
  WALL: 0x0002,
  PLAYER: 0x0004,
  ENEMY: 0x0008,
  BARREL: 0x0010,
  RAGDOLL: 0x0020,
  DEBRIS: 0x0040,
} as const;

// Collision masks - what each group can collide with
export const COLLISION_MASKS = {
  // Ground collides with everything
  GROUND: 0xffff,
  // Walls collide with player, enemy, barrel, ragdoll, debris
  WALL: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.ENEMY | COLLISION_GROUPS.BARREL |
        COLLISION_GROUPS.RAGDOLL | COLLISION_GROUPS.DEBRIS,
  // Player collides with ground, walls, barrels, enemies
  PLAYER: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL | COLLISION_GROUPS.BARREL |
          COLLISION_GROUPS.ENEMY,
  // Enemy collides with ground, walls, player, other enemies, barrels
  ENEMY: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL | COLLISION_GROUPS.PLAYER |
         COLLISION_GROUPS.ENEMY | COLLISION_GROUPS.BARREL,
  // Barrel collides with ground, walls, player, enemies, other barrels
  BARREL: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL | COLLISION_GROUPS.PLAYER |
          COLLISION_GROUPS.ENEMY | COLLISION_GROUPS.BARREL,
  // Ragdoll collides with ground, walls, other ragdolls
  RAGDOLL: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL | COLLISION_GROUPS.RAGDOLL,
  // Debris collides with ground, walls
  DEBRIS: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL,
} as const;

export type PhysicsBodyType = 'static' | 'dynamic' | 'kinematic';

export interface PhysicsBodyConfig {
  type: PhysicsBodyType;
  mass?: number;
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
  collisionGroup?: number;
  collisionMask?: number;
  isSensor?: boolean;
  canSleep?: boolean;
}

export interface CylinderConfig extends PhysicsBodyConfig {
  radius: number;
  height: number;
}

export interface CapsuleConfig extends PhysicsBodyConfig {
  radius: number;
  height: number;
}

export interface SphereConfig extends PhysicsBodyConfig {
  radius: number;
}

export interface BoxConfig extends PhysicsBodyConfig {
  width: number;
  height: number;
  depth: number;
}

export interface PhysicsBody {
  id: string;
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  entityType: 'player' | 'enemy' | 'barrel' | 'ragdoll' | 'debris';
}

export interface RagdollPart {
  name: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Object3D;
}

export interface Ragdoll {
  id: string;
  parts: RagdollPart[];
  joints: RAPIER.ImpulseJoint[];
  meshGroup: THREE.Group;
  createdAt: number;
  lifetime: number;
}

export interface DebrisPiece {
  id: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  createdAt: number;
  lifetime: number;
}

// Physics constants
export const PHYSICS_CONSTANTS = {
  GRAVITY: { x: 0, y: -20, z: 0 },
  TIMESTEP: 1 / 60,
  MAX_RAGDOLLS: 20,
  MAX_DEBRIS: 50,
  RAGDOLL_LIFETIME: 3000,
  DEBRIS_LIFETIME: 5000,
} as const;

// Body configs
export const BODY_CONFIGS = {
  BARREL: {
    mass: 30,
    friction: 0.8,
    restitution: 0.15,
    linearDamping: 2.0,   // Higher damping for realistic settling
    angularDamping: 1.5,
    radius: 0.4,
    height: 0.8,
  },
  ENEMY: {
    mass: 50,
    friction: 0.5,
    restitution: 0.0,
    linearDamping: 8.0,
    angularDamping: 5.0,
    radius: 0.3,
    height: 0.8,
  },
  PLAYER: {
    mass: 60,
    friction: 0.5,
    restitution: 0.0,
    linearDamping: 10.0,
    angularDamping: 5.0,
    radius: 0.35,
    height: 1.0,
  },
  DEBRIS: {
    mass: 2,
    friction: 0.3,
    restitution: 0.4,
    linearDamping: 0.2,
    angularDamping: 0.1,
    minSize: 0.05,
    maxSize: 0.15,
  },
  WALL: {
    friction: 0.8,
    restitution: 0.1,
    height: 3.0,
  },
} as const;

// Explosion force multipliers - tuned for realistic physics
export const EXPLOSION_FORCES = {
  BARREL: 150,               // Moderate push, not flying across the room
  THERMOBARIC: 200,          // Slightly stronger
  ROCKET: 80,                // Smaller explosion
  UPWARD_MULTIPLIER: 0.3,    // Less upward force, more grounded
  TORQUE_MULTIPLIER: 0.2,    // Less spin
  PHYSICS_RADIUS_MULTIPLIER: 1.5, // Reasonable radius
} as const;
