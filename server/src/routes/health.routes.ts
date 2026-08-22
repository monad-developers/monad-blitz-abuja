import { Router, type Request, type Response } from "express";
import { formatEther } from "viem";
import { RelayerService } from "../relayer";
import { WebSocketService } from "../websocket";
import { httpLogger } from "../logger";

const startTime = Date.now();

// ─── Router Factory ─────────────────────────────────────────────────

export function createHealthRouter(
  relayer: RelayerService,
  wsService: WebSocketService
): Router {
  const router = Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const [balance, gasPrice] = await Promise.all([
        relayer.getBalance(),
        relayer.getGasPrice(),
      ]);

      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
      const balanceEther = formatEther(balance);

      res.json({
        status: "ok",
        relayerBalance: balanceEther,
        relayer: {
          address: relayer.address,
          balanceMON: balanceEther,
          balanceWei: balance.toString(),
          totalTxSubmitted: relayer.totalTxSubmitted,
        },
        network: {
          chainId: 10143,
          rpc: "monad-testnet",
          gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(4),
        },
        server: {
          uptime: uptimeSeconds,
          uptimeFormatted: formatUptime(uptimeSeconds),
          wsClients: wsService.clientCount,
        },
      });
    } catch (error: any) {
      httpLogger.error(`[Health Check] Failed: ${error.message}`);
      res.status(500).json({
        status: "error",
        error: error.message,
      });
    }
  });

  return router;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}
