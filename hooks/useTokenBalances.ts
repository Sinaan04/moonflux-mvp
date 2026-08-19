"use client";

import { useState, useCallback, useRef } from "react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import { useMoonWallet } from "@/components/WalletProvider";

/**
 * TokenHolding — represents a single SPL token in the user's wallet.
 */
export interface TokenHolding {
  /** Token mint address */
  mint: string;
  /** Raw token balance (smallest unit) */
  rawBalance: bigint;
  /** Human-readable balance (adjusted for decimals) */
  balance: number;
  /** Token decimals */
  decimals: number;
  /** Token name from our DB (or null if not a MoonFluxx token) */
  name: string | null;
  /** Token ticker from our DB (or null) */
  ticker: string | null;
  /** Whether this is a MoonFluxx-launched token */
  isMoonFluxx: boolean;
  /** Estimated USD value (null if we can't price it) */
  valueUsd: number | null;
  /** Estimated SOL value */
  valueSol: number | null;
  /** Bonding curve progress (0-100) or null if graduated/unknown */
  curveProgress: number | null;
  /** Whether the token has graduated to Raydium */
  graduated: boolean;
}

export interface PortfolioSummary {
  /** Total portfolio value in SOL */
  totalValueSol: number;
  /** Total portfolio value in USD */
  totalValueUsd: number;
  /** SOL balance (native, not SPL) */
  solBalance: number;
  /** Number of MoonFluxx tokens held */
  moonFluxxTokenCount: number;
  /** Number of other SPL tokens held */
  otherTokenCount: number;
}

/**
 * useTokenBalances — Fetches real on-chain SPL token holdings for the connected wallet.
 * 
 * Architecture:
 * 1. Single RPC call: getTokenAccountsByOwner → gets ALL SPL tokens
 * 2. Cross-reference mints with our Supabase tokens table → identify MoonFluxx tokens
 * 3. For MoonFluxx tokens still on curve: calculate price from on-chain reserves
 * 4. Cache results for 30 seconds to avoid RPC spam
 * 
 * Why this approach:
 * - getTokenAccountsByOwner is ONE RPC call regardless of how many tokens the wallet holds
 * - We parse the binary account data client-side (no extra calls per token)
 * - We batch-fetch curve states with getMultipleAccountsInfo (one more RPC call)
 * - Total: 3 RPC calls max (balances + SOL balance + curve states)
 */
export function useTokenBalances() {
  const { connection, connected, address } = useMoonWallet();
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>({
    totalValueSol: 0,
    totalValueUsd: 0,
    solBalance: 0,
    moonFluxxTokenCount: 0,
    otherTokenCount: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  // Cache guard — prevent re-fetch within 30 seconds
  const cacheRef = useRef<{ data: TokenHolding[]; timestamp: number } | null>(null);
  const CACHE_TTL = 30_000; // 30 seconds

  const fetchBalances = useCallback(async (forceRefresh = false) => {
    if (!connected || !address || !connection) {
      setError("Wallet not connected");
      return;
    }

    // Check cache
    if (!forceRefresh && cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setHoldings(cacheRef.current.data);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const walletPubkey = new PublicKey(address);

      // ── Step 1: Fetch ALL SPL token accounts in ONE RPC call ──
      const tokenAccounts = await connection.getTokenAccountsByOwner(walletPubkey, {
        programId: TOKEN_PROGRAM_ID,
      });

      // ── Step 2: Parse binary account data ──
      const rawTokens: { mint: string; balance: bigint; decimals: number }[] = [];

      for (const { account } of tokenAccounts.value) {
        const data = AccountLayout.decode(account.data);
        const balance = data.amount; // This is a BigInt (u64)
        
        // Skip zero-balance accounts
        if (balance === BigInt(0)) continue;

        rawTokens.push({
          mint: new PublicKey(data.mint).toBase58(),
          balance,
          decimals: 6, // Default to 6 (MoonFluxx tokens use 6 decimals)
        });
      }

      // ── Step 3: Fetch SOL balance ──
      const solBalanceLamports = await connection.getBalance(walletPubkey);
      const solBalance = solBalanceLamports / 1e9;

      // ── Step 4: Cross-reference with our database ──
      // Fetch our token list from Supabase to identify MoonFluxx tokens
      let dbTokens: any[] = [];
      try {
        const res = await fetch("/api/explore-tokens?limit=50");
        if (res.ok) {
          const data = await res.json();
          dbTokens = data.tokens || [];
        }
      } catch {
        // If DB is down, we still show raw balances
      }

      // Build a lookup map: mint_address → token info
      const dbTokenMap = new Map<string, any>();
      for (const t of dbTokens) {
        if (t.mint_address) {
          dbTokenMap.set(t.mint_address, t);
        }
      }

      // ── Step 5: Fetch SOL/USD price ──
      let solPrice = 0;
      try {
        const priceRes = await fetch(
          `${process.env.NEXT_PUBLIC_JUPITER_PRICE_URL || "https://api.jup.ag/price/v2"}?ids=So11111111111111111111111111111111111111112`
        );
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          solPrice = parseFloat(priceData?.data?.["So11111111111111111111111111111111111111112"]?.price || "0");
        }
      } catch {
        solPrice = 150; // Reasonable fallback
      }

      // ── Step 6: For MoonFluxx tokens, fetch bonding curve states ──
      const moonFluxxMints = rawTokens
        .filter(t => dbTokenMap.has(t.mint))
        .map(t => t.mint);

      // Batch-fetch curve PDAs for pricing
      let curveStates = new Map<string, any>();
      if (moonFluxxMints.length > 0) {
        try {
          const { getBondingCurvePDA } = await import("@/lib/program");
          const curvePDAs = moonFluxxMints.map(mint => getBondingCurvePDA(new PublicKey(mint)));
          
          // getMultipleAccountsInfo — ONE RPC call for all curves
          const curveAccounts = await connection.getMultipleAccountsInfo(curvePDAs);
          
          for (let i = 0; i < moonFluxxMints.length; i++) {
            const acc = curveAccounts[i];
            if (acc?.data) {
              try {
                // Parse the bonding curve account data
                // Layout: 8 (discriminator) + 32 (mint) + 32 (creator) + 8 (vSol) + 8 (vToken) + 8 (rSol) + 8 (rToken) + 1 (complete) + ...
                const buf = acc.data;
                const virtualSolReserves = Number(buf.readBigUInt64LE(72)); // offset after discriminator + mint + creator
                const virtualTokenReserves = Number(buf.readBigUInt64LE(80));
                const realSolReserves = Number(buf.readBigUInt64LE(88));
                const complete = buf[104] === 1; // boolean byte

                curveStates.set(moonFluxxMints[i], {
                  virtualSolReserves,
                  virtualTokenReserves,
                  realSolReserves,
                  complete,
                });
              } catch {
                // Failed to parse this curve, skip
              }
            }
          }
        } catch {
          // If program imports fail, skip curve pricing
        }
      }

      // ── Step 7: Build final holdings array ──
      const finalHoldings: TokenHolding[] = rawTokens.map(raw => {
        const dbToken = dbTokenMap.get(raw.mint);
        const isMoonFluxx = !!dbToken;
        const curve = curveStates.get(raw.mint);

        // Calculate human-readable balance
        const balance = Number(raw.balance) / Math.pow(10, raw.decimals);

        // Calculate value
        let valueSol: number | null = null;
        let valueUsd: number | null = null;

        if (isMoonFluxx && curve) {
          // Price from bonding curve: price per token = virtualSolReserves / virtualTokenReserves
          const pricePerTokenLamports = curve.virtualSolReserves / curve.virtualTokenReserves;
          const pricePerTokenSol = pricePerTokenLamports; // Already in SOL/token ratio (lamports/microtoken)
          
          // value = balance * (vSol / vToken) — both in raw units, so:
          // valueSol = (rawBalance * virtualSolReserves) / (virtualTokenReserves * 1e9)
          valueSol = (Number(raw.balance) * curve.virtualSolReserves) / (curve.virtualTokenReserves * 1e9);
          valueUsd = valueSol * solPrice;
        }

        return {
          mint: raw.mint,
          rawBalance: raw.balance,
          balance,
          decimals: raw.decimals,
          name: dbToken?.name || null,
          ticker: dbToken?.ticker || null,
          isMoonFluxx,
          valueUsd,
          valueSol,
          curveProgress: curve ? Math.min(100, (curve.realSolReserves / 1e9 / 85) * 100) : null,
          graduated: dbToken?.graduated || curve?.complete || false,
        };
      });

      // Sort: MoonFluxx tokens first, then by value descending
      finalHoldings.sort((a, b) => {
        if (a.isMoonFluxx && !b.isMoonFluxx) return -1;
        if (!a.isMoonFluxx && b.isMoonFluxx) return 1;
        return (b.valueSol || 0) - (a.valueSol || 0);
      });

      // ── Step 8: Build summary ──
      const moonFluxxHoldings = finalHoldings.filter(h => h.isMoonFluxx);
      const otherHoldings = finalHoldings.filter(h => !h.isMoonFluxx);
      const totalValueSol = finalHoldings.reduce((acc, h) => acc + (h.valueSol || 0), 0) + solBalance;
      const totalValueUsd = totalValueSol * solPrice;

      setSummary({
        totalValueSol,
        totalValueUsd,
        solBalance,
        moonFluxxTokenCount: moonFluxxHoldings.length,
        otherTokenCount: otherHoldings.length,
      });

      setHoldings(finalHoldings);
      setLastFetched(Date.now());

      // Update cache
      cacheRef.current = { data: finalHoldings, timestamp: Date.now() };
    } catch (err: any) {
      console.error("[useTokenBalances] Error:", err);
      setError(err.message || "Failed to fetch balances");
    } finally {
      setIsLoading(false);
    }
  }, [connected, address, connection]);

  return {
    holdings,
    summary,
    isLoading,
    error,
    lastFetched,
    fetchBalances,
    /** Force a fresh fetch ignoring cache */
    refreshBalances: () => fetchBalances(true),
  };
}
