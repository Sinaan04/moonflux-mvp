'use client';

import { Search, Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import { useMoonWallet } from '@/components/WalletProvider';
import { useWalletModal } from '@/components/SolanaProvider';
import { useTheme } from '@/components/ThemeProvider';
import Link from 'next/link';
import { SearchModal } from '@/components/SearchModal';
import LogoMark from '@/components/LogoMark';

function shortenAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function TopBar() {
  const { connected, address } = useMoonWallet();
  const { setModalOpen } = useWalletModal();
  const { theme, toggleTheme } = useTheme();
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const isDark = theme === 'dark';
  const borderColor = isDark ? 'rgba(255,255,255,0.2)' : '#000';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center px-4 sm:px-6 gap-4 font-sans backdrop-blur-2xl transition-all duration-300"
      style={{
        height: 64,
        backgroundColor: isDark ? 'rgba(3, 5, 12, 0.78)' : 'rgba(255, 255, 255, 0.85)',
        borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
        boxShadow: isDark ? '0 10px 30px -10px rgba(0, 0, 0, 0.5)' : '0 10px 30px -10px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* ── Logo ── */}
      <Link href="/" className="flex items-center gap-3 shrink-0 group mr-2 sm:mr-4">
        <LogoMark size={28} />
        <span
          className={`hidden sm:inline font-bold text-base tracking-[-0.03em] uppercase transition-all duration-200 ${isDark ? 'text-white group-hover:text-[#818CF8]' : 'text-slate-900 group-hover:text-[#6366F1]'}`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          MoonFluxx<span className="text-[#6366F1] font-black text-xs ml-0.5 tracking-normal">®</span>
        </span>
      </Link>

      {/* ── Search ── */}
      <div className="flex-1 flex justify-center">
        {/* Desktop search */}
        <div className="hidden md:flex relative w-full group/search" style={{ maxWidth: 440 }}>
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-hover/search:text-[#6366F1]"
            style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#64748B' }}
          />
          <input
            type="text"
            placeholder="Search tokens, pairs or contracts ( / )..."
            readOnly
            onClick={() => setSearchModalOpen(true)}
            className={`
              w-full h-9 pl-9 pr-14 font-sans text-xs tracking-normal rounded-xl cursor-pointer
              ${isDark 
                ? 'bg-white/[0.04] text-slate-200 border border-white/[0.08] hover:border-white/[0.18] placeholder-white/30 focus:border-[#6366F1]/60 focus:bg-white/[0.06]' 
                : 'bg-slate-100/80 text-slate-900 border border-slate-200/80 hover:border-slate-300 placeholder-slate-400 focus:border-[#6366F1]'}
              outline-none transition-all duration-200
            `}
          />
          <kbd
            className={`
              hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2
              text-[10px] font-mono font-black px-2 py-1 pointer-events-none
              ${isDark 
                ? 'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)] border border-[rgba(255,255,255,0.15)]' 
                : 'bg-gray-200 text-gray-500 border border-gray-300'}
            `}
          >
            ⌘K
          </kbd>
        </div>

        {/* Mobile search icon */}
        <div className="flex md:hidden items-center">
          <button
            onClick={() => setSearchModalOpen(true)}
            className={`
              flex items-center justify-center w-9 h-9
              ${isDark 
                ? 'bg-black text-[#6366F1] border-2 border-[rgba(255,255,255,0.2)] hover:border-[#6366F1]' 
                : 'bg-white text-[#6366F1] border-2 border-black hover:bg-[#6366F1] hover:text-white'}
              transition-all
            `}
            aria-label="Search"
          >
            <Search size={16} />
          </button>
        </div>
      </div>

      {/* ── Theme Toggle ── */}
      <button
        onClick={toggleTheme}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        className={`
          flex items-center justify-center w-9 h-9 rounded-xl shrink-0 transition-all duration-200
          ${isDark 
            ? 'bg-white/[0.04] text-slate-300 border border-white/[0.08] hover:bg-white/[0.08] hover:text-amber-400' 
            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200/80 hover:text-indigo-600'}
          active:scale-95
        `}
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* ── Wallet ── */}
      <div className="shrink-0">
        {connected && address ? (
          <button
            className={`
              flex items-center gap-2 h-9 px-3.5 rounded-xl font-mono text-xs font-semibold tracking-tight
              ${isDark 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20' 
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}
              transition-all duration-200 active:scale-95
            `}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {shortenAddr(address)}
          </button>
        ) : (
          <button
            onClick={() => setModalOpen(true)}
            className={`
              relative group/btn flex items-center justify-center h-9 px-4 rounded-xl font-sans text-xs font-bold tracking-tight
              text-white overflow-hidden shadow-lg transition-all duration-200 active:scale-95
            `}
            style={{
              background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              boxShadow: '0 4px 14px 0 rgba(99, 102, 241, 0.35)',
            }}
          >
            <span className="relative z-10 flex items-center gap-1.5">
              Connect Wallet
            </span>
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      <SearchModal open={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </header>
  );
}
