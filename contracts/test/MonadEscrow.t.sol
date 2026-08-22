// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MonadEscrow} from "../src/MonadEscrow.sol";

/// @notice Reentrancy attack helper — tries to re-enter confirmDelivery on receive()
contract MaliciousSeller {
    MonadEscrow public target;
    uint256 public targetId;
    uint256 public attackAttempts;

    constructor(MonadEscrow _target) {
        target = _target;
    }

    function setTargetId(uint256 _id) external {
        targetId = _id;
    }

    receive() external payable {
        if (attackAttempts < 3) {
            attackAttempts++;
            try target.confirmDelivery(targetId) {} catch {}
        }
    }
}

contract MonadEscrowTest is Test {
    MonadEscrow public escrow;

    address owner;
    address relayer   = makeAddr("relayer");
    address buyer1    = makeAddr("buyer1");
    address buyer2    = makeAddr("buyer2");
    address seller    = makeAddr("seller");
    address attacker  = makeAddr("attacker");

    // Re-declare events for vm.expectEmit
    event EscrowCreatedAndFunded(
        uint256 indexed id, address indexed buyer, address indexed seller, uint256 amount, string title
    );
    event EscrowReleased(
        uint256 indexed id, address indexed buyer, address indexed seller, uint256 amount
    );
    event EscrowRefunded(uint256 indexed id, address indexed buyer, uint256 amount);

    function setUp() public {
        owner = address(this);
        escrow = new MonadEscrow();
        escrow.setRelayer(relayer, true);

        vm.deal(relayer, 100 ether);
        vm.deal(buyer1, 10 ether);
        vm.deal(buyer2, 10 ether);
        vm.deal(attacker, 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  HAPPY PATH
    // ═══════════════════════════════════════════════════════════════════

    function test_createAndFundEscrow() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Campus Lunch");

        assertEq(id, 1);

        MonadEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.buyer, buyer1);
        assertEq(e.seller, seller);
        assertEq(e.amount, 1 ether);
        assertEq(keccak256(bytes(e.title)), keccak256(bytes("Campus Lunch")));
        assertEq(uint8(e.status), 1); // Funded
        assertGt(e.createdAt, 0);
        assertEq(e.completedAt, 0);
    }

    function test_fullFlow_createFundConfirmRelease() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Graphic Design Gig");

        uint256 sellerBefore = seller.balance;

        // Relayer confirms on behalf of buyer (gasless flow)
        vm.prank(relayer);
        escrow.confirmDelivery(id);

        assertEq(seller.balance, sellerBefore + 1 ether);

        MonadEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), 2); // ConfirmedReleased
        assertGt(e.completedAt, 0);
    }

    function test_buyerCanConfirmDirectly() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 0.5 ether}(buyer1, seller, "Study Pack");

        uint256 sellerBefore = seller.balance;

        vm.prank(buyer1);
        escrow.confirmDelivery(id);

        assertEq(seller.balance, sellerBefore + 0.5 ether);
    }

    function test_multipleEscrowsSequential() public {
        vm.startPrank(relayer);

        uint256 id1 = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Lunch 1");
        uint256 id2 = escrow.createAndFundEscrow{value: 2 ether}(buyer2, seller, "Lunch 2");
        uint256 id3 = escrow.createAndFundEscrow{value: 0.5 ether}(buyer1, seller, "Lunch 3");

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(escrow.totalEscrows(), 3);

        escrow.confirmDelivery(id1);
        escrow.confirmDelivery(id3);

        assertEq(escrow.totalReleased(), 2);

        vm.stopPrank();
    }

    function test_refundByOwner() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Refund Test");

        uint256 buyerBefore = buyer1.balance;

        escrow.refund(id); // called by owner (this test contract)

        assertEq(buyer1.balance, buyerBefore + 1 ether);

        MonadEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), 3); // Refunded
        assertGt(e.completedAt, 0);
    }

    function test_getRecentEscrows() public {
        vm.startPrank(relayer);
        escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "E1");
        escrow.createAndFundEscrow{value: 2 ether}(buyer2, seller, "E2");
        escrow.createAndFundEscrow{value: 3 ether}(buyer1, seller, "E3");
        vm.stopPrank();

        MonadEscrow.Escrow[] memory recent = escrow.getRecentEscrows(2);
        assertEq(recent.length, 2);
        assertEq(recent[0].id, 3); // newest first
        assertEq(recent[1].id, 2);
    }

    function test_getRecentEscrows_limitExceedsTotal() public {
        vm.prank(relayer);
        escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Only One");

        MonadEscrow.Escrow[] memory recent = escrow.getRecentEscrows(100);
        assertEq(recent.length, 1);
        assertEq(recent[0].id, 1);
    }

    function test_getRecentEscrows_empty() public {
        MonadEscrow.Escrow[] memory recent = escrow.getRecentEscrows(10);
        assertEq(recent.length, 0);
    }

    function test_totalVolume() public {
        vm.startPrank(relayer);
        escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "V1");
        escrow.createAndFundEscrow{value: 2.5 ether}(buyer2, seller, "V2");
        vm.stopPrank();

        assertEq(escrow.totalVolume(), 3.5 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ACCESS CONTROL (security-critical — treat as gating tests)
    // ═══════════════════════════════════════════════════════════════════

    function test_revert_confirmWrongBuyer() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Wrong Buyer");

        // Attacker (not buyer, not relayer) tries to confirm
        vm.prank(attacker);
        vm.expectRevert("Not buyer or authorized relayer");
        escrow.confirmDelivery(id);
    }

    function test_revert_confirmAlreadyReleased() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Double Confirm");

        vm.prank(relayer);
        escrow.confirmDelivery(id);

        // Second confirm should revert
        vm.prank(relayer);
        vm.expectRevert("Not in funded state");
        escrow.confirmDelivery(id);
    }

    function test_revert_refundNotOwner() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Refund Auth");

        vm.prank(attacker);
        vm.expectRevert("Not owner");
        escrow.refund(id);
    }

    function test_revert_refundAlreadyReleased() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Refund After Release");

        vm.prank(relayer);
        escrow.confirmDelivery(id);

        vm.expectRevert("Not in funded state");
        escrow.refund(id);
    }

    function test_revert_zeroValue() public {
        vm.prank(relayer);
        vm.expectRevert("Must send MON");
        escrow.createAndFundEscrow{value: 0}(buyer1, seller, "Zero");
    }

    function test_revert_invalidBuyer() public {
        vm.prank(relayer);
        vm.expectRevert("Invalid buyer");
        escrow.createAndFundEscrow{value: 1 ether}(address(0), seller, "Bad Buyer");
    }

    function test_revert_invalidSeller() public {
        vm.prank(relayer);
        vm.expectRevert("Invalid seller");
        escrow.createAndFundEscrow{value: 1 ether}(buyer1, address(0), "Bad Seller");
    }

    function test_revert_emptyTitle() public {
        vm.prank(relayer);
        vm.expectRevert("Title required");
        escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "");
    }

    function test_revert_titleTooLong() public {
        // 129 bytes — exceeds 128 limit
        bytes memory longTitle = new bytes(129);
        for (uint256 i = 0; i < 129; i++) longTitle[i] = "A";

        vm.prank(relayer);
        vm.expectRevert("Title too long");
        escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, string(longTitle));
    }

    function test_revert_setRelayerNotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        escrow.setRelayer(attacker, true);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  REENTRANCY
    // ═══════════════════════════════════════════════════════════════════

    function test_reentrancyProtection() public {
        MaliciousSeller malicious = new MaliciousSeller(escrow);

        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, address(malicious), "Reentrancy");

        malicious.setTargetId(id);

        vm.prank(relayer);
        escrow.confirmDelivery(id);

        // Malicious seller received funds but re-entrance attempts failed
        assertEq(escrow.totalReleased(), 1);
        assertEq(address(malicious).balance, 1 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    function test_emitsEscrowCreatedAndFunded() public {
        vm.expectEmit(true, true, true, true);
        emit EscrowCreatedAndFunded(1, buyer1, seller, 1 ether, "Event Test");

        vm.prank(relayer);
        escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Event Test");
    }

    function test_emitsEscrowReleased() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Release Event");

        vm.expectEmit(true, true, true, true);
        emit EscrowReleased(1, buyer1, seller, 1 ether);

        vm.prank(relayer);
        escrow.confirmDelivery(id);
    }

    function test_emitsEscrowRefunded() public {
        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: 1 ether}(buyer1, seller, "Refund Event");

        vm.expectEmit(true, true, false, true);
        emit EscrowRefunded(1, buyer1, 1 ether);

        escrow.refund(id);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════

    function testFuzz_createWithVariousAmounts(uint256 amount) public {
        amount = bound(amount, 1, 100 ether);
        vm.deal(relayer, amount + 1 ether);

        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: amount}(buyer1, seller, "Fuzz");

        MonadEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.amount, amount);
        assertEq(uint8(e.status), 1);
    }

    function testFuzz_fullFlowPreservesBalances(uint256 amount) public {
        amount = bound(amount, 1, 50 ether);
        vm.deal(relayer, amount + 1 ether);

        uint256 sellerBefore = seller.balance;

        vm.prank(relayer);
        uint256 id = escrow.createAndFundEscrow{value: amount}(buyer1, seller, "Balance Fuzz");

        vm.prank(relayer);
        escrow.confirmDelivery(id);

        assertEq(seller.balance, sellerBefore + amount);
    }
}
