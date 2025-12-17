import type { InputState } from '@shared/types';

// ============================================================================
// Input Manager - WASD + Mouse
// ============================================================================

export class InputManager {
  private keys: Set<string> = new Set();
  public mouseX = 0;
  public mouseY = 0;
  private mouseDown = false;
  private sequence = 0;

  constructor(container: HTMLElement) {
    // Keyboard events
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));

    // Mouse events
    container.addEventListener('mousemove', this.onMouseMove.bind(this));
    container.addEventListener('mousedown', this.onMouseDown.bind(this));
    container.addEventListener('mouseup', this.onMouseUp.bind(this));

    // Prevent default for game keys
    window.addEventListener('keydown', (e) => {
      if (['w', 'a', 's', 'd', 'r', 'e', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.key.toLowerCase());
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
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
    // Calculate movement direction
    let moveX = 0;
    let moveY = 0;

    if (this.keys.has('w') || this.keys.has('arrowup')) moveY -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) moveY += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) moveX -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) moveX += 1;

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

    this.sequence++;

    return {
      moveX,
      moveY,
      aimX: normalizedAimX,
      aimY: normalizedAimY,
      shooting: this.mouseDown,
      reload: this.keys.has('r'),
      interact: this.keys.has('e'),
      dash: this.keys.has(' '), // Space bar for dash
      sequence: this.sequence,
    };
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }
}
