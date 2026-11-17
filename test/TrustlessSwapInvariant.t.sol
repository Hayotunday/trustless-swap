// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {TrustlessSwap} from "src/TrustlessSwap.sol";

contract InvariantTestNFT is ERC721 {
  constructor() ERC721("Invariant NFT", "INFT") {}

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}

contract InvariantTestToken is ERC20 {
  constructor() ERC20("Invariant Token", "ITKN") {}

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

contract SwapInvariantHandler {
  Vm private constant vm =
    Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
  address private constant PARTY_B = address(0xB);
  uint256 private constant TOKEN_AMOUNT = 1 ether;
  uint256 private constant MAX_OFFERS = 12;

  TrustlessSwap private immutable swap;
  InvariantTestNFT private immutable requestNFT;
  InvariantTestNFT private immutable responseNFT;
  InvariantTestToken private immutable responseToken;

  uint256 private count;
  uint256 private nextResponseNftId = 100;
  uint256[MAX_OFFERS] private offerIds;
  uint256[MAX_OFFERS] private requestNftIds;
  uint256[MAX_OFFERS] private responseNftIds;

  constructor() {
    swap = new TrustlessSwap();
    requestNFT = new InvariantTestNFT();
    responseNFT = new InvariantTestNFT();
    responseToken = new InvariantTestToken();
  }

  function createOffer(uint8 assetTypeSeed, uint32 durationSeed) external {
    if (count == MAX_OFFERS) return;

    TrustlessSwap.AssetType assetType =
      TrustlessSwap.AssetType(assetTypeSeed % 3);
    uint256 requestNftId = count + 1;
    uint256 duration = uint256(durationSeed % 1000) + 1;
    address responseNftAddress = assetType == TrustlessSwap.AssetType.TOKEN
      ? address(0)
      : address(responseNFT);
    address responseTokenAddress = assetType == TrustlessSwap.AssetType.NFT
      ? address(0)
      : address(responseToken);
    uint256 responseAmount =
      assetType == TrustlessSwap.AssetType.NFT ? 0 : TOKEN_AMOUNT;

    requestNFT.mint(address(this), requestNftId);
    requestNFT.approve(address(swap), requestNftId);
    uint256 offerId = swap.createOffer(
      address(requestNFT),
      requestNftId,
      duration,
      assetType,
      responseNftAddress,
      responseTokenAddress,
      responseAmount
    );

    offerIds[count] = offerId;
    requestNftIds[count] = requestNftId;
    count++;
  }

  function acceptOffer(uint256 indexSeed) external {
    if (count == 0) return;

    uint256 index = indexSeed % count;
    TrustlessSwap.Offer memory offer = swap.getOffer(offerIds[index]);
    if (
      offer.status != TrustlessSwap.OfferStatus.PENDING
        || block.timestamp > offer.deadline
    ) return;

    uint256 responseNftId;
    if (offer.responseAssetType != TrustlessSwap.AssetType.TOKEN) {
      responseNftId = nextResponseNftId++;
      responseNftIds[index] = responseNftId;
      responseNFT.mint(PARTY_B, responseNftId);
      vm.prank(PARTY_B);
      responseNFT.approve(address(swap), responseNftId);
    }

    if (offer.responseAssetType != TrustlessSwap.AssetType.NFT) {
      responseToken.mint(PARTY_B, TOKEN_AMOUNT);
      vm.prank(PARTY_B);
      responseToken.approve(address(swap), TOKEN_AMOUNT);
    }

    vm.prank(PARTY_B);
    if (offer.responseAssetType == TrustlessSwap.AssetType.TOKEN) {
      swap.acceptOffer(offerIds[index]);
    } else {
      swap.acceptOffer(offerIds[index], responseNftId);
    }
  }

  function closeOffer(uint256 indexSeed) external {
    if (count == 0) return;

    uint256 index = indexSeed % count;
    if (
      swap.getOffer(offerIds[index]).status != TrustlessSwap.OfferStatus.PENDING
    ) return;

    swap.closeOffer(offerIds[index]);
  }

  function advanceTime(uint32 secondsSeed) external {
    vm.warp(block.timestamp + uint256(secondsSeed % 2000));
  }

  function reclaimExpiredOffer(uint256 indexSeed) external {
    if (count == 0) return;

    uint256 index = indexSeed % count;
    TrustlessSwap.Offer memory offer = swap.getOffer(offerIds[index]);
    if (
      offer.status != TrustlessSwap.OfferStatus.PENDING || offer.deadline == 0
        || block.timestamp <= offer.deadline
    ) return;

    swap.reclaimExpiredEscrow(offerIds[index]);
  }

  function stateIsConsistent() external view returns (bool) {
    uint256 expectedTokenBalance;

    for (uint256 i; i < count; i++) {
      TrustlessSwap.Offer memory offer = swap.getOffer(offerIds[i]);
      address requestOwner = requestNFT.ownerOf(requestNftIds[i]);

      if (offer.status == TrustlessSwap.OfferStatus.PENDING) {
        if (requestOwner != address(swap) || offer.isEscrowReclaimed) {
          return false;
        }
      } else if (offer.status == TrustlessSwap.OfferStatus.COMPLETED) {
        if (requestOwner != PARTY_B || offer.isEscrowReclaimed) return false;

        if (offer.responseAssetType != TrustlessSwap.AssetType.NFT) {
          expectedTokenBalance += TOKEN_AMOUNT;
        }
        if (
          offer.responseAssetType != TrustlessSwap.AssetType.TOKEN
            && responseNFT.ownerOf(responseNftIds[i]) != address(this)
        ) return false;
      } else if (
        offer.status == TrustlessSwap.OfferStatus.CLOSED
          || offer.status == TrustlessSwap.OfferStatus.EXPIRED
      ) {
        if (requestOwner != address(this) || !offer.isEscrowReclaimed) {
          return false;
        }
      } else {
        return false;
      }
    }

    return responseToken.balanceOf(address(this)) == expectedTokenBalance;
  }

  function offerCount() external view returns (uint256) {
    return count;
  }
}

contract TrustlessSwapInvariantTest is StdInvariant, Test {
  SwapInvariantHandler private handler;

  function setUp() public {
    handler = new SwapInvariantHandler();
    targetContract(address(handler));
  }

  function invariant_EscrowAndPaymentsMatchOfferStates() public view {
    assertTrue(handler.stateIsConsistent());
  }
}
