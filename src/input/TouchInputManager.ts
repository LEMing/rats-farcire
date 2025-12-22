/**
 * TouchInputManager - Mobile touch controls for the game
 *
 * Features:
 * - Dual virtual joysticks (move + aim)
 * - Auto-fire when aim joystick active
 * - Dash button + double-tap on move joystick
 * - Thermobaric button
 * - Weapon slot buttons
 */

import type { InputState } from '@shared/types';
import { VirtualJoystick } from './VirtualJoystick';

export interface TouchInputConfig {
  joystickBaseRadius: number;
  joystickStickRadius: number;
  joystickDeadZone: number;
  joystickOpacity: number;
  buttonSize: number;
  buttonSpacing: number;
}

const DEFAULT_CONFIG: TouchInputConfig = {
  joystickBaseRadius: 55,
  joystickStickRadius: 25,
  joystickDeadZone: 0.15,
  joystickOpacity: 0.5,
  buttonSize: 50,
  buttonSpacing: 12,
};

export class TouchInputManager {
  private container: HTMLElement;
  private config: TouchInputConfig;

  private moveJoystick: VirtualJoystick;
  private aimJoystick: VirtualJoystick;

  private controlsContainer: HTMLElement;
  private dashButton: HTMLElement;
  private thermobaricButton: HTMLElement;
  private weaponButtons: HTMLElement[] = [];
  private weaponContainer: HTMLElement;

  private dashPressed: boolean = false;
  private thermobaricPressed: boolean = false;
  private selectedWeaponSlot: number | null = null;

  private sequence: number = 0;
  private isVisible: boolean = false;

  constructor(container: HTMLElement, config: Partial<TouchInputConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create controls overlay
    this.controlsContainer = this.createControlsContainer();
    this.container.appendChild(this.controlsContainer);

    // Create joysticks
    this.moveJoystick = new VirtualJoystick(this.controlsContainer, {
      side: 'left',
      baseRadius: this.config.joystickBaseRadius,
      stickRadius: this.config.joystickStickRadius,
      deadZone: this.config.joystickDeadZone,
      opacity: this.config.joystickOpacity,
      color: 'rgba(100, 150, 255, 0.25)',
      stickColor: 'rgba(100, 150, 255, 0.6)',
    });

    this.aimJoystick = new VirtualJoystick(this.controlsContainer, {
      side: 'right',
      baseRadius: this.config.joystickBaseRadius,
      stickRadius: this.config.joystickStickRadius,
      deadZone: this.config.joystickDeadZone,
      opacity: this.config.joystickOpacity,
      color: 'rgba(255, 100, 100, 0.25)',
      stickColor: 'rgba(255, 100, 100, 0.6)',
    });

    // Double-tap on move joystick triggers dash
    this.moveJoystick.onDoubleTap(() => {
      this.dashPressed = true;
      setTimeout(() => { this.dashPressed = false; }, 100);
    });

    // Create UI buttons
    this.dashButton = this.createDashButton();
    this.thermobaricButton = this.createThermobaricButton();
    this.weaponContainer = this.createWeaponButtons();

    this.controlsContainer.appendChild(this.dashButton);
    this.controlsContainer.appendChild(this.thermobaricButton);
    this.controlsContainer.appendChild(this.weaponContainer);

    this.hide();
  }

  private createControlsContainer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'touch-controls';
    el.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: auto;
      touch-action: none;
      z-index: 100;
    `;
    return el;
  }

  private createButton(
    icon: string,
    color: string,
    size: number = this.config.buttonSize
  ): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      border: 2px solid rgba(255, 255, 255, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${size * 0.5}px;
      color: white;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      opacity: 0.7;
      user-select: none;
      -webkit-user-select: none;
      transition: transform 0.1s, opacity 0.1s;
    `;
    el.textContent = icon;
    return el;
  }

  private createDashButton(): HTMLElement {
    const btn = this.createButton('⚡', 'rgba(100, 200, 255, 0.4)');
    btn.style.right = `${130 + this.config.buttonSpacing}px`;
    btn.style.bottom = `${20}px`;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dashPressed = true;
      btn.style.transform = 'scale(0.9)';
      btn.style.opacity = '1';
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.dashPressed = false;
      btn.style.transform = 'scale(1)';
      btn.style.opacity = '0.7';
    }, { passive: false });

    return btn;
  }

  private createThermobaricButton(): HTMLElement {
    const btn = this.createButton('💥', 'rgba(255, 100, 50, 0.4)', 55);
    btn.style.right = `${130 + this.config.buttonSize + this.config.buttonSpacing * 2}px`;
    btn.style.bottom = `${20}px`;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.thermobaricPressed = true;
      btn.style.transform = 'scale(0.9)';
      btn.style.opacity = '1';
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.thermobaricPressed = false;
      btn.style.transform = 'scale(1)';
      btn.style.opacity = '0.7';
    }, { passive: false });

    return btn;
  }

  private createWeaponButtons(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      top: 60px;
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const weaponIcons = ['🔫', '🎯', '⚙️', '🚀', '💣'];
    const weaponColors = [
      'rgba(150, 150, 150, 0.4)',  // Pistol
      'rgba(100, 200, 100, 0.4)',  // Rifle
      'rgba(200, 150, 50, 0.4)',   // Machinegun
      'rgba(255, 100, 100, 0.4)',  // Rocket
      'rgba(150, 100, 200, 0.4)',  // Shotgun
    ];

    for (let i = 0; i < 5; i++) {
      const btn = this.createButton(weaponIcons[i], weaponColors[i], 40);
      btn.style.position = 'relative';
      btn.dataset.slot = String(i + 1);

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectedWeaponSlot = i + 1;
        btn.style.transform = 'scale(0.9)';
        btn.style.opacity = '1';
        btn.style.borderColor = 'rgba(255, 255, 100, 1)';
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.style.transform = 'scale(1)';
        btn.style.opacity = '0.7';
        // Keep border if this is current weapon (handled by updateWeaponSlot)
      }, { passive: false });

      container.appendChild(btn);
      this.weaponButtons.push(btn);
    }

    return container;
  }

  updateWeaponSlot(currentSlot: number): void {
    this.weaponButtons.forEach((btn, i) => {
      if (i + 1 === currentSlot) {
        btn.style.borderColor = 'rgba(255, 255, 100, 1)';
        btn.style.opacity = '0.9';
      } else {
        btn.style.borderColor = 'rgba(255, 255, 255, 0.6)';
        btn.style.opacity = '0.7';
      }
    });
  }

  getState(): InputState {
    const moveState = this.moveJoystick.getState();
    const aimState = this.aimJoystick.getState();

    this.sequence++;

    // For aim direction, use joystick if active, otherwise keep last direction
    let aimX = aimState.x;
    let aimY = aimState.y;

    // Normalize aim direction
    const aimLen = Math.sqrt(aimX * aimX + aimY * aimY);
    if (aimLen > 0.01) {
      aimX /= aimLen;
      aimY /= aimLen;
    } else {
      // Default aim direction (forward)
      aimX = 0;
      aimY = -1;
    }

    // Convert screen Y to world Z (inverted)
    // In screen space, Y+ is down, but in game Y+ should be forward
    const worldMoveY = -moveState.y;
    const worldAimY = -aimY;

    const state: InputState = {
      moveX: moveState.x,
      moveY: worldMoveY,
      aimX: aimX,
      aimY: worldAimY,
      shooting: aimState.active && aimState.magnitude > 0.3, // Auto-fire when aiming
      interact: false, // TODO: Add interact button if needed
      dash: this.dashPressed,
      sprint: false, // No sprint on mobile, could add later
      weaponSlot: this.selectedWeaponSlot,
      thermobaric: this.thermobaricPressed,
      escapePressed: false,
      sequence: this.sequence,
    };

    // Reset one-shot inputs
    this.selectedWeaponSlot = null;

    return state;
  }

  show(): void {
    this.isVisible = true;
    this.controlsContainer.style.display = 'block';
  }

  hide(): void {
    this.isVisible = false;
    this.controlsContainer.style.display = 'none';
  }

  isActive(): boolean {
    return this.isVisible;
  }

  destroy(): void {
    this.moveJoystick.destroy();
    this.aimJoystick.destroy();
    this.controlsContainer.remove();
  }
}
