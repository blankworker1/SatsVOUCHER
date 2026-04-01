# Sats VOUCHER

A Bitcoin Lightning voucher point-of-sale system for physical retail. Issue paper vouchers redeemable via the Lightning Network, printed on a Sunmi V2S thermal POS terminal with QR code and full receipt formatting.

---

## Overview

Sats VOUCHER lets a merchant sell Bitcoin Lightning vouchers over the counter. The customer pays in fiat, receives a printed thermal receipt with a QR code, and later scans the QR with any LNURL-compatible Lightning wallet to receive their sats.

The system has two components:

- A **Cloudflare Worker** that serves the web app UI, handles voucher creation and storage, and processes LNURL-withdraw redemptions via the Blink Lightning wallet API
- An **Android Bridge APK** that runs as a background service on the Sunmi V2S, exposing the built-in thermal printer and NFC reader to the web app via a localhost HTTP API

The web app runs inside the Bridge APK's WebView on the Sunmi, or in any browser for management and history purposes. No app store, no build pipeline, no React Native — just plain HTML/JS served directly from the Worker.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Sunmi V2S POS Terminal              │
│                                                     │
│  ┌─────────────────────┐   ┌─────────────────────┐  │
│  │   Bridge APK        │   │   Chrome / WebView  │  │
│  │   (background)      │   │                     │  │
│  │                     │◄──│  Web App            │  │
│  │  localhost:8765     │   │  (served from CF    │  │
│  │  /status            │   │   Worker)           │  │
│  │  /print             │   │                     │  │
│  │  /nfc/poll          │──►│  POST /voucher      │  │
│  │  /nfc/write         │   │  GET  /vouchers     │  │
│  │                     │   │  GET  /treasury     │  │
│  │  PrinterX SDK       │   │                     │  │
│  │  Sunmi Thermal      │   └─────────────────────┘  │
│  │  NFC Reader         │             │               │
│  └─────────────────────┘             │               │
└────────────────────────────────────-─┼───────────────┘
                                       │ HTTPS
                          ┌────────────▼────────────┐
                          │   Cloudflare Worker     │
                          │                         │
                          │   Web App (4 screens)   │
                          │   REST API              │
                          │   LNURL-withdraw        │
                          │   KV Storage            │
                          │                         │
                          └────────────┬────────────┘
                                       │ GraphQL
                          ┌────────────▼────────────┐
                          │   Blink Lightning API   │
                          │   (wallet + payments)   │
                          └─────────────────────────┘
```

---

## Components

### Cloudflare Worker

The Worker is a single JavaScript file deployed to Cloudflare's edge network. It serves both the web app HTML screens and the JSON API from the same URL.

**Web app screens served at:**

| Route | Screen |
|-------|--------|
| `/app` | Sale screen — keypad, live BTC price, print button |
| `/app/confirm` | Confirm screen — QR code preview, print receipt |
| `/app/history` | History — voucher list, check status, reprint |
| `/app/settings` | Settings — store name, currency, receipt text |

**API routes:**

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/voucher` | Create voucher, store in KV |
| `GET` | `/vouchers` | List last 50 vouchers, newest first |
| `GET` | `/voucher/:id` | Single voucher status |
| `GET` | `/treasury` | Blink wallet balance in sats |
| `GET` | `/v/:id` | Customer-facing voucher status page |
| `GET` | `/lnurlw/:id` | LNURL-withdraw handshake (step 1) |
| `GET` | `/lnurlw/callback/:id` | LNURL-withdraw callback — pays via Blink (step 2) |

**Infrastructure:**
- Runtime: Cloudflare Workers (V8 isolate, no Node.js)
- Storage: Cloudflare KV (`VOUCHERS` namespace, key pattern `voucher:{id}`)
- Secrets: `BLINK_API_KEY`, `BLINK_WALLET_ID` (set via Cloudflare dashboard)
- Lightning: Blink wallet API (`api.blink.sv/graphql`)
- LNURL encoding: bech32 implemented inline, no external dependencies

**Deploying:**

Paste `worker.js` into the Cloudflare Workers editor and click Deploy. No wrangler CLI required for basic deployment.

---

### Android Bridge APK

The Bridge APK is an Android foreground service that runs permanently on the Sunmi V2S. It binds to the Sunmi printer hardware and NFC reader, then exposes them via a simple HTTP API on `localhost:8765`. The web app calls this API to trigger prints and NFC operations.

**Bridge endpoints:**

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/status` | Returns `{"ok":true,"printer":true,"nfc":true}` |
| `POST` | `/print` | Print a receipt from JSON payload |
| `GET` | `/print/test` | Print a test page |
| `GET` | `/nfc/poll` | Long-poll up to 10 seconds for an NFC tap |
| `POST` | `/nfc/write` | Write NDEF payload to a tapped NFC tag |

**Print job JSON:**

```json
{
  "storeName": "BOSA",
  "headerLine": "Thank you for your purchase",
  "amount": "€10.00",
  "btcAmount": "0.00017260 BTC",
  "voucherId": "ABC123",
  "qrData": "https://your-worker.workers.dev/v/abc123",
  "issuedDate": "01/04/2026",
  "expiryDate": "01/07/2026",
  "footerLine": "Non-refundable. Valid for stated period."
}
```

**Key technical decisions:**

The bridge uses the **Sunmi PrinterX SDK** (`com.sunmi:printerx:1.0.14`) rather than the older AIDL `IWoyouService` interface. The AIDL interface was investigated extensively but proved unreliable on firmware 6.0.30 — `printerInit`, `lineWrap`, and `cutPaper` all throw security exceptions from third-party apps. The PrinterX SDK is Sunmi's modern replacement and works correctly via `lineApi.autoOut()` to flush and print.

QR codes are generated as ZXing bitmaps in Kotlin and printed via `lineApi.printBitmap()`, bypassing the firmware's built-in QR renderer which crashed on certain input strings.

**Building:**

```bash
# Prerequisites: Android Studio, JDK 17, USB debugging enabled on Sunmi
# Open C:\Users\SeedCard\SatsVoucherBridge\ in Android Studio
# Build → Build Bundle(s) / APK(s) → Build APK(s)

adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Dependencies:**

```groovy
implementation 'com.sunmi:printerx:1.0.14'
implementation 'com.google.zxing:core:3.5.2'
implementation 'org.nanohttpd:nanohttpd:2.3.1'
implementation 'androidx.core:core-ktx:1.12.0'
```

---

## Hardware

**Tested on:** Sunmi V2S (Android 11, firmware 6.0.30)

- 58mm thermal printer (linerless, no cutter)
- Built-in NFC reader
- 1440×720 display (480×854 logical pixels)
- Screen orientation: portrait locked

The web app layout is optimised for the Sunmi's logical resolution. The bridge detects automatically — if `localhost:8765/status` is unreachable the web app continues working without print functionality, allowing use in any browser for management purposes.

---

## Configuration

All settings are stored in `localStorage` on the device under the key `sv_settings`. Defaults:

| Setting | Default |
|---------|---------|
| Store name | BOSA |
| Sub-header | SATS VOUCHER |
| Currency | EUR |
| Min amount | €1.00 |
| Max amount | €500.00 |
| Expiry days | 90 |
| Receipt header | Thank you for your purchase |
| Receipt footer | Non-refundable. Valid for stated period. |
| BTC price source | Live (CoinGecko) |

Settings are accessible via the Settings screen at `/app/settings`.

---

## Customer Redemption Flow

1. Customer receives printed receipt with QR code
2. Customer scans QR code with phone camera → opens `/v/:id` status page
3. Status page shows voucher amount, status, and a **Redeem with Lightning** button
4. Tapping the button opens `lightning:LNURL...` which triggers any LNURL-compatible Lightning wallet
5. Wallet fetches the LNURL-withdraw parameters from the Worker
6. Wallet generates a Lightning invoice and sends it to the callback URL
7. Worker pays the invoice via the Blink API and marks the voucher as claimed

---

## V2 Roadmap

### SatsCASH — NFC Physical Coins

SatsCASH extends the system to support physical NFC coins as a bearer instrument. A coin holds a balance encoded on-chain in the Worker's KV store, keyed by the NFC tag's UID.

**Planned flow:**

1. Staff enters amount on the Mint screen → taps coin to Sunmi NFC reader → bridge polls `/nfc/poll` → returns UID
2. Worker creates a SatsCASH record linked to the UID
3. Bridge writes a short redemption URL as NDEF to the coin via `/nfc/write`
4. Customer taps coin at any NFC-capable phone → browser opens redemption URL → Lightning wallet pays out

**New Worker routes planned:**
- `POST /satscash/mint` — create SatsCASH linked to NFC UID
- `GET /satscash/:uid` — check balance and status by UID
- `POST /satscash/redeem` — redeem via Blink, mark spent
- `GET /satscash/list` — list all SatsCASH records

**New web app screens planned:**
- `/app/satscash` — mint screen with NFC tap prompt
- `/app/satscash/verify` — tap to check coin balance
- `/app/satscash/redeem` — tap to redeem coin

The NFC bridge infrastructure (`/nfc/poll` and `/nfc/write`) is already implemented and tested in V1.

### Admin Dashboard Improvements

The current dashboard [`SatsDashboard` repo](https://github.com/blankworker1/SatsDashboard) shows treasury balance and basic voucher list. V2 additions planned:

- Fiat amount and expiry date columns
- Status filter tabs (all / active / claimed / expired)
- Voucher detail expand on row click
- Revoke voucher button (`POST /voucher/:id/expire`)
- SatsCASH balance and coin list panel
- Daily / weekly sales summary

### Voucher Expiry Enforcement

Currently vouchers are marked active indefinitely. A Cloudflare Cron Trigger will run nightly to scan KV and mark expired vouchers:

```javascript
// wrangler.toml
[triggers]
crons = ["0 0 * * *"]
```

### Release APK Signing

The current APK is signed with the Android Studio debug keystore. A production release keystore needs to be generated and backed up before distributing to additional Sunmi devices. The keystore is required for all future updates to the installed app.

### Multi-device Support

The current architecture supports multiple Sunmi devices connecting to the same Worker and KV namespace simultaneously. Each device runs its own Bridge APK instance. No changes to the Worker are required — voucher IDs are generated with sufficient entropy to avoid collisions.

---

## Project Structure

```
satsvoucher-worker.bosaland.workers.dev
├── worker.js                    Cloudflare Worker (web app + API)
│
SatsVoucherBridge/               Android Studio project
├── app/src/main/java/com/satsvoucher/bridge/
│   ├── MainActivity.kt          WebView + NFC intent handling
│   ├── BridgeService.kt         Foreground service
│   ├── PrinterManager.kt        PrinterX SDK integration
│   ├── PrintServer.kt           NanoHTTPD HTTP server
│   └── NfcManager.kt            NFC tag polling and NDEF write
├── app/src/main/aidl/woyou/aidlservice/jiuiv5/
│   ├── IWoyouService.aidl       Sunmi printer AIDL (kept for reference)
│   └── ICallback.aidl
│
SatsDashboard/
└── index.html                   Admin dashboard (standalone HTML)
```

---

## Acknowledgements

- [Blink](https://blink.sv) — Lightning wallet API for payment processing
- [Sunmi](https://www.sunmi.com) — POS hardware and PrinterX SDK
- [ZXing](https://github.com/zxing/zxing) — QR code generation
- [NanoHTTPD](https://github.com/NanoHttpd/nanohttpd) — embedded HTTP server

---

## Licence

MIT
