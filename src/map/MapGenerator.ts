import type { MapData, Room, Tile, Vec2, TileType, RoomType } from '@shared/types';
import {
  MIN_ROOM_SIZE,
  MAX_ROOM_SIZE,
  ROOM_COUNT,
  CORRIDOR_WIDTH,
  POWER_CELLS_REQUIRED,
} from '@shared/constants';
import { SeededRandom } from '@shared/utils';
import { debug } from '../utils/debug';

// ============================================================================
// Procedural Map Generator
// Generates dungeon-like maps with rooms and corridors
// ============================================================================

export class MapGenerator {
  private width: number;
  private height: number;
  private rng: SeededRandom;
  private tiles: Tile[][] = [];
  private rooms: Room[] = [];

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.rng = new SeededRandom(seed);
  }

  generate(): MapData {
    // Initialize with walls
    this.initializeTiles();

    // Generate rooms
    this.generateRooms();

    // Connect rooms with corridors
    this.connectRooms();

    // Assign room types (spawn, TARDIS, cells, etc.)
    this.assignRoomTypes();

    // Add noise details (debris, puddles)
    this.addNoise();

    // Find spawn points
    const spawnPoints = this.findSpawnPoints();
    const enemySpawnPoints = this.findEnemySpawnPoints();
    const altarPositions = this.findAltarPositions();

    // Get objective positions
    const tardisPosition = this.findTardisPosition();
    const cellPositions = this.findCellPositions();

    return {
      width: this.width,
      height: this.height,
      tiles: this.tiles,
      rooms: this.rooms,
      spawnPoints,
      enemySpawnPoints,
      altarPositions,
      tardisPosition,
      cellPositions,
    };
  }

  private assignRoomTypes(): void {
    if (this.rooms.length < 5) {
      debug.warn('Not enough rooms for objective system');
      return;
    }

    // Room 0 is always spawn
    this.rooms[0].roomType = 'spawn';

    // Get rooms that are not spawn and not adjacent to spawn
    const spawnRoom = this.rooms[0];
    const eligibleForTardis: Room[] = [];
    const eligibleForCells: Room[] = [];

    for (let i = 1; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      const distFromSpawn = this.roomDistance(spawnRoom, room);

      // TARDIS should be far from spawn (at least 2 rooms worth of distance)
      if (distFromSpawn > 15) {
        eligibleForTardis.push(room);
      }

      // Cells can be anywhere except spawn
      eligibleForCells.push(room);
    }

    // Pick TARDIS room (prefer furthest from spawn)
    if (eligibleForTardis.length > 0) {
      // Sort by distance from spawn, pick from furthest
      eligibleForTardis.sort((a, b) =>
        this.roomDistance(spawnRoom, b) - this.roomDistance(spawnRoom, a)
      );
      const tardisRoom = eligibleForTardis[0];
      tardisRoom.roomType = 'tardis';

      // Remove TARDIS room from cell eligibility
      const tardisIndex = eligibleForCells.indexOf(tardisRoom);
      if (tardisIndex > -1) {
        eligibleForCells.splice(tardisIndex, 1);
      }
    } else if (this.rooms.length > 1) {
      // Fallback: use last room
      this.rooms[this.rooms.length - 1].roomType = 'tardis';
      const tardisIndex = eligibleForCells.indexOf(this.rooms[this.rooms.length - 1]);
      if (tardisIndex > -1) {
        eligibleForCells.splice(tardisIndex, 1);
      }
    }

    // Pick rooms for power cells (spread them out)
    const cellCount = Math.min(POWER_CELLS_REQUIRED, eligibleForCells.length);
    const shuffled = this.shuffleArray([...eligibleForCells]);

    for (let i = 0; i < cellCount; i++) {
      shuffled[i].roomType = 'cell';
    }

    // Assign themed room types to remaining 'normal' rooms based on size
    for (const room of this.rooms) {
      if (room.roomType === 'normal') {
        room.roomType = this.assignThemedRoomType(room);
      }
    }
  }

  /**
   * Assign a themed room type based on room size
   * Large rooms (≥6x6) → grinder or storage
   * Medium rooms (≥4x4) → storage, nest, or shrine
   * Small rooms → nest or shrine
   */
  private assignThemedRoomType(room: Room): RoomType {
    const isLarge = room.width >= 6 && room.height >= 6;
    const isMedium = room.width >= 4 && room.height >= 4;
    const rand = this.rng.next();

    if (isLarge) {
      // Large rooms: 40% grinder, 60% storage
      return rand < 0.4 ? 'grinder' : 'storage';
    } else if (isMedium) {
      // Medium rooms: 40% storage, 30% nest, 30% shrine
      if (rand < 0.4) return 'storage';
      if (rand < 0.7) return 'nest';
      return 'shrine';
    } else {
      // Small rooms: 50% nest, 50% shrine
      return rand < 0.5 ? 'nest' : 'shrine';
    }
  }

  private roomDistance(a: Room, b: Room): number {
    const aCenterX = a.x + a.width / 2;
    const aCenterY = a.y + a.height / 2;
    const bCenterX = b.x + b.width / 2;
    const bCenterY = b.y + b.height / 2;
    return Math.sqrt(
      Math.pow(aCenterX - bCenterX, 2) +
      Math.pow(aCenterY - bCenterY, 2)
    );
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  private findTardisPosition(): Vec2 | null {
    const tardisRoom = this.rooms.find(r => r.roomType === 'tardis');
    if (!tardisRoom) return null;

    return {
      x: Math.floor(tardisRoom.x + tardisRoom.width / 2),
      y: Math.floor(tardisRoom.y + tardisRoom.height / 2),
    };
  }

  private findCellPositions(): Vec2[] {
    const positions: Vec2[] = [];

    for (const room of this.rooms) {
      if (room.roomType === 'cell') {
        positions.push({
          x: Math.floor(room.x + room.width / 2),
          y: Math.floor(room.y + room.height / 2),
        });
      }
    }

    return positions;
  }

  private initializeTiles(): void {
    this.tiles = [];
    for (let y = 0; y < this.height; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push({
          type: 'wall',
          x,
          y,
          walkable: false,
          variant: Math.floor(this.rng.next() * 4),
        });
      }
      this.tiles.push(row);
    }
  }

  private generateRooms(): void {
    let attempts = 0;
    const maxAttempts = ROOM_COUNT * 20;

    while (this.rooms.length < ROOM_COUNT && attempts < maxAttempts) {
      attempts++;

      const roomWidth = this.rng.int(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      const roomHeight = this.rng.int(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      const x = this.rng.int(1, this.width - roomWidth - 1);
      const y = this.rng.int(1, this.height - roomHeight - 1);

      const newRoom: Room = {
        x,
        y,
        width: roomWidth,
        height: roomHeight,
        connected: false,
        roomType: 'normal',
      };

      // Check for overlap with existing rooms (with padding)
      let overlaps = false;
      for (const room of this.rooms) {
        if (this.roomsOverlap(newRoom, room, 2)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        this.rooms.push(newRoom);
        this.carveRoom(newRoom);
      }
    }

    // Mark first room as connected (starting point)
    if (this.rooms.length > 0) {
      this.rooms[0].connected = true;
    }
  }

  private roomsOverlap(a: Room, b: Room, padding: number): boolean {
    return !(
      a.x + a.width + padding < b.x ||
      b.x + b.width + padding < a.x ||
      a.y + a.height + padding < b.y ||
      b.y + b.height + padding < a.y
    );
  }

  private carveRoom(room: Room): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        this.setTile(x, y, 'floor');
      }
    }
  }

  private connectRooms(): void {
    // Sort rooms by position for more natural corridors
    const sortedRooms = [...this.rooms].sort(
      (a, b) => a.x + a.y - (b.x + b.y)
    );

    // Connect each room to the next
    for (let i = 0; i < sortedRooms.length - 1; i++) {
      const roomA = sortedRooms[i];
      const roomB = sortedRooms[i + 1];
      this.carveCorridor(roomA, roomB);
      roomB.connected = true;
    }

    // Add some extra corridors for loops
    for (let i = 0; i < Math.floor(this.rooms.length / 3); i++) {
      const roomA = this.rooms[this.rng.int(0, this.rooms.length - 1)];
      const roomB = this.rooms[this.rng.int(0, this.rooms.length - 1)];
      if (roomA !== roomB) {
        this.carveCorridor(roomA, roomB);
      }
    }
  }

  private carveCorridor(roomA: Room, roomB: Room): void {
    // Get room centers
    const startX = Math.floor(roomA.x + roomA.width / 2);
    const startY = Math.floor(roomA.y + roomA.height / 2);
    const endX = Math.floor(roomB.x + roomB.width / 2);
    const endY = Math.floor(roomB.y + roomB.height / 2);

    // L-shaped corridor
    const midX = this.rng.next() > 0.5 ? startX : endX;

    // Horizontal segment
    const minX = Math.min(startX, midX);
    const maxX = Math.max(startX, midX);
    for (let x = minX; x <= maxX; x++) {
      this.carveCorridorTile(x, startY);
    }

    // Vertical segment
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    for (let y = minY; y <= maxY; y++) {
      this.carveCorridorTile(midX, y);
    }

    // Horizontal segment to end
    const minX2 = Math.min(midX, endX);
    const maxX2 = Math.max(midX, endX);
    for (let x = minX2; x <= maxX2; x++) {
      this.carveCorridorTile(x, endY);
    }
  }

  private carveCorridorTile(x: number, y: number): void {
    // Carve corridor with width
    for (let dy = -Math.floor(CORRIDOR_WIDTH / 2); dy <= Math.floor(CORRIDOR_WIDTH / 2); dy++) {
      for (let dx = -Math.floor(CORRIDOR_WIDTH / 2); dx <= Math.floor(CORRIDOR_WIDTH / 2); dx++) {
        this.setTile(x + dx, y + dy, 'floor');
      }
    }
  }

  private setTile(x: number, y: number, type: TileType): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

    this.tiles[y][x] = {
      type,
      x,
      y,
      walkable: type !== 'wall',
      variant: Math.floor(this.rng.next() * 4),
    };
  }

  private addNoise(): void {
    // Add debris and puddles to floor tiles
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.tiles[y][x];
        if (tile.type !== 'floor') continue;

        const noise = this.rng.next();

        if (noise < 0.02) {
          // 2% chance for puddle
          tile.type = 'puddle';
        } else if (noise < 0.06) {
          // 4% chance for debris
          tile.type = 'debris';
        }
      }
    }
  }

  private findSpawnPoints(): Vec2[] {
    // Player spawns in the first room (center)
    const spawnPoints: Vec2[] = [];

    if (this.rooms.length > 0) {
      const room = this.rooms[0];
      spawnPoints.push({
        x: Math.floor(room.x + room.width / 2),
        y: Math.floor(room.y + room.height / 2),
      });

      // Add additional spawn points in the same room for multiplayer
      for (let i = 0; i < 3; i++) {
        spawnPoints.push({
          x: room.x + 1 + this.rng.int(0, room.width - 3),
          y: room.y + 1 + this.rng.int(0, room.height - 3),
        });
      }
    }

    return spawnPoints;
  }

  private findEnemySpawnPoints(): Vec2[] {
    // Enemies spawn in rooms far from player spawn
    const enemySpawnPoints: Vec2[] = [];

    // Skip the first room (player spawn)
    for (let i = 1; i < this.rooms.length; i++) {
      const room = this.rooms[i];

      // Add multiple spawn points per room
      const pointsPerRoom = 2 + Math.floor(room.width * room.height / 20);

      for (let j = 0; j < pointsPerRoom; j++) {
        const x = room.x + 1 + this.rng.int(0, room.width - 3);
        const y = room.y + 1 + this.rng.int(0, room.height - 3);

        // Make sure it's a floor tile
        if (this.tiles[y]?.[x]?.walkable) {
          enemySpawnPoints.push({ x, y });
        }
      }
    }

    // Also add some corridor spawn points
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.tiles[y][x];
        if (tile.type === 'floor' && this.rng.next() < 0.01) {
          // Check if not too close to player spawn
          const playerSpawn = this.rooms[0];
          const distX = Math.abs(x - (playerSpawn?.x ?? 0 + (playerSpawn?.width ?? 0) / 2));
          const distY = Math.abs(y - (playerSpawn?.y ?? 0 + (playerSpawn?.height ?? 0) / 2));

          if (distX + distY > 15) {
            enemySpawnPoints.push({ x, y });
          }
        }
      }
    }

    return enemySpawnPoints;
  }

  private findAltarPositions(): Vec2[] {
    const altarPositions: Vec2[] = [];

    // Place altars in 30% of non-spawn rooms (skip first room which is player spawn)
    for (let i = 1; i < this.rooms.length; i++) {
      if (this.rng.next() < 0.3) {
        const room = this.rooms[i];
        // Place altar at room center
        altarPositions.push({
          x: Math.floor(room.x + room.width / 2),
          y: Math.floor(room.y + room.height / 2),
        });
      }
    }

    return altarPositions;
  }
}
