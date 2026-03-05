# Chrome Web Store Listing

## Title
JoulePAI — Wallet for the Machine Economy

## Summary (132 chars max)
Pay AI agents with joules. Three privacy tiers. Auto-approve rules. On-chain settlement. The wallet for the machine economy.

## Category
Productivity

## Description

JoulePAI is the wallet for the machine economy. Pay AI agents, fund escrows, and settle transactions — all from your browser toolbar.

**Joules are platform credits (1,000 joules = $1). Fixed supply. Fund via card or USDC.**

### Features

**Instant Payments**
Send joules to any @handle. Sub-second settlement with 0.5% platform fee. Transactions are independently verifiable via on-chain settlement.

**Three Privacy Tiers**
Choose your privacy level per wallet:
- Transparent — full visibility, independently verifiable on-chain
- Confidential — amounts encrypted with ECDH + AES-256-GCM
- Private — zero-knowledge proofs (PLONK). Only commitments recorded on-chain.

**Auto-Approve Rules**
Set rules to auto-approve payments to trusted recipients. Filter by site, @handle, and per-transaction cap. Daily spending limits enforced. Kill switch to halt all auto-approvals instantly.

**Pending Queue**
Review and approve or reject transactions that don't match your auto-approve rules. Full control over every outgoing payment.

**Connected Sites**
See which websites have requested wallet access. Revoke permissions at any time. Sites can request payments via the JoulePAI JavaScript SDK.

**Developer Tools**
Built-in developer panel shows wallet ID, handle, owner type, and quick links to the Provider API reference. Build integrations directly from the extension.

**Security**
- Auto-lock after configurable inactivity timeout
- Session-based authentication
- No private keys stored in the extension
- All sensitive operations handled server-side

### For Developers

Integrate JoulePAI payments into any website:
- Embed the Pay with Joules button: `<script src="https://joulepai.ai/pay.js"></script>`
- Programmatic API: `JoulePAI.pay({ to: '@handle', amount: 5000 })`
- Verify payments server-side with the JoulePAI SDK

### Pricing

JoulePAI is free to install. Joules are platform credits (1,000 joules = $1). Fund via card or USDC. A 0.5% fee applies to transfers.

### Links

- Website: https://joulepai.ai
- API Documentation: https://joulepai.ai/docs
- Python SDK: https://pypi.org/project/joulepai/
- JavaScript SDK: https://www.npmjs.com/package/joulepai

---

## Store Assets Checklist

- [x] icon-128.png (128x128, steel J on black)
- [x] promo-440x280.png (marquee tile)
- [x] screenshot-1-wallet.png (1280x800 — wallet view with balance)
- [x] screenshot-2-send.png (1280x800 — send joules view)
- [x] screenshot-3-rules.png (1280x800 — auto-approve rules)
- [x] screenshot-4-settings.png (1280x800 — settings with privacy toggle)
- [x] joulepai-chrome.zip (extension package)
