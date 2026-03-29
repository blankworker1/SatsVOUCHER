// [KEEPING THE WORKING BECH32 AND BLINK LOGIC]
function encodeBech32(hrp, data) {
    const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const words = [];
    let buffer = 0, bits = 0;
    for (let i = 0; i < data.length; i++) {
        buffer = (buffer << 8) | data.charCodeAt(i);
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            words.push((buffer >> bits) & 0x1f);
        }
    }
    if (bits > 0) words.push((buffer << (5 - bits)) & 0x1f);
    const expandHrp = (s) => {
        const ret = [];
        for (let i = 0; i < s.length; i++) ret.push(s.charCodeAt(i) >> 5);
        ret.push(0);
        for (let i = 0; i < s.length; i++) ret.push(s.charCodeAt(i) & 31);
        return ret;
    };
    const polymod = (values) => {
        let chk = 1;
        const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
        for (let v of values) {
            let top = chk >> 25;
            chk = ((chk & 0x1ffffff) << 5) ^ v;
            for (let i = 0; i < 5; i++) { if ((top >> i) & 1) chk ^= generator[i]; }
        }
        return chk;
    };
    const checksumValues = expandHrp(hrp).concat(words).concat([0, 0, 0, 0, 0, 0]);
    const mod = polymod(checksumValues) ^ 1;
    const checksum = [];
    for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
    return hrp + "1" + words.concat(checksum).map(v => charset[v]).join("");
}

async function payInvoice(paymentRequest, walletId, apiKey) {
    const graphqlBody = {
        query: `mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
            lnInvoicePaymentSend(input: $input) { status, errors { message } }
        }`,
        variables: { input: { walletId: walletId.trim(), paymentRequest: paymentRequest.trim() } }
    };
    const response = await fetch("https://api.blink.sv/graphql", {
        method: "POST",
        headers: { "X-API-KEY": apiKey.trim(), "Content-Type": "application/json" },
        body: JSON.stringify(graphqlBody)
    });
    const result = await response.json();
    const data = result.data?.lnInvoicePaymentSend;
    if (data?.errors?.length > 0) throw new Error(data.errors[0].message);
    return data?.status;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        // Normalize the path: remove trailing slashes and make lowercase
        const path = url.pathname.replace(/\/$/, "").toLowerCase();
        
        const corsHeaders = { 
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*" 
        };

        if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
        // --- NEW: TREASURY BALANCE ROUTE ---
        if (path === "/treasury" && request.method === "GET") {
            const graphqlBody = {
                query: `query { 
                    me { 
                        defaultAccount { 
                            walletById(walletId: "${env.BLINK_WALLET_ID}") { 
                                balance 
                            } 
                        } 
                    } 
                }`
            };
            const response = await fetch("https://api.blink.sv/graphql", {
                method: "POST",
                headers: { 
                    "X-API-KEY": env.BLINK_API_KEY.trim(), 
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify(graphqlBody)
            });
            const result = await response.json();
            
            // Blink returns balance in Sats
            const balanceSats = result.data?.me?.defaultAccount?.walletById?.balance || 0;
            
            return new Response(JSON.stringify({ balance: balanceSats }), { 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
        }
        // 1. HISTORY LIST (Handled: /vouchers)
        if (path === "/vouchers" && request.method === "GET") {
            try {
                const list = await env.VOUCHERS.list({ prefix: "voucher:", limit: 50 });
                const promises = list.keys.map(async (key) => {
                    const val = await env.VOUCHERS.get(key.name);
                    return val ? JSON.parse(val) : null;
                });
                
                let results = (await Promise.all(promises)).filter(v => v !== null);
                
                // Explicit sorting to satisfy the editor
                results.sort((a, b) => {
                    const tA = new Date(a.createdAt || 0).getTime();
                    const tB = new Date(b.createdAt || 0).getTime();
                    return tB - tA;
                });
                
                return new Response(JSON.stringify(results, null, 2), { 
                    headers: { ...corsHeaders, "Content-Type": "application/json" } 
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
            }
        }

        // 2. SINGLE VOUCHER STATUS (Handled: /voucher/abc-123)
        if (path.startsWith("/voucher/") && request.method === "GET") {
            const id = path.split("/")[2];
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
            return new Response(raw, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // 3. CREATE VOUCHER (Handled: /voucher)
        if (path === "/voucher" && request.method === "POST") {
            const body = await request.json();
            const id = (body.id || Math.random().toString(36).substring(2, 8)).toLowerCase();
            const cleanBtc = parseFloat(body.amountBtc).toFixed(8);
            const encodedLnurl = encodeBech32("lnurl", `https://${url.host}/lnurlw/${id}`).toUpperCase();
            const voucherData = { ...body, amountBtc: cleanBtc, id, k1: Math.random().toString(36).substring(2, 15), status: "active", createdAt: new Date().toISOString() };
            await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(voucherData));
            return new Response(JSON.stringify({ status: "OK", id, lnurl: encodedLnurl }), { headers: corsHeaders });
        }

        // 4. LNURL STEP 1 (Handshake)
        if (path.startsWith("/lnurlw/") && !path.includes("callback")) {
            const id = path.split("/")[2];
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response("Voucher Not Found", { status: 404 });
            const v = JSON.parse(raw);
            const msats = Math.floor(parseFloat(v.amountBtc) * 100_000_000 * 1000);
            return new Response(JSON.stringify({
                tag: "withdrawRequest",
                callback: `${url.origin}/lnurlw/callback/${id}`,
                k1: v.k1,
                defaultDescription: `Voucher ${id}`,
                minWithdrawable: msats, maxWithdrawable: msats
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // 5. LNURL STEP 2 (Callback)
        if (path.startsWith("/lnurlw/callback/")) {
            const id = path.split("/")[3];
            const pr = url.searchParams.get("pr");
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response("Error", { status: 404 });
            const v = JSON.parse(raw);
            if (v.status === "claimed") return new Response(JSON.stringify({ status: "ERROR", reason: "Already claimed" }), { headers: corsHeaders });
            try {
                await payInvoice(pr, env.BLINK_WALLET_ID, env.BLINK_API_KEY);
                v.status = "claimed";
                v.claimedAt = new Date().toISOString();
                await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));
                return new Response(JSON.stringify({ status: "OK" }), { headers: corsHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ status: "ERROR", reason: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        // 6. DEFAULT FALLBACK
        return new Response(`Path "${path}" Not Found on this Worker.`, { status: 404 });
    }
};
