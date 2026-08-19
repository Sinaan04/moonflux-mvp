"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import {
  User, Wallet, Copy, Check, Share2, ExternalLink,
  Globe, MessageCircle, Rocket, BarChart2,
  ArrowUpRight, ArrowDownRight, Clock,
  Users, Crown, Flame, Award, Activity, ChevronRight,
  TrendingUp, Star, Zap, Target, Terminal
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import { useMoonWallet } from "@/components/WalletProvider";
import { useWalletModal } from "@/components/SolanaProvider";
import { useTheme } from "@/components/ThemeProvider";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import type { TokenHolding } from "@/hooks/useTokenBalances";

const EASE = [0.16, 1, 0.3, 1] as const;

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}S AGO`;
  if (diff < 3600) return `${Math.floor(diff / 60)}M AGO`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}H AGO`;
  return `${Math.floor(diff / 86400)}D AGO`;
}

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
const HOLDINGS = [
  { icon: "🐕", name: "LUNA DOGE",  ticker: "LDOGE", qty: "1,200,000", value: "$2,808", pnl: "+$1,969", pnlPct: "+141.2%", pos: true,  color: "#F59E0B", sparkline: [8,12,19,25,31,44,52,71,65,89,95,110] },
  { icon: "🧠", name: "NEURALFI",   ticker: "NFI",   qty: "4,500",     value: "$6,390", pnl: "+$1,350", pnlPct: "+26.8%",  pos: true,  color: "#8B5CF6", sparkline: [50,55,58,62,60,65,70,72,75,80,82,88] },
  { icon: "🚀", name: "ROCKETDOGE", ticker: "RDOGE", qty: "500,000",   value: "$1,240", pnl: "-$310",   pnlPct: "-20.0%",  pos: false, color: "#F43F5E", sparkline: [80,75,70,65,60,55,50,45,48,42,38,35] },
  { icon: "⚡", name: "NOVAFLUX",   ticker: "NVFX",  qty: "12,000",    value: "$534",   pnl: "+$78",    pnlPct: "+17.1%",  pos: true,  color: "#10B981", sparkline: [30,35,38,42,48,52,58,65,70,68,75,80] },
];

const ACHIEVEMENTS = [
  { title: "EARLY HUNTER",   icon: "🎯", rarity: "LEGENDARY", color: "#F59E0B", unlocked: true  },
  { title: "WHALE STATUS",   icon: "🐋", rarity: "EPIC",      color: "#6366F1", unlocked: true  },
  { title: "DIAMOND HANDS",  icon: "💎", rarity: "RARE",      color: "#06B6D4", unlocked: true  },
  { title: "ALPHA CALLER",   icon: "📡", rarity: "EPIC",      color: "#8B5CF6", unlocked: true  },
  { title: "VOLUME TITAN",   icon: "⚡", rarity: "RARE",      color: "#10B981", unlocked: true  },
  { title: "GRADUATION DAY", icon: "🎓", rarity: "LEGENDARY", color: "#F59E0B", unlocked: false },
];

const ACTIVITY_FEED = [
  { type: "BUY",    icon: "💚", ticker: "LDOGE", amount: "12.4 SOL",  time: "2H AGO",  desc: "BOUGHT 1.2M LUNA DOGE" },
  { type: "LAUNCH", icon: "🚀", ticker: "ACAT",  amount: "",          time: "1D AGO",  desc: "LAUNCHED ASTROCAT" },
  { type: "SELL",   icon: "🔴", ticker: "RDOGE", amount: "3.1 SOL",   time: "3D AGO",  desc: "SOLD 200K ROCKETDOGE" },
  { type: "VOTE",   icon: "⚔️", ticker: "",      amount: "",          time: "5D AGO",  desc: "VOTED IN ARENA BATTLE" },
  { type: "BUY",    icon: "💚", ticker: "NVFX",  amount: "4.8 SOL",   time: "1W AGO",  desc: "BOUGHT 12K NOVAFLUX" },
];

const CREATED_TOKENS = [
  { icon: "🐕", name: "LUNA DOGE", ticker: "LDOGE", status: "GRADUATED", mcap: "$1.87M", holders: 8341, progress: 100, color: "#F59E0B" },
  { icon: "🐱", name: "ASTROCAT",  ticker: "ACAT",  status: "LIVE",      mcap: "$440K",  holders: 2901, progress: 68,  color: "#8B5CF6" },
];

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { showToast } = useToast();
  const { connected, address } = useMoonWallet();
  const { setModalOpen } = useWalletModal();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"portfolio" | "tokens" | "activity" | "badges" | "roast">("portfolio");
  const [activityFilter, setActivityFilter] = useState<"ALL" | "TRADES" | "LAUNCHES" | "SOCIAL">("ALL");
  const [roastData, setRoastData] = useState<any>(null);
  const [isRoasting, setIsRoasting] = useState(false);

  // ── Real data from Supabase ──
  const [profileData, setProfileData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: "", bio: "", twitter_handle: "" });
  const [isSaving, setIsSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!connected || !address) return;
    try {
      const res = await fetch(`/api/profile?wallet=${address}`);
      const data = await res.json();
      setProfileData(data);
      if (data.user) {
        setEditForm({
          username: data.user.username || "",
          bio: data.user.bio || "",
          twitter_handle: data.user.twitter_handle || "",
        });
      }
    } catch (err) {
      console.warn("Could not fetch profile:", err);
    }
  }, [connected, address]);

  // Follows data
  const [followStats, setFollowStats] = useState({ followers: 0, following: 0 });

  const fetchFollows = useCallback(async () => {
    if (!connected || !address) return;
    try {
      const res = await fetch(`/api/follows?wallet=${address}`);
      const data = await res.json();
      setFollowStats({ followers: data.followers || 0, following: data.following || 0 });
    } catch { /* silent */ }
  }, [connected, address]);

  useEffect(() => { fetchProfile(); fetchFollows(); }, [fetchProfile, fetchFollows]);

  // ── Real on-chain portfolio data ──
  const { holdings: realHoldings, summary: portfolioSummary, isLoading: isLoadingBalances, refreshBalances, lastFetched, fetchBalances } = useTokenBalances();

  useEffect(() => {
    if (connected && address) {
      fetchBalances();
    }
  }, [connected, address, fetchBalances]);

  const handleSaveProfile = async () => {
    if (!address) return;
    setIsSaving(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, ...editForm }),
      });
      showToast("PROFILE UPDATED!", "success");
      setIsEditing(false);
      fetchProfile();
    } catch {
      showToast("UPDATE FAILED", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Use real data if available, fallback to mock
  const dbUser = profileData?.user;
  const dbTokens = profileData?.tokens || [];
  const dbTrades = profileData?.trades || [];
  const dbStats = profileData?.stats;

  const displayName = dbUser?.username || (connected && address ? `${address.slice(0,4)}...${address.slice(-4)}` : "ANON");
  const handle = dbUser?.username || (connected && address ? address.slice(0, 8) : "connect wallet");
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-6)}` : "NOT CONNECTED";
  const userBio = dbUser?.bio || "ON-CHAIN DEGEN // TOKEN LAUNCHER // AI MAXI";

  // Real created tokens or mock fallback
  const createdTokens = dbTokens.length > 0 ? dbTokens.map((t: any) => ({
    icon: "🚀", name: t.name, ticker: t.ticker, status: t.graduated ? "GRADUATED" : "LIVE",
    mcap: "", holders: 0, progress: Math.floor((t.bonding_curve_progress || 0) * 100), color: "#6366F1",
    mint: t.mint_address,
  })) : CREATED_TOKENS;

  // Real activity from trades or mock fallback
  const realActivity = dbTrades.length > 0 ? dbTrades.slice(0, 10).map((t: any) => ({
    type: t.type === "buy" ? "BUY" : "SELL",
    icon: t.type === "buy" ? "💚" : "🔴",
    ticker: t.tokens?.ticker || "???",
    amount: `${t.sol_amount?.toFixed(2)} SOL`,
    time: timeAgo(new Date(t.created_at).getTime()),
    desc: `${t.type === "buy" ? "BOUGHT" : "SOLD"} ${t.token_amount?.toLocaleString() || "?"} ${t.tokens?.ticker || ""}`,
  })) : ACTIVITY_FEED;

  // Real stats or mock fallback
  const volumeSol = dbStats?.totalVolumeSol ?? 42;
  const pnlSol = dbStats?.pnlSol ?? 0;
  const tokensLaunched = dbStats?.tokensLaunched ?? CREATED_TOKENS.length;
  const totalTrades = dbStats?.totalTrades ?? 62;

  // Portfolio display values from real on-chain data
  const netWorthUsd = portfolioSummary.totalValueUsd > 0
    ? `$${portfolioSummary.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "$10,972";
  const netWorthSol = portfolioSummary.totalValueSol > 0
    ? `${portfolioSummary.totalValueSol.toFixed(2)} SOL`
    : `${volumeSol} SOL`;
  const holdingsCount = realHoldings.length > 0 ? realHoldings.length : HOLDINGS.length;

  // Convert real holdings to display format (or use mock fallback)
  const displayHoldings = realHoldings.length > 0 ? realHoldings.map((h: TokenHolding) => ({
    icon: h.isMoonFluxx ? "🚀" : "💎",
    name: h.name || `${h.mint.slice(0, 4)}...${h.mint.slice(-4)}`,
    ticker: h.ticker || h.mint.slice(0, 6),
    qty: h.balance.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    value: h.valueUsd != null ? `$${h.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "--",
    pnl: "--",
    pnlPct: h.isMoonFluxx ? (h.graduated ? "GRADUATED" : `${(h.curveProgress || 0).toFixed(0)}% CURVE`) : "",
    pos: true,
    color: h.isMoonFluxx ? "#6366F1" : "#818CF8",
    sparkline: [] as number[],
    mint: h.mint,
  })) : HOLDINGS;

  const handleCopy = () => {
    if (address) { navigator.clipboard.writeText(address); }
    setCopied(true);
    showToast("ADDRESS COPIED!", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRoast = async () => {
    setIsRoasting(true);
    try {
      const res = await fetch("/api/roast-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address || "anon.sol" }),
      });
      const data = await res.json();
      setRoastData(data.roast);
    } catch {
      showToast("SYS_ERR: ROAST FAILED.", "error");
    } finally {
      setIsRoasting(false);
    }
  };

  const filteredActivity = realActivity.filter((a: any) => {
    if (activityFilter === "ALL") return true;
    if (activityFilter === "TRADES") return a.type === "BUY" || a.type === "SELL";
    if (activityFilter === "LAUNCHES") return a.type === "LAUNCH";
    if (activityFilter === "SOCIAL") return a.type === "VOTE";
    return true;
  });

  // Brutalist styling variables
  const bBorder = isDark ? "border-2 border-[rgba(255,255,255,0.2)]" : "border-3 border-black";
  const bShadow = isDark ? "shadow-[4px_4px_0px_0px_#6366F1]" : "shadow-[4px_4px_0px_0px_#000]";
  const bHoverShadow = isDark ? "hover:shadow-[2px_2px_0px_0px_#6366F1] hover:translate-x-[2px] hover:translate-y-[2px]" : "hover:shadow-[2px_2px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px]";
  const bBg = isDark ? "bg-[#050510]" : "bg-white";
  const bText = isDark ? "text-white" : "text-black";
  const bMuted = isDark ? "text-gray-400" : "text-gray-600";

  const TABS = [
    { id: "portfolio", label: "PORTFOLIO", icon: BarChart2,    color: "#6366F1" },
    { id: "tokens",    label: "CREATED",   icon: Rocket,       color: "#10B981" },
    { id: "activity",  label: "ACTIVITY",  icon: Terminal,     color: "#F59E0B" },
    { id: "badges",    label: "BADGES",    icon: Award,        color: "#8B5CF6" },
    { id: "roast",     label: "AI ROAST",  icon: Flame,        color: "#F43F5E" },
  ] as const;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-24 font-mono overflow-x-hidden">

      {/* ── HERO BANNER ──────────────────────────────────────────────────────── */}
      <div className={`w-full mb-8 ${bBorder} ${bShadow} ${bBg}`}>
        {/* Marquee Header */}
        <div className={`w-full overflow-hidden border-b ${isDark ? "border-[rgba(255,255,255,0.2)] bg-[#10B981]/20 text-[#10B981]" : "border-black bg-[#10B981] text-black"}`}>
          <div className="flex whitespace-nowrap py-1.5 animate-marquee text-xs font-black tracking-widest uppercase">
             {[...Array(10)].map((_, i) => (
                <span key={i} className="mx-4">
                  {`> SYSTEM ACTIVE // DEGEN SCORE: 94/100 // WIN RATE: 68% // `}
                </span>
             ))}
          </div>
        </div>

        <div className="p-6 sm:p-8 flex flex-col md:flex-row gap-6 md:items-start justify-between relative overflow-hidden">
          {/* Grid background pattern */}
          <div className={`absolute inset-0 opacity-10 pointer-events-none ${isDark ? "bg-[linear-gradient(rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,1)_1px,transparent_1px)]" : "bg-[linear-gradient(rgba(0,0,0,1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,1)_1px,transparent_1px)]"}`} style={{ backgroundSize: '20px 20px' }} />

          {/* Identity Section */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
            {/* Square Brutalist Avatar */}
            <div className={`relative shrink-0 w-28 h-28 flex items-center justify-center ${bBorder} ${isDark ? "bg-[#1E1B4B]" : "bg-indigo-100"} shadow-[4px_4px_0px_0px_#6366F1]`}>
              <User className="w-12 h-12 text-[#6366F1]" />
              {/* Online Indicator */}
              <div className={`absolute -bottom-2 -right-2 px-2 py-0.5 text-[10px] font-black tracking-wider flex items-center gap-1 ${bBorder} ${isDark ? "bg-[#10B981] text-black" : "bg-[#10B981] text-black"}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" /> ONLINE
              </div>
              {/* Level Badge */}
              <div className={`absolute -top-3 -left-3 px-2 py-1 text-[12px] font-black tracking-wider ${bBorder} ${isDark ? "bg-[#F59E0B] text-black" : "bg-[#F59E0B] text-black"} transform -rotate-6`}>
                LVL 42
              </div>
            </div>

            {/* User Details */}
            <div className="text-center sm:text-left flex flex-col justify-center mt-2">
              <h1 className={`text-3xl sm:text-4xl font-black uppercase tracking-tighter ${bText}`}>
                {displayName}
              </h1>
              <div className="flex items-center justify-center sm:justify-start gap-3 mt-2 flex-wrap">
                <span className={`text-sm font-bold ${isDark ? "text-[#818CF8]" : "text-[#6366F1]"}`}>@{handle}</span>
                {connected && (
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`px-1.5 py-0.5 text-[10px] font-black uppercase cursor-pointer transition-all ${isDark ? "bg-[#6366F1] text-white hover:bg-[#818CF8]" : "bg-black text-white hover:bg-[#6366F1]"}`}
                  >
                    [ EDIT PROFILE ]
                  </button>
                )}
              </div>
              <p className={`mt-3 text-sm max-w-md ${bMuted} uppercase leading-tight font-bold`}>
                {">"} {userBio}
              </p>
            </div>
          </div>

          {/* Action Buttons & Socials */}
          <div className="flex flex-col items-center sm:items-end gap-3 relative z-10 w-full md:w-auto">
            {connected ? (
              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={handleCopy}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 font-black text-xs transition-all uppercase ${bBorder} ${isDark ? "bg-black text-white hover:bg-[#6366F1]" : "bg-white text-black hover:bg-[#6366F1] hover:text-white"} ${bHoverShadow}`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  [ COPY ]
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.href); showToast("LINK COPIED!", "success"); }}
                  className={`flex items-center justify-center px-3 py-2 font-black transition-all ${bBorder} ${isDark ? "bg-black text-white hover:bg-[#F59E0B] hover:text-black" : "bg-white text-black hover:bg-[#F59E0B]"} ${bHoverShadow}`}
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                className={`w-full md:w-auto px-6 py-2.5 font-black text-sm uppercase transition-all ${bBorder} ${isDark ? "bg-[#6366F1] text-white" : "bg-[#6366F1] text-black"} shadow-[4px_4px_0px_0px_#F59E0B] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#F59E0B]`}
              >
                CONNECT WALLET
              </button>
            )}

            {/* Social Stat Blocks */}
            <div className={`mt-2 flex border w-full md:w-auto ${isDark ? "border-[rgba(255,255,255,0.2)]" : "border-black"} divide-x ${isDark ? "divide-[rgba(255,255,255,0.2)]" : "divide-black"}`}>
              {[
                { label: "FOLLOWERS", value: String(followStats.followers) },
                { label: "FOLLOWING", value: String(followStats.following) },
                { label: "VOLUME",    value: `${volumeSol} SOL` },
              ].map((s, i) => (
                <div key={i} className={`px-3 py-2 text-center ${isDark ? "bg-[#0A0A1A]" : "bg-gray-100"}`}>
                  <div className={`text-sm font-black ${bText}`}>{s.value}</div>
                  <div className={`text-[9px] font-bold ${bMuted} uppercase tracking-widest mt-0.5`}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* ── EDIT PROFILE PANEL ────────────────────────────────────────────── */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`mb-6 ${bBorder} ${bShadow} ${bBg} p-6 overflow-hidden`}
          >
            <h3 className={`text-xs font-black uppercase tracking-widest mb-4 ${isDark ? "text-[#818CF8]" : "text-[#6366F1]"}`}>// EDIT PROFILE</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={`text-[10px] font-black uppercase tracking-widest ${bMuted}`}>USERNAME</label>
                <input
                  value={editForm.username}
                  onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))}
                  placeholder="Enter username..."
                  className={`w-full mt-1 px-3 py-2 text-sm font-bold uppercase ${bBorder} ${bBg} ${bText} focus:outline-none focus:ring-2 focus:ring-[#6366F1]`}
                />
              </div>
              <div>
                <label className={`text-[10px] font-black uppercase tracking-widest ${bMuted}`}>BIO</label>
                <input
                  value={editForm.bio}
                  onChange={e => setEditForm(p => ({ ...p, bio: e.target.value }))}
                  placeholder="On-chain degen..."
                  className={`w-full mt-1 px-3 py-2 text-sm font-bold uppercase ${bBorder} ${bBg} ${bText} focus:outline-none focus:ring-2 focus:ring-[#6366F1]`}
                />
              </div>
              <div>
                <label className={`text-[10px] font-black uppercase tracking-widest ${bMuted}`}>X / TWITTER</label>
                <input
                  value={editForm.twitter_handle}
                  onChange={e => setEditForm(p => ({ ...p, twitter_handle: e.target.value }))}
                  placeholder="@yourhandle"
                  className={`w-full mt-1 px-3 py-2 text-sm font-bold uppercase ${bBorder} ${bBg} ${bText} focus:outline-none focus:ring-2 focus:ring-[#6366F1]`}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className={`px-6 py-2.5 font-black text-xs uppercase ${bBorder} bg-[#10B981] text-black hover:brightness-110 transition-all`}
              >
                {isSaving ? "SAVING..." : "[ SAVE PROFILE ]"}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className={`px-6 py-2.5 font-black text-xs uppercase ${bBorder} ${bBg} ${bText} hover:opacity-80 transition-all`}
              >
                [ CANCEL ]
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BENTO METRICS MATRIX ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        {[
          {
            title: "NET WORTH", value: netWorthUsd, sub: `▲ ${netWorthSol}`,
            color: "#10B981", bg: isDark ? "bg-[#10B981]/10" : "bg-[#10B981]", text: isDark ? "text-white" : "text-black",
            subStyle: isDark ? "text-[#10B981] bg-[#10B981]/20 border-[#10B981]" : "text-black bg-white border-black"
          },
          {
            title: "ALL-TIME PNL", value: "+$4,240", sub: "SINCE JUL 2024",
            color: "#6366F1", bg: isDark ? "bg-[#6366F1]/10" : "bg-[#6366F1]", text: isDark ? "text-white" : "text-white",
            subStyle: isDark ? "text-[#818CF8] bg-[#6366F1]/20 border-[#6366F1]" : "text-black bg-white border-black"
          },
          {
            title: "WIN RATE", value: "68%", sub: "42 WINS / 20 LOSSES",
            color: "#F43F5E", bg: isDark ? "bg-[#F43F5E]/10" : "bg-white", text: bText,
            subStyle: isDark ? "text-[var(--color-text-muted)] border-[rgba(255,255,255,0.2)]" : "text-black border-black"
          },
          {
            title: "RISK SCORE", value: "6.2", sub: "MODERATE DEGEN",
            color: "#F59E0B", bg: isDark ? "bg-[#F59E0B]/10" : "bg-[#F59E0B]", text: isDark ? "text-white" : "text-black",
            subStyle: isDark ? "text-[#F59E0B] bg-[#F59E0B]/20 border-[#F59E0B]" : "text-black bg-white border-black"
          },
        ].map((m, i) => (
          <div key={i} className={`relative flex flex-col justify-between p-4 ${bBorder} ${bShadow} ${m.bg}`}>
            <div className={`text-[10px] font-black uppercase tracking-widest ${m.text}`}>{m.title}</div>
            <div className={`text-2xl sm:text-3xl font-black mt-2 mb-3 ${m.text}`}>{m.value}</div>
            <div className={`w-fit text-[9px] font-bold px-2 py-0.5 uppercase border ${m.subStyle}`}>
              {m.sub}
            </div>
            {/* Accent strip */}
            <div className="absolute top-0 right-0 bottom-0 w-2 border-l" style={{ backgroundColor: m.color, borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'black' }} />
          </div>
        ))}
      </div>

      {/* ── XP PROGRESS BAR ─────────────────────────────────────────────────── */}
      <div className={`mb-8 p-4 ${bBorder} ${bShadow} ${bBg}`}>
        <div className="flex justify-between items-end mb-2">
          <div className={`font-black text-sm ${bText}`}>[ LEVEL 42 : DIAMOND TRADER ]</div>
          <div className={`text-xs font-bold ${bMuted}`}>94.2K / 125K XP</div>
        </div>
        <div className="text-[#6366F1] font-black text-xs sm:text-sm tracking-widest overflow-hidden whitespace-nowrap">
          {/* ASCII Progress Bar */}
          [{'█'.repeat(30)}{'░'.repeat(10)}] 75%
        </div>
      </div>

      {/* ── BRUTALIST TABS ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-6">
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 font-black text-xs sm:text-sm uppercase transition-all ${bBorder} ${
                active
                  ? isDark ? "bg-[#10B981] text-black shadow-[4px_4px_0px_0px_#6366F1] translate-x-[-2px] translate-y-[-2px]" : "bg-black text-white shadow-[4px_4px_0px_0px_#10B981] translate-x-[-2px] translate-y-[-2px]"
                  : `${bBg} ${bText} ${bHoverShadow}`
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT ───────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* ── PORTFOLIO ── */}
        {activeTab === "portfolio" && (
          <motion.div key="portfolio" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col lg:flex-row gap-6">
            
            {/* Holdings Table */}
            <div className={`flex-1 ${bBorder} ${bShadow} ${bBg}`}>
              <div className={`px-4 py-3 border-b ${isDark ? "border-[rgba(255,255,255,0.2)] bg-[#0A0A1A]" : "border-black bg-gray-100"} flex items-center justify-between`}>
                <span className={`font-black ${bText}`}>[ {realHoldings.length > 0 ? "ON-CHAIN" : "CURRENT"} HOLDINGS ]</span>
                <div className="flex items-center gap-3">
                  {lastFetched && (
                    <span className={`text-[9px] font-bold ${bMuted}`}>
                      UPDATED {Math.floor((Date.now() - lastFetched) / 1000)}S AGO
                    </span>
                  )}
                  <button
                    onClick={refreshBalances}
                    disabled={isLoadingBalances}
                    className={`px-2 py-1 text-[10px] font-black uppercase transition-all ${bBorder} ${isDark ? "bg-black text-[#10B981] hover:bg-[#10B981] hover:text-black" : "bg-white text-black hover:bg-[#10B981]"} ${isLoadingBalances ? "animate-pulse" : ""}`}
                  >
                    {isLoadingBalances ? "SYNCING..." : `↻ REFRESH (${holdingsCount})`}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr className={`text-[10px] font-black border-b ${isDark ? "border-[rgba(255,255,255,0.2)] text-gray-400" : "border-black text-gray-600"}`}>
                      <th className="px-4 py-3">ASSET</th>
                      <th className="px-4 py-3 hidden sm:table-cell">BALANCE</th>
                      <th className="px-4 py-3">VALUE</th>
                      <th className="px-4 py-3">STATUS</th>
                      <th className="px-4 py-3 hidden md:table-cell">7D TREND</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? "divide-[rgba(255,255,255,0.2)]" : "divide-black"}`}>
                    {/* SOL Balance Row */}
                    {portfolioSummary.solBalance > 0 && (
                      <tr className={`hover:bg-[#10B981]/10 transition-colors ${bText}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 flex items-center justify-center border ${isDark ? "border-[rgba(255,255,255,0.2)] bg-black" : "border-black bg-white"}`}>◎</div>
                            <div>
                              <div className="font-black text-sm">SOLANA</div>
                              <div className={`text-[10px] font-bold ${bMuted}`}>$SOL</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-xs hidden sm:table-cell">{portfolioSummary.solBalance.toFixed(4)}</td>
                        <td className="px-4 py-3 font-black text-sm">${(portfolioSummary.solBalance * (portfolioSummary.totalValueUsd / portfolioSummary.totalValueSol || 150)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[9px] font-bold border px-1 ${isDark ? "border-[#10B981] text-[#10B981]" : "border-black bg-[#10B981] text-black"}`}>NATIVE</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell"><span className={`text-xs ${bMuted}`}>—</span></td>
                      </tr>
                    )}
                    {displayHoldings.map((h: any, i: number) => (
                      <tr key={i} className={`hover:bg-[#10B981]/10 transition-colors ${bText}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 flex items-center justify-center border ${isDark ? "border-[rgba(255,255,255,0.2)] bg-black" : "border-black bg-white"}`}>
                              {h.icon}
                            </div>
                            <div>
                              <div className="font-black text-sm">{h.name}</div>
                              <div className={`text-[10px] font-bold ${bMuted}`}>${h.ticker}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-xs hidden sm:table-cell">{h.qty}</td>
                        <td className="px-4 py-3 font-black text-sm">{h.value}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            {h.pnl !== "--" && <span className={`font-black text-sm ${h.pos ? "text-[#10B981]" : "text-[#F43F5E]"}`}>{h.pnl}</span>}
                            {h.pnlPct && (
                              <span className={`text-[9px] font-bold border px-1 w-fit ${h.pos ? (isDark ? "border-[#10B981] text-[#10B981]" : "border-black bg-[#10B981] text-black") : (isDark ? "border-[#818CF8] text-[#818CF8]" : "border-black bg-[#818CF8] text-white")}`}>
                                {h.pnlPct}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {h.sparkline && h.sparkline.length > 0 ? (
                          <div className="w-20 h-8">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={h.sparkline.map((v: number, idx: number) => ({ x: idx, y: v }))}>
                                <Line type="step" dataKey="y" stroke={h.pos ? "#10B981" : "#F43F5E"} strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          ) : (
                            <span className={`text-xs ${bMuted}`}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Allocation Bar */}
            <div className={`w-full lg:w-72 shrink-0 ${bBorder} ${bShadow} ${bBg} flex flex-col`}>
              <div className={`px-4 py-3 border-b ${isDark ? "border-[rgba(255,255,255,0.2)] bg-[#0A0A1A]" : "border-black bg-gray-100"}`}>
                <span className={`font-black ${bText}`}>[ ALLOCATION ]</span>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-center gap-4">
                {[
                  { label: "MEME COINS", pct: 45, color: "#F59E0B" },
                  { label: "AI / DEFI",  pct: 32, color: "#8B5CF6" },
                  { label: "SOL NATIVE", pct: 18, color: "#06B6D4" },
                  { label: "STAKED",     pct: 5,  color: "#10B981" },
                ].map((a, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-end mb-1">
                      <span className={`text-[10px] font-black ${bText}`}>{a.label}</span>
                      <span className={`text-xs font-black`} style={{ color: a.color }}>{a.pct}%</span>
                    </div>
                    {/* Brutalist segmented bar */}
                    <div className={`h-4 border ${isDark ? "border-[rgba(255,255,255,0.2)] bg-black" : "border-black bg-white"} overflow-hidden flex`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${a.pct}%` }} transition={{ duration: 0.8 }} className="h-full border-r border-black" style={{ backgroundColor: a.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </motion.div>
        )}

        {/* ── CREATED TOKENS ── */}
        {activeTab === "tokens" && (
          <motion.div key="tokens" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Add New Token Card */}
              <Link href="/launch" className="block">
                <div className={`h-full flex flex-col justify-center items-center p-8 border-2 border-dashed ${isDark ? "border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.02)] hover:bg-[#6366F1]/20 hover:border-[#6366F1]" : "border-black bg-gray-50 hover:bg-[#6366F1] hover:text-white"} transition-colors cursor-pointer group`}>
                  <div className={`text-4xl mb-4 group-hover:scale-110 transition-transform ${isDark ? "text-white" : "text-black group-hover:text-white"}`}>+</div>
                  <div className={`font-black text-lg mb-2 text-center ${isDark ? "text-white" : "text-black group-hover:text-white"}`}>LAUNCH_TOKEN.EXE</div>
                  <div className={`text-xs text-center font-bold px-3 py-1 border ${isDark ? "border-[rgba(255,255,255,0.2)] text-gray-400" : "border-black text-gray-500 group-hover:border-white group-hover:text-white"}`}>START BONDING CURVE</div>
                </div>
              </Link>

              {createdTokens.map((t: any, i: number) => (
                <div key={i} className={`p-5 ${bBorder} ${bShadow} ${bBg} flex flex-col justify-between gap-4`}>
                  <div className="flex justify-between items-start">
                    <div className={`w-12 h-12 flex items-center justify-center text-2xl border ${isDark ? "border-[rgba(255,255,255,0.2)] bg-black" : "border-black bg-white"}`}>
                      {t.icon}
                    </div>
                    <div className={`text-[9px] font-black px-2 py-1 uppercase border ${t.status === "GRADUATED" ? (isDark ? "border-[#10B981] text-[#10B981]" : "border-black bg-[#10B981] text-black") : (isDark ? "border-[#818CF8] text-[#818CF8]" : "border-black bg-[#818CF8] text-white")}`}>
                      [ {t.status} ]
                    </div>
                  </div>
                  <div>
                    <h3 className={`text-xl font-black ${bText} uppercase`}>{t.name} <span className="text-[#818CF8] text-sm">${t.ticker}</span></h3>
                    <div className="grid grid-cols-2 gap-2 mt-3 mb-4">
                      <div className={`p-2 border ${isDark ? "border-[rgba(255,255,255,0.2)] bg-[#050510]" : "border-black bg-gray-100"}`}>
                        <div className={`text-[9px] font-bold ${bMuted} uppercase`}>MCAP</div>
                        <div className={`text-sm font-black ${bText}`}>{t.mcap}</div>
                      </div>
                      <div className={`p-2 border ${isDark ? "border-[rgba(255,255,255,0.2)] bg-[#050510]" : "border-black bg-gray-100"}`}>
                        <div className={`text-[9px] font-bold ${bMuted} uppercase`}>HOLDERS</div>
                        <div className={`text-sm font-black ${bText}`}>{t.holders}</div>
                      </div>
                    </div>
                    {/* ASCII Progress */}
                    <div className={`text-[10px] font-black ${bText} flex justify-between mb-1`}>
                      <span>CURVE PROGRESS</span>
                      <span className="text-[#818CF8]">{t.progress}%</span>
                    </div>
                    <div className="text-[#6366F1] font-black text-[10px] tracking-widest w-full overflow-hidden">
                      [{'█'.repeat(Math.floor(t.progress / 5))}{'░'.repeat(20 - Math.floor(t.progress / 5))}]
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── ACTIVITY LOG ── */}
        {activeTab === "activity" && (
          <motion.div key="activity" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            
            {/* Filters */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {(["ALL", "TRADES", "LAUNCHES", "SOCIAL"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setActivityFilter(f)}
                  className={`px-3 py-1.5 text-xs font-black uppercase transition-all ${bBorder} ${
                    activityFilter === f
                      ? isDark ? "bg-[#6366F1] text-white shadow-[2px_2px_0px_0px_white]" : "bg-black text-white shadow-[2px_2px_0px_0px_#6366F1]"
                      : `${bBg} ${bText} hover:bg-gray-100 dark:hover:bg-gray-900`
                  }`}
                >
                  [ {f} ]
                </button>
              ))}
            </div>

            {/* Terminal Log View */}
            <div className={`w-full ${bBorder} ${bShadow} ${isDark ? "bg-[#05050A]" : "bg-[#1E1E1E]"} p-4 sm:p-6 text-[#10B981]`}>
              <div className="flex items-center gap-2 mb-4 border-b border-[#10B981]/30 pb-2">
                <Terminal className="w-5 h-5" />
                <span className="font-black text-sm">USER_ACTIVITY_LOG.SH</span>
              </div>
              <div className="space-y-3 text-xs sm:text-sm font-bold tracking-wide">
                {filteredActivity.map((item: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-[#10B981]/10 px-2 py-1 -mx-2">
                    <span className="text-[#818CF8] shrink-0">{item.time}</span>
                    <span className="text-gray-400 hidden sm:inline">|</span>
                    <span className={`px-1 font-black shrink-0 ${
                      item.type === "BUY" ? "bg-[#10B981] text-black" :
                      item.type === "SELL" ? "bg-[#F43F5E] text-white" :
                      item.type === "LAUNCH" ? "bg-[#8B5CF6] text-white" :
                      "bg-[#F59E0B] text-black"
                    }`}>
                      {item.type}
                    </span>
                    <span className="text-gray-300">
                      {item.desc} {item.amount && <span className={item.type === "BUY" ? "text-[#10B981]" : "text-[#F43F5E]"}>({item.amount})</span>}
                    </span>
                  </motion.div>
                ))}
                <div className="pt-4 text-gray-500 animate-pulse">_</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── BADGES ── */}
        {activeTab === "badges" && (
          <motion.div key="badges" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {ACHIEVEMENTS.map((ach, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex flex-col items-center p-4 text-center ${bBorder} ${ach.unlocked ? `${bShadow} ${bBg} ${bHoverShadow}` : `opacity-40 grayscale ${isDark ? "bg-[#050510]" : "bg-gray-100"}`}`}
                >
                  <div className={`text-4xl mb-3 ${ach.unlocked ? "" : "opacity-50"}`}>{ach.icon}</div>
                  <div className={`font-black text-xs uppercase mb-2 ${bText}`}>{ach.title}</div>
                  <div className={`text-[8px] font-black px-1.5 py-0.5 border w-full uppercase ${ach.unlocked ? (isDark ? "border-[rgba(255,255,255,0.2)] text-white" : "border-black text-black") : "border-gray-400 text-gray-400"}`} style={ach.unlocked ? { backgroundColor: `${ach.color}20`, borderColor: ach.color, color: isDark ? ach.color : 'black' } : {}}>
                    {ach.unlocked ? ach.rarity : "LOCKED"}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── AI ROAST ── */}
        {activeTab === "roast" && (
          <motion.div key="roast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className={`w-full max-w-2xl mx-auto ${bBorder} ${bShadow} ${bBg}`}>
              <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-[rgba(255,255,255,0.2)] bg-[#F43F5E]/10 text-[#F43F5E]" : "border-black bg-[#F43F5E] text-white"}`}>
                <span className="font-black flex items-center gap-2"><Flame className="w-5 h-5" /> SYS_DIAGNOSTIC // DEGEN_AUDIT.EXE</span>
              </div>
              <div className="p-6">
                {roastData ? (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                      <div className="flex-1">
                        <div className={`text-[10px] font-black uppercase ${bMuted}`}>[ IDENTIFIED PERSONA ]</div>
                        <div className={`text-2xl font-black uppercase ${bText} mt-1`}>{roastData.persona}</div>
                      </div>
                      <div className={`shrink-0 px-4 py-2 border ${isDark ? "border-[#F43F5E] bg-[#F43F5E]/10 text-[#F43F5E]" : "border-black bg-black text-white"} text-center`}>
                        <div className="text-3xl font-black">{roastData.portfolioScore}</div>
                        <div className="text-[9px] font-black uppercase tracking-widest">DEGEN SCORE</div>
                      </div>
                    </div>
                    
                    <div className={`p-4 border-l-4 ${isDark ? "border-[#F43F5E] bg-[#F43F5E]/5 text-white" : "border-black bg-gray-100 text-black"} text-sm font-bold uppercase leading-relaxed`}>
                      {">"} {roastData.roast}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className={`p-3 border ${isDark ? "border-[rgba(255,255,255,0.2)]" : "border-black"}`}>
                        <div className={`text-[10px] font-black uppercase ${bMuted}`}>WIN RATE</div>
                        <div className="text-xl font-black text-[#10B981]">{roastData.winRate}</div>
                      </div>
                      <div className={`p-3 border ${isDark ? "border-[rgba(255,255,255,0.2)]" : "border-black"}`}>
                        <div className={`text-[10px] font-black uppercase ${bMuted}`}>RUG COUNT</div>
                        <div className="text-xl font-black text-[#F43F5E]">{roastData.rugCount}x</div>
                      </div>
                    </div>

                    <button onClick={() => setRoastData(null)} className={`w-full py-3 border font-black uppercase text-xs transition-all ${isDark ? "border-[rgba(255,255,255,0.2)] text-gray-400 hover:text-white hover:bg-[rgba(255,255,255,0.05)]" : "border-black text-black hover:bg-gray-100"}`}>
                      [ RE-RUN DIAGNOSTIC ]
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <div className="text-6xl mb-6 opacity-80">💀</div>
                    <div className={`font-black text-lg mb-2 uppercase ${isDark ? "text-[#F43F5E]" : "text-black"}`}>WARNING: HIGH DEGEN DETECTED</div>
                    <p className={`text-xs font-bold uppercase ${bMuted} max-w-sm mx-auto mb-8`}>
                      Execute DEGEN_AUDIT.EXE to let the AI mercilessly roast your on-chain history and portfolio choices.
                    </p>
                    <button
                      onClick={handleRoast}
                      disabled={isRoasting}
                      className={`px-8 py-3 font-black text-sm uppercase transition-all ${bBorder} ${isDark ? "bg-[#F43F5E] text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]" : "bg-[#F43F5E] text-white shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000]"} disabled:opacity-50`}
                    >
                      {isRoasting ? "[ EXECUTING... ]" : "[ RUN ROAST ]"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
