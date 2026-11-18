"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button as ShadcnButton } from "@/components/ui/button";
import { useAccount, useConnect, useDisconnect, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { formatUnits, isAddress, parseUnits, zeroAddress, type Address, type Hash } from "viem";
import {
  ArrowDownLeft, ArrowDownRight, ArrowLeftRight, ArrowRight, ArrowUpRight, Check,
  ChevronDown, CircleAlert, CircleCheck, Clock3, ExternalLink, FileQuestion,
  Filter, Gem, LoaderCircle, LockKeyhole, Menu, Plus, RefreshCw, Search,
  ShieldCheck, Wallet, X,
} from "lucide-react";
import {
  contractAddress, contractConfigMissing, contractConfigured, deploymentBlock,
  discoverOffers, erc20Abi, erc721Abi, formatDeadline, getExplorerTxUrl,
  getTokenMetadata, shortAddress, swapAbi, targetChain, targetChainId,
  type AssetType, type Offer,
} from "@/lib/contract";

const ZERO = zeroAddress;
const assetNames = ["NFT", "Token", "NFT + token"] as const;
const statusNames = ["Open", "Accepted", "Closed", "Completed", "Expired"] as const;

type DiscoveredOffer = Offer & { id: bigint };
type TxInfo = { id: number; label: string; hash?: Hash; status: "pending" | "confirmed" | "failed"; confirmations?: number; error?: string };

function truncateAddress(address: string, left = 6, right = 4) {
  return `${address.slice(0, left)}…${address.slice(-right)}`;
}

function getEffectiveStatus(offer: Offer, chainTimestamp?: bigint): number {
  if (offer.status === 0 && offer.deadline !== BigInt(0) && chainTimestamp !== undefined && chainTimestamp > offer.deadline) return 4;
  return offer.status;
}

function durationLabel(value: string) {
  if (!value || !/^\d+$/.test(value)) return "Choose a duration";
  const seconds = BigInt(value);
  if (seconds === 0n) return "No expiry — this offer stays open until closed or accepted";
  const units: [bigint, string][] = [[86400n, "day"], [3600n, "hour"], [60n, "minute"], [1n, "second"]];
  let remaining = seconds;
  const parts: string[] = [];
  for (const [unit, name] of units) {
    const amount = remaining / unit;
    if (amount) {
      parts.push(`${amount} ${name}${amount === 1n ? "" : "s"}`);
      remaining %= unit;
      if (parts.length === 2) break;
    }
  }
  return `Expires in ${parts.join(" and ")}`;
}

function formatAmount(amount: bigint, decimals?: number) {
  if (decimals === undefined) return amount.toString();
  const formatted = formatUnits(amount, decimals);
  return formatted.length > 18 ? Number(formatted).toLocaleString(undefined, { maximumFractionDigits: 5 }) : formatted;
}

function TextField({ label, value, onChange, placeholder, type = "text", suffix, help, id }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string;
  type?: string; suffix?: string; help?: string; id: string;
}) {
  return <label className="field" htmlFor={id}>
    <span className="field-label">{label}</span>
    <span className="input-wrap"><input id={id} value={value} onChange={(event) => onChange(event.target.value)} type={type} placeholder={placeholder} inputMode={type === "number" ? "numeric" : "text"} autoComplete="off" />{suffix && <span className="input-suffix">{suffix}</span>}</span>
    {help && <span className="field-help">{help}</span>}
  </label>;
}

function AssetCollection({ address, kind, tokenId }: { address: Address; kind: "nft" | "token"; tokenId?: bigint }) {
  const client = usePublicClient({ chainId: targetChainId });
  const metadata = useQuery({
    queryKey: ["metadata", kind, address],
    enabled: Boolean(client),
    queryFn: () => getTokenMetadata(client!, address, kind),
    staleTime: 60_000,
  });
  const meta = metadata.data as { name?: string; symbol?: string } | undefined;
  return <div className="asset-collection">
    <span className={`asset-mark ${kind === "nft" ? "asset-mark-nft" : "asset-mark-token"}`} aria-hidden="true">{kind === "nft" ? <Gem /> : "$"}</span>
    <span className="asset-copy"><strong>{meta?.name || meta?.symbol || "Collection metadata unavailable"}</strong><span>{shortAddress(address)}{tokenId !== undefined ? ` · #${tokenId}` : ""}{meta?.symbol && meta?.name ? ` · ${meta.symbol}` : ""}</span></span>
  </div>;
}

function BalanceHint({ address, kind }: { address: Address; kind: "nft" | "token" }) {
  const account = useAccount();
  const client = usePublicClient({ chainId: targetChainId });
  const query = useQuery({
    queryKey: ["balance", kind, address, account.address],
    enabled: Boolean(client && account.address),
    queryFn: async () => {
      if (!client || !account.address) return undefined;
      if (kind === "nft") return client.readContract({ address, abi: erc721Abi, functionName: "balanceOf", args: [account.address] });
      const [balance, decimals, symbol] = await Promise.all([
        client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
        client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address, abi: erc20Abi, functionName: "symbol" }).catch(() => "token"),
      ]);
      return `${formatAmount(balance, decimals)} ${symbol}`;
    }, staleTime: 20_000,
  });
  return query.data !== undefined ? <span className="balance-hint">Your balance: {typeof query.data === "bigint" ? query.data.toString() : query.data}</span> : null;
}

function StatusBadge({ status }: { status: number }) {
  const names = statusNames[status] || "Unknown";
  return <span className={`status-badge status-${names.toLowerCase()}`}><span />{names}</span>;
}

function AssetTile({ title, address, tokenId, icon = "nft", amount }: {
  title: string; address: Address; tokenId?: bigint; icon?: "nft" | "token"; amount?: bigint;
}) {
  const client = usePublicClient({ chainId: targetChainId });
  const metadata = useQuery({
    queryKey: ["metadata", icon, address],
    enabled: Boolean(client),
    queryFn: () => getTokenMetadata(client!, address, icon),
    staleTime: 60_000,
  });
  const meta = metadata.data as { name?: string; symbol?: string; decimals?: number } | undefined;
  const amountLabel = amount !== undefined ? `${meta?.decimals === undefined ? amount.toString() : formatAmount(amount, meta.decimals)} ${meta?.symbol || (meta?.decimals === undefined ? "base units" : "")}`.trim() : undefined;
  const titleLabel = meta?.name || meta?.symbol || (tokenId !== undefined ? `Token #${tokenId}` : icon === "token" ? "Token metadata unavailable" : "Collection metadata unavailable");
  return <div className="asset-tile">
    <div className="asset-tile-art"><span>{icon === "nft" ? <Gem /> : <span className="currency-glyph">$</span>}</span><small>{icon === "nft" ? "ERC-721" : "ERC-20"}</small></div>
    <div className="asset-tile-meta"><span className="eyebrow">{title}</span><strong>{amountLabel || titleLabel}</strong><span className="address-text">{shortAddress(address)}{tokenId !== undefined ? ` · #${tokenId}` : ""}</span></div>
  </div>;
}

function TokenAmount({ address, amount }: { address: Address; amount: bigint }) {
  const client = usePublicClient({ chainId: targetChainId });
  const metadata = useQuery({
    queryKey: ["metadata", "token", address],
    enabled: Boolean(client),
    queryFn: () => getTokenMetadata(client!, address, "token"),
    staleTime: 60_000,
  });
  const meta = metadata.data as { symbol?: string; decimals?: number } | undefined;
  return <span className="swap-amount">{meta?.decimals === undefined ? `${amount.toString()} base units` : `${formatAmount(amount, meta.decimals)} ${meta.symbol || "tokens"}`}</span>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button, input, select, a[href]")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "Tab" && panelRef.current) {
        const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]")];
        if (!controls.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} tabIndex={-1} className={`modal-panel ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><span className="eyebrow">TRUSTLESS SWAP</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X /></button></div>
      {children}
    </section>
  </div>;
}

function TransactionNotice({ transactions }: { transactions: TxInfo[] }) {
  if (!transactions.length) return null;
  return <section className="transaction-list" aria-label="Transaction status">
    {transactions.map((transaction) => <article className={`transaction-row transaction-${transaction.status}`} key={transaction.id}>
      <span className="transaction-icon">{transaction.status === "pending" ? <LoaderCircle className="spin" /> : transaction.status === "confirmed" ? <CircleCheck /> : <CircleAlert />}</span>
      <div className="transaction-copy"><strong>{transaction.label}: {transaction.status === "pending" ? "Awaiting confirmation" : transaction.status === "confirmed" ? "Confirmed" : "Failed"}</strong>
        {transaction.hash && <a href={getExplorerTxUrl(transaction.hash)} target="_blank" rel="noreferrer">{truncateAddress(transaction.hash, 10, 8)} <ExternalLink /></a>}
        {transaction.confirmations !== undefined && <span>{transaction.confirmations} confirmation{transaction.confirmations === 1 ? "" : "s"}</span>}
        {transaction.error && <span className="transaction-error">{transaction.error}</span>}
      </div>
    </article>)}
  </section>;
}

export function TrustlessSwapApp() {
  const account = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = account.chainId;
  const { switchChain, isPending: switching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: targetChainId });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"market" | "mine">("market");
  const [selectedOffer, setSelectedOffer] = useState<DiscoveredOffer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [transactions, setTransactions] = useState<TxInfo[]>([]);
  const transactionSequence = useRef(0);
  const [flowError, setFlowError] = useState("");
  const [assetType, setAssetType] = useState<AssetType>(0);
  const [requestNftAddress, setRequestNftAddress] = useState("");
  const [requestNftId, setRequestNftId] = useState("");
  const [responseNftAddress, setResponseNftAddress] = useState("");
  const [responseTokenAddress, setResponseTokenAddress] = useState("");
  const [responseTokenAmount, setResponseTokenAmount] = useState("");
  const [duration, setDuration] = useState("604800");
  const [acceptNftId, setAcceptNftId] = useState("");

  const pausedRead = useReadContract({ address: contractAddress, abi: swapAbi, functionName: "paused", chainId: targetChainId, query: { enabled: contractConfigured, refetchInterval: 20_000 } });
  const chainClock = useQuery({
    queryKey: ["chain-clock", targetChainId],
    enabled: Boolean(contractConfigured && publicClient),
    queryFn: async () => (await publicClient!.getBlock({ blockTag: "latest" })).timestamp,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
  const offerQuery = useQuery({
    queryKey: ["offers", contractAddress, deploymentBlock?.toString(), targetChainId],
    enabled: Boolean(contractConfigured && publicClient && contractAddress && deploymentBlock !== undefined),
    queryFn: () => discoverOffers(publicClient!, contractAddress!, deploymentBlock!),
    staleTime: 15_000,
  });
  const offers = (offerQuery.data || []) as DiscoveredOffer[];
  const paused = pausedRead.data === true;
  const onCorrectNetwork = Boolean(account.address && chainId === targetChainId);
  const writesReady = Boolean(contractConfigured && account.address && onCorrectNetwork && pausedRead.data === false && !pausedRead.isLoading && !pausedRead.isError && chainClock.data !== undefined);
  const walletConnector = connectors[0];

  const visibleOffers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return offers.filter((offer) => {
      const effectiveStatus = getEffectiveStatus(offer, chainClock.data);
      if (activeTab === "mine" && (!account.address || (offer.partyA.toLowerCase() !== account.address.toLowerCase() && offer.partyB.toLowerCase() !== account.address.toLowerCase()))) return false;
      if (activeTab === "market" && effectiveStatus !== 0) return false;
      if (typeFilter !== "all" && offer.responseAssetType !== Number(typeFilter)) return false;
      if (statusFilter !== "all" && effectiveStatus !== Number(statusFilter)) return false;
      if (query && ![offer.id.toString(), offer.partyA, offer.requestNftAddress, offer.responseNftAddress, offer.responseTokenAddress].some((value) => value?.toLowerCase().includes(query))) return false;
      return true;
    });
  }, [offers, activeTab, account.address, typeFilter, statusFilter, search, chainClock.data]);

  async function sendTransaction(label: string, request: Parameters<typeof writeContractAsync>[0]) {
    const id = transactionSequence.current++;
    setTransactions((current) => [...current, { id, label, status: "pending" }]);
    try {
      const hash = await writeContractAsync(request as never);
      setTransactions((current) => current.map((item) => item.id === id ? { ...item, hash, status: "pending" } : item));
      const receipt = await publicClient!.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== "success") throw new Error("The transaction reverted. Check the offer and your asset approvals, then try again.");
      const latestBlock = await publicClient!.getBlockNumber();
      const confirmationCount = latestBlock >= receipt.blockNumber ? Number(latestBlock - receipt.blockNumber + 1n) : 1;
      setTransactions((current) => current.map((item) => item.id === id ? { ...item, hash, status: "confirmed", confirmations: confirmationCount } : item));
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
      return hash;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction failed. Review your wallet and try again.";
      const actionable = /user rejected|denied|rejected the request/i.test(message) ? "You rejected this request in your wallet. No transaction was sent." : message.slice(0, 240);
      setTransactions((current) => current.map((item) => item.id === id ? { ...item, status: "failed", error: actionable } : item));
      throw new Error(actionable);
    }
  }

  async function ensureOperational() {
    if (!writesReady || !publicClient || !contractAddress) throw new Error(paused ? "The contract is paused. Offer actions are unavailable until the owner unpauses it." : "Connect a wallet on the configured network and wait for the contract checks before continuing.");
    const currentlyPaused = await publicClient.readContract({ address: contractAddress, abi: swapAbi, functionName: "paused" });
    if (currentlyPaused) throw new Error("The contract is paused. Offer actions are unavailable until the owner unpauses it.");
  }

  async function verifyOfferState(offer: DiscoveredOffer, action: "accept" | "closeOffer" | "reclaimExpiredEscrow") {
    if (!publicClient || !contractAddress || !account.address) throw new Error("Connect your wallet before continuing.");
    const [latestOffer, latestBlock] = await Promise.all([
      publicClient.readContract({ address: contractAddress, abi: swapAbi, functionName: "getOffer", args: [offer.id] }) as Promise<Offer>,
      publicClient.getBlock({ blockTag: "latest" }),
    ]);
    if (latestOffer.partyA === ZERO || latestOffer.status !== 0 || latestOffer.isEscrowReclaimed) throw new Error("This offer is no longer open. Refresh the marketplace to see its current status.");
    const expiredNow = latestOffer.deadline !== BigInt(0) && latestBlock.timestamp > latestOffer.deadline;
    if (action === "accept" && expiredNow) throw new Error("This offer has expired and can no longer be accepted.");
    if (action === "closeOffer" && expiredNow) throw new Error("This offer has expired. Use Reclaim expired NFT to return the escrowed asset.");
    if (action === "reclaimExpiredEscrow" && !expiredNow) throw new Error("This offer has not expired on-chain yet.");
    if (action !== "accept" && latestOffer.partyA.toLowerCase() !== account.address.toLowerCase()) throw new Error("Only the offer creator can close the offer or reclaim its escrow.");
    if (action === "accept" && latestOffer.partyB !== ZERO) throw new Error("This offer has already been accepted.");
  }

  function validateAddress(value: string, label: string): Address {
    if (!isAddress(value)) throw new Error(`${label} must be a valid EVM address.`);
    if (value.toLowerCase() === ZERO.toLowerCase()) throw new Error(`${label} cannot be the zero address.`);
    return value as Address;
  }

  async function ensureNftApproval(collection: Address, id: bigint) {
    if (!publicClient || !account.address || !contractAddress) throw new Error("Connect your wallet before approving an NFT.");
    const [owner, approved, operatorApproval] = await Promise.all([
      publicClient.readContract({ address: collection, abi: erc721Abi, functionName: "ownerOf", args: [id] }),
      publicClient.readContract({ address: collection, abi: erc721Abi, functionName: "getApproved", args: [id] }).catch(() => ZERO),
      publicClient.readContract({ address: collection, abi: erc721Abi, functionName: "isApprovedForAll", args: [account.address, contractAddress] }).catch(() => false),
    ]);
    if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error(`Your wallet does not own token #${id} in ${shortAddress(collection)}.`);
    if (approved.toLowerCase() !== contractAddress.toLowerCase() && !operatorApproval) {
      await ensureOperational();
      await sendTransaction(`Approve NFT #${id}`, { address: collection, abi: erc721Abi, functionName: "approve", args: [contractAddress, id], chainId: targetChainId });
    }
  }

  async function ensureTokenApproval(collection: Address, amount: bigint) {
    if (!publicClient || !account.address || !contractAddress) throw new Error("Connect your wallet before approving a token.");
    const [allowance, balance, decimals, symbol] = await Promise.all([
      publicClient.readContract({ address: collection, abi: erc20Abi, functionName: "allowance", args: [account.address, contractAddress] }),
      publicClient.readContract({ address: collection, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
      publicClient.readContract({ address: collection, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({ address: collection, abi: erc20Abi, functionName: "symbol" }).catch(() => "token"),
    ]);
    if (balance < amount) throw new Error(`Your balance is ${formatAmount(balance, decimals)} ${symbol}; this offer requires ${formatAmount(amount, decimals)} ${symbol}.`);
    if (allowance < amount) {
      await ensureOperational();
      await sendTransaction(`Approve ${formatAmount(amount, decimals)} ${symbol}`, { address: collection, abi: erc20Abi, functionName: "approve", args: [contractAddress, amount], chainId: targetChainId });
    }
  }

  async function handleCreateOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlowError(""); setTransactions([]);
    try {
      await ensureOperational();
      const nftAddress = validateAddress(requestNftAddress.trim(), "Offered NFT collection");
      if (!/^\d+$/.test(requestNftId.trim())) throw new Error("Enter a valid NFT token ID. Token ID 0 is valid.");
      const nftId = BigInt(requestNftId.trim());
      const uint256Max = (BigInt(1) << BigInt(256)) - BigInt(1);
      if (nftId > uint256Max) throw new Error("The NFT token ID exceeds the uint256 range supported by the contract.");
      if (!/^\d+$/.test(duration.trim())) throw new Error("Duration must be 0 (no expiry) or a positive number of seconds.");
      const durationSeconds = BigInt(duration.trim());
      if (durationSeconds > uint256Max) throw new Error("The duration exceeds the uint256 range supported by the contract.");
      let responseNft: Address = ZERO;
      let responseToken: Address = ZERO;
      let tokenAmount = 0n;
      if (assetType !== 1) responseNft = validateAddress(responseNftAddress.trim(), "Requested NFT collection");
      if (assetType !== 0) {
        responseToken = validateAddress(responseTokenAddress.trim(), "Requested token contract");
        if (!responseTokenAmount.trim() || !/^\d+(\.\d+)?$/.test(responseTokenAmount.trim())) throw new Error("Enter a valid ERC-20 token amount.");
        const decimals = await publicClient!.readContract({ address: responseToken, abi: erc20Abi, functionName: "decimals" });
        tokenAmount = parseUnits(responseTokenAmount.trim(), decimals);
        if (tokenAmount <= 0n) throw new Error("The requested ERC-20 amount must be greater than zero.");
      }
      await ensureNftApproval(nftAddress, nftId);
      await ensureOperational();
      await sendTransaction("Create offer and escrow NFT", { address: contractAddress!, abi: swapAbi, functionName: "createOffer", args: [nftAddress, nftId, durationSeconds, assetType, responseNft, responseToken, tokenAmount], chainId: targetChainId });
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
    } catch (error) { setFlowError(error instanceof Error ? error.message : "The offer could not be created."); }
  }

  async function handleAcceptOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOffer) return;
    setFlowError(""); setTransactions([]);
    try {
      await ensureOperational();
      await verifyOfferState(selectedOffer, "accept");
      let responseId: bigint | undefined;
      if (selectedOffer.responseAssetType !== 1) {
        if (!/^\d+$/.test(acceptNftId.trim())) throw new Error("Enter the response NFT token ID. Token ID 0 is valid.");
        responseId = BigInt(acceptNftId.trim());
        if (responseId > (BigInt(1) << BigInt(256)) - BigInt(1)) throw new Error("The NFT token ID exceeds the uint256 range supported by the contract.");
        await ensureNftApproval(selectedOffer.responseNftAddress, responseId);
      }
      if (selectedOffer.responseAssetType !== 0) await ensureTokenApproval(selectedOffer.responseTokenAddress, selectedOffer.responseTokenAmount);
      await ensureOperational();
      await verifyOfferState(selectedOffer, "accept");
      if (responseId !== undefined) {
        await sendTransaction(`Accept offer #${selectedOffer.id}`, { address: contractAddress!, abi: swapAbi, functionName: "acceptOffer", args: [selectedOffer.id, responseId], chainId: targetChainId });
      } else {
        await sendTransaction(`Accept offer #${selectedOffer.id}`, { address: contractAddress!, abi: swapAbi, functionName: "acceptOffer", args: [selectedOffer.id], chainId: targetChainId });
      }
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
    } catch (error) { setFlowError(error instanceof Error ? error.message : "The offer could not be accepted."); }
  }

  async function handleOfferAction(offer: DiscoveredOffer, action: "closeOffer" | "reclaimExpiredEscrow") {
    setFlowError(""); setTransactions([]);
    try {
      await ensureOperational();
      await verifyOfferState(offer, action);
      await sendTransaction(action === "closeOffer" ? `Close offer #${offer.id}` : `Reclaim escrow for offer #${offer.id}`,  { address: contractAddress!, abi: swapAbi, functionName: action, args: [offer.id], chainId: targetChainId });
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
    } catch (error) { setFlowError(error instanceof Error ? error.message : "The offer action failed."); }
  }

  function closeCreateModal() { setCreateOpen(false); setFlowError(""); setTransactions([]); }
  function closeOfferModal() { setSelectedOffer(null); setAccepting(false); setAcceptNftId(""); setFlowError(""); setTransactions([]); }

  const isNetworkMismatch = Boolean(account.address && chainId !== targetChainId);
  const currentOffer = selectedOffer ? offers.find((offer) => offer.id === selectedOffer.id) || selectedOffer : null;
  const activeOffer = currentOffer;
  const expired = activeOffer ? getEffectiveStatus(activeOffer, chainClock.data) === 4 : false;

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Trustless Swap home"><span className="brand-mark"><ArrowLeftRight /></span><span>trustless<span className="brand-light">swap</span></span></a>
      <nav className="desktop-nav" aria-label="Main navigation"><a href="#marketplace" className={activeTab === "market" ? "nav-active" : ""} onClick={() => setActiveTab("market")}>Explore</a><a href="#marketplace" className={activeTab === "mine" ? "nav-active" : ""} onClick={() => setActiveTab("mine")}>My offers</a><a href="#how-it-works">How it works</a></nav>
      <div className="topbar-actions">
        {account.address ? <div className="wallet-connected"><span className={`network-indicator ${isNetworkMismatch ? "network-indicator-wrong" : ""}`} /><span className="wallet-network">{account.chainId === targetChainId ? targetChain.name : `Chain ${account.chainId}`}</span><button type="button" className="wallet-chip" onClick={() => disconnect()} title="Disconnect wallet"><Wallet /><span>{truncateAddress(account.address)}</span><ChevronDown /></button></div> : <button className="button button-dark button-connect" type="button" disabled={!walletConnector || connecting} onClick={() => walletConnector && connect({ connector: walletConnector })}><Wallet />{connecting ? "Connecting…" : "Connect wallet"}</button>}
      </div>
    </header>

    {isNetworkMismatch && <div className="network-alert"><CircleAlert /><span><strong>Wrong network.</strong> Switch your wallet to {targetChain.name} to continue.</span><button type="button" disabled={switching} onClick={() => switchChain({ chainId: targetChainId })}>{switching ? "Switching…" : "Switch network"}<ArrowUpRight /></button></div>}
    {paused && <div className="paused-alert"><LockKeyhole /><span><strong>Contract paused.</strong> Offer creation, acceptance, closure, and expired escrow recovery are unavailable until the owner unpauses.</span></div>}
    {contractConfigured && chainClock.isError && <div className="network-alert"><CircleAlert /><span><strong>Chain time unavailable.</strong> Offer expiry cannot be verified, so transaction actions are disabled. Check the RPC connection.</span></div>}
    {contractConfigured && !chainClock.data && !chainClock.isError && <div className="network-alert"><LoaderCircle className="spin" /><span>Checking the active chain before enabling offer actions…</span></div>}

    <section className="hero" id="top">
      <div className="hero-copy"><div className="hero-kicker"><span className="live-dot" /> A BETTER WAY TO COLLECT</div><h1>Good trades.<br /><span>No middleman.</span></h1><p>Swap NFTs for NFTs, tokens, or both. Every exchange is atomic, escrowed, and settled on-chain.</p>
        <div className="hero-actions"><ShadcnButton className="button button-lime" type="button" onClick={() => setCreateOpen(true)} disabled={!writesReady}><Plus data-icon="inline-start" />Create an offer<ArrowRight className="button-end-icon" data-icon="inline-end" /></ShadcnButton><a className="text-link" href="#marketplace" onClick={() => setActiveTab("market")}>Explore offers <ArrowDownRight /></a></div>
        <div className="hero-assurance"><ShieldCheck /><span>Non-custodial by design</span><i /> <span>Atomic settlement</span></div>
      </div>
      <div className="hero-art" aria-label="Illustration showing assets exchanging directly">
        <div className="art-orbit orbit-large" /><div className="art-orbit orbit-small" />
        <div className="art-card art-card-main"><div className="art-card-top"><span className="art-dot" /><span className="art-pills"><i /><i /><i /></span></div><div className="art-shape"><span className="shape-ribbon" /><span className="shape-core" /><span className="shape-star">✳</span></div><div className="art-card-bottom"><span>YOUR NEXT<br />FAVORITE THING</span><b>01</b></div></div>
        <div className="art-card art-card-small"><div className="art-mini-gem"><Gem /></div><span>COLLECTOR<br />TO COLLECTOR</span></div>
        <div className="art-swap"><ArrowLeftRight /></div>
        <div className="art-caption"><span>NO TRUST REQUIRED</span><div><span className="caption-line" /> BUILT ON-CHAIN</div></div>
      </div>
    </section>

    <div className="feature-strip"><div><span className="feature-icon"><LockKeyhole /></span><span><strong>Escrowed until swap</strong><small>Your NFT stays protected</small></span></div><div><span className="feature-icon"><ArrowLeftRight /></span><span><strong>All-or-nothing</strong><small>One transaction, both sides</small></span></div><div><span className="feature-icon"><Clock3 /></span><span><strong>Your terms</strong><small>Close or reclaim your offer</small></span></div><div className="feature-note">OPEN TO COLLECTORS<span>Any wallet can accept an open offer.</span></div></div>

    <section className="market-section" id="marketplace">
      <div className="section-heading"><div><span className="eyebrow">THE EXCHANGE</span><h2>{activeTab === "market" ? "Find your next swap." : "Your offers."}</h2><p>{activeTab === "market" ? "Open offers from collectors, ready for a new home." : "Everything you have created or accepted, in one place."}</p></div>
        <div className="heading-actions"><button type="button" className="button button-outline" onClick={() => offerQuery.refetch()} disabled={offerQuery.isFetching || !contractConfigured}><RefreshCw className={offerQuery.isFetching ? "spin" : ""} />Refresh</button><button type="button" className="button button-dark" onClick={() => setCreateOpen(true)} disabled={!writesReady}><Plus />New offer</button></div>
      </div>

      <div className="market-toolbar"><div className="tab-switch" role="tablist" aria-label="Offer views"><button role="tab" aria-selected={activeTab === "market"} className={activeTab === "market" ? "tab-selected" : ""} type="button" onClick={() => setActiveTab("market")}>Marketplace <span>{offers.filter((offer) => getEffectiveStatus(offer, chainClock.data) === 0).length}</span></button><button role="tab" aria-selected={activeTab === "mine"} className={activeTab === "mine" ? "tab-selected" : ""} type="button" onClick={() => setActiveTab("mine")}>My offers</button></div>
        <div className="filters"><label className="search-box"><Search /><span className="sr-only">Search offer ID or collection address</span><input placeholder="Search collection or offer ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="select-wrap"><Filter /><span className="sr-only">Filter by requested asset type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All assets</option><option value="0">NFT</option><option value="1">Token</option><option value="2">NFT + token</option></select></label><label className="select-wrap"><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statusNames.map((status, index) => <option key={status} value={index}>{status}</option>)}</select></label></div>
      </div>

      {!contractConfigured && <div className="config-notice"><span className="notice-icon"><FileQuestion /></span><div><strong>Contract not configured</strong><p>Add the deployment settings to your environment to load real offers and enable transactions.</p><code>{contractConfigMissing.join(" · ")}</code></div></div>}
      {contractConfigured && pausedRead.isError && <div className="inline-error"><CircleAlert />Could not read the contract pause state. Transaction actions are disabled until the contract can be checked.</div>}
      {contractConfigured && offerQuery.isError && <div className="inline-error"><CircleAlert /><span>Could not load on-chain offers. Check the RPC URL and deployment block, then retry. <button type="button" onClick={() => offerQuery.refetch()}>Try again</button></span></div>}
      {offerQuery.isLoading && contractConfigured && <div className="offer-grid" aria-label="Loading offers">{Array.from({ length: 3 }).map((_, index) => <div className="offer-skeleton" key={index}><span /><span /><span /></div>)}</div>}
      {contractConfigured && !offerQuery.isLoading && !offerQuery.isError && visibleOffers.length === 0 && <div className="empty-state"><div className="empty-icon"><Search /></div><h3>{activeTab === "market" ? (search || typeFilter !== "all" ? "No offers match those filters" : "No open offers yet") : account.address ? "Nothing here just yet" : "Connect to see your offers"}</h3><p>{activeTab === "market" ? (search || typeFilter !== "all" ? "Try a different collection address or asset type." : "Be the first to make an offer, or check back soon.") : account.address ? "Offers you create or accept will appear in your collection here." : "Your created and accepted offers will show here after connecting."}</p>{activeTab === "market" && !search && typeFilter === "all" && <button className="button button-dark" type="button" disabled={!writesReady} onClick={() => setCreateOpen(true)}><Plus />Create the first offer</button>}</div>}
      {contractConfigured && !offerQuery.isLoading && visibleOffers.length > 0 && <div className="offer-grid">
        {visibleOffers.map((offer) => <button type="button" className="offer-card" key={offer.id.toString()} onClick={() => { setSelectedOffer(offer); setFlowError(""); setTransactions([]); }}>
          <div className="offer-card-top"><span className="offer-id">OFFER #{offer.id.toString().padStart(4, "0")}</span><StatusBadge status={getEffectiveStatus(offer, chainClock.data)} /></div>
          <div className="swap-preview"><div className="swap-side"><span className="swap-mini-art"><Gem /></span><span className="swap-label">THEY OFFER</span><strong>NFT #{offer.requestNftId.toString()}</strong><AssetCollection address={offer.requestNftAddress} kind="nft" /></div><span className="swap-arrow"><ArrowLeftRight /></span><div className="swap-side swap-side-right"><span className="swap-mini-art swap-mini-alt">{offer.responseAssetType === 1 ? "$" : <Gem />}</span><span className="swap-label">THEY WANT</span><strong>{assetNames[offer.responseAssetType]}</strong>{offer.responseAssetType !== 0 && <TokenAmount address={offer.responseTokenAddress} amount={offer.responseTokenAmount} />}{offer.responseAssetType === 1 ? <span className="address-text">{shortAddress(offer.responseTokenAddress)}</span> : <AssetCollection address={offer.responseNftAddress} kind="nft" />}{offer.responseAssetType === 2 && <span className="address-text">+ {shortAddress(offer.responseTokenAddress)} token</span>}</div></div>
          <div className="offer-card-footer"><span className="creator-line"><span className="avatar-dot">{offer.partyA.slice(2, 4).toUpperCase()}</span> {shortAddress(offer.partyA)}</span><span className="deadline-line"><Clock3 />{offer.deadline === 0n ? "No expiry" : `Until ${new Date(Number(offer.deadline) * 1000).toLocaleDateString()}`}</span></div>
          <span className="card-open">View offer <ArrowUpRight /></span>
        </button>)}
      </div>}
      <div className="market-footnote"><ShieldCheck /> Offer events are read from the deployment block and hydrated from the contract. Token support and metadata availability are not guaranteed.</div>
    </section>

    <section className="how-section" id="how-it-works"><div className="how-title"><span className="eyebrow">SIMPLE BY DESIGN</span><h2>A swap you can<br />verify, not just trust.</h2><p>Trustless Swap keeps the rules in the contract and the keys in your wallet.</p></div><div className="steps"><article><span>01</span><div><h3>Make an offer</h3><p>Choose the NFT to escrow and exactly what you would like in return.</p></div><Plus /></article><article><span>02</span><div><h3>Approve the asset</h3><p>Review a token-specific approval before your NFT enters contract escrow.</p></div><ShieldCheck /></article><article><span>03</span><div><h3>Swap atomically</h3><p>One acceptance transaction transfers every asset or none of them.</p></div><ArrowLeftRight /></article></div></section>

    <footer className="footer"><a className="brand" href="#top"><span className="brand-mark"><ArrowLeftRight /></span><span>trustless<span className="brand-light">swap</span></span></a><p>On-chain swaps, collector to collector.</p><span className="footer-disclaimer">Contracts and third-party tokens carry risk. Verify every address before signing.</span></footer>

    {createOpen && <Modal title="Create an offer" onClose={closeCreateModal} wide>
      <form className="modal-body" onSubmit={handleCreateOffer}>
        <div className="modal-intro"><p>Put an NFT in escrow and tell collectors what you would like in return. Your wallet will ask for a token-specific approval, then a separate offer transaction.</p></div>
        <div className="form-section"><div className="form-section-heading"><span className="step-number">01</span><div><h3>Your NFT</h3><p>The NFT will be held in contract escrow until accepted or returned.</p></div></div>
          <div className="field-grid"><div><TextField id="offered-nft-address" label="ERC-721 collection address" value={requestNftAddress} onChange={setRequestNftAddress} placeholder="0x…" />{isAddress(requestNftAddress) && <BalanceHint address={requestNftAddress as Address} kind="nft" />}</div><TextField id="offered-nft-id" label="Token ID" value={requestNftId} onChange={setRequestNftId} placeholder="e.g. 0" type="number" help="Token ID 0 is valid." /></div>
        </div>
        <div className="form-section"><div className="form-section-heading"><span className="step-number">02</span><div><h3>What you want</h3><p>Choose the exact response assets you will accept.</p></div></div>
          <div className="asset-type-picker" role="radiogroup" aria-label="Requested response asset type">{assetNames.map((name, index) => <button key={name} type="button" role="radio" aria-checked={assetType === index} className={assetType === index ? "asset-type-option selected" : "asset-type-option"} onClick={() => setAssetType(index as AssetType)}><span className="type-radio">{assetType === index && <i />}</span><span>{name}</span></button>)}</div>
          {assetType !== 1 && <div className="form-field-block"><TextField id="response-nft-address" label="Requested ERC-721 collection address" value={responseNftAddress} onChange={setResponseNftAddress} placeholder="0x…" />{isAddress(responseNftAddress) && <BalanceHint address={responseNftAddress as Address} kind="nft" />}</div>}
          {assetType !== 0 && <div className="field-grid form-field-block"><div><TextField id="response-token-address" label="ERC-20 token contract" value={responseTokenAddress} onChange={setResponseTokenAddress} placeholder="0x…" />{isAddress(responseTokenAddress) && <BalanceHint address={responseTokenAddress as Address} kind="token" />}</div><TextField id="response-token-amount" label="Exact amount" value={responseTokenAmount} onChange={setResponseTokenAmount} placeholder="e.g. 125.5" /></div>}
        </div>
        <div className="form-section"><div className="form-section-heading"><span className="step-number">03</span><div><h3>Expiry</h3><p>Set a duration in seconds, or zero for no expiry.</p></div></div><div className="duration-field"><TextField id="offer-duration" label="Duration (seconds)" value={duration} onChange={setDuration} placeholder="604800" type="number" help="0 means the offer has no expiry." /><span className="duration-preview"><Clock3 />{durationLabel(duration)}</span></div></div>
        <div className="atomic-note"><LockKeyhole /><span><strong>Two wallet confirmations.</strong> First, approve only this NFT token ID. Then create the offer and escrow it. No transaction is sent until you confirm in your wallet.</span></div>
        {!account.address && <div className="inline-error"><Wallet />Connect your wallet before creating an offer.</div>}
        {paused && <div className="inline-error"><LockKeyhole />The contract is paused. Offer actions are unavailable.</div>}
        {flowError && <div className="inline-error"><CircleAlert />{flowError}</div>}
        <TransactionNotice transactions={transactions} />
        <div className="modal-actions"><button type="button" className="button button-outline" onClick={closeCreateModal}>Cancel</button><button type="submit" className="button button-dark" disabled={!writesReady || transactions.some((item) => item.status === "pending" || (item.status === "confirmed" && item.label.startsWith("Create offer")))}><LockKeyhole />Review and create offer</button></div>
      </form>
    </Modal>}

    {activeOffer && <Modal title={`Offer #${activeOffer.id.toString().padStart(4, "0")}`} onClose={closeOfferModal} wide>
      <div className="modal-body offer-detail">
        <div className="detail-status-row"><StatusBadge status={getEffectiveStatus(activeOffer, chainClock.data)} /><span className="detail-deadline"><Clock3 />{formatDeadline(activeOffer.deadline)}</span></div>
        <div className="detail-swap"><AssetTile title="THEY OFFER · ESCROWED NFT" address={activeOffer.requestNftAddress} tokenId={activeOffer.requestNftId} /><div className="detail-swap-icon"><ArrowLeftRight /></div><div className="detail-request-column">
          {activeOffer.responseAssetType !== 1 && <AssetTile title="THEY WANT · RESPONSE NFT" address={activeOffer.responseNftAddress} icon="nft" tokenId={activeOffer.hasResponseNftId ? activeOffer.responseNftId : undefined} />}
          {activeOffer.responseAssetType !== 0 && <AssetTile title="THEY WANT · RESPONSE TOKEN" address={activeOffer.responseTokenAddress} icon="token" amount={activeOffer.responseTokenAmount} />}
        </div></div>
        <div className="detail-parties"><div><span>CREATOR</span><strong>{shortAddress(activeOffer.partyA)}</strong></div><div><span>ACCEPTER</span><strong>{activeOffer.partyB === ZERO ? "Open to anyone" : shortAddress(activeOffer.partyB)}</strong></div><div><span>OFFER ID</span><strong>#{activeOffer.id.toString()}</strong></div></div>
        <div className="atomic-note"><ShieldCheck /><span><strong>Atomic exchange.</strong> The response NFT and ERC-20 transfer from you to the creator; the escrowed NFT transfers to you. Every transfer succeeds together or the transaction reverts.</span></div>
        {expired && activeOffer.status === 0 && <div className="expiry-note"><Clock3 /><span>This offer has expired, but expiry does not automatically return the escrowed NFT. The creator must reclaim it with a transaction.</span></div>}
        {flowError && <div className="inline-error"><CircleAlert />{flowError}</div>}
        <TransactionNotice transactions={transactions} />
        {accepting && <form className="accept-form" onSubmit={handleAcceptOffer}>
          {(activeOffer.responseAssetType === 0 || activeOffer.responseAssetType === 2) && <TextField id="accept-response-id" label={`Your NFT token ID · ${shortAddress(activeOffer.responseNftAddress)}`} value={acceptNftId} onChange={setAcceptNftId} placeholder="e.g. 0" type="number" help="Token ID 0 is valid. You will approve only this token ID." />}
          {activeOffer.responseAssetType !== 0 && <div className="accept-token-summary"><span>Exact ERC-20 approval</span><strong>{formatAmount(activeOffer.responseTokenAmount)} <small>{shortAddress(activeOffer.responseTokenAddress)}</small></strong></div>}
          <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setAccepting(false)}>Back</button><button type="submit" className="button button-lime" disabled={!writesReady || transactions.some((item) => item.status === "pending" || (item.status === "confirmed" && item.label.startsWith("Accept offer")))}><LockKeyhole />Review approvals & accept</button></div>
        </form>}
        {!accepting && <div className="modal-actions modal-actions-detail">
          {activeOffer.status === 0 && activeOffer.partyA.toLowerCase() === account.address?.toLowerCase() && !activeOffer.isEscrowReclaimed && (expired
            ? <button type="button" className="button button-lime" disabled={!writesReady || transactions.some((item) => item.status === "pending")} onClick={() => handleOfferAction(activeOffer, "reclaimExpiredEscrow")}><ArrowDownLeft />Reclaim expired NFT</button>
            : <button type="button" className="button button-outline" disabled={!writesReady || transactions.some((item) => item.status === "pending")} onClick={() => handleOfferAction(activeOffer, "closeOffer")}><X />Close offer</button>)}
          {activeOffer.status === 0 && activeOffer.partyA.toLowerCase() !== account.address?.toLowerCase() && !expired && <button type="button" className="button button-lime" disabled={!writesReady || transactions.some((item) => item.status === "pending")} onClick={() => setAccepting(true)}><ArrowDownLeft />Accept this offer</button>}
          {activeOffer.status === 0 && !account.address && <button type="button" className="button button-dark" disabled><Wallet />Connect a wallet to accept</button>}
          {activeOffer.status !== 0 && <span className="terminal-note">This offer is no longer open for actions.</span>}
        </div>}
        <p className="detail-disclaimer">Third-party token behavior and metadata are not guaranteed by this contract. Verify each collection and token address before signing.</p>
      </div>
    </Modal>}
  </main>;
}
