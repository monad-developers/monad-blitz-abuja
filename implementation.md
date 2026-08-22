# Implementation Plan: Monad Blitz Abuja — On-Chain Local-Commerce Escrow

An end-to-end, high-concurrency, gasless escrow platform designed specifically for the **Monad Blitz Abuja** hackathon live demo. The platform enables ~130 live audience members to scan a QR code on their phones, instantly create, fund, and resolve peer-to-peer local commerce escrows without installing MetaMask or paying gas, while the projector screen displays a live real-time parallel execution dashboard.

---

## User Review Required

> [!IMPORTANT]
> **Foundry is already installed on your system!** (`forge 1.7.1`).
> You do **not** need to install complex Solidity tools. We will structure the smart contract using Foundry (`forge`), and connect it with an Express backend relayer (`viem` / `ethers`) and a Vite + React + TypeScript frontend in a clean monorepo.

> [!NOTE]
> **Key Architecture Decisions for Demo Speed & Reliability**:
> 1. **Atomic `createAndFundEscrow`**: We combine creation and funding into a single atomic call so audience members only need 2 taps total: **Tap 1: Lock Funds** → **Tap 2: Confirm Delivery (Auto-Release)**.
> 2. **Native MON + Naira (NGN) Display Currency**: Native MON eliminates the need for ERC-20 `approve()` transactions (which would double the network calls and add failure points). The UI will display local commerce values (e.g. `₦3,500 (~0.05 MON) - Campus Food Delivery`).
> 3. **Gasless Backend Relayer with Local Nonce Queuing**: When 130 users tap simultaneously, standard RPC providers fail if raw nonces collide. Our backend relayer will use atomic nonce management / queueing to ensure 100% transaction dispatch reliability under concurrent load.
> 4. **Built-in Offline/Backup Simulation Mode**: A toggle on the live dashboard that can play a deterministic high-speed simulation run in case venue WiFi or RPC fails on stage.

---

## Monorepo Architecture Overview

```
nonameescrow/
├── contracts/                  # Foundry Solidity Workspace
│   ├── src/
│   │   └── MonadEscrow.sol     # Core Escrow contract with atomic create+fund & auto-release
│   ├── test/
│   │   └── MonadEscrow.t.sol   # Comprehensive Foundry unit & fuzz tests
│   ├── script/
│   │   └── Deploy.s.sol        # Testnet deployment script
│   └── foundry.toml
├── server/                     # Gasless Relayer & Real-time Event Hub
│   ├── src/
│   │   ├── config.ts           # Chain config (Monad Testnet 10143, RPC, Keys)
│   │   ├── relayer.ts          # Viem-powered relayer with atomic nonce synchronization
│   │   ├── contractService.ts  # Contract read/write interactions & event parsing
│   │   ├── websocket.ts        # Real-time WebSocket broadcaster to dashboard & mobile clients
│   │   └── routes/
│   │       ├── escrow.routes.ts # /api/escrow/create-and-fund, /confirm, /status
│   │       └── health.routes.ts # Health, faucet status, relayer balance
│   ├── package.json
│   └── tsconfig.json
├── client/                     # Vite + React + TypeScript Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard/      # Big-screen Stage Display (Parallel Escrow Stream, Metrics, TPS meter)
│   │   │   ├── MobileApp/      # Participant QR View (Instant burner avatar, 2-tap escrow flow)
│   │   │   ├── QRModal/        # Scan-to-join QR overlay for the projector
│   │   │   └── BackupMode/     # Offline/Stage-safe fallback simulation
│   │   ├── hooks/              # useEscrowSocket, useRelayerApi, useEphemeralAccount
│   │   ├── services/           # API & WebSocket client
│   │   ├── App.tsx             # Route switcher (/ for mobile, /dashboard for stage)
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── loadTest.ts             # 150+ concurrent escrow lifecycle test using Promise.all
│   └── generateWallets.ts      # Throwaway burner address generator
├── package.json                # Root workspaces runner
└── README.md
```

---

## Proposed Changes

### Component 1: Smart Contracts (`contracts/`)

#### [NEW] [MonadEscrow.sol](file:///home/kendoestech/Documents/Github/nonameescrow/contracts/src/MonadEscrow.sol)
- **Data Model**:
  ```solidity
  enum EscrowStatus { None, Funded, ConfirmedReleased, Refunded }

  struct Escrow {
      uint256 id;
      address buyer;
      address seller;
      uint256 amount;
      string title;          // e.g. "Hostel Jollof Rice Delivery"
      uint256 createdAt;
      uint256 completedAt;
      EscrowStatus status;
  }
  ```
- **Functions**:
  - `createAndFundEscrow(address seller, string calldata title)` `payable returns (uint256 id)`: Emits `EscrowCreatedAndFunded`.
  - `confirmDelivery(uint256 id)`: Restricted to buyer (or authorized relayer for gasless flow). Atomically transfers locked MON to seller and updates status to `ConfirmedReleased`. Emits `EscrowReleased`.
  - `refund(uint256 id)`: Arbiter/Admin emergency refund path back to buyer.
  - `getEscrow(uint256 id)` & `getRecentEscrows(uint256 limit)` for quick dashboard indexing.

#### [NEW] [MonadEscrow.t.sol](file:///home/kendoestech/Documents/Github/nonameescrow/contracts/test/MonadEscrow.t.sol)
- Tests for happy path (create → fund → confirm → release).
- Reentrancy protection tests.
- Access control tests (unauthorized release / refund attempts).
- Nonce & concurrent state isolation tests.

---

### Component 2: Relayer & Real-time Server (`server/`)

#### [NEW] [server/src/relayer.ts](file:///home/kendoestech/Documents/Github/nonameescrow/server/src/relayer.ts)
- Manages the backend relayer wallet (`viem` `createWalletClient` with `http("https://testnet-rpc.monad.xyz/")`).
- Implements a Mutex/Queue for sequential nonce assignment during massive concurrent incoming requests to eliminate RPC nonce collision errors.
- Exposes:
  - `POST /api/escrow/create`: Relays `createAndFundEscrow` on behalf of the mobile participant.
  - `POST /api/escrow/confirm`: Relays `confirmDelivery`.
  - `GET /api/escrow/list`: Fetches all active & past escrows.
  - `GET /api/relayer/status`: Returns relayer balance and current testnet gas price.

#### [NEW] [server/src/websocket.ts](file:///home/kendoestech/Documents/Github/nonameescrow/server/src/websocket.ts)
- WebSocket server (`ws` or `Socket.io`) streaming:
  - `ESCROW_CREATED`
  - `ESCROW_RELEASED`
  - `METRICS_UPDATE` (Total throughput, active escrows, average latency in ms).

---

### Component 3: Frontend Web App (`client/`)

#### [NEW] [client/src/components/MobileApp/ParticipantView.tsx](file:///home/kendoestech/Documents/Github/nonameescrow/client/src/components/MobileApp/ParticipantView.tsx)
- Ultra-responsive, mobile-first design for students in the room.
- Generates an instant local avatar and fun moniker (e.g. `⚡ AbujaSpeed_042`, `🍛 CampusBites_88`).
- Preset Nigerian commerce templates:
  - 🍛 *Campus Lunch Delivery (₦2,500)*
  - 💻 *Graphic Design Gig (₦15,000)*
  - 📚 *Course Study Pack (₦4,000)*
  - 🚗 *Abuja Campus Ride (₦1,800)*
- Big, satisfying action buttons with micro-animations:
  - "🔒 Lock Escrow (Pay ₦2,500)" -> Instant feedback with Monad tx hash.
  - "✅ Confirm Item Received" -> Instant fund release.

#### [NEW] [client/src/components/Dashboard/LiveStageDashboard.tsx](file:///home/kendoestech/Documents/Github/nonameescrow/client/src/components/Dashboard/LiveStageDashboard.tsx)
- Designed for the projector screen with a dark, high-contrast, cyberpunk Monad aesthetic (Monad purple, electric blue, neon green).
- **Interactive Visual Elements**:
  - **Live Parallel Stream Grid**: Cards representing each student's escrow lighting up and transitioning in real time.
  - **Latency / Finality Timer**: Shows settlement speed per transaction (e.g., `⚡ 420ms`).
  - **Live Room QR Code**: Floating prominent QR code for late joiners to scan and jump in.
  - **Throughput & Stats Bar**: Total Escrows, Parallel Active Trades, Total NGN/MON Settled, Gas Paid by Relayer ($0 for audience).
  - **Demo Control Bar**: Single-click "Simulate 50 Concurrent Escrows" for stress-test demonstration or backup.

---

### Component 4: Load Testing & Automation (`scripts/`)

#### [NEW] [scripts/loadTest.ts](file:///home/kendoestech/Documents/Github/nonameescrow/scripts/loadTest.ts)
- Executes 50 to 150 simulated concurrent escrows using `Promise.all`.
- Measures:
  - Minimum, maximum, and median confirmation latency.
  - Success/failure rate against the live Monad testnet RPC.
  - Confirms state isolation and non-blocking parallel execution.

---

## What to Install (Complete List for the User)

To get everything running smoothly, here are the exact packages and tools:

1. **Foundry (Already Installed! 🎉)**:
   - Command: `forge --version` (verified active on your machine).
2. **Node.js Dependencies (will be installed in our monorepo)**:
   - Root / Server: `express`, `cors`, `dotenv`, `viem`, `ws`, `tsx` (for fast TS execution), `p-queue` (for concurrency queueing).
   - Client (Vite): `react`, `react-dom`, `lucide-react`, `canvas-confetti`, `qrcode.react`, `clsx`, `tailwind-merge` (or sleek modern CSS).
   - Scripts: `tsx`, `viem`.

---

## Verification Plan

### Automated Tests
1. **Solidity Contract Tests**:
   ```bash
   cd contracts && forge test -vvv
   ```
2. **Relayer & Backend API Tests**:
   - Test endpoints with mock requests and verify nonce queueing.
3. **Concurrency Simulation**:
   ```bash
   npm run test:load -- 20
   ```

### Manual Verification & Stage Demo Run
1. Start local stack: `npm run dev` (starts relayer backend + Vite frontend).
2. Open `http://localhost:5173/dashboard` on laptop/projector.
3. Scan QR code with phone (or open second tab at `http://localhost:5173/`).
4. Execute an escrow from phone and verify sub-second real-time reflection on the dashboard.
5. Trigger 50-user concurrent burst and record live video backup.
