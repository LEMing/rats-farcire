// ============================================================================
// UI Manager - HUD and overlay management
// ============================================================================

import { POWERUP_CONFIGS } from '@shared/constants';
import type { PowerUpType } from '@shared/types';

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
    damageVignette: HTMLElement;
    killFlash: HTMLElement;
    damageNumbersContainer: HTMLElement;
    powerUpContainer: HTMLElement;
    objectiveDisplay: HTMLElement;
    carryingIndicator: HTMLElement;
  };

  private comboDisplayScale = 1;
  private readonly COMBO_TIMEOUT = 2000; // Should match constant
  private lastHealth = 100;
  private lowHealthPulse = 0;

  constructor() {
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
      damageVignette: this.createDamageVignette(),
      killFlash: this.createKillFlash(),
      damageNumbersContainer: this.createDamageNumbersContainer(),
      powerUpContainer: this.createPowerUpContainer(),
      objectiveDisplay: this.createObjectiveDisplay(),
      carryingIndicator: this.createCarryingIndicator(),
    };
    this.elements.comboCount = this.elements.comboContainer.querySelector('.combo-count')!;
    this.elements.comboBar = this.elements.comboContainer.querySelector('.combo-bar-fill')!;

    // Inject CSS animations
    this.injectStyles();
  }

  private createDamageVignette(): HTMLElement {
    const vignette = document.createElement('div');
    vignette.id = 'damage-vignette';
    vignette.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: 0;
      background: radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(180, 0, 0, 0.8) 100%);
      transition: opacity 0.1s ease-out;
      z-index: 100;
    `;
    document.getElementById('ui-overlay')?.appendChild(vignette);
    return vignette;
  }

  private createKillFlash(): HTMLElement {
    const flash = document.createElement('div');
    flash.id = 'kill-flash';
    flash.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: 0;
      background: radial-gradient(ellipse at center, rgba(255, 255, 200, 0.3) 0%, transparent 70%);
      z-index: 99;
    `;
    document.getElementById('ui-overlay')?.appendChild(flash);
    return flash;
  }

  private createDamageNumbersContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'damage-numbers';
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: hidden;
      z-index: 50;
    `;
    document.getElementById('ui-overlay')?.appendChild(container);
    return container;
  }

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
          border: 2px solid #00ffff;
          background: rgba(0, 255, 255, 0.1);
          border-radius: 4px;
          transition: all 0.3s;
        "></div>
        <div class="cell-indicator" data-index="1" style="
          width: 30px;
          height: 30px;
          border: 2px solid #00ffff;
          background: rgba(0, 255, 255, 0.1);
          border-radius: 4px;
          transition: all 0.3s;
        "></div>
        <div class="cell-indicator" data-index="2" style="
          width: 30px;
          height: 30px;
          border: 2px solid #00ffff;
          background: rgba(0, 255, 255, 0.1);
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
      background: rgba(0, 255, 255, 0.2);
      border: 2px solid #00ffff;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      color: #00ffff;
      text-transform: uppercase;
      letter-spacing: 2px;
      pointer-events: none;
      z-index: 35;
      display: none;
      animation: carryingPulse 1s ease-in-out infinite;
    `;
    indicator.innerHTML = `
      <span>⚡ CARRYING POWER CELL ⚡</span>
      <div style="font-size: 12px; margin-top: 4px; opacity: 0.7;">Shoot or press E to drop • Walk to TARDIS to deliver</div>
    `;
    document.getElementById('ui-overlay')?.appendChild(indicator);
    return indicator;
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

  update(state: UIState): void {
    // Health bar
    const healthPercent = (state.health / state.maxHealth) * 100;
    this.elements.healthFill.style.width = `${healthPercent}%`;

    // Detect damage taken and trigger vignette
    if (state.health < this.lastHealth) {
      const damageTaken = this.lastHealth - state.health;
      const intensity = Math.min(damageTaken / 30, 1); // Normalize to 0-1
      this.triggerDamageVignette(intensity);
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
    if (healthPercent <= 30 && healthPercent > 0) {
      this.lowHealthPulse += 0.15;
      const pulse = Math.sin(this.lowHealthPulse) * 0.5 + 0.5;
      const intensity = (30 - healthPercent) / 30; // More intense at lower health
      this.elements.damageVignette.style.opacity = (pulse * 0.4 * intensity).toString();
      this.elements.damageVignette.style.transition = 'none';
    } else {
      this.lowHealthPulse = 0;
    }

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
    if (state.combo !== undefined && state.combo > 0) {
      this.elements.comboContainer.style.opacity = '1';
      this.elements.comboCount.textContent = `${state.combo}x`;

      // Scale up slightly with combo
      const targetScale = Math.min(1 + state.combo * 0.05, 1.5);
      this.comboDisplayScale += (targetScale - this.comboDisplayScale) * 0.2;
      this.elements.comboContainer.style.transform = `translateY(-50%) scale(${this.comboDisplayScale})`;

      // Color intensity with combo
      const intensity = Math.min(state.combo / 10, 1);
      const r = Math.floor(255);
      const g = Math.floor(221 - intensity * 100);
      const b = Math.floor(0);
      this.elements.comboCount.style.color = `rgb(${r},${g},${b})`;

      // Timer bar
      if (state.comboTimer !== undefined) {
        const timerPercent = (state.comboTimer / this.COMBO_TIMEOUT) * 100;
        this.elements.comboBar.style.width = `${timerPercent}%`;
      }
    } else {
      this.elements.comboContainer.style.opacity = '0';
      this.comboDisplayScale = 1;
    }

    // Power-up display
    this.updatePowerUpDisplay(state.powerUps, state.gameTime);

    // Objective display
    this.updateObjectiveDisplay(state.cellsDelivered, state.cellsRequired, state.carryingCell);
  }

  private updateObjectiveDisplay(cellsDelivered?: number, cellsRequired?: number, carryingCell?: boolean): void {
    // Update cell indicators
    if (cellsDelivered !== undefined && cellsRequired !== undefined) {
      const indicators = this.elements.objectiveDisplay.querySelectorAll('.cell-indicator');
      indicators.forEach((indicator, index) => {
        const el = indicator as HTMLElement;
        if (index < cellsDelivered) {
          // Delivered - full glow
          el.style.background = '#00ffff';
          el.style.boxShadow = '0 0 15px #00ffff';
        } else {
          // Not delivered
          el.style.background = 'rgba(0, 255, 255, 0.1)';
          el.style.boxShadow = 'none';
        }
      });
    }

    // Carrying indicator
    if (carryingCell) {
      this.elements.carryingIndicator.style.display = 'block';
    } else {
      this.elements.carryingIndicator.style.display = 'none';
    }
  }

  private updatePowerUpDisplay(powerUps?: UIState['powerUps'], gameTime?: number): void {
    const container = this.elements.powerUpContainer;
    if (!powerUps || gameTime === undefined) {
      container.innerHTML = '';
      return;
    }

    // Get active power-ups
    const activePowerUps: { type: PowerUpType; timeLeft: number }[] = [];
    for (const [type, expiry] of Object.entries(powerUps)) {
      if (expiry && expiry > gameTime) {
        activePowerUps.push({ type: type as PowerUpType, timeLeft: expiry - gameTime });
      }
    }

    // Clear and rebuild if needed
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
      // Just update timers
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

  setPing(ping: number): void {
    this.elements.ping.textContent = ping.toString();

    // Color based on ping quality
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

    // Color based on status
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
  // Visual Feedback Effects
  // ============================================================================

  triggerDamageVignette(intensity: number = 0.5): void {
    const vignette = this.elements.damageVignette;
    vignette.style.opacity = (0.3 + intensity * 0.7).toString();

    // Fade out
    setTimeout(() => {
      vignette.style.transition = 'opacity 0.3s ease-out';
      vignette.style.opacity = '0';
    }, 100);

    // Reset transition
    setTimeout(() => {
      vignette.style.transition = 'opacity 0.1s ease-out';
    }, 400);
  }

  triggerKillFlash(): void {
    const flash = this.elements.killFlash;
    flash.style.opacity = '1';
    flash.style.transition = 'opacity 0.05s ease-out';

    setTimeout(() => {
      flash.style.transition = 'opacity 0.2s ease-out';
      flash.style.opacity = '0';
    }, 50);
  }

  spawnDamageNumber(screenX: number, screenY: number, damage: number, isCritical: boolean = false, combo: number = 0): void {
    const container = this.elements.damageNumbersContainer;

    const num = document.createElement('div');
    num.className = 'damage-number';

    // Format text
    let text = Math.round(damage).toString();
    if (combo > 1) {
      text += ` x${combo}`;
    }

    const fontSize = isCritical ? 32 : (24 + Math.min(damage / 5, 12));
    const color = isCritical ? '#ff4444' : (combo > 1 ? '#ffdd00' : '#ffffff');

    num.style.cssText = `
      position: absolute;
      left: ${screenX}px;
      top: ${screenY}px;
      font-size: ${fontSize}px;
      font-weight: bold;
      color: ${color};
      text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
      pointer-events: none;
      z-index: 60;
      transform: translate(-50%, -50%) scale(1.2);
      animation: damageNumberFloat 0.8s ease-out forwards;
    `;
    num.textContent = text;

    container.appendChild(num);

    // Remove after animation
    setTimeout(() => {
      num.remove();
    }, 800);
  }

  spawnScorePopup(screenX: number, screenY: number, score: number, combo: number): void {
    const container = this.elements.damageNumbersContainer;

    const popup = document.createElement('div');
    const multiplier = combo > 1 ? ` x${combo}` : '';

    popup.style.cssText = `
      position: absolute;
      left: ${screenX}px;
      top: ${screenY - 30}px;
      font-size: 20px;
      font-weight: bold;
      color: #44ff44;
      text-shadow: 2px 2px 0 #000;
      pointer-events: none;
      z-index: 60;
      transform: translate(-50%, -50%);
      animation: damageNumberFloat 1s ease-out forwards;
    `;
    popup.textContent = `+${score}${multiplier}`;

    container.appendChild(popup);

    setTimeout(() => {
      popup.remove();
    }, 1000);
  }

  spawnHealNumber(screenX: number, screenY: number, amount: number): void {
    const container = this.elements.damageNumbersContainer;

    const popup = document.createElement('div');
    popup.style.cssText = `
      position: absolute;
      left: ${screenX}px;
      top: ${screenY - 20}px;
      font-size: 24px;
      font-weight: bold;
      color: #ff00ff;
      text-shadow: 0 0 10px #ff00ff, 2px 2px 0 #000;
      pointer-events: none;
      z-index: 60;
      transform: translate(-50%, -50%);
      animation: damageNumberFloat 0.8s ease-out forwards;
    `;
    popup.textContent = `+${amount} HP`;

    container.appendChild(popup);

    setTimeout(() => {
      popup.remove();
    }, 800);
  }

  showPowerUpNotification(name: string, color: number): void {
    const overlay = document.getElementById('ui-overlay')!;

    const notification = document.createElement('div');
    const hexColor = '#' + color.toString(16).padStart(6, '0');

    notification.style.cssText = `
      position: absolute;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%) scale(1.5);
      font-size: 32px;
      font-weight: bold;
      color: ${hexColor};
      text-shadow: 0 0 20px ${hexColor}, 0 0 40px ${hexColor}, 2px 2px 0 #000;
      text-transform: uppercase;
      letter-spacing: 4px;
      pointer-events: none;
      z-index: 70;
      animation: powerUpNotification 1.5s ease-out forwards;
    `;
    notification.textContent = name;

    overlay.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 1500);
  }

  showNotification(text: string, color: number): void {
    const overlay = document.getElementById('ui-overlay')!;

    const notification = document.createElement('div');
    const hexColor = '#' + color.toString(16).padStart(6, '0');

    notification.style.cssText = `
      position: absolute;
      top: 30%;
      left: 50%;
      transform: translate(-50%, -50%) scale(1);
      font-size: 28px;
      font-weight: bold;
      color: ${hexColor};
      text-shadow: 0 0 15px ${hexColor}, 2px 2px 0 #000;
      text-transform: uppercase;
      letter-spacing: 3px;
      pointer-events: none;
      z-index: 70;
      animation: powerUpNotification 2s ease-out forwards;
    `;
    notification.textContent = text;

    overlay.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 2000);
  }

  showVictory(score: number, wave: number, maxCombo: number): void {
    const overlay = document.getElementById('ui-overlay')!;

    // Hide combo and objective displays
    this.elements.comboContainer.style.opacity = '0';
    this.elements.objectiveDisplay.style.opacity = '0';
    this.elements.carryingIndicator.style.display = 'none';

    const victoryDiv = document.createElement('div');
    victoryDiv.id = 'victory-screen';
    victoryDiv.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: rgba(0, 40, 80, 0);
      pointer-events: auto;
      animation: fadeInBlue 0.5s ease-out forwards;
    `;

    // Add victory animation keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInBlue {
        from { background: rgba(0, 80, 120, 0); }
        to { background: rgba(0, 30, 60, 0.9); }
      }
      @keyframes victoryGlow {
        0%, 100% { text-shadow: 0 0 30px #00ffff, 0 0 60px #00ffff; }
        50% { text-shadow: 0 0 50px #00ffff, 0 0 100px #00ffff, 0 0 150px #00ffff; }
      }
      #victory-screen h1 {
        animation: slideUp 0.4s ease-out 0.2s both, victoryGlow 2s ease-in-out infinite;
      }
      #victory-screen .stats {
        animation: slideUp 0.4s ease-out 0.4s both;
      }
      #victory-screen button {
        animation: slideUp 0.4s ease-out 0.6s both, pulse 2s ease-in-out 1s infinite;
      }
    `;
    document.head.appendChild(style);

    const comboText = maxCombo > 1 ? `Best Combo: ${maxCombo}x` : '';

    victoryDiv.innerHTML = `
      <h1 style="
        font-size: 64px;
        color: #00ffff;
        margin-bottom: 10px;
        text-shadow: 0 0 30px #00ffff, 0 0 60px #00ffff;
        letter-spacing: 8px;
      ">STRATEGIC RETREAT!</h1>
      <div style="
        font-size: 20px;
        color: #88ccff;
        margin-bottom: 30px;
        letter-spacing: 4px;
      ">TARDIS POWERED - ESCAPE SUCCESSFUL</div>
      <div class="stats" style="
        text-align: center;
        margin-bottom: 40px;
      ">
        <p style="font-size: 56px; color: #ffdd00; margin: 10px 0; text-shadow: 2px 2px 0 #000;">
          ${score.toLocaleString()}
        </p>
        <p style="font-size: 18px; color: #888; text-transform: uppercase; letter-spacing: 3px; margin: 5px 0;">
          Final Score
        </p>
        <p style="font-size: 24px; color: #aaa; margin: 20px 0 5px;">
          Survived Wave ${wave}
        </p>
        ${comboText ? `
        <p style="font-size: 20px; color: #ff8844; margin: 5px 0;">
          ${comboText}
        </p>` : ''}
      </div>
      <button id="btn-play-again" style="
        padding: 18px 50px;
        font-size: 22px;
        cursor: pointer;
        background: linear-gradient(180deg, #0088cc, #005588);
        color: #fff;
        border: 2px solid #00aaff;
        border-radius: 8px;
        font-family: inherit;
        text-transform: uppercase;
        letter-spacing: 2px;
        box-shadow: 0 4px 15px rgba(0, 150, 255, 0.3);
        transition: all 0.2s;
      " onmouseover="this.style.background='linear-gradient(180deg, #00aadd, #006699)'; this.style.transform='scale(1.05)'"
         onmouseout="this.style.background='linear-gradient(180deg, #0088cc, #005588)'; this.style.transform='scale(1)'">
        Play Again
      </button>
    `;

    overlay.appendChild(victoryDiv);

    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // Add CSS animation for damage numbers
  private static stylesInjected = false;
  private injectStyles(): void {
    if (UIManager.stylesInjected) return;
    UIManager.stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes damageNumberFloat {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.2);
        }
        20% {
          transform: translate(-50%, -70%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -150%) scale(0.8);
        }
      }
      @keyframes powerUpNotification {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.5);
        }
        20% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.2);
        }
        40% {
          transform: translate(-50%, -50%) scale(1);
        }
        80% {
          opacity: 1;
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -70%) scale(0.8);
        }
      }
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

  showMessage(message: string, duration = 3000): void {
    const msgElement = document.createElement('div');
    msgElement.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 32px;
      color: #fff;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
      animation: fadeOut ${duration}ms ease-out forwards;
      pointer-events: none;
    `;
    msgElement.textContent = message;

    const overlay = document.getElementById('ui-overlay')!;
    overlay.appendChild(msgElement);

    setTimeout(() => {
      msgElement.remove();
    }, duration);
  }

  showWaveAnnouncement(wave: number): void {
    this.showMessage(`Wave ${wave}`, 2000);
  }

  showGameOver(score: number, wave?: number, maxCombo?: number): void {
    const overlay = document.getElementById('ui-overlay')!;

    // Hide combo display
    this.elements.comboContainer.style.opacity = '0';

    const gameOverDiv = document.createElement('div');
    gameOverDiv.id = 'game-over';
    gameOverDiv.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: rgba(20, 0, 0, 0);
      pointer-events: auto;
      animation: fadeInRed 0.5s ease-out forwards;
    `;

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInRed {
        from { background: rgba(80, 0, 0, 0); }
        to { background: rgba(20, 0, 0, 0.85); }
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      #game-over h1 {
        animation: slideUp 0.4s ease-out 0.2s both;
      }
      #game-over .stats {
        animation: slideUp 0.4s ease-out 0.4s both;
      }
      #game-over button {
        animation: slideUp 0.4s ease-out 0.6s both, pulse 2s ease-in-out 1s infinite;
      }
    `;
    document.head.appendChild(style);

    const waveText = wave !== undefined ? `Wave ${wave}` : '';
    const comboText = maxCombo !== undefined && maxCombo > 1 ? `Best Combo: ${maxCombo}x` : '';

    gameOverDiv.innerHTML = `
      <h1 style="
        font-size: 72px;
        color: #ff2222;
        margin-bottom: 10px;
        text-shadow: 0 0 20px rgba(255, 0, 0, 0.8), 0 0 40px rgba(255, 0, 0, 0.4);
        letter-spacing: 8px;
      ">DEAD</h1>
      <div class="stats" style="
        text-align: center;
        margin-bottom: 40px;
      ">
        <p style="font-size: 48px; color: #ffdd00; margin: 10px 0; text-shadow: 2px 2px 0 #000;">
          ${score.toLocaleString()}
        </p>
        <p style="font-size: 18px; color: #888; text-transform: uppercase; letter-spacing: 3px; margin: 5px 0;">
          Final Score
        </p>
        ${waveText ? `
        <p style="font-size: 24px; color: #aaa; margin: 20px 0 5px;">
          Reached ${waveText}
        </p>` : ''}
        ${comboText ? `
        <p style="font-size: 20px; color: #ff8844; margin: 5px 0;">
          ${comboText}
        </p>` : ''}
      </div>
      <button id="btn-restart" style="
        padding: 18px 50px;
        font-size: 22px;
        cursor: pointer;
        background: linear-gradient(180deg, #cc2222, #881111);
        color: #fff;
        border: 2px solid #ff4444;
        border-radius: 8px;
        font-family: inherit;
        text-transform: uppercase;
        letter-spacing: 2px;
        box-shadow: 0 4px 15px rgba(255, 0, 0, 0.3);
        transition: all 0.2s;
      " onmouseover="this.style.background='linear-gradient(180deg, #dd3333, #992222)'; this.style.transform='scale(1.05)'"
         onmouseout="this.style.background='linear-gradient(180deg, #cc2222, #881111)'; this.style.transform='scale(1)'">
        Try Again
      </button>
    `;

    overlay.appendChild(gameOverDiv);

    document.getElementById('btn-restart')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}
