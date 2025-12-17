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
   * Creates the procedural background material with blood splatters and meat chunks
   */
  createBackgroundMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial();
    const uvCoord = uv();

    const paperTexture = this.createPaperTexture(uvCoord);
    const bloodLayer = this.createBloodLayer(uvCoord, paperTexture.noise);
    const meatLayer = this.createMeatLayer(uvCoord, paperTexture.noise);

    const withBlood = mix(
      paperTexture.color,
      bloodLayer.color,
      clamp(bloodLayer.mask, 0, 1)
    );

    const withMeat = mix(withBlood, meatLayer.color, mul(meatLayer.mask, 0.9));
    const withVignette = this.applyVignette(uvCoord, withMeat);

    material.colorNode = vec4(withVignette, 1.0);
    return material;
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

  private createPaperTexture(uvCoord: TSLNode) {
    const config = MenuConfig.background;
    const paperColor = vec3(config.paperColor.r, config.paperColor.g, config.paperColor.b);

    const noiseScale = float(config.noiseScale);
    const noiseUV = mul(uvCoord, noiseScale);
    const noise = this.valueNoise(noiseUV);

    const stainedPaper = add(paperColor, mul(sub(noise, 0.5), 0.08));

    return { color: stainedPaper, noise };
  }

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

  private applyVignette(uvCoord: TSLNode, color: TSLNode): TSLNode {
    const vignetteColor = MenuConfig.colors.vignette;
    const center = vec2(0.5, 0.5);
    const dist = length(sub(uvCoord, center));
    const vignetteAmount = smoothstep(float(0.2), float(0.8), dist);

    return mix(
      color,
      vec3(vignetteColor.r, vignetteColor.g, vignetteColor.b),
      mul(vignetteAmount, 0.7)
    );
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
