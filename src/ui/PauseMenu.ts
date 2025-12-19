/**
 * PauseMenu - In-game pause menu with settings
 */

import { Settings, type ControlScheme, type GameSettings } from '../settings/Settings';
import { getAudioManager } from '../audio/AudioManager';

export class PauseMenu {
  private container: HTMLElement;
  private settings: Settings;
  private onResume: () => void;

  constructor(onResume: () => void) {
    this.onResume = onResume;
    this.settings = Settings.getInstance();
    this.container = this.createUI();
    this.bindEvents();

    // Listen for settings changes
    this.settings.onChange((settings) => this.updateUI(settings));
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.updateUI(this.settings.settings);
  }

  hide(): void {
    this.container.classList.add('hidden');
  }

  toggle(visible: boolean): void {
    if (visible) {
      this.show();
    } else {
      this.hide();
    }
  }

  private createUI(): HTMLElement {
    const overlay = document.getElementById('ui-overlay')!;

    const container = document.createElement('div');
    container.id = 'pause-menu';
    container.className = 'hidden';
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background: rgba(10, 5, 15, 0.9);
      backdrop-filter: blur(4px);
      z-index: 80;
      pointer-events: auto;
    `;

    container.innerHTML = `
      <div class="pause-content" style="
        background: rgba(15, 8, 20, 0.95);
        border: 2px solid rgba(170, 34, 255, 0.4);
        border-radius: 12px;
        padding: 30px 40px;
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 0 40px rgba(170, 34, 255, 0.2);
      ">
        <h1 style="
          text-align: center;
          color: #aa22ff;
          font-size: 36px;
          margin: 0 0 20px 0;
          text-shadow: 0 0 20px rgba(170, 34, 255, 0.8);
          letter-spacing: 4px;
        ">PAUSED</h1>

        <!-- Controls Section -->
        <div class="controls-section" style="margin-bottom: 25px;">
          <h2 style="
            color: #ffcc00;
            font-size: 18px;
            margin: 0 0 12px 0;
            text-transform: uppercase;
            letter-spacing: 2px;
            border-bottom: 1px solid rgba(255, 204, 0, 0.3);
            padding-bottom: 8px;
          ">Controls</h2>
          <div class="controls-grid" style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            font-size: 14px;
            color: #ccc;
          ">
            <div><span style="color: #fff; font-weight: bold;">WASD / Arrows</span> - Move</div>
            <div><span style="color: #fff; font-weight: bold;">Mouse</span> - Aim</div>
            <div><span style="color: #fff; font-weight: bold;">LMB</span> - Shoot</div>
            <div><span style="color: #fff; font-weight: bold;">Space</span> - Dash</div>
            <div><span style="color: #fff; font-weight: bold;">E</span> - Interact</div>
            <div><span style="color: #fff; font-weight: bold;">R</span> - Reload</div>
            <div><span style="color: #fff; font-weight: bold;">1-5</span> - Switch Weapon</div>
            <div><span style="color: #fff; font-weight: bold;">F</span> - Thermobaric</div>
            <div><span style="color: #fff; font-weight: bold;">ESC</span> - Pause</div>
          </div>
        </div>

        <!-- Settings Section -->
        <div class="settings-section" style="margin-bottom: 25px;">
          <h2 style="
            color: #ffcc00;
            font-size: 18px;
            margin: 0 0 12px 0;
            text-transform: uppercase;
            letter-spacing: 2px;
            border-bottom: 1px solid rgba(255, 204, 0, 0.3);
            padding-bottom: 8px;
          ">Settings</h2>

          <!-- Movement Scheme -->
          <div class="setting-group" style="margin-bottom: 20px;">
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">Movement:</div>
            <label style="
              display: flex;
              align-items: center;
              color: #ccc;
              font-size: 13px;
              cursor: pointer;
              margin-bottom: 6px;
            ">
              <input type="radio" name="control-scheme" value="player-relative"
                style="margin-right: 8px; accent-color: #aa22ff;">
              Relative to aim <span style="color: #888; margin-left: 8px;">(W = toward cursor)</span>
            </label>
            <label style="
              display: flex;
              align-items: center;
              color: #ccc;
              font-size: 13px;
              cursor: pointer;
            ">
              <input type="radio" name="control-scheme" value="camera-relative"
                style="margin-right: 8px; accent-color: #aa22ff;">
              Relative to camera <span style="color: #888; margin-left: 8px;">(W = up on screen)</span>
            </label>
          </div>

          <!-- Aim Assist -->
          <div class="setting-group" style="margin-bottom: 20px;">
            <label style="
              display: flex;
              align-items: center;
              color: #ccc;
              font-size: 13px;
              cursor: pointer;
            ">
              <input type="checkbox" id="aim-assist" checked
                style="margin-right: 8px; accent-color: #aa22ff; width: 16px; height: 16px;">
              <span style="color: #fff;">Aim Assist</span>
              <span style="color: #888; margin-left: 8px;">(slight pull toward enemies)</span>
            </label>
          </div>

          <!-- Volume Sliders -->
          <div class="volume-controls" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="volume-control">
              <label style="display: flex; justify-content: space-between; color: #ccc; font-size: 13px; margin-bottom: 4px;">
                <span>Master Volume</span>
                <span id="master-volume-value">100%</span>
              </label>
              <input type="range" id="master-volume" min="0" max="100" value="100" style="
                width: 100%;
                height: 6px;
                accent-color: #aa22ff;
                cursor: pointer;
              ">
            </div>
            <div class="volume-control">
              <label style="display: flex; justify-content: space-between; color: #ccc; font-size: 13px; margin-bottom: 4px;">
                <span>SFX Volume</span>
                <span id="sfx-volume-value">100%</span>
              </label>
              <input type="range" id="sfx-volume" min="0" max="100" value="100" style="
                width: 100%;
                height: 6px;
                accent-color: #aa22ff;
                cursor: pointer;
              ">
            </div>
            <div class="volume-control">
              <label style="display: flex; justify-content: space-between; color: #ccc; font-size: 13px; margin-bottom: 4px;">
                <span>Music Volume</span>
                <span id="music-volume-value">25%</span>
              </label>
              <input type="range" id="music-volume" min="0" max="100" value="25" style="
                width: 100%;
                height: 6px;
                accent-color: #aa22ff;
                cursor: pointer;
              ">
            </div>
          </div>
        </div>

        <!-- Buttons -->
        <div class="pause-buttons" style="
          display: flex;
          justify-content: center;
          gap: 15px;
          margin-top: 20px;
        ">
          <button id="btn-resume" style="
            padding: 12px 30px;
            font-size: 16px;
            font-weight: bold;
            color: #fff;
            background: linear-gradient(180deg, #6a22aa 0%, #4a1188 100%);
            border: 2px solid #aa22ff;
            border-radius: 6px;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 2px;
            transition: all 0.2s;
          ">Resume</button>
          <button id="btn-quit" style="
            padding: 12px 30px;
            font-size: 16px;
            font-weight: bold;
            color: #ccc;
            background: rgba(60, 60, 60, 0.5);
            border: 2px solid #666;
            border-radius: 6px;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 2px;
            transition: all 0.2s;
          ">Quit to Menu</button>
        </div>
      </div>
    `;

    overlay.appendChild(container);
    return container;
  }

  private bindEvents(): void {
    // Resume button
    const btnResume = this.container.querySelector('#btn-resume') as HTMLButtonElement;
    btnResume.addEventListener('click', () => {
      this.onResume();
    });

    // Quit button
    const btnQuit = this.container.querySelector('#btn-quit') as HTMLButtonElement;
    btnQuit.addEventListener('click', () => {
      window.location.reload();
    });

    // Control scheme radio buttons
    const radioButtons = this.container.querySelectorAll('input[name="control-scheme"]');
    radioButtons.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.settings.setControlScheme(target.value as ControlScheme);
      });
    });

    // Aim assist checkbox
    const aimAssistCheckbox = this.container.querySelector('#aim-assist') as HTMLInputElement;
    aimAssistCheckbox.addEventListener('change', (e) => {
      this.settings.setAimAssist((e.target as HTMLInputElement).checked);
    });

    // Volume sliders
    const masterSlider = this.container.querySelector('#master-volume') as HTMLInputElement;
    const sfxSlider = this.container.querySelector('#sfx-volume') as HTMLInputElement;
    const musicSlider = this.container.querySelector('#music-volume') as HTMLInputElement;

    masterSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value) / 100;
      this.settings.setMasterVolume(value);
      this.updateVolumeDisplay('master', value);
      this.applyAudioSettings();
    });

    sfxSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value) / 100;
      this.settings.setSfxVolume(value);
      this.updateVolumeDisplay('sfx', value);
      this.applyAudioSettings();
    });

    musicSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value) / 100;
      this.settings.setMusicVolume(value);
      this.updateVolumeDisplay('music', value);
      this.applyAudioSettings();
    });

    // Button hover effects
    btnResume.addEventListener('mouseenter', () => {
      btnResume.style.transform = 'scale(1.05)';
      btnResume.style.boxShadow = '0 0 20px rgba(170, 34, 255, 0.5)';
    });
    btnResume.addEventListener('mouseleave', () => {
      btnResume.style.transform = 'scale(1)';
      btnResume.style.boxShadow = 'none';
    });

    btnQuit.addEventListener('mouseenter', () => {
      btnQuit.style.transform = 'scale(1.05)';
    });
    btnQuit.addEventListener('mouseleave', () => {
      btnQuit.style.transform = 'scale(1)';
    });
  }

  private updateUI(settings: GameSettings): void {
    // Update radio buttons
    const radioButtons = this.container.querySelectorAll('input[name="control-scheme"]') as NodeListOf<HTMLInputElement>;
    radioButtons.forEach((radio) => {
      radio.checked = radio.value === settings.controlScheme;
    });

    // Update aim assist checkbox
    const aimAssistCheckbox = this.container.querySelector('#aim-assist') as HTMLInputElement;
    if (aimAssistCheckbox) {
      aimAssistCheckbox.checked = settings.aimAssist;
    }

    // Update volume sliders
    const masterSlider = this.container.querySelector('#master-volume') as HTMLInputElement;
    const sfxSlider = this.container.querySelector('#sfx-volume') as HTMLInputElement;
    const musicSlider = this.container.querySelector('#music-volume') as HTMLInputElement;

    masterSlider.value = String(Math.round(settings.masterVolume * 100));
    sfxSlider.value = String(Math.round(settings.sfxVolume * 100));
    musicSlider.value = String(Math.round(settings.musicVolume * 100));

    this.updateVolumeDisplay('master', settings.masterVolume);
    this.updateVolumeDisplay('sfx', settings.sfxVolume);
    this.updateVolumeDisplay('music', settings.musicVolume);
  }

  private updateVolumeDisplay(type: 'master' | 'sfx' | 'music', value: number): void {
    const display = this.container.querySelector(`#${type}-volume-value`) as HTMLSpanElement;
    if (display) {
      display.textContent = `${Math.round(value * 100)}%`;
    }
  }

  private applyAudioSettings(): void {
    const audioManager = getAudioManager();
    if (audioManager) {
      audioManager.updateVolumes(this.settings.settings);
    }
  }
}
