import * as THREE from 'three';

// ============================================================================
// Blurred Emblem Material
// Creates a permanently blurred "meatball" emblem for farshists
// ============================================================================

export class BlurredEmblemMaterial {
  /**
   * Creates a material that renders a blurred meatball emblem
   * The blur effect is baked into the texture, no post-processing needed
   */
  static create(): THREE.MeshBasicMaterial {
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Draw blurred meatball emblem
    this.drawBlurredMeatball(ctx, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  private static drawBlurredMeatball(ctx: CanvasRenderingContext2D, size: number): void {
    const center = size / 2;

    // Clear with transparency
    ctx.clearRect(0, 0, size, size);

    // Apply strong blur via multiple passes with varying opacity
    ctx.filter = 'blur(8px)';

    // Draw the meatball shape (abstract blob)
    const gradient = ctx.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      size / 2.5
    );
    gradient.addColorStop(0, 'rgba(139, 69, 19, 0.8)'); // Brown center
    gradient.addColorStop(0.3, 'rgba(160, 82, 45, 0.7)'); // Sienna
    gradient.addColorStop(0.6, 'rgba(128, 64, 32, 0.5)');
    gradient.addColorStop(1, 'rgba(100, 50, 25, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();

    // Irregular blob shape
    ctx.moveTo(center + 15, center);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 12 + Math.sin(i * 3) * 4;
      ctx.lineTo(
        center + Math.cos(angle) * radius,
        center + Math.sin(angle) * radius
      );
    }
    ctx.closePath();
    ctx.fill();

    // Add some "texture" spots (also blurred)
    ctx.fillStyle = 'rgba(100, 40, 20, 0.6)';
    for (let i = 0; i < 5; i++) {
      const x = center + (Math.random() - 0.5) * 16;
      const y = center + (Math.random() - 0.5) * 16;
      ctx.beginPath();
      ctx.arc(x, y, 2 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reset filter
    ctx.filter = 'none';
  }

  /**
   * Creates a shader-based blur effect (alternative approach)
   */
  static createShaderMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0x8b4513) },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float time;
        varying vec2 vUv;

        // Simple pseudo-random
        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }

        void main() {
          vec2 center = vec2(0.5, 0.5);
          float dist = distance(vUv, center);

          // Blur by sampling multiple points
          vec3 blurredColor = vec3(0.0);
          float total = 0.0;

          for(float x = -2.0; x <= 2.0; x += 1.0) {
            for(float y = -2.0; y <= 2.0; y += 1.0) {
              vec2 offset = vec2(x, y) * 0.05;
              float d = distance(vUv + offset, center);
              float weight = 1.0 - smoothstep(0.0, 0.4, d);
              blurredColor += color * weight;
              total += 1.0;
            }
          }

          blurredColor /= total;

          // Add noise for texture
          float noise = random(vUv + time * 0.001) * 0.1;
          blurredColor += noise - 0.05;

          float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
          alpha *= 0.7; // Make it semi-transparent

          gl_FragColor = vec4(blurredColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }
}
