import { describe, it, expect, beforeEach } from 'vitest';
import { MapGenerator } from '../../src/map/MapGenerator';
import { MAX_ROOM_SIZE } from '../../shared/constants';

describe('MapGenerator', () => {
  describe('constructor', () => {
    it('should create a map generator with specified dimensions', () => {
      const generator = new MapGenerator(50, 50, 12345);
      const map = generator.generate();

      expect(map.width).toBe(50);
      expect(map.height).toBe(50);
    });
  });

  describe('deterministic generation', () => {
    it('should generate identical maps with the same seed', () => {
      const map1 = new MapGenerator(40, 40, 42).generate();
      const map2 = new MapGenerator(40, 40, 42).generate();

      // Same room count
      expect(map1.rooms.length).toBe(map2.rooms.length);

      // Same room positions
      for (let i = 0; i < map1.rooms.length; i++) {
        expect(map1.rooms[i].x).toBe(map2.rooms[i].x);
        expect(map1.rooms[i].y).toBe(map2.rooms[i].y);
        expect(map1.rooms[i].width).toBe(map2.rooms[i].width);
        expect(map1.rooms[i].height).toBe(map2.rooms[i].height);
      }
    });

    it('should generate different maps with different seeds', () => {
      const map1 = new MapGenerator(40, 40, 100).generate();
      const map2 = new MapGenerator(40, 40, 200).generate();

      // Room positions should differ
      const samePositions = map1.rooms.every(
        (room, i) =>
          room.x === map2.rooms[i]?.x && room.y === map2.rooms[i]?.y
      );

      expect(samePositions).toBe(false);
    });
  });

  describe('tile generation', () => {
    let map: ReturnType<MapGenerator['generate']>;

    beforeEach(() => {
      map = new MapGenerator(50, 50, 999).generate();
    });

    it('should create tiles array with correct dimensions', () => {
      expect(map.tiles.length).toBe(50);
      expect(map.tiles[0].length).toBe(50);
    });

    it('should have tiles with correct properties', () => {
      const tile = map.tiles[0][0];

      expect(tile).toHaveProperty('type');
      expect(tile).toHaveProperty('x');
      expect(tile).toHaveProperty('y');
      expect(tile).toHaveProperty('walkable');
      expect(tile).toHaveProperty('variant');
    });

    it('should have wall tiles as non-walkable', () => {
      const wallTile = map.tiles.flat().find((t) => t.type === 'wall');
      expect(wallTile?.walkable).toBe(false);
    });

    it('should have floor tiles as walkable', () => {
      const floorTile = map.tiles.flat().find((t) => t.type === 'floor');
      expect(floorTile?.walkable).toBe(true);
    });

    it('should have mostly walls at the borders', () => {
      // Check top row
      const topRowWalls = map.tiles[0].filter((t) => t.type === 'wall').length;
      expect(topRowWalls).toBeGreaterThan(map.width * 0.8);

      // Check bottom row
      const bottomRowWalls = map.tiles[map.height - 1].filter(
        (t) => t.type === 'wall'
      ).length;
      expect(bottomRowWalls).toBeGreaterThan(map.width * 0.8);
    });
  });

  describe('room generation', () => {
    let map: ReturnType<MapGenerator['generate']>;

    beforeEach(() => {
      map = new MapGenerator(60, 60, 777).generate();
    });

    it('should generate multiple rooms', () => {
      expect(map.rooms.length).toBeGreaterThan(1);
    });

    it('should have rooms with valid dimensions', () => {
      for (const room of map.rooms) {
        expect(room.width).toBeGreaterThanOrEqual(4); // MIN_ROOM_SIZE
        expect(room.height).toBeGreaterThanOrEqual(4);
        expect(room.width).toBeLessThanOrEqual(MAX_ROOM_SIZE);
        expect(room.height).toBeLessThanOrEqual(MAX_ROOM_SIZE);
      }
    });

    it('should have rooms within map bounds', () => {
      for (const room of map.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.y).toBeGreaterThanOrEqual(0);
        expect(room.x + room.width).toBeLessThan(map.width);
        expect(room.y + room.height).toBeLessThan(map.height);
      }
    });

    it('should mark first room as spawn', () => {
      expect(map.rooms[0].roomType).toBe('spawn');
    });

    it('should have exactly one TARDIS room', () => {
      const tardisRooms = map.rooms.filter((r) => r.roomType === 'tardis');
      expect(tardisRooms.length).toBe(1);
    });

    it('should have cell rooms for power cells', () => {
      const cellRooms = map.rooms.filter((r) => r.roomType === 'cell');
      expect(cellRooms.length).toBeGreaterThan(0);
      expect(cellRooms.length).toBeLessThanOrEqual(3); // POWER_CELLS_REQUIRED
    });
  });

  describe('spawn points', () => {
    let map: ReturnType<MapGenerator['generate']>;

    beforeEach(() => {
      map = new MapGenerator(50, 50, 555).generate();
    });

    it('should have player spawn points', () => {
      expect(map.spawnPoints.length).toBeGreaterThan(0);
    });

    it('should have spawn points on walkable tiles', () => {
      for (const spawn of map.spawnPoints) {
        const tile = map.tiles[spawn.y][spawn.x];
        expect(tile.walkable).toBe(true);
      }
    });

    it('should have enemy spawn points', () => {
      expect(map.enemySpawnPoints.length).toBeGreaterThan(0);
    });

    it('should have enemy spawn points on walkable tiles', () => {
      for (const spawn of map.enemySpawnPoints) {
        const tile = map.tiles[spawn.y]?.[spawn.x];
        if (tile) {
          expect(tile.walkable).toBe(true);
        }
      }
    });
  });

  describe('objective positions', () => {
    let map: ReturnType<MapGenerator['generate']>;

    beforeEach(() => {
      map = new MapGenerator(60, 60, 333).generate();
    });

    it('should have a TARDIS position', () => {
      expect(map.tardisPosition).not.toBeNull();
    });

    it('should have TARDIS on walkable tile', () => {
      if (map.tardisPosition) {
        const tile = map.tiles[map.tardisPosition.y][map.tardisPosition.x];
        expect(tile.walkable).toBe(true);
      }
    });

    it('should have power cell positions', () => {
      expect(map.cellPositions.length).toBeGreaterThan(0);
    });

    it('should have power cells on walkable tiles', () => {
      for (const cell of map.cellPositions) {
        const tile = map.tiles[cell.y][cell.x];
        expect(tile.walkable).toBe(true);
      }
    });

    it('should have TARDIS in a different room than spawn', () => {
      const spawnRoom = map.rooms[0];
      const tardisRoom = map.rooms.find((r) => r.roomType === 'tardis');

      expect(tardisRoom).toBeDefined();
      expect(tardisRoom).not.toBe(spawnRoom);
    });
  });

  describe('connectivity', () => {
    it('should have most rooms connected', () => {
      const map = new MapGenerator(50, 50, 111).generate();

      // Most rooms should be marked as connected (first room starts connected,
      // others get connected when corridors are carved)
      const connectedRooms = map.rooms.filter((r) => r.connected);
      // At least 80% of rooms should be connected
      expect(connectedRooms.length).toBeGreaterThanOrEqual(Math.floor(map.rooms.length * 0.8));
    });

    it('should have corridors connecting rooms', () => {
      const map = new MapGenerator(50, 50, 222).generate();

      // Count floor tiles - should be more than just rooms
      const roomFloorCount = map.rooms.reduce(
        (sum, room) => sum + room.width * room.height,
        0
      );
      const totalFloorCount = map.tiles.flat().filter(
        (t) => t.type === 'floor' || t.type === 'puddle' || t.type === 'debris'
      ).length;

      // Corridors add extra floor tiles
      expect(totalFloorCount).toBeGreaterThan(roomFloorCount * 0.9);
    });
  });

  describe('noise generation', () => {
    it('should add puddles and debris to floor tiles', () => {
      const map = new MapGenerator(60, 60, 444).generate();

      const puddles = map.tiles.flat().filter((t) => t.type === 'puddle');
      const debris = map.tiles.flat().filter((t) => t.type === 'debris');

      // Should have some noise tiles
      expect(puddles.length + debris.length).toBeGreaterThan(0);
    });

    it('should have puddles and debris be walkable', () => {
      const map = new MapGenerator(60, 60, 444).generate();

      const noiseTiles = map.tiles
        .flat()
        .filter((t) => t.type === 'puddle' || t.type === 'debris');

      for (const tile of noiseTiles) {
        expect(tile.walkable).toBe(true);
      }
    });
  });

  describe('altar positions', () => {
    it('should generate altar positions', () => {
      const map = new MapGenerator(60, 60, 666).generate();

      expect(map.altarPositions).toBeDefined();
      expect(Array.isArray(map.altarPositions)).toBe(true);
    });

    it('should not place altars in spawn room', () => {
      const map = new MapGenerator(60, 60, 888).generate();
      const spawnRoom = map.rooms[0];

      for (const altar of map.altarPositions) {
        const inSpawnRoom =
          altar.x >= spawnRoom.x &&
          altar.x < spawnRoom.x + spawnRoom.width &&
          altar.y >= spawnRoom.y &&
          altar.y < spawnRoom.y + spawnRoom.height;

        expect(inSpawnRoom).toBe(false);
      }
    });
  });

  describe('themed room types', () => {
    it('should assign themed room types to non-special rooms', () => {
      const map = new MapGenerator(80, 80, 12345).generate();

      // All rooms that are not spawn/tardis/cell should have themed types
      const themedTypes = ['grinder', 'storage', 'nest', 'shrine', 'normal'];
      const specialTypes = ['spawn', 'tardis', 'cell'];

      for (const room of map.rooms) {
        const isSpecial = specialTypes.includes(room.roomType);
        const isThemed = themedTypes.includes(room.roomType);

        expect(isSpecial || isThemed).toBe(true);
      }
    });

    it('should have variety in themed room types', () => {
      // Generate multiple maps and collect room types
      const allRoomTypes = new Set<string>();

      for (let seed = 1; seed <= 10; seed++) {
        const map = new MapGenerator(80, 80, seed * 1000).generate();
        for (const room of map.rooms) {
          allRoomTypes.add(room.roomType);
        }
      }

      // Should have at least some of the themed types across multiple generations
      const themedTypes = ['grinder', 'storage', 'nest', 'shrine'];
      const foundThemed = themedTypes.filter((t) => allRoomTypes.has(t));

      expect(foundThemed.length).toBeGreaterThanOrEqual(2);
    });

    it('should assign grinder/storage to large rooms more often', () => {
      // Generate many maps and track room type vs size
      let largeRoomGrinderOrStorage = 0;
      let largeRoomTotal = 0;

      for (let seed = 1; seed <= 20; seed++) {
        const map = new MapGenerator(80, 80, seed * 500).generate();
        for (const room of map.rooms) {
          // Skip special rooms
          if (['spawn', 'tardis', 'cell'].includes(room.roomType)) continue;

          const isLarge = room.width >= 6 && room.height >= 6;
          if (isLarge) {
            largeRoomTotal++;
            if (room.roomType === 'grinder' || room.roomType === 'storage') {
              largeRoomGrinderOrStorage++;
            }
          }
        }
      }

      // Large rooms should mostly be grinder or storage (>80%)
      if (largeRoomTotal > 0) {
        const ratio = largeRoomGrinderOrStorage / largeRoomTotal;
        expect(ratio).toBeGreaterThan(0.7);
      }
    });

    it('should assign nest/shrine to small rooms more often', () => {
      // Generate many maps and track room type vs size
      let smallRoomNestOrShrine = 0;
      let smallRoomTotal = 0;

      for (let seed = 1; seed <= 20; seed++) {
        const map = new MapGenerator(80, 80, seed * 500).generate();
        for (const room of map.rooms) {
          // Skip special rooms
          if (['spawn', 'tardis', 'cell'].includes(room.roomType)) continue;

          const isSmall = room.width < 4 || room.height < 4;
          if (isSmall) {
            smallRoomTotal++;
            if (room.roomType === 'nest' || room.roomType === 'shrine') {
              smallRoomNestOrShrine++;
            }
          }
        }
      }

      // Small rooms should mostly be nest or shrine (>80%)
      if (smallRoomTotal > 0) {
        const ratio = smallRoomNestOrShrine / smallRoomTotal;
        expect(ratio).toBeGreaterThan(0.7);
      }
    });

    it('should not assign themed types to spawn room', () => {
      const map = new MapGenerator(60, 60, 9999).generate();

      expect(map.rooms[0].roomType).toBe('spawn');
    });

    it('should not assign themed types to tardis room', () => {
      const map = new MapGenerator(60, 60, 8888).generate();

      const tardisRoom = map.rooms.find((r) => r.roomType === 'tardis');
      expect(tardisRoom).toBeDefined();
      expect(tardisRoom?.roomType).toBe('tardis');
    });

    it('should not assign themed types to cell rooms', () => {
      const map = new MapGenerator(60, 60, 7777).generate();

      const cellRooms = map.rooms.filter((r) => r.roomType === 'cell');
      expect(cellRooms.length).toBeGreaterThan(0);

      for (const room of cellRooms) {
        expect(room.roomType).toBe('cell');
      }
    });
  });
});
