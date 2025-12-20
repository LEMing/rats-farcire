/**
 * TextureManager - Handles zone-specific materials
 *
 * Creates color-based materials for each zone with smooth transitions.
 * No textures - uses harmonious color palettes for a clean aesthetic.
 */

import * as THREE from 'three/webgpu';
import { Zone, ZONE_THEMES, ZoneTheme, blendColors } from './ZoneConfig';
import type { AssetInfo } from '../assets/AssetLoader';

// ============================================================================
// TextureManager
// ============================================================================

export class TextureManager {
  private floorMaterials: Map<Zone, THREE.MeshLambertMaterial> = new Map();
  private wallMaterials: Map<Zone, THREE.MeshLambertMaterial> = new Map();
  private transitionMaterials: Map<string, THREE.MeshLambertMaterial> = new Map();
  private isLoaded = false;

  /**
   * Get list of texture assets to preload (empty - we don't use textures)
   */
  static getTextureAssets(): AssetInfo[] {
    return [];
  }

  /**
   * Initialize materials (no async loading needed)
   */
  async loadTextures(): Promise<void> {
    if (this.isLoaded) return;
    this.createMaterials();
    this.isLoaded = true;
  }

  /**
   * Create materials for each zone
   */
  private createMaterials(): void {
    for (const [zone, theme] of Object.entries(ZONE_THEMES) as [Zone, ZoneTheme][]) {
      // Floor material
      const floorMaterial = new THREE.MeshLambertMaterial({
        color: theme.colors.floor,
      });
      this.floorMaterials.set(zone, floorMaterial);

      // Wall material
      const wallMaterial = new THREE.MeshLambertMaterial({
        color: theme.colors.wall,
      });
      this.wallMaterials.set(zone, wallMaterial);
    }
  }

  /**
   * Get floor material for a zone
   */
  getFloorMaterial(zone: Zone): THREE.MeshLambertMaterial {
    const material = this.floorMaterials.get(zone);
    if (material) return material;

    // Fallback
    const theme = ZONE_THEMES[zone];
    const fallback = new THREE.MeshLambertMaterial({
      color: theme.colors.floor,
    });
    this.floorMaterials.set(zone, fallback);
    return fallback;
  }

  /**
   * Get wall material for a zone
   */
  getWallMaterial(zone: Zone): THREE.MeshLambertMaterial {
    const material = this.wallMaterials.get(zone);
    if (material) return material;

    // Fallback
    const theme = ZONE_THEMES[zone];
    const fallback = new THREE.MeshLambertMaterial({
      color: theme.colors.wall,
    });
    this.wallMaterials.set(zone, fallback);
    return fallback;
  }

  /**
   * Get a cloned wall material (for per-wall adjustments)
   */
  getWallMaterialClone(zone: Zone): THREE.MeshLambertMaterial {
    const baseMaterial = this.getWallMaterial(zone);
    return baseMaterial.clone();
  }

  /**
   * Get a transition floor material that blends between two zones
   * @param zone1 First zone
   * @param zone2 Second zone
   * @param t Blend factor (0 = zone1, 1 = zone2)
   */
  getTransitionFloorMaterial(zone1: Zone, zone2: Zone, t: number): THREE.MeshLambertMaterial {
    // Quantize t to reduce number of materials (0.25, 0.5, 0.75)
    const quantizedT = Math.round(t * 4) / 4;
    const key = `floor_${zone1}_${zone2}_${quantizedT}`;

    let material = this.transitionMaterials.get(key);
    if (!material) {
      const color1 = ZONE_THEMES[zone1].colors.floor;
      const color2 = ZONE_THEMES[zone2].colors.floor;
      const blendedColor = blendColors(color1, color2, quantizedT);

      material = new THREE.MeshLambertMaterial({ color: blendedColor });
      this.transitionMaterials.set(key, material);
    }

    return material;
  }

  /**
   * Get a transition wall material that blends between two zones
   */
  getTransitionWallMaterial(zone1: Zone, zone2: Zone, t: number): THREE.MeshLambertMaterial {
    const quantizedT = Math.round(t * 4) / 4;
    const key = `wall_${zone1}_${zone2}_${quantizedT}`;

    let material = this.transitionMaterials.get(key);
    if (!material) {
      const color1 = ZONE_THEMES[zone1].colors.wall;
      const color2 = ZONE_THEMES[zone2].colors.wall;
      const blendedColor = blendColors(color1, color2, quantizedT);

      material = new THREE.MeshLambertMaterial({ color: blendedColor });
      this.transitionMaterials.set(key, material);
    }

    return material;
  }

  /**
   * Check if materials are ready
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Dispose of all materials
   */
  dispose(): void {
    for (const material of this.floorMaterials.values()) {
      material.dispose();
    }
    for (const material of this.wallMaterials.values()) {
      material.dispose();
    }
    for (const material of this.transitionMaterials.values()) {
      material.dispose();
    }
    this.floorMaterials.clear();
    this.wallMaterials.clear();
    this.transitionMaterials.clear();
    this.isLoaded = false;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let textureManagerInstance: TextureManager | null = null;

export function getTextureManager(): TextureManager {
  if (!textureManagerInstance) {
    textureManagerInstance = new TextureManager();
  }
  return textureManagerInstance;
}
