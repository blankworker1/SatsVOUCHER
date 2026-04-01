# Sats VOUCHER — Project Handover & Next Steps

## What Was Built

### 1. Cloudflare Worker (satsvoucher-worker.bosaland.workers.dev)

A single Cloudflare Worker serves both the web app UI and the API. All routes:

**Web app screens:**
- `GET /app` — sale screen (keypad, BTC price, print button)
- `GET /app/confirm` — confirm screen (QR code, print receipt)
- `GET /app/history` — voucher history with check status and reprint
- `GET /app/settings` — settings (store name, currency, receipt text, BTC price)

**API routes:**
- `POST /voucher` — create voucher, stores in KV
- `GET /vouchers` — list all vouchers (last 50, newest first)
- `GET /voucher/:id` — single voucher status
- `GET /treasury` — Blink wallet balance in sats
- `GET /v/:id` — customer-facing voucher status page with Lightning redeem button
- `GET /lnurlw/:id` — LNURL-withdraw handshake (step 1)
- `GET /lnurlw/callback/:id` — LNURL-withdraw callback (step 2, pays via Blink)

**Infrastructure:**
- KV namespace: `VOUCHERS` (key pattern `voucher:{id}`)
- Secrets: `BLINK_API_KEY`, `BLINK_WALLET_ID`
- Default settings: store=BOSA, currency=EUR, expiry=90 days

---

### 2. Android Bridge APK (SatsVoucherBridge)

Android Studio project at `C:\Users\SeedCard\SatsVoucherBridge\`

**Purpose:** Exposes Sunmi V2S hardware (printer + NFC) to the web app via a localhost HTTP server.

**Key files:**
- `MainActivity.kt` — WebView loading the Worker URL, NFC intent handling
- `BridgeService.kt` — Foreground service running the HTTP server
- `PrinterManager.kt` — PrinterX SDK integration for thermal printing
- `PrintServer.kt` — NanoHTTPD HTTP server with print and NFC endpoints
- `NfcManager.kt` — NFC tag polling and NDEF write

**Bridge endpoints:**
- `GET localhost:8765/status` — `{"ok":true,"printer":true,"nfc":true}`
- `POST localhost:8765/print` — print receipt from JSON payload
- `GET localhost:8765/print/test` — minimal test print
- `GET localhost:8765/nfc/poll` — long-poll for NFC tag tap (10s timeout)
- `POST localhost:8765/nfc/write` — write NDEF to tag

**Critical decisions:**
- Uses **PrinterX SDK** (`com.sunmi:printerx:1.0.14`) NOT the old AIDL IWoyouService interface
- AIDL interface (`woyou.aidlservice.jiuiv5`) was kept for NFC only (not printer)
- `lineApi.autoOut()` is the flush/print trigger
- `lineApi.printDividingLine(DividingLine.EMPTY, 80)` feeds paper past tear bar
- All text bold via `.enableBold(true)` on all TextStyle calls
- QR code generated as ZXing bitmap, printed via `lineApi.printBitmap()`
- QR data is the short status URL: `https://satsvoucher-worker.bosaland.workers.dev/v/{id}`

**Print job JSON fields:**
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

**Build:**
- Debug APK: `app\build\outputs\apk\debug\app-debug.apk`
- Install: `adb install -r "C:\Users\SeedCard\SatsVoucherBridge\app\build\outputs\apk\debug\app-debug.apk"`
- Worker URL in MainActivity.kt: `const val WEB_APP_URL = "https://satsvoucher-worker.bosaland.workers.dev/app"`

**Dependencies in app/build.gradle:**
```groovy
implementation 'com.sunmi:printerx:1.0.14'
implementation 'com.google.zxing:core:3.5.2'
implementation 'org.nanohttpd:nanohttpd:2.3.1'
implementation 'androidx.core:core-ktx:1.12.0'
```

---

### 3. Admin Dashboard (SatsDashboard GitHub repo)

Standalone HTML file calling the Worker API directly. Currently shows:
- Treasury balance in sats with low-balance alert (< 5000 sats)
- Recent voucher list: ID, BTC amount, status

**Known gap:** Does not show fiat amount or expiry date — Worker returns these fields (`amountFiat`, `currencySymbol`, `expiryDate`) but dashboard table only shows `amountBtc`.

---

## What Is Working

- ✅ Sale screen keypad and BTC price feed (CoinGecko live)
- ✅ Voucher creation via Worker API and KV storage
- ✅ Receipt printing: store name, header, amount, BTC, ID, dates, QR, footer
- ✅ QR code prints and scans to `/v/:id` customer status page
- ✅ Customer status page shows voucher details and Lightning redeem button
- ✅ LNURL-withdraw flow pays via Blink wallet
- ✅ History screen loads and shows vouchers
- ✅ Reprint from history screen
- ✅ Settings screen saves to localStorage
- ✅ NFC bridge endpoint ready (poll and write)
- ✅ Bridge detects automatically — web app degrades gracefully without it

---

## Known Issues / Pending

- ❌ History screen field display — `amountFiat` and `currencySymbol` may not render correctly for older vouchers created before the web app was updated
- ❌ Release APK not yet signed — still using debug keystore
- ❌ Dashboard needs fiat amount and expiry columns added
- ❌ No voucher expiry enforcement — vouchers never auto-expire in KV

---

## Next Steps

### Phase 2A — Dashboard Upgrade

The existing dashboard HTML needs these additions:

1. **Fiat amount column** — `v.currencySymbol + v.amountFiat` alongside BTC amount
2. **Expiry date column** — `v.expiryDate` formatted as `dd/mm/yyyy`
3. **Status filter** — tabs or dropdown to filter by active/claimed/expired
4. **Voucher detail expand** — click a row to see full voucher details
5. **Revoke button** — mark a voucher as expired via a new Worker route `POST /voucher/:id/expire`

### Phase 2B — SatsCASH NFC Integration

SatsCASH is a physical coin system using NFC tags. Architecture decisions already made:

**Flow:**
1. Staff taps NFC coin to Sunmi → bridge polls `/nfc/poll` → returns tag UID
2. Web app calls Worker to mint a SatsCASH record linked to the UID
3. Bridge writes NDEF payload to coin via `/nfc/write`
4. Customer taps coin at redemption point → UID read → Worker verifies and pays

**New Worker routes needed:**
- `POST /satscash/mint` — create SatsCASH record linked to NFC UID
- `GET /satscash/:uid` — check SatsCASH balance/status by NFC UID
- `POST /satscash/redeem` — redeem SatsCASH, pay via Blink
- `GET /satscash/list` — list all SatsCASH records

**New web app screens needed:**
- `/app/satscash/mint` — enter amount, tap coin, write NFC
- `/app/satscash/verify` — tap coin, show balance
- `/app/satscash/redeem` — tap coin, confirm redemption

**NFC bridge is already wired** — `NfcManager.kt` has `pollForTag()` and `writeToTag()` implemented, exposed via `/nfc/poll` and `/nfc/write`.

### Phase 2C — Release APK

1. **Build → Generate Signed Bundle/APK → APK**
2. Create keystore at `C:\Users\SeedCard\satsvoucher.keystore`
3. Alias: `satsvoucher`, validity: 25 years
4. **Back up the keystore file** — loss means you can never update the installed app
5. Distribute `app-release.apk` to other Sunmi devices via USB or file share

### Phase 2D — Voucher Expiry Enforcement

Add a Cloudflare Cron Trigger to the Worker:
```javascript
export default {
  async scheduled(event, env, ctx) {
    // List all vouchers, mark expired ones
    const list = await env.VOUCHERS.list({ prefix: 'voucher:' });
    for (const key of list.keys) {
      const raw = await env.VOUCHERS.get(key.name);
      if (!raw) continue;
      const v = JSON.parse(raw);
      if (v.status === 'active' && v.expiryDate && new Date(v.expiryDate) < new Date()) {
        v.status = 'expired';
        await env.VOUCHERS.put(key.name, JSON.stringify(v));
      }
    }
  }
}
```

Add to `wrangler.toml`:
```toml
[triggers]
crons = ["0 0 * * *"]  # runs daily at midnight
```

---

## Starting the Next Session

Copy this document into the new chat and tell Claude:

> "I am continuing the Sats VOUCHER / SatsCASH project. The handover document describes what is built and working. I want to start with [Phase 2A dashboard / Phase 2B SatsCASH / Phase 2C release APK]."

Provide the current `worker.js` and `index.html` dashboard files at the start of the session so Claude has the latest versions to work from.
