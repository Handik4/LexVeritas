# LexVeritas Dashboard

React, Vite and Tailwind v4 dashboard for the LexVeritas contract.

* **Live triage feed.** Lists disputes, with pending and in-window disputes sorted first.
* **Case viewer.** Shows the market criteria, the web evidence (tier-labelled, with keccak commitments) and the AI rationale side by side, and round 2 when a dispute was challenged.
* **Challenge countdown.** Renders the on-chain 24h deadline as a progress bar.
* **Dry-run arbitrator.** Runs the contract's own arbitration prompt three times in parallel on Studio Next as simulated writes, then applies the contract's validator rule (the verdicts must match).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

The contract address comes from `../deployments/studio-next.json`. You can override it with
`VITE_CONTRACT_ADDRESS` and `VITE_GENLAYER_RPC`. The dashboard needs `genlayer-js@2.0.0-rc.1`, because 1.x
encodes calldata that Studio Next rejects (`malformed_entry`).
