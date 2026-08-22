import {
  type Address,
  type Hash,
  formatEther,
  decodeEventLog,
} from "viem";
import { RelayerService } from "./relayer";
import { config } from "./config";
import { MONAD_ESCROW_ABI } from "./abi/MonadEscrow";
import { contractLogger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────

export interface EscrowData {
  id: bigint;
  buyer: Address;
  seller: Address;
  amount: bigint;
  title: string;
  createdAt: bigint;
  completedAt: bigint;
  status: number; // 0=None, 1=Funded, 2=ConfirmedReleased, 3=Refunded
}

export interface EscrowResponse {
  id: number;
  buyer: string;
  seller: string;
  amount: string; // MON as decimal string
  amountWei: string;
  title: string;
  createdAt: number;
  completedAt: number;
  status: string;
}

const STATUS_LABELS: Record<number, string> = {
  0: "None",
  1: "Funded",
  2: "Released",
  3: "Refunded",
};

// ─── Contract Service ────────────────────────────────────────────────

export class ContractService {
  constructor(private relayer: RelayerService) {}

  /**
   * Create and fund an escrow atomically.
   * The demo seller is enforced server-side — we NEVER trust the client.
   */
  async createAndFundEscrow(
    buyerAddress: Address,
    title: string,
    amountWei: bigint
  ): Promise<{ hash: Hash; escrowId: number | null }> {
    contractLogger.info(
      `Creating escrow: buyer=${buyerAddress} title="${title}" amount=${amountWei} wei`
    );

    // Submit the transaction
    const hash = await this.relayer.sendContractTx({
      address: config.contractAddress,
      abi: MONAD_ESCROW_ABI,
      functionName: "createAndFundEscrow",
      args: [buyerAddress, config.demoSellerAddress, title],
      value: amountWei,
    });

    // Wait for receipt to extract escrow ID from event logs
    let escrowId: number | null = null;
    try {
      const receipt = await this.relayer.waitForReceipt(hash);

      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi: MONAD_ESCROW_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (event.eventName === "EscrowCreatedAndFunded") {
            escrowId = Number((event.args as any).id);
            contractLogger.info(`Decoded event EscrowCreatedAndFunded: ID #${escrowId}`);
            break;
          }
        } catch {
          // Not our event, skip
        }
      }
    } catch (err) {
      contractLogger.warn(
        `Receipt extraction error for tx ${hash}: ${(err as Error).message}`
      );
    }

    // Reliable fallback if event decoding missed the ID
    if (escrowId === null) {
      try {
        const stats = await this.getStats();
        if (stats.nextId > 1) {
          escrowId = stats.nextId - 1;
          contractLogger.info(`Resolved escrow ID from contract state: ID #${escrowId}`);
        }
      } catch (e) {
        contractLogger.warn(`Fallback ID lookup failed: ${(e as Error).message}`);
      }
    }

    return { hash, escrowId };
  }

  /**
   * Confirm delivery and release funds to the seller.
   * The backend has already verified the caller is the buyer.
   */
  async confirmDelivery(escrowId: number): Promise<Hash> {
    contractLogger.info(`Confirming delivery for escrow #${escrowId}`);
    return this.relayer.sendContractTx({
      address: config.contractAddress,
      abi: MONAD_ESCROW_ABI,
      functionName: "confirmDelivery",
      args: [BigInt(escrowId)],
    });
  }

  /** Read a single escrow by ID */
  async getEscrow(escrowId: number): Promise<EscrowData | null> {
    const client = this.relayer.getPublicClient();
    try {
      const result = await client.readContract({
        address: config.contractAddress,
        abi: MONAD_ESCROW_ABI,
        functionName: "getEscrow",
        args: [BigInt(escrowId)],
      });
      const data = result as unknown as EscrowData;
      // Status 0 (None) means the escrow doesn't exist
      if (data.status === 0) return null;
      return data;
    } catch (err) {
      contractLogger.warn(`Error reading escrow #${escrowId}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Get the N most recent escrows (newest first) */
  async getRecentEscrows(limit: number = 20): Promise<EscrowData[]> {
    const client = this.relayer.getPublicClient();
    try {
      const result = await client.readContract({
        address: config.contractAddress,
        abi: MONAD_ESCROW_ABI,
        functionName: "getRecentEscrows",
        args: [BigInt(limit)],
      });
      return (result as unknown as EscrowData[]) || [];
    } catch (err) {
      contractLogger.warn(`Error reading recent escrows: ${(err as Error).message}`);
      return [];
    }
  }

  /** Get aggregate stats from the contract */
  async getStats(): Promise<{
    totalEscrows: number;
    totalReleased: number;
    totalVolume: string;
    nextId: number;
  }> {
    const client = this.relayer.getPublicClient();
    const [totalEscrows, totalReleased, totalVolume, nextId] =
      await Promise.all([
        client.readContract({
          address: config.contractAddress,
          abi: MONAD_ESCROW_ABI,
          functionName: "totalEscrows",
        }),
        client.readContract({
          address: config.contractAddress,
          abi: MONAD_ESCROW_ABI,
          functionName: "totalReleased",
        }),
        client.readContract({
          address: config.contractAddress,
          abi: MONAD_ESCROW_ABI,
          functionName: "totalVolume",
        }),
        client.readContract({
          address: config.contractAddress,
          abi: MONAD_ESCROW_ABI,
          functionName: "nextId",
        }),
      ]);

    return {
      totalEscrows: Number(totalEscrows),
      totalReleased: Number(totalReleased),
      totalVolume: formatEther(totalVolume as bigint),
      nextId: Number(nextId),
    };
  }

  /** Format raw escrow data for JSON response */
  static formatEscrow(e: EscrowData): EscrowResponse {
    return {
      id: Number(e.id),
      buyer: e.buyer,
      seller: e.seller,
      amount: formatEther(e.amount),
      amountWei: e.amount.toString(),
      title: e.title,
      createdAt: Number(e.createdAt),
      completedAt: Number(e.completedAt),
      status: STATUS_LABELS[e.status] || "Unknown",
    };
  }
}
