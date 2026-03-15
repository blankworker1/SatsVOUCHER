
## SatsVOUCHER 

Bitcoin Lightning Network voucher management app — a point-of-sale-style tool for generating, printing, and tracking redeemable Bitcoin vouchers via LNURL-withdraw. The stack is React on the frontend, Cloudflare Worker handling Lightning wallet integration via the Blink API.

Here's the architecture at a glance:

Cloudflare Worker — what it needs to do (and nothing else)
Three endpoints, total:

POST /voucher — create a voucher, store in KV, return the LNURL string
GET /lnurlw/:id — serve the LNURL-withdraw info JSON to the customer's wallet
GET /lnurlw/callback/:id — validate k1, call Blink to pay, mark voucher claimed

Secrets go in Worker environment variables: BLINK_API_KEY, BLINK_WALLET_ID, WORKER_SECRET (a shared key the APK uses to authenticate its requests to the worker).


Sats Voucher backend: Cloudflare Worker
Three endpoints, ~80 lines of TypeScript total. KV namespace for persistence. Secrets via wrangler secret. Done.

Sunmi V2S Android POS terminal: React Native app
Three screens for the PoC:
SaleScreen     — numeric keypad, currency display, BTC equivalent, "Print Voucher" button
ConfirmScreen  — shows voucher ID + QR preview, triggers Sunmi print, "Done" returns to sale
SettingsScreen — Worker URL, Worker secret, stored in AsyncStorage
The printer service will output a receipt with: store name, amount in fiat + BTC, the LNURL QR code, voucher ID, and date. That's all the customer needs to redeem.
The BTC price fetches from CoinGecko's free public API on app start and refreshes every 5 minutes. No API key needed.





