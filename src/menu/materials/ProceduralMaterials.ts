import * as THREE from 'three/webgpu';
import {
  vec2,
  vec3,
  vec4,
  float,
  uv,
  sin,
  cos,
  fract,
  floor,
  mix,
  smoothstep,
  length,
  dot,
  clamp,
  mul,
  add,
  sub,
  max,
  atan2,
} from 'three/tsl';
import { MenuConfig } from '../config/MenuConfig';

// ============================================================================
// Procedural Materials Factory - Creates TSL-based materials
// ============================================================================

interface SplatConfig {
  x: number;
  y: number;
  size: number;
}

interface MeatChunkConfig {
  x: number;
  y: number;
  size: number;
  phase: number;
}

// Using 'any' for TSL node types as Three.js TSL types are complex and evolving
type TSLNode = ReturnType<typeof float>;
type TimeUniform = { value: number };

export class ProceduralMaterials {
  private readonly timeUniform: TimeUniform;

  constructor(timeUniform: TimeUniform) {
    this.timeUniform = timeUniform;
  }

  /**
   * Creates an infinite procedural background with swirling vortex and fog layers
   */
  createBackgroundMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial();
    const uvCoord = uv();
    const config = MenuConfig.background;
    const t = this.timeUniform as unknown as TSLNode;

    // Center the UV coordinates (-0.5 to 0.5)
    const centeredUV = sub(uvCoord, vec2(0.5, 0.5));

    // Create swirling vortex distortion
    const dist = length(centeredUV);
    const angle = atan2(centeredUV.y, centeredUV.x);
    const swirl = add(angle, mul(mul(dist, config.vortexStrength), sin(mul(t, config.vortexSpeed))));
    const swirlUV = vec2(
      add(mul(cos(swirl), dist), 0.5),
      add(mul(sin(swirl), dist), 0.5)
    );

    // Base dark purple atmosphere
    const baseColor = vec3(config.paperColor.r, config.paperColor.g, config.paperColor.b);

    // Layered fog/nebula effect
    let fogColor: TSLNode = baseColor;
    for (let i = 0; i < config.fogLayers; i++) {
      const layerScale = float(2.0 + i * 1.5);
      const layerSpeed = mul(t, config.fogSpeed * (1 + i * 0.3));
      const layerUV = add(mul(swirlUV, layerScale), layerSpeed);
      const noise = this.fbmNoise(layerUV, 2);

      // Purple/magenta fog colors
      const fogTint = vec3(
        mul(0.15 + i * 0.05, noise),
        mul(0.05 + i * 0.02, noise),
        mul(0.2 + i * 0.08, noise)
      );
      fogColor = add(fogColor, mul(fogTint, float(0.3 / (i + 1))));
    }

    // Add radial glow from center (where meatball is)
    const centerGlow = smoothstep(float(0.8), float(0.0), dist);
    const glowColor = vec3(0.25, 0.08, 0.3); // Purple glow
    fogColor = add(fogColor, mul(glowColor, mul(centerGlow, 0.4)));

    // Pulsing brightness
    const pulse = add(1.0, mul(sin(mul(t, config.pulseSpeed)), config.pulseIntensity));
    fogColor = mul(fogColor, pulse);

    // Blood splatters
    const bloodLayer = this.createBloodLayer(uvCoord, this.valueNoise(mul(uvCoord, float(config.noiseScale))));
    fogColor = mix(fogColor, bloodLayer.color, clamp(mul(bloodLayer.mask, 0.8), 0, 1));

    // Meat chunks
    const meatLayer = this.createMeatLayer(uvCoord, this.valueNoise(mul(uvCoord, float(config.noiseScale))));
    fogColor = mix(fogColor, meatLayer.color, mul(meatLayer.mask, 0.9));

    // Dark vignette edges (very dark at edges to hide any boundaries)
    const vignette = smoothstep(float(0.3), float(0.9), dist);
    const vignetteColor = vec3(0.02, 0.01, 0.03);
    fogColor = mix(fogColor, vignetteColor, mul(vignette, 0.95));

    material.colorNode = vec4(fogColor, 1.0);
    return material;
  }

  /**
   * Fractal Brownian Motion noise for organic fog effect
   */
  private fbmNoise(uvCoord: TSLNode, octaves: number): TSLNode {
    let value: TSLNode = float(0);

    // Unrolled FBM for TSL compatibility
    const amplitudes = [0.5, 0.25, 0.125, 0.0625];
    const frequencies = [1.0, 2.0, 4.0, 8.0];

    for (let i = 0; i < Math.min(octaves, 4); i++) {
      const noiseUV = mul(uvCoord, frequencies[i]);
      const noise = this.valueNoise(noiseUV);
      value = add(value, mul(noise, amplitudes[i]));
    }

    return value;
  }

  /**
   * Creates a procedural meatball material with noise-based texture
   */
  createMeatballMaterial(): THREE.MeshStandardNodeMaterial {
    const material = new THREE.MeshStandardNodeMaterial();
    const localUV = uv();

    const noiseScale = float(15.0);
    const noiseUV = mul(localUV, noiseScale);
    const noise = this.simpleNoise(noiseUV);

    // Purple horror meatball colors
    const meatBrown = vec3(0.5, 0.2, 0.35);
    const meatDark = vec3(0.3, 0.1, 0.2);
    const meatLight = vec3(0.65, 0.3, 0.45);

    const meatBase = mix(meatDark, meatBrown, noise);
    const meatFinal = mix(meatBase, meatLight, mul(noise, noise));

    const t = this.timeUniform as unknown as TSLNode;
    const pulse = add(1.0, mul(sin(mul(t, 1.5)), 0.05));

    material.colorNode = vec4(mul(meatFinal, pulse), 1.0);
    material.roughness = 0.75;
    material.metalness = 0.1;

    return material;
  }

  // ---------------------------------------------------------------------------
  // Private helper methods
  // ---------------------------------------------------------------------------

  private createBloodLayer(uvCoord: TSLNode, noise: TSLNode) {
    const splatters = MenuConfig.bloodSplatters;
    const colors = MenuConfig.colors.blood;
    const anim = MenuConfig.animation;

    // Create all splatter masks and combine them
    const splatMasks = splatters.map((splat) => this.createSplatMask(uvCoord, splat));
    const combinedMask = this.combineWithMax(splatMasks);

    const bloodBase = vec3(colors.base.r, colors.base.g, colors.base.b);
    const bloodDark = vec3(colors.dark.r, colors.dark.g, colors.dark.b);
    const bloodColor = mix(bloodDark, bloodBase, add(mul(noise, 0.5), 0.5));

    const t = this.timeUniform as unknown as TSLNode;
    const bloodPulse = add(1.0, mul(sin(mul(t, anim.bloodPulseSpeed)), anim.bloodPulseAmount));
    const animatedMask = mul(combinedMask, bloodPulse);

    return { color: bloodColor, mask: animatedMask };
  }

  private createMeatLayer(uvCoord: TSLNode, noise: TSLNode) {
    const chunks = MenuConfig.meatChunks;
    const colors = MenuConfig.colors.meat;

    const chunkMasks = chunks.map((chunk) => this.createMeatChunkMask(uvCoord, chunk));
    const combinedMask = this.combineWithMax(chunkMasks);

    const meatPink = vec3(colors.pink.r, colors.pink.g, colors.pink.b);
    const meatRed = vec3(colors.red.r, colors.red.g, colors.red.b);
    const meatColor = mix(meatRed, meatPink, noise);

    return { color: meatColor, mask: combinedMask };
  }

  private createSplatMask(uvCoord: TSLNode, splat: SplatConfig): TSLNode {
    const splatCenter = vec2(splat.x, splat.y);
    const distToSplat = length(sub(uvCoord, splatCenter));
    return smoothstep(float(splat.size), float(splat.size * 0.3), distToSplat);
  }

  private createMeatChunkMask(uvCoord: TSLNode, chunk: MeatChunkConfig): TSLNode {
    const anim = MenuConfig.animation;
    const t = this.timeUniform as unknown as TSLNode;

    const animX = add(
      float(chunk.x),
      mul(sin(add(mul(t, anim.meatFloatSpeedX), chunk.phase)), anim.meatFloatAmountX)
    );
    const animY = add(
      float(chunk.y),
      mul(cos(add(mul(t, anim.meatFloatSpeedY), chunk.phase)), anim.meatFloatAmountY)
    );

    const meatCenter = vec2(animX, animY);
    const distToMeat = length(sub(uvCoord, meatCenter));
    return smoothstep(float(chunk.size), float(chunk.size * 0.2), distToMeat);
  }

  private valueNoise(noiseUV: TSLNode): TSLNode {
    const nx = floor(noiseUV.x);
    const ny = floor(noiseUV.y);
    const fx = fract(noiseUV.x);
    const fy = fract(noiseUV.y);

    const n1 = this.hash2D(nx, ny);
    const n2 = this.hash2D(add(nx, 1), ny);
    const n3 = this.hash2D(nx, add(ny, 1));
    const n4 = this.hash2D(add(nx, 1), add(ny, 1));

    const sx = smoothstep(float(0), float(1), fx);
    const sy = smoothstep(float(0), float(1), fy);

    return mix(mix(n1, n2, sx), mix(n3, n4, sx), sy);
  }

  private simpleNoise(noiseUV: TSLNode): TSLNode {
    return fract(mul(sin(dot(noiseUV, vec2(12.9898, 78.233))), 43758.5453));
  }

  private hash2D(x: TSLNode, y: TSLNode): TSLNode {
    return fract(mul(sin(dot(vec2(x, y), vec2(12.9898, 78.233))), 43758.5453));
  }

  private combineWithMax(nodes: TSLNode[]): TSLNode {
    if (nodes.length === 0) return float(0);
    if (nodes.length === 1) return nodes[0];

    let result = nodes[0];
    for (let i = 1; i < nodes.length; i++) {
      result = max(result, nodes[i]);
    }
    return result;
  }
}
