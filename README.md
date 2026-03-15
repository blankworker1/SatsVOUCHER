
## SatsVOUCHER 

Bitcoin Lightning Network voucher management app — a point-of-sale-style tool for generating, printing, and tracking redeemable Bitcoin vouchers via LNURL-withdraw. The stack is React on the frontend, Cloudflare Worker handling Lightning wallet integration via the Blink API.

Here's the architecture at a glance:

Cloudflare Worker — what it needs to do (and nothing else)
Three endpoints, total:

POST /voucher — create a voucher, store in KV, return the LNURL string
GET /lnurlw/:id — serve the LNURL-withdraw info JSON to the customer's wallet
GET /lnurlw/callback/:id — validate k1, call Blink to pay, mark voucher claimed

Secrets go in Worker environment variables: BLINK_API_KEY, BLINK_WALLET_ID, WORKER_SECRET (a shared key the APK uses to authenticate its requests to the worker).
Sunmi app — what it actually needs to do
Stripping it back to its real job as a POS terminal:
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widget
