/**
 * GameScreens - Game over and victory screen display
 *
 * Handles end-game screens with animations and play again functionality.
 * Extracted from UIManager to follow Single Responsibility Principle.
 */

export class GameScreens {
  private comboContainer: HTMLElement | null = null;
  private objectiveDisplay: HTMLElement | null = null;
  private carryingIndicator: HTMLElement | null = null;

  constructor() {
    this.injectStyles();
  }

  /**
   * Set references to UI elements that need to be hidden on game end
   */
  setUIElements(
    comboContainer: HTMLElement,
    objectiveDisplay: HTMLElement,
    carryingIndicator: HTMLElement
  ): void {
    this.comboContainer = comboContainer;
    this.objectiveDisplay = objectiveDisplay;
    this.carryingIndicator = carryingIndicator;
  }

  private hideGameplayUI(): void {
    if (this.comboContainer) {
      this.comboContainer.style.opacity = '0';
    }
    if (this.objectiveDisplay) {
      this.objectiveDisplay.style.opacity = '0';
    }
    if (this.carryingIndicator) {
      this.carryingIndicator.style.display = 'none';
    }
  }

  showVictory(score: number, wave: number, maxCombo: number): void {
    const overlay = document.getElementById('ui-overlay')!;

    this.hideGameplayUI();

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

    const comboText = maxCombo > 1 ? `Best Combo: ${maxCombo}x` : '';

    victoryDiv.innerHTML = `
      <h1 style="
        font-size: 64px;
        color: #00ffff;
        margin-bottom: 10px;
        text-shadow: 0 0 30px #00ffff, 0 0 60px #00ffff;
        letter-spacing: 8px;
        animation: slideUp 0.4s ease-out 0.2s both, victoryGlow 2s ease-in-out infinite;
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
        animation: slideUp 0.4s ease-out 0.4s both;
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
        animation: slideUp 0.4s ease-out 0.6s both, pulse 2s ease-in-out 1s infinite;
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

  showGameOver(score: number, wave?: number, maxCombo?: number): void {
    const overlay = document.getElementById('ui-overlay')!;

    this.hideGameplayUI();

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

    const waveText = wave !== undefined ? `Wave ${wave}` : '';
    const comboText = maxCombo !== undefined && maxCombo > 1 ? `Best Combo: ${maxCombo}x` : '';

    gameOverDiv.innerHTML = `
      <h1 style="
        font-size: 72px;
        color: #ff2222;
        margin-bottom: 10px;
        text-shadow: 0 0 20px rgba(255, 0, 0, 0.8), 0 0 40px rgba(255, 0, 0, 0.4);
        letter-spacing: 8px;
        animation: slideUp 0.4s ease-out 0.2s both;
      ">DEAD</h1>
      <div class="stats" style="
        text-align: center;
        margin-bottom: 40px;
        animation: slideUp 0.4s ease-out 0.4s both;
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
        animation: slideUp 0.4s ease-out 0.6s both, pulse 2s ease-in-out 1s infinite;
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

  // ============================================================================
  // Styles
  // ============================================================================

  private static stylesInjected = false;
  private injectStyles(): void {
    if (GameScreens.stylesInjected) return;
    GameScreens.stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInRed {
        from { background: rgba(80, 0, 0, 0); }
        to { background: rgba(20, 0, 0, 0.85); }
      }
      @keyframes fadeInBlue {
        from { background: rgba(0, 80, 120, 0); }
        to { background: rgba(0, 30, 60, 0.9); }
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes victoryGlow {
        0%, 100% { text-shadow: 0 0 30px #00ffff, 0 0 60px #00ffff; }
        50% { text-shadow: 0 0 50px #00ffff, 0 0 100px #00ffff, 0 0 150px #00ffff; }
      }
    `;
    document.head.appendChild(style);
  }
}
