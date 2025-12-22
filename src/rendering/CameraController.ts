import * as THREE from 'three/webgpu';
import type { Vec2, Vec3 } from '@shared/types';

// ============================================================================
// CameraController - Manages isometric camera, zoom, shake, and world projection
// Single Responsibility: Camera positioning, following, and screen effects
// ============================================================================

export interface CameraControllerConfig {
  cameraZoom?: number;
  cameraAngle?: number;
  cameraPitch?: number;
  cameraLead?: number;
  cameraSmoothing?: number;
  zoomLevel?: number;
  zoomMin?: number;
  zoomMax?: number;
  zoomSpeed?: number;
  shakeDecay?: number;
}

const DEFAULT_CONFIG: Required<CameraControllerConfig> = {
  cameraZoom: 14,
  cameraAngle: Math.PI / 4, // 45 degrees
  cameraPitch: Math.atan(1 / Math.sqrt(2)), // ~35.264 degrees (true isometric)
  cameraLead: 3,
  cameraSmoothing: 0.12,
  zoomLevel: 1.0,
  zoomMin: 0.5,
  zoomMax: 1.5,
  zoomSpeed: 0.1,
  shakeDecay: 0.9,
};

export class CameraController {
  private camera: THREE.OrthographicCamera;
  private config: Required<CameraControllerConfig>;

  // Zoom state
  private zoomLevel: number;

  // Camera follow state
  private cameraTarget = new THREE.Vector3();
  private currentCameraLookAt = new THREE.Vector3();

  // Screen shake state
  private shakeIntensity = 0;
  private shakeOffset = new THREE.Vector3();

  constructor(camera: THREE.OrthographicCamera, config: CameraControllerConfig = {}) {
    this.camera = camera;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.zoomLevel = this.config.zoomLevel;

    // Initialize camera position
    this.setupIsometricCamera();
  }

  /**
   * Position camera for isometric view
   */
  private setupIsometricCamera(): void {
    const distance = 50;
    this.camera.position.set(
      distance * Math.cos(this.config.cameraAngle) * Math.cos(this.config.cameraPitch),
      distance * Math.sin(this.config.cameraPitch),
      distance * Math.sin(this.config.cameraAngle) * Math.cos(this.config.cameraPitch)
    );
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Update camera to follow target with smooth interpolation
   */
  updateCamera(targetPosition: Vec3, aimDirection?: Vec2): void {
    this.updateShake();

    // Calculate look-ahead offset based on aim direction
    let leadX = 0;
    let leadZ = 0;
    if (aimDirection) {
      leadX = aimDirection.x * this.config.cameraLead;
      leadZ = aimDirection.y * this.config.cameraLead;
    }

    // Target position with aim lead
    const targetX = targetPosition.x + leadX;
    const targetZ = targetPosition.z + leadZ;

    // Smooth follow - lerp toward target
    this.cameraTarget.x += (targetX - this.cameraTarget.x) * this.config.cameraSmoothing;
    this.cameraTarget.y = targetPosition.y;
    this.cameraTarget.z += (targetZ - this.cameraTarget.z) * this.config.cameraSmoothing;

    // Position camera at isometric offset from smoothed target
    const distance = 50;
    this.camera.position.set(
      this.cameraTarget.x + distance * Math.cos(this.config.cameraAngle) * Math.cos(this.config.cameraPitch) + this.shakeOffset.x,
      this.cameraTarget.y + distance * Math.sin(this.config.cameraPitch) + this.shakeOffset.y,
      this.cameraTarget.z + distance * Math.sin(this.config.cameraAngle) * Math.cos(this.config.cameraPitch) + this.shakeOffset.z
    );

    // Smooth look-at as well
    this.currentCameraLookAt.x += (this.cameraTarget.x - this.currentCameraLookAt.x) * this.config.cameraSmoothing;
    this.currentCameraLookAt.y = this.cameraTarget.y;
    this.currentCameraLookAt.z += (this.cameraTarget.z - this.currentCameraLookAt.z) * this.config.cameraSmoothing;

    this.camera.lookAt(
      this.currentCameraLookAt.x + this.shakeOffset.x * 0.5,
      this.currentCameraLookAt.y,
      this.currentCameraLookAt.z + this.shakeOffset.z * 0.5
    );
  }

  /**
   * Handle camera resize - updates projection matrix
   */
  resize(width: number, height: number): void {
    const aspect = width / height;
    const viewSize = this.config.cameraZoom * this.zoomLevel;

    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Adjust zoom level by delta (positive = zoom out, negative = zoom in)
   */
  adjustZoom(delta: number): void {
    this.zoomLevel = Math.max(
      this.config.zoomMin,
      Math.min(this.config.zoomMax, this.zoomLevel + delta * this.config.zoomSpeed)
    );
    // Apply zoom immediately
    this.resize(window.innerWidth, window.innerHeight);
  }

  /**
   * Get current zoom level
   */
  getZoomLevel(): number {
    return this.zoomLevel;
  }

  /**
   * Add screen shake effect
   */
  addScreenShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  /**
   * Update shake effect (called internally from updateCamera)
   */
  private updateShake(): void {
    if (this.shakeIntensity > 0.01) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity * 2,
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity * 2
      );
      this.shakeIntensity *= this.config.shakeDecay;
    } else {
      this.shakeOffset.set(0, 0, 0);
      this.shakeIntensity = 0;
    }
  }

  /**
   * Convert world position to screen coordinates
   */
  worldToScreen(worldPos: Vec3): { x: number; y: number } {
    const vec = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    vec.project(this.camera);

    return {
      x: (vec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-vec.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /**
   * Get the camera instance (for external access if needed)
   */
  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }
}
