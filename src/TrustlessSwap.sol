// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {
  SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
  ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Trustless Swap
/// @author Idowu Daniel Ayotunde
/// @notice A contract for facilitating trustless swaps of NFTs for another NFT/ERC20 tokens between two parties without the need for a trusted third party.
contract TrustlessSwap is ReentrancyGuard, Pausable, Ownable {
  using SafeERC20 for IERC20;

  /// ERRORS
  error EscrowAlreadyReclaimed();
  error InvalidRequestNftAddress();
  error InvalidResponseNftAddress();
  error InvalidResponseNftId();
  error InvalidResponseTokenAddress();
  error InvalidResponseTokenAmount();
  error NotOfferOwner();
  error OfferAlreadyAccepted();
  error OfferAlreadyClosed();
  error OfferAlreadyCompleted();
  error OfferAlreadyExpired();
  error OfferIsStillActive();

  /// EVENTS
  event OfferCreated(
    address indexed partyA,
    uint256 indexed offerId,
    address indexed requestNftAddress,
    uint256 deadline,
    AssetType responseAssetType,
    address responseNftAddress,
    uint256 responseTokenAmount
  );

  event OfferAccepted(address indexed partyB, uint256 indexed offerId);

  event OfferClosed(uint256 indexed offerId);

  event OfferCompleted(
    address indexed partyA, address indexed partyB, uint256 indexed offerId
  );

  event EscrowReclaimed(address indexed partyA, uint256 indexed offerId);

  /// DATA TYPES
  enum OfferStatus {
    PENDING,
    ACCEPTED,
    CLOSED,
    COMPLETED,
    EXPIRED
  }

  enum AssetType {
    NFT,
    TOKEN,
    BOTH
  }

  struct Offer {
    address partyA;
    address partyB;
    address requestNftAddress;
    uint256 requestNftId;
    AssetType responseAssetType;
    address responseNftAddress;
    uint256 responseNftId;
    bool hasResponseNftId;
    address responseTokenAddress;
    uint256 responseTokenAmount;
    uint256 deadline;
    bool isEscrowReclaimed;
    OfferStatus status;
  }

  /// VARIABLES
  uint256 private offerCounter;
  mapping(uint256 => Offer) private offers;

  /// FUNCTIONS
  constructor() Ownable(msg.sender) {
    offerCounter = 0;
  }

  // Implementation for creating an offer
  function createOffer(
    address nftAddress,
    uint256 nftId,
    uint256 deadline,
    AssetType respType,
    address respNftAddress,
    address respTokenAddress,
    uint256 respTokenAmount
  ) external whenNotPaused nonReentrant returns (uint256 offerId) {
    // checks
    if (nftAddress == address(0)) {
      revert InvalidRequestNftAddress();
    }

    if (respType == AssetType.NFT) {
      if (respNftAddress == address(0)) {
        revert InvalidResponseNftAddress();
      }
    }

    if (respType == AssetType.TOKEN) {
      if (respTokenAddress == address(0)) {
        revert InvalidResponseTokenAddress();
      }
      if (respTokenAmount == 0) {
        revert InvalidResponseTokenAmount();
      }
    }

    if (respType == AssetType.BOTH) {
      if (respNftAddress == address(0)) {
        revert InvalidResponseNftAddress();
      }
      if (respTokenAddress == address(0)) {
        revert InvalidResponseTokenAddress();
      }
      if (respTokenAmount == 0) {
        revert InvalidResponseTokenAmount();
      }
    }

    // effects
    offerId = offerCounter;

    offers[offerId] = Offer({
      partyA: msg.sender,
      partyB: address(0), // address(0), since party B is not known at the time of offer creation
      requestNftAddress: nftAddress,
      requestNftId: nftId,
      responseAssetType: respType,
      responseNftAddress: respNftAddress,
      responseNftId: 0, // 0, since response NFT ID is not known at the time of offer creation
      hasResponseNftId: false, // false, since response NFT ID is not known at the time of offer creation
      responseTokenAddress: respTokenAddress,
      responseTokenAmount: respTokenAmount,
      deadline: deadline == 0 ? 0 : block.timestamp + deadline,
      isEscrowReclaimed: false,
      status: OfferStatus.PENDING
    });

    offerCounter++;

    // interactions
    IERC721(nftAddress).transferFrom(msg.sender, address(this), nftId);

    emit OfferCreated(
      msg.sender,
      offerId,
      nftAddress,
      deadline == 0 ? 0 : block.timestamp + deadline,
      respType,
      respNftAddress,
      respTokenAmount
    );
  }

  function acceptOffer(uint256 offerId) external whenNotPaused {
    // checks
    if (offers[offerId].status == OfferStatus.CLOSED) {
      revert OfferAlreadyClosed();
    }
    if (
      offers[offerId].partyB != address(0)
        || offers[offerId].status == OfferStatus.ACCEPTED
    ) revert OfferAlreadyAccepted();
    if (
      offers[offerId].deadline != 0
        && block.timestamp > offers[offerId].deadline
    ) {
      revert OfferAlreadyExpired();
    }

    // effects
    offers[offerId].partyB = msg.sender;
    offers[offerId].hasResponseNftId = false;
    offers[offerId].status = OfferStatus.ACCEPTED;
    emit OfferAccepted(msg.sender, offerId);

    // interactions
    _executeSwap(offerId);
  }

  function acceptOffer(uint256 offerId, uint256 respNftId)
    external
    whenNotPaused
  {
    // checks
    if (offers[offerId].status == OfferStatus.CLOSED) {
      revert OfferAlreadyClosed();
    }
    if (
      offers[offerId].partyB != address(0)
        || offers[offerId].status == OfferStatus.ACCEPTED
    ) revert OfferAlreadyAccepted();
    if ((offers[offerId].deadline != 0
          && block.timestamp > offers[offerId].deadline)) {
      revert OfferAlreadyExpired();
    }

    // effects
    offers[offerId].partyB = msg.sender;
    offers[offerId].responseNftId = respNftId;
    offers[offerId].hasResponseNftId = true;
    offers[offerId].status = OfferStatus.ACCEPTED;
    emit OfferAccepted(msg.sender, offerId);

    // interactions
    _executeSwap(offerId);
  }

  function closeOffer(uint256 offerId) external whenNotPaused {
    // checks
    if (offers[offerId].partyA != msg.sender) revert NotOfferOwner();
    if (offers[offerId].status == OfferStatus.CLOSED) {
      revert OfferAlreadyClosed();
    }
    if (offers[offerId].status == OfferStatus.EXPIRED) {
      revert OfferAlreadyExpired();
    }

    _reclaimEscrow(offerId, OfferStatus.CLOSED);

    emit OfferClosed(offerId);
  }

  function getOffer(uint256 offerId) external view returns (Offer memory) {
    return offers[offerId];
  }

  function reclaimExpiredEscrow(uint256 offerId) external whenNotPaused {
    // checks
    if (offers[offerId].partyA != msg.sender) revert NotOfferOwner();
    if (
      offers[offerId].deadline != 0
        && block.timestamp > offers[offerId].deadline
    ) {
      _reclaimEscrow(offerId, OfferStatus.EXPIRED);
    } else {
      revert OfferIsStillActive();
    }
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  function _executeSwap(uint256 offerId) internal nonReentrant whenNotPaused {
    // checks
    if (
      offers[offerId].responseAssetType != AssetType.TOKEN
        && !offers[offerId].hasResponseNftId
    ) revert InvalidResponseNftId();

    //effects
    offers[offerId].status = OfferStatus.COMPLETED;

    // interactions
    if (offers[offerId].responseAssetType == AssetType.NFT) {
      // Handle NFT swap
      IERC721(offers[offerId].responseNftAddress)
        .transferFrom(
          offers[offerId].partyB,
          offers[offerId].partyA,
          offers[offerId].responseNftId
        );
    } else if (offers[offerId].responseAssetType == AssetType.TOKEN) {
      // Handle ERC20 swap
      IERC20(offers[offerId].responseTokenAddress)
        .safeTransferFrom(
          offers[offerId].partyB,
          offers[offerId].partyA,
          offers[offerId].responseTokenAmount
        );
    } else if (offers[offerId].responseAssetType == AssetType.BOTH) {
      // Handle both NFT and ERC20 swap
      IERC721(offers[offerId].responseNftAddress)
        .transferFrom(
          offers[offerId].partyB,
          offers[offerId].partyA,
          offers[offerId].responseNftId
        );
      IERC20(offers[offerId].responseTokenAddress)
        .safeTransferFrom(
          offers[offerId].partyB,
          offers[offerId].partyA,
          offers[offerId].responseTokenAmount
        );
    }

    // transfer the requested NFT from the contract to Party B
    IERC721(offers[offerId].requestNftAddress)
      .transferFrom(
        address(this), offers[offerId].partyB, offers[offerId].requestNftId
      );

    emit OfferCompleted(offers[offerId].partyA, offers[offerId].partyB, offerId);
  }

  function _reclaimEscrow(uint256 offerId, OfferStatus terminalStatus)
    internal
    nonReentrant
    whenNotPaused
  {
    // checks
    if (offers[offerId].isEscrowReclaimed) revert EscrowAlreadyReclaimed();
    if (offers[offerId].status == OfferStatus.COMPLETED) {
      revert OfferAlreadyCompleted();
    }

    // effects
    offers[offerId].status = terminalStatus;
    offers[offerId].isEscrowReclaimed = true;

    // interactions
    IERC721(offers[offerId].requestNftAddress)
      .transferFrom(
        address(this), offers[offerId].partyA, offers[offerId].requestNftId
      );

    emit EscrowReclaimed(offers[offerId].partyA, offerId);
  }
}

/**
 * // PURPOSE
 * + To facilitate trustless swaps of NFTs for another NFT/ERC20 tokens between two parties without the need for a trusted third party.
 *
 * // USERS
 * + Party A
 * + Party B
 *
 * // WORKFLOW
 * + Party A creates an offer to swap an NFT for either another NFT or ERC20 tokens.
 * + Party B accepts the offer and provides the required NFT/ERC20 tokens.
 * + The contract verifies the ownership and approval of the assets from both parties.
 * + If all conditions are met, the contract executes the swap, transferring the assets between Party A and Party B.
 * + If any party fails to meet the conditions, the swap is canceled, and the assets are returned to their original owners.
 */