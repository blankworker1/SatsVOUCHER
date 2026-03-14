import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { bech32 } from "bech32";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory store for vouchers
  const vouchers = new Map();

  // API to create a voucher
  app.post("/api/vouchers", (req, res) => {
    const { amountBtc, amountUsd, type } = req.body;
    const id = Math.random().toString(36).substring(2, 10).toUpperCase();
    const k1 = crypto.randomBytes(32).toString("hex");
    
    const voucher = {
      id,
      amountBtc,
      amountUsd,
      type,
      status: "active",
      date: new Date().toLocaleDateString(),
      k1,
      used: false
    };

    vouchers.set(id, voucher);

    const lnurlBase = `${process.env.APP_URL || `http://localhost:${PORT}`}/api/lnurlw/${id}`;
    const words = bech32.toWords(Buffer.from(lnurlBase, 'utf8'));
    const lnurl = bech32.encode('lnurl', words, 1024).toUpperCase();

    res.json({ ...voucher, lnurl });
  });

  // API to fetch Blink wallet balance
  app.get("/api/wallet/balance", async (req, res) => {
    try {
      const apiKey = process.env.BLINK_API_KEY;
      const walletId = process.env.BLINK_WALLET_ID;

      if (!apiKey || !walletId) {
        return res.status(400).json({ error: "Blink API credentials not configured" });
      }

      const query = `
        query getBalance($walletId: WalletId!) {
          me {
            defaultAccount {
              walletById(walletId: $walletId) {
                balance
              }
            }
          }
        }
      `;

      const blinkResponse = await fetch("https://api.blink.sv/graphql", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: { walletId },
        }),
      });

      const result: any = await blinkResponse.json();
      
      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }

      const balanceSats = result.data?.me?.defaultAccount?.walletById?.balance;
      const balanceBtc = balanceSats / 100000000;

      res.json({ balanceBtc, balanceSats });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch balance" });
    }
  });

  // API to fetch Blink wallet transactions
  app.get("/api/wallet/transactions", async (req, res) => {
    try {
      const apiKey = process.env.BLINK_API_KEY;
      const walletId = process.env.BLINK_WALLET_ID;

      if (!apiKey || !walletId) {
        return res.status(400).json({ error: "Blink API credentials not configured" });
      }

      const query = `
        query getTransactions($walletId: WalletId!) {
          me {
            defaultAccount {
              walletById(walletId: $walletId) {
                transactions(first: 10) {
                  edges {
                    node {
                      id
                      createdAt
                      settlementAmount
                      settlementCurrency
                      status
                      memo
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const blinkResponse = await fetch("https://api.blink.sv/graphql", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: { walletId },
        }),
      });

      const result: any = await blinkResponse.json();
      
      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }

      const transactions = result.data?.me?.defaultAccount?.walletById?.transactions?.edges?.map((edge: any) => edge.node) || [];

      res.json({ transactions });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch transactions" });
    }
  });

  // LNURL-withdraw Info endpoint
  app.get("/api/lnurlw/:id", (req, res) => {
    const { id } = req.params;
    const voucher = vouchers.get(id);

    if (!voucher || voucher.used) {
      return res.json({ status: "ERROR", reason: "Voucher not found or already used" });
    }

    const msats = Math.floor(voucher.amountBtc * 100000000 * 1000);

    res.json({
      tag: "withdrawRequest",
      callback: `${process.env.APP_URL || `http://localhost:${PORT}`}/api/lnurlw/callback/${id}`,
      k1: voucher.k1,
      defaultDescription: `Sats Voucher Withdrawal: ${id}`,
      minWithdrawable: msats,
      maxWithdrawable: msats
    });
  });

  // LNURL-withdraw Callback endpoint
  app.get("/api/lnurlw/callback/:id", async (req, res) => {
    const { id } = req.params;
    const { k1, pr } = req.query;
    const voucher = vouchers.get(id);

    if (!voucher || voucher.used) {
      return res.json({ status: "ERROR", reason: "Voucher not found or already used" });
    }

    if (voucher.k1 !== k1) {
      return res.json({ status: "ERROR", reason: "Invalid k1" });
    }

    const paymentRequest = pr as string;

    try {
      const apiKey = process.env.BLINK_API_KEY;
      const walletId = process.env.BLINK_WALLET_ID;

      if (apiKey && walletId) {
        const query = `
          mutation lnInvoicePaymentSend($input: LnInvoicePaymentSendInput!) {
            lnInvoicePaymentSend(input: $input) {
              status
              errors {
                message
              }
            }
          }
        `;

        const blinkResponse = await fetch("https://api.blink.sv/graphql", {
          method: "POST",
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            variables: {
              input: {
                paymentRequest,
                walletId,
              },
            },
          }),
        });

        const result: any = await blinkResponse.json();
        
        if (result.errors && result.errors.length > 0) {
          throw new Error(result.errors[0].message);
        }

        const paymentStatus = result.data?.lnInvoicePaymentSend?.status;
        const paymentErrors = result.data?.lnInvoicePaymentSend?.errors;

        if (paymentErrors && paymentErrors.length > 0) {
          throw new Error(paymentErrors[0].message);
        }

        if (paymentStatus !== "SUCCESS" && paymentStatus !== "PENDING") {
          throw new Error(`Payment failed with status: ${paymentStatus}`);
        }
      }
      
      voucher.used = true;
      voucher.status = "claimed";

      res.json({ status: "OK" });
    } catch (error: any) {
      res.json({ status: "ERROR", reason: error.message || "Payment failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
