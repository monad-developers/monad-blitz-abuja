import {
  createWalletClient,
  createPublicClient,
  http,
  type Hash,
  type Address,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, config } from "./config";
import { relayerLogger } from "./logger";

// ─── Simple Mutex ────────────────────────────────────────────────────
// Serializes nonce assignment so 130 concurrent requests don't collide.

class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        const next = this.queue.shift();
        if (next) {
          next();
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        this.queue.push(() => {
          this.locked = true;
          resolve(release);
        });
      }
    });
  }
}

// ─── Relayer Service ─────────────────────────────────────────────────

export class RelayerService {
  private account;
  private walletClient: WalletClient<Transport, Chain, Account>;
  private publicClient: PublicClient;
  private nonce: number | null = null;
  private mutex = new Mutex();
  private txCount = 0;

  constructor() {
    this.account = privateKeyToAccount(
      config.relayerPrivateKey as `0x${string}`
    );

    this.publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: monadTestnet,
      transport: http(config.rpcUrl),
    });
  }

  /** Relayer wallet address */
  get address(): Address {
    return this.account.address;
  }

  /** Total transactions submitted since startup */
  get totalTxSubmitted(): number {
    return this.txCount;
  }

  /** Get relayer MON balance */
  async getBalance(): Promise<bigint> {
    return this.publicClient.getBalance({ address: this.account.address });
  }

  /** Get current gas price */
  async getGasPrice(): Promise<bigint> {
    return this.publicClient.getGasPrice();
  }

  /** Expose public client for read operations */
  getPublicClient(): PublicClient {
    return this.publicClient;
  }

  /**
   * Assign the next sequential nonce (mutex-protected).
   * On first call, syncs from the chain. After that, increments locally.
   * On error, nonce resets to re-sync on next call.
   */
  private async getNextNonce(): Promise<number> {
    const release = await this.mutex.acquire();
    try {
      if (this.nonce === null) {
        this.nonce = await this.publicClient.getTransactionCount({
          address: this.account.address,
          blockTag: "pending",
        });
        relayerLogger.info(`Synced nonce from chain: ${this.nonce}`);
      }
      return this.nonce++;
    } finally {
      release();
    }
  }

  /**
   * Submit a contract write transaction via the relayer.
   * Nonce is assigned atomically, then the tx is submitted.
   */
  async sendContractTx(params: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
  }): Promise<Hash> {
    const nonce = await this.getNextNonce();

    try {
      const hash = await this.walletClient.writeContract({
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
        value: params.value,
        nonce,
      } as any);

      this.txCount++;
      relayerLogger.info(
        `TX submitted: ${params.functionName} | nonce=${nonce} | hash=${hash}`
      );
      return hash;
    } catch (error: any) {
      const msg = error?.message?.toLowerCase() || "";
      if (
        msg.includes("nonce") ||
        msg.includes("replacement") ||
        msg.includes("already known")
      ) {
        relayerLogger.warn(
          `Nonce collision (nonce=${nonce}), resetting. Error: ${error.message}`
        );
        const release = await this.mutex.acquire();
        this.nonce = null;
        release();
      }
      throw error;
    }
  }

  /**
   * Wait for a transaction to be confirmed and return the receipt.
   */
  async waitForReceipt(hash: Hash) {
    return this.publicClient.waitForTransactionReceipt({
      hash,
      timeout: 30_000,
    });
  }

  /** Force re-sync nonce from chain */
  async resetNonce(): Promise<void> {
    const release = await this.mutex.acquire();
    this.nonce = null;
    release();
    relayerLogger.info("Nonce reset — will re-sync on next tx");
  }
}
