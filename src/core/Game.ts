import { Renderer } from '../rendering/Renderer';
import { InputManager } from '../input/InputManager';
import { EntityManager } from '../ecs/EntityManager';
import { MapGenerator } from '../map/MapGenerator';
import { NetworkClient } from '../network/NetworkClient';
import { UIManager } from '../ui/UIManager';
import { LocalGameLoop } from './LocalGameLoop';
import type { MapData, InputState } from '@shared/types';
import { TICK_RATE, MAP_WIDTH, MAP_HEIGHT } from '@shared/constants';

// ============================================================================
// Main Game Controller
// ============================================================================

export class Game {
  private renderer: Renderer;
  private input: InputManager;
  private entities: EntityManager;
  private ui: UIManager;
  private network: NetworkClient | null = null;
  private localLoop: LocalGameLoop | null = null;

  private mapData: MapData | null = null;
  private isMultiplayer = false;
  private isRunning = false;
  private lastTime = 0;
  private accumulator = 0;
  private readonly tickInterval = 1000 / TICK_RATE;

  // Hitstop system
  private hitstopTimer = 0;
  private readonly HITSTOP_DURATION = 8; // ms - subtle punch, not annoying with shotgun

  // Game time for effects
  private gameTime = 0;

  constructor() {
    const container = document.getElementById('game-container')!;

    this.renderer = new Renderer(container);
    this.input = new InputManager(container);
    this.entities = new EntityManager(this.renderer);
    this.ui = new UIManager();

    // Initial resize
    this.resize();
  }

  async start(multiplayer: boolean): Promise<void> {
    // Initialize WebGPU renderer
    await this.renderer.init();

    this.isMultiplayer = multiplayer;

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

    // Create local game loop with renderer for effects
    this.localLoop = new LocalGameLoop(this.mapData, this.entities, this.ui, this.renderer);

    // Set up hitstop callback
    this.localLoop.onHitstop = () => {
      this.hitstopTimer = this.HITSTOP_DURATION;
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

    // Build map visuals
    this.renderer.buildMap(this.mapData);

    // Spawn player
    const spawnPoint = this.mapData.spawnPoints[0];
    this.localLoop.spawnLocalPlayer(spawnPoint);

    // Start game loop
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));

    console.log('Singleplayer game started');
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

      console.log('Multiplayer game started, playerId:', playerId);
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

    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    this.accumulator += deltaTime;

    // Fixed timestep for game logic
    while (this.accumulator >= this.tickInterval) {
      this.fixedUpdate();
      this.accumulator -= this.tickInterval;
    }

    // Interpolation factor for rendering
    const alpha = this.accumulator / this.tickInterval;
    this.render(alpha);

    requestAnimationFrame(this.gameLoop.bind(this));
  }

  private fixedUpdate(): void {
    // Hitstop - pause game logic briefly
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= this.tickInterval;
      return;
    }

    const inputState = this.input.getState();

    if (this.isMultiplayer && this.network) {
      // Send input to server
      this.network.sendInput(inputState);
    } else if (this.localLoop) {
      // Process locally
      this.localLoop.update(inputState, this.tickInterval);
    }
  }

  private render(alpha: number): void {
    // Track game time for effects
    this.gameTime += 16; // Approx 60fps

    // Update entity visuals with interpolation
    this.entities.updateVisuals(alpha);

    // Update particles
    this.renderer.updateParticles(0.016); // 60fps dt

    // Update torch flickering
    this.renderer.updateTorches(this.gameTime);

    // Update TARDIS effects
    this.renderer.updateTardis(0.016);

    // Update power cell animations
    this.renderer.updatePowerCells();

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
