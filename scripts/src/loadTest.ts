/**
 * Load test the escrow relayer backend with concurrent requests.
 * Fires N simultaneous create+confirm flows against the API.
 *
 * Usage:
 *   npx tsx src/loadTest.ts [concurrency] [backend_url]
 *   # or from monorepo root:
 *   npm run test:load
 *
 * Examples:
 *   npx tsx src/loadTest.ts 20
 *   npx tsx src/loadTest.ts 50 http://localhost:3001
 *   npx tsx src/loadTest.ts 130 https://your-deployed-api.com
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const NUM_CONCURRENT = parseInt(process.argv[2] || "20", 10);
const BACKEND_URL = process.argv[3] || "http://localhost:3001";

// Nigerian local commerce templates
const TITLES = [
  "🍛 Campus Lunch Delivery",
  "💻 Graphic Design Gig",
  "📚 Course Study Pack",
  "🚗 Abuja Campus Ride",
  "📱 Phone Screen Fix",
  "👕 Laundry Pickup",
  "🎫 Event Ticket",
  "📝 Assignment Help",
];

// ─── Types ───────────────────────────────────────────────────────────

interface FlowResult {
  index: number;
  buyerAddress: string;
  success: boolean;
  createLatencyMs: number;
  confirmLatencyMs: number;
  totalLatencyMs: number;
  createTxHash?: string;
  confirmTxHash?: string;
  escrowId?: number;
  error?: string;
}

// ─── Single Escrow Flow ──────────────────────────────────────────────

async function runEscrowFlow(
  buyerAddress: string,
  index: number
): Promise<FlowResult> {
  const title = TITLES[index % TITLES.length];
  const flowStart = Date.now();

  try {
    // Step 1: Create and fund escrow
    const createStart = Date.now();
    const createRes = await fetch(`${BACKEND_URL}/api/escrow/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerAddress,
        title,
        amount: "0.001",
      }),
    });
    const createData = await createRes.json();
    const createLatencyMs = Date.now() - createStart;

    if (!createData.success) {
      return {
        index,
        buyerAddress,
        success: false,
        createLatencyMs,
        confirmLatencyMs: 0,
        totalLatencyMs: Date.now() - flowStart,
        error: `Create failed: ${createData.error}`,
      };
    }

    // Brief pause to simulate real user behavior
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

    // Step 2: Confirm delivery (release funds)
    const confirmStart = Date.now();
    const confirmRes = await fetch(`${BACKEND_URL}/api/escrow/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escrowId: createData.escrowId,
        buyerAddress,
      }),
    });
    const confirmData = await confirmRes.json();
    const confirmLatencyMs = Date.now() - confirmStart;

    return {
      index,
      buyerAddress,
      success: createData.success && confirmData.success,
      createLatencyMs,
      confirmLatencyMs,
      totalLatencyMs: Date.now() - flowStart,
      createTxHash: createData.txHash,
      confirmTxHash: confirmData.txHash,
      escrowId: createData.escrowId,
      error: confirmData.success ? undefined : `Confirm failed: ${confirmData.error}`,
    };
  } catch (error: any) {
    return {
      index,
      buyerAddress,
      success: false,
      createLatencyMs: 0,
      confirmLatencyMs: 0,
      totalLatencyMs: Date.now() - flowStart,
      error: error.message,
    };
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log(
    `  🚀 Load Test: ${NUM_CONCURRENT} concurrent escrows`
  );
  console.log(`  🌐 Backend:   ${BACKEND_URL}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  // Check backend is alive
  try {
    const healthRes = await fetch(`${BACKEND_URL}/api/health`);
    const health = await healthRes.json();
    console.log(`✅ Backend is up | Balance: ${health.relayer?.balanceMON} MON`);
    console.log("");
  } catch (error: any) {
    console.error(`❌ Cannot reach backend at ${BACKEND_URL}`);
    console.error(`   Error: ${error.message}`);
    console.error("   Start the server first: npm run dev:server");
    process.exit(1);
  }

  // Generate burner addresses
  console.log(`🔑 Generating ${NUM_CONCURRENT} burner wallets...`);
  const buyers: string[] = [];
  for (let i = 0; i < NUM_CONCURRENT; i++) {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    buyers.push(account.address);
  }

  // Fire all flows concurrently
  console.log(`⚡ Firing ${NUM_CONCURRENT} concurrent escrow flows...\n`);
  const overallStart = Date.now();

  const results = await Promise.allSettled(
    buyers.map((addr, i) => runEscrowFlow(addr, i))
  );

  const overallDuration = Date.now() - overallStart;

  // ── Analyze Results ───────────────────────────────────────────────

  const fulfilled: FlowResult[] = [];
  const rejected: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      fulfilled.push(result.value);
    } else {
      rejected.push(result.reason?.message || "Unknown error");
    }
  }

  const succeeded = fulfilled.filter((r) => r.success);
  const failed = [
    ...fulfilled.filter((r) => !r.success),
    ...rejected.map((err, i) => ({
      index: -1,
      buyerAddress: "",
      success: false,
      error: err,
    })),
  ];

  const createLatencies = succeeded
    .map((r) => r.createLatencyMs)
    .sort((a, b) => a - b);
  const confirmLatencies = succeeded
    .map((r) => r.confirmLatencyMs)
    .sort((a, b) => a - b);
  const totalLatencies = succeeded
    .map((r) => r.totalLatencyMs)
    .sort((a, b) => a - b);

  // ── Print Report ──────────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════");
  console.log("  📊 RESULTS");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log(`  ✅ Succeeded:  ${succeeded.length} / ${NUM_CONCURRENT}`);
  console.log(`  ❌ Failed:     ${failed.length} / ${NUM_CONCURRENT}`);
  console.log(
    `  ⏱  Total time: ${(overallDuration / 1000).toFixed(1)}s`
  );
  console.log(
    `  📈 Throughput:  ${(succeeded.length / (overallDuration / 1000)).toFixed(2)} flows/sec`
  );
  console.log("");

  if (createLatencies.length > 0) {
    const p50 = (arr: number[]) => arr[Math.floor(arr.length * 0.5)];
    const p95 = (arr: number[]) => arr[Math.floor(arr.length * 0.95)];

    console.log("  Create Latency:");
    console.log(`    Min:  ${createLatencies[0]}ms`);
    console.log(`    P50:  ${p50(createLatencies)}ms`);
    console.log(`    P95:  ${p95(createLatencies)}ms`);
    console.log(`    Max:  ${createLatencies[createLatencies.length - 1]}ms`);
    console.log("");

    console.log("  Confirm Latency:");
    console.log(`    Min:  ${confirmLatencies[0]}ms`);
    console.log(`    P50:  ${p50(confirmLatencies)}ms`);
    console.log(`    P95:  ${p95(confirmLatencies)}ms`);
    console.log(`    Max:  ${confirmLatencies[confirmLatencies.length - 1]}ms`);
    console.log("");

    console.log("  Full Flow (create → confirm):");
    console.log(`    Min:  ${totalLatencies[0]}ms`);
    console.log(`    P50:  ${p50(totalLatencies)}ms`);
    console.log(`    P95:  ${p95(totalLatencies)}ms`);
    console.log(`    Max:  ${totalLatencies[totalLatencies.length - 1]}ms`);
  }

  if (failed.length > 0) {
    console.log("");
    console.log("  ❌ Failures:");
    const failedDetails = failed.slice(0, 10); // Show first 10
    failedDetails.forEach((f: any) => {
      console.log(`    #${f.index}: ${f.error}`);
    });
    if (failed.length > 10) {
      console.log(`    ... and ${failed.length - 10} more`);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════");

  // Exit with error code if too many failures
  if (failed.length > NUM_CONCURRENT * 0.1) {
    console.log(
      "⚠️  Failure rate > 10% — investigate before running the live demo."
    );
    process.exit(1);
  }
}

main().catch(console.error);
