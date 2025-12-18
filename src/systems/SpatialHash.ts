// ============================================================================
// Spatial Hash - Grid-based spatial partitioning for efficient collision detection
// Reduces collision checks from O(n*m) to O(n+m) by only checking nearby cells
// ============================================================================

export interface SpatialEntity {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export class SpatialHash<T extends SpatialEntity> {
  private readonly cellSize: number;
  private readonly cells: Map<string, T[]> = new Map();
  private readonly entityCells: Map<string, string[]> = new Map();

  // Reusable arrays to avoid allocations
  private readonly nearbyResult: T[] = [];
  private readonly cellKeys: string[] = [];

  constructor(cellSize: number = 4) {
    this.cellSize = cellSize;
  }

  /**
   * Clear all entities from the hash
   */
  clear(): void {
    this.cells.clear();
    this.entityCells.clear();
  }

  /**
   * Insert an entity into the hash
   */
  insert(entity: T): void {
    const keys = this.getCellKeys(entity.x, entity.z, entity.radius);
    this.entityCells.set(entity.id, keys);

    for (const key of keys) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = [];
        this.cells.set(key, cell);
      }
      cell.push(entity);
    }
  }

  /**
   * Remove an entity from the hash
   */
  remove(entityId: string): void {
    const keys = this.entityCells.get(entityId);
    if (!keys) return;

    for (const key of keys) {
      const cell = this.cells.get(key);
      if (cell) {
        const idx = cell.findIndex(e => e.id === entityId);
        if (idx !== -1) {
          cell.splice(idx, 1);
        }
        if (cell.length === 0) {
          this.cells.delete(key);
        }
      }
    }

    this.entityCells.delete(entityId);
  }

  /**
   * Update an entity's position in the hash
   */
  update(entity: T): void {
    this.remove(entity.id);
    this.insert(entity);
  }

  /**
   * Get all entities near a point within a radius
   * Returns a reused array - do not store the reference!
   */
  getNearby(x: number, z: number, radius: number): readonly T[] {
    this.nearbyResult.length = 0;
    const seen = new Set<string>();

    const keys = this.getCellKeys(x, z, radius);
    for (const key of keys) {
      const cell = this.cells.get(key);
      if (cell) {
        for (const entity of cell) {
          if (!seen.has(entity.id)) {
            seen.add(entity.id);
            this.nearbyResult.push(entity);
          }
        }
      }
    }

    return this.nearbyResult;
  }

  /**
   * Get cell keys that a circle overlaps
   */
  private getCellKeys(x: number, z: number, radius: number): string[] {
    this.cellKeys.length = 0;

    const minCellX = Math.floor((x - radius) / this.cellSize);
    const maxCellX = Math.floor((x + radius) / this.cellSize);
    const minCellZ = Math.floor((z - radius) / this.cellSize);
    const maxCellZ = Math.floor((z + radius) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        this.cellKeys.push(`${cx},${cz}`);
      }
    }

    return this.cellKeys;
  }

  /**
   * Get number of occupied cells (for debugging)
   */
  getCellCount(): number {
    return this.cells.size;
  }

  /**
   * Get total entity count (for debugging)
   */
  getEntityCount(): number {
    return this.entityCells.size;
  }
}
