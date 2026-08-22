// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MonadEscrow} from "../src/MonadEscrow.sol";

/// @notice Deploy MonadEscrow to Monad Testnet and authorize the relayer.
///
/// Usage:
///   cd contracts
///   forge script script/Deploy.s.sol \
///     --rpc-url https://testnet-rpc.monad.xyz/ \
///     --broadcast \
///     --private-key $PRIVATE_KEY \
///     -vvv
///
/// Required env vars:
///   PRIVATE_KEY       — deployer wallet private key
///   RELAYER_ADDRESS   — backend relayer wallet address to authorize
contract DeployMonadEscrow is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address relayerAddress = vm.envOr("RELAYER_ADDRESS", msg.sender);

        vm.startBroadcast(deployerPrivateKey);

        MonadEscrow escrow = new MonadEscrow();

        // Authorize the backend relayer to submit txs on behalf of buyers
        escrow.setRelayer(relayerAddress, true);

        console.log("=== MonadEscrow Deployed ===");
        console.log("Contract:        ", address(escrow));
        console.log("Owner:           ", escrow.owner());
        console.log("Relayer:         ", relayerAddress);
        console.log("Next ID:         ", escrow.nextId());

        vm.stopBroadcast();
    }
}
