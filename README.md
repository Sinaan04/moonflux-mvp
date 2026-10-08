# MoonFluxx — Web App

Frontend and backend (API routes) for the MoonFluxx Solana token launchpad.

> **Confidential.** This repository is the property of Taurus Pvt Ltd. Do not share code, screenshots, or architecture details outside the team.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, Framer Motion, Three.js |
| Blockchain | Solana (devnet), `@coral-xyz/anchor`, `@solana/web3.js`, `@solana/spl-token` |
| Wallets | Phantom, Solflare (wallet adapter) |
| Database | Supabase (PostgreSQL + Realtime) |
| RPC / Webhooks | Helius |
| AI | NVIDIA NIM API |
| Storage | Pinata (IPFS) |
| Hosting | Vercel |

The smart contract lives in a separate repo: **`moonflux-contract`**.

---

## Getting Started

### 1. Prerequisites
- Node.js **22+**
- Git
- A Solana wallet browser extension (Phantom or Solflare) switched to **Devnet**
- (For scripts) [Solana CLI](https://docs.solanalabs.com/cli/install)

### 2. Install
```bash
git clone <repo-url>
cd moonflux-mvp
npm install
```

### 3. Environment variables
```bash
cp .env.example .env.local
```
Fill in `.env.local` with **development** values. Ask the Tech Lead for access to the dev password-manager vault, or create your own free keys:
- **Helius:** https://dashboard.helius.dev (free devnet key)
- **Supabase:** use the `moonflux-dev` project (never production)

> ⚠️ Never commit `.env.local`. Never use production keys locally.

### 4. Run
```bash
npm run dev
```
Open http://localhost:3000

### 5. Get a devnet wallet (for testing trades)
```bash
solana-keygen new                      # creates ~/.config/solana/id.json
solana airdrop 2 --url devnet          # or use https://faucet.solana.com
```
Import the same wallet into Phantom/Solflare, or just airdrop to your browser wallet's address.

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type check (runs in CI) |
| `node scripts/e2e-step1-create.js` … `e2e-step5-migrate.js` | On-chain end-to-end test against devnet (create → buy → sell → graduate → migrate) |

E2E scripts read `SOLANA_RPC_URL` and `WALLET_PATH` from your environment (defaults: public devnet RPC and `~/.config/solana/id.json`).

---

## Project Structure

```
app/                  Pages (App Router) — one folder per route
  api/                Backend API routes (26 endpoints)
    cron/             Scheduled jobs (migration, price alerts) — protected by CRON_SECRET
    webhooks/helius/  On-chain transaction ingestion
  token/[id]/         Token detail + trading page
  launch/             Token creation
components/           Shared React components (wallet, modals, charts)
hooks/                React hooks (useTokenTrade, useTokenDeploy, useTokenBalances)
lib/
  idl.json            Anchor IDL for the on-chain program
  program.ts          PDA helpers, bonding curve simulation, constants
  supabase.ts         Database client
  helius.ts           RPC / Helius helpers
  ai.ts               AI model calls
  rateLimit.ts        API rate limiting
scripts/              Devnet E2E scripts, DB schema, utilities
```

---

## Contributing

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening your first PR.

Short version: branch from `develop` → open a PR → get a review → CI passes → merge. Nobody pushes directly to `main` or `develop`.

---

## Security Rules

1. **Never commit secrets:** no API keys, private keys, or wallet files. `.gitignore` covers the common ones, but check your diff anyway.
2. **Never share the admin wallet or program keypair.** You don't need them. Use your own devnet wallet.
3. **Production access** (Supabase prod, Vercel prod env, mainnet keys) is limited to the Founder and Tech Lead.
4. If you accidentally commit a secret, **tell the Tech Lead immediately.** The key must be rotated. Deleting the commit is not enough.
