import * as THREE from 'three/webgpu';
import { pass, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { MapData, Vec3, EnemyType } from '@shared/types';
import { TILE_SIZE, COLORS, BLOOD_COLORS } from '@shared/constants';
import { BlurredEmblemMaterial } from './BlurredEmblemMaterial';
import { TargetingLaserMaterial } from './LaserMaterial';

// ============================================================================
// Particle for death effects
// ============================================================================

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
}

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

  // Particle system
  private particles: Particle[] = [];
  private particlePool: THREE.Mesh[] = [];
  private particleGeometry!: THREE.SphereGeometry;

  // Torch lights for flickering
  private torchLights: THREE.PointLight[] = [];
  private torchFlames: THREE.Mesh[] = [];

  // Blood decals
  private bloodDecals: THREE.Mesh[] = [];
  private readonly MAX_BLOOD_DECALS = 100;

  // Time uniform for animated shaders
  private readonly timeUniform = uniform(0);
  private time = 0;

  private container: HTMLElement;
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
      const canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      this.container.appendChild(canvas);

      // Create WebGPU renderer (tries WebGPU first, falls back to WebGL)
      this.renderer = new THREE.WebGPURenderer({
        canvas,
        antialias: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);

      // Initialize WebGPU (falls back to WebGL2 if unavailable)
      await this.renderer.init();

      // Initialize post-processing with TSL
      this.initPostProcessing();

      // Initialize particle system
      this.initParticleSystem();

      this.initialized = true;
      console.log('WebGPU Renderer initialized');
    } catch (e) {
      console.error('Renderer initialization failed:', e);
      throw new Error('Failed to initialize WebGPU/WebGL renderer. Please use a modern browser with WebGPU or WebGL2 support.');
    }
  }

  private initPostProcessing(): void {
    try {
      // Create post-processing pipeline with TSL
      this.postProcessing = new THREE.PostProcessing(this.renderer);

      // Scene pass
      const scenePass = pass(this.scene, this.camera);
      const scenePassColor = scenePass.getTextureNode('output');

      // Apply bloom effect to scene
      const bloomPass = bloom(scenePassColor, 0.5, 0.3, 0.9);

      // Combine original with bloom
      this.postProcessing.outputNode = scenePassColor.add(bloomPass);

      console.log('TSL Post-processing initialized');
    } catch (e) {
      console.warn('Post-processing setup failed, using standard rendering:', e);
      this.usePostProcessing = false;
    }
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
    // Clear existing map objects
    this.scene.children
      .filter((obj) => obj.userData.mapObject)
      .forEach((obj) => this.scene.remove(obj));

    // Clear torch arrays
    this.torchLights = [];
    this.torchFlames = [];
    this.bloodDecals = [];

    // Track torch count for performance limit
    let torchCount = 0;
    const MAX_TORCHES = 20;

    const floorGeom = this.geometries.get('floor')!;
    const wallGeom = this.geometries.get('wall')!;
    const debrisGeom = this.geometries.get('debris')!;
    const puddleGeom = this.geometries.get('puddle')!;

    const floorMat = this.materials.get('floor')!;
    const wallMat = this.materials.get('wall')!;
    const debrisMat = this.materials.get('debris')!;
    const puddleMat = this.materials.get('puddle')!;

    // Use instanced meshes for performance
    const floorCount = mapData.tiles.flat().filter((t) => t.type === 'floor').length;
    const wallCount = mapData.tiles.flat().filter((t) => t.type === 'wall').length;

    const floorInstanced = new THREE.InstancedMesh(floorGeom, floorMat, floorCount);
    const wallInstanced = new THREE.InstancedMesh(wallGeom, wallMat, wallCount);

    floorInstanced.receiveShadow = true;
    wallInstanced.castShadow = true;
    wallInstanced.receiveShadow = true;

    floorInstanced.userData.mapObject = true;
    wallInstanced.userData.mapObject = true;

    let floorIndex = 0;
    let wallIndex = 0;
    const matrix = new THREE.Matrix4();

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];
        const worldX = x * TILE_SIZE;
        const worldZ = y * TILE_SIZE;

        if (tile.type === 'floor') {
          matrix.setPosition(worldX, 0, worldZ);
          floorInstanced.setMatrixAt(floorIndex++, matrix);

          // Add debris decorations
          if (Math.random() < 0.05) {
            const debris = new THREE.Mesh(debrisGeom, debrisMat);
            debris.position.set(
              worldX + (Math.random() - 0.5) * TILE_SIZE * 0.8,
              0.1,
              worldZ + (Math.random() - 0.5) * TILE_SIZE * 0.8
            );
            debris.rotation.y = Math.random() * Math.PI * 2;
            debris.userData.mapObject = true;
            this.scene.add(debris);
          }

          // Add cult floor symbols (rare)
          if (Math.random() < 0.015) {
            this.addFloorSymbol(worldX, worldZ);
          }
        } else if (tile.type === 'wall') {
          matrix.setPosition(worldX, TILE_SIZE / 2, worldZ);
          wallInstanced.setMatrixAt(wallIndex++, matrix);

          // Maybe add torch on walls adjacent to floor
          if (torchCount < MAX_TORCHES && Math.random() < 0.06) {
            // Check if adjacent to floor
            const hasFloorRight = x < mapData.width - 1 && mapData.tiles[y][x + 1]?.type === 'floor';
            const hasFloorLeft = x > 0 && mapData.tiles[y][x - 1]?.type === 'floor';
            const hasFloorDown = y < mapData.height - 1 && mapData.tiles[y + 1]?.[x]?.type === 'floor';
            const hasFloorUp = y > 0 && mapData.tiles[y - 1]?.[x]?.type === 'floor';

            if (hasFloorRight) {
              this.addTorch(worldX, worldZ, 'x', 1);
              torchCount++;
            } else if (hasFloorLeft) {
              this.addTorch(worldX, worldZ, 'x', -1);
              torchCount++;
            } else if (hasFloorDown) {
              this.addTorch(worldX, worldZ, 'z', 1);
              torchCount++;
            } else if (hasFloorUp) {
              this.addTorch(worldX, worldZ, 'z', -1);
              torchCount++;
            }
          }
        } else if (tile.type === 'puddle') {
          // Floor under puddle
          matrix.setPosition(worldX, 0, worldZ);
          floorInstanced.setMatrixAt(floorIndex++, matrix);

          const puddle = new THREE.Mesh(puddleGeom, puddleMat);
          puddle.position.set(worldX, 0.06, worldZ);
          puddle.userData.mapObject = true;
          this.scene.add(puddle);
        }
      }
    }

    floorInstanced.instanceMatrix.needsUpdate = true;
    wallInstanced.instanceMatrix.needsUpdate = true;

    this.scene.add(floorInstanced);
    this.scene.add(wallInstanced);

    // Create cult altars
    for (const pos of mapData.altarPositions) {
      this.createAltar(pos.x * TILE_SIZE, pos.y * TILE_SIZE);
    }
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
  // Particle System
  // ============================================================================

  private initParticleSystem(): void {
    this.particleGeometry = new THREE.SphereGeometry(0.08, 4, 4);

    // Pre-allocate pool of 200 particles
    for (let i = 0; i < 200; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.particleGeometry, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push(mesh);
    }
  }

  spawnBloodBurst(position: Vec3, enemyType: EnemyType, count: number = 15): void {
    const color = BLOOD_COLORS[enemyType];

    for (let i = 0; i < count; i++) {
      const mesh = this.particlePool.find((p) => !p.visible);
      if (!mesh) continue;

      mesh.visible = true;
      mesh.position.set(position.x, position.y, position.z);
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      mesh.scale.setScalar(1);

      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      const upward = 2 + Math.random() * 4;

      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          upward,
          Math.sin(angle) * speed
        ),
        lifetime: 0,
        maxLifetime: 0.4 + Math.random() * 0.3,
      });
    }
  }

  updateParticles(dt: number): void {
    const gravity = -20;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifetime += dt;

      if (p.lifetime >= p.maxLifetime) {
        p.mesh.visible = false;
        this.particles.splice(i, 1);
        continue;
      }

      // Physics
      p.velocity.y += gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);

      // Fade out
      const alpha = 1 - p.lifetime / p.maxLifetime;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = alpha;

      // Scale down
      const scale = alpha * 0.8 + 0.2;
      p.mesh.scale.setScalar(scale);
    }
  }

  // ============================================================================
  // Cult Altar System
  // ============================================================================

  private createAltar(x: number, z: number): void {
    // Stone base (dark stone pedestal)
    const baseGeom = new THREE.BoxGeometry(1.6, 0.4, 1.6);
    const baseMat = new THREE.MeshLambertMaterial({ color: COLORS.altarStone });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.set(x, 0.2, z);
    base.castShadow = true;
    base.receiveShadow = true;
    base.userData.mapObject = true;
    this.scene.add(base);

    // Upper tier (smaller)
    const topGeom = new THREE.BoxGeometry(1.0, 0.25, 1.0);
    const top = new THREE.Mesh(topGeom, baseMat);
    top.position.set(x, 0.525, z);
    top.castShadow = true;
    top.userData.mapObject = true;
    this.scene.add(top);

    // Meatball emblem on top
    const emblemMat = this.materials.get('emblem')!;
    const emblemGeom = new THREE.PlaneGeometry(0.7, 0.7);
    const emblem = new THREE.Mesh(emblemGeom, emblemMat);
    emblem.position.set(x, 0.66, z);
    emblem.rotation.x = -Math.PI / 2;
    emblem.userData.mapObject = true;
    this.scene.add(emblem);

    // Four candles at corners
    const candlePositions = [
      { dx: -0.6, dz: -0.6 },
      { dx: 0.6, dz: -0.6 },
      { dx: -0.6, dz: 0.6 },
      { dx: 0.6, dz: 0.6 },
    ];

    const candleGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6);
    const candleMat = new THREE.MeshLambertMaterial({ color: COLORS.altarCandle });
    const flameGeom = new THREE.ConeGeometry(0.05, 0.12, 5);
    const flameMat = new THREE.MeshBasicMaterial({ color: COLORS.candleFlame });

    for (const pos of candlePositions) {
      // Candle body
      const candle = new THREE.Mesh(candleGeom, candleMat);
      candle.position.set(x + pos.dx, 0.55, z + pos.dz);
      candle.userData.mapObject = true;
      this.scene.add(candle);

      // Candle flame
      const flame = new THREE.Mesh(flameGeom, flameMat);
      flame.position.set(x + pos.dx, 0.76, z + pos.dz);
      flame.userData.mapObject = true;
      flame.userData.baseY = 0.76;
      flame.userData.flickerTime = Math.random() * Math.PI * 2;
      this.scene.add(flame);
      this.torchFlames.push(flame);

      // Small point light per candle
      const light = new THREE.PointLight(0xff8844, 0.3, 4);
      light.position.set(x + pos.dx, 0.8, z + pos.dz);
      light.userData.mapObject = true;
      light.userData.baseIntensity = 0.3;
      light.userData.flickerTime = Math.random() * Math.PI * 2;
      this.scene.add(light);
      this.torchLights.push(light);
    }
  }

  // ============================================================================
  // Torch System
  // ============================================================================

  private addTorch(x: number, z: number, direction: 'x' | 'z', sign: number): void {
    // Offset from wall
    const offsetX = direction === 'x' ? sign * 0.3 : 0;
    const offsetZ = direction === 'z' ? sign * 0.3 : 0;

    // Torch holder
    const holderGeom = new THREE.CylinderGeometry(0.05, 0.08, 0.3, 6);
    const holderMat = new THREE.MeshLambertMaterial({ color: COLORS.torchHolder });
    const holder = new THREE.Mesh(holderGeom, holderMat);
    holder.position.set(x + offsetX, TILE_SIZE * 0.6, z + offsetZ);
    holder.userData.mapObject = true;
    this.scene.add(holder);

    // Flame (cone)
    const flameGeom = new THREE.ConeGeometry(0.12, 0.3, 6);
    const flameMat = new THREE.MeshBasicMaterial({ color: COLORS.torch });
    const flame = new THREE.Mesh(flameGeom, flameMat);
    flame.position.set(x + offsetX, TILE_SIZE * 0.8, z + offsetZ);
    flame.userData.mapObject = true;
    flame.userData.baseY = TILE_SIZE * 0.8;
    flame.userData.flickerTime = Math.random() * Math.PI * 2;
    this.scene.add(flame);
    this.torchFlames.push(flame);

    // Point light
    const light = new THREE.PointLight(0xff6633, 0.6, 10);
    light.position.set(x + offsetX, TILE_SIZE * 0.9, z + offsetZ);
    light.userData.mapObject = true;
    light.userData.baseIntensity = 0.6;
    light.userData.flickerTime = Math.random() * Math.PI * 2;
    this.scene.add(light);
    this.torchLights.push(light);
  }

  updateTorches(_time: number): void {
    // Update torch lights with flickering
    for (const light of this.torchLights) {
      light.userData.flickerTime += 0.15;
      const t = light.userData.flickerTime;
      const flicker =
        0.7 +
        Math.sin(t * 3) * 0.15 +
        Math.sin(t * 7) * 0.1 +
        Math.random() * 0.05;
      light.intensity = light.userData.baseIntensity * flicker;
    }

    // Update flame meshes
    for (const flame of this.torchFlames) {
      flame.userData.flickerTime += 0.1;
      const t = flame.userData.flickerTime;
      // Subtle movement
      flame.position.y = flame.userData.baseY + Math.sin(t * 5) * 0.02;
      flame.scale.y = 1 + Math.sin(t * 8) * 0.1;
    }
  }

  // ============================================================================
  // Blood Decals
  // ============================================================================

  spawnBloodDecal(x: number, z: number, size: number = 1): void {
    // Recycle oldest if at limit
    if (this.bloodDecals.length >= this.MAX_BLOOD_DECALS) {
      const oldest = this.bloodDecals.shift()!;
      this.scene.remove(oldest);
      oldest.geometry.dispose();
      (oldest.material as THREE.Material).dispose();
    }

    const geom = new THREE.CircleGeometry(0.3 * size + Math.random() * 0.2, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x440000 + Math.floor(Math.random() * 0x220000),
      transparent: true,
      opacity: 0.6,
    });
    const decal = new THREE.Mesh(geom, mat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(
      x + (Math.random() - 0.5) * 0.5,
      0.02,
      z + (Math.random() - 0.5) * 0.5
    );
    decal.userData.mapObject = true;

    this.scene.add(decal);
    this.bloodDecals.push(decal);
  }

  // ============================================================================
  // Cult Floor Symbols
  // ============================================================================

  private addFloorSymbol(x: number, z: number): void {
    const geom = new THREE.PlaneGeometry(1.5, 1.5);
    const emblemMat = this.materials.get('emblem') as THREE.MeshBasicMaterial;

    const mat = new THREE.MeshBasicMaterial({
      map: emblemMat.map,
      transparent: true,
      opacity: 0.25,
    });
    const symbol = new THREE.Mesh(geom, mat);
    symbol.rotation.x = -Math.PI / 2;
    symbol.rotation.z = Math.random() * Math.PI * 2;
    symbol.position.set(x, 0.01, z);
    symbol.userData.mapObject = true;
    this.scene.add(symbol);
  }
}
