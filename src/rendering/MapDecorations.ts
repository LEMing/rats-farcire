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

    // Larger glow sprite for the whole cluster
    const glowSprite = this.createGlowSprite(1.2, 0xffaa44, 0.5);
    glowSprite.position.set(0, 0.3, 0);
    group.add(glowSprite);

    // Inner brighter glow
    const innerGlow = this.createGlowSprite(0.5, 0xffcc66, 0.6);
    innerGlow.position.set(0, 0.35, 0);
    group.add(innerGlow);

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

  // ============================================================================
  // Small Debris - Single piece for corridors
  // ============================================================================
  static createSmallDebris(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const debrisMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
    const debrisDarkMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

    // 2-3 debris pieces
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const size = 0.06 + Math.random() * 0.1;
      const debris = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.4, size * 0.7),
        Math.random() > 0.5 ? debrisMat : debrisDarkMat
      );
      debris.position.set(
        (Math.random() - 0.5) * 0.3,
        size * 0.2,
        (Math.random() - 0.5) * 0.3
      );
      debris.rotation.y = Math.random() * Math.PI * 2;
      group.add(debris);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Puddle - Water/blood puddle for floor
  // ============================================================================
  static createPuddle(x: number, z: number, isBlood: boolean = false): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0.02, z);

    const color = isBlood ? 0x5a1a1a : 0x2a3a4a;
    const puddleMat = new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: 0.7,
    });

    // Main puddle shape (irregular ellipse)
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(0.25 + Math.random() * 0.15, 12),
      puddleMat
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.scale.set(1, 0.6 + Math.random() * 0.4, 1);
    puddle.rotation.z = Math.random() * Math.PI * 2;
    group.add(puddle);

    // Smaller satellite puddles
    if (Math.random() > 0.5) {
      const small = new THREE.Mesh(
        new THREE.CircleGeometry(0.1 + Math.random() * 0.08, 8),
        puddleMat
      );
      small.rotation.x = -Math.PI / 2;
      small.position.set(
        (Math.random() - 0.5) * 0.4,
        0,
        (Math.random() - 0.5) * 0.4
      );
      group.add(small);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // ZONE-SPECIFIC DECORATIONS - Industrial
  // ============================================================================

  /**
   * Industrial wall pipe - horizontal pipe running along wall
   */
  static createWallPipe(x: number, z: number, direction: 'x' | 'z', length: number = 3): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const pipeMat = this.materialCache.get('metalRusty')!;
    const pipeDarkMat = this.materialCache.get('metalDark')!;

    // Main pipe
    const pipeGeom = new THREE.CylinderGeometry(0.08, 0.08, length, 8);
    const pipe = new THREE.Mesh(pipeGeom, pipeMat);
    pipe.rotation.z = Math.PI / 2;
    if (direction === 'z') pipe.rotation.y = Math.PI / 2;
    pipe.position.y = 0.6;
    group.add(pipe);

    // Pipe joints/brackets
    const bracketGeom = new THREE.TorusGeometry(0.12, 0.03, 6, 12);
    for (let i = 0; i < length; i += 0.8) {
      const bracket = new THREE.Mesh(bracketGeom, pipeDarkMat);
      bracket.position.y = 0.6;
      if (direction === 'x') {
        bracket.position.x = -length / 2 + i;
        bracket.rotation.y = Math.PI / 2;
      } else {
        bracket.position.z = -length / 2 + i;
      }
      group.add(bracket);
    }

    // Valve at random position
    if (Math.random() > 0.5) {
      const valveGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.15, 6);
      const valve = new THREE.Mesh(valveGeom, pipeDarkMat);
      valve.position.y = 0.72;
      valve.position.x = (Math.random() - 0.5) * length * 0.5;
      group.add(valve);

      const wheelGeom = new THREE.TorusGeometry(0.08, 0.02, 6, 8);
      const wheel = new THREE.Mesh(wheelGeom, pipeMat);
      wheel.position.y = 0.82;
      wheel.position.x = valve.position.x;
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
    }

    group.userData.mapObject = true;
    return group;
  }

  /**
   * Industrial ceiling lamp - hanging industrial light
   */
  static createIndustrialLamp(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const metalMat = this.materialCache.get('metalDark')!;

    // Chain/wire hanging down
    const wireGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4);
    const wire = new THREE.Mesh(wireGeom, metalMat);
    wire.position.y = 1.6;
    group.add(wire);

    // Lamp housing (cone)
    const housingGeom = new THREE.ConeGeometry(0.25, 0.3, 8, 1, true);
    const housing = new THREE.Mesh(housingGeom, metalMat);
    housing.position.y = 1.1;
    housing.rotation.x = Math.PI;
    group.add(housing);

    // Bulb (bright sphere)
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
    const bulbGeom = new THREE.SphereGeometry(0.08, 8, 6);
    const bulb = new THREE.Mesh(bulbGeom, bulbMat);
    bulb.position.y = 1.0;
    group.add(bulb);

    // Glow sprite
    const glow = this.createGlowSprite(1.5, 0xffdd88, 0.4);
    glow.position.y = 1.0;
    group.add(glow);

    group.userData.mapObject = true;
    return group;
  }

  /**
   * Metal debris - scattered metal pieces
   */
  static createMetalDebris(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const metalMat = this.materialCache.get('metalDark')!;
    const rustyMat = this.materialCache.get('metalRusty')!;

    // Scattered metal pieces
    const pieceCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pieceCount; i++) {
      const sizeX = 0.1 + Math.random() * 0.15;
      const sizeY = 0.02 + Math.random() * 0.05;
      const sizeZ = 0.08 + Math.random() * 0.12;
      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(sizeX, sizeY, sizeZ),
        Math.random() > 0.5 ? metalMat : rustyMat
      );
      piece.position.set(
        (Math.random() - 0.5) * 0.5,
        sizeY / 2,
        (Math.random() - 0.5) * 0.5
      );
      piece.rotation.y = Math.random() * Math.PI * 2;
      piece.rotation.x = (Math.random() - 0.5) * 0.3;
      group.add(piece);
    }

    // Maybe a bolt or screw
    if (Math.random() > 0.5) {
      const boltGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6);
      const bolt = new THREE.Mesh(boltGeom, metalMat);
      bolt.position.set(
        (Math.random() - 0.5) * 0.3,
        0.04,
        (Math.random() - 0.5) * 0.3
      );
      bolt.rotation.z = Math.PI / 2;
      group.add(bolt);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // ZONE-SPECIFIC DECORATIONS - Ritual
  // ============================================================================

  /**
   * Crystal cluster - glowing purple crystals
   */
  static createCrystalCluster(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const crystalMat = new THREE.MeshBasicMaterial({
      color: 0x8844aa,
      transparent: true,
      opacity: 0.8,
    });
    const crystalDarkMat = new THREE.MeshBasicMaterial({
      color: 0x5522aa,
      transparent: true,
      opacity: 0.7,
    });

    // Multiple crystals
    const crystalCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < crystalCount; i++) {
      const height = 0.2 + Math.random() * 0.3;
      const radius = 0.04 + Math.random() * 0.04;
      const crystalGeom = new THREE.ConeGeometry(radius, height, 4);
      const crystal = new THREE.Mesh(
        crystalGeom,
        Math.random() > 0.5 ? crystalMat : crystalDarkMat
      );
      crystal.position.set(
        (Math.random() - 0.5) * 0.3,
        height / 2,
        (Math.random() - 0.5) * 0.3
      );
      // Slight random tilt
      crystal.rotation.x = (Math.random() - 0.5) * 0.3;
      crystal.rotation.z = (Math.random() - 0.5) * 0.3;
      group.add(crystal);
    }

    // Glow effect
    const glow = this.createGlowSprite(0.8, 0x8844aa, 0.4);
    glow.position.y = 0.25;
    group.add(glow);

    group.userData.mapObject = true;
    return group;
  }

  /**
   * Arcane floor symbol - glowing rune on floor
   */
  static createArcaneSymbol(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0.02, z);

    const runeMat = new THREE.MeshBasicMaterial({
      color: 0xaa44ff,
      transparent: true,
      opacity: 0.5,
    });

    // Outer circle
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.45, 16),
      runeMat
    );
    outerRing.rotation.x = -Math.PI / 2;
    group.add(outerRing);

    // Cross pattern inside
    const barGeom = new THREE.PlaneGeometry(0.7, 0.05);
    const bar1 = new THREE.Mesh(barGeom, runeMat);
    bar1.rotation.x = -Math.PI / 2;
    bar1.position.y = 0.001;
    group.add(bar1);

    const bar2 = new THREE.Mesh(barGeom, runeMat);
    bar2.rotation.x = -Math.PI / 2;
    bar2.rotation.z = Math.PI / 2;
    bar2.position.y = 0.001;
    group.add(bar2);

    // Corner dots
    const dotGeom = new THREE.CircleGeometry(0.05, 8);
    const dotPositions = [
      { x: 0.25, z: 0.25 },
      { x: -0.25, z: 0.25 },
      { x: 0.25, z: -0.25 },
      { x: -0.25, z: -0.25 },
    ];
    for (const pos of dotPositions) {
      const dot = new THREE.Mesh(dotGeom, runeMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(pos.x, 0.002, pos.z);
      group.add(dot);
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // ZONE-SPECIFIC DECORATIONS - Organic
  // ============================================================================

  /**
   * Mushroom cluster - glowing organic mushrooms
   */
  static createMushroomCluster(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const stemMat = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
    const capMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
    const glowCapMat = new THREE.MeshBasicMaterial({
      color: 0x88ff88,
      transparent: true,
      opacity: 0.8,
    });

    // Multiple mushrooms
    const mushroomCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < mushroomCount; i++) {
      const stemHeight = 0.1 + Math.random() * 0.15;
      const capRadius = 0.06 + Math.random() * 0.06;
      const isGlowing = Math.random() > 0.6;

      // Stem
      const stemGeom = new THREE.CylinderGeometry(0.02, 0.03, stemHeight, 6);
      const stem = new THREE.Mesh(stemGeom, stemMat);
      stem.position.set(
        (Math.random() - 0.5) * 0.3,
        stemHeight / 2,
        (Math.random() - 0.5) * 0.3
      );
      group.add(stem);

      // Cap
      const capGeom = new THREE.SphereGeometry(capRadius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const cap = new THREE.Mesh(capGeom, isGlowing ? glowCapMat : capMat);
      cap.position.set(stem.position.x, stemHeight + capRadius * 0.3, stem.position.z);
      group.add(cap);
    }

    // Subtle glow
    const glow = this.createGlowSprite(0.5, 0x88ff88, 0.2);
    glow.position.y = 0.15;
    group.add(glow);

    group.userData.mapObject = true;
    return group;
  }

  /**
   * Rat egg sac - creepy organic nest element
   */
  static createEggSac(x: number, z: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const sacMat = new THREE.MeshLambertMaterial({
      color: 0x9b7b6b,
      transparent: true,
      opacity: 0.9,
    });
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffddcc,
      transparent: true,
      opacity: 0.4,
    });

    // Main sac (oval shape)
    const sacGeom = new THREE.SphereGeometry(0.2, 8, 6);
    const sac = new THREE.Mesh(sacGeom, sacMat);
    sac.position.y = 0.18;
    sac.scale.set(1, 0.8, 1);
    group.add(sac);

    // Inner glow/eggs visible
    const innerGeom = new THREE.SphereGeometry(0.12, 6, 4);
    const inner = new THREE.Mesh(innerGeom, innerMat);
    inner.position.y = 0.18;
    group.add(inner);

    // Web strands connecting to ground
    const webMat = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.3,
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const webGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.25, 4);
      const web = new THREE.Mesh(webGeom, webMat);
      web.position.set(
        Math.cos(angle) * 0.15,
        0.08,
        Math.sin(angle) * 0.15
      );
      web.rotation.x = Math.cos(angle) * 0.5;
      web.rotation.z = Math.sin(angle) * 0.5;
      group.add(web);
    }

    group.userData.mapObject = true;
    return group;
  }

  /**
   * Wall vines - organic growth on walls
   */
  static createWallVines(x: number, z: number, direction: 'x' | 'z', sign: number): THREE.Group {
    this.initCaches();
    const group = new THREE.Group();

    const offsetX = direction === 'x' ? sign * 0.45 : 0;
    const offsetZ = direction === 'z' ? sign * 0.45 : 0;
    group.position.set(x + offsetX, 0, z + offsetZ);

    if (direction === 'x') {
      group.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      group.rotation.y = sign > 0 ? Math.PI : 0;
    }

    const vineMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3d7a37 });

    // Main vines (wavy vertical lines)
    const vineCount = 2 + Math.floor(Math.random() * 2);
    for (let v = 0; v < vineCount; v++) {
      const startX = (Math.random() - 0.5) * 0.4;
      const segments = 4 + Math.floor(Math.random() * 3);

      for (let i = 0; i < segments; i++) {
        const segmentGeom = new THREE.CylinderGeometry(0.015, 0.02, 0.2, 4);
        const segment = new THREE.Mesh(segmentGeom, vineMat);
        segment.position.set(
          startX + Math.sin(i * 0.5) * 0.08,
          0.1 + i * 0.18,
          0
        );
        segment.rotation.z = Math.sin(i * 0.7) * 0.3;
        group.add(segment);

        // Random leaves
        if (Math.random() > 0.6) {
          const leafGeom = new THREE.CircleGeometry(0.05, 5);
          const leaf = new THREE.Mesh(leafGeom, leafMat);
          leaf.position.set(
            segment.position.x + (Math.random() > 0.5 ? 0.06 : -0.06),
            segment.position.y,
            0.02
          );
          leaf.rotation.y = Math.random() * Math.PI;
          group.add(leaf);
        }
      }
    }

    group.userData.mapObject = true;
    return group;
  }

  // ============================================================================
  // Glow Sprite - Cheap glow effect using additive blending
  // ============================================================================
  static createGlowSprite(size: number, color: number, opacity: number): THREE.Sprite {
    // Create a canvas for the glow texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Create radial gradient for soft glow
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);

    // Extract RGB from color
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;

    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.5)`);
    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.2)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);

    // Create sprite material with additive blending
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(size, size, 1);

    return sprite;
  }
}
