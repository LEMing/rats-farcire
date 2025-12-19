/**
 * ThermobaricEffect - Realistic thermobaric explosion with multiple shockwaves
 *
 * Phases:
 * 1. Initial flash (0-0.1s) - Bright white detonation
 * 2. Primary shockwave (0-0.3s) - Fast pressure wave
 * 3. Fireball expansion (0.1-0.6s) - Fuel-air ignition
 * 4. Vacuum implosion (0.4-0.7s) - Oxygen depletion creates inward pull
 * 5. Secondary shockwave (0.5-0.9s) - Aftershock from vacuum collapse
 * 6. Smoke/debris (0.6-2.0s) - Rising smoke column
 */

import * as THREE from 'three';

interface ShockwaveRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  startTime: number;
  duration: number;
  maxRadius: number;
  delay: number;
  type: 'primary' | 'secondary' | 'implosion' | 'heat';
  baseOpacity: number;
}

interface FireParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  baseScale: number;
}

interface SmokeParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  rotationSpeed: number;
}

export class ThermobaricEffect {
  private scene: THREE.Scene;
  private position: THREE.Vector3;
  private radius: number;
  private startTime: number;
  private isComplete = false;

  private shockwaves: ShockwaveRing[] = [];
  private fireParticles: FireParticle[] = [];
  private smokeParticles: SmokeParticle[] = [];
  private centralFlash: THREE.Mesh | null = null;
  private fireball: THREE.Mesh | null = null;
  private groundScorch: THREE.Mesh | null = null;
  private pointLight: THREE.PointLight | null = null;

  // Shared geometries and materials
  private static ringGeometry: THREE.RingGeometry | null = null;
  private static sphereGeometry: THREE.SphereGeometry | null = null;
  private static smokeGeometry: THREE.SphereGeometry | null = null;

  constructor(scene: THREE.Scene, position: { x: number; y: number; z: number }, radius: number) {
    this.scene = scene;
    this.position = new THREE.Vector3(position.x, position.y, position.z);
    this.radius = radius;
    this.startTime = performance.now();

    this.initGeometries();
    this.createEffect();
  }

  private initGeometries(): void {
    if (!ThermobaricEffect.ringGeometry) {
      ThermobaricEffect.ringGeometry = new THREE.RingGeometry(0.8, 1.0, 64);
    }
    if (!ThermobaricEffect.sphereGeometry) {
      ThermobaricEffect.sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
    }
    if (!ThermobaricEffect.smokeGeometry) {
      ThermobaricEffect.smokeGeometry = new THREE.SphereGeometry(1, 8, 8);
    }
  }

  private createEffect(): void {
    // 1. Central flash
    this.createCentralFlash();

    // 2. Primary shockwave (fastest, white/blue)
    this.createShockwave(0, 300, this.radius * 1.5, 'primary');

    // 3. Fireball
    this.createFireball();

    // 4. Secondary pressure wave (orange)
    this.createShockwave(100, 400, this.radius * 1.2, 'secondary');

    // 5. Heat distortion wave
    this.createShockwave(150, 500, this.radius * 1.3, 'heat');

    // 6. Vacuum implosion wave (moves INWARD)
    this.createShockwave(400, 300, this.radius * 0.8, 'implosion');

    // 7. Aftershock wave
    this.createShockwave(500, 400, this.radius * 1.4, 'secondary');

    // 8. Fire particles
    this.createFireParticles(50);

    // 9. Smoke column
    this.createSmokeParticles(30);

    // 10. Ground scorch mark
    this.createGroundScorch();

    // 11. Point light for illumination
    this.createPointLight();
  }

  private createCentralFlash(): void {
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    this.centralFlash = new THREE.Mesh(ThermobaricEffect.sphereGeometry!, flashMat);
    this.centralFlash.position.copy(this.position);
    this.centralFlash.position.y += 0.5;
    this.centralFlash.scale.setScalar(0.1);
    this.scene.add(this.centralFlash);
  }

  private createFireball(): void {
    // Create volumetric explosion dome - blue/cyan plasma bubble
    // Using MeshBasicMaterial for WebGPU compatibility

    // Outer bubble - cyan/blue transparent
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const bubbleGeom = new THREE.SphereGeometry(1, 32, 24);
    this.fireball = new THREE.Mesh(bubbleGeom, outerMat);
    this.fireball.position.copy(this.position);
    this.fireball.position.y += 0.5;
    this.fireball.scale.setScalar(0.1);
    this.scene.add(this.fireball);

    // Middle layer - brighter cyan
    const midMat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const midLayer = new THREE.Mesh(ThermobaricEffect.sphereGeometry!, midMat);
    midLayer.name = 'midLayer';
    midLayer.scale.setScalar(0.7);
    this.fireball.add(midLayer);

    // Inner bright core - white/cyan
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xaaeeff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(ThermobaricEffect.sphereGeometry!, coreMat);
    core.name = 'fireballCore';
    core.scale.setScalar(0.4);
    this.fireball.add(core);

    // Innermost bright white flash
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });
    const flash = new THREE.Mesh(ThermobaricEffect.sphereGeometry!, flashMat);
    flash.name = 'innerFlash';
    flash.scale.setScalar(0.2);
    this.fireball.add(flash);
  }

  private createShockwave(delay: number, duration: number, maxRadius: number, type: ShockwaveRing['type']): void {
    // Use MeshBasicMaterial for WebGPU compatibility
    let color: number;
    let opacity: number;

    switch (type) {
      case 'primary':
        color = 0x88ccff; // Cyan/white
        opacity = 0.6;
        break;
      case 'secondary':
        color = 0x66aaff; // Blue
        opacity = 0.5;
        break;
      case 'heat':
        color = 0xaaddff; // Light cyan
        opacity = 0.3;
        break;
      case 'implosion':
        color = 0x6644aa; // Purple
        opacity = 0.4;
        break;
    }

    const shockwaveMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: type === 'implosion' ? THREE.NormalBlending : THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create ring geometry - thin ring
    const innerRadius = 0.85;
    const outerRadius = 1.0;
    const ringGeom = new THREE.RingGeometry(innerRadius, outerRadius, 64);

    const ring = new THREE.Mesh(ringGeom, shockwaveMat);
    ring.position.copy(this.position);
    ring.position.y = 0.15;
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(0.01);
    this.scene.add(ring);

    this.shockwaves.push({
      mesh: ring,
      material: shockwaveMat,
      startTime: this.startTime + delay,
      duration,
      maxRadius,
      delay,
      type,
      baseOpacity: opacity,
    });
  }

  private createFireParticles(count: number): void {
    // Blue/cyan plasma colors
    const fireColors = [0xffffff, 0xaaddff, 0x66ccff, 0x4488ff, 0x88aaff];

    for (let i = 0; i < count; i++) {
      const color = fireColors[Math.floor(Math.random() * fireColors.length)];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(ThermobaricEffect.sphereGeometry!, mat);

      // Random position within explosion radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * this.radius * 0.5;
      mesh.position.set(
        this.position.x + Math.cos(angle) * dist,
        this.position.y + 0.3 + Math.random() * 0.5,
        this.position.z + Math.sin(angle) * dist
      );

      const baseScale = 0.1 + Math.random() * 0.2;
      mesh.scale.setScalar(baseScale);

      // Velocity - mostly outward and upward
      const speed = 3 + Math.random() * 8;
      const upward = 2 + Math.random() * 6;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        upward,
        Math.sin(angle) * speed
      );

      this.scene.add(mesh);

      this.fireParticles.push({
        mesh,
        velocity,
        lifetime: 0,
        maxLifetime: 0.3 + Math.random() * 0.5,
        baseScale,
      });
    }
  }

  private createSmokeParticles(count: number): void {
    for (let i = 0; i < count; i++) {
      // Light blue-gray smoke
      const gray = 0.4 + Math.random() * 0.3;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(gray * 0.7, gray * 0.8, gray),
        transparent: true,
        opacity: 0,
      });

      const mesh = new THREE.Mesh(ThermobaricEffect.smokeGeometry!, mat);

      // Start at center
      mesh.position.copy(this.position);
      mesh.position.y += 0.5 + Math.random() * 0.5;

      const baseScale = 0.5 + Math.random() * 1.0;
      mesh.scale.setScalar(baseScale * 0.1);

      // Slow upward velocity with slight spread
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * 1;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * spread,
        3 + Math.random() * 3,
        Math.sin(angle) * spread
      );

      this.scene.add(mesh);

      this.smokeParticles.push({
        mesh,
        velocity,
        lifetime: 0,
        maxLifetime: 1.5 + Math.random() * 1.0,
        rotationSpeed: (Math.random() - 0.5) * 2,
      });
    }
  }

  private createGroundScorch(): void {
    // Blue energy glow on ground instead of black scorch
    const scorchMat = new THREE.MeshBasicMaterial({
      color: 0x2244aa,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const scorchGeom = new THREE.CircleGeometry(this.radius * 1.2, 32);
    this.groundScorch = new THREE.Mesh(scorchGeom, scorchMat);
    this.groundScorch.position.copy(this.position);
    this.groundScorch.position.y = 0.02;
    this.groundScorch.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundScorch);
  }

  private createPointLight(): void {
    // Blue/cyan point light
    this.pointLight = new THREE.PointLight(0x66aaff, 15, this.radius * 3);
    this.pointLight.position.copy(this.position);
    this.pointLight.position.y += 1;
    this.scene.add(this.pointLight);
  }

  update(): boolean {
    if (this.isComplete) return true;

    const now = performance.now();
    const elapsed = (now - this.startTime) / 1000; // Convert to seconds

    // Update central flash (0-0.15s)
    if (this.centralFlash) {
      const flashProgress = Math.min(elapsed / 0.15, 1);
      if (flashProgress < 1) {
        const scale = 0.1 + flashProgress * this.radius * 0.8;
        this.centralFlash.scale.setScalar(scale);
        (this.centralFlash.material as THREE.MeshBasicMaterial).opacity = 1 - flashProgress;
      } else {
        this.scene.remove(this.centralFlash);
        this.centralFlash = null;
      }
    }

    // Update fireball bubble (0.02-1.0s)
    if (this.fireball) {
      const fireballStart = 0.02;
      const fireballDuration = 1.0;
      const fireballElapsed = elapsed - fireballStart;

      if (fireballElapsed > 0 && fireballElapsed < fireballDuration) {
        const progress = fireballElapsed / fireballDuration;

        // Rapid expansion then slow fade
        let scale: number;
        if (progress < 0.35) {
          const expandT = progress / 0.35;
          // Ease out for explosive feel
          scale = this.radius * 0.9 * (1 - Math.pow(1 - expandT, 3));
        } else {
          const shrinkT = (progress - 0.35) / 0.65;
          const maxScale = this.radius * 0.9;
          scale = maxScale * (1 - shrinkT * 0.5);
        }
        this.fireball.scale.setScalar(Math.max(0.1, scale));

        // Fade outer layer
        const outerMat = this.fireball.material as THREE.MeshBasicMaterial;
        outerMat.opacity = 0.4 * (1 - progress * 0.8);

        // Animate middle layer
        const midLayer = this.fireball.getObjectByName('midLayer') as THREE.Mesh;
        if (midLayer) {
          const midScale = 0.7 - progress * 0.2;
          midLayer.scale.setScalar(Math.max(0.1, midScale));
          (midLayer.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - progress * 0.9);
        }

        // Animate inner core - shrinks and fades faster
        const core = this.fireball.getObjectByName('fireballCore') as THREE.Mesh;
        if (core) {
          const coreScale = 0.4 * (1 - progress * 0.8);
          core.scale.setScalar(Math.max(0.05, coreScale));
          (core.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - progress * 1.2);
        }

        // Animate innermost flash - fades quickly
        const flash = this.fireball.getObjectByName('innerFlash') as THREE.Mesh;
        if (flash) {
          const flashScale = 0.2 * (1 - progress * 0.5);
          flash.scale.setScalar(Math.max(0.02, flashScale));
          (flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress * 2);
        }
      } else if (fireballElapsed >= fireballDuration) {
        this.scene.remove(this.fireball);
        this.fireball.geometry.dispose();
        (this.fireball.material as THREE.Material).dispose();
        this.fireball = null;
      }
    }

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      const swElapsed = now - sw.startTime;

      if (swElapsed < 0) continue; // Not started yet

      const progress = Math.min(swElapsed / sw.duration, 1);

      // Fade out as progress increases
      sw.material.opacity = sw.baseOpacity * (1 - progress);

      if (sw.type === 'implosion') {
        // Implosion moves inward
        const scale = sw.maxRadius * (1 - progress * 0.7);
        sw.mesh.scale.setScalar(Math.max(0.1, scale));
      } else {
        // Normal waves expand outward
        const scale = sw.maxRadius * progress;
        sw.mesh.scale.setScalar(scale);
      }

      if (progress >= 1) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // Update fire particles
    const gravity = -15;
    for (let i = this.fireParticles.length - 1; i >= 0; i--) {
      const p = this.fireParticles[i];
      p.lifetime += 0.016;

      if (p.lifetime >= p.maxLifetime) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.fireParticles.splice(i, 1);
        continue;
      }

      // Physics
      p.velocity.y += gravity * 0.016;
      p.mesh.position.addScaledVector(p.velocity, 0.016);

      // Fade and shrink
      const life = 1 - p.lifetime / p.maxLifetime;
      const scale = p.baseScale * (0.5 + life * 0.5);
      p.mesh.scale.setScalar(scale);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = life;
    }

    // Update smoke particles (delayed start)
    const smokeDelay = 0.3;
    if (elapsed > smokeDelay) {
      for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
        const s = this.smokeParticles[i];
        s.lifetime += 0.016;

        if (s.lifetime >= s.maxLifetime) {
          this.scene.remove(s.mesh);
          (s.mesh.material as THREE.Material).dispose();
          this.smokeParticles.splice(i, 1);
          continue;
        }

        // Slow down and spread
        s.velocity.multiplyScalar(0.98);
        s.mesh.position.addScaledVector(s.velocity, 0.016);
        s.mesh.rotation.y += s.rotationSpeed * 0.016;

        // Fade in, then out
        const life = s.lifetime / s.maxLifetime;
        let opacity: number;
        if (life < 0.2) {
          opacity = life / 0.2 * 0.7;
        } else {
          opacity = (1 - (life - 0.2) / 0.8) * 0.7;
        }
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;

        // Grow over time
        const growFactor = 1 + life * 2;
        s.mesh.scale.setScalar(s.mesh.scale.x * 1.005 * growFactor / growFactor);
      }
    }

    // Update ground scorch (fade in and stay)
    if (this.groundScorch) {
      const scorchOpacity = Math.min(elapsed / 0.5, 0.6);
      (this.groundScorch.material as THREE.MeshBasicMaterial).opacity = scorchOpacity;
    }

    // Update point light
    if (this.pointLight) {
      const lightDuration = 1.0;
      if (elapsed < lightDuration) {
        const lightProgress = elapsed / lightDuration;
        // Bright initial flash, then fade
        const intensity = lightProgress < 0.1
          ? 25 * (lightProgress / 0.1)
          : 25 * (1 - (lightProgress - 0.1) / 0.9);
        this.pointLight.intensity = Math.max(0, intensity);

        // Color shifts from white to cyan to blue
        if (lightProgress < 0.15) {
          this.pointLight.color.setHex(0xffffff);
        } else if (lightProgress < 0.4) {
          this.pointLight.color.setHex(0xaaddff);
        } else {
          this.pointLight.color.setHex(0x4488ff);
        }
      } else {
        this.scene.remove(this.pointLight);
        this.pointLight = null;
      }
    }

    // Check if effect is complete (all elements removed)
    const isComplete = elapsed > 2.5 &&
      !this.centralFlash &&
      !this.fireball &&
      this.shockwaves.length === 0 &&
      this.fireParticles.length === 0 &&
      this.smokeParticles.length === 0 &&
      !this.pointLight;

    if (isComplete) {
      this.isComplete = true;
      // Keep ground scorch for a while, then fade it
      if (this.groundScorch) {
        const fadeScorch = () => {
          if (!this.groundScorch) return;
          const mat = this.groundScorch.material as THREE.MeshBasicMaterial;
          mat.opacity -= 0.01;
          if (mat.opacity <= 0) {
            this.scene.remove(this.groundScorch);
            this.groundScorch.geometry.dispose();
            mat.dispose();
            this.groundScorch = null;
          } else {
            requestAnimationFrame(fadeScorch);
          }
        };
        setTimeout(fadeScorch, 3000);
      }
    }

    return this.isComplete;
  }

  dispose(): void {
    // Clean up any remaining objects
    if (this.centralFlash) {
      this.scene.remove(this.centralFlash);
      (this.centralFlash.material as THREE.Material).dispose();
    }
    if (this.fireball) {
      this.scene.remove(this.fireball);
      (this.fireball.material as THREE.Material).dispose();
    }
    if (this.groundScorch) {
      this.scene.remove(this.groundScorch);
      this.groundScorch.geometry.dispose();
      (this.groundScorch.material as THREE.Material).dispose();
    }
    if (this.pointLight) {
      this.scene.remove(this.pointLight);
    }

    for (const sw of this.shockwaves) {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      sw.material.dispose();
    }

    for (const p of this.fireParticles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }

    for (const s of this.smokeParticles) {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    }
  }
}
