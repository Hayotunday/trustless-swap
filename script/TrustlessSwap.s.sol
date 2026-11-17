// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {TrustlessSwap} from "src/TrustlessSwap.sol";

contract TrustlessSwapScript is Script {
  uint256 private constant DEFAULT_EXPECTED_CHAIN_ID = 11155111;

  error UnexpectedChainId(uint256 actual, uint256 expected);

  function run() external returns (TrustlessSwap swap) {
    uint256 expectedChainId =
      vm.envOr("EXPECTED_CHAIN_ID", DEFAULT_EXPECTED_CHAIN_ID);
    if (block.chainid != expectedChainId) {
      revert UnexpectedChainId(block.chainid, expectedChainId);
    }

    vm.startBroadcast();
    swap = new TrustlessSwap();
    vm.stopBroadcast();
  }
}
