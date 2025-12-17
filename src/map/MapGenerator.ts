import type { MapData, Room, Tile, Vec2, TileType } from '@shared/types';
import {
  MIN_ROOM_SIZE,
  MAX_ROOM_SIZE,
  ROOM_COUNT,
  CORRIDOR_WIDTH,
} from '@shared/constants';
import { SeededRandom } from '@shared/utils';

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

    // Add noise details (debris, puddles)
    this.addNoise();

    // Find spawn points
    const spawnPoints = this.findSpawnPoints();
    const enemySpawnPoints = this.findEnemySpawnPoints();

    return {
      width: this.width,
      height: this.height,
      tiles: this.tiles,
      rooms: this.rooms,
      spawnPoints,
      enemySpawnPoints,
    };
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
}
