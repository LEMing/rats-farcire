import type { InputState } from '@shared/types';
import { Settings } from '../settings/Settings';
import { TouchInputManager } from './TouchInputManager';

// ============================================================================
// Input Manager - WASD + Mouse + Touch (layout-independent using key codes)
// ============================================================================

export class InputManager {
  private keys: Set<string> = new Set();
  public mouseX = 0;
  public mouseY = 0;
  private mouseDown = false;
  private sequence = 0;
  private settings: Settings;
  private container: HTMLElement;

  // Touch/mobile support
  private touchInput: TouchInputManager | null = null;
  private isTouchDevice: boolean;
  private useTouchControls: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.settings = Settings.getInstance();

    // Detect touch device
    this.isTouchDevice = this.detectTouchDevice();
    // Keyboard events - use code for layout independence
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));

    // Mouse events
    container.addEventListener('mousemove', this.onMouseMove.bind(this));
    container.addEventListener('mousedown', this.onMouseDown.bind(this));
    container.addEventListener('mouseup', this.onMouseUp.bind(this));

    // Prevent default for game keys (using code)
    window.addEventListener('keydown', (e) => {
      const gameCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyE', 'KeyF', 'Space',
                         'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                         'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
      if (gameCodes.includes(e.code)) {
        e.preventDefault();
      }
    });

    // Initialize touch controls if on touch device
    if (this.isTouchDevice) {
      this.initTouchControls();
    }
  }

  private detectTouchDevice(): boolean {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error - msMaxTouchPoints is IE/Edge specific
      navigator.msMaxTouchPoints > 0 ||
      // Check for mobile user agent as fallback
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
  }

  private initTouchControls(): void {
    this.touchInput = new TouchInputManager(this.container);
    this.useTouchControls = true;
    this.touchInput.show();
    console.log('[InputManager] Touch controls initialized');
  }

  enableTouchControls(): void {
    if (!this.touchInput) {
      this.initTouchControls();
    } else {
      this.useTouchControls = true;
      this.touchInput.show();
    }
  }

  disableTouchControls(): void {
    this.useTouchControls = false;
    this.touchInput?.hide();
  }

  isTouchEnabled(): boolean {
    return this.useTouchControls;
  }

  isTouchAvailable(): boolean {
    return this.isTouchDevice;
  }

  updateWeaponSlot(slot: number): void {
    this.touchInput?.updateWeaponSlot(slot);
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Use e.code for physical key position (works with any layout)
    this.keys.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
  }

  private onMouseMove(e: MouseEvent): void {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.mouseDown = true;
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.mouseDown = false;
    }
  }

  getState(): InputState {
    // Use touch input if active
    if (this.useTouchControls && this.touchInput) {
      return this.touchInput.getState();
    }

    // Calculate aim direction from screen center to mouse
    // In isometric view, we need to convert screen coordinates to world direction
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // Direction from center to mouse (in screen space)
    const dx = this.mouseX - centerX;
    const dy = this.mouseY - centerY;

    // Convert to isometric world coordinates
    // Rotate by -45 degrees to account for isometric view
    const isoAngle = -Math.PI / 4;
    const aimX = dx * Math.cos(isoAngle) - dy * Math.sin(isoAngle);
    const aimY = dx * Math.sin(isoAngle) + dy * Math.cos(isoAngle);

    // Normalize aim direction
    const aimLen = Math.sqrt(aimX * aimX + aimY * aimY);
    const normalizedAimX = aimLen > 0 ? aimX / aimLen : 0;
    const normalizedAimY = aimLen > 0 ? aimY / aimLen : 1;

    // Get raw WASD input
    // Using key codes for layout independence
    let forward = 0;
    let strafe = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;

    // Calculate movement based on control scheme
    let moveX: number;
    let moveY: number;

    if (this.settings.controlScheme === 'camera-relative') {
      // Camera-relative: W=up-screen, S=down-screen, A=left-screen, D=right-screen
      // Rotated by -45° for isometric view, negated forward for correct up direction
      moveX = Math.cos(isoAngle) * strafe + Math.sin(isoAngle) * forward;
      moveY = Math.sin(isoAngle) * strafe - Math.cos(isoAngle) * forward;
    } else {
      // Player-relative (default): W=toward aim, S=away from aim, A/D=strafe
      const rightX = -normalizedAimY; // Perpendicular to aim (right)
      const rightY = normalizedAimX;
      moveX = forward * normalizedAimX + strafe * rightX;
      moveY = forward * normalizedAimY + strafe * rightY;
    }

    // Normalize if moving diagonally
    const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
    if (moveLen > 1) {
      moveX /= moveLen;
      moveY /= moveLen;
    }

    this.sequence++;

    // Check weapon slot keys (1-5)
    let weaponSlot: number | null = null;
    if (this.keys.has('Digit1')) weaponSlot = 1;
    else if (this.keys.has('Digit2')) weaponSlot = 2;
    else if (this.keys.has('Digit3')) weaponSlot = 3;
    else if (this.keys.has('Digit4')) weaponSlot = 4;
    else if (this.keys.has('Digit5')) weaponSlot = 5;

    return {
      moveX,
      moveY,
      aimX: normalizedAimX,
      aimY: normalizedAimY,
      shooting: this.mouseDown,
      interact: this.keys.has('KeyE'),
      dash: this.keys.has('Space'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      weaponSlot,
      thermobaric: this.keys.has('KeyF'),
      escapePressed: this.keys.has('Escape'),
      sequence: this.sequence,
    };
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }
}
