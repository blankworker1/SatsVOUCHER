# SatsVOUCHER v2


SatsVoucher version 2 addresses some of the limitations of the paper voucher.


## Evolution of Lightning Vouchers

1. Standard LNURL-Withdraw Voucher (Baseline)
* A voucher is a printed LNURL-withdraw QR code
* Scanning it allows the wallet to pull funds directly
* Acts as a bearer instrument (like cash)
Problems:
* Anyone who sees or photographs the QR can redeem it
* No safe way to check status without exposing the secret
* Poor UX for verification before accepting
  
2. Dual-QR Model (Separation of Concerns)
* Introduces two QR codes:
   * Public QR (voucher ID) → check status
   * Private QR (LNURL) → redeem funds
Improvements:
* Safe status checking (no secret exposure)
* Better UX (inspect vs spend separation)
Remaining issue:
* Redeem QR is still printed → still stealable via photo
  
3. Reveal-once Web Model (Current Design)
* Printed voucher contains only:
   * Voucher ID (public)
   * Status QR → opens web page
* No redeem QR printed
  
Flow:
1. User scans status QR → sees voucher details
2. Clicks “Reveal Redeem QR”
3. Backend generates a one-time redeem token
4. Displays LNURL-withdraw QR once
5. Voucher transitions: `active → revealed → redeemed`
   
## Key Design Properties

* Separation of roles:
   * Public ID → lookup only
   * Secret → generated dynamically at reveal
* One-time access:
   * Redeem QR is not stored or reusable
   * Short-lived token prevents replay
* Improved security:
   * Eliminates printed secret
   * Reduces risk from photos, logs, or printers
   * 
## Trade-offs

* Still first-come-first-serve unless extra auth (e.g. PIN)
* Requires online interaction (no longer fully offline)
* Security shifts from paper → web/session layer
  
## Mental Model

* Standard voucher: cash
* Dual QR: cash + serial number
* Reveal model: sealed envelope that must be opened once

## Recommended Enhancements

* Optional printed PIN for reveal
* Short-lived redeem tokens
* Rate limiting + CAPTCHA on reveal
* Clear state transitions (`active / revealed / redeemed / expired`)

This model gives you the best balance between: 👉 cash-like UX 👉 controlled disclosure of secrets 👉 compatibility with LNURL-withdraw
while significantly reducing accidental or passive theft.

## Developer Spec

**The state machine is the heart of V2.** V1 had two states — `active` and `claimed`. V2 needs four, and the transitions matter:Now here's what changes in each component — nothing is a rewrite, everything is an addition or a targeted change:

(add diagram)

**Cloudflare Worker — 2 new endpoints, 1 modified**

The existing `POST /voucher`, `GET /voucher/:id`, and `GET /lnurlw/callback/:id` all stay. What changes:

`POST /voucher` no longer generates `k1` at creation time. The `k1` and LNURL are generated dynamically at reveal, not stored on the printed receipt. The voucher KV record at creation time only needs `id`, `amountBtc`, `amountFiat`, `currency`, `status: active`, `createdAt`, `expiryDate`.

Two new endpoints:
- `POST /voucher/:id/reveal` — validates the voucher is active and unexpired, generates a fresh `k1` and a short-lived reveal token (10 min TTL), stores it temporarily in KV, returns the LNURL-withdraw URL. This is what the status web page calls when the user taps "Reveal".
- `GET /v/:id` — the status web page itself, served as HTML from the worker. This is the URL printed on the receipt as a QR code. It shows the voucher state and the Reveal button.

**The status web page — new, lives in the Worker**

This is a small HTML page served directly from the Worker — no separate hosting needed. Cloudflare Workers can return `text/html` just as easily as JSON. It needs to:
- Show voucher ID, amount, status, expiry
- If `active`: show a "Reveal Redeem QR" button
- If `revealed`: show the LNURL QR code (time-limited)
- If `redeemed`: show a "this voucher has been redeemed" message
- If `expired`: show expiry message

This page is what gets printed as the QR on the receipt — replacing the LNURL QR entirely.

**Printed receipt — one change**

Instead of printing the LNURL QR, print a QR that encodes `https://your-worker.workers.dev/v/X4K-92M`. That's the only change to `printer.ts`.

**POS app — minimal change**

The confirm screen no longer shows a QR code preview of the LNURL (there isn't one anymore). It shows the voucher ID and a preview of the status URL. The history screen and status check flow are unchanged.

**KV data model — small addition**

```
voucher:{id}         →  { id, status, amountBtc, amountFiat, currency,
                          createdAt, expiryDate, claimedAt? }

reveal:{token}       →  { voucherId, k1, lnurl, expiresAt }
                          TTL: 10 minutes
```

The `k1` is never stored on the voucher record itself — it only lives on the short-lived `reveal:` key.


**The key architectural question is: where does the status page live?**

There are three realistic options:Now let's look at the reveal flow in detail — this is where most of the design decisions live.

(add diagram)

The printed receipt contains only one QR code. That QR encodes a URL like `https://your-worker.workers.dev/v/X4K-92M`. When a customer scans it, here is exactly what happens step by step:Now the three decisions that need settling before you pick an option:

**Decision 1 — KV vs D1**

KV is what you have working today. It's perfect for key-value lookups by ID. The limitation is you can't query across records — so "show me all vouchers created today" requires maintaining a separate index key manually. D1 is Cloudflare's SQLite service, also free on the Workers plan, and lets you write `SELECT * FROM vouchers WHERE created_at > ?`. If your admin dashboard needs any kind of reporting or listing by date, D1 makes that clean. If not, KV stays simple. Since you mentioned you've already built an admin dashboard, this is worth thinking about.

**Decision 2 — The reveal token: opaque token or signed JWT?**

The reveal endpoint returns something the customer's phone uses to fetch the LNURL-withdraw info. Two approaches:

An opaque token is a random hex string stored in KV with a 10-minute TTL. Simple, stateless on the client, but requires a KV read on every LNURL request. A signed JWT contains the `voucherId` and expiry encoded in the token itself — the worker can verify it without a KV read, just by checking the signature with a secret. JWT is slightly more elegant and removes one KV round-trip in the hot path (steps 7–8 above), but adds a crypto dependency. For this scale, opaque token in KV is simpler and fine.

**Decision 3 — Optional PIN on reveal**

Your design document mentions this as a recommendation. The question is whether to build it into V2 now or leave it for V3. A PIN means the receipt has a printed 4-digit number, and the reveal page has a PIN entry field before showing the QR. This genuinely reduces the "found the receipt in a bin" attack. It also adds friction for legitimate users. The implementation cost is low — one extra field on the voucher record, one extra input on the status page. Worth deciding now because it changes what gets printed on the receipt.

---

My recommendation given what you've described — admin dashboard already built, one successful PoC, wanting to keep things simple — is **Option A with D1 instead of KV**. Single deployment, free tier, and D1 gives you proper SQL for the admin side without adding complexity to the Worker itself. The status page is basic HTML served directly from the Worker — no separate Pages deploy needed. PIN on reveal is worth including in V2 since it's cheap to add now.

The four things that actually change from V1 to V2 are:

1. Worker: swap KV for D1, add `/v/:id` status page route, add `/v/:id/reveal` endpoint
2. Worker: `POST /voucher` no longer generates or stores `k1` — that happens at reveal time
3. Receipt: prints status URL QR instead of LNURL QR
4. Status page: new HTML served from Worker — the entire customer-facing UX

Everything else — the POS app screens, the Blink integration, the LNURL-withdraw callback — is unchanged.

## SatsCASH Integration 

Could we integrate the two projects? SatsCASH and SATs Voucher? Here is an overview of the second project that is in early development:

SatsCASH is a physical bearer instrument for the Lightning Network, bringing the tactile experience of cash to digital value.

SatsCASH transforms a simple NFC tag into a secure, fixed-value coin that can be verified with a tap and trusted for daily transactions. It's a system for creating "digital cash" that you can hold in your hand, give to a friend, or use to build a local economy.

### The System: Roles & Responsibilities

SatsCASH operates on a principle of distributed trust, where no single entity has unilateral control over the funds. This creates a secure and balanced ecosystem.

**The Mint:** Creates the physical coins (NFC tags) that represent a value in sats, locked in a treasury Lightning wallet. The Mint cannot spend the funds without the PIN.

**The Custodian:** A separate, trusted entity that creates and securely holds the unique PIN code for each coin. The Custodian cannot withdraw the funds without the physical coin (NFC tag).

**The User:** Uses the coins as a simple medium of exchange. The primary tool is not a wallet, but a verifier. Possession of the coin is ownership.

### Technical Aspects

Core Architecture

The system is composed of three independent components that communicate to ensure security and validity.

The Physical Coin: An NXP NTAG424 DNA tag. It uses its factory-set, read-only Unique Identifier (UID) as its serial number. No data is written to the tag, making it simple, secure, and tamper-proof.

The Mint Server: A web server that manages the central ledger. It holds the database of all coin UIDs, their values, and their status (minted, locked, spent). It integrates with the Blink API to manage the real Bitcoin backing the coins using a "mark-and-hold" method.

The Custodian Server: A standalone authentication server. Its sole responsibility is to securely generate, store, and release the PINs for coins upon proper authorization. It has no access to the Mint's funds or database.

Security Model

The system's security is based on a cryptographic separation of duties, similar to a multi-signature wallet.

To Spend a Coin the user needs both the physical NFC Tag (to identify the coin to the Mint) and the secret PIN Code (to authorize the transaction with the Mint).
The Mint holds the funds but does not know the PINs.
The Custodian knows the PINs but has no access to the funds.
This ensures that neither the Mint nor the Custodian can act alone to compromise the system's funds.

Tech Stack
Frontend / Backend / Database: tba
Lightning: Blink API
NFC Hardware: NXP NTAG424 DNA Tags

### Phased Rollout

MVP: The Technical Foundation

The initial version is a local Proof of Concept (PoC) designed to validate the core architecture and security model without external dependencies.

Goal: Prove that a physical NFC tag can be used as a secure key to a digital bearer asset.
Setup: A server running on a local PC, a local Wi-Fi network, and a web app on an Android tablet.
Simulated Treasury: The Lightning treasury is simulated within the local database. The PoC demonstrates the state change from minted to spent without moving real sats.
Core Features Demonstrated:
Reading a tag's UID via the Web NFC API.
Verifying a coin's status against a central database.
The complete, secure authentication flow involving the PIN.
The separation of the Mint and Custodian services.

The Local Community Usecase
The first production version is designed for a specific, real-world application: serving as trusted local money for a community.

Goal: Enable a high-velocity, low-friction medium of exchange for daily transactions within a defined group (a town, a market, a company).

Primary Function: Verification. The SatsCASH web app is used primarily as a note verifier. A merchant or user taps a coin to instantly confirm its authenticity and value, building trust for a transaction. The transaction itself is the simple physical handover of the coin, just like cash.

Secondary Function: Redemption & Control. The PIN, held by the Custodian, is used for exceptional circumstances, not daily spending. This includes:
Redemption: A formal process for a user to convert their SatsCASH back into Bitcoin, exiting the local system.

System Administration: Allowing the project administrators to perform actions like recalling an old series of coins or managing the money supply, much like a central bank managing physical currency.

User Experience: For daily use, the system is completely anonymous. There are no accounts or logins needed to accept or verify a coin. The focus is on the tangible, physical exchange of value.

## SatsVOUCHER and SatsCASH integration 

**Overview**

They're complementary products in the same space — not duplicates. A voucher is a one-time paper coupon. A SatsCASH coin is a reusable physical token that circulates. One is disposable, one is durable. Used together they cover different points on the same spectrum: paper voucher for point-of-sale retail, NFC coin for longer-term community circulation.

(add diagram)

**What integration actually means**

There are three distinct levels here and they're worth separating clearly:

*Shared infrastructure* — same Blink treasury wallet, same Cloudflare account, same admin dashboard. This is almost free and makes sense immediately. Both products draw from and pay into the same Lightning pot.

*Shared codebase* — one monorepo, shared TypeScript types, shared Blink API client, shared auth middleware. This makes sense if you're the sole developer and want to maintain one thing instead of two. The risk is coupling two different lifecycles together.

*Unified product* — one brand, one app, one URL that handles both vouchers and coins. This is a real product decision, not just a technical one. It means customers interact with one interface that can tell them "this is a paper voucher worth £25" or "this is a SatsCASH coin worth 5,000 sats" depending on what they scan or tap.

**The honest assessment**

The infrastructure level is a no-brainer — share the treasury, share the admin dashboard, share the Cloudflare account. Start there immediately.

The codebase level makes sense but only after SatsCASH has a working PoC. Right now it's still in early development with a different tech stack (Node/Express vs Cloudflare Workers). Forcing a merge before the architecture is settled creates churn. The better move is to let SatsCASH prove its core flow independently, then migrate it to Workers when you're ready to unify.

The unified product level is the most interesting question — and it depends on your go-to-market. If the POS terminal is your primary distribution point, there's a compelling scenario where the Sunmi terminal can both print paper vouchers and write NFC coins. The cashier picks which instrument to issue. The customer gets a receipt or a coin. Both are backed by the same treasury. That's a genuinely differentiated product.

**The architectural gap to resolve**

The biggest structural difference is the dual-custody model in SatsCASH. The Mint and Custodian are intentionally separate servers — that separation is the security model. If you integrate with Sats VOUCHER's Cloudflare Worker, you need to decide whether the Custodian becomes a second Worker (or a second service) or whether the separation is preserved differently. This isn't a blocker but it's the design question that needs an answer before writing any shared code.

**My recommendation**

Do the integration in three phases rather than all at once:

Phase 1 right now — shared treasury, shared admin dashboard, shared Cloudflare account. One Blink wallet funds both products. Takes an afternoon.

Phase 2 when SatsCASH has a working PoC — migrate the Mint server to a Cloudflare Worker, use D1 instead of SQLite, keep the Custodian as a separate Worker or service. Now both products are on the same infrastructure.

Phase 3 as a deliberate product decision — unified brand, unified POS terminal experience, single admin interface for both instrument types.

The question that determines whether phase 3 makes sense is: who is your target operator? A market stall selling gift vouchers is different from a community running a local currency. They could be the same person — but they might not be. Worth thinking through before committing to a unified UX.

## V1 Redesign - Bridge APK + SatsVoucher webapp

A hosted web app on Cloudflare Pages, and build one small "bridge" APK whose only job is to expose the Sunmi hardware (printer + NFC) to the browser via a local API. A web app deployed to Cloudflare Pages updates instantly, works on any device with a browser, and the entire development workflow becomes: edit code → push to Git → live in 30 seconds.

The bridge APK solves the one thing a browser genuinely cannot do on Android — bind to the Sunmi AIDL printer service and trigger the NFC hardware at a low level. But this APK is tiny, maybe 200 lines of Kotlin, with no UI, no state, no navigation. It runs as a background service and exposes two endpoints over localhost. You build it once and barely touch it again.

**What the bridge APK actually needs to do**

It's essentially a local HTTP server with three routes:

```
POST /print        — accepts receipt JSON, calls Sunmi printer SDK
GET  /nfc/poll     — waits for an NFC tag tap, returns UID
POST /nfc/write    — writes data to a tag (for SatsCASH minting)
```

The web app calls these via `fetch('http://localhost:8765/print', ...)`. Because it's localhost, there are no CORS issues and no security exposure to the outside world. The bridge never touches the internet — it only talks to the hardware and to the browser on the same device.

**NFC on the Sunmi V2S**

This is the interesting part. The V2S has a built-in NFC reader/writer that supports ISO 14443 Type A/B — which covers the NTAG424 DNA tags SatsCASH uses. The Web NFC API exists in Chrome on Android but is currently restricted to HTTPS origins and doesn't support all NFC operations. Going through the bridge APK removes that restriction entirely — the bridge gets full access to Android's `NfcAdapter` and can read the UID, read NDEF data, and write to tags. This is actually more capable than Web NFC would give you anyway.

**What the unified web app looks like**

One Cloudflare Pages deployment, one URL, two tool sections:

```
app.satsvoucher.com/voucher    — POS sale screen, history, confirm
app.satsvoucher.com/cash       — SatsCASH mint, verify, redeem
app.satsvoucher.com/admin      — combined dashboard, treasury, settings
```

On the Sunmi it runs fullscreen in Chrome or a custom WebView launcher (one-line APK that just opens the URL in fullscreen — even simpler than the bridge). On any other device it works as a normal web app, with printer and NFC features gracefully disabled when the bridge isn't available.

**The one genuine trade-off**

The web app requires internet connectivity for every transaction — there's no offline mode. For Sats VOUCHER this is fine since it already calls the Worker to create vouchers. For SatsCASH the verification step currently works locally in the PoC, but in production it would always need to hit the Mint server anyway to check the coin's status. So the connectivity requirement isn't new, it's just made explicit.

**Recommended stack**

```
CF Pages          — React (Vite) or plain HTML/JS — your choice
CF Worker         — unified API for both products
CF D1             — single database, two table groups
Blink API         — single treasury wallet
Bridge APK        — Kotlin, ~200 lines, NanoHTTPD or Ktor
Launcher APK      — optional, opens web app fullscreen (50 lines)
```

The bridge APK and launcher APK are the same APK — a small Kotlin app that launches the web app in a fullscreen WebView and starts the hardware bridge service in the background.

This approach also means the SatsCASH web interface — the coin verifier that merchants use — is the same codebase as the POS terminal. A merchant taps a coin on their phone browser and sees the same UI as the terminal operator.

The bridge APK has exactly four components:

MainActivity.kt        — starts the service, then finishes (no UI)
PrinterBridgeService.kt — foreground service, holds AIDL connection
PrintServer.kt         — NanoHTTPD HTTP server, handles /print
IWoyouService.aidl     — Sunmi's printer interface definition (copy-paste from Sunmi SDK)

Total Kotlin code: around 150 lines. One dependency: NanoHTTPD (a 50KB HTTP server library for Android). No React, no Node, no Gradle plugin maze.

### What's built

Cloudflare Worker (V1) — voucher creation, LNURL-withdraw, status check, webapp UI
Bridge APK — printer + NFC bridge, fullscreen WebView launcher

### What's next in order

The natural next step after the bridge is confirmed working is the web app on Cloudflare Pages — because that's what the bridge WebView points at. Everything converges there.

The build order that makes the most sense:

(add diagram)





