import { isAddress, parseAbiItem, type Address, type PublicClient } from "viem";

export const swapAbi = [
  { type: "function", name: "createOffer", stateMutability: "nonpayable", inputs: [{ name: "nftAddress", type: "address" }, { name: "nftId", type: "uint256" }, { name: "duration", type: "uint256" }, { name: "responseAssetType", type: "uint8" }, { name: "responseNftAddress", type: "address" }, { name: "responseTokenAddress", type: "address" }, { name: "responseTokenAmount", type: "uint256" }], outputs: [{ name: "offerId", type: "uint256" }] },
  { type: "function", name: "acceptOffer", stateMutability: "nonpayable", inputs: [{ name: "offerId", type: "uint256" }], outputs: [] },
  { type: "function", name: "acceptOffer", stateMutability: "nonpayable", inputs: [{ name: "offerId", type: "uint256" }, { name: "respNftId", type: "uint256" }], outputs: [] },
  { type: "function", name: "closeOffer", stateMutability: "nonpayable", inputs: [{ name: "offerId", type: "uint256" }], outputs: [] },
  { type: "function", name: "reclaimExpiredEscrow", stateMutability: "nonpayable", inputs: [{ name: "offerId", type: "uint256" }], outputs: [] },
  { type: "function", name: "getOffer", stateMutability: "view", inputs: [{ name: "offerId", type: "uint256" }], outputs: [{ name: "offer", type: "tuple", components: [{ name: "partyA", type: "address" }, { name: "partyB", type: "address" }, { name: "requestNftAddress", type: "address" }, { name: "requestNftId", type: "uint256" }, { name: "responseAssetType", type: "uint8" }, { name: "responseNftAddress", type: "address" }, { name: "responseNftId", type: "uint256" }, { name: "hasResponseNftId", type: "bool" }, { name: "responseTokenAddress", type: "address" }, { name: "responseTokenAmount", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "isEscrowReclaimed", type: "bool" }, { name: "status", type: "uint8" }] }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "event", name: "OfferCreated", anonymous: false, inputs: [{ name: "partyA", type: "address", indexed: true }, { name: "offerId", type: "uint256", indexed: true }, { name: "requestNftAddress", type: "address", indexed: true }, { name: "deadline", type: "uint256", indexed: false }, { name: "responseAssetType", type: "uint8", indexed: false }, { name: "responseNftAddress", type: "address", indexed: false }, { name: "responseTokenAmount", type: "uint256", indexed: false }] },
] as const;

export const erc721Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "getApproved", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "isApprovedForAll", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const offerCreatedEvent = parseAbiItem("event OfferCreated(address indexed partyA, uint256 indexed offerId, address indexed requestNftAddress, uint256 deadline, uint8 responseAssetType, address responseNftAddress, uint256 responseTokenAmount)");

export type OfferStatus = 0 | 1 | 2 | 3 | 4;
export type AssetType = 0 | 1 | 2;
export type Offer = {
  partyA: Address;
  partyB: Address;
  requestNftAddress: Address;
  requestNftId: bigint;
  responseAssetType: AssetType;
  responseNftAddress: Address;
  responseNftId: bigint;
  hasResponseNftId: boolean;
  responseTokenAddress: Address;
  responseTokenAmount: bigint;
  deadline: bigint;
  isEscrowReclaimed: boolean;
  status: OfferStatus;
};

const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
export const targetChainId = Number.isSafeInteger(envChainId) && envChainId > 0 ? envChainId : 1;
const knownNetworks: Record<number, { name: string; rpc: string; explorer: string }> = {
  1: { name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io" },
  10: { name: "OP Mainnet", rpc: "https://mainnet.optimism.io", explorer: "https://optimistic.etherscan.io" },
  137: { name: "Polygon", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com" },
  8453: { name: "Base", rpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
  42161: { name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io" },
  11155111: { name: "Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io" },
  84532: { name: "Base Sepolia", rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
};
const knownNetwork = knownNetworks[targetChainId];
export const targetChain = {
  id: targetChainId,
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || knownNetwork?.name || `Chain ${targetChainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || knownNetwork?.rpc || "http://127.0.0.1:8545"] } },
  blockExplorers: { default: { name: "Explorer", url: process.env.NEXT_PUBLIC_EXPLORER_URL || knownNetwork?.explorer || "https://etherscan.io" } },
} as const;

const rawAddress = process.env.NEXT_PUBLIC_SWAP_CONTRACT_ADDRESS;
export const contractAddress = rawAddress && isAddress(rawAddress) ? rawAddress as Address : undefined;
export const deploymentBlock = process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK && /^\d+$/.test(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK)
  ? BigInt(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK)
  : undefined;
export const contractConfigured = Boolean(contractAddress && process.env.NEXT_PUBLIC_CHAIN_ID && deploymentBlock !== undefined && (knownNetwork || process.env.NEXT_PUBLIC_RPC_URL));
export const contractConfigMissing = [
  !contractAddress && "NEXT_PUBLIC_SWAP_CONTRACT_ADDRESS",
  !process.env.NEXT_PUBLIC_CHAIN_ID && "NEXT_PUBLIC_CHAIN_ID",
  deploymentBlock === undefined && "NEXT_PUBLIC_DEPLOYMENT_BLOCK",
  !knownNetwork && !process.env.NEXT_PUBLIC_RPC_URL && "NEXT_PUBLIC_RPC_URL (required for custom chains)",
].filter(Boolean) as string[];

export async function discoverOffers(client: PublicClient, address: Address, fromBlock: bigint) {
  const latest = await client.getBlockNumber();
  const pageSize = BigInt(1500);
  const ids = new Set<bigint>();
  for (let start = fromBlock; start <= latest; start += pageSize) {
    const end = start + pageSize - BigInt(1) > latest ? latest : start + pageSize - BigInt(1);
    const logs = await client.getLogs({ address, event: offerCreatedEvent, fromBlock: start, toBlock: end });
    for (const log of logs) {
      if (log.topics[2]) ids.add(BigInt(log.topics[2]));
    }
  }
  const offers = await Promise.all([...ids].map(async (offerId) => {
    try {
      const offer = await client.readContract({ address, abi: swapAbi, functionName: "getOffer", args: [offerId] }) as unknown as Offer;
      if (!offer || offer.partyA === "0x0000000000000000000000000000000000000000") return null;
      if (offer.status < 0 || offer.status > 4 || offer.responseAssetType < 0 || offer.responseAssetType > 2) return null;
      if (offer.requestNftAddress === "0x0000000000000000000000000000000000000000") return null;
      return { id: offerId, ...offer };
    } catch {
      return null;
    }
  }));
  return offers.filter((offer): offer is NonNullable<typeof offer> => offer !== null).sort((a, b) => a.id > b.id ? -1 : a.id < b.id ? 1 : 0);
}

export async function getTokenMetadata(client: PublicClient, address: Address, kind: "nft" | "token") {
  if (kind === "nft") {
    const [name, symbol] = await Promise.allSettled([
      client.readContract({ address, abi: erc721Abi, functionName: "name" }),
      client.readContract({ address, abi: erc721Abi, functionName: "symbol" }),
    ]);
    return { name: name.status === "fulfilled" ? name.value : undefined, symbol: symbol.status === "fulfilled" ? symbol.value : undefined };
  }
  const [symbol, decimals] = await Promise.allSettled([
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
  ]);
  return { symbol: symbol.status === "fulfilled" ? symbol.value : undefined, decimals: decimals.status === "fulfilled" ? decimals.value : undefined };
}

export function shortAddress(value?: string) {
  if (!value || !isAddress(value)) return "Unknown collection";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatDeadline(deadline: bigint) {
  if (deadline === BigInt(0)) return "No expiry";
  const date = new Date(Number(deadline) * 1000);
  if (Number.isNaN(date.getTime())) return "Deadline unavailable";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function getExplorerTxUrl(hash: string) {
  return `${process.env.NEXT_PUBLIC_EXPLORER_URL || knownNetwork?.explorer || "https://etherscan.io"}/tx/${hash}`;
}
