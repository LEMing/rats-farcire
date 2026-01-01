import { Renderer } from '../rendering/Renderer';
import { InputManager } from '../input/InputManager';
import { EntityManager } from '../ecs/EntityManager';
import { MapGenerator } from '../map/MapGenerator';
import { NetworkClient } from '../network/NetworkClient';
import { UIManager } from '../ui/UIManager';
import { LocalGameLoop } from './LocalGameLoop';
import { createAudioManager, getAudioManager } from '../audio/AudioManager';
import { PauseMenu } from '../ui/PauseMenu';
import { TutorialOverlay } from '../ui/components/TutorialOverlay';
import { debug } from '../utils/debug';
import type { MapData, InputState } from '@shared/types';
import { TICK_RATE, MAP_WIDTH, MAP_HEIGHT } from '@shared/constants';
import type { IRenderer, IInputManager, IUIManager, IGameLoop, GameConfig } from './interfaces';

// ============================================================================
// Main Game Controller
// Supports dependency injection for testing while providing sensible defaults
// ============================================================================

/**
 * Dependencies that can be injected for testing
 */
export interface GameDependencies {
  renderer?: IRenderer;
  input?: IInputManager;
  ui?: IUIManager;
  container?: HTMLElement;
}

export class Game {
  private renderer: IRenderer;
  private input: IInputManager;
  private entities: EntityManager;
  private ui: IUIManager;
  private network: NetworkClient | null = null;
  private localLoop: IGameLoop | null = null;

  private mapData: MapData | null = null;
  private isMultiplayer = false;
  private isRunning = false;
  private lastTime = 0;
  private accumulator = 0;
  private readonly tickInterval: number;

  // Hitstop system
  private hitstopTimer = 0;
  private readonly hitstopDuration: number;

  // Slow-mo system for multi-kills
  private timeScale = 1.0;
  private slowMoTimer = 0;
  private slowMoTargetScale = 1.0;
  private readonly SLOWMO_LERP_SPEED = 8.0; // How fast to transition to/from slow-mo

  // Game time for effects
  private gameTime = 0;

  // Pause system
  private isPaused = false;
  private lastEscapeState = false;
  private pauseMenu: PauseMenu | null = null;

  // Tutorial system
  private tutorialOverlay: TutorialOverlay | null = null;
  private isTutorialActive = false;

  /**
   * Create a new Game instance
   * @param deps Optional dependencies for testing/customization
   * @param config Optional configuration overrides
   */
  constructor(deps: GameDependencies = {}, config: GameConfig = {}) {
    const container = deps.container ?? document.getElementById('game-container')!;

    // Use injected dependencies or create defaults
    this.renderer = deps.renderer ?? new Renderer(container);
    this.input = deps.input ?? new InputManager(container);
    this.ui = deps.ui ?? new UIManager();
    // Note: EntityManager requires concrete Renderer for Three.js scene access
    this.entities = new EntityManager(this.renderer as Renderer);

    // Apply configuration with defaults
    this.tickInterval = 1000 / (config.tickRate ?? TICK_RATE);
    this.hitstopDuration = config.hitstopDuration ?? 35; // ms - punchy hit feedback

    // Mouse wheel zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 : -1; // Positive = zoom out, negative = zoom in
      this.renderer.adjustZoom(delta);
    }, { passive: false });

    // Initial resize
    this.resize();
  }

  async start(multiplayer: boolean, preloadedBuffers?: Map<string, ArrayBuffer>): Promise<void> {
    // Initialize WebGPU renderer
    await this.renderer.init();

    // Note: AudioManager requires Three.js camera for spatial audio positioning
    const audioManager = createAudioManager((this.renderer as Renderer).camera);
    await audioManager.init(preloadedBuffers);

    // Initialize pause menu
    this.pauseMenu = new PauseMenu(() => this.togglePause());

    this.isMultiplayer = multiplayer;

    // Enable touch controls only on touch devices
    if (this.input.isTouchAvailable?.()) {
      this.input.enableTouchControls?.();
    }

    if (multiplayer) {
      this.startMultiplayer();
    } else {
      this.startSingleplayer();
    }
  }

  private startSingleplayer(): void {
    // Generate map locally
    const generator = new MapGenerator(MAP_WIDTH, MAP_HEIGHT, Date.now());
    this.mapData = generator.generate();

    // Note: LocalGameLoop requires concrete types for physics and Three.js integration
    this.localLoop = new LocalGameLoop(
      this.mapData,
      this.entities,
      this.ui as UIManager,
      this.renderer as Renderer
    );

    // Initialize minimap with map data
    this.ui.initMinimap(this.mapData);

    // Set up hitstop callback
    this.localLoop.onHitstop = () => {
      this.hitstopTimer = this.hitstopDuration;
    };

    // Set up death callback
    this.localLoop.onPlayerDeath = (score, wave, maxCombo) => {
      // Delay game over screen slightly for dramatic effect
      setTimeout(() => {
        this.isRunning = false;
        this.ui.showGameOver(score, wave, maxCombo);
      }, 800);
    };

    // Set up victory callback
    this.localLoop.onGameWin = (score, wave, maxCombo) => {
      // Delay victory screen slightly for dramatic effect
      setTimeout(() => {
        this.isRunning = false;
        this.ui.showVictory(score, wave, maxCombo);
      }, 500);
    };

    // Set up slow-mo callback for multi-kills
    (this.ui as UIManager).setSlowMoCallback((scale, duration) => {
      this.triggerSlowMo(scale, duration);
    });

    // Build map visuals
    this.renderer.buildMap(this.mapData);

    // Spawn player
    const spawnPoint = this.mapData.spawnPoints[0];
    this.localLoop.spawnLocalPlayer(spawnPoint);

    // Show tutorial overlay
    this.showTutorial();

    // Start game loop (paused during tutorial)
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));

    debug.log('Singleplayer game started');
  }

  private startMultiplayer(): void {
    this.network = new NetworkClient();

    this.network.onConnected = () => {
      this.ui.setConnectionStatus('Connected');
      this.network!.join('Player');
    };

    this.network.onJoined = (playerId, mapData) => {
      this.mapData = mapData;
      this.renderer.buildMap(mapData);
      this.entities.setLocalPlayerId(playerId);

      this.isRunning = true;
      this.lastTime = performance.now();
      requestAnimationFrame(this.gameLoop.bind(this));

      debug.log('Multiplayer game started, playerId:', playerId);
    };

    this.network.onStateUpdate = (state) => {
      this.entities.applyServerState(state);
      this.ui.update({
        wave: state.wave,
        enemiesLeft: state.waveEnemiesRemaining,
        score: state.players.find(([id]) => id === this.entities.localPlayerId)?.[1].score ?? 0,
        health: state.players.find(([id]) => id === this.entities.localPlayerId)?.[1].health ?? 0,
        maxHealth: state.players.find(([id]) => id === this.entities.localPlayerId)?.[1].maxHealth ?? 100,
      });
    };

    this.network.onPong = (ping) => {
      this.ui.setPing(ping);
    };

    this.network.onDisconnected = () => {
      this.ui.setConnectionStatus('Disconnected');
      this.isRunning = false;
    };

    this.network.connect();
    this.ui.setConnectionStatus('Connecting...');
  }

  private gameLoop(currentTime: number): void {
    if (!this.isRunning) return;

    const rawDeltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Update slow-mo system
    this.updateSlowMo(rawDeltaTime / 1000); // Convert to seconds

    // Apply time scaling to delta time
    const deltaTime = rawDeltaTime * this.timeScale;
    this.accumulator += deltaTime;

    // Fixed timestep for game logic (scaled by timeScale)
    const scaledTickInterval = this.tickInterval * this.timeScale;
    while (this.accumulator >= scaledTickInterval && scaledTickInterval > 0) {
      this.fixedUpdate();
      this.accumulator -= scaledTickInterval;
    }

    // Interpolation factor for rendering
    const alpha = scaledTickInterval > 0 ? this.accumulator / scaledTickInterval : 0;
    this.render(alpha, rawDeltaTime);

    requestAnimationFrame(this.gameLoop.bind(this));
  }

  /**
   * Trigger slow-motion effect
   * @param scale Time scale (0.4 = 40% speed, very slow; 0.8 = 80% speed, subtle)
   * @param duration Duration in milliseconds
   */
  triggerSlowMo(scale: number, duration: number): void {
    this.slowMoTargetScale = Math.max(0.2, Math.min(1.0, scale));
    this.slowMoTimer = duration;
  }

  /**
   * Update slow-mo system - smoothly lerp time scale
   */
  private updateSlowMo(dtSeconds: number): void {
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= dtSeconds * 1000; // Timer in ms
      // Lerp towards target scale
      this.timeScale += (this.slowMoTargetScale - this.timeScale) * this.SLOWMO_LERP_SPEED * dtSeconds;
    } else {
      // Lerp back to normal speed
      this.timeScale += (1.0 - this.timeScale) * this.SLOWMO_LERP_SPEED * dtSeconds;
    }

    // Clamp to prevent floating point drift
    if (Math.abs(this.timeScale - 1.0) < 0.01 && this.slowMoTimer <= 0) {
      this.timeScale = 1.0;
    }
  }

  private fixedUpdate(): void {
    const inputState = this.input.getState();

    // Handle ESC key for pause (edge detection)
    const escapePressed = inputState.escapePressed && !this.lastEscapeState;
    this.lastEscapeState = inputState.escapePressed;

    if (escapePressed && this.isRunning) {
      this.togglePause();
    }

    // Skip game logic when paused or tutorial active
    if (this.isPaused || this.isTutorialActive) {
      return;
    }

    // Hitstop - pause game logic briefly
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= this.tickInterval;
      return;
    }

    if (this.isMultiplayer && this.network) {
      // Send input to server
      this.network.sendInput(inputState);
    } else if (this.localLoop) {
      // Process locally
      this.localLoop.update(inputState, this.tickInterval);
    }
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;

    if (this.isPaused) {
      this.pauseMenu?.show();
      document.body.style.cursor = 'auto';
      // Pause music
      getAudioManager()?.pauseMusic();
    } else {
      this.pauseMenu?.hide();
      document.body.style.cursor = 'none';
      // Resume music
      getAudioManager()?.resumeMusic();
    }

    debug.log('Game', this.isPaused ? 'paused' : 'resumed');
  }

  private showTutorial(): void {
    this.isTutorialActive = true;
    document.body.style.cursor = 'auto';

    this.tutorialOverlay = new TutorialOverlay();
    this.tutorialOverlay.setOnDismiss(() => {
      this.isTutorialActive = false;
      this.tutorialOverlay = null;
      document.body.style.cursor = 'none';

      // Start music after tutorial
      getAudioManager()?.playMusic('ambient');

      debug.log('Tutorial dismissed, game starting');
    });
  }

  private render(alpha: number, rawDeltaTime: number = 16): void {
    // Track game time for effects (scaled by time scale for consistent look)
    this.gameTime += rawDeltaTime * this.timeScale;

    // Delta time in seconds for updates
    const dtSeconds = rawDeltaTime / 1000;
    const scaledDt = dtSeconds * this.timeScale;

    // Update entity visuals with interpolation
    this.entities.updateVisuals(alpha);

    // Update particles - use scaled time for slow-mo effect on blood/gibs
    this.renderer.updateParticles(scaledDt);

    // Update torch flickering
    this.renderer.updateTorches(this.gameTime);

    // Update TARDIS effects
    this.renderer.updateTardis(scaledDt);

    // Update power cell animations
    this.renderer.updatePowerCells();

    // Update thermobaric explosion effects
    this.renderer.updateThermobaricEffects();

    // Update crosshair position
    this.ui.updateCrosshair(this.input.mouseX, this.input.mouseY);

    // Update camera to follow player with aim look-ahead
    const playerPos = this.entities.getLocalPlayerPosition();
    if (playerPos) {
      const inputState = this.input.getState();
      this.renderer.updateCamera(playerPos, { x: inputState.aimX, y: inputState.aimY });
    }

    // Render scene
    this.renderer.render();
  }

  resize(): void {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  getInputState(): InputState {
    return this.input.getState();
  }
}
