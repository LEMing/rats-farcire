import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerController, PlayerControllerCallbacks } from '../../src/systems/PlayerController';
import type { PlayerState, InputState, MapData, Tile } from '../../shared/types';
import { PLAYER_SPEED, DASH_SPEED, DASH_COOLDOWN, DASH_DURATION } from '../../shared/constants';

// ============================================================================
// Test Helpers
// ============================================================================

const createMockTile = (x: number, y: number, walkable = true): Tile => ({
  type: walkable ? 'floor' : 'wall',
  x,
  y,
  walkable,
  variant: 0,
});

const createMockMapData = (width = 20, height = 20): MapData => {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      // Create walls at edges
      const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles[y][x] = createMockTile(x, y, !isEdge);
    }
  }

  return {
    width,
    height,
    tiles,
    rooms: [],
    spawnPoints: [{ x: 10, y: 10 }],
    enemySpawnPoints: [],
    altarPositions: [],
    tardisPosition: { x: 10, y: 10 },
    cellPositions: [],
  };
};

const createMockPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player-1',
  type: 'player',
  position: { x: 10, y: 0.5, z: 10 },
  rotation: 0,
  velocity: { x: 0, y: 0 },
  health: 100,
  maxHealth: 100,
  ammo: {
    pistol: 100,
    shotgun: 100,
    machinegun: 100,
    rifle: 100,
    rocket: 100,
  },
  score: 0,
  isDead: false,
  lastShootTime: 0,
  currentWeapon: 'pistol',
  unlockedWeapons: ['pistol', 'shotgun'],
  thermobaricCooldown: 0,
  dashCooldown: 0,
  isDashing: false,
  dashDirection: { x: 0, y: 0 },
  dashStartTime: 0,
  comboCount: 0,
  comboTimer: 0,
  maxCombo: 0,
  powerUps: {},
  carryingCellId: null,
  ...overrides,
});

const createMockInput = (overrides: Partial<InputState> = {}): InputState => ({
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
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('PlayerController', () => {
  let controller: PlayerController;
  let mapData: MapData;
  let callbacks: PlayerControllerCallbacks;

  beforeEach(() => {
    mapData = createMockMapData();
    callbacks = {
      onDashStart: vi.fn(),
      onAfterimage: vi.fn(),
      onDashSound: vi.fn(),
    };
    controller = new PlayerController(mapData, callbacks);
  });

  describe('movement', () => {
    it('should move player based on input', () => {
      const player = createMockPlayer();
      const input = createMockInput({ moveX: 1, moveY: 0 });

      controller.processInput(player, input, 0, 16);

      expect(player.velocity.x).toBeGreaterThan(0);
      expect(player.position.x).toBeGreaterThan(10);
    });

    it('should normalize diagonal movement', () => {
      const player = createMockPlayer();
      const input = createMockInput({ moveX: 1, moveY: 1 });

      // With inertia, need multiple frames to reach target speed
      for (let i = 0; i < 60; i++) {
        controller.processInput(player, input, i * 16, 16);
      }

      // Velocity magnitude should be approximately PLAYER_SPEED after acceleration
      const magnitude = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
      expect(magnitude).toBeCloseTo(PLAYER_SPEED, 0);
    });

    it('should not move when no input', () => {
      const player = createMockPlayer();
      const input = createMockInput();

      controller.processInput(player, input, 0, 16);

      expect(player.velocity.x).toBe(0);
      expect(player.velocity.y).toBe(0);
    });

    it('should move slower when carrying cell', () => {
      const normalPlayer = createMockPlayer();
      const carryingPlayer = createMockPlayer({ carryingCellId: 'cell-1' });
      const input = createMockInput({ moveX: 1, moveY: 0 });

      controller.processInput(normalPlayer, input, 0, 16);
      controller.processInput(carryingPlayer, input, 0, 16);

      expect(carryingPlayer.velocity.x).toBeLessThan(normalPlayer.velocity.x);
    });
  });

  describe('wall collision', () => {
    it('should stop at walls', () => {
      const player = createMockPlayer({ position: { x: 1.5, y: 0.5, z: 10 } });
      const input = createMockInput({ moveX: -1, moveY: 0 }); // Move toward wall at x=0

      controller.processInput(player, input, 0, 1000); // Large dt

      // Should not go past wall
      expect(player.position.x).toBeGreaterThan(0.5);
    });

    it('should allow sliding along walls', () => {
      // Use a larger map with clear interior
      const largeMap = createMockMapData(50, 50);
      const slideController = new PlayerController(largeMap, callbacks);

      // Start away from walls
      const player = createMockPlayer({ position: { x: 5, y: 0.5, z: 25 } });
      // Move diagonally, where X would hit a wall but Z is clear
      // Note: createMockMapData creates walls at x=0, so we move in negative X
      const input = createMockInput({ moveX: -1, moveY: 1 });

      const initialZ = player.position.z;
      // Multiple updates to ensure movement
      for (let i = 0; i < 10; i++) {
        slideController.processInput(player, input, i * 100, 100);
      }

      // Z should have changed (sliding along the edge)
      expect(player.position.z).toBeGreaterThan(initialZ);
    });
  });

  describe('dash', () => {
    it('should start dash when dash input and not on cooldown', () => {
      const player = createMockPlayer();
      const input = createMockInput({ dash: true, moveX: 1, moveY: 0 });

      controller.processInput(player, input, 0, 16);

      expect(player.isDashing).toBe(true);
      expect(player.dashCooldown).toBe(DASH_COOLDOWN);
    });

    it('should not dash when on cooldown', () => {
      const player = createMockPlayer({ dashCooldown: 500 });
      const input = createMockInput({ dash: true, moveX: 1 });

      controller.processInput(player, input, 0, 16);

      expect(player.isDashing).toBe(false);
    });

    it('should not dash when already dashing', () => {
      const player = createMockPlayer({ isDashing: true, dashStartTime: 0 });
      const input = createMockInput({ dash: true });

      controller.processInput(player, input, 10, 16);

      // Should remain in current dash, not restart
      expect(player.dashStartTime).toBe(0);
    });

    it('should not dash when carrying cell', () => {
      const player = createMockPlayer({ carryingCellId: 'cell-1' });
      const input = createMockInput({ dash: true, moveX: 1 });

      controller.processInput(player, input, 0, 16);

      expect(player.isDashing).toBe(false);
    });

    it('should use facing direction when no move input', () => {
      const player = createMockPlayer({ rotation: Math.PI / 2 }); // Facing right
      const input = createMockInput({ dash: true }); // No movement input

      controller.processInput(player, input, 0, 16);

      expect(player.dashDirection.x).toBeCloseTo(1, 1);
      expect(player.dashDirection.y).toBeCloseTo(0, 1);
    });

    it('should move faster during dash', () => {
      const normalPlayer = createMockPlayer();
      const dashingPlayer = createMockPlayer({
        isDashing: true,
        dashStartTime: 0,
        dashDirection: { x: 1, y: 0 },
      });
      const input = createMockInput({ moveX: 1 });

      controller.processInput(normalPlayer, input, 50, 16);
      controller.processInput(dashingPlayer, input, 50, 16);

      expect(dashingPlayer.velocity.x).toBeGreaterThan(normalPlayer.velocity.x);
    });

    it('should end dash after duration', () => {
      const player = createMockPlayer({
        isDashing: true,
        dashStartTime: 0,
        dashDirection: { x: 1, y: 0 },
      });
      const input = createMockInput();

      // Process with time past dash duration
      controller.processInput(player, input, DASH_DURATION + 10, 16);

      expect(player.isDashing).toBe(false);
    });

    it('should spawn afterimages during dash', () => {
      const player = createMockPlayer({
        isDashing: true,
        dashStartTime: 0,
        dashDirection: { x: 1, y: 0 },
      });
      const input = createMockInput();

      controller.processInput(player, input, 50, 16);
      controller.processInput(player, input, 100, 16);

      expect(callbacks.onAfterimage).toHaveBeenCalled();
    });

    it('should play dash sound on start', () => {
      const player = createMockPlayer();
      const input = createMockInput({ dash: true, moveX: 1 });

      controller.processInput(player, input, 0, 16);

      expect(callbacks.onDashSound).toHaveBeenCalled();
    });

    it('should decrease cooldown over time', () => {
      const player = createMockPlayer({ dashCooldown: 1000 });
      const input = createMockInput();

      controller.processInput(player, input, 0, 500);

      expect(player.dashCooldown).toBe(500);
    });
  });

  describe('rotation', () => {
    it('should update rotation based on aim', () => {
      const player = createMockPlayer({ rotation: 0 });
      const input = createMockInput({ aimX: 1, aimY: 0 }); // Aim right

      controller.processInput(player, input, 0, 16);

      expect(player.rotation).toBeCloseTo(Math.PI / 2, 2);
    });

    it('should apply aim assist when enabled', () => {
      const controllerWithAimAssist = new PlayerController(mapData, callbacks, {
        aimAssistEnabled: true,
      });

      const player = createMockPlayer();
      const input = createMockInput({ aimX: 0.1, aimY: 1 });

      // AimTarget format requires position property
      const enemies = [
        {
          position: { x: player.position.x + 2, z: player.position.z + 5 },
          isDead: false,
        },
      ];

      controllerWithAimAssist.processInput(player, input, 0, 16, enemies);

      // Rotation should be adjusted toward enemy
      expect(player.rotation).not.toBe(Math.atan2(0.1, 1));
    });
  });

  describe('utility methods', () => {
    it('canDash should return true when ready', () => {
      const player = createMockPlayer();
      expect(controller.canDash(player)).toBe(true);
    });

    it('canDash should return false on cooldown', () => {
      const player = createMockPlayer({ dashCooldown: 500 });
      expect(controller.canDash(player)).toBe(false);
    });

    it('canDash should return false when dashing', () => {
      const player = createMockPlayer({ isDashing: true });
      expect(controller.canDash(player)).toBe(false);
    });

    it('canDash should return false when carrying cell', () => {
      const player = createMockPlayer({ carryingCellId: 'cell-1' });
      expect(controller.canDash(player)).toBe(false);
    });

    it('getDashCooldownRatio should return correct ratio', () => {
      const player = createMockPlayer({ dashCooldown: DASH_COOLDOWN / 2 });
      expect(controller.getDashCooldownRatio(player)).toBeCloseTo(0.5);
    });

    it('getDashCooldownRatio should return 0 when ready', () => {
      const player = createMockPlayer({ dashCooldown: 0 });
      expect(controller.getDashCooldownRatio(player)).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should use custom player speed', () => {
      const fastController = new PlayerController(mapData, {}, { playerSpeed: 20 });
      const player = createMockPlayer();
      const input = createMockInput({ moveX: 1 });

      // With inertia, velocity accelerates towards target over multiple frames
      // Process multiple times to let velocity build up
      for (let i = 0; i < 60; i++) {
        fastController.processInput(player, input, i * 16, 16);
      }

      // Should reach target speed after acceleration
      expect(player.velocity.x).toBeCloseTo(20, 0);
    });

    it('should allow setting aim assist dynamically', () => {
      controller.setAimAssistEnabled(true);
      const player = createMockPlayer();
      const input = createMockInput({ aimX: 0.1, aimY: 1 });
      const enemies = [
        {
          position: { x: player.position.x + 2, z: player.position.z + 5 },
          isDead: false,
        },
      ];

      controller.processInput(player, input, 0, 16, enemies);

      // Should apply aim assist
      expect(player.rotation).not.toBe(Math.atan2(0.1, 1));
    });
  });
});
