/**
 * ThermobaricEffect - Optimized thermobaric explosion with object pooling
 *
 * Performance optimizations:
 * - Pre-allocated InstancedMesh for fire/smoke particles (no per-explosion allocation)
 * - Shared static geometries
 * - Cached object references (no getObjectByName lookups)
 * - Reusable shockwave pool
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

// ============================================================================
// Shared Static Resources (created once, reused by all explosions)
// ============================================================================

class ExplosionResources {
  // Geometries (shared)
  static ringGeometry: THREE.RingGeometry;
  static sphereGeometry: THREE.SphereGeometry;
  static smokeGeometry: THREE.SphereGeometry;
  static fireballGeometry: THREE.SphereGeometry;
  static scorchGeometry: THREE.CircleGeometry;

  // Pre-cached materials (shared, avoids shader recompilation)
  static flashMaterial: THREE.MeshBasicMaterial;
  static fireballOuterMaterial: THREE.MeshBasicMaterial;
  static fireballMidMaterial: THREE.MeshBasicMaterial;
  static fireballCoreMaterial: THREE.MeshBasicMaterial;
  static fireballFlashMaterial: THREE.MeshBasicMaterial;
  static scorchMaterial: THREE.MeshBasicMaterial;
  static shockwaveMaterials: Map<string, THREE.MeshBasicMaterial> = new Map();

  static initialized = false;

  static init(): void {
    if (this.initialized) return;

    // Geometries
    this.ringGeometry = new THREE.RingGeometry(0.85, 1.0, 32);
    this.sphereGeometry = new THREE.SphereGeometry(1, 12, 12);
    this.smokeGeometry = new THREE.SphereGeometry(1, 6, 6);
    this.fireballGeometry = new THREE.SphereGeometry(1, 24, 18);
    this.scorchGeometry = new THREE.CircleGeometry(1, 24);

    // Pre-create all materials (shader compilation happens here, once)
    this.flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    this.fireballOuterMaterial = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.fireballMidMaterial = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.fireballCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xaaeeff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });

    this.fireballFlashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    this.scorchMaterial = new THREE.MeshBasicMaterial({
      color: 0x2244aa,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Pre-create shockwave materials for each type
    const shockwaveConfigs = [
      { key: 'primary', color: 0x88ccff, opacity: 0.6, blending: THREE.AdditiveBlending },
      { key: 'secondary', color: 0x66aaff, opacity: 0.5, blending: THREE.AdditiveBlending },
      { key: 'heat', color: 0xaaddff, opacity: 0.3, blending: THREE.AdditiveBlending },
      { key: 'implosion', color: 0x6644aa, opacity: 0.4, blending: THREE.NormalBlending },
    ];

    for (const config of shockwaveConfigs) {
      this.shockwaveMaterials.set(config.key, new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: config.opacity,
        blending: config.blending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }));
    }

    this.initialized = true;
  }

  /**
   * Pre-warm all shaders by forcing GPU compilation
   * Call this during game loading to avoid stutter on first explosion
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static prewarm(scene: THREE.Scene, renderer: any): void {
    this.init();

    // Create temporary meshes with all materials to force shader compilation
    const tempMeshes: THREE.Mesh[] = [];

    // Flash
    const flash = new THREE.Mesh(this.sphereGeometry, this.flashMaterial);
    flash.position.set(0, -1000, 0); // Off-screen
    flash.scale.setScalar(0.001);
    scene.add(flash);
    tempMeshes.push(flash);

    // Fireball layers
    const fireball = new THREE.Mesh(this.fireballGeometry, this.fireballOuterMaterial);
    fireball.position.set(0, -1000, 0);
    fireball.scale.setScalar(0.001);
    scene.add(fireball);
    tempMeshes.push(fireball);

    const mid = new THREE.Mesh(this.sphereGeometry, this.fireballMidMaterial);
    mid.position.set(0, -1000, 0);
    mid.scale.setScalar(0.001);
    scene.add(mid);
    tempMeshes.push(mid);

    const core = new THREE.Mesh(this.sphereGeometry, this.fireballCoreMaterial);
    core.position.set(0, -1000, 0);
    core.scale.setScalar(0.001);
    scene.add(core);
    tempMeshes.push(core);

    const innerFlash = new THREE.Mesh(this.sphereGeometry, this.fireballFlashMaterial);
    innerFlash.position.set(0, -1000, 0);
    innerFlash.scale.setScalar(0.001);
    scene.add(innerFlash);
    tempMeshes.push(innerFlash);

    // Scorch
    const scorch = new THREE.Mesh(this.scorchGeometry, this.scorchMaterial);
    scorch.position.set(0, -1000, 0);
    scorch.scale.setScalar(0.001);
    scene.add(scorch);
    tempMeshes.push(scorch);

    // Shockwaves
    for (const mat of this.shockwaveMaterials.values()) {
      const ring = new THREE.Mesh(this.ringGeometry, mat);
      ring.position.set(0, -1000, 0);
      ring.scale.setScalar(0.001);
      scene.add(ring);
      tempMeshes.push(ring);
    }

    // Force a render to compile shaders
    // This is the key - rendering once compiles all shaders
    renderer.render(scene, new THREE.PerspectiveCamera());

    // Clean up temp meshes (keep materials/geometries)
    for (const mesh of tempMeshes) {
      scene.remove(mesh);
    }

    console.log('ThermobaricEffect shaders pre-warmed');
  }
}

// ============================================================================
// Particle data (no mesh allocation per particle)
// ============================================================================

interface ParticleData {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  baseScale: number;
  colorIndex: number;
}

interface ShockwaveData {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  startTime: number;
  duration: number;
  maxRadius: number;
  type: 'primary' | 'secondary' | 'implosion' | 'heat';
  baseOpacity: number;
  active: boolean;
}

// ============================================================================
// ThermobaricEffect - Optimized with pooling
// ============================================================================

export class ThermobaricEffect {
  private scene: THREE.Scene;
  private position: THREE.Vector3;
  private radius: number;
  private startTime: number;
  private isComplete = false;

  // Pre-allocated instanced meshes for particles
  private static fireInstances: THREE.InstancedMesh | null = null;
  private static smokeInstances: THREE.InstancedMesh | null = null;
  private static readonly MAX_FIRE_PARTICLES = 50;
  private static readonly MAX_SMOKE_PARTICLES = 30;

  // Particle data arrays (reused)
  private fireParticles: ParticleData[] = [];
  private smokeParticles: ParticleData[] = [];

  // Shockwave pool
  private shockwaves: ShockwaveData[] = [];

  // Main effect meshes
  private centralFlash: THREE.Mesh | null = null;
  private fireball: THREE.Mesh | null = null;
  private fireballMidLayer: THREE.Mesh | null = null;
  private fireballCore: THREE.Mesh | null = null;
  private fireballFlash: THREE.Mesh | null = null;
  private groundScorch: THREE.Mesh | null = null;
  private pointLight: THREE.PointLight | null = null;

  // Reusable matrix for instancing
  private static dummyMatrix = new THREE.Matrix4();
  private static dummyColor = new THREE.Color();
  private static hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(scene: THREE.Scene, position: { x: number; y: number; z: number }, radius: number) {
    this.scene = scene;
    this.position = new THREE.Vector3(position.x, position.y, position.z);
    this.radius = radius;
    this.startTime = performance.now();

    ExplosionResources.init();
    this.initInstancedMeshes();
    this.createEffect();
  }

  private initInstancedMeshes(): void {
    // Create shared instanced meshes only once
    if (!ThermobaricEffect.fireInstances) {
      const fireMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
      });
      ThermobaricEffect.fireInstances = new THREE.InstancedMesh(
        ExplosionResources.sphereGeometry,
        fireMat,
        ThermobaricEffect.MAX_FIRE_PARTICLES
      );
      ThermobaricEffect.fireInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      ThermobaricEffect.fireInstances.frustumCulled = false;

      // Initialize all as hidden
      for (let i = 0; i < ThermobaricEffect.MAX_FIRE_PARTICLES; i++) {
        ThermobaricEffect.fireInstances.setMatrixAt(i, ThermobaricEffect.hiddenMatrix);
        ThermobaricEffect.fireInstances.setColorAt(i, new THREE.Color(0x000000));
      }
      ThermobaricEffect.fireInstances.instanceMatrix.needsUpdate = true;
    }

    if (!ThermobaricEffect.smokeInstances) {
      const smokeMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.7,
      });
      ThermobaricEffect.smokeInstances = new THREE.InstancedMesh(
        ExplosionResources.smokeGeometry,
        smokeMat,
        ThermobaricEffect.MAX_SMOKE_PARTICLES
      );
      ThermobaricEffect.smokeInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      ThermobaricEffect.smokeInstances.frustumCulled = false;

      for (let i = 0; i < ThermobaricEffect.MAX_SMOKE_PARTICLES; i++) {
        ThermobaricEffect.smokeInstances.setMatrixAt(i, ThermobaricEffect.hiddenMatrix);
        ThermobaricEffect.smokeInstances.setColorAt(i, new THREE.Color(0x333333));
      }
      ThermobaricEffect.smokeInstances.instanceMatrix.needsUpdate = true;
    }

    // Add to scene if not already there
    if (!ThermobaricEffect.fireInstances.parent) {
      this.scene.add(ThermobaricEffect.fireInstances);
    }
    if (!ThermobaricEffect.smokeInstances.parent) {
      this.scene.add(ThermobaricEffect.smokeInstances);
    }
  }

  private createEffect(): void {
    this.createCentralFlash();
    this.createShockwave(0, 300, this.radius * 1.5, 'primary');
    this.createFireball();
    this.createShockwave(100, 400, this.radius * 1.2, 'secondary');
    this.createShockwave(150, 500, this.radius * 1.3, 'heat');
    this.createShockwave(400, 300, this.radius * 0.8, 'implosion');
    this.createShockwave(500, 400, this.radius * 1.4, 'secondary');
    this.createFireParticles(50);
    this.createSmokeParticles(30);
    this.createGroundScorch();
    this.createPointLight();
  }

  private createCentralFlash(): void {
    // Clone pre-compiled material (fast - no shader recompilation)
    const flashMat = ExplosionResources.flashMaterial.clone();

    this.centralFlash = new THREE.Mesh(ExplosionResources.sphereGeometry, flashMat);
    this.centralFlash.position.copy(this.position);
    this.centralFlash.position.y += 0.5;
    this.centralFlash.scale.setScalar(0.1);
    this.scene.add(this.centralFlash);
  }

  private createFireball(): void {
    // Clone pre-compiled materials (fast - shader already compiled)
    const outerMat = ExplosionResources.fireballOuterMaterial.clone();

    this.fireball = new THREE.Mesh(ExplosionResources.fireballGeometry, outerMat);
    this.fireball.position.copy(this.position);
    this.fireball.position.y += 0.5;
    this.fireball.scale.setScalar(0.1);
    this.scene.add(this.fireball);

    // Middle layer
    const midMat = ExplosionResources.fireballMidMaterial.clone();
    this.fireballMidLayer = new THREE.Mesh(ExplosionResources.sphereGeometry, midMat);
    this.fireballMidLayer.scale.setScalar(0.7);
    this.fireball.add(this.fireballMidLayer);

    // Inner core
    const coreMat = ExplosionResources.fireballCoreMaterial.clone();
    this.fireballCore = new THREE.Mesh(ExplosionResources.sphereGeometry, coreMat);
    this.fireballCore.scale.setScalar(0.4);
    this.fireball.add(this.fireballCore);

    // Inner flash
    const flashMat = ExplosionResources.fireballFlashMaterial.clone();
    this.fireballFlash = new THREE.Mesh(ExplosionResources.sphereGeometry, flashMat);
    this.fireballFlash.scale.setScalar(0.2);
    this.fireball.add(this.fireballFlash);
  }

  private createShockwave(delay: number, duration: number, maxRadius: number, type: ShockwaveData['type']): void {
    // Clone pre-compiled material (fast - shader already compiled)
    const baseMaterial = ExplosionResources.shockwaveMaterials.get(type)!;
    const material = baseMaterial.clone();
    const opacity = baseMaterial.opacity;

    const mesh = new THREE.Mesh(ExplosionResources.ringGeometry, material);
    mesh.position.copy(this.position);
    mesh.position.y = 0.15;
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      material,
      startTime: this.startTime + delay,
      duration,
      maxRadius,
      type,
      baseOpacity: opacity,
      active: true,
    });
  }

  private createFireParticles(count: number): void {
    const fireColors = [0xffffff, 0xaaddff, 0x66ccff, 0x4488ff, 0x88aaff];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * this.radius * 0.5;
      const speed = 3 + Math.random() * 8;
      const upward = 2 + Math.random() * 6;

      this.fireParticles.push({
        active: true,
        position: new THREE.Vector3(
          this.position.x + Math.cos(angle) * dist,
          this.position.y + 0.3 + Math.random() * 0.5,
          this.position.z + Math.sin(angle) * dist
        ),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          upward,
          Math.sin(angle) * speed
        ),
        lifetime: 0,
        maxLifetime: 0.3 + Math.random() * 0.5,
        baseScale: 0.1 + Math.random() * 0.2,
        colorIndex: Math.floor(Math.random() * fireColors.length),
      });
    }
  }

  private createSmokeParticles(count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * 1;

      this.smokeParticles.push({
        active: true,
        position: new THREE.Vector3(
          this.position.x,
          this.position.y + 0.5 + Math.random() * 0.5,
          this.position.z
        ),
        velocity: new THREE.Vector3(
          Math.cos(angle) * spread,
          3 + Math.random() * 3,
          Math.sin(angle) * spread
        ),
        lifetime: 0,
        maxLifetime: 1.5 + Math.random() * 1.0,
        baseScale: 0.5 + Math.random() * 1.0,
        colorIndex: 0,
      });
    }
  }

  private createGroundScorch(): void {
    // Clone pre-compiled material
    const scorchMat = ExplosionResources.scorchMaterial.clone();

    this.groundScorch = new THREE.Mesh(ExplosionResources.scorchGeometry, scorchMat);
    this.groundScorch.position.copy(this.position);
    this.groundScorch.position.y = 0.02;
    this.groundScorch.rotation.x = -Math.PI / 2;
    this.groundScorch.scale.setScalar(this.radius * 1.2);
    this.scene.add(this.groundScorch);
  }

  /**
   * Pre-warm explosion shaders during game loading
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static prewarm(scene: THREE.Scene, renderer: any): void {
    ExplosionResources.prewarm(scene, renderer);
  }

  private createPointLight(): void {
    this.pointLight = new THREE.PointLight(0x66aaff, 15, this.radius * 3);
    this.pointLight.position.copy(this.position);
    this.pointLight.position.y += 1;
    this.scene.add(this.pointLight);
  }

  update(): boolean {
    if (this.isComplete) return true;

    const now = performance.now();
    const elapsed = (now - this.startTime) / 1000;

    this.updateCentralFlash(elapsed);
    this.updateFireball(elapsed);
    this.updateShockwaves(now);
    this.updateFireParticles(elapsed);
    this.updateSmokeParticles(elapsed);
    this.updateGroundScorch(elapsed);
    this.updatePointLight(elapsed);

    // Check completion
    const allDone = elapsed > 2.5 &&
      !this.centralFlash &&
      !this.fireball &&
      this.shockwaves.every(s => !s.active) &&
      this.fireParticles.every(p => !p.active) &&
      this.smokeParticles.every(p => !p.active) &&
      !this.pointLight;

    if (allDone) {
      this.isComplete = true;
      this.fadeGroundScorch();
    }

    return this.isComplete;
  }

  private updateCentralFlash(elapsed: number): void {
    if (!this.centralFlash) return;

    const progress = Math.min(elapsed / 0.15, 1);
    if (progress < 1) {
      const scale = 0.1 + progress * this.radius * 0.8;
      this.centralFlash.scale.setScalar(scale);
      (this.centralFlash.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
    } else {
      this.scene.remove(this.centralFlash);
      (this.centralFlash.material as THREE.Material).dispose();
      this.centralFlash = null;
    }
  }

  private updateFireball(elapsed: number): void {
    if (!this.fireball) return;

    const start = 0.02;
    const duration = 1.0;
    const t = elapsed - start;

    if (t > 0 && t < duration) {
      const progress = t / duration;

      let scale: number;
      if (progress < 0.35) {
        const expandT = progress / 0.35;
        scale = this.radius * 0.9 * (1 - Math.pow(1 - expandT, 3));
      } else {
        const shrinkT = (progress - 0.35) / 0.65;
        scale = this.radius * 0.9 * (1 - shrinkT * 0.5);
      }
      this.fireball.scale.setScalar(Math.max(0.1, scale));

      (this.fireball.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - progress * 0.8);

      if (this.fireballMidLayer) {
        this.fireballMidLayer.scale.setScalar(Math.max(0.1, 0.7 - progress * 0.2));
        (this.fireballMidLayer.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - progress * 0.9);
      }

      if (this.fireballCore) {
        this.fireballCore.scale.setScalar(Math.max(0.05, 0.4 * (1 - progress * 0.8)));
        (this.fireballCore.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - progress * 1.2);
      }

      if (this.fireballFlash) {
        this.fireballFlash.scale.setScalar(Math.max(0.02, 0.2 * (1 - progress * 0.5)));
        (this.fireballFlash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress * 2);
      }
    } else if (t >= duration) {
      this.scene.remove(this.fireball);
      (this.fireball.material as THREE.Material).dispose();
      this.fireball = null;
      this.fireballMidLayer = null;
      this.fireballCore = null;
      this.fireballFlash = null;
    }
  }

  private updateShockwaves(now: number): void {
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;

      const swElapsed = now - sw.startTime;
      if (swElapsed < 0) continue;

      const progress = Math.min(swElapsed / sw.duration, 1);
      sw.material.opacity = sw.baseOpacity * (1 - progress);

      if (sw.type === 'implosion') {
        sw.mesh.scale.setScalar(Math.max(0.1, sw.maxRadius * (1 - progress * 0.7)));
      } else {
        sw.mesh.scale.setScalar(sw.maxRadius * progress);
      }

      if (progress >= 1) {
        this.scene.remove(sw.mesh);
        sw.material.dispose();
        sw.active = false;
      }
    }
  }

  private updateFireParticles(_elapsed: number): void {
    const fireColors = [0xffffff, 0xaaddff, 0x66ccff, 0x4488ff, 0x88aaff];
    const gravity = -15;
    const dt = 0.016;
    let needsUpdate = false;

    for (let i = 0; i < this.fireParticles.length; i++) {
      const p = this.fireParticles[i];
      if (!p.active) continue;

      p.lifetime += dt;

      if (p.lifetime >= p.maxLifetime) {
        p.active = false;
        ThermobaricEffect.fireInstances!.setMatrixAt(i, ThermobaricEffect.hiddenMatrix);
        needsUpdate = true;
        continue;
      }

      // Physics
      p.velocity.y += gravity * dt;
      p.position.addScaledVector(p.velocity, dt);

      // Update instance
      const life = 1 - p.lifetime / p.maxLifetime;
      const scale = p.baseScale * (0.5 + life * 0.5);

      ThermobaricEffect.dummyMatrix.makeScale(scale, scale, scale);
      ThermobaricEffect.dummyMatrix.setPosition(p.position);
      ThermobaricEffect.fireInstances!.setMatrixAt(i, ThermobaricEffect.dummyMatrix);

      ThermobaricEffect.dummyColor.setHex(fireColors[p.colorIndex]).multiplyScalar(life);
      ThermobaricEffect.fireInstances!.setColorAt(i, ThermobaricEffect.dummyColor);

      needsUpdate = true;
    }

    if (needsUpdate) {
      ThermobaricEffect.fireInstances!.instanceMatrix.needsUpdate = true;
      if (ThermobaricEffect.fireInstances!.instanceColor) {
        ThermobaricEffect.fireInstances!.instanceColor.needsUpdate = true;
      }
    }
  }

  private updateSmokeParticles(elapsed: number): void {
    const smokeDelay = 0.3;
    if (elapsed <= smokeDelay) return;

    const dt = 0.016;
    let needsUpdate = false;

    for (let i = 0; i < this.smokeParticles.length; i++) {
      const s = this.smokeParticles[i];
      if (!s.active) continue;

      s.lifetime += dt;

      if (s.lifetime >= s.maxLifetime) {
        s.active = false;
        ThermobaricEffect.smokeInstances!.setMatrixAt(i, ThermobaricEffect.hiddenMatrix);
        needsUpdate = true;
        continue;
      }

      // Physics
      s.velocity.multiplyScalar(0.98);
      s.position.addScaledVector(s.velocity, dt);

      // Fade in then out
      const life = s.lifetime / s.maxLifetime;
      let opacity: number;
      if (life < 0.2) {
        opacity = (life / 0.2) * 0.7;
      } else {
        opacity = ((1 - (life - 0.2) / 0.8)) * 0.7;
      }

      const growFactor = 1 + life * 2;
      const scale = s.baseScale * 0.1 * growFactor;

      ThermobaricEffect.dummyMatrix.makeScale(scale, scale, scale);
      ThermobaricEffect.dummyMatrix.setPosition(s.position);
      ThermobaricEffect.smokeInstances!.setMatrixAt(i, ThermobaricEffect.dummyMatrix);

      const gray = 0.5 * opacity;
      ThermobaricEffect.dummyColor.setRGB(gray * 0.7, gray * 0.8, gray);
      ThermobaricEffect.smokeInstances!.setColorAt(i, ThermobaricEffect.dummyColor);

      needsUpdate = true;
    }

    if (needsUpdate) {
      ThermobaricEffect.smokeInstances!.instanceMatrix.needsUpdate = true;
      if (ThermobaricEffect.smokeInstances!.instanceColor) {
        ThermobaricEffect.smokeInstances!.instanceColor.needsUpdate = true;
      }
    }
  }

  private updateGroundScorch(elapsed: number): void {
    if (!this.groundScorch) return;
    const opacity = Math.min(elapsed / 0.5, 0.6);
    (this.groundScorch.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  private updatePointLight(elapsed: number): void {
    if (!this.pointLight) return;

    const duration = 1.0;
    if (elapsed < duration) {
      const progress = elapsed / duration;
      const intensity = progress < 0.1
        ? 25 * (progress / 0.1)
        : 25 * (1 - (progress - 0.1) / 0.9);
      this.pointLight.intensity = Math.max(0, intensity);

      if (progress < 0.15) {
        this.pointLight.color.setHex(0xffffff);
      } else if (progress < 0.4) {
        this.pointLight.color.setHex(0xaaddff);
      } else {
        this.pointLight.color.setHex(0x4488ff);
      }
    } else {
      this.scene.remove(this.pointLight);
      this.pointLight = null;
    }
  }

  private fadeGroundScorch(): void {
    if (!this.groundScorch) return;

    const scorch = this.groundScorch;
    const scene = this.scene;

    const fade = () => {
      const mat = scorch.material as THREE.MeshBasicMaterial;
      mat.opacity -= 0.01;
      if (mat.opacity <= 0) {
        scene.remove(scorch);
        mat.dispose();
      } else {
        requestAnimationFrame(fade);
      }
    };
    setTimeout(fade, 3000);
  }

  dispose(): void {
    // Clean up non-pooled resources
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
      (this.groundScorch.material as THREE.Material).dispose();
    }
    if (this.pointLight) {
      this.scene.remove(this.pointLight);
    }

    for (const sw of this.shockwaves) {
      if (sw.active) {
        this.scene.remove(sw.mesh);
        sw.material.dispose();
      }
    }

    // Hide all particles in instanced meshes
    for (let i = 0; i < this.fireParticles.length; i++) {
      ThermobaricEffect.fireInstances?.setMatrixAt(i, ThermobaricEffect.hiddenMatrix);
    }
    for (let i = 0; i < this.smokeParticles.length; i++) {
      ThermobaricEffect.smokeInstances?.setMatrixAt(i, ThermobaricEffect.hiddenMatrix);
    }

    if (ThermobaricEffect.fireInstances) {
      ThermobaricEffect.fireInstances.instanceMatrix.needsUpdate = true;
    }
    if (ThermobaricEffect.smokeInstances) {
      ThermobaricEffect.smokeInstances.instanceMatrix.needsUpdate = true;
    }
  }
}
