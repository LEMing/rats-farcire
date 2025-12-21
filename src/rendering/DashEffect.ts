/**
 * DashEffect - Visual effects for dash ability
 *
 * Creates:
 * - Shockwave ring on dash start
 * - Speed lines/streaks during dash
 * - Energy particles
 * - Ground distortion ring
 */

import * as THREE from 'three';

// ============================================================================
// Shared Resources
// ============================================================================

class DashResources {
  static ringGeometry: THREE.RingGeometry;
  static streakGeometry: THREE.PlaneGeometry;
  static particleGeometry: THREE.SphereGeometry;
  static burstGeometry: THREE.CircleGeometry;

  static shockwaveMaterial: THREE.MeshBasicMaterial;
  static streakMaterial: THREE.MeshBasicMaterial;
  static particleMaterial: THREE.MeshBasicMaterial;
  static burstMaterial: THREE.MeshBasicMaterial;
  static glowMaterial: THREE.MeshBasicMaterial;

  static initialized = false;

  static init(): void {
    if (this.initialized) return;

    // Geometries
    this.ringGeometry = new THREE.RingGeometry(0.3, 1.0, 32);
    this.streakGeometry = new THREE.PlaneGeometry(0.08, 1.5);
    this.particleGeometry = new THREE.SphereGeometry(0.08, 6, 6);
    this.burstGeometry = new THREE.CircleGeometry(1, 24);

    // Materials
    this.shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.streakMaterial = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.particleMaterial = new THREE.MeshBasicMaterial({
      color: 0x66ddff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    this.burstMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.initialized = true;
  }
}

// ============================================================================
// Dash Effect
// ============================================================================

export class DashEffect {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private startTime: number;
  private duration: number;
  private position: THREE.Vector3;
  private direction: THREE.Vector2;

  // Effect components
  private burst: THREE.Mesh | null = null;
  private speedStreaks: THREE.Mesh[] = [];
  private particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];

  constructor(
    scene: THREE.Scene,
    position: { x: number; y: number; z: number },
    direction: { x: number; y: number },
    duration: number = 400
  ) {
    DashResources.init();

    this.scene = scene;
    this.group = new THREE.Group();
    this.startTime = performance.now();
    this.duration = duration;
    this.position = new THREE.Vector3(position.x, position.y, position.z);
    this.direction = new THREE.Vector2(direction.x, direction.y).normalize();

    this.createEffect();
    scene.add(this.group);
  }

  private createEffect(): void {
    // Directional burst flash (moves forward)
    this.createBurst();

    // Speed streaks behind the player
    this.createSpeedStreaks();

    // Energy particles expelled backward
    this.createParticles();
  }

  private createBurst(): void {
    const burstMat = DashResources.burstMaterial.clone();
    this.burst = new THREE.Mesh(DashResources.burstGeometry, burstMat);
    this.burst.position.copy(this.position);
    this.burst.position.y = 0.5;
    this.burst.rotation.x = -Math.PI / 2;
    this.burst.scale.set(0.3, 0.1, 1); // Elongated in dash direction
    // Rotate to face dash direction
    this.burst.rotation.z = -Math.atan2(this.direction.x, this.direction.y);
    this.group.add(this.burst);
  }

  private createSpeedStreaks(): void {
    const streakCount = 12;
    const angle = Math.atan2(this.direction.x, this.direction.y);

    for (let i = 0; i < streakCount; i++) {
      const streakMat = DashResources.streakMaterial.clone();
      const streak = new THREE.Mesh(DashResources.streakGeometry, streakMat);

      // Position behind the dash direction
      const offsetAngle = angle + (Math.random() - 0.5) * 1.2;
      const offsetDist = 0.3 + Math.random() * 0.5;
      const backDist = 0.5 + Math.random() * 1.0;

      streak.position.set(
        this.position.x - this.direction.x * backDist + Math.sin(offsetAngle) * offsetDist,
        0.3 + Math.random() * 0.8,
        this.position.z - this.direction.y * backDist + Math.cos(offsetAngle) * offsetDist
      );

      // Align with dash direction
      streak.rotation.y = -angle;
      streak.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;

      // Random scale
      streak.scale.set(0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.6, 1);

      this.speedStreaks.push(streak);
      this.group.add(streak);
    }
  }

  private createParticles(): void {
    const particleCount = 12;

    for (let i = 0; i < particleCount; i++) {
      const particleMat = DashResources.particleMaterial.clone();
      const particle = new THREE.Mesh(DashResources.particleGeometry, particleMat);

      // Start position at dash origin
      particle.position.copy(this.position);
      particle.position.y = 0.3 + Math.random() * 0.6;

      // Velocity - mostly backward from dash direction with some spread
      const spreadAngle = (Math.random() - 0.5) * Math.PI * 0.8;
      const baseAngle = Math.atan2(-this.direction.x, -this.direction.y);
      const angle = baseAngle + spreadAngle;
      const speed = 3 + Math.random() * 4;

      const velocity = new THREE.Vector3(
        Math.sin(angle) * speed,
        (Math.random() - 0.3) * 2,
        Math.cos(angle) * speed
      );

      // Random scale
      const scale = 0.6 + Math.random() * 0.8;
      particle.scale.setScalar(scale);

      this.particles.push({
        mesh: particle,
        velocity,
        life: 0.3 + Math.random() * 0.2,
      });

      this.group.add(particle);
    }
  }

  /**
   * Update the effect. Returns true when complete.
   */
  update(): boolean {
    const elapsed = (performance.now() - this.startTime) / 1000;
    const progress = elapsed / (this.duration / 1000);

    if (progress >= 1) {
      this.dispose();
      return true;
    }

    const dt = 0.016; // Approximate frame time

    // Update burst - moves forward in dash direction, elongates and fades
    if (this.burst) {
      const burstProgress = Math.min(elapsed * 8, 1);
      // Move forward in dash direction
      this.burst.position.x += this.direction.x * dt * 25;
      this.burst.position.z += this.direction.y * dt * 25;
      // Elongate in dash direction, shrink perpendicular
      const scaleX = 0.3 + burstProgress * 3;
      const scaleY = Math.max(0.05, 0.1 - burstProgress * 0.08);
      this.burst.scale.set(scaleX, scaleY, 1);
      const burstOpacity = Math.max(0, 1 - burstProgress * 1.5);
      (this.burst.material as THREE.MeshBasicMaterial).opacity = burstOpacity;
    }

    // Update speed streaks - stretch and fade
    for (const streak of this.speedStreaks) {
      const mat = streak.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.6 - progress * 1.5);

      // Move backward slightly
      streak.position.x -= this.direction.x * dt * 2;
      streak.position.z -= this.direction.y * dt * 2;

      // Stretch
      streak.scale.y += dt * 3;
    }

    // Update particles - physics simulation
    for (const p of this.particles) {
      p.life -= dt;

      if (p.life > 0) {
        // Apply velocity
        p.mesh.position.x += p.velocity.x * dt;
        p.mesh.position.y += p.velocity.y * dt;
        p.mesh.position.z += p.velocity.z * dt;

        // Gravity
        p.velocity.y -= 8 * dt;

        // Drag
        p.velocity.multiplyScalar(0.95);

        // Fade based on life
        const lifeRatio = Math.max(0, p.life / 0.4);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = lifeRatio * 0.8;

        // Shrink
        p.mesh.scale.multiplyScalar(0.97);
      } else {
        p.mesh.visible = false;
      }
    }

    return false;
  }

  private dispose(): void {
    this.scene.remove(this.group);

    // Dispose materials (they were cloned)
    if (this.burst) {
      (this.burst.material as THREE.Material).dispose();
    }
    for (const streak of this.speedStreaks) {
      (streak.material as THREE.Material).dispose();
    }
    for (const p of this.particles) {
      (p.mesh.material as THREE.Material).dispose();
    }
  }
}
