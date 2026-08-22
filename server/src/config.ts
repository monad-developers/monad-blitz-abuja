import dotenv from "dotenv";
import { defineChain, type Address } from "viem";

// Load .env from monorepo root
dotenv.config({ path: "../.env" });

// ─── Monad Testnet Chain Definition ──────────────────────────────────

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.RPC_URL || "https://testnet-rpc.monad.xyz/"],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

// ─── App Config ──────────────────────────────────────────────────────

export const config = {
  // Server
  port: parseInt(process.env.PORT || "3001", 10),

  // Blockchain
  rpcUrl: process.env.RPC_URL || "https://testnet-rpc.monad.xyz/",
  chainId: 10143,

  // Relayer wallet (pays gas + MON for all demo escrows)
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || "",

  // Deployed contract
  contractAddress: (process.env.CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as Address,

  // Fixed demo seller — enforced server-side, never trust the client
  demoSellerAddress: (process.env.DEMO_SELLER_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as Address,

  // Default escrow amount in MON (for demo presets)
  defaultEscrowAmount: process.env.DEFAULT_ESCROW_AMOUNT || "0.001",
} as const;

// ─── Validation ──────────────────────────────────────────────────────

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.relayerPrivateKey || config.relayerPrivateKey === "") {
    errors.push("RELAYER_PRIVATE_KEY is required");
  }
  if (
    config.contractAddress ===
    "0x0000000000000000000000000000000000000000"
  ) {
    errors.push(
      "CONTRACT_ADDRESS not set — deploy the contract first"
    );
  }
  if (
    config.demoSellerAddress ===
    "0x0000000000000000000000000000000000000000"
  ) {
    errors.push("DEMO_SELLER_ADDRESS is required");
  }

  if (errors.length > 0) {
    console.error("❌ Configuration errors:");
    errors.forEach((e) => console.error(`   • ${e}`));
    console.error("\n   Copy .env.example → .env and fill in real values.\n");
    process.exit(1);
  }
}
