# Goldfinance Dashboard (BSC Testnet)

TypeScript + React + Vite + wagmi/viem + ethers
- UI met Goldcoin (GOLD) en Goldshare (GSHARE)
- BSC Testnet RPC via `.env`
- ABI-stubs voor ERC20 en RewardPool (vervang voor productie)
- Vercel-ready (`vercel.json` aanwezig)

## Snel starten
1) Installeer dependencies:
   ```bash
   npm install
   ```
2) Zet je RPC (optioneel, anders default):
   ```bash
   cp .env.example .env
   # pas VITE_RPC_URL aan indien gewenst
   ```
3) Run lokaal:
   ```bash
   npm run dev
   ```
4) Build voor Vercel:
   ```bash
   npm run build
   ```

## Deploy naar Vercel via GitHub
1) Maak een GitHub-repo (bv. goldfinance-dashboard)
2) Upload alle bestanden en mappen (src, public, package.json, vercel.json, ...)
3) Ga naar vercel.com/new → Import Git Repository → kies je repo → Deploy

> Let op: De opgegeven contractadressen zijn afkomstig van een ander netwerk. Op BSC Testnet zullen calls 0/niet bestaan tenzij je die contracts ook naar testnet hebt gedeployed. Vervang de adressen zodra jouw testnet-deploys klaar zijn.
