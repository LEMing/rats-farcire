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

  constructor() {
    const container = document.getElementById('game-container')!;

    this.renderer = new Renderer(container);
    this.input = new InputManager(container);
    this.entities = new EntityManager(this.renderer);
    this.ui = new UIManager();

    // Initial resize
    this.resize();
  }

  start(multiplayer: boolean): void {
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

    // Create local game loop
    this.localLoop = new LocalGameLoop(this.mapData, this.entities, this.ui);

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
    // Update entity visuals with interpolation
    this.entities.updateVisuals(alpha);

    // Update crosshair position
    this.ui.updateCrosshair(this.input.mouseX, this.input.mouseY);

    // Update camera to follow player
    const playerPos = this.entities.getLocalPlayerPosition();
    if (playerPos) {
      this.renderer.updateCamera(playerPos);
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
