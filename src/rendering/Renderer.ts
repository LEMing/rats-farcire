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
import { TILE_SIZE, COLORS, BLOOD_COLORS } from '@shared/constants';
import { BlurredEmblemMaterial } from './BlurredEmblemMaterial';
import { TargetingLaserMaterial } from './LaserMaterial';
import { TardisFactory, TardisInstance } from './TardisFactory';
import { MapDecorations } from './MapDecorations';

// ============================================================================
// Particle for death effects (GPU-instanced)
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

  // Instanced particle system (single draw call for all particles)
  private readonly MAX_PARTICLES = 200;
  private particles: ParticleData[] = [];
  private particleInstances!: THREE.InstancedMesh;
  private freeParticleIndices: number[] = [];
  private dummyMatrix = new THREE.Matrix4();
  private dummyColor = new THREE.Color();

  // Torch lights for flickering
  private torchLights: THREE.PointLight[] = [];
  private torchFlames: THREE.Mesh[] = [];

  // Blood decals
  private bloodDecals: THREE.Mesh[] = [];
  private readonly MAX_BLOOD_DECALS = 100;

  // TARDIS instance
  private tardis: TardisInstance | null = null;
  private isWaveTransition = false;

  // Power cells
  private powerCells: Map<string, THREE.Group> = new Map();
  private powerCellIds: string[] = [];

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
      this.initParticleSystem();

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

    // Create TARDIS at designated position (objective room)
    if (mapData.tardisPosition) {
      this.spawnTardis(
        mapData.tardisPosition.x * TILE_SIZE,
        mapData.tardisPosition.y * TILE_SIZE
      );
    }

    // Create power cells at designated positions
    for (const pos of mapData.cellPositions) {
      this.createPowerCell(pos.x * TILE_SIZE, pos.y * TILE_SIZE);
    }

    // Add environmental decorations
    this.placeDecorations(mapData);
  }

  private placeDecorations(mapData: MapData): void {
    const spawnRoom = mapData.rooms[0];

    // Place meat grinder in a larger room (not spawn room)
    for (let i = 1; i < mapData.rooms.length; i++) {
      const room = mapData.rooms[i];
      if (room.width >= 6 && room.height >= 6 && Math.random() < 0.4) {
        const centerX = (room.x + room.width / 2) * TILE_SIZE;
        const centerZ = (room.y + room.height / 2) * TILE_SIZE;
        const grinder = MapDecorations.createMeatGrinder(centerX, centerZ);
        this.scene.add(grinder);
        break; // Only one grinder per map
      }
    }

    // Place ritual circles near altars
    for (const altar of mapData.altarPositions) {
      if (Math.random() < 0.5) {
        const circle = MapDecorations.createRitualCircle(
          altar.x * TILE_SIZE,
          altar.y * TILE_SIZE
        );
        // Offset slightly so it's around the altar
        circle.position.x += (Math.random() - 0.5) * 2;
        circle.position.z += (Math.random() - 0.5) * 2;
        this.scene.add(circle);
      }
    }

    // Scatter decorations across floor tiles
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];
        if (tile.type !== 'floor') continue;

        // Skip spawn room for most decorations
        const inSpawnRoom = spawnRoom &&
          x >= spawnRoom.x && x < spawnRoom.x + spawnRoom.width &&
          y >= spawnRoom.y && y < spawnRoom.y + spawnRoom.height;

        const worldX = x * TILE_SIZE;
        const worldZ = y * TILE_SIZE;

        // Meat piles (more common near altars)
        const nearAltar = mapData.altarPositions.some(
          a => Math.abs(a.x - x) < 4 && Math.abs(a.y - y) < 4
        );
        if (Math.random() < (nearAltar ? 0.08 : 0.02)) {
          const pile = MapDecorations.createMeatPile(
            worldX + (Math.random() - 0.5) * TILE_SIZE * 0.6,
            0,
            worldZ + (Math.random() - 0.5) * TILE_SIZE * 0.6
          );
          this.scene.add(pile);
        }

        // Bone piles (scattered)
        if (!inSpawnRoom && Math.random() < 0.015) {
          const bones = MapDecorations.createBonePile(
            worldX + (Math.random() - 0.5) * TILE_SIZE * 0.5,
            worldZ + (Math.random() - 0.5) * TILE_SIZE * 0.5
          );
          this.scene.add(bones);
        }

        // Crates and barrels (in corners and edges)
        if (!inSpawnRoom && Math.random() < 0.02) {
          if (Math.random() > 0.5) {
            const crate = MapDecorations.createCrate(worldX, worldZ);
            this.scene.add(crate);
          } else {
            const tipped = Math.random() < 0.3;
            const barrel = MapDecorations.createBarrel(worldX, worldZ, tipped);
            this.scene.add(barrel);
          }
        }

        // Rat holes on walls adjacent to floor
        if (!inSpawnRoom && Math.random() < 0.03) {
          // Check adjacent walls
          const hasWallRight = x < mapData.width - 1 && mapData.tiles[y][x + 1]?.type === 'wall';
          const hasWallLeft = x > 0 && mapData.tiles[y][x - 1]?.type === 'wall';
          const hasWallDown = y < mapData.height - 1 && mapData.tiles[y + 1]?.[x]?.type === 'wall';
          const hasWallUp = y > 0 && mapData.tiles[y - 1]?.[x]?.type === 'wall';

          if (hasWallRight) {
            const hole = MapDecorations.createRatHole(worldX + TILE_SIZE, worldZ, 'x', -1);
            this.scene.add(hole);
          } else if (hasWallLeft) {
            const hole = MapDecorations.createRatHole(worldX - TILE_SIZE, worldZ, 'x', 1);
            this.scene.add(hole);
          } else if (hasWallDown) {
            const hole = MapDecorations.createRatHole(worldX, worldZ + TILE_SIZE, 'z', -1);
            this.scene.add(hole);
          } else if (hasWallUp) {
            const hole = MapDecorations.createRatHole(worldX, worldZ - TILE_SIZE, 'z', 1);
            this.scene.add(hole);
          }
        }
      }
    }
  }

  // ============================================================================
  // TARDIS System
  // ============================================================================

  private spawnTardis(x: number, z: number): void {
    // Remove existing TARDIS if any
    if (this.tardis) {
      this.scene.remove(this.tardis.group);
    }

    // Create new TARDIS at spawn position
    const position = new THREE.Vector3(x, 0, z);
    this.tardis = TardisFactory.create(position);
    this.tardis.group.userData.mapObject = true;

    // Start with materialization effect
    TardisFactory.startMaterialization(this.tardis);

    this.scene.add(this.tardis.group);
  }

  updateTardis(dt: number): void {
    if (!this.tardis) return;

    // Update materialization effect
    if (this.tardis.materializing) {
      TardisFactory.updateMaterialization(this.tardis, dt);
    }

    // Update lamp pulsing
    TardisFactory.updateLampPulse(this.tardis, this.time, this.isWaveTransition);
  }

  setWaveTransition(active: boolean): void {
    this.isWaveTransition = active;
  }

  getTardisPosition(): Vec3 | null {
    if (!this.tardis) return null;
    const pos = this.tardis.group.position;
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  setTardisPowerLevel(level: number): void {
    if (this.tardis) {
      // Update TARDIS lamp brightness based on power level
      const brightness = level / 3;
      TardisFactory.setPowerLevel(this.tardis, brightness);
    }
  }

  // ============================================================================
  // Power Cell System
  // ============================================================================

  private createPowerCell(x: number, z: number): string {
    const cellId = `cell_${this.powerCellIds.length}`;
    const cellGroup = new THREE.Group();
    cellGroup.position.set(x, 0, z);

    // Core crystal (cyan glowing orb)
    const coreGeom = new THREE.OctahedronGeometry(0.4, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.9,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = 0.8;
    core.name = 'core';
    cellGroup.add(core);

    // Outer glow shell
    const glowGeom = new THREE.OctahedronGeometry(0.55, 1);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 0.8;
    glow.name = 'glow';
    cellGroup.add(glow);

    // Base pedestal
    const baseGeom = new THREE.CylinderGeometry(0.3, 0.4, 0.2, 8);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x334455 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.1;
    cellGroup.add(base);

    // Point light for glow effect
    const light = new THREE.PointLight(0x00ffff, 1, 6);
    light.position.y = 0.8;
    cellGroup.add(light);

    // Store metadata
    cellGroup.userData.mapObject = true;
    cellGroup.userData.cellId = cellId;
    cellGroup.userData.baseY = 0.8;

    this.scene.add(cellGroup);
    this.powerCells.set(cellId, cellGroup);
    this.powerCellIds.push(cellId);

    return cellId;
  }

  updatePowerCells(): void {
    const pulse = Math.sin(this.time * 3) * 0.5 + 0.5;

    for (const [, cellGroup] of this.powerCells) {
      // Rotate and bob
      const core = cellGroup.getObjectByName('core') as THREE.Mesh;
      const glow = cellGroup.getObjectByName('glow') as THREE.Mesh;

      if (core && glow) {
        core.rotation.y += 0.02;
        glow.rotation.y -= 0.01;

        // Pulsing scale
        const scale = 1 + pulse * 0.1;
        glow.scale.setScalar(scale);

        // Bob up and down
        const baseY = cellGroup.userData.baseY || 0.8;
        core.position.y = baseY + Math.sin(this.time * 2) * 0.1;
        glow.position.y = core.position.y;
      }

      // Update light intensity
      const light = cellGroup.children.find(c => c instanceof THREE.PointLight) as THREE.PointLight;
      if (light) {
        light.intensity = 0.8 + pulse * 0.4;
      }
    }
  }

  removePowerCell(cellId: string): void {
    const cellGroup = this.powerCells.get(cellId);
    if (cellGroup) {
      this.scene.remove(cellGroup);
      this.powerCells.delete(cellId);
    }
  }

  getPowerCellPosition(cellId: string): Vec3 | null {
    const cellGroup = this.powerCells.get(cellId);
    if (!cellGroup) return null;
    return {
      x: cellGroup.position.x,
      y: cellGroup.position.y,
      z: cellGroup.position.z,
    };
  }

  getPowerCellIds(): string[] {
    return [...this.powerCellIds];
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
    // Single geometry for all particles
    const geometry = new THREE.SphereGeometry(0.08, 4, 4);

    // Simple material - color will be set per instance
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
    });

    // Create instanced mesh - ONE draw call for all 200 particles!
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

  updateParticles(dt: number): void {
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
