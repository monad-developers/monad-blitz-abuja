// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MonadEscrow — Gasless local-commerce escrow for Monad Blitz Abuja
/// @notice Atomic create+fund, buyer-triggered release, admin refund path.
///         Designed for a live demo where ~130 audience members act as buyers
///         against one fixed demo seller, via a gasless backend relayer.
contract MonadEscrow {
    // ─── Types ───────────────────────────────────────────────────────────

    enum EscrowStatus {
        None,               // 0 — slot never used
        Funded,             // 1 — MON locked, awaiting delivery confirmation
        ConfirmedReleased,  // 2 — buyer confirmed, funds sent to seller
        Refunded            // 3 — admin refunded back to buyer
    }

    struct Escrow {
        uint256 id;
        address buyer;
        address seller;
        uint256 amount;
        string title;         // e.g. "Campus Lunch Delivery"
        uint256 createdAt;
        uint256 completedAt;
        EscrowStatus status;
    }

    // ─── State ───────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public authorizedRelayers;
    mapping(uint256 => Escrow) internal _escrows;

    uint256 public nextId;
    uint256 public totalEscrows;
    uint256 public totalReleased;
    uint256 public totalVolume;

    bool private _locked; // reentrancy guard

    // ─── Events ──────────────────────────────────────────────────────────

    event EscrowCreatedAndFunded(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        string title
    );

    event EscrowReleased(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 amount
    );

    event EscrowRefunded(
        uint256 indexed id,
        address indexed buyer,
        uint256 amount
    );

    event RelayerUpdated(address indexed relayer, bool authorized);

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        authorizedRelayers[msg.sender] = true;
        nextId = 1;
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    /// @notice Authorize or revoke a relayer address (only owner)
    function setRelayer(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerUpdated(relayer, authorized);
    }

    /// @notice Transfer contract ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // ─── Core ────────────────────────────────────────────────────────────

    /// @notice Atomically create and fund an escrow in a single transaction.
    ///         The relayer calls this with msg.value = escrow amount.
    /// @param buyer  The buyer's address (burner key from the frontend)
    /// @param seller The seller address (demo: always the fixed vendor wallet)
    /// @param title  Human-readable label (e.g. "Campus Lunch Delivery")
    /// @return id    The sequential escrow ID
    function createAndFundEscrow(
        address buyer,
        address seller,
        string calldata title
    ) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "Must send MON");
        require(buyer != address(0), "Invalid buyer");
        require(seller != address(0), "Invalid seller");
        require(bytes(title).length > 0, "Title required");
        require(bytes(title).length <= 128, "Title too long");

        uint256 id = nextId++;

        _escrows[id] = Escrow({
            id: id,
            buyer: buyer,
            seller: seller,
            amount: msg.value,
            title: title,
            createdAt: block.timestamp,
            completedAt: 0,
            status: EscrowStatus.Funded
        });

        totalEscrows++;
        totalVolume += msg.value;

        emit EscrowCreatedAndFunded(id, buyer, seller, msg.value, title);
        return id;
    }

    /// @notice Buyer (or authorized relayer) confirms delivery → auto-release to seller.
    ///         In the gasless flow, the relayer calls this after verifying the buyer's identity.
    function confirmDelivery(uint256 id) external nonReentrant {
        Escrow storage e = _escrows[id];
        require(e.status == EscrowStatus.Funded, "Not in funded state");
        require(
            msg.sender == e.buyer || msg.sender == owner || authorizedRelayers[msg.sender],
            "Not buyer or authorized relayer"
        );

        // Effects before interactions (CEI pattern)
        e.status = EscrowStatus.ConfirmedReleased;
        e.completedAt = block.timestamp;
        totalReleased++;

        // Transfer MON to seller
        (bool success,) = payable(e.seller).call{value: e.amount}("");
        require(success, "Transfer to seller failed");

        emit EscrowReleased(id, e.buyer, e.seller, e.amount);
    }

    /// @notice Admin/arbiter emergency refund — returns locked MON to buyer.
    function refund(uint256 id) external onlyOwner nonReentrant {
        Escrow storage e = _escrows[id];
        require(e.status == EscrowStatus.Funded, "Not in funded state");

        e.status = EscrowStatus.Refunded;
        e.completedAt = block.timestamp;

        (bool success,) = payable(e.buyer).call{value: e.amount}("");
        require(success, "Refund to buyer failed");

        emit EscrowRefunded(id, e.buyer, e.amount);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    /// @notice Get a single escrow by ID
    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return _escrows[id];
    }

    /// @notice Get the N most recent escrows (newest first), for dashboard display
    function getRecentEscrows(uint256 limit) external view returns (Escrow[] memory) {
        uint256 total = nextId - 1;
        if (limit > total) limit = total;
        if (limit == 0) return new Escrow[](0);

        Escrow[] memory result = new Escrow[](limit);
        for (uint256 i = 0; i < limit; i++) {
            result[i] = _escrows[total - i];
        }
        return result;
    }

    // ─── Fallback ────────────────────────────────────────────────────────

    /// @notice Accept direct MON deposits (e.g. for topping up the contract balance)
    receive() external payable {}
}
