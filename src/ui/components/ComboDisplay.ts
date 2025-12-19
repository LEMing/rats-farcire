/**
 * ComboDisplay - Renders and updates the combo counter UI
 *
 * Single Responsibility: Display combo count and timer bar
 */

export interface ComboDisplayConfig {
  comboTimeout: number;
  maxScale: number;
  maxColorIntensity: number;
}

export const DEFAULT_COMBO_CONFIG: ComboDisplayConfig = {
  comboTimeout: 2000,
  maxScale: 1.5,
  maxColorIntensity: 10,
};

export class ComboDisplay {
  private container: HTMLElement;
  private countElement: HTMLElement;
  private barElement: HTMLElement;
  private currentScale = 1;
  private config: ComboDisplayConfig;

  constructor(parentId: string = 'ui-overlay', config: Partial<ComboDisplayConfig> = {}) {
    this.config = { ...DEFAULT_COMBO_CONFIG, ...config };
    this.container = this.createElement();
    this.countElement = this.container.querySelector('.combo-count')!;
    this.barElement = this.container.querySelector('.combo-bar-fill')!;

    const parent = document.getElementById(parentId);
    parent?.appendChild(this.container);
  }

  private createElement(): HTMLElement {
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

    return container;
  }

  update(combo: number | undefined, comboTimer: number | undefined): void {
    if (combo !== undefined && combo > 0) {
      this.show(combo, comboTimer);
    } else {
      this.hide();
    }
  }

  private show(combo: number, comboTimer: number | undefined): void {
    this.container.style.opacity = '1';
    this.countElement.textContent = `${combo}x`;

    // Scale up slightly with combo
    const targetScale = Math.min(1 + combo * 0.05, this.config.maxScale);
    this.currentScale += (targetScale - this.currentScale) * 0.2;
    this.container.style.transform = `translateY(-50%) scale(${this.currentScale})`;

    // Color intensity with combo
    this.updateColor(combo);

    // Timer bar
    if (comboTimer !== undefined) {
      const timerPercent = (comboTimer / this.config.comboTimeout) * 100;
      this.barElement.style.width = `${timerPercent}%`;
    }
  }

  private hide(): void {
    this.container.style.opacity = '0';
    this.currentScale = 1;
  }

  private updateColor(combo: number): void {
    const intensity = Math.min(combo / this.config.maxColorIntensity, 1);
    const r = 255;
    const g = Math.floor(221 - intensity * 100);
    const b = 0;
    this.countElement.style.color = `rgb(${r},${g},${b})`;
  }

  /**
   * Get the container element for external use (e.g., hiding on game end)
   */
  getElement(): HTMLElement {
    return this.container;
  }

  destroy(): void {
    this.container.remove();
  }
}
