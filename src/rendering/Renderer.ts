import * as THREE from 'three/webgpu';
import {
  pass,
  uniform,
  uv,
  vec2,
  vec3,
  float,
  sin,
  mix,
  smoothstep,
  length,
  mul,
  add,
  sub,
  fract,
  dot,
  floor,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { MapData, Vec3, EnemyType } from '@shared/types';
import { TILE_SIZE, COLORS } from '@shared/constants';
import { BlurredEmblemMaterial } from './BlurredEmblemMaterial';
import { TargetingLaserMaterial } from './LaserMaterial';
import { MapRenderer } from './MapRenderer';
import { ZoneLighting } from './ZoneLighting';
import { ParticleSystem } from '../systems/ParticleSystem';
import { ThermobaricEffect } from './ThermobaricEffect';
import { debug } from '../utils/debug';

// ============================================================================
// Three.js Renderer with WebGPU and Isometric Camera
// ============================================================================

export class Renderer {
  public scene: THREE.Scene;
  public camera: THREE.OrthographicCamera;
  private renderer!: THREE.WebGPURenderer;
  private postProcessing!: THREE.PostProcessing;
  private usePostProcessing = true;

  // Camera settings for isometric view
  private readonly CAMERA_ZOOM = 14; // Closer view for shooter feel
  private readonly CAMERA_ANGLE = Math.PI / 4; // 45 degrees
  private readonly CAMERA_PITCH = Math.atan(1 / Math.sqrt(2)); // ~35.264 degrees (true isometric)
  private readonly CAMERA_LEAD = 3; // How far camera looks ahead toward aim
  private readonly CAMERA_SMOOTHING = 0.12; // Lower = smoother/slower follow

  // Camera follow state
  private cameraTarget = new THREE.Vector3();
  private currentCameraLookAt = new THREE.Vector3();

  // Geometry caches
  private geometries: Map<string, THREE.BufferGeometry> = new Map();
  private materials: Map<string, THREE.Material> = new Map();

  // Screen shake system
  private shakeIntensity = 0;
  private shakeDecay = 0.9;
  private shakeOffset = new THREE.Vector3();

  // Extracted particle system
  private particleSystem!: ParticleSystem;

  // Extracted map renderer
  private mapRenderer!: MapRenderer;
  private zoneLighting!: ZoneLighting;

  // Time uniform for animated shaders
  private readonly timeUniform = uniform(0);
  private time = 0;

  // Damage effect intensity (0-1, decays over time)
  private readonly damageIntensityUniform = uniform(0);
  private damageIntensity = 0;
  private readonly damageDecayRate = 3.0; // How fast damage effect fades

  // Low health effect (disabled - UI overlay handles this now)
  private readonly lowHealthUniform = uniform(0);

  // Active thermobaric effects
  private thermobaricEffects: ThermobaricEffect[] = [];

  // Active rocket explosions (updated in game loop, not separate rAF)
  private rocketExplosions: Array<{
    ring: THREE.Mesh;
    flash: THREE.Mesh;
    ringMat: THREE.MeshBasicMaterial;
    flashMat: THREE.MeshBasicMaterial;
    ringGeom: THREE.RingGeometry;
    flashGeom: THREE.SphereGeometry;
    progress: number;
  }> = [];

  private container: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private initialized = false;

  constructor(container: HTMLElement) {
    this.container = container;

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Create orthographic camera for isometric view
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = this.CAMERA_ZOOM;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.1,
      1000
    );

    // Position camera for isometric view
    this.setupIsometricCamera();

    // Setup lighting
    this.setupLighting();

    // Cache common geometries
    this.cacheGeometries();
    this.cacheMaterials();
  }

  // Async initialization for WebGPU
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create canvas manually to ensure proper initialization
      this.canvas = document.createElement('canvas');
      // Set explicit dimensions BEFORE creating renderer (required for WebGL context)
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.canvas.style.display = 'block';
      this.container.appendChild(this.canvas);

      // Create WebGPU renderer (tries WebGPU first, falls back to WebGL)
      this.renderer = new THREE.WebGPURenderer({
        canvas: this.canvas,
        antialias: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);

      // Initialize WebGPU (falls back to WebGL2 if unavailable)
      await this.renderer.init();

      // Initialize post-processing with TSL
      this.initPostProcessing();

      // Initialize particle system
      this.particleSystem = new ParticleSystem(this.scene);

      // Initialize map renderer
      this.mapRenderer = new MapRenderer({
        scene: this.scene,
        getGeometry: (name) => this.geometries.get(name),
        getMaterial: (name) => this.materials.get(name),
        clearDecals: () => this.particleSystem.clearDecals(),
      });

      // Initialize zone lighting
      this.zoneLighting = new ZoneLighting(this.scene);

      // Pre-warm explosion shaders to avoid stutter on first explosion
      ThermobaricEffect.prewarm(this.scene, this.renderer);

      this.initialized = true;
      debug.log('WebGPU Renderer initialized');
    } catch (e) {
      debug.error('Renderer initialization failed:', e);
      this.cleanupRenderer();
      throw new Error('Failed to initialize WebGPU/WebGL renderer. Please use a modern browser with WebGPU or WebGL2 support.');
    }
  }

  private cleanupRenderer(): void {
    // Remove canvas from DOM first (this is safe)
    try {
      if (this.canvas && this.container.contains(this.canvas)) {
        this.container.removeChild(this.canvas);
      }
    } catch {
      // Ignore removal errors
    }
    this.canvas = null;
  }

  private initPostProcessing(): void {
    try {
      // Create post-processing pipeline with TSL
      this.postProcessing = new THREE.PostProcessing(this.renderer);

      // Scene pass
      const scenePass = pass(this.scene, this.camera);

      // 1. Chromatic aberration - that action movie lens feel
      const withChromatic = this.applyChromaticAberration(scenePass);

      // 2. Bloom - makes fire, muzzle flashes, and projectiles pop
      const bloomPass = bloom(withChromatic, 0.5, 0.4, 0.6);
      const withBloom = withChromatic.add(bloomPass);

      // 3. Subtle vignette - just enough to frame the action
      const withVignette = this.applyVignette(withBloom);

      // 4. Low health desaturation - dramatic when dying
      const withLowHealth = this.applyLowHealthEffect(withVignette);

      // 5. Film grain - gritty, cinematic texture
      const withGrain = this.applyFilmGrain(withLowHealth);

      this.postProcessing.outputNode = withGrain;

      debug.log('Post-processing initialized with film grain');
    } catch (e) {
      debug.warn('Post-processing setup failed, using standard rendering:', e);
      this.usePostProcessing = false;
    }
  }

  // Chromatic aberration - resamples texture at offset UVs for RGB split
  // Intensifies when player takes damage for visceral feedback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyChromaticAberration(scenePass: any) {
    const uvCoord = uv();

    // Radial from center - stronger at edges
    const center = vec2(0.5, 0.5);
    const toCenter = sub(uvCoord, center);
    const dist = length(toCenter);

    // Base aberration with subtle pulse (reduced for cleaner look)
    const baseStrength = add(0.006, mul(sin(mul(this.timeUniform, 1.5)), 0.001));

    // Damage boost - noticeable but not overwhelming
    const damageBoost = mul(this.damageIntensityUniform, 0.05);
    const strength = add(baseStrength, damageBoost);

    const aberrationOffset = mul(toCenter, mul(dist, strength));

    // Sample RGB at different UVs
    const uvRed = add(uvCoord, aberrationOffset);
    const uvBlue = sub(uvCoord, aberrationOffset);

    const redSample = scenePass.getTextureNode('output').uv(uvRed);
    const greenSample = scenePass.getTextureNode('output');
    const blueSample = scenePass.getTextureNode('output').uv(uvBlue);

    return vec3(redSample.x, greenSample.y, blueSample.z);
  }

  // Light vignette - frames the action without obscuring
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyVignette(color: any) {
    const uvCoord = uv();
    const center = vec2(0.5, 0.5);
    const dist = length(sub(uvCoord, center));

    // Very soft falloff, only darkens extreme edges
    const vignette = smoothstep(float(0.5), float(1.0), dist);

    // Very subtle darkening - keeps everything visible
    return mix(color, mul(color, 0.7), mul(vignette, 0.3));
  }

  // Film grain - very subtle texture
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilmGrain(color: any) {
    const uvCoord = uv();

    // Pseudo-random hash based on UV and time
    const seed = add(
      dot(floor(mul(uvCoord, 1000.0)), vec2(12.9898, 78.233)),
      mul(this.timeUniform, 43758.5453)
    );
    const noise = fract(mul(sin(seed), 43758.5453));

    // Very subtle grain - barely noticeable
    const grainStrength = 0.025;
    const grain = mul(sub(noise, 0.5), grainStrength);

    // Apply grain to color
    return add(color, grain);
  }

  // Low health desaturation - colors fade to grayish-red
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyLowHealthEffect(color: any) {
    // Calculate grayscale (luminance)
    const luminance = dot(color, vec3(0.299, 0.587, 0.114));

    // Tint the grayscale slightly red for that "dying" feel
    const desaturated = vec3(
      add(luminance, 0.1),  // Slight red boost
      mul(luminance, 0.85), // Reduce green
      mul(luminance, 0.85)  // Reduce blue
    );

    // Mix between color and desaturated based on low health intensity
    return mix(color, desaturated, this.lowHealthUniform);
  }

  private setupIsometricCamera(): void {
    // True isometric positioning
    const distance = 50;
    this.camera.position.set(
      distance * Math.cos(this.CAMERA_ANGLE) * Math.cos(this.CAMERA_PITCH),
      distance * Math.sin(this.CAMERA_PITCH),
      distance * Math.sin(this.CAMERA_ANGLE) * Math.cos(this.CAMERA_PITCH)
    );
    this.camera.lookAt(0, 0, 0);
  }

  private setupLighting(): void {
    // Ambient light
    const ambient = new THREE.AmbientLight(0x606080, 0.8);
    this.scene.add(ambient);

    // Main directional light (sun)
    const sun = new THREE.DirectionalLight(0xffffcc, 1.0);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    this.scene.add(sun);

    // Fill light
    const fill = new THREE.DirectionalLight(0x6666aa, 0.3);
    fill.position.set(-10, 10, -10);
    this.scene.add(fill);
  }

  private cacheGeometries(): void {
    // Floor tile
    this.geometries.set('floor', new THREE.BoxGeometry(TILE_SIZE, 0.1, TILE_SIZE));

    // Wall - full box geometry
    this.geometries.set('wall', new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE));

    // Player body
    this.geometries.set('playerBody', new THREE.CylinderGeometry(0.4, 0.5, 1, 8));

    // Enemy body
    this.geometries.set('enemyBody', new THREE.ConeGeometry(0.5, 1, 6));

    // Projectile
    this.geometries.set('projectile', new THREE.SphereGeometry(0.15, 8, 8));

    // Pickup
    this.geometries.set('pickup', new THREE.OctahedronGeometry(0.3));

    // Debris (small box)
    this.geometries.set('debris', new THREE.BoxGeometry(0.3, 0.15, 0.3));

    // Puddle (flat cylinder)
    this.geometries.set('puddle', new THREE.CylinderGeometry(0.6, 0.6, 0.02, 12));
  }

  private cacheMaterials(): void {
    this.materials.set(
      'floor',
      new THREE.MeshLambertMaterial({ color: COLORS.floor })
    );
    this.materials.set(
      'wall',
      new THREE.MeshLambertMaterial({
        color: COLORS.wall,
      })
    );
    this.materials.set(
      'debris',
      new THREE.MeshLambertMaterial({ color: COLORS.debris })
    );
    this.materials.set(
      'puddle',
      new THREE.MeshLambertMaterial({
        color: COLORS.puddle,
        transparent: true,
        opacity: 0.6,
      })
    );
    this.materials.set(
      'player',
      new THREE.MeshLambertMaterial({ color: COLORS.player })
    );
    this.materials.set(
      'enemy',
      new THREE.MeshLambertMaterial({ color: COLORS.enemy })
    );
    this.materials.set(
      'enemyRunner',
      new THREE.MeshLambertMaterial({ color: COLORS.enemyRunner })
    );
    this.materials.set(
      'enemyTank',
      new THREE.MeshLambertMaterial({ color: COLORS.enemyTank })
    );
    this.materials.set(
      'projectile',
      new THREE.MeshBasicMaterial({ color: COLORS.projectile })
    );
    this.materials.set(
      'health',
      new THREE.MeshLambertMaterial({ color: COLORS.health })
    );
    this.materials.set(
      'ammo',
      new THREE.MeshLambertMaterial({ color: COLORS.ammo })
    );
    // Blurred emblem material (for farshist symbol)
    this.materials.set('emblem', BlurredEmblemMaterial.create());

    // Targeting laser material (TSL shader with smooth fade)
    this.materials.set('targetingLaser', TargetingLaserMaterial.create(this.timeUniform));
  }

  buildMap(mapData: MapData): void {
    this.mapRenderer.buildMap(mapData);
    this.zoneLighting.applyZoneAtmosphere(mapData);
  }

  // ============================================================================
  // TARDIS System (delegated to MapRenderer)
  // ============================================================================

  updateTardis(dt: number): void {
    this.mapRenderer.updateTardis(dt);
  }

  setWaveTransition(active: boolean): void {
    this.mapRenderer.setWaveTransition(active);
  }

  getTardisPosition(): Vec3 | null {
    return this.mapRenderer.getTardisPosition();
  }

  setTardisPowerLevel(level: number): void {
    this.mapRenderer.setTardisPowerLevel(level);
  }

  // ============================================================================
  // Power Cell System (delegated to MapRenderer)
  // ============================================================================

  updatePowerCells(): void {
    this.mapRenderer.updatePowerCells();
  }

  removePowerCell(cellId: string): void {
    this.mapRenderer.removePowerCell(cellId);
  }

  addPowerCellAt(cellId: string, x: number, z: number): void {
    this.mapRenderer.addPowerCellAt(cellId, x, z);
  }

  getPowerCellPosition(cellId: string): Vec3 | null {
    return this.mapRenderer.getPowerCellPosition(cellId);
  }

  getPowerCellIds(): string[] {
    return this.mapRenderer.getPowerCellIds();
  }

  getMapRenderer(): MapRenderer {
    return this.mapRenderer;
  }

  updateCamera(targetPosition: Vec3, aimDirection?: { x: number; y: number }): void {
    // Update screen shake
    this.updateShake();

    // Calculate look-ahead offset based on aim direction
    let leadX = 0;
    let leadZ = 0;
    if (aimDirection) {
      leadX = aimDirection.x * this.CAMERA_LEAD;
      leadZ = aimDirection.y * this.CAMERA_LEAD;
    }

    // Target position with aim lead
    const targetX = targetPosition.x + leadX;
    const targetZ = targetPosition.z + leadZ;

    // Smooth follow - lerp toward target
    this.cameraTarget.x += (targetX - this.cameraTarget.x) * this.CAMERA_SMOOTHING;
    this.cameraTarget.y = targetPosition.y;
    this.cameraTarget.z += (targetZ - this.cameraTarget.z) * this.CAMERA_SMOOTHING;

    // Position camera at isometric offset from smoothed target
    const distance = 50;
    this.camera.position.set(
      this.cameraTarget.x + distance * Math.cos(this.CAMERA_ANGLE) * Math.cos(this.CAMERA_PITCH) + this.shakeOffset.x,
      this.cameraTarget.y + distance * Math.sin(this.CAMERA_PITCH) + this.shakeOffset.y,
      this.cameraTarget.z + distance * Math.sin(this.CAMERA_ANGLE) * Math.cos(this.CAMERA_PITCH) + this.shakeOffset.z
    );

    // Smooth look-at as well
    this.currentCameraLookAt.x += (this.cameraTarget.x - this.currentCameraLookAt.x) * this.CAMERA_SMOOTHING;
    this.currentCameraLookAt.y = this.cameraTarget.y;
    this.currentCameraLookAt.z += (this.cameraTarget.z - this.currentCameraLookAt.z) * this.CAMERA_SMOOTHING;

    this.camera.lookAt(
      this.currentCameraLookAt.x + this.shakeOffset.x * 0.5,
      this.currentCameraLookAt.y,
      this.currentCameraLookAt.z + this.shakeOffset.z * 0.5
    );
  }

  resize(width: number, height: number): void {
    const aspect = width / height;
    const viewSize = this.CAMERA_ZOOM;

    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();

    if (this.renderer) {
      this.renderer.setSize(width, height);
    }
  }

  render(): void {
    if (!this.initialized) return;

    // Update time uniform for animated shaders (laser, etc.)
    const dt = 0.016; // ~60fps delta
    this.time += dt;
    this.timeUniform.value = this.time;

    // Decay damage intensity over time
    if (this.damageIntensity > 0) {
      this.damageIntensity = Math.max(0, this.damageIntensity - dt * this.damageDecayRate);
      this.damageIntensityUniform.value = this.damageIntensity;
    }

    // Pass time to map renderer for animations
    this.mapRenderer.updateTime(this.time);

    if (this.usePostProcessing && this.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  async renderAsync(): Promise<void> {
    if (!this.initialized) return;

    if (this.usePostProcessing && this.postProcessing) {
      await this.postProcessing.renderAsync();
    } else {
      await this.renderer.renderAsync(this.scene, this.camera);
    }
  }

  // Accessors for entity creation
  getGeometry(name: string): THREE.BufferGeometry | undefined {
    return this.geometries.get(name);
  }

  getMaterial(name: string): THREE.Material | undefined {
    return this.materials.get(name);
  }

  addToScene(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  removeFromScene(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  // Convert world position to screen coordinates
  worldToScreen(worldPos: Vec3): { x: number; y: number } {
    const vec = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    vec.project(this.camera);

    return {
      x: (vec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-vec.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // ============================================================================
  // Screen Shake System
  // ============================================================================

  addScreenShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  private updateShake(): void {
    if (this.shakeIntensity > 0.01) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity * 2,
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity * 2
      );
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeOffset.set(0, 0, 0);
      this.shakeIntensity = 0;
    }
  }

  // ============================================================================
  // Damage Visual Effect (chromatic aberration spike)
  // ============================================================================

  /**
   * Trigger chromatic aberration spike when player takes damage
   * @param intensity 0-1, how strong the effect should be
   */
  triggerDamageEffect(intensity: number = 1): void {
    this.damageIntensity = Math.min(1, Math.max(this.damageIntensity, intensity));
    this.damageIntensityUniform.value = this.damageIntensity;
  }

  /**
   * Set low health visual effect intensity
   * Disabled - the desaturation effect was too intrusive
   */
  setLowHealthIntensity(_healthPercent: number): void {
    // Disabled - UI overlay handles low health indication now
    this.lowHealthUniform.value = 0;
  }

  createThermobaricEffect(position: Vec3, radius: number): void {
    // Create multi-phase thermobaric explosion effect
    const effect = new ThermobaricEffect(this.scene, position, radius);
    this.thermobaricEffects.push(effect);

    // Also add extra screen shake for the thermobaric
    this.addScreenShake(1.5);
  }

  updateThermobaricEffects(): void {
    // Update thermobaric effects
    for (let i = this.thermobaricEffects.length - 1; i >= 0; i--) {
      const complete = this.thermobaricEffects[i].update();
      if (complete) {
        // Swap-and-pop for O(1) removal
        this.thermobaricEffects[i] = this.thermobaricEffects[this.thermobaricEffects.length - 1];
        this.thermobaricEffects.pop();
      }
    }

    // Update rocket explosions (moved from separate rAF)
    for (let i = this.rocketExplosions.length - 1; i >= 0; i--) {
      const exp = this.rocketExplosions[i];
      exp.progress += 0.08;

      if (exp.progress >= 1) {
        // Cleanup
        this.scene.remove(exp.ring);
        this.scene.remove(exp.flash);
        exp.ringGeom.dispose();
        exp.ringMat.dispose();
        exp.flashGeom.dispose();
        exp.flashMat.dispose();
        // Swap-and-pop for O(1) removal
        this.rocketExplosions[i] = this.rocketExplosions[this.rocketExplosions.length - 1];
        this.rocketExplosions.pop();
      } else {
        // Animate
        exp.ring.scale.setScalar(exp.progress);
        exp.ringMat.opacity = 0.9 * (1 - exp.progress);
        exp.flash.scale.setScalar(1 + exp.progress * 2);
        exp.flashMat.opacity = 1 - exp.progress;
      }
    }
  }

  createRocketExplosion(position: Vec3): void {
    const radius = 3;

    // Create expanding explosion ring
    const ringGeom = new THREE.RingGeometry(0.3, radius, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.set(position.x, 0.15, position.z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    // Create bright flash sphere
    const flashGeom = new THREE.SphereGeometry(0.8, 16, 16);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 1,
    });
    const flash = new THREE.Mesh(flashGeom, flashMat);
    flash.position.set(position.x, 0.5, position.z);
    this.scene.add(flash);

    // Track explosion for game loop update (no separate rAF)
    this.rocketExplosions.push({
      ring,
      flash,
      ringMat,
      flashMat,
      ringGeom,
      flashGeom,
      progress: 0,
    });

    // Spawn fire particles
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.7;
      const particlePos = {
        x: position.x + Math.cos(angle) * dist,
        y: 0.3 + Math.random() * 0.5,
        z: position.z + Math.sin(angle) * dist,
      };
      this.particleSystem.spawnFireParticle(particlePos);
    }

    // Screen shake
    this.addScreenShake(0.25);
  }

  // ============================================================================
  // Particle System (delegated to ParticleSystem)
  // ============================================================================

  spawnBloodBurst(position: Vec3, enemyType: EnemyType, count: number = 15): void {
    this.particleSystem.spawnBloodBurst(position, enemyType, count);
  }

  spawnGibs(position: Vec3, count: number = 6): void {
    this.particleSystem.spawnGibs(position, count);
  }

  markEntityBloody(entityId: string, x: number, z: number): void {
    this.particleSystem.markEntityBloody(entityId, x, z);
  }

  updateEntityBloodTrail(entityId: string, x: number, z: number, rotation: number): void {
    this.particleSystem.updateEntityBloodTrail(entityId, x, z, rotation);
  }

  removeEntityBloodTrail(entityId: string): void {
    this.particleSystem.removeEntityBloodTrail(entityId);
  }

  spawnWallSplatter(x: number, z: number, y: number, face: 'north' | 'south' | 'east' | 'west', size: number = 1): void {
    this.particleSystem.spawnWallSplatter(x, z, y, face, size);
  }

  updateParticles(dt: number): void {
    this.particleSystem.update(dt);
  }

  // ============================================================================
  // Torch System (delegated to MapRenderer)
  // ============================================================================

  updateTorches(): void {
    this.mapRenderer.updateTorches();
  }

  // ============================================================================
  // Wall Occlusion System (delegated to MapRenderer)
  // ============================================================================

  /**
   * Update wall opacity based on entity positions.
   * Walls near entities fade smoothly for better visibility.
   */
  updateWallOcclusion(entityPositions: Array<{ x: number; z: number }>, dt: number = 0.016): void {
    this.mapRenderer.updateWallOcclusion(entityPositions, dt);
  }

  resetWallOcclusion(): void {
    this.mapRenderer.resetWallOcclusion();
  }

  // ============================================================================
  // Blood Decals (delegated to ParticleSystem)
  // ============================================================================

  spawnBloodDecal(x: number, z: number, size: number = 1): void {
    this.particleSystem.spawnBloodDecal(x, z, size);
  }
}
