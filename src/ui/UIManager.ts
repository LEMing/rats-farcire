// ============================================================================
// UI Manager - HUD and overlay management
// ============================================================================

export interface UIState {
  wave: number;
  enemiesLeft: number;
  score: number;
  health: number;
  maxHealth: number;
  ammo?: number;
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
  };

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
    };
  }

  update(state: UIState): void {
    // Health bar
    const healthPercent = (state.health / state.maxHealth) * 100;
    this.elements.healthFill.style.width = `${healthPercent}%`;

    // Change health bar color based on health
    if (healthPercent <= 25) {
      this.elements.healthFill.style.background = 'linear-gradient(90deg, #ff0000, #ff3333)';
    } else if (healthPercent <= 50) {
      this.elements.healthFill.style.background = 'linear-gradient(90deg, #ff6600, #ff9933)';
    } else {
      this.elements.healthFill.style.background = 'linear-gradient(90deg, #ff4444, #ff6666)';
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

  showGameOver(score: number): void {
    const overlay = document.getElementById('ui-overlay')!;

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
      background: rgba(0, 0, 0, 0.8);
      pointer-events: auto;
    `;

    gameOverDiv.innerHTML = `
      <h1 style="font-size: 64px; color: #ff0000; margin-bottom: 20px;">GAME OVER</h1>
      <p style="font-size: 32px; color: #fff; margin-bottom: 40px;">Final Score: ${score}</p>
      <button id="btn-restart" style="
        padding: 15px 40px;
        font-size: 20px;
        cursor: pointer;
        background: #4a4a8a;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-family: inherit;
      ">Play Again</button>
    `;

    overlay.appendChild(gameOverDiv);

    document.getElementById('btn-restart')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}
