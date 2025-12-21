import * as THREE from 'three';
import type { Vec3, EnemyType } from '@shared/types';
import { BLOOD_COLORS } from '@shared/constants';

// ============================================================================
// Particle System - Handles blood burst particles and decals
// Single Responsibility: Manage particle lifecycle and rendering
// ============================================================================

interface ParticleData {
  index: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  colorHex: number; // Store as hex to avoid Color allocation
  baseScale: number;
}

interface GibData {
  index: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  angularVelocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  scale: number;
}

// Blood trail tracking for entities
interface BloodTrail {
  lastX: number;
  lastZ: number;
  remaining: number; // Footprints left to spawn
}

// Wall face direction for splatter orientation
export type WallFace = 'north' | 'south' | 'east' | 'west';

export class ParticleSystem {
  private readonly MAX_PARTICLES = 200;
  private readonly MAX_BLOOD_DECALS = 100;
  private readonly MAX_GIBS = 50;
  private readonly MAX_FOOTPRINTS = 150;
  private readonly MAX_WALL_SPLATTERS = 80;

  private particles: ParticleData[] = [];
  private particleInstances!: THREE.InstancedMesh;
  private freeParticleIndices: number[] = [];
  private dummyMatrix = new THREE.Matrix4();
  private dummyColor = new THREE.Color();
  private dummyScale = new THREE.Vector3(); // Reusable for scaling to avoid allocation

  // Blood decal instancing - no per-decal allocation
  private bloodDecalInstances!: THREE.InstancedMesh;
  private nextDecalIndex = 0;
  private decalCount = 0;

  // Gibs system - chunks of enemy bodies
  private gibs: GibData[] = [];
  private gibInstances!: THREE.InstancedMesh;
  private freeGibIndices: number[] = [];

  // Blood footprint system
  private footprintInstances!: THREE.InstancedMesh;
  private nextFootprintIndex = 0;
  private bloodTrails: Map<string, BloodTrail> = new Map();
  private readonly FOOTPRINT_SPACING = 0.8; // Distance between footprints
  private readonly FOOTPRINTS_PER_BLOOD = 12; // How many footprints per blood contact

  // Wall blood splatter system
  private wallSplatterInstances!: THREE.InstancedMesh;
  private nextWallSplatterIndex = 0;

  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initParticleSystem();
    this.initBloodDecalSystem();
    this.initGibSystem();
    this.initFootprintSystem();
    this.initWallSplatterSystem();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private initParticleSystem(): void {
    // Single geometry for all particles
    const geometry = new THREE.SphereGeometry(0.08, 4, 4);

    // Simple material - color will be set per instance
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
    });

    // Create instanced mesh - ONE draw call for all particles
    this.particleInstances = new THREE.InstancedMesh(geometry, material, this.MAX_PARTICLES);
    this.particleInstances.frustumCulled = false;
    this.particleInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize all instances as hidden (scale 0) and track free indices
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.particleInstances.setMatrixAt(i, hiddenMatrix);
      this.particleInstances.setColorAt(i, new THREE.Color(0x000000));
      this.freeParticleIndices.push(i);
    }

    this.particleInstances.instanceMatrix.needsUpdate = true;
    if (this.particleInstances.instanceColor) {
      this.particleInstances.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.particleInstances);
  }

  private initBloodDecalSystem(): void {
    // Single geometry for all blood decals (circle laying flat)
    const geometry = new THREE.CircleGeometry(0.4, 8);
    geometry.rotateX(-Math.PI / 2); // Lay flat on ground

    // Shared material for all decals
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.6,
      depthWrite: false, // Prevent z-fighting
    });

    // Create instanced mesh - ONE draw call for all decals
    this.bloodDecalInstances = new THREE.InstancedMesh(geometry, material, this.MAX_BLOOD_DECALS);
    this.bloodDecalInstances.frustumCulled = false;
    this.bloodDecalInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize all instances as hidden
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_BLOOD_DECALS; i++) {
      this.bloodDecalInstances.setMatrixAt(i, hiddenMatrix);
      this.bloodDecalInstances.setColorAt(i, new THREE.Color(0x440000));
    }

    this.bloodDecalInstances.instanceMatrix.needsUpdate = true;
    if (this.bloodDecalInstances.instanceColor) {
      this.bloodDecalInstances.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.bloodDecalInstances);
  }

  private initGibSystem(): void {
    // Irregular chunk geometry for gibs
    const geometry = new THREE.BoxGeometry(0.15, 0.1, 0.12);

    // Dark red/meat colored material
    const material = new THREE.MeshLambertMaterial({
      color: 0x660000,
    });

    // Create instanced mesh for gibs
    this.gibInstances = new THREE.InstancedMesh(geometry, material, this.MAX_GIBS);
    this.gibInstances.frustumCulled = false;
    this.gibInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize all as hidden
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_GIBS; i++) {
      this.gibInstances.setMatrixAt(i, hiddenMatrix);
      this.freeGibIndices.push(i);
    }

    this.gibInstances.instanceMatrix.needsUpdate = true;
    this.scene.add(this.gibInstances);
  }

  private initFootprintSystem(): void {
    // Oval/ellipse shape for footprints (smaller than blood decals)
    const geometry = new THREE.CircleGeometry(0.15, 6);
    geometry.rotateX(-Math.PI / 2); // Lay flat on ground
    geometry.scale(1.0, 1.0, 1.6); // Elongate for footprint shape

    // Dark blood material
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    // Create instanced mesh for footprints
    this.footprintInstances = new THREE.InstancedMesh(geometry, material, this.MAX_FOOTPRINTS);
    this.footprintInstances.frustumCulled = false;
    this.footprintInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize all as hidden
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_FOOTPRINTS; i++) {
      this.footprintInstances.setMatrixAt(i, hiddenMatrix);
      this.footprintInstances.setColorAt(i, new THREE.Color(0x330000));
    }

    this.footprintInstances.instanceMatrix.needsUpdate = true;
    if (this.footprintInstances.instanceColor) {
      this.footprintInstances.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.footprintInstances);
  }

  private initWallSplatterSystem(): void {
    // Irregular splatter shape for wall blood (vertical, roughly circular)
    const geometry = new THREE.CircleGeometry(0.5, 8);
    // Don't rotate - we'll orient per-instance based on wall face

    // Dark blood material with some transparency
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Create instanced mesh for wall splatters
    this.wallSplatterInstances = new THREE.InstancedMesh(geometry, material, this.MAX_WALL_SPLATTERS);
    this.wallSplatterInstances.frustumCulled = false;
    this.wallSplatterInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize all as hidden
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_WALL_SPLATTERS; i++) {
      this.wallSplatterInstances.setMatrixAt(i, hiddenMatrix);
      this.wallSplatterInstances.setColorAt(i, new THREE.Color(0x440000));
    }

    this.wallSplatterInstances.instanceMatrix.needsUpdate = true;
    if (this.wallSplatterInstances.instanceColor) {
      this.wallSplatterInstances.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.wallSplatterInstances);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Spawn a burst of blood particles at position
   */
  spawnBloodBurst(position: Vec3, enemyType: EnemyType, count: number = 15): void {
    const colorHex = BLOOD_COLORS[enemyType];

    for (let i = 0; i < count; i++) {
      // Get free particle index
      if (this.freeParticleIndices.length === 0) continue;
      const index = this.freeParticleIndices.pop()!;

      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      const upward = 2 + Math.random() * 4;

      this.particles.push({
        index,
        position: new THREE.Vector3(position.x, position.y, position.z),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          upward,
          Math.sin(angle) * speed
        ),
        lifetime: 0,
        maxLifetime: 0.4 + Math.random() * 0.3,
        colorHex, // Store hex directly, no Color allocation
        baseScale: 0.8 + Math.random() * 0.4,
      });
    }
  }

  /**
   * Spawn a fire particle for thermobaric effect
   */
  spawnFireParticle(position: Vec3): void {
    if (this.freeParticleIndices.length === 0) return;
    const index = this.freeParticleIndices.pop()!;

    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;

    this.particles.push({
      index,
      position: new THREE.Vector3(position.x, position.y, position.z),
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed,
        3 + Math.random() * 3, // Upward
        Math.sin(angle) * speed
      ),
      lifetime: 0,
      maxLifetime: 0.5 + Math.random() * 0.3,
      colorHex: 0xff6600, // Fire orange - no Color allocation
      baseScale: 1.0 + Math.random() * 0.5,
    });
  }

  /**
   * Spawn a blood decal on the ground (using instanced mesh - no allocation)
   */
  spawnBloodDecal(x: number, z: number, size: number = 1): void {
    // Use circular buffer - oldest decals get replaced
    const index = this.nextDecalIndex;
    this.nextDecalIndex = (this.nextDecalIndex + 1) % this.MAX_BLOOD_DECALS;
    this.decalCount = Math.min(this.decalCount + 1, this.MAX_BLOOD_DECALS);

    // Set position and scale
    const scale = 0.75 * size + Math.random() * 0.5;
    this.dummyMatrix.makeScale(scale, scale, scale);
    this.dummyMatrix.setPosition(
      x + (Math.random() - 0.5) * 0.5,
      0.02,
      z + (Math.random() - 0.5) * 0.5
    );
    this.bloodDecalInstances.setMatrixAt(index, this.dummyMatrix);

    // Set color variation (dark red to maroon)
    const colorVariation = 0.2 + Math.random() * 0.3;
    this.dummyColor.setRGB(colorVariation, 0, 0);
    this.bloodDecalInstances.setColorAt(index, this.dummyColor);

    // Mark buffers for update
    this.bloodDecalInstances.instanceMatrix.needsUpdate = true;
    if (this.bloodDecalInstances.instanceColor) {
      this.bloodDecalInstances.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Spawn gibs (body chunks) - for high-impact kills like shotgun/rocket
   */
  spawnGibs(position: Vec3, count: number = 6): void {
    for (let i = 0; i < count; i++) {
      if (this.freeGibIndices.length === 0) continue;
      const index = this.freeGibIndices.pop()!;

      // Random velocity outward and upward
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 6;
      const upward = 3 + Math.random() * 5;

      this.gibs.push({
        index,
        position: new THREE.Vector3(
          position.x + (Math.random() - 0.5) * 0.3,
          position.y + 0.3 + Math.random() * 0.2,
          position.z + (Math.random() - 0.5) * 0.3
        ),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          upward,
          Math.sin(angle) * speed
        ),
        rotation: new THREE.Euler(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        ),
        angularVelocity: new THREE.Vector3(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15
        ),
        lifetime: 0,
        maxLifetime: 1.5 + Math.random() * 0.5,
        scale: 0.8 + Math.random() * 0.6,
      });
    }
  }

  /**
   * Mark an entity as having stepped in blood (will leave footprints)
   */
  markEntityBloody(entityId: string, x: number, z: number): void {
    const existing = this.bloodTrails.get(entityId);
    if (existing) {
      // Refresh their blood - add more footprints
      existing.remaining = Math.min(existing.remaining + this.FOOTPRINTS_PER_BLOOD, this.FOOTPRINTS_PER_BLOOD * 2);
    } else {
      // New bloody entity
      this.bloodTrails.set(entityId, {
        lastX: x,
        lastZ: z,
        remaining: this.FOOTPRINTS_PER_BLOOD,
      });
    }
  }

  /**
   * Update entity position and spawn footprints if they're bloody
   */
  updateEntityBloodTrail(entityId: string, x: number, z: number, rotation: number): void {
    const trail = this.bloodTrails.get(entityId);
    if (!trail || trail.remaining <= 0) {
      // Not bloody or out of footprints
      if (trail && trail.remaining <= 0) {
        this.bloodTrails.delete(entityId);
      }
      return;
    }

    // Check if entity has moved enough for a footprint
    const dx = x - trail.lastX;
    const dz = z - trail.lastZ;
    const distSquared = dx * dx + dz * dz;

    if (distSquared >= this.FOOTPRINT_SPACING * this.FOOTPRINT_SPACING) {
      // Spawn a footprint
      this.spawnFootprint(trail.lastX, trail.lastZ, rotation);
      trail.lastX = x;
      trail.lastZ = z;
      trail.remaining--;

      // Occasionally spawn a second footprint offset (for two feet)
      if (trail.remaining > 0 && Math.random() < 0.5) {
        const offsetAngle = rotation + Math.PI / 2;
        const offsetDist = 0.15 + Math.random() * 0.1;
        this.spawnFootprint(
          x + Math.cos(offsetAngle) * offsetDist,
          z + Math.sin(offsetAngle) * offsetDist,
          rotation + (Math.random() - 0.5) * 0.3
        );
        trail.remaining--;
      }
    }
  }

  /**
   * Remove blood trail tracking for an entity (e.g., when they die)
   */
  removeEntityBloodTrail(entityId: string): void {
    this.bloodTrails.delete(entityId);
  }

  /**
   * Spawn a single blood footprint at position with rotation
   */
  private spawnFootprint(x: number, z: number, rotation: number): void {
    // Circular buffer - oldest footprints get replaced
    const index = this.nextFootprintIndex;
    this.nextFootprintIndex = (this.nextFootprintIndex + 1) % this.MAX_FOOTPRINTS;

    // Random size variation
    const scale = 0.8 + Math.random() * 0.4;

    // Build transform: rotate, scale, position (reuse dummyScale to avoid allocation)
    this.dummyMatrix.makeRotationY(rotation + (Math.random() - 0.5) * 0.4);
    this.dummyScale.set(scale, scale, scale);
    this.dummyMatrix.scale(this.dummyScale);
    this.dummyMatrix.setPosition(
      x + (Math.random() - 0.5) * 0.1,
      0.015, // Slightly above ground
      z + (Math.random() - 0.5) * 0.1
    );
    this.footprintInstances.setMatrixAt(index, this.dummyMatrix);

    // Dark red color with variation
    const intensity = 0.15 + Math.random() * 0.15;
    this.dummyColor.setRGB(intensity, 0, 0);
    this.footprintInstances.setColorAt(index, this.dummyColor);

    // Mark buffers for update
    this.footprintInstances.instanceMatrix.needsUpdate = true;
    if (this.footprintInstances.instanceColor) {
      this.footprintInstances.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Spawn blood splatter on a wall
   * @param x World X position
   * @param z World Z position
   * @param y Height on wall (typically 0.5-2.0)
   * @param face Which face of the wall to splatter on
   * @param size Size multiplier for the splatter
   */
  spawnWallSplatter(x: number, z: number, y: number, face: WallFace, size: number = 1): void {
    const index = this.nextWallSplatterIndex;
    this.nextWallSplatterIndex = (this.nextWallSplatterIndex + 1) % this.MAX_WALL_SPLATTERS;

    // Random scale variation
    const scale = (0.4 + Math.random() * 0.6) * size;

    // Calculate rotation based on wall face
    let rotY = 0;
    let offsetX = 0;
    let offsetZ = 0;
    const wallOffset = 0.02; // Small offset to prevent z-fighting with wall

    switch (face) {
      case 'north':
        rotY = 0;
        offsetZ = -wallOffset;
        break;
      case 'south':
        rotY = Math.PI;
        offsetZ = wallOffset;
        break;
      case 'east':
        rotY = -Math.PI / 2;
        offsetX = wallOffset;
        break;
      case 'west':
        rotY = Math.PI / 2;
        offsetX = -wallOffset;
        break;
    }

    // Build transform: rotate to face outward from wall, scale, position (reuse dummyScale)
    this.dummyMatrix.makeRotationY(rotY);
    this.dummyScale.set(scale, scale * (0.8 + Math.random() * 0.4), scale);
    this.dummyMatrix.scale(this.dummyScale);
    this.dummyMatrix.setPosition(
      x + offsetX + (Math.random() - 0.5) * 0.2,
      y + (Math.random() - 0.5) * 0.3,
      z + offsetZ + (Math.random() - 0.5) * 0.2
    );
    this.wallSplatterInstances.setMatrixAt(index, this.dummyMatrix);

    // Dark red blood color with variation
    const intensity = 0.2 + Math.random() * 0.25;
    this.dummyColor.setRGB(intensity, 0, 0);
    this.wallSplatterInstances.setColorAt(index, this.dummyColor);

    // Mark buffers for update
    this.wallSplatterInstances.instanceMatrix.needsUpdate = true;
    if (this.wallSplatterInstances.instanceColor) {
      this.wallSplatterInstances.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Update all particles - call every frame
   */
  update(dt: number): void {
    const gravity = -20;
    let needsUpdate = false;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifetime += dt;

      if (p.lifetime >= p.maxLifetime) {
        // Hide this instance (scale 0)
        this.dummyMatrix.makeScale(0, 0, 0);
        this.particleInstances.setMatrixAt(p.index, this.dummyMatrix);

        // Return index to free pool
        this.freeParticleIndices.push(p.index);
        // Swap-and-pop: O(1) removal (safe for backward iteration)
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        needsUpdate = true;
        continue;
      }

      // Physics
      p.velocity.y += gravity * dt;
      p.position.addScaledVector(p.velocity, dt);

      // Scale down as fade effect (since instanceColor doesn't support alpha)
      const alpha = 1 - p.lifetime / p.maxLifetime;
      const scale = (alpha * 0.8 + 0.2) * p.baseScale;

      // Update instance matrix (position + scale)
      this.dummyMatrix.makeScale(scale, scale, scale);
      this.dummyMatrix.setPosition(p.position);
      this.particleInstances.setMatrixAt(p.index, this.dummyMatrix);

      // Darken color as it fades (simulate transparency) - use setHex to avoid allocation
      this.dummyColor.setHex(p.colorHex).multiplyScalar(alpha);
      this.particleInstances.setColorAt(p.index, this.dummyColor);

      needsUpdate = true;
    }

    // Only update GPU buffers if something changed
    if (needsUpdate) {
      this.particleInstances.instanceMatrix.needsUpdate = true;
      if (this.particleInstances.instanceColor) {
        this.particleInstances.instanceColor.needsUpdate = true;
      }
    }

    // Update gibs
    this.updateGibs(dt, gravity);
  }

  private updateGibs(dt: number, gravity: number): void {
    let needsUpdate = false;

    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.lifetime += dt;

      if (g.lifetime >= g.maxLifetime) {
        // Hide this gib
        this.dummyMatrix.makeScale(0, 0, 0);
        this.gibInstances.setMatrixAt(g.index, this.dummyMatrix);

        // Return index to pool
        this.freeGibIndices.push(g.index);
        // Swap-and-pop: O(1) removal (safe for backward iteration)
        this.gibs[i] = this.gibs[this.gibs.length - 1];
        this.gibs.pop();
        needsUpdate = true;
        continue;
      }

      // Physics
      g.velocity.y += gravity * dt;
      g.position.addScaledVector(g.velocity, dt);

      // Ground collision - bounce
      if (g.position.y < 0.1) {
        g.position.y = 0.1;
        g.velocity.y *= -0.3; // Bounce with energy loss
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
        g.angularVelocity.multiplyScalar(0.5);
      }

      // Rotation
      g.rotation.x += g.angularVelocity.x * dt;
      g.rotation.y += g.angularVelocity.y * dt;
      g.rotation.z += g.angularVelocity.z * dt;

      // Fade out near end of life
      const alpha = g.lifetime > g.maxLifetime * 0.7
        ? 1 - (g.lifetime - g.maxLifetime * 0.7) / (g.maxLifetime * 0.3)
        : 1;
      const scale = g.scale * alpha;

      // Build transform matrix with rotation - reuse dummyScale to avoid allocation
      this.dummyMatrix.makeRotationFromEuler(g.rotation);
      this.dummyScale.set(scale, scale, scale);
      this.dummyMatrix.scale(this.dummyScale);
      this.dummyMatrix.setPosition(g.position);
      this.gibInstances.setMatrixAt(g.index, this.dummyMatrix);

      needsUpdate = true;
    }

    if (needsUpdate) {
      this.gibInstances.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Clear all decals and footprints (called on map rebuild)
   */
  clearDecals(): void {
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    // Reset blood decals
    for (let i = 0; i < this.MAX_BLOOD_DECALS; i++) {
      this.bloodDecalInstances.setMatrixAt(i, hiddenMatrix);
    }
    this.bloodDecalInstances.instanceMatrix.needsUpdate = true;
    this.nextDecalIndex = 0;
    this.decalCount = 0;

    // Reset footprints
    for (let i = 0; i < this.MAX_FOOTPRINTS; i++) {
      this.footprintInstances.setMatrixAt(i, hiddenMatrix);
    }
    this.footprintInstances.instanceMatrix.needsUpdate = true;
    this.nextFootprintIndex = 0;

    // Clear blood trail tracking
    this.bloodTrails.clear();

    // Reset wall splatters
    for (let i = 0; i < this.MAX_WALL_SPLATTERS; i++) {
      this.wallSplatterInstances.setMatrixAt(i, hiddenMatrix);
    }
    this.wallSplatterInstances.instanceMatrix.needsUpdate = true;
    this.nextWallSplatterIndex = 0;
  }

  /**
   * Get active particle count (for debugging)
   */
  getActiveParticleCount(): number {
    return this.particles.length;
  }
}
