import * as THREE from 'three/webgpu';

// ============================================================================
// TARDIS Factory - Creates the iconic Police Box
// ============================================================================

// TARDIS Colors
const TARDIS_BLUE = 0x003b6f;
const TARDIS_BLUE_DARK = 0x002850;
const TARDIS_BLUE_LIGHT = 0x1e5799;
const SIGN_WHITE = 0xf0f0e8;
const SIGN_BLACK = 0x111111;
const WINDOW_GLOW = 0xffaa44;
const LAMP_COLOR = 0xffffff;
const WOOD_TRIM = 0x002244;

export interface TardisInstance {
  group: THREE.Group;
  lamp: THREE.Mesh;
  lampLight: THREE.PointLight;
  doors: THREE.Group;
  materializing: boolean;
  materializeProgress: number;
}

export class TardisFactory {
  private static geometry: Map<string, THREE.BufferGeometry> = new Map();
  private static materials: Map<string, THREE.Material> = new Map();

  static create(position: THREE.Vector3): TardisInstance {
    this.initGeometryCache();
    this.initMaterialCache();

    const group = new THREE.Group();
    group.position.copy(position);

    // Base platform
    const base = this.createBase();
    group.add(base);

    // Main body (4 walls)
    const body = this.createBody();
    group.add(body);

    // Doors (separate for animation)
    const doors = this.createDoors();
    group.add(doors);

    // Sign boxes on top
    const signs = this.createSignBoxes();
    group.add(signs);

    // Roof
    const roof = this.createRoof();
    group.add(roof);

    // Lamp on top
    const { lamp, light } = this.createLamp();
    group.add(lamp);
    group.add(light);

    // Windows glow
    const windowGlow = this.createWindowGlow();
    group.add(windowGlow);

    group.userData.isTardis = true;

    return {
      group,
      lamp,
      lampLight: light,
      doors,
      materializing: false,
      materializeProgress: 1,
    };
  }

  private static initGeometryCache(): void {
    if (this.geometry.size > 0) return;

    // Base
    this.geometry.set('base', new THREE.BoxGeometry(2.2, 0.15, 2.2));

    // Main panel
    this.geometry.set('panel', new THREE.BoxGeometry(1.9, 2.8, 0.1));

    // Panel frame (vertical)
    this.geometry.set('frameV', new THREE.BoxGeometry(0.08, 2.8, 0.12));

    // Panel frame (horizontal)
    this.geometry.set('frameH', new THREE.BoxGeometry(1.9, 0.08, 0.12));

    // Window pane
    this.geometry.set('window', new THREE.BoxGeometry(0.35, 0.35, 0.05));

    // Door
    this.geometry.set('door', new THREE.BoxGeometry(0.8, 2.4, 0.08));

    // Sign box
    this.geometry.set('signBox', new THREE.BoxGeometry(2.0, 0.35, 0.5));

    // Roof base
    this.geometry.set('roofBase', new THREE.BoxGeometry(2.1, 0.1, 2.1));

    // Roof pyramid
    this.geometry.set('roofTop', new THREE.BoxGeometry(1.6, 0.15, 1.6));

    // Lamp base
    this.geometry.set('lampBase', new THREE.CylinderGeometry(0.12, 0.15, 0.1, 8));

    // Lamp globe
    this.geometry.set('lampGlobe', new THREE.SphereGeometry(0.15, 12, 8));

    // Door handle
    this.geometry.set('handle', new THREE.SphereGeometry(0.04, 6, 6));
  }

  private static initMaterialCache(): void {
    if (this.materials.size > 0) return;

    this.materials.set('blue', new THREE.MeshLambertMaterial({ color: TARDIS_BLUE }));
    this.materials.set('blueDark', new THREE.MeshLambertMaterial({ color: TARDIS_BLUE_DARK }));
    this.materials.set('blueLight', new THREE.MeshLambertMaterial({ color: TARDIS_BLUE_LIGHT }));
    this.materials.set('trim', new THREE.MeshLambertMaterial({ color: WOOD_TRIM }));
    this.materials.set('signWhite', new THREE.MeshLambertMaterial({ color: SIGN_WHITE }));
    this.materials.set('signBlack', new THREE.MeshLambertMaterial({ color: SIGN_BLACK }));
    this.materials.set('window', new THREE.MeshBasicMaterial({
      color: WINDOW_GLOW,
      transparent: true,
      opacity: 0.6,
    }));
    this.materials.set('lamp', new THREE.MeshBasicMaterial({
      color: LAMP_COLOR,
      transparent: true,
      opacity: 0.9,
    }));
    this.materials.set('handle', new THREE.MeshLambertMaterial({ color: 0x888888 }));
  }

  private static createBase(): THREE.Mesh {
    const base = new THREE.Mesh(
      this.geometry.get('base')!,
      this.materials.get('blueDark')!
    );
    base.position.y = 0.075;
    base.castShadow = true;
    base.receiveShadow = true;
    return base;
  }

  private static createBody(): THREE.Group {
    const body = new THREE.Group();
    const panelGeom = this.geometry.get('panel')!;
    const frameVGeom = this.geometry.get('frameV')!;
    const frameHGeom = this.geometry.get('frameH')!;
    const blueMat = this.materials.get('blue')!;
    const trimMat = this.materials.get('trim')!;

    // 4 walls (back, left, right - front has doors)
    const wallPositions = [
      { x: 0, z: -0.95, ry: 0 },        // Back
      { x: -0.95, z: 0, ry: Math.PI / 2 }, // Left
      { x: 0.95, z: 0, ry: -Math.PI / 2 }, // Right
    ];

    for (const pos of wallPositions) {
      // Main panel
      const panel = new THREE.Mesh(panelGeom, blueMat);
      panel.position.set(pos.x, 1.55, pos.z);
      panel.rotation.y = pos.ry;
      panel.castShadow = true;
      body.add(panel);

      // Vertical frames
      for (const fx of [-0.85, 0, 0.85]) {
        const frame = new THREE.Mesh(frameVGeom, trimMat);
        frame.position.set(
          pos.x + (pos.ry === 0 ? fx : 0),
          1.55,
          pos.z + (pos.ry !== 0 ? fx * (pos.x < 0 ? -1 : 1) : 0)
        );
        frame.rotation.y = pos.ry;
        body.add(frame);
      }

      // Horizontal frames
      for (const fy of [0.25, 1.1, 1.95, 2.8]) {
        const frame = new THREE.Mesh(frameHGeom, trimMat);
        frame.position.set(pos.x, fy + 0.15, pos.z);
        frame.rotation.y = pos.ry;
        body.add(frame);
      }

      // Windows (2x2 grid on each panel top section)
      this.addWindowsToWall(body, pos.x, pos.z, pos.ry);
    }

    return body;
  }

  private static addWindowsToWall(parent: THREE.Group, wx: number, wz: number, ry: number): void {
    const windowGeom = this.geometry.get('window')!;
    const windowMat = this.materials.get('window')!;

    // 2x2 window grid in upper section
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const window = new THREE.Mesh(windowGeom, windowMat);
        const offsetX = (col - 0.5) * 0.5;
        const offsetY = 2.2 + (1 - row) * 0.5;

        if (ry === 0) {
          window.position.set(wx + offsetX, offsetY, wz - 0.02);
        } else {
          const sign = wx < 0 ? 1 : -1;
          window.position.set(wx - 0.02 * sign, offsetY, wz + offsetX * sign);
        }
        window.rotation.y = ry;
        parent.add(window);
      }
    }
  }

  private static createDoors(): THREE.Group {
    const doors = new THREE.Group();
    const doorGeom = this.geometry.get('door')!;
    const frameVGeom = this.geometry.get('frameV')!;
    const blueMat = this.materials.get('blue')!;
    const trimMat = this.materials.get('trim')!;
    const handleMat = this.materials.get('handle')!;

    // Left door
    const leftDoor = new THREE.Mesh(doorGeom, blueMat);
    leftDoor.position.set(-0.42, 1.35, 0.95);
    leftDoor.castShadow = true;
    doors.add(leftDoor);

    // Right door
    const rightDoor = new THREE.Mesh(doorGeom, blueMat);
    rightDoor.position.set(0.42, 1.35, 0.95);
    rightDoor.castShadow = true;
    doors.add(rightDoor);

    // Door frames
    for (const x of [-0.85, 0, 0.85]) {
      const frame = new THREE.Mesh(frameVGeom, trimMat);
      frame.position.set(x, 1.55, 0.96);
      doors.add(frame);
    }

    // Horizontal door frames
    for (const y of [0.25, 2.55]) {
      const frameH = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.08, 0.12),
        trimMat
      );
      frameH.position.set(0, y, 0.96);
      doors.add(frameH);
    }

    // Door windows (smaller, 2x1 on each door)
    const windowGeom = this.geometry.get('window')!;
    const windowMat = this.materials.get('window')!;

    for (const dx of [-0.42, 0.42]) {
      for (let row = 0; row < 2; row++) {
        const window = new THREE.Mesh(windowGeom, windowMat);
        window.position.set(dx, 2.0 + (1 - row) * 0.45, 1.0);
        doors.add(window);
      }
    }

    // Door handles
    const handleGeom = this.geometry.get('handle')!;
    const leftHandle = new THREE.Mesh(handleGeom, handleMat);
    leftHandle.position.set(-0.15, 1.3, 1.02);
    doors.add(leftHandle);

    const rightHandle = new THREE.Mesh(handleGeom, handleMat);
    rightHandle.position.set(0.15, 1.3, 1.02);
    doors.add(rightHandle);

    return doors;
  }

  private static createSignBoxes(): THREE.Group {
    const signs = new THREE.Group();
    const signGeom = this.geometry.get('signBox')!;
    const whiteMat = this.materials.get('signWhite')!;
    const blackMat = this.materials.get('signBlack')!;

    // Sign boxes on all 4 sides
    const signY = 3.05;
    const positions = [
      { x: 0, z: 0.75, ry: 0 },
      { x: 0, z: -0.75, ry: Math.PI },
      { x: 0.75, z: 0, ry: Math.PI / 2 },
      { x: -0.75, z: 0, ry: -Math.PI / 2 },
    ];

    for (const pos of positions) {
      // Black background
      const signBg = new THREE.Mesh(signGeom, blackMat);
      signBg.position.set(pos.x, signY, pos.z);
      signBg.rotation.y = pos.ry;
      signs.add(signBg);

      // White "POLICE BOX" text panel (simplified)
      const textPanel = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.25, 0.02),
        whiteMat
      );
      const offset = pos.ry === 0 ? 0.26 : (pos.ry === Math.PI ? -0.26 : 0);
      const offsetX = pos.ry === Math.PI / 2 ? 0.26 : (pos.ry === -Math.PI / 2 ? -0.26 : 0);
      textPanel.position.set(pos.x + offsetX, signY, pos.z + offset);
      textPanel.rotation.y = pos.ry;
      signs.add(textPanel);
    }

    return signs;
  }

  private static createRoof(): THREE.Group {
    const roof = new THREE.Group();
    const blueMat = this.materials.get('blue')!;

    // Roof base
    const roofBase = new THREE.Mesh(this.geometry.get('roofBase')!, blueMat);
    roofBase.position.y = 3.3;
    roofBase.castShadow = true;
    roof.add(roofBase);

    // Stepped roof
    const roofMid = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.1, 1.8),
      blueMat
    );
    roofMid.position.y = 3.4;
    roof.add(roofMid);

    const roofTop = new THREE.Mesh(this.geometry.get('roofTop')!, blueMat);
    roofTop.position.y = 3.5;
    roof.add(roofTop);

    // Corner posts
    const postGeom = new THREE.BoxGeometry(0.15, 0.4, 0.15);
    for (const x of [-0.9, 0.9]) {
      for (const z of [-0.9, 0.9]) {
        const post = new THREE.Mesh(postGeom, blueMat);
        post.position.set(x, 3.45, z);
        roof.add(post);
      }
    }

    return roof;
  }

  private static createLamp(): { lamp: THREE.Mesh; light: THREE.PointLight } {
    const lampGroup = new THREE.Group();

    // Lamp base
    const base = new THREE.Mesh(
      this.geometry.get('lampBase')!,
      this.materials.get('blueDark')!
    );
    base.position.y = 3.6;
    lampGroup.add(base);

    // Lamp globe
    const lamp = new THREE.Mesh(
      this.geometry.get('lampGlobe')!,
      this.materials.get('lamp')!
    );
    lamp.position.y = 3.75;

    // Point light for glow effect
    const light = new THREE.PointLight(LAMP_COLOR, 0.8, 8);
    light.position.y = 3.75;

    return { lamp, light };
  }

  private static createWindowGlow(): THREE.PointLight {
    // Interior glow visible through windows
    const glow = new THREE.PointLight(WINDOW_GLOW, 0.3, 4);
    glow.position.set(0, 1.8, 0);
    return glow;
  }

  // Materialization effect update
  static updateMaterialization(tardis: TardisInstance, delta: number): boolean {
    if (!tardis.materializing) return false;

    tardis.materializeProgress += delta * 0.5; // 2 seconds to fully materialize

    if (tardis.materializeProgress >= 1) {
      tardis.materializeProgress = 1;
      tardis.materializing = false;

      // Fully visible
      tardis.group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
          child.material.opacity = 1;
          child.material.transparent = false;
        }
      });
      return false;
    }

    // Flickering materialization
    const flicker = 0.3 + Math.sin(tardis.materializeProgress * 30) * 0.2;
    const baseOpacity = tardis.materializeProgress * 0.7 + flicker;

    tardis.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
        child.material.transparent = true;
        child.material.opacity = Math.min(1, baseOpacity);
      }
    });

    // Lamp flickers intensely during materialization
    tardis.lampLight.intensity = 0.5 + Math.random() * 2;

    return true;
  }

  // Start materialization effect
  static startMaterialization(tardis: TardisInstance): void {
    tardis.materializing = true;
    tardis.materializeProgress = 0;

    // Start fully transparent
    tardis.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
        child.material.transparent = true;
        child.material.opacity = 0;
      }
    });
  }

  // Update lamp pulsing (for wave transitions)
  static updateLampPulse(tardis: TardisInstance, time: number, isWaveTransition: boolean): void {
    if (tardis.materializing) return;

    // Base intensity depends on power level
    const basePower = (tardis as TardisInstanceWithPower).powerLevel ?? 0;
    const baseIntensity = 0.1 + basePower * 0.6; // 0.1 -> 0.7 as power increases

    if (isWaveTransition) {
      // Rapid pulse during wave transition
      tardis.lampLight.intensity = baseIntensity + Math.sin(time * 8) * 0.4;
    } else {
      // Gentle ambient pulse
      tardis.lampLight.intensity = baseIntensity + Math.sin(time * 1.5) * 0.15;
    }
  }

  // Set power level (0-1 representing 0-3 cells delivered)
  static setPowerLevel(tardis: TardisInstance, level: number): void {
    (tardis as TardisInstanceWithPower).powerLevel = level;

    // Update window glow intensity based on power
    tardis.group.traverse((child) => {
      if (child instanceof THREE.PointLight && child.position.y < 3) {
        // Interior glow light
        child.intensity = 0.1 + level * 0.5;
      }
      // Update window materials to be brighter
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshBasicMaterial;
        if (mat.color && mat.color.getHex() === WINDOW_GLOW) {
          mat.opacity = 0.2 + level * 0.6;
        }
      }
    });

    // Update lamp globe brightness
    const lampMat = tardis.lamp.material as THREE.MeshBasicMaterial;
    lampMat.opacity = 0.3 + level * 0.7;

    // If fully powered, make it glow more
    if (level >= 1) {
      tardis.lampLight.color.setHex(0xffffff);
      tardis.lampLight.intensity = 2;
    }
  }
}

// Extended interface with power level tracking
interface TardisInstanceWithPower extends TardisInstance {
  powerLevel?: number;
}
