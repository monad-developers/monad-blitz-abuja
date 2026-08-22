import express from "express";
import cors from "cors";
import { createServer } from "http";
import { formatEther } from "viem";
import { config, validateConfig } from "./config";
import { RelayerService } from "./relayer";
import { ContractService } from "./contractService";
import { WebSocketService } from "./websocket";
import { createEscrowRouter } from "./routes/escrow.routes";
import { createHealthRouter } from "./routes/health.routes";
import { logger, httpLogger } from "./logger";

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  logger.info("==================================================");
  logger.info("   🟣 Monad Escrow — Gasless Relayer Server       ");
  logger.info("      Monad Blitz Abuja Demo                      ");
  logger.info("==================================================");

  // Validate environment
  validateConfig();

  // Initialize services
  const relayer = new RelayerService();
  const contractService = new ContractService(relayer);
  const wsService = new WebSocketService();

  // Express setup
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    if (req.method !== "GET" || !req.path.includes("health")) {
      httpLogger.info(`${req.method} ${req.path}`);
    }
    next();
  });

  // Routes
  app.use("/api/health", createHealthRouter(relayer, wsService));
  app.use("/api/escrow", createEscrowRouter(contractService, wsService));

  // Root info
  app.get("/", (_req, res) => {
    res.json({
      name: "Monad Escrow Relayer",
      version: "0.1.0",
      endpoints: {
        health: "GET /api/health",
        createEscrow: "POST /api/escrow/create",
        confirmEscrow: "POST /api/escrow/confirm",
        getEscrow: "GET /api/escrow/:id",
        listEscrows: "GET /api/escrow/list?limit=N",
        escrowStats: "GET /api/escrow/stats",
        escrowPresets: "GET /api/escrow/presets",
        websocket: "ws://host:port/ws",
      },
    });
  });

  // Create HTTP server + attach WebSocket
  const server = createServer(app);
  wsService.attach(server);

  // Metrics broadcast
  const metricsInterval = setInterval(async () => {
    if (wsService.clientCount === 0) return;
    try {
      const stats = await contractService.getStats();
      wsService.broadcastMetrics({
        ...stats,
        activeClients: wsService.clientCount,
        relayerTxCount: relayer.totalTxSubmitted,
      });
    } catch {
      // Non-critical background task
    }
  }, 5_000);

  // Startup info
  try {
    const balance = await relayer.getBalance();
    logger.info(`📍 Relayer address:    ${relayer.address}`);
    logger.info(`💰 Relayer balance:    ${formatEther(balance)} MON`);
    logger.info(`🎯 Demo seller:        ${config.demoSellerAddress}`);
    logger.info(`📄 Contract:           ${config.contractAddress}`);
    logger.info(`🌐 RPC:                ${config.rpcUrl}`);
  } catch (error: any) {
    logger.warn(`Could not fetch initial on-chain info: ${error.message}`);
  }

  // Start listening
  server.listen(config.port, () => {
    logger.info(`🚀 HTTP server:  http://localhost:${config.port}`);
    logger.info(`🔌 WebSocket:    ws://localhost:${config.port}/ws`);
    logger.info(`❤️  Health check: http://localhost:${config.port}/api/health`);
    logger.info("Ready for the demo! 🎉");
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info("🛑 Shutting down server...");
    clearInterval(metricsInterval);
    wsService.shutdown();
    server.close(() => {
      logger.info("Server closed successfully.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.fatal("Fatal startup error:", error);
  process.exit(1);
});
