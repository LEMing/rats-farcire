import * as THREE from 'three/webgpu';
import { MenuConfig } from '../config/MenuConfig';
import { ProceduralMaterials } from '../materials/ProceduralMaterials';

// ============================================================================
// Meatball Factory - Creates meatball meshes with procedural materials
// ============================================================================

export interface MeatballOptions {
  size: number;
  detailed?: boolean;
}

export class MeatballFactory {
  private readonly materials: ProceduralMaterials;
  private readonly config = MenuConfig.meatball;

  constructor(materials: ProceduralMaterials) {
    this.materials = materials;
  }

  /**
   * Creates a meatball mesh group with bumpy texture
   */
  create(options: MeatballOptions): THREE.Group {
    const { size, detailed = false } = options;
    const meatballGroup = new THREE.Group();

    const mainSphere = this.createMainSphere(size, detailed);
    meatballGroup.add(mainSphere);

    const bumps = this.createBumps(size, detailed);
    bumps.forEach((bump) => meatballGroup.add(bump));

    return meatballGroup;
  }

  /**
   * Creates the central display meatball with glow effect
   */
  createCentral(): THREE.Group {
    const config = MenuConfig.centralMeatball;
    const meatball = this.create({ size: config.size, detailed: true });

    const glow = this.createGlow(config.glowSize, config.glowColor, config.glowOpacity);
    meatball.add(glow);

    meatball.position.y = config.positionY;
    return meatball;
  }

  /**
   * Creates multiple floating meatballs for the scene
   */
  createFloatingMeatballs(): FloatingMeatball[] {
    const config = MenuConfig.floatingMeatballs;
    const meatballs: FloatingMeatball[] = [];

    for (let i = 0; i < config.count; i++) {
      const size = this.randomInRange(config.sizeMin, config.sizeMax);
      const meatball = this.create({ size, detailed: false });

      const position = this.randomSpherePosition(config.radiusMin, config.radiusMax);
      meatball.position.copy(position);

      meatballs.push({
        mesh: meatball,
        velocity: this.randomVelocity(config.velocityRange),
        rotationSpeed: this.randomRotationSpeed(config.rotationSpeedRange),
        baseY: position.y,
        phase: Math.random() * Math.PI * 2,
      });
    }

    return meatballs;
  }

  // ---------------------------------------------------------------------------
  // Private helper methods
  // ---------------------------------------------------------------------------

  private createMainSphere(size: number, detailed: boolean): THREE.Mesh {
    const segments = detailed ? 32 : 16;
    const geometry = new THREE.SphereGeometry(size, segments, segments);
    const material = this.materials.createMeatballMaterial();

    return new THREE.Mesh(geometry, material);
  }

  private createBumps(size: number, detailed: boolean): THREE.Mesh[] {
    const bumpCount = detailed ? this.config.detailedBumpCount : this.config.simpleBumpCount;
    const bumps: THREE.Mesh[] = [];

    for (let i = 0; i < bumpCount; i++) {
      const bump = this.createSingleBump(size);
      bumps.push(bump);
    }

    return bumps;
  }

  private createSingleBump(parentSize: number): THREE.Mesh {
    const bumpSizeRange = this.config.bumpSizeMax - this.config.bumpSizeMin;
    const bumpSize = parentSize * (this.config.bumpSizeMin + Math.random() * bumpSizeRange);

    const geometry = new THREE.SphereGeometry(bumpSize, 8, 8);
    const color = Math.random() > 0.5 ? this.config.colors.dark : this.config.colors.medium;
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
    });

    const bump = new THREE.Mesh(geometry, material);
    const position = this.randomSpherePointOnSurface(parentSize * 0.88);
    bump.position.copy(position);

    return bump;
  }

  private createGlow(size: number, color: number, opacity: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
    });

    return new THREE.Mesh(geometry, material);
  }

  private randomSpherePointOnSurface(radius: number): THREE.Vector3 {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );
  }

  private randomSpherePosition(radiusMin: number, radiusMax: number): THREE.Vector3 {
    const radius = this.randomInRange(radiusMin, radiusMax);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta) - 1,
      radius * Math.cos(phi) - 5
    );
  }

  private randomVelocity(range: number): THREE.Vector3 {
    return new THREE.Vector3(
      (Math.random() - 0.5) * range,
      (Math.random() - 0.5) * range * 0.75,
      (Math.random() - 0.5) * range * 0.375
    );
  }

  private randomRotationSpeed(range: number): THREE.Vector3 {
    return new THREE.Vector3(
      Math.random() * range * 0.8,
      Math.random() * range,
      Math.random() * range * 0.5
    );
  }

  private randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}

export interface FloatingMeatball {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  rotationSpeed: THREE.Vector3;
  baseY: number;
  phase: number;
}
