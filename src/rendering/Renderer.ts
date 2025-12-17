import * as THREE from 'three';
import type { MapData, Vec3 } from '@shared/types';
import { TILE_SIZE, COLORS } from '@shared/constants';
import { BlurredEmblemMaterial } from './BlurredEmblemMaterial';

// ============================================================================
// Three.js Renderer with Isometric Camera
// ============================================================================

export class Renderer {
  public scene: THREE.Scene;
  public camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;

  // Camera settings for isometric view
  private readonly CAMERA_ZOOM = 30;
  private readonly CAMERA_ANGLE = Math.PI / 4; // 45 degrees
  private readonly CAMERA_PITCH = Math.atan(1 / Math.sqrt(2)); // ~35.264 degrees (true isometric)

  // Geometry caches
  private geometries: Map<string, THREE.BufferGeometry> = new Map();
  private materials: Map<string, THREE.Material> = new Map();

  constructor(container: HTMLElement) {
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

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Setup lighting
    this.setupLighting();

    // Cache common geometries
    this.cacheGeometries();
    this.cacheMaterials();
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
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    // Main directional light (sun)
    const sun = new THREE.DirectionalLight(0xffffcc, 0.8);
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
  }

  buildMap(mapData: MapData): void {
    // Clear existing map objects
    this.scene.children
      .filter((obj) => obj.userData.mapObject)
      .forEach((obj) => this.scene.remove(obj));

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

          // Add debris or puddle decorations
          if (tile.type === 'floor' && Math.random() < 0.05) {
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
        } else if (tile.type === 'wall') {
          matrix.setPosition(worldX, TILE_SIZE / 2, worldZ);
          wallInstanced.setMatrixAt(wallIndex++, matrix);
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
  }

  updateCamera(targetPosition: Vec3): void {
    // Smooth follow
    const distance = 50;
    this.camera.position.set(
      targetPosition.x + distance * Math.cos(this.CAMERA_ANGLE) * Math.cos(this.CAMERA_PITCH),
      targetPosition.y + distance * Math.sin(this.CAMERA_PITCH),
      targetPosition.z + distance * Math.sin(this.CAMERA_ANGLE) * Math.cos(this.CAMERA_PITCH)
    );
    this.camera.lookAt(targetPosition.x, targetPosition.y, targetPosition.z);
  }

  resize(width: number, height: number): void {
    const aspect = width / height;
    const viewSize = this.CAMERA_ZOOM;

    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
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
}
