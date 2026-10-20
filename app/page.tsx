"use client";

import { motion } from "framer-motion";
import { TrendingUp, Rocket, Search, Zap, Radio, Sparkles, ShieldCheck, BarChart2, ArrowUpRight, Flame } from "lucide-react";
import Link from "next/link";
import { useMoonWallet } from "@/components/WalletProvider";
import { useTheme } from '@/components/ThemeProvider';
import { LineChart, Line, ResponsiveContainer } from "recharts";

const EASE = [0.16, 1, 0.3, 1] as const;

// Helper to convert array of numbers into recharts object format
const formatSparkline = (data: number[]) => data.map((val, i) => ({ x: i, y: val }));

// Helper to generate unique meme/crypto character images
const getMemeImage = (ticker: string) => {
  const sets = ['set1', 'set2', 'set3', 'set4'];
  const set = sets[ticker.length % 4];
  return `https://robohash.org/${ticker.toLowerCase()}?set=${set}&bgset=bg1&size=400x400`;
};

export default function HomePage() {
  const { connected } = useMoonWallet();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const MOCK_TRENDING = [
    { id:'tok_ai_swarm', name:'AI Swarm', ticker:'SWRM', change:+211.4, price:'$0.00671', category:'AI', color:'#F43F5E', marketCap:2300000, riskScore:5, holders:4821, progress:85, sparkline:[5,8,12,15,14,18,25,32,28,40,55,70,90,85,110], isLive: true },
    { id:'tok_degen_ape', name:'DegenApe', ticker:'DAPE', change:+388.2, price:'$0.00156', category: 'TOKEN', color:'#6366F1', marketCap:970000, riskScore:9, holders:2109, progress:60, sparkline:[2,3,4,5,6,10,15,12,20,30,25,40,60,50,80], isLive: false },
    { id:'tok_nova_flux', name:'NovaFlux', ticker:'NVFX', change:+67.8, price:'$0.0445', category:'DEFI', color:'#10B981', marketCap:8900000, riskScore:3, holders:11432, progress:100, sparkline:[30,35,38,42,48,52,58,65,70,68,75,80,90,95,100], isLive: false },
    { id:'tok_rwa_king', name:'RWA King', ticker:'RWAK', change:+18.9, price:'$2.34', category:'RWA', color:'#8B5CF6', marketCap:45000000, riskScore:1, holders:23450, progress:100, sparkline:[60,62,65,68,70,72,75,78,80,82,85,88,90,92], isLive: true },
  ];

  const MOCK_LAUNCHES = [
    { id:'tok_luna_doge', name:'Luna Doge', ticker:'LDOGE', creator:'@moondev', timeAgo:'2h ago', progress:73, color:'#F59E0B', change:+142.5, price:'$0.00234', marketCap:1870000, riskScore:3, sparkline:[8,12,19,25,31,44,52,71,65,89,95,120,110,140] },
    { id:'tok_pixel_cat', name:'PixelCat', ticker:'PCAT', creator:'@pixelwiz', timeAgo:'4h ago', progress:31, color:'#8B5CF6', change:-5.4, price:'$0.00329', marketCap:1100000, riskScore:6, sparkline:[50,48,45,46,44,42,40,41,39,37,35,33,34,32] },
    { id:'tok_storm_cat', name:'StormCat', ticker:'STMC', creator:'@stormking', timeAgo:'6h ago', progress:18, color:'#F43F5E', change:-23.1, price:'$0.00082', marketCap:440000, riskScore:8, sparkline:[80,75,70,65,60,55,68,72,65,58,50,45,48,42] },
    { id:'tok_void_inu', name:'Void Inu', ticker:'VINU', creator:'@void_walker', timeAgo:'30m ago', progress:25, color:'#475569', change:-12.7, price:'$0.00045', marketCap:890000, riskScore:7, sparkline:[100,95,88,80,75,70,68,65,72,69,60,55,52,50] },
  ];

  const formatCompact = (num: number) => new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);

  return (
    <div className="w-full pb-24 overflow-x-hidden selection:bg-indigo-500/30">
      
      {/* ── LIVE AMBIENT TICKER ──────────────────────────────────────────────── */}
      <div className={`w-full overflow-hidden border-b backdrop-blur-xl ${isDark ? "border-white/[0.06] bg-indigo-950/20 text-indigo-300" : "border-slate-200/80 bg-indigo-50/70 text-indigo-950"}`}>
        <div className="flex whitespace-nowrap py-2 text-[11px] font-sans font-medium tracking-wide">
          <div className="flex items-center gap-8 animate-marquee">
            <span className="flex items-center gap-2 font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Bonding Curve Live: $ASTROCAT reached 85%
            </span>
            <span className="text-white/30">•</span>
            <span className="flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              12.4 SOL Buy detected on $LDOGE
            </span>
            <span className="text-white/30">•</span>
            <span className="text-indigo-400 font-semibold">
              AI Swarm 24h Volume +312%
            </span>
            <span className="text-white/30">•</span>
            <span className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              Audited Smart Contract Execution
            </span>
            <span className="text-white/30">•</span>
            <span className="flex items-center gap-2 font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Bonding Curve Live: $ASTROCAT reached 85%
            </span>
            <span className="text-white/30">•</span>
            <span className="flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              12.4 SOL Buy detected on $LDOGE
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── HERO SECTION ── */}
        <motion.section 
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className={`mt-6 mb-12 rounded-3xl p-8 sm:p-14 md:p-20 relative overflow-hidden text-center flex flex-col items-center justify-center border ${
            isDark 
              ? "bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(99,102,241,0.18),rgba(3,5,12,0.95))] border-white/[0.08] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8)]" 
              : "bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(99,102,241,0.12),rgba(255,255,255,0.9))] border-slate-200/90 shadow-[0_20px_50px_-15px_rgba(99,102,241,0.1)]"
          }`}
        >
          {/* Subtle noise/grid backdrop */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

          {/* Pill Badge */}
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium tracking-tight mb-6 backdrop-blur-md border ${
              isDark 
                ? "bg-white/[0.05] border-white/[0.12] text-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.15)]" 
                : "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Next-Gen Solana Launchpad & Liquidity Engine</span>
          </motion.div>
          
          {/* Main Title with Custom Display Typography */}
          <h1 
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-[-0.035em] leading-[1.05] mb-6 max-w-5xl text-balance"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Launch & Trade Verified Tokens in{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-teal-300 bg-clip-text text-transparent">
              Seconds.
            </span>
          </h1>
          
          {/* Subtitle */}
          <p className={`text-base sm:text-lg md:text-xl font-normal tracking-normal max-w-2xl mb-10 text-balance leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Fair bonding curves, algorithmic anti-rug protection, and institutional-grade real-time market execution on Solana.
          </p>
          
          {/* Call to Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto relative z-10">
            <Link 
              href="/explore" 
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl font-sans font-semibold text-sm text-white shadow-xl hover:shadow-indigo-500/25 transition-all duration-200 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              }}
            >
              <Search className="w-4 h-4" />
              <span>Explore Markets</span>
            </Link>

            <Link 
              href="/launch" 
              className={`w-full sm:w-auto flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl font-sans font-semibold text-sm transition-all duration-200 active:scale-95 border ${
                isDark 
                  ? "bg-white/[0.04] hover:bg-white/[0.08] text-slate-100 border-white/[0.12] hover:border-white/[0.25]" 
                  : "bg-white hover:bg-slate-50 text-slate-900 border-slate-200 shadow-sm"
              }`}
            >
              <Rocket className="w-4 h-4 text-emerald-400" />
              <span>Launch a Token</span>
            </Link>
          </div>
        </motion.section>

        {/* ── METRICS STRIP ── */}
        <motion.section 
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
          className={`grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl p-2 mb-14 border ${
            isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-100/60 border-slate-200/80"
          }`}
        >
          <div className={`flex flex-col items-center justify-center p-6 rounded-xl border ${isDark ? "bg-[#070a16]/80 border-white/[0.05]" : "bg-white border-slate-200/60 shadow-sm"}`}>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono tabular-nums bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              $4.2M
            </div>
            <div className={`text-xs font-medium tracking-wide mt-1.5 uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              24h Trading Volume
            </div>
          </div>

          <div className={`flex flex-col items-center justify-center p-6 rounded-xl border ${isDark ? "bg-[#070a16]/80 border-white/[0.05]" : "bg-white border-slate-200/60 shadow-sm"}`}>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono tabular-nums bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              12,847
            </div>
            <div className={`text-xs font-medium tracking-wide mt-1.5 uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Active Wallets
            </div>
          </div>

          <div className={`flex flex-col items-center justify-center p-6 rounded-xl border ${isDark ? "bg-[#070a16]/80 border-white/[0.05]" : "bg-white border-slate-200/60 shadow-sm"}`}>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono tabular-nums bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              2,341
            </div>
            <div className={`text-xs font-medium tracking-wide mt-1.5 uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Graduated Tokens
            </div>
          </div>
        </motion.section>

        {/* ── TRENDING TOKENS ── */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                <TrendingUp className="text-rose-400 w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                  Trending Markets
                </h2>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  High momentum bonding curves & breakout volume
                </p>
              </div>
            </div>

            <Link 
              href="/explore" 
              className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                isDark 
                  ? "border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06]" 
                  : "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              View All <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MOCK_TRENDING.map((t, i) => {
              const isPos = t.change >= 0;
              const sparkColor = isPos ? "#10B981" : "#F43F5E";

              return (
                <Link href={`/token/${t.id}`} key={t.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, ease: EASE }}
                    className={`group rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col h-full cursor-pointer hover:-translate-y-1 ${
                      isDark 
                        ? "bg-[#070a16]/90 border-white/[0.08] hover:border-indigo-500/40 hover:shadow-[0_12px_32px_-8px_rgba(99,102,241,0.2)]" 
                        : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-xl"
                    }`}
                  >
                    {/* Visual Artwork & Live Sparkline */}
                    <div className="relative w-full aspect-video overflow-hidden bg-black/40">
                      <img 
                        src={getMemeImage(t.ticker)} 
                        alt={t.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      
                      {t.isLive && (
                        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-rose-500/90 text-white text-[10px] font-bold tracking-tight backdrop-blur-md flex items-center gap-1 z-10 shadow-lg">
                          <Radio className="w-2.5 h-2.5 animate-pulse" /> Live
                        </div>
                      )}

                      <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-emerald-400 text-[10px] font-mono font-semibold border border-emerald-500/30 z-10">
                        {t.progress}% Curve
                      </div>

                      {/* Chart Overlay */}
                      <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none opacity-85 group-hover:opacity-100 transition-opacity">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={formatSparkline(t.sparkline)}>
                            <Line type="monotone" dataKey="y" stroke={sparkColor} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Token Metadata */}
                    <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-sm tracking-tight truncate group-hover:text-indigo-400 transition-colors">
                            {t.name}
                          </h3>
                          <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md ${
                            isDark ? "bg-white/[0.06] text-slate-300" : "bg-slate-100 text-slate-700"
                          }`}>
                            ${t.ticker}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          MCap: <span className="font-mono text-slate-200 font-medium">${formatCompact(t.marketCap)}</span>
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between pt-2 border-t border-white/[0.06]">
                        <span className="text-base font-bold font-mono tracking-tight tabular-nums">
                          {t.price}
                        </span>
                        <span className={`text-xs font-semibold font-mono tabular-nums px-2 py-0.5 rounded-md ${
                          isPos 
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}>
                          {isPos ? "+" : ""}{t.change}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── NEW LAUNCHES ── */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Zap className="text-amber-400 w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                  Just Launched
                </h2>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Recently deployed tokens looking for early bonding contributors
                </p>
              </div>
            </div>

            <Link 
              href="/explore" 
              className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                isDark 
                  ? "border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06]" 
                  : "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Explore All <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MOCK_LAUNCHES.map((t, i) => {
              const isPos = t.change >= 0;
              const sparkColor = isPos ? "#10B981" : "#F43F5E";

              return (
                <Link href={`/token/${t.id}`} key={t.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, ease: EASE }}
                    className={`group rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col h-full cursor-pointer hover:-translate-y-1 ${
                      isDark 
                        ? "bg-[#070a16]/90 border-white/[0.08] hover:border-amber-500/40 hover:shadow-[0_12px_32px_-8px_rgba(245,158,11,0.15)]" 
                        : "bg-white border-slate-200 hover:border-amber-300 hover:shadow-xl"
                    }`}
                  >
                    <div className="relative w-full aspect-video overflow-hidden bg-black/40">
                      <img 
                        src={getMemeImage(t.ticker)} 
                        alt={t.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold tracking-tight backdrop-blur-md shadow-lg">
                        New
                      </div>
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-amber-400 text-[10px] font-mono font-semibold border border-amber-500/30 z-10">
                        {t.progress}% Curve
                      </div>

                      <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none opacity-85 group-hover:opacity-100 transition-opacity">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={formatSparkline(t.sparkline)}>
                            <Line type="monotone" dataKey="y" stroke={sparkColor} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-sm tracking-tight truncate group-hover:text-amber-400 transition-colors">
                            {t.name}
                          </h3>
                          <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md ${
                            isDark ? "bg-white/[0.06] text-slate-300" : "bg-slate-100 text-slate-700"
                          }`}>
                            ${t.ticker}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                          <span>By {t.creator}</span>
                          <span className="text-slate-500">{t.timeAgo}</span>
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between pt-2 border-t border-white/[0.06]">
                        <span className="text-base font-bold font-mono tracking-tight tabular-nums">
                          {t.price}
                        </span>
                        <span className={`text-xs font-semibold font-mono tabular-nums px-2 py-0.5 rounded-md ${
                          isPos 
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}>
                          {isPos ? "+" : ""}{t.change}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </section>

      </div>
      
      {/* ── FOOTER ── */}
      <footer className={`border-t backdrop-blur-xl mt-24 py-12 px-6 sm:px-12 ${
        isDark ? "border-white/[0.08] bg-[#03050c]/80 text-slate-400" : "border-slate-200 bg-white text-slate-600"
      }`}>
        <div className="max-w-[1520px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-base tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }}>
              MoonFluxx
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              v1.0 Production
            </span>
          </div>

          <div className="flex items-center gap-8 text-xs font-medium">
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Twitter</a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord</a>
            <a href="/docs" className="hover:text-white transition-colors">Documentation</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
      
    </div>
  );
}
