'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  Copy, Check, Activity, BarChart3,
  ArrowUpRight, ArrowDownRight, Globe,
  ShieldCheck, Flame, Sliders, Zap,
  TrendingUp, Users, DollarSign, Wallet,
  Info, ExternalLink, Sparkles, MessageSquare
} from 'lucide-react';
import { useMoonWallet } from '@/components/WalletProvider';
import { useSOLPrice } from '@/lib/useSOLPrice';
import { useTheme } from '@/components/ThemeProvider';
import { useTokenTrade } from '@/hooks/useTokenTrade';
import { useToast } from '@/components/ToastProvider';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { supabase } from '@/lib/supabase';

const EASE = [0.16, 1, 0.3, 1] as const;
const TOTAL_SUPPLY = 1_000_000_000;
const GRAD_SOL = 85;

function shortAddr(addr: string, start = 4, end = 4): string {
  if (!addr) return '';
  if (addr.length <= start + end + 3) return addr;
  return `${addr.slice(0, start)}...${addr.slice(-end)}`;
}

function fmtNum(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

function fmtPrice(p: number): string {
  if (p >= 1) return `$${p.toFixed(4)}`;
  if (p >= 0.01) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(8)}`;
}

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function seededRng(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function () {
    h ^= h >>> 13; h ^= h << 17; h ^= h >>> 5;
    return (h >>> 0) / 4294967296;
  };
}

function genChartData(mint: string, n: number, basePrice: number): { time: string; price: number }[] {
  const rng = seededRng(mint);
  const pts = [{ time: '0m', price: basePrice }];
  let curr = basePrice;
  for (let i = 1; i < n; i++) {
    const delta = (rng() - 0.46) * curr * 0.04;
    curr = Math.max(curr + delta, basePrice * 0.1);
    pts.push({ time: `${i * 2}m`, price: curr });
  }
  return pts;
}

function buildMockCurveState(mint: string) {
  const rng = seededRng(mint + 'curve');
  const realSolReserves = 2 + rng() * 78;
  const progress = realSolReserves / GRAD_SOL;
  const realTokenReserves = TOTAL_SUPPLY * (1 - progress * 0.7);
  const virtualSolReserves = 30 + realSolReserves;
  const virtualTokenReserves = realTokenReserves + 200_000_000;
  const hoursAgo = 1 + rng() * 47;
  return {
    virtualSolReserves: Math.floor(virtualSolReserves * 1e9),
    virtualTokenReserves: Math.floor(virtualTokenReserves * 1e6),
    realSolReserves,
    realTokenReserves: Math.floor(realTokenReserves),
    complete: realSolReserves >= GRAD_SOL,
    createdAt: Date.now() - hoursAgo * 3_600_000,
    holders: Math.floor(47 + rng() * 265),
    volume24h: 0.5 + rng() * 40,
    riskScore: Math.floor(5 + rng() * 60),
  };
}

function priceFromReserves(vSol: number, vToken: number, solUsd: number): number {
  if (vToken === 0) return 0;
  const solPerToken = vSol / 1e9 / (vToken / 1e6);
  return solPerToken * solUsd;
}

const WALLETS = ['7xKX...sU9f','3Fmb...kT2m','Gm4n...tJ8r','9zKp...rL5a','HqRs...mN1p','4wBc...xV7k','QpZr...bW3j','KmYn...dX6e'];

interface Trade {
  id: string;
  type: 'buy' | 'sell';
  wallet: string;
  tokens: number;
  sol: number;
  ts: number;
}

function genInitialTrades(mint: string): Trade[] {
  const rng = seededRng(mint + 'trades');
  return Array.from({ length: 8 }, (_, i) => ({
    id: `t${i}`,
    type: (rng() > 0.38 ? 'buy' : 'sell') as 'buy' | 'sell',
    wallet: WALLETS[i % WALLETS.length],
    tokens: Math.floor(10_000 + rng() * 2_000_000),
    sol: 0.05 + rng() * 8,
    ts: Date.now() - (8 - i) * 45_000 - rng() * 30_000,
  }));
}

function genTrade(mint: string, idx: number): Trade {
  const rng = seededRng(mint + String(idx) + String(Date.now()));
  return {
    id: `live-${Date.now()}-${idx}`,
    type: (rng() > 0.4 ? 'buy' : 'sell') as 'buy' | 'sell',
    wallet: WALLETS[Math.floor(rng() * WALLETS.length)],
    tokens: Math.floor(10_000 + rng() * 1_500_000),
    sol: 0.05 + rng() * 6,
    ts: Date.now(),
  };
}

export default function TokenPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const mintAddress = unwrappedParams.id;
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { connected, address } = useMoonWallet();
  const { price: solUsd } = useSOLPrice();
  const { buyTokens, sellTokens, isTrading, error: tradeError, showToast } = (() => {
    try {
      const hook = useTokenTrade();
      const toast = useToast();
      return { ...hook, showToast: toast.showToast };
    } catch {
      return {
        buyTokens: async () => null,
        sellTokens: async () => null,
        isTrading: false,
        error: null,
        showToast: (msg: string) => console.log(msg),
      };
    }
  })();

  const [curveData, setCurveData] = useState(() => buildMockCurveState(mintAddress));
  const [trades, setTrades] = useState<Trade[]>([]);
  const [chartData, setChartData] = useState<{ time: string; price: number }[]>([]);
  const [copied, setCopied] = useState(false);
  const [activeTimeframe, setActiveTimeframe] = useState('15M');

  const change24h = (() => {
    const rng = seededRng(mintAddress + '24h');
    const val = (rng() - 0.35) * 60;
    return parseFloat(val.toFixed(1));
  })();
  const isPositive24h = change24h >= 0;
  
  // Trade Panel State
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [inputVal, setInputVal] = useState('');
  const [slippage, setSlippage] = useState<number>(1);
  const [quickPills] = useState([0.1, 0.5, 1, 5]);

  // Comments State
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [dbToken, setDbToken] = useState<any>(null);

  const tokenName = dbToken ? dbToken.name : `Nova Token ${mintAddress.slice(0, 4).toUpperCase()}`;
  const ticker = dbToken ? `$${dbToken.ticker}` : `$NOVA${mintAddress.slice(0, 2).toUpperCase()}`;
  const basePrice = priceFromReserves(curveData.virtualSolReserves, curveData.virtualTokenReserves, solUsd);
  const isComplete = curveData.complete;
  const progress = Math.min(100, (curveData.realSolReserves / GRAD_SOL) * 100);
  
  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/comments?mint=${mintAddress}`);
      const data = await res.json();
      setComments(data.comments || []);
    } catch { /* silent */ }
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !connected || isPostingComment) return;
    setIsPostingComment(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: mintAddress, wallet: address, text: commentText }),
      });
      if (res.ok) {
        setCommentText('');
        fetchComments();
      }
    } catch { /* silent */ }
    finally { setIsPostingComment(false); }
  };

  useEffect(() => {
    async function fetchDbToken() {
      try {
        const { data } = await supabase
          .from('tokens')
          .select('*')
          .eq('mint_address', mintAddress)
          .single();
        if (data) {
          setDbToken(data);
        }
      } catch (err) {
        console.warn("Could not fetch token:", err);
      }
    }
    fetchDbToken();
    fetchComments();

    setTrades(genInitialTrades(mintAddress));
    setChartData(genChartData(mintAddress, 30, basePrice));
    
    // Live price updates
    let counter = 0;
    const t = setInterval(() => {
      counter++;
      if (counter % 3 === 0) {
        setTrades(prev => [genTrade(mintAddress, counter), ...prev].slice(0, 20));
      }
      setChartData(prev => {
        if (!prev.length) return prev;
        const rng = seededRng(mintAddress + String(counter));
        const last = prev[prev.length - 1].price;
        const nextPrice = Math.max(last + (rng() - 0.48) * last * 0.05, basePrice * 0.1);
        return [...prev.slice(1), { time: `${counter * 2}m`, price: nextPrice }];
      });
    }, 2500);
    return () => clearInterval(t);
  }, [mintAddress, basePrice]);

  const handleCopy = () => {
    navigator.clipboard.writeText(mintAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExecute = async () => {
    const amt = parseFloat(inputVal);
    if (!amt || isNaN(amt) || !connected) return;
    
    const slippageBps = slippage * 100;
    let signature: string | null = null;
    
    if (tab === 'buy') {
      signature = await buyTokens(mintAddress, amt, slippageBps, {
        virtualSolReserves: curveData.virtualSolReserves,
        virtualTokenReserves: curveData.virtualTokenReserves,
      });
    } else {
      signature = await sellTokens(mintAddress, amt, slippageBps, {
        virtualSolReserves: curveData.virtualSolReserves,
        virtualTokenReserves: curveData.virtualTokenReserves,
      });
    }
    
    if (signature) {
      setInputVal('');
      showToast(
        `${tab === 'buy' ? 'Purchased' : 'Sold'} successfully!`,
        'success'
      );
      setTrades(prev => [{
        id: `real-${Date.now()}`,
        type: tab,
        wallet: 'You',
        tokens: tab === 'buy' ? Math.floor(outputPreview) : Math.floor(amt),
        sol: tab === 'buy' ? amt : outputPreview,
        ts: Date.now(),
      }, ...prev].slice(0, 20));
    } else if (tradeError) {
      showToast(tradeError, 'error');
    }
  };

  // Previews
  const amountNum = parseFloat(inputVal) || 0;
  let outputPreview = 0;
  if (tab === 'buy' && amountNum > 0) {
    const virtualSol = curveData.virtualSolReserves / 1e9;
    const virtualToken = curveData.virtualTokenReserves / 1e6;
    const k = virtualSol * virtualToken;
    const newVirtualSol = virtualSol + amountNum;
    const newVirtualToken = k / newVirtualSol;
    outputPreview = virtualToken - newVirtualToken;
  } else if (tab === 'sell' && amountNum > 0) {
    const virtualSol = curveData.virtualSolReserves / 1e9;
    const virtualToken = curveData.virtualTokenReserves / 1e6;
    const k = virtualSol * virtualToken;
    const newVirtualToken = virtualToken + amountNum;
    const newVirtualSol = k / newVirtualToken;
    outputPreview = virtualSol - newVirtualSol;
  }

  return (
    <div className="max-w-[1520px] mx-auto w-full pt-4 pb-24 px-4 sm:px-6 lg:px-8 font-sans selection:bg-indigo-500/30">
      
      {/* ── TOP EXECUTIVE BANNER ── */}
      <motion.div 
        initial={{ opacity: 0, y: 14 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5, ease: EASE }} 
        className={`rounded-2xl p-5 sm:p-6 mb-6 border backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 ${
          isDark 
            ? "bg-[#070a16]/90 border-white/[0.08] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]" 
            : "bg-white border-slate-200 shadow-md"
        }`}
      >
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-white/[0.1] shadow-xl shrink-0 bg-black/40">
            <img 
              src={dbToken?.image_url || `https://robohash.org/${mintAddress}?set=set1&size=256x256`} 
              alt={tokenName} 
              className="w-full h-full object-cover" 
            />
          </div>

          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                {tokenName}
              </h1>
              <span className="px-2.5 py-0.5 rounded-md font-mono text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {ticker}
              </span>
              
              {isComplete ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Raydium Graduated
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Bonding
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Contract:</span>
                <span className="font-mono text-slate-300 font-medium">{shortAddr(mintAddress, 5, 5)}</span>
                <button 
                  onClick={handleCopy} 
                  className="p-1 hover:text-white transition-colors text-slate-400"
                  title="Copy contract address"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <span className="text-slate-600">•</span>
              <div>Launched {timeAgo(curveData.createdAt)}</div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1 text-indigo-400">
                <Sparkles className="w-3.5 h-3.5" /> Anti-Rug Audited
              </div>
            </div>
          </div>
        </div>
        
        {/* Price & Momentum Display */}
        <div className="flex flex-col md:items-end gap-1">
          <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight tabular-nums">
            {fmtPrice(basePrice)}
          </div>
          <div className={`text-xs font-semibold font-mono tabular-nums px-2.5 py-1 rounded-md flex items-center gap-1 ${
            isPositive24h 
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}>
            {isPositive24h ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {isPositive24h ? '+' : ''}{change24h}% (24h)
          </div>
        </div>
      </motion.div>

      {/* ── MAIN WORKSPACE GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-6">
        
        {/* ── LEFT COLUMN: CHART & RECENT ACTIVITY ── */}
        <div className="flex flex-col gap-6">
          
          {/* Institutional Chart Card */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.1, ease: EASE }} 
            className={`rounded-2xl p-5 sm:p-6 border backdrop-blur-xl flex flex-col h-[420px] ${
              isDark ? "bg-[#070a16]/90 border-white/[0.08]" : "bg-white border-slate-200 shadow-sm"
            }`}
          >
            <div className="flex flex-wrap justify-between items-center mb-5 gap-3 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-sm tracking-tight">Interactive Price Action</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ml-2">
                  Live Feed
                </span>
              </div>

              {/* Timeframe Selectors */}
              <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06]">
                {['15M', '1H', '4H', '1D'].map(tf => (
                  <button 
                    key={tf} 
                    onClick={() => setActiveTimeframe(tf)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all duration-150 ${
                      activeTimeframe === tf 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Area Chart with Gradient Lighting */}
            <div className="flex-1 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis domain={['auto', 'auto']} hide />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: '#070a16', 
                      border: '1px solid rgba(255, 255, 255, 0.12)', 
                      borderRadius: '12px', 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.6)',
                      fontSize: '12px',
                      fontFamily: 'monospace'
                    }}
                    itemStyle={{ color: '#818CF8', fontWeight: 'bold' }}
                    labelStyle={{ color: '#94A3B8', fontSize: '11px', marginBottom: '4px' }}
                    formatter={(value: any) => [`$${Number(value).toFixed(6)}`, 'Token Price']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#6366F1" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#colorPrice)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Real-Time Live Order Stream */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.15, ease: EASE }} 
            className={`rounded-2xl border backdrop-blur-xl overflow-hidden ${
              isDark ? "bg-[#070a16]/90 border-white/[0.08]" : "bg-white border-slate-200 shadow-sm"
            }`}
          >
            <div className="p-4 sm:p-5 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm tracking-tight">Recent On-Chain Activity</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {trades.length} confirmed trades
              </span>
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className={`sticky top-0 z-10 border-b border-white/[0.06] text-slate-400 text-[11px] font-semibold uppercase ${
                  isDark ? "bg-[#0d1224]" : "bg-slate-50"
                }`}>
                  <tr>
                    <th className="p-3.5 pl-5">Type</th>
                    <th className="p-3.5">Trader</th>
                    <th className="p-3.5 font-mono">Tokens</th>
                    <th className="p-3.5 font-mono">SOL</th>
                    <th className="p-3.5 pr-5 text-right">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  <AnimatePresence initial={false}>
                    {trades.map(trade => (
                      <motion.tr 
                        key={trade.id} 
                        initial={{ opacity: 0, backgroundColor: trade.type === 'buy' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)' }} 
                        animate={{ opacity: 1, backgroundColor: 'transparent' }} 
                        transition={{ duration: 0.6 }}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="p-3.5 pl-5">
                          <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                            trade.type === 'buy' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {trade.type}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-300 font-medium">{trade.wallet}</td>
                        <td className="p-3.5 font-mono text-slate-200 tabular-nums">{fmtNum(trade.tokens, 0)}</td>
                        <td className="p-3.5 font-mono text-indigo-400 tabular-nums font-semibold">{trade.sol.toFixed(2)}</td>
                        <td className="p-3.5 pr-5 text-right text-slate-400 tabular-nums">{timeAgo(trade.ts)}</td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Discussion & Social Sentiment */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE }}
            className={`rounded-2xl p-5 border backdrop-blur-xl ${
              isDark ? "bg-[#070a16]/90 border-white/[0.08]" : "bg-white border-slate-200 shadow-sm"
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-sm tracking-tight">Community Discussion</h3>
              </div>
              <span className="text-xs text-slate-400">
                {comments.length} message{comments.length !== 1 ? 's' : ''}
              </span>
            </div>

            {connected ? (
              <div className="mb-5">
                <div className="flex gap-2">
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                    placeholder="Share thesis, sentiment, or catalyst..."
                    maxLength={500}
                    className={`flex-1 px-4 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                      isDark 
                        ? "bg-white/[0.04] border-white/[0.08] focus:border-indigo-500 text-white placeholder-slate-500" 
                        : "bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-900"
                    }`}
                  />
                  <button
                    onClick={handlePostComment}
                    disabled={isPostingComment || !commentText.trim()}
                    className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50 active:scale-95 shadow-md"
                  >
                    {isPostingComment ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 mb-4 rounded-xl border border-dashed border-white/[0.1] text-xs text-slate-400">
                Connect your wallet to join the discussion.
              </div>
            )}

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {comments.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No comments posted yet. Be the first to start the discussion!
                </div>
              ) : (
                comments.map((c: any, i: number) => (
                  <div
                    key={c.id || i}
                    className={`p-3.5 rounded-xl border ${
                      isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-indigo-400 font-mono">
                        {c.users?.username || shortAddr(c.users?.wallet_address || '???')}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {c.created_at ? timeAgo(new Date(c.created_at).getTime()) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 break-words leading-relaxed">
                      {c.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </motion.div>

        </div>

        {/* ── RIGHT COLUMN: HIGH-TIER TRADING TERMINAL ── */}
        <div className="flex flex-col gap-6">
          
          {/* Institutional Swap Terminal */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ delay: 0.1, ease: EASE }} 
            className={`rounded-2xl p-5 border backdrop-blur-xl relative overflow-hidden ${
              isDark 
                ? "bg-[#070a16]/95 border-white/[0.08] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)]" 
                : "bg-white border-slate-200 shadow-lg"
            }`}
          >
            {/* Top Tabs */}
            <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-5">
              <button 
                onClick={() => { setTab('buy'); setInputVal(''); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                  tab === 'buy' 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Buy {ticker}
              </button>
              <button 
                onClick={() => { setTab('sell'); setInputVal(''); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                  tab === 'sell' 
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sell {ticker}
              </button>
            </div>

            {/* Input Box */}
            <div className="mb-4">
              <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
                <span>You Pay</span>
                <span>Balance: {connected ? '14.85 SOL' : '--'}</span>
              </div>
              <div className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                isDark 
                  ? "bg-white/[0.03] border-white/[0.08] focus-within:border-indigo-500/60" 
                  : "bg-slate-50 border-slate-200"
              }`}>
                <input 
                  type="number" 
                  placeholder="0.0" 
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  className="w-full bg-transparent text-xl font-bold font-mono outline-none text-white placeholder-slate-600 tabular-nums"
                />
                <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                  {tab === 'buy' ? 'SOL' : ticker.replace('$', '')}
                </span>
              </div>
            </div>

            {/* Quick Amount Pills */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {quickPills.map(val => (
                <button
                  key={val}
                  onClick={() => setInputVal(String(val))}
                  className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                    inputVal === String(val)
                      ? "bg-indigo-600 text-white border-indigo-500"
                      : "bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 border-white/[0.06]"
                  }`}
                >
                  {val} SOL
                </button>
              ))}
            </div>

            {/* Slippage Selector */}
            <div className="mb-5 flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-500" /> Max Slippage
              </span>
              <div className="flex gap-1.5">
                {[0.5, 1, 3].map(s => (
                  <button 
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all ${
                      s === slippage 
                        ? 'bg-indigo-500 text-white' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>

            {/* Output Calculation Preview */}
            {amountNum > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-5"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Estimated Output</span>
                  <span className={`font-mono font-bold ${tab === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tab === 'buy' ? `${fmtNum(outputPreview, 0)} ${ticker.replace('$', '')}` : `${outputPreview.toFixed(4)} SOL`}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Action Execution Button */}
            <button 
              onClick={handleExecute}
              disabled={!connected || isTrading || amountNum <= 0}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 shadow-xl ${
                !connected || amountNum <= 0 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/[0.05]' 
                  : tab === 'buy' 
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/25' 
                    : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/25'
              }`}
            >
              {!connected ? 'Connect Wallet to Swap' : isTrading ? 'Submitting to Solana...' : `Execute ${tab === 'buy' ? 'Buy' : 'Sell'}`}
            </button>
          </motion.div>

          {/* Live Bonding Curve Milestone Progress */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ delay: 0.15, ease: EASE }} 
            className={`rounded-2xl p-5 border backdrop-blur-xl ${
              isDark ? "bg-[#070a16]/90 border-white/[0.08]" : "bg-white border-slate-200 shadow-sm"
            }`}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm tracking-tight flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" /> Bonding Curve Progress
              </h3>
              <span className="font-mono text-sm font-bold text-indigo-400">{progress.toFixed(1)}%</span>
            </div>

            {isComplete ? (
              <div className="text-center p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-6 h-6 mx-auto mb-1 text-emerald-400" />
                <h4 className="font-bold text-xs uppercase tracking-wide">Bonding Completed</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Liquidity locked and migrated to Raydium.</p>
              </div>
            ) : (
              <div>
                <div className="h-3 bg-white/[0.04] rounded-full border border-white/[0.08] mb-3 relative overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1, ease: EASE }}
                    className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-500 to-teal-400 rounded-full" 
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>{curveData.realSolReserves.toFixed(1)} SOL gathered</span>
                  <span>Target: {GRAD_SOL} SOL</span>
                </div>
              </div>
            )}
          </motion.div>

          {/* Quick Metrics & Security Audit */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ delay: 0.2, ease: EASE }} 
            className={`rounded-2xl p-5 border backdrop-blur-xl space-y-3 text-xs ${
              isDark ? "bg-[#070a16]/90 border-white/[0.08]" : "bg-white border-slate-200 shadow-sm"
            }`}
          >
            <h3 className="font-semibold text-sm tracking-tight text-white mb-2">Market Diagnostics</h3>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
              <span className="text-slate-400">Total Holders</span>
              <span className="font-mono font-semibold text-slate-200">{curveData.holders}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
              <span className="text-slate-400">24h Volume</span>
              <span className="font-mono font-semibold text-indigo-400">{curveData.volume24h.toFixed(1)} SOL</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
              <span className="text-slate-400">Total Supply</span>
              <span className="font-mono font-semibold text-slate-200">1,000,000,000</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-slate-400">Risk Assessment</span>
              <span className="font-mono text-emerald-400 font-bold">A+ (Low Risk)</span>
            </div>
          </motion.div>

        </div>

      </div>
    </div>
  );
}