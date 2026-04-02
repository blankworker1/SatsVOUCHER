# SatsVOUCHER

**A Bitcoin Lightning voucher platform for retail.**

Issue vouchers at point of sale, let customers transfer them freely, and redeem directly to any Lightning wallet — instantly, anywhere.

🌐 **[satsvoucher-worker.bosaland.workers.dev](https://satsvoucher-worker.bosaland.workers.dev)**

---

## Overview

SatsVOUCHER is a complete Bitcoin Lightning voucher system built for physical retail. It runs as two components:

- **A Cloudflare Worker** — a single JavaScript file that serves three web apps, a full REST API, LNURL-withdraw redemption via the Blink Lightning wallet API, and a daily expiry cron. Everything in one deployment.
- **An Android Bridge APK** — a background service running on the Sunmi V2S POS terminal, exposing the built-in thermal printer to the web app via a localhost HTTP API.

The web app runs inside the Bridge APK's WebView on the Sunmi, or in any browser for verification and management. No app store, no build pipeline, no framework — plain HTML/JS served directly from the Worker.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Sunmi V2S POS Terminal              │
│                                                     │
│  ┌─────────────────────┐   ┌─────────────────────┐  │
│  │   Bridge APK        │   │   WebView           │  │
│  │   (background)      │◄──│                     │  │
│  │   localhost:8765    │   │  Merchant App       │  │
│  │   /status           │   │  /app               │  │
│  │   /print            │──►│  /app/confirm       │  │
│  │                     │   │  /app/history       │  │
│  │   PrinterX SDK      │   │  /app/settings      │  │
│  │   Sunmi Thermal     │   │                     │  │
│  └─────────────────────┘   └─────────────────────┘  │
└─────────────────────────────────┼───────────────────┘
                                  │ HTTPS
                     ┌────────────▼────────────┐
                     │   Cloudflare Worker     │
                     │                         │
                     │   / — Home page         │
                     │   /app — Merchant app   │
                     │   /v/:id — Verify page  │
                     │   /dashboard — Admin    │
                     │                         │
                     │   REST API              │
                     │   LNURL-withdraw        │
                     │   KV Storage            │
                     │   Daily cron            │
                     └────────────┬────────────┘
                                  │ GraphQL
                     ┌────────────▼────────────┐
                     │   Blink Lightning API   │
                     │   (wallet + payments)   │
                     └─────────────────────────┘
```

---

## The Web Apps

All apps are served by the same Worker. They share no navigation links — each is accessed directly by URL or QR code.

### 1. Merchant App — `/app`

Runs on the Sunmi V2S in the Bridge APK WebView. Four screens:

| Route | Screen |
|-------|--------|
| `/app` | Sale screen — keypad, live BTC price, print button |
| `/app/confirm` | Confirm screen — amount, QR, PIN display, print receipt |
| `/app/history` | History — voucher list with status, check and reprint |
| `/app/settings` | Settings — store name, currency, receipt text, BTC price |

### 2. Verification Page — `/v/:id`

Customer-facing. Accessed by scanning the QR code on the printed receipt. No account or app required — works in any mobile browser.

**Transfer flow:** Enter current PIN → set new PIN → PIN updated in KV. New holder writes their PIN on the back of the receipt.

**Redeem flow:** Enter PIN (max 3 attempts, 24hr lockout on failure) → LNURL-withdraw QR revealed once only → save to device → open in any Lightning wallet.

### 3. Admin Dashboard — `/dashboard`

Password-protected monitoring view. Not linked from any other page — accessed by direct URL only.

Shows:
- **Solvency indicator** — wallet balance vs unredeemed voucher liability, green/amber/red
- Treasury balance (sats and BTC)
- Unredeemed liability (fiat and sats)
- Voucher breakdown by state: Active, Pending, Redeemed, Expired, Locked
- Issued today / last 7 days velocity
- Expired value (profit from unclaimed vouchers)
- Recent voucher list (last 20)
- Store name polled from latest voucher in KV

Default access code: `1928` (hardcoded, change in Worker before production)

### 4. Demo — `/demo`

A read-only preview of the merchant sale screen, accessible from any browser without a terminal or Bridge APK. Intended for prospective merchants evaluating the platform before onboarding.

**What it shows:**
- The full sale screen keypad with live BTC price feed
- The SatsVoucher UI and layout at actual scale

**What is disabled:**
- Print Voucher button — permanently disabled, labelled "Demo Mode"
- History and Settings navigation — not accessible from demo
- No API calls of any kind — nothing is written to KV

**What it is not:**
- Not connected to any live wallet or voucher system
- Not a simulation — the keypad works but no voucher is ever created

> **Merchant onboarding will be available after the current public trial is complete.** If you are interested in running SatsVoucher at your location, watch this space.

---

## Security Model

### PIN system

Every voucher has a 4-digit PIN hashed with SHA-256 and a random salt using the Web Crypto API built into the Workers runtime. PINs are never stored in plain text.

- **Initial PIN** — generated at voucher creation, displayed once on the merchant confirm screen. Never printed on the receipt.
- **Transfer** — current holder verifies their PIN, sets a new PIN for the new holder. Old PIN is immediately invalidated.
- **Redeem** — PIN required before the LNURL-withdraw QR is revealed. Three failed attempts triggers a 24-hour lockout.
- **LNURL exposure** — the LNURL-withdraw is created on demand at the moment of redemption (not at voucher creation). It is exposed exactly once, tracked by `redeemExposeCount`.

### Voucher states

| State | Meaning |
|-------|---------|
| `active` | Valid, PIN set, not yet redeemed |
| `pending` | LNURL revealed, awaiting Lightning payment confirmation |
| `redeemed` | Blink callback confirmed payment |
| `expired` | Past expiry date — set by daily cron |
| `locked` | 3 failed PIN attempts — 24hr cooldown |

Expiry overrides all other states. A voucher past its expiry date cannot be transferred or redeemed regardless of current state.

---

## Cloudflare Worker

Single file: `cloudflare/index.js`

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | Home page |
| `GET` | `/app` | Merchant sale screen |
| `GET` | `/app/confirm` | Confirm screen |
| `GET` | `/app/history` | History screen |
| `GET` | `/app/settings` | Settings screen |
| `GET` | `/v/:id` | Customer verification page |
| `GET` | `/dashboard` | Admin dashboard |
| `GET` | `/dashboard/settings` | Store name from latest voucher |
| `POST` | `/voucher` | Create voucher, generate PIN |
| `GET` | `/vouchers` | List last 50 vouchers (sanitised) |
| `GET` | `/voucher/:id` | Single voucher status |
| `POST` | `/voucher/:id/verify-pin` | Validate PIN (no attempt consumed) |
| `POST` | `/voucher/:id/transfer` | Rotate PIN to new holder |
| `POST` | `/voucher/:id/redeem` | Verify PIN, create LNURL on demand |
| `GET` | `/treasury` | Blink wallet balance in sats |
| `GET` | `/lnurlw/:id` | LNURL-withdraw handshake step 1 |
| `GET` | `/lnurlw/callback/:id` | LNURL-withdraw callback — pays via Blink |

Sensitive fields (`pinHash`, `pinSalt`, `k1`, `lnurl`) are stripped from all GET responses before returning to the client.

### KV Record Structure

```json
{
  "id": "abc123",
  "storeName": "BOSA",
  "amountFiat": "10.00",
  "amountBtc": "0.00017260",
  "currency": "EUR",
  "currencySymbol": "€",
  "status": "active",
  "pinHash": "a3f5c2...",
  "pinSalt": "x9k2m1...",
  "redeemAttempts": 0,
  "redeemLockedUntil": null,
  "redeemExposeCount": 0,
  "createdAt": "2026-03-31T10:00:00.000Z",
  "expiryDate": "2026-06-29T10:00:00.000Z",
  "k1": "random-string-for-lnurl"
}
```

### Infrastructure

- **Runtime:** Cloudflare Workers (V8 isolate, no Node.js)
- **Storage:** Cloudflare KV — namespace `VOUCHERS`, key pattern `voucher:{id}`
- **Secrets:** `BLINK_API_KEY`, `BLINK_WALLET_ID` — set via Cloudflare dashboard
- **Lightning:** Blink wallet API (`api.blink.sv/graphql`)
- **PIN hashing:** Web Crypto API (`crypto.subtle.digest`) — no external dependencies
- **LNURL encoding:** bech32 implemented inline — no external dependencies
- **Expiry cron:** Cloudflare Cron Trigger, runs daily at midnight UTC

### Deployment

Paste `cloudflare/index.js` into the Cloudflare Workers editor and click Deploy. No wrangler CLI required for basic deployment.

To enable the daily expiry cron, add to `wrangler.toml`:

```toml
[triggers]
crons = ["0 0 * * *"]
```

---

## Android Bridge APK

Android Studio project at `SatsVoucherBridge/`

Runs as a foreground service on the Sunmi V2S. Binds to the Sunmi PrinterX SDK and exposes the thermal printer via a localhost HTTP API on port 8765. The web app detects the bridge automatically — if unreachable, the app continues working without print functionality.

### Bridge Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/status` | `{"ok":true,"printer":true,"nfc":true}` |
| `POST` | `/print` | Print receipt from JSON payload |
| `GET` | `/print/test` | Print a test page |
| `GET` | `/nfc/poll` | Long-poll up to 10s for NFC tag tap |
| `POST` | `/nfc/write` | Write NDEF payload to tapped NFC tag |

### Print Job JSON

```json
{
  "storeName": "BOSA",
  "headerLine": "Thank you for your purchase",
  "amount": "€10.00",
  "btcAmount": "0.00017260 BTC",
  "voucherId": "ABC123",
  "qrData": "https://satsvoucher-worker.bosaland.workers.dev/v/abc123",
  "issuedDate": "31/03/2026",
  "expiryDate": "29/06/2026",
  "footerLine": "Non-refundable. Valid for stated period."
}
```

Note: the PIN is deliberately not included in the print payload. The customer sees their PIN on the confirm screen and writes it on the back of the receipt themselves.

### Key Technical Decisions

The bridge uses the **Sunmi PrinterX SDK** (`com.sunmi:printerx:1.0.14`) rather than the older AIDL `IWoyouService` interface. The AIDL interface was investigated but proved unreliable on firmware 6.0.30 — `printerInit`, `lineWrap`, and `cutPaper` throw security exceptions from third-party apps. The PrinterX SDK is Sunmi's modern replacement and works correctly via `lineApi.autoOut()` to flush and print.

QR codes are generated as ZXing bitmaps in Kotlin and printed via `lineApi.printBitmap()`, bypassing the firmware's built-in QR renderer which crashed on certain input strings.

### First Launch Setup

On first launch the app shows a setup prompt asking for your Cloudflare Worker URL.
Enter your deployed Worker URL in the format:
```
https://yourname.workers.dev/app
```

The URL is saved to SharedPreferences and loaded automatically on every subsequent
launch. To change it later, long-press the back button on the Sunmi and confirm reset.

---
### Building
```bash
# Prerequisites: Android Studio, JDK 17, USB debugging enabled on Sunmi
# Open SatsVoucherBridge/ in Android Studio
# Build → Build Bundle(s) / APK(s) → Build APK(s)

adb install -r app/build/outputs/apk/debug/app-debug.apk
```

No code changes required before building. The Worker URL is configured
at runtime on first launch — not hardcoded in the source.
```

---

### Dependencies

```groovy
implementation 'com.sunmi:printerx:1.0.14'
implementation 'com.google.zxing:core:3.5.2'
implementation 'org.nanohttpd:nanohttpd:2.3.1'
implementation 'androidx.core:core-ktx:1.12.0'
```

---

## Hardware

Tested on: **Sunmi V2S** (Android 11, firmware 6.0.30)

- 58mm thermal printer (linerless, no cutter)
- Built-in NFC reader
- 1440×720 display (480×854 logical pixels)
- Portrait locked

The web app layout is optimised for the Sunmi's logical resolution. Multiple Sunmi devices can connect to the same Worker and KV namespace simultaneously — no Worker changes required, voucher IDs have sufficient entropy to avoid collisions.

---

## Sale Flow

### Merchant steps
1. Open `/app` on the Sunmi terminal
2. Enter voucher amount using the keypad — live BTC rate shown
3. Tap **Print Voucher** — voucher created, PIN generated
4. Hand device to customer — confirm screen shows amount, QR, and PIN
5. Customer taps **Print Receipt** — receipt prints with QR code
6. Customer writes PIN on back of receipt, taps **New Sale**
7. Merchant receives device back — transaction complete

### Customer steps
1. Receive printed receipt — QR code and voucher ID
2. Write PIN on the back (PIN shown on screen at time of purchase)
3. To **verify**: scan QR code with phone camera to verify voucher is active
4. To **transfer**: tap Transfer, enter PIN, set new PIN for recipient
5. To **redeem**: tap Redeem, enter PIN, save the revealed QR, open in Lightning wallet
6. Bitcoin arrives in seconds — voucher status updates to Redeemed

---

## Configuration

Settings are stored in `localStorage` on the terminal under key `sv_settings`. Accessible via `/app/settings`.

| Setting | Default |
|---------|---------|
| Store name | BOSA |
| Currency | EUR |
| Min amount | €1.00 |
| Max amount | €500.00 |
| Expiry days | 90 |
| Receipt header | Thank you for your purchase |
| Receipt footer | Non-refundable. Valid for stated period. |
| BTC price source | Live (CoinGecko) |

---

## Project Structure

```
satsvoucher-worker.bosaland.workers.dev
│
cloudflare/
└── index.js                    Single Worker file — all three apps + full API
│
SatsVoucherBridge/              Android Studio project
├── app/src/main/java/com/satsvoucher/bridge/
│   ├── MainActivity.kt         WebView + NFC intent handling
│   ├── BridgeService.kt        Foreground service
│   ├── PrinterManager.kt       PrinterX SDK integration
│   ├── PrintServer.kt          NanoHTTPD HTTP server
│   └── NfcManager.kt           NFC tag polling and NDEF write
└── app/src/main/aidl/woyou/aidlservice/jiuiv5/
    ├── IWoyouService.aidl      Sunmi printer AIDL (kept for reference)
    └── ICallback.aidl
```

---

## Roadmap

### SatsCASH — NFC Physical Coins

SatsCASH extends the system to physical NFC coins as a bearer instrument. A coin holds a balance keyed by NFC tag UID in the Worker's KV store.

Planned flow:
1. Staff enters amount on Mint screen → taps coin to Sunmi NFC reader
2. Bridge polls `/nfc/poll` → returns tag UID
3. Worker creates SatsCASH record linked to UID
4. Bridge writes redemption URL as NDEF to coin via `/nfc/write`
5. Customer taps coin at any NFC-capable phone → browser opens → Lightning wallet pays out

The NFC bridge infrastructure (`/nfc/poll` and `/nfc/write`) is already implemented and tested.

New Worker routes planned:

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/satscash/mint` | Create SatsCASH linked to NFC UID |
| `GET` | `/satscash/:uid` | Check balance and status by UID |
| `POST` | `/satscash/redeem` | Redeem via Blink, mark spent |
| `GET` | `/satscash/list` | List all SatsCASH records |

### Multi-location

Each merchant location runs its own Worker instance and Blink wallet. The replication model is simple — deploy a new Worker, set new Blink secrets, install the Bridge APK on the new Sunmi. No shared infrastructure, no coordination required.

### Dashboard Enhancements

- Status filter tabs (Active / Pending / Redeemed / Expired)
- Voucher detail expand on row click
- Revoke voucher (`POST /voucher/:id/expire`)
- SatsCASH panel
- Daily and weekly sales summary

### Release APK

The current APK is signed with the Android Studio debug keystore. A production keystore needs to be generated and backed up before distributing to additional Sunmi devices. The keystore is required for all future updates.

---

## Acknowledgements

- [Blink](https://blink.sv) — Lightning wallet API for payment processing
- [Cloudflare Workers](https://workers.cloudflare.com) — serverless edge runtime and KV storage
- [Sunmi](https://www.sunmi.com) — POS hardware and PrinterX SDK
- [ZXing](https://github.com/zxing/zxing) — QR code generation
- [NanoHTTPD](https://github.com/NanoHttpd/nanohttpd) — embedded HTTP server for the bridge

---

## Licence

MIT
