/**
 * ZoneLighting - Manages zone-specific ambient effects
 *
 * Sets up fog and ambient lighting based on the zones present in the map.
 * Uses the dominant zone (or spawn zone) to determine the overall atmosphere.
 */

import * as THREE from 'three/webgpu';
import type { MapData } from '@shared/types';
import { Zone, getZoneForRoomType, ZONE_THEMES } from './ZoneConfig';

export class ZoneLighting {
  private scene: THREE.Scene;
  private ambientLight: THREE.AmbientLight | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Apply zone-based ambient effects to the scene
   * Uses the spawn room's zone as the base atmosphere
   */
  applyZoneAtmosphere(mapData: MapData): void {
    // Find the spawn room to use as the base zone
    const spawnRoom = mapData.rooms.find((r) => r.roomType === 'spawn');
    const baseZone = spawnRoom ? getZoneForRoomType(spawnRoom.roomType) : 'neutral';

    // Count zones to create a blended atmosphere
    const zoneCounts: Record<Zone, number> = {
      industrial: 0,
      ritual: 0,
      organic: 0,
      neutral: 0,
    };

    for (const room of mapData.rooms) {
      const zone = getZoneForRoomType(room.roomType);
      zoneCounts[zone]++;
    }

    // Find dominant zone (excluding neutral which is just spawn)
    let dominantZone: Zone = baseZone;
    let maxCount = 0;
    for (const [zone, count] of Object.entries(zoneCounts)) {
      if (zone !== 'neutral' && count > maxCount) {
        maxCount = count;
        dominantZone = zone as Zone;
      }
    }

    // Use blend of base zone and dominant zone
    const baseTheme = ZONE_THEMES[baseZone];
    const dominantTheme = ZONE_THEMES[dominantZone];

    // Calculate blended fog settings
    const fogColor = this.blendColors(
      baseTheme.ambient.fogColor,
      dominantTheme.ambient.fogColor,
      0.5
    );
    const fogDensity =
      (baseTheme.ambient.fogDensity + dominantTheme.ambient.fogDensity) / 2;

    // Apply fog
    this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);

    // Update or create ambient light
    const ambientColor = this.blendColors(
      baseTheme.ambient.ambientLightColor,
      dominantTheme.ambient.ambientLightColor,
      0.5
    );
    const ambientIntensity =
      (baseTheme.ambient.ambientLightIntensity +
        dominantTheme.ambient.ambientLightIntensity) /
      2;

    if (this.ambientLight) {
      this.ambientLight.color.setHex(ambientColor);
      this.ambientLight.intensity = ambientIntensity;
    } else {
      // Find existing ambient light or create new one
      this.ambientLight = this.scene.children.find(
        (c): c is THREE.AmbientLight => c instanceof THREE.AmbientLight
      ) ?? null;

      if (this.ambientLight) {
        this.ambientLight.color.setHex(ambientColor);
        this.ambientLight.intensity = ambientIntensity;
      }
    }
  }

  /**
   * Apply a specific zone's atmosphere (for transitions or overrides)
   */
  applyZone(zone: Zone): void {
    const theme = ZONE_THEMES[zone];

    // Apply fog
    this.scene.fog = new THREE.FogExp2(
      theme.ambient.fogColor,
      theme.ambient.fogDensity
    );

    // Update ambient light
    if (this.ambientLight) {
      this.ambientLight.color.setHex(theme.ambient.ambientLightColor);
      this.ambientLight.intensity = theme.ambient.ambientLightIntensity;
    }
  }

  /**
   * Clear fog and reset lighting
   */
  clear(): void {
    this.scene.fog = null;
  }

  /**
   * Blend two colors
   */
  private blendColors(color1: number, color2: number, t: number): number {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;

    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return (r << 16) | (g << 8) | b;
  }
}
