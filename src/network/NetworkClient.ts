import type {
  ClientMessage,
  ServerMessage,
  InputState,
  SerializedGameState,
  MapData,
} from '@shared/types';
import { SERVER_PORT } from '@shared/constants';
import { debug } from '../utils/debug';

// Server URL - injected by Vite at build time
declare const __WS_SERVER_URL__: string | undefined;

// Get WebSocket URL based on environment
function getServerUrl(): string {
  // Use injected production URL if available
  if (typeof __WS_SERVER_URL__ !== 'undefined' && __WS_SERVER_URL__) {
    return __WS_SERVER_URL__;
  }
  // Fallback to localhost for development
  return `ws://localhost:${SERVER_PORT}`;
}

// ============================================================================
// WebSocket Network Client
// ============================================================================

export class NetworkClient {
  private socket: WebSocket | null = null;
  private connected = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPingTime = 0;

  // Callbacks
  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;
  public onJoined: ((playerId: string, mapData: MapData) => void) | null = null;
  public onStateUpdate: ((state: SerializedGameState) => void) | null = null;
  public onPong: ((ping: number) => void) | null = null;
  public onPlayerJoined: ((playerId: string, name: string) => void) | null = null;
  public onPlayerLeft: ((playerId: string) => void) | null = null;
  public onWaveStart: ((wave: number, enemyCount: number) => void) | null = null;
  public onWaveComplete: ((wave: number) => void) | null = null;
  public onGameOver: ((scores: { playerId: string; score: number }[]) => void) | null = null;

  connect(url?: string): void {
    const wsUrl = url ?? getServerUrl();

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        debug.log('WebSocket connected');
        this.connected = true;
        this.startPing();
        this.onConnected?.();
      };

      this.socket.onclose = () => {
        debug.log('WebSocket disconnected');
        this.connected = false;
        this.stopPing();
        this.onDisconnected?.();
      };

      this.socket.onerror = (error) => {
        debug.error('WebSocket error:', error);
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      debug.error('Failed to connect:', error);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.send({ type: 'leave', payload: {} });
      this.socket.close();
      this.socket = null;
    }
    this.stopPing();
  }

  private handleMessage(data: string): void {
    try {
      const message: ServerMessage = JSON.parse(data);

      switch (message.type) {
        case 'joined':
          this.onJoined?.(message.payload.playerId, message.payload.mapData);
          break;

        case 'state':
          this.onStateUpdate?.(message.payload);
          break;

        case 'pong': {
          const ping = Date.now() - this.lastPingTime;
          this.onPong?.(ping);
          break;
        }

        case 'playerJoined':
          this.onPlayerJoined?.(message.payload.playerId, message.payload.name);
          break;

        case 'playerLeft':
          this.onPlayerLeft?.(message.payload.playerId);
          break;

        case 'waveStart':
          this.onWaveStart?.(message.payload.wave, message.payload.enemyCount);
          break;

        case 'waveComplete':
          this.onWaveComplete?.(message.payload.wave);
          break;

        case 'gameOver':
          this.onGameOver?.(message.payload.scores);
          break;

        case 'damage':
        case 'death':
          // These can be used for visual/audio effects
          break;
      }
    } catch (error) {
      debug.error('Failed to parse message:', error);
    }
  }

  private send(message: ClientMessage): void {
    if (this.socket && this.connected) {
      this.socket.send(JSON.stringify(message));
    }
  }

  join(name: string): void {
    this.send({ type: 'join', payload: { name } });
  }

  sendInput(input: InputState): void {
    this.send({ type: 'input', payload: input });
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.lastPingTime = Date.now();
      this.send({ type: 'ping', payload: { timestamp: this.lastPingTime } });
    }, 1000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
