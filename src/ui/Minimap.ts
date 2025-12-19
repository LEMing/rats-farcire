import type { MapData, Tile, EnemyType } from '@shared/types';

// ============================================================================
// Minimap - Real-time overhead map display
// Shows: map layout, player, enemies, objectives
// ============================================================================

export interface MinimapData {
  playerPos: { x: number; z: number };
  playerRotation: number;
  enemies: Array<{ x: number; z: number; type: EnemyType }>;
  cells: Array<{ x: number; z: number; collected: boolean; delivered: boolean }>;
  tardisPos: { x: number; y: number } | null; // Vec2 uses y for the second coordinate
}

export class Minimap {
  private readonly SIZE = 120; // Canvas size in pixels (smaller, less intrusive)
  private readonly PADDING = 10; // Distance from screen edge

  // Canvas elements
  private container!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  // Pre-rendered map buffer
  private mapBuffer!: HTMLCanvasElement;
  private mapBufferCtx!: CanvasRenderingContext2D;

  // Map data
  private mapWidth: number;
  private mapHeight: number;
  private scale: number;
  private tiles: Tile[][];

  // Animation
  private pulseTime = 0;

  // Colors
  private readonly COLORS = {
    background: 'rgba(0, 0, 0, 0.8)',
    border: '#00ffff',
    wall: '#3a3a50',
    floor: '#1a1a2a',
    player: '#00ffff',
    enemyGrunt: '#ff4444',
    enemyRunner: '#ff8844',
    enemyTank: '#cc2222',
    cell: '#ffaa00',
    cellCollected: '#886633',
    tardis: '#4488ff',
  };

  constructor(mapData: MapData) {
    this.mapWidth = mapData.width;
    this.mapHeight = mapData.height;
    this.tiles = mapData.tiles;
    this.scale = this.SIZE / Math.max(this.mapWidth, this.mapHeight);

    this.createElements();
    this.preRenderMap();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private createElements(): void {
    // Container div
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.cssText = `
      position: absolute;
      bottom: ${this.PADDING}px;
      left: ${this.PADDING}px;
      width: ${this.SIZE}px;
      height: ${this.SIZE}px;
      background: ${this.COLORS.background};
      border: 2px solid ${this.COLORS.border};
      border-radius: 4px;
      pointer-events: none;
      z-index: 31;
      box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
    `;

    // Main canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.SIZE;
    this.canvas.height = this.SIZE;
    this.canvas.style.cssText = `
      display: block;
    `;
    this.ctx = this.canvas.getContext('2d')!;

    // Pre-render buffer
    this.mapBuffer = document.createElement('canvas');
    this.mapBuffer.width = this.SIZE;
    this.mapBuffer.height = this.SIZE;
    this.mapBufferCtx = this.mapBuffer.getContext('2d')!;

    this.container.appendChild(this.canvas);
    document.getElementById('ui-overlay')?.appendChild(this.container);
  }

  private preRenderMap(): void {
    // Clear buffer
    this.mapBufferCtx.fillStyle = this.COLORS.floor;
    this.mapBufferCtx.fillRect(0, 0, this.SIZE, this.SIZE);

    // Draw tiles
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tile = this.tiles[y]?.[x];
        if (!tile) continue;

        const px = x * this.scale;
        const py = y * this.scale;

        if (!tile.walkable) {
          this.mapBufferCtx.fillStyle = this.COLORS.wall;
          this.mapBufferCtx.fillRect(px, py, this.scale + 0.5, this.scale + 0.5);
        }
      }
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  update(data: MinimapData, dt: number): void {
    this.pulseTime += dt * 0.005; // Slow pulse

    // Clear and draw pre-rendered map
    this.ctx.drawImage(this.mapBuffer, 0, 0);

    // Draw dynamic elements (order matters - later draws on top)
    this.drawTardis(data.tardisPos);
    this.drawCells(data.cells);
    this.drawEnemies(data.enemies);
    this.drawPlayer(data.playerPos, data.playerRotation);
  }

  destroy(): void {
    this.container.remove();
  }

  // ============================================================================
  // Drawing Methods
  // ============================================================================

  private drawPlayer(pos: { x: number; z: number }, rotation: number): void {
    const px = pos.x * this.scale;
    const py = pos.z * this.scale;
    const size = 4;

    this.ctx.save();
    this.ctx.translate(px, py);
    this.ctx.rotate(rotation);

    // Player triangle pointing in facing direction
    this.ctx.fillStyle = this.COLORS.player;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -size); // Tip (forward)
    this.ctx.lineTo(-size * 0.6, size * 0.5);
    this.ctx.lineTo(size * 0.6, size * 0.5);
    this.ctx.closePath();
    this.ctx.fill();

    // Glow effect
    this.ctx.shadowColor = this.COLORS.player;
    this.ctx.shadowBlur = 4;
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.restore();
  }

  private drawEnemies(enemies: MinimapData['enemies']): void {
    for (const enemy of enemies) {
      const px = enemy.x * this.scale;
      const py = enemy.z * this.scale;

      // Size and color based on type (scaled for smaller minimap)
      let radius = 1.5;
      let color = this.COLORS.enemyGrunt;

      switch (enemy.type) {
        case 'runner':
          radius = 1;
          color = this.COLORS.enemyRunner;
          break;
        case 'tank':
          radius = 2;
          color = this.COLORS.enemyTank;
          break;
      }

      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(px, py, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawCells(cells: MinimapData['cells']): void {
    const pulse = 0.7 + Math.sin(this.pulseTime * 3) * 0.3;

    for (const cell of cells) {
      if (cell.delivered) continue; // Don't show delivered cells

      const px = cell.x * this.scale;
      const py = cell.z * this.scale;
      const size = cell.collected ? 2 : 3 * pulse;

      // Diamond shape for cells
      this.ctx.fillStyle = cell.collected ? this.COLORS.cellCollected : this.COLORS.cell;
      this.ctx.beginPath();
      this.ctx.moveTo(px, py - size);
      this.ctx.lineTo(px + size, py);
      this.ctx.lineTo(px, py + size);
      this.ctx.lineTo(px - size, py);
      this.ctx.closePath();
      this.ctx.fill();

      // Glow for uncollected cells
      if (!cell.collected) {
        this.ctx.shadowColor = this.COLORS.cell;
        this.ctx.shadowBlur = 5;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      }
    }
  }

  private drawTardis(pos: { x: number; y: number } | null): void {
    if (!pos) return;

    const px = pos.x * this.scale;
    const py = pos.y * this.scale;
    const pulse = 0.8 + Math.sin(this.pulseTime * 2) * 0.2;
    const size = 4 * pulse;

    // TARDIS as a pulsing square
    this.ctx.fillStyle = this.COLORS.tardis;
    this.ctx.fillRect(px - size / 2, py - size / 2, size, size);

    // Glow effect
    this.ctx.shadowColor = this.COLORS.tardis;
    this.ctx.shadowBlur = 6;
    this.ctx.fillRect(px - size / 2, py - size / 2, size, size);
    this.ctx.shadowBlur = 0;

    // Inner bright core
    const coreSize = size * 0.4;
    this.ctx.fillStyle = '#88bbff';
    this.ctx.fillRect(px - coreSize / 2, py - coreSize / 2, coreSize, coreSize);
  }
}
