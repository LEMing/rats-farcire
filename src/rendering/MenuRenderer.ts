import * as THREE from 'three/webgpu';
import {
  pass,
  vec2,
  vec3,
  float,
  uv,
  sin,
  fract,
  mix,
  smoothstep,
  length,
  dot,
  mul,
  add,
  sub,
  clamp,
  uniform,
} from 'three/tsl';
import { MenuConfig } from '../menu/config/MenuConfig';
import { ProceduralMaterials } from '../menu/materials/ProceduralMaterials';
import { MeatballFactory, FloatingMeatball } from '../menu/factories/MeatballFactory';

// ============================================================================
// Menu Renderer - Orchestrates the 3D animated menu scene
// ============================================================================

export class MenuRenderer {
  private readonly container: HTMLElement;
  private readonly config = MenuConfig;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGPURenderer;
  private postProcessing!: THREE.PostProcessing;

  private readonly timeUniform = uniform(0);
  private materials!: ProceduralMaterials;
  private meatballFactory!: MeatballFactory;

  private centralMeatball!: THREE.Group;
  private floatingMeatballs: FloatingMeatball[] = [];
  private lights: THREE.PointLight[] = [];

  private time = 0;
  private initialized = false;
  private animationId: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.initializeScene();
      this.initializeRenderer();
      await this.renderer.init();

      this.initializeFactories();
      this.setupScene();
      this.setupPostProcessing();

      this.initialized = true;
      console.log('Menu renderer initialized');
    } catch (e) {
      console.warn('Menu renderer initialization failed, skipping animated background:', e);
      // Clean up any partial initialization
      if (this.renderer?.domElement?.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.initialized = false;
    }
  }

  start(): void {
    if (!this.initialized) return;
    this.animate();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height);
  }

  dispose(): void {
    this.stop();

    if (this.renderer?.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.disposeFloatingMeatballs();
    this.scene.clear();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  private initializeScene(): void {
    const sceneConfig = this.config.scene;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(sceneConfig.backgroundColor);

    this.camera = new THREE.PerspectiveCamera(
      sceneConfig.cameraFov,
      window.innerWidth / window.innerHeight,
      sceneConfig.cameraNear,
      sceneConfig.cameraFar
    );
    this.camera.position.set(0, 0, sceneConfig.cameraZ);
    this.camera.lookAt(0, 0, 0);
  }

  private initializeRenderer(): void {
    // Create canvas manually to ensure proper initialization
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.container.appendChild(canvas);

    this.renderer = new THREE.WebGPURenderer({
      canvas,
      antialias: true,
      // Let it try WebGPU first, fallback to WebGL automatically
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private initializeFactories(): void {
    this.materials = new ProceduralMaterials(this.timeUniform);
    this.meatballFactory = new MeatballFactory(this.materials);
  }

  // ---------------------------------------------------------------------------
  // Scene Setup
  // ---------------------------------------------------------------------------

  private setupScene(): void {
    this.setupLighting();
    this.createBackground();
    this.createCentralMeatball();
    this.createFloatingMeatballs();
  }

  private setupLighting(): void {
    const lightingConfig = this.config.lighting;

    // Ambient light
    const ambient = new THREE.AmbientLight(
      lightingConfig.ambient.color,
      lightingConfig.ambient.intensity
    );
    this.scene.add(ambient);

    // Main directional light
    const mainLight = new THREE.DirectionalLight(
      lightingConfig.main.color,
      lightingConfig.main.intensity
    );
    mainLight.position.set(
      lightingConfig.main.position.x,
      lightingConfig.main.position.y,
      lightingConfig.main.position.z
    );
    this.scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.PointLight(
      lightingConfig.fill.color,
      lightingConfig.fill.intensity,
      lightingConfig.fill.distance
    );
    fillLight.position.set(
      lightingConfig.fill.position.x,
      lightingConfig.fill.position.y,
      lightingConfig.fill.position.z
    );
    this.scene.add(fillLight);
    this.lights.push(fillLight);

    // Accent light
    const accentLight = new THREE.PointLight(
      lightingConfig.accent.color,
      lightingConfig.accent.intensity,
      lightingConfig.accent.distance
    );
    accentLight.position.set(
      lightingConfig.accent.position.x,
      lightingConfig.accent.position.y,
      lightingConfig.accent.position.z
    );
    this.scene.add(accentLight);
    this.lights.push(accentLight);
  }

  private createBackground(): void {
    // Use a massive plane that extends far beyond the camera view
    // This creates an "infinite" background effect
    const geometry = new THREE.PlaneGeometry(200, 200);
    const material = this.materials.createBackgroundMaterial();

    const background = new THREE.Mesh(geometry, material);
    background.position.z = -50; // Push far back
    this.scene.add(background);
  }

  private createCentralMeatball(): void {
    this.centralMeatball = this.meatballFactory.createCentral();
    this.scene.add(this.centralMeatball);
  }

  private createFloatingMeatballs(): void {
    this.floatingMeatballs = this.meatballFactory.createFloatingMeatballs();
    this.floatingMeatballs.forEach((mb) => this.scene.add(mb.mesh));
  }

  // ---------------------------------------------------------------------------
  // Post-Processing - Epic Horror Effects
  // ---------------------------------------------------------------------------

  private setupPostProcessing(): void {
    try {
      this.postProcessing = new THREE.PostProcessing(this.renderer);

      const scenePass = pass(this.scene, this.camera);
      const color = scenePass.getTextureNode('output');

      // Chain of effects for maximum horror atmosphere
      const withChromatic = this.applyChromaticAberration(color);
      const withColorGrade = this.applyColorGrading(withChromatic);
      const withScanLines = this.applyScanLines(withColorGrade);
      const withGrain = this.applyFilmGrain(withScanLines);
      const withVignette = this.applyPulsingVignette(withGrain);

      this.postProcessing.outputNode = withVignette;
    } catch (e) {
      console.warn('Menu post-processing failed:', e);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyChromaticAberration(color: any) {
    const ppConfig = this.config.postProcessing;
    const uvCoord = uv();

    // Distance from center for radial chromatic aberration
    const center = vec2(0.5, 0.5);
    const toCenter = sub(uvCoord, center);
    const dist = length(toCenter);

    // Pulsing chromatic strength
    const pulse = add(
      ppConfig.chromaticStrength,
      mul(sin(mul(this.timeUniform, ppConfig.chromaticPulseSpeed)), ppConfig.chromaticPulseAmount)
    );
    const offset = mul(toCenter, mul(dist, pulse));

    // Sample RGB at different offsets
    const r = color.r;
    const g = color.g;
    const b = color.b;

    // Shift red outward, blue inward
    const chromaR = add(r, mul(offset.x, 15.0));
    const chromaB = sub(b, mul(offset.x, 15.0));

    return vec3(chromaR, g, chromaB);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyColorGrading(color: any) {
    const ppConfig = this.config.postProcessing;

    // Boost contrast
    const contrasted = sub(mul(sub(color, 0.5), ppConfig.contrastBoost), sub(ppConfig.contrastBoost, 1.0).mul(0.5));
    const contrastedClamped = clamp(add(contrasted, 0.5), 0, 1);

    // Boost saturation (toward purple/magenta)
    const gray = dot(contrastedClamped, vec3(0.299, 0.587, 0.114));
    const saturated = mix(vec3(gray, gray, gray), contrastedClamped, float(ppConfig.saturationBoost));

    // Subtle sepia/warm tint
    const sepiaR = dot(saturated, vec3(0.393, 0.769, 0.189));
    const sepiaG = dot(saturated, vec3(0.349, 0.686, 0.168));
    const sepiaB = dot(saturated, vec3(0.272, 0.534, 0.131));
    const sepiaColor = vec3(sepiaR, sepiaG, sepiaB);

    return mix(saturated, sepiaColor, float(ppConfig.sepiaStrength));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyScanLines(color: any) {
    const ppConfig = this.config.postProcessing;
    const uvCoord = uv();

    // Moving scan lines
    const scanLineY = add(mul(uvCoord.y, ppConfig.scanLineCount), mul(this.timeUniform, ppConfig.scanLineSpeed));
    const scanLine = mul(sin(scanLineY), 0.5);
    const scanLineIntensity = add(0.5, scanLine);

    // Darken scan lines
    const darkened = mul(color, add(1.0, mul(sub(scanLineIntensity, 0.5), ppConfig.scanLineStrength)));

    return darkened;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilmGrain(color: any) {
    const ppConfig = this.config.postProcessing;
    const uvCoord = uv();

    const grainTime = mul(this.timeUniform, ppConfig.grainSpeed);
    const grain = fract(sin(dot(add(uvCoord, grainTime), vec2(12.9898, 78.233))).mul(43758.5453));
    const grainAmount = mul(sub(grain, 0.5), ppConfig.grainAmount);

    return add(color, grainAmount);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyPulsingVignette(color: any) {
    const ppConfig = this.config.postProcessing;
    const uvCoord = uv();

    const center = vec2(0.5, 0.5);
    const dist = length(sub(uvCoord, center));

    // Pulsing vignette intensity
    const pulseAmount = mul(sin(mul(this.timeUniform, ppConfig.vignettePulseSpeed)), ppConfig.vignettePulseAmount);
    const vignetteOuter = add(ppConfig.vignetteOuter, pulseAmount);

    const vignetteAmount = smoothstep(
      float(ppConfig.vignetteInner),
      vignetteOuter,
      dist
    );

    // Dark purple/black vignette
    const vignetteColor = vec3(0.03, 0.01, 0.05);

    return mix(color, vignetteColor, mul(vignetteAmount, ppConfig.vignetteStrength));
  }

  // ---------------------------------------------------------------------------
  // Animation Loop
  // ---------------------------------------------------------------------------

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.time += 0.016;
    this.timeUniform.value = this.time;

    this.animateCentralMeatball();
    this.animateFloatingMeatballs();
    this.animateLights();
    this.animateCamera();

    this.render();
  };

  private animateCentralMeatball(): void {
    const config = this.config.centralMeatball;

    this.centralMeatball.rotation.y += config.rotationSpeed;
    this.centralMeatball.rotation.x = Math.sin(this.time * 0.3) * 0.08;

    const pulse = 1 + Math.sin(this.time * config.pulseSpeed) * config.pulseAmount;
    this.centralMeatball.scale.setScalar(pulse);
  }

  private animateFloatingMeatballs(): void {
    for (const meatball of this.floatingMeatballs) {
      // Apply velocity
      meatball.mesh.position.add(meatball.velocity);

      // Floating motion
      meatball.mesh.position.x += Math.sin(this.time * 0.4 + meatball.phase) * 0.001;
      meatball.mesh.position.y += Math.sin(this.time * 0.3 + meatball.phase) * 0.0008;

      // Rotation
      meatball.mesh.rotation.x += meatball.rotationSpeed.x;
      meatball.mesh.rotation.y += meatball.rotationSpeed.y;
      meatball.mesh.rotation.z += meatball.rotationSpeed.z;

      // Wrap around bounds
      this.wrapMeatballPosition(meatball);
    }
  }

  private wrapMeatballPosition(meatball: FloatingMeatball): void {
    const bounds = { x: 15, y: 10 };

    if (meatball.mesh.position.y > bounds.y) {
      meatball.mesh.position.y = -bounds.y;
      meatball.mesh.position.x = (Math.random() - 0.5) * bounds.x * 2;
    }
    if (meatball.mesh.position.y < -bounds.y) {
      meatball.mesh.position.y = bounds.y;
    }
    if (meatball.mesh.position.x > bounds.x) {
      meatball.mesh.position.x = -bounds.x;
    }
    if (meatball.mesh.position.x < -bounds.x) {
      meatball.mesh.position.x = bounds.x;
    }
  }

  private animateLights(): void {
    const animConfig = this.config.animation;
    const accentLight = this.lights[1];

    if (accentLight) {
      accentLight.intensity =
        0.6 +
        Math.sin(this.time * animConfig.lightFlickerSpeed) * animConfig.lightFlickerAmount +
        Math.random() * 0.05;
    }
  }

  private animateCamera(): void {
    const animConfig = this.config.animation;

    this.camera.position.x = Math.sin(this.time * animConfig.cameraSwaySpeedX) * animConfig.cameraSwayAmountX;
    this.camera.position.y = Math.cos(this.time * animConfig.cameraSwaySpeedY) * animConfig.cameraSwayAmountY;
    this.camera.lookAt(0, this.config.centralMeatball.positionY, 0);
  }

  private render(): void {
    if (this.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  private disposeFloatingMeatballs(): void {
    for (const meatball of this.floatingMeatballs) {
      meatball.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }
  }
}
