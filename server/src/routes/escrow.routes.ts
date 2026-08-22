import { Router, type Request, type Response } from "express";
import { isAddress, parseEther, formatEther, type Address } from "viem";
import { ContractService } from "../contractService";
import { WebSocketService } from "../websocket";
import { config } from "../config";
import { httpLogger } from "../logger";

// ─── Escrow Preset Templates ────────────────────────────────────────

export const ESCROW_PRESETS = [
  { label: "🍛 Campus Lunch Delivery", naira: "₦2,500", mon: "0.001" },
  { label: "💻 Graphic Design Gig", naira: "₦15,000", mon: "0.005" },
  { label: "📚 Course Study Pack", naira: "₦4,000", mon: "0.002" },
  { label: "🚗 Abuja Campus Ride", naira: "₦1,800", mon: "0.001" },
  { label: "📱 Phone Screen Fix", naira: "₦8,000", mon: "0.003" },
  { label: "👕 Laundry Pickup", naira: "₦1,500", mon: "0.001" },
  { label: "🎫 Event Ticket", naira: "₦5,000", mon: "0.002" },
  { label: "📝 Assignment Help", naira: "₦3,000", mon: "0.001" },
];

// ─── Router Factory ─────────────────────────────────────────────────

export function createEscrowRouter(
  contractService: ContractService,
  wsService: WebSocketService
): Router {
  const router = Router();

  // ── GET /api/escrow/presets ──────────────────────────────────────
  router.get("/presets", (_req: Request, res: Response) => {
    res.json({ success: true, presets: ESCROW_PRESETS });
  });

  // ── GET /api/escrow/list ────────────────────────────────────────
  router.get("/list", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const escrows = await contractService.getRecentEscrows(limit);

      res.json({
        success: true,
        escrows: escrows.map(ContractService.formatEscrow),
        count: escrows.length,
      });
    } catch (error: any) {
      httpLogger.error(`[Escrow List] Error: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── GET /api/escrow/stats ───────────────────────────────────────
  router.get("/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await contractService.getStats();
      res.json({ success: true, ...stats });
    } catch (error: any) {
      httpLogger.error(`[Escrow Stats] Error: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── GET /api/escrow/:id ─────────────────────────────────────────
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        httpLogger.warn(`[Escrow Get] Invalid escrow ID requested: "${req.params.id}"`);
        res.status(400).json({ success: false, error: "Invalid escrow ID" });
        return;
      }

      const escrow = await contractService.getEscrow(id);
      if (!escrow) {
        httpLogger.warn(`[Escrow Get] Escrow #${id} not found`);
        res.status(404).json({ success: false, error: "Escrow not found" });
        return;
      }

      const formatted = ContractService.formatEscrow(escrow);
      res.json({
        success: true,
        ...formatted,
        escrow: formatted,
      });
    } catch (error: any) {
      httpLogger.error(`[Escrow Get] Error: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/escrow/create ─────────────────────────────────────
  router.post("/create", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const { buyerAddress, title, amount, amountMON } = req.body;

      // Validate buyer address
      if (!buyerAddress || !isAddress(buyerAddress)) {
        res.status(400).json({ success: false, error: "Invalid buyer address" });
        return;
      }

      // Validate title
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        res.status(400).json({ success: false, error: "Title is required" });
        return;
      }
      if (title.length > 128) {
        res.status(400).json({ success: false, error: "Title too long (max 128 chars)" });
        return;
      }

      // Parse amount
      const inputAmount = amountMON !== undefined ? amountMON : amount;
      const amountMon =
        inputAmount !== undefined && inputAmount !== ""
          ? inputAmount.toString()
          : config.defaultEscrowAmount;
      let amountWei: bigint;
      try {
        amountWei = parseEther(amountMon);
      } catch {
        res.status(400).json({ success: false, error: "Invalid amount" });
        return;
      }

      if (amountWei <= 0n) {
        res.status(400).json({ success: false, error: "Amount must be greater than 0" });
        return;
      }

      httpLogger.info(
        `[Escrow Create] buyer=${buyerAddress} title="${title}" amount=${amountMon} MON`
      );

      const { hash, escrowId } = await contractService.createAndFundEscrow(
        buyerAddress as Address,
        title.trim(),
        amountWei
      );

      const latencyMs = Date.now() - startTime;

      // Broadcast to dashboard
      wsService.broadcastEscrowCreated({
        escrowId,
        buyerAddress,
        seller: config.demoSellerAddress,
        title: title.trim(),
        amount: amountMon,
        txHash: hash,
      });

      res.json({
        success: true,
        status: "funded",
        escrowId,
        txHash: hash,
        latencyMs,
        seller: config.demoSellerAddress,
      });
    } catch (error: any) {
      httpLogger.error(`[Escrow Create] Error: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/escrow/confirm ────────────────────────────────────
  router.post("/confirm", async (req: Request, res: Response) => {
    try {
      const rawEscrowId = req.body.escrowId;
      const escrowId =
        typeof rawEscrowId === "string" ? parseInt(rawEscrowId, 10) : rawEscrowId;
      const buyerAddress = req.body.buyerAddress;

      if (
        escrowId === undefined ||
        escrowId === null ||
        typeof escrowId !== "number" ||
        isNaN(escrowId) ||
        escrowId <= 0
      ) {
        httpLogger.warn(`[Escrow Confirm] Bad escrow ID: "${rawEscrowId}"`);
        res.status(400).json({ success: false, error: "Invalid escrow ID" });
        return;
      }
      if (!buyerAddress || !isAddress(buyerAddress)) {
        res.status(400).json({ success: false, error: "Invalid buyer address" });
        return;
      }

      // Read escrow from contract
      const escrow = await contractService.getEscrow(escrowId);
      if (!escrow) {
        httpLogger.warn(`[Escrow Confirm] Escrow #${escrowId} not found`);
        res.status(404).json({ success: false, error: "Escrow not found" });
        return;
      }

      // Security check: caller must be the buyer
      if (escrow.buyer.toLowerCase() !== buyerAddress.toLowerCase()) {
        httpLogger.warn(
          `[Escrow Confirm] AUTH REJECTED: ${buyerAddress} tried to confirm escrow #${escrowId} owned by ${escrow.buyer}`
        );
        res.status(403).json({
          success: false,
          error: "Not the buyer of this escrow",
        });
        return;
      }

      // Check escrow is in Funded state (1)
      if (escrow.status !== 1) {
        httpLogger.warn(
          `[Escrow Confirm] Escrow #${escrowId} not in funded state (status: ${escrow.status})`
        );
        res.status(400).json({
          success: false,
          error: `Escrow is not in funded state (current: ${escrow.status})`,
        });
        return;
      }

      httpLogger.info(`[Escrow Confirm] escrowId=${escrowId} buyer=${buyerAddress}`);

      const hash = await contractService.confirmDelivery(escrowId);

      wsService.broadcastEscrowReleased({
        escrowId,
        buyerAddress,
        seller: escrow.seller,
        amount: formatEther(escrow.amount),
        txHash: hash,
      });

      res.json({
        success: true,
        status: "released",
        txHash: hash,
      });
    } catch (error: any) {
      httpLogger.error(`[Escrow Confirm] Error: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
