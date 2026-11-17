// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {TrustlessSwap} from "src/TrustlessSwap.sol";

contract SwapTestNFT is ERC721 {
  constructor() ERC721("Swap Test NFT", "STNFT") {}

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}

contract SwapTestToken is ERC20 {
  constructor() ERC20("Swap Test Token", "STT") {}

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

contract TrustlessSwapTest is Test {
  TrustlessSwap private swap;
  SwapTestNFT private requestNFT;
  SwapTestNFT private responseNFT;
  SwapTestToken private responseToken;

  address private constant PARTY_B = address(0xB);
  uint256 private constant TOKEN_AMOUNT = 5 ether;
  uint256 private nextRequestId;

  function setUp() public {
    swap = new TrustlessSwap();
    requestNFT = new SwapTestNFT();
    responseNFT = new SwapTestNFT();
    responseToken = new SwapTestToken();
    nextRequestId = 1;
  }

  function testCreateOfferStoresExpectedDataAndEscrowsRequestNFT() public {
    uint256 duration = 1 days;
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.BOTH, duration);
    TrustlessSwap.Offer memory offer = swap.getOffer(offerId);

    assertEq(offer.partyA, address(this));
    assertEq(offer.partyB, address(0));
    assertEq(offer.requestNftAddress, address(requestNFT));
    assertEq(offer.requestNftId, 1);
    assertEq(
      uint256(offer.responseAssetType), uint256(TrustlessSwap.AssetType.BOTH)
    );
    assertEq(offer.responseNftAddress, address(responseNFT));
    assertEq(offer.responseTokenAddress, address(responseToken));
    assertEq(offer.responseTokenAmount, TOKEN_AMOUNT);
    assertEq(offer.deadline, block.timestamp + duration);
    assertFalse(offer.hasResponseNftId);
    assertFalse(offer.isEscrowReclaimed);
    assertEq(uint256(offer.status), uint256(TrustlessSwap.OfferStatus.PENDING));
    assertEq(requestNFT.ownerOf(offer.requestNftId), address(swap));
  }

  function testCreateOfferWithZeroDurationHasNoExpiry() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);

    assertEq(swap.getOffer(offerId).deadline, 0);
  }

  function testCreateOfferRejectsZeroRequestNFTAddress() public {
    vm.expectRevert(TrustlessSwap.InvalidRequestNftAddress.selector);
    _callCreateOffer(
      address(0),
      TrustlessSwap.AssetType.TOKEN,
      address(0),
      address(responseToken),
      TOKEN_AMOUNT,
      0
    );
  }

  function testCreateNFTOfferRejectsZeroResponseNFTAddress() public {
    vm.expectRevert(TrustlessSwap.InvalidResponseNftAddress.selector);
    _callCreateOffer(
      address(requestNFT),
      TrustlessSwap.AssetType.NFT,
      address(0),
      address(0),
      0,
      0
    );
  }

  function testCreateTokenOfferRejectsZeroResponseTokenAddress() public {
    vm.expectRevert(TrustlessSwap.InvalidResponseTokenAddress.selector);
    _callCreateOffer(
      address(requestNFT),
      TrustlessSwap.AssetType.TOKEN,
      address(0),
      address(0),
      TOKEN_AMOUNT,
      0
    );
  }

  function testCreateTokenOfferRejectsZeroAmount() public {
    vm.expectRevert(TrustlessSwap.InvalidResponseTokenAmount.selector);
    _callCreateOffer(
      address(requestNFT),
      TrustlessSwap.AssetType.TOKEN,
      address(0),
      address(responseToken),
      0,
      0
    );
  }

  function testCreateBothOfferRejectsZeroNFTAddress() public {
    vm.expectRevert(TrustlessSwap.InvalidResponseNftAddress.selector);
    _callCreateOffer(
      address(requestNFT),
      TrustlessSwap.AssetType.BOTH,
      address(0),
      address(responseToken),
      TOKEN_AMOUNT,
      0
    );
  }

  function testCreateBothOfferRejectsZeroTokenAddress() public {
    vm.expectRevert(TrustlessSwap.InvalidResponseTokenAddress.selector);
    _callCreateOffer(
      address(requestNFT),
      TrustlessSwap.AssetType.BOTH,
      address(responseNFT),
      address(0),
      TOKEN_AMOUNT,
      0
    );
  }

  function testCreateBothOfferRejectsZeroAmount() public {
    vm.expectRevert(TrustlessSwap.InvalidResponseTokenAmount.selector);
    _callCreateOffer(
      address(requestNFT),
      TrustlessSwap.AssetType.BOTH,
      address(responseNFT),
      address(responseToken),
      0,
      0
    );
  }

  function testAcceptNFTOfferTransfersBothNFTsIncludingTokenIdZero() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.NFT, 0);
    responseNFT.mint(PARTY_B, 0);

    vm.prank(PARTY_B);
    responseNFT.approve(address(swap), 0);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId, 0);

    _assertCompleted(offerId, PARTY_B);
    assertEq(requestNFT.ownerOf(1), PARTY_B);
    assertEq(responseNFT.ownerOf(0), address(this));
  }

  function testAcceptTokenOfferTransfersPaymentAndRequestNFT() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);
    responseToken.mint(PARTY_B, TOKEN_AMOUNT);

    vm.prank(PARTY_B);
    responseToken.approve(address(swap), TOKEN_AMOUNT);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);

    _assertCompleted(offerId, PARTY_B);
    assertEq(requestNFT.ownerOf(1), PARTY_B);
    assertEq(responseToken.balanceOf(address(this)), TOKEN_AMOUNT);
    assertEq(responseToken.balanceOf(PARTY_B), 0);
  }

  function testAcceptBothOfferTransfersNFTAndPayment() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.BOTH, 0);
    responseNFT.mint(PARTY_B, 0);
    responseToken.mint(PARTY_B, TOKEN_AMOUNT);

    vm.startPrank(PARTY_B);
    responseNFT.approve(address(swap), 0);
    responseToken.approve(address(swap), TOKEN_AMOUNT);
    swap.acceptOffer(offerId, 0);
    vm.stopPrank();

    _assertCompleted(offerId, PARTY_B);
    assertEq(requestNFT.ownerOf(1), PARTY_B);
    assertEq(responseNFT.ownerOf(0), address(this));
    assertEq(responseToken.balanceOf(address(this)), TOKEN_AMOUNT);
    assertEq(responseToken.balanceOf(PARTY_B), 0);
  }

  function testAcceptOfferWithoutNFTIdRevertsForNFTOffer() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.NFT, 0);

    vm.expectRevert(TrustlessSwap.InvalidResponseNftId.selector);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);

    assertEq(
      uint256(swap.getOffer(offerId).status),
      uint256(TrustlessSwap.OfferStatus.PENDING)
    );
  }

  function testAcceptOfferWithoutNFTIdRevertsForBothOffer() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.BOTH, 0);

    vm.expectRevert(TrustlessSwap.InvalidResponseNftId.selector);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);

    assertEq(
      uint256(swap.getOffer(offerId).status),
      uint256(TrustlessSwap.OfferStatus.PENDING)
    );
  }

  function testAcceptanceRevertRollsBackOfferAndEscrowState() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);
    responseToken.mint(PARTY_B, TOKEN_AMOUNT);

    vm.expectRevert();
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);

    assertEq(
      uint256(swap.getOffer(offerId).status),
      uint256(TrustlessSwap.OfferStatus.PENDING)
    );
    assertEq(swap.getOffer(offerId).partyB, address(0));
    assertEq(requestNFT.ownerOf(1), address(swap));
  }

  function testAcceptOfferRejectsExpiredOfferWithEitherOverload() public {
    uint256 nftOfferId = _createOffer(TrustlessSwap.AssetType.NFT, 1);
    uint256 tokenOfferId = _createOffer(TrustlessSwap.AssetType.TOKEN, 1);
    vm.warp(block.timestamp + 2);

    vm.expectRevert(TrustlessSwap.OfferAlreadyExpired.selector);
    vm.prank(PARTY_B);
    swap.acceptOffer(nftOfferId, 0);

    vm.expectRevert(TrustlessSwap.OfferAlreadyExpired.selector);
    vm.prank(PARTY_B);
    swap.acceptOffer(tokenOfferId);

    assertEq(
      uint256(swap.getOffer(nftOfferId).status),
      uint256(TrustlessSwap.OfferStatus.PENDING)
    );
    assertEq(
      uint256(swap.getOffer(tokenOfferId).status),
      uint256(TrustlessSwap.OfferStatus.PENDING)
    );
  }

  function testCloseOfferReturnsEscrowAndCannotCloseTwice() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);

    swap.closeOffer(offerId);

    TrustlessSwap.Offer memory offer = swap.getOffer(offerId);
    assertEq(uint256(offer.status), uint256(TrustlessSwap.OfferStatus.CLOSED));
    assertTrue(offer.isEscrowReclaimed);
    assertEq(requestNFT.ownerOf(1), address(this));

    vm.expectRevert(TrustlessSwap.OfferAlreadyClosed.selector);
    swap.closeOffer(offerId);
  }

  function testCloseOfferRejectsNonOwner() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);

    vm.expectRevert(TrustlessSwap.NotOfferOwner.selector);
    vm.prank(PARTY_B);
    swap.closeOffer(offerId);
  }

  function testCloseOfferRejectsExpiredStatus() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 1);
    vm.warp(block.timestamp + 2);
    swap.reclaimExpiredEscrow(offerId);

    vm.expectRevert(TrustlessSwap.OfferAlreadyExpired.selector);
    swap.closeOffer(offerId);
  }

  function testReclaimExpiredEscrowRejectsNonOwner() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 1);
    vm.warp(block.timestamp + 2);

    vm.expectRevert(TrustlessSwap.NotOfferOwner.selector);
    vm.prank(PARTY_B);
    swap.reclaimExpiredEscrow(offerId);
  }

  function testReclaimExpiredEscrowRejectsActiveOffer() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 1);

    vm.expectRevert(TrustlessSwap.OfferIsStillActive.selector);
    swap.reclaimExpiredEscrow(offerId);
  }

  function testReclaimExpiredEscrowReturnsNFTAndCannotReclaimTwice() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 1);
    vm.warp(block.timestamp + 2);

    swap.reclaimExpiredEscrow(offerId);

    TrustlessSwap.Offer memory offer = swap.getOffer(offerId);
    assertEq(uint256(offer.status), uint256(TrustlessSwap.OfferStatus.EXPIRED));
    assertTrue(offer.isEscrowReclaimed);
    assertEq(requestNFT.ownerOf(1), address(this));

    vm.expectRevert(TrustlessSwap.EscrowAlreadyReclaimed.selector);
    swap.reclaimExpiredEscrow(offerId);
  }

  function testAcceptClosedOfferReverts() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);
    swap.closeOffer(offerId);

    vm.expectRevert(TrustlessSwap.OfferAlreadyClosed.selector);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);
  }

  function testAcceptClosedNFTOfferReverts() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.NFT, 0);
    swap.closeOffer(offerId);

    vm.expectRevert(TrustlessSwap.OfferAlreadyClosed.selector);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId, 0);
  }

  function testAcceptOfferTwiceReverts() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);
    responseToken.mint(PARTY_B, TOKEN_AMOUNT);
    vm.prank(PARTY_B);
    responseToken.approve(address(swap), TOKEN_AMOUNT);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);

    vm.expectRevert(TrustlessSwap.OfferAlreadyAccepted.selector);
    vm.prank(address(0xC));
    swap.acceptOffer(offerId);
  }

  function testAcceptNFTOfferTwiceReverts() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.NFT, 0);
    responseNFT.mint(PARTY_B, 0);
    vm.prank(PARTY_B);
    responseNFT.approve(address(swap), 0);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId, 0);

    vm.expectRevert(TrustlessSwap.OfferAlreadyAccepted.selector);
    vm.prank(address(0xC));
    swap.acceptOffer(offerId, 1);
  }

  function testCloseCompletedOfferRevertsWithoutChangingOwnership() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);
    responseToken.mint(PARTY_B, TOKEN_AMOUNT);
    vm.prank(PARTY_B);
    responseToken.approve(address(swap), TOKEN_AMOUNT);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);

    vm.expectRevert(TrustlessSwap.OfferAlreadyCompleted.selector);
    swap.closeOffer(offerId);

    assertEq(
      uint256(swap.getOffer(offerId).status),
      uint256(TrustlessSwap.OfferStatus.COMPLETED)
    );
    assertEq(requestNFT.ownerOf(1), PARTY_B);
  }

  function testReclaimCompletedOfferRevertsAfterDeadline() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 1);
    responseToken.mint(PARTY_B, TOKEN_AMOUNT);
    vm.prank(PARTY_B);
    responseToken.approve(address(swap), TOKEN_AMOUNT);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);
    vm.warp(block.timestamp + 2);

    vm.expectRevert(TrustlessSwap.OfferAlreadyCompleted.selector);
    swap.reclaimExpiredEscrow(offerId);

    assertEq(
      uint256(swap.getOffer(offerId).status),
      uint256(TrustlessSwap.OfferStatus.COMPLETED)
    );
    assertEq(requestNFT.ownerOf(1), PARTY_B);
  }

  function testPauseBlocksOfferActionsAndOwnerCanUnpause() public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, 0);
    uint256 preparedRequestId = nextRequestId++;
    requestNFT.mint(address(this), preparedRequestId);
    requestNFT.approve(address(swap), preparedRequestId);
    swap.pause();

    vm.expectRevert();
    swap.createOffer(
      address(requestNFT),
      preparedRequestId,
      0,
      TrustlessSwap.AssetType.TOKEN,
      address(0),
      address(responseToken),
      TOKEN_AMOUNT
    );
    vm.expectRevert();
    swap.closeOffer(offerId);

    swap.unpause();
    swap.closeOffer(offerId);
    assertEq(requestNFT.ownerOf(1), address(this));
  }

  function testOnlyOwnerCanPauseOrUnpause() public {
    vm.expectRevert();
    vm.prank(PARTY_B);
    swap.pause();

    swap.pause();
    vm.expectRevert();
    vm.prank(PARTY_B);
    swap.unpause();
    swap.unpause();
  }

  function testFuzzTokenOfferTransfersAnyPositiveAmount(uint96 amount) public {
    vm.assume(amount > 0);
    uint256 offerId = _createOfferWith(
      address(requestNFT),
      TrustlessSwap.AssetType.TOKEN,
      address(0),
      address(responseToken),
      amount,
      0
    );
    responseToken.mint(PARTY_B, amount);

    vm.prank(PARTY_B);
    responseToken.approve(address(swap), amount);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId);

    assertEq(responseToken.balanceOf(address(this)), amount);
    assertEq(requestNFT.ownerOf(1), PARTY_B);
  }

  function testFuzzNFTOfferAcceptsAnyTokenId(uint256 responseNftId) public {
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.NFT, 0);
    responseNFT.mint(PARTY_B, responseNftId);

    vm.prank(PARTY_B);
    responseNFT.approve(address(swap), responseNftId);
    vm.prank(PARTY_B);
    swap.acceptOffer(offerId, responseNftId);

    assertEq(responseNFT.ownerOf(responseNftId), address(this));
    assertEq(requestNFT.ownerOf(1), PARTY_B);
  }

  function testFuzzCreateOfferStoresDeadlineDuration(uint32 duration) public {
    vm.assume(duration > 0);
    uint256 offerId = _createOffer(TrustlessSwap.AssetType.TOKEN, duration);

    assertEq(swap.getOffer(offerId).deadline, block.timestamp + duration);
  }

  /// utility functions for testing

  function _createOffer(TrustlessSwap.AssetType assetType, uint256 duration)
    private
    returns (uint256)
  {
    address responseNFTAddress = assetType == TrustlessSwap.AssetType.TOKEN
      ? address(0)
      : address(responseNFT);
    address responseTokenAddress = assetType == TrustlessSwap.AssetType.NFT
      ? address(0)
      : address(responseToken);
    uint256 responseAmount =
      assetType == TrustlessSwap.AssetType.NFT ? 0 : TOKEN_AMOUNT;

    return _createOfferWith(
      address(requestNFT),
      assetType,
      responseNFTAddress,
      responseTokenAddress,
      responseAmount,
      duration
    );
  }

  function _createOfferWith(
    address requestNftAddress,
    TrustlessSwap.AssetType assetType,
    address responseNftAddress,
    address responseTokenAddress,
    uint256 responseAmount,
    uint256 duration
  ) private returns (uint256 offerId) {
    uint256 requestNftId = nextRequestId++;
    if (requestNftAddress != address(0)) {
      requestNFT.mint(address(this), requestNftId);
      requestNFT.approve(address(swap), requestNftId);
    }

    offerId = swap.createOffer(
      requestNftAddress,
      requestNftId,
      duration,
      assetType,
      responseNftAddress,
      responseTokenAddress,
      responseAmount
    );
  }

  function _callCreateOffer(
    address requestNftAddress,
    TrustlessSwap.AssetType assetType,
    address responseNftAddress,
    address responseTokenAddress,
    uint256 responseAmount,
    uint256 duration
  ) private {
    swap.createOffer(
      requestNftAddress,
      1,
      duration,
      assetType,
      responseNftAddress,
      responseTokenAddress,
      responseAmount
    );
  }

  function _assertCompleted(uint256 offerId, address partyB) private view {
    TrustlessSwap.Offer memory offer = swap.getOffer(offerId);
    assertEq(
      uint256(offer.status), uint256(TrustlessSwap.OfferStatus.COMPLETED)
    );
    assertEq(offer.partyB, partyB);
    assertFalse(offer.isEscrowReclaimed);
  }
}
