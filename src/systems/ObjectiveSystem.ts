import type { MapData, PowerCellState, Vec2, Vec3 } from '@shared/types';
import {
  TILE_SIZE,
  POWER_CELLS_REQUIRED,
  CELL_PICKUP_RADIUS,
  CELL_DELIVERY_RADIUS,
} from '@shared/constants';
import { distance } from '@shared/utils';

// ============================================================================
// Objective System - Handles power cell collection and TARDIS escape
// Single Responsibility: Track objective state and determine pickup/delivery
// ============================================================================

export interface ObjectiveState {
  cellsDelivered: number;
  cellsRequired: number;
  isCarryingCell: boolean;
  carriedCellId: string | null;
  isComplete: boolean;
}

export interface ObjectiveCallbacks {
  onCellPickup: (cellId: string) => void;
  onCellDrop: (cellId: string, position: Vec3) => void;
  onCellDelivered: (cellNumber: number, totalCells: number) => void;
  onObjectiveComplete: () => void;
}

export class ObjectiveSystem {
  // Power cells
  private powerCells: Map<string, PowerCellState> = new Map();

  // Objective state
  private cellsDelivered = 0;
  private carriedCellId: string | null = null;
  private isComplete = false;

  // TARDIS position (world coordinates)
  private tardisWorldPos: Vec2 | null = null;

  // Pickup cooldown after dropping (prevents immediate re-pickup)
  private pickupCooldown = 0;
  private readonly PICKUP_COOLDOWN_DURATION = 500; // ms

  // Callbacks
  private readonly callbacks: ObjectiveCallbacks;

  constructor(mapData: MapData, callbacks: ObjectiveCallbacks) {
    this.callbacks = callbacks;

    // Store TARDIS position in world coordinates
    if (mapData.tardisPosition) {
      this.tardisWorldPos = {
        x: mapData.tardisPosition.x * TILE_SIZE,
        y: mapData.tardisPosition.y * TILE_SIZE,
      };
    }

    // Initialize power cells from map data
    this.initializePowerCells(mapData.cellPositions);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Update objective system - call every game tick
   * @param playerPos Player position in world coordinates
   * @param interactPressed Whether interact key was pressed this frame
   * @param dt Delta time in milliseconds
   */
  update(playerPos: Vec2, interactPressed: boolean, dt: number = 16): void {
    if (this.isComplete) return;

    // Update pickup cooldown
    if (this.pickupCooldown > 0) {
      this.pickupCooldown -= dt;
    }

    // Handle cell drop (interact key while carrying)
    if (interactPressed && this.carriedCellId) {
      this.dropCell(playerPos);
      return;
    }

    // If carrying a cell, check for TARDIS delivery
    if (this.carriedCellId) {
      this.checkDelivery(playerPos);
      return;
    }

    // Not carrying - check for cell pickup (respecting cooldown)
    if (this.pickupCooldown <= 0) {
      this.checkPickup(playerPos);
    }
  }

  /**
   * Force drop the carried cell (e.g., when shooting)
   */
  forceDropCell(dropPosition: Vec3): void {
    if (!this.carriedCellId) return;

    const cell = this.powerCells.get(this.carriedCellId);
    if (!cell) return;

    cell.position = { ...dropPosition };
    cell.collected = false;
    cell.carriedBy = null;

    const droppedCellId = this.carriedCellId;
    this.carriedCellId = null;

    this.callbacks.onCellDrop(droppedCellId, dropPosition);
  }

  /**
   * Check if player is carrying a cell
   */
  isCarryingCell(): boolean {
    return this.carriedCellId !== null;
  }

  /**
   * Get the ID of the carried cell (or null)
   */
  getCarriedCellId(): string | null {
    return this.carriedCellId;
  }

  /**
   * Get current objective state for UI
   */
  getState(): ObjectiveState {
    return {
      cellsDelivered: this.cellsDelivered,
      cellsRequired: POWER_CELLS_REQUIRED,
      isCarryingCell: this.carriedCellId !== null,
      carriedCellId: this.carriedCellId,
      isComplete: this.isComplete,
    };
  }

  /**
   * Get all power cell states (for rendering sync)
   */
  getPowerCells(): Map<string, PowerCellState> {
    return this.powerCells;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private initializePowerCells(cellPositions: Vec2[]): void {
    for (let i = 0; i < cellPositions.length; i++) {
      const pos = cellPositions[i];
      const cellId = `cell_${i}`;

      const cell: PowerCellState = {
        id: cellId,
        type: 'powerCell',
        position: { x: pos.x * TILE_SIZE, y: 0.5, z: pos.y * TILE_SIZE },
        rotation: 0,
        velocity: { x: 0, y: 0 },
        collected: false,
        delivered: false,
        carriedBy: null,
      };
      this.powerCells.set(cellId, cell);
    }

    console.log(`ObjectiveSystem: Initialized ${this.powerCells.size} power cells`);
  }

  private checkPickup(playerPos: Vec2): void {
    for (const [cellId, cell] of this.powerCells) {
      if (cell.collected || cell.delivered) continue;

      const cellPos = { x: cell.position.x, y: cell.position.z };
      const dist = distance(playerPos, cellPos);

      if (dist < CELL_PICKUP_RADIUS) {
        this.pickupCell(cellId);
        break;
      }
    }
  }

  private pickupCell(cellId: string): void {
    const cell = this.powerCells.get(cellId);
    if (!cell) return;

    cell.collected = true;
    this.carriedCellId = cellId;

    this.callbacks.onCellPickup(cellId);
  }

  private dropCell(playerPos: Vec2): void {
    if (!this.carriedCellId) return;

    const cell = this.powerCells.get(this.carriedCellId);
    if (!cell) return;

    const dropPosition: Vec3 = { x: playerPos.x, y: 0.5, z: playerPos.y };
    cell.position = dropPosition;
    cell.collected = false;
    cell.carriedBy = null;

    const droppedCellId = this.carriedCellId;
    this.carriedCellId = null;

    // Start pickup cooldown to prevent immediate re-pickup
    this.pickupCooldown = this.PICKUP_COOLDOWN_DURATION;

    this.callbacks.onCellDrop(droppedCellId, dropPosition);
  }

  private checkDelivery(playerPos: Vec2): void {
    if (!this.carriedCellId || !this.tardisWorldPos) return;

    const dist = distance(playerPos, this.tardisWorldPos);

    if (dist < CELL_DELIVERY_RADIUS) {
      this.deliverCell();
    }
  }

  private deliverCell(): void {
    if (!this.carriedCellId) return;

    const cell = this.powerCells.get(this.carriedCellId);
    if (!cell) return;

    // Mark cell as delivered
    cell.delivered = true;
    cell.carriedBy = null;
    this.carriedCellId = null;
    this.cellsDelivered++;

    this.callbacks.onCellDelivered(this.cellsDelivered, POWER_CELLS_REQUIRED);

    // Check for win condition
    if (this.cellsDelivered >= POWER_CELLS_REQUIRED) {
      this.isComplete = true;
      this.callbacks.onObjectiveComplete();
    }
  }
}
