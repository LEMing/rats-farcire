import * as THREE from 'three/webgpu';
import type { MapData, Vec3 } from '@shared/types';
import { TILE_SIZE, COLORS } from '@shared/constants';
import { TardisFactory, TardisInstance } from './TardisFactory';
import { MapDecorations } from './MapDecorations';

/**
 * MapRenderer - Handles all map-related rendering
 *
 * Extracted from Renderer to follow Single Responsibility Principle.
 * This class handles map building, decorations, torches, altars, TARDIS, and power cells.
 */

export interface MapRendererDependencies {
  scene: THREE.Scene;
  getGeometry(name: string): THREE.BufferGeometry | undefined;
  getMaterial(name: string): THREE.Material | undefined;
  clearDecals(): void;
}

// Wall data for smooth opacity fading
interface WallData {
  mesh: THREE.Mesh;
  worldX: number;
  worldZ: number;
  currentOpacity: number;
  targetOpacity: number;
}

export class MapRenderer {
  private deps: MapRendererDependencies;

  // Torch lights for flickering
  private torchLights: THREE.PointLight[] = [];
  private torchFlames: THREE.Mesh[] = [];

  // TARDIS instance
  private tardis: TardisInstance | null = null;
  private isWaveTransition = false;

  // Power cells
  private powerCells: Map<string, THREE.Group> = new Map();
  private powerCellIds: string[] = [];

  // Time tracking for animations
  private time = 0;

  // Wall transparency system - individual meshes for smooth opacity animation
  private walls: WallData[] = [];
  private readonly WALL_OPACITY_MAX = 0.85;
  private readonly WALL_OPACITY_MIN = 0.25;
  private readonly WALL_FADE_SPEED = 8; // opacity units per second
  private readonly WALL_FADE_RADIUS = 4; // distance at which walls start fading

  constructor(deps: MapRendererDependencies) {
    this.deps = deps;
  }

  // ============================================================================
  // Map Building
  // ============================================================================

  buildMap(mapData: MapData): void {
    // Clear existing map objects
    this.deps.scene.children
      .filter((obj) => obj.userData.mapObject)
      .forEach((obj) => this.deps.scene.remove(obj));

    // Clear torch arrays
    this.torchLights = [];
    this.torchFlames = [];

    // Clear wall data
    this.walls = [];

    // Clear blood decals from previous map
    this.deps.clearDecals();

    // Track torch count for performance limit
    let torchCount = 0;
    const MAX_TORCHES = 20;

    const floorGeom = this.deps.getGeometry('floor')!;
    const wallGeom = this.deps.getGeometry('wall')!;
    const debrisGeom = this.deps.getGeometry('debris')!;
    const puddleGeom = this.deps.getGeometry('puddle')!;

    const floorMat = this.deps.getMaterial('floor')!;
    const wallBaseMat = this.deps.getMaterial('wall')! as THREE.MeshLambertMaterial;
    const debrisMat = this.deps.getMaterial('debris')!;
    const puddleMat = this.deps.getMaterial('puddle')!;

    // Use instanced mesh for floor (performance)
    const floorCount = mapData.tiles.flat().filter((t) => t.type === 'floor').length;
    const floorInstanced = new THREE.InstancedMesh(floorGeom, floorMat, floorCount);
    floorInstanced.receiveShadow = true;
    floorInstanced.userData.mapObject = true;

    let floorIndex = 0;
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
            this.deps.scene.add(debris);
          }

          // Add cult floor symbols (rare)
          if (Math.random() < 0.015) {
            this.addFloorSymbol(worldX, worldZ);
          }
        } else if (tile.type === 'wall') {
          // Check if this wall is on the "front edge" - has floor behind it from camera's POV
          // Camera looks from +X +Z, so "behind" is -X or -Z direction
          const hasFloorBehindX = x > 0 && mapData.tiles[y][x - 1]?.type === 'floor';
          const hasFloorBehindZ = y > 0 && mapData.tiles[y - 1]?.[x]?.type === 'floor';
          const isFrontEdgeWall = hasFloorBehindX || hasFloorBehindZ;

          // Front edge walls are completely transparent (invisible)
          if (isFrontEdgeWall) {
            // Skip rendering this wall entirely - it would block camera view
            // But still need to track position for game logic if needed
          } else {
            // Create individual wall mesh with its own material for opacity animation
            const wallMat = wallBaseMat.clone();
            wallMat.transparent = true;
            wallMat.opacity = this.WALL_OPACITY_MAX;

            const wallMesh = new THREE.Mesh(wallGeom, wallMat);
            wallMesh.position.set(worldX, TILE_SIZE / 2, worldZ);
            wallMesh.castShadow = true;
            wallMesh.receiveShadow = true;
            wallMesh.userData.mapObject = true;
            this.deps.scene.add(wallMesh);

            // Store wall data for smooth opacity fading
            this.walls.push({
              mesh: wallMesh,
              worldX,
              worldZ,
              currentOpacity: this.WALL_OPACITY_MAX,
              targetOpacity: this.WALL_OPACITY_MAX,
            });
          }

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
          this.deps.scene.add(puddle);
        }
      }
    }

    floorInstanced.instanceMatrix.needsUpdate = true;
    this.deps.scene.add(floorInstanced);

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
        this.deps.scene.add(grinder);
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
        this.deps.scene.add(circle);
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
          this.deps.scene.add(pile);
        }

        // Bone piles (scattered)
        if (!inSpawnRoom && Math.random() < 0.015) {
          const bones = MapDecorations.createBonePile(
            worldX + (Math.random() - 0.5) * TILE_SIZE * 0.5,
            worldZ + (Math.random() - 0.5) * TILE_SIZE * 0.5
          );
          this.deps.scene.add(bones);
        }

        // Crates and barrels (in corners and edges)
        if (!inSpawnRoom && Math.random() < 0.02) {
          if (Math.random() > 0.5) {
            const crate = MapDecorations.createCrate(worldX, worldZ);
            this.deps.scene.add(crate);
          } else {
            const tipped = Math.random() < 0.3;
            const barrel = MapDecorations.createBarrel(worldX, worldZ, tipped);
            this.deps.scene.add(barrel);
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
            this.deps.scene.add(hole);
          } else if (hasWallLeft) {
            const hole = MapDecorations.createRatHole(worldX - TILE_SIZE, worldZ, 'x', 1);
            this.deps.scene.add(hole);
          } else if (hasWallDown) {
            const hole = MapDecorations.createRatHole(worldX, worldZ + TILE_SIZE, 'z', -1);
            this.deps.scene.add(hole);
          } else if (hasWallUp) {
            const hole = MapDecorations.createRatHole(worldX, worldZ - TILE_SIZE, 'z', 1);
            this.deps.scene.add(hole);
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
      this.deps.scene.remove(this.tardis.group);
    }

    // Create new TARDIS at spawn position
    const position = new THREE.Vector3(x, 0, z);
    this.tardis = TardisFactory.create(position);
    this.tardis.group.userData.mapObject = true;

    // Start with materialization effect
    TardisFactory.startMaterialization(this.tardis);

    this.deps.scene.add(this.tardis.group);
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

    this.deps.scene.add(cellGroup);
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
      this.deps.scene.remove(cellGroup);
      this.powerCells.delete(cellId);
    }
  }

  addPowerCellAt(cellId: string, x: number, z: number): void {
    // If cell already exists, just move it
    const existing = this.powerCells.get(cellId);
    if (existing) {
      existing.position.set(x, 0, z);
      this.deps.scene.add(existing);
      return;
    }

    // Create new cell visual
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

    // Point light for glow effect
    const light = new THREE.PointLight(0x00ffff, 1, 6);
    light.position.y = 0.8;
    cellGroup.add(light);

    // Store metadata
    cellGroup.userData.mapObject = true;
    cellGroup.userData.cellId = cellId;
    cellGroup.userData.baseY = 0.8;

    this.deps.scene.add(cellGroup);
    this.powerCells.set(cellId, cellGroup);
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
    this.deps.scene.add(base);

    // Upper tier (smaller)
    const topGeom = new THREE.BoxGeometry(1.0, 0.25, 1.0);
    const top = new THREE.Mesh(topGeom, baseMat);
    top.position.set(x, 0.525, z);
    top.castShadow = true;
    top.userData.mapObject = true;
    this.deps.scene.add(top);

    // Meatball emblem on top
    const emblemMat = this.deps.getMaterial('emblem')!;
    const emblemGeom = new THREE.PlaneGeometry(0.7, 0.7);
    const emblem = new THREE.Mesh(emblemGeom, emblemMat);
    emblem.position.set(x, 0.66, z);
    emblem.rotation.x = -Math.PI / 2;
    emblem.userData.mapObject = true;
    this.deps.scene.add(emblem);

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
      this.deps.scene.add(candle);

      // Candle flame
      const flame = new THREE.Mesh(flameGeom, flameMat);
      flame.position.set(x + pos.dx, 0.76, z + pos.dz);
      flame.userData.mapObject = true;
      flame.userData.baseY = 0.76;
      flame.userData.flickerTime = Math.random() * Math.PI * 2;
      this.deps.scene.add(flame);
      this.torchFlames.push(flame);

      // Small point light per candle
      const light = new THREE.PointLight(0xff8844, 0.3, 4);
      light.position.set(x + pos.dx, 0.8, z + pos.dz);
      light.userData.mapObject = true;
      light.userData.baseIntensity = 0.3;
      light.userData.flickerTime = Math.random() * Math.PI * 2;
      this.deps.scene.add(light);
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
    this.deps.scene.add(holder);

    // Flame (cone)
    const flameGeom = new THREE.ConeGeometry(0.12, 0.3, 6);
    const flameMat = new THREE.MeshBasicMaterial({ color: COLORS.torch });
    const flame = new THREE.Mesh(flameGeom, flameMat);
    flame.position.set(x + offsetX, TILE_SIZE * 0.8, z + offsetZ);
    flame.userData.mapObject = true;
    flame.userData.baseY = TILE_SIZE * 0.8;
    flame.userData.flickerTime = Math.random() * Math.PI * 2;
    this.deps.scene.add(flame);
    this.torchFlames.push(flame);

    // Point light
    const light = new THREE.PointLight(0xff6633, 0.6, 10);
    light.position.set(x + offsetX, TILE_SIZE * 0.9, z + offsetZ);
    light.userData.mapObject = true;
    light.userData.baseIntensity = 0.6;
    light.userData.flickerTime = Math.random() * Math.PI * 2;
    this.deps.scene.add(light);
    this.torchLights.push(light);
  }

  updateTorches(): void {
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
  // Floor Symbols
  // ============================================================================

  private addFloorSymbol(x: number, z: number): void {
    const geom = new THREE.PlaneGeometry(1.5, 1.5);
    const emblemMat = this.deps.getMaterial('emblem') as THREE.MeshBasicMaterial;

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
    this.deps.scene.add(symbol);
  }

  // ============================================================================
  // Time Update (for animations)
  // ============================================================================

  updateTime(time: number): void {
    this.time = time;
  }

  // ============================================================================
  // Wall Transparency System (smooth opacity fade for isometric camera)
  // ============================================================================

  /**
   * Update wall opacity based on entity positions.
   * Walls near entities fade to lower opacity for visibility.
   * Animation is smooth - opacity lerps toward target.
   *
   * @param entityPositions Array of entity world positions {x, z}
   * @param dt Delta time in seconds for smooth animation
   */
  updateWallOcclusion(
    entityPositions: Array<{ x: number; z: number }>,
    dt: number = 0.016
  ): void {
    if (this.walls.length === 0) return;

    // For each wall, calculate target opacity based on distance to nearest entity
    for (const wall of this.walls) {
      let minDistSq = Infinity;

      // Find closest entity to this wall
      for (const entity of entityPositions) {
        const dx = wall.worldX - entity.x;
        const dz = wall.worldZ - entity.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDistSq) {
          minDistSq = distSq;
        }
      }

      const minDist = Math.sqrt(minDistSq);

      // Calculate target opacity based on distance
      if (minDist < this.WALL_FADE_RADIUS) {
        // Fade based on how close the entity is
        const t = minDist / this.WALL_FADE_RADIUS;
        wall.targetOpacity = this.WALL_OPACITY_MIN + t * (this.WALL_OPACITY_MAX - this.WALL_OPACITY_MIN);
      } else {
        wall.targetOpacity = this.WALL_OPACITY_MAX;
      }

      // Smoothly animate toward target opacity
      const diff = wall.targetOpacity - wall.currentOpacity;
      if (Math.abs(diff) > 0.001) {
        wall.currentOpacity += Math.sign(diff) * Math.min(Math.abs(diff), this.WALL_FADE_SPEED * dt);

        // Update material opacity
        const mat = wall.mesh.material as THREE.MeshLambertMaterial;
        mat.opacity = wall.currentOpacity;
      }
    }
  }

  /**
   * Reset all walls to full opacity
   */
  resetWallOcclusion(): void {
    for (const wall of this.walls) {
      wall.currentOpacity = this.WALL_OPACITY_MAX;
      wall.targetOpacity = this.WALL_OPACITY_MAX;
      const mat = wall.mesh.material as THREE.MeshLambertMaterial;
      mat.opacity = this.WALL_OPACITY_MAX;
    }
  }
}
