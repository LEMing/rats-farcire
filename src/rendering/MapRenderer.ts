import * as THREE from 'three/webgpu';
import type { MapData, Vec3, Room } from '@shared/types';
import { TILE_SIZE, COLORS } from '@shared/constants';
import { TardisFactory, TardisInstance } from './TardisFactory';
import { MapDecorations } from './MapDecorations';
import { Zone, getZoneForRoomType } from './ZoneConfig';
import { getTextureManager } from './TextureManager';

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

// Wall data for smooth height cutting (Sims-style)
interface WallData {
  mesh: THREE.Mesh;
  worldX: number;
  worldZ: number;
  currentHeight: number;  // 0 to 1 (percentage of full height)
  targetHeight: number;
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

  // Explosive barrels
  private explosiveBarrels: Map<string, THREE.Group> = new Map();

  // Time tracking for animations
  private time = 0;

  // Wall visibility - front-facing walls are always short
  private walls: WallData[] = [];
  private readonly WALL_HEIGHT_MAX = 1.0;  // Full height for back walls
  private readonly WALL_HEIGHT_MIN = 0.35; // Short height for front-facing walls

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

    const debrisMat = this.deps.getMaterial('debris')!;
    const puddleMat = this.deps.getMaterial('puddle')!;

    // Get texture manager for zone-specific materials
    const textureManager = getTextureManager();

    // ========================================================================
    // ZONE-AWARE FLOOR RENDERING
    // First pass: Identify floor tiles, zones, and transitions
    // ========================================================================
    interface FloorTileInfo {
      x: number;
      y: number;
      zone: Zone;
      adjacentZone: Zone | null; // If set, this is a transition tile
    }

    const floorTiles: FloorTileInfo[] = [];
    const zoneFloorCounts: Record<Zone, number> = {
      industrial: 0,
      ritual: 0,
      organic: 0,
      neutral: 0,
    };

    // Collect floor tiles and identify transitions
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];
        if (tile.type === 'floor' || tile.type === 'puddle') {
          const zone = this.getZoneForTile(x, y, mapData.rooms, mapData);
          const adjacentZone = this.getAdjacentZone(x, y, zone, mapData.rooms, mapData);

          floorTiles.push({ x, y, zone, adjacentZone });

          // Only count non-transition tiles for instanced meshes
          if (!adjacentZone) {
            zoneFloorCounts[zone]++;
          }
        }
      }
    }

    // Create instanced meshes for each zone (only for non-transition tiles)
    const zoneFloorMeshes: Partial<Record<Zone, THREE.InstancedMesh>> = {};
    const zoneFloorIndices: Record<Zone, number> = {
      industrial: 0,
      ritual: 0,
      organic: 0,
      neutral: 0,
    };

    for (const zone of ['industrial', 'ritual', 'organic', 'neutral'] as Zone[]) {
      if (zoneFloorCounts[zone] > 0) {
        const zoneMaterial = textureManager.getFloorMaterial(zone);
        const instanced = new THREE.InstancedMesh(
          floorGeom,
          zoneMaterial,
          zoneFloorCounts[zone]
        );
        instanced.receiveShadow = true;
        instanced.userData.mapObject = true;
        instanced.userData.zone = zone;
        zoneFloorMeshes[zone] = instanced;
      }
    }

    const matrix = new THREE.Matrix4();

    // Create transition floor tiles as individual meshes with blended colors
    for (const tileInfo of floorTiles) {
      if (tileInfo.adjacentZone) {
        const worldX = tileInfo.x * TILE_SIZE;
        const worldZ = tileInfo.y * TILE_SIZE;

        // Use 50% blend for transition tiles
        const transitionMat = textureManager.getTransitionFloorMaterial(
          tileInfo.zone,
          tileInfo.adjacentZone,
          0.5
        );

        const transitionFloor = new THREE.Mesh(floorGeom, transitionMat);
        transitionFloor.position.set(worldX, 0, worldZ);
        transitionFloor.receiveShadow = true;
        transitionFloor.userData.mapObject = true;
        this.deps.scene.add(transitionFloor);
      }
    }

    // ========================================================================
    // BUILD MAP TILES
    // ========================================================================
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];
        const worldX = x * TILE_SIZE;
        const worldZ = y * TILE_SIZE;

        if (tile.type === 'floor') {
          // Check if this is a transition tile (already handled)
          const zone = this.getZoneForTile(x, y, mapData.rooms, mapData);
          const adjacentZone = this.getAdjacentZone(x, y, zone, mapData.rooms, mapData);

          // Only add to instanced mesh if NOT a transition tile
          if (!adjacentZone) {
            const instanced = zoneFloorMeshes[zone];
            if (instanced) {
              matrix.setPosition(worldX, 0, worldZ);
              instanced.setMatrixAt(zoneFloorIndices[zone]++, matrix);
            }
          }

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
          // Get zone-specific wall material
          const zone = this.getZoneForTile(x, y, mapData.rooms, mapData);
          const wallMat = textureManager.getWallMaterialClone(zone);

          const wallMesh = new THREE.Mesh(wallGeom, wallMat);
          const baseY = TILE_SIZE / 2;
          wallMesh.castShadow = true;
          wallMesh.receiveShadow = true;
          wallMesh.userData.mapObject = true;
          wallMesh.userData.baseY = baseY;

          // Check if wall has floor in front (camera-facing direction: -X or -Z)
          // Camera is at +X,+Z looking toward -X,-Z, so front walls have floor at lower x or lower y
          const hasFloorLeft = x > 0 && mapData.tiles[y]?.[x - 1]?.type === 'floor';
          const hasFloorUp = y > 0 && mapData.tiles[y - 1]?.[x]?.type === 'floor';
          const isFrontWall = hasFloorLeft || hasFloorUp;

          // Front-facing walls are always short for visibility
          const wallHeight = isFrontWall ? this.WALL_HEIGHT_MIN : this.WALL_HEIGHT_MAX;
          wallMesh.scale.y = wallHeight;
          wallMesh.position.set(worldX, baseY * wallHeight, worldZ);
          this.deps.scene.add(wallMesh);

          // Store wall data (no longer animated, but keep for potential future use)
          this.walls.push({
            mesh: wallMesh,
            worldX,
            worldZ,
            currentHeight: wallHeight,
            targetHeight: wallHeight,
          });

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
          // Floor under puddle - add to zone-specific mesh (skip if transition)
          const zone = this.getZoneForTile(x, y, mapData.rooms, mapData);
          const adjacentZone = this.getAdjacentZone(x, y, zone, mapData.rooms, mapData);

          if (!adjacentZone) {
            const instanced = zoneFloorMeshes[zone];
            if (instanced) {
              matrix.setPosition(worldX, 0, worldZ);
              instanced.setMatrixAt(zoneFloorIndices[zone]++, matrix);
            }
          }

          const puddle = new THREE.Mesh(puddleGeom, puddleMat);
          puddle.position.set(worldX, 0.06, worldZ);
          puddle.userData.mapObject = true;
          this.deps.scene.add(puddle);
        }
      }
    }

    // Add all zone floor meshes to scene
    for (const instanced of Object.values(zoneFloorMeshes)) {
      if (instanced) {
        instanced.instanceMatrix.needsUpdate = true;
        this.deps.scene.add(instanced);
      }
    }

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
    // Decorate each room based on its type
    for (const room of mapData.rooms) {
      this.decorateRoom(room, mapData);
    }

    // Place ritual circles near altars (global decoration)
    for (const altar of mapData.altarPositions) {
      if (Math.random() < 0.5) {
        const circle = MapDecorations.createRitualCircle(
          altar.x * TILE_SIZE,
          altar.y * TILE_SIZE
        );
        circle.position.x += (Math.random() - 0.5) * 2;
        circle.position.z += (Math.random() - 0.5) * 2;
        this.deps.scene.add(circle);
      }
    }

    // Decorate corridors
    this.decorateCorridors(mapData);
  }

  /**
   * Check if a tile position is inside any room
   */
  private isInsideRoom(x: number, y: number, rooms: Room[]): boolean {
    for (const room of rooms) {
      if (x >= room.x && x < room.x + room.width &&
          y >= room.y && y < room.y + room.height) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the room at a tile position (null if corridor)
   */
  private getRoomAtTile(x: number, y: number, rooms: Room[]): Room | null {
    for (const room of rooms) {
      if (x >= room.x && x < room.x + room.width &&
          y >= room.y && y < room.y + room.height) {
        return room;
      }
    }
    return null;
  }

  /**
   * Get the zone for a tile position
   * Rooms use their room type's zone, corridors use adjacent room's zone or 'organic' fallback
   */
  private getZoneForTile(x: number, y: number, rooms: Room[], _mapData: MapData): Zone {
    const room = this.getRoomAtTile(x, y, rooms);
    if (room) {
      return getZoneForRoomType(room.roomType);
    }

    // Corridor tile - check adjacent tiles for nearby rooms
    const directions = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    ];

    for (const dir of directions) {
      const adjRoom = this.getRoomAtTile(x + dir.dx, y + dir.dy, rooms);
      if (adjRoom) {
        return getZoneForRoomType(adjRoom.roomType);
      }
    }

    // Default corridor zone
    return 'organic';
  }

  /**
   * Check if a tile is at a zone boundary (adjacent to a different zone)
   * Returns the adjacent zone if it's different, null otherwise
   */
  private getAdjacentZone(x: number, y: number, currentZone: Zone, rooms: Room[], mapData: MapData): Zone | null {
    const directions = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    ];

    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;

      // Check bounds and if it's a floor tile
      if (nx >= 0 && nx < mapData.width && ny >= 0 && ny < mapData.height) {
        const adjTile = mapData.tiles[ny]?.[nx];
        if (adjTile && (adjTile.type === 'floor' || adjTile.type === 'puddle')) {
          const adjZone = this.getZoneForTile(nx, ny, rooms, mapData);
          if (adjZone !== currentZone) {
            return adjZone;
          }
        }
      }
    }

    return null;
  }

  /**
   * Decorate corridor tiles with debris and puddles
   */
  private decorateCorridors(mapData: MapData): void {
    const corridorTiles: { x: number; y: number }[] = [];

    // Find all corridor tiles (floor tiles not in any room)
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y]?.[x];
        if (tile && tile.walkable && !this.isInsideRoom(x, y, mapData.rooms)) {
          corridorTiles.push({ x, y });
        }
      }
    }

    // Scatter debris along corridors (~5% of tiles)
    for (const tile of corridorTiles) {
      if (Math.random() < 0.05) {
        const debris = MapDecorations.createSmallDebris(
          tile.x * TILE_SIZE + (Math.random() - 0.5) * 0.5,
          tile.y * TILE_SIZE + (Math.random() - 0.5) * 0.5
        );
        this.deps.scene.add(debris);
      }
    }

    // Scatter puddles (~3% of tiles)
    for (const tile of corridorTiles) {
      if (Math.random() < 0.03) {
        const isBlood = Math.random() < 0.3;
        const puddle = MapDecorations.createPuddle(
          tile.x * TILE_SIZE + (Math.random() - 0.5) * 0.3,
          tile.y * TILE_SIZE + (Math.random() - 0.5) * 0.3,
          isBlood
        );
        this.deps.scene.add(puddle);
      }
    }

    // Add occasional bone piles in corridors (~2% of tiles)
    for (const tile of corridorTiles) {
      if (Math.random() < 0.02) {
        const bones = MapDecorations.createBonePile(
          tile.x * TILE_SIZE + (Math.random() - 0.5) * 0.4,
          tile.y * TILE_SIZE + (Math.random() - 0.5) * 0.4
        );
        this.deps.scene.add(bones);
      }
    }
  }

  /**
   * Decorate a room based on its type
   */
  private decorateRoom(room: Room, mapData: MapData): void {
    const centerX = (room.x + room.width / 2) * TILE_SIZE;
    const centerZ = (room.y + room.height / 2) * TILE_SIZE;

    switch (room.roomType) {
      case 'spawn':
        // Spawn room - well lit, minimal clutter
        this.decorateSpawnRoom(room, mapData);
        break;

      case 'tardis':
        // TARDIS room - mysterious, ritual elements
        this.decorateTardisRoom(room, mapData);
        break;

      case 'cell':
        // Power cell room - tech/energy theme
        this.decorateCellRoom(room, mapData);
        break;

      case 'grinder':
        // Meat grinder room - industrial horror
        this.decorateGrinderRoom(room, centerX, centerZ, mapData);
        break;

      case 'storage':
        // Storage room - crates, barrels
        this.decorateStorageRoom(room, mapData);
        break;

      case 'nest':
        // Rat nest - bones, rat holes, debris
        this.decorateNestRoom(room, mapData);
        break;

      case 'shrine':
        // Cult shrine - candles, ritual circles
        this.decorateShrineRoom(room, centerX, centerZ, mapData);
        break;

      case 'altar':
      case 'normal':
      default:
        // Normal/altar rooms - light random decorations
        this.decorateNormalRoom(room, mapData);
        break;
    }
  }

  private decorateSpawnRoom(room: Room, _mapData: MapData): void {
    // A few crates in corners for cover
    const cornerPositions = this.getRoomEdgePositions(room, 1.5);
    for (const pos of cornerPositions) {
      if (Math.random() < 0.5) {
        const crate = MapDecorations.createCrate(pos.x, pos.z);
        this.deps.scene.add(crate);
      }
    }

    // Maybe a barrel or two
    if (Math.random() < 0.6) {
      const pos = this.getRandomRoomPosition(room);
      const barrel = MapDecorations.createBarrel(pos.x, pos.z, false);
      this.deps.scene.add(barrel);
    }
  }

  private decorateTardisRoom(room: Room, _mapData: MapData): void {
    // Add candle clusters around the room edges
    const positions = this.getRoomEdgePositions(room, 2);
    for (const pos of positions) {
      if (Math.random() < 0.6) {
        const candles = MapDecorations.createCandleCluster(pos.x, pos.z);
        this.deps.scene.add(candles);
      }
    }

    // Mysterious debris
    const debrisCount = 2 + Math.floor(Math.random() * 2);
    const debrisPositions = this.getRandomRoomPositions(room, debrisCount);
    for (const pos of debrisPositions) {
      const debris = MapDecorations.createDebrisCluster(pos.x, pos.z);
      this.deps.scene.add(debris);
    }
  }

  private decorateCellRoom(room: Room, _mapData: MapData): void {
    // Tech debris scattered around - increased density
    const debrisCount = 4 + Math.floor(Math.random() * 3);
    const positions = this.getRandomRoomPositions(room, debrisCount);
    for (const pos of positions) {
      const debris = MapDecorations.createDebrisCluster(pos.x, pos.z);
      this.deps.scene.add(debris);
    }

    // Add some crates
    const crateCount = 1 + Math.floor(Math.random() * 2);
    const cratePositions = this.getRandomRoomPositions(room, crateCount);
    for (const pos of cratePositions) {
      const crate = MapDecorations.createCrate(pos.x, pos.z);
      this.deps.scene.add(crate);
    }
  }

  private decorateGrinderRoom(room: Room, centerX: number, centerZ: number, _mapData: MapData): void {
    // Centerpiece: Meat grinder
    const grinder = MapDecorations.createMeatGrinder(centerX, centerZ);
    this.deps.scene.add(grinder);

    // Meat piles around the grinder - many piles
    const pileCount = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < pileCount; i++) {
      const angle = (i / pileCount) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 1.2 + Math.random() * 2.5;
      const pile = MapDecorations.createMeatPile(
        centerX + Math.cos(angle) * dist,
        0,
        centerZ + Math.sin(angle) * dist
      );
      this.deps.scene.add(pile);
    }

    // Blood pools everywhere
    const poolCount = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < poolCount; i++) {
      const pos = this.getRandomRoomPosition(room);
      const pool = MapDecorations.createBloodPool(pos.x, pos.z);
      this.deps.scene.add(pool);
    }

    // Scattered bones
    const boneCount = 4 + Math.floor(Math.random() * 3);
    const bonePositions = this.getRandomRoomPositions(room, boneCount);
    for (const pos of bonePositions) {
      const bones = MapDecorations.createBonePile(pos.x, pos.z);
      this.deps.scene.add(bones);
    }

    // Crates and barrels around edges
    const cratePositions = this.getRandomRoomPositions(room, 3);
    for (const pos of cratePositions) {
      if (Math.random() > 0.5) {
        const crate = MapDecorations.createCrate(pos.x, pos.z);
        this.deps.scene.add(crate);
      } else {
        const barrel = MapDecorations.createBarrel(pos.x, pos.z, Math.random() < 0.3);
        this.deps.scene.add(barrel);
      }
    }

    // Metal debris clusters (industrial zone)
    const debrisCount = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < debrisCount; i++) {
      const pos = this.getRandomRoomPosition(room);
      const debris = MapDecorations.createMetalDebris(pos.x, pos.z);
      this.deps.scene.add(debris);
    }

    // Industrial lamps (industrial zone)
    const lampCount = 1 + Math.floor(Math.random() * 2);
    const lampPositions = this.getRandomRoomPositions(room, lampCount);
    for (const pos of lampPositions) {
      const lamp = MapDecorations.createIndustrialLamp(pos.x, pos.z);
      this.deps.scene.add(lamp);
    }
  }

  private decorateStorageRoom(room: Room, mapData: MapData): void {
    // Crate stacks as focal points - more stacks
    const stackCount = room.width >= 6 ? 3 : 2;
    const stackPositions = this.getRandomRoomPositions(room, stackCount, 2);
    for (const pos of stackPositions) {
      const stack = MapDecorations.createCrateStack(pos.x, pos.z);
      this.deps.scene.add(stack);
    }

    // Scattered crates only (no decorative barrels - explosive barrels are spawned separately)
    const scatterCount = 6 + Math.floor(Math.random() * 4);
    const scatterPositions = this.getRandomRoomPositions(room, scatterCount);
    for (const pos of scatterPositions) {
      const crate = MapDecorations.createCrate(pos.x, pos.z);
      this.deps.scene.add(crate);
    }

    // Metal debris on the floor (industrial zone)
    const debrisPositions = this.getRandomRoomPositions(room, 3);
    for (const pos of debrisPositions) {
      const debris = MapDecorations.createMetalDebris(pos.x, pos.z);
      this.deps.scene.add(debris);
    }

    // Industrial lamps
    if (Math.random() < 0.7) {
      const lampPos = this.getRandomRoomPosition(room);
      const lamp = MapDecorations.createIndustrialLamp(lampPos.x, lampPos.z);
      this.deps.scene.add(lamp);
    }

    // Wall pipes (industrial zone)
    this.addIndustrialPipesToRoom(room, mapData);
  }

  /**
   * Add industrial pipes along walls
   */
  private addIndustrialPipesToRoom(room: Room, mapData: MapData): void {
    // Find walls and add pipes
    const pipeChance = 0.15;

    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (mapData.tiles[y]?.[x]?.type !== 'floor') continue;
        if (Math.random() > pipeChance) continue;

        const worldX = x * TILE_SIZE;
        const worldZ = y * TILE_SIZE;

        const hasWallRight = x < mapData.width - 1 && mapData.tiles[y][x + 1]?.type === 'wall';
        const hasWallUp = y > 0 && mapData.tiles[y - 1]?.[x]?.type === 'wall';

        if (hasWallRight) {
          const pipe = MapDecorations.createWallPipe(worldX + TILE_SIZE * 0.4, worldZ, 'z', 2);
          this.deps.scene.add(pipe);
        } else if (hasWallUp) {
          const pipe = MapDecorations.createWallPipe(worldX, worldZ - TILE_SIZE * 0.4, 'x', 2);
          this.deps.scene.add(pipe);
        }
      }
    }
  }

  private decorateNestRoom(room: Room, mapData: MapData): void {
    // Bone piles - very dense in nest rooms
    const boneCount = 6 + Math.floor(Math.random() * 4);
    const bonePositions = this.getRandomRoomPositions(room, boneCount);
    for (const pos of bonePositions) {
      const bones = MapDecorations.createBonePile(pos.x, pos.z);
      this.deps.scene.add(bones);
    }

    // Debris clusters - lots of debris
    const debrisCount = 5 + Math.floor(Math.random() * 3);
    const debrisPositions = this.getRandomRoomPositions(room, debrisCount);
    for (const pos of debrisPositions) {
      const debris = MapDecorations.createDebrisCluster(pos.x, pos.z);
      this.deps.scene.add(debris);
    }

    // Mushroom clusters (organic zone)
    const mushroomCount = 2 + Math.floor(Math.random() * 3);
    const mushroomPositions = this.getRandomRoomPositions(room, mushroomCount);
    for (const pos of mushroomPositions) {
      const mushrooms = MapDecorations.createMushroomCluster(pos.x, pos.z);
      this.deps.scene.add(mushrooms);
    }

    // Egg sacs (organic zone)
    const eggCount = 1 + Math.floor(Math.random() * 2);
    const eggPositions = this.getRandomRoomPositions(room, eggCount);
    for (const pos of eggPositions) {
      const egg = MapDecorations.createEggSac(pos.x, pos.z);
      this.deps.scene.add(egg);
    }

    // Some broken crates/barrels
    const crateCount = 2 + Math.floor(Math.random() * 2);
    const cratePositions = this.getRandomRoomPositions(room, crateCount);
    for (const pos of cratePositions) {
      if (Math.random() > 0.5) {
        const crate = MapDecorations.createCrate(pos.x, pos.z);
        this.deps.scene.add(crate);
      } else {
        const barrel = MapDecorations.createBarrel(pos.x, pos.z, true); // Always tipped
        this.deps.scene.add(barrel);
      }
    }

    // Puddles (water and blood)
    const puddleCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < puddleCount; i++) {
      const pos = this.getRandomRoomPosition(room);
      const isBlood = Math.random() < 0.5;
      const puddle = MapDecorations.createPuddle(pos.x, pos.z, isBlood);
      this.deps.scene.add(puddle);
    }

    // Rat holes on walls - many holes
    this.addRatHolesToRoom(room, mapData, 0.25);

    // Wall vines (organic zone)
    this.addOrganicVinesToRoom(room, mapData);
  }

  /**
   * Add organic vines to walls
   */
  private addOrganicVinesToRoom(room: Room, mapData: MapData): void {
    const vineChance = 0.12;

    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (mapData.tiles[y]?.[x]?.type !== 'floor') continue;
        if (Math.random() > vineChance) continue;

        const worldX = x * TILE_SIZE;
        const worldZ = y * TILE_SIZE;

        const hasWallRight = x < mapData.width - 1 && mapData.tiles[y][x + 1]?.type === 'wall';
        const hasWallLeft = x > 0 && mapData.tiles[y][x - 1]?.type === 'wall';
        const hasWallDown = y < mapData.height - 1 && mapData.tiles[y + 1]?.[x]?.type === 'wall';
        const hasWallUp = y > 0 && mapData.tiles[y - 1]?.[x]?.type === 'wall';

        if (hasWallRight) {
          const vines = MapDecorations.createWallVines(worldX, worldZ, 'x', 1);
          this.deps.scene.add(vines);
        } else if (hasWallLeft) {
          const vines = MapDecorations.createWallVines(worldX, worldZ, 'x', -1);
          this.deps.scene.add(vines);
        } else if (hasWallDown) {
          const vines = MapDecorations.createWallVines(worldX, worldZ, 'z', 1);
          this.deps.scene.add(vines);
        } else if (hasWallUp) {
          const vines = MapDecorations.createWallVines(worldX, worldZ, 'z', -1);
          this.deps.scene.add(vines);
        }
      }
    }
  }

  private decorateShrineRoom(room: Room, centerX: number, centerZ: number, _mapData: MapData): void {
    // Central ritual circle
    const circle = MapDecorations.createRitualCircle(centerX, centerZ);
    this.deps.scene.add(circle);

    // Candle clusters around the circle - more candles
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const dist = 1.5 + Math.random() * 0.5;
      const candles = MapDecorations.createCandleCluster(
        centerX + Math.cos(angle) * dist,
        centerZ + Math.sin(angle) * dist
      );
      this.deps.scene.add(candles);
    }

    // Crystal clusters (ritual zone)
    const crystalCount = 2 + Math.floor(Math.random() * 2);
    const crystalPositions = this.getRandomRoomPositions(room, crystalCount);
    for (const pos of crystalPositions) {
      const crystal = MapDecorations.createCrystalCluster(pos.x, pos.z);
      this.deps.scene.add(crystal);
    }

    // Arcane floor symbols (ritual zone)
    const symbolCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < symbolCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 2.5 + Math.random() * 1;
      const symbol = MapDecorations.createArcaneSymbol(
        centerX + Math.cos(angle) * dist,
        centerZ + Math.sin(angle) * dist
      );
      this.deps.scene.add(symbol);
    }

    // Bone offerings
    const boneCount = 1 + Math.floor(Math.random() * 2);
    const bonePositions = this.getRandomRoomPositions(room, boneCount);
    for (const pos of bonePositions) {
      const bones = MapDecorations.createBonePile(pos.x, pos.z);
      this.deps.scene.add(bones);
    }

    // Blood pools near the altar
    const poolCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < poolCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 2 + Math.random() * 1.5;
      const pool = MapDecorations.createBloodPool(
        centerX + Math.cos(angle) * dist,
        centerZ + Math.sin(angle) * dist
      );
      this.deps.scene.add(pool);
    }
  }

  private decorateNormalRoom(room: Room, mapData: MapData): void {
    // Random decorations - more dense
    const decorCount = 5 + Math.floor(Math.random() * 4);
    const positions = this.getRandomRoomPositions(room, decorCount);

    for (const pos of positions) {
      const rand = Math.random();
      if (rand < 0.20) {
        const bones = MapDecorations.createBonePile(pos.x, pos.z);
        this.deps.scene.add(bones);
      } else if (rand < 0.40) {
        const debris = MapDecorations.createDebrisCluster(pos.x, pos.z);
        this.deps.scene.add(debris);
      } else if (rand < 0.60) {
        const crate = MapDecorations.createCrate(pos.x, pos.z);
        this.deps.scene.add(crate);
      } else if (rand < 0.80) {
        const barrel = MapDecorations.createBarrel(pos.x, pos.z, Math.random() < 0.25);
        this.deps.scene.add(barrel);
      } else {
        const smallDebris = MapDecorations.createSmallDebris(pos.x, pos.z);
        this.deps.scene.add(smallDebris);
      }
    }

    // Scatter small debris
    const smallCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < smallCount; i++) {
      const pos = this.getRandomRoomPosition(room);
      const debris = MapDecorations.createSmallDebris(pos.x, pos.z);
      this.deps.scene.add(debris);
    }

    // Multiple puddles
    const puddleCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < puddleCount; i++) {
      const pos = this.getRandomRoomPosition(room);
      const isBlood = Math.random() < 0.3;
      const puddle = MapDecorations.createPuddle(pos.x, pos.z, isBlood);
      this.deps.scene.add(puddle);
    }

    // Rat holes
    if (Math.random() < 0.5) {
      this.addRatHolesToRoom(room, mapData, 0.08);
    }
  }

  // ============================================================================
  // Decoration Helper Methods
  // ============================================================================

  private getRandomRoomPosition(room: Room): { x: number; z: number } {
    const padding = 1;
    const x = room.x + padding + Math.random() * (room.width - padding * 2);
    const z = room.y + padding + Math.random() * (room.height - padding * 2);
    return { x: x * TILE_SIZE, z: z * TILE_SIZE };
  }

  private getRandomRoomPositions(room: Room, count: number, minDist: number = 1.5): { x: number; z: number }[] {
    const positions: { x: number; z: number }[] = [];
    const maxAttempts = count * 10;

    for (let attempt = 0; attempt < maxAttempts && positions.length < count; attempt++) {
      const pos = this.getRandomRoomPosition(room);

      // Check minimum distance from existing positions
      const tooClose = positions.some(p => {
        const dx = p.x - pos.x;
        const dz = p.z - pos.z;
        return Math.sqrt(dx * dx + dz * dz) < minDist * TILE_SIZE;
      });

      if (!tooClose) {
        positions.push(pos);
      }
    }

    return positions;
  }

  private getRoomEdgePositions(room: Room, padding: number): { x: number; z: number }[] {
    const positions: { x: number; z: number }[] = [];
    const innerPadding = padding;

    // Corners and edge midpoints
    const corners = [
      { x: room.x + innerPadding, z: room.y + innerPadding },
      { x: room.x + room.width - innerPadding, z: room.y + innerPadding },
      { x: room.x + innerPadding, z: room.y + room.height - innerPadding },
      { x: room.x + room.width - innerPadding, z: room.y + room.height - innerPadding },
    ];

    for (const corner of corners) {
      positions.push({ x: corner.x * TILE_SIZE, z: corner.z * TILE_SIZE });
    }

    return positions;
  }

  private addRatHolesToRoom(room: Room, mapData: MapData, chance: number): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (mapData.tiles[y]?.[x]?.type !== 'floor') continue;
        if (Math.random() > chance) continue;

        const worldX = x * TILE_SIZE;
        const worldZ = y * TILE_SIZE;

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

    // Hexagonal battery core (golden/amber energy)
    const coreGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.7, 6);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.95,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = 0.8;
    core.name = 'core';
    cellGroup.add(core);

    // Top cap (bright energy point)
    const capGeom = new THREE.ConeGeometry(0.18, 0.25, 6);
    const capMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const topCap = new THREE.Mesh(capGeom, capMat);
    topCap.position.y = 1.25;
    topCap.name = 'topCap';
    cellGroup.add(topCap);

    // Bottom cap (inverted)
    const bottomCap = new THREE.Mesh(capGeom, capMat);
    bottomCap.position.y = 0.35;
    bottomCap.rotation.x = Math.PI;
    bottomCap.name = 'bottomCap';
    cellGroup.add(bottomCap);

    // Outer glow shell (larger hexagon)
    const glowGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 0.8;
    glow.name = 'glow';
    cellGroup.add(glow);

    // Orbiting energy ring 1
    const ringGeom = new THREE.TorusGeometry(0.5, 0.04, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffdd00,
      transparent: true,
      opacity: 0.7,
    });
    const ring1 = new THREE.Mesh(ringGeom, ringMat);
    ring1.position.y = 0.8;
    ring1.rotation.x = Math.PI / 2;
    ring1.name = 'ring1';
    cellGroup.add(ring1);

    // Orbiting energy ring 2 (tilted)
    const ring2 = new THREE.Mesh(ringGeom, ringMat);
    ring2.position.y = 0.8;
    ring2.rotation.x = Math.PI / 3;
    ring2.name = 'ring2';
    cellGroup.add(ring2);

    // Point light for warm glow effect
    const light = new THREE.PointLight(0xffaa00, 1.2, 8);
    light.position.y = 0.8;
    cellGroup.add(light);

    // Store metadata and cache mesh references (avoids getObjectByName lookups per frame)
    cellGroup.userData.mapObject = true;
    cellGroup.userData.cellId = cellId;
    cellGroup.userData.baseY = 0.8;
    cellGroup.userData.meshes = { core, topCap, bottomCap, glow, ring1, ring2, light };

    this.deps.scene.add(cellGroup);
    this.powerCells.set(cellId, cellGroup);
    this.powerCellIds.push(cellId);

    return cellId;
  }

  updatePowerCells(): void {
    const pulse = Math.sin(this.time * 3) * 0.5 + 0.5;

    for (const [, cellGroup] of this.powerCells) {
      // Use cached mesh references (set during creation) instead of getObjectByName
      const meshes = cellGroup.userData.meshes;
      if (!meshes) continue;

      const { core, topCap, bottomCap, glow, ring1, ring2, light } = meshes as {
        core: THREE.Mesh; topCap: THREE.Mesh; bottomCap: THREE.Mesh;
        glow: THREE.Mesh; ring1: THREE.Mesh; ring2: THREE.Mesh; light: THREE.PointLight;
      };
      const baseY = cellGroup.userData.baseY || 0.8;

      // Slow rotation of core battery
      if (core) {
        core.rotation.y += 0.01;
        core.position.y = baseY + Math.sin(this.time * 2) * 0.08;
      }

      // Sync caps with core
      if (topCap && core) {
        topCap.rotation.y = core.rotation.y;
        topCap.position.y = core.position.y + 0.45;
      }
      if (bottomCap && core) {
        bottomCap.rotation.y = core.rotation.y;
        bottomCap.position.y = core.position.y - 0.45;
      }

      // Pulsing glow shell
      if (glow && core) {
        glow.rotation.y = core.rotation.y;
        glow.position.y = core.position.y;
        glow.scale.setScalar(1 + pulse * 0.15);
      }

      // Rotating energy rings (orbiting effect)
      if (ring1) {
        ring1.rotation.z += 0.03;
        ring1.position.y = core ? core.position.y : baseY;
      }
      if (ring2) {
        ring2.rotation.z -= 0.02;
        ring2.rotation.y += 0.01;
        ring2.position.y = core ? core.position.y : baseY;
      }

      // Update light intensity with pulse (using cached reference)
      if (light) {
        light.intensity = 1.0 + pulse * 0.5;
        if (core) light.position.y = core.position.y;
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

    // Create new cell visual (matching createPowerCell design)
    const cellGroup = new THREE.Group();
    cellGroup.position.set(x, 0, z);

    // Hexagonal battery core (golden/amber energy)
    const coreGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.7, 6);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.95,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = 0.8;
    core.name = 'core';
    cellGroup.add(core);

    // Top cap (bright energy point)
    const capGeom = new THREE.ConeGeometry(0.18, 0.25, 6);
    const capMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const topCap = new THREE.Mesh(capGeom, capMat);
    topCap.position.y = 1.25;
    topCap.name = 'topCap';
    cellGroup.add(topCap);

    // Bottom cap (inverted)
    const bottomCap = new THREE.Mesh(capGeom, capMat);
    bottomCap.position.y = 0.35;
    bottomCap.rotation.x = Math.PI;
    bottomCap.name = 'bottomCap';
    cellGroup.add(bottomCap);

    // Outer glow shell (larger hexagon)
    const glowGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 0.8;
    glow.name = 'glow';
    cellGroup.add(glow);

    // Orbiting energy ring 1
    const ringGeom = new THREE.TorusGeometry(0.5, 0.04, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffdd00,
      transparent: true,
      opacity: 0.7,
    });
    const ring1 = new THREE.Mesh(ringGeom, ringMat);
    ring1.position.y = 0.8;
    ring1.rotation.x = Math.PI / 2;
    ring1.name = 'ring1';
    cellGroup.add(ring1);

    // Orbiting energy ring 2 (tilted)
    const ring2 = new THREE.Mesh(ringGeom, ringMat);
    ring2.position.y = 0.8;
    ring2.rotation.x = Math.PI / 3;
    ring2.name = 'ring2';
    cellGroup.add(ring2);

    // Point light for warm glow effect
    const light = new THREE.PointLight(0xffaa00, 1.2, 8);
    light.position.y = 0.8;
    cellGroup.add(light);

    // Store metadata and cache mesh references (avoids getObjectByName lookups per frame)
    cellGroup.userData.mapObject = true;
    cellGroup.userData.cellId = cellId;
    cellGroup.userData.baseY = 0.8;
    cellGroup.userData.meshes = { core, topCap, bottomCap, glow, ring1, ring2, light };

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
  // Explosive Barrel System
  // ============================================================================

  spawnExplosiveBarrel(barrelId: string, x: number, z: number): void {
    // Don't spawn if already exists
    if (this.explosiveBarrels.has(barrelId)) return;

    const barrelGroup = MapDecorations.createExplosiveBarrel(x, z, barrelId);
    this.deps.scene.add(barrelGroup);
    this.explosiveBarrels.set(barrelId, barrelGroup);
  }

  removeExplosiveBarrel(barrelId: string): void {
    const barrelGroup = this.explosiveBarrels.get(barrelId);
    if (barrelGroup) {
      this.explosiveBarrels.delete(barrelId);
      // Scale to 0 to hide instantly
      barrelGroup.scale.set(0, 0, 0);
    }
  }

  getExplosiveBarrelCount(): number {
    return this.explosiveBarrels.size;
  }

  clearExplosiveBarrels(): void {
    for (const [, barrelGroup] of this.explosiveBarrels) {
      this.deps.scene.remove(barrelGroup);
    }
    this.explosiveBarrels.clear();
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

      // Point lights removed for performance - glow sprites provide visual
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

    // Point lights removed for performance - glow sprites provide visual
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
  // Wall Visibility (static - front-facing walls are always short)
  // ============================================================================

  /**
   * Wall visibility is now set statically at build time.
   * This method is kept for API compatibility but does nothing.
   */
  updateWallOcclusion(
    _entityPositions: Array<{ x: number; z: number }>,
    _dt: number = 0.016
  ): void {
    // Wall heights are set statically at build time - no dynamic updates needed
  }

  /**
   * Reset walls - kept for API compatibility but does nothing.
   */
  resetWallOcclusion(): void {
    // Wall heights are set statically - no reset needed
  }
}
