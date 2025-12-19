/**
 * Settings Manager - Handles game settings with localStorage persistence
 */

export type ControlScheme = 'player-relative' | 'camera-relative';

export interface GameSettings {
  controlScheme: ControlScheme;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  aimAssist: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  controlScheme: 'player-relative',
  masterVolume: 1.0,
  sfxVolume: 1.0,
  musicVolume: 0.25,
  aimAssist: true,
};

export class Settings {
  private static readonly STORAGE_KEY = 'rats-farcire-settings';
  private static instance: Settings | null = null;

  private _settings: GameSettings;
  private listeners: Array<(settings: GameSettings) => void> = [];

  private constructor() {
    this._settings = this.load();
  }

  static getInstance(): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings();
    }
    return Settings.instance;
  }

  get settings(): GameSettings {
    return { ...this._settings };
  }

  get controlScheme(): ControlScheme {
    return this._settings.controlScheme;
  }

  get masterVolume(): number {
    return this._settings.masterVolume;
  }

  get sfxVolume(): number {
    return this._settings.sfxVolume;
  }

  get musicVolume(): number {
    return this._settings.musicVolume;
  }

  get aimAssist(): boolean {
    return this._settings.aimAssist;
  }

  setControlScheme(scheme: ControlScheme): void {
    this._settings.controlScheme = scheme;
    this.save();
    this.notifyListeners();
  }

  setMasterVolume(volume: number): void {
    this._settings.masterVolume = Math.max(0, Math.min(1, volume));
    this.save();
    this.notifyListeners();
  }

  setSfxVolume(volume: number): void {
    this._settings.sfxVolume = Math.max(0, Math.min(1, volume));
    this.save();
    this.notifyListeners();
  }

  setMusicVolume(volume: number): void {
    this._settings.musicVolume = Math.max(0, Math.min(1, volume));
    this.save();
    this.notifyListeners();
  }

  setAimAssist(enabled: boolean): void {
    this._settings.aimAssist = enabled;
    this.save();
    this.notifyListeners();
  }

  /**
   * Subscribe to settings changes
   */
  onChange(listener: (settings: GameSettings) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    const settings = this.settings;
    for (const listener of this.listeners) {
      listener(settings);
    }
  }

  private load(): GameSettings {
    try {
      const stored = localStorage.getItem(Settings.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle missing properties
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch {
      // Ignore localStorage errors (e.g., private browsing)
    }
    return { ...DEFAULT_SETTINGS };
  }

  private save(): void {
    try {
      localStorage.setItem(Settings.STORAGE_KEY, JSON.stringify(this._settings));
    } catch {
      // Ignore localStorage errors
    }
  }

  reset(): void {
    this._settings = { ...DEFAULT_SETTINGS };
    this.save();
    this.notifyListeners();
  }
}
