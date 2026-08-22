import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { wsLogger } from "./logger";

// ─── Event Types ─────────────────────────────────────────────────────

export enum WsEventType {
  ESCROW_CREATED = "ESCROW_CREATED",
  ESCROW_RELEASED = "ESCROW_RELEASED",
  ESCROW_REFUNDED = "ESCROW_REFUNDED",
  METRICS_UPDATE = "METRICS_UPDATE",
  CONNECTION_ACK = "CONNECTION_ACK",
}

export interface WsEvent {
  type: WsEventType;
  data: unknown;
  timestamp: number;
}

// ─── WebSocket Service ───────────────────────────────────────────────

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  get clientCount(): number {
    return this.clients.size;
  }

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      wsLogger.info(`Client connected (${this.clients.size} active total)`);

      this.send(ws, {
        type: WsEventType.CONNECTION_ACK,
        data: {
          clientId: Date.now().toString(36),
          connectedClients: this.clients.size,
        },
        timestamp: Date.now(),
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        wsLogger.info(`Client disconnected (${this.clients.size} active remaining)`);
      });

      ws.on("error", (err) => {
        wsLogger.warn(`Client socket error: ${err.message}`);
        this.clients.delete(ws);
      });
    });

    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          this.clients.delete(ws);
        }
      });
    }, 30_000);

    wsLogger.info("WebSocket server attached at /ws");
  }

  private send(ws: WebSocket, event: WsEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  broadcast(event: WsEvent): void {
    const message = JSON.stringify(event);
    let sent = 0;

    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sent++;
      }
    });

    if (sent > 0) {
      wsLogger.info(`Broadcast ${event.type} to ${sent} clients`);
    }
  }

  broadcastEscrowCreated(data: {
    escrowId: number | null;
    buyerAddress: string;
    seller: string;
    title: string;
    amount: string;
    txHash: string;
  }): void {
    this.broadcast({
      type: WsEventType.ESCROW_CREATED,
      data,
      timestamp: Date.now(),
    });
  }

  broadcastEscrowReleased(data: {
    escrowId: number;
    buyerAddress: string;
    seller: string;
    amount: string;
    txHash: string;
  }): void {
    this.broadcast({
      type: WsEventType.ESCROW_RELEASED,
      data,
      timestamp: Date.now(),
    });
  }

  broadcastMetrics(data: {
    totalEscrows: number;
    totalReleased: number;
    totalVolume: string;
    activeClients: number;
    relayerTxCount: number;
  }): void {
    this.broadcast({
      type: WsEventType.METRICS_UPDATE,
      data,
      timestamp: Date.now(),
    });
  }

  shutdown(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss?.close();
    wsLogger.info("WebSocket server shut down");
  }
}
