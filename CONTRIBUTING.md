# Contributing to MoonFluxx

## Branches

| Branch | Purpose | Who can merge |
|--------|---------|---------------|
| `main` | Production. Auto-deploys to the live site | Tech Lead + Founder approval |
| `develop` | Staging. Integration branch for finished work | Tech Lead (via PR) |
| `feature/*`, `fix/*`, etc. | Your work | You open a PR into `develop` |

**Never push directly to `main` or `develop`.**

### Branch naming
```
feature/escrow-status-ui
fix/buy-slippage-rounding
test/e2e-sell-flow
chore/ci-cache
docs/api-endpoints
```

## Workflow

1. Pick an issue from the GitHub Projects board and assign it to yourself
2. Branch from the latest `develop`:
   ```bash
   git checkout develop && git pull
   git checkout -b feature/short-description
   ```
3. Commit in small, focused steps
4. Push and open a Pull Request **into `develop`**
5. Fill in the PR template (what, why, how tested)
6. CI must pass, and at least **1 approval** is required (Tech Lead)
7. The reviewer merges (squash merge)

Releases: the Tech Lead opens a PR `develop` → `main`. The Founder approves it.

## Commit messages

Use a short prefix + description:
```
feat: add escrow status badge to token page
fix: prevent double-submit on buy button
test: add playwright test for sell flow
chore: bump anchor to 0.32.1
docs: document /api/record-trade
```

## Pull Request rules

- Keep PRs small (ideally < 400 lines changed). Split big work into multiple PRs
- One topic per PR
- Include screenshots/video for any UI change
- Say how you tested it (manual steps, devnet tx signature, automated test)
- No commented-out code, `console.log` debugging, or TODOs without an issue link
- Don't change unrelated files (no drive-by reformatting)

## Code standards

- TypeScript: no `any` unless unavoidable (and commented why)
- Every API route: validate input (zod), return consistent JSON errors, apply rate limiting
- Never trust the client. Validate amounts and addresses on the server, and the smart contract validates again
- Money/token math: use `BN` / `bigint`, never JavaScript floating point for on-chain amounts

## Secrets

- `.env.local` is personal and never committed
- If you need a new env variable, add it to `.env.example` with a placeholder and tell DevOps so it's added to Vercel
- **Accidentally committed a secret? Tell the Tech Lead right away.** It has to be rotated

## Smart contract changes

Changes to the on-chain program happen in the **`moonflux-contract`** repo and need **2 approvals** (Tech Lead + Founder). If a contract change alters accounts or instructions, update `lib/idl.json` here in the same release.
