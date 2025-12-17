import { WebSocketServer, WebSocket } from 'ws';
import { GameRoom } from './GameRoom';
import type { ClientMessage, ServerMessage } from '../shared/types';
import { SERVER_PORT, MAX_PLAYERS_PER_ROOM } from '../shared/constants';

// ============================================================================
// Authoritative Game Server
// ============================================================================

interface Client {
  ws: WebSocket;
  id: string;
  name: string;
  roomId: string | null;
}

class GameServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private rooms: Map<string, GameRoom> = new Map();
  private defaultRoomId = 'default';

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    // Create default room
    this.createRoom(this.defaultRoomId);

    this.wss.on('connection', this.handleConnection.bind(this));

    console.log(`Game server running on port ${port}`);
  }

  private handleConnection(ws: WebSocket): void {
    const clientId = this.generateId();
    const client: Client = {
      ws,
      id: clientId,
      name: 'Player',
      roomId: null,
    };

    this.clients.set(clientId, client);
    console.log(`Client connected: ${clientId}`);

    ws.on('message', (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (error) => {
      console.error(`Client ${clientId} error:`, error);
    });
  }

  private handleMessage(client: Client, message: ClientMessage): void {
    switch (message.type) {
      case 'join':
        this.handleJoin(client, message.payload.name);
        break;

      case 'input':
        if (client.roomId) {
          const room = this.rooms.get(client.roomId);
          room?.handleInput(client.id, message.payload);
        }
        break;

      case 'ping':
        this.send(client.ws, {
          type: 'pong',
          payload: {
            timestamp: message.payload.timestamp,
            serverTime: Date.now(),
          },
        });
        break;

      case 'leave':
        this.handleLeave(client);
        break;
    }
  }

  private handleJoin(client: Client, name: string): void {
    client.name = name;

    // Find room with space or create new one
    let targetRoom: GameRoom | null = null;

    for (const room of this.rooms.values()) {
      if (room.playerCount < MAX_PLAYERS_PER_ROOM) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      const newRoomId = this.generateId();
      targetRoom = this.createRoom(newRoomId);
    }

    // Join room
    client.roomId = targetRoom.id;
    const playerData = targetRoom.addPlayer(client.id, client.name, client.ws);

    // Send joined confirmation with map data
    this.send(client.ws, {
      type: 'joined',
      payload: {
        playerId: client.id,
        mapData: targetRoom.mapData,
      },
    });

    // Notify other players
    targetRoom.broadcast(
      {
        type: 'playerJoined',
        payload: { playerId: client.id, name: client.name },
      },
      client.id
    );

    console.log(`${client.name} (${client.id}) joined room ${targetRoom.id}`);
  }

  private handleLeave(client: Client): void {
    if (client.roomId) {
      const room = this.rooms.get(client.roomId);
      if (room) {
        room.removePlayer(client.id);
        room.broadcast({
          type: 'playerLeft',
          payload: { playerId: client.id },
        });

        // Clean up empty rooms (except default)
        if (room.playerCount === 0 && room.id !== this.defaultRoomId) {
          room.stop();
          this.rooms.delete(room.id);
          console.log(`Room ${room.id} closed (empty)`);
        }
      }
    }
  }

  private handleDisconnect(client: Client): void {
    this.handleLeave(client);
    this.clients.delete(client.id);
    console.log(`Client disconnected: ${client.id}`);
  }

  private createRoom(roomId: string): GameRoom {
    const room = new GameRoom(roomId);
    this.rooms.set(roomId, room);
    room.start();
    console.log(`Room ${roomId} created`);
    return room;
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}

// Start server - use PORT env variable for Cloud Run, fallback to constant
const port = parseInt(process.env.PORT || String(SERVER_PORT), 10);
new GameServer(port);
