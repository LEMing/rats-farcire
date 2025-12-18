/**
 * UIEffects - Visual feedback effects for the UI
 *
 * Handles damage vignette, kill flash, damage numbers, and notifications.
 * Extracted from UIManager to follow Single Responsibility Principle.
 */

export class UIEffects {
  private damageVignette: HTMLElement;
  private killFlash: HTMLElement;
  private damageNumbersContainer: HTMLElement;
  private lowHealthPulse = 0;

  constructor() {
    this.damageVignette = this.createDamageVignette();
    this.killFlash = this.createKillFlash();
    this.damageNumbersContainer = this.createDamageNumbersContainer();
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

  // ============================================================================
  // Visual Effects
  // ============================================================================

  triggerDamageVignette(intensity: number = 0.5): void {
    this.damageVignette.style.opacity = (0.3 + intensity * 0.7).toString();

    // Fade out
    setTimeout(() => {
      this.damageVignette.style.transition = 'opacity 0.3s ease-out';
      this.damageVignette.style.opacity = '0';
    }, 100);

    // Reset transition
    setTimeout(() => {
      this.damageVignette.style.transition = 'opacity 0.1s ease-out';
    }, 400);
  }

  triggerKillFlash(): void {
    this.killFlash.style.opacity = '1';
    this.killFlash.style.transition = 'opacity 0.05s ease-out';

    setTimeout(() => {
      this.killFlash.style.transition = 'opacity 0.2s ease-out';
      this.killFlash.style.opacity = '0';
    }, 50);
  }

  updateLowHealthPulse(healthPercent: number): void {
    if (healthPercent <= 30 && healthPercent > 0) {
      this.lowHealthPulse += 0.15;
      const pulse = Math.sin(this.lowHealthPulse) * 0.5 + 0.5;
      const intensity = (30 - healthPercent) / 30;
      this.damageVignette.style.opacity = (pulse * 0.4 * intensity).toString();
      this.damageVignette.style.transition = 'none';
    } else {
      this.lowHealthPulse = 0;
    }
  }

  // ============================================================================
  // Damage Numbers and Popups
  // ============================================================================

  spawnDamageNumber(screenX: number, screenY: number, damage: number, isCritical: boolean = false, combo: number = 0): void {
    const num = document.createElement('div');
    num.className = 'damage-number';

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

    this.damageNumbersContainer.appendChild(num);

    setTimeout(() => num.remove(), 800);
  }

  spawnScorePopup(screenX: number, screenY: number, score: number, combo: number): void {
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

    this.damageNumbersContainer.appendChild(popup);

    setTimeout(() => popup.remove(), 1000);
  }

  spawnHealNumber(screenX: number, screenY: number, amount: number): void {
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

    this.damageNumbersContainer.appendChild(popup);

    setTimeout(() => popup.remove(), 800);
  }

  // ============================================================================
  // Notifications
  // ============================================================================

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

    setTimeout(() => notification.remove(), 1500);
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

    setTimeout(() => notification.remove(), 2000);
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

    setTimeout(() => msgElement.remove(), duration);
  }

  // ============================================================================
  // Styles
  // ============================================================================

  private static stylesInjected = false;
  private injectStyles(): void {
    if (UIEffects.stylesInjected) return;
    UIEffects.stylesInjected = true;

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
    `;
    document.head.appendChild(style);
  }
}
