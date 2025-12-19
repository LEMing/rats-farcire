/**
 * UIManager - HUD and overlay management
 *
 * Coordinates UI subsystems:
 * - HUD elements (health, score, ammo, wave info)
 * - Combo display and tracking
 * - Power-up status display
 * - Objective display
 *
 * Delegates to:
 * - UIEffects: Visual feedback (damage vignette, kill flash, damage numbers)
 * - GameScreens: End-game screens (game over, victory)
 */

import { POWERUP_CONFIGS, WEAPON_CONFIGS, WEAPON_SLOT_ORDER, THERMOBARIC_COOLDOWN } from '@shared/constants';
import type { PowerUpType, WeaponType, MapData } from '@shared/types';
import { UIEffects } from './UIEffects';
import { GameScreens } from './GameScreens';
import { Minimap, MinimapData } from './Minimap';

export interface UIState {
  wave: number;
  enemiesLeft: number;
  score: number;
  health: number;
  maxHealth: number;
  ammo?: number;
  combo?: number;
  comboTimer?: number;
  powerUps?: {
    rapidFire?: number;
    spreadShot?: number;
    vampire?: number;
    shield?: number;
  };
  gameTime?: number;
  // Objective system
  cellsDelivered?: number;
  cellsRequired?: number;
  carryingCell?: boolean;
  // Weapon system
  currentWeapon?: WeaponType;
  unlockedWeapons?: WeaponType[];
  thermobaricCooldown?: number;
  // Minimap data
  minimapData?: MinimapData;
}

export class UIManager {
  private elements: {
    healthFill: HTMLElement;
    score: HTMLElement;
    ammo: HTMLElement;
    wave: HTMLElement;
    enemiesLeft: HTMLElement;
    ping: HTMLElement;
    connectionStatus: HTMLElement;
    crosshair: HTMLElement;
    comboContainer: HTMLElement;
    comboCount: HTMLElement;
    comboBar: HTMLElement;
    powerUpContainer: HTMLElement;
    objectiveDisplay: HTMLElement;
    carryingIndicator: HTMLElement;
    weaponDisplay: HTMLElement;
  };

  private comboDisplayScale = 1;
  private readonly COMBO_TIMEOUT = 2000;
  private lastHealth = 100;

  // Extracted subsystems
  private effects: UIEffects;
  private screens: GameScreens;
  private minimap: Minimap | null = null;

  constructor() {
    this.effects = new UIEffects();
    this.screens = new GameScreens();

    this.elements = {
      healthFill: document.getElementById('health-fill')!,
      score: document.getElementById('score')!,
      ammo: document.getElementById('ammo')!,
      wave: document.getElementById('wave')!,
      enemiesLeft: document.querySelector('#enemies-left span')!,
      ping: document.getElementById('ping')!,
      connectionStatus: document.getElementById('connection-status')!,
      crosshair: document.getElementById('crosshair')!,
      comboContainer: this.createComboDisplay(),
      comboCount: null!,
      comboBar: null!,
      powerUpContainer: this.createPowerUpContainer(),
      objectiveDisplay: this.createObjectiveDisplay(),
      carryingIndicator: this.createCarryingIndicator(),
      weaponDisplay: this.createWeaponDisplay(),
    };
    this.elements.comboCount = this.elements.comboContainer.querySelector('.combo-count')!;
    this.elements.comboBar = this.elements.comboContainer.querySelector('.combo-bar-fill')!;

    // Connect screens to UI elements for hiding on game end
    this.screens.setUIElements(
      this.elements.comboContainer,
      this.elements.objectiveDisplay,
      this.elements.carryingIndicator
    );

    this.injectStyles();
  }

  // ============================================================================
  // Minimap Initialization
  // ============================================================================

  initMinimap(mapData: MapData): void {
    if (this.minimap) {
      this.minimap.destroy();
    }
    this.minimap = new Minimap(mapData);
  }

  // ============================================================================
  // Element Creation
  // ============================================================================

  private createPowerUpContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'powerup-display';
    container.style.cssText = `
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      pointer-events: none;
      z-index: 30;
    `;
    document.getElementById('ui-overlay')?.appendChild(container);
    return container;
  }

  private createObjectiveDisplay(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'objective-display';
    container.style.cssText = `
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: none;
      z-index: 30;
      opacity: 0;
      transition: opacity 0.3s;
    `;
    container.innerHTML = `
      <div style="
        font-size: 14px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 2px;
      ">OBJECTIVE: POWER THE TARDIS</div>
      <div class="cell-indicators" style="
        display: flex;
        gap: 12px;
      ">
        <div class="cell-indicator" data-index="0" style="
          width: 30px;
          height: 30px;
          border: 2px solid #ffaa00;
          background: rgba(255, 170, 0, 0.1);
          border-radius: 4px;
          transition: all 0.3s;
        "></div>
        <div class="cell-indicator" data-index="1" style="
          width: 30px;
          height: 30px;
          border: 2px solid #ffaa00;
          background: rgba(255, 170, 0, 0.1);
          border-radius: 4px;
          transition: all 0.3s;
        "></div>
        <div class="cell-indicator" data-index="2" style="
          width: 30px;
          height: 30px;
          border: 2px solid #ffaa00;
          background: rgba(255, 170, 0, 0.1);
          border-radius: 4px;
          transition: all 0.3s;
        "></div>
      </div>
    `;
    document.getElementById('ui-overlay')?.appendChild(container);
    return container;
  }

  private createCarryingIndicator(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.id = 'carrying-indicator';
    indicator.style.cssText = `
      position: absolute;
      bottom: 150px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      background: rgba(255, 170, 0, 0.2);
      border: 2px solid #ffaa00;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      color: #ffcc00;
      text-transform: uppercase;
      letter-spacing: 2px;
      pointer-events: none;
      z-index: 35;
      display: none;
      animation: carryingPulse 1s ease-in-out infinite;
    `;
    indicator.innerHTML = `
      <span>⚡ CARRYING POWER CELL ⚡</span>
      <div style="font-size: 12px; margin-top: 4px; opacity: 0.7;">Press E to drop • Walk to TARDIS to deliver</div>
    `;
    document.getElementById('ui-overlay')?.appendChild(indicator);
    return indicator;
  }

  private createWeaponDisplay(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'weapon-display';
    container.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      pointer-events: none;
      z-index: 30;
    `;
    container.innerHTML = `
      <div class="weapon-name" style="
        font-size: 14px;
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 2px;
        text-shadow: 0 0 10px rgba(255,255,255,0.5);
      ">PISTOL</div>
      <div class="weapon-slots" style="
        display: flex;
        gap: 6px;
      ">
        ${WEAPON_SLOT_ORDER.map((w, i) => `
          <div class="weapon-slot" data-weapon="${w}" style="
            width: 32px;
            height: 32px;
            border: 2px solid #444;
            background: rgba(0,0,0,0.5);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #666;
            transition: all 0.2s;
          ">${i + 1}</div>
        `).join('')}
      </div>
      <div class="thermobaric-bar" style="
        width: 160px;
        height: 6px;
        background: rgba(255,100,0,0.2);
        border-radius: 3px;
        overflow: hidden;
        margin-top: 4px;
      ">
        <div class="thermobaric-fill" style="
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, #ff6600, #ff3300);
          transition: width 0.1s linear;
        "></div>
      </div>
      <div class="thermobaric-label" style="
        font-size: 10px;
        color: #ff6600;
        text-transform: uppercase;
        letter-spacing: 1px;
      ">[F] THERMOBARIC</div>
    `;
    document.getElementById('ui-overlay')?.appendChild(container);
    return container;
  }

  private createComboDisplay(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'combo-display';
    container.style.cssText = `
      position: absolute;
      top: 50%;
      right: 40px;
      transform: translateY(-50%);
      text-align: center;
      opacity: 0;
      transition: opacity 0.2s, transform 0.1s;
      pointer-events: none;
    `;

    container.innerHTML = `
      <div class="combo-count" style="
        font-size: 48px;
        font-weight: bold;
        color: #ffdd00;
        text-shadow: 0 0 10px rgba(255, 200, 0, 0.8), 2px 2px 0 #000;
        margin-bottom: 5px;
      ">0x</div>
      <div class="combo-label" style="
        font-size: 16px;
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 2px;
      ">COMBO</div>
      <div class="combo-bar" style="
        width: 80px;
        height: 4px;
        background: rgba(255,255,255,0.2);
        margin: 8px auto 0;
        border-radius: 2px;
        overflow: hidden;
      ">
        <div class="combo-bar-fill" style="
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, #ff6600, #ffdd00);
          transition: width 0.05s linear;
        "></div>
      </div>
    `;

    document.getElementById('ui-overlay')?.appendChild(container);
    return container;
  }

  // ============================================================================
  // Update Loop
  // ============================================================================

  update(state: UIState): void {
    // Health bar
    const healthPercent = (state.health / state.maxHealth) * 100;
    this.elements.healthFill.style.width = `${healthPercent}%`;

    // Detect damage taken and trigger vignette
    if (state.health < this.lastHealth) {
      const damageTaken = this.lastHealth - state.health;
      const intensity = Math.min(damageTaken / 30, 1);
      this.effects.triggerDamageVignette(intensity);
    }
    this.lastHealth = state.health;

    // Change health bar color based on health
    if (healthPercent <= 25) {
      this.elements.healthFill.style.background = 'linear-gradient(90deg, #ff0000, #ff3333)';
    } else if (healthPercent <= 50) {
      this.elements.healthFill.style.background = 'linear-gradient(90deg, #ff6600, #ff9933)';
    } else {
      this.elements.healthFill.style.background = 'linear-gradient(90deg, #ff4444, #ff6666)';
    }

    // Low health warning - pulsing red vignette
    this.effects.updateLowHealthPulse(healthPercent);

    // Score
    this.elements.score.textContent = state.score.toString();

    // Ammo
    if (state.ammo !== undefined) {
      this.elements.ammo.textContent = state.ammo.toString();
    }

    // Wave info
    this.elements.wave.textContent = state.wave.toString();
    this.elements.enemiesLeft.textContent = state.enemiesLeft.toString();

    // Combo display
    this.updateComboDisplay(state.combo, state.comboTimer);

    // Power-up display
    this.updatePowerUpDisplay(state.powerUps, state.gameTime);

    // Objective display
    this.updateObjectiveDisplay(state.cellsDelivered, state.cellsRequired, state.carryingCell);

    // Weapon display
    this.updateWeaponDisplay(state.currentWeapon, state.unlockedWeapons, state.thermobaricCooldown);

    // Minimap
    if (state.minimapData && this.minimap) {
      this.minimap.update(state.minimapData, 16);
    }
  }

  private updateComboDisplay(combo?: number, comboTimer?: number): void {
    if (combo !== undefined && combo > 0) {
      this.elements.comboContainer.style.opacity = '1';
      this.elements.comboCount.textContent = `${combo}x`;

      // Scale up slightly with combo
      const targetScale = Math.min(1 + combo * 0.05, 1.5);
      this.comboDisplayScale += (targetScale - this.comboDisplayScale) * 0.2;
      this.elements.comboContainer.style.transform = `translateY(-50%) scale(${this.comboDisplayScale})`;

      // Color intensity with combo
      const intensity = Math.min(combo / 10, 1);
      const r = Math.floor(255);
      const g = Math.floor(221 - intensity * 100);
      const b = Math.floor(0);
      this.elements.comboCount.style.color = `rgb(${r},${g},${b})`;

      // Timer bar
      if (comboTimer !== undefined) {
        const timerPercent = (comboTimer / this.COMBO_TIMEOUT) * 100;
        this.elements.comboBar.style.width = `${timerPercent}%`;
      }
    } else {
      this.elements.comboContainer.style.opacity = '0';
      this.comboDisplayScale = 1;
    }
  }

  private updateObjectiveDisplay(cellsDelivered?: number, cellsRequired?: number, carryingCell?: boolean): void {
    if (cellsDelivered !== undefined && cellsRequired !== undefined) {
      this.elements.objectiveDisplay.style.opacity = '1';

      const indicators = this.elements.objectiveDisplay.querySelectorAll('.cell-indicator');
      indicators.forEach((indicator, index) => {
        const el = indicator as HTMLElement;
        if (index < cellsDelivered) {
          el.style.background = '#ffaa00';
          el.style.boxShadow = '0 0 15px #ffaa00';
        } else {
          el.style.background = 'rgba(255, 170, 0, 0.1)';
          el.style.boxShadow = 'none';
        }
      });
    } else {
      this.elements.objectiveDisplay.style.opacity = '0';
    }

    if (carryingCell) {
      this.elements.carryingIndicator.style.display = 'block';
    } else {
      this.elements.carryingIndicator.style.display = 'none';
    }
  }

  private updateWeaponDisplay(currentWeapon?: WeaponType, unlockedWeapons?: WeaponType[], thermobaricCooldown?: number): void {
    if (!currentWeapon || !unlockedWeapons) return;

    // Update weapon name
    const weaponName = this.elements.weaponDisplay.querySelector('.weapon-name') as HTMLElement;
    if (weaponName) {
      const config = WEAPON_CONFIGS[currentWeapon];
      weaponName.textContent = config.name;
      weaponName.style.color = `#${config.color.toString(16).padStart(6, '0')}`;
    }

    // Update weapon slots
    const slots = this.elements.weaponDisplay.querySelectorAll('.weapon-slot');
    slots.forEach((slot) => {
      const el = slot as HTMLElement;
      const weapon = el.dataset.weapon as WeaponType;
      const isUnlocked = unlockedWeapons.includes(weapon);
      const isCurrent = weapon === currentWeapon;

      if (isCurrent) {
        const config = WEAPON_CONFIGS[weapon];
        el.style.borderColor = `#${config.color.toString(16).padStart(6, '0')}`;
        el.style.background = `rgba(${(config.color >> 16) & 255}, ${(config.color >> 8) & 255}, ${config.color & 255}, 0.3)`;
        el.style.color = '#fff';
        el.style.boxShadow = `0 0 10px #${config.color.toString(16).padStart(6, '0')}`;
      } else if (isUnlocked) {
        el.style.borderColor = '#888';
        el.style.background = 'rgba(100,100,100,0.3)';
        el.style.color = '#aaa';
        el.style.boxShadow = 'none';
      } else {
        el.style.borderColor = '#333';
        el.style.background = 'rgba(0,0,0,0.5)';
        el.style.color = '#444';
        el.style.boxShadow = 'none';
      }
    });

    // Update thermobaric cooldown bar
    const thermoFill = this.elements.weaponDisplay.querySelector('.thermobaric-fill') as HTMLElement;
    const thermoLabel = this.elements.weaponDisplay.querySelector('.thermobaric-label') as HTMLElement;
    if (thermoFill && thermoLabel) {
      const cooldown = thermobaricCooldown ?? 0;
      const readyPercent = Math.max(0, 100 - (cooldown / THERMOBARIC_COOLDOWN) * 100);
      thermoFill.style.width = `${readyPercent}%`;

      if (readyPercent >= 100) {
        thermoLabel.textContent = '[F] THERMOBARIC READY';
        thermoLabel.style.color = '#ff6600';
        thermoFill.style.background = 'linear-gradient(90deg, #ff6600, #ff3300)';
      } else {
        thermoLabel.textContent = `[F] THERMOBARIC ${Math.ceil(cooldown / 1000)}s`;
        thermoLabel.style.color = '#666';
        thermoFill.style.background = '#444';
      }
    }
  }

  private updatePowerUpDisplay(powerUps?: UIState['powerUps'], gameTime?: number): void {
    const container = this.elements.powerUpContainer;
    if (!powerUps || gameTime === undefined) {
      container.innerHTML = '';
      return;
    }

    const activePowerUps: { type: PowerUpType; timeLeft: number }[] = [];
    for (const [type, expiry] of Object.entries(powerUps)) {
      if (expiry && expiry > gameTime) {
        activePowerUps.push({ type: type as PowerUpType, timeLeft: expiry - gameTime });
      }
    }

    const currentCount = container.children.length;
    if (currentCount !== activePowerUps.length) {
      container.innerHTML = '';
      for (const { type, timeLeft } of activePowerUps) {
        const config = POWERUP_CONFIGS[type];
        const element = document.createElement('div');
        element.dataset.type = type;
        element.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.6);
          border: 2px solid #${config.color.toString(16).padStart(6, '0')};
          border-radius: 8px;
          min-width: 70px;
        `;
        element.innerHTML = `
          <div style="
            font-size: 12px;
            font-weight: bold;
            color: #${config.color.toString(16).padStart(6, '0')};
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
          ">${config.name}</div>
          <div class="powerup-timer" style="
            font-size: 18px;
            color: #fff;
            font-weight: bold;
          ">${(timeLeft / 1000).toFixed(1)}s</div>
        `;
        container.appendChild(element);
      }
    } else {
      for (const { type, timeLeft } of activePowerUps) {
        const element = container.querySelector(`[data-type="${type}"]`);
        if (element) {
          const timer = element.querySelector('.powerup-timer') as HTMLElement;
          if (timer) {
            timer.textContent = `${(timeLeft / 1000).toFixed(1)}s`;
          }
        }
      }
    }
  }

  // ============================================================================
  // Network Status
  // ============================================================================

  setPing(ping: number): void {
    this.elements.ping.textContent = ping.toString();

    if (ping < 50) {
      this.elements.ping.style.color = '#00ff00';
    } else if (ping < 100) {
      this.elements.ping.style.color = '#ffff00';
    } else {
      this.elements.ping.style.color = '#ff0000';
    }
  }

  setConnectionStatus(status: string): void {
    this.elements.connectionStatus.textContent = status;

    switch (status.toLowerCase()) {
      case 'connected':
        this.elements.connectionStatus.style.color = '#00ff00';
        break;
      case 'connecting...':
        this.elements.connectionStatus.style.color = '#ffff00';
        break;
      case 'disconnected':
      case 'offline':
        this.elements.connectionStatus.style.color = '#ff0000';
        break;
      default:
        this.elements.connectionStatus.style.color = '#888888';
    }
  }

  updateCrosshair(mouseX: number, mouseY: number): void {
    this.elements.crosshair.style.left = `${mouseX}px`;
    this.elements.crosshair.style.top = `${mouseY}px`;
  }

  // ============================================================================
  // Delegated to UIEffects
  // ============================================================================

  triggerDamageVignette(intensity: number = 0.5): void {
    this.effects.triggerDamageVignette(intensity);
  }

  triggerKillFlash(): void {
    this.effects.triggerKillFlash();
  }

  spawnDamageNumber(screenX: number, screenY: number, damage: number, isCritical: boolean = false, combo: number = 0): void {
    this.effects.spawnDamageNumber(screenX, screenY, damage, isCritical, combo);
  }

  spawnScorePopup(screenX: number, screenY: number, score: number, combo: number): void {
    this.effects.spawnScorePopup(screenX, screenY, score, combo);
  }

  spawnHealNumber(screenX: number, screenY: number, amount: number): void {
    this.effects.spawnHealNumber(screenX, screenY, amount);
  }

  showPowerUpNotification(name: string, color: number): void {
    this.effects.showPowerUpNotification(name, color);
  }

  showNotification(text: string, color: number): void {
    this.effects.showNotification(text, color);
  }

  showMessage(message: string, duration = 3000): void {
    this.effects.showMessage(message, duration);
  }

  showWaveAnnouncement(wave: number): void {
    this.effects.showMessage(`Wave ${wave}`, 2000);
  }

  // ============================================================================
  // Delegated to GameScreens
  // ============================================================================

  showVictory(score: number, wave: number, maxCombo: number): void {
    this.screens.showVictory(score, wave, maxCombo);
  }

  showGameOver(score: number, wave?: number, maxCombo?: number): void {
    this.screens.showGameOver(score, wave, maxCombo);
  }

  // ============================================================================
  // Styles
  // ============================================================================

  private static stylesInjected = false;
  private injectStyles(): void {
    if (UIManager.stylesInjected) return;
    UIManager.stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes carryingPulse {
        0%, 100% {
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
          transform: translateX(-50%) scale(1);
        }
        50% {
          box-shadow: 0 0 25px rgba(0, 255, 255, 0.8);
          transform: translateX(-50%) scale(1.02);
        }
      }
    `;
    document.head.appendChild(style);
  }
}
