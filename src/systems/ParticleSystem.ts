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
  color: THREE.Color;
  baseScale: number;
}

export class ParticleSystem {
  private readonly MAX_PARTICLES = 200;
  private readonly MAX_BLOOD_DECALS = 100;

  private particles: ParticleData[] = [];
  private particleInstances!: THREE.InstancedMesh;
  private freeParticleIndices: number[] = [];
  private dummyMatrix = new THREE.Matrix4();
  private dummyColor = new THREE.Color();

  // Blood decal instancing - no per-decal allocation
  private bloodDecalInstances!: THREE.InstancedMesh;
  private nextDecalIndex = 0;
  private decalCount = 0;

  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initParticleSystem();
    this.initBloodDecalSystem();
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

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Spawn a burst of blood particles at position
   */
  spawnBloodBurst(position: Vec3, enemyType: EnemyType, count: number = 15): void {
    const colorHex = BLOOD_COLORS[enemyType];
    this.dummyColor.setHex(colorHex);

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
        color: this.dummyColor.clone(),
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
      color: new THREE.Color(0xff6600), // Fire orange
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
        this.particles.splice(i, 1);
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

      // Darken color as it fades (simulate transparency)
      this.dummyColor.copy(p.color).multiplyScalar(alpha);
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
  }

  /**
   * Clear all decals (called on map rebuild)
   */
  clearDecals(): void {
    // Reset all decal instances to hidden (scale 0)
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_BLOOD_DECALS; i++) {
      this.bloodDecalInstances.setMatrixAt(i, hiddenMatrix);
    }
    this.bloodDecalInstances.instanceMatrix.needsUpdate = true;
    this.nextDecalIndex = 0;
    this.decalCount = 0;
  }

  /**
   * Get active particle count (for debugging)
   */
  getActiveParticleCount(): number {
    return this.particles.length;
  }
}
