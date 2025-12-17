import * as THREE from 'three/webgpu';
import {
  vec3,
  vec4,
  float,
  uv,
  sin,
  mix,
  smoothstep,
  mul,
  add,
  sub,
  abs,
  clamp,
  pow,
} from 'three/tsl';

// ============================================================================
// TSL Targeting Laser Material - Smooth fade-out aiming laser
// ============================================================================

export class TargetingLaserMaterial {
  /**
   * Creates a targeting laser material with:
   * - Bright core that fades to edges
   * - Smooth fade-out at the far end (no abrupt dot)
   * - Subtle pulse animation
   */
  static create(timeUniform: { value: number }): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial();
    material.transparent = true;
    material.side = THREE.DoubleSide;
    material.depthWrite = false;
    material.blending = THREE.AdditiveBlending;

    const uvCoord = uv();
    const t = timeUniform as unknown as ReturnType<typeof float>;

    // UV.y = along the laser length (0 = near player, 1 = far end)
    // UV.x = across the laser width (0.5 = center)

    // Core brightness - brightest at center (x = 0.5)
    const distFromCenter = abs(sub(uvCoord.x, 0.5));
    const coreFalloff = smoothstep(float(0.5), float(0.0), distFromCenter);
    const coreIntensity = pow(coreFalloff, float(1.5));

    // Smooth fade-out ONLY at far end (high y values) - powerful at start
    const endFade = smoothstep(float(1.0), float(0.5), uvCoord.y);

    // Subtle pulse along the length
    const pulseSpeed = float(8.0);
    const pulseFreq = float(6.0);
    const pulse = add(
      0.95,
      mul(sin(sub(mul(uvCoord.y, pulseFreq), mul(t, pulseSpeed))), 0.05)
    );

    // Combine intensity factors - full power at start, fades at end
    const intensity = mul(mul(coreIntensity, endFade), pulse);

    // Red targeting laser color
    const coreColor = vec3(1.0, 0.3, 0.2); // Bright red
    const edgeColor = vec3(0.8, 0.1, 0.0); // Darker red at edges
    const laserColor = mix(edgeColor, coreColor, coreIntensity);

    // Add hot white-ish center
    const hotCenter = smoothstep(float(0.15), float(0.0), distFromCenter);
    const finalColor = mix(laserColor, vec3(1.0, 0.6, 0.5), mul(hotCenter, 0.3));

    // Final alpha - strong at start
    const alpha = clamp(mul(intensity, 1.5), 0.0, 1.0);

    material.colorNode = vec4(finalColor, alpha);

    return material;
  }

  /**
   * Creates the laser geometry - a flat plane for the targeting laser
   * UV.y goes from 0 (start) to 1 (end) along the length
   */
  static createGeometry(length: number = 15, width: number = 0.15): THREE.PlaneGeometry {
    // Create plane: width along X, length along Y
    // UV coordinates: x = 0-1 across width, y = 0-1 along length
    const geometry = new THREE.PlaneGeometry(width, length, 1, 8);
    // Offset so y=0 is at origin, extends in +Y direction
    geometry.translate(0, length / 2, 0);
    return geometry;
  }
}
