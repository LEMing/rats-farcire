/**
 * TutorialOverlay - Shows control hints before game starts
 *
 * Single Responsibility: Display and dismiss tutorial hints
 * Visual style matches main menu (MenuConfig colors/typography)
 */

export interface TutorialOverlayConfig {
  fadeOutDuration: number;
}

export const DEFAULT_TUTORIAL_CONFIG: TutorialOverlayConfig = {
  fadeOutDuration: 300,
};

export type TutorialDismissCallback = () => void;

export class TutorialOverlay {
  private container: HTMLElement;
  private config: TutorialOverlayConfig;
  private onDismiss: TutorialDismissCallback | null = null;
  private isDismissed = false;

  // Bound handlers for cleanup
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleClick: () => void;

  constructor(
    parentId: string = 'ui-overlay',
    config: Partial<TutorialOverlayConfig> = {}
  ) {
    this.config = { ...DEFAULT_TUTORIAL_CONFIG, ...config };
    this.container = this.createElement();

    const parent = document.getElementById(parentId);
    parent?.appendChild(this.container);

    // Bind handlers
    this.handleKeyDown = this.onKeyDown.bind(this);
    this.handleClick = this.dismiss.bind(this);

    // Listen for dismiss events (delay to prevent instant dismiss)
    setTimeout(() => {
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('mousedown', this.handleClick);
      document.addEventListener('touchstart', this.handleClick);
    }, 100);
  }

  private isTouchDevice(): boolean {
    // Use CSS media query - most reliable way to detect PRIMARY touch input
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
      return true;
    }
    // Fallback: mobile user agent check
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      return true;
    }
    return false;
  }

  private createElement(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'tutorial-overlay';

    // Match menu-screen style exactly
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background: radial-gradient(ellipse at center, rgba(26, 10, 32, 0.95) 0%, rgba(13, 8, 18, 0.98) 50%, rgba(5, 2, 8, 0.99) 100%);
      z-index: 1000;
      pointer-events: auto;
      cursor: pointer;
      opacity: 0;
      animation: tutorialFadeIn 0.4s ease-out forwards;
    `;

    container.innerHTML = this.isTouchDevice() ? this.createTouchContent() : this.createDesktopContent();
    return container;
  }

  private getStyles(): string {
    return `
      <style>
        @keyframes tutorialFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes tutorialFadeOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(1.02); }
        }
        @keyframes hintBlink {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      </style>
    `;
  }

  private createDesktopContent(): string {
    return `
      ${this.getStyles()}
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px 50px;
        background: rgba(10, 5, 15, 0.6);
        border-radius: 12px;
        border: 2px solid rgba(170, 34, 255, 0.3);
        backdrop-filter: blur(20px);
        box-shadow: 0 0 80px rgba(0, 0, 0, 0.8), 0 0 40px rgba(170, 34, 255, 0.2);
        font-family: 'Courier New', monospace;
      ">
        <div style="
          font-size: 24px;
          color: #ff44aa;
          margin-bottom: 30px;
          text-shadow: 0 0 20px rgba(255, 68, 170, 0.6);
          letter-spacing: 6px;
          font-weight: bold;
        ">CONTROLS</div>

        <div style="
          display: grid;
          grid-template-columns: auto auto;
          gap: 12px 40px;
          align-items: center;
        ">
          ${this.createControlRow('W A S D', 'MOVE')}
          ${this.createControlRow('MOUSE', 'AIM')}
          ${this.createControlRow('CLICK', 'SHOOT')}
          ${this.createControlRow('SPACE', 'DASH')}
          ${this.createControlRow('1-5', 'WEAPONS')}
          ${this.createControlRow('F', 'BOMB')}
          ${this.createControlRow('E', 'INTERACT')}
          ${this.createControlRow('ESC', 'PAUSE')}
        </div>

        <div style="
          margin-top: 35px;
          font-size: 14px;
          color: #665577;
          letter-spacing: 3px;
          animation: hintBlink 2s ease-in-out infinite;
        ">PRESS ANY KEY</div>
      </div>
    `;
  }

  private createTouchContent(): string {
    return `
      ${this.getStyles()}
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 30px 40px;
        background: rgba(10, 5, 15, 0.6);
        border-radius: 12px;
        border: 2px solid rgba(170, 34, 255, 0.3);
        backdrop-filter: blur(20px);
        box-shadow: 0 0 80px rgba(0, 0, 0, 0.8), 0 0 40px rgba(170, 34, 255, 0.2);
        font-family: 'Courier New', monospace;
      ">
        <div style="
          font-size: 20px;
          color: #ff44aa;
          margin-bottom: 25px;
          text-shadow: 0 0 20px rgba(255, 68, 170, 0.6);
          letter-spacing: 4px;
          font-weight: bold;
        ">TOUCH CONTROLS</div>

        <div style="
          display: grid;
          grid-template-columns: auto auto;
          gap: 10px 30px;
          align-items: center;
        ">
          ${this.createControlRow('🕹️ LEFT', 'MOVE & AIM')}
          ${this.createControlRow('🔥 RIGHT', 'FIRE')}
          ${this.createControlRow('⚡ BUTTON', 'DASH')}
          ${this.createControlRow('💥 BUTTON', 'BOMB')}
          ${this.createControlRow('🔫 BUTTONS', 'WEAPONS')}
          ${this.createControlRow('2x TAP', 'DASH')}
        </div>

        <div style="
          margin-top: 25px;
          font-size: 12px;
          color: #665577;
          letter-spacing: 2px;
          animation: hintBlink 2s ease-in-out infinite;
        ">TAP TO START</div>
      </div>
    `;
  }

  private createControlRow(key: string, action: string): string {
    return `
      <div style="
        font-size: 16px;
        color: #ffccee;
        letter-spacing: 2px;
        text-align: right;
        font-weight: bold;
      ">${key}</div>
      <div style="
        font-size: 14px;
        color: #aa66cc;
        letter-spacing: 2px;
      ">${action}</div>
    `;
  }

  private onKeyDown(_e: KeyboardEvent): void {
    this.dismiss();
  }

  setOnDismiss(callback: TutorialDismissCallback | null): void {
    this.onDismiss = callback;
  }

  dismiss(): void {
    if (this.isDismissed) return;
    this.isDismissed = true;

    // Remove listeners immediately
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('mousedown', this.handleClick);
    document.removeEventListener('touchstart', this.handleClick);

    // Fade out animation
    this.container.style.animation = `tutorialFadeOut ${this.config.fadeOutDuration}ms ease-out forwards`;

    setTimeout(() => {
      this.destroy();
      this.onDismiss?.();
    }, this.config.fadeOutDuration);
  }

  isVisible(): boolean {
    return !this.isDismissed;
  }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('mousedown', this.handleClick);
    document.removeEventListener('touchstart', this.handleClick);
    this.container.remove();
  }
}
