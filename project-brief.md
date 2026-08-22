# Project Brief: On-Chain Local-Commerce Escrow — Monad Blitz Abuja

**How to use this doc:** Paste this whole thing as your first message to a new LLM session (or a coding assistant like Claude Code) to get help architecting and building this for the hackathon. It captures the decisions already made so you don't have to re-litigate them — treat the "Locked decisions" sections as settled, and use the LLM to help with the "Needs work" sections.

---

## 1. The idea, in one paragraph

A minimal escrow smart contract on Monad testnet: a buyer locks funds for a local good/service/delivery, the seller/worker fulfills it, funds release automatically on confirmation. The pitch angle is trust in local commerce — gig workers, informal vendors, campus deliveries — where buyers fear paying upfront and sellers fear non-payment after delivery, and where centralized/institutional systems in Nigeria carry a real trust deficit. The demo turns the audience into live participants: everyone in the room opens and resolves an escrow simultaneously via a QR code, proving the system holds up under real concurrent load — which is Monad's actual differentiator (parallel execution, 10k TPS, sub-second finality), not a decorative add-on.

## 2. Why this idea (context, don't relitigate)

- Built for Monad Blitz Abuja: ~130 attendees, mostly University of Abuja students, most with limited prior Monad-specific knowledge. Local competition is low; winners are picked by live peer audience vote.
- Explicitly scoped AWAY from two harder versions of this idea:
  - **Not** a generic multi-tenant "escrow API for any platform" — too much surface area for a one-day build.
  - **Not** an AI-agent-to-agent escrow with cryptographic execution proofs — this is a genuinely hard, actively-competitive space in 2026 (live production competitors already exist), and "proof of task completion" for autonomous agents is an unsolved problem you shouldn't improvise live.
- This is the human-mediated, human-facing version on purpose. Keep it that way.
- Why Monad specifically, honestly: many independent escrows are non-conflicting state (each lives in its own storage slot), so many resolving in parallel is a clean, non-decorative demonstration of Monad's optimistic parallel execution — not a stretch or a buzzword-fit.

## 3. Locked scope — what to build

**In scope (build this):**
- A single escrow smart contract with these states: `Created → Funded → Confirmed → Released` (plus a simple refund/dispute path if time allows — see stretch goals).
- Functions: `createEscrow(seller, amount)`, `fund(id)`, `confirmDelivery(id)` (buyer-triggered), auto-`release(id)` on confirmation. Keep dispute resolution to a single trusted arbiter role (you), not a voting/multisig system.
- A gasless participation flow for the audience (see Section 5 — this is the single most important infrastructure decision, don't skip it).
- A live dashboard visualization that shows individual escrows resolving in real time as the room participates (not just a number ticking up — see Section 6 on why this matters).
- A pre-recorded backup demo video of a full successful run, in case live WiFi/RPC issues occur during the actual presentation.

**Out of scope (do not attempt in the 6-7 hour window):**
- AI agent verification/execution proofs.
- Multi-token support, complex fee structures, or a generalized SDK/API layer for third-party platforms.
- On-chain dispute voting or multi-party arbitration.
- Full KYC/identity — this is a testnet demo, not a compliance product.

## 3.5. The canonical demo flow — read this exactly, do not deviate

This is the single most important thing to get right when coding this. **Every audience member acts only as a buyer. There is no live pairing between two audience members, and no "seller scans a QR too" step.**

- The "seller" in every escrow is one fixed, pre-existing wallet you control — the "demo vendor" (narratively: "Campus Vendor," a stand-in for whatever local business/gig-worker the escrow represents). This address is hardcoded/configured once, not chosen live.
- Each audience member's phone flow is exactly two taps, both self-contained, no coordination with anyone else required:
  1. **Tap "Lock Escrow"** → creates AND funds an escrow to the fixed demo seller in one atomic transaction.
  2. **Tap "Confirm Delivery"** → releases those same funds to the demo seller.
- **Why it's built this way on purpose, not as a shortcut:** the demo's entire value is proving Monad handles many *independent, concurrent* transactions without contention. That property is fully demonstrated by 130 people each running their own two-tap flow to one fixed seller at the same time — it does not require real two-party matching, and real-time pairing of random audience members would introduce coordination failure modes (people not finding a partner, partners acting out of order, confusion mid-crowd) that have nothing to do with Monad and would actively hurt the live demo.
- If you want narrative realism without complexity: it's fine to let each person pick a *label* for what they're "buying" (e.g. "Campus Lunch," "Graphic Design Gig") from a preset list — that's just a string passed into `createEscrow`, not a second real participant.
- **When prompting a coding LLM to build this, explicitly tell it:** "There is only one seller address, hardcoded, for the entire demo. Do not build any UI, contract logic, or matching system for pairing two live users together. Every participant is buyer-only, and their own confirm action releases funds to the fixed seller." Coding assistants will sometimes default to a more "realistic" two-sided marketplace pattern unless told not to — head that off explicitly.

## 4. Smart contract architecture — needs work with the LLM

Rough shape to start from (refine with your coding assistant):

```solidity
enum Status { Created, Funded, Confirmed, Released, Refunded }

struct Escrow {
    address buyer;
    address seller;
    uint256 amount;
    Status status;
}

mapping(uint256 => Escrow) public escrows;
uint256 public nextId;

function createEscrow(address seller) external returns (uint256 id);
function fund(uint256 id) external payable; // or ERC20 transferFrom
function confirmDelivery(uint256 id) external; // only buyer
function release(uint256 id) internal; // called automatically on confirm
function refund(uint256 id) external; // only arbiter/owner, simplified dispute path
```

Decisions to make with your coding assistant:
- Native MON vs. a mock ERC-20 "stablecoin" for the escrowed amount (mock ERC20 is probably cleaner for the demo narrative — "this is how NGN-pegged stablecoins would work").
- Whether `createEscrow` and `fund` should be combined into one call to cut down on the number of transactions each audience member has to trigger (fewer taps = smoother live demo).
- Gas/deployment target: Monad Testnet, chain ID `10143`, RPC `https://testnet-rpc.monad.xyz/`. Confirm current faucet and RPC rate limits close to the event date, since these get adjusted over time — don't assume the details in this doc are still current by build day.

## 5. The gasless/relayer flow — critical, don't skip

~130 students will not have funded wallets or want to install MetaMask mid-demo. The whole "audience as live participants" mechanic depends on removing that friction entirely.

Recommended pattern:
- A single backend relayer wallet, funded ahead of time with testnet MON from the faucet, pays gas for every audience transaction.
- Each QR scan generates (or is assigned) a lightweight session/burner key client-side — no wallet app required, no seed phrase, just a tap.
- The frontend sends the signed intent to your backend, which relays it on-chain and pays gas.
- Ask your coding assistant to help you choose between: a simple custom relayer (Node/Express endpoint that submits the transaction), or a more standard meta-transaction/session-key pattern if time allows. For a one-day build, the simple custom relayer is almost certainly the right call — don't over-engineer this part.

## 6. Demo dashboard — design principle to hand to the LLM

Earlier design feedback on this project (from a prior planning session) was explicit: **a number counting up is not a compelling demo for a semi-technical audience.** The audience needs to feel their own individual action land, not just watch an aggregate statistic change.

Design the live screen around:
- Individual, visually distinct events per escrow (e.g., a name/emoji/avatar tied to each participant's action appearing and resolving on screen), not just a counter.
- Visible timestamps or a "just now" indicator so speed is legible without requiring the audience to understand block times.
- A brief, explicit narrated comparison during the demo ("on a congested chain, this is where things would queue or fail — here it just doesn't") so the technical point isn't left implicit.

## 7. Load-testing plan before the event

(Condensed from earlier planning — ask your coding assistant to help script this.)

1. Generate ~150-200 throwaway wallets via script; fund them in advance from one faucet-funded wallet so you're not fighting faucet rate limits on demo day.
2. Write a concurrent test script (`Promise.all`, not a sequential loop) that fires the full flow — create, fund, confirm — from all wallets at once.
3. Run this against the **exact RPC endpoint your live frontend will use**, not a more generous one — free-tier RPC providers can have their own rate limits regardless of what Monad itself can handle.
4. Log success rate, latency, and confirm the fairness/ordering logic behaves correctly under concurrency (no bugs that only show up when many calls hit the same function at once).
5. Stress-test the frontend and relayer separately from the raw contract — this is often where things break even when the chain and contract are fine.
6. Do a live dry-run with 15-20 real people on their own phones a day or two before the event. Scripts don't catch human confusion (bad QR scan, slow phone, unclear instructions) — real people are the only real test of that.
7. Confirm the venue's WiFi/data capacity for 130 concurrent phone connections directly with organizers ahead of time — this is a bigger live-demo risk than anything in your code.

## 8. Rough 6-7 hour build timeline (adjust with your team)

- **Hour 0-1:** Finalize contract design, set up dev environment (Foundry or Hardhat), deploy skeleton to testnet.
- **Hour 1-2.5:** Core contract logic + tests (create, fund, confirm, release, basic refund).
- **Hour 2.5-4:** Relayer backend + minimal frontend (QR landing page, tap-to-participate flow).
- **Hour 4-5:** Live dashboard visualization.
- **Hour 5-6:** Integration testing end-to-end with a handful of real devices.
- **Hour 6-6.5:** Run the load test script, fix anything that breaks under concurrency.
- **Hour 6.5-7:** Record the backup demo video, rehearse the live pitch.

## 9. Pitch framing to prep alongside the build

- **Why blockchain, not just a better server/queue system:** lead with auditable, tamper-evident fairness — not just speed. In a context where institutional/portal trust is often low, "anyone can independently verify no one got special treatment, and no single admin controls the outcome" is a trust story a bigger server budget can't replicate.
- **Narrow first customer, if asked about startup potential:** don't pitch "escrow for all commerce" — pick one nameable, small, real pilot (a campus society, a delivery service, an event ticket drop) as the believable first step.
- **Business model, if asked:** per-transaction or per-event licensing fee to the platform/organizer, not a token.
- **Roadmap/vision line, if asked about ambition:** this extends naturally toward agent-to-agent task escrows and automated budget pools for AI agents — mention it as future direction, not something you built or are claiming exists today.
- **Honest framing on competition:** the general concept of on-chain escrow/verified settlement is an active, well-funded global space in 2026 (worth knowing this going in so you're not caught off guard by a knowledgeable judge) — your edge for this specific event is being the best-executed, most locally relevant, most clearly-demoed version in the room, not claiming to have invented the category.

## 10. Open questions to resolve with your coding assistant before hackathon day

- Final call on native MON vs. mock ERC-20 for escrowed amounts.
- Exact relayer implementation (custom vs. meta-transaction standard).
- Team role split if building with others (contracts/backend, frontend/relayer, demo-flow/pitch).
- Confirm current Monad testnet faucet limits and RPC provider choice close to the event date — infrastructure details drift over time, verify freshly rather than trusting this doc's specifics by build day.
