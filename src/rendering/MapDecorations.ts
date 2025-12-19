import * as THREE from 'three/webgpu';

// ============================================================================
// Map Decorations - Props and environmental storytelling
// ============================================================================

// Colors
const MEAT_COLOR = 0x8b4538;
const MEAT_DARK = 0x5c2e25;
const METAL_RUSTY = 0x6b4423;
const METAL_DARK = 0x3a3a3a;
const WOOD_COLOR = 0x5c4033;
const WOOD_DARK = 0x3d2b22;
const BONE_COLOR = 0xd4c5a9;
const BONE_DARK = 0xa89880;
const EXPLOSIVE_RED = 0xaa2222;
const EXPLOSIVE_DARK = 0x661111;
const WARNING_YELLOW = 0xffcc00;

export class MapDecorations {
  private static geometryCache: Map<string, THREE.BufferGeometry> = new Map();
  private static materialCache: Map<string, THREE.Material> = new Map();

  private static initCaches(): void {
    if (this.geometryCache.size > 0) return;

    // Meat grinder parts
    this.geometryCache.set('grinderBody', new THREE.CylinderGeometry(0.5, 0.6, 0.8, 12));
    this.geometryCache.set('grinderFunnel', new THREE.CylinderGeometry(0.6, 0.3, 0.5, 8));
    this.geometryCache.set('grinderSpout', new THREE.CylinderGeometry(0.15, 0.2, 0.4, 8));
    this.geometryCache.set('grinderHandle', new THREE.BoxGeometry(0.08, 0.5, 0.08));
    this.geometryCache.set('grinderCrank', new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6));

    // Meat pile
    this.geometryCache.set('meatBlob', new THREE.SphereGeometry(0.2, 6, 5));
    this.geometryCache.set('meatPile', new THREE.ConeGeometry(0.3, 0.2, 8));

    // Crate
    this.geometryCache.set('crate', new THREE.BoxGeometry(0.8, 0.8, 0.8));
    this.geometryCache.set('crateSlat', new THREE.BoxGeometry(0.82, 0.08, 0.08));

    // Barrel
    this.geometryCache.set('barrel', new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12));
    this.geometryCache.set('barrelRing', new THREE.TorusGeometry(0.36, 0.03, 6, 16));

    // Rat hole
    this.geometryCache.set('holeRim', new THREE.TorusGeometry(0.25, 0.05, 8, 16));

    // Bones
    this.geometryCache.set('bone', new THREE.CapsuleGeometry(0.03, 0.15, 4, 6));
    this.geometryCache.set('skull', new THREE.SphereGeometry(0.12, 8, 6));

    // Materials
    this.materialCache.set('meat', new THREE.MeshLambertMaterial({ color: MEAT_COLOR }));
    this.materialCache.set('meatDark', new THREE.MeshLambertMaterial({ color: MEAT_DARK }));
    this.materialCache.set('metalRusty', new THREE.MeshLambertMaterial({ color: METAL_RUSTY }));
    this.materialCache.set('metalDark', new THREE.MeshLambertMaterial({ color: METAL_DARK }));
    this.materialCache.set('wood', new THREE.MeshLambertMaterial({ color: WOOD_COLOR }));
    this.materialCache.set('woodDark', new THREE.MeshLambertMaterial({ color: WOOD_DARK }));
    this.materialCache.set('bone', new THREE.MeshLambertMaterial({ color: BONE_COLOR }));
    this.materialCache.set('boneDark', new THREE.MeshLambertMaterial({ color: BONE_DARK }));
    this.materialCache.set('hole', new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.materialCache.set('explosiveRed', new THREE.MeshLambertMaterial({ color: EXPLOSIVE_RED }));
    this.materialCache.set('explosiveDark', new THREE.MeshLambertMaterial({ color: EXPLOSIVE_DARK }));
    this.materialCache.set('warningYellow', new THREE.MeshLambertMaterial({ color: WARNING_YELLOW }));
  }

  // ============================================================================
  // Meat Grinder Shrine - Centerpiece for cult worship
  // ============================================================================
  static createMeatGrinder(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Wooden base/table
    const tableGeom = new THREE.BoxGeometry(1.4, 0.6, 1.0);
    const table = new THREE.Mesh(tableGeom, this.materialCache.get('wood')!);
    table.position.y = 0.3;
    table.castShadow = true;
    table.receiveShadow = true;
    group.add(table);

    // Table legs
    const legGeom = new THREE.BoxGeometry(0.12, 0.6, 0.12);
    const legPositions = [
      { x: -0.55, z: -0.35 },
      { x: 0.55, z: -0.35 },
      { x: -0.55, z: 0.35 },
      { x: 0.55, z: 0.35 },
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeom, this.materialCache.get('woodDark')!);
      leg.position.set(pos.x, 0.3, pos.z);
      group.add(leg);
    }

    // Grinder body
    const body = new THREE.Mesh(
      this.geometryCache.get('grinderBody')!,
      this.materialCache.get('metalRusty')!
    );
    body.position.set(0, 1.0, 0);
    body.castShadow = true;
    group.add(body);

    // Funnel top
    const funnel = new THREE.Mesh(
      this.geometryCache.get('grinderFunnel')!,
      this.materialCache.get('metalDark')!
    );
    funnel.position.set(0, 1.55, 0);
    funnel.castShadow = true;
    group.add(funnel);

    // Meat chunks in funnel
    for (let i = 0; i < 4; i++) {
      const chunk = new THREE.Mesh(
        this.geometryCache.get('meatBlob')!,
        this.materialCache.get('meat')!
      );
      chunk.position.set(
        (Math.random() - 0.5) * 0.3,
        1.5 + Math.random() * 0.2,
        (Math.random() - 0.5) * 0.3
      );
      chunk.scale.setScalar(0.6 + Math.random() * 0.4);
      group.add(chunk);
    }

    // Output spout
    const spout = new THREE.Mesh(
      this.geometryCache.get('grinderSpout')!,
      this.materialCache.get('metalRusty')!
    );
    spout.position.set(0.5, 0.8, 0);
    spout.rotation.z = -Math.PI / 4;
    group.add(spout);

    // Handle
    const handle = new THREE.Mesh(
      this.geometryCache.get('grinderHandle')!,
      this.materialCache.get('metalDark')!
    );
    handle.position.set(-0.55, 1.2, 0);
    group.add(handle);

    // Crank arm
    const crank = new THREE.Mesh(
      this.geometryCache.get('grinderCrank')!,
      this.materialCache.get('metalDark')!
    );
    crank.position.set(-0.55, 1.45, 0);
    crank.rotation.z = Math.PI / 2;
    group.add(crank);

    // Output meat pile
    const outputPile = this.createMeatPile(0.7, 0.15, 0);
    group.add(outputPile);

    // Dripping effect (static drips)
    for (let i = 0; i < 3; i++) {
      const drip = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 4),
        this.materialCache.get('meatDark')!
      );
      drip.position.set(0.6 + i * 0.05, 0.5 - i * 0.15, (Math.random() - 0.5) * 0.1);
      group.add(drip);
    }

    group.userData.mapObject = true;
    group.userData.isGrinder = true;

    return group;
  }

  // ============================================================================
  // Meat Pile - Small floor decoration
  // ============================================================================
  static createMeatPile(x: number, y: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Base pile
    const base = new THREE.Mesh(
      this.geometryCache.get('meatPile')!,
      this.materialCache.get('meat')!
    );
    base.rotation.x = Math.PI; // Flip cone
    base.position.y = 0.1;
    group.add(base);

    // Random blobs on top
    const blobCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < blobCount; i++) {
      const blob = new THREE.Mesh(
        this.geometryCache.get('meatBlob')!,
        Math.random() > 0.5 ? this.materialCache.get('meat')! : this.materialCache.get('meatDark')!
      );
      blob.position.set(
        (Math.random() - 0.5) * 0.25,
        0.05 + Math.random() * 0.1,
        (Math.random() - 0.5) * 0.25
      );
      blob.scale.setScalar(0.4 + Math.random() * 0.4);
      group.add(blob);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Wooden Crate
  // ============================================================================
  static createCrate(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0.4, z);
    group.rotation.y = Math.random() * Math.PI * 2;

    // Main body
    const body = new THREE.Mesh(
      this.geometryCache.get('crate')!,
      this.materialCache.get('wood')!
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Slats
    const slatGeom = this.geometryCache.get('crateSlat')!;
    const slatMat = this.materialCache.get('woodDark')!;
    for (const y of [-0.3, 0, 0.3]) {
      const slat = new THREE.Mesh(slatGeom, slatMat);
      slat.position.set(0, y, 0.41);
      group.add(slat);

      const slatBack = new THREE.Mesh(slatGeom, slatMat);
      slatBack.position.set(0, y, -0.41);
      group.add(slatBack);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Barrel
  // ============================================================================
  static createBarrel(x: number, z: number, tipped: boolean = false): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, tipped ? 0.35 : 0.45, z);

    if (tipped) {
      group.rotation.z = Math.PI / 2;
      group.rotation.y = Math.random() * Math.PI * 2;
    }

    // Main body
    const body = new THREE.Mesh(
      this.geometryCache.get('barrel')!,
      this.materialCache.get('wood')!
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Metal rings
    const ringMat = this.materialCache.get('metalRusty')!;
    for (const y of [-0.35, 0, 0.35]) {
      const ring = new THREE.Mesh(this.geometryCache.get('barrelRing')!, ringMat);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Explosive Barrel - Shootable hazard
  // ============================================================================
  static createExplosiveBarrel(x: number, z: number, barrelId: string): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0.45, z);

    // Main body (red)
    const body = new THREE.Mesh(
      this.geometryCache.get('barrel')!,
      this.materialCache.get('explosiveRed')!
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Metal rings (darker)
    const ringMat = this.materialCache.get('explosiveDark')!;
    for (const y of [-0.35, 0, 0.35]) {
      const ring = new THREE.Mesh(this.geometryCache.get('barrelRing')!, ringMat);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    // Warning symbol (simple triangle)
    const warningGeom = new THREE.BufferGeometry();
    const triangleSize = 0.2;
    const positions = new Float32Array([
      0, triangleSize, 0,
      -triangleSize * 0.866, -triangleSize * 0.5, 0,
      triangleSize * 0.866, -triangleSize * 0.5, 0
    ]);
    warningGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    warningGeom.computeVertexNormals();

    // Warning on front
    const warningFront = new THREE.Mesh(
      warningGeom,
      this.materialCache.get('warningYellow')!
    );
    warningFront.position.set(0, 0, 0.36);
    group.add(warningFront);

    // Warning on back
    const warningBack = new THREE.Mesh(
      warningGeom,
      this.materialCache.get('warningYellow')!
    );
    warningBack.position.set(0, 0, -0.36);
    warningBack.rotation.y = Math.PI;
    group.add(warningBack);

    // Glow effect (subtle point light)
    const glow = new THREE.PointLight(0xff4400, 0.3, 3);
    glow.position.y = 0.5;
    group.add(glow);

    group.userData.mapObject = true;
    group.userData.isExplosiveBarrel = true;
    group.userData.barrelId = barrelId;

    return group;
  }

  // ============================================================================
  // Rat Hole - Enemy spawn point visual
  // ============================================================================
  static createRatHole(x: number, z: number, wallDirection: 'x' | 'z', sign: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();

    // Position against wall
    const offsetX = wallDirection === 'x' ? sign * 0.48 : 0;
    const offsetZ = wallDirection === 'z' ? sign * 0.48 : 0;
    group.position.set(x + offsetX, 0.3, z + offsetZ);

    // Rotate to face outward
    if (wallDirection === 'x') {
      group.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      group.rotation.y = sign > 0 ? Math.PI : 0;
    }

    // Dark hole (flat circle)
    const holeGeom = new THREE.CircleGeometry(0.22, 12);
    const hole = new THREE.Mesh(holeGeom, this.materialCache.get('hole')!);
    hole.rotation.y = Math.PI / 2;
    hole.position.x = 0.01;
    group.add(hole);

    // Rim around hole
    const rim = new THREE.Mesh(
      this.geometryCache.get('holeRim')!,
      this.materialCache.get('woodDark')!
    );
    rim.rotation.y = Math.PI / 2;
    group.add(rim);

    // Scratch marks around hole
    const scratchMat = this.materialCache.get('boneDark')!;
    for (let i = 0; i < 5; i++) {
      const scratch = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.15, 0.02),
        scratchMat
      );
      const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.3;
      scratch.position.set(
        0.02,
        Math.sin(angle) * 0.28,
        Math.cos(angle) * 0.28
      );
      scratch.rotation.x = angle + Math.PI / 2;
      group.add(scratch);
    }

    group.userData.mapObject = true;
    group.userData.isRatHole = true;

    return group;
  }

  // ============================================================================
  // Bone Pile
  // ============================================================================
  static createBonePile(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const boneMat = this.materialCache.get('bone')!;
    const boneDarkMat = this.materialCache.get('boneDark')!;

    // Scattered bones
    const boneCount = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < boneCount; i++) {
      const bone = new THREE.Mesh(
        this.geometryCache.get('bone')!,
        Math.random() > 0.3 ? boneMat : boneDarkMat
      );
      bone.position.set(
        (Math.random() - 0.5) * 0.5,
        0.03,
        (Math.random() - 0.5) * 0.5
      );
      bone.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2,
        Math.PI / 2
      );
      bone.scale.setScalar(0.7 + Math.random() * 0.6);
      group.add(bone);
    }

    // Maybe add a skull
    if (Math.random() > 0.5) {
      const skull = new THREE.Mesh(
        this.geometryCache.get('skull')!,
        boneMat
      );
      skull.position.set(
        (Math.random() - 0.5) * 0.3,
        0.08,
        (Math.random() - 0.5) * 0.3
      );
      skull.rotation.y = Math.random() * Math.PI * 2;
      // Slightly squashed for rat skull
      skull.scale.set(1, 0.8, 1.2);
      group.add(skull);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Ritual Circle - Glowing floor pattern
  // ============================================================================
  static createRitualCircle(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0.02, z);

    // Outer ring
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.3, 32),
      new THREE.MeshBasicMaterial({
        color: 0x660022,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      })
    );
    outerRing.rotation.x = -Math.PI / 2;
    group.add(outerRing);

    // Inner ring
    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.7, 32),
      new THREE.MeshBasicMaterial({
        color: 0x880033,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      })
    );
    innerRing.rotation.x = -Math.PI / 2;
    group.add(innerRing);

    // Pentagram lines (simplified as crossing lines)
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xaa0044,
      transparent: true,
      opacity: 0.4
    });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const nextAngle = ((i + 2) / 5) * Math.PI * 2 - Math.PI / 2;

      const lineGeom = new THREE.BufferGeometry();
      const positions = new Float32Array([
        Math.cos(angle) * 1.1, 0.01, Math.sin(angle) * 1.1,
        Math.cos(nextAngle) * 1.1, 0.01, Math.sin(nextAngle) * 1.1
      ]);
      lineGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const line = new THREE.Line(lineGeom, lineMat);
      group.add(line);
    }

    // Center glow
    const centerGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 16),
      new THREE.MeshBasicMaterial({
        color: 0xff2266,
        transparent: true,
        opacity: 0.3
      })
    );
    centerGlow.rotation.x = -Math.PI / 2;
    centerGlow.position.y = 0.01;
    group.add(centerGlow);

    group.userData.mapObject = true;
    group.userData.isRitualCircle = true;

    return group;
  }

  // ============================================================================
  // Candle Cluster - Group of flickering candles for shrines
  // ============================================================================
  static createCandleCluster(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const candlePositions = [
      { dx: 0, dz: 0, height: 0.35 },
      { dx: 0.15, dz: 0.1, height: 0.25 },
      { dx: -0.12, dz: 0.12, height: 0.3 },
      { dx: 0.08, dz: -0.15, height: 0.2 },
      { dx: -0.1, dz: -0.08, height: 0.28 },
    ];

    const candleMat = new THREE.MeshLambertMaterial({ color: 0xd4a574 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

    for (const pos of candlePositions) {
      // Candle body
      const candleGeom = new THREE.CylinderGeometry(0.04, 0.05, pos.height, 6);
      const candle = new THREE.Mesh(candleGeom, candleMat);
      candle.position.set(pos.dx, pos.height / 2, pos.dz);
      group.add(candle);

      // Flame
      const flameGeom = new THREE.ConeGeometry(0.03, 0.08, 5);
      const flame = new THREE.Mesh(flameGeom, flameMat);
      flame.position.set(pos.dx, pos.height + 0.04, pos.dz);
      group.add(flame);
    }

    // Small point light
    const light = new THREE.PointLight(0xff8844, 0.4, 5);
    light.position.y = 0.4;
    group.add(light);

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Blood Pool - Dried blood decal on floor
  // ============================================================================
  static createBloodPool(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0.01, z);

    // Main pool (irregular shape using multiple circles)
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0x4a1010,
      transparent: true,
      opacity: 0.7,
    });

    // Large center
    const mainPool = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 12),
      poolMat
    );
    mainPool.rotation.x = -Math.PI / 2;
    group.add(mainPool);

    // Smaller splatter spots
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 0.3 + Math.random() * 0.2;
      const size = 0.1 + Math.random() * 0.15;

      const splat = new THREE.Mesh(
        new THREE.CircleGeometry(size, 8),
        poolMat
      );
      splat.rotation.x = -Math.PI / 2;
      splat.position.set(
        Math.cos(angle) * dist,
        0.001,
        Math.sin(angle) * dist
      );
      group.add(splat);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Crate Stack - Stacked crates for storage rooms
  // ============================================================================
  static createCrateStack(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;

    const woodMat = this.materialCache.get('wood')!;
    const woodDarkMat = this.materialCache.get('woodDark')!;

    // Base crate (larger)
    const baseCrate = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.9, 1.0),
      woodMat
    );
    baseCrate.position.y = 0.45;
    baseCrate.castShadow = true;
    group.add(baseCrate);

    // Top crate (smaller, offset)
    const topCrate = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      woodDarkMat
    );
    topCrate.position.set(0.1, 1.25, -0.1);
    topCrate.rotation.y = 0.3;
    topCrate.castShadow = true;
    group.add(topCrate);

    // Maybe a third small crate
    if (Math.random() > 0.5) {
      const smallCrate = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        woodMat
      );
      smallCrate.position.set(-0.3, 1.15, 0.2);
      smallCrate.rotation.y = -0.5;
      smallCrate.castShadow = true;
      group.add(smallCrate);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Debris Cluster - Rubble and debris for nest rooms
  // ============================================================================
  static createDebrisCluster(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const debrisMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
    const debrisDarkMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });

    // Scattered debris pieces
    const debrisCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < debrisCount; i++) {
      const size = 0.08 + Math.random() * 0.15;
      const debris = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.5, size * 0.8),
        Math.random() > 0.5 ? debrisMat : debrisDarkMat
      );
      debris.position.set(
        (Math.random() - 0.5) * 0.6,
        size * 0.25,
        (Math.random() - 0.5) * 0.6
      );
      debris.rotation.set(
        Math.random() * 0.3,
        Math.random() * Math.PI * 2,
        Math.random() * 0.3
      );
      group.add(debris);
    }

    group.userData.mapObject = true;
    return group;
  }
}
