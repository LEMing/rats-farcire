/**
 * ZoneConfig - Defines visual zones and their theming properties
 *
 * Zones group room types together with consistent visual themes including
 * colors, textures, decorations, and ambient effects.
 */

import type { RoomType } from '@shared/types';

// ============================================================================
// Zone Types
// ============================================================================

export type Zone = 'industrial' | 'ritual' | 'organic' | 'neutral';

// ============================================================================
// Zone Theme Configuration
// ============================================================================

export interface ZoneColors {
  floor: number;
  floorAccent: number;
  wall: number;
  wallAccent: number;
  debris: number;
  ambient: number;
}

export interface ZoneTextures {
  floor: string;
  wall: string;
}

export interface ZoneAmbient {
  fogColor: number;
  fogDensity: number;
  ambientLightColor: number;
  ambientLightIntensity: number;
  particleType: 'dust' | 'embers' | 'spores' | null;
}

export interface ZoneDecorations {
  /** Weight multiplier for different prop types in this zone */
  propWeights: Record<string, number>;
  /** Overall decoration density multiplier (0-1) */
  density: number;
}

export interface ZoneTheme {
  id: Zone;
  name: string;
  colors: ZoneColors;
  textures: ZoneTextures;
  ambient: ZoneAmbient;
  decorations: ZoneDecorations;
}

// ============================================================================
// Room Type to Zone Mapping
// ============================================================================

export const ROOM_TYPE_TO_ZONE: Record<RoomType, Zone> = {
  // Industrial Zone - metallic, machinery, pipes
  grinder: 'industrial',
  storage: 'industrial',

  // Ritual Zone - mystical, purple, arcane
  shrine: 'ritual',
  cell: 'ritual',
  altar: 'ritual',
  tardis: 'ritual', // TARDIS room has mystical feel

  // Organic Zone - dirty, bones, nests
  nest: 'organic',
  normal: 'organic',

  // Neutral Zone - clean, safe
  spawn: 'neutral',
};

// ============================================================================
// Zone Theme Definitions
// ============================================================================

export const ZONE_THEMES: Record<Zone, ZoneTheme> = {
  industrial: {
    id: 'industrial',
    name: 'Industrial',
    colors: {
      floor: 0x4a5560,      // Cool blue-grey steel
      floorAccent: 0x556570,
      wall: 0x3a4550,       // Darker steel
      wallAccent: 0x4a5560,
      debris: 0x6a7580,
      ambient: 0x6699bb,
    },
    textures: {
      floor: '',
      wall: '',
    },
    ambient: {
      fogColor: 0x2a3540,
      fogDensity: 0.004,
      ambientLightColor: 0x88aacc,
      ambientLightIntensity: 0.85,
      particleType: 'dust',
    },
    decorations: {
      propWeights: {
        crate: 3,
        barrel: 4,
        metalDebris: 3,
        pipe: 2,
      },
      density: 0.8,
    },
  },

  ritual: {
    id: 'ritual',
    name: 'Ritual',
    colors: {
      floor: 0x3a3045,      // Deep purple-grey
      floorAccent: 0x4a4055,
      wall: 0x2a2035,       // Dark mystical purple
      wallAccent: 0x3a3045,
      debris: 0x5a4a65,
      ambient: 0x9966bb,
    },
    textures: {
      floor: '',
      wall: '',
    },
    ambient: {
      fogColor: 0x201828,
      fogDensity: 0.003,
      ambientLightColor: 0xaa88cc,
      ambientLightIntensity: 0.8,
      particleType: 'embers',
    },
    decorations: {
      propWeights: {
        candle: 4,
        ritualCircle: 2,
        bonePile: 2,
        bloodPool: 2,
      },
      density: 0.7,
    },
  },

  organic: {
    id: 'organic',
    name: 'Organic',
    colors: {
      floor: 0x4a4035,      // Warm earthy brown
      floorAccent: 0x5a5045,
      wall: 0x3a3025,       // Dark earth
      wallAccent: 0x4a4035,
      debris: 0x6a6055,
      ambient: 0xaa9977,
    },
    textures: {
      floor: '',
      wall: '',
    },
    ambient: {
      fogColor: 0x252018,
      fogDensity: 0.004,
      ambientLightColor: 0xbbaa88,
      ambientLightIntensity: 0.8,
      particleType: 'spores',
    },
    decorations: {
      propWeights: {
        bonePile: 4,
        debris: 3,
        ratHole: 3,
        puddle: 2,
      },
      density: 1.0,
    },
  },

  neutral: {
    id: 'neutral',
    name: 'Neutral',
    colors: {
      floor: 0x555555,      // Clean grey
      floorAccent: 0x656565,
      wall: 0x454545,       // Slightly darker
      wallAccent: 0x555555,
      debris: 0x757575,
      ambient: 0x999999,
    },
    textures: {
      floor: '',
      wall: '',
    },
    ambient: {
      fogColor: 0x303030,
      fogDensity: 0.003,
      ambientLightColor: 0xbbbbbb,
      ambientLightIntensity: 0.9,
      particleType: null,
    },
    decorations: {
      propWeights: {
        crate: 2,
        barrel: 1,
      },
      density: 0.3,
    },
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get zone for a room type
 */
export function getZoneForRoomType(roomType: RoomType): Zone {
  return ROOM_TYPE_TO_ZONE[roomType] || 'organic';
}

/**
 * Get theme for a zone
 */
export function getZoneTheme(zone: Zone): ZoneTheme {
  return ZONE_THEMES[zone];
}

/**
 * Get theme for a room type
 */
export function getThemeForRoomType(roomType: RoomType): ZoneTheme {
  return ZONE_THEMES[getZoneForRoomType(roomType)];
}

/**
 * Blend two colors by a factor (0 = color1, 1 = color2)
 */
export function blendColors(color1: number, color2: number, t: number): number {
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

/**
 * Get a slightly varied color for visual interest
 */
export function varyColor(color: number, variance: number = 0.05): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;

  const vary = (c: number) => {
    const delta = Math.floor((Math.random() - 0.5) * 2 * variance * 255);
    return Math.max(0, Math.min(255, c + delta));
  };

  return (vary(r) << 16) | (vary(g) << 8) | vary(b);
}
