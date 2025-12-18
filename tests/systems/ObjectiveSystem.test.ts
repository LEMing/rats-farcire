import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectiveSystem, ObjectiveCallbacks } from '../../src/systems/ObjectiveSystem';
import type { MapData, Vec3 } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';

// Mock map data with cells and TARDIS
const createMockMapData = (): MapData => ({
  width: 10,
  height: 10,
  tiles: [],
  spawnPoints: [{ x: 5, y: 5 }],
  enemySpawnPoints: [],
  tardisPosition: { x: 8, y: 8 },
  cellPositions: [
    { x: 1, y: 1 },
    { x: 3, y: 3 },
    { x: 6, y: 6 },
  ],
});

describe('ObjectiveSystem', () => {
  let objectiveSystem: ObjectiveSystem;
  let callbacks: ObjectiveCallbacks;
  let pickedUpCells: string[];
  let droppedCells: { cellId: string; position: Vec3 }[];
  let deliveredCells: number[];

  beforeEach(() => {
    pickedUpCells = [];
    droppedCells = [];
    deliveredCells = [];

    callbacks = {
      onCellPickup: vi.fn((cellId: string) => {
        pickedUpCells.push(cellId);
      }),
      onCellDrop: vi.fn((cellId: string, position: Vec3) => {
        droppedCells.push({ cellId, position });
      }),
      onCellDelivered: vi.fn((cellNumber: number) => {
        deliveredCells.push(cellNumber);
      }),
      onObjectiveComplete: vi.fn(),
    };

    objectiveSystem = new ObjectiveSystem(createMockMapData(), callbacks);
  });

  describe('initialization', () => {
    it('should start with no cells delivered', () => {
      const state = objectiveSystem.getState();
      expect(state.cellsDelivered).toBe(0);
    });

    it('should require 3 cells', () => {
      const state = objectiveSystem.getState();
      expect(state.cellsRequired).toBe(3);
    });

    it('should not be carrying a cell initially', () => {
      expect(objectiveSystem.isCarryingCell()).toBe(false);
      expect(objectiveSystem.getCarriedCellId()).toBeNull();
    });

    it('should not be complete initially', () => {
      const state = objectiveSystem.getState();
      expect(state.isComplete).toBe(false);
    });

    it('should initialize power cells from map data', () => {
      const cells = objectiveSystem.getPowerCells();
      expect(cells.size).toBe(3);
    });
  });

  describe('cell pickup', () => {
    it('should pick up cell when player is close enough', () => {
      // Cell 0 is at (1, 1) in tile coords = (TILE_SIZE, TILE_SIZE) in world
      const cellWorldPos = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };

      objectiveSystem.update(cellWorldPos, false, 16);

      expect(objectiveSystem.isCarryingCell()).toBe(true);
      expect(callbacks.onCellPickup).toHaveBeenCalled();
    });

    it('should not pick up cell when player is far away', () => {
      const farPos = { x: 100, y: 100 };

      objectiveSystem.update(farPos, false, 16);

      expect(objectiveSystem.isCarryingCell()).toBe(false);
      expect(callbacks.onCellPickup).not.toHaveBeenCalled();
    });

    it('should only carry one cell at a time', () => {
      const cell1Pos = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };
      const cell2Pos = { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE };

      objectiveSystem.update(cell1Pos, false, 16);
      const firstCellId = objectiveSystem.getCarriedCellId();

      objectiveSystem.update(cell2Pos, false, 16);

      // Should still have first cell
      expect(objectiveSystem.getCarriedCellId()).toBe(firstCellId);
    });
  });

  describe('cell drop', () => {
    it('should drop cell when interact is pressed while carrying', () => {
      // Pick up first
      const cellPos = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };
      objectiveSystem.update(cellPos, false, 16);

      expect(objectiveSystem.isCarryingCell()).toBe(true);

      // Drop with interact
      objectiveSystem.update(cellPos, true, 16);

      expect(objectiveSystem.isCarryingCell()).toBe(false);
      expect(callbacks.onCellDrop).toHaveBeenCalled();
    });

    it('should have pickup cooldown after dropping', () => {
      const cellPos = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };

      // Pick up
      objectiveSystem.update(cellPos, false, 16);
      expect(objectiveSystem.isCarryingCell()).toBe(true);

      // Drop
      objectiveSystem.update(cellPos, true, 16);
      expect(objectiveSystem.isCarryingCell()).toBe(false);

      // Try to pick up immediately - should fail due to cooldown
      objectiveSystem.update(cellPos, false, 16);
      expect(objectiveSystem.isCarryingCell()).toBe(false);

      // Wait for cooldown (500ms)
      objectiveSystem.update(cellPos, false, 600);
      expect(objectiveSystem.isCarryingCell()).toBe(true);
    });

    it('should force drop cell at specified position', () => {
      const cellPos = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };
      objectiveSystem.update(cellPos, false, 16);

      const dropPos: Vec3 = { x: 50, y: 0.5, z: 50 };
      objectiveSystem.forceDropCell(dropPos);

      expect(objectiveSystem.isCarryingCell()).toBe(false);
      expect(droppedCells[0].position).toEqual(dropPos);
    });
  });

  describe('cell delivery', () => {
    it('should deliver cell when near TARDIS', () => {
      // Pick up cell
      const cellPos = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };
      objectiveSystem.update(cellPos, false, 16);

      // Move to TARDIS (at 8, 8 tile coords)
      const tardisPos = { x: 8 * TILE_SIZE, y: 8 * TILE_SIZE };
      objectiveSystem.update(tardisPos, false, 16);

      expect(objectiveSystem.isCarryingCell()).toBe(false);
      expect(callbacks.onCellDelivered).toHaveBeenCalledWith(1, 3);
      expect(objectiveSystem.getState().cellsDelivered).toBe(1);
    });

    it('should complete objective when all cells delivered', () => {
      const tardisPos = { x: 8 * TILE_SIZE, y: 8 * TILE_SIZE };

      // Deliver all 3 cells
      const cellPositions = [
        { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE },
        { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE },
        { x: 6 * TILE_SIZE, y: 6 * TILE_SIZE },
      ];

      for (const cellPos of cellPositions) {
        // Wait for any cooldown
        objectiveSystem.update(cellPos, false, 600);
        // Move to TARDIS
        objectiveSystem.update(tardisPos, false, 16);
      }

      expect(callbacks.onObjectiveComplete).toHaveBeenCalled();
      expect(objectiveSystem.getState().isComplete).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return correct state structure', () => {
      const state = objectiveSystem.getState();

      expect(state).toHaveProperty('cellsDelivered');
      expect(state).toHaveProperty('cellsRequired');
      expect(state).toHaveProperty('isCarryingCell');
      expect(state).toHaveProperty('carriedCellId');
      expect(state).toHaveProperty('isComplete');
    });

    it('should reflect carrying state correctly', () => {
      const cellPos = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };

      let state = objectiveSystem.getState();
      expect(state.isCarryingCell).toBe(false);

      objectiveSystem.update(cellPos, false, 16);

      state = objectiveSystem.getState();
      expect(state.isCarryingCell).toBe(true);
      expect(state.carriedCellId).not.toBeNull();
    });
  });
});
