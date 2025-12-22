/**
 * VirtualJoystick - Touch-based joystick for mobile controls
 *
 * Features:
 * - Floating joystick (appears where you touch)
 * - Dead zone support
 * - Visual feedback
 * - Double-tap detection
 */

export interface JoystickState {
  active: boolean;
  x: number;  // -1 to 1
  y: number;  // -1 to 1
  magnitude: number;  // 0 to 1
}

export interface JoystickConfig {
  side: 'left' | 'right';
  baseRadius: number;
  stickRadius: number;
  deadZone: number;
  opacity: number;
  color: string;
  stickColor: string;
}

const DEFAULT_CONFIG: JoystickConfig = {
  side: 'left',
  baseRadius: 60,
  stickRadius: 30,
  deadZone: 0.15,
  opacity: 0.4,
  color: 'rgba(255, 255, 255, 0.3)',
  stickColor: 'rgba(255, 255, 255, 0.6)',
};

export class VirtualJoystick {
  private container: HTMLElement;
  private baseElement: HTMLElement;
  private stickElement: HTMLElement;
  private config: JoystickConfig;

  private touchId: number | null = null;
  private baseX: number = 0;
  private baseY: number = 0;
  private stickX: number = 0;
  private stickY: number = 0;

  private state: JoystickState = {
    active: false,
    x: 0,
    y: 0,
    magnitude: 0,
  };

  // Double-tap detection
  private lastTapTime: number = 0;
  private doubleTapCallback: (() => void) | null = null;
  private readonly doubleTapThreshold = 300; // ms

  constructor(container: HTMLElement, config: Partial<JoystickConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.baseElement = this.createBaseElement();
    this.stickElement = this.createStickElement();

    this.baseElement.appendChild(this.stickElement);
    this.container.appendChild(this.baseElement);

    this.hide();
    this.setupEventListeners();
  }

  private createBaseElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = `joystick-base joystick-${this.config.side}`;
    el.style.cssText = `
      position: absolute;
      width: ${this.config.baseRadius * 2}px;
      height: ${this.config.baseRadius * 2}px;
      border-radius: 50%;
      background: ${this.config.color};
      border: 2px solid rgba(255, 255, 255, 0.4);
      opacity: ${this.config.opacity};
      pointer-events: none;
      touch-action: none;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s ease;
    `;
    return el;
  }

  private createStickElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'joystick-stick';
    el.style.cssText = `
      position: absolute;
      width: ${this.config.stickRadius * 2}px;
      height: ${this.config.stickRadius * 2}px;
      border-radius: 50%;
      background: ${this.config.stickColor};
      border: 2px solid rgba(255, 255, 255, 0.8);
      pointer-events: none;
      touch-action: none;
      transition: transform 0.05s ease-out;
    `;
    return el;
  }

  private setupEventListeners(): void {
    // We handle touch events on the container
    this.container.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.container.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.container.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
    this.container.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false });
  }

  private isInMyZone(x: number): boolean {
    const screenWidth = window.innerWidth;
    const halfWidth = screenWidth / 2;

    if (this.config.side === 'left') {
      return x < halfWidth;
    } else {
      return x >= halfWidth;
    }
  }

  private onTouchStart(e: TouchEvent): void {
    // Find a touch in our zone that we're not already tracking
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (this.touchId === null && this.isInMyZone(touch.clientX)) {
        e.preventDefault();

        // Double-tap detection
        const now = Date.now();
        if (now - this.lastTapTime < this.doubleTapThreshold) {
          this.doubleTapCallback?.();
        }
        this.lastTapTime = now;

        this.touchId = touch.identifier;
        this.baseX = touch.clientX;
        this.baseY = touch.clientY;
        this.stickX = touch.clientX;
        this.stickY = touch.clientY;

        this.show(this.baseX, this.baseY);
        this.updateState();
        break;
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (this.touchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.touchId) {
        e.preventDefault();
        this.stickX = touch.clientX;
        this.stickY = touch.clientY;
        this.updateState();
        break;
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    if (this.touchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.touchId) {
        this.touchId = null;
        this.hide();
        this.state = { active: false, x: 0, y: 0, magnitude: 0 };
        break;
      }
    }
  }

  private updateState(): void {
    const dx = this.stickX - this.baseX;
    const dy = this.stickY - this.baseY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = this.config.baseRadius;

    // Clamp to base radius
    let clampedX = dx;
    let clampedY = dy;
    if (distance > maxDistance) {
      clampedX = (dx / distance) * maxDistance;
      clampedY = (dy / distance) * maxDistance;
    }

    // Normalize to -1 to 1
    const normalizedX = clampedX / maxDistance;
    const normalizedY = clampedY / maxDistance;
    const magnitude = Math.min(distance / maxDistance, 1);

    // Apply dead zone
    if (magnitude < this.config.deadZone) {
      this.state = { active: true, x: 0, y: 0, magnitude: 0 };
    } else {
      // Rescale to account for dead zone
      const adjustedMagnitude = (magnitude - this.config.deadZone) / (1 - this.config.deadZone);
      this.state = {
        active: true,
        x: normalizedX * (adjustedMagnitude / magnitude),
        y: normalizedY * (adjustedMagnitude / magnitude),
        magnitude: adjustedMagnitude,
      };
    }

    // Update stick visual position
    this.stickElement.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  }

  private show(x: number, y: number): void {
    this.baseElement.style.display = 'flex';
    this.baseElement.style.left = `${x - this.config.baseRadius}px`;
    this.baseElement.style.top = `${y - this.config.baseRadius}px`;
    this.stickElement.style.transform = 'translate(0, 0)';
  }

  private hide(): void {
    this.baseElement.style.display = 'none';
  }

  getState(): JoystickState {
    return { ...this.state };
  }

  onDoubleTap(callback: () => void): void {
    this.doubleTapCallback = callback;
  }

  destroy(): void {
    this.baseElement.remove();
  }
}
