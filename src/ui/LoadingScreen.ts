/**
 * LoadingScreen - Shows loading progress with file details
 */

import type { LoadProgress } from '../assets/AssetLoader';

export class LoadingScreen {
  private container: HTMLElement;
  private progressFill: HTMLElement;
  private statusText: HTMLElement;
  private detailsText: HTMLElement;
  private bytesText: HTMLElement;

  constructor() {
    this.container = this.createUI();
    this.progressFill = this.container.querySelector('.loading-progress-fill')!;
    this.statusText = this.container.querySelector('.loading-status')!;
    this.detailsText = this.container.querySelector('.loading-details')!;
    this.bytesText = this.container.querySelector('.loading-bytes')!;
  }

  private createUI(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'loading-screen';
    container.innerHTML = `
      <div class="loading-content">
        <h1 class="loading-title">RATS FARCIRE</h1>
        <div class="loading-subtitle">Loading assets...</div>

        <div class="loading-progress-bar">
          <div class="loading-progress-fill"></div>
        </div>

        <div class="loading-info">
          <div class="loading-status">Initializing...</div>
          <div class="loading-details"></div>
          <div class="loading-bytes"></div>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #loading-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #0a0510 0%, #1a0a25 50%, #0f0518 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        font-family: 'Courier New', monospace;
      }

      #loading-screen.hidden {
        display: none;
      }

      .loading-content {
        text-align: center;
        max-width: 500px;
        width: 90%;
      }

      .loading-title {
        font-size: 48px;
        color: #aa22ff;
        text-shadow: 0 0 30px rgba(170, 34, 255, 0.8),
                     0 0 60px rgba(170, 34, 255, 0.4);
        margin: 0 0 10px 0;
        letter-spacing: 8px;
        animation: pulse 2s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .loading-subtitle {
        font-size: 16px;
        color: #888;
        margin-bottom: 40px;
        letter-spacing: 2px;
      }

      .loading-progress-bar {
        width: 100%;
        height: 24px;
        background: rgba(30, 15, 40, 0.8);
        border: 2px solid rgba(170, 34, 255, 0.4);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 0 20px rgba(170, 34, 255, 0.2),
                    inset 0 2px 10px rgba(0, 0, 0, 0.5);
      }

      .loading-progress-fill {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg,
          #6a22aa 0%,
          #aa22ff 50%,
          #cc44ff 100%);
        border-radius: 10px;
        transition: width 0.15s ease-out;
        box-shadow: 0 0 20px rgba(170, 34, 255, 0.6);
        position: relative;
      }

      .loading-progress-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 50%;
        background: linear-gradient(180deg,
          rgba(255, 255, 255, 0.3) 0%,
          transparent 100%);
        border-radius: 10px 10px 0 0;
      }

      .loading-info {
        margin-top: 20px;
        text-align: left;
      }

      .loading-status {
        font-size: 14px;
        color: #ffcc00;
        margin-bottom: 8px;
      }

      .loading-details {
        font-size: 12px;
        color: #888;
        margin-bottom: 4px;
      }

      .loading-bytes {
        font-size: 13px;
        color: #aa22ff;
        font-weight: bold;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);

    return container;
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
  }

  updateProgress(progress: LoadProgress): void {
    const percent = progress.total > 0
      ? Math.round((progress.loaded / progress.total) * 100)
      : 0;

    this.progressFill.style.width = `${percent}%`;

    // Status text
    const cacheStatus = progress.fromCache ? ' (cached)' : '';
    this.statusText.textContent = `Loading: ${progress.currentFile}${cacheStatus}`;

    // Details
    this.detailsText.textContent = `File ${progress.filesLoaded + 1} of ${progress.filesTotal}`;

    // Bytes progress
    const loadedMB = (progress.loaded / (1024 * 1024)).toFixed(1);
    const totalMB = (progress.total / (1024 * 1024)).toFixed(1);
    this.bytesText.textContent = `${loadedMB} MB / ${totalMB} MB (${percent}%)`;
  }

  setStatus(status: string): void {
    this.statusText.textContent = status;
  }

  setComplete(): void {
    this.progressFill.style.width = '100%';
    this.statusText.textContent = 'Loading complete!';
    this.detailsText.textContent = '';
    this.bytesText.textContent = '';
  }

  dispose(): void {
    this.container.remove();
  }
}
