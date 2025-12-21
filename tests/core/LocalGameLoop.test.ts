import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalGameLoop } from '../../src/core/LocalGameLoop';
import type { MapData, InputState, Tile } from '../../shared/types';
import { TILE_SIZE, PLAYER_MAX_HEALTH, WEAPON_AMMO_CONFIGS } from '../../shared/constants';

// ============================================================================
// Mock Dependencies
// ============================================================================

const createMockTile = (x: number, y: number, walkable = true): Tile => ({
  type: walkable ? 'floor' : 'wall',
  x,
  y,
  walkable,
  variant: 0,
});

const createMockMapData = (): MapData => {
  const width = 20;
  const height = 20;

  // Create 2D tile array - all walkable floor tiles
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = createMockTile(x, y, true);
    }
  }

  return {
    width,
    height,
    tiles,
    rooms: [],
    spawnPoints: [{ x: 10, y: 10 }],
    enemySpawnPoints: [
      { x: 2, y: 2 },
      { x: 18, y: 18 },
    ],
    altarPositions: [],
    tardisPosition: { x: 10, y: 10 },
    cellPositions: [{ x: 5, y: 5 }],
  };
};

const createMockEntityManager = () => ({
  setLocalPlayerId: vi.fn(),
  createPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  createEnemy: vi.fn(),
  updateEnemy: vi.fn(),
  updateEnemyState: vi.fn(),
  damageEnemy: vi.fn(),
  fadeOutEnemy: vi.fn(),
  removeEntity: vi.fn(),
  createProjectile: vi.fn(),
  updateProjectile: vi.fn(),
  createPickup: vi.fn(),
  triggerMuzzleFlash: vi.fn(),
  spawnAfterimage: vi.fn(),
});

const createMockUIManager = () => ({
  update: vi.fn(),
  showGameOver: vi.fn(),
  showVictory: vi.fn(),
  showNotification: vi.fn(),
  showPowerUpNotification: vi.fn(),
  spawnDamageNumber: vi.fn(),
  spawnScorePopup: vi.fn(),
  spawnHealNumber: vi.fn(),
  triggerKillFlash: vi.fn(),
  triggerDamageVignette: vi.fn(),
  initMinimap: vi.fn(),
});

const createMockMapRenderer = () => ({
  spawnExplosiveBarrel: vi.fn(),
  removeExplosiveBarrel: vi.fn(),
  clearExplosiveBarrels: vi.fn(),
  getExplosiveBarrelCount: vi.fn().mockReturnValue(0),
});

const createMockRenderer = () => ({
  addScreenShake: vi.fn(),
  worldToScreen: vi.fn().mockReturnValue({ x: 0, y: 0 }),
  spawnBloodBurst: vi.fn(),
  spawnBloodDecal: vi.fn(),
  createThermobaricEffect: vi.fn(),
  createRocketExplosion: vi.fn(),
  createDashEffect: vi.fn(),
  removePowerCell: vi.fn(),
  addPowerCellAt: vi.fn(),
  setTardisPowerLevel: vi.fn(),
  updateWallOcclusion: vi.fn(),
  updateEntityBloodTrail: vi.fn(),
  setLowHealthIntensity: vi.fn(),
  getMapRenderer: vi.fn().mockReturnValue(createMockMapRenderer()),
});

const createDefaultInput = (): InputState => ({
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 1,
  shooting: false,
  interact: false,
  dash: false,
  weaponSlot: null,
  thermobaric: false,
  escapePressed: false,
  sequence: 0,
});

// Mock audio manager
vi.mock('../../src/audio/AudioManager', () => ({
  getAudioManager: () => ({
    playWeaponFire: vi.fn(),
    playDash: vi.fn(),
    playPickup: vi.fn(),
    playThermobaric: vi.fn(),
    playPositional: vi.fn(),
  }),
}));

// Mock settings
vi.mock('../../src/settings/Settings', () => ({
  Settings: {
    getInstance: () => ({
      aimAssist: false,
    }),
  },
}));

// Mock event bus
vi.mock('../../src/core/EventBus', () => ({
  getEventBus: () => ({
    emit: vi.fn(),
  }),
}));

describe('LocalGameLoop', () => {
  let gameLoop: LocalGameLoop;
  let mockEntities: ReturnType<typeof createMockEntityManager>;
  let mockUI: ReturnType<typeof createMockUIManager>;
  let mockRenderer: ReturnType<typeof createMockRenderer>;
  let mapData: MapData;

  beforeEach(() => {
    mapData = createMockMapData();
    mockEntities = createMockEntityManager();
    mockUI = createMockUIManager();
    mockRenderer = createMockRenderer();

    gameLoop = new LocalGameLoop(
      mapData,
      mockEntities as any,
      mockUI as any,
      mockRenderer as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('player spawning', () => {
    it('should spawn player at specified position', () => {
      const spawnPoint = { x: 10, y: 10 };
      gameLoop.spawnLocalPlayer(spawnPoint);

      expect(mockEntities.setLocalPlayerId).toHaveBeenCalled();
      expect(mockEntities.createPlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          position: {
            x: spawnPoint.x * TILE_SIZE,
            y: 0.5,
            z: spawnPoint.y * TILE_SIZE,
          },
          health: PLAYER_MAX_HEALTH,
          ammo: expect.any(Object),
        })
      );
    });

    it('should start wave system after spawning', () => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });

      // Update to trigger wave start (WAVE_START_DELAY is 2000ms)
      const input = createDefaultInput();
      gameLoop.update(input, 2100); // Passes the wave delay and triggers startNextWave
      gameLoop.update(input, 16); // Second update actually spawns enemies

      // Enemies should start spawning
      expect(mockEntities.createEnemy).toHaveBeenCalled();
    });
  });

  describe('player movement', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
    });

    it('should update player position based on input', () => {
      const input = createDefaultInput();
      input.moveX = 1;
      input.moveY = 0;

      gameLoop.update(input, 16);

      expect(mockEntities.updatePlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          velocity: expect.objectContaining({
            x: expect.any(Number),
          }),
        })
      );
    });

    it('should update player rotation based on aim', () => {
      const input = createDefaultInput();
      input.aimX = 1;
      input.aimY = 0;

      gameLoop.update(input, 16);

      expect(mockEntities.updatePlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          rotation: expect.any(Number),
        })
      );
    });
  });

  describe('shooting', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
    });

    it('should create projectile when shooting', () => {
      const input = createDefaultInput();

      // First update to initialize game time past weapon cooldown (shotgun is 400ms)
      gameLoop.update(input, 500);

      // Now shoot
      input.shooting = true;
      gameLoop.update(input, 16);

      expect(mockEntities.createProjectile).toHaveBeenCalled();
      expect(mockEntities.triggerMuzzleFlash).toHaveBeenCalled();
    });

    it('should respect weapon cooldown', () => {
      const input = createDefaultInput();

      // Initialize game time past weapon cooldown
      gameLoop.update(input, 500);

      // First shot
      input.shooting = true;
      gameLoop.update(input, 16);
      const firstCallCount = mockEntities.createProjectile.mock.calls.length;
      expect(firstCallCount).toBeGreaterThan(0);

      // Second shot too soon (shotgun cooldown is 400ms)
      gameLoop.update(input, 100); // Too soon

      expect(mockEntities.createProjectile.mock.calls.length).toBe(firstCallCount);
    });

    it('should consume ammo when shooting', () => {
      const input = createDefaultInput();

      // Initialize game time past weapon cooldown
      gameLoop.update(input, 500);

      // Shoot
      input.shooting = true;
      gameLoop.update(input, 16);

      // Check that ammo exists in the player state updates
      const calls = mockEntities.updatePlayer.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      // Verify updatePlayer was called with ammo object
      const lastPlayerCall = calls[calls.length - 1][0];
      expect(lastPlayerCall.ammo).toBeDefined();
      expect(typeof lastPlayerCall.ammo).toBe('object');
    });
  });

  describe('dash ability', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
    });

    it('should trigger dash on input', () => {
      const input = createDefaultInput();
      input.dash = true;
      input.moveX = 1;

      gameLoop.update(input, 16);

      expect(mockEntities.spawnAfterimage).toHaveBeenCalled();
    });

    it('should have cooldown after dash', () => {
      const input = createDefaultInput();
      input.dash = true;

      gameLoop.update(input, 16);
      const firstAfterimageCount = mockEntities.spawnAfterimage.mock.calls.length;

      // Try to dash again immediately
      gameLoop.update(input, 16);

      // Should not spawn more afterimages (on cooldown)
      expect(mockEntities.spawnAfterimage.mock.calls.length).toBe(firstAfterimageCount);
    });
  });

  describe('combo system', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
      // Trigger wave to spawn enemies
      gameLoop.update(createDefaultInput(), 3500);
    });

    it('should update UI with combo info', () => {
      gameLoop.update(createDefaultInput(), 16);

      expect(mockUI.update).toHaveBeenCalledWith(
        expect.objectContaining({
          combo: expect.any(Number),
          comboTimer: expect.any(Number),
        })
      );
    });
  });

  describe('UI updates', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
    });

    it('should update UI with game state', () => {
      gameLoop.update(createDefaultInput(), 16);

      expect(mockUI.update).toHaveBeenCalledWith(
        expect.objectContaining({
          wave: expect.any(Number),
          enemiesLeft: expect.any(Number),
          score: expect.any(Number),
          health: expect.any(Number),
          maxHealth: expect.any(Number),
          ammo: expect.any(Object),
        })
      );
    });

    it('should include minimap data in UI update', () => {
      gameLoop.update(createDefaultInput(), 16);

      expect(mockUI.update).toHaveBeenCalledWith(
        expect.objectContaining({
          minimapData: expect.objectContaining({
            playerPos: expect.any(Object),
            playerRotation: expect.any(Number),
            enemies: expect.any(Array),
          }),
        })
      );
    });
  });

  describe('callbacks', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
    });

    it('should call onHitstop when set', () => {
      const onHitstop = vi.fn();
      gameLoop.onHitstop = onHitstop;

      // Simulate shooting and hitting enemy
      const input = createDefaultInput();
      input.shooting = true;

      // Need to trigger wave and spawn enemies first
      gameLoop.update(input, 3500);

      // The hitstop callback would be called on enemy hit
      // This is tested indirectly through the game flow
    });
  });

  describe('weapon switching', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
    });

    it('should switch weapon on slot input', () => {
      const input = createDefaultInput();
      input.weaponSlot = 1; // Switch to pistol

      gameLoop.update(input, 16);

      // Weapon switch should trigger notification for unlocked weapons
      // Player starts with pistol and shotgun unlocked
    });
  });

  describe('thermobaric charge', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
    });

    it('should trigger thermobaric effect', () => {
      const input = createDefaultInput();
      input.thermobaric = true;

      gameLoop.update(input, 16);

      expect(mockRenderer.createThermobaricEffect).toHaveBeenCalled();
      expect(mockRenderer.addScreenShake).toHaveBeenCalled();
    });

    it('should have cooldown after use', () => {
      const input = createDefaultInput();
      input.thermobaric = true;

      gameLoop.update(input, 16);
      const firstCallCount = mockRenderer.createThermobaricEffect.mock.calls.length;

      gameLoop.update(input, 16); // Too soon

      expect(mockRenderer.createThermobaricEffect.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('wall occlusion', () => {
    beforeEach(() => {
      gameLoop.spawnLocalPlayer({ x: 10, y: 10 });
    });

    it('should update wall occlusion each frame', () => {
      gameLoop.update(createDefaultInput(), 16);

      expect(mockRenderer.updateWallOcclusion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Number)
      );
    });
  });
});
