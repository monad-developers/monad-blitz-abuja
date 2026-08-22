/**
 * MonadEscrow contract ABI — matches contracts/src/MonadEscrow.sol
 *
 * If you redeploy with contract changes, regenerate this from:
 *   contracts/out/MonadEscrow.sol/MonadEscrow.json → abi field
 *
 * Using `as const` gives viem full type inference on read/write calls.
 */
export const MONAD_ESCROW_ABI = [
  // ─── Constructor ─────────────────────────────────────────────────
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },

  // ─── Events ──────────────────────────────────────────────────────
  {
    type: "event",
    name: "EscrowCreatedAndFunded",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "buyer", type: "address", indexed: true, internalType: "address" },
      { name: "seller", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "title", type: "string", indexed: false, internalType: "string" },
    ],
  },
  {
    type: "event",
    name: "EscrowReleased",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "buyer", type: "address", indexed: true, internalType: "address" },
      { name: "seller", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    type: "event",
    name: "EscrowRefunded",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "buyer", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    type: "event",
    name: "RelayerUpdated",
    inputs: [
      { name: "relayer", type: "address", indexed: true, internalType: "address" },
      { name: "authorized", type: "bool", indexed: false, internalType: "bool" },
    ],
  },

  // ─── Write Functions ─────────────────────────────────────────────
  {
    type: "function",
    name: "createAndFundEscrow",
    stateMutability: "payable",
    inputs: [
      { name: "buyer", type: "address", internalType: "address" },
      { name: "seller", type: "address", internalType: "address" },
      { name: "title", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "function",
    name: "confirmDelivery",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setRelayer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "relayer", type: "address", internalType: "address" },
      { name: "authorized", type: "bool", internalType: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address", internalType: "address" }],
    outputs: [],
  },

  // ─── View Functions ──────────────────────────────────────────────
  {
    type: "function",
    name: "getEscrow",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct MonadEscrow.Escrow",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "buyer", type: "address", internalType: "address" },
          { name: "seller", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "title", type: "string", internalType: "string" },
          { name: "createdAt", type: "uint256", internalType: "uint256" },
          { name: "completedAt", type: "uint256", internalType: "uint256" },
          { name: "status", type: "uint8", internalType: "enum MonadEscrow.EscrowStatus" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getRecentEscrows",
    stateMutability: "view",
    inputs: [{ name: "limit", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct MonadEscrow.Escrow[]",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "buyer", type: "address", internalType: "address" },
          { name: "seller", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "title", type: "string", internalType: "string" },
          { name: "createdAt", type: "uint256", internalType: "uint256" },
          { name: "completedAt", type: "uint256", internalType: "uint256" },
          { name: "status", type: "uint8", internalType: "enum MonadEscrow.EscrowStatus" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
  },
  {
    type: "function",
    name: "authorizedRelayers",
    stateMutability: "view",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
  },
  {
    type: "function",
    name: "nextId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "function",
    name: "totalEscrows",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "function",
    name: "totalReleased",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "function",
    name: "totalVolume",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },

  // ─── Receive ─────────────────────────────────────────────────────
  {
    type: "receive",
    stateMutability: "payable",
  },
] as const;
