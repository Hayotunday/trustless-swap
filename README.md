# Trustless Swap

Trustless Swap is a Solidity smart contract for peer-to-peer exchanges of an
ERC-721 NFT for another NFT, ERC-20 tokens, or both. The offered NFT is held in
escrow by the contract while an offer is open. When a counterparty accepts, the
requested assets are transferred directly between the parties and the escrowed
NFT is sent to the accepter in the same transaction.

> **Warning:** This repository is a development project, not an audit or a
> guarantee of safety. The contract has not been independently audited. Do not
> use it to custody valuable assets without a thorough review and testing on the
> intended network.

## Features

- NFT-for-NFT, NFT-for-ERC-20, and NFT-for-NFT-plus-ERC-20 offers.
- Escrow of the offer creator's NFT until acceptance or return.
- Optional expiry. A zero duration means the offer has no expiry.
- Offer creator can close an open offer; after expiry, the creator can reclaim
  the NFT.
- Owner-controlled emergency pause.
- Offer lifecycle and transfer events for off-chain clients.

## How it works

1. **Create:** Party A approves the contract to transfer an NFT, then calls
   `createOffer`. The contract escrows that NFT and records the requested
   response asset(s).
2. **Accept:** Party B approves the response NFT and/or ERC-20 for transfer,
   then calls the appropriate `acceptOffer` overload before the deadline.
   The contract exchanges the assets atomically; if a required transfer fails,
   the whole transaction reverts.
3. **Cancel or reclaim:** Party A can call `closeOffer` while the offer is
   open. For an expired offer, Party A calls `reclaimExpiredEscrow` to mark it
   expired and return the escrowed NFT.

Offer status values are `PENDING`, `ACCEPTED`, `CLOSED`, `COMPLETED`, and
`EXPIRED`. Successful acceptance ends in `COMPLETED`; failed transactions do
not persist intermediate state changes.

## Offer types and acceptance

`AssetType` is an enum:

| Type    | Party B provides                                | Acceptance call                       |
| ------- | ----------------------------------------------- | ------------------------------------- |
| `NFT`   | One NFT from the configured response collection | `acceptOffer(offerId, responseNftId)` |
| `TOKEN` | The configured ERC-20 amount                    | `acceptOffer(offerId)`                |
| `BOTH`  | One NFT and the configured ERC-20 amount        | `acceptOffer(offerId, responseNftId)` |

NFT token ID `0` is valid. For token-only offers, `responseNftAddress` should
be zero; for NFT-only offers, `responseTokenAddress` and `responseTokenAmount`
should be zero. Amounts are specified in the ERC-20's smallest units.

## Important behavior and trust assumptions

- The `deadline` argument to `createOffer` is a **duration in seconds**, not a
  Unix timestamp. The contract stores and emits `block.timestamp + duration`.
  A duration of `0` creates an offer with no expiry.
- Expired offers cannot be accepted. Expiry does not automatically return the
  escrowed NFT: Party A must call `reclaimExpiredEscrow(offerId)`.
- The contract owner can pause offer creation, acceptance, closure, and expiry
  reclamation. While paused, escrow recovery is unavailable until the owner
  unpauses the contract.
- Any address may accept an offer; offers are not restricted to a named
  counterparty.
- The response NFT and ERC-20 transfers go directly from Party B to Party A.
  Party B must own the required assets and approve the contract beforehand.
- The ERC-20 path uses OpenZeppelin `SafeERC20`, but tokens with transfer fees,
  rebasing behavior, or other non-standard economics may not deliver the
  configured amount. Use well-understood, standard tokens.
- This contract supports ERC-721 and ERC-20 assets only. It does not support
  native ETH, ERC-1155, royalties, partial fills, or offer editing.

## Repository layout

- `src/TrustlessSwap.sol` — swap contract.
- `test/TrustlessSwap.t.sol` — unit, integration, and fuzz tests.
- `test/TrustlessSwapInvariant.t.sol` — stateful invariant tests for escrow
  and payment consistency.
- `script/TrustlessSwap.s.sol` — Sepolia-default deployment script with a
  configurable chain-ID guard.
- `foundry.toml` — Foundry project configuration.

## Development

The project uses [Foundry](https://book.getfoundry.sh/) and OpenZeppelin
Contracts as a Git submodule. After installing Foundry and cloning the
repository, initialize its submodules:

```sh
git submodule update --init --recursive
```

Build the contracts:

```sh
forge build
```

### Deploy to Sepolia

Import the private key for a test-only burner wallet into Foundry's encrypted
keystore. Run this command in a trusted local terminal; do not paste the key
into a command, source file, or chat:

```sh
cast wallet import sepolia-deployer --interactive
```

Fund that wallet with Sepolia ETH from a faucet, then set an RPC URL from your
provider:

```sh
export SEPOLIA_RPC_URL="https://your-sepolia-rpc-url"
```

Deploy using the keystore account. The script defaults to Sepolia (chain ID
`11155111`) and makes the deployer the contract owner:

```sh
forge script script/TrustlessSwap.s.sol:TrustlessSwapScript \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --account sepolia-deployer \
  --broadcast
```

For a different chain, set `EXPECTED_CHAIN_ID` to its chain ID before running
the script. Confirm the deployment address in Forge's output and check that
the deployer is the owner:

```sh
cast call <DEPLOYED_ADDRESS> "owner()(address)" \
  --rpc-url "$SEPOLIA_RPC_URL"
```

Run unit, integration, fuzz, and invariant tests:

```sh
forge test
```

The invariant suite runs as part of `forge test` and `forge coverage`, using
32 runs at a depth of 30 (configured in `foundry.toml`). To run only that suite:

```sh
forge test --match-contract TrustlessSwapInvariantTest
```

Check formatting and measure coverage:

```sh
forge fmt --check
forge coverage --report summary
```

## Contract interface

The main external functions are:

- `createOffer(nftAddress, nftId, duration, responseAssetType,
responseNftAddress, responseTokenAddress, responseTokenAmount)` — create an
  offer and escrow Party A's NFT.
- `acceptOffer(offerId)` — accept a token-only offer.
- `acceptOffer(offerId, responseNftId)` — accept an NFT or combined offer.
- `closeOffer(offerId)` — close an offer and return escrow to Party A.
- `reclaimExpiredEscrow(offerId)` — reclaim escrow for an expired offer.
- `getOffer(offerId)` — read the stored offer.
- `pause()` / `unpause()` — pause or resume operations; owner only.

Refer to [`src/TrustlessSwap.sol`](src/TrustlessSwap.sol) for the Solidity
types, events, and custom errors.
