/**
 * UIEffects - Visual feedback effects for the UI
 *
 * Handles damage vignette, kill flash, damage numbers, and notifications.
 * Extracted from UIManager to follow Single Responsibility Principle.
 */

interface QueuedNotification {
  text: string;
  color: number;
  type: 'powerup' | 'notification' | 'message';
  duration: number;
}

// Kill rating thresholds and messages
const KILL_RATINGS = [
  { kills: 2, text: 'DOUBLE KILL', color: '#ffff00' },
  { kills: 3, text: 'TRIPLE KILL', color: '#ff8800' },
  { kills: 4, text: 'MULTI KILL', color: '#ff4400' },
  { kills: 5, text: 'MEGA KILL', color: '#ff0044' },
  { kills: 6, text: 'ULTRA KILL', color: '#ff00ff' },
  { kills: 7, text: 'MONSTER KILL', color: '#aa00ff' },
  { kills: 8, text: 'MASSACRE!', color: '#8800ff' },
  { kills: 10, text: 'BRUTAL!', color: '#ff0000' },
  { kills: 15, text: 'GODLIKE!', color: '#ffffff' },
];

export class UIEffects {
  private damageVignette: HTMLElement;
  private killFlash: HTMLElement;
  private damageNumbersContainer: HTMLElement;
  private killRatingContainer: HTMLElement;
  private lowHealthPulse = 0;

  // Kill rating tracking
  private rapidKillCount = 0;
  private rapidKillTimer = 0;
  private readonly RAPID_KILL_WINDOW = 1500; // ms between kills to count as rapid

  // Notification queue system
  private notificationQueue: QueuedNotification[] = [];
  private activeNotification: HTMLElement | null = null;
  private isProcessingQueue = false;

  constructor() {
    this.damageVignette = this.createDamageVignette();
    this.killFlash = this.createKillFlash();
    this.damageNumbersContainer = this.createDamageNumbersContainer();
    this.killRatingContainer = this.createKillRatingContainer();
    this.injectStyles();
  }

  private createKillRatingContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'kill-rating';
    container.style.cssText = `
      position: absolute;
      top: 35%;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: none;
      z-index: 200;
      text-align: center;
    `;
    document.getElementById('ui-overlay')?.appendChild(container);
    return container;
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

  /**
   * Register a kill and show kill rating if applicable
   */
  registerKill(): void {
    const now = Date.now();

    // Check if this kill is within the rapid kill window
    if (now - this.rapidKillTimer < this.RAPID_KILL_WINDOW) {
      this.rapidKillCount++;
    } else {
      this.rapidKillCount = 1;
    }

    this.rapidKillTimer = now;

    // Find the appropriate kill rating
    let rating = null;
    for (let i = KILL_RATINGS.length - 1; i >= 0; i--) {
      if (this.rapidKillCount >= KILL_RATINGS[i].kills) {
        rating = KILL_RATINGS[i];
        break;
      }
    }

    if (rating) {
      this.showKillRating(rating.text, rating.color);
    }
  }

  private showKillRating(text: string, color: string): void {
    // Clear existing rating
    this.killRatingContainer.innerHTML = '';

    const element = document.createElement('div');
    element.className = 'kill-rating-text';
    element.textContent = text;
    element.style.cssText = `
      font-size: 48px;
      font-weight: bold;
      color: ${color};
      text-shadow:
        0 0 20px ${color},
        0 0 40px ${color},
        0 0 60px ${color},
        3px 3px 0 #000,
        -1px -1px 0 #000;
      letter-spacing: 6px;
      animation: killRatingPop 1.2s ease-out forwards;
      text-transform: uppercase;
    `;

    this.killRatingContainer.appendChild(element);

    // Remove after animation
    setTimeout(() => element.remove(), 1200);
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
  // Notifications - Queue-based system to prevent overlapping
  // ============================================================================

  showPowerUpNotification(name: string, color: number): void {
    this.queueNotification({
      text: name,
      color,
      type: 'powerup',
      duration: 1500,
    });
  }

  showNotification(text: string, color: number): void {
    this.queueNotification({
      text,
      color,
      type: 'notification',
      duration: 2000,
    });
  }

  showMessage(message: string, duration = 3000): void {
    this.queueNotification({
      text: message,
      color: 0xffffff,
      type: 'message',
      duration,
    });
  }

  private queueNotification(notification: QueuedNotification): void {
    // Check if this exact notification is already queued or showing
    const isDuplicate = this.notificationQueue.some(
      (n) => n.text === notification.text && n.type === notification.type
    );
    if (isDuplicate) return;

    this.notificationQueue.push(notification);
    this.processQueue();
  }

  private processQueue(): void {
    // Don't start processing if already processing or queue is empty
    if (this.isProcessingQueue || this.notificationQueue.length === 0) return;

    this.isProcessingQueue = true;
    const notification = this.notificationQueue.shift()!;
    this.displayNotification(notification);
  }

  private displayNotification(notification: QueuedNotification): void {
    const overlay = document.getElementById('ui-overlay')!;
    const element = document.createElement('div');
    const hexColor = '#' + notification.color.toString(16).padStart(6, '0');

    // All notifications now use the same centered position
    const styles = this.getNotificationStyles(notification.type, hexColor);
    element.style.cssText = styles;
    element.textContent = notification.text;

    // Remove any existing notification first
    if (this.activeNotification) {
      this.activeNotification.remove();
    }

    this.activeNotification = element;
    overlay.appendChild(element);

    // Schedule removal and next notification
    setTimeout(() => {
      element.remove();
      if (this.activeNotification === element) {
        this.activeNotification = null;
      }
      this.isProcessingQueue = false;
      // Small delay between notifications for readability
      setTimeout(() => this.processQueue(), 100);
    }, notification.duration);
  }

  private getNotificationStyles(type: QueuedNotification['type'], hexColor: string): string {
    const baseStyles = `
      position: absolute;
      top: 25%;
      left: 50%;
      pointer-events: none;
      z-index: 70;
      text-transform: uppercase;
    `;

    switch (type) {
      case 'powerup':
        return baseStyles + `
          transform: translate(-50%, -50%) scale(1.5);
          font-size: 32px;
          font-weight: bold;
          color: ${hexColor};
          text-shadow: 0 0 20px ${hexColor}, 0 0 40px ${hexColor}, 2px 2px 0 #000;
          letter-spacing: 4px;
          animation: powerUpNotification 1.5s ease-out forwards;
        `;
      case 'notification':
        return baseStyles + `
          transform: translate(-50%, -50%) scale(1);
          font-size: 28px;
          font-weight: bold;
          color: ${hexColor};
          text-shadow: 0 0 15px ${hexColor}, 2px 2px 0 #000;
          letter-spacing: 3px;
          animation: powerUpNotification 2s ease-out forwards;
        `;
      case 'message':
        return baseStyles + `
          transform: translate(-50%, -50%);
          font-size: 32px;
          color: ${hexColor};
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
          animation: fadeOut 3000ms ease-out forwards;
        `;
    }
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
      @keyframes fadeOut {
        0% {
          opacity: 1;
        }
        70% {
          opacity: 1;
        }
        100% {
          opacity: 0;
        }
      }
      @keyframes killRatingPop {
        0% {
          opacity: 0;
          transform: scale(0.3) rotate(-10deg);
        }
        15% {
          opacity: 1;
          transform: scale(1.4) rotate(3deg);
        }
        30% {
          transform: scale(0.9) rotate(-2deg);
        }
        45% {
          transform: scale(1.1) rotate(1deg);
        }
        60% {
          transform: scale(1) rotate(0deg);
        }
        85% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
        100% {
          opacity: 0;
          transform: scale(1.2) translateY(-30px);
        }
      }
    `;
    document.head.appendChild(style);
  }
}
