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
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { MapData, Vec3, EnemyType } from '@shared/types';
import { TILE_SIZE, COLORS } from '@shared/constants';
import { BlurredEmblemMaterial } from './BlurredEmblemMaterial';
import { TargetingLaserMaterial } from './LaserMaterial';
import { MapRenderer } from './MapRenderer';
import { ParticleSystem } from '../systems/ParticleSystem';

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

  // Time uniform for animated shaders
  private readonly timeUniform = uniform(0);
  private time = 0;

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

      this.initialized = true;
      console.log('WebGPU Renderer initialized');
    } catch (e) {
      console.error('Renderer initialization failed:', e);
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

      this.postProcessing.outputNode = withVignette;

      console.log('Post-processing initialized');
    } catch (e) {
      console.warn('Post-processing setup failed, using standard rendering:', e);
      this.usePostProcessing = false;
    }
  }

  // Chromatic aberration - resamples texture at offset UVs for RGB split
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyChromaticAberration(scenePass: any) {
    const uvCoord = uv();

    // Radial from center - stronger at edges
    const center = vec2(0.5, 0.5);
    const toCenter = sub(uvCoord, center);
    const dist = length(toCenter);

    // Aberration strength with subtle pulse
    const strength = add(0.012, mul(sin(mul(this.timeUniform, 1.5)), 0.002));
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

    // Soft falloff, only darkens the very edges
    const vignette = smoothstep(float(0.4), float(0.9), dist);

    // Darken edges slightly - keeps gameplay area fully visible
    return mix(color, mul(color, 0.3), mul(vignette, 0.5));
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

    // Wall
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
      new THREE.MeshLambertMaterial({ color: COLORS.wall })
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
    this.time += 0.016; // ~60fps delta
    this.timeUniform.value = this.time;

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
  // Particle System (delegated to ParticleSystem)
  // ============================================================================

  spawnBloodBurst(position: Vec3, enemyType: EnemyType, count: number = 15): void {
    this.particleSystem.spawnBloodBurst(position, enemyType, count);
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
  // Blood Decals (delegated to ParticleSystem)
  // ============================================================================

  spawnBloodDecal(x: number, z: number, size: number = 1): void {
    this.particleSystem.spawnBloodDecal(x, z, size);
  }
}
