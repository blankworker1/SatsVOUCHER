# SatsVOUCHER v2


SatsVoucher version 2 addresses some of the limitations of the paper voucher.


## Evolution of Lightning Vouchers (Design Summary)

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



