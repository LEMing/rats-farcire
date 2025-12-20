// ============================================================================
// Menu Configuration - All constants for the menu scene
// ============================================================================

export const MenuConfig = {
  // Scene - Dark purple horror theme
  scene: {
    backgroundColor: 0x0d0812,
    cameraFov: 50,
    cameraNear: 0.1,
    cameraFar: 1000,
    cameraZ: 18,
  },

  // Lighting - Purple/magenta horror vibes
  lighting: {
    ambient: {
      color: 0x2a1a3a,
      intensity: 0.5,
    },
    main: {
      color: 0x9944ff,
      intensity: 1.4,
      position: { x: 2, y: 6, z: 10 },
    },
    fill: {
      color: 0xff44aa,
      intensity: 0.6,
      distance: 25,
      position: { x: -6, y: 0, z: 5 },
    },
    accent: {
      color: 0xff2266,
      intensity: 0.9,
      distance: 15,
      position: { x: 0, y: 0, z: 6 },
    },
  },

  // Central meatball - with purple glow
  centralMeatball: {
    size: 2.5,
    positionY: 0.5,
    rotationSpeed: 0.004,
    pulseSpeed: 1.5,
    pulseAmount: 0.03,
    glowSize: 2.3,
    glowColor: 0xaa22ff,
    glowOpacity: 0.2,
  },

  // Floating meatballs
  floatingMeatballs: {
    count: 18,
    sizeMin: 0.25,
    sizeMax: 0.7,
    radiusMin: 5,
    radiusMax: 15,
    velocityRange: 0.008,
    rotationSpeedRange: 0.01,
  },

  // Meatball appearance - darker, more grotesque
  meatball: {
    detailedBumpCount: 20,
    simpleBumpCount: 6,
    bumpSizeMin: 0.15,
    bumpSizeMax: 0.35,
    colors: {
      dark: 0x4a1a2a,
      medium: 0x6b2a3a,
    },
  },

  // Procedural background - infinite fullscreen shader
  background: {
    noiseScale: 3.0,
    paperColor: { r: 0.05, g: 0.02, b: 0.08 },
    // Swirling vortex effect
    vortexSpeed: 0.15,
    vortexStrength: 0.3,
    // Fog/atmosphere layers (reduced from 4 for faster shader compilation)
    fogLayers: 2,
    fogSpeed: 0.08,
    // Pulse effect
    pulseSpeed: 0.8,
    pulseIntensity: 0.15,
  },

  // Blood splatters (positions and sizes)
  bloodSplatters: [
    { x: 0.15, y: 0.25, size: 0.08 },
    { x: 0.72, y: 0.18, size: 0.06 },
    { x: 0.35, y: 0.78, size: 0.09 },
    { x: 0.85, y: 0.65, size: 0.07 },
    { x: 0.22, y: 0.55, size: 0.05 },
    { x: 0.68, y: 0.42, size: 0.08 },
    { x: 0.45, y: 0.12, size: 0.06 },
    { x: 0.92, y: 0.88, size: 0.07 },
  ],

  // Meat chunks (positions, sizes, animation phases)
  meatChunks: [
    { x: 0.12, y: 0.35, size: 0.025, phase: 1.0 },
    { x: 0.78, y: 0.22, size: 0.02, phase: 2.3 },
    { x: 0.42, y: 0.68, size: 0.03, phase: 3.7 },
    { x: 0.88, y: 0.75, size: 0.022, phase: 4.2 },
    { x: 0.25, y: 0.85, size: 0.028, phase: 5.1 },
    { x: 0.65, y: 0.15, size: 0.02, phase: 6.4 },
    { x: 0.55, y: 0.45, size: 0.025, phase: 7.8 },
    { x: 0.18, y: 0.62, size: 0.023, phase: 8.9 },
  ],

  // Colors - Horror purple/magenta theme
  colors: {
    blood: {
      base: { r: 0.7, g: 0.1, b: 0.4 },
      dark: { r: 0.4, g: 0.05, b: 0.25 },
    },
    meat: {
      pink: { r: 0.8, g: 0.3, b: 0.6 },
      red: { r: 0.6, g: 0.15, b: 0.4 },
    },
    vignette: { r: 0.03, g: 0.01, b: 0.05 },
  },

  // Animation
  animation: {
    bloodPulseSpeed: 2.0,
    bloodPulseAmount: 0.1,
    meatFloatSpeedX: 0.3,
    meatFloatSpeedY: 0.2,
    meatFloatAmountX: 0.02,
    meatFloatAmountY: 0.015,
    cameraSwaySpeedX: 0.12,
    cameraSwaySpeedY: 0.08,
    cameraSwayAmountX: 0.4,
    cameraSwayAmountY: 0.25,
    lightFlickerSpeed: 3,
    lightFlickerAmount: 0.15,
  },

  // Post-processing - Dramatic horror effects
  postProcessing: {
    // Color grading
    sepiaStrength: 0.15,
    contrastBoost: 1.2,
    saturationBoost: 1.3,
    // Chromatic aberration (RGB split)
    chromaticStrength: 0.008,
    chromaticPulseSpeed: 2.0,
    chromaticPulseAmount: 0.003,
    // Film grain
    grainSpeed: 15.0,
    grainAmount: 0.08,
    // Vignette (pulsing)
    vignetteInner: 0.15,
    vignetteOuter: 0.85,
    vignetteStrength: 0.8,
    vignettePulseSpeed: 1.5,
    vignettePulseAmount: 0.1,
    // Bloom
    bloomStrength: 0.4,
    bloomThreshold: 0.6,
    // Scan lines
    scanLineStrength: 0.06,
    scanLineCount: 400,
    scanLineSpeed: 0.5,
    // Radial blur
    radialBlurStrength: 0.02,
  },
} as const;

export type MenuConfigType = typeof MenuConfig;
